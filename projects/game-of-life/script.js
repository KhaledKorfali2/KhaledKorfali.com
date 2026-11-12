// ================================================================
//  GAME OF LIFE — script.js
//
//  A calm take on Life-like cellular automata: soft palettes, cells
//  that fade in and out instead of blinking, and controls kept to a
//  small dock plus a settings drawer.
//
//  Rendering: every cell is copied from a small sprite atlas (one
//  sprite per fade level × age shade), and only cells whose sprite
//  changed are redrawn. Nothing is drawn while the board is still.
// ================================================================

const $ = (id) => document.getElementById(id);
const mq = (q) => window.matchMedia && window.matchMedia(q).matches;
const reducedMotion = mq("(prefers-reduced-motion: reduce)");
const coarsePointer = mq("(pointer: coarse)");

// ── Palettes ─────────────────────────────────────────────────
// bg: board colour · tile: empty cell · young → old: live cell shade
// as it ages · accent / ink: the UI's highlight colour and text on it.
const PALETTES = {
  ink:   { name: "Ink",   light: false, bg: "#111317", tile: "#171a1f", young: "#e4ddce", old: "#958e80", accent: "#d6c8a4", ink: "#1a1813" },
  sage:  { name: "Sage",  light: false, bg: "#0f1411", tile: "#151b17", young: "#c6ddcc", old: "#6f9079", accent: "#a3c9ab", ink: "#0f1a12" },
  dusk:  { name: "Dusk",  light: false, bg: "#121320", tile: "#181a28", young: "#d2d3f3", old: "#7b7fb3", accent: "#b3b6ef", ink: "#14152b" },
  paper: { name: "Paper", light: true,  bg: "#efece4", tile: "#e8e4db", young: "#2c313b", old: "#878b93", accent: "#384050", ink: "#f8f6f0" },
};

const SPEEDS = [2, 5, 10, 20, 60];          // generations per second; 60 = one per frame
const LEVELS = 12;                          // fade steps between empty and fully alive
const SHADES = 6;                           // age shades, young → old
const AGE_PER_SHADE = 6;                    // generations per shade step

// ── Saved preferences (palette, speed, edges) ────────────────
const PREFS_KEY = "gol.prefs.v1";
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
}
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ palette: paletteKey, speed: targetFps, edge: edgeMode })); } catch { /* private mode */ }
}
const prefs = loadPrefs();

let paletteKey = PALETTES[prefs.palette] ? prefs.palette : "ink";
let targetFps  = SPEEDS.includes(prefs.speed) ? prefs.speed : 10;
let edgeMode   = prefs.edge === "dead" ? "dead" : "wrap";

// ── Grid ─────────────────────────────────────────────────────
let CELL = 14;          // CSS px per cell
let CPX  = 14;          // device px per cell
let cols = 0, rows = 0;
let alive, scratch;     // Uint8Array 0/1, current and next generation
let age;                // Uint16Array: generations a cell has been alive
let level;              // Float32Array 0..1: how visible the cell is (fades)
let shade;              // Uint8Array: age shade a cell is drawn with
let shown;              // Int32Array: sprite last drawn per cell (-1 = none)

let generation = 0;
let population = 0;

const idx = (c, r) => c + r * cols;

// ── Canvas ───────────────────────────────────────────────────
const canvas = $("canvas");
const ctx    = canvas.getContext("2d", { alpha: false });
let atlas    = null;

let needsRender   = true;   // something changed what the board looks like
let transitioning = false;  // cells are mid-fade

function resizeCanvas() {
  CELL = window.innerWidth <= 640 ? 12 : 14;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  CPX = Math.max(1, Math.round(CELL * dpr));
  const scale = CPX / CELL;   // actual device px per CSS px after rounding

  const vw = window.innerWidth;
  const vh = Math.max(window.innerHeight, document.documentElement.clientHeight);
  cols = Math.ceil(vw / CELL);
  rows = Math.ceil(vh / CELL);

  canvas.width  = cols * CPX;
  canvas.height = rows * CPX;
  canvas.style.width  = (canvas.width  / scale) + "px";
  canvas.style.height = (canvas.height / scale) + "px";

  const n = cols * rows;
  alive   = new Uint8Array(n);
  scratch = new Uint8Array(n);
  age     = new Uint16Array(n);
  level   = new Float32Array(n);
  shade   = new Uint8Array(n);
  shown   = new Int32Array(n).fill(-1);

  buildAtlas();
}

