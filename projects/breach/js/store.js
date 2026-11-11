// Progress in one localStorage key. Nothing ever leaves the browser.
const KEY = "breach.v1";

const newSeed = () => {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
};
const blank = () => ({ seed: newSeed(), solved: {}, hints: {}, attempts: {}, last: null });

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || typeof raw !== "object" || typeof raw.seed !== "string" || !/^[0-9a-f]{8,64}$/.test(raw.seed)) {
      const s = blank();
      persist(s);
      return s;
    }
    const s = blank();
    s.seed = raw.seed;
    for (const k of ["solved", "hints", "attempts"]) if (raw[k] && typeof raw[k] === "object") s[k] = raw[k];
    if (typeof raw.last === "string") s.last = raw.last;
    return s;
  } catch { return blank(); }
}
function persist(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: keep in memory */ } }
function save() { persist(state); listeners.forEach((fn) => fn(state)); }

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const seed = () => state.seed;
export const isSolved = (id) => !!state.solved[id];
export const solvedAt = (id) => state.solved[id]?.t;
export const solvedCount = () => Object.keys(state.solved).length;
export const hintsUsed = (id) => state.hints[id] || 0;
export const attempts = (id) => state.attempts[id] || 0;
export const lastVisited = () => state.last;

export function markSolved(id) {
  if (state.solved[id]) return;
  state.solved[id] = { t: Date.now(), hints: state.hints[id] || 0 };
  save();
}
export function useHint(id) { state.hints[id] = (state.hints[id] || 0) + 1; save(); }
export function addAttempt(id) { state.attempts[id] = (state.attempts[id] || 0) + 1; save(); }
export function visit(id) { if (state.last !== id) { state.last = id; save(); } }

/** Wipe progress. A new seed means new flags everywhere. */
export function reset() { state = blank(); save(); }
