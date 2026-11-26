// Starts guided-solve attempts and keeps a mock interview's queue across page refreshes.
import { PROBLEMS, problemById, acceptedPatterns } from "./data/index.js";
import { draft, saveDraft, review, reviews, solves } from "./store.js";
import { shuffle } from "./ui.js";

const MOCK_KEY = "pt.mock";

export function newDraft(pr, { mode, hidden = false, limit = 0 } = {}) {
  return {
    p: pr.id,
    mode: mode || (review(pr.id) ? "review" : "learn"),
    hidden, limit,                 // limit: countdown length in seconds (mock), 0 = count up
    t: Date.now(), elapsed: 0, step: 0, hint: 0,
    restate: "", brute: "", waste: "", time: "", space: "",
    outcome: "", note: { pattern: "", clue: "", insight: "", mistakes: "" },
    checks: [], seen25: false, seen40: false,
  };
}

// Open the guided solve for a problem. An attempt already in progress is resumed, not replaced.
export function launchSolve(pr, opts = {}) {
  const existing = draft(pr.id);
  if (!existing || (opts.mode === "mock" && existing.mode !== "mock")) saveDraft(pr.id, newDraft(pr, opts));
  location.hash = "#/solve/" + pr.slug;
}

/* ── Mock interview run ── */
export function mockRun() {
  try { return JSON.parse(sessionStorage.getItem(MOCK_KEY) || "null"); } catch { return null; }
}
function setMock(run) {
  try { run ? sessionStorage.setItem(MOCK_KEY, JSON.stringify(run)) : sessionStorage.removeItem(MOCK_KEY); } catch {}
}
export const endMock = () => setMock(null);

// Unseen problems for a mock: never attempted, Medium unless asked otherwise, spread across patterns.
export function pickMock(count, difficulty = "Medium") {
  const attempted = new Set(solves().map((s) => s.p));
  const open = PROBLEMS.filter((p) => !attempted.has(p.id) && !reviews()[p.id]);
  let pool = open.filter((p) => difficulty === "Any" || p.difficulty === difficulty);
  if (pool.length < count) pool = open;
  if (pool.length < count) pool = PROBLEMS;   // everything attempted: fall back to re-solves
  const out = [], used = new Set();
  for (const p of shuffle(pool)) {
    if (out.length >= count) break;
    if (used.has(p.pattern) && pool.length > count * 3) continue;
    used.add(p.pattern); out.push(p);
  }
  for (const p of shuffle(pool)) if (out.length < count && !out.includes(p)) out.push(p);
  return out;
}

export function startMock({ count, minutes, difficulty }) {
  const picks = pickMock(count, difficulty);
  if (!picks.length) return false;
  setMock({ queue: picks.map((p) => p.id), index: 0, limit: minutes * 60, results: [] });
  launchSolve(picks[0], { mode: "mock", hidden: true, limit: minutes * 60 });
  return true;
}

// Record a finished mock problem; returns the next problem or null when the run is over.
export function mockAdvance(result) {
  const run = mockRun();
  if (!run) return null;
  run.results.push(result);
  run.index++;
  setMock(run);
  return run.index < run.queue.length ? problemById.get(run.queue[run.index]) : null;
}
export function mockContinue(pr) {
  const run = mockRun();
  launchSolve(pr, { mode: "mock", hidden: true, limit: run ? run.limit : 45 * 60 });
}

export const guessRight = (pr, guess) => acceptedPatterns(pr).includes(guess);
