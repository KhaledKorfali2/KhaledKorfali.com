// ============================================================
//  PARTICLE SANDBOX — script.js
//  Supports: sand, water, fire, smoke, steam, wall, eraser
// ============================================================

// ── Physics constants ────────────────────────────────────────
const CELL_SIZE    = 5;
const GRAVITY      = 0.35;
const MAX_VELOCITY = 8;
const START_VEL    = 1;

// ── Particle type registry ───────────────────────────────────
// Each entry describes defaults and render color for that type.
const PARTICLE_TYPES = {
  sand:   { color: () => ({ h: 38,  s: 70,  l: 60  }) },
  water:  { color: () => ({ h: 210, s: 85,  l: 55  }) },
  fire:   { color: () => ({ h: 20 + rand(20), s: 100, l: 50 + rand(20) }) },
  smoke:  { color: () => ({ h: 220, s: 10,  l: 60  }) },
  steam:  { color: () => ({ h: 200, s: 30,  l: 80  }) },
  wall:   { color: () => ({ h: 0,   s: 0,   l: 30  }) },
};

// ── Helpers ──────────────────────────────────────────────────
function rand(n)          { return Math.random() * n | 0; }
function chance(p)        { return Math.random() < p; }
function inBounds(c, r)   { return c >= 0 && c < cols && r >= 0 && r < rows; }

function makeCell(type, extra = {}) {
  const color = PARTICLE_TYPES[type].color();
  return { type, velocity: START_VEL, life: 255, ...color, ...extra };
}

function getCell(g, c, r)      { return inBounds(c,r) ? g[c][r] : null; }
function setCell(g, c, r, v)   { if (inBounds(c,r)) g[c][r] = v; }
function isEmpty(g, c, r)      { return inBounds(c,r) && !g[c][r]; }
function isType(g, c, r, t)    { const p = getCell(g,c,r); return p && p.type === t; }
function isSolid(g, c, r)      {
  const p = getCell(g,c,r);
  return p && (p.type === "sand" || p.type === "wall");
}

// ── Canvas setup ─────────────────────────────────────────────
const canvas = document.getElementById("canvas");
const ctx    = canvas.getContext("2d");
let cols, rows, grid, nextGrid;

function make2D(c, r) {
  return Array.from({ length: c }, () => new Array(r).fill(null));
}

function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const vw  = window.innerWidth;
  const vh  = window.visualViewport ? window.visualViewport.height : window.innerHeight;

  canvas.width  = Math.floor(vw * dpr);
  canvas.height = Math.floor(vh * dpr);
  canvas.style.width  = vw + "px";
  canvas.style.height = vh + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  cols = Math.floor(vw / CELL_SIZE);
  rows = Math.floor(vh / CELL_SIZE);
  grid     = make2D(cols, rows);
  nextGrid = make2D(cols, rows);
}

// ── UI bindings ───────────────────────────────────────────────
const resetBtn       = document.getElementById("resetBtn");
const colorPicker    = document.getElementById("colorPicker");
const autoHueToggle  = document.getElementById("autoHueToggle");
const brushModeSelect= document.getElementById("brushMode");
const particleSelect = document.getElementById("particleType");

let selectedType   = "sand";
let brushMode      = "deposit";
let autoHueShift   = true;
let baseColorHSL   = { h: 38, s: 70, l: 60 };
let mousePressed   = false;

// Particle types that use the color picker / auto-hue
const COLORABLE = new Set(["sand", "wall"]);

resetBtn.addEventListener("click", () => {
  grid     = make2D(cols, rows);
  nextGrid = make2D(cols, rows);
});

autoHueToggle.addEventListener("change",
  () => autoHueShift = autoHueToggle.checked);

colorPicker.addEventListener("input", () => {
  baseColorHSL = hexToHSL(colorPicker.value);
});

brushModeSelect.addEventListener("change",
  () => brushMode = brushModeSelect.value);

particleSelect.addEventListener("change", () => {
  selectedType = particleSelect.value;
  // Show/hide color controls based on particle type
  const colorControls = document.getElementById("colorControls");
  if (colorControls) {
    colorControls.style.display = COLORABLE.has(selectedType) ? "flex" : "none";
  }
});

// ── Color helpers ─────────────────────────────────────────────
function hexToHSL(hex) {
  let r = parseInt(hex.slice(1,3),16)/255;
  let g = parseInt(hex.slice(3,5),16)/255;
  let b = parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h,s,l=(max+min)/2;
  if(max===min){ h=s=0; }
  else {
    const d=max-min;
    s=l>0.5?d/(2-max-min):d/(max+min);
    switch(max){
      case r: h=(g-b)/d+(g<b?6:0); break;
      case g: h=(b-r)/d+2;         break;
      case b: h=(r-g)/d+4;         break;
    }
    h*=60;
  }
  return { h:Math.round(h), s:Math.round(s*100), l:Math.round(l*100) };
}

