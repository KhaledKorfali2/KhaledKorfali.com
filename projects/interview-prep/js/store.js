// Persistence, spaced repetition and derived statistics.
// Everything lives in one localStorage key so it can be exported/imported as a file.
import { PROBLEMS, PATTERNS, TOPICS, problemById, patternById, topicById } from "./data/index.js";
import { schedule, isDue, isLeech, OUTCOMES } from "./domain/scheduler.js";
import { planToday } from "./domain/planner.js";
import { computeMetrics } from "./domain/metrics.js";

const KEY = "pt.v2";
const LEGACY_KEY = "lpt_attempts_v1";
const MAX_ATTEMPTS = 3000;
const MAX_SOLVES = 2000;

// Leitner-style boxes: days until the next review after reaching each box.
export const INTERVALS = [0, 1, 3, 7, 16, 35, 80];
export const MASTERED_BOX = 4;

export const DEFAULT_SETTINGS = {
  theme: "system",          // system | dark | light
  hideTitles: false,        // titles often give the pattern away
  askSignals: true,
  askStructures: true,
  askTime: true,
  lang: "python",           // template language
  sessionSize: 10,
  list: "all",              // all | blind75 | neetcode150 — which problems sessions draw from
  startDate: "",            // YYYY-MM-DD the 16-week plan started; set the first time the app opens
  dailyMinutes: 90,
  newPerDay: 2,
};

// cards/attempts belong to the clue drill; solves/reviews/drafts/built/study to the study plan.
const blank = () => ({
  version: 2, cards: {}, attempts: [], days: {}, settings: { ...DEFAULT_SETTINGS },
  solves: [], reviews: {}, drafts: {}, built: {}, study: {},
});

const listeners = new Set();

