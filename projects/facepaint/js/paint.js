// Vector painting surface. Strokes are stored as points in a fixed "document"
// space, so the canvas can be redrawn crisply at any size or pixel density
// (window resize, phone rotation) and undo/redo is just replaying history.

const PAPER = { dark: "#101015", light: "#f6f4ee" };

export class Paint {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ops = [];          // history: { type: "stroke", color, size, pts: [[x,y],…] } | { type: "clear" }
    this.redoStack = [];
    this.current = null;
    this.doc = null;        // { w, h } — the document space, fixed at the first layout
    this.view = { s: 1, ox: 0, oy: 0 };
    this.paper = "dark";
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); }
  emit() { this.listeners.forEach((fn) => fn(this)); }

  /** Fit the document into the canvas element's current box (contain + centre). */
  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.dpr = dpr;
    this.cssW = r.width; this.cssH = r.height;
    if (!this.doc) this.doc = { w: r.width, h: r.height };
    const s = Math.min(r.width / this.doc.w, r.height / this.doc.h);
    this.view = { s, ox: (r.width - this.doc.w * s) / 2, oy: (r.height - this.doc.h * s) / 2 };
    this.redraw();
  }

  /** Canvas-element CSS pixels → document coordinates. */
  toDoc(x, y) { return [(x - this.view.ox) / this.view.s, (y - this.view.oy) / this.view.s]; }
  /** Normalised pointer [-1, 1]² → document coordinates (the whole visible document). */
  fromUnit(ux, uy) { return [(ux + 1) / 2 * this.doc.w, (uy + 1) / 2 * this.doc.h]; }
  toCss(dx, dy) { return [dx * this.view.s + this.view.ox, dy * this.view.s + this.view.oy]; }

  setPaper(p) { this.paper = p; this.redraw(); }

  begin(color, size, pt) {
    this.current = { type: "stroke", color, size, pts: [pt] };
  }
  extend(pt) {
    const c = this.current;
    if (!c) return;
    const last = c.pts[c.pts.length - 1];
    if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 0.75) return; // ignore sub-pixel jitter
    c.pts.push(pt);
    this.drawSegment(c, c.pts.length - 1);
  }
  end() {
    const c = this.current;
    if (!c) return;
    this.current = null;
    this.ops.push(c);
    this.redoStack = [];
    // Re-render the finished stroke in one path so its tail and joins are exact.
    this.redraw();
    this.emit();
  }
  get drawing() { return !!this.current; }

  clear() {
    if (!this.visibleStrokes().length) return false;
    this.ops.push({ type: "clear" });
    this.redoStack = [];
    this.redraw(); this.emit();
    return true;
  }
  undo() {
    if (!this.ops.length) return false;
    this.redoStack.push(this.ops.pop());
    this.redraw(); this.emit();
    return true;
  }
  redo() {
    if (!this.redoStack.length) return false;
    this.ops.push(this.redoStack.pop());
    this.redraw(); this.emit();
    return true;
  }
  get canUndo() { return this.ops.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get isEmpty() { return !this.visibleStrokes().length; }

  visibleStrokes() {
    const i = this.ops.map((o) => o.type).lastIndexOf("clear");
    return this.ops.slice(i + 1);
  }

  // ── rendering ──
  prep(ctx, scale, ox, oy) {
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }
  redraw() {
    const { ctx, canvas } = this;
    if (!this.doc) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAPER[this.paper];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const d = this.dpr || 1;
    this.prep(ctx, this.view.s * d, this.view.ox * d, this.view.oy * d);
    for (const st of this.visibleStrokes()) strokePath(ctx, st);
    if (this.current) strokePath(ctx, this.current);
  }
  // Incremental: draw only the newest smoothed segment while the stroke is live.
  drawSegment(st, i) {
    const { ctx } = this;
    const d = this.dpr || 1;
    this.prep(ctx, this.view.s * d, this.view.ox * d, this.view.oy * d);
    ctx.strokeStyle = st.color;
    ctx.lineWidth = st.size;
    const p = st.pts;
    ctx.beginPath();
    if (i === 1) { ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo((p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2); }
    else {
      const a = p[i - 2], b = p[i - 1], c = p[i];
      ctx.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      ctx.quadraticCurveTo(b[0], b[1], (b[0] + c[0]) / 2, (b[1] + c[1]) / 2);
    }
    ctx.stroke();
  }

  /** PNG of the document at 2× its size, on the current paper colour. */
  toBlob() {
    const scale = 2;
    const out = document.createElement("canvas");
    out.width = Math.round(this.doc.w * scale);
    out.height = Math.round(this.doc.h * scale);
    const ctx = out.getContext("2d");
    ctx.fillStyle = PAPER[this.paper];
    ctx.fillRect(0, 0, out.width, out.height);
    this.prep(ctx, scale, 0, 0);
    for (const st of this.visibleStrokes()) strokePath(ctx, st);
    return new Promise((res) => out.toBlob(res, "image/png"));
  }
}

// A whole stroke as one smooth path: quadratic curves through midpoints.
function strokePath(ctx, st) {
  const p = st.pts;
  ctx.strokeStyle = st.color;
  ctx.fillStyle = st.color;
  ctx.lineWidth = st.size;
  if (p.length === 1) {
    ctx.beginPath();
    ctx.arc(p[0][0], p[0][1], st.size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < p.length - 1; i++) {
    ctx.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2);
  }
  ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
  ctx.stroke();
}
