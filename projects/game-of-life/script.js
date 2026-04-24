// ================================================================
//  GAME OF LIFE — script.js
//
//  Features:
//  • Configurable B/S ruleset with bit-toggle UI + named presets
//  • Three colour modes: Phosphor (age-based glow), Heat, Mono
//  • Ghost trails: dying cells leave a fading phosphor afterglow
//  • Birth flash: new cells bloom with a brief brightness spike
//  • Wrap (toroidal) vs Dead-edge boundary modes
//  • Play / Pause / Step controls with configurable fps cap
//  • Pattern stamp presets (Glider, Pulsar, Gosper Gun, …)
//  • Random fill
//  • Click + drag cell drawing
//  • Flat Uint8Array grids for performance; ImageData rendering
// ================================================================

// ── Grid ─────────────────────────────────────────────────────
const CELL = 10;   // px per cell (decrease for higher density)

let cols, rows;
let alive   = null;   // Uint8Array — 0/1
let age     = null;   // Uint16Array — how many gens this cell has been alive
let ghost   = null;   // Float32Array — decay value for death trails (0..1)
let scratch = null;   // Uint8Array — next-gen buffer

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

function resizeCanvas() {
  const vw = window.innerWidth;
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const c  = Math.floor(vw / CELL);
  const r  = Math.floor(vh / CELL);

  canvas.width  = c * CELL;
  canvas.height = r * CELL;
  canvas.style.width  = vw + "px";
  canvas.style.height = vh + "px";

  allocGrids(c, r);
  imgData = ctx.createImageData(canvas.width, canvas.height);
  pixels  = imgData.data;
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
}

// ── Rule state ───────────────────────────────────────────────
// born[n] = true → cell with n live neighbours is born
// survive[n] = true → live cell with n live neighbours survives
let born    = new Array(9).fill(false);
let survive = new Array(9).fill(false);

function applyRuleString(str) {
  // Format: "B{digits}/S{digits}"
  born    = new Array(9).fill(false);
  survive = new Array(9).fill(false);
  const m = str.match(/B([0-9]*)\/?S([0-9]*)/i);
  if (!m) return;
  for (const ch of m[1]) born[+ch]    = true;
  for (const ch of m[2]) survive[+ch] = true;
  updateBitUI();
  updateRuleDisplay();
  // Highlight matching preset if any
  document.querySelectorAll("#ruleSeg .seg-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.rule === str);
  });
}

function ruleString() {
  const b = [...Array(9).keys()].filter(n => born[n]).join("");
  const s = [...Array(9).keys()].filter(n => survive[n]).join("");
  return `B${b}/S${s}`;
}

function updateRuleDisplay() {
  document.getElementById("ruleDisplay").textContent = ruleString();
}

// ── Simulation ───────────────────────────────────────────────
const GHOST_DECAY = 0.18;   // how fast death trails fade per frame

function step() {
  scratch.fill(0);
  population = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Count live neighbours
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

      const i = idx(c, r);
      const wasAlive = alive[i];

      if (wasAlive) {
        scratch[i] = survive[n] ? 1 : 0;
      } else {
        scratch[i] = born[n] ? 1 : 0;
      }

      // Ghost: dying cell leaves trail
      if (wasAlive && !scratch[i]) {
        ghost[i] = 1.0;
      }

      if (scratch[i]) population++;
    }
  }

  // Update age
  for (let i = 0; i < alive.length; i++) {
    if (scratch[i]) {
      age[i] = alive[i] ? Math.min(age[i] + 1, 32000) : 0; // born → reset age
    } else {
      age[i] = 0;
      ghost[i] = Math.max(0, ghost[i] - GHOST_DECAY);
    }
  }

  // Swap
  const tmp = alive; alive = scratch; scratch = tmp;
  generation++;
}

// ── Colour modes ─────────────────────────────────────────────
let colourMode = "phosphor";

// Phosphor: cold blue (newborn) → green (established) → amber (ancient)
// Heat: dark red → orange → bright yellow
// Mono: pure phosphor green

