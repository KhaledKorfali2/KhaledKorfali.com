// The CAD workbench: toolbar, feature timeline, properties, 3D view, sketch
// editor, target drawing, and the goal tracker that awards the flag when the
// learner's solid matches the target.
import { el, icon, ICONS, toast } from "../ui.js";
import { loadPrefs, savePrefs } from "../layout.js";
import { createModeler, FEATURE_NAMES, DEFAULTS, newId } from "./model.js";
import { createViewport } from "./viewport.js";
import { createSketcher, TOOLS } from "./sketcher.js";
import { PLANES, outline, expand, toSketch, round, MAX_SIDES, MAX_COUNT, MAX_POLAR } from "./geom.js";

const MODELS_KEY = "datum.models";
const NS = "http://www.w3.org/2000/svg";
const PICKERS = ["fillet", "chamfer", "shell"];
const clone = (x) => JSON.parse(JSON.stringify(x));
const fmt = (v) => String(round(v, 2));

let modelerPromise = null;
/** Load the OpenCascade kernel once (a large one-time download, then cached by the browser). */
export function loadModeler() {
  if (!modelerPromise) {
    modelerPromise = (async () => {
      const [{ default: initOC }, R] = await Promise.all([import("../../vendor/replicad_single.js"), import("../../vendor/replicad.js")]);
      const oc = await initOC({ locateFile: (f) => new URL(`../../vendor/${f}`, import.meta.url).href });
      R.setOC(oc);
      return createModeler(R);
    })();
    modelerPromise.catch(() => { modelerPromise = null; });
  }
  return modelerPromise;
}

const targets = new Map();
function targetFor(M, c) {
  if (!targets.has(c.id)) {
    const r = M.rebuild(c.target);
    const bad = Object.values(r.errors)[0];
    if (bad || !r.body) throw new Error(`the target part failed to build (${bad || "no body"})`);
    targets.set(c.id, { body: r.body, meshes: M.meshes(r.body), measure: M.measure(r.body), views: M.views(r.body) });
  }
  return targets.get(c.id);
}

function summary(f) {
  if (f.t === "sketch") return `${PLANES[f.plane].label} plane${f.offset ? ` @ ${fmt(f.offset)}` : ""} · ${f.items.length} shape${f.items.length === 1 ? "" : "s"}`;
  if (f.t === "extrude") return `${fmt(f.dist)} mm${f.sym ? " symmetric" : f.flip ? " flipped" : ""} · ${f.mode}`;
  if (f.t === "revolve") return `${fmt(f.angle)}° · ${f.mode}`;
  if (f.t === "fillet") return `R${fmt(f.r)} · ${f.all ? "all edges" : `${f.picks.length} picked`}`;
  if (f.t === "chamfer") return `${fmt(f.d)} mm · ${f.all ? "all edges" : `${f.picks.length} picked`}`;
  if (f.t === "shell") return `${fmt(f.thickness)} mm wall · ${f.picks.length} opening${f.picks.length === 1 ? "" : "s"}`;
  if (f.t === "mirror") return `across ${PLANES[f.plane].label} plane`;
  return "";
}
const TOOL_ICONS = { sketch: ICONS.edit, extrude: ICONS.layers, revolve: ICONS.refresh, fillet: ICONS.wave, chamfer: ICONS.code, shell: ICONS.db, mirror: ICONS.link };

