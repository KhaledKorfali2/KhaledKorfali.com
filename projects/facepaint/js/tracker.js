// Camera + MediaPipe Face Landmarker. Emits one frame object per new video frame.
// The bundle is pinned (see the import map in index.html, which also carries its SRI hash);
// the WASM runtime and model come from the same pinned release.
const VISION_VERSION = "0.10.35";
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`;
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export class TrackerError extends Error {}

const models = { face: null, hands: null }; // loaded lazily, kept for the session
let kind = "face";                           // which model runs each frame
let vision = null;
let fileset = null;
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
export const handConnections = () => vision?.HandLandmarker?.HAND_CONNECTIONS ?? null;

async function loadModel(which, onStatus) {
  if (models[which]) return;
  onStatus(which === "face" ? "Loading face tracker…" : "Loading hand tracker…");
  try {
    vision ??= await import("mediapipe-vision");
    fileset ??= await vision.FilesetResolver.forVisionTasks(WASM_BASE);
  } catch (e) {
    console.error(e);
    throw new TrackerError("The tracking library couldn't load. Check your connection (or any content blocker) and try again.");
  }
  const Task = which === "face" ? vision.FaceLandmarker : vision.HandLandmarker;
  const opts = (delegate) => which === "face" ? {
    baseOptions: { modelAssetPath: FACE_MODEL, delegate },
    runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true,
    minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  } : {
    baseOptions: { modelAssetPath: HAND_MODEL, delegate },
    runningMode: "VIDEO", numHands: 2,
    minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  };
  try {
    models[which] = await Task.createFromOptions(fileset, opts("GPU"));
  } catch (gpuErr) {
    // Some browsers/devices have no usable WebGL2 for the GPU delegate; the CPU path is slower but works.
    console.warn("GPU delegate unavailable, using CPU", gpuErr);
    try {
      models[which] = await Task.createFromOptions(fileset, opts("CPU"));
    } catch (e) {
      console.error(e);
      throw new TrackerError(`The ${which === "face" ? "face" : "hand"} model failed to load. Check your connection and try again.`);
    }
  }
}

/** Switch between face and hand tracking (loads the model the first time). */
export async function setKind(next, onStatus = () => {}) {
  await loadModel(next, onStatus);
  kind = next;
  lastTime = -1;
}
export const currentKind = () => kind;

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
  const model = models[kind];
  if (!model || video.readyState < 2 || document.hidden) return;
  if (video.currentTime === lastTime) return;
  lastTime = video.currentTime;
  const now = performance.now();
  let res;
  try { res = model.detectForVideo(video, now); } catch (e) { console.error(e); return; }
  if (kind === "hands") {
    const labels = res.handedness ?? res.handednesses ?? [];
    const hands = (res.landmarks || []).map((landmarks, i) => ({ landmarks, label: labels[i]?.[0]?.categoryName ?? null }));
    onFrame({ kind: "hands", t: now / 1000, hands, vw: video.videoWidth, vh: video.videoHeight });
    return;
  }
  const lm = res.faceLandmarks?.[0] || null;
  let blend = null;
  const cats = res.faceBlendshapes?.[0]?.categories;
  if (cats) {
    blend = {};
    for (const c of cats) if (c.categoryName === "jawOpen" || c.categoryName === "eyeBlinkLeft" || c.categoryName === "eyeBlinkRight") blend[c.categoryName] = c.score;
  }
  onFrame({ kind: "face", t: now / 1000, landmarks: lm, blend, vw: video.videoWidth, vh: video.videoHeight });
}

async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* not supported or denied: fine */ }
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && stream) keepAwake();
});

/** Load the model for `which`, open the camera and start emitting frames to `handler`. */
export async function start(handler, onStatus = () => {}, which = "face") {
  onFrame = handler;
  await setKind(which, onStatus);
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
