import { Boid } from "./boid/boid.js";

// ── Canvas setup ──────────────────────────────────────────────
const canvas = document.getElementById("canvas");
const ctx    = canvas.getContext("2d");

// ── Settings DOM refs ─────────────────────────────────────────
const alignSlider     = document.getElementById("alignSlider");
const cohesionSlider  = document.getElementById("cohesionSlider");
const separationSlider = document.getElementById("separationSlider");
const velocitySlider  = document.getElementById("velocitySlider");
const countSlider     = document.getElementById("countSlider");
const trailToggle     = document.getElementById("trailToggle");
const barrierModeBtn  = document.getElementById("barrierModeBtn");
const eraserModeBtn   = document.getElementById("eraserModeBtn");
const clearBarriersBtn = document.getElementById("clearBarriersBtn");

const alignValue      = document.getElementById("alignValue");
const cohesionValue   = document.getElementById("cohesionValue");
const separationValue = document.getElementById("separationValue");
const velocityValue   = document.getElementById("velocityValue");
const countValue      = document.getElementById("countValue");

// ── Flock state ───────────────────────────────────────────────
let flock = [];
let NUM_BOIDS = parseInt(countSlider.value);

// ── Barrier state ─────────────────────────────────────────────
const CELL = 10;               // barrier grid cell size (px)
const barriers = new Set();    // "col,row" strings
let drawMode   = "none";       // "barrier" | "eraser" | "none"
let isDrawing  = false;

// ── Trail setting ─────────────────────────────────────────────
let useTrail = trailToggle ? trailToggle.checked : false;

// ── Spatial grid for O(n) neighbour lookup ────────────────────
const GRID_CELL = 80; // must be >= largest perception radius (75)
let spatialGrid  = new Map();

function gridKey(col, row) { return (col << 16) | (row & 0xffff); }

function buildSpatialGrid() {
  spatialGrid.clear();
  const w = canvas.clientWidth, h = canvas.clientHeight;
  for (const boid of flock) {
    const col = Math.floor(boid.position.x / GRID_CELL);
    const row = Math.floor(boid.position.y / GRID_CELL);
    const k   = gridKey(col, row);
    if (!spatialGrid.has(k)) spatialGrid.set(k, []);
    spatialGrid.get(k).push(boid);
  }
}

function getNeighbourCandidates(boid) {
  const col  = Math.floor(boid.position.x / GRID_CELL);
  const row  = Math.floor(boid.position.y / GRID_CELL);
  const out  = [];
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      const bucket = spatialGrid.get(gridKey(col + dc, row + dr));
      if (bucket) out.push(...bucket);
    }
  }
  return out;
}

// ── Barrier helpers ───────────────────────────────────────────
function barrierKey(col, row) { return `${col},${row}`; }

function paintBarrier(x, y, erase = false) {
  const col = Math.floor(x / CELL);
  const row = Math.floor(y / CELL);
  const key = barrierKey(col, row);
  if (erase) barriers.delete(key);
  else barriers.add(key);
}

function getBarrierNeighbours(boid, radius) {
  // Returns array of {x, y} cell centres near the boid
  const bx    = boid.position.x;
  const by    = boid.position.y;
  const cells = Math.ceil(radius / CELL);
  const bc    = Math.floor(bx / CELL);
  const br    = Math.floor(by / CELL);
  const hits  = [];
  for (let dc = -cells; dc <= cells; dc++) {
    for (let dr = -cells; dr <= cells; dr++) {
      if (barriers.has(barrierKey(bc + dc, br + dr))) {
        hits.push({
          x: (bc + dc) * CELL + CELL / 2,
          y: (br + dr) * CELL + CELL / 2,
        });
      }
    }
  }
  return hits;
}

// ── Resize ────────────────────────────────────────────────────
function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}

// ── Flock management ──────────────────────────────────────────
function spawnBoid() {
  return new Boid(
    Math.random() * canvas.width,
    Math.random() * canvas.height,
    0
  );
}

function resetFlock() {
  flock = Array.from({ length: NUM_BOIDS }, spawnBoid);
  applySlidersToBoids();
}

