// boid.js
import { Vector } from "../vector/vector.js";

export class Boid {
  constructor(x = 0, y = 0, z = 0) {
    this.position     = new Vector(x, y, z);
    this.velocity     = Vector.random();
    this.acceleration = new Vector();
    this.maxForce     = 0.25;
    this.maxSpeed     = 5;

    this.alignFactor      = 1;
    this.cohesionFactor   = 1;
    this.separationFactor = 1;
  }

  edges() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this.position.x >  w) this.position.x = 0;
    if (this.position.x <  0) this.position.x = w;
    if (this.position.y >  h) this.position.y = 0;
    if (this.position.y <  0) this.position.y = h;
  }

  // Unified steering helper — candidates already pre-filtered by spatial grid
  _steer(candidates, radius, type) {
    let sx = 0, sy = 0, total = 0;

    for (const other of candidates) {
      if (other === this) continue;
      const dx = this.position.x - other.position.x;
      const dy = this.position.y - other.position.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > radius * radius || d2 === 0) continue;

      if (type === "align") {
        sx += other.velocity.x;
        sy += other.velocity.y;
      } else if (type === "cohesion") {
        sx += other.position.x;
        sy += other.position.y;
      } else { // separation
        const d = Math.sqrt(d2);
        sx += dx / (d * d);
        sy += dy / (d * d);
      }
      total++;
    }

    if (total === 0) return { x: 0, y: 0 };

    sx /= total;
    sy /= total;

    if (type === "cohesion") {
      sx -= this.position.x;
      sy -= this.position.y;
    }

    // Normalise and scale to maxSpeed
    const mag = Math.sqrt(sx * sx + sy * sy) || 1;
    sx = (sx / mag) * this.maxSpeed - this.velocity.x;
    sy = (sy / mag) * this.maxSpeed - this.velocity.y;

    // Clamp to maxForce
    const fmag = Math.sqrt(sx * sx + sy * sy);
    if (fmag > this.maxForce) {
      sx = (sx / fmag) * this.maxForce;
      sy = (sy / fmag) * this.maxForce;
    }

    return { x: sx, y: sy };
  }

  flock(candidates) {
    const a = this._steer(candidates, 75, "align");
    const c = this._steer(candidates, 75, "cohesion");
    const s = this._steer(candidates, 30, "separation");

    this.acceleration.x +=
      a.x * this.alignFactor +
      c.x * this.cohesionFactor +
      s.x * this.separationFactor;

    this.acceleration.y +=
      a.y * this.alignFactor +
      c.y * this.cohesionFactor +
      s.y * this.separationFactor;
  }

  update() {
    this.position.x  += this.velocity.x;
    this.position.y  += this.velocity.y;
    this.velocity.x  += this.acceleration.x;
    this.velocity.y  += this.acceleration.y;

    // Clamp speed
    const spd = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);
    if (spd > this.maxSpeed) {
      this.velocity.x = (this.velocity.x / spd) * this.maxSpeed;
      this.velocity.y = (this.velocity.y / spd) * this.maxSpeed;
    }

    // Reset acceleration
    this.acceleration.x = 0;
    this.acceleration.y = 0;
  }
}