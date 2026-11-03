// Aggregates the content files and builds lookup tables.
import { CATEGORIES, PATTERNS } from "./patterns.js";
import problemsA from "./problems-a.js";
import problemsB from "./problems-b.js";

export { CATEGORIES, PATTERNS };

export const DATA_STRUCTURES = ["Array", "String", "Hash Map", "Hash Set", "Stack", "Queue", "Deque", "Heap", "Linked List", "Tree", "Graph", "Trie", "Union-Find", "Matrix"];
export const TIME_BUCKETS = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n log k)", "O(n·m)", "O(V + E)", "O(E log V)", "O(n²)", "O(n³)", "O(2ⁿ)", "O(n!)"];

export const PROBLEMS = [...problemsA, ...problemsB].sort((a, b) => a.number - b.number);

export const patternById = new Map(PATTERNS.map((p) => [p.id, p]));
export const problemById = new Map(PROBLEMS.map((p) => [p.id, p]));
export const templateById = new Map(PATTERNS.flatMap((p) => p.templates.map((t) => [t.id, { ...t, pattern: p.id }])));

export const problemsByPattern = new Map(PATTERNS.map((p) => [p.id, []]));
for (const pr of PROBLEMS) problemsByPattern.get(pr.pattern)?.push(pr);

export const LISTS = { all: "All problems", blind75: "Blind 75", neetcode150: "NeetCode 150" };

// Patterns that count as right for a problem.
export const acceptedPatterns = (pr) => [pr.pattern, ...(pr.alsoAccept || [])];

export const leetcodeUrl = (pr) => `https://leetcode.com/problems/${pr.slug}/`;

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
  if (issues.length) console.warn("Pattern Trace data issues:\n" + issues.join("\n"));
})();
