// 2D sketch editor (SVG). Draw closed shapes on a sketch plane with snap-to-grid,
// then set exact sizes in the properties panel. Every shape is fully defined by
// its numbers, which is this app's stand-in for dimensions and constraints.
import { outline, expand, depths, inPolygon, moved, round, PLANES } from "./geom.js";

const NS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}, ...kids) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
  n.append(...kids.filter(Boolean));
  return n;
};
const pathD = (pts) => (pts.length ? `M${pts.map((p) => `${round(p[0])} ${round(p[1])}`).join("L")}Z` : "");
export const TOOLS = { select: "Select", rect: "Rectangle", circle: "Circle", poly: "Polygon", slot: "Slot", path: "Profile" };

const label = (it) => {
  const f = (v) => String(round(v, 2));
  if (it.k === "rect") return `${f(it.w)} × ${f(it.h)}${it.r ? `  R${f(it.r)}` : ""}`;
  if (it.k === "circle") return `⌀${f(it.d)}`;
  if (it.k === "poly") return `${it.n}-gon ${f(it.d)} ${it.mode === "flats" ? "AF" : "AC"}`;
  if (it.k === "slot") return `${f(it.len)} × ${f(it.w)}`;
  return "";
};
const anchor = (it) => (it.k === "path" ? it.pts.reduce((a, p) => [a[0] + p[0] / it.pts.length, a[1] + p[1] / it.pts.length], [0, 0]) : [it.x, it.y]);

/**
 * createSketcher(host, { sketch, underlay, onChange, onSelect, onStatus })
 * sketch: the sketch feature being edited (its items array is mutated in place).
 * underlay(): { body: [x,y,…] 2D line pairs, target: [...] } drawn faintly for reference.
 */
