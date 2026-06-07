// js/cursor.js
// Nose-tip cursor: smoothed position tracking and visual update

import { LM } from "./mesh.js";
import { currentColor } from "./colors.js";

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
    const camAspect = 640 / 480;
    const canvasAspect = W / H;

    let scaleW, scaleH, offsetX, offsetY;
    if (canvasAspect > camAspect) {
        scaleW = W; scaleH = W / camAspect;
        offsetX = 0; offsetY = (H - scaleH) / 2;
    } else {
        scaleH = H; scaleW = H * camAspect;
        offsetX = (W - scaleW) / 2; offsetY = 0;
    }

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