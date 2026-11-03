// Turns raw face-tracking frames into the three things FacePaint needs:
//   • pointer — how far the nose has moved from its calibrated resting spot
//               (turning or leaning), scaled by eye distance so camera distance doesn't matter
//   • pen     — mouth open / closed, with hysteresis so strokes don't flicker
//   • winks   — one eye closed while the other stays open (blinks are ignored)
// Pure logic, no DOM: easy to test with synthetic frames.
import { OneEuro2D } from "./filters.js";

// MediaPipe face-landmark indices (image coordinates; "image-left" is the subject's right).
const NOSE = 1;
const EYE_IL = { outer: 33, inner: 133, top: [159, 158], bottom: [145, 153] };   // image-left eye
const EYE_IR = { outer: 263, inner: 362, top: [386, 385], bottom: [374, 380] };  // image-right eye
const LIP_TOP = 13, LIP_BOTTOM = 14, MOUTH_L = 78, MOUTH_R = 308;

const lerp = (a, b, t) => a + (b - a) * t;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * frame: { t: seconds, landmarks: [{x,y,z}] normalised to the video, vw, vh,
 *          blend?: { jawOpen, eyeBlinkLeft, eyeBlinkRight } }  — landmarks null when no face.
 */
export class FaceSignals {
  constructor(getSetting) {
    this.get = getSetting;
    this.filter = new OneEuro2D({ minCutoff: 1, beta: 3 });
    this.neutral = null; // { x, y, eyeDist } — resting nose position in video pixels
    this.base = { jaw: 0.02, earL: 0.28, earR: 0.28, blinkL: 0.05, blinkR: 0.05 };
    this.calibrated = false;
    this.cal = null;
    this.pen = false;
    this.openFrames = 0;
    this.closeFrames = 0;
    this.wink = { side: null, since: 0, armed: true };
    this.lostSince = null;
    this.applySmoothing();
  }

  applySmoothing() {
    const s = this.get("smoothing");
    this.filter.set({ minCutoff: lerp(1.5, 0.25, s), beta: lerp(4, 0.8, s) });
  }

  /** Start collecting a neutral pose. full=false only re-centres the pointer. */
  calibrate(durationMs = 1500, full = true) {
    this.cal = { until: null, durationMs, full, xs: [], ys: [], jaw: [], earL: [], earR: [], bl: [], br: [] };
  }
  get calibrating() { return !!this.cal; }
  get calibrationProgress() {
    if (!this.cal || this.cal.until === null) return 0;
    return clamp(1 - (this.cal.until - this.cal.lastT) / (this.cal.durationMs / 1000), 0, 1);
  }

  thresholds() {
    const sens = this.get("mouthSensitivity");
    const on = this.base.jaw + lerp(0.32, 0.09, sens);
    return { on, off: this.base.jaw + (on - this.base.jaw) * 0.55 };
  }

  update(frame) {
    const events = [];
    if (!frame.landmarks) {
      this.lostSince ??= frame.t;
      if (this.pen) { this.pen = false; events.push("pen-up"); }
      this.openFrames = this.closeFrames = 0;
      if (frame.t - this.lostSince > 0.5) this.filter.reset();
      return { face: false, events, pen: this.pen, mouth: 0 };
    }
    this.lostSince = null;
    const m = measure(frame);

    // Calibration: gather a neutral pose, then take medians (robust to a stray blink).
    if (this.cal) {
      const c = this.cal;
      c.lastT = frame.t;
      if (c.until === null) c.until = frame.t + c.durationMs / 1000;
      c.xs.push(m.noseX); c.ys.push(m.noseY); (c.ed ||= []).push(m.eyeDist);
      c.jaw.push(m.jaw); c.earL.push(m.earL); c.earR.push(m.earR); c.bl.push(m.blinkL); c.br.push(m.blinkR);
      if (frame.t >= c.until && c.xs.length >= 5) {
        this.neutral = { x: median(c.xs), y: median(c.ys), eyeDist: median(c.ed) };
        if (c.full) {
          this.base = { jaw: Math.min(median(c.jaw), 0.25), earL: median(c.earL), earR: median(c.earR),
            blinkL: Math.min(median(c.bl), 0.5), blinkR: Math.min(median(c.br), 0.5) };
        }
        this.calibrated = true;
        this.cal = null;
        this.filter.reset();
        events.push("calibrated");
      }
    }

    // Pointer: nose displacement from rest, in eye-distances → [-1, 1] across the canvas.
    // At the default reach the canvas edge is about one eye-distance of nose travel —
    // a comfortable turn or lean (real use showed ~0.35 was far too twitchy). Nodding
    // has less range than turning, so y gets a little more gain.
    // Mirrored horizontally so turning left moves the brush left, like a mirror.
    const n = this.neutral || { x: m.noseX, y: m.noseY, eyeDist: m.eyeDist };
    if (!this.neutral) this.neutral = n;
    const reach = this.get("reach");
    const f = this.filter.filter((m.noseX - n.x) / n.eyeDist, (m.noseY - n.y) / n.eyeDist, frame.t);
    const x = clamp(-f.x * reach * 0.45, -1, 1);
    const y = clamp(f.y * reach * 0.62, -1, 1);

    // Mouth → pen, with hysteresis and a few frames of debounce.
    const { on, off } = this.thresholds();
    if (!this.pen) {
      this.openFrames = m.jaw > on ? this.openFrames + 1 : 0;
      if (this.openFrames >= 2) { this.pen = true; this.closeFrames = 0; events.push("pen-down"); }
    } else {
      this.closeFrames = m.jaw < off ? this.closeFrames + 1 : 0;
      if (this.closeFrames >= 3) { this.pen = false; this.openFrames = 0; events.push("pen-up"); }
    }
    const mouth = clamp((m.jaw - this.base.jaw) / (on - this.base.jaw), 0, 1.5);

    // Winks: one eye shut while the other is open, held briefly. A blink closes both → ignored.
    if (this.get("winks") && !this.cal) {
      const w = this.detectWink(m, frame.t);
      if (w) events.push(w);
    }
    return { face: true, events, pen: this.pen, mouth, x, y, onThreshold: on, offThreshold: off };
  }

