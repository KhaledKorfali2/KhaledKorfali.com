import { Boid } from "./boid/boid.js";

// ── Canvas ────────────────────────────────────────────────────────────────────
const canvas = document.getElementById("canvas");
const ctx    = canvas.getContext("2d");

// ── Settings DOM refs ─────────────────────────────────────────────────────────
const alignSlider      = document.getElementById("alignSlider");
const cohesionSlider   = document.getElementById("cohesionSlider");
const separationSlider = document.getElementById("separationSlider");
const velocitySlider   = document.getElementById("velocitySlider");
const countSlider      = document.getElementById("countSlider");
const trailToggle      = document.getElementById("trailToggle");
const barrierModeBtn   = document.getElementById("barrierModeBtn");
const eraserModeBtn    = document.getElementById("eraserModeBtn");
const clearBarriersBtn = document.getElementById("clearBarriersBtn");
const alignValue      = document.getElementById("alignValue");
const cohesionValue   = document.getElementById("cohesionValue");
const separationValue = document.getElementById("separationValue");
const velocityValue   = document.getElementById("velocityValue");
const countValue      = document.getElementById("countValue");

// ── Flock state ───────────────────────────────────────────────────────────────
let flock     = [];
let NUM_BOIDS = parseInt(countSlider.value);

// ── Barrier state ─────────────────────────────────────────────────────────────
const CELL     = 10;
const barriers = new Set();
let drawMode   = "none";
let isDrawing  = false;

// ── Trail ─────────────────────────────────────────────────────────────────────
let useTrail = trailToggle ? trailToggle.checked : false;

// ══════════════════════════════════════════════════════════════════════════════
// COLOUR PALETTE SYSTEM
// ══════════════════════════════════════════════════════════════════════════════
const PALETTES = [
  {
    id: "ocean", name: "Ocean Depths", bg: "#05080f",
    stops: [{ t:0,r:30,g:100,b:200 }, { t:0.5,r:20,g:190,b:210 }, { t:1,r:255,g:220,b:80 }]
  },
  {
    id: "reef", name: "Coral Reef", bg: "#060b0a",
    stops: [{ t:0,r:10,g:130,b:110 }, { t:0.45,r:255,g:130,b:40 }, { t:1,r:255,g:60,b:90 }]
  },
  {
    id: "biolum", name: "Bioluminescent", bg: "#020408",
    stops: [{ t:0,r:0,g:40,b:120 }, { t:0.5,r:0,g:200,b:180 }, { t:1,r:180,g:255,b:200 }]
  },
  {
    id: "lava", name: "Lava Flow", bg: "#080200",
    stops: [{ t:0,r:60,g:0,b:0 }, { t:0.5,r:220,g:60,b:0 }, { t:1,r:255,g:220,b:50 }]
  },
  {
    id: "aurora", name: "Aurora", bg: "#020508",
    stops: [{ t:0,r:0,g:60,b:80 }, { t:0.4,r:80,g:200,b:120 }, { t:0.75,r:180,g:100,b:220 }, { t:1,r:255,g:180,b:255 }]
  },
  {
    id: "custom", name: "Custom", bg: "#05080f",
    stops: [{ t:0,r:30,g:100,b:200 }, { t:0.5,r:20,g:190,b:210 }, { t:1,r:255,g:220,b:80 }]
  },
];

let activePaletteId = "ocean";
let bodyLUT  = new Array(256);   // pre-baked "rgb(...)" strings
let finLUT   = new Array(256);
let bgColor  = "#05080f";
let _trailColor = "rgba(5,8,15,0.18)";

function lerpStop(stops, t) {
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i+1].t) { lo = stops[i]; hi = stops[i+1]; break; }
  }
  const f = Math.max(0, Math.min(1, (t - lo.t) / (hi.t - lo.t || 1)));
  return { r: lo.r + (hi.r-lo.r)*f|0, g: lo.g + (hi.g-lo.g)*f|0, b: lo.b + (hi.b-lo.b)*f|0 };
}

