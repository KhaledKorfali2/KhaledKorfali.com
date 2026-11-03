import { graphView, circleLayout, arrayView, chips, stats, parseNumber, parsePairs, InputError } from "./kit.js";

const INF = Infinity;
const fmt = (d) => (d === INF ? "∞" : String(d));

// Hand-placed coordinates for the preset graphs (keyed by normalised edge list).
const DEFAULT_EDGES = "0-1:4, 0-2:1, 2-1:2, 1-3:1, 2-4:5, 3-4:3, 3-5:6, 4-5:2";
const LAYOUTS = {
  [DEFAULT_EDGES]: { height: 46, xy: [[7, 23], [36, 6], [36, 40], [64, 6], [64, 40], [93, 23]] },
  "0-1:7, 0-2:2, 2-3:2, 3-1:1, 1-4:1, 3-4:6": { height: 46, xy: [[7, 23], [50, 6], [24, 40], [62, 40], [93, 23]] },
  "0-1:2, 1-2:3, 0-2:6, 3-4:1, 4-5:2": { height: 46, xy: [[8, 23], [32, 6], [32, 40], [64, 23], [80, 6], [93, 40]] },
};
const norm = (edges) => edges.map(([a, b, w]) => `${a}-${b}:${w}`).join(", ");

function placement(n, edges) {
  const fixed = LAYOUTS[norm(edges)];
  if (fixed && fixed.xy.length === n) return { pos: fixed.xy.map(([x, y], id) => ({ id, x, y })), height: fixed.height };
  return { pos: circleLayout([...Array(n).keys()], { cx: 50, cy: 33, rx: 42, ry: 27 }), height: 64 };
}

