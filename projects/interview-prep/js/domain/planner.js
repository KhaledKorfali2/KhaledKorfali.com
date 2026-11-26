// Daily planner. Pure: takes the learner's data and the content, returns today's ordered work.
import { isDue, isLeech } from "./scheduler.js";

export const REVIEW_CAP = 6;
export const TOPIC_DONE = 0.7;      // a topic stops being "current" once 70% of it is attempted
export const HIDDEN_FROM_WEEK = 15; // Phase 3: one new problem a day has its topic hidden

export function weekOf(startDay, today) {
  return Math.max(1, Math.floor((today - startDay) / 7) + 1);
}

// The first topic, in order, with fewer than 70% of its problems attempted.
// Topics without a problem list (mixed practice) are only current once everything before is done.
export function currentTopic(topics, attempted) {
  for (const t of topics) {
    if (!t.problems.length) continue;
    const done = t.problems.filter((p) => attempted.has(p)).length;
    if (done / t.problems.length < TOPIC_DONE) return t;
  }
  return topics.find((t) => !t.problems.length) || topics[topics.length - 1];
}

// Stable per-day shuffle key, so today's hidden pick doesn't change on every render.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// settings: { startDay, newPerDay }
// reviews:  { [problemId]: ReviewState }
// solves:   [{ p, day, mode, first }]
// topics:   [{ id, week, patterns: [patternId], problems: [problemId] }] in study order
// problems: [{ id, pattern, difficulty }]
export function planToday({ settings, reviews, solves, topics, problems, today }) {
  const attempted = new Set(solves.map((s) => s.p));
  const doneToday = solves.filter((s) => s.day === today);
  const reviewsDone = doneToday.filter((s) => !s.first).length;
  const freshDone = doneToday.filter((s) => s.first).length;

  // 1. Due re-solves, oldest first, capped. The rest wait until tomorrow.
  const due = Object.entries(reviews)
    .filter(([, r]) => isDue(r, today))
    .sort((a, b) => a[1].due - b[1].due || (b[1].lapses || 0) - (a[1].lapses || 0) || (a[0] < b[0] ? -1 : 1));
  const cap = Math.max(0, REVIEW_CAP - reviewsDone);
  const reviewItems = due.slice(0, cap).map(([p, r]) => ({ p, due: r.due, overdue: today - r.due, leech: isLeech(r) }));
  const overflow = due.length - reviewItems.length;

  // 2. New problems from the current topic, in its listed order.
  const topic = currentTopic(topics, attempted);
  const week = weekOf(settings.startDay, today);
  const slots = Math.max(0, settings.newPerDay - freshDone);
  const mixed = !topic.problems.length;
  let hiddenSlots = mixed ? slots : week >= HIDDEN_FROM_WEEK && slots > 0 ? 1 : 0;
  // The one hidden problem a day in Phase 3 replaces a new one; don't hand out a second.
  if (!mixed && doneToday.some((s) => s.first && s.hidden)) hiddenSlots = 0;

  const fresh = [];
  const from = topics.indexOf(topic);
  const ordered = [...topics.slice(from), ...topics.slice(0, from)];
  for (const t of ordered) {
    for (const p of t.problems) {
      if (fresh.length >= slots - hiddenSlots) break;
      if (!attempted.has(p) && !fresh.some((f) => f.p === p)) fresh.push({ p, hidden: false, topic: t.id });
    }
  }

  // 3. Hidden-topic problems: unattempted, from any pattern covered so far.
  if (hiddenSlots > 0) {
    const covered = new Set();
    for (const t of topics.slice(0, from + 1)) t.patterns.forEach((id) => covered.add(id));
    const byId = new Map(problems.map((p) => [p.id, p]));
    for (const p of attempted) if (byId.has(p)) covered.add(byId.get(p).pattern);
    const taken = new Set(fresh.map((f) => f.p));
    const open = problems.filter((p) => !attempted.has(p.id) && !taken.has(p.id));
    const inScope = open.filter((p) => covered.has(p.pattern));
    const pool = (inScope.length ? inScope : open)
      .map((p) => ({ p, k: (p.difficulty === "Medium" ? 0 : 1) * 2 ** 32 + hash(p.id + ":" + today) }))
      .sort((a, b) => a.k - b.k);
    for (const { p } of pool.slice(0, hiddenSlots)) fresh.push({ p: p.id, hidden: true, topic: null });
  }

  const leeches = Object.entries(reviews).filter(([, r]) => isLeech(r)).map(([p]) => p);

  return {
    week, topic, reviews: reviewItems, overflow, fresh, leeches,
    done: { reviews: reviewsDone, fresh: freshDone },
    empty: !reviewItems.length && !fresh.length,
  };
}
