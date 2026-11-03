// Builds practice queues and holds the session in progress.
import { PROBLEMS, PATTERNS, patternById, problemById } from "./data/index.js";
import { settings, card, status, dueProblems, inList, patternStats, confusions } from "./store.js";
import { shuffle } from "./ui.js";

let current = null;
export const getSession = () => current;
export const endSession = () => { current = null; };

function start(kind, title, ids, opts = {}) {
  current = { kind, title, queue: ids, base: ids.length, index: 0, results: [], requeued: new Set(), focus: opts.focus || null, single: kind === "single" };
  return current;
}

const pool = () => PROBLEMS.filter((p) => inList(p));

// Order so the same pattern rarely appears twice in a row (recognition, not repetition).
function spread(problems) {
  const out = [], rest = [...problems];
  while (rest.length) {
    const prev = out[out.length - 1];
    let i = rest.findIndex((p) => !prev || p.pattern !== prev.pattern);
    if (i < 0) i = 0;
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}

// Prefer unseen problems, then the ones answered longest ago; spread across patterns.
function freshPicks(candidates, n, exclude = new Set()) {
  const byPattern = new Map();
  for (const p of shuffle(candidates.filter((p) => !exclude.has(p.id)))) {
    if (!byPattern.has(p.pattern)) byPattern.set(p.pattern, []);
    byPattern.get(p.pattern).push(p);
  }
  for (const list of byPattern.values()) {
    list.sort((a, b) => (card(a.id)?.last || 0) - (card(b.id)?.last || 0));
  }
  const out = [];
  const lanes = shuffle([...byPattern.values()]);
  while (out.length < n && lanes.some((l) => l.length)) {
    for (const lane of lanes) if (lane.length && out.length < n) out.push(lane.shift());
  }
  return out;
}

export function dailySession() {
  const size = settings().sessionSize;
  const due = dueProblems().slice(0, size);
  const fill = freshPicks(pool().filter((p) => !card(p.id)), size - due.length, new Set(due.map((p) => p.id)));
  const extra = fill.length + due.length < size
    ? freshPicks(pool(), size - due.length - fill.length, new Set([...due, ...fill].map((p) => p.id))) : [];
  const ids = spread(shuffle([...due, ...fill, ...extra])).map((p) => p.id);
  return ids.length ? start("daily", due.length ? "Daily review" : "Daily practice", ids) : null;
}

export function quickSession() {
  const ids = spread(freshPicks(pool(), settings().sessionSize)).map((p) => p.id);
  return ids.length ? start("quick", "Quick drill", ids) : null;
}

// Half from the focus patterns, half from look-alikes so the answer isn't always the same.
export function focusSession(patternIds) {
  const size = settings().sessionSize;
  const focus = new Set(patternIds);
  const lookalikes = new Set();
  for (const id of patternIds) {
    (patternById.get(id)?.related || []).forEach((r) => lookalikes.add(r.id));
    confusions(20).forEach((c) => { if (c.expected === id) lookalikes.add(c.picked); if (c.picked === id) lookalikes.add(c.expected); });
  }
  focus.forEach((id) => lookalikes.delete(id));
  const nFocus = Math.ceil(size * 0.6);
  // Focus problems come from the whole bank so a narrow list filter can't leave the session empty.
  const mine = freshPicks(PROBLEMS.filter((p) => focus.has(p.pattern)), nFocus);
  const decoyPool = pool().filter((p) => lookalikes.has(p.pattern));
  const decoys = freshPicks(decoyPool.length ? decoyPool : pool().filter((p) => !focus.has(p.pattern)), size - mine.length, new Set(mine.map((p) => p.id)));
  const ids = spread(shuffle([...mine, ...decoys])).map((p) => p.id);
  const names = patternIds.map((id) => patternById.get(id)?.name).filter(Boolean);
  return ids.length ? start("focus", names.length === 1 ? names[0] : "Focus: " + names.join(", "), ids, { focus: patternIds }) : null;
}

// The three weakest patterns (by recent accuracy, minimum 2 attempts), plus your most common confusion.
export function weakPatterns() {
  const stats = patternStats();
  const ranked = PATTERNS.map((p) => ({ id: p.id, s: stats.get(p.id) }))
    .filter((x) => x.s.attempts >= 2 && x.s.recentAcc < 0.85)
    .sort((a, b) => a.s.recentAcc - b.s.recentAcc || b.s.attempts - a.s.attempts)
    .slice(0, 3).map((x) => x.id);
  const c = confusions(1)[0];
  if (c && !ranked.includes(c.expected)) ranked.push(c.expected);
  return ranked;
}
export function weakSession() {
  const weak = weakPatterns();
  if (!weak.length) return null;
  const s = focusSession(weak);
  if (s) { s.kind = "weak"; s.title = "Weak spots"; }
  return s;
}

export function retrySession(ids) {
  return ids.length ? start("retry", "Retry missed", spread(shuffle(ids.map((id) => problemById.get(id)))).map((p) => p.id)) : null;
}

export function singleSession(id) {
  return problemById.has(id) ? start("single", "Single problem", [id]) : null;
}

export function newCount() { return pool().filter((p) => status(p.id) === "new").length; }

/* ── progress through the current session ── */
export function currentProblem() {
  return current ? problemById.get(current.queue[current.index]) : null;
}
export function submitResult(result) {
  if (!current) return;
  current.results.push(result);
  // Missed problems come back once at the end of the session.
  if (!result.ok && !current.single && !current.requeued.has(result.id)) {
    current.requeued.add(result.id);
    current.queue.push(result.id);
  }
}
export function advance() {
  if (!current) return false;
  current.index++;
  return current.index < current.queue.length;
}
