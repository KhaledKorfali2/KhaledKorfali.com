// Vector painting surface. Strokes are stored as points in a fixed "document"
// space, so the canvas can be redrawn crisply at any size or pixel density
// (window resize, phone rotation) and undo/redo/replay are just re-rendering history.
//
// Each point carries its own width and colour, so changing size or colour mid-stroke
// changes the line from that point on (a shrinking brush tapers the line).
// Brush options live on the stroke: rainbow (a null colour) · sym 1/2/6 · taper · dots.
// Light effects (glow, bloom, neon, depth, sparkle, fade) either apply to the whole
// drawing (scope "all") or stick to the strokes drawn while they were on (scope "new").

const PAPER = { dark: "#101015", light: "#f6f4ee" };
const FADE_HOLD = 1500, FADE_OUT = 2500; // ms a finished stroke stays, then fades
const GLOW_OFF = 20000; // doc units: where the glow pass draws its (invisible) ink
const NO_FX = { glow: false, bloom: false, neon: false, depth: false, sparkle: false, fade: false };

export class Paint {
  constructor(canvas, bloomCanvas, sparkCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.bloom = bloomCanvas;
    this.bctx = bloomCanvas.getContext("2d");
    this.spark = sparkCanvas;
    this.sctx = sparkCanvas.getContext("2d");
    this.ops = [];          // history: stroke | { type: "clear" }
    this.redoStack = [];
    this.current = null;
    this.doc = null;        // { w, h } — the document space, fixed at the first layout
    this.view = { s: 1, ox: 0, oy: 0 };
    this.paper = "dark";
    this.fx = { ...NO_FX };
    this.scope = "all";
    this.fadeOn = 0;        // when fade was last switched on (whole-drawing fade starts from here)
    this.bloomOn = false;
    this.replayP = null;    // 0..1 while replaying
    this.listeners = new Set();
    this.raf = 0;
    this.sparks = [];
    this.sraf = 0;
  }

  onChange(fn) { this.listeners.add(fn); }
  emit() { this.listeners.forEach((fn) => fn(this)); }

