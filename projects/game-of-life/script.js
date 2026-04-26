// ================================================================
//  GAME OF LIFE — script.js
//
//  Bug fixes in this version:
//  1. Canvas height correctly accounts for mobile bar height so
//     the grid never renders under the bar.
//  2. born/survive closure bug fixed — buildBitRow now reads the
//     live arrays by reference via getter functions, not captures.
//  3. population count is incremental (not a full reduce per draw).
//  4. Tooltip mouseout uses relatedTarget so moving between child
//     elements doesn't flicker the tip.
//  5. Touch events on the sheet/bar are fully isolated from the
//     canvas draw handler — no more accidental cell painting when
//     tapping UI elements.
//  6. applyRuleString called AFTER buildBitRow so updateBitUI()
//     has buttons to update.
//  7. Stats DOM writes are guarded — only write when values change.
//  8. Consistent z-index stacking matches CSS definitions.
// ================================================================

// ── Constants ────────────────────────────────────────────────
const CELL   = 10;
const BAR_H  = 68; // mobile bottom-bar height in px — keep in sync with CSS --bar-h

// ── Grid ─────────────────────────────────────────────────────
let cols, rows;
let alive   = null;   // Uint8Array  — 0/1
let age     = null;   // Uint16Array — gens this cell has been alive
let ghost   = null;   // Float32Array — fade value for death trails
let scratch = null;   // Uint8Array  — next-gen staging buffer

let generation = 0;
let population = 0;

function allocGrids(c, r) {
  cols = c; rows = r;
  alive   = new Uint8Array(c * r);
  age     = new Uint16Array(c * r);
  ghost   = new Float32Array(c * r);
  scratch = new Uint8Array(c * r);
}

const idx = (c, r) => c + r * cols;

// ── Canvas / ImageData ────────────────────────────────────────
const canvas = document.getElementById("canvas");
const ctx    = canvas.getContext("2d", { alpha: false });
let imgData, pixels;

function isMobile() { return window.innerWidth <= 768; }

function resizeCanvas() {
  const vw = window.innerWidth;
  // On mobile, canvas must not extend under the bottom bar.
  // We set the canvas to fill the area above the bar.
  const rawVh = window.visualViewport
    ? window.visualViewport.height
    : window.innerHeight;
  const canvasH = isMobile() ? rawVh - BAR_H : rawVh;

  const c = Math.floor(vw     / CELL);
  const r = Math.floor(canvasH / CELL);

  canvas.width        = c * CELL;
  canvas.height       = r * CELL;
  canvas.style.width  = vw + "px";
  canvas.style.height = canvasH + "px";
  // Always anchored to top-left; the bar sits below it naturally.
  canvas.style.top    = "0";
  canvas.style.left   = "0";

  allocGrids(c, r);
  rebuildImageData();
}

function rebuildImageData() {
  imgData = ctx.createImageData(canvas.width, canvas.height);
  pixels  = imgData.data;
  // Alpha channel is always 255 — set once here.
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
}

// ── Rule state ───────────────────────────────────────────────
// born[n]    = true → dead cell with n live neighbours is born
// survive[n] = true → live cell with n live neighbours survives
// IMPORTANT: these arrays are mutated in-place; never replace them
// with new arrays, so closures that reference them stay correct.
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
  syncRulePresetHighlight(str);
}

function ruleString() {
  const b = [...Array(9).keys()].filter(n => born[n]).join("");
  const s = [...Array(9).keys()].filter(n => survive[n]).join("");
  return `B${b}/S${s}`;
}

function updateRuleDisplay() {
  const str = ruleString();
  setText("ruleDisplay",       str);
  setText("mobileRuleDisplay", str);
}

function syncRulePresetHighlight(str) {
  document.querySelectorAll("#ruleSeg .seg-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.rule === str));
  document.querySelectorAll("#ruleSegMobile .sheet-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.rule === str));
}

// ── Simulation ───────────────────────────────────────────────
const GHOST_DECAY = 0.18;
let edgeMode = "wrap";

function step() {
  scratch.fill(0);
  population = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          let nr = r + dr, nc = c + dc;
          if (edgeMode === "wrap") {
            nr = (nr + rows) % rows;
            nc = (nc + cols) % cols;
          } else {
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          }
          n += alive[idx(nc, nr)];
        }
      }

      const i        = idx(c, r);
      const wasAlive = alive[i];
      scratch[i]     = wasAlive ? (survive[n] ? 1 : 0) : (born[n] ? 1 : 0);
      if (wasAlive && !scratch[i]) ghost[i] = 1.0;
      if (scratch[i]) population++;
    }
  }

  // Update age and decay ghosts
  for (let i = 0; i < alive.length; i++) {
    if (scratch[i]) {
      age[i] = alive[i] ? Math.min(age[i] + 1, 32000) : 0;
    } else {
      age[i]   = 0;
      ghost[i] = Math.max(0, ghost[i] - GHOST_DECAY);
    }
  }

  // Swap buffers
  const tmp = alive; alive = scratch; scratch = tmp;
  generation++;
}

