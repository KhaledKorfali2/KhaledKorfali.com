// ============================================================
//  PARTICLE SANDBOX — script.js
//
//  Changes in this version:
//  1. Pointer interpolation — stamps particles along the line
//     between the last and current pointer position so fast
//     strokes (especially walls) never have gaps.
//  2. Fire vs smoke differentiation:
//     • Fire: intense orange→yellow core, spawns glowing
//       ember particles that drift upward and fade.
//     • Smoke: near-black, slow rising, wide lateral spread,
//       long life — looks nothing like fire.
//  3. Compact collapsible toolbar driven from JS.
// ============================================================

// ── Constants ────────────────────────────────────────────────
const CELL_SIZE     = 5;
const GRAVITY_X10   = 4;    // 0.4 × 10
const MAX_VEL_X10   = 80;   // 8.0 × 10
const START_VEL_X10 = 10;   // 1.0 × 10

// Particle type IDs  (0 = empty)
const T_EMPTY  = 0;
const T_SAND   = 1;
const T_WATER  = 2;
const T_FIRE   = 3;
const T_SMOKE  = 4;
const T_STEAM  = 5;
const T_WALL   = 6;
const T_EMBER  = 7;   // ← new: tiny glowing fire particle

// ── Canvas ───────────────────────────────────────────────────
const canvas = document.getElementById("canvas");
const ctx    = canvas.getContext("2d", { alpha: false });

let cols, rows, total;

// Parallel flat typed-array buffers (two for double-buffering)
let TYPE  = [null, null];
let VEL   = [null, null];
let LIFE  = [null, null];
let HUE   = [null, null];
let SAT   = [null, null];
let LIT   = [null, null];

let cur = 0, nxt = 1;

let imgData, pixels;
let colOrder;

function allocGrids() {
  total    = cols * rows;
  colOrder = new Uint16Array(cols);
  for (let i = 0; i < cols; i++) colOrder[i] = i;

  for (let b = 0; b < 2; b++) {
    TYPE[b] = new Uint8Array(total);
    VEL [b] = new Uint8Array(total);
    LIFE[b] = new Uint16Array(total);
    HUE [b] = new Uint16Array(total);
    SAT [b] = new Uint8Array(total);
    LIT [b] = new Uint8Array(total);
  }
  imgData = ctx.createImageData(cols * CELL_SIZE, rows * CELL_SIZE);
  pixels  = imgData.data;
  // alpha always 255
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  // fill background
  for (let i = 0; i < pixels.length; i += 4) pixels[i] = pixels[i+1] = pixels[i+2] = 10;
}

function resetGrids() {
  for (let b = 0; b < 2; b++) {
    TYPE[b].fill(0);
    VEL [b].fill(0);
    LIFE[b].fill(0);
  }
  for (let i = 0; i < pixels.length; i += 4) pixels[i] = pixels[i+1] = pixels[i+2] = 10;
}

// ── Resize ───────────────────────────────────────────────────
function resizeCanvas() {
  const vw = window.innerWidth;
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;

  cols = Math.floor(vw / CELL_SIZE);
  rows = Math.floor(vh / CELL_SIZE);

  canvas.width  = cols * CELL_SIZE;
  canvas.height = rows * CELL_SIZE;
  canvas.style.width  = vw  + "px";
  canvas.style.height = vh  + "px";

  allocGrids();
}

// ── Grid helpers ─────────────────────────────────────────────
const idx      = (c, r) => c + r * cols;
const inBounds = (c, r) => c >= 0 && c < cols && r >= 0 && r < rows;
const isEmpty  = (b, c, r) => inBounds(c,r) && TYPE[b][idx(c,r)] === T_EMPTY;
const getType  = (b, c, r) => inBounds(c,r) ? TYPE[b][idx(c,r)] : -1;
const isSolid  = (b, c, r) => { const t = getType(b,c,r); return t === T_SAND || t === T_WALL; };

