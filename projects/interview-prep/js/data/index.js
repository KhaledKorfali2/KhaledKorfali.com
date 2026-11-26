// Aggregates the content files and builds lookup tables.
import { CATEGORIES, PATTERNS } from "./patterns.js";
import problemsA from "./problems-a.js";
import problemsB from "./problems-b.js";
import { RENAMED, ALSO_ON_NEETCODE } from "./neetcode.js";
import { PHASES, TOPICS as RAW_TOPICS, CONSTRAINT_TABLE, CLUE_TABLE } from "./curriculum.js";

export { CATEGORIES, PATTERNS, PHASES, CONSTRAINT_TABLE, CLUE_TABLE };

export const DATA_STRUCTURES = ["Array", "String", "Hash Map", "Hash Set", "Stack", "Queue", "Deque", "Heap", "Linked List", "Tree", "Graph", "Trie", "Union-Find", "Matrix"];
export const TIME_BUCKETS = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n log k)", "O(n·m)", "O(V + E)", "O(E log V)", "O(n²)", "O(n³)", "O(2ⁿ)", "O(n!)"];

export const PROBLEMS = [...problemsA, ...problemsB].sort((a, b) => a.number - b.number);

export const patternById = new Map(PATTERNS.map((p) => [p.id, p]));
export const problemById = new Map(PROBLEMS.map((p) => [p.id, p]));
export const problemBySlug = new Map(PROBLEMS.map((p) => [p.slug, p]));
export const templateById = new Map(PATTERNS.flatMap((p) => p.templates.map((t) => [t.id, { ...t, pattern: p.id }])));

export const problemsByPattern = new Map(PATTERNS.map((p) => [p.id, []]));
for (const pr of PROBLEMS) problemsByPattern.get(pr.pattern)?.push(pr);

// Study-plan topics with their slugs resolved to problem ids (unknown slugs are dropped and reported below).
export const TOPICS = RAW_TOPICS.map((t) => ({
  ...t,
  problems: t.slugs.filter((s) => problemBySlug.has(s)).map((s) => problemBySlug.get(s).id),
}));
export const topicById = new Map(TOPICS.map((t) => [t.id, t]));
export const topicOfProblem = new Map();
for (const t of TOPICS) for (const id of t.problems) if (!topicOfProblem.has(id)) topicOfProblem.set(id, t);
export const weekLabel = (t) => (t.weeks ? `Weeks ${t.weeks[0]}–${t.weeks[1]}` : `Week ${t.week}`);

// Hints for the guided solve: 1 = the pattern's name, 2 = the key insight, 3 = an outside solution.
export const solutionUrl = (pr) => (neetcodeSlug(pr) ? `https://neetcode.io/problems/${neetcodeSlug(pr)}/solution` : `https://leetcode.com/problems/${pr.slug}/solutions/`);

export const LISTS = { all: "All problems", blind75: "Blind 75", neetcode150: "NeetCode 150" };

// Patterns that count as right for a problem.
export const acceptedPatterns = (pr) => [pr.pattern, ...(pr.alsoAccept || [])];

export const leetcodeUrl = (pr) => `https://leetcode.com/problems/${pr.slug}/`;

// Problems link to NeetCode whenever NeetCode hosts them, and to LeetCode otherwise.
const alsoOnNeetcode = new Set(ALSO_ON_NEETCODE);
export function neetcodeSlug(pr) {
  if (RENAMED[pr.slug]) return RENAMED[pr.slug];
  return (pr.lists || []).includes("neetcode150") || alsoOnNeetcode.has(pr.slug) ? pr.slug : null;
}
export const problemUrl = (pr) => (neetcodeSlug(pr) ? `https://neetcode.io/problems/${neetcodeSlug(pr)}` : leetcodeUrl(pr));
export const problemSite = (pr) => (neetcodeSlug(pr) ? "NeetCode" : "LeetCode");

// Surface content mistakes during development instead of failing silently in the UI.
(function validate() {
  const issues = [];
  const seen = new Set();
  for (const pr of PROBLEMS) {
    if (seen.has(pr.id)) issues.push(`duplicate id ${pr.id}`);
    seen.add(pr.id);
    for (const pid of acceptedPatterns(pr)) if (!patternById.has(pid)) issues.push(`${pr.id}: unknown pattern ${pid}`);
    if (!TIME_BUCKETS.includes(pr.time)) issues.push(`${pr.id}: time ${pr.time} not a bucket`);
    for (const d of pr.dataStructures) if (!DATA_STRUCTURES.includes(d)) issues.push(`${pr.id}: ds ${d}`);
    if (pr.template && !templateById.has(pr.template)) issues.push(`${pr.id}: template ${pr.template}`);
  }
  const placed = new Set();
  for (const t of RAW_TOPICS) {
    for (const slug of t.slugs) {
      if (!problemBySlug.has(slug)) issues.push(`${t.id}: unknown problem ${slug}`);
      if (placed.has(slug)) issues.push(`${t.id}: ${slug} is already in an earlier topic`);
      placed.add(slug);
    }
    for (const pid of t.patterns) if (!patternById.has(pid)) issues.push(`${t.id}: unknown pattern ${pid}`);
  }
  for (const slug of [...Object.keys(RENAMED), ...ALSO_ON_NEETCODE]) if (!problemBySlug.has(slug)) issues.push(`neetcode map: unknown problem ${slug}`);
  for (const row of CLUE_TABLE) for (const pid of row.patterns) if (!patternById.has(pid)) issues.push(`clue table: unknown pattern ${pid}`);
  if (issues.length) console.warn("Pattern Trace data issues:\n" + issues.join("\n"));
})();
