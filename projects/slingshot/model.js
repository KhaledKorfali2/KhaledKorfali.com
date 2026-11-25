/* Slingshot's flight model: the rules of the game with no drawing in them.
   The game uses it to fly the probe, and the level checker uses the very same
   code to try thousands of launches, so the two can never disagree.

   It runs in the browser (window.SlingshotModel) and in Node (module.exports),
   which is what lets levels be designed and checked from the command line. */
(function (root) {
  "use strict";

  const M = {
    FIELD_W: 1000, FIELD_H: 600,
    STEP: 1 / 120,                 // every flight advances in the same fixed steps
    MIN_SPEED: 90, MAX_SPEED: 560,
    TARGET_R: 46, STAR_R: 30, PROBE_R: 5,
    EDGE: 24,                      // the probe is lost this far past the edge of the map
    TIME_LIMIT: 16,
    BEAM_R: 150, BEAM_M: 1.6e6      // the ring's own pull: it draws the probe in from this far away
  };
  const TAU = Math.PI * 2;

  // Where a body is at time t. Moons travel round a fixed circle.
  M.place = function (b, t, out) {
    if (b.orbit) {
      const a = b.orbit.phase + TAU * t / b.orbit.period;
      out.x = b.orbit.cx + Math.cos(a) * b.orbit.r;
      out.y = b.orbit.cy + Math.sin(a) * b.orbit.r;
    } else { out.x = b.x; out.y = b.y; }
    return out;
  };

  M.launch = function (level, angle, speed) {
    return { x: level.start[0], y: level.start[1], vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, t: 0, stars: 0, got: -1 };
  };

  // Do the segments a→b and c→d cross?
  function crosses(ax, ay, bx, by, cx, cy, dx, dy) {
    const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (d === 0) return false;
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
    const s = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
    return t >= 0 && t <= 1 && s >= 0 && s <= 1;
  }

  const spot = { x: 0, y: 0 };
  // Advance the probe one step. Returns "" to carry on, or how the flight ended:
  // "arrived", "crashed" (planet or wall), "swallowed" (black hole) or "lost".
  M.advance = function (level, p) {
    const bodies = level.bodies;
    let ax = 0, ay = 0;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (b.off) continue;                       // the checker switches bodies off to see whether they matter
      M.place(b, p.t, spot);
      const dx = spot.x - p.x, dy = spot.y - p.y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
      if (d < b.r + M.PROBE_R * 0.5) return b.hole ? "swallowed" : "crashed";
      const pull = b.m / (d2 * d);
      ax += dx * pull; ay += dy * pull;
    }
    // The ring has a tractor beam, so a near miss is drawn in. Its strength fades to
    // nothing at the edge of its reach, which keeps it from grabbing passing shots.
    const bx = level.target[0] - p.x, by = level.target[1] - p.y, bd = Math.sqrt(bx * bx + by * by);
    if (bd < M.BEAM_R) {
      const dd = Math.max(bd, 30), fade = 1 - bd / M.BEAM_R;
      const pull = M.BEAM_M * fade / (dd * dd * dd);
      ax += bx * pull; ay += by * pull;
    }
    const x0 = p.x, y0 = p.y;
    p.vx += ax * M.STEP; p.vy += ay * M.STEP;
    p.x += p.vx * M.STEP; p.y += p.vy * M.STEP;
    p.t += M.STEP;

    const walls = level.walls;
    if (walls) for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (crosses(x0, y0, p.x, p.y, w[0], w[1], w[2], w[3])) return "crashed";
    }
    const stars = level.stars;
    for (let i = 0; i < stars.length; i++) {
      if (p.stars & (1 << i)) continue;
      const sx = stars[i][0] - p.x, sy = stars[i][1] - p.y;
      if (sx * sx + sy * sy < M.STAR_R * M.STAR_R) { p.stars |= 1 << i; p.got = i; }
    }
    const tx = level.target[0] - p.x, ty = level.target[1] - p.y;
    if (tx * tx + ty * ty < M.TARGET_R * M.TARGET_R) return "arrived";
    if (p.x < -M.EDGE || p.x > M.FIELD_W + M.EDGE || p.y < -M.EDGE || p.y > M.FIELD_H + M.EDGE) return "lost";
    if (p.t > M.TIME_LIMIT) return "lost";
    return "";
  };

  M.countBits = function (n) { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; };

  /* Try a grid of launches. Returns { wins, angles, speeds, grid } where grid[a][s]
     is 0 for a miss or 1 + stars collected for a hit, and each win records how much
     the path turned (a straight shot turns 0) and optionally the path itself. */
  M.solve = function (level, opts) {
    opts = opts || {};
    const angleStep = opts.angleStep || 1, speeds = opts.speeds || 16;
    const nA = Math.round(360 / angleStep), wins = [], grid = [];
    for (let a = 0; a < nA; a++) {
      const row = new Uint8Array(speeds);
      for (let s = 0; s < speeds; s++) {
        const angle = a * angleStep * Math.PI / 180;
        const speed = M.MIN_SPEED + (M.MAX_SPEED - M.MIN_SPEED) * s / (speeds - 1);
        const p = M.launch(level, angle, speed);
        let end = "", turned = 0, prev = Math.atan2(p.vy, p.vx);
        const path = opts.paths ? [] : null;
        while (!end) {
          end = M.advance(level, p);
          const h = Math.atan2(p.vy, p.vx);
          let d = h - prev; d -= TAU * Math.round(d / TAU);
          turned += Math.abs(d); prev = h;
          if (path) path.push(p.x, p.y);
        }
        if (end === "arrived") {
          const stars = M.countBits(p.stars);
          row[s] = 1 + stars;
          wins.push({ a: a, s: s, angle: a * angleStep, speed: speed, time: p.t, stars: stars, turned: turned, path: path });
        }
      }
      grid.push(row);
    }
    return { wins: wins, grid: grid, angles: nA, speeds: speeds };
  };

  /* The largest patch of neighbouring winning launches (angles wrap round).
     A big patch means there is room for error; a patch of a few cells means the
     level needs pixel-perfect aim. `min` filters on grid value (2 = at least one star…). */
  M.largestPatch = function (solved, min) {
    min = min || 1;
    const nA = solved.angles, nS = solved.speeds, seen = [], g = solved.grid;
    for (let a = 0; a < nA; a++) seen.push(new Uint8Array(nS));
    let best = { size: 0, cells: [] };
    for (let a = 0; a < nA; a++) for (let s = 0; s < nS; s++) {
      if (g[a][s] < min || seen[a][s]) continue;
      const stack = [[a, s]], cells = [];
      seen[a][s] = 1;
      while (stack.length) {
        const c = stack.pop();
        cells.push(c);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          const na = (c[0] + d[0] + nA) % nA, ns = c[1] + d[1];
          if (ns < 0 || ns >= nS || seen[na][ns] || g[na][ns] < min) return;
          seen[na][ns] = 1; stack.push([na, ns]);
        });
      }
      if (cells.length > best.size) best = { size: cells.length, cells: cells };
    }
    return best;
  };

  if (typeof module !== "undefined" && module.exports) module.exports = M;
  else root.SlingshotModel = M;
})(typeof window !== "undefined" ? window : globalThis);
