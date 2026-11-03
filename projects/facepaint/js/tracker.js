// Camera + MediaPipe Face Landmarker. Emits one frame object per new video frame.
// The bundle is pinned (see the import map in index.html, which also carries its SRI hash);
// the WASM runtime and model come from the same pinned release.
const VISION_VERSION = "0.10.35";
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export class TrackerError extends Error {}

let landmarker = null;
let vision = null;
let stream = null;
let raf = 0;
let lastTime = -1;
let onFrame = () => {};
let wakeLock = null;
const video = document.createElement("video");
video.muted = true;
video.playsInline = true;
video.setAttribute("playsinline", "");

export const videoEl = video;
export const connections = () => vision?.FaceLandmarker ?? null;

async function loadModel(onStatus) {
  if (landmarker) return;
  onStatus("Loading face tracker…");
  try {
    vision = await import("mediapipe-vision");
  } catch (e) {
    console.error(e);
    throw new TrackerError("The face-tracking library couldn't load. Check your connection (or any content blocker) and try again.");
  }
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  try {
    landmarker = await vision.FaceLandmarker.createFromOptions(fileset, opts("GPU"));
  } catch (gpuErr) {
    // Some browsers/devices have no usable WebGL2 for the GPU delegate; the CPU path is slower but works.
    console.warn("GPU delegate unavailable, using CPU", gpuErr);
    try {
      landmarker = await vision.FaceLandmarker.createFromOptions(fileset, opts("CPU"));
    } catch (e) {
      console.error(e);
      throw new TrackerError("The face model failed to load. Check your connection and try again.");
    }
  }
}

function describeCameraError(err) {
  switch (err && err.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access was blocked. Allow the camera for this site in your browser's settings, then try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device.";
    case "NotReadableError":
    case "AbortError":
      return "Your camera is busy in another app or tab. Close it and try again.";
    default:
      return "Couldn't start the camera" + (err && err.message ? `: ${err.message}` : ".");
  }
}

async function startCamera(onStatus) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new TrackerError("This browser can't use a camera on this page. A modern browser and an https:// address are required.");
  }
  onStatus("Waiting for camera permission…");
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      audio: false,
    });
  } catch (err) {
    throw new TrackerError(describeCameraError(err));
  }
  stream.getVideoTracks().forEach((t) => t.addEventListener("ended", () => { stop(); onFrame({ ended: true }); }));
  video.srcObject = stream;
  try { await video.play(); } catch (err) {
    stop();
    throw new TrackerError("Couldn't play the camera feed" + (err && err.message ? `: ${err.message}` : "."));
  }
}

function loop() {
  raf = requestAnimationFrame(loop);
  if (!landmarker || video.readyState < 2 || document.hidden) return;
  if (video.currentTime === lastTime) return;
  lastTime = video.currentTime;
  const now = performance.now();
  let res;
  try { res = landmarker.detectForVideo(video, now); } catch (e) { console.error(e); return; }
  const lm = res.faceLandmarks?.[0] || null;
  let blend = null;
  const cats = res.faceBlendshapes?.[0]?.categories;
  if (cats) {
    blend = {};
    for (const c of cats) if (c.categoryName === "jawOpen" || c.categoryName === "eyeBlinkLeft" || c.categoryName === "eyeBlinkRight") blend[c.categoryName] = c.score;
  }
  onFrame({ t: now / 1000, landmarks: lm, blend, vw: video.videoWidth, vh: video.videoHeight });
}

async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* not supported or denied: fine */ }
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && stream) keepAwake();
});

/** Load the model, open the camera and start emitting frames to `handler`. */
export async function start(handler, onStatus = () => {}) {
  onFrame = handler;
  await loadModel(onStatus);
  await startCamera(onStatus);
  lastTime = -1;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
  keepAwake();
}

export function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
}

export const running = () => !!stream;

window.addEventListener("pagehide", stop);