function setParticle(b, c, r, type, vel, life, h, s, l) {
  const i = idx(c, r);
  TYPE[b][i] = type;
  VEL [b][i] = vel;
  LIFE[b][i] = life;
  HUE [b][i] = h;
  SAT [b][i] = s;
  LIT [b][i] = l;
}

// ── Spawn helpers ─────────────────────────────────────────────
const spawnSand  = (b,c,r,h,s,l) => setParticle(b,c,r, T_SAND,  START_VEL_X10, 255,  h,s,l);
const spawnWater = (b,c,r)        => setParticle(b,c,r, T_WATER, START_VEL_X10, 255,  210,85,55);
const spawnWall  = (b,c,r,h,s,l) => setParticle(b,c,r, T_WALL,  0,             255,  h,s,l);
const spawnSteam = (b,c,r)        => setParticle(b,c,r, T_STEAM, 0, 120+rand(60), 200, 30, 80);

// Fire: bright orange-yellow core, short life burst
function spawnFire(b, c, r) {
  const h    = 10 + rand(25);        // deep red → orange
  const life = 160 + rand(80);
  setParticle(b, c, r, T_FIRE, 0, life, h, 100, 55 + rand(20));
}

// Smoke: near-black, long-lived, muted
function spawnSmoke(b, c, r) {
  const grayL = 12 + rand(16);       // very dark
  const life  = 280 + rand(120);     // outlives fire significantly
  setParticle(b, c, r, T_SMOKE, 0, life, 220, 8, grayL);
}

// Ember: a hot particle that drifts up + sideways then dies
function spawnEmber(b, c, r) {
  const h    = 25 + rand(30);        // orange-yellow
  const life = 30 + rand(50);
  setParticle(b, c, r, T_EMBER, 0, life, h, 100, 70 + rand(20));
}

// ── UI state ─────────────────────────────────────────────────
const rand   = n => Math.random() * n | 0;
const chance = p => Math.random() < p;

let selectedType = T_SAND;
let brushMode    = "deposit";
let autoHueShift = true;
let brushExtent  = 3;
let baseH = 38, baseS = 70, baseL = 60;
let mousePressed = false;

const COLORABLE = new Set([T_SAND, T_WALL]);

// ── DOM ───────────────────────────────────────────────────────
const resetBtn       = document.getElementById("resetBtn");
const colorPicker    = document.getElementById("colorPicker");
const autoHueToggle  = document.getElementById("autoHueToggle");
const brushSizeSlider= document.getElementById("brushSize");
const brushSizeVal   = document.getElementById("brushSizeVal");
const brushCursor    = document.getElementById("brushCursor");
const fpsCounter     = document.getElementById("fpsCounter");
const particleCounter= document.getElementById("particleCounter");
const toolbar        = document.getElementById("toolbar");
const expandBtn      = document.getElementById("expandBtn");
const pillDot        = document.getElementById("pillDot");
const pillLabel      = document.getElementById("pillLabel");
const colorGroup     = document.getElementById("colorGroup");

// Expand / collapse panel
expandBtn.addEventListener("click", () => {
  const expanded = toolbar.classList.toggle("expanded");
  expandBtn.setAttribute("aria-expanded", expanded);
});

// Close panel when clicking canvas
canvas.addEventListener("mousedown",  () => { if (toolbar.classList.contains("expanded")) toolbar.classList.remove("expanded"); });
canvas.addEventListener("touchstart", () => { if (toolbar.classList.contains("expanded")) toolbar.classList.remove("expanded"); }, { passive: true });

// Element info for the pill badge
const ELEM_META = {
  sand:   { label: "Sand",   dotColor: "#e6b84a", type: T_SAND  },
  water:  { label: "Water",  dotColor: "#4a9edd", type: T_WATER },
  fire:   { label: "Fire",   dotColor: "#e84a1a", type: T_FIRE  },
  smoke:  { label: "Smoke",  dotColor: "#8899aa", type: T_SMOKE },
  wall:   { label: "Wall",   dotColor: "#888",    type: T_WALL  },
  eraser: { label: "Erase",  dotColor: null,      type: 99      },
};

