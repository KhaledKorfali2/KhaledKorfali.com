// Unit tests for the pure domain logic. No dependencies:
//   node --test projects/interview-prep/tests/
import test from "node:test";
import assert from "node:assert/strict";
import { schedule, LADDER, isLeech, isDue, outcomeFloor, outcomeAllowed } from "../js/domain/scheduler.js";
import { planToday, currentTopic, weekOf, REVIEW_CAP } from "../js/domain/planner.js";
import { computeMetrics, strengthOf } from "../js/domain/metrics.js";

const DAY = 20000;

/* ── Scheduler: one test per row of the table ── */
test("first attempt, clean: stage 1, due in 7 days", () => {
  assert.deepEqual(schedule(null, "clean", DAY), { stage: 1, due: DAY + 7, lapses: 0, last: "clean", mastered: false });
});
test("first attempt, anything else: stage 0, due in 3 days", () => {
  for (const o of ["hinted", "solution", "failed"]) {
    assert.deepEqual(schedule(null, o, DAY), { stage: 0, due: DAY + 3, lapses: 0, last: o, mastered: false });
  }
});
test("review, clean: up one rung, due by the ladder", () => {
  const r = schedule({ stage: 1, due: DAY, lapses: 1, last: "clean", mastered: false }, "clean", DAY);
  assert.equal(r.stage, 2);
  assert.equal(r.due, DAY + LADDER[2]);
  assert.equal(r.lapses, 1);
  assert.equal(r.mastered, false);
});
test("review, clean past the last rung: mastered, no longer scheduled", () => {
  const r = schedule({ stage: LADDER.length - 1, due: DAY, lapses: 0, last: "clean", mastered: false }, "clean", DAY);
  assert.equal(r.mastered, true);
  assert.equal(r.due, null);
  assert.equal(isDue(r, DAY + 999), false);
});
test("review, hinted: down one rung, never below 0", () => {
  const a = schedule({ stage: 3, due: DAY, lapses: 0, last: "clean", mastered: false }, "hinted", DAY);
  assert.equal(a.stage, 2);
  assert.equal(a.due, DAY + LADDER[2]);
  const b = schedule({ stage: 0, due: DAY, lapses: 0, last: "failed", mastered: false }, "hinted", DAY);
  assert.equal(b.stage, 0);
  assert.equal(b.due, DAY + LADDER[0]);
  assert.equal(b.lapses, 0);
});
test("review, solution or failed: stage 0, due tomorrow, one more lapse", () => {
  for (const o of ["solution", "failed"]) {
    const r = schedule({ stage: 3, due: DAY, lapses: 1, last: "clean", mastered: false }, o, DAY);
    assert.deepEqual(r, { stage: 0, due: DAY + 1, lapses: 2, last: o, mastered: false });
  }
});
test("three lapses make a leech", () => {
  let r = schedule(null, "failed", DAY);
  assert.equal(isLeech(r), false);
  for (let i = 0; i < 3; i++) r = schedule(r, "failed", DAY + i);
  assert.equal(r.lapses, 3);
  assert.equal(isLeech(r), true);
});
test("a mastered problem that is failed again comes back", () => {
  const r = schedule({ stage: 4, due: null, lapses: 0, last: "clean", mastered: true }, "failed", DAY);
  assert.equal(r.mastered, false);
  assert.equal(r.due, DAY + 1);
});
test("hints cap the outcome an attempt can claim", () => {
  assert.equal(outcomeFloor(0), "clean");
  assert.equal(outcomeFloor(2), "hinted");
  assert.equal(outcomeFloor(3), "solution");
  assert.equal(outcomeAllowed("clean", 1), false);
  assert.equal(outcomeAllowed("failed", 0), true);
  assert.equal(outcomeAllowed("hinted", 3), false);
});

/* ── Planner ── */
const topics = [
  { id: "t1", week: 1, patterns: ["a"], problems: ["p1", "p2", "p3", "p4"] },
  { id: "t2", week: 2, patterns: ["b"], problems: ["p5", "p6", "p7"] },
  { id: "mix", week: 15, patterns: [], problems: [] },
];
const problems = [
  ...["p1", "p2", "p3", "p4"].map((id) => ({ id, pattern: "a", difficulty: "Easy" })),
  ...["p5", "p6", "p7"].map((id) => ({ id, pattern: "b", difficulty: "Medium" })),
  { id: "x1", pattern: "a", difficulty: "Medium" },
  { id: "x2", pattern: "c", difficulty: "Medium" },
];
const base = { settings: { startDay: DAY, newPerDay: 2 }, reviews: {}, solves: [], topics, problems, today: DAY };
const solve = (p, extra = {}) => ({ p, day: DAY - 1, first: true, hidden: false, ...extra });
const rev = (due, extra = {}) => ({ stage: 0, due, lapses: 0, last: "clean", mastered: false, ...extra });

