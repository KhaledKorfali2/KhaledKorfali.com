// Progress and settings in one localStorage key.
const KEY = "wire.v2";

const blank = () => ({ done: {}, checks: {}, quiz: {}, settings: { theme: "system" }, lab: null });
let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || typeof raw !== "object") return blank();
    const s = blank();
    if (raw.done && typeof raw.done === "object") s.done = raw.done;
    if (raw.checks && typeof raw.checks === "object") s.checks = raw.checks;
    if (raw.quiz && typeof raw.quiz === "object") s.quiz = raw.quiz;
    if (raw.settings && ["system", "dark", "light"].includes(raw.settings.theme)) s.settings.theme = raw.settings.theme;
    if (raw.lab && typeof raw.lab === "object") s.lab = raw.lab;
    return s;
  } catch { return blank(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode / full: keep going in memory */ }
  listeners.forEach((fn) => fn(state));
}
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const isDone = (id) => !!state.done[id];
export function markDone(id, on = true) {
  if (on) state.done[id] = Date.now(); else delete state.done[id];
  save();
}
export const doneCount = () => Object.keys(state.done).length;

export const checkAnswer = (lesson, idx) => state.checks[lesson]?.[idx];
export function setCheck(lesson, idx, choice) {
  (state.checks[lesson] ||= {})[idx] = choice;
  save();
}

export const quizState = () => state.quiz;
export function recordQuiz(id, ok) {
  const q = state.quiz[id] || { right: 0, wrong: 0 };
  ok ? q.right++ : q.wrong++;
  q.last = ok; q.t = Date.now();
  state.quiz[id] = q;
  save();
}

export const theme = () => state.settings.theme;
export function setTheme(t) { state.settings.theme = t; save(); }

export const labState = () => state.lab;
export function saveLab(s) { state.lab = s; save(); }

export function resetAll() {
  const keep = state.settings;
  state = blank(); state.settings = keep;
  save();
}
