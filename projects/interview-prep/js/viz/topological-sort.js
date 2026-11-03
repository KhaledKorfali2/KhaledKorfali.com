import { graphView, circleLayout, arrayView, chips, stats, parseNumber, parsePairs, InputError } from "./kit.js";

// Layered left-to-right layout (layer = longest chain of prerequisites).
// Nodes stuck in a cycle get a final layer. Falls back to a circle if an
// edge would pass through a node.
function layout(n, edges) {
  const indeg = Array(n).fill(0), out = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) { out[a].push(b); indeg[b]++; }
  const layer = Array(n).fill(-1);
  const q = [];
  for (let v = 0; v < n; v++) if (!indeg[v]) { q.push(v); layer[v] = 0; }
  while (q.length) {
    const u = q.shift();
    for (const v of out[u]) { layer[v] = Math.max(layer[v], layer[u] + 1); if (--indeg[v] === 0) q.push(v); }
  }
  const stuck = [...Array(n).keys()].filter((v) => indeg[v] > 0);
  const maxL = Math.max(-1, ...[...Array(n).keys()].filter((v) => indeg[v] === 0).map((v) => layer[v]));
  stuck.forEach((v) => { layer[v] = maxL + 1; });
  const L = Math.max(...layer) + 1;
  const cols = Array.from({ length: L }, () => []);
  for (let v = 0; v < n; v++) cols[layer[v]].push(v);
  const tallest = Math.max(...cols.map((c) => c.length));
  const gapY = 16, height = Math.max(18, tallest * gapY + 2);
  const pos = [];
  cols.forEach((col, li) => col.forEach((v, j) => {
    pos[v] = { id: v, x: L === 1 ? 50 : 7 + (li / (L - 1)) * 86, y: height / 2 + (j - (col.length - 1) / 2) * gapY };
  }));
  // reject layouts where an edge passes close to a third node, or edges share a column
  const clash = edges.some(([a, b]) => {
    const A = pos[a], B = pos[b];
    if (A.x === B.x && Math.abs(A.y - B.y) > gapY + 1) return true;
    return pos.some((P) => {
      if (P.id === a || P.id === b) return false;
      const dx = B.x - A.x, dy = B.y - A.y, len2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / len2));
      return Math.hypot(A.x + t * dx - P.x, A.y + t * dy - P.y) < 7;
    });
  });
  if (L > 1 && !clash) return { pos, height };
  const ring = circleLayout([...Array(n).keys()], { cx: 50, cy: 31, rx: 40, ry: 26 });
  return { pos: ring, height: 62 };
}

