// Hand controls (pure logic, testable without a camera):
//   • drawing hand — aims with the point between thumb and index tip; pinch to paint
//   • other hand   — pinch and move up/down to change the brush size
// "Lefty" swaps the roles.
import { OneEuro2D } from "./filters.js";

const WRIST = 0, THUMB_TIP = 4, INDEX_TIP = 8, MIDDLE_MCP = 9;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The part of the camera frame that maps to the whole canvas, so you don't have
// to reach the very edge of the frame (where tracking is weakest) to reach the edge.
const BOX = { x0: 0.12, x1: 0.88, y0: 0.1, y1: 0.8 };

class Pinch {
  constructor() { this.on = false; this.openFrames = 0; this.closeFrames = 0; }
  update(d, onT, offT) {
    let ev = null;
    if (!this.on) {
      this.openFrames = d < onT ? this.openFrames + 1 : 0;
      if (this.openFrames >= 2) { this.on = true; this.closeFrames = 0; ev = "down"; }
    } else {
      this.closeFrames = d > offT ? this.closeFrames + 1 : 0;
      if (this.closeFrames >= 3) { this.on = false; this.openFrames = 0; ev = "up"; }
    }
    return ev;
  }
  reset() { const was = this.on; this.on = false; this.openFrames = this.closeFrames = 0; return was; }
}

/**
 * frame: { t, vw, vh, hands: [{ landmarks: [21×{x,y,z}], label: "Left"|"Right" }] }
 * Labels are as MediaPipe reports them, which assumes a mirrored (selfie) image; the raw
 * camera frame isn't mirrored, so a reported "Left" is the user's right hand.
 */
export class HandSignals {
  constructor(getSetting) {
    this.get = getSetting;
    this.filter = new OneEuro2D({ minCutoff: 1, beta: 6 });
    this.draw = new Pinch();
    this.size = new Pinch();
    this.sizeStartY = null;
    this.lostSince = null;
    this.applySmoothing();
  }

  applySmoothing() {
    const s = this.get("smoothing");
    this.filter.set({ minCutoff: lerp(2.2, 0.5, s), beta: lerp(14, 3, s) });
  }

  thresholds() {
    const s = this.get("pinchSensitivity");
    const on = lerp(0.24, 0.42, s);
    return { on, off: on * 1.45 };
  }

  /** Split visible hands into { draw, other } by handedness setting, labels and position. */
  roles(hands) {
    if (!hands?.length) return { draw: null, other: null };
    const lefty = this.get("dominantHand") === "left";
    const user = (h) => (h.label === "Left" ? "right" : h.label === "Right" ? "left" : null);
    const dom = lefty ? "left" : "right";
    if (hands.length === 1) return { draw: hands[0], other: null }; // one hand up: it draws
    let [a, b] = hands;
    if (user(a) === user(b) || !user(a) || !user(b)) {
      // Ambiguous labels: the user's right hand is on the image's left (raw, unmirrored frame).
      const wristX = (h) => h.landmarks[WRIST].x;
      const rightHand = wristX(a) < wristX(b) ? a : b;
      const leftHand = rightHand === a ? b : a;
      return dom === "right" ? { draw: rightHand, other: leftHand } : { draw: leftHand, other: rightHand };
    }
    return user(a) === dom ? { draw: a, other: b } : { draw: b, other: a };
  }

  update(frame) {
    const events = [];
    const { draw, other } = this.roles(frame.hands);
    const { on, off } = this.thresholds();
    const px = (L, i) => ({ x: L[i].x * (frame.vw || 640), y: L[i].y * (frame.vh || 480) });
    const pinchDist = (L) => {
      const scale = Math.max(Math.hypot(px(L, WRIST).x - px(L, MIDDLE_MCP).x, px(L, WRIST).y - px(L, MIDDLE_MCP).y), 1e-6);
      return Math.hypot(px(L, THUMB_TIP).x - px(L, INDEX_TIP).x, px(L, THUMB_TIP).y - px(L, INDEX_TIP).y) / scale;
    };

    // Drawing hand
    let out = { found: !!draw, events, pen: false, pinch: 0, x: 0, y: 0 };
    if (draw) {
      this.lostSince = null;
      const L = draw.landmarks;
      const d = pinchDist(L);
      const ev = this.draw.update(d, on, off);
      if (ev === "down") events.push("pen-down");
      if (ev === "up") events.push("pen-up");
      // Aim at the midpoint of thumb and index tips: it barely moves while pinching.
      const mx = 1 - (L[THUMB_TIP].x + L[INDEX_TIP].x) / 2, my = (L[THUMB_TIP].y + L[INDEX_TIP].y) / 2;
      const f = this.filter.filter(mx, my, frame.t);
      out.x = clamp(((f.x - BOX.x0) / (BOX.x1 - BOX.x0)) * 2 - 1, -1, 1);
      out.y = clamp(((f.y - BOX.y0) / (BOX.y1 - BOX.y0)) * 2 - 1, -1, 1);
      out.pen = this.draw.on;
      out.pinch = clamp((1 - d) / (1 - on), 0, 1.5);
    } else {
      this.lostSince ??= frame.t;
      if (this.draw.reset()) events.push("pen-up");
      if (frame.t - this.lostSince > 0.4) this.filter.reset();
    }

    // Other hand: pinch-and-drag vertically to resize the brush.
    if (other) {
      const L = other.landmarks;
      const y = (L[THUMB_TIP].y + L[INDEX_TIP].y) / 2;
      const ev = this.size.update(pinchDist(L), on, off);
      if (ev === "down") { this.sizeStartY = y; events.push("size-start"); }
      if (ev === "up") { this.sizeStartY = null; events.push("size-end"); }
      // Up = bigger. Half the frame height covers the whole size range.
      if (this.size.on && this.sizeStartY !== null) out.sizeDelta = (this.sizeStartY - y) * 2;
    } else if (this.size.reset()) {
      this.sizeStartY = null;
      events.push("size-end");
    }
    out.other = !!other;
    return out;
  }
}