export function createSketcher(host, { sketch, underlay, onChange, onSelect, onStatus }) {
  const P = PLANES[sketch.plane];
  const view = { cx: 0, cy: 0, s: 5 };
  let tool = "select", snap = 1, selected = -1, draft = null, drag = null, raf = 0;

  const gGrid = svg("g", { class: "sk-grid" }), gUnder = svg("g", { class: "sk-under" }), gItems = svg("g", { class: "sk-items" }), gDraft = svg("g", { class: "sk-draft" });
  const world = svg("g", {}, gGrid, gUnder, gItems, gDraft);
  const gLabels = svg("g", { class: "sk-labels" });
  const root = svg("svg", { class: "sk-svg", tabindex: "0", role: "application", "aria-label": `Sketch on the ${P.label} plane` }, world, gLabels);
  host.append(root);

  const size = () => [root.clientWidth || 600, root.clientHeight || 400];
  const toScreen = ([x, y]) => { const [w, h] = size(); return [w / 2 + (x - view.cx) * view.s, h / 2 - (y - view.cy) * view.s]; };
  const toModel = (e) => { const r = root.getBoundingClientRect(), [w, h] = size(); return [view.cx + (e.clientX - r.left - w / 2) / view.s, view.cy - (e.clientY - r.top - h / 2) / view.s]; };
  const sn = (v) => round(Math.round(v / snap) * snap, 4);
  const snapPt = (p) => [sn(p[0]), sn(p[1])];

  function drawGrid() {
    const [w, h] = size();
    const x0 = view.cx - w / 2 / view.s, x1 = view.cx + w / 2 / view.s, y0 = view.cy - h / 2 / view.s, y1 = view.cy + h / 2 / view.s;
    const step = view.s >= 14 ? 1 : view.s >= 3 ? 5 : view.s >= 1.2 ? 10 : 50, major = step === 1 ? 10 : step === 5 ? 10 : step === 10 ? 50 : 250;
    let minor = "", maj = "";
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) (Math.abs(x % major) < 1e-9 ? (maj += `M${x} ${y0}V${y1}`) : (minor += `M${x} ${y0}V${y1}`));
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) (Math.abs(y % major) < 1e-9 ? (maj += `M${x0} ${y}H${x1}`) : (minor += `M${x0} ${y}H${x1}`));
    gGrid.replaceChildren(svg("path", { d: minor, class: "sk-minor" }), svg("path", { d: maj, class: "sk-major" }),
      svg("path", { d: `M${x0} 0H${x1}`, class: "sk-axis-x" }), svg("path", { d: `M0 ${y0}V${y1}`, class: "sk-axis-y" }));
  }
  function drawUnder() {
    const u = underlay ? underlay() : {};
    const d = (L) => { let s = ""; for (let i = 0; i + 3 < (L || []).length; i += 4) s += `M${round(L[i])} ${round(L[i + 1])}L${round(L[i + 2])} ${round(L[i + 3])}`; return s; };
    gUnder.replaceChildren(svg("path", { d: d(u.target), class: "sk-under-target" }), svg("path", { d: d(u.body), class: "sk-under-body" }));
  }
  function render() {
    raf = 0;
    const [w, h] = size();
    world.setAttribute("transform", `matrix(${view.s} 0 0 ${-view.s} ${w / 2 - view.cx * view.s} ${h / 2 + view.cy * view.s})`);
    drawGrid();
    // every concrete outline, tagged with the item it came from
    const all = sketch.items.flatMap((it, i) => expand(it).map((c, k) => ({ i, k, pts: outline(c, 64) })));
    const depth = depths(all.map((a) => a.pts));
    gItems.replaceChildren(...all.map((a, n) => svg("path", { d: pathD(a.pts), class: `sk-item${depth[n] % 2 ? " is-hole" : ""}${a.i === selected ? " is-sel" : ""}${a.k ? " is-copy" : ""}` })));
    const labels = [];
    const text = (p, s, cls) => { const [x, y] = toScreen(p); labels.push(svg("text", { x, y, class: cls }, document.createTextNode(s))); };
    sketch.items.forEach((it, i) => { const s = label(it); if (s) text(anchor(it), s, `sk-dim${i === selected ? " is-sel" : ""}`); });
    const [ox, oy] = toScreen([0, 0]);
    labels.push(svg("text", { x: w - 10, y: Math.min(h - 8, Math.max(14, oy - 6)), class: "sk-axis-label", "text-anchor": "end" }, document.createTextNode(`+${P.axes[0]}`)));
    labels.push(svg("text", { x: Math.min(w - 24, Math.max(6, ox + 6)), y: 14, class: "sk-axis-label" }, document.createTextNode(`+${P.axes[1]}`)));
    // vertex handles for a selected profile
    const it = sketch.items[selected];
    if (it && it.k === "path" && tool === "select") it.pts.forEach((p, vi) => { const [x, y] = toScreen(p); labels.push(svg("circle", { cx: x, cy: y, r: 5, class: "sk-handle", "data-v": vi })); });
    gLabels.replaceChildren(...labels);
    // in-progress shape
    const kids = [];
    if (draft?.item) kids.push(svg("path", { d: pathD(outline(draft.item, 64)), class: "sk-item is-draft" }));
    if (draft?.pts) kids.push(svg("path", { d: `M${[...draft.pts, draft.cursor || draft.pts[draft.pts.length - 1]].map((p) => p.join(" ")).join("L")}`, class: "sk-item is-draft is-open" }));
    gDraft.replaceChildren(...kids);
  }
  const redraw = () => { if (!raf) raf = requestAnimationFrame(render); };
  const status = (s) => onStatus?.(s);

  function select(i) { selected = i; onSelect?.(i); redraw(); }
  function commit() { onChange?.(); redraw(); }
  function itemAt(p) {
    let best = -1, area = Infinity;
    sketch.items.forEach((it, i) => expand(it).forEach((c) => {
      const o = outline(c, 32);
      if (!inPolygon(p, o)) return;
      const a = Math.abs(o.reduce((s, q, n) => s + q[0] * o[(n + 1) % o.length][1] - o[(n + 1) % o.length][0] * q[1], 0));
      if (a < area) { area = a; best = i; }
    }));
    return best;
  }
  function fromDrag(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dist = Math.hypot(dx, dy);
    if (tool === "rect") return Math.abs(dx) > 0 && Math.abs(dy) > 0 ? { k: "rect", x: round((a[0] + b[0]) / 2, 4), y: round((a[1] + b[1]) / 2, 4), w: round(Math.abs(dx), 4), h: round(Math.abs(dy), 4), r: 0, rot: 0 } : null;
    if (tool === "circle") return dist > 0 ? { k: "circle", x: a[0], y: a[1], d: round(sn(dist) * 2 || snap * 2, 4) } : null;
    if (tool === "poly") return dist > 0 ? { k: "poly", x: a[0], y: a[1], n: 6, d: round(sn(dist) * 2 || snap * 2, 4), mode: "corners", rot: 0 } : null;
    if (tool === "slot") return dist > 0 ? { k: "slot", x: round((a[0] + b[0]) / 2, 4), y: round((a[1] + b[1]) / 2, 4), len: round(dist + 6, 4), w: 6, rot: round((Math.atan2(dy, dx) * 180) / Math.PI, 2) } : null;
    return null;
  }
  function finishPath() {
    const pts = draft?.pts || [];
    draft = null;
    if (pts.length >= 3) { sketch.items.push({ k: "path", pts, r: 0 }); setTool("select"); select(sketch.items.length - 1); commit(); status("Profile closed."); }
    else { status("A profile needs at least 3 points."); redraw(); }
  }

  root.addEventListener("contextmenu", (e) => e.preventDefault());
  root.addEventListener("pointerdown", (e) => {
    root.focus({ preventScroll: true });
    try { root.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    const m = toModel(e), p = snapPt(m);
    if (e.button !== 0) { drag = { kind: "pan", x: e.clientX, y: e.clientY }; return; }
    if (tool === "path") {
      if (!draft) draft = { pts: [p], cursor: p };
      else if (draft.pts.length >= 3 && Math.hypot(p[0] - draft.pts[0][0], p[1] - draft.pts[0][1]) * view.s < 10) return finishPath();
      else if (String(draft.pts[draft.pts.length - 1]) !== String(p)) draft.pts.push(p);
      status(`${draft.pts.length} point${draft.pts.length === 1 ? "" : "s"}. Click the first point (or press Enter) to close the profile; Esc cancels.`);
      return redraw();
    }
    if (tool !== "select") { drag = { kind: "create", a: p }; return; }
    const v = e.target.closest?.(".sk-handle");
    if (v) { drag = { kind: "vertex", v: Number(v.dataset.v) }; return; }
    const i = itemAt(m);
    if (i >= 0) { select(i); drag = { kind: "move", last: p, changed: false }; }
    else { select(-1); drag = { kind: "pan", x: e.clientX, y: e.clientY }; }
  });
  root.addEventListener("pointermove", (e) => {
    const m = toModel(e), p = snapPt(m);
    if (tool === "path" && draft) { draft.cursor = p; redraw(); }
    if (!drag) { status(`${P.axes[0]} ${p[0]}   ${P.axes[1]} ${p[1]}`); return; }
    if (drag.kind === "pan") { view.cx -= (e.clientX - drag.x) / view.s; view.cy += (e.clientY - drag.y) / view.s; drag.x = e.clientX; drag.y = e.clientY; }
    else if (drag.kind === "create") { draft = { item: fromDrag(drag.a, p) }; const it = draft.item; status(it ? label(it) || "" : ""); }
    else if (drag.kind === "move") {
      const dx = p[0] - drag.last[0], dy = p[1] - drag.last[1];
      if (dx || dy) { sketch.items[selected] = moved(sketch.items[selected], dx, dy); drag.last = p; drag.changed = true; onSelect?.(selected); }
    } else if (drag.kind === "vertex") { sketch.items[selected].pts[drag.v] = p; drag.changed = true; }
    redraw();
  });
  const up = () => {
    const d = drag; drag = null;
    if (!d) return;
    if (d.kind === "create") {
      const it = draft?.item; draft = null;
      if (it) { sketch.items.push(it); setTool("select"); select(sketch.items.length - 1); commit(); }
      else redraw();
    } else if ((d.kind === "move" || d.kind === "vertex") && d.changed) commit();
  };
  root.addEventListener("pointerup", up);
  root.addEventListener("pointercancel", up);
  root.addEventListener("dblclick", () => { if (tool === "path" && draft) finishPath(); });
  root.addEventListener("wheel", (e) => {
    e.preventDefault();
    const before = toModel(e);
    view.s = Math.max(0.4, Math.min(80, view.s * Math.exp(-e.deltaY * 0.0012)));
    const after = toModel(e);
    view.cx += before[0] - after[0]; view.cy += before[1] - after[1];
    redraw();
  }, { passive: false });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { draft = null; if (tool !== "select") setTool("select"); redraw(); }
    else if (e.key === "Enter" && tool === "path" && draft) finishPath();
    else if ((e.key === "Delete" || e.key === "Backspace") && selected >= 0) { sketch.items.splice(selected, 1); select(-1); commit(); }
    else if (e.key.startsWith("Arrow") && selected >= 0) {
      const d = { ArrowLeft: [-snap, 0], ArrowRight: [snap, 0], ArrowUp: [0, snap], ArrowDown: [0, -snap] }[e.key];
      sketch.items[selected] = moved(sketch.items[selected], ...d); onSelect?.(selected); commit();
    } else return;
    e.preventDefault();
  });

  function setTool(t) {
    tool = t; draft = null;
    root.dataset.tool = t;
    status({ select: "Click a shape to select it, drag to move it. Drag empty space to pan; scroll to zoom.", rect: "Drag from one corner to the opposite corner.", circle: "Drag from the centre outward.", poly: "Drag from the centre outward. Set the number of sides in the panel.", slot: "Drag from the centre of one end to the centre of the other.", path: "Click each corner in turn. Click the first point again to close the profile." }[t]);
    onSelect?.(selected, t);
    redraw();
  }
  function fit() {
    const pts = sketch.items.flatMap((it) => expand(it).flatMap((c) => outline(c, 16)));
    const u = underlay ? underlay() : {};
    for (const L of [u.body, u.target]) for (let i = 0; i + 1 < (L || []).length; i += 2) pts.push([L[i], L[i + 1]]);
    const [w, h] = size();
    if (!pts.length) { view.cx = 0; view.cy = 0; view.s = Math.min(w, h) / 120; return redraw(); }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs, 0), x1 = Math.max(...xs, 0), y0 = Math.min(...ys, 0), y1 = Math.max(...ys, 0);
    view.cx = (x0 + x1) / 2; view.cy = (y0 + y1) / 2;
    view.s = Math.max(0.4, Math.min(40, 0.75 * Math.min(w / Math.max(x1 - x0, 20), h / Math.max(y1 - y0, 20))));
    redraw();
  }
  const ro = new ResizeObserver(redraw);
  ro.observe(root);
  drawUnder();
  setTool("select");
  requestAnimationFrame(fit);

  return {
    setTool, fit, redraw, select,
    get tool() { return tool; },
    get selected() { return selected; },
    setSnap(v) { snap = v; },
    refreshUnderlay() { drawUnder(); redraw(); },
    /** For tests: client coordinates of a sketch point. */
    screen(p) { const r = root.getBoundingClientRect(), s = toScreen(p); return [r.left + s[0], r.top + s[1]]; },
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); root.remove(); },
  };
}