// Course Schedule (II) with Kahn's algorithm.
export default {
  id: "topological-sort",
  title: "Course Schedule — an order to take every course (Kahn's algorithm)",
  blurb: "Repeatedly take a course with no remaining prerequisites; if some never free up, there's a cycle.",
  inputs: [
    { key: "n", label: "courses (0..n-1)", default: "6", numeric: true, hint: "2–8" },
    { key: "edges", label: "prerequisites a>b (take a before b)", default: "0>1, 0>2, 1>3, 2>3, 3>4, 2>5", wide: true, hint: "up to 12" },
  ],
  presets: [
    { label: "Example", values: { n: "6", edges: "0>1, 0>2, 1>3, 2>3, 3>4, 2>5" } },
    { label: "Two starts", values: { n: "7", edges: "0>2, 1>2, 1>3, 2>4, 3>4, 4>5, 3>6" } },
    { label: "Cycle", values: { n: "5", edges: "0>1, 1>2, 2>3, 3>1, 3>4" } },
  ],
  parse(v) {
    const n = parseNumber(v.n, { min: 2, max: 8, label: "courses" });
    const edges = parsePairs(v.edges, { maxLen: 12, min: 0, max: n - 1, label: "prerequisites" });
    const seen = new Set();
    for (const [a, b] of edges) {
      if (a === b) throw new InputError(`prerequisites: course ${a} can't require itself.`);
      if (seen.has(a + ">" + b)) throw new InputError(`prerequisites: ${a}>${b} is listed twice.`);
      seen.add(a + ">" + b);
    }
    return { n, edges };
  },
  code: [
    "indeg[v] = # prerequisites of v",
    "q = deque(v if indeg[v] == 0)",
    "order = []",
    "while q:",
    "    u = q.popleft()",
    "    order.append(u)",
    "    for v in after[u]:  # u → v",
    "        indeg[v] -= 1",
    "        if indeg[v] == 0:",
    "            q.append(v)",
    "if len(order) < n:",
    "    return []  # cycle",
    "return order",
  ],
  steps({ n, edges }) {
    const after = Array.from({ length: n }, () => []);
    const indeg = Array(n).fill(0);
    edges.forEach(([a, b], i) => { after[a].push([b, i]); indeg[b]++; });
    const queue = [], order = [];
    const used = new Set(); // edge indices already "removed"
    const s = [];
    const snap = (o) => s.push({ indeg: [...indeg], queue: [...queue], order: [...order], used: new Set(used), ...o });
    snap({ line: 0, msg: `Count how many prerequisites each course has (its in-degree).` });
    for (let v = 0; v < n; v++) if (!indeg[v]) queue.push(v);
    snap({ line: [1, 2], msg: queue.length
      ? `Courses ${queue.join(", ")} have no prerequisites — they can be taken first.`
      : `Every course has a prerequisite, so nothing can start: there must be a cycle.` });
    while (queue.length) {
      const u = queue.shift();
      order.push(u);
      snap({ line: [4, 5], u, msg: `Take course ${u} (position ${order.length} in the order).` });
      for (const [v, ei] of after[u]) {
        indeg[v]--; used.add(ei);
        const freed = indeg[v] === 0;
        if (freed) queue.push(v);
        snap({ line: freed ? [7, 8, 9] : 7, u, edge: ei, v, msg: freed
          ? `${u} → ${v}: ${v}'s last prerequisite is done (in-degree 0) → enqueue ${v}.`
          : `${u} → ${v}: one fewer prerequisite for ${v}; ${indeg[v]} still left.` });
      }
    }
    const ok = order.length === n;
    const answer = ok ? [...order] : null;
    const stuck = [...Array(n).keys()].filter((v) => !order.includes(v));
    snap({ line: ok ? 12 : [10, 11], done: true, answer, stuck, msg: ok
      ? `Done: a valid order is ${order.join(" → ")}. Each course and prerequisite is handled once → O(V + E).`
      : `Only ${order.length} of ${n} courses could be taken: ${stuck.join(", ")} never reach in-degree 0 because they sit on or behind a cycle → impossible.` });
    return s;
  },
  render(st, { n, edges }) {
    const { pos, height } = layout(n, edges);
    const done = new Set(st.order), inQ = new Set(st.queue), stuck = new Set(st.stuck || []);
    const nodes = pos.map((p) => {
      const v = p.id;
      let states = [];
      if (v === st.u) states = ["active"];
      else if (st.done && stuck.has(v)) states = ["bad"];
      else if (done.has(v)) states = [st.done ? "good" : "visited"];
      else if (inQ.has(v)) states = ["frontier"];
      if (v === st.v && !inQ.has(v)) states.push("active");
      return { id: v, x: p.x, y: p.y, label: String(v), states };
    });
    const gEdges = edges.map(([a, b], i) => ({
      a, b, directed: true,
      states: i === st.edge ? ["active"] : st.done && stuck.has(a) && stuck.has(b) ? ["bad"] : st.used.has(i) ? ["dim"] : [],
    }));
    return `<div class="vz-topological-sort-g">` + graphView(nodes, gEdges, { height, r: 6, label: "prerequisites (a → b: a first)" }) + `</div>` +
      arrayView(st.indeg, {
        label: "indeg[v] — prerequisites left",
        states: (v) => [v === st.u || (v === st.v && !inQ.has(v)) ? "active" : "", st.done && stuck.has(v) ? "bad" : done.has(v) ? "dim" : inQ.has(v) ? "frontier" : ""],
      }) +
      `<div class="vz-row">` +
      chips("queue (front →)", st.queue.map((v) => ({ text: String(v), states: ["frontier"] }))) +
      chips("order", st.order.map((v) => ({ text: String(v), states: [v === st.u ? "active" : st.done ? "good" : "visited"] })), { note: `${st.order.length}/${n}` }) +
      `</div>` + (st.done ? stats([["result", st.answer ? "valid order" : "cycle", [st.answer ? "good" : "bad"]]]) : "");
  },
  css: `
.vz-topological-sort-g { width: 100%; display: flex; flex-direction: column; align-items: center; }
.vz-topological-sort-g .vz-graph-wrap { max-width: 440px; }
.vz-topological-sort-g .vz-node text { font-size: 4.7px; }
.vz-topological-sort-g .vz-node .vz-badge { font-size: 3.8px; }
.vz-topological-sort-g .vz-elabel { font-size: 4.3px; stroke-width: 1.5px; }
.vz-topological-sort-g .vz-edge.is-active { stroke-width: .8; }
`,
  legend: [["active", "current"], ["frontier", "in the queue"], ["visited", "taken"], ["good", "valid order"], ["bad", "blocked by a cycle"], ["dim", "used edge"]],
};
