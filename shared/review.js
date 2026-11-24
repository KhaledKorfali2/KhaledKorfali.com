/* Review: the site's spaced-repetition store.

   Any page can load this file and hand it flashcards:

     Review.add(
       [{ id: "my-course:lesson-1:0", front: "Question", back: "Answer" }],
       { id: "my-course", title: "My Course", url: "/projects/my-course/" }
     );

   Cards from every course land in one queue, which /projects/review/ works
   through. Everything is kept in this browser's localStorage under one key,
   so there are no accounts and nothing leaves the device.

   Scheduling is a small version of SM-2, the algorithm behind Anki:
   - Each card has an interval in days and an "ease" multiplier (starts at 2.5).
   - Good  : interval grows by the ease (first 1 day, then 3, then x ease).
   - Easy  : grows faster, and the ease goes up a little.
   - Hard  : grows slowly (x 1.2), and the ease goes down a little.
   - Again : back to the start, shown again in the same session, ease goes down.
   Only a limited number of brand-new cards are introduced each day, so
   finishing a long lesson doesn't bury you the next morning. */
(function () {
  "use strict";

  const KEY = "kk.review.v1";
  const DAY = 86400000;
  const DEFAULTS = { newPerDay: 15 };

  // Days are counted in local time, so "tomorrow" starts at your midnight.
  function today(now) {
    const d = new Date(now || Date.now());
    return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / DAY);
  }

  function blank() {
    return { v: 1, cards: {}, sources: {}, settings: {}, days: {}, intro: { day: 0, n: 0 } };
  }

  let cache = null;
  function load() {
    if (cache) return cache;
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      cache = raw && raw.v === 1 && raw.cards ? Object.assign(blank(), raw) : blank();
    } catch (err) {
      cache = blank();
    }
    return cache;
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(cache));
      return true;
    } catch (err) {
      return false;       // storage full or blocked: keep working from memory
    }
  }
  // Another tab changed the store: drop our copy so the next read is fresh.
  window.addEventListener("storage", function (e) { if (e.key === KEY || e.key === null) cache = null; });

  function setting(name) {
    const s = load().settings;
    return s[name] === undefined ? DEFAULTS[name] : s[name];
  }

  /* ── Adding and removing ── */
  // Adds new cards and refreshes the text of ones that already exist, without
  // touching their schedule. Returns how many were new.
  function add(cards, source) {
    const db = load();
    let added = 0;
    if (source && source.id) {
      db.sources[source.id] = { title: source.title || source.id, url: source.url || "" };
    }
    (cards || []).forEach(function (c) {
      if (!c || !c.id || !c.front || !c.back) return;
      const old = db.cards[c.id];
      if (old) { old.f = String(c.front); old.b = String(c.back); if (c.note) old.n = String(c.note); return; }
      db.cards[c.id] = {
        f: String(c.front), b: String(c.back),
        s: source && source.id ? source.id : "mine",
        ivl: 0, ease: 2.5, reps: 0, lapses: 0, due: 0, at: Date.now()
      };
      if (c.note) db.cards[c.id].n = String(c.note);
      added++;
    });
    save();
    return added;
  }
  function remove(id) {
    const db = load();
    delete db.cards[id];
    save();
  }
  function removeSource(sourceId) {
    const db = load();
    Object.keys(db.cards).forEach(function (id) { if (db.cards[id].s === sourceId) delete db.cards[id]; });
    if (sourceId !== "mine") delete db.sources[sourceId];
    save();
  }
  function has(id) { return !!load().cards[id]; }

  /* ── Scheduling ── */
  // What each answer would do to a card: { again, hard, good, easy } → days.
  function preview(card) {
    const ivl = card.ivl || 0, ease = card.ease || 2.5;
    if (ivl < 1) return { again: 0, hard: 1, good: card.reps ? 3 : 1, easy: 4 };
    return {
      again: 0,
      hard: Math.max(ivl + 1, Math.round(ivl * 1.2)),
      good: Math.max(ivl + 1, Math.round(ivl * ease)),
      easy: Math.max(ivl + 2, Math.round(ivl * ease * 1.3))
    };
  }

  function grade(id, rating) {
    const db = load(), card = db.cards[id];
    if (!card) return null;
    const t = today(), wasNew = card.reps === 0 && card.ivl === 0 && !card.seen;
    const next = preview(card)[rating];
    if (next === undefined) return null;

    if (rating === "again") {
      if (card.ivl >= 1) card.lapses++;
      card.ease = Math.max(1.3, card.ease - 0.2);
      card.ivl = 0;
      card.due = t;                       // still due today; the session shows it again
    } else {
      if (rating === "hard") card.ease = Math.max(1.3, card.ease - 0.15);
      if (rating === "easy") card.ease = Math.min(3.2, card.ease + 0.15);
      // Spread long intervals out a little so cards learned together don't all return together.
      const fuzz = next > 7 ? Math.round(next * (Math.random() * 0.1 - 0.05)) : 0;
      card.ivl = next + fuzz;
      card.due = t + card.ivl;
      card.reps++;
    }
    card.seen = 1;
    card.last = Date.now();

    if (wasNew) {
      if (db.intro.day !== t) db.intro = { day: t, n: 0 };
      db.intro.n++;
    }
    db.days[t] = (db.days[t] || 0) + 1;
    // Keep the activity log to the last 400 days.
    const keys = Object.keys(db.days);
    if (keys.length > 400) keys.sort(function (a, b) { return a - b; }).slice(0, keys.length - 400).forEach(function (k) { delete db.days[k]; });
    save();
    return card;
  }

  /* ── Reading ── */
  function isNew(card) { return !card.seen; }

  // The cards to study now: everything due, plus today's allowance of new ones.
  // Pass a source id to study one course only.
  function queue(sourceId) {
    const db = load(), t = today();
    const due = [], fresh = [];
    Object.keys(db.cards).forEach(function (id) {
      const c = db.cards[id];
      if (sourceId && c.s !== sourceId) return;
      const item = Object.assign({ id: id }, c);
      if (isNew(c)) fresh.push(item);
      else if (c.due <= t) due.push(item);
    });
    due.sort(function (a, b) { return a.due - b.due || a.at - b.at; });
    fresh.sort(function (a, b) { return a.at - b.at; });
    const used = db.intro.day === t ? db.intro.n : 0;
    const allowance = Math.max(0, setting("newPerDay") - used);
    return { due: due, fresh: fresh.slice(0, allowance), waiting: Math.max(0, fresh.length - allowance) };
  }

  // Per-source totals for the overview: [{ id, title, url, total, due, fresh, learned }]
  function sources() {
    const db = load(), t = today(), out = {};
    const entry = function (id) {
      if (!out[id]) {
        const meta = db.sources[id] || { title: id === "mine" ? "My own cards" : id, url: "" };
        out[id] = { id: id, title: meta.title, url: meta.url, total: 0, due: 0, fresh: 0, learned: 0 };
      }
      return out[id];
    };
    Object.keys(db.cards).forEach(function (id) {
      const c = db.cards[id], e = entry(c.s);
      e.total++;
      if (isNew(c)) e.fresh++;
      else if (c.due <= t) e.due++;
      if (c.ivl >= 21) e.learned++;
    });
    return Object.keys(out).map(function (k) { return out[k]; })
      .sort(function (a, b) { return a.title.localeCompare(b.title); });
  }

  function stats() {
    const db = load(), t = today();
    let total = 0, due = 0, fresh = 0, learned = 0;
    const ahead = [0, 0, 0, 0, 0, 0, 0];           // cards coming due on each of the next 7 days
    Object.keys(db.cards).forEach(function (id) {
      const c = db.cards[id];
      total++;
      if (isNew(c)) fresh++;
      else if (c.due <= t) due++;
      else if (c.due - t <= 7) ahead[c.due - t - 1]++;
      if (c.ivl >= 21) learned++;
    });
    let streak = 0;
    for (let d = db.days[t] ? t : t - 1; db.days[d]; d--) streak++;
    return { total: total, due: due, fresh: fresh, learned: learned, ahead: ahead, streak: streak, doneToday: db.days[t] || 0 };
  }

  // How many cards are ready right now (due + today's new allowance). Cheap
  // enough for a badge on any page.
  function ready(sourceId) {
    const q = queue(sourceId);
    return q.due.length + q.fresh.length;
  }

  function cards(sourceId) {
    const db = load();
    return Object.keys(db.cards)
      .filter(function (id) { return !sourceId || db.cards[id].s === sourceId; })
      .map(function (id) { return Object.assign({ id: id }, db.cards[id]); });
  }

  function set(name, value) {
    load().settings[name] = value;
    save();
  }

  window.Review = {
    add: add, remove: remove, removeSource: removeSource, has: has,
    grade: grade, preview: preview, queue: queue, ready: ready,
    sources: sources, stats: stats, cards: cards,
    setting: setting, set: set, today: today, KEY: KEY
  };
})();
