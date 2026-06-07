// js/gestures.js
// Gesture detection: mouth open/close, left wink, right wink
// All thresholds are configurable at runtime via setters.

import { LM, dist, eyeAspectRatio } from "./mesh.js";

// ── Configurable thresholds ───────────────────────────────────────────────────
let _mouthThresh = 0.06;   // mouth open ratio (mouth gap / face height)
let _winkThresh = 0.20;   // eye aspect ratio below this = winking
// Extra margin so one eye must be meaningfully more open than the other
const WINK_OPEN_MARGIN = 0.06;
const WINK_COOLDOWN_MS = 800;

export function setMouthThreshold(v) { _mouthThresh = v; }
export function setWinkThreshold(v) { _winkThresh = v; }

// ── Wink state ────────────────────────────────────────────────────────────────
let lastLeftWink = 0;
let lastRightWink = 0;
let leftWinkActive = false;
let rightWinkActive = false;

// ── Gesture event callbacks ───────────────────────────────────────────────────
let _onMouthOpen = null;
let _onMouthClose = null;
let _onLeftWink = null;
let _onRightWink = null;

export function onMouthOpen(cb) { _onMouthOpen = cb; }
export function onMouthClose(cb) { _onMouthClose = cb; }
export function onLeftWink(cb) { _onLeftWink = cb; }
export function onRightWink(cb) { _onRightWink = cb; }

// ── Internal state ────────────────────────────────────────────────────────────
let _mouthWasOpen = false;

/**
 * Process a single frame's landmarks and fire gesture callbacks.
 * Called by facemesh.js on every onResults frame.
 */
export function processGestures(landmarks) {
    // ── Mouth open ratio ──────────────────────────────────────
    const faceH = dist(landmarks[LM.FACE_TOP], landmarks[LM.FACE_BOT]);
    const mouthGap = dist(landmarks[LM.MOUTH_TOP], landmarks[LM.MOUTH_BOT]);
    const mouthOpen = faceH > 0 ? mouthGap / faceH : 0;
    const isOpen = mouthOpen > _mouthThresh;

    if (isOpen && !_mouthWasOpen) {
        _onMouthOpen && _onMouthOpen();
    } else if (!isOpen && _mouthWasOpen) {
        _onMouthClose && _onMouthClose();
    }
    _mouthWasOpen = isOpen;

    // ── Eye aspect ratios ─────────────────────────────────────
    const leftEAR = eyeAspectRatio(landmarks, LM.L_EYE_TOP, LM.L_EYE_BOT, LM.L_EYE_L, LM.L_EYE_R);
    const rightEAR = eyeAspectRatio(landmarks, LM.R_EYE_TOP, LM.R_EYE_BOT, LM.R_EYE_L, LM.R_EYE_R);

    const now = Date.now();

    // Left wink (face-left = screen-right in mirrored view)
    const leftWinking = leftEAR < _winkThresh;
    if (leftWinking && !leftWinkActive && now - lastLeftWink > WINK_COOLDOWN_MS) {
        if (rightEAR > _winkThresh + WINK_OPEN_MARGIN) {
            _onRightWink && _onRightWink();   // was _onLeftWink
            lastLeftWink = now;
        }
    }
    leftWinkActive = leftWinking;

    // Right wink (face-right = screen-left in mirrored view)
    const rightWinking = rightEAR < _winkThresh;
    if (rightWinking && !rightWinkActive && now - lastRightWink > WINK_COOLDOWN_MS) {
        if (leftEAR > _winkThresh + WINK_OPEN_MARGIN) {
            _onLeftWink && _onLeftWink();     // was _onRightWink
            lastRightWink = now;
        }
    }
    rightWinkActive = rightWinking;
}