function buildLUT(palette) {
  bgColor = palette.bg;
  const hex = bgColor.replace("#","");
  const br_ = parseInt(hex.slice(0,2),16), bg_ = parseInt(hex.slice(2,4),16), bb_ = parseInt(hex.slice(4,6),16);
  _trailColor = `rgba(${br_},${bg_},${bb_},0.18)`;

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const c = lerpStop(palette.stops, t);
    const br = Math.min(255, c.r*1.05+15|0), bg = Math.min(255, c.g*1.05+15|0), bb = Math.min(255, c.b*1.05+15|0);
    bodyLUT[i] = `rgb(${br},${bg},${bb})`;
    finLUT[i]  = `rgba(${c.r*.75|0},${c.g*.75|0},${c.b*.75|0},0.82)`;
  }

  // Rebuild eye canvases with new palette (eye tint from slow-colour)
  buildEyeSprites();
  renderPaletteUI();
}

function applyPalette(id) {
  activePaletteId = id;
  buildLUT(PALETTES.find(p => p.id === id) || PALETTES[0]);
}

const customPalette = PALETTES.find(p => p.id === "custom");
function setCustomStop(idx, hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  customPalette.stops[idx] = { ...customPalette.stops[idx], r, g, b };
  if (activePaletteId === "custom") buildLUT(customPalette);
}
function setCustomBg(hex) {
  customPalette.bg = hex;
  if (activePaletteId === "custom") buildLUT(customPalette);
}
function toHex(r,g,b) { return "#"+[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join(""); }

// ══════════════════════════════════════════════════════════════════════════════
// OFFSCREEN EYE SPRITES
// Pre-render sclera+pupil once; stamp with drawImage() — eliminates arc() per fish
// ══════════════════════════════════════════════════════════════════════════════
// EYE_R: the sclera radius in world px. We render at 2× for crisp subpixel look.
const EYE_R   = 1.7;
const EYE_SCALE = 3;          // offscreen canvas multiplier
const EYE_SIZE  = Math.ceil(EYE_R * 2 * EYE_SCALE) + 4;  // canvas side in px
let eyeSprite;                 // ImageBitmap or OffscreenCanvas fallback

function buildEyeSprites() {
  const oc  = new OffscreenCanvas(EYE_SIZE, EYE_SIZE);
  const oct = oc.getContext("2d");
  const cx  = EYE_SIZE / 2, cy = EYE_SIZE / 2;

  oct.clearRect(0, 0, EYE_SIZE, EYE_SIZE);

  // Sclera
  oct.beginPath();
  oct.arc(cx, cy, EYE_R * EYE_SCALE, 0, 6.2832);
  oct.fillStyle = "rgba(255,255,255,0.9)";
  oct.fill();

  // Pupil
  oct.beginPath();
  oct.arc(cx, cy, 0.85 * EYE_SCALE, 0, 6.2832);
  oct.fillStyle = "#0a0a0f";
  oct.fill();

  eyeSprite = oc;
}

// ══════════════════════════════════════════════════════════════════════════════
// DRAW-CALL BATCHER
// Instead of fill()-ing each part of each fish separately, we sort fish into
// LUT buckets and draw all fins then all bodies in colour-grouped passes.
// This halves the number of fillStyle assignments and path submissions.
// ══════════════════════════════════════════════════════════════════════════════
// We use a 32-bucket quantisation (256/8) so nearby-colour fish share a path.
const BATCH_BITS  = 3;           // 256 >> 3 = 32 colour buckets
const BATCH_COUNT = 256 >> BATCH_BITS;

// Each bucket holds an array of boid references; reset each frame
const finBatches  = Array.from({ length: BATCH_COUNT }, () => []);
const bodyBatches = Array.from({ length: BATCH_COUNT }, () => []);

function clearBatches() {
  for (let i = 0; i < BATCH_COUNT; i++) { finBatches[i].length = 0; bodyBatches[i].length = 0; }
}

// ══════════════════════════════════════════════════════════════════════════════
// SPATIAL GRID
// ══════════════════════════════════════════════════════════════════════════════
const GRID_CELL   = 80;
const spatialGrid = new Map();

function gridKey(col, row) { return (col << 16) | (row & 0xffff); }

function buildSpatialGrid() {
  spatialGrid.clear();
  for (let i = 0, len = flock.length; i < len; i++) {
    const b   = flock[i];
    const col = Math.floor(b.position.x / GRID_CELL);
    const row = Math.floor(b.position.y / GRID_CELL);
    const k   = gridKey(col, row);
    let bucket = spatialGrid.get(k);
    if (!bucket) { bucket = []; spatialGrid.set(k, bucket); }
    bucket.push(b);
  }
}

const _candidates = [];
function getCandidates(boid) {
  const col = Math.floor(boid.position.x / GRID_CELL);
  const row = Math.floor(boid.position.y / GRID_CELL);
  _candidates.length = 0;
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      const b = spatialGrid.get(gridKey(col+dc, row+dr));
      if (b) for (let j = 0; j < b.length; j++) _candidates.push(b[j]);
    }
  }
  return _candidates;
}

