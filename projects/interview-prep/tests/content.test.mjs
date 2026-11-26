// Content checks: every slug and pattern id in the study plan resolves.
import test from "node:test";
import assert from "node:assert/strict";
import { PROBLEMS, PATTERNS, TOPICS, PHASES, CLUE_TABLE, patternById, problemBySlug } from "../js/data/index.js";
import { TOPICS as RAW } from "../js/data/curriculum.js";
import { RENAMED, ALSO_ON_NEETCODE } from "../js/data/neetcode.js";
import { problemUrl, problemSite, solutionUrl } from "../js/data/index.js";

test("NeetCode links: every mapped slug is a real problem and no two problems share a page", () => {
  for (const slug of [...Object.keys(RENAMED), ...ALSO_ON_NEETCODE]) assert.ok(problemBySlug.has(slug), slug);
  const urls = PROBLEMS.map(problemUrl);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(problemUrl(problemBySlug.get("two-sum")), "https://neetcode.io/problems/two-integer-sum");
  assert.equal(problemUrl(problemBySlug.get("binary-search")), "https://neetcode.io/problems/binary-search");
  assert.equal(solutionUrl(problemBySlug.get("two-sum")), "https://neetcode.io/problems/two-integer-sum/solution");
  // The one problem NeetCode doesn't host falls back to LeetCode.
  const off = PROBLEMS.filter((p) => problemSite(p) === "LeetCode").map((p) => p.slug);
  assert.deepEqual(off, ["maximum-average-subarray-i"]);
  assert.equal(problemUrl(problemBySlug.get(off[0])), "https://leetcode.com/problems/maximum-average-subarray-i/");
});

test("every topic slug resolves to a problem, with no repeats", () => {
  const seen = new Set();
  for (const t of RAW) for (const s of t.slugs) {
    assert.ok(problemBySlug.has(s), `${t.id}: ${s}`);
    assert.ok(!seen.has(s), `${s} listed twice`);
    seen.add(s);
  }
});
test("every topic and clue pattern id resolves", () => {
  for (const t of TOPICS) for (const id of t.patterns) assert.ok(patternById.has(id), `${t.id}: ${id}`);
  for (const r of CLUE_TABLE) for (const id of r.patterns) assert.ok(patternById.has(id), id);
});
test("topics are in week order, belong to a phase, and have 3 to 8 problems (except mixed practice)", () => {
  let week = 0;
  for (const t of TOPICS) {
    assert.ok(t.week > week, t.id); week = t.week;
    assert.ok(PHASES.some((p) => p.id === t.phase), t.id);
    if (t.phase < 3) assert.ok(t.problems.length >= 3 && t.problems.length <= 8, `${t.id}: ${t.problems.length}`);
    const words = t.primer.split(/\s+/).length;
    assert.ok(words >= 150 && words <= 330, `${t.id} primer is ${words} words`);
  }
});
test("every pattern taught has problems, and every problem has both hints", () => {
  for (const p of PATTERNS) assert.ok(PROBLEMS.some((pr) => pr.pattern === p.id), p.id);
  for (const pr of PROBLEMS) { assert.ok(pr.insight, pr.id); assert.ok(patternById.has(pr.pattern), pr.id); }
});