// ── Input placement ───────────────────────────────────────────
function getPointerPos(e) {
  const rect  = canvas.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;
  return {
    x: point.clientX - rect.left,
    y: point.clientY - rect.top,
  };
}

function addParticles(e) {
  e.preventDefault();
  const { x, y } = getPointerPos(e);
  const mc = Math.floor(x / CELL_SIZE);
  const mr = Math.min(Math.floor(y / CELL_SIZE), rows - 1);

  const extent = selectedType === "wall" ? 3 : 2;
  const placedCols = new Set();

  for (let i = -extent; i <= extent; i++) {
    for (let j = -extent; j <= extent; j++) {
      if (chance(0.4)) continue;
      const col = mc + i;
      const row = mr + j;
      if (!inBounds(col, row)) continue;

      // ERASER
      if (selectedType === "eraser") {
        grid[col][row] = null;
        continue;
      }

      let extra = {};
      if (COLORABLE.has(selectedType)) {
        extra = { h: baseColorHSL.h, s: baseColorHSL.s, l: baseColorHSL.l };
      }

      if (brushMode === "surface" && selectedType === "sand") {
        if (placedCols.has(col)) continue;
        let yTop = Math.min(row, rows-1);
        while (yTop >= 0 && grid[col][yTop]) yTop--;
        if (yTop >= 0) {
          grid[col][yTop] = makeCell(selectedType, extra);
          placedCols.add(col);
        }
      } else {
        if (!grid[col][row]) {
          grid[col][row] = makeCell(selectedType, extra);
        }
      }
    }
  }

  if (autoHueShift && COLORABLE.has(selectedType)) {
    baseColorHSL.h = (baseColorHSL.h + 0.5) % 360;
  }
}

canvas.addEventListener("mousedown",  e => { mousePressed=true;  addParticles(e); });
canvas.addEventListener("mouseup",    () => mousePressed=false);
canvas.addEventListener("mousemove",  e => { if(mousePressed) addParticles(e); });
canvas.addEventListener("touchstart", e => { mousePressed=true;  addParticles(e); });
canvas.addEventListener("touchend",   () => mousePressed=false);
canvas.addEventListener("touchmove",  e => { if(mousePressed) addParticles(e); });

// ── Update functions ──────────────────────────────────────────

function updateSand(c, r, cell) {
  cell.velocity = Math.min(MAX_VELOCITY, cell.velocity + GRAVITY);
  const target  = Math.min(rows-1, Math.floor(r + cell.velocity));

  for (let y = r+1; y <= target; y++) {
    if (isEmpty(nextGrid, c, y)) {
      setCell(nextGrid, c, y, cell);
      return;
    }
    const dir = chance(0.5) ? 1 : -1;
    for (const d of [dir, -dir]) {
      if (isEmpty(nextGrid, c+d, y) && !isSolid(grid, c+d, y-1)) {
        setCell(nextGrid, c+d, y, cell);
        return;
      }
    }
    break;
  }

  // didn't move
  cell.velocity = START_VEL;
  setCell(nextGrid, c, r, cell);
}

function updateWater(c, r, cell) {
  cell.velocity = Math.min(MAX_VELOCITY, cell.velocity + GRAVITY);
  const target  = Math.min(rows-1, Math.floor(r + cell.velocity));
  let moved     = false;

  // try falling
  for (let y = r+1; y <= target; y++) {
    if (isEmpty(nextGrid, c, y)) {
      setCell(nextGrid, c, y, cell);
      moved = true;
      break;
    }
    // try diagonal
    const dir = chance(0.5) ? 1 : -1;
    for (const d of [dir, -dir]) {
      if (isEmpty(nextGrid, c+d, y)) {
        setCell(nextGrid, c+d, y, cell);
        moved = true;
        break;
      }
    }
    if (moved) break;
  }

  if (!moved) {
    // flow sideways (further than sand)
    const spread = 4;
    const dir = chance(0.5) ? 1 : -1;
    for (let dx = 1; dx <= spread; dx++) {
      const nc = c + dir*dx;
      if (!isEmpty(nextGrid, nc, r)) break;
      // check it won't float over a gap
      if (isEmpty(nextGrid, nc, r+1)) {
        setCell(nextGrid, nc, r, { ...cell, velocity: START_VEL });
        moved = true;
        break;
      }
      setCell(nextGrid, nc, r, { ...cell, velocity: START_VEL });
      moved = true;
      break;
    }
  }

  if (!moved) {
    cell.velocity = START_VEL;
    setCell(nextGrid, c, r, cell);
  }
}