function selectElement(typeStr) {
  const meta = ELEM_META[typeStr];
  if (!meta) return;

  selectedType = meta.type;

  // Update pill badge
  pillLabel.textContent = meta.label;
  if (meta.dotColor) {
    pillDot.style.background = meta.dotColor;
    pillDot.style.border     = "none";
  } else {
    pillDot.style.background = "transparent";
    pillDot.style.border     = "1.5px solid rgba(255,255,255,0.4)";
  }

  // Update quick-dot highlights
  document.querySelectorAll(".qdot").forEach(b =>
    b.classList.toggle("active", b.dataset.type === typeStr));

  // Show/hide colour controls
  colorGroup.style.display = COLORABLE.has(selectedType) ? "flex" : "none";
}

document.querySelectorAll(".qdot").forEach(btn => {
  btn.addEventListener("click", () => selectElement(btn.dataset.type));
});

// Mode buttons
document.querySelectorAll(".mode-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    brushMode = btn.dataset.mode;
  });
});

resetBtn.addEventListener("click", resetGrids);
autoHueToggle.addEventListener("change", () => autoHueShift = autoHueToggle.checked);
colorPicker.addEventListener("input", () => {
  const hsl = hexToHSL(colorPicker.value);
  baseH = hsl.h; baseS = hsl.s; baseL = hsl.l;
});
brushSizeSlider.addEventListener("input", () => {
  brushExtent = parseInt(brushSizeSlider.value);
  brushSizeVal.textContent = brushExtent;
  updateCursorSize();
});

// Keyboard shortcuts
const keyMap = { "1":"sand","2":"water","3":"fire","4":"smoke","5":"wall","e":"eraser","E":"eraser" };
document.addEventListener("keydown", e => {
  if (e.key === "r" || e.key === "R") { resetGrids(); return; }
  if (keyMap[e.key]) selectElement(keyMap[e.key]);
});

// ── Brush cursor ─────────────────────────────────────────────
function updateCursorSize() {
  const px = brushExtent * 2 * CELL_SIZE;
  brushCursor.style.width  = px + "px";
  brushCursor.style.height = px + "px";
}

canvas.addEventListener("mouseenter", () => { brushCursor.style.display = "block"; });
canvas.addEventListener("mouseleave", () => { brushCursor.style.display = "none";  });
window.addEventListener("mousemove",  e => {
  brushCursor.style.left = e.clientX + "px";
  brushCursor.style.top  = e.clientY + "px";
});
updateCursorSize();

// ── Color helpers ─────────────────────────────────────────────
function hexToHSL(hex) {
  let r = parseInt(hex.slice(1,3),16)/255;
  let g = parseInt(hex.slice(3,5),16)/255;
  let b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max+min)/2;
  if (max === min) { h = s = 0; }
  else {
    const d = max-min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max) {
      case r: h=(g-b)/d+(g<b?6:0); break;
      case g: h=(b-r)/d+2; break;
      case b: h=(r-g)/d+4; break;
    }
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s*100), l: Math.round(l*100) };
}

function hue2rgb(p, q, t) {
  if (t<0) t+=1; if (t>1) t-=1;
  if (t<1/6) return p+(q-p)*6*t;
  if (t<1/2) return q;
  if (t<2/3) return p+(q-p)*(2/3-t)*6;
  return p;
}

function hslToRGB(h, s, l) {
  s/=100; l/=100;
  if (s===0) { const v=l*255|0; return [v,v,v]; }
  const q=l<0.5?l*(1+s):l+s-l*s, p=2*l-q, hn=h/360;
  return [hue2rgb(p,q,hn+1/3)*255|0, hue2rgb(p,q,hn)*255|0, hue2rgb(p,q,hn-1/3)*255|0];
}