  /** Fit the document into the canvas element's current box (contain + centre). */
  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    for (const c of [this.canvas, this.bloom, this.spark]) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
    this.dpr = dpr;
    if (!this.doc) this.doc = { w: r.width, h: r.height };
    const s = Math.min(r.width / this.doc.w, r.height / this.doc.h);
    this.view = { s, ox: (r.width - this.doc.w * s) / 2, oy: (r.height - this.doc.h * s) / 2 };
    this.redraw();
  }

  toDoc(x, y) { return [(x - this.view.ox) / this.view.s, (y - this.view.oy) / this.view.s]; }
  fromUnit(ux, uy) { return [(ux + 1) / 2 * this.doc.w, (uy + 1) / 2 * this.doc.h]; }
  toCss(dx, dy) { return [dx * this.view.s + this.view.ox, dy * this.view.s + this.view.oy]; }

  setPaper(p) { if (p === this.paper) return; this.paper = p; this.redraw(); }
  setEffects(fx) {
    const next = { ...this.fx, ...fx };
    if (Object.keys(next).every((k) => next[k] === this.fx[k])) return;
    if (next.fade && !this.fx.fade) this.fadeOn = performance.now();
    this.fx = next;
    this.refresh();
  }
  /** "all": effects apply to every stroke · "new": only to strokes drawn while they're on. */
  setScope(scope) {
    if (scope === this.scope) return;
    // Going to "new": every existing stroke keeps the look it has right now.
    if (scope === "new") for (const op of [...this.ops, ...this.redoStack]) if (op.type === "stroke") op.fx = { ...this.fx };
    this.scope = scope;
    this.fadeOn = performance.now();
    this.refresh();
  }
  effOf(st) { return this.scope === "all" || !st.fx ? this.fx : st.fx; }
  refresh() { this.redraw(); this.tick(); this.sparkle(); }

  /** brush: { color, size, rainbow, sym, hue0, taper, dots } */
  begin(pt, brush) {
    this.current = {
      type: "stroke", pts: [pt], dist: [0], w: [brush.size], c: [brush.rainbow ? null : brush.color],
      sym: brush.sym || 1, hue0: brush.hue0 ?? 0, taper: !!brush.taper, dots: !!brush.dots,
      gap: Math.max(4, brush.size * 1.8), fx: { ...this.fx },
    };
    this.sparkle();
  }
  /** brush: { color, size, rainbow } at this point. */
  extend(pt, brush) {
    const c = this.current;
    if (!c) return;
    const last = c.pts[c.pts.length - 1];
    const step = Math.hypot(pt[0] - last[0], pt[1] - last[1]);
    if (step < 0.75) return; // ignore sub-pixel jitter
    const lw = c.w[c.w.length - 1], tw = brush.size;
    c.pts.push(pt);
    c.dist.push(c.dist[c.dist.length - 1] + step);
    c.w.push(Math.abs(tw - lw) < 0.2 ? tw : lw + (tw - lw) * 0.35); // ease: a size jump becomes a short taper
    c.c.push(brush.rainbow ? null : brush.color);
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
    this.redraw(); this.emit(); this.sparkle();
    return true;
  }
  redo() {
    if (!this.redoStack.length) return false;
    const op = this.redoStack.pop();
    if (op.t) op.t = performance.now(); // a redone stroke reappears fresh when fading
    this.ops.push(op);
    this.emit(); this.refresh();
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

  // ── fade ──
  fadeStart(st) { return this.scope === "all" ? Math.max(st.t, this.fadeOn) : st.t; }
  alphaOf(st, now) {
    if (!st.t || !this.effOf(st).fade) return 1;
    return Math.max(0, Math.min(1, 1 - (now - this.fadeStart(st) - FADE_HOLD) / FADE_OUT));
  }
  // Keep redrawing while strokes are fading.
  tick() {
    if (this.replaying) return;
    cancelAnimationFrame(this.raf);
    const fading = (now) => this.visibleStrokes().some((s) => this.effOf(s).fade && now - this.fadeStart(s) < FADE_HOLD + FADE_OUT);
    if (!fading(performance.now())) return;
    const loop = () => {
      this.redraw();
      if (fading(performance.now())) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ── sparkle: twinkling stars along strokes, on their own layer ──
  sparkle() {
    if (this.sraf) return;
    let prev = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
      const list = this.visibleStrokes().filter((st) => this.effOf(st).sparkle && this.alphaOf(st, now) > 0);
      if (this.current && this.effOf(this.current).sparkle) list.push(this.current);
      const total = list.reduce((a, st) => a + st.dist[st.dist.length - 1] + 1, 0);
      // Spawn rate grows with the amount of ink, capped so big drawings stay calm.
      let n = Math.min(40, total / 900) * dt * 10;
      while (n > 0 && list.length) {
        if (n < 1 && Math.random() > n) break;
        n--;
        let pick = Math.random() * total, st = list[0];
        for (const s of list) { pick -= s.dist[s.dist.length - 1] + 1; if (pick <= 0) { st = s; break; } }
        const k = Math.floor(Math.random() * st.pts.length);
        const copy = Math.floor(Math.random() * (st.sym === 6 ? 6 : st.sym));
        const [x, y] = this.symPoint(st.pts[k], st.sym, copy);
        const jit = st.w[k] * 0.6;
        this.sparks.push({ x: x + (Math.random() - 0.5) * jit, y: y + (Math.random() - 0.5) * jit, born: now, life: 450 + Math.random() * 600,
          r: 3 + st.w[k] * (0.35 + Math.random() * 0.4), color: colorAt(st, k) });
      }
      this.sparks = this.sparks.filter((s) => now - s.born < s.life);
      const ctx = this.sctx, d = this.dpr || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.spark.width, this.spark.height);
      ctx.setTransform(this.view.s * d, 0, 0, this.view.s * d, this.view.ox * d, this.view.oy * d);
      for (const s of this.sparks) {
        const a = Math.sin(Math.PI * (now - s.born) / s.life);
        drawStar(ctx, s.x, s.y, s.r * (0.5 + a * 0.5), s.color, a, this.view.s * d);
      }
      if (!list.length && !this.sparks.length) { this.sraf = 0; return; }
      this.sraf = requestAnimationFrame(loop);
    };
    this.sraf = requestAnimationFrame(loop);
  }
  symPoint([x, y], sym, copy) {
    const cx = this.doc.w / 2, cy = this.doc.h / 2;
    if (sym === 2 && copy === 1) return [2 * cx - x, y];
    if (sym === 6) { const a = (copy * Math.PI) / 3, dx = x - cx, dy = y - cy; return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)]; }
    return [x, y];
  }

  // ── rendering ──
  targets() {
    const d = this.dpr || 1, list = [[this.ctx, false]];
    if (this.bloomOn) list.push([this.bctx, true]);
    return list.map(([ctx, isBloom]) => ({ ctx, isBloom, s: this.view.s * d, ox: this.view.ox * d, oy: this.view.oy * d, dpr: d }));
  }
  redraw() {
    if (!this.doc) return;
    const now = performance.now();
    const strokes = this.visibleStrokes();
    this.bloomOn = this.fx.bloom || strokes.some((st) => this.effOf(st).bloom);
    this.bloom.hidden = !this.bloomOn;
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
   * Draw points [from..to] of a stroke into one target, once per symmetry copy, in passes:
   * depth (offset shadow) → ink (with glow) → neon core. maxLen limits length (for replay).
   */
  drawStroke(T, st, from, to, alpha, maxLen = Infinity) {
    const { ctx } = T, e = this.effOf(st);
    if (T.isBloom && !e.bloom) return;
    const cx = this.doc.w / 2, cy = this.doc.h / 2;
    const copies = st.sym === 2 ? [[1, 0], [-1, 0]] : st.sym === 6 ? [0, 1, 2, 3, 4, 5].map((k) => [1, (k * Math.PI) / 3]) : [[1, 0]];
    const total = st.dist[st.dist.length - 1];
    const width = (k) => widthAt(st, k, total);
    const ink = (k) => colorAt(st, k);
    const place = (dx = 0, dy = 0, flip = 1, rot = 0) => {
      // doc → device: view transform (plus a fixed light offset), then symmetry about the document centre
      ctx.setTransform(T.s, 0, 0, T.s, T.ox, T.oy);
      ctx.translate(cx + dx, cy + dy); ctx.rotate(rot); ctx.scale(flip, 1); ctx.translate(-cx, -cy);
    };
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const [flip, rot] of copies) {
      if (T.isBloom) { place(0, 0, flip, rot); render(ctx, st, from, to, maxLen, ink, width, false); continue; }
      if (e.depth) {
        const o = Math.max(2, st.w[0] * 0.3);
        place(o, o, flip, rot);
        render(ctx, st, from, to, maxLen, ink, width, false);
        render(ctx, st, from, to, maxLen, () => "rgba(0,0,0,.55)", width, false);
      }
      if (e.glow) {
        // Halo only: draw far off-canvas and throw the shadow back into place. One even-width
        // path per colour means one shadow, so tapers and resizes don't stack bright blobs.
        place(-GLOW_OFF, 0, flip, rot);
        ctx.shadowBlur = Math.max(10, st.w[0] * 1.6) * T.s;
        ctx.shadowOffsetX = GLOW_OFF * T.s;
        render(ctx, st, from, to, maxLen, ink, (k) => Math.round(st.w[k]), true);
        ctx.shadowBlur = 0; ctx.shadowOffsetX = 0;
      }
      place(0, 0, flip, rot);
      render(ctx, st, from, to, maxLen, ink, width, false);
      if (e.neon) render(ctx, st, from, to, maxLen, () => "rgba(255,255,255,.82)", (k) => width(k) * 0.32, false);
    }
    ctx.restore();
  }

  /** PNG of the document at 2× size, including the effects (bloom where the browser supports canvas filters). */
  toBlob() {
    const scale = 2;
    const W = Math.round(this.doc.w * scale), H = Math.round(this.doc.h * scale);
    const mk = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };
    const out = mk(), ctx = out.getContext("2d");
    ctx.fillStyle = PAPER[this.paper];
    ctx.fillRect(0, 0, W, H);
    const now = performance.now();
    const strokes = this.visibleStrokes();
    const T = { ctx, isBloom: false, s: scale, ox: 0, oy: 0, dpr: scale };
    if (strokes.some((st) => this.effOf(st).bloom) && "filter" in ctx) {
      const glow = mk(), g = glow.getContext("2d");
      const B = { ctx: g, isBloom: true, s: scale, ox: 0, oy: 0, dpr: scale };
      for (const st of strokes) this.drawStroke(B, st, 0, st.pts.length - 1, this.alphaOf(st, now));
      ctx.save(); ctx.filter = `blur(${14 * scale}px) brightness(1.6) saturate(1.3)`; ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = 0.85;
      ctx.drawImage(glow, 0, 0); ctx.restore();
    }
    for (const st of strokes) this.drawStroke(T, st, 0, st.pts.length - 1, this.alphaOf(st, now));
    return new Promise((res) => out.toBlob(res, "image/png"));
  }
}