// Apply slider values to all boids (called on slider change, not every frame)
function applySlidersToBoids() {
  const align  = parseFloat(alignSlider.value);
  const cohese = parseFloat(cohesionSlider.value);
  const sep    = parseFloat(separationSlider.value);
  const speed  = parseFloat(velocitySlider.value);
  for (const b of flock) {
    b.alignFactor      = align;
    b.cohesionFactor   = cohese;
    b.separationFactor = sep;
    b.maxSpeed         = speed;
  }
}

// ── Colour by speed ───────────────────────────────────────────
function boidColor(boid) {
  const maxSpeed = parseFloat(velocitySlider.value);
  const speed    = Math.sqrt(
    boid.velocity.x ** 2 + boid.velocity.y ** 2
  );
  const t = Math.min(speed / maxSpeed, 1); // 0 = slow, 1 = fast
  // cool teal → warm coral
  const h = Math.round(180 - t * 150);     // 180 (cyan) → 30 (orange)
  const s = 70 + Math.round(t * 30);       // 70% → 100%
  const l = 55 + Math.round(t * 10);       // 55% → 65%
  return `hsl(${h},${s}%,${l}%)`;
}

// ── Draw barriers ─────────────────────────────────────────────
function drawBarriers() {
  ctx.save();
  for (const key of barriers) {
    const [c, r] = key.split(",").map(Number);
    // Solid fill
    ctx.fillStyle = "rgba(220,200,180,0.55)";
    ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    // Subtle border
    ctx.strokeStyle = "rgba(220,200,180,0.25)";
    ctx.lineWidth   = 0.5;
    ctx.strokeRect(c * CELL, r * CELL, CELL, CELL);
  }
  ctx.restore();
}

// ── Draw one boid ─────────────────────────────────────────────
function drawBoid(boid) {
  const angle = Math.atan2(boid.velocity.y, boid.velocity.x);
  ctx.save();
  ctx.translate(boid.position.x, boid.position.y);
  ctx.rotate(angle);
  ctx.fillStyle = boidColor(boid);
  ctx.beginPath();
  ctx.moveTo(12, 0);      // nose
  ctx.lineTo(-5, -4.5);   // back-left
  ctx.lineTo(-2, 0);      // tail notch
  ctx.lineTo(-5, 4.5);    // back-right
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ── Main draw loop ────────────────────────────────────────────
function draw() {
  const w = canvas.width, h = canvas.height;

  if (useTrail) {
    // Semi-transparent fade instead of full clear → motion trails
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, w, h);
  }

  drawBarriers();

  // Build spatial grid once per frame
  buildSpatialGrid();

  for (const boid of flock) {
    const neighbours = getNeighbourCandidates(boid);

    // Standard flocking
    boid.flock(neighbours);

    // Barrier avoidance — same shape as separation force
    const nearBarriers = getBarrierNeighbours(boid, 40);
    if (nearBarriers.length > 0) {
      let sx = 0, sy = 0;
      for (const b of nearBarriers) {
        const dx   = boid.position.x - b.x;
        const dy   = boid.position.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        sx += dx / (dist * dist);
        sy += dy / (dist * dist);
      }
      const mag = Math.sqrt(sx * sx + sy * sy) || 1;
      const nx  = sx / mag * boid.maxSpeed;
      const ny  = sy / mag * boid.maxSpeed;
      // Apply as a strong steering force
      const force = 2.2;
      boid.acceleration.x += Math.min(Math.max((nx - boid.velocity.x) * force, -boid.maxForce * 3), boid.maxForce * 3);
      boid.acceleration.y += Math.min(Math.max((ny - boid.velocity.y) * force, -boid.maxForce * 3), boid.maxForce * 3);
    }

    boid.edges();
    boid.update();
    drawBoid(boid);
  }

  requestAnimationFrame(draw);
}

// ── Slider wiring (fire only on input, not every frame) ───────
function wireSlider(slider, displayEl, onchange) {
  slider.addEventListener("input", () => {
    displayEl.textContent = slider.value;
    onchange(parseFloat(slider.value));
  });
}

wireSlider(alignSlider, alignValue, val => {
  for (const b of flock) b.alignFactor = val;
});
wireSlider(cohesionSlider, cohesionValue, val => {
  for (const b of flock) b.cohesionFactor = val;
});
wireSlider(separationSlider, separationValue, val => {
  for (const b of flock) b.separationFactor = val;
});
wireSlider(velocitySlider, velocityValue, val => {
  for (const b of flock) b.maxSpeed = val;
});
wireSlider(countSlider, countValue, val => {
  NUM_BOIDS = Math.round(val);
  // Grow or shrink flock without full reset
  while (flock.length < NUM_BOIDS) flock.push(spawnBoid());
  if (flock.length > NUM_BOIDS) flock.length = NUM_BOIDS;
  applySlidersToBoids();
});