// ── Pointer input with interpolation ─────────────────────────
// We track the last position and stamp along the segment
// between it and the current position — fills gaps on fast strokes.
let lastPointerCell = null;   // { c, r } in grid coords

function getPointerCell(e) {
  const rect  = canvas.getBoundingClientRect();
  const pt    = e.touches ? e.touches[0] : e;
  const x     = (pt.clientX - rect.left) * (canvas.width  / rect.width);
  const y     = (pt.clientY - rect.top ) * (canvas.height / rect.height);
  return {
    c: Math.floor(x / CELL_SIZE),
    r: Math.min(Math.floor(y / CELL_SIZE), rows - 1)
  };
}

// Stamp brush at one grid cell
function stampAt(mc, mr) {
  const extent     = brushExtent;
  const placedCols = new Set();

  for (let i = -extent; i <= extent; i++) {
    for (let j = -extent; j <= extent; j++) {
      if (i*i + j*j > extent*extent) continue;   // circular
      if (chance(0.35)) continue;
      const col = mc + i, row = mr + j;
      if (!inBounds(col, row)) continue;
      const ci = idx(col, row);

      // Eraser
      if (selectedType === 99) { TYPE[cur][ci] = T_EMPTY; continue; }
      if (TYPE[cur][ci] !== T_EMPTY) continue;

      switch (selectedType) {
        case T_SAND: {
          if (brushMode === "surface") {
            if (placedCols.has(col)) continue;
            let yTop = row;
            while (yTop >= 0 && TYPE[cur][idx(col, yTop)] !== T_EMPTY) yTop--;
            if (yTop >= 0) { spawnSand(cur, col, yTop, baseH, baseS, baseL); placedCols.add(col); }
          } else {
            spawnSand(cur, col, row, baseH, baseS, baseL);
          }
          break;
        }
        case T_WATER: spawnWater(cur, col, row); break;
        case T_FIRE:  spawnFire (cur, col, row); break;
        case T_SMOKE: spawnSmoke(cur, col, row); break;
        case T_STEAM: spawnSteam(cur, col, row); break;
        case T_WALL: {
          if (brushMode === "surface") {
            if (placedCols.has(col)) continue;
            let yTop = row;
            while (yTop >= 0 && TYPE[cur][idx(col, yTop)] !== T_EMPTY) yTop--;
            if (yTop >= 0) { spawnWall(cur, col, yTop, baseH, baseS, baseL); placedCols.add(col); }
          } else {
            spawnWall(cur, col, row, baseH, baseS, baseL);
          }
          break;
        }
      }
    }
  }

  if (autoHueShift && COLORABLE.has(selectedType)) {
    baseH = (baseH + 0.5) % 360;
  }
}

// Bresenham line between two grid cells, stamp at each step
function stampLine(c0, r0, c1, r1) {
  let dc = Math.abs(c1-c0), dr = Math.abs(r1-r0);
  let sc = c0 < c1 ? 1 : -1, sr = r0 < r1 ? 1 : -1;
  let err = dc - dr;
  let c = c0, r = r0;
  // Limit steps to avoid huge line fills on resize jumps
  const maxSteps = Math.max(dc, dr) + 1;
  for (let step = 0; step < maxSteps && step < 200; step++) {
    stampAt(c, r);
    if (c === c1 && r === r1) break;
    const e2 = 2 * err;
    if (e2 > -dr) { err -= dr; c += sc; }
    if (e2 <  dc) { err += dc; r += sr; }
  }
}

function onPointerDown(e) {
  e.preventDefault();
  mousePressed = true;
  const cell = getPointerCell(e);
  lastPointerCell = cell;
  stampAt(cell.c, cell.r);
}

function onPointerMove(e) {
  if (!mousePressed) return;
  e.preventDefault();
  const cell = getPointerCell(e);
  if (lastPointerCell) {
    stampLine(lastPointerCell.c, lastPointerCell.r, cell.c, cell.r);
  } else {
    stampAt(cell.c, cell.r);
  }
  lastPointerCell = cell;
}

