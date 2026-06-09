// js/main.js
// Entry point: startup overlay, camera permission, resize handling

import { initUI } from "./ui.js";
import { initFaceMesh } from "./facemesh.js";
import { resizeDrawCanvas } from "./canvas.js";
import { resizeMeshCanvas } from "./mesh.js";

// ── Resize handler ────────────────────────────────────────────────────────────
function handleResize() {
  resizeDrawCanvas();
  resizeMeshCanvas();
}
handleResize();
window.addEventListener("resize", handleResize);

// ── UI init (palette, sliders, toolbar) ──────────────────────────────────────
initUI();

// ── Startup overlay ───────────────────────────────────────────────────────────
const startBtn   = document.getElementById("startBtn");
const spinner    = document.getElementById("spinner");
const loadingMsg = document.getElementById("loading-msg");
const startupEl  = document.getElementById("startup");

startBtn.addEventListener("click", async () => {
  startBtn.style.display  = "none";
  spinner.classList.add("active");
  loadingMsg.textContent  = "Loading face model…";

  try {
    await initFaceMesh();
    startupEl.style.display = "none";
  } catch (err) {
    spinner.classList.remove("active");
    startBtn.style.display  = "block";
    loadingMsg.textContent  = "Error: " + err.message;
    loadingMsg.classList.add("error");
    console.error("FacePaint init error:", err);
  }
});