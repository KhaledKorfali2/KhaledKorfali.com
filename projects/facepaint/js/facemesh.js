// js/facemesh.js
// MediaPipe FaceMesh initialisation and per-frame orchestration

import { drawMesh, clearMesh, resizeMeshCanvas } from "./mesh.js";
import { processGestures, onMouthOpen, onMouthClose, onLeftWink, onRightWink }
  from "./gestures.js";
import { updateCursorFromLandmark, setCursorDrawing, resetCursor } from "./cursor.js";
import { setTrackingHUD, setDrawHUD, showFlash } from "./hud.js";
import { drawTo, beginStroke, endStroke } from "./canvas.js";
import { getBrushSize } from "./ui.js";
import { nextColor, prevColor } from "./colors.js";

const videoEl    = document.getElementById("video");
const meshCanvas = document.getElementById("mesh-canvas");

let isDrawing   = false;
let meshVisible = true;   // kept in sync via the toggle in ui.js

// ── Gesture bindings ──────────────────────────────────────────────────────────
onMouthOpen(() => {
  isDrawing = true;
  setCursorDrawing(true);
  setDrawHUD(true);
  beginStroke();
});

onMouthClose(() => {
  isDrawing = false;
  setCursorDrawing(false);
  setDrawHUD(false);
  endStroke();
});

onLeftWink(() => {
  prevColor();
  showFlash("← Prev color");
});

onRightWink(() => {
  nextColor();
  showFlash("Next color →");
});

// ── Per-frame callback ────────────────────────────────────────────────────────
function onResults(results) {
  // No face detected
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    setTrackingHUD(false);
    if (isDrawing) {
      isDrawing = false;
      setCursorDrawing(false);
      setDrawHUD(false);
      endStroke();
    }
    resetCursor();
    clearMesh();
    return;
  }

  setTrackingHUD(true);

  const landmarks = results.multiFaceLandmarks[0];

  // Update smoothed cursor position
  const pos = updateCursorFromLandmark(landmarks);

  // Draw if mouth is open
  if (isDrawing && pos) {
    drawTo(pos.x, pos.y, getBrushSize());
  }

  // Process gestures (mouth open/close, winks)
  processGestures(landmarks);

  // Render mesh overlay (visibility controlled by ui.js via DOM class)
  if (!meshCanvas.classList.contains("hidden")) {
    drawMesh(landmarks);
  } else {
    clearMesh();
  }
}

// ── Initialise MediaPipe ──────────────────────────────────────────────────────
export async function initFaceMesh() {
  const faceMesh = new FaceMesh({
    locateFile: file =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  });

  faceMesh.setOptions({
    maxNumFaces:            1,
    refineLandmarks:        true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence:  0.5,
  });

  faceMesh.onResults(onResults);

  const camera = new Camera(videoEl, {
    onFrame: async () => { await faceMesh.send({ image: videoEl }); },
    width:  640,
    height: 480,
  });

  await camera.start();
}