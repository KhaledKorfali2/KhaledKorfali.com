/* Review page: works through the flashcards every course has handed to
   /shared/review.js, lets you add your own, and backs up or restores all of the
   site's saved progress as one file. */
(function () {
  "use strict";

  const app = document.getElementById("app");
  const inline = Kit.inline;
  const only = new URLSearchParams(location.search).get("source");   // ?source=<course id> studies one course
  let session = null;

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "html") el.innerHTML = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k]);
    });
    [].concat(children || []).forEach(function (c) { if (c) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  const BACK = '<svg aria-hidden="true" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg>';
  const plural = function (n, one, many) { return n + " " + (n === 1 ? one : many); };
  // Card text: inline formatting, with line breaks kept.
  const rich = function (text) { return String(text).split("\n").map(inline).join("<br>"); };
  function span(days) {
    if (days <= 0) return "soon";
    if (days < 30) return days + "d";
    if (days < 365) return Math.round(days / 30) + "mo";
    return (days / 365).toFixed(1) + "y";
  }

  /* ════════════ Overview ════════════ */
  function overview() {
    session = null;
    const st = Review.stats(), all = Review.sources();
    const q = Review.queue(), readyAll = q.due.length + q.fresh.length;
    const focus = only ? all.filter(function (s) { return s.id === only; })[0] : null;
    const readyFocus = focus ? Review.ready(only) : 0;

    const hero = h("header", { class: "kit-hero" }, [
      h("a", { class: "kit-back", href: "/projects.html", html: BACK + "<span>Projects</span>" }),
      h("h1", { text: "Review" }),
      h("p", { class: "kit-lede", text: "Every course on this site sends its flashcards here. Each card comes back just before you would forget it: after a day, then a few days, then weeks, then months." }),
      h("div", { class: "kit-actions" }, [
        focus && readyFocus ? h("button", { type: "button", class: "kit-btn primary", text: "Review " + plural(readyFocus, "card", "cards") + " from " + focus.title, onclick: function () { start(only); } }) : null,
        readyAll ? h("button", { type: "button", class: "kit-btn" + (focus && readyFocus ? "" : " primary"), text: "Review " + (focus && readyFocus ? "everything (" + readyAll + ")" : plural(readyAll, "card", "cards")), onclick: function () { start(null); } })
                 : h("span", { class: "kit-finished", text: st.total ? "Nothing to review right now. Come back tomorrow." : "" })
      ]),
      h("div", { class: "rv-stats" }, [
        stat(readyAll, "ready now"),
        stat(st.doneToday, "reviewed today"),
        stat(st.streak, st.streak === 1 ? "day streak" : "day streak"),
        stat(st.learned, "known well")
      ])
    ]);

    const list = all.length ? h("ul", { class: "rv-sources" }, all.map(function (s) {
      const ready = Review.ready(s.id);
      return h("li", {}, [
        h("div", { class: "rv-source-name" }, [
          h("b", { text: s.title }),
          h("span", { text: plural(s.total, "card", "cards") + " · " + s.due + " due · " + s.fresh + " new · " + s.learned + " known well" })
        ]),
        s.url ? h("a", { class: "kit-btn rv-small", href: s.url, text: "Open course" }) : null,
        h("button", { type: "button", class: "kit-btn rv-small", text: ready ? "Study " + ready : "Up to date", disabled: ready ? null : "", onclick: function () { start(s.id); } })
      ]);
    })) : h("p", { class: "rv-empty", text: "No cards yet. Finish a lesson in one of the courses, or add your own cards below, and they will show up here." });

    const max = Math.max.apply(null, st.ahead.concat([1]));
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const forecast = h("div", { class: "rv-forecast", role: "img", "aria-label": "Cards coming due over the next seven days: " + st.ahead.join(", ") },
      st.ahead.map(function (n, i) {
        const day = names[new Date(Date.now() + (i + 1) * 86400000).getDay()];
        return h("div", {}, [h("em", { text: String(n) }), h("i", { style: "height:" + Math.round(n / max * 70) + "%" }), h("span", { text: i === 0 ? "Tmrw" : day })]);
      }));

    app.textContent = "";
    [hero,
      section("Your decks", null, list),
      st.total ? section("Coming up", "Cards that will come due over the next week, not counting new ones.", forecast) : null,
      mine(), settings(), backup()
    ].forEach(function (n) { if (n) app.appendChild(n); });
    document.title = "Review" + (readyAll ? " (" + readyAll + ")" : "");
  }
  function stat(n, label) { return h("div", { class: "rv-stat" }, [h("b", { text: String(n) }), h("span", { text: label })]); }
  function section(title, lede, body) {
    return h("section", { class: "rv-section" }, [h("h2", { text: title }), lede ? h("p", { text: lede }) : null].concat(body));
  }

  /* ════════════ Your own cards ════════════ */
  function mine() {
    const front = h("textarea", { id: "rvFront", placeholder: "What is the question?" });
    const back = h("textarea", { id: "rvBack", placeholder: "What is the answer?" });
    const note = h("span", { class: "rv-note", role: "status" });
    const addOne = function (e) {
      e.preventDefault();
      const f = front.value.trim(), b = back.value.trim();
      if (!f || !b) { note.textContent = "A card needs both a question and an answer."; return; }
      Review.add([{ id: "mine:" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), front: f, back: b }], null);
      overview();
      document.getElementById("rvFront").focus();
    };

    const bulk = h("textarea", { placeholder: "capital of Japan | Tokyo\nO(log n) search on a sorted array | binary search" });
    const bulkNote = h("span", { class: "rv-note", role: "status" });
    const addMany = function () {
      const cards = [];
      bulk.value.split("\n").forEach(function (line, i) {
        const at = line.indexOf("|");
        if (at < 1) return;
        const f = line.slice(0, at).trim(), b = line.slice(at + 1).trim();
        if (f && b) cards.push({ id: "mine:" + Date.now().toString(36) + "-" + i, front: f, back: b });
      });
      if (!cards.length) { bulkNote.textContent = "No lines with a | between question and answer."; return; }
      Review.add(cards, null);
      overview();
    };

    const own = Review.cards("mine").sort(function (a, b) { return b.at - a.at; });
    return section("Your own cards", "Anything worth remembering can go in: a command you keep looking up, a definition, a fact from a book.", [
      h("form", { class: "rv-form", onsubmit: addOne }, [
        h("label", { for: "rvFront", text: "Question" }), front,
        h("label", { for: "rvBack", text: "Answer" }), back,
        h("div", { class: "rv-row" }, [h("button", { type: "submit", class: "kit-btn primary rv-small", text: "Add card" }), note])
      ]),
      h("details", { class: "rv-more" }, [
        h("summary", { text: "Add many at once" }),
        h("div", { class: "rv-form" }, [
          h("p", { class: "rv-note", text: "One card per line, with a | between the question and the answer." }),
          bulk,
          h("div", { class: "rv-row" }, [h("button", { type: "button", class: "kit-btn rv-small", text: "Add these cards", onclick: addMany }), bulkNote])
        ])
      ]),
      own.length ? h("details", { class: "rv-more" }, [
        h("summary", { text: "Your " + plural(own.length, "card", "cards") }),
        h("ul", { class: "rv-mine" }, own.map(function (c) {
          return h("li", {}, [
            h("div", {}, [h("b", { html: rich(c.f) }), h("span", { html: rich(c.b) })]),
            h("button", { type: "button", class: "rv-link", text: "Delete", onclick: function () { Review.remove(c.id); overview(); } })
          ]);
        }))
      ]) : null
    ]);
  }

  function settings() {
    const input = h("input", { type: "number", id: "rvNew", min: "0", max: "200", value: String(Review.setting("newPerDay")), style: "max-width:110px" });
    input.addEventListener("change", function () {
      const n = Math.max(0, Math.min(200, Math.round(+input.value || 0)));
      Review.set("newPerDay", n);
      overview();
    });
    return section("Pace", "New cards are introduced a few at a time so a long lesson doesn't bury you the next day. Cards you have already seen always come back when they are due.", [
      h("div", { class: "rv-form" }, [h("label", { for: "rvNew", text: "New cards per day" }), input])
    ]);
  }

  /* ════════════ Backup ════════════
     Every course on the site saves into this browser's localStorage, so one
     file holding all of those keys is a complete backup. */
  function backup() {
    const note = h("p", { class: "rv-note", role: "status" });
    const download = function () {
      const store = {};
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); store[k] = localStorage.getItem(k); }
      const file = { app: "khaledkorfali.com", kind: "site-backup", version: 1, exported: new Date().toISOString(), storage: store };
      const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 1)], { type: "application/json" }));
      const a = h("a", { href: url, download: "khaledkorfali-backup-" + new Date().toISOString().slice(0, 10) + ".json" });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      note.textContent = "Saved " + plural(Object.keys(store).length, "item", "items") + ". Keep the file somewhere safe.";
    };
    const picker = h("input", { type: "file", accept: "application/json,.json", hidden: "" });
    picker.addEventListener("change", function () {
      const f = picker.files[0];
      if (!f) return;
      f.text().then(function (text) {
        let data;
        try { data = JSON.parse(text); } catch (err) { data = null; }
        if (!data || data.kind !== "site-backup" || !data.storage || typeof data.storage !== "object") {
          note.textContent = "That file isn't a backup from this site.";
          return;
        }
        const keys = Object.keys(data.storage).filter(function (k) { return typeof data.storage[k] === "string"; });
        const when = data.exported ? new Date(data.exported).toLocaleDateString() : "an unknown date";
        if (!confirm("Restore the backup from " + when + "?\n\nThis replaces the saved progress for " + plural(keys.length, "item", "items") + " on this device. It can't be undone.")) return;
        try {
          keys.forEach(function (k) { localStorage.setItem(k, data.storage[k]); });
        } catch (err) {
          note.textContent = "The browser ran out of storage space part-way through. Nothing else was changed.";
          return;
        }
        location.reload();
      });
      picker.value = "";
    });
    return section("Back up everything", "Your progress in every course lives only in this browser. Download it as a file to keep it safe, or to move it to another device or browser.", [
      h("div", { class: "rv-row", style: "margin-top:14px" }, [
        h("button", { type: "button", class: "kit-btn rv-small", text: "Download a backup", onclick: download }),
        h("button", { type: "button", class: "kit-btn rv-small", text: "Restore from a file", onclick: function () { picker.click(); } }),
        picker
      ]),
      note
    ]);
  }

  /* ════════════ A review session ════════════ */
  function start(sourceId) {
    const q = Review.queue(sourceId);
    // Reviews first, then new cards mixed through the second half.
    const cards = q.due.concat(q.fresh);
    if (!cards.length) { overview(); return; }
    const titles = {};
    Review.sources().forEach(function (s) { titles[s.id] = s.title; });
    session = { queue: cards, total: cards.length, done: 0, again: 0, titles: titles, shown: false };
    card();
  }

  function card() {
    const s = session, c = s.queue[0];
    if (!c) { finished(); return; }
    s.shown = false;
    const backEl = h("div", { class: "rv-back", hidden: "" }, [
      h("div", { html: rich(c.b) }),
      c.n ? h("small", { html: rich(c.n) }) : null
    ]);
    const bar = h("div", { class: "kit-bar rv-bar" }, h("button", { type: "button", class: "kit-btn primary", text: "Show answer", onclick: reveal }));

    function reveal() {
      if (s.shown) return;
      s.shown = true;
      backEl.hidden = false;
      const p = Review.preview(c);
      bar.textContent = "";
      bar.appendChild(h("div", { class: "rv-grades" }, [
        ["again", "Again", "soon"], ["hard", "Hard", span(p.hard)], ["good", "Good", span(p.good)], ["easy", "Easy", span(p.easy)]
      ].map(function (g) {
        return h("button", { type: "button", class: "rv-grade " + g[0], "data-grade": g[0], html: g[1] + "<small>" + g[2] + "</small>", onclick: function () { answer(g[0]); } });
      })));
    }
    function answer(rating) {
      const updated = Review.grade(c.id, rating);
      s.queue.shift();
      if (rating === "again" && updated) {
        // Bring it back a few cards later in this session.
        s.again++;
        s.queue.splice(Math.min(s.queue.length, 4), 0, Object.assign({ id: c.id }, updated));
      } else s.done++;
      card();
    }
    s.reveal = reveal; s.answer = answer;

    app.textContent = "";
    app.appendChild(h("div", { class: "kit-practice-top" }, [
      h("button", { type: "button", class: "kit-close", "aria-label": "Stop reviewing", html: BACK, onclick: overview }),
      h("div", { class: "kit-meter-bar", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": s.total, "aria-valuenow": s.done }, h("span", { style: "width:" + (s.done / s.total * 100) + "%" })),
      h("span", { class: "kit-count", text: s.queue.length + " left" })
    ]));
    app.appendChild(h("section", { class: "rv-card" }, [
      h("p", { class: "rv-from", text: (s.titles[c.s] || "") + (c.seen ? "" : " · new") }),
      h("div", { class: "rv-front", html: rich(c.f) }),
      backEl
    ]));
    app.appendChild(bar);
    window.scrollTo(0, 0);
  }

  function finished() {
    const s = session;
    session = null;
    app.textContent = "";
    const st = Review.stats(), more = Review.queue().fresh.length + Review.queue().due.length;
    app.appendChild(h("section", { class: "kit-done" }, [
      h("div", { class: "kit-done-mark", html: '<svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>' }),
      h("h1", { text: "Done for now." }),
      h("p", { class: "kit-lede", text: plural(s.total, "card", "cards") + " reviewed" + (s.again ? ", " + s.again + " repeated" : "") + ". " +
        (st.ahead[0] ? plural(st.ahead[0], "card comes", "cards come") + " back tomorrow." : "Nothing is due tomorrow yet.") }),
      h("div", { class: "kit-actions" }, [
        more ? h("button", { type: "button", class: "kit-btn", text: "Review " + more + " more", onclick: function () { start(null); } }) : null,
        h("button", { type: "button", class: "kit-btn primary", text: "Back to the overview", onclick: overview })
      ])
    ]));
  }

  document.addEventListener("keydown", function (e) {
    if (!session || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!session.shown) {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); session.reveal(); }
      return;
    }
    const map = { "1": "again", "2": "hard", "3": "good", "4": "easy", " ": "good", Enter: "good" };
    if (map[e.key]) { e.preventDefault(); session.answer(map[e.key]); }
  });

  overview();
})();
