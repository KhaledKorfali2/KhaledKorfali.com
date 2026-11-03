// Shared building blocks for visualisers: escaping, input parsers and
// HTML/SVG views for arrays, grids, chip lists, graphs and trees.
// Every view returns an HTML string; a visualiser's render() assembles them
// and assigns the result to stage.innerHTML.

export function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const cls = (states) => (states || []).filter(Boolean).map((s) => "is-" + s).join(" ");

/* ── Parsers: take the raw string from an input, return a value or throw ── */

export class InputError extends Error {}

export function parseNumbers(str, { min = -999, max = 999, minLen = 1, maxLen = 12, label = "Array" } = {}) {
  const parts = String(str).split(/[\s,]+/).filter(Boolean);
  const nums = parts.map((p) => {
    if (!/^-?\d+$/.test(p)) throw new InputError(`${label}: "${p}" isn't a whole number.`);
    return parseInt(p, 10);
  });
  if (nums.length < minLen) throw new InputError(`${label} needs at least ${minLen} number${minLen === 1 ? "" : "s"}.`);
  if (nums.length > maxLen) throw new InputError(`${label} can have at most ${maxLen} numbers.`);
  const bad = nums.find((n) => n < min || n > max);
  if (bad !== undefined) throw new InputError(`${label} values must be between ${min} and ${max}.`);
  return nums;
}

export function parseNumber(str, { min = -999, max = 999, label = "Value" } = {}) {
  const s = String(str).trim();
  if (!/^-?\d+$/.test(s)) throw new InputError(`${label} must be a whole number.`);
  const n = parseInt(s, 10);
  if (n < min || n > max) throw new InputError(`${label} must be between ${min} and ${max}.`);
  return n;
}

export function parseGrid(str, { allowed = "01", maxRows = 8, maxCols = 10, fill = "0", label = "Grid" } = {}) {
  const rows = String(str).replace(/\r/g, "").split("\n").map((r) => r.replace(/[\s,]/g, "")).filter(Boolean);
  if (!rows.length) throw new InputError(`${label} is empty.`);
  if (rows.length > maxRows) throw new InputError(`${label} can have at most ${maxRows} rows.`);
  const bad = rows.join("").split("").find((ch) => !allowed.includes(ch));
  if (bad !== undefined) throw new InputError(`${label} may only contain ${allowed.split("").join(", ")}.`);
  const width = Math.max(...rows.map((r) => r.length));
  if (width > maxCols) throw new InputError(`${label} can have at most ${maxCols} columns.`);
  return rows.map((r) => r.padEnd(width, fill).split(""));
}

// "0-1, 1-2" or "0 1, 1 2" or "0-1:4" (weighted) → [[a, b, w?], ...]
export function parsePairs(str, { maxLen = 16, weighted = false, label = "Edges", min = 0, max = 99 } = {}) {
  const items = String(str).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  if (items.length > maxLen) throw new InputError(`${label}: at most ${maxLen} entries.`);
  return items.map((it) => {
    const m = weighted
      ? it.match(/^(-?\d+)\s*[- >]+\s*(-?\d+)\s*[:=@ ]\s*(-?\d+)$/)
      : it.match(/^(-?\d+)\s*[- >]+\s*(-?\d+)$/);
    if (!m) throw new InputError(`${label}: couldn't read "${it}". Use ${weighted ? "a-b:w" : "a-b"}.`);
    const out = m.slice(1).map((x) => parseInt(x, 10));
    if (out.slice(0, 2).some((x) => x < min || x > max)) throw new InputError(`${label}: values must be between ${min} and ${max}.`);
    return out;
  });
}

export function parseWords(str, { maxLen = 8, maxWordLen = 10, pattern = /^[a-z]+$/, label = "Words" } = {}) {
  const words = String(str).toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!words.length) throw new InputError(`${label}: enter at least one.`);
  if (words.length > maxLen) throw new InputError(`${label}: at most ${maxLen}.`);
  for (const w of words) {
    if (!pattern.test(w)) throw new InputError(`${label}: "${w}" has unsupported characters.`);
    if (w.length > maxWordLen) throw new InputError(`${label}: "${w}" is longer than ${maxWordLen} characters.`);
  }
  return words;
}

/* ── Views ── */

// values: array of displayable values
// opts.states(i) → ["active","window",...]   opts.pointers(i) → ["L","R"]
// opts.sub(i) → small caption above the value   opts.index (default true)
export function arrayView(values, opts = {}) {
  const { states = () => [], pointers = () => [], sub = () => "", index = true, label = "", wide = false } = opts;
  if (!values.length) return `<div class="vz-empty">empty</div>`;
  const cells = values.map((v, i) => {
    const ptr = pointers(i) || [];
    const s = sub(i);
    return `<div class="vz-col">
      <div class="vz-cell ${wide ? "vz-cell-wide " : ""}${cls(states(i))}">
        ${s !== "" && s != null ? `<span class="vz-sub">${esc(s)}</span>` : ""}
        <span class="vz-val">${esc(v)}</span>
      </div>
      ${index ? `<div class="vz-idx">${i}</div>` : ""}
      <div class="vz-ptr">${ptr.map((p) => `<span>${esc(p)}</span>`).join("")}</div>
    </div>`;
  }).join("");
  return `${label ? `<div class="vz-label">${esc(label)}</div>` : ""}<div class="vz-array">${cells}</div>`;
}