test("planner: new problems come from the current topic in listed order", () => {
  const plan = planToday(base);
  assert.equal(plan.topic.id, "t1");
  assert.deepEqual(plan.fresh.map((f) => f.p), ["p1", "p2"]);
  assert.equal(plan.fresh.every((f) => !f.hidden), true);
});
test("planner: current topic is the first under 70% attempted", () => {
  assert.equal(currentTopic(topics, new Set(["p1", "p2"])).id, "t1");        // 50%
  assert.equal(currentTopic(topics, new Set(["p1", "p2", "p3"])).id, "t2");  // 75%
  assert.equal(currentTopic(topics, new Set(["p1", "p2", "p3", "p5", "p6", "p7"])).id, "mix");
});
test("planner: due re-solves are oldest first and capped at 6, the rest overflow", () => {
  const reviews = {};
  for (let i = 0; i < 9; i++) reviews["r" + i] = rev(DAY - i);
  reviews.later = rev(DAY + 2);
  reviews.done = rev(null, { mastered: true });
  const plan = planToday({ ...base, reviews });
  assert.equal(plan.reviews.length, REVIEW_CAP);
  assert.deepEqual(plan.reviews.map((r) => r.p), ["r8", "r7", "r6", "r5", "r4", "r3"]);
  assert.equal(plan.overflow, 3);
});
test("planner: finishing an item removes it and does not pull in another", () => {
  const reviews = { r1: rev(DAY + 3), r2: rev(DAY) };
  const solves = [solve("p1", { day: DAY }), { p: "r1", day: DAY, first: false }];
  const plan = planToday({ ...base, reviews, solves });
  assert.deepEqual(plan.fresh.map((f) => f.p), ["p2"]);          // 2 a day, 1 already done
  assert.deepEqual(plan.reviews.map((r) => r.p), ["r2"]);
  const all = planToday({ ...base, solves: [solve("p1", { day: DAY }), solve("p2", { day: DAY })] });
  assert.equal(all.fresh.length, 0);
  assert.equal(all.empty, true);
});
test("planner: reviews already done today count against the cap", () => {
  const reviews = {};
  for (let i = 0; i < 8; i++) reviews["r" + i] = rev(DAY);
  const solves = [0, 1, 2, 3].map((i) => ({ p: "z" + i, day: DAY, first: false }));
  const plan = planToday({ ...base, reviews, solves });
  assert.equal(plan.reviews.length, 2);
  assert.equal(plan.overflow, 6);
});
test("planner: from week 15 one new problem is replaced by a hidden-topic one", () => {
  const before = planToday({ ...base, today: DAY + 7 * 13 });
  assert.equal(before.week, 14);
  assert.equal(before.fresh.some((f) => f.hidden), false);
  const plan = planToday({ ...base, today: DAY + 7 * 14 });
  assert.equal(plan.week, 15);
  assert.equal(plan.fresh.length, 2);
  assert.equal(plan.fresh.filter((f) => f.hidden).length, 1);
  assert.equal(plan.fresh[0].p, "p1");
  // Hidden pick: unattempted, from a covered pattern (only "a" so far), not already listed.
  assert.equal(plan.fresh[1].p, "x1");
});
test("planner: hidden picks are never problems already attempted", () => {
  const solves = [solve("x1")];
  const plan = planToday({ ...base, solves, today: DAY + 7 * 14 });
  const hidden = plan.fresh.find((f) => f.hidden);
  assert.notEqual(hidden.p, "x1");
});
test("planner: once every topic is done, all new problems are hidden-topic", () => {
  const solves = ["p1", "p2", "p3", "p5", "p6", "p7"].map((p) => solve(p));
  const plan = planToday({ ...base, solves });
  assert.equal(plan.topic.id, "mix");
  assert.equal(plan.fresh.length, 2);
  assert.equal(plan.fresh.every((f) => f.hidden), true);
});
test("planner: leeches are flagged", () => {
  const plan = planToday({ ...base, reviews: { r1: rev(DAY, { lapses: 3 }), r2: rev(DAY, { lapses: 1 }) } });
  assert.deepEqual(plan.leeches, ["r1"]);
  assert.equal(plan.reviews.find((r) => r.p === "r1").leech, true);
});
test("weekOf counts from the start date", () => {
  assert.equal(weekOf(DAY, DAY), 1);
  assert.equal(weekOf(DAY, DAY + 6), 1);
  assert.equal(weekOf(DAY, DAY + 7), 2);
  assert.equal(weekOf(DAY, DAY - 3), 1);
});

/* ── Metrics ── */
const bank = new Map([
  ["m1", { pattern: "a", difficulty: "Medium" }],
  ["m2", { pattern: "b", difficulty: "Medium", alsoAccept: ["a"] }],
  ["e1", { pattern: "a", difficulty: "Easy" }],
]);
const att = (p, outcome, extra = {}) => ({ p, day: DAY, dur: 600, mode: "learn", hidden: false, first: true, outcome, guess: null, dueWas: null, ...extra });

