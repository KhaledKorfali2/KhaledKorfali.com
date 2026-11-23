/* Singularity: a gravity sandbox seen from above.
   - Physics: Newtonian gravity between every pair of bodies, with merging,
     black holes that swallow things, and a drag that makes close pairs of
     black holes spiral together.
   - Picture: the scene (stars, trails, planets) is drawn on a 2D canvas, then a
     WebGL shader bends it around each black hole with the point-mass lens
     equation and adds the glowing disc and the black shadow. */
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const G = 2400;
  const MASS = { planet: 1, star: 80, hole: 1000 };
  const IGNITE = 40;          // a clump this heavy becomes a star
  const MAX_BODIES = 320, MAX_HOLES = 8, MAX_RIPPLES = 4;

  const view = document.getElementById("stage");
  const hint = document.getElementById("hint");
  const sub = document.getElementById("sub");
  let gl = view.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
  // The scene is drawn off-screen and handed to the shader. Without WebGL it
  // is drawn straight to the visible canvas and the black holes are painted on.
  const scene = gl ? document.createElement("canvas") : view;
  const ctx = scene.getContext("2d");

  let W = 0, H = 0, dpr = 1, zoom = 1;
  const cam = { x: 0, y: 0 };
  let bodies = [], sparks = [], ripples = [];
  let tool = "planet", playing = true, time = 0, last = 0;
  let aim = null;             // { x0, y0, x1, y1 } in world units while a throw is being lined up

  const einstein = function (m) { return 34 * Math.sqrt(m / 1000); };   // radius of a hole's ring of bent light
  const horizon = function (m) { return 0.55 * einstein(m); };          // inside this, a body is gone
  function radius(b) {
    if (b.type === "hole") return horizon(b.m);
    if (b.type === "star") return 3.3 * Math.cbrt(b.m);
    return 1.4 + 3 * Math.cbrt(b.m);
  }

  const PLANET_COLOURS = ["#6fb7ff", "#7be0c3", "#f2a65a", "#e87ea1", "#c9b6ff", "#d9e27a", "#8fd0e8"];
  const STAR_COLOURS = ["#fff1c9", "#ffd58a", "#d6e6ff"];
  const pickFrom = function (list) { return list[Math.floor(Math.random() * list.length)]; };

  function add(type, x, y, vx, vy, m) {
    const b = { type: type, x: x, y: y, vx: vx || 0, vy: vy || 0, m: m || MASS[type], trail: [], dead: false };
    b.colour = type === "star" ? pickFrom(STAR_COLOURS) : pickFrom(PLANET_COLOURS);
    bodies.push(b);
    if (bodies.length > MAX_BODIES) {
      // Make room by retiring the oldest of the smallest bodies.
      const i = bodies.findIndex(function (o) { return o.type === "planet" && o.m < 1; });
      bodies.splice(i >= 0 ? i : bodies.findIndex(function (o) { return o.type === "planet"; }), 1);
    }
    return b;
  }

  /* ── Placing things ── */
  // The body whose pull is strongest at a point (stars and black holes only).
  function dominant(x, y, ignore) {
    let best = null, bestPull = 0;
    for (const b of bodies) {
      if (b === ignore || b.m < IGNITE) continue;
      const d2 = (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) + 1;
      if (b.m / d2 > bestPull) { bestPull = b.m / d2; best = b; }
    }
    return best;
  }
  // Give `b` the sideways speed for a circular orbit around `c`, and nudge `c`
  // the other way so the pair's total momentum doesn't change.
  function setOrbiting(b, c) {
    const dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy) || 1;
    const v = Math.sqrt(G * (b.m + c.m) / d), tx = -dy / d, ty = dx / d;
    const share = c.m / (b.m + c.m);
    b.vx = c.vx + tx * v * share; b.vy = c.vy + ty * v * share;
    c.vx -= tx * v * (1 - share); c.vy -= ty * v * (1 - share);
  }
  function drop(type, x, y) {
    const b = add(type, x, y, 0, 0);
    const c = dominant(x, y, b);
    if (c) setOrbiting(b, c);
    return b;
  }
  function swarm() {
    let c = null;
    for (const b of bodies) if (b.m >= IGNITE && (!c || b.m > c.m)) c = b;
    for (let i = 0; i < 45; i++) {
      const a = Math.random() * TAU;
      if (c) {
        const base = c.type === "hole" ? einstein(c.m) : radius(c) * 2;
        const r = base * (2.3 + Math.random() * 4.5);
        const b = add("planet", c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 0, 0, 0.1);
        setOrbiting(b, c);
      } else {
        // Nothing to orbit: a loose cloud that will fall together under its own weight.
        const r = 30 + Math.sqrt(Math.random()) * 130;
        add("planet", cam.x + Math.cos(a) * r, cam.y + Math.sin(a) * r, -Math.sin(a) * 9, Math.cos(a) * 9, 0.3);
      }
    }
  }

  /* ── Scenes ── */
  function ring(c, n, r0, r1, m) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, r = r0 + Math.random() * (r1 - r0);
      setOrbiting(add("planet", c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 0, 0, m), c);
    }
  }
  const SCENES = [
    { name: "Orbits", make: function () {
        const h = add("hole", 0, 0);
        [78, 112, 150, 196].forEach(function (r, i) {
          const a = i * 2.4;
          setOrbiting(add("planet", Math.cos(a) * r, Math.sin(a) * r), h);
        });
        setOrbiting(add("star", -360, 40, 0, 0, 45), h);
        ring(h, 40, 80, 190, 0.1);
      } },
    { name: "Binary", make: function () {
        const a = add("hole", -65, 0), b = add("hole", 65, 0);
        setOrbiting(b, a);
        const centre = { x: 0, y: 0, vx: 0, vy: 0, m: 2000 };
        ring(centre, 70, 340, 460, 0.1);
        [350, 400, 450].forEach(function (r, i) {
          setOrbiting(add("planet", Math.cos(i * 2.1) * r, Math.sin(i * 2.1) * r), centre);
        });
      } },
    { name: "Collision course", make: function () {
        const a = add("hole", -420, -70, 62, 0), b = add("hole", 420, 70, -62, 0);
        ring(a, 30, 70, 170, 0.1); ring(b, 30, 70, 170, 0.1);
        setOrbiting(add("star", -420, 150), a);
      } },
    { name: "Empty space", make: function () {} }
  ];
  let sceneIdx = 0;
  function loadScene(i) {
    sceneIdx = (i + SCENES.length) % SCENES.length;
    bodies = []; sparks = []; ripples = []; aim = null;
    cam.x = 0; cam.y = 0;
    zoom = Math.max(0.42, Math.min(1, Math.min(W, H) / 900));
    SCENES[sceneIdx].make();
  }

  /* ── Physics ── */
  let ax = new Float64Array(MAX_BODIES + 8), ay = new Float64Array(MAX_BODIES + 8);

  function accelerate() {
    const n = bodies.length;
    for (let i = 0; i < n; i++) { ax[i] = 0; ay[i] = 0; }
    for (let i = 0; i < n; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < n; j++) {
        const b = bodies[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy + 36;                   // softened so close passes stay stable
        const inv = G / (d2 * Math.sqrt(d2));
        ax[i] += dx * inv * b.m; ay[i] += dy * inv * b.m;
        ax[j] -= dx * inv * a.m; ay[j] -= dy * inv * a.m;
        if (a.type === "hole" && b.type === "hole") {
          // Stand-in for gravitational waves: close pairs of holes lose orbital energy.
          const reach = 3 * (horizon(a.m) + horizon(b.m)), d = Math.sqrt(d2);
          if (d < reach) {
            const f = 0.9 * (1 - d / reach), total = a.m + b.m;
            const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
            ax[i] += f * rvx * b.m / total; ay[i] += f * rvy * b.m / total;
            ax[j] -= f * rvx * a.m / total; ay[j] -= f * rvy * a.m / total;
          }
        }
      }
    }
  }

  function burst(x, y, vx, vy, colour, count, speed) {
    for (let i = 0; i < count && sparks.length < 400; i++) {
      const a = Math.random() * TAU, s = speed * (0.3 + Math.random());
      sparks.push({ x: x, y: y, vx: vx * 0.4 + Math.cos(a) * s, vy: vy * 0.4 + Math.sin(a) * s, life: 0.5 + Math.random() * 0.7, colour: colour });
    }
  }

  // `a` absorbs `b`: mass and momentum are conserved.
  function merge(a, b) {
    const total = a.m + b.m;
    a.vx = (a.vx * a.m + b.vx * b.m) / total;
    a.vy = (a.vy * a.m + b.vy * b.m) / total;
    a.x = (a.x * a.m + b.x * b.m) / total;
    a.y = (a.y * a.m + b.y * b.m) / total;
    if (a.type === "hole" && b.type === "hole") {
      ripples.push({ x: a.x, y: a.y, r: 0, amp: 30 });
      if (ripples.length > MAX_RIPPLES) ripples.shift();
      burst(a.x, a.y, a.vx, a.vy, "#ffd9a0", 40, 260);
    } else if (a.type === "hole") {
      if (b.m >= 1) burst(b.x, b.y, b.vx, b.vy, "#ffcf99", b.type === "star" ? 30 : 6, 70);
    } else {
      burst(b.x, b.y, a.vx, a.vy, b.colour, Math.min(24, 5 + b.m), 60);
    }
    a.m = total;
    if (a.type === "planet" && a.m >= IGNITE) {
      a.type = "star"; a.colour = pickFrom(STAR_COLOURS);
      burst(a.x, a.y, a.vx, a.vy, "#fff1c9", 36, 150);
    }
    b.dead = true;
  }

  function collide() {
    const n = bodies.length;
    for (let i = 0; i < n; i++) {
      const a = bodies[i];
      if (a.dead) continue;
      const ra = radius(a);
      for (let j = i + 1; j < n; j++) {
        const b = bodies[j];
        if (b.dead) continue;
        const dx = b.x - a.x, dy = b.y - a.y, rb = radius(b);
        let reach;
        if (a.type === "hole" && b.type === "hole") reach = 0.8 * (ra + rb);
        else if (a.type === "hole") reach = ra;
        else if (b.type === "hole") reach = rb;
        else reach = 0.55 * (ra + rb);
        if (dx * dx + dy * dy > reach * reach) continue;
        // The hole always wins; otherwise the heavier body does.
        const aWins = a.type === "hole" ? (b.type !== "hole" || a.m >= b.m) : (b.type !== "hole" && a.m >= b.m);
        if (aWins) merge(a, b); else { merge(b, a); break; }
      }
    }
  }

  function step(dt) {
    const SUB = 4, h = dt / SUB;
    for (let s = 0; s < SUB; s++) {
      accelerate();
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        b.vx += ax[i] * h; b.vy += ay[i] * h;
        b.x += b.vx * h; b.y += b.vy * h;
      }
    }
    collide();
    const far = 2600;
    bodies = bodies.filter(function (b) {
      return !b.dead && Math.abs(b.x - cam.x) < far && Math.abs(b.y - cam.y) < far;
    });
    for (const b of bodies) {
      if (b.type === "hole") continue;
      const t = b.trail, n = t.length;
      if (!n || Math.abs(t[n - 2] - b.x) + Math.abs(t[n - 1] - b.y) > 3) {
        t.push(b.x, b.y);
        const keep = b.m < 1 ? 28 : b.type === "star" ? 220 : 150;
        if (t.length > keep) t.splice(0, t.length - keep);
      }
    }
    for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.97; s.vy *= 0.97; s.life -= dt; }
    sparks = sparks.filter(function (s) { return s.life > 0; });
    for (const r of ripples) { r.r += 520 * dt; r.amp *= Math.exp(-1.25 * dt); }
    ripples = ripples.filter(function (r) { return r.amp > 0.6; });
  }

  // Where a thrown body would go if nothing else moved, for the aiming line.
  function predict(x, y, vx, vy) {
    const pts = [], heavy = bodies.filter(function (b) { return b.m >= IGNITE; });
    const h = 1 / 60;
    for (let i = 0; i < 200; i++) {
      for (const b of heavy) {
        const dx = b.x - x, dy = b.y - y, d2 = dx * dx + dy * dy + 36;
        if (d2 < radius(b) * radius(b)) return pts;
        const inv = G * b.m / (d2 * Math.sqrt(d2));
        vx += dx * inv * h; vy += dy * inv * h;
      }
      x += vx * h; y += vy * h;
      if (i % 4 === 3) pts.push(x, y);
    }
    return pts;
  }

  /* ── Scene drawing (2D) ── */
  // A tile of distant stars and faint clouds, repeated as the backdrop.
  const TILE = 640;
  const backdrop = (function () {
    const c = document.createElement("canvas");
    c.width = c.height = TILE;
    const g = c.getContext("2d");
    g.fillStyle = "#05060a";
    g.fillRect(0, 0, TILE, TILE);
    const wrap = function (fn, x, y, r) {
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) fn(x + ox * TILE, y + oy * TILE, r);
    };
    const clouds = ["rgba(90,70,160,", "rgba(40,110,130,", "rgba(150,70,60,"];
    for (let i = 0; i < 5; i++) {
      const colour = clouds[i % 3], x = Math.random() * TILE, y = Math.random() * TILE, r = 130 + Math.random() * 120;
      wrap(function (px, py, pr) {
        const grad = g.createRadialGradient(px, py, 0, px, py, pr);
        grad.addColorStop(0, colour + "0.13)"); grad.addColorStop(1, colour + "0)");
        g.fillStyle = grad; g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
      }, x, y, r);
    }
    for (let i = 0; i < 420; i++) {
      const x = Math.random() * TILE, y = Math.random() * TILE, big = Math.random() < 0.08;
      const tint = Math.random();
      g.fillStyle = "rgba(" + (tint < 0.2 ? "255,214,170" : tint > 0.8 ? "180,205,255" : "255,255,255") + "," + (0.25 + Math.random() * 0.75) + ")";
      wrap(function (px, py, pr) { g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill(); }, x, y, big ? 1.4 : 0.5 + Math.random() * 0.5);
    }
    return c;
  })();
  let pattern = null;

  function drawScene() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Backdrop, drifting a little as the camera moves.
    if (!pattern) pattern = ctx.createPattern(backdrop, "repeat");
    const ox = ((-cam.x * 0.2) % TILE + TILE) % TILE, oy = ((-cam.y * 0.2) % TILE + TILE) % TILE;
    ctx.save();
    ctx.translate(ox - TILE, oy - TILE);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, W + TILE * 2, H + TILE * 2);
    ctx.restore();

    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x, -cam.y);
    ctx.lineCap = "round"; ctx.lineJoin = "round";

    // Trails: an older, fainter half and a newer, brighter half.
    for (const b of bodies) {
      const t = b.trail, n = t.length;
      if (n < 4) continue;
      const mid = (n >> 2) << 1;
      ctx.strokeStyle = b.colour;
      ctx.lineWidth = (b.m < 1 ? 1 : 1.6) / zoom;
      ctx.globalAlpha = b.m < 1 ? 0.14 : 0.2;
      ctx.beginPath(); ctx.moveTo(t[0], t[1]);
      for (let i = 2; i <= mid; i += 2) ctx.lineTo(t[i], t[i + 1]);
      ctx.stroke();
      ctx.globalAlpha = b.m < 1 ? 0.32 : 0.55;
      ctx.beginPath(); ctx.moveTo(t[mid], t[mid + 1]);
      for (let i = mid + 2; i < n; i += 2) ctx.lineTo(t[i], t[i + 1]);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const b of bodies) {
      if (b.type === "hole") continue;
      const r = radius(b);
      if (b.type === "star") {
        const glow = ctx.createRadialGradient(b.x, b.y, r * 0.5, b.x, b.y, r * 4.5);
        glow.addColorStop(0, "rgba(255,214,140,0.5)"); glow.addColorStop(1, "rgba(255,170,80,0)");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(b.x, b.y, r * 4.5, 0, TAU); ctx.fill();
        ctx.fillStyle = b.colour;
        ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = b.colour;
        ctx.beginPath(); ctx.arc(b.x, b.y, Math.max(r, 1.6 / zoom), 0, TAU); ctx.fill();
      }
    }

    ctx.globalCompositeOperation = "lighter";
    for (const s of sparks) {
      ctx.globalAlpha = Math.min(1, s.life * 1.6);
      ctx.fillStyle = s.colour;
      ctx.beginPath(); ctx.arc(s.x, s.y, 1.5 / zoom, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    if (aim) {
      const thrown = Math.hypot(aim.x1 - aim.x0, aim.y1 - aim.y0) * zoom > 10;
      const r = tool === "hole" ? horizon(MASS.hole) : tool === "star" ? 3.3 * Math.cbrt(MASS.star) : 4.4;
      ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath(); ctx.arc(aim.x0, aim.y0, r + 3 / zoom, 0, TAU); ctx.stroke();
      if (thrown) {
        ctx.beginPath(); ctx.moveTo(aim.x0, aim.y0); ctx.lineTo(aim.x1, aim.y1); ctx.stroke();
        const pts = predict(aim.x0, aim.y0, (aim.x1 - aim.x0) * THROW, (aim.y1 - aim.y0) * THROW);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        for (let i = 0; i < pts.length; i += 2) {
          ctx.globalAlpha = 0.85 * (1 - i / pts.length);
          ctx.beginPath(); ctx.arc(pts[i], pts[i + 1], 1.7 / zoom, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    if (!gl) {
      for (const b of bodies) {
        if (b.type !== "hole") continue;
        const e = einstein(b.m);
        const glow = ctx.createRadialGradient(b.x, b.y, e * 0.6, b.x, b.y, e * 2);
        glow.addColorStop(0, "rgba(255,190,110,0.9)"); glow.addColorStop(1, "rgba(255,120,30,0)");
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(b.x, b.y, e * 2, 0, TAU); ctx.fill();
        ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(b.x, b.y, e * 0.62, 0, TAU); ctx.fill();
      }
    }
  }

  /* ── Lensing pass (WebGL) ── */
  const FRAG = `
precision highp float;
uniform sampler2D uScene;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uHoles[${MAX_HOLES}];      // x, y, Einstein radius, in pixels from the top-left
uniform vec4 uRipples[${MAX_RIPPLES}];  // x, y, radius, strength
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 shift = vec2(0.0);
  vec3 glow = vec3(0.0);
  float shadow = 0.0;
  for (int i = 0; i < ${MAX_HOLES}; i++) {
    vec3 h = uHoles[i];
    if (h.z <= 0.0) continue;
    vec2 d = p - h.xy;
    float r = length(d) + 0.001, e = h.z, x = r / e;
    // Point-mass lens: what you see at distance r really sits at r - e*e/r.
    // The effect is faded out a few radii away so distant space stays put.
    float q = x / 5.0;
    shift += d * (e * e / (r * r)) / (1.0 + q * q * q * q);
    shadow = max(shadow, 1.0 - smoothstep(0.58, 0.64, x));
    // Hot gas circling the hole, brightest at its inner edge.
    float ang = atan(d.y, d.x), lx = log(x);
    float swirl = 0.6 + 0.25 * sin(ang * 3.0 + 6.0 * lx - uTime * 2.2) + 0.15 * sin(ang * 7.0 - 11.0 * lx + uTime * 3.4);
    float band = smoothstep(0.6, 0.76, x) * exp(-(x - 0.76) * 2.3);
    vec3 heat = mix(vec3(1.0, 0.88, 0.66), vec3(1.0, 0.36, 0.06), clamp((x - 0.7) / 1.1, 0.0, 1.0));
    glow += heat * band * swirl * 1.5;
    float ringEdge = (x - 0.635) / 0.03;
    glow += vec3(1.0, 0.92, 0.78) * exp(-ringEdge * ringEdge) * 0.9;
  }
  for (int j = 0; j < ${MAX_RIPPLES}; j++) {
    vec4 w = uRipples[j];
    if (w.w <= 0.0) continue;
    vec2 d = p - w.xy;
    float r = length(d) + 0.001, k = (r - w.z) / (36.0 + w.z * 0.05);
    shift += d / r * w.w * exp(-k * k) * sin(k * 3.0 + 1.0);
  }
  vec2 uv = (p - shift) / uRes;
  vec3 col = texture2D(uScene, uv).rgb;
  col *= step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  col = (col + glow) * (1.0 - shadow);
  gl_FragColor = vec4(col, 1.0);
}`;
  const U = {};
  const holeData = new Float32Array(MAX_HOLES * 3), rippleData = new Float32Array(MAX_RIPPLES * 4);

  function setupGL() {
    const sh = function (type, src) {
      const o = gl.createShader(type);
      gl.shaderSource(o, src); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
      return o;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }"));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ["uScene", "uRes", "uTime", "uHoles", "uRipples"].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(U.uScene, 0);
  }

  function lensPass() {
    const holes = bodies.filter(function (b) { return b.type === "hole"; })
      .sort(function (a, b) { return b.m - a.m; }).slice(0, MAX_HOLES);
    holeData.fill(0); rippleData.fill(0);
    const sx = function (x) { return (W / 2 + (x - cam.x) * zoom) * dpr; };
    const sy = function (y) { return (H / 2 + (y - cam.y) * zoom) * dpr; };
    holes.forEach(function (b, i) {
      holeData[i * 3] = sx(b.x); holeData[i * 3 + 1] = sy(b.y); holeData[i * 3 + 2] = einstein(b.m) * zoom * dpr;
    });
    ripples.forEach(function (r, i) {
      rippleData[i * 4] = sx(r.x); rippleData[i * 4 + 1] = sy(r.y);
      rippleData[i * 4 + 2] = r.r * zoom * dpr; rippleData[i * 4 + 3] = r.amp * zoom * dpr;
    });
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, scene);
    gl.uniform2f(U.uRes, view.width, view.height);
    gl.uniform1f(U.uTime, time);
    gl.uniform3fv(U.uHoles, holeData);
    gl.uniform4fv(U.uRipples, rippleData);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ── Frame ── */
  let statTimer = 0;
  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000 || 1 / 60);
    last = now;
    time += dt;
    if (playing) step(dt);

    // Keep the heavy things in view.
    let mx = 0, my = 0, mt = 0;
    for (const b of bodies) if (b.m >= IGNITE) { mx += b.x * b.m; my += b.y * b.m; mt += b.m; }
    if (mt && playing) {
      const k = Math.min(1, dt * 1.2);
      cam.x += (mx / mt - cam.x) * k; cam.y += (my / mt - cam.y) * k;
    }

    drawScene();
    if (gl) lensPass();

    statTimer -= dt;
    if (statTimer <= 0) {
      statTimer = 0.4;
      const n = { hole: 0, star: 0, planet: 0 };
      for (const b of bodies) n[b.type]++;
      const part = function (count, one, many) { return count ? count + " " + (count === 1 ? one : many) : ""; };
      sub.textContent = [part(n.hole, "black hole", "black holes"), part(n.star, "star", "stars"), part(n.planet, "planet", "planets")]
        .filter(Boolean).join(" · ") || SCENES[sceneIdx].name;
    }
    requestAnimationFrame(frame);
  }

  /* ── Input ── */
  const THROW = 1.5;          // speed per unit of drag
  const pointers = new Map();
  let pinch = 0;
  function world(e) {
    return [cam.x + (e.clientX - W / 2) / zoom, cam.y + (e.clientY - H / 2) / zoom];
  }
  function spread() {
    const p = Array.from(pointers.values());
    return Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
  }
  function setZoom(z) { zoom = Math.max(0.25, Math.min(2.5, z)); }

  view.addEventListener("pointerdown", function (e) {
    if (e.button) return;
    closeInfo();
    hint.classList.add("hidden");
    try { view.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) { aim = null; pinch = spread(); return; }
    if (pointers.size > 2) return;
    const p = world(e);
    aim = { x0: p[0], y0: p[1], x1: p[0], y1: p[1] };
  });
  view.addEventListener("pointermove", function (e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) {
      const s = spread();
      if (pinch > 0 && s > 0) setZoom(zoom * s / pinch);
      pinch = s;
    } else if (aim) {
      const p = world(e);
      aim.x1 = p[0]; aim.y1 = p[1];
    }
  });
  view.addEventListener("pointerup", function (e) {
    pointers.delete(e.pointerId);
    if (!aim) return;
    const dx = aim.x1 - aim.x0, dy = aim.y1 - aim.y0;
    if (Math.hypot(dx, dy) * zoom > 10) add(tool, aim.x0, aim.y0, dx * THROW, dy * THROW);
    else drop(tool, aim.x0, aim.y0);
    aim = null;
  });
  view.addEventListener("pointercancel", function (e) { pointers.delete(e.pointerId); aim = null; });
  view.addEventListener("wheel", function (e) {
    e.preventDefault();
    setZoom(zoom * Math.exp(-Math.max(-1, Math.min(1, e.deltaY / 100)) * 0.12));
  }, { passive: false });

  /* ── Controls ── */
  function setTool(t) {
    tool = t;
    document.querySelectorAll("[data-tool]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-tool") === t);
    });
  }
  document.getElementById("tools").addEventListener("click", function (e) {
    const b = e.target.closest("[data-tool]");
    if (b) setTool(b.getAttribute("data-tool"));
  });
  document.getElementById("swarmBtn").addEventListener("click", function () { hint.classList.add("hidden"); swarm(); });
  document.getElementById("sceneBtn").addEventListener("click", function () {
    loadScene(sceneIdx + 1);
    statTimer = 0;
    hint.textContent = SCENES[sceneIdx].name + (sceneIdx === 3 ? ": add a swarm, or anything you like." : "");
    hint.classList.remove("hidden");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hint.classList.add("hidden"); }, 3500);
  });
  const playBtn = document.getElementById("playBtn");
  function setPlaying(on) {
    playing = on;
    document.getElementById("pauseIcon").style.display = on ? "" : "none";
    document.getElementById("playIcon").style.display = on ? "none" : "";
    playBtn.setAttribute("aria-label", on ? "Pause" : "Play");
  }
  playBtn.addEventListener("click", function () { setPlaying(!playing); });

  const info = document.getElementById("info"), infoBtn = document.getElementById("infoBtn");
  function closeInfo() { info.classList.remove("open"); infoBtn.setAttribute("aria-expanded", "false"); }
  infoBtn.addEventListener("click", function () {
    infoBtn.setAttribute("aria-expanded", info.classList.toggle("open"));
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeInfo();
    if (e.target.tagName === "BUTTON") return;
    if (e.key === " ") { e.preventDefault(); setPlaying(!playing); }
    if (e.key === "1") setTool("planet");
    if (e.key === "2") setTool("star");
    if (e.key === "3") setTool("hole");
  });

  /* ── Start ── */
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    view.width = scene.width = Math.round(W * dpr);
    view.height = scene.height = Math.round(H * dpr);
    if (gl) gl.viewport(0, 0, view.width, view.height);
  }
  if (gl) {
    try { setupGL(); } catch (err) { console.error(err); gl = null; }
    // Shader trouble after the canvas already has a WebGL context: start over without it.
    if (!gl) { view.insertAdjacentHTML("afterend", "<p style='position:fixed;inset:0;display:grid;place-items:center;padding:32px;text-align:center;color:#a9a69e'>This one needs WebGL, which is switched off or unsupported in this browser.</p>"); return; }
    view.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
    view.addEventListener("webglcontextrestored", function () { location.reload(); });
  }
  let hintTimer = setTimeout(function () { hint.classList.add("hidden"); }, 10000);
  window.addEventListener("resize", resize);
  resize();
  loadScene(0);
  requestAnimationFrame(frame);
})();
