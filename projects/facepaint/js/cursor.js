// js/cursor.js
// Nose-tip cursor: smoothed position tracking and visual update
import { currentColor } from "./colors.js";
import { LM, getCoverTransform } from "./mesh.js";

const cursorEl = document.getElementById("cursor");
const canvasArea = document.getElementById("canvas-area");

let smoothX = null;
let smoothY = null;
let _alpha = 0.20;   // lerp factor — lower = smoother but laggier

export function setSmoothing(alpha) { _alpha = alpha; }

/**
 * Update cursor position from raw landmark coordinates.
 * Landmarks are normalised 0–1; we mirror x to match the flipped video.
 * Returns { x, y } in canvas-area pixel space.
 */
export function updateCursorFromLandmark(landmarks) {
    const nose = landmarks[LM.NOSE_TIP];
    if (!nose) return null;

    const rect = canvasArea.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    const { scaleW, scaleH, offsetX, offsetY } = getCoverTransform(W, H);

    const rawX = (1 - nose.x) * scaleW + offsetX;
    const rawY = nose.y * scaleH + offsetY;

    if (smoothX === null) { smoothX = rawX; smoothY = rawY; }
    smoothX += (rawX - smoothX) * _alpha;
    smoothY += (rawY - smoothY) * _alpha;

    cursorEl.style.left = smoothX + "px";
    cursorEl.style.top = smoothY + "px";
    cursorEl.style.borderColor = currentColor().hex;

    return { x: smoothX, y: smoothY };
}

export function setCursorDrawing(active) {
    cursorEl.classList.toggle("drawing", active);
}

export function resetCursor() {
    smoothX = null;
    smoothY = null;
}