test("metrics: pattern strength is a 5:4:3:2:1 recency-weighted mean", () => {
  assert.equal(strengthOf([]), null);
  assert.equal(strengthOf(["clean"]), 1);
  // newest first: clean(5) hinted(4) failed(3) => (5 + 2) / 12
  assert.ok(Math.abs(strengthOf(["failed", "hinted", "clean"]) - 7 / 12) < 1e-9);
  // only the last five count
  assert.equal(strengthOf(["failed", "clean", "clean", "clean", "clean", "clean"]), 1);
});
test("metrics: unseen-medium rate uses hidden first attempts on Mediums, clean within 30 minutes", () => {
  const solves = [
    att("m1", "clean", { hidden: true }),                       // counts, hit
    att("m1", "clean", { hidden: true, dur: 31 * 60 }),         // counts, too slow
    att("m1", "hinted", { hidden: true }),                      // counts, miss
    att("e1", "clean", { hidden: true }),                       // Easy: ignored
    att("m1", "clean", { hidden: false }),                      // topic shown: ignored
    att("m1", "clean", { hidden: true, first: false }),         // a re-solve: ignored
  ];
  const m = computeMetrics({ solves, problems: bank, patterns: ["a", "b"], today: DAY });
  assert.equal(m.unseen.n, 3);
  assert.equal(m.unseen.hits, 1);
  assert.equal(m.met.unseen, false);
});
test("metrics: pattern-guess accuracy accepts any pattern the problem accepts", () => {
  const solves = [att("m1", "clean", { guess: "a" }), att("m2", "clean", { guess: "a" }), att("m1", "clean", { guess: "b" }), att("m1", "clean")];
  const m = computeMetrics({ solves, problems: bank, patterns: ["a", "b"], today: DAY });
  assert.equal(m.guess.n, 3);
  assert.equal(m.guess.hits, 2);
});
test("metrics: median clean time covers clean Mediums in the last 30 days", () => {
  const solves = [
    att("m1", "clean", { dur: 600 }), att("m1", "clean", { dur: 1200 }), att("m2", "clean", { dur: 900 }),
    att("m1", "clean", { dur: 99, day: DAY - 40 }), att("m1", "hinted", { dur: 1 }), att("e1", "clean", { dur: 1 }),
  ];
  const m = computeMetrics({ solves, problems: bank, patterns: ["a", "b"], today: DAY });
  assert.equal(m.medianClean.sec, 900);
  assert.equal(m.met.medianClean, true);
});
test("metrics: review health is the share of re-solves done by their due date", () => {
  const solves = [
    att("m1", "clean", { first: false, dueWas: DAY }), att("m1", "clean", { first: false, dueWas: DAY + 2 }),
    att("m1", "clean", { first: false, dueWas: DAY - 1 }), att("m1", "clean", { first: false, dueWas: DAY - 30, day: DAY - 20 }),
  ];
  const m = computeMetrics({ solves, problems: bank, patterns: ["a", "b"], today: DAY });
  assert.equal(m.reviewHealth.n, 3);
  assert.equal(m.reviewHealth.hits, 2);
});
test("metrics: weakest pattern is the lowest practised one, else the first untouched", () => {
  const weak = computeMetrics({ solves: [att("m1", "failed"), att("m2", "clean")], problems: bank, patterns: ["a", "b"], today: DAY });
  assert.equal(weak.weakest.id, "a");
  const untouched = computeMetrics({ solves: [att("m1", "clean")], problems: bank, patterns: ["a", "b"], today: DAY });
  assert.equal(untouched.weakest.id, "b");
  assert.equal(untouched.met.strength, false);
});
test("metrics: interview-ready needs targets 1, 2 and 4 with 20 qualifying attempts", () => {
  const good = [];
  for (let i = 0; i < 20; i++) good.push(att(i % 2 ? "m1" : "m2", i < 14 ? "clean" : "hinted", { hidden: true, guess: i % 2 ? "a" : "b" }));
  // finish each pattern on clean attempts so strength clears 0.5
  const tail = [att("m1", "clean", { first: false }), att("m2", "clean", { first: false }), att("m1", "clean", { first: false }), att("m2", "clean", { first: false })];
  const m = computeMetrics({ solves: [...good, ...tail], problems: bank, patterns: ["a", "b"], today: DAY });
  assert.equal(m.unseen.n, 20);
  assert.equal(m.unseen.rate, 0.7);
  assert.equal(m.ready, true);
  const few = computeMetrics({ solves: [...good.slice(0, 19), ...tail], problems: bank, patterns: ["a", "b"], today: DAY });
  assert.equal(few.ready, false);
});