// ── Colour helpers ───────────────────────────────────────────
function hexRgb(h) {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function mix(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}
function roundedRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y,     x + w, y + h, r);
  g.arcTo(x + w, y + h, x,     y + h, r);
  g.arcTo(x,     y + h, x,     y,     r);
  g.arcTo(x,     y,     x + w, y,     r);
  g.closePath();
}

// One sprite per (fade level, age shade). Column 0 is the empty tile.
function buildAtlas() {
  const p = PALETTES[paletteKey];
  atlas = document.createElement("canvas");
  atlas.width  = CPX * LEVELS;
  atlas.height = CPX * SHADES;
  const g = atlas.getContext("2d");
  const inset  = Math.max(1, Math.round(CPX * 0.08));
  const size   = CPX - inset * 2;
  const radius = size * 0.24;

  for (let s = 0; s < SHADES; s++) {
    const live = mix(p.young, p.old, s / (SHADES - 1));
    for (let l = 0; l < LEVELS; l++) {
      const x = l * CPX, y = s * CPX;
      g.fillStyle = p.bg;
      g.fillRect(x, y, CPX, CPX);
      const t = l / (LEVELS - 1);
      const eased = t * t * (3 - 2 * t);
      // mix() wants hex input, so blend tile → live colour by drawing twice.
      g.fillStyle = p.tile;
      roundedRect(g, x + inset, y + inset, size, size, radius);
      g.fill();
      if (l > 0) {
        g.globalAlpha = eased;
        g.fillStyle = live;
        g.fill();
        g.globalAlpha = 1;
      }
    }
  }
  shown && shown.fill(-1);
  needsRender = true;
}

// ── Rules ────────────────────────────────────────────────────
// born[n] / survive[n]: true when a dead / live cell with n live
// neighbours is alive next generation. Mutated in place, never replaced.
const born    = new Array(9).fill(false);
const survive = new Array(9).fill(false);

function applyRuleString(str) {
  born.fill(false);
  survive.fill(false);
  const m = str.match(/B([0-9]*)\/?S([0-9]*)/i);
  if (!m) return;
  for (const ch of m[1]) born[+ch]    = true;
  for (const ch of m[2]) survive[+ch] = true;
  updateBitUI();
  updateRuleDisplay();
}

function ruleString() {
  const b = [...Array(9).keys()].filter(n => born[n]).join("");
  const s = [...Array(9).keys()].filter(n => survive[n]).join("");
  return `B${b}/S${s}`;
}

function updateRuleDisplay() {
  const str = ruleString();
  $("ruleDisplay").textContent = str;
  document.querySelectorAll("#rulePresets .preset").forEach(b => {
    const on = b.dataset.rule === str;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
}

// ── Simulation ───────────────────────────────────────────────
function step() {
  population = 0;
  const wrap = edgeMode === "wrap";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        let nr = r + dr;
        if (nr < 0 || nr >= rows) { if (!wrap) continue; nr = (nr + rows) % rows; }
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          let nc = c + dc;
          if (nc < 0 || nc >= cols) { if (!wrap) continue; nc = (nc + cols) % cols; }
          n += alive[nc + nr * cols];
        }
      }
      const i = c + r * cols;
      const next = alive[i] ? (survive[n] ? 1 : 0) : (born[n] ? 1 : 0);
      scratch[i] = next;
      if (next) { age[i] = alive[i] ? Math.min(age[i] + 1, 60000) : 0; population++; }
      else age[i] = 0;
    }
  }
  const t = alive; alive = scratch; scratch = t;
  generation++;
  needsRender = true;
}

// ── Render ───────────────────────────────────────────────────
// Fades scale with speed so a generation finishes fading before the
// next one starts; deaths linger a little longer as a soft trail.
const stepMs    = () => 1000 / Math.min(targetFps, 60);
const fadeInMs  = () => Math.min(160, stepMs() * 0.8);
const fadeOutMs = () => Math.min(420, stepMs() * 1.7);