/** Third-angle drawing of the target with hidden lines and overall dimensions. */
function drawingSvg(t) {
  const s = (tag, attrs, ...kids) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); n.append(...kids); return n; };
  const { front, top, right } = t.views, gap = Math.max(...t.measure.size) * 0.22 + 6;
  const wh = (v) => (v.box ? [v.box[2] - v.box[0], v.box[3] - v.box[1]] : [0, 0]);
  const [fw, fh] = wh(front), [, th] = wh(top), [rw] = wh(right);
  const W = fw + gap + rw, H = th + gap + fh, fs = Math.max(W, H) / 30, m = fs * 4.5;
  const view = (v, x, y, name) => {
    if (!v.box) return "";
    const g = s("g", { transform: `translate(${x - v.box[0]} ${y - v.box[1]})` },
      ...v.hidden.map((d) => s("path", { d, class: "dw-hidden" })), ...v.visible.map((d) => s("path", { d, class: "dw-line" })));
    return [g, s("text", { x, y: y - fs * 0.6, class: "dw-name", "font-size": fs * 0.8 }, name)];
  };
  const dim = (x, y, text, rot) => s("text", { x, y, class: "dw-dim", "font-size": fs, "text-anchor": "middle", ...(rot ? { transform: `rotate(-90 ${x} ${y})` } : {}) }, text);
  const [sx, sy, sz] = t.measure.size.map(fmt);
  return s("svg", { class: "dw-svg", viewBox: `${-m} ${-m} ${W + 2 * m} ${H + 2 * m}`, role: "img", "aria-label": "Engineering drawing of the target part" },
    ...[view(top, 0, 0, "TOP"), view(front, 0, th + gap, "FRONT"), view(right, fw + gap, th + gap, "RIGHT")].flat(),
    dim(fw / 2, H + fs * 1.6, `${sx} (X)`), dim(-fs * 0.9, th + gap + fh / 2, `${sz} (Z)`, true), dim(-fs * 0.9, th / 2, `${sy} (Y)`, true));
}

