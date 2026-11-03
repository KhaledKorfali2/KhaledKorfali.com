// js/facemesh.js
// MediaPipe FaceMesh initialisation, webcam lifecycle and per-frame orchestration

import { drawMesh, clearMesh } from "./mesh.js";
import { processGestures, onMouthOpen, onMouthClose, onLeftWink, onRightWink }
  from "./gestures.js";
import { updateCursorFromLandmark, setCursorDrawing, resetCursor } from "./cursor.js";
import { setTrackingHUD, setDrawHUD, showFlash } from "./hud.js";
import { drawTo, beginStroke, endStroke } from "./canvas.js";
import { getBrushSize } from "./ui.js";
import { nextColor, prevColor } from "./colors.js";

// Keep in sync with the pinned <script> tag in index.html so the JS glue and
// the WASM / model files it fetches always come from the same release.
const FACE_MESH_VERSION = "0.4.1633559619";

const videoEl    = document.getElementById("video");
const meshCanvas = document.getElementById("mesh-canvas");

let isDrawing = false;

// Singletons — re-used if the user retries after a camera error, so we never
// spin up a second WASM instance.
let faceMesh      = null;
let stream        = null;
let rafId         = 0;
let sending       = false;
let lastVideoTime = -1;

// ── Gesture bindings ──────────────────────────────────────────────────────────
function stopDrawing() {
  if (!isDrawing) return;
  isDrawing = false;
  setCursorDrawing(false);
  setDrawHUD(false);
  endStroke();
}

onMouthOpen(() => {
  isDrawing = true;
  setCursorDrawing(true);
  setDrawHUD(true);
  beginStroke();
});

onMouthClose(stopDrawing);

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
    stopDrawing();
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

// ── Errors with a user-facing explanation ────────────────────────────────────
export class FacePaintError extends Error {}

function describeCameraError(err) {
  switch (err && err.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access was blocked. Allow camera access for this site in your browser settings, then try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found. Connect a webcam and try again.";
    case "NotReadableError":
    case "AbortError":
      return "Your camera is in use by another app or tab. Close it and try again.";
    default:
      return "Couldn't start the camera" + (err && err.message ? ": " + err.message : ".");
  }
}

// ── Webcam ────────────────────────────────────────────────────────────────────
async function startCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new FacePaintError("This browser can't access a camera here (a secure https:// page and a modern browser are required).");
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
  } catch (err) {
    throw new FacePaintError(describeCameraError(err));
  }

  // If the camera is unplugged / revoked mid-session, tell the user.
  stream.getVideoTracks().forEach(track => {
    track.addEventListener("ended", () => {
      stopCamera();
      setTrackingHUD(false);
      showFlash("Camera disconnected", 3000);
    });
  });

  videoEl.srcObject = stream;
  try {
    await videoEl.play();
  } catch (err) {
    stopCamera();
    throw new FacePaintError("Couldn't play the camera feed" + (err && err.message ? ": " + err.message : "."));
  }

  lastVideoTime = -1;
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(frameLoop);
}

function frameLoop() {
  rafId = requestAnimationFrame(frameLoop);
  // One frame in flight at a time; skip duplicate video frames.
  if (sending || !faceMesh || videoEl.readyState < 2) return;
  if (videoEl.currentTime === lastVideoTime) return;
  lastVideoTime = videoEl.currentTime;

  sending = true;
  faceMesh.send({ image: videoEl })
    .catch(err => console.error("FaceMesh frame error:", err))
    .finally(() => { sending = false; });
}

export function stopCamera() {
  cancelAnimationFrame(rafId);
  rafId = 0;
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  videoEl.srcObject = null;
  stopDrawing();
}

// Always release the webcam when the page goes away (incl. bfcache).
window.addEventListener("pagehide", stopCamera);

// ── Initialise MediaPipe ──────────────────────────────────────────────────────
export async function initFaceMesh(onStatus = () => {}) {
  if (typeof window.FaceMesh !== "function") {
    throw new FacePaintError("The face-tracking library failed to load. Check your connection (or any content blocker) and reload the page.");
  }

  if (!faceMesh) {
    faceMesh = new window.FaceMesh({
      locateFile: file =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${FACE_MESH_VERSION}/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces:            1,
      refineLandmarks:        true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence:  0.5,
    });

    faceMesh.onResults(onResults);
  }

  onStatus("Loading face model…");
  try {
    if (typeof faceMesh.initialize === "function") await faceMesh.initialize();
  } catch (err) {
    console.error("FaceMesh initialise error:", err);
    try { faceMesh.close && faceMesh.close(); } catch (_) { /* ignore */ }
    faceMesh = null;
    throw new FacePaintError("The face model failed to load. Check your connection and try again.");
  }

  onStatus("Waiting for camera permission…");
  await startCamera();
}
