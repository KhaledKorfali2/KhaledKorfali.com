// js/mesh.js
// Face mesh overlay rendering on the mesh-canvas element

const meshCanvas = document.getElementById("mesh-canvas");
const meshCtx = meshCanvas.getContext("2d");
const canvasArea = document.getElementById("canvas-area");

// Landmark indices used for gesture detection
export const LM = {
    NOSE_TIP: 4,
    MOUTH_TOP: 13,   // inner upper lip
    MOUTH_BOT: 14,   // inner lower lip
    FACE_TOP: 10,   // top of forehead
    FACE_BOT: 152,  // chin

    // Left eye (viewer's left; right side of mirrored frame)
    L_EYE_TOP: [159, 160],
    L_EYE_BOT: [145, 144],
    L_EYE_L: 33,
    L_EYE_R: 133,

    // Right eye
    R_EYE_TOP: [386, 387],
    R_EYE_BOT: [374, 373],
    R_EYE_L: 362,
    R_EYE_R: 263,
};

// ── Resize ────────────────────────────────────────────────────────────────────
export function resizeMeshCanvas() {
    const rect = meshCanvas.getBoundingClientRect();
    meshCanvas.width = rect.width;
    meshCanvas.height = rect.height;
}

// ── Geometry helpers ──────────────────────────────────────────────────────────
export function dist(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Eye Aspect Ratio — vertical openness / horizontal width.
 * Returns a value ~0.25–0.35 when open, ~0.0–0.15 when closed/winking.
 */
export function eyeAspectRatio(landmarks, topIdxs, botIdxs, leftIdx, rightIdx) {
    const topAvg = {
        x: topIdxs.reduce((s, i) => s + landmarks[i].x, 0) / topIdxs.length,
        y: topIdxs.reduce((s, i) => s + landmarks[i].y, 0) / topIdxs.length,
    };
    const botAvg = {
        x: botIdxs.reduce((s, i) => s + landmarks[i].x, 0) / botIdxs.length,
        y: botIdxs.reduce((s, i) => s + landmarks[i].y, 0) / botIdxs.length,
    };
    const vert = dist(topAvg, botAvg);
    const horiz = dist(landmarks[leftIdx], landmarks[rightIdx]);
    return horiz > 0 ? vert / horiz : 0;
}

// ── Render ────────────────────────────────────────────────────────────────────
export function drawMesh(landmarks) {
    const rect = meshCanvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    // Camera feed is 640×480; object-fit:cover scales it to fill W×H
    // We need to know the actual rendered size and offset of the video
    const camAspect = 640 / 480;
    const canvasAspect = W / H;

    let scaleW, scaleH, offsetX, offsetY;
    if (canvasAspect > camAspect) {
        // Canvas is wider — video is pillarboxed vertically (top/bottom cropped)
        scaleW = W;
        scaleH = W / camAspect;
        offsetX = 0;
        offsetY = (H - scaleH) / 2;
    } else {
        // Canvas is taller — video is letterboxed horizontally (sides cropped)
        scaleH = H;
        scaleW = H * camAspect;
        offsetX = (W - scaleW) / 2;
        offsetY = 0;
    }

    meshCtx.clearRect(0, 0, meshCanvas.width, meshCanvas.height);

    // Mirror x to match flipped video, then apply cover offset
    function px(l) {
        return [
            (1 - l.x) * scaleW + offsetX,
            l.y * scaleH + offsetY,
        ];
    }

    // ── Tesselation (fine triangulation) ─────────────────────
    const tess = window.FACEMESH_TESSELATION || [];
    meshCtx.strokeStyle = "rgba(71,184,232,0.15)";
    meshCtx.lineWidth = 0.55;
    meshCtx.beginPath();
    for (const [a, b] of tess) {
        if (!landmarks[a] || !landmarks[b]) continue;
        const [ax, ay] = px(landmarks[a]);
        const [bx, by] = px(landmarks[b]);
        meshCtx.moveTo(ax, ay);
        meshCtx.lineTo(bx, by);
    }
    meshCtx.stroke();

    // ── Contour overlays ──────────────────────────────────────
    const contours = [
        { pts: window.FACEMESH_FACE_OVAL, color: "rgba(71,184,232,0.55)", w: 1.2 },
        { pts: window.FACEMESH_LEFT_EYE, color: "rgba(232,197,71,0.7)", w: 1.2 },
        { pts: window.FACEMESH_RIGHT_EYE, color: "rgba(232,197,71,0.7)", w: 1.2 },
        { pts: window.FACEMESH_LIPS, color: "rgba(232,93,93,0.65)", w: 1.2 },
        { pts: window.FACEMESH_LEFT_EYEBROW, color: "rgba(160,255,160,0.5)", w: 1.0 },
        { pts: window.FACEMESH_RIGHT_EYEBROW, color: "rgba(160,255,160,0.5)", w: 1.0 },
    ];

    for (const { pts, color, w } of contours) {
        if (!pts) continue;
        meshCtx.strokeStyle = color;
        meshCtx.lineWidth = w;
        meshCtx.beginPath();
        for (const [a, b] of pts) {
            if (!landmarks[a] || !landmarks[b]) continue;
            const [ax, ay] = px(landmarks[a]);
            const [bx, by] = px(landmarks[b]);
            meshCtx.moveTo(ax, ay);
            meshCtx.lineTo(bx, by);
        }
        meshCtx.stroke();
    }

    // ── Nose tip indicator ────────────────────────────────────
    const nose = landmarks[LM.NOSE_TIP];
    if (nose) {
        const [nx, ny] = px(nose);
        meshCtx.beginPath();
        meshCtx.arc(nx, ny, 5, 0, Math.PI * 2);
        meshCtx.fillStyle = "rgba(232,197,71,0.85)";
        meshCtx.fill();
    }
}

export function clearMesh() {
    meshCtx.clearRect(0, 0, meshCanvas.width, meshCanvas.height);
}