// ── Barrier helpers ───────────────────────────────────────────────────────────
function barrierKey(col, row) { return `${col},${row}`; }
function paintBarrier(x, y, erase=false) {
  const key = barrierKey(Math.floor(x/CELL), Math.floor(y/CELL));
  if (erase) barriers.delete(key); else barriers.add(key);
}
const _barrierHits = [];
function getBarrierNeighbours(boid) {
  _barrierHits.length = 0;
  if (barriers.size === 0) return _barrierHits;
  const bc = Math.floor(boid.position.x / CELL), br = Math.floor(boid.position.y / CELL);
  for (let dc = -4; dc <= 4; dc++)
    for (let dr = -4; dr <= 4; dr++)
      if (barriers.has(barrierKey(bc+dc, br+dr)))
        _barrierHits.push((bc+dc)*CELL+5, (br+dr)*CELL+5);
  return _barrierHits;
}

// ── Resize ────────────────────────────────────────────────────────────────────
function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }

// ── Flock management ──────────────────────────────────────────────────────────
function spawnBoid() { return new Boid(Math.random()*canvas.width, Math.random()*canvas.height, 0); }
function resetFlock() { flock = Array.from({ length: NUM_BOIDS }, spawnBoid); applySlidersToBoids(); }
function applySlidersToBoids() {
  const align=parseFloat(alignSlider.value), cohese=parseFloat(cohesionSlider.value),
        sep=parseFloat(separationSlider.value), speed=parseFloat(velocitySlider.value);
  for (const b of flock) { b.alignFactor=align; b.cohesionFactor=cohese; b.separationFactor=sep; b.maxSpeed=speed; }
}

// ══════════════════════════════════════════════════════════════════════════════
// FISH GEOMETRY — writes edges into boid's own Float32Arrays
// ══════════════════════════════════════════════════════════════════════════════
const BODY_WIDTHS = [2.2, 4.5, 6.2, 6.8, 6.0, 4.5, 2.8, 0.6];
const N_SEGS      = 8;

function computeEdges(boid) {
  const sx = boid.spineX, sy = boid.spineY;
  const lx = boid.leftX,  ly = boid.leftY;
  const rx = boid.rightX, ry = boid.rightY;

  for (let i = 0; i < N_SEGS; i++) {
    let tx, ty;
    if (i === 0)          { tx = sx[0]-sx[1];             ty = sy[0]-sy[1]; }
    else if (i===N_SEGS-1){ tx = sx[N_SEGS-2]-sx[N_SEGS-1]; ty = sy[N_SEGS-2]-sy[N_SEGS-1]; }
    else                  { tx = sx[i-1]-sx[i+1];         ty = sy[i-1]-sy[i+1]; }
    const inv = 1 / (Math.sqrt(tx*tx+ty*ty)||1);
    const px = -ty*inv, py = tx*inv;
    const w = BODY_WIDTHS[i];
    lx[i] = sx[i]+px*w; ly[i] = sy[i]+py*w;
    rx[i] = sx[i]-px*w; ry[i] = sy[i]-py*w;
  }
}