function render(dt) {
  const inStep  = dt / fadeInMs();
  const outStep = dt / fadeOutMs();
  let moving = false;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = c + r * cols;
      let L = level[i];
      if (alive[i]) {
        shade[i] = Math.min(SHADES - 1, (age[i] / AGE_PER_SHADE) | 0);
        if (L < 1) { L = Math.min(1, L + inStep); level[i] = L; if (L < 1) moving = true; }
      } else if (L > 0) {
        L = Math.max(0, L - outStep); level[i] = L; if (L > 0) moving = true;
      }
      const q   = Math.round(L * (LEVELS - 1));
      const s   = q === 0 ? 0 : shade[i];
      const key = q * SHADES + s;
      if (shown[i] === key) continue;
      shown[i] = key;
      ctx.drawImage(atlas, q * CPX, s * CPX, CPX, CPX, c * CPX, r * CPX, CPX, CPX);
    }
  }
  return moving;
}

// ── Game loop ────────────────────────────────────────────────
let running    = false;
let lastStepTs = 0;
let lastFrame  = 0;
let lastGen = -1, lastPop = -1;

function tick(ts) {
  requestAnimationFrame(tick);
  const dt = lastFrame ? Math.min(ts - lastFrame, 250) : 16;
  lastFrame = ts;

  if (running && (targetFps >= 60 || ts - lastStepTs >= 1000 / targetFps)) {
    step();
    lastStepTs = ts;
  }

  if (needsRender || transitioning) {
    needsRender   = false;
    transitioning = render(dt);
  }

  if (generation !== lastGen) { $("statGen").textContent = generation.toLocaleString(); lastGen = generation; }
  if (population !== lastPop) { $("statPop").textContent = population.toLocaleString(); lastPop = population; }
}

// ── Actions ──────────────────────────────────────────────────
function setPlaying(v) {
  running = v;
  if (v) lastStepTs = performance.now();
  $("playBtn").setAttribute("aria-pressed", String(v));
  $("playIcon").style.display  = v ? "none" : "";   // SVG elements ignore .hidden
  $("pauseIcon").style.display = v ? "" : "none";
  $("playLabel").textContent = v ? "Pause" : "Play";
  $("playBtn").setAttribute("aria-label", v ? "Pause" : "Play");
}

function wipe() {
  alive.fill(0);
  age.fill(0);
  generation = 0;
  population = 0;
  needsRender = true;
}

function doClear() {
  setPlaying(false);
  wipe();
}

// A soft-edged patch of random cells in the middle of the board, rather
// than a screen full of noise.
function doRandom() {
  wipe();
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
  const rx = Math.max(10, cols * 0.38), ry = Math.max(10, rows * 0.38);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dx = (c - cx) / rx, dy = (r - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= 1) continue;
      const falloff = 1 - d * d * (3 - 2 * d);
      if (Math.random() < 0.36 * falloff) { alive[idx(c, r)] = 1; population++; }
    }
  }
}