// Dijkstra with a lazy min-heap on an undirected weighted graph.
export default {
  id: "shortest-path",
  title: "Dijkstra — cheapest route from a source to a target",
  blurb: "Always settle the closest unsettled node next; with non-negative weights its distance can't improve later.",
  inputs: [
    { key: "edges", label: "edges a-b:w (undirected, w ≥ 0)", default: DEFAULT_EDGES, wide: true, hint: "nodes 0–7, up to 12 edges" },
    { key: "src", label: "source", default: "0", numeric: true },
    { key: "dst", label: "target", default: "5", numeric: true },
  ],
  presets: [
    { label: "Example", values: { edges: DEFAULT_EDGES, src: "0", dst: "5" } },
    { label: "Detour wins", values: { edges: "0-1:7, 0-2:2, 2-3:2, 3-1:1, 1-4:1, 3-4:6", src: "0", dst: "4" } },
    { label: "Unreachable", values: { edges: "0-1:2, 1-2:3, 0-2:6, 3-4:1, 4-5:2", src: "0", dst: "5" } },
  ],
  parse(v) {
    const edges = parsePairs(v.edges, { weighted: true, maxLen: 12, min: 0, max: 7, label: "edges" });
    if (!edges.length) throw new InputError("edges: enter at least one edge.");
    for (const [a, b, w] of edges) {
      if (w < 0) throw new InputError(`Edge ${a}-${b} has negative weight ${w}: Dijkstra needs weights ≥ 0 (use Bellman-Ford for negative edges).`);
      if (w > 99) throw new InputError(`Edge ${a}-${b}: keep weights at most 99.`);
      if (a === b) throw new InputError(`Edge ${a}-${b} is a self-loop; remove it.`);
    }
    const src = parseNumber(v.src, { min: 0, max: 7, label: "source" });
    const dst = parseNumber(v.dst, { min: 0, max: 7, label: "target" });
    const n = Math.max(src, dst, ...edges.flatMap(([a, b]) => [a, b])) + 1;
    return { edges, src, dst, n };
  },
  code: [
    "dist = [inf] * n; dist[src] = 0",
    "heap = [(0, src)]",
    "while heap:",
    "    d, u = pop(heap)  # min d",
    "    if d > dist[u]: continue",
    "    settled.add(u)  # final",
    "    for v, w in graph[u]:",
    "        if d + w < dist[v]:",
    "            dist[v] = d + w",
    "            prev[v] = u",
    "            push(heap, (d + w, v))",
    "path = walk prev[] from target",
    "return dist[target]",
  ],
  steps({ edges, src, dst, n }) {
    const adj = Array.from({ length: n }, () => []);
    edges.forEach(([a, b, w], i) => { adj[a].push([b, w, i]); adj[b].push([a, w, i]); });
    const dist = Array(n).fill(INF), prev = Array(n).fill(-1), prevE = Array(n).fill(-1);
    const settled = new Set();
    let heap = [];
    const s = [];
    const snap = (o) => s.push({ dist: [...dist], prev: [...prev], prevE: [...prevE], settled: new Set(settled), heap: heap.map((h) => [...h]), ...o });
    dist[src] = 0; heap.push([0, src]);
    snap({ line: [0, 1], msg: `Only the source ${src} is known: dist[${src}] = 0, everything else ∞. Push (0, ${src}).` });
    while (heap.length) {
      heap.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
      const [d, u] = heap.shift();
      if (d > dist[u]) {
        snap({ line: [3, 4], u, stale: true, msg: `Pop (${d}, ${u}) — stale: ${u} was already settled at ${dist[u]}. Skip it.` });
        continue;
      }
      settled.add(u);
      snap({ line: [3, 5], u, msg: `Pop (${d}, ${u}): the smallest distance left, so ${u} is settled at ${d}.` });
      for (const [v, w, ei] of adj[u]) {
        if (d + w < dist[v]) {
          const old = dist[v];
          dist[v] = d + w; prev[v] = u; prevE[v] = ei; heap.push([dist[v], v]);
          snap({ line: [7, 8, 9, 10], u, v, edge: ei, improved: true, msg: `Relax ${u}→${v}: ${d} + ${w} = ${d + w} < ${fmt(old)}, so dist[${v}] = ${d + w} via ${u}; push it.` });
        } else {
          snap({ line: [6, 7], u, v, edge: ei, msg: settled.has(v)
            ? `Edge ${u}–${v}: ${v} is already settled (${dist[v]}); ${d} + ${w} can't beat it.`
            : `Edge ${u}→${v}: ${d} + ${w} = ${d + w} is not better than ${fmt(dist[v])}; keep it.` });
        }
      }
    }
    const path = [];
    if (dist[dst] < INF) for (let x = dst; x !== -1; x = prev[x]) path.unshift(x);
    const answer = dist[dst] === INF ? -1 : dist[dst];
    snap({ line: [11, 12], done: true, path, answer, msg: answer === -1
      ? `Done: target ${dst} is never reached from ${src} — no path (return -1 / ∞).`
      : `Done: shortest ${src}→${dst} costs ${answer} via ${path.join(" → ")}. Each pop/push is O(log E) → O(E log V).` });
    return s;
  },
  render(st, { edges, src, dst, n }) {
    const { pos, height } = placement(n, edges);
    const onPath = new Set(st.done ? st.path : []);
    const pathEdge = new Set(st.done ? st.path.slice(1).map((v) => st.prevE[v]) : []);
    const treeEdge = new Set(st.prevE.filter((e) => e >= 0));
    const inHeap = new Set(st.heap.map((h) => h[1]));
    const nodes = pos.map((p) => {
      const v = p.id;
      let states;
      if (st.done) states = onPath.has(v) ? ["path"] : st.settled.has(v) ? ["visited"] : ["dim"];
      else if (v === st.u) states = [st.stale ? "visited" : "active"];
      else if (v === st.v) states = [st.improved ? "frontier" : "visited", "active"];
      else if (st.settled.has(v)) states = ["visited"];
      else if (inHeap.has(v)) states = ["frontier"];
      else states = [];
      return { id: v, x: p.x, y: p.y, label: String(v), states };
    });
    const gEdges = edges.map(([a, b, w], i) => {
      let states = [];
      if (st.done) states = pathEdge.has(i) ? ["path"] : treeEdge.has(i) ? [] : ["dim"];
      else if (i === st.edge) states = [st.improved ? "good" : "active"];
      else if (treeEdge.has(i)) states = ["visited"];
      return { a, b, label: w, states };
    });
    return `<div class="vz-shortest-path-g">` + graphView(nodes, gEdges, { height, r: 6, label: `graph — source ${src}, target ${dst}` }) + `</div>` +
      arrayView(st.dist.map(fmt), {
        label: "dist[v]",
        states: (v) => [st.settled.has(v) ? "visited" : "", v === st.v && st.improved ? "good" : "", v === st.u && !st.done ? "active" : "", st.done && onPath.has(v) ? "path" : ""],
        sub: (v) => (st.prev[v] >= 0 ? `←${st.prev[v]}` : ""),
        pointers: (v) => [v === src ? "src" : "", v === dst ? "dst" : ""].filter(Boolean),
      }) +
      `<div class="vz-row">` +
      chips("min-heap (d, v)", [...st.heap].sort((p, q) => p[0] - q[0] || p[1] - q[1]).map(([d, v], i) => ({
        text: `(${d}, ${v})`, states: [i === 0 ? "frontier" : "", d > st.dist[v] ? "dim" : ""],
      }))) +
      stats([["settled", `${st.settled.size}/${n}`], ["dist to " + dst, fmt(st.dist[dst]), st.done ? [st.answer === -1 ? "bad" : "good"] : []]]) +
      `</div>`;
  },
  css: `
.vz-shortest-path-g { width: 100%; display: flex; flex-direction: column; align-items: center; }
.vz-shortest-path-g .vz-graph-wrap { max-width: 440px; }
.vz-shortest-path-g .vz-node text { font-size: 4.7px; }
.vz-shortest-path-g .vz-node .vz-badge { font-size: 3.8px; }
.vz-shortest-path-g .vz-elabel { font-size: 4.3px; stroke-width: 1.5px; }
`,
  legend: [["active", "current"], ["frontier", "in the heap"], ["visited", "settled / tree edge"], ["good", "improved"], ["path", "shortest path"]],
};