function cellColor(cellAge, isNewBorn) {
  if (colourMode === "mono") {
    return [57, 255, 126];
  }

  if (colourMode === "heat") {
    // 0=dark red, mid=orange, high=bright yellow
    const t = Math.min(1, cellAge / 120);
    const r = 120 + (t * 135) | 0;
    const g = (t * t * 220) | 0;
    const b = 0;
    return [r, g, b];
  }

  // phosphor (default): newborn flash → age-based colour temp
  if (isNewBorn) {
    // white-ish flash
    return [200, 255, 220];
  }
  const t = Math.min(1, cellAge / 200);
  if (t < 0.3) {
    // cold blue → phosphor green
    const u = t / 0.3;
    return [
      (75 - 18 * u) | 0,
      (180 + 75 * u) | 0,
      (255 - 129 * u) | 0,
    ];
  }
  // phosphor green → amber
  const u = (t - 0.3) / 0.7;
  return [
    (57 + 198 * u) | 0,
    (255 - 84 * u) | 0,
    (126 - 126 * u) | 0,
  ];
}

function ghostColor(g) {
  // Phosphor ghost: dim green glow
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
        const isNew = age[i] === 0;
        [rr, gg, bb] = cellColor(age[i], isNew);
      } else if (ghost[i] > 0.005) {
        [rr, gg, bb] = ghostColor(ghost[i]);
      } else {
        rr = BG_R; gg = BG_G; bb = BG_B;
      }

      // Fill CELL×CELL block
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

// ── Game loop ────────────────────────────────────────────────
let running    = false;
let targetFps  = 30;
let lastStepTs = 0;
let rafId      = null;

let lastFpsTs  = performance.now();
let fpsFrames  = 0;

function tick(ts) {
  rafId = requestAnimationFrame(tick);
  fpsFrames++;

  if (running) {
    const interval = targetFps >= 60 ? 0 : 1000 / targetFps;
    if (ts - lastStepTs >= interval) {
      step();
      lastStepTs = ts;
    }
  }

  // Always decay ghosts even when paused (looks nice)
  if (!running) {
    for (let i = 0; i < ghost.length; i++) {
      if (ghost[i] > 0) ghost[i] = Math.max(0, ghost[i] - 0.04);
    }
  }

  render();

  // FPS display every 30 frames
  if (fpsFrames >= 30) {
    const fps = Math.round(30000 / (ts - lastFpsTs));
    document.getElementById("statFps").textContent = fps;
    lastFpsTs = ts; fpsFrames = 0;
  }

  // Stats
  document.getElementById("statGen").textContent = generation.toLocaleString();
  document.getElementById("statPop").textContent = population.toLocaleString();
}

// ── Play / Pause ─────────────────────────────────────────────
const playBtn   = document.getElementById("playBtn");
const playIcon  = document.getElementById("playIcon");
const pauseIcon = document.getElementById("pauseIcon");
const playLabel = document.getElementById("playLabel");

function setPlaying(v) {
  running = v;
  playBtn.classList.toggle("active", v);
  playIcon .style.display = v ? "none"  : "";
  pauseIcon.style.display = v ? ""      : "none";
  playLabel.textContent   = v ? "Pause" : "Play";
}

playBtn.addEventListener("click", () => setPlaying(!running));

document.getElementById("stepBtn").addEventListener("click", () => {
  setPlaying(false);
  step();
});

document.getElementById("clearBtn").addEventListener("click", () => {
  setPlaying(false);
  alive.fill(0); age.fill(0); ghost.fill(0);
  generation = 0; population = 0;
});

document.getElementById("randomBtn").addEventListener("click", () => {
  for (let i = 0; i < alive.length; i++) {
    alive[i] = Math.random() < 0.3 ? 1 : 0;
    age[i]   = alive[i] ? (Math.random() * 50 | 0) : 0;
    ghost[i] = 0;
  }
  population = alive.reduce((s, v) => s + v, 0);
});

// ── Speed ────────────────────────────────────────────────────
document.querySelectorAll("#speedSeg .seg-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#speedSeg .seg-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    targetFps = parseInt(btn.dataset.fps) || 60;
  });
});