  detectWink(m, t) {
    // Closure 0..1 per image side: blendshapes when available (more reliable), geometry otherwise.
    const geoL = clamp(1 - m.earL / Math.max(this.base.earL, 0.05), 0, 1);
    const geoR = clamp(1 - m.earR / Math.max(this.base.earR, 0.05), 0, 1);
    let cl = geoL, cr = geoR;
    if (m.blinkA != null) {
      // Blendshape naming vs. image side varies between models, so pair each blendshape
      // with the eye whose geometry agrees, then use the blendshape strength.
      const a = clamp((m.blinkA - this.base.blinkL) / (1 - this.base.blinkL), 0, 1);
      const b = clamp((m.blinkB - this.base.blinkR) / (1 - this.base.blinkR), 0, 1);
      const sameSide = Math.abs(a - geoL) + Math.abs(b - geoR) <= Math.abs(a - geoR) + Math.abs(b - geoL);
      cl = sameSide ? a : b; cr = sameSide ? b : a;
      cl = Math.max(cl, geoL * 0.8); cr = Math.max(cr, geoR * 0.8);
    }
    const shut = 0.55, open = 0.3;
    const W = this.wink;
    if (!W.armed) {
      if (cl < open && cr < open) W.armed = true; // both eyes open again → ready for the next wink
      return null;
    }
    const side = cl > shut && cr < open ? "left" : cr > shut && cl < open ? "right" : null;
    if (side !== W.side) { W.side = side; W.since = t; return null; }
    if (side && t - W.since >= 0.14) {
      W.armed = false; W.side = null;
      // Image-left eye appears on the right of the mirrored screen.
      return side === "left" ? "wink-screen-right" : "wink-screen-left";
    }
    return null;
  }
}

/** Geometry and expression measurements in pixel space (so x and y share units). */
export function measure({ landmarks: L, vw = 640, vh = 480, blend }) {
  const P = (i) => ({ x: L[i].x * vw, y: L[i].y * vh });
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const eL = P(EYE_IL.outer), eR = P(EYE_IR.outer);
  const eyeDist = Math.max(d(eL, eR), 1e-6);
  const mid = { x: (eL.x + eR.x) / 2, y: (eL.y + eR.y) / 2 };
  // Express the nose relative to the eye line, undoing head roll, in eye-distance units.
  const ang = Math.atan2(eR.y - eL.y, eR.x - eL.x);
  const n = P(NOSE), vx = n.x - mid.x, vy = n.y - mid.y;
  const offX = (vx * Math.cos(-ang) - vy * Math.sin(-ang)) / eyeDist;
  const offY = (vx * Math.sin(-ang) + vy * Math.cos(-ang)) / eyeDist;
  const ear = (E) => {
    const top = E.top.map(P), bot = E.bottom.map(P);
    const v = (d(top[0], bot[0]) + d(top[1], bot[1])) / 2;
    return v / Math.max(d(P(E.outer), P(E.inner)), 1e-6);
  };
  // Fallback mouth measure when blendshapes are missing: inner-lip gap / mouth width, scaled to ~jawOpen.
  const mar = d(P(LIP_TOP), P(LIP_BOTTOM)) / Math.max(d(P(MOUTH_L), P(MOUTH_R)), 1e-6);
  return {
    offX, offY, eyeDist, noseX: n.x, noseY: n.y,
    earL: ear(EYE_IL), earR: ear(EYE_IR),
    jaw: blend?.jawOpen ?? clamp(mar * 1.4, 0, 1),
    blinkA: blend?.eyeBlinkLeft ?? null, blinkB: blend?.eyeBlinkRight ?? null,
    blinkL: blend?.eyeBlinkLeft ?? 0, blinkR: blend?.eyeBlinkRight ?? 0,
  };
}
