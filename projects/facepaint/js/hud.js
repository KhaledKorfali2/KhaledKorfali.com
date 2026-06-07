// js/hud.js
// HUD updates and gesture flash notifications

// ── Drawing status ────────────────────────────────────────────────────────────
const hudDraw    = document.getElementById("hud-draw");
const hudDrawVal = document.getElementById("hud-draw-val");

export function setDrawHUD(on) {
  hudDrawVal.textContent = on ? "ON" : "OFF";
  hudDraw.className = "hud-pill " + (on ? "draw-on" : "draw-off");
}

// ── Tracking status ───────────────────────────────────────────────────────────
const hudTrack    = document.getElementById("hud-track");
const hudTrackVal = document.getElementById("hud-track-val");

export function setTrackingHUD(on) {
  hudTrackVal.textContent = on ? "Active" : "Lost";
  hudTrack.className = "hud-pill " + (on ? "tracking-on" : "tracking-off");
}

// ── Color display ─────────────────────────────────────────────────────────────
const hudSwatch    = document.getElementById("hud-swatch");
const hudColorName = document.getElementById("hud-color-name");

export function setColorHUD(colorObj) {
  hudSwatch.style.background = colorObj.hex;
  hudColorName.textContent   = colorObj.name;
}

// ── Gesture flash ─────────────────────────────────────────────────────────────
const flashEl = document.getElementById("gesture-flash");
let flashTimer = null;

export function showFlash(msg, durationMs = 1500) {
  flashEl.textContent = msg;
  flashEl.classList.add("show");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => flashEl.classList.remove("show"), durationMs);
}