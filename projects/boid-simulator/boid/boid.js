// boid.js
import { Vector } from "../vector/vector.js";

const SEGMENTS    = 8;
const SEG_LEN     = 5.5;
const SWIM_FREQ   = 0.08;
const SWIM_AMP    = 1.15;
const SPEED_SCALE = 0.22;

export class Boid {
  constructor(x = 0, y = 0, _z = 0) {
    this.position     = new Vector(x, y, 0);
    this.velocity     = Vector.random();
    this.acceleration = new Vector();
    this.maxForce     = 0.25;
    this.maxSpeed     = 5;

    this.alignFactor      = 1;
    this.cohesionFactor   = 1;
    this.separationFactor = 1;

    // Pre-allocated spine (Float32Array — no per-frame heap allocation)
    this.spineX = new Float32Array(SEGMENTS);
    this.spineY = new Float32Array(SEGMENTS);
    for (let i = 0; i < SEGMENTS; i++) {
      this.spineX[i] = x - i * SEG_LEN;
      this.spineY[i] = y;
    }

    // Pre-allocated edge scratch buffers (written by drawFish)
    this.leftX  = new Float32Array(SEGMENTS);
    this.leftY  = new Float32Array(SEGMENTS);
    this.rightX = new Float32Array(SEGMENTS);
    this.rightY = new Float32Array(SEGMENTS);

    this._phase  = Math.random() * Math.PI * 2;
    this.colorT  = 0;   // 0-1 speed ratio → LUT index

    // Cached heading trig — computed once in update(), read many times in drawFish()
    this.headCos = 1;
    this.headSin = 0;
    this.perpX   = 0;   // perpendicular to heading (left side)
    this.perpY   = 1;

    // Scratch fields for _steer (avoids returning objects)
    this._steerX = 0;
    this._steerY = 0;
  }

  edges() {
    const w = window.innerWidth, h = window.innerHeight;
    if (this.position.x >  w) this.position.x = 0;
    if (this.position.x <  0) this.position.x = w;
    if (this.position.y >  h) this.position.y = 0;
    if (this.position.y <  0) this.position.y = h;
  }

  // type: 0=align  1=cohesion  2=separation
  // Returns 1 if neighbours found; result in this._steerX/Y
  _steer(candidates, radius, type) {
    let sx = 0, sy = 0, total = 0;
    const r2 = radius * radius;
    const px = this.position.x, py = this.position.y;

    for (let i = 0, len = candidates.length; i < len; i++) {
      const other = candidates[i];
      if (other === this) continue;
      const dx = px - other.position.x;
      const dy = py - other.position.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2 || d2 === 0) continue;

      if (type === 0) {
        sx += other.velocity.x; sy += other.velocity.y;
      } else if (type === 1) {
        sx += other.position.x; sy += other.position.y;
      } else {
        const d = Math.sqrt(d2);
        sx += dx / (d * d); sy += dy / (d * d);
      }
      total++;
    }

    if (total === 0) return 0;

    const invT = 1 / total;
    sx *= invT; sy *= invT;
    if (type === 1) { sx -= px; sy -= py; }

    const mag = Math.sqrt(sx * sx + sy * sy) || 1;
    const invM = this.maxSpeed / mag;
    sx = sx * invM - this.velocity.x;
    sy = sy * invM - this.velocity.y;

    const fmag = Math.sqrt(sx * sx + sy * sy);
    if (fmag > this.maxForce) {
      const invF = this.maxForce / fmag;
      sx *= invF; sy *= invF;
    }

    this._steerX = sx; this._steerY = sy;
    return 1;
  }

  flock(candidates) {
    let ax = 0, ay = 0;
    if (this._steer(candidates, 75, 0)) { ax += this._steerX * this.alignFactor;      ay += this._steerY * this.alignFactor; }
    if (this._steer(candidates, 75, 1)) { ax += this._steerX * this.cohesionFactor;   ay += this._steerY * this.cohesionFactor; }
    if (this._steer(candidates, 30, 2)) { ax += this._steerX * this.separationFactor; ay += this._steerY * this.separationFactor; }
    this.acceleration.x += ax;
    this.acceleration.y += ay;
  }

  update() {
    this.position.x += this.velocity.x;
    this.position.y += this.velocity.y;
    this.velocity.x += this.acceleration.x;
    this.velocity.y += this.acceleration.y;

    const spd = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y);
    if (spd > this.maxSpeed) {
      const inv = this.maxSpeed / spd;
      this.velocity.x *= inv;
      this.velocity.y *= inv;
    }
    this.acceleration.x = 0;
    this.acceleration.y = 0;

    // ── Cache trig once per update — drawFish reads these, never recomputes ──
    const angle    = Math.atan2(this.velocity.y, this.velocity.x);
    this.headCos   = Math.cos(angle);
    this.headSin   = Math.sin(angle);
    this.perpX     = -this.headSin;   // left perpendicular
    this.perpY     =  this.headCos;

    this._phase   += SWIM_FREQ * (0.5 + spd / this.maxSpeed);
    this.colorT    = spd / this.maxSpeed; // naturally ≤ 1 since spd ≤ maxSpeed

    this._updateSpine();
  }

  _updateSpine() {
    const side = Math.sin(this._phase) * SWIM_AMP * (0.4 + SPEED_SCALE *
      Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y));

    this.spineX[0] = this.position.x + this.perpX * side;
    this.spineY[0] = this.position.y + this.perpY * side;

    for (let i = 1; i < SEGMENTS; i++) {
      const ex = this.spineX[i - 1], ey = this.spineY[i - 1];
      const dx = this.spineX[i] - ex, dy = this.spineY[i] - ey;
      const inv = SEG_LEN / (Math.sqrt(dx * dx + dy * dy) || 0.001);
      this.spineX[i] = ex + dx * inv;
      this.spineY[i] = ey + dy * inv;
    }
  }
}