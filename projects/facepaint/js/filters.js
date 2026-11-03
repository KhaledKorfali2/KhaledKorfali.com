// One Euro filter (Casiez, Roussel & Vogel, CHI 2012): an adaptive low-pass
// filter that removes jitter when the signal is still and lag when it moves.
// The cutoff frequency rises with speed: cutoff = minCutoff + beta * |speed|.

function alpha(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export class OneEuro {
  constructor({ minCutoff = 1, beta = 0, dCutoff = 1 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }
  reset() { this.x = null; this.dx = 0; this.t = null; }
  /** value at time t (seconds) → filtered value */
  filter(value, t) {
    if (this.x === null || this.t === null || t <= this.t) {
      this.x = value; this.t = t; this.dx = 0;
      return value;
    }
    const dt = Math.min(t - this.t, 0.25); // after a stall, don't let one huge dt flatten everything
    this.t = t;
    const rawDx = (value - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}

/** A 2-D One Euro filter sharing parameters across axes. */
export class OneEuro2D {
  constructor(opts) { this.fx = new OneEuro(opts); this.fy = new OneEuro(opts); }
  set(opts) { for (const f of [this.fx, this.fy]) Object.assign(f, opts); }
  reset() { this.fx.reset(); this.fy.reset(); }
  filter(x, y, t) { return { x: this.fx.filter(x, t), y: this.fy.filter(y, t) }; }
}