function updateFire(c, r, cell) {
  // Fire rises slightly, flickers, has a life counter
  cell.life -= 1 + rand(3);

  if (cell.life <= 0) {
    // burn out → sometimes leave smoke
    if (chance(0.3)) {
      setCell(nextGrid, c, r, makeCell("smoke"));
    }
    return;
  }

  // Spread to adjacent flammable neighbors (water → steam, nothing adjacent)
  for (const [dc, dr] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nc = c+dc, nr = r+dr;
    if (isType(grid, nc, nr, "water") && chance(0.05)) {
      setCell(nextGrid, nc, nr, makeCell("steam"));
    }
  }

  // Flicker hue/lightness every frame
  cell.h = 15 + rand(30);
  cell.l = 45 + rand(30);

  // Rise upward with some spread
  const upRow = r - 1;
  if (upRow >= 0 && isEmpty(nextGrid, c, upRow) && chance(0.6)) {
    setCell(nextGrid, c, upRow, { ...cell });
    // also spawn smoke above fire
    if (chance(0.15) && isEmpty(nextGrid, c, upRow-1)) {
      setCell(nextGrid, c, upRow-1, makeCell("smoke"));
    }
  } else {
    setCell(nextGrid, c, r, cell);
  }
}

function updateSmoke(c, r, cell) {
  cell.life -= 1;
  if (cell.life <= 0) return; // dissipate

  // Drift upward + sideways randomly
  const upRow = r - 1;
  const sway  = rand(3) - 1; // -1, 0, or 1

  const nc = c + sway;
  const nr = upRow;

  if (isEmpty(nextGrid, nc, nr)) {
    setCell(nextGrid, nc, nr, cell);
  } else if (isEmpty(nextGrid, c, nr)) {
    setCell(nextGrid, c, nr, cell);
  } else {
    setCell(nextGrid, c, r, cell);
  }
}

function updateSteam(c, r, cell) {
  cell.life -= 1;
  if (cell.life <= 0) {
    // steam condenses back to water occasionally
    if (chance(0.1) && inBounds(c, r)) {
      setCell(nextGrid, c, r, makeCell("water"));
    }
    return;
  }

  // Rise upward, spread sideways
  const sway  = rand(3) - 1;
  const nc    = c + sway;
  const upRow = r - 1;

  if (isEmpty(nextGrid, nc, upRow)) {
    setCell(nextGrid, nc, upRow, cell);
  } else if (isEmpty(nextGrid, c, upRow)) {
    setCell(nextGrid, c, upRow, cell);
  } else {
    setCell(nextGrid, c, r, cell);
  }
}

// ── Main simulation step ──────────────────────────────────────
function simulate() {
  nextGrid = make2D(cols, rows);

  // Iterate bottom-up so falling particles don't double-move.
  // For rising particles (fire/smoke) we iterate top-down inside their fn.
  for (let r = rows-1; r >= 0; r--) {
    // Randomise column order each row to avoid directional bias
    const order = Array.from({length: cols}, (_,i) => i);
    for (let i = order.length-1; i > 0; i--) {
      const j = rand(i+1);
      [order[i], order[j]] = [order[j], order[i]];
    }

    for (const c of order) {
      const cell = grid[c][r];
      if (!cell || nextGrid[c][r] === cell) continue;

      switch (cell.type) {
        case "sand":  updateSand(c, r, { ...cell }); break;
        case "water": updateWater(c, r, { ...cell }); break;
        case "fire":  updateFire(c, r, { ...cell }); break;
        case "smoke": updateSmoke(c, r, { ...cell }); break;
        case "steam": updateSteam(c, r, { ...cell }); break;
        case "wall":  setCell(nextGrid, c, r, cell); break; // immovable
      }
    }
  }

  grid = nextGrid;
}

// ── Render ────────────────────────────────────────────────────
function render() {
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, canvas.width / (window.devicePixelRatio||1),
                     canvas.height / (window.devicePixelRatio||1));

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const cell = grid[c][r];
      if (!cell) continue;

      let alpha = 1;
      if ((cell.type === "smoke" || cell.type === "steam") && cell.life < 60) {
        alpha = cell.life / 60;
      }
      if (cell.type === "fire") {
        alpha = Math.min(1, cell.life / 40);
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle   = `hsl(${cell.h},${cell.s}%,${cell.l}%)`;
      ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }
  }
  ctx.globalAlpha = 1;
}

// ── Loop ──────────────────────────────────────────────────────
function loop() {
  simulate();
  render();
  requestAnimationFrame(loop);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
loop();