function onPointerUp() {
  mousePressed = false;
  lastPointerCell = null;
}

canvas.addEventListener("mousedown",  onPointerDown);
window.addEventListener("mouseup",    onPointerUp);
canvas.addEventListener("mousemove",  onPointerMove);
canvas.addEventListener("touchstart", onPointerDown, { passive: false });
window.addEventListener("touchend",   onPointerUp);
canvas.addEventListener("touchmove",  onPointerMove, { passive: false });

// ── Simulation ────────────────────────────────────────────────
function simulate() {
  TYPE[nxt].fill(0);

  for (let r = rows - 1; r >= 0; r--) {
    // Fisher-Yates shuffle column order
    for (let i = cols-1; i > 0; i--) {
      const j = rand(i+1);
      const t = colOrder[i]; colOrder[i] = colOrder[j]; colOrder[j] = t;
    }

    for (let ci = 0; ci < cols; ci++) {
      const c = colOrder[ci];
      const i = idx(c, r);
      const type = TYPE[cur][i];
      if (type === T_EMPTY) continue;
      if (TYPE[nxt][i] === type && type !== T_WALL) continue;

      const vel  = VEL [cur][i];
      const life = LIFE[cur][i];
      const h    = HUE [cur][i];
      const s    = SAT [cur][i];
      const l    = LIT [cur][i];

      switch (type) {
        case T_SAND:  updateSand (c, r, vel, h, s, l); break;
        case T_WATER: updateWater(c, r, vel, h, s, l); break;
        case T_FIRE:  updateFire (c, r, life, h);      break;
        case T_SMOKE: updateSmoke(c, r, life, h, s, l); break;
        case T_STEAM: updateSteam(c, r, life, h, s, l); break;
        case T_EMBER: updateEmber(c, r, life, h, s, l); break;
        case T_WALL: {
          setParticle(nxt, c, r, T_WALL, 0, 255, h, s, l);
          break;
        }
      }
    }
  }

  const tmp = cur; cur = nxt; nxt = tmp;
}

function updateSand(c, r, vel, h, s, l) {
  const nv = Math.min(MAX_VEL_X10, vel + GRAVITY_X10);
  const steps = Math.max(1, nv/10|0);
  const target = Math.min(rows-1, r + steps);

  for (let y = r+1; y <= target; y++) {
    if (isEmpty(nxt, c, y)) {
      setParticle(nxt, c, y, T_SAND, nv, 255, h, s, l); return;
    }
    const dir = chance(0.5) ? 1 : -1;
    for (const d of [dir, -dir]) {
      const nc = c+d;
      if (inBounds(nc,y) && isEmpty(nxt,nc,y) && !isSolid(cur,nc,y-1)) {
        setParticle(nxt, nc, y, T_SAND, nv, 255, h, s, l); return;
      }
    }
    break;
  }
  setParticle(nxt, c, r, T_SAND, START_VEL_X10, 255, h, s, l);
}

function updateWater(c, r, vel, h, s, l) {
  const nv = Math.min(MAX_VEL_X10, vel + GRAVITY_X10);
  const steps = Math.max(1, nv/10|0);
  const target = Math.min(rows-1, r + steps);
  let moved = false;

  for (let y = r+1; y <= target; y++) {
    if (isEmpty(nxt, c, y)) {
      setParticle(nxt, c, y, T_WATER, nv, 255, h, s, l); moved=true; break;
    }
    const dir = chance(0.5) ? 1 : -1;
    for (const d of [dir, -dir]) {
      const nc=c+d;
      if (inBounds(nc,y) && isEmpty(nxt,nc,y)) {
        setParticle(nxt, nc, y, T_WATER, nv, 255, h, s, l); moved=true; break;
      }
    }
    if (moved) break;
    break;
  }

  if (!moved) {
    const dir = chance(0.5) ? 1 : -1;
    for (let dx=1; dx<=4; dx++) {
      const nc=c+dir*dx;
      if (!inBounds(nc,r) || !isEmpty(nxt,nc,r)) break;
      setParticle(nxt, nc, r, T_WATER, START_VEL_X10, 255, h, s, l);
      moved=true; break;
    }
  }

  if (!moved) setParticle(nxt, c, r, T_WATER, START_VEL_X10, 255, h, s, l);
}