function setSpeed(fps) {
  targetFps = fps;
  document.querySelectorAll("#speedSeg button").forEach(b => {
    const on = +b.dataset.fps === fps;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  const label = fps >= 60 ? "Max" : `${fps}/s`;
  $("speedCycle").textContent = label;
  $("speedCycle").setAttribute("aria-label", fps >= 60 ? "Speed: maximum" : `Speed: ${fps} generations per second`);
  savePrefs();
}

function setEdge(mode) {
  edgeMode = mode;
  document.querySelectorAll("#edgeSeg button").forEach(b => {
    const on = b.dataset.edge === mode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  savePrefs();
}

function setPalette(key) {
  paletteKey = key;
  const p = PALETTES[key];
  const root = document.documentElement;
  root.style.setProperty("--bg", p.bg);
  root.style.setProperty("--accent", p.accent);
  root.style.setProperty("--accent-ink", p.ink);
  if (p.light) root.dataset.theme = "light"; else delete root.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", p.bg);
  document.querySelectorAll("#paletteSeg .swatch").forEach(b => {
    const on = b.dataset.palette === key;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  if (atlas) buildAtlas();
  savePrefs();
}

// ── Patterns ─────────────────────────────────────────────────
const PATTERNS = {
  glider: [[0,-1],[1,0],[-1,1],[0,1],[1,1]],
  pulsar: (() => {
    const cells = [];
    const arm = [[2,1],[3,1],[4,1],[1,2],[1,3],[1,4],[6,2],[6,3],[6,4],[2,6],[3,6],[4,6]];
    for (const [c, r] of arm) for (const sc of [1,-1]) for (const sr of [1,-1]) cells.push([c*sc, r*sr]);
    return cells;
  })(),
  gun: [
    [0,4],[1,4],[0,5],[1,5],
    [10,4],[10,5],[10,6],[11,3],[11,7],[12,2],[12,8],[13,2],[13,8],
    [14,5],[15,3],[15,7],[16,4],[16,5],[16,6],[17,5],
    [20,2],[20,3],[20,4],[21,2],[21,3],[21,4],[22,1],[22,5],
    [24,0],[24,1],[24,5],[24,6],
    [34,2],[34,3],[35,2],[35,3],
  ].map(([c, r]) => [c - 17, r - 4]),
  acorn:   [[1,0],[3,1],[0,2],[1,2],[4,2],[5,2],[6,2]].map(([c, r]) => [c - 3, r - 1]),
  rpent:   [[0,-1],[1,-1],[-1,0],[0,0],[0,1]],
  diehard: [[6,-1],[0,0],[1,0],[1,1],[5,1],[6,1],[7,1]].map(([c, r]) => [c - 4, r]),
};

function stampPattern(name) {
  const cells = PATTERNS[name];
  if (!cells) return;
  setPlaying(false);
  wipe();
  const mc = cols >> 1, mr = rows >> 1;
  for (const [dc, dr] of cells) {
    const c = mc + dc, r = mr + dr;
    if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
    if (!alive[idx(c, r)]) population++;
    alive[idx(c, r)] = 1;
  }
}

// ── Drawing on the board ─────────────────────────────────────
let drawing = false, drawValue = 1, lastCell = null;

function cellAt(e) {
  const rect = canvas.getBoundingClientRect();
  const pt = e.touches ? e.touches[0] : e;
  const c = Math.floor((pt.clientX - rect.left) * (canvas.width  / rect.width)  / CPX);
  const r = Math.floor((pt.clientY - rect.top)  * (canvas.height / rect.height) / CPX);
  return c >= 0 && c < cols && r >= 0 && r < rows ? { c, r } : null;
}

function paintLine(c0, r0, c1, r1) {
  const dc = Math.abs(c1 - c0), dr = Math.abs(r1 - r0);
  const sc = c0 < c1 ? 1 : -1, sr = r0 < r1 ? 1 : -1;
  let err = dc - dr, c = c0, r = r0;
  for (;;) {
    const i = idx(c, r);
    if (alive[i] !== drawValue) {
      population += drawValue ? 1 : -1;
      alive[i] = drawValue;
      age[i] = 0;
      if (drawValue) { level[i] = 1; shade[i] = 0; }   // drawn cells appear at once
    }
    if (c === c1 && r === r1) break;
    const e2 = 2 * err;
    if (e2 > -dr) { err -= dr; c += sc; }
    if (e2 <  dc) { err += dc; r += sr; }
  }
  needsRender = true;
}

function onDrawStart(e) {
  if (e.button !== undefined && e.button !== 0) return;
  const cell = cellAt(e);
  if (!cell) return;
  e.preventDefault();
  drawing   = true;
  drawValue = alive[idx(cell.c, cell.r)] ? 0 : 1;
  paintLine(cell.c, cell.r, cell.c, cell.r);
  lastCell = cell;
  hideHint();
}
function onDrawMove(e) {
  if (!drawing) return;
  e.preventDefault();
  const cell = cellAt(e);
  if (!cell) return;
  paintLine(lastCell ? lastCell.c : cell.c, lastCell ? lastCell.r : cell.r, cell.c, cell.r);
  lastCell = cell;
}
function onDrawEnd() { drawing = false; lastCell = null; }

canvas.addEventListener("mousedown",  onDrawStart);
canvas.addEventListener("mousemove",  onDrawMove);
window.addEventListener("mouseup",    onDrawEnd);
canvas.addEventListener("touchstart", onDrawStart, { passive: false });
canvas.addEventListener("touchmove",  onDrawMove,  { passive: false });
window.addEventListener("touchend",   onDrawEnd);
window.addEventListener("touchcancel",onDrawEnd);
window.addEventListener("blur",       onDrawEnd);

const hint = $("drawHint");
if (coarsePointer) hint.textContent = "Tap or drag to draw";
function hideHint() { hint.classList.add("hidden"); }
setTimeout(hideHint, 8000);

// ── Controls ─────────────────────────────────────────────────
$("playBtn").addEventListener("click", () => setPlaying(!running));
$("stepBtn").addEventListener("click", () => { setPlaying(false); step(); });
$("clearBtn").addEventListener("click", doClear);
$("randomBtn").addEventListener("click", doRandom);
$("speedCycle").addEventListener("click", () => setSpeed(SPEEDS[(SPEEDS.indexOf(targetFps) + 1) % SPEEDS.length]));
document.querySelectorAll("#speedSeg button").forEach(b => b.addEventListener("click", () => setSpeed(+b.dataset.fps)));
document.querySelectorAll("#edgeSeg button").forEach(b => b.addEventListener("click", () => setEdge(b.dataset.edge)));
document.querySelectorAll("#rulePresets .preset").forEach(b => b.addEventListener("click", () => applyRuleString(b.dataset.rule)));
document.querySelectorAll("#patternGrid .preset").forEach(b => b.addEventListener("click", () => {
  stampPattern(b.dataset.pattern);
  if (isNarrow()) closeDrawer(false);   // the sheet covers the board on phones
}));

// Born / survive toggles
function buildBitRow(id, arr, kind) {
  const row = $(id);
  for (let n = 0; n <= 8; n++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "bit-btn";
    b.textContent = n;
    b.setAttribute("aria-label", `${kind} with ${n} neighbour${n === 1 ? "" : "s"}`);
    b.addEventListener("click", () => { arr[n] = !arr[n]; updateBitUI(); updateRuleDisplay(); });
    row.appendChild(b);
  }
}
function updateBitUI() {
  for (const [id, arr] of [["bornBits", born], ["surviveBits", survive]]) {
    $(id).querySelectorAll(".bit-btn").forEach((b, n) => {
      b.classList.toggle("on", arr[n]);
      b.setAttribute("aria-pressed", String(arr[n]));
    });
  }
}
buildBitRow("bornBits", born, "Born");
buildBitRow("surviveBits", survive, "Survive");

// Palette swatches, each with a tiny preview of the board
(function buildSwatches() {
  const host = $("paletteSeg");
  const sample = [1,0,0,1, 0,1,1,0, 0,1,0,0];
  for (const [key, p] of Object.entries(PALETTES)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.dataset.palette = key;
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.setAttribute("aria-hidden", "true");
    chip.style.background = p.bg;
    sample.forEach((on, k) => {
      const i = document.createElement("i");
      i.style.background = on ? (k % 3 ? p.young : p.old) : p.tile;
      chip.appendChild(i);
    });
    b.append(chip, p.name);
    b.addEventListener("click", () => setPalette(key));
    host.appendChild(b);
  }
})();

// ── Settings drawer ──────────────────────────────────────────
const drawer = $("drawer"), backdrop = $("backdrop"), settingsBtn = $("settingsBtn");
let drawerOpen = false;
const isNarrow = () => window.innerWidth <= 900;   // drawer is a bottom sheet here

function openDrawer() {
  drawerOpen = true;
  drawer.inert = false;
  drawer.classList.add("open");
  document.body.classList.add("drawer-open");
  backdrop.classList.add("visible");
  settingsBtn.setAttribute("aria-expanded", "true");
  setTimeout(() => $("drawerClose").focus({ preventScroll: true }), 60);
}
function closeDrawer(returnFocus = true) {
  if (!drawerOpen) return;
  drawerOpen = false;
  drawer.classList.remove("open");
  document.body.classList.remove("drawer-open");
  backdrop.classList.remove("visible");
  settingsBtn.setAttribute("aria-expanded", "false");
  drawer.inert = true;
  if (returnFocus) settingsBtn.focus({ preventScroll: true });
}
settingsBtn.addEventListener("click", () => drawerOpen ? closeDrawer() : openDrawer());
$("drawerClose").addEventListener("click", () => closeDrawer());
backdrop.addEventListener("click", () => closeDrawer(false));

// ── Keyboard ─────────────────────────────────────────────────
document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  if (e.key === "Escape") { hideTip(); closeDrawer(); return; }
  const onButton = t && t.tagName === "BUTTON" && t.matches(":focus-visible");
  switch (e.key) {
    case " ":          if (onButton) return; e.preventDefault(); setPlaying(!running); break;
    case ".":
    case "ArrowRight": setPlaying(false); step(); break;
    case "c": case "C": doClear(); break;
    case "r": case "R": doRandom(); break;
  }
});

// ── Tooltips ─────────────────────────────────────────────────
const tooltip = $("tooltip");
let tipTimeout = null, tipHideTimeout = null;

function showTip(text, rect) {
  clearTimeout(tipTimeout);
  clearTimeout(tipHideTimeout);
  tooltip.textContent = text;
  tooltip.classList.remove("visible", "tip-below");
  tooltip.style.left = "-9999px";
  tooltip.style.top  = "-9999px";
  const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
  const MARGIN = 10, GAP = 9;
  let top = rect.top - th - GAP;
  const below = top < MARGIN;
  if (below) top = rect.bottom + GAP;
  let left = rect.left + rect.width / 2 - tw / 2;
  left = Math.max(MARGIN, Math.min(left, window.innerWidth - tw - MARGIN));
  const arrowX = Math.max(10, Math.min(rect.left + rect.width / 2 - left, tw - 10));
  tooltip.style.left = left + "px";
  tooltip.style.top  = top + "px";
  tooltip.style.setProperty("--arrow-x", arrowX + "px");
  tooltip.classList.toggle("tip-below", below);
  void tooltip.offsetWidth;
  tooltip.classList.add("visible");
}
function hideTip() {
  clearTimeout(tipTimeout);
  clearTimeout(tipHideTimeout);
  tooltip.classList.remove("visible");
}
const tipTarget = (el) => el && el.closest ? el.closest("[data-tip]") : null;

document.addEventListener("mouseover", e => {
  const target = tipTarget(e.target);
  if (!target) { hideTip(); return; }
  clearTimeout(tipTimeout);
  tipTimeout = setTimeout(() => showTip(target.dataset.tip, target.getBoundingClientRect()), 400);
});
document.addEventListener("mouseout", e => {
  const target = tipTarget(e.target);
  if (!target || target.contains(e.relatedTarget)) return;
  hideTip();
});
document.addEventListener("focusin", e => {
  const target = tipTarget(e.target);
  if (target && e.target.matches(":focus-visible")) showTip(target.dataset.tip, target.getBoundingClientRect());
});
document.addEventListener("focusout", hideTip);
// Icon-only dock buttons on touch screens: show the label briefly.
document.addEventListener("touchstart", e => {
  const target = tipTarget(e.target);
  if (!target || !target.classList.contains("dock-btn") || !isNarrow()) return;
  showTip(target.dataset.tip, target.getBoundingClientRect());
  tipHideTimeout = setTimeout(hideTip, 1600);
}, { passive: true });

// ── Resize ───────────────────────────────────────────────────
function handleResize() {
  const old = { alive, age, cols, rows };
  resizeCanvas();
  population = 0;
  const mc = Math.min(cols, old.cols), mr = Math.min(rows, old.rows);
  for (let r = 0; r < mr; r++) {
    for (let c = 0; c < mc; c++) {
      const oi = c + r * old.cols, i = idx(c, r);
      if (!old.alive[oi]) continue;
      alive[i] = 1;
      age[i]   = old.age[oi];
      level[i] = 1;
      population++;
    }
  }
}
let resizeTimer = 0;
const queueResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(handleResize, 120); };
window.addEventListener("resize", queueResize);
window.visualViewport?.addEventListener("resize", queueResize);

// ── Init ─────────────────────────────────────────────────────
resizeCanvas();
drawer.inert = true;
setPalette(paletteKey);
setSpeed(targetFps);
setEdge(edgeMode);
applyRuleString("B3/S23");
doRandom();
setPlaying(!reducedMotion);   // with reduced motion, wait for Play
requestAnimationFrame(tick);