// ── Colour modes ─────────────────────────────────────────────
let colourMode = "phosphor";

function cellColor(cellAge, isNewBorn) {
  if (colourMode === "mono") return [57, 255, 126];

  if (colourMode === "heat") {
    const t = Math.min(1, cellAge / 120);
    return [120 + (t * 135) | 0, (t * t * 220) | 0, 0];
  }

  // phosphor
  if (isNewBorn) return [200, 255, 220];
  const t = Math.min(1, cellAge / 200);
  if (t < 0.3) {
    const u = t / 0.3;
    return [(75 - 18 * u) | 0, (180 + 75 * u) | 0, (255 - 129 * u) | 0];
  }
  const u = (t - 0.3) / 0.7;
  return [(57 + 198 * u) | 0, (255 - 84 * u) | 0, (126 - 126 * u) | 0];
}

function ghostColor(g) {
  const v = (g * g * 180) | 0;
  const r = (g * g * 30)  | 0;
  return [r, v >> 1, r + (v >> 2)];
}

// ── Render ───────────────────────────────────────────────────
const BG_R = 7, BG_G = 11, BG_B = 9;

function render() {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i  = idx(c, r);
      const px = c * CELL, py = r * CELL;
      let rr, gg, bb;

      if (alive[i]) {
        [rr, gg, bb] = cellColor(age[i], age[i] === 0);
      } else if (ghost[i] > 0.005) {
        [rr, gg, bb] = ghostColor(ghost[i]);
      } else {
        rr = BG_R; gg = BG_G; bb = BG_B;
      }

      for (let dy = 0; dy < CELL; dy++) {
        let pi = ((py + dy) * canvas.width + px) * 4;
        for (let dx = 0; dx < CELL; dx++, pi += 4) {
          pixels[pi]   = rr;
          pixels[pi+1] = gg;
          pixels[pi+2] = bb;
        }
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

// ── Game loop ─────────────────────────────────────────────────
let running    = false;
let targetFps  = 30;
let lastStepTs = 0;
let lastFpsTs  = performance.now();
let fpsFrames  = 0;

// Cache last-written stat values to avoid unnecessary DOM writes
let lastGen = -1, lastPop = -1, lastFpsVal = -1;

function tick(ts) {
  requestAnimationFrame(tick);
  fpsFrames++;

  if (running) {
    const interval = targetFps >= 60 ? 0 : 1000 / targetFps;
    if (ts - lastStepTs >= interval) {
      step();
      lastStepTs = ts;
    }
  } else {
    // Decay ghosts while paused so trails still fade out
    for (let i = 0; i < ghost.length; i++) {
      if (ghost[i] > 0) ghost[i] = Math.max(0, ghost[i] - 0.04);
    }
  }

  render();

  // Stats — only update DOM when values change
  if (fpsFrames >= 30) {
    const fps = Math.round(30000 / (ts - lastFpsTs));
    if (fps !== lastFpsVal) { setText("statFps", fps); lastFpsVal = fps; }
    lastFpsTs  = ts;
    fpsFrames  = 0;
  }

  if (generation !== lastGen) { setText("statGen", generation.toLocaleString()); lastGen = generation; }
  if (population !== lastPop) { setText("statPop", population.toLocaleString()); lastPop = population; }
}

// ── Utility ───────────────────────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Play / Pause ─────────────────────────────────────────────
function setPlaying(v) {
  running = v;

  // Desktop
  const playBtn   = document.getElementById("playBtn");
  const playIcon  = document.getElementById("playIcon");
  const pauseIcon = document.getElementById("pauseIcon");
  const playLabel = document.getElementById("playLabel");
  if (playBtn)   playBtn.classList.toggle("active", v);
  if (playIcon)  playIcon.style.display  = v ? "none" : "";
  if (pauseIcon) pauseIcon.style.display = v ? ""     : "none";
  if (playLabel) playLabel.textContent   = v ? "Pause" : "Play";

  // Mobile
  const mPlayBtn   = document.getElementById("mobilePlayBtn");
  const mPlayIcon  = document.getElementById("mobilePlayIcon");
  const mPauseIcon = document.getElementById("mobilePauseIcon");
  if (mPlayBtn)   mPlayBtn.classList.toggle("playing", v);
  if (mPlayIcon)  mPlayIcon.style.display  = v ? "none" : "";
  if (mPauseIcon) mPauseIcon.style.display = v ? ""     : "none";
}

// ── Shared actions ───────────────────────────────────────────
function doClear() {
  setPlaying(false);
  alive.fill(0); age.fill(0); ghost.fill(0);
  generation = 0; population = 0;
  lastGen = lastPop = -1; // force stat DOM refresh
}

function doRandom() {
  population = 0;
  for (let i = 0; i < alive.length; i++) {
    alive[i] = Math.random() < 0.3 ? 1 : 0;
    age[i]   = alive[i] ? (Math.random() * 50 | 0) : 0;
    ghost[i] = 0;
    population += alive[i];
  }
  lastPop = -1;
}

function setSpeed(fps) {
  targetFps = fps;
  document.querySelectorAll("#speedSeg .seg-btn").forEach(b =>
    b.classList.toggle("active",
      b.dataset.fps === String(fps) || (fps >= 60 && b.dataset.fps === "60")));
  document.querySelectorAll("#mobileSpeedSeg .sdot").forEach(b =>
    b.classList.toggle("active",
      b.dataset.fps === String(fps) || (fps >= 60 && b.dataset.fps === "60")));
}

function setColour(mode) {
  colourMode = mode;
  document.querySelectorAll("#colourSeg .seg-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.mode === mode));
  document.querySelectorAll("#colourSegMobile .seg-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.mode === mode));
}

function setEdge(mode) {
  edgeMode = mode;
  document.querySelectorAll("#edgeSeg .seg-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.edge === mode));
  document.querySelectorAll("#edgeSegMobile .seg-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.edge === mode));
}

// ── Desktop bindings ─────────────────────────────────────────
document.getElementById("playBtn") ?.addEventListener("click", () => setPlaying(!running));
document.getElementById("stepBtn") ?.addEventListener("click", () => { setPlaying(false); step(); });
document.getElementById("clearBtn")?.addEventListener("click", doClear);
document.getElementById("randomBtn")?.addEventListener("click", doRandom);

document.querySelectorAll("#speedSeg .seg-btn").forEach(btn =>
  btn.addEventListener("click", () => setSpeed(parseInt(btn.dataset.fps) || 60)));
document.querySelectorAll("#colourSeg .seg-btn").forEach(btn =>
  btn.addEventListener("click", () => setColour(btn.dataset.mode)));
document.querySelectorAll("#edgeSeg .seg-btn").forEach(btn =>
  btn.addEventListener("click", () => setEdge(btn.dataset.edge)));
document.querySelectorAll("#ruleSeg .seg-btn").forEach(btn =>
  btn.addEventListener("click", () => applyRuleString(btn.dataset.rule)));
document.querySelectorAll("#patternSeg .seg-btn").forEach(btn =>
  btn.addEventListener("click", () => { setPlaying(false); stampPattern(btn.dataset.pattern); }));

// ── Mobile bar bindings ───────────────────────────────────────
document.getElementById("mobilePlayBtn") ?.addEventListener("click", () => setPlaying(!running));
document.getElementById("mobileStepBtn") ?.addEventListener("click", () => { setPlaying(false); step(); });
document.getElementById("mobileClearBtn")?.addEventListener("click", doClear);
document.getElementById("mobileRandomBtn")?.addEventListener("click", doRandom);

document.querySelectorAll("#mobileSpeedSeg .sdot").forEach(btn =>
  btn.addEventListener("click", () => setSpeed(parseInt(btn.dataset.fps) || 60)));

// ── Mobile sheet bindings ────────────────────────────────────
document.querySelectorAll("#colourSegMobile .seg-btn").forEach(btn =>
  btn.addEventListener("click", () => setColour(btn.dataset.mode)));
document.querySelectorAll("#edgeSegMobile .seg-btn").forEach(btn =>
  btn.addEventListener("click", () => setEdge(btn.dataset.edge)));
document.querySelectorAll("#ruleSegMobile .sheet-btn").forEach(btn =>
  btn.addEventListener("click", () => applyRuleString(btn.dataset.rule)));
document.querySelectorAll("#patternSegMobile .sheet-btn").forEach(btn =>
  btn.addEventListener("click", () => { setPlaying(false); stampPattern(btn.dataset.pattern); closeSheet(); }));

// ── Mobile sheet open/close ───────────────────────────────────
const sheet         = document.getElementById("sheet");
const sheetBackdrop = document.getElementById("sheetBackdrop");
const settingsBtn   = document.getElementById("settingsBtn");
let sheetOpen = false;

function openSheet() {
  sheetOpen = true;
  sheet?.classList.add("open");
  sheetBackdrop?.classList.add("visible");
  settingsBtn?.classList.add("open");
}

function closeSheet() {
  sheetOpen = false;
  sheet?.classList.remove("open");
  sheetBackdrop?.classList.remove("visible");
  settingsBtn?.classList.remove("open");
}

settingsBtn?.addEventListener("click", () => sheetOpen ? closeSheet() : openSheet());
sheetBackdrop?.addEventListener("click", closeSheet);

// Swipe down on the handle to close
let swipeTouchStartY = 0;
document.getElementById("sheetHandle")?.addEventListener("touchstart", e => {
  swipeTouchStartY = e.touches[0].clientY;
}, { passive: true });
document.getElementById("sheetHandle")?.addEventListener("touchend", e => {
  if (e.changedTouches[0].clientY - swipeTouchStartY > 40) closeSheet();
}, { passive: true });

// ── Rule bit toggles ─────────────────────────────────────────
// FIX: born/survive are mutated in-place (never reassigned), so
// the click handler that reads born[n] / survive[n] always gets
// the live value. buildBitRow takes a getter so we don't need to
// capture the array reference at build time.
function buildBitRow(containerId, getArr, large = false) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = "";
  if (large) el.classList.add("large");

  for (let n = 0; n <= 8; n++) {
    const btn = document.createElement("button");
    btn.className   = "bit-btn";
    btn.textContent = n;
    btn.dataset.n   = n;
    btn.addEventListener("click", () => {
      const arr = getArr();
      arr[n] = !arr[n];
      btn.classList.toggle("on", arr[n]);
      // Deselect named-rule highlights since we've diverged
      document.querySelectorAll("#ruleSeg .seg-btn, #ruleSegMobile .sheet-btn")
        .forEach(b => b.classList.remove("active"));
      updateRuleDisplay();
    });
    el.appendChild(btn);
  }
}

function updateBitUI() {
  ["bornBits", "bornBitsMobile"].forEach(id => {
    document.getElementById(id)?.querySelectorAll(".bit-btn").forEach((btn, n) =>
      btn.classList.toggle("on", born[n]));
  });
  ["surviveBits", "surviveBitsMobile"].forEach(id => {
    document.getElementById(id)?.querySelectorAll(".bit-btn").forEach((btn, n) =>
      btn.classList.toggle("on", survive[n]));
  });
}

// Build bit rows first, THEN apply rule (so updateBitUI finds the buttons)
buildBitRow("bornBits",          () => born,    false);
buildBitRow("surviveBits",       () => survive, false);
buildBitRow("bornBitsMobile",    () => born,    true);
buildBitRow("surviveBitsMobile", () => survive, true);

// ── Patterns ─────────────────────────────────────────────────
const PATTERNS = {
  glider: [[0,-1],[1,0],[-1,1],[0,1],[1,1]],

  pulsar: (() => {
    const cells = [];
    const arm   = [[2,1],[3,1],[4,1],[1,2],[1,3],[1,4],[5,2],[5,3],[5,4],[2,5],[3,5],[4,5]];
    for (const [c, r] of arm)
      for (const sc of [1,-1]) for (const sr of [1,-1])
        cells.push([c*sc, r*sr]);
    return cells;
  })(),

  gun: (() => {
    const rle = [
      [0,4],[1,4],[0,5],[1,5],
      [10,4],[10,5],[10,6],[11,3],[11,7],[12,2],[12,8],[13,2],[13,8],
      [14,5],[15,3],[15,7],[16,4],[16,5],[16,6],[17,5],
      [20,2],[20,3],[20,4],[21,2],[21,3],[21,4],[22,1],[22,5],
      [24,0],[24,1],[24,5],[24,6],
      [34,2],[34,3],[35,2],[35,3]
    ];
    return rle.map(([c, r]) => [c - 17, r - 4]);
  })(),

  rpent:   [[0,-1],[1,-1],[-1,0],[0,0],[0,1]],
  diehard: [[6,-1],[0,0],[1,0],[1,1],[5,1],[6,1],[7,1]],
};

function stampPattern(name) {
  const cells = PATTERNS[name];
  if (!cells) return;
  const mc = cols >> 1, mr = rows >> 1;
  for (const [dc, dr] of cells) {
    const c = mc + dc, r = mr + dr;
    if (c >= 0 && c < cols && r >= 0 && r < rows) {
      if (!alive[idx(c, r)]) population++;
      alive[idx(c, r)] = 1;
      age  [idx(c, r)] = 0;
    }
  }
  lastPop = -1;
}

// ── Drawing ───────────────────────────────────────────────────
let drawing      = false;
let drawValue    = 1;
let lastDrawCell = null;

function getCanvasCell(e) {
  const rect = canvas.getBoundingClientRect();
  const pt   = e.touches ? e.touches[0] : e;
  const x    = (pt.clientX - rect.left) * (canvas.width  / rect.width);
  const y    = (pt.clientY - rect.top ) * (canvas.height / rect.height);
  const c    = Math.floor(x / CELL);
  const r    = Math.floor(y / CELL);
  return (c >= 0 && c < cols && r >= 0 && r < rows) ? { c, r } : null;
}

// Bresenham line — incremental population update (no full reduce)
function drawLine(c0, r0, c1, r1) {
  let dc = Math.abs(c1-c0), dr = Math.abs(r1-r0);
  let sc = c0 < c1 ? 1 : -1, sr = r0 < r1 ? 1 : -1;
  let err = dc - dr, c = c0, r = r0;

  for (let s = 0; s < Math.max(dc, dr) + 1; s++) {
    const i = idx(c, r);
    const was = alive[i];
    alive[i] = drawValue;

    // Incremental population delta
    if (!was &&  drawValue) population++;
    if ( was && !drawValue) population--;

    if (drawValue === 0) { age[i] = 0; ghost[i] = 0.6; }
    else                 { age[i] = 0; ghost[i] = 0;   }

    if (c === c1 && r === r1) break;
    const e2 = 2 * err;
    if (e2 > -dr) { err -= dr; c += sc; }
    if (e2 <  dc) { err += dc; r += sr; }
  }
  lastPop = -1; // force stat refresh
}

// FIX: check if the touch target is inside any UI element —
// done before calling preventDefault so we don't block UI taps.
function isUITouch(e) {
  const pt = e.touches ? e.touches[0] : e;
  const el = document.elementFromPoint(pt.clientX, pt.clientY);
  return el && (el.closest("#mobileBar") || el.closest("#sheet") || el.closest("#panel"));
}

function onDrawStart(e) {
  if (isUITouch(e)) return;
  e.preventDefault();
  const cell = getCanvasCell(e);
  if (!cell) return;
  drawing   = true;
  drawValue = alive[idx(cell.c, cell.r)] ? 0 : 1;
  drawLine(cell.c, cell.r, cell.c, cell.r);
  lastDrawCell = cell;
  document.getElementById("drawHint")?.classList.add("hidden");
}

function onDrawMove(e) {
  if (!drawing) return;
  e.preventDefault();
  const cell = getCanvasCell(e);
  if (!cell) return;
  if (lastDrawCell) drawLine(lastDrawCell.c, lastDrawCell.r, cell.c, cell.r);
  else              drawLine(cell.c, cell.r, cell.c, cell.r);
  lastDrawCell = cell;
}

function onDrawEnd() { drawing = false; lastDrawCell = null; }

canvas.addEventListener("mousedown",  onDrawStart);
window.addEventListener("mouseup",    onDrawEnd);
canvas.addEventListener("mousemove",  onDrawMove);
canvas.addEventListener("touchstart", onDrawStart, { passive: false });
window.addEventListener("touchend",   onDrawEnd);
canvas.addEventListener("touchmove",  onDrawMove,  { passive: false });

// ── Keyboard shortcuts ───────────────────────────────────────
document.addEventListener("keydown", e => {
  if (e.target !== document.body && e.target !== canvas) return;
  switch (e.key) {
    case " ": e.preventDefault(); setPlaying(!running); break;
    case ".": case "ArrowRight": setPlaying(false); step(); break;
    case "c": case "C": doClear(); break;
    case "r": case "R": doRandom(); break;
  }
});

// ── Keyboard hints (desktop) ─────────────────────────────────
const hints = document.createElement("div");
hints.id = "keyhints";
hints.innerHTML = "Space &nbsp;Play/Pause<br>. / → &nbsp;&nbsp;Step<br>C &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Clear<br>R &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Random";
document.body.appendChild(hints);

// ══════════════════════════════════════════════════════════════
//  TOOLTIP SYSTEM
// ══════════════════════════════════════════════════════════════
const tooltip = document.getElementById("tooltip");
let tipTimeout     = null;
let tipHideTimeout = null;

function showTip(text, anchorRect) {
  clearTimeout(tipTimeout);
  clearTimeout(tipHideTimeout);

  tooltip.textContent = text;
  tooltip.classList.remove("visible", "tip-below");

  // Measure without flashing: position off-screen, make visible briefly
  tooltip.style.left       = "-9999px";
  tooltip.style.top        = "-9999px";
  tooltip.style.visibility = "hidden";
  tooltip.style.display    = "block";

  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;

  tooltip.style.visibility = "";
  tooltip.style.display    = "";

  const MARGIN = 10, GAP = 8;
  const vw     = window.innerWidth;

  let top   = anchorRect.top - th - GAP;
  let below = top < MARGIN;
  if (below) top = anchorRect.bottom + GAP;

  let left        = anchorRect.left + anchorRect.width / 2 - tw / 2;
  left            = Math.max(MARGIN, Math.min(left, vw - tw - MARGIN));

  const arrowX    = (anchorRect.left + anchorRect.width / 2) - left;
  const arrowClamp = Math.max(10, Math.min(arrowX, tw - 10));

  tooltip.style.left = left + "px";
  tooltip.style.top  = top  + "px";
  tooltip.style.setProperty("--arrow-x", arrowClamp + "px");
  if (below) tooltip.classList.add("tip-below");

  void tooltip.offsetWidth; // force reflow
  tooltip.classList.add("visible");
}

function hideTip() {
  clearTimeout(tipTimeout);
  clearTimeout(tipHideTimeout);
  tooltip.classList.remove("visible");
}

function findTipTarget(el) {
  let cur = el;
  while (cur && cur !== document.body) {
    if (cur.dataset?.tip) return cur;
    cur = cur.parentElement;
  }
  return null;
}

// Desktop: hover with 300 ms delay
// FIX: use relatedTarget so moving mouse between child elements
// doesn't cause flicker — only hide when leaving the tip target.
document.addEventListener("mouseover", e => {
  const target = findTipTarget(e.target);
  if (!target) { hideTip(); return; }
  clearTimeout(tipTimeout);
  tipTimeout = setTimeout(() =>
    showTip(target.dataset.tip, target.getBoundingClientRect()), 300);
});

document.addEventListener("mouseout", e => {
  const target = findTipTarget(e.target);
  if (!target) return;
  // Don't hide if the mouse moved into a child of the same target
  if (target.contains(e.relatedTarget)) return;
  clearTimeout(tipTimeout);
  hideTip();
});

// Touch: show tip on icon-only mobile bar buttons / speed dots
document.addEventListener("touchstart", e => {
  const target = findTipTarget(e.target);
  if (!target?.dataset.tip) return;
  // Only show for compact icon buttons (mbar-btn and sdot have no text)
  if (!target.classList.contains("mbar-btn") &&
      !target.classList.contains("sdot")) return;
  clearTimeout(tipHideTimeout);
  showTip(target.dataset.tip, target.getBoundingClientRect());
  tipHideTimeout = setTimeout(hideTip, 1800);
}, { passive: true });

// ── Resize ───────────────────────────────────────────────────
window.addEventListener("resize", () => {
  // Preserve existing cells across resize
  const oldAlive = alive ? new Uint8Array(alive) : null;
  const oldCols  = cols;
  const oldRows  = rows;

  resizeCanvas();

  if (oldAlive && oldCols && oldRows) {
    population = 0;
    const mc = Math.min(cols, oldCols);
    const mr = Math.min(rows, oldRows);
    for (let r = 0; r < mr; r++) {
      for (let c = 0; c < mc; c++) {
        const v = oldAlive[c + r * oldCols];
        alive[idx(c, r)] = v;
        population += v;
      }
    }
    lastPop = -1;
  }
});

// ── Init ─────────────────────────────────────────────────────
resizeCanvas();
// Build bit rows FIRST, then apply rule so updateBitUI() finds the buttons
applyRuleString("B3/S23");
doRandom();
requestAnimationFrame(tick);