function updateFire(c, r, life, _h) {
  const newLife = life - 2 - rand(3);
  if (newLife <= 0) {
    // Burn out: always leave smoke, sometimes an ember
    if (inBounds(c, r-1) && isEmpty(nxt, c, r-1)) spawnSmoke(nxt, c, r-1);
    if (chance(0.2) && inBounds(c, r-1) && isEmpty(nxt, c, r-1)) {
      /* smoke already placed above; try a column beside */
      const ed = chance(0.5) ? 1 : -1;
      if (inBounds(c+ed, r) && isEmpty(nxt, c+ed, r)) spawnEmber(nxt, c+ed, r);
    }
    return;
  }

  // Ignite adjacent water → steam
  for (const [dc, dr] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    if (getType(cur, c+dc, r+dr) === T_WATER && chance(0.05))
      spawnSteam(nxt, c+dc, r+dr);
  }

  // Fire colour: hot yellow-white core when life is high, orange-red as it fades
  const lifeFrac = newLife / 240;             // 0..1
  const newH = lifeFrac > 0.5
    ? (55 - (1-lifeFrac)*40) | 0             // yellow (55) → orange (15)
    : (15 - (0.5-lifeFrac)*10) | 0;          // orange → deep red
  const newL = (50 + lifeFrac * 30) | 0;     // brighter when fresh

  // Spawn ember occasionally
  if (chance(0.04) && inBounds(c, r-1) && isEmpty(nxt, c, r-1))
    spawnEmber(nxt, c, r-1);

  const upRow = r - 1;
  if (upRow >= 0 && isEmpty(nxt, c, upRow) && chance(0.65)) {
    setParticle(nxt, c, upRow, T_FIRE, 0, newLife, newH, 100, newL);
    // Spread heat sideways a bit
    const sd = chance(0.5) ? 1 : -1;
    if (inBounds(c+sd, r) && isEmpty(nxt, c+sd, r) && chance(0.15))
      setParticle(nxt, c+sd, r, T_FIRE, 0, (newLife * 0.6)|0, newH, 100, newL);
  } else {
    setParticle(nxt, c, r, T_FIRE, 0, newLife, newH, 100, newL);
  }
}

// Smoke: very dark, slow-rising, wide spread
function updateSmoke(c, r, life, h, s, l) {
  const newLife = life - 1;
  if (newLife <= 0) return;

  // Widen as it ages — pick a larger random horizontal offset when older
  const age    = 1 - newLife / 400;          // 0=fresh, 1=old
  const spread = 1 + (rand(3 + (age * 5)|0)); // 1..7 cells wide spread
  const sway   = (chance(0.5) ? 1 : -1) * (rand(spread) + 1);

  const nc = c + sway;
  const nr = r - 1;

  // Smoke rises slowly — only move up with chance
  if (chance(0.55)) {
    if (inBounds(nc, nr) && isEmpty(nxt, nc, nr))
      setParticle(nxt, nc, nr, T_SMOKE, 0, newLife, h, s, l);
    else if (inBounds(c, nr) && isEmpty(nxt, c, nr))
      setParticle(nxt, c,  nr, T_SMOKE, 0, newLife, h, s, l);
    else
      setParticle(nxt, c, r,  T_SMOKE, 0, newLife, h, s, l);
  } else {
    // Drift sideways at same height
    const lat = chance(0.5) ? 1 : -1;
    if (inBounds(c+lat, r) && isEmpty(nxt, c+lat, r))
      setParticle(nxt, c+lat, r, T_SMOKE, 0, newLife, h, s, l);
    else
      setParticle(nxt, c, r, T_SMOKE, 0, newLife, h, s, l);
  }
}