// ── Trail toggle ──────────────────────────────────────────────
if (trailToggle) {
  trailToggle.addEventListener("change", () => {
    useTrail = trailToggle.checked;
  });
}

// ── Barrier draw mode buttons ─────────────────────────────────
function setDrawMode(mode) {
  drawMode = mode;
  barrierModeBtn.classList.toggle("active", mode === "barrier");
  eraserModeBtn.classList.toggle("active",  mode === "eraser");
  canvas.style.cursor = mode === "none" ? "default"
    : mode === "barrier" ? "crosshair" : "cell";
}

barrierModeBtn.addEventListener("click", () =>
  setDrawMode(drawMode === "barrier" ? "none" : "barrier")
);
eraserModeBtn.addEventListener("click", () =>
  setDrawMode(drawMode === "eraser" ? "none" : "eraser")
);
clearBarriersBtn.addEventListener("click", () => {
  barriers.clear();
});

// ── Canvas pointer events for barrier drawing ─────────────────
function pointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  const pt   = e.touches ? e.touches[0] : e;
  return { x: pt.clientX - rect.left, y: pt.clientY - rect.top };
}

canvas.addEventListener("mousedown", e => {
  if (drawMode === "none") return;
  isDrawing = true;
  const { x, y } = pointerPos(e);
  paintBarrier(x, y, drawMode === "eraser");
});
canvas.addEventListener("mousemove", e => {
  if (!isDrawing || drawMode === "none") return;
  const { x, y } = pointerPos(e);
  paintBarrier(x, y, drawMode === "eraser");
});
canvas.addEventListener("mouseup",   () => { isDrawing = false; });
canvas.addEventListener("mouseleave", () => { isDrawing = false; });

canvas.addEventListener("touchstart", e => {
  if (drawMode === "none") return;
  e.preventDefault();
  isDrawing = true;
  const { x, y } = pointerPos(e);
  paintBarrier(x, y, drawMode === "eraser");
}, { passive: false });
canvas.addEventListener("touchmove", e => {
  if (!isDrawing || drawMode === "none") return;
  e.preventDefault();
  const { x, y } = pointerPos(e);
  paintBarrier(x, y, drawMode === "eraser");
}, { passive: false });
canvas.addEventListener("touchend", () => { isDrawing = false; });

// ── Reset button ──────────────────────────────────────────────
document.getElementById("resetBtn").addEventListener("click", resetFlock);

// ── Settings dropdown toggle ──────────────────────────────────
const settingsBtn     = document.getElementById("settingsBtn");
const settingsContent = document.getElementById("settingsContent");
const arrowEl         = settingsBtn.querySelector(".arrow");

settingsBtn.addEventListener("click", () => {
  const open = settingsContent.classList.toggle("open");
  arrowEl.style.transform = open ? "rotate(180deg)" : "rotate(0deg)";
});

// ── Mode indicator ────────────────────────────────────────────
const modeIndicator = document.getElementById("modeIndicator");

function updateModeIndicator() {
  if (drawMode === "barrier") {
    modeIndicator.style.display = "block";
    modeIndicator.textContent   = "✏ Draw barriers — click and drag on canvas";
  } else if (drawMode === "eraser") {
    modeIndicator.style.display = "block";
    modeIndicator.textContent   = "⌫ Erase barriers — click and drag on canvas";
  } else {
    modeIndicator.style.display = "none";
  }
}

// Patch setDrawMode to also update indicator
const _setDrawMode = setDrawMode;
// Re-hook barrier buttons with indicator update
barrierModeBtn.addEventListener("click", updateModeIndicator);
eraserModeBtn.addEventListener("click",  updateModeIndicator);

// ── Init ──────────────────────────────────────────────────────
function setup() {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  resetFlock();
  // Initialise display values
  alignValue.textContent      = alignSlider.value;
  cohesionValue.textContent   = cohesionSlider.value;
  separationValue.textContent = separationSlider.value;
  velocityValue.textContent   = velocitySlider.value;
  countValue.textContent      = countSlider.value;
  draw();
}

setup();