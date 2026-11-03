// js/main.js
// Entry point: startup overlay, camera permission, resize handling

import { initUI } from "./ui.js";
import { initFaceMesh, FacePaintError } from "./facemesh.js";
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

let starting = false;

startBtn.addEventListener("click", async () => {
  if (starting) return;
  starting = true;

  startBtn.style.display = "none";
  spinner.classList.add("active");
  loadingMsg.classList.remove("error");
  loadingMsg.textContent = "Loading face model…";

  try {
    await initFaceMesh(msg => { loadingMsg.textContent = msg; });
    startupEl.hidden = true;
    startupEl.style.display = "none";
    // Canvas-area size can differ once the overlay is gone on some layouts.
    handleResize();
  } catch (err) {
    spinner.classList.remove("active");
    startBtn.style.display = "block";
    startBtn.textContent   = "Try again →";
    loadingMsg.textContent = err instanceof FacePaintError
      ? err.message
      : "Something went wrong: " + (err && err.message ? err.message : String(err));
    loadingMsg.classList.add("error");
    startBtn.focus();
    console.error("FacePaint init error:", err);
  } finally {
    starting = false;
  }
});