// ── Edge mode ────────────────────────────────────────────────
let edgeMode = "wrap";
document.querySelectorAll("#edgeSeg .seg-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#edgeSeg .seg-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    edgeMode = btn.dataset.edge;
  });
});

// ── Colour mode ──────────────────────────────────────────────
document.querySelectorAll("#colourSeg .seg-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#colourSeg .seg-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    colourMode = btn.dataset.mode;
  });
});

// ── Rule editor ──────────────────────────────────────────────
function buildBitRow(containerId, arr, onChange) {
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  for (let n = 0; n <= 8; n++) {
    const btn = document.createElement("button");
    btn.className = "bit-btn" + (arr[n] ? " on" : "");
    btn.textContent = n;
    btn.title = `${containerId === "bornBits" ? "Born" : "Survive"} with ${n} neighbours`;
    btn.addEventListener("click", () => {
      arr[n] = !arr[n];
      btn.classList.toggle("on", arr[n]);
      // deselect named-rule presets since we diverged
      document.querySelectorAll("#ruleSeg .seg-btn").forEach(b => b.classList.remove("active"));
      onChange();
    });
    el.appendChild(btn);
  }
}

function updateBitUI() {
  const bornEl    = document.getElementById("bornBits");
  const surviveEl = document.getElementById("surviveBits");
  [...bornEl.querySelectorAll(".bit-btn")].forEach((btn, n) =>
    btn.classList.toggle("on", born[n]));
  [...surviveEl.querySelectorAll(".bit-btn")].forEach((btn, n) =>
    btn.classList.toggle("on", survive[n]));
}

buildBitRow("bornBits",    born,    updateRuleDisplay);
buildBitRow("surviveBits", survive, updateRuleDisplay);

// Named rule presets
document.querySelectorAll("#ruleSeg .seg-btn").forEach(btn => {
  btn.addEventListener("click", () => applyRuleString(btn.dataset.rule));
});

applyRuleString("B3/S23");   // Conway default

// ── Patterns ─────────────────────────────────────────────────
// RLE-decoded cell lists: [col, row] offsets relative to center
const PATTERNS = {
  glider: [
    [0,-1],[1,0],[-1,1],[0,1],[1,1]
  ],

  pulsar: (() => {
    const cells = [];
    // Pulsar is symmetric across both axes: generate one quadrant and mirror
    const arm = [[2,1],[3,1],[4,1],[1,2],[1,3],[1,4],[5,2],[5,3],[5,4],[2,5],[3,5],[4,5]];
    for (const [c, r] of arm) {
      for (const sc of [1, -1]) for (const sr of [1, -1])
        cells.push([c * sc, r * sr]);
    }
    return cells;
  })(),

  gun: (() => {
    // Gosper Glider Gun (36-wide pattern), centered
    const rle = [
      [0,4],[1,4],[0,5],[1,5],
      [10,4],[10,5],[10,6],[11,3],[11,7],[12,2],[12,8],[13,2],[13,8],
      [14,5],[15,3],[15,7],[16,4],[16,5],[16,6],[17,5],
      [20,2],[20,3],[20,4],[21,2],[21,3],[21,4],[22,1],[22,5],
      [24,0],[24,1],[24,5],[24,6],
      [34,2],[34,3],[35,2],[35,3]
    ];
    // Center around col=17
    return rle.map(([c, r]) => [c - 17, r - 4]);
  })(),

  rpent: [
    [0,-1],[1,-1],[-1,0],[0,0],[0,1]
  ],

  diehard: [
    [6,-1],[0,0],[1,0],[1,1],[5,1],[6,1],[7,1]
  ],
};

function stampPattern(name) {
  const cells = PATTERNS[name];
  if (!cells) return;
  const mc = cols >> 1, mr = rows >> 1;
  for (const [dc, dr] of cells) {
    const c = mc + dc, r = mr + dr;
    if (c >= 0 && c < cols && r >= 0 && r < rows) {
      alive[idx(c, r)] = 1;
      age[idx(c, r)]   = 0;
    }
  }
  // Count
  population = alive.reduce((s, v) => s + v, 0);
}

