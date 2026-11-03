// Vector painting surface. Strokes are stored as points in a fixed "document"
// space, so the canvas can be redrawn crisply at any size or pixel density
// (window resize, phone rotation) and undo/redo/replay are just re-rendering history.
//
// Per-stroke style (kept with the stroke so history stays faithful):
//   rainbow — hue shifts along the stroke · sym — 1 (off), 2 (mirror) or 6 (kaleidoscope)
// View effects (apply to everything, any time): glow, bloom (a blurred layer), fade (light painting).

const PAPER = { dark: "#101015", light: "#f6f4ee" };
const FADE_HOLD = 1500, FADE_OUT = 2500; // ms a finished stroke stays, then fades

export class Paint {
  constructor(canvas, bloomCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.bloom = bloomCanvas;
    this.bctx = bloomCanvas.getContext("2d");
    this.ops = [];          // history: stroke | { type: "clear" }
    this.redoStack = [];
    this.current = null;
    this.doc = null;        // { w, h } — the document space, fixed at the first layout
    this.view = { s: 1, ox: 0, oy: 0 };
    this.paper = "dark";
    this.fx = { glow: false, bloom: false, fade: false };
    this.replayP = null;    // 0..1 while replaying
    this.listeners = new Set();
    this.raf = 0;
  }

  onChange(fn) { this.listeners.add(fn); }
  emit() { this.listeners.forEach((fn) => fn(this)); }

  /** Fit the document into the canvas element's current box (contain + centre). */
  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    for (const c of [this.canvas, this.bloom]) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
    this.dpr = dpr;
    if (!this.doc) this.doc = { w: r.width, h: r.height };
    const s = Math.min(r.width / this.doc.w, r.height / this.doc.h);
    this.view = { s, ox: (r.width - this.doc.w * s) / 2, oy: (r.height - this.doc.h * s) / 2 };
    this.redraw();
  }

  toDoc(x, y) { return [(x - this.view.ox) / this.view.s, (y - this.view.oy) / this.view.s]; }
  fromUnit(ux, uy) { return [(ux + 1) / 2 * this.doc.w, (uy + 1) / 2 * this.doc.h]; }
  toCss(dx, dy) { return [dx * this.view.s + this.view.ox, dy * this.view.s + this.view.oy]; }

  setPaper(p) { this.paper = p; this.redraw(); }
  setEffects(fx) {
    this.fx = { ...this.fx, ...fx };
    this.bloom.hidden = !this.fx.bloom;
    this.redraw();
    this.tick();
  }

  begin(color, size, pt, style = {}) {
    this.current = { type: "stroke", color, size, pts: [pt], dist: [0], rainbow: !!style.rainbow, sym: style.sym || 1, hue0: style.hue0 ?? 0 };
  }
  extend(pt) {
    const c = this.current;
    if (!c) return;
    const last = c.pts[c.pts.length - 1];
    const step = Math.hypot(pt[0] - last[0], pt[1] - last[1]);
    if (step < 0.75) return; // ignore sub-pixel jitter
    c.pts.push(pt);
    c.dist.push(c.dist[c.dist.length - 1] + step);
    this.paintRange(c, c.pts.length - 2, c.pts.length - 1);
  }
  end() {
    const c = this.current;
    if (!c) return;
    this.current = null;
    c.t = performance.now();
    this.ops.push(c);
    this.redoStack = [];
    this.redraw();
    this.emit();
    this.tick();
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
    const op = this.redoStack.pop();
    if (op.t) op.t = performance.now(); // a redone stroke reappears fresh when fading
    this.ops.push(op);
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

  /** Animate the drawing being made, stroke by stroke. Resolves when done (or stopped). */
  replay(ms = 4500) {
    if (this.isEmpty) return Promise.resolve(false);
    cancelAnimationFrame(this.raf);
    return new Promise((done) => {
      const t0 = performance.now();
      this.replayDone = done;
      this.replayP = 0; // replaying from now, not from the first frame (Stop must work immediately)
      this.redraw();
      const step = (now) => {
        this.replayP = Math.min(1, (now - t0) / ms);
        this.redraw();
        if (this.replayP < 1 && this.replayDone) this.raf = requestAnimationFrame(step);
        else this.stopReplay();
      };
      this.raf = requestAnimationFrame(step);
    });
  }
  stopReplay() {
    if (this.replayP === null) return;
    cancelAnimationFrame(this.raf);
    this.replayP = null;
    const d = this.replayDone; this.replayDone = null;
    this.redraw();
    d?.(true);
    this.tick();
  }
  get replaying() { return this.replayP !== null; }

  // Keep redrawing while strokes are fading.
  tick() {
    if (!this.fx.fade || this.replaying) return;
    cancelAnimationFrame(this.raf);
    const loop = () => {
      this.redraw();
      const now = performance.now();
      if (this.visibleStrokes().some((s) => now - s.t < FADE_HOLD + FADE_OUT)) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  alphaOf(st, now) {
    if (!this.fx.fade || !st.t) return 1;
    return Math.max(0, Math.min(1, 1 - (now - st.t - FADE_HOLD) / FADE_OUT));
  }

  // ── rendering ──
  targets() {
    const d = this.dpr || 1, list = [[this.ctx, false]];
    if (this.fx.bloom) list.push([this.bctx, true]);
    return list.map(([ctx, isBloom]) => ({ ctx, isBloom, s: this.view.s * d, ox: this.view.ox * d, oy: this.view.oy * d, dpr: d }));
  }
  redraw() {
    if (!this.doc) return;
    const now = performance.now();
    const strokes = this.visibleStrokes();
    // While replaying, reveal strokes progressively by total length.
    let budget = Infinity;
    if (this.replaying) budget = strokes.reduce((a, s) => a + s.dist[s.dist.length - 1] + 1, 0) * this.replayP;
    for (const T of this.targets()) {
      const { ctx } = T;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (T.isBloom) ctx.clearRect(0, 0, this.bloom.width, this.bloom.height);
      else { ctx.fillStyle = PAPER[this.paper]; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); }
      let left = budget;
      for (const st of strokes) {
        if (left <= 0) break;
        const len = st.dist[st.dist.length - 1] + 1;
        const a = this.replaying ? 1 : this.alphaOf(st, now);
        if (a > 0) this.drawStroke(T, st, 0, st.pts.length - 1, a, left < len ? left : Infinity);
        left -= len;
      }
      if (this.current && !this.replaying) this.drawStroke(T, this.current, 0, this.current.pts.length - 1, 1);
    }
  }
  paintRange(st, from, to) { for (const T of this.targets()) this.drawStroke(T, st, from, to, 1); }

  /**
   * Draw points [from..to] of a stroke into one target, once per symmetry copy.
   * maxLen limits drawing to that much stroke length (for replay).
   */
  drawStroke(T, st, from, to, alpha, maxLen = Infinity) {
    const { ctx } = T;
    const cx = this.doc.w / 2, cy = this.doc.h / 2;
    const copies = st.sym === 2 ? [[1, 0], [-1, 0]] : st.sym === 6 ? [0, 1, 2, 3, 4, 5].map((k) => [1, (k * Math.PI) / 3]) : [[1, 0]];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (this.fx.glow && !T.isBloom) { ctx.shadowBlur = Math.max(10, st.size * 1.6) * T.s; }
    for (const [flip, rot] of copies) {
      // doc → device: view transform, then symmetry about the document centre
      ctx.setTransform(T.s, 0, 0, T.s, T.ox, T.oy);
      ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(flip, 1); ctx.translate(-cx, -cy);
      renderPath(ctx, st, from, to, maxLen, this.fx.glow && !T.isBloom);
    }
    ctx.restore();
  }

  /** PNG of the document at 2× size, including the current effects (bloom where the browser supports canvas filters). */
  toBlob() {
    const scale = 2;
    const W = Math.round(this.doc.w * scale), H = Math.round(this.doc.h * scale);
    const mk = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };
    const out = mk(), ctx = out.getContext("2d");
    ctx.fillStyle = PAPER[this.paper];
    ctx.fillRect(0, 0, W, H);
    const now = performance.now();
    const T = { ctx, isBloom: false, s: scale, ox: 0, oy: 0, dpr: scale };
    if (this.fx.bloom && "filter" in ctx) {
      const glow = mk(), g = glow.getContext("2d");
      const B = { ctx: g, isBloom: true, s: scale, ox: 0, oy: 0, dpr: scale };
      for (const st of this.visibleStrokes()) this.drawStroke(B, st, 0, st.pts.length - 1, this.alphaOf(st, now));
      ctx.save(); ctx.filter = `blur(${14 * scale}px) brightness(1.6) saturate(1.3)`; ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = 0.85;
      ctx.drawImage(glow, 0, 0); ctx.restore();
    }
    for (const st of this.visibleStrokes()) this.drawStroke(T, st, 0, st.pts.length - 1, this.alphaOf(st, now));
    return new Promise((res) => out.toBlob(res, "image/png"));
  }
}

