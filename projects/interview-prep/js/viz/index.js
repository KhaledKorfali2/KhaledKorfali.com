// Pattern id → lazily imported visualiser spec.
const LOADERS = {
  "hash-map": () => import("./hash-map.js"),
  "prefix-sum": () => import("./prefix-sum.js"),
  "two-pointers": () => import("./two-pointers.js"),
  "sliding-window": () => import("./sliding-window.js"),
  "binary-search": () => import("./binary-search.js"),
  "stack": () => import("./stack.js"),
  "monotonic-stack": () => import("./monotonic-stack.js"),
  "linked-list": () => import("./linked-list.js"),
  "heap": () => import("./heap.js"),
  "intervals": () => import("./intervals.js"),
  "greedy": () => import("./greedy.js"),
  "dfs": () => import("./dfs.js"),
  "bfs": () => import("./bfs.js"),
  "union-find": () => import("./union-find.js"),
  "topological-sort": () => import("./topological-sort.js"),
  "shortest-path": () => import("./shortest-path.js"),
  "trie": () => import("./trie.js"),
  "backtracking": () => import("./backtracking.js"),
  "dynamic-programming": () => import("./dynamic-programming.js"),
  "bit-manipulation": () => import("./bit-manipulation.js"),
  "math-sim": () => import("./math-sim.js"),
};

export const hasViz = (patternId) => patternId in LOADERS;

export async function loadViz(patternId) {
  const load = LOADERS[patternId];
  if (!load) return null;
  try {
    return (await load()).default;
  } catch (e) {
    console.error("Visualiser failed to load:", patternId, e);
    return null;
  }
}