// ── Draw fins for one boid (no fillStyle change here — set outside) ───────────
function drawFins(boid) {
  const sx=boid.spineX, sy=boid.spineY;
  const lx=boid.leftX,  ly=boid.leftY;
  const rx=boid.rightX, ry=boid.rightY;

  // ── Tail — uses precomputed perpendicular from boid ────────────────────────
  // Tail direction: from second-to-last to last spine node
  const tdx = sx[N_SEGS-1]-sx[N_SEGS-2], tdy = sy[N_SEGS-1]-sy[N_SEGS-2];
  const tInv = 1/(Math.sqrt(tdx*tdx+tdy*tdy)||1);
  const tCos = tdx*tInv, tSin = tdy*tInv;
  const tPerpX = -tSin, tPerpY = tCos;
  const LOBE_LEN = 9, SPREAD_ALONG = 0.83, SPREAD_PERP = 0.55;
  // lobe tips via axis-angle decomposition — avoids atan2+cos+sin
  const tx1 = sx[N_SEGS-1] + tCos*SPREAD_ALONG*LOBE_LEN + tPerpX*SPREAD_PERP*LOBE_LEN;
  const ty1 = sy[N_SEGS-1] + tSin*SPREAD_ALONG*LOBE_LEN + tPerpY*SPREAD_PERP*LOBE_LEN;
  const tx2 = sx[N_SEGS-1] + tCos*SPREAD_ALONG*LOBE_LEN - tPerpX*SPREAD_PERP*LOBE_LEN;
  const ty2 = sy[N_SEGS-1] + tSin*SPREAD_ALONG*LOBE_LEN - tPerpY*SPREAD_PERP*LOBE_LEN;

  ctx.moveTo(lx[N_SEGS-2], ly[N_SEGS-2]);
  ctx.quadraticCurveTo(sx[N_SEGS-1], sy[N_SEGS-1], tx1, ty1);
  ctx.quadraticCurveTo(sx[N_SEGS-1], sy[N_SEGS-1], tx2, ty2);
  ctx.quadraticCurveTo(sx[N_SEGS-1], sy[N_SEGS-1], rx[N_SEGS-2], ry[N_SEGS-2]);

  // ── Pectoral fins — use boid's cached heading trig ─────────────────────────
  // Fin direction = spine direction at node 2, derived from spine delta
  const FIN_IDX = 2;
  const fdx = sx[FIN_IDX]-sx[FIN_IDX-1], fdy = sy[FIN_IDX]-sy[FIN_IDX-1];
  const fInv = 1/(Math.sqrt(fdx*fdx+fdy*fdy)||1);
  const fCos = fdx*fInv, fSin = fdy*fInv;
  // perpendicular + slight backward sweep (FIN_BACK ~0.6 rad baked in as ratio)
  // cos(π/2+0.6)≈-0.565, sin(π/2+0.6)≈0.825 — approximate as constant
  const FIN_LEN = 7;
  const FB_C = -0.565, FB_S = 0.825; // cos/sin of (90°+34°)
  // left fin tip: rotate (FB_C, FB_S) by fin heading
  const lfx = lx[FIN_IDX] + (fCos*FB_C - fSin*FB_S)*FIN_LEN;
  const lfy = ly[FIN_IDX] + (fSin*FB_C + fCos*FB_S)*FIN_LEN;
  // right fin tip: mirror (FB_C, -FB_S)
  const rfx = rx[FIN_IDX] + (fCos*FB_C + fSin*FB_S)*FIN_LEN;
  const rfy = ry[FIN_IDX] + (fSin*FB_C - fCos*FB_S)*FIN_LEN;

  ctx.moveTo(lx[FIN_IDX], ly[FIN_IDX]);
  ctx.quadraticCurveTo(sx[FIN_IDX], sy[FIN_IDX], lfx, lfy);
  ctx.quadraticCurveTo(sx[FIN_IDX+1], sy[FIN_IDX+1], lx[FIN_IDX], ly[FIN_IDX]);

  ctx.moveTo(rx[FIN_IDX], ry[FIN_IDX]);
  ctx.quadraticCurveTo(sx[FIN_IDX], sy[FIN_IDX], rfx, rfy);
  ctx.quadraticCurveTo(sx[FIN_IDX+1], sy[FIN_IDX+1], rx[FIN_IDX], ry[FIN_IDX]);

  // ── Dorsal fin ─────────────────────────────────────────────────────────────
  const ddx = sx[1]-sx[2], ddy = sy[1]-sy[2];
  const dInv = 1/(Math.sqrt(ddx*ddx+ddy*ddy)||1);
  const dPerpX = ddy*dInv, dPerpY = -ddx*dInv; // left-perp of dorsal segment
  const DORSAL_H = 5.5;
  const dtx = sx[2] - dPerpX*DORSAL_H; // note: dorsal is on left side
  const dty = sy[2] - dPerpY*DORSAL_H;

  ctx.moveTo(lx[1], ly[1]);
  ctx.quadraticCurveTo(dtx, dty, lx[3], ly[3]);
}

