// js/canvas.js
// Drawing canvas management: resize, stroke drawing, undo, clear, save

import { currentColor } from "./colors.js";

const drawCanvas = document.getElementById("draw-canvas");
const drawCtx = drawCanvas.getContext("2d");
const canvasArea = document.getElementById("canvas-area");

// ── Undo stack ────────────────────────────────────────────────────────────────
const undoStack = [];
const MAX_UNDO = 20;

export function saveUndoFrame() {
    if (undoStack.length >= MAX_UNDO) undoStack.shift();
    undoStack.push(drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
}

export function undo() {
    if (undoStack.length === 0) return false;
    drawCtx.putImageData(undoStack.pop(), 0, 0);
    return true;
}

// ── Resize ────────────────────────────────────────────────────────────────────
export function resizeDrawCanvas() {
    const rect = drawCanvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // Snapshot existing content so it survives the resize
    let snap = null;
    if (drawCanvas.width > 0 && drawCanvas.height > 0) {
        snap = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
    }

    drawCanvas.width = w;
    drawCanvas.height = h;

    if (snap) drawCtx.putImageData(snap, 0, 0);
}

// ── Stroke state ──────────────────────────────────────────────────────────────
let lastX = null;
let lastY = null;
let strokeStarted = false;

export function beginStroke() {
    if (!strokeStarted) {
        saveUndoFrame();
        strokeStarted = true;
    }
}

export function endStroke() {
    lastX = null;
    lastY = null;
    strokeStarted = false;
}

/**
 * Draw a line segment to (x, y).
 * Uses quadratic interpolation through midpoints for smooth curves.
 * brushSize is passed in so canvas.js doesn't need to know about the UI.
 */
export function drawTo(x, y, brushSize) {
    if (lastX === null) {
        lastX = x;
        lastY = y;
        return;
    }

    const mx = (lastX + x) / 2;
    const my = (lastY + y) / 2;

    drawCtx.beginPath();
    drawCtx.moveTo(lastX, lastY);
    drawCtx.quadraticCurveTo(lastX, lastY, mx, my);
    drawCtx.strokeStyle = currentColor().hex;
    drawCtx.lineWidth = brushSize;
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";
    drawCtx.stroke();

    lastX = x;
    lastY = y;
}

// ── Clear ─────────────────────────────────────────────────────────────────────
export function clearCanvas() {
    saveUndoFrame();
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
}

// ── Save as PNG ───────────────────────────────────────────────────────────────
export function saveAsPNG() {
    const out = document.createElement("canvas");
    out.width = drawCanvas.width;
    out.height = drawCanvas.height;

    const oc = out.getContext("2d");
    oc.fillStyle = "#111118";
    oc.fillRect(0, 0, out.width, out.height);
    oc.drawImage(drawCanvas, 0, 0);

    const a = document.createElement("a");
    a.download = `facepaint_${Date.now()}.png`;
    a.href = out.toDataURL("image/png");
    a.click();
}