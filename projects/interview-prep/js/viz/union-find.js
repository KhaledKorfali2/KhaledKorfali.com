import { graphView, layoutTree, arrayView, chips, stats, parseNumber, parsePairs, InputError } from "./kit.js";

const COMP = ["c0", "c1", "c2", "c3", "c4", "c5"];

// Number of connected components + Redundant Connection with a disjoint-set
// forest: find() with full path compression, union by size.
export default {
  id: "union-find",
  title: "Connected components & the redundant edge (Union-Find)",
  blurb: "Each edge merges two trees by attaching the smaller root under the larger; an edge whose ends already share a root closes a cycle.",
  inputs: [
    { key: "n", label: "n (nodes 0..n-1)", default: "7", numeric: true, hint: "2–8" },
    { key: "edges", label: "edges a-b, in order", default: "0-1, 2-3, 1-2, 4-5, 3-0, 5-6", wide: true, hint: "up to 10 edges" },
  ],
  presets: [
    { label: "Cycle edge", values: { n: "7", edges: "0-1, 2-3, 1-2, 4-5, 3-0, 5-6" } },
    { label: "Path compression", values: { n: "8", edges: "0-1, 2-3, 0-2, 4-5, 6-7, 4-6, 0-4, 3-7" } },
    { label: "Separate parts", values: { n: "6", edges: "0-1, 2-3, 4-5" } },
  ],
  parse(v) {
    const n = parseNumber(v.n, { min: 2, max: 8, label: "n" });
    const edges = parsePairs(v.edges, { maxLen: 10, min: 0, max: n - 1, label: "edges" });
    if (!edges.length) throw new InputError("edges: enter at least one edge.");
    return { n, edges };
  },
  code: [
    "par = list(range(n))  # parent",
    "size = [1] * n; comps = n",
    "def find(x):",
    "    if par[x] != x:",
    "        par[x] = find(par[x])",
    "    return par[x]",
    "for a, b in edges:",
    "    ra, rb = find(a), find(b)",
    "    if ra == rb: continue  # cycle",
    "    if size[ra] < size[rb]:",
    "        ra, rb = rb, ra",
    "    par[rb] = ra; comps -= 1",
    "    size[ra] += size[rb]",
    "return comps",
  ],
  steps({ n, edges }) {
    const parent = [...Array(n).keys()];
    const size = Array(n).fill(1);
    let comps = n;
    const status = edges.map(() => ""); // "", "good", "bad"
    const redundant = [];
    const s = [];
    const snap = (o) => s.push({ parent: [...parent], size: [...size], comps, status: [...status], ...o });

    // find with an explicit walk so each phase becomes a step
    const find = (x, ei, which) => {
      const path = [x];
      let root = x;
      while (parent[root] !== root) { root = parent[root]; path.push(root); }
      snap({ edge: ei, line: [2, 3, 5], path: [...path], focus: x, msg: path.length === 1
        ? `find(${x}): ${x} is its own parent, so it is a root.`
        : `find(${x}): follow parents ${path.join(" → ")} to the root ${root}.` });
      const moved = [];
      let y = x;
      while (y !== root) { const nx = parent[y]; if (nx !== root) moved.push(y); parent[y] = root; y = nx; }
      if (moved.length) snap({ edge: ei, line: 4, path: [...path], focus: x, moved, msg:
        `Path compression: point ${moved.join(", ")} straight at root ${root}, so later finds take one hop.` });
      return root;
    };

    snap({ line: [0, 1], msg: `Start with ${n} single-node trees: everyone is their own parent, ${n} components.` });
    edges.forEach(([a, b], ei) => {
      snap({ edge: ei, line: [6, 7], msg: `Edge ${a}-${b}: are ${a} and ${b} already in the same tree?` });
      let ra = find(a, ei, "a");
      let rb = find(b, ei, "b");
      if (ra === rb) {
        status[ei] = "bad"; redundant.push(ei);
        snap({ edge: ei, line: 8, roots: [ra], cycle: true, msg: `Both reach root ${ra}: ${a} and ${b} are already connected, so ${a}-${b} would close a cycle — it's redundant.` });
        return;
      }
      let swapped = false;
      if (size[ra] < size[rb]) { [ra, rb] = [rb, ra]; swapped = true; }
      const why = size[ra] === size[rb] ? "equal sizes, so keep the first root on top" : `size ${size[rb]} < ${size[ra]}`;
      parent[rb] = ra; size[ra] += size[rb]; comps--;
      status[ei] = "good";
      snap({ edge: ei, line: swapped ? [9, 10, 11, 12] : [9, 11, 12], roots: [ra], attached: rb, msg:
        `Different roots: attach ${rb} under ${ra} (${why}). Tree size ${size[ra]}, ${comps} component${comps === 1 ? "" : "s"} left.` });
    });
    const answer = { comps, redundant };
    snap({ line: 13, done: true, answer, msg: (redundant.length
      ? `Done: ${comps} component${comps === 1 ? "" : "s"}; redundant edge${redundant.length > 1 ? "s" : ""} ${redundant.map((i) => edges[i].join("-")).join(", ")} closed a cycle. `
      : `Done: ${comps} component${comps === 1 ? "" : "s"} and no cycles. `) + "Union by size + path compression make each find nearly O(1)." });
    return s;
  },
  render(st, { n, edges }) {
    const parent = st.parent;
    const rootOf = (x) => { while (parent[x] !== x) x = parent[x]; return x; };
    // colour every non-singleton tree by the order of its root
    const roots = [...Array(n).keys()].filter((i) => parent[i] === i);
    const colour = new Map();
    let k = 0;
    roots.forEach((r) => { if (st.size[r] > 1) colour.set(r, COMP[k++ % COMP.length]); });
    const onPath = new Set(st.path || []);
    const moved = new Set(st.moved || []);
    const hl = new Set(st.roots || []);

    // forest → one tree under a hidden super-root, then drop it
    const kids = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) if (parent[i] !== i) kids[parent[i]].push(i);
    const build = (i) => ({ id: i, label: String(i), children: kids[i].map(build) });
    const t = layoutTree({ id: "super", children: roots.map(build) }, { levelGap: 15, top: 0 });
    const nodes = t.nodes.filter((nd) => nd.id !== "super").map((nd) => {
      let states;
      if (st.cycle && hl.has(nd.id)) states = ["bad"];
      else if (moved.has(nd.id)) states = ["good"];
      else if (onPath.has(nd.id)) states = [nd.id === st.focus ? "active" : "path"];
      else if (hl.has(nd.id)) states = ["active"];
      else states = [colour.get(rootOf(nd.id))];
      return { id: nd.id, x: nd.x, y: nd.y - 6.5, label: nd.label, states, badge: parent[nd.id] === nd.id && st.size[nd.id] > 1 ? `s=${st.size[nd.id]}` : "" };
    });
    const pathEdge = (i) => onPath.has(i) && onPath.has(parent[i]) && !moved.has(i);
    const fEdges = [...Array(n).keys()].filter((i) => parent[i] !== i).map((i) => ({
      a: i, b: parent[i], directed: true,
      states: moved.has(i) ? ["good"] : pathEdge(i) ? ["active"] : st.attached === i ? ["good"] : [],
    }));
    const height = Math.max(...nodes.map((nd) => nd.y)) + 7;
    const cur = st.edge;
    return `<div class="vz-union-find-g">` + graphView(nodes, fEdges, { height, r: 5.8, label: "forest (arrow → parent)" }) + `</div>` +
      `<div class="vz-union-find-arr">` + arrayView(parent, {
        label: "par[i] — parent of i",
        states: (i) => [moved.has(i) || st.attached === i ? "good" : onPath.has(i) ? "window" : ""],
      }) + `</div>` +
      `<div class="vz-row">` +
      chips("edges", edges.map(([a, b], i) => ({
        text: `${a}-${b}`,
        states: [i === cur && !st.status[i] ? "active" : "", st.status[i], i === cur && st.status[i] ? "active" : ""],
      }))) +
      stats([["components", st.comps, st.done ? ["good"] : []], ...(st.done ? [["redundant", st.answer.redundant.length, st.answer.redundant.length ? ["bad"] : []]] : [])]) +
      `</div>`;
  },
  css: `
.vz-union-find-g { width: 100%; display: flex; flex-direction: column; align-items: center; }
.vz-union-find-g .vz-graph-wrap { max-width: 440px; }
.vz-union-find-g .vz-node text { font-size: 4.7px; }
.vz-union-find-g .vz-node .vz-badge { font-size: 3.8px; }
.vz-union-find-g .vz-elabel { font-size: 4.3px; stroke-width: 1.5px; }
.vz-union-find-g .vz-edge.is-active, .vz-union-find-g .vz-edge.is-good { stroke-width: .8; }
.vz-union-find-arr { display: flex; flex-direction: column; align-items: center; }
.vz-union-find-arr .vz-array { gap: 5px; flex-wrap: nowrap; }
.vz-union-find-arr .vz-cell { min-width: calc(var(--cell) * .8); height: calc(var(--cell) * .85); }
`,
  legend: [["active", "current"], ["path", "find() path"], ["good", "merged / re-pointed"], ["bad", "cycle edge"], ["c0", "a component"]],
};