const rainbowAt = (st, i) => `hsl(${(st.hue0 + st.dist[i] * 0.45) % 360} 92% 62%)`;

// Smooth path through midpoints (quadratic curves). Rainbow strokes are drawn segment by
// segment so the colour can change; plain strokes as one path for clean joins.
function renderPath(ctx, st, from, to, maxLen, glow) {
  const p = st.pts;
  ctx.lineWidth = st.size;
  const color = (i) => (st.rainbow ? rainbowAt(st, i) : st.color);
  if (p.length === 1) {
    ctx.fillStyle = color(0);
    if (glow) ctx.shadowColor = color(0);
    ctx.beginPath(); ctx.arc(p[0][0], p[0][1], st.size / 2, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const mid = (i) => [(p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2];
  // segment k runs from mid(k-1) (or p[0]) through p[k] to mid(k) (or the last point)
  const seg = (ctx2, k) => {
    const start = k === 1 ? p[0] : mid(k - 1);
    ctx2.moveTo(start[0], start[1]);
    if (k === p.length - 1) ctx2.lineTo(p[k][0], p[k][1]);
    else ctx2.quadraticCurveTo(p[k][0], p[k][1], ...mid(k));
  };
  const first = Math.max(1, from), last = Math.min(to, p.length - 1);
  if (st.rainbow) {
    for (let k = first; k <= last && st.dist[k - 1] <= maxLen; k++) {
      ctx.strokeStyle = color(k);
      if (glow) ctx.shadowColor = ctx.strokeStyle;
      ctx.beginPath(); seg(ctx, k); ctx.stroke();
    }
    return;
  }
  ctx.strokeStyle = st.color;
  if (glow) ctx.shadowColor = st.color;
  ctx.beginPath();
  for (let k = first; k <= last && st.dist[k - 1] <= maxLen; k++) seg(ctx, k);
  ctx.stroke();
}