document.querySelectorAll("#patternSeg .seg-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    setPlaying(false);
    stampPattern(btn.dataset.pattern);
  });
});

// ── Drawing ──────────────────────────────────────────────────
let drawing    = false;
let drawValue  = 1;    // 1 = paint, 0 = erase
let lastDrawCell = null;

function getCell(e) {
  const rect = canvas.getBoundingClientRect();
  const pt   = e.touches ? e.touches[0] : e;
  const x    = (pt.clientX - rect.left) * (canvas.width  / rect.width);
  const y    = (pt.clientY - rect.top ) * (canvas.height / rect.height);
  const c    = Math.floor(x / CELL);
  const r    = Math.floor(y / CELL);
  if (c >= 0 && c < cols && r >= 0 && r < rows) return { c, r };
  return null;
}

// Bresenham line between two cells
function drawLine(c0, r0, c1, r1) {
  let dc = Math.abs(c1-c0), dr = Math.abs(r1-r0);
  let sc = c0<c1?1:-1, sr = r0<r1?1:-1, err = dc-dr;
  let c = c0, r = r0;
  for (let step = 0; step < Math.max(dc,dr)+1; step++) {
    const i = idx(c, r);
    alive[i] = drawValue;
    if (!drawValue) { age[i] = 0; ghost[i] = 0.6; } else { age[i] = 0; }
    if (c===c1 && r===r1) break;
    const e2 = 2*err;
    if (e2 > -dr) { err -= dr; c += sc; }
    if (e2 <  dc) { err += dc; r += sr; }
  }
  population = alive.reduce((s, v) => s + v, 0);
}

function onDrawStart(e) {
  e.preventDefault();
  const cell = getCell(e);
  if (!cell) return;
  drawing = true;
  // Toggle: if cell is alive, erase mode; else paint mode
  drawValue = alive[idx(cell.c, cell.r)] ? 0 : 1;
  drawLine(cell.c, cell.r, cell.c, cell.r);
  lastDrawCell = cell;
  // Fade draw hint
  document.getElementById("drawHint").classList.add("hidden");
}

function onDrawMove(e) {
  if (!drawing) return;
  e.preventDefault();
  const cell = getCell(e);
  if (!cell) return;
  if (lastDrawCell)
    drawLine(lastDrawCell.c, lastDrawCell.r, cell.c, cell.r);
  else
    drawLine(cell.c, cell.r, cell.c, cell.r);
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
    case " ":
      e.preventDefault();
      setPlaying(!running);
      break;
    case ".":
    case "ArrowRight":
      setPlaying(false);
      step();
      break;
    case "c": case "C":
      alive.fill(0); age.fill(0); ghost.fill(0);
      generation = 0; population = 0;
      setPlaying(false);
      break;
    case "r": case "R":
      document.getElementById("randomBtn").click();
      break;
  }
});

// ── Keyboard hints ───────────────────────────────────────────
const hints = document.createElement("div");
hints.id = "keyhints";
hints.innerHTML =
  `Space &nbsp;Play/Pause<br>` +
  `. / → &nbsp;&nbsp;Step<br>` +
  `C &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Clear<br>` +
  `R &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Random`;
document.body.appendChild(hints);

// ── Init ─────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  const oldAlive = alive ? new Uint8Array(alive) : null;
  const oldCols  = cols, oldRows = rows;
  resizeCanvas();
  // Preserve existing cells if grid grew
  if (oldAlive && oldCols && oldRows) {
    const mc = Math.min(cols, oldCols), mr = Math.min(rows, oldRows);
    for (let r = 0; r < mr; r++)
      for (let c = 0; c < mc; c++)
        alive[idx(c,r)] = oldAlive[c + r * oldCols];
  }
  imgData = ctx.createImageData(canvas.width, canvas.height);
  pixels  = imgData.data;
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
});

resizeCanvas();
// Seed with a random start
document.getElementById("randomBtn").click();
requestAnimationFrame(tick);