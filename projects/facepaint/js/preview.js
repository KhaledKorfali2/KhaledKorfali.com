// Camera picture-in-picture: mirrored video, a light face outline, and a mouth
// meter that shows how far the mouth is from the "paint" threshold.
import { videoEl, connections, handConnections } from "./tracker.js";

export class Preview {
  constructor(root) {
    this.root = root;
    this.box = root.querySelector(".pip-video");
    this.canvas = root.querySelector(".pip-mesh");
    this.ctx = this.canvas.getContext("2d");
    this.meter = root.querySelector(".pip-meter i");
    this.meterBox = root.querySelector(".pip-meter");
    this.msg = root.querySelector(".pip-msg");
    videoEl.className = "pip-cam";
    this.box.prepend(videoEl);
    this.showMesh = true;
    new ResizeObserver(() => this.size()).observe(this.box);
  }

  size() {
    const r = this.box.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.w = r.width; this.h = r.height; this.dpr = dpr;
  }

  // Map normalised video coords into the cover-fitted, mirrored preview box.
  mapper() {
    const vw = videoEl.videoWidth || 640, vh = videoEl.videoHeight || 480;
    const s = Math.max(this.w / vw, this.h / vh);
    const ox = (this.w - vw * s) / 2, oy = (this.h - vh * s) / 2;
    return (p) => [this.w - (p.x * vw * s + ox), p.y * vh * s + oy];
  }

  setMessage(text) {
    this.msg.textContent = text || "";
    this.msg.hidden = !text;
  }

  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Hand mode: skeletons (drawing hand gold, other hand blue) and a pinch meter. */
  renderHands(frame, sig, roles, penOn) {
    const { ctx } = this;
    this.clear();
    this.meterBox.classList.toggle("is-on", !!penOn);
    this.meter.style.height = Math.min(100, (sig.pinch || 0) / 1.5 * 100) + "%";
    const C = handConnections();
    if (!this.showMesh || !C) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const P = this.mapper();
    for (const [h, color] of [[roles.other, "rgba(71,184,232,.9)"], [roles.draw, "rgba(232,197,71,.95)"]]) {
      if (!h) continue;
      const L = h.landmarks;
      ctx.strokeStyle = color; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const c of C) { const [ax, ay] = P(L[c.start]), [bx, by] = P(L[c.end]); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }
      ctx.stroke();
      ctx.fillStyle = color;
      for (const i of [4, 8]) { const [x, y] = P(L[i]); ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  render(frame, sig, penOn) {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.meterBox.classList.toggle("is-on", !!penOn);
    if (!frame?.landmarks) { this.meter.style.height = "0%"; return; }
    this.meter.style.height = Math.min(100, (sig.mouth || 0) / 1.5 * 100) + "%";
    if (!this.showMesh) return;
    const FL = connections();
    if (!FL) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const P = this.mapper(), L = frame.landmarks;
    const draw = (conns, color, w) => {
      if (!conns) return;
      ctx.strokeStyle = color; ctx.lineWidth = w;
      ctx.beginPath();
      for (const c of conns) {
        const a = L[c.start], b = L[c.end];
        if (!a || !b) continue;
        const [ax, ay] = P(a), [bx, by] = P(b);
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      }
      ctx.stroke();
    };
    draw(FL.FACE_LANDMARKS_FACE_OVAL, "rgba(255,255,255,.35)", 1);
    draw(FL.FACE_LANDMARKS_LEFT_EYE, "rgba(232,197,71,.85)", 1.2);
    draw(FL.FACE_LANDMARKS_RIGHT_EYE, "rgba(232,197,71,.85)", 1.2);
    draw(FL.FACE_LANDMARKS_LIPS, penOn ? "rgba(255,120,120,.95)" : "rgba(255,255,255,.7)", 1.4);
    const [nx, ny] = P(L[1]);
    ctx.fillStyle = "#47b8e8";
    ctx.beginPath(); ctx.arc(nx, ny, 3, 0, Math.PI * 2); ctx.fill();
  }
}