function updateSteam(c, r, life, h, s, l) {
  const newLife = life - 1;
  if (newLife <= 0) {
    if (chance(0.1) && inBounds(c,r)) spawnWater(nxt, c, r);
    return;
  }
  const sway = rand(3)-1, nr = r-1;
  if (inBounds(c+sway, nr) && isEmpty(nxt, c+sway, nr))
    setParticle(nxt, c+sway, nr, T_STEAM, 0, newLife, h, s, l);
  else if (inBounds(c, nr) && isEmpty(nxt, c, nr))
    setParticle(nxt, c,  nr, T_STEAM, 0, newLife, h, s, l);
  else
    setParticle(nxt, c, r,  T_STEAM, 0, newLife, h, s, l);
}

// Ember: bright, drifts upward + sideways quickly, short life
function updateEmber(c, r, life, h, s, l) {
  const newLife = life - 2;
  if (newLife <= 0) return;

  const sway = (chance(0.5) ? 1 : -1) * rand(2);
  const nr   = r - 1;

  if (inBounds(c+sway, nr) && isEmpty(nxt, c+sway, nr))
    setParticle(nxt, c+sway, nr, T_EMBER, 0, newLife, h, s, l);
  else if (inBounds(c, nr) && isEmpty(nxt, c, nr))
    setParticle(nxt, c, nr, T_EMBER, 0, newLife, h, s, l);
  else
    setParticle(nxt, c, r, T_EMBER, 0, newLife, h, s, l);
}

// ── Render ────────────────────────────────────────────────────
const BG = 10;

function render() {
  let count = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gi   = idx(c, r);
      const type = TYPE[cur][gi];
      let rr = BG, gg = BG, bb = BG;

      if (type !== T_EMPTY) {
        count++;
        const h = HUE[cur][gi], s = SAT[cur][gi], l = LIT[cur][gi];
        const life = LIFE[cur][gi];

        let alpha = 1;
        if ((type === T_SMOKE || type === T_STEAM) && life < 80)
          alpha = life / 80;
        else if (type === T_FIRE)
          alpha = Math.min(1, life / 50);
        else if (type === T_EMBER)
          alpha = Math.min(1, life / 25);

        const [pr, pg, pb] = hslToRGB(h, s, l);
        if (alpha >= 1) {
          rr = pr; gg = pg; bb = pb;
        } else {
          rr = (pr*alpha + BG*(1-alpha)) | 0;
          gg = (pg*alpha + BG*(1-alpha)) | 0;
          bb = (pb*alpha + BG*(1-alpha)) | 0;
        }
      }

      const px0 = c * CELL_SIZE, py0 = r * CELL_SIZE;
      for (let dy = 0; dy < CELL_SIZE; dy++) {
        let pi = ((py0+dy) * canvas.width + px0) * 4;
        for (let dx = 0; dx < CELL_SIZE; dx++, pi+=4) {
          pixels[pi]   = rr;
          pixels[pi+1] = gg;
          pixels[pi+2] = bb;
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return count;
}

// ── Loop ─────────────────────────────────────────────────────
let lastTs = performance.now(), frames = 0;

function loop(ts) {
  simulate();
  const count = render();

  frames++;
  if (frames >= 30) {
    const fps = Math.round(30000 / (ts - lastTs));
    fpsCounter.textContent      = fps + " fps";
    particleCounter.textContent = count.toLocaleString() + " particles";
    lastTs = ts; frames = 0;
  }

  requestAnimationFrame(loop);
}

// ── Init ──────────────────────────────────────────────────────
window.addEventListener("resize", resizeCanvas);
resizeCanvas();
selectElement("sand");   // set initial state
requestAnimationFrame(loop);