// rows: 2-D array; cell(r, c) → { text, states }
export function gridView(rows, cell, { label = "", coords = true } = {}) {
  const nCols = rows[0] ? rows[0].length : 0;
  let html = `${label ? `<div class="vz-label">${esc(label)}</div>` : ""}<div class="vz-grid-scroll"><div class="vz-grid${coords ? " has-coords" : ""}" style="--cols:${nCols}">`;
  if (coords) {
    html += `<div class="vz-gcoord"></div>`;
    for (let c = 0; c < nCols; c++) html += `<div class="vz-gcoord">${c}</div>`;
  }
  rows.forEach((row, r) => {
    if (coords) html += `<div class="vz-gcoord">${r}</div>`;
    row.forEach((_, c) => {
      const { text = "", states = [] } = cell(r, c) || {};
      html += `<div class="vz-gcell ${cls(states)}">${esc(text)}</div>`;
    });
  });
  return html + `</div></div>`;
}
// A labelled row of chips, e.g. a stack, queue or hash map.
// items: [{ text, states }] or strings. opts.dir: "row" | "stack" (vertical, top first)
export function chips(label, items, { empty = "empty", note = "" } = {}) {
  const list = items.length
    ? items.map((it) => {
        const o = typeof it === "object" ? it : { text: it };
        return `<span class="vz-chip ${cls(o.states)}">${esc(o.text)}</span>`;
      }).join("")
    : `<span class="vz-chip is-empty">${esc(empty)}</span>`;
  return `<div class="vz-panel"><div class="vz-panel-head"><span class="vz-label">${esc(label)}</span>${note ? `<span class="vz-note">${esc(note)}</span>` : ""}</div><div class="vz-chips">${list}</div></div>`;
}

// Key figures, e.g. [["sum", 7], ["best", 3]]
export function stats(pairs) {
  return `<div class="vz-stats">${pairs.map(([k, v, s]) =>
    `<div class="vz-stat ${cls(s)}"><span class="vz-stat-k">${esc(k)}</span><span class="vz-stat-v">${esc(v)}</span></div>`).join("")}</div>`;
}

/* ── Graphs & trees (SVG) ──
   nodes: [{ id, x, y, label, states, badge }] with x/y in a 0..100 × 0..h box
   edges: [{ a, b, label, states, directed }] */
export function graphView(nodes, edges, { height = 60, r = 5.2, label = "" } = {}) {
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const marker = edges.some((e) => e.directed);
  let svg = `<svg class="vz-graph" viewBox="-2 -2 104 ${height + 4}" role="img" aria-label="${esc(label || "graph")}">`;
  if (marker) {
    svg += `<defs>${["", "active", "path", "good", "dim", "bad"].map((s) =>
      `<marker id="vzarr${s}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="vz-arrow ${s ? "is-" + s : ""}"/></marker>`).join("")}</defs>`;
  }
  for (const e of edges) {
    const a = pos.get(e.a), b = pos.get(e.b);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const x1 = a.x + ux * r, y1 = a.y + uy * r, x2 = b.x - ux * (r + (e.directed ? 0.8 : 0)), y2 = b.y - uy * (r + (e.directed ? 0.8 : 0));
    const st = (e.states || [])[0] || "";
    svg += `<line class="vz-edge ${cls(e.states)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${e.directed ? ` marker-end="url(#vzarr${st})"` : ""}/>`;
    if (e.label !== undefined && e.label !== "") {
      const mx = (a.x + b.x) / 2 - uy * 2.6, my = (a.y + b.y) / 2 + ux * 2.6;
      svg += `<text class="vz-elabel ${cls(e.states)}" x="${mx}" y="${my}">${esc(e.label)}</text>`;
    }
  }
  for (const n of nodes) {
    svg += `<g class="vz-node ${cls(n.states)}"><circle cx="${n.x}" cy="${n.y}" r="${r}"/><text x="${n.x}" y="${n.y}">${esc(n.label ?? n.id)}</text>`;
    if (n.badge !== undefined && n.badge !== "") svg += `<text class="vz-badge" x="${n.x}" y="${n.y - r - 2.2}">${esc(n.badge)}</text>`;
    svg += `</g>`;
  }
  return `${label ? `<div class="vz-label">${esc(label)}</div>` : ""}<div class="vz-graph-wrap">${svg}</svg></div>`;
}

// Lay out a binary/n-ary tree. root: { id, label, children: [...] } (null children allowed for gaps)
// Returns nodes/edges ready for graphView, plus the height to use.
export function layoutTree(root, { levelGap = 15, top = 7 } = {}) {
  const nodes = [], edges = [];
  if (!root) return { nodes, edges, height: 20 };
  let leaf = 0;
  const place = (n, depth) => {
    const kids = (n.children || []).filter(Boolean);
    let x;
    if (!kids.length) x = leaf++;
    else {
      const xs = kids.map((k) => place(k, depth + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    nodes.push({ ...n, _x: x, _d: depth });
    kids.forEach((k) => edges.push({ a: n.id, b: k.id, states: k.edgeStates }));
    return x;
  };
  place(root, 0);
  const maxX = Math.max(1, leaf - 1), maxD = Math.max(...nodes.map((n) => n._d));
  nodes.forEach((n) => { n.x = leaf === 1 ? 50 : 6 + (n._x / maxX) * 88; n.y = top + n._d * levelGap; });
  return { nodes, edges, height: top * 2 + maxD * levelGap };
}

// Place n nodes on a circle (for small graphs without coordinates).
export function circleLayout(ids, { cx = 50, cy = 30, rx = 40, ry = 24 } = {}) {
  return ids.map((id, i) => {
    const t = -Math.PI / 2 + (i / ids.length) * Math.PI * 2;
    return { id, x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) };
  });
}