/** mount(host, { challenge, ctx, fresh }, api) → cleanup */
export async function mount(host, { challenge: c, ctx, fresh }, api) {
  const M = await loadModeler();
  const target = targetFor(M, c);
  const tools = c.tools || ["sketch", "extrude"];
  const sketchTools = ["select", ...(c.sketchTools || ["rect", "circle", "poly", "slot", "path"])];

  // ── state ──
  const drafts = loadPrefs(MODELS_KEY, {});
  if (fresh) { delete drafts[c.id]; savePrefs(MODELS_KEY, drafts); }
  let features = clone(Array.isArray(drafts[c.id]) ? drafts[c.id] : c.starter || []);
  const nameAll = () => { const n = {}; for (const f of features) { n[f.t] = (n[f.t] || 0) + 1; if (!f.name) f.name = `${FEATURE_NAMES[f.t]} ${n[f.t]}`; } };
  nameAll();
  let sel = null, edit = null, itemSel = -1, tab = "model", ghost = true, won = false, result = { body: null, errors: {} }, shown = null;
  let lastJSON = JSON.stringify(features), lastKey = "", lastAt = 0;
  const undo = [], redo = [];
  let rebuildTimer = 0;
  const byId = (id) => features.find((f) => f.id === id);
  const sketches = () => features.filter((f) => f.t === "sketch");
  const save = () => { const d = loadPrefs(MODELS_KEY, {}); d[c.id] = features; savePrefs(MODELS_KEY, d); };

  // ── DOM ──
  const bar = el("div", { class: "wb-bar", role: "toolbar", "aria-label": "Modelling tools" });
  const timeline = el("ol", { class: "wb-timeline", "aria-label": "Feature timeline" });
  const props = el("div", { class: "wb-props" });
  const vpHost = el("div", { class: "wb-canvas" });
  const skHost = el("div", { class: "wb-sketch", hidden: true });
  const dwHost = el("div", { class: "wb-drawing", hidden: true });
  const hint = el("div", { class: "wb-hint" });
  const goal = el("div", { class: "wb-goal", "aria-live": "polite" });
  const readout = el("div", { class: "wb-readout mono" });
  const tabs = el("div", { class: "wb-tabs", role: "tablist" });
  const root = el("div", { class: "wb" }, bar,
    el("div", { class: "wb-main" },
      el("aside", { class: "wb-side" }, el("div", { class: "wb-h", text: "Timeline" }), timeline, props),
      el("div", { class: "wb-stage" }, tabs, el("div", { class: "wb-views" }, vpHost, skHost, dwHost, hint))),
    el("div", { class: "wb-status" }, goal, readout));
  host.append(root);
  const vp = createViewport(vpHost);
  vp.setGhost(target.meshes);
  dwHost.append(drawingSvg(target),
    el("p", { class: "wb-drawnote", text: `Target: ${target.measure.size.map(fmt).join(" × ")} mm overall (X × Y × Z), volume ${fmt(target.measure.volume / 1000)} cm³. Solid lines are visible edges, dashed lines are hidden ones. Sizes of holes and other details are given in the objective.` }));

  // ── change tracking ──
  /** Record an edit. Rapid edits to the same field collapse into one undo step. */
  function commit(key = "") {
    const now = Date.now();
    if (!(key && key === lastKey && now - lastAt < 900)) { undo.push(lastJSON); if (undo.length > 120) undo.shift(); redo.length = 0; }
    lastKey = key; lastAt = now;
    lastJSON = JSON.stringify(features);
    // Typing in a number field rebuilds after a short pause; everything else rebuilds at once.
    clearTimeout(rebuildTimer);
    if (key) rebuildTimer = setTimeout(refresh, 140); else refresh();
  }
  function restore(json) {
    features = JSON.parse(json); lastJSON = json; lastKey = "";
    if (sel && !byId(sel)) sel = null;
    if (edit) { if (byId(edit.id)) openSketch(edit.id); else closeSketch(); }
    refresh(); renderProps(); renderBar();
  }
  const doUndo = () => { if (undo.length) { redo.push(lastJSON); restore(undo.pop()); } };
  const doRedo = () => { if (redo.length) { undo.push(lastJSON); restore(redo.pop()); } };

  // ── rebuild + redraw ──
  function refresh() {
    try { result = M.rebuild(features); } catch (e) { result = { body: null, errors: { _: String(e.message || e) } }; }
    save();   // only once the rebuild has returned, so a model that hangs the kernel is never the saved one
    const f = byId(sel);
    const roll = f && PICKERS.includes(f.t) && !edit ? features.indexOf(f) : -1;
    shown = roll >= 0 ? M.rebuild(features, roll).body : result.body;
    vp.setBody(shown ? M.meshes(shown) : null);
    vp.setSketches(sketches().filter((s) => s.id === sel || !features.some((g) => g.sketch === s.id)).map((s) => ({
      plane: s.plane, offset: s.offset || 0, dim: s.id !== sel, outlines: s.items.flatMap((it) => expand(it).map((k) => outline(k, 48))) })));
    if (roll >= 0) {
      const missing = vp.setMarks(f.picks);
      vp.setPick(f.t === "shell" ? ["face"] : ["edge", "face"], onPick);
      hint.textContent = f.t === "shell" ? "Click the face to remove (the opening). Click it again to unpick." : "Click edges to pick them; click a face to take every edge around it. Click again to unpick.";
      if (missing) hint.textContent += ` ${missing} earlier pick${missing === 1 ? " no longer matches" : "s no longer match"} the body: clear and pick again.`;
    } else { vp.setMarks([]); vp.setPick(null); hint.textContent = edit ? "" : "Drag to orbit · right-drag or Shift-drag to pan · scroll to zoom"; }
    edit?.sketcher.refreshUnderlay();
    renderTimeline(); renderStatus();
    const box = props.querySelector(".wb-error");
    if (box) { const msg = result.errors[sel]; box.hidden = !msg; box.textContent = msg ? `This feature failed: ${msg}.` : ""; }
  }
  function renderStatus() {
    const errs = Object.keys(result.errors).length;
    const cmp = M.compare(result.body, target.body, c.tol);
    const ok = cmp.ok && !errs;
    goal.dataset.tone = ok ? "ok" : "";
    goal.replaceChildren(...[icon(ok ? ICONS.check : ICONS.flag, 14), el("span", { text: ok ? "Your part matches the target." : errs ? `${errs} feature${errs === 1 ? " has" : "s have"} an error (marked in the timeline). ${result.body ? cmp.msg : ""}` : cmp.msg }),
      !ok && result.body ? el("span", { class: "wb-score mono", title: "How much of the target your part matches, by volume", text: `${Math.floor((cmp.score || 0) * 100)}% match` }) : null].filter(Boolean));
    const m = M.measure(result.body);
    readout.textContent = m ? `Your part: ${m.size.map(fmt).join(" × ")} mm · ${fmt(m.volume / 1000)} cm³` : "No solid yet";
    if (ok && !won) { won = true; api.reveal(ctx.flag); }
  }
  function onPick(pk) {
    const f = byId(sel);
    if (!f) return;
    const same = f.picks.findIndex((q) => q.kind === pk.kind && vp.sameEntity(q, pk));
    if (same >= 0) f.picks.splice(same, 1); else f.picks.push(pk);
    if (f.all) f.all = false;
    commit(); renderProps();
  }

  // ── timeline ──
  function renderTimeline() {
    timeline.replaceChildren(...features.map((f) => el("li", { class: `wb-feat${f.id === sel ? " is-sel" : ""}${result.errors[f.id] ? " is-bad" : ""}` },
      el("button", { type: "button", class: "wb-feat-main", title: result.errors[f.id] || "Select to edit", on: { click: () => select(f.id), dblclick: () => { if (f.t === "sketch") openSketch(f.id); } } },
        icon(TOOL_ICONS[f.t] || ICONS.flag, 14), el("span", { class: "wb-feat-text" }, el("b", { text: f.name }), el("small", { text: result.errors[f.id] ? "error" : summary(f) }))),
      f.t === "sketch" ? el("button", { type: "button", class: "wb-mini", title: "Edit this sketch", "aria-label": `Edit ${f.name}`, on: { click: () => openSketch(f.id) } }, icon(ICONS.edit, 13)) : null,
      el("button", { type: "button", class: "wb-mini", title: "Delete", "aria-label": `Delete ${f.name}`, on: { click: () => remove(f.id) } }, icon(ICONS.x, 13)))));
    if (!features.length) timeline.append(el("li", { class: "wb-empty", text: tools.includes("sketch") ? "Empty. Start with a Sketch." : "Empty." }));
  }
  function select(id) { if (edit && edit.id !== id) closeSketch(); sel = id; itemSel = -1; refresh(); renderProps(); }
  function remove(id) {
    if (edit?.id === id) closeSketch();
    features = features.filter((f) => f.id !== id);
    if (sel === id) sel = null;
    commit(); renderProps();
  }
  function add(t) {
    if (edit) closeSketch();
    const f = { id: newId(t), ...DEFAULTS[t]() };
    if (t === "extrude" || t === "revolve") {
      const all = sketches();
      if (!all.length) return toast("Draw a sketch first: this feature needs a profile");
      f.sketch = (all.filter((s) => !features.some((g) => g.sketch === s.id)).pop() || all[all.length - 1]).id;
    } else if (t !== "sketch" && !result.body) return toast("There's no solid yet: sketch a profile and extrude it first");
    features.push(f); nameAll();
    sel = f.id;
    commit(); renderProps();
    if (t === "sketch") openSketch(f.id);
  }

  // ── sketch mode ──
  function underlay() {
    const s = byId(edit?.id);
    if (!s) return {};
    const flat = (L) => { const out = []; for (let i = 0; i + 2 < L.length; i += 3) out.push(...toSketch(s.plane, [L[i], L[i + 1], L[i + 2]])); return out; };
    return { body: flat(vp.bodyLines()), target: ghost ? flat(target.meshes.edges.lines) : [] };
  }
  function openSketch(id) {
    edit?.sketcher.dispose();
    const s = byId(id);
    sel = id; itemSel = -1; tab = "model";
    skHost.hidden = false; vpHost.hidden = true; dwHost.hidden = true;
    const sketcher = createSketcher(skHost, { sketch: s, underlay,
      onChange: () => commit(), onStatus: (t) => { hint.textContent = t || ""; },
      onSelect: (i, toolChanged) => { if (i !== itemSel) { itemSel = i; renderProps(); } else syncItemFields(); if (toolChanged) renderBar(); } });
    edit = { id, sketcher };
    refresh(); renderProps(); renderBar(); renderTabs();
  }
  function closeSketch() {
    if (!edit) return;
    edit.sketcher.dispose(); edit = null; itemSel = -1;
    skHost.hidden = true; vpHost.hidden = tab !== "model"; dwHost.hidden = tab !== "drawing";
    vp.resize();
    refresh(); renderProps(); renderBar(); renderTabs();
  }

  // ── properties ──
  const inputs = new Map();     // live number inputs for the selected sketch item, keyed by label
  function number(label, get, set, { step = 1, key = label, unit = "mm", min } = {}) {
    const input = el("input", { type: "number", class: "wb-input", step: String(step), value: String(round(get(), 4)), ...(min !== undefined ? { min: String(min) } : {}) });
    input.addEventListener("input", () => { const v = parseFloat(input.value); if (Number.isFinite(v)) { set(v); commit(`n:${sel}:${itemSel}:${key}`); edit?.sketcher.redraw(); } });
    inputs.set(key, { input, get });
    return el("label", { class: "wb-field" }, el("span", { text: label }), el("span", { class: "wb-inwrap" }, input, unit ? el("em", { text: unit }) : null));
  }
  function choice(label, value, options, set) {
    const s = el("select", { class: "wb-input" }, options.map(([v, text]) => el("option", { value: String(v), text, selected: String(v) === String(value) })));
    s.addEventListener("change", () => { set(s.value); commit(); renderProps(); edit?.sketcher.redraw(); });
    return el("label", { class: "wb-field" }, el("span", { text: label }), s);
  }
  function check(label, value, set) {
    const b = el("input", { type: "checkbox", checked: !!value });
    b.addEventListener("change", () => { set(b.checked); commit(); renderProps(); });
    return el("label", { class: "wb-check" }, b, el("span", { text: label }));
  }
  const note = (text) => el("p", { class: "wb-note", text });
  function syncItemFields() { for (const { input, get } of inputs.values()) if (document.activeElement !== input) input.value = String(round(get(), 4)); }

  function itemProps(s, it) {
    const [a, b] = PLANES[s.plane].axes, out = [];
    const centre = () => [number(`Centre ${a}`, () => it.x, (v) => { it.x = v; }, { key: "x" }), number(`Centre ${b}`, () => it.y, (v) => { it.y = v; }, { key: "y" })];
    const rotation = () => number("Rotation", () => it.rot || 0, (v) => { it.rot = v; }, { step: 5, key: "rot", unit: "°" });
    if (it.k === "rect") out.push(...centre(), number("Width", () => it.w, (v) => { it.w = v; }, { key: "w", min: 0 }), number("Height", () => it.h, (v) => { it.h = v; }, { key: "h", min: 0 }), number("Corner radius", () => it.r || 0, (v) => { it.r = v; }, { key: "r", min: 0 }), rotation());
    if (it.k === "circle") out.push(...centre(), number("Diameter", () => it.d, (v) => { it.d = v; }, { key: "d", min: 0 }));
    if (it.k === "poly") out.push(...centre(), number("Sides", () => it.n, (v) => { it.n = Math.min(MAX_SIDES, Math.max(3, Math.round(v))); }, { key: "n", unit: "", min: 3 }), number("Size", () => it.d, (v) => { it.d = v; }, { key: "d", min: 0 }),
      choice("Size measured", it.mode || "corners", [["corners", "across corners"], ["flats", "across flats"]], (v) => { it.mode = v; }), rotation());
    if (it.k === "slot") out.push(...centre(), number("Overall length", () => it.len, (v) => { it.len = v; }, { key: "len", min: 0 }), number("Width", () => it.w, (v) => { it.w = v; }, { key: "w", min: 0 }), rotation());
    if (it.k === "path") {
      out.push(number("Corner radius", () => it.r || 0, (v) => { it.r = v; }, { key: "r", min: 0 }), el("div", { class: "wb-h", text: `Points (${a}, ${b})` }));
      it.pts.forEach((p, i) => out.push(el("div", { class: "wb-point" }, el("span", { class: "mono", text: `P${i + 1}` }),
        number("", () => it.pts[i][0], (v) => { it.pts[i][0] = v; }, { key: `p${i}x`, unit: "" }), number("", () => it.pts[i][1], (v) => { it.pts[i][1] = v; }, { key: `p${i}y`, unit: "" }),
        it.pts.length > 3 ? el("button", { type: "button", class: "wb-mini", title: "Remove this point", "aria-label": `Remove point ${i + 1}`, on: { click: () => { it.pts.splice(i, 1); commit(); renderProps(); edit?.sketcher.redraw(); } } }, icon(ICONS.x, 12)) : null)));
    }
    const p = it.pattern || { type: "none" };
    out.push(el("div", { class: "wb-h", text: "Pattern" }), choice("Repeat", p.type, [["none", "none"], ["grid", "grid (rows and columns)"], ["polar", "circular (around a point)"]], (v) => {
      it.pattern = v === "grid" ? { type: "grid", nx: 2, ny: 1, dx: 20, dy: 20 } : v === "polar" ? { type: "polar", n: 4, cx: 0, cy: 0 } : undefined; }));
    if (p.type === "grid") out.push(number(`Count along ${a}`, () => p.nx, (v) => { p.nx = Math.min(MAX_COUNT, Math.max(1, Math.round(v))); }, { key: "nx", unit: "", min: 1 }), number(`Spacing along ${a}`, () => p.dx, (v) => { p.dx = v; }, { key: "dx" }),
      number(`Count along ${b}`, () => p.ny, (v) => { p.ny = Math.min(MAX_COUNT, Math.max(1, Math.round(v))); }, { key: "ny", unit: "", min: 1 }), number(`Spacing along ${b}`, () => p.dy, (v) => { p.dy = v; }, { key: "dy" }));
    if (p.type === "polar") out.push(number("Count", () => p.n, (v) => { p.n = Math.min(MAX_POLAR, Math.max(1, Math.round(v))); }, { key: "pn", unit: "", min: 1 }), number(`Centre ${a}`, () => p.cx || 0, (v) => { p.cx = v; }, { key: "pcx" }), number(`Centre ${b}`, () => p.cy || 0, (v) => { p.cy = v; }, { key: "pcy" }));
    out.push(el("button", { type: "button", class: "btn btn-sm wb-danger", text: "Delete shape", on: { click: () => { s.items.splice(itemSel, 1); edit.sketcher.select(-1); commit(); } } }));
    return out;
  }
  function renderProps() {
    inputs.clear();
    const f = byId(sel);
    if (!f) { props.replaceChildren(el("div", { class: "wb-h", text: "Properties" }), note(features.length ? "Select a feature in the timeline to edit it." : "Features you add appear in the timeline. Select one to edit its numbers here.")); return; }
    const sketchOpts = sketches().map((s) => [s.id, s.name]);
    const ops = [["join", "Join (add material)"], ["cut", "Cut (remove material)"], ["intersect", "Intersect (keep the overlap)"]];
    const body = [];
    if (f.t === "sketch") {
      const it = edit && itemSel >= 0 ? f.items[itemSel] : null;
      if (it) body.push(el("div", { class: "wb-h", text: { rect: "Rectangle", circle: "Circle", poly: "Polygon", slot: "Slot", path: "Profile" }[it.k] }), ...itemProps(f, it));
      else {
        body.push(el("div", { class: "wb-h", text: f.name }),
          choice("Plane", f.plane, Object.entries(PLANES).map(([k, p]) => [k, `${p.label} (${k})`]), (v) => { f.plane = v; if (edit) queueMicrotask(() => openSketch(f.id)); }),
          number(`Offset along ${PLANES[f.plane].normal}`, () => f.offset || 0, (v) => { f.offset = v; }, { key: "off" }),
          edit ? note("Pick a drawing tool above and draw. Select a shape to type its exact size and position. Shapes drawn inside other shapes become holes.") : el("button", { type: "button", class: "btn btn-sm", text: "Edit sketch", on: { click: () => openSketch(f.id) } }));
      }
    } else {
      body.push(el("div", { class: "wb-h", text: f.name }), el("p", { class: "wb-error", hidden: true }));
      if (f.t === "extrude") {
        const s = byId(f.sketch), n = s ? PLANES[s.plane].normal : "";
        body.push(choice("Profile", f.sketch || "", sketchOpts, (v) => { f.sketch = v; }), number("Distance", () => f.dist, (v) => { f.dist = v; }, { key: "dist" }),
          check(`Flip direction (default is +${n})`, f.flip, (v) => { f.flip = v; }), check("Symmetric (both sides of the plane)", f.sym, (v) => { f.sym = v; }), choice("Operation", f.mode, ops, (v) => { f.mode = v; }));
      } else if (f.t === "revolve") {
        const s = byId(f.sketch), ax = s ? PLANES[s.plane].axes : ["x", "y"];
        body.push(choice("Profile", f.sketch || "", sketchOpts, (v) => { f.sketch = v; }),
          choice("Axis", f.axis, [["y", `the sketch's ${ax[1]} axis`], ["x", `the sketch's ${ax[0]} axis`]], (v) => { f.axis = v; }),
          number("Angle", () => f.angle, (v) => { f.angle = v; }, { step: 15, key: "angle", unit: "°" }), choice("Operation", f.mode, ops, (v) => { f.mode = v; }));
      } else if (f.t === "fillet" || f.t === "chamfer") {
        body.push(f.t === "fillet" ? number("Radius", () => f.r, (v) => { f.r = v; }, { step: 0.5, key: "r", min: 0 }) : number("Distance", () => f.d, (v) => { f.d = v; }, { step: 0.5, key: "d", min: 0 }),
          check("All edges of the body", f.all, (v) => { f.all = v; }),
          note(f.all ? "Every edge will be treated." : `${f.picks.length} picked. Click edges in the view, or a face to take all the edges around it.`),
          f.picks.length ? el("button", { type: "button", class: "btn btn-sm", text: "Clear picks", on: { click: () => { f.picks = []; commit(); renderProps(); } } }) : null);
      } else if (f.t === "shell") {
        body.push(number("Wall thickness", () => f.thickness, (v) => { f.thickness = v; }, { step: 0.5, key: "th", min: 0 }),
          note(`${f.picks.length} opening${f.picks.length === 1 ? "" : "s"} picked. Click the face to remove in the view.`),
          f.picks.length ? el("button", { type: "button", class: "btn btn-sm", text: "Clear picks", on: { click: () => { f.picks = []; commit(); renderProps(); } } }) : null);
      } else if (f.t === "mirror") {
        body.push(choice("Mirror across", f.plane, Object.entries(PLANES).map(([k, p]) => [k, `${p.label} plane (${k})`]), (v) => { f.plane = v; }), note("The body is copied to the other side of the plane and joined to itself."));
      }
      body.push(el("button", { type: "button", class: "btn btn-sm", text: "Done", on: { click: () => select(null) } }));
    }
    props.replaceChildren(...body.filter(Boolean));
    const box = props.querySelector(".wb-error"), msg = result.errors[sel];
    if (box && msg) { box.hidden = false; box.textContent = `This feature failed: ${msg}.`; }
  }

  // ── toolbar and tabs ──
  const tool = (label, title, on, opts = {}) => el("button", { type: "button", class: `wb-tool${opts.primary ? " is-primary" : ""}`, title, "aria-pressed": opts.pressed === undefined ? null : String(opts.pressed), dataset: opts.key ? { tool: opts.key } : {}, on: { click: on } }, opts.icon ? icon(opts.icon, 15) : null, label);
  function download(blob, name) {
    const a = el("a", { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function exportAs(kind) {
    if (!result.body) return toast("Nothing to export yet");
    try { download(kind === "stl" ? M.exportSTL(result.body) : M.exportSTEP(result.body), `${c.id}.${kind === "stl" ? "stl" : "step"}`); toast(`Exported ${kind.toUpperCase()}`); }
    catch (e) { console.error(e); toast("Export failed"); }
  }
  function renderBar() {
    if (edit) {
      const s = edit.sketcher;
      const snap = el("select", { class: "wb-input wb-snap", title: "Snap spacing", "aria-label": "Snap spacing" }, [[0.5, "snap 0.5"], [1, "snap 1"], [5, "snap 5"], [10, "snap 10"]].map(([v, t]) => el("option", { value: String(v), text: t, selected: v === (edit.snap || 1) })));
      snap.addEventListener("change", () => { edit.snap = Number(snap.value); s.setSnap(edit.snap); });
      bar.replaceChildren(el("span", { class: "wb-mode", text: `Sketch · ${PLANES[byId(edit.id).plane].label} plane` }),
        ...sketchTools.map((t) => tool(TOOLS[t], TOOLS[t], () => { s.setTool(t); renderBar(); }, { pressed: s.tool === t, key: t })),
        el("span", { class: "wb-gap" }), snap, tool("Fit", "Zoom to fit", () => s.fit()),
        tool("Undo", "Undo (Ctrl+Z)", doUndo), tool("Redo", "Redo (Ctrl+Y)", doRedo),
        tool("Finish sketch", "Leave the sketch and return to the 3D view", closeSketch, { primary: true, key: "finish" }));
      return;
    }
    const labels = { sketch: ["Sketch", "Start a new 2D sketch on a plane"], extrude: ["Extrude", "Pull a sketch profile into a solid, or cut with it"], revolve: ["Revolve", "Spin a sketch profile around an axis"], fillet: ["Fillet", "Round edges"], chamfer: ["Chamfer", "Bevel edges"], shell: ["Shell", "Hollow the body, leaving a wall"], mirror: ["Mirror", "Mirror the body across a plane"] };
    bar.replaceChildren(...tools.map((t) => tool(labels[t][0], labels[t][1], () => add(t), { icon: TOOL_ICONS[t], key: t })),
      el("span", { class: "wb-gap" }),
      tool("Undo", "Undo (Ctrl+Z)", doUndo), tool("Redo", "Redo (Ctrl+Y)", doRedo),
      el("span", { class: "wb-sep" }),
      ...["iso", "front", "top", "right"].map((v) => tool(v[0].toUpperCase() + v.slice(1), `${v[0].toUpperCase() + v.slice(1)} view`, () => { vp.setView(v); })),
      tool("Fit", "Zoom to fit", () => vp.fit()),
      tool("Target", "Show or hide the target ghost", () => { ghost = !ghost; vp.setGhost(ghost ? target.meshes : null); renderBar(); }, { pressed: ghost }),
      el("span", { class: "wb-sep" }),
      tool("STL", "Export your part as STL, the format slicers use for 3D printing", () => exportAs("stl")), tool("STEP", "Export your part as STEP, the exchange format between CAD programs", () => exportAs("step")));
  }
  function renderTabs() {
    tabs.replaceChildren(...[["model", edit ? "Sketch" : "Model"], ["drawing", "Target drawing"]].map(([k, text]) => el("button", { type: "button", role: "tab", "aria-selected": String(tab === k), text, on: { click: () => {
      if (edit && k === "drawing") closeSketch();
      tab = k; vpHost.hidden = !!edit || k !== "model"; skHost.hidden = !edit; dwHost.hidden = k !== "drawing"; hint.hidden = k !== "model";
      if (k === "model") vp.resize();
      renderTabs();
    } } })));
  }

  const onKey = (e) => {
    if (!(e.ctrlKey || e.metaKey) || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || !root.isConnected) return;
    if (e.key === "z" && !e.shiftKey) { e.preventDefault(); doUndo(); }
    else if (e.key === "y" || (e.key === "z" && e.shiftKey)) { e.preventDefault(); doRedo(); }
  };
  document.addEventListener("keydown", onKey);

  renderBar(); renderTabs(); renderProps(); refresh();
  requestAnimationFrame(() => { vp.resize(); vp.fit(); });

  // hooks for automated tests
  root._wb = {
    M, vp, target,
    get features() { return features; },
    get result() { return result; },
    get sketcher() { return edit?.sketcher; },
    load(list) { if (edit) closeSketch(); features = clone(list); nameAll(); sel = null; commit(); renderProps(); },
    add, select, openSketch, closeSketch,
  };
  return () => { clearTimeout(rebuildTimer); document.removeEventListener("keydown", onKey); edit?.sketcher.dispose(); vp.dispose(); root.remove(); };
}