// ── Draw body outline for one boid ────────────────────────────────────────────
function drawBody(boid) {
  const lx=boid.leftX, ly=boid.leftY, rx=boid.rightX, ry=boid.rightY;
  ctx.moveTo(lx[0], ly[0]);
  for (let i = 1; i < N_SEGS-1; i++) {
    ctx.quadraticCurveTo(lx[i], ly[i], (lx[i]+lx[i+1])*0.5, (ly[i]+ly[i+1])*0.5);
  }
  ctx.lineTo(lx[N_SEGS-1], ly[N_SEGS-1]);
  ctx.lineTo(rx[N_SEGS-1], ry[N_SEGS-1]);
  for (let i = N_SEGS-2; i > 0; i--) {
    ctx.quadraticCurveTo(rx[i], ry[i], (rx[i]+rx[i-1])*0.5, (ry[i]+ry[i-1])*0.5);
  }
  ctx.closePath();
}

// ── Draw barriers ─────────────────────────────────────────────────────────────
function drawBarriers() {
  if (barriers.size === 0) return;
  ctx.fillStyle = "rgba(220,200,180,0.55)";
  for (const key of barriers) {
    const [c, r] = key.split(",").map(Number);
    ctx.fillRect(c*CELL, r*CELL, CELL, CELL);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN LOOP
// ══════════════════════════════════════════════════════════════════════════════
const EYE_HALF = EYE_SIZE / EYE_SCALE / 2;   // world-space half-size for drawImage

function draw() {
  const w = canvas.width, h = canvas.height;

  ctx.fillStyle = useTrail ? _trailColor : bgColor;
  ctx.fillRect(0, 0, w, h);

  drawBarriers();
  buildSpatialGrid();
  clearBatches();

  // ── Physics pass — update all boids, compute edges, bucket by colour ──────
  for (let i = 0, len = flock.length; i < len; i++) {
    const boid       = flock[i];
    const candidates = getCandidates(boid);

    boid.flock(candidates);

    const hits = getBarrierNeighbours(boid);
    const hl   = hits.length;
    if (hl > 0) {
      let bsx = 0, bsy = 0;
      for (let j = 0; j < hl; j += 2) {
        const dx = boid.position.x - hits[j], dy = boid.position.y - hits[j+1];
        const dist = Math.sqrt(dx*dx+dy*dy) || 0.001;
        bsx += dx/(dist*dist); bsy += dy/(dist*dist);
      }
      const mag = Math.sqrt(bsx*bsx+bsy*bsy)||1;
      const nx=(bsx/mag)*boid.maxSpeed, ny=(bsy/mag)*boid.maxSpeed;
      const mf3=boid.maxForce*3, force=2.2;
      boid.acceleration.x += Math.min(Math.max((nx-boid.velocity.x)*force,-mf3),mf3);
      boid.acceleration.y += Math.min(Math.max((ny-boid.velocity.y)*force,-mf3),mf3);
    }

    boid.edges();
    boid.update();
    computeEdges(boid);

    // Bucket by quantised colour index
    const ci     = Math.min(255, boid.colorT * 255 | 0);
    const bucket = ci >> BATCH_BITS;
    finBatches[bucket].push(boid);
    bodyBatches[bucket].push(boid);
  }

  // ── Render pass 1: all fins, grouped by colour bucket ─────────────────────
  for (let b = 0; b < BATCH_COUNT; b++) {
    const batch = finBatches[b];
    if (batch.length === 0) continue;
    const ci = (b << BATCH_BITS) + (1 << (BATCH_BITS-1)); // mid-bucket index
    ctx.fillStyle = finLUT[Math.min(255, ci)];
    ctx.beginPath();
    for (let i = 0; i < batch.length; i++) drawFins(batch[i]);
    ctx.fill();
  }

  // ── Render pass 2: all bodies, grouped by colour bucket ───────────────────
  for (let b = 0; b < BATCH_COUNT; b++) {
    const batch = bodyBatches[b];
    if (batch.length === 0) continue;
    const ci = (b << BATCH_BITS) + (1 << (BATCH_BITS-1));
    ctx.fillStyle = bodyLUT[Math.min(255, ci)];
    ctx.beginPath();
    for (let i = 0; i < batch.length; i++) drawBody(batch[i]);
    ctx.fill();
  }

  // ── Render pass 3: eyes — drawImage stamp (no arc() calls) ────────────────
  if (eyeSprite) {
    for (let i = 0, len = flock.length; i < len; i++) {
      const boid = flock[i];
      const ex = boid.spineX[0] + boid.headCos * 2.8 + boid.perpX * 2.5;
      const ey = boid.spineY[0] + boid.headSin * 2.8 + boid.perpY * 2.5;
      ctx.drawImage(eyeSprite,
        ex - EYE_HALF, ey - EYE_HALF,
        EYE_HALF * 2,  EYE_HALF * 2);
    }
  }

  requestAnimationFrame(draw);
}

// ══════════════════════════════════════════════════════════════════════════════
// PALETTE UI
// ══════════════════════════════════════════════════════════════════════════════
function renderPaletteUI() {
  document.querySelectorAll(".palette-chip").forEach(el => {
    el.classList.toggle("active", el.dataset.id === activePaletteId);
  });
  const ed = document.getElementById("customEditor");
  if (ed) ed.style.display = activePaletteId === "custom" ? "block" : "none";
}

function buildPaletteUI() {
  const container = document.getElementById("paletteContainer");
  if (!container) return;
  container.innerHTML = "";

  PALETTES.forEach(p => {
    const chip = document.createElement("button");
    chip.className  = "palette-chip";
    chip.dataset.id = p.id;
    chip.title      = p.name;
    const stops = p.stops.map(s=>`rgb(${s.r},${s.g},${s.b}) ${s.t*100}%`).join(", ");
    chip.style.background = `linear-gradient(135deg, ${stops})`;
    chip.innerHTML = `<span>${p.id === "custom" ? "Custom ✏" : p.name}</span>`;
    chip.addEventListener("click", () => applyPalette(p.id));
    container.appendChild(chip);
  });

  const editor = document.getElementById("customEditor");
  if (!editor) return;
  editor.innerHTML = `
    <div class="custom-row"><span class="custom-label">Background</span>
      <input type="color" class="color-pick" id="cpBg" value="${customPalette.bg}"></div>
    <div class="custom-row"><span class="custom-label">Slow colour</span>
      <input type="color" class="color-pick" id="cpStop0" value="${toHex(customPalette.stops[0].r,customPalette.stops[0].g,customPalette.stops[0].b)}"></div>
    <div class="custom-row"><span class="custom-label">Mid colour</span>
      <input type="color" class="color-pick" id="cpStop1" value="${toHex(customPalette.stops[1].r,customPalette.stops[1].g,customPalette.stops[1].b)}"></div>
    <div class="custom-row"><span class="custom-label">Fast colour</span>
      <input type="color" class="color-pick" id="cpStop2" value="${toHex(customPalette.stops[2].r,customPalette.stops[2].g,customPalette.stops[2].b)}"></div>`;

  document.getElementById("cpBg").addEventListener("input",    e => setCustomBg(e.target.value));
  document.getElementById("cpStop0").addEventListener("input", e => setCustomStop(0, e.target.value));
  document.getElementById("cpStop1").addEventListener("input", e => setCustomStop(1, e.target.value));
  document.getElementById("cpStop2").addEventListener("input", e => setCustomStop(2, e.target.value));
  editor.style.display = "none";
}

// ── Slider wiring ─────────────────────────────────────────────────────────────
function wireSlider(el, display, cb) {
  el.addEventListener("input", () => { display.textContent = el.value; cb(parseFloat(el.value)); });
}
wireSlider(alignSlider,      alignValue,      v => flock.forEach(b => b.alignFactor      = v));
wireSlider(cohesionSlider,   cohesionValue,   v => flock.forEach(b => b.cohesionFactor   = v));
wireSlider(separationSlider, separationValue, v => flock.forEach(b => b.separationFactor = v));
wireSlider(velocitySlider,   velocityValue,   v => flock.forEach(b => b.maxSpeed         = v));
wireSlider(countSlider, countValue, v => {
  NUM_BOIDS = Math.round(v);
  while (flock.length < NUM_BOIDS) flock.push(spawnBoid());
  if (flock.length > NUM_BOIDS) flock.length = NUM_BOIDS;
  applySlidersToBoids();
});

if (trailToggle) trailToggle.addEventListener("change", () => { useTrail = trailToggle.checked; });

// ── Barrier buttons ───────────────────────────────────────────────────────────
function setDrawMode(mode) {
  drawMode = mode;
  barrierModeBtn.classList.toggle("active", mode==="barrier");
  eraserModeBtn.classList.toggle("active",  mode==="eraser");
  canvas.style.cursor = mode==="none" ? "default" : mode==="barrier" ? "crosshair" : "cell";
  updateModeIndicator();
}
barrierModeBtn.addEventListener("click",   () => setDrawMode(drawMode==="barrier" ? "none" : "barrier"));
eraserModeBtn.addEventListener("click",    () => setDrawMode(drawMode==="eraser"  ? "none" : "eraser"));
clearBarriersBtn.addEventListener("click", () => barriers.clear());

function pointerPos(e) {
  const rect = canvas.getBoundingClientRect(), pt = e.touches ? e.touches[0] : e;
  return { x: pt.clientX-rect.left, y: pt.clientY-rect.top };
}
canvas.addEventListener("mousedown",  e => { if (!drawMode||drawMode==="none") return; isDrawing=true;  const p=pointerPos(e); paintBarrier(p.x,p.y,drawMode==="eraser"); });
canvas.addEventListener("mousemove",  e => { if (!isDrawing) return; const p=pointerPos(e); paintBarrier(p.x,p.y,drawMode==="eraser"); });
canvas.addEventListener("mouseup",    () => { isDrawing=false; });
canvas.addEventListener("mouseleave", () => { isDrawing=false; });
canvas.addEventListener("touchstart", e => { if (!drawMode||drawMode==="none") return; e.preventDefault(); isDrawing=true; const p=pointerPos(e); paintBarrier(p.x,p.y,drawMode==="eraser"); }, {passive:false});
canvas.addEventListener("touchmove",  e => { if (!isDrawing) return; e.preventDefault(); const p=pointerPos(e); paintBarrier(p.x,p.y,drawMode==="eraser"); }, {passive:false});
canvas.addEventListener("touchend",   () => { isDrawing=false; });

document.getElementById("resetBtn").addEventListener("click", resetFlock);

const settingsBtn     = document.getElementById("settingsBtn");
const settingsContent = document.getElementById("settingsContent");
const arrowEl         = settingsBtn.querySelector(".arrow");
settingsBtn.addEventListener("click", () => {
  const open = settingsContent.classList.toggle("open");
  arrowEl.style.transform = open ? "rotate(180deg)" : "rotate(0deg)";
});

const modeIndicator = document.getElementById("modeIndicator");
function updateModeIndicator() {
  if      (drawMode==="barrier") { modeIndicator.style.display="block"; modeIndicator.textContent="✏ Draw barriers — click and drag on canvas"; }
  else if (drawMode==="eraser")  { modeIndicator.style.display="block"; modeIndicator.textContent="⌫ Erase barriers — click and drag on canvas"; }
  else                           { modeIndicator.style.display="none"; }
}

// ── Init ──────────────────────────────────────────────────────────────────────
function setup() {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  resetFlock();
  applyPalette("ocean");   // also calls buildEyeSprites via buildLUT
  buildPaletteUI();
  alignValue.textContent      = alignSlider.value;
  cohesionValue.textContent   = cohesionSlider.value;
  separationValue.textContent = separationSlider.value;
  velocityValue.textContent   = velocitySlider.value;
  countValue.textContent      = countSlider.value;
  draw();
}

setup();