export const today = (d = new Date()) => {
  const z = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round(z.getTime() / 86400000);
};
export const dayKey = (n) => {
  const d = new Date(n * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

function sanitize(raw) {
  const s = blank();
  if (!raw || typeof raw !== "object") return s;
  if (raw.settings && typeof raw.settings === "object") {
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (typeof raw.settings[k] === typeof DEFAULT_SETTINGS[k]) s.settings[k] = raw.settings[k];
    }
  }
  if (raw.cards && typeof raw.cards === "object") {
    for (const [id, c] of Object.entries(raw.cards)) {
      if (!problemById.has(id) || !c || typeof c !== "object") continue;
      s.cards[id] = {
        box: Math.max(0, Math.min(INTERVALS.length - 1, c.box | 0)),
        due: Number.isFinite(c.due) ? c.due : today(),
        seen: c.seen | 0, right: c.right | 0,
        last: Number.isFinite(c.last) ? c.last : 0,
        lastOk: !!c.lastOk,
      };
    }
  }
  if (Array.isArray(raw.attempts)) {
    s.attempts = raw.attempts.filter((a) => a && typeof a === "object" && problemById.has(a.p) && Number.isFinite(a.t)).slice(-MAX_ATTEMPTS);
  }
  if (raw.days && typeof raw.days === "object") {
    for (const [k, v] of Object.entries(raw.days)) if (/^\d{4}-\d\d-\d\d$/.test(k) && Number.isFinite(v)) s.days[k] = v;
  }
  const str = (v, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");
  if (Array.isArray(raw.solves)) {
    s.solves = raw.solves
      .filter((a) => a && typeof a === "object" && problemById.has(a.p) && Number.isFinite(a.t) && OUTCOMES.includes(a.outcome))
      .slice(-MAX_SOLVES)
      .map((a) => ({
        id: str(a.id, 40) || String(a.t), p: a.p, t: a.t,
        day: Number.isFinite(a.day) ? a.day : today(new Date(a.t)),
        dur: Math.max(0, a.dur | 0),
        mode: ["learn", "review", "mock"].includes(a.mode) ? a.mode : "learn",
        hidden: !!a.hidden, first: !!a.first,
        hint: Math.max(0, Math.min(3, a.hint | 0)),
        outcome: a.outcome,
        guess: patternById.has(a.guess) ? a.guess : null,
        dueWas: Number.isFinite(a.dueWas) ? a.dueWas : null,
        restate: str(a.restate), brute: str(a.brute), waste: str(a.waste),
        time: str(a.time, 40), space: str(a.space, 60),
        note: {
          pattern: patternById.has(a.note?.pattern) ? a.note.pattern : problemById.get(a.p).pattern,
          clue: str(a.note?.clue), insight: str(a.note?.insight), mistakes: str(a.note?.mistakes),
        },
      }));
  }
  if (raw.reviews && typeof raw.reviews === "object") {
    for (const [id, r] of Object.entries(raw.reviews)) {
      if (!problemById.has(id) || !r || typeof r !== "object") continue;
      s.reviews[id] = {
        stage: Math.max(0, Math.min(4, r.stage | 0)),
        due: Number.isFinite(r.due) ? r.due : null,
        lapses: Math.max(0, r.lapses | 0),
        last: OUTCOMES.includes(r.last) ? r.last : "failed",
        mastered: !!r.mastered,
      };
      if (!s.reviews[id].mastered && s.reviews[id].due == null) s.reviews[id].due = today();
    }
  }
  if (raw.drafts && typeof raw.drafts === "object") {
    for (const [id, d] of Object.entries(raw.drafts)) if (problemById.has(id) && d && typeof d === "object") s.drafts[id] = d;
  }
  if (raw.built && typeof raw.built === "object") {
    for (const [id, v] of Object.entries(raw.built)) if (topicById.has(id) && v) s.built[id] = true;
  }
  if (raw.study && typeof raw.study === "object") {
    for (const [k, v] of Object.entries(raw.study)) if (/^\d{4}-\d\d-\d\d$/.test(k) && Number.isFinite(v)) s.study[k] = v;
  }
  return s;
}

const isoDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function load() {
  let s;
  try { s = sanitize(JSON.parse(localStorage.getItem(KEY) || "null")); } catch { s = blank(); }
  if (!s.attempts.length) migrateLegacy(s);
  // The plan's week 1 starts the first day the app is opened; it can be moved in Settings.
  if (!/^\d{4}-\d\d-\d\d$/.test(s.settings.startDate)) { s.settings.startDate = isoDate(); persist(s); }
  return s;
}

// v1 stored [{problemId, pattern, patternCorrect, dsCorrect, complexityCorrect, timestamp}]
function migrateLegacy(s) {
  let old;
  try { old = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null"); } catch { return; }
  if (!Array.isArray(old) || !old.length) return;
  old.filter((a) => a && problemById.has(a.problemId) && Number.isFinite(a.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((a) => {
      const pr = problemById.get(a.problemId);
      applyResult(s, {
        p: pr.id, pat: pr.pattern, pick: a.patternCorrect ? pr.pattern : null, ok: !!a.patternCorrect,
        ds: a.dsCorrect ? 1 : 0, tc: a.complexityCorrect ? 1 : 0, sig: null, t: a.timestamp, legacy: true,
      });
    });
  persist(s);
}

let state = load();

function persist(s = state) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked: keep working in memory */ }
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => fn(state)); }

/* ── Settings ── */
export const settings = () => state.settings;
export function setSetting(key, value) {
  state.settings[key] = value;
  persist(); emit();
}

/* ── Recording results ── */
function applyResult(s, a) {
  s.attempts.push(a);
  if (s.attempts.length > MAX_ATTEMPTS) s.attempts.splice(0, s.attempts.length - MAX_ATTEMPTS);
  const day = today(new Date(a.t));
  const c = s.cards[a.p] || { box: 0, due: day, seen: 0, right: 0, last: 0, lastOk: false };
  c.seen++;
  if (a.ok) {
    c.right++;
    const missedToday = c.seen > 1 && !c.lastOk && today(new Date(c.last)) === day;
    // A first-time correct answer skips ahead: it was recognised without practice.
    // Getting it right minutes after missing it proves little, so it stays due tomorrow.
    c.box = missedToday ? 1 : Math.min(INTERVALS.length - 1, c.seen === 1 ? 2 : c.box + 1);
  } else {
    c.box = 1;
  }
  c.due = day + INTERVALS[c.box];
  c.last = a.t;
  c.lastOk = a.ok;
  s.cards[a.p] = c;
  const k = dayKey(day);
  s.days[k] = (s.days[k] || 0) + 1;
}

export function record(result) {
  applyResult(state, { ...result, t: Date.now() });
  persist(); emit();
}

/* ── Queries ── */
export const card = (id) => state.cards[id] || null;
export const attempts = () => state.attempts;

export function status(id) {
  const c = state.cards[id];
  if (!c) return "new";
  if (!c.lastOk) return "missed";
  return c.box >= MASTERED_BOX ? "mastered" : "learning";
}
export const STATUS_LABEL = { new: "New", learning: "Learning", mastered: "Mastered", missed: "Missed last time" };

export function inList(pr, list = state.settings.list) {
  return list === "all" || (pr.lists || []).includes(list);
}

export function dueProblems() {
  const t = today();
  return PROBLEMS.filter((p) => inList(p) && state.cards[p.id] && state.cards[p.id].due <= t)
    .sort((a, b) => state.cards[a.id].due - state.cards[b.id].due || state.cards[a.id].box - state.cards[b.id].box);
}

export function patternStats() {
  const m = new Map(PATTERNS.map((p) => [p.id, { attempts: 0, right: 0, recent: [] }]));
  for (const a of state.attempts) {
    const s = m.get(a.pat);
    if (!s) continue;
    s.attempts++;
    if (a.ok) s.right++;
    s.recent.push(a.ok);
  }
  for (const s of m.values()) {
    s.recent = s.recent.slice(-10);
    s.acc = s.attempts ? s.right / s.attempts : null;
    s.recentAcc = s.recent.length ? s.recent.filter(Boolean).length / s.recent.length : null;
  }
  return m;
}

// Fraction of a pattern's problems currently at mastered level.
export function patternMastery(patternId) {
  const prs = PROBLEMS.filter((p) => p.pattern === patternId);
  if (!prs.length) return 0;
  return prs.filter((p) => status(p.id) === "mastered").length / prs.length;
}

// Most common (expected → picked) mistakes.
export function confusions(limit = 6) {
  const m = new Map();
  for (const a of state.attempts) {
    if (a.ok || !a.pick || a.pick === a.pat) continue;
    const k = a.pat + ">" + a.pick;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
    .map(([k, n]) => { const [expected, picked] = k.split(">"); return { expected, picked, n }; })
    .filter((c) => patternById.has(c.expected) && patternById.has(c.picked));
}

export function streak() {
  const t = today();
  let n = 0;
  // Today counts if practised; otherwise the streak is still alive from yesterday.
  let d = state.days[dayKey(t)] ? t : t - 1;
  while (state.days[dayKey(d)]) { n++; d--; }
  return n;
}
export const activity = (days = 14) => {
  const t = today();
  return Array.from({ length: days }, (_, i) => {
    const d = t - (days - 1 - i);
    return { day: d, n: state.days[dayKey(d)] || 0 };
  });
};

/* ── Study plan: guided solves, re-solve schedule, drafts ── */
export const solves = () => state.solves;
export const reviews = () => state.reviews;
export const review = (id) => state.reviews[id] || null;
export const solvesOf = (id) => state.solves.filter((a) => a.p === id);

export function startDay() {
  const [y, m, d] = state.settings.startDate.split("-").map(Number);
  return today(new Date(y, m - 1, d));
}

// One set of statuses for a problem in the study plan, used by every list.
export function solveStatus(id) {
  const r = state.reviews[id];
  if (!r) return "new";
  if (r.mastered) return "mastered";
  return isDue(r, today()) ? "due" : "attempted";
}
export const SOLVE_STATUS_LABEL = { new: "Not started", attempted: "Attempted", due: "Due", mastered: "Mastered" };
export const leech = (id) => isLeech(state.reviews[id]);

// Drafts are saved often (every few seconds while solving), so they don't notify listeners.
export const draft = (id) => state.drafts[id] || null;
export function saveDraft(id, d) { state.drafts[id] = d; persist(); }
export function clearDraft(id) { delete state.drafts[id]; persist(); emit(); }

export function addStudy(sec) {
  if (!(sec > 0)) return;
  const k = dayKey(today());
  state.study[k] = (state.study[k] || 0) + sec;
  persist();
}
export const studySec = (day = today()) => state.study[dayKey(day)] || 0;
export const studyActivity = (days) => {
  const t = today();
  return Array.from({ length: days }, (_, i) => { const d = t - (days - 1 - i); return { day: d, sec: studySec(d) }; });
};

// Saves a finished attempt, moves the problem on the re-solve ladder, and clears its draft.
// Returns { attempt, before, after } so the result screen can show what changed.
export function saveSolve(a) {
  const now = Date.now();
  const day = today();
  const before = state.reviews[a.p] || null;
  const attempt = {
    id: now.toString(36) + Math.random().toString(36).slice(2, 7),
    p: a.p, t: a.t || now, day, dur: Math.max(0, Math.round(a.dur || 0)),
    mode: a.mode, hidden: !!a.hidden, first: !before,
    hint: a.hint | 0, outcome: a.outcome, guess: a.guess || null,
    dueWas: before && !before.mastered ? before.due : null,
    restate: a.restate || "", brute: a.brute || "", waste: a.waste || "",
    time: a.time || "", space: a.space || "",
    note: { pattern: a.note.pattern, clue: a.note.clue.trim(), insight: a.note.insight.trim(), mistakes: (a.note.mistakes || "").trim() },
  };
  state.solves.push(attempt);
  if (state.solves.length > MAX_SOLVES) state.solves.splice(0, state.solves.length - MAX_SOLVES);
  const after = schedule(before, a.outcome, day);
  state.reviews[a.p] = after;
  delete state.drafts[a.p];
  const k = dayKey(day);
  state.days[k] = (state.days[k] || 0) + 1;   // a solve keeps the streak alive too
  persist(); emit();
  return { attempt, before, after };
}

export function plan() {
  return planToday({
    settings: { startDay: startDay(), newPerDay: state.settings.newPerDay },
    reviews: state.reviews, solves: state.solves, topics: TOPICS, problems: PROBLEMS, today: today(),
  });
}
export const dueReviewCount = () => Object.values(state.reviews).filter((r) => isDue(r, today())).length;

export function metrics() {
  return computeMetrics({ solves: state.solves, problems: problemById, patterns: PATTERNS.map((p) => p.id), today: today() });
}

export const built = (topicId) => !!state.built[topicId];
export function setBuilt(topicId, on) {
  if (on) state.built[topicId] = true; else delete state.built[topicId];
  persist(); emit();
}

// Share of a topic's problems attempted at least once.
export function topicProgress(t) {
  if (!t.problems.length) return null;
  return t.problems.filter((id) => state.reviews[id]).length / t.problems.length;
}

/* ── Data management ── */
export function exportData() {
  return JSON.stringify({ app: "pattern-trace", exported: new Date().toISOString(), ...state }, null, 1);
}
export function importData(text) {
  const raw = JSON.parse(text);
  if (!raw || raw.app !== "pattern-trace") throw new Error("That file isn't a Pattern Trace export.");
  state = sanitize(raw);
  if (!/^\d{4}-\d\d-\d\d$/.test(state.settings.startDate)) state.settings.startDate = isoDate();
  persist(); emit();
  return state.attempts.length + state.solves.length;
}
export function resetProgress() {
  const keep = state.settings;
  state = blank();
  state.settings = keep;
  try { localStorage.removeItem(LEGACY_KEY); } catch {}
  persist(); emit();
}