/** Colour at point k: its own colour, or rainbow (null) by distance along the stroke. */
export const colorAt = (st, k) => st.c[k] ?? `hsl(${(st.hue0 + st.dist[k] * 0.45) % 360} 92% 62%)`;

/** Width at point k, narrowed towards the ends when the stroke tapers (the tail only once it's finished). */
function widthAt(st, k, total) {
  const w = st.w[k];
  if (!st.taper) return w;
  const L = Math.max(10, w * 4);
  let f = Math.min(1, (st.dist[k] + L * 0.1) / L);
  if (st.t) f = Math.min(f, (total - st.dist[k] + L * 0.1) / L);
  return w * Math.max(0.12, Math.sqrt(Math.max(0, f)));
}

// Smooth path through midpoints (quadratic curves). Consecutive segments that share a
// colour and width go in one path (clean joins, one glow); a change starts a new path.
// Where the width changes along a segment (tapers, live resizing) the curve is split into
// short pieces with interpolated widths, so it narrows smoothly instead of in steps.
function render(ctx, st, from, to, maxLen, color, width, glow) {
  const p = st.pts, n = p.length;
  if (n === 1) {
    ctx.fillStyle = color(0);
    if (glow) ctx.shadowColor = color(0);
    ctx.beginPath(); ctx.arc(p[0][0], p[0][1], width(0) / 2, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const first = Math.max(1, from), last = Math.min(to, n - 1);
  if (st.dots) return renderDots(ctx, st, first, last, maxLen, color, width, glow);
  const mid = (i) => [(p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2];
  let key = null;
  const use = (c, w) => {
    const kk = c + "|" + Math.round(w * 4);
    if (kk === key) return;
    if (key !== null) { ctx.stroke(); ctx.beginPath(); }
    key = kk;
    ctx.strokeStyle = c; ctx.lineWidth = w;
    if (glow) ctx.shadowColor = c;
  };
  ctx.beginPath();
  // segment k runs from mid(k-1) (or p[0]) through p[k] to mid(k) (or the last point)
  for (let k = first; k <= last && st.dist[k - 1] <= maxLen; k++) {
    const c = color(k), wk = width(k);
    const S = k === 1 ? p[0] : mid(k - 1), E = k === n - 1 ? p[k] : mid(k);
    const w0 = k === 1 ? width(0) : (width(k - 1) + wk) / 2;
    const w1 = k === n - 1 ? wk : (wk + width(k + 1)) / 2;
    const pieces = Math.min(8, Math.ceil(Math.abs(w1 - w0) / 0.6));
    if (pieces <= 1) {
      use(c, (w0 + w1) / 2);
      ctx.moveTo(S[0], S[1]);
      ctx.quadraticCurveTo(p[k][0], p[k][1], E[0], E[1]);
      continue;
    }
    let prev = S;
    for (let j = 1; j <= pieces; j++) {
      const t = j / pieces, u = 1 - t;
      const pt = [u * u * S[0] + 2 * u * t * p[k][0] + t * t * E[0], u * u * S[1] + 2 * u * t * p[k][1] + t * t * E[1]];
      use(c, w0 + (w1 - w0) * (j - 0.5) / pieces);
      ctx.moveTo(prev[0], prev[1]); ctx.lineTo(pt[0], pt[1]);
      prev = pt;
    }
  }
  if (key !== null) ctx.stroke();
}

// Dotted brush: a dot every `gap` along the stroke, sized by the width there.
function renderDots(ctx, st, first, last, maxLen, color, width, glow) {
  const p = st.pts, gap = st.gap;
  for (let k = first; k <= last; k++) {
    const d0 = st.dist[k - 1], d1 = st.dist[k];
    let m = k === 1 ? 0 : Math.floor(d0 / gap) + 1;
    for (; m * gap <= d1 && m * gap <= maxLen; m++) {
      const f = d1 > d0 ? (m * gap - d0) / (d1 - d0) : 0;
      const x = p[k - 1][0] + (p[k][0] - p[k - 1][0]) * f, y = p[k - 1][1] + (p[k][1] - p[k - 1][1]) * f;
      ctx.fillStyle = color(k);
      if (glow) ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath(); ctx.arc(x, y, width(k) / 2, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawStar(ctx, x, y, r, color, a, scale) {
  ctx.globalAlpha = Math.max(0, a);
  ctx.fillStyle = "#fff";
  ctx.shadowColor = color; ctx.shadowBlur = r * 2 * scale; // shadows ignore the transform
  ctx.beginPath();
  // four-point star: thin diamond arms
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}
