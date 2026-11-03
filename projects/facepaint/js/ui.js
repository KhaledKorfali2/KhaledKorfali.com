// js/ui.js
// All UI wiring: palette buttons, brush slider, sensitivity sliders, toolbar buttons

import { COLORS, setColorIdx, currentColorIdx, nextColor, prevColor, onColorChange }
  from "./colors.js";
import { clearCanvas, saveAsPNG, undo } from "./canvas.js";
import { setMouthThreshold, setWinkThreshold } from "./gestures.js";
import { setSmoothing } from "./cursor.js";
import { setColorHUD, showFlash } from "./hud.js";

// ── Color palette ─────────────────────────────────────────────────────────────
const paletteEl = document.getElementById("palette");

export function buildPalette() {
  COLORS.forEach((c, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "color-btn" + (i === 0 ? " active" : "");
    btn.style.background = c.hex;
    btn.title = c.name;
    btn.setAttribute("aria-label", c.name);
    btn.setAttribute("aria-pressed", i === 0 ? "true" : "false");
    btn.addEventListener("click", () => setColorIdx(i));
    paletteEl.appendChild(btn);
  });
}

function syncPaletteActive(idx) {
  document.querySelectorAll(".color-btn").forEach((b, i) => {
    b.classList.toggle("active", i === idx);
    b.setAttribute("aria-pressed", i === idx ? "true" : "false");
  });
}

// ── Brush size ────────────────────────────────────────────────────────────────
const brushSlider  = document.getElementById("brushSize");
const brushSizeVal = document.getElementById("brushSizeVal");
const brushDot     = document.getElementById("brushDot");

let _brushSize = 6;
export function getBrushSize() { return _brushSize; }

function updateBrushPreview(colorHex) {
  const size = Math.min(_brushSize * 2, 40);
  brushDot.style.width      = size + "px";
  brushDot.style.height     = size + "px";
  brushDot.style.background = colorHex || COLORS[currentColorIdx()].hex;
}

brushSlider.addEventListener("input", () => {
  _brushSize = parseInt(brushSlider.value);
  brushSizeVal.textContent = _brushSize;
  updateBrushPreview();
});

// ── Color change reactions ────────────────────────────────────────────────────
onColorChange((idx, colorObj) => {
  syncPaletteActive(idx);
  setColorHUD(colorObj);
  updateBrushPreview(colorObj.hex);
});

// ── Sensitivity sliders ───────────────────────────────────────────────────────
document.getElementById("mouthThresh").addEventListener("input", e => {
  const v = parseFloat(e.target.value);
  document.getElementById("mouthThreshVal").textContent = v.toFixed(3);
  setMouthThreshold(v);
});

document.getElementById("winkThresh").addEventListener("input", e => {
  const v = parseFloat(e.target.value);
  document.getElementById("winkThreshVal").textContent = v.toFixed(2);
  setWinkThreshold(v);
});

document.getElementById("smoothSlider").addEventListener("input", e => {
  const v = parseFloat(e.target.value);
  document.getElementById("smoothVal").textContent = v.toFixed(2);
  setSmoothing(v);
});

// ── Toolbar buttons ───────────────────────────────────────────────────────────
function doClear() {
  clearCanvas();
  showFlash("Canvas cleared — Undo to restore");
}

function doSave() {
  saveAsPNG();
  showFlash("Saved!");
}

function doUndo() {
  const ok = undo();
  showFlash(ok ? "Undo" : "Nothing to undo");
}

document.getElementById("clearBtn").addEventListener("click", doClear);
document.getElementById("saveBtn").addEventListener("click", doSave);
document.getElementById("undoBtn").addEventListener("click", doUndo);

// Mesh visibility toggle
const meshCanvas  = document.getElementById("mesh-canvas");
const meshToggle  = document.getElementById("meshToggle");
let meshVisible   = true;
function toggleMesh() {
  meshVisible = !meshVisible;
  meshCanvas.classList.toggle("hidden", !meshVisible);
  meshToggle.classList.toggle("active", meshVisible);
  meshToggle.setAttribute("aria-pressed", String(meshVisible));
}
meshToggle.addEventListener("click", toggleMesh);

// Camera visibility toggle (hides the video preview; tracking keeps running)
const videoEl   = document.getElementById("video");
const camToggle = document.getElementById("camToggle");
let camVisible  = true;
function toggleCam() {
  camVisible = !camVisible;
  videoEl.classList.toggle("hidden", !camVisible);
  camToggle.classList.toggle("active", camVisible);
  camToggle.setAttribute("aria-pressed", String(camVisible));
}
camToggle.addEventListener("click", toggleCam);

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
// Also a fallback for anyone who can't wink reliably.
document.addEventListener("keydown", e => {
  if (e.altKey || e.defaultPrevented) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;

  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (mod) {
    if (key === "z" && !e.shiftKey) { e.preventDefault(); doUndo(); }
    else if (key === "s") { e.preventDefault(); doSave(); }
    return;
  }

  switch (key) {
    case "[": case "arrowleft":  prevColor(); break;
    case "]": case "arrowright": nextColor(); break;
    case "z": doUndo();     break;
    case "m": toggleMesh(); break;
    case "v": toggleCam();  break;
    default: return;
  }
  e.preventDefault();
});

// ── Init ──────────────────────────────────────────────────────────────────────
export function initUI() {
  buildPalette();
  // Trigger initial sync so HUD and brush preview start correct
  setColorIdx(0);
  updateBrushPreview();
}