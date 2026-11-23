/* Prism: a 2D optics table. Every light fires rays of single colours; each ray
   is traced through mirrors and glass with Snell's law, Fresnel reflection and
   a wavelength-dependent refractive index. The rays are drawn by the GPU as
   additive lines in one draw call (painting them with the 2D canvas took
   hundreds of milliseconds a frame); objects and handles sit on a 2D canvas
   on top. */
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const NQ = 48;            // distinct colours across the spectrum
  const PER_RAY = 12;       // colours carried by each white ray
  const MAX_BOUNCES = 14;
  const MAX_SEGS = 90000;

  const canvas = document.getElementById("stage");      // objects, handles, pointer input
  const ctx = canvas.getContext("2d");
  const lightCanvas = document.getElementById("light");  // the rays
  const gl = lightCanvas.getContext("webgl", { antialias: true, alpha: false, powerPreference: "high-performance" });
  const hint = document.getElementById("hint");
  const sub = document.getElementById("sub");
  const removeBtn = document.getElementById("removeBtn");

  let W = 0, H = 0, S = 600, dpr = 1;
  let objects = [];
  let selected = null;
  let dirty = true;
  let demo = true;          // gentle motion until the first touch
  let t0 = performance.now();

  /* ── Colour: wavelength → RGB, balanced so a full set of colours adds to white ── */
  const COLOURS = [], INDEX = [];
  (function () {
    const raw = [];
    let sr = 0, sg = 0, sb = 0;
    for (let q = 0; q < NQ; q++) {
      const u = q / (NQ - 1), wl = 405 + 285 * u;
      let r = 0, g = 0, b = 0;
      if (wl < 440) { r = (440 - wl) / 60; b = 1; }
      else if (wl < 490) { g = (wl - 440) / 50; b = 1; }
      else if (wl < 510) { g = 1; b = (510 - wl) / 20; }
      else if (wl < 580) { r = (wl - 510) / 70; g = 1; }
      else if (wl < 645) { r = 1; g = (645 - wl) / 65; }
      else { r = 1; }
      const f = wl < 420 ? 0.35 + 0.65 * (wl - 380) / 40 : wl > 660 ? 0.4 + 0.6 * (700 - wl) / 40 : 1;
      r *= f; g *= f; b *= f;
      raw.push([r, g, b]); sr += r; sg += g; sb += b;
      // Dispersion is exaggerated: real glass varies by about 0.02 across the spectrum.
      INDEX.push(1.47 + 0.1 * Math.pow(1 - u, 1.25));
    }
    const k = 2.4 * NQ / PER_RAY;
    for (const c of raw) COLOURS.push(c[0] / sr * k, c[1] / sg * k, c[2] / sb * k);
  })();

  /* ── Objects ── */
  function make(type, x, y, rot) {
    const o = { type: type, x: x, y: y, rot: rot || 0, prims: [] };
    o.r = { beam: 26, lamp: 18, mirror: 0.15, prism: 0.16, lens: 0.15, block: 0.15, ball: 0.085 }[type];
    if (o.r < 1) o.r *= S;
    return o;
  }

  // Local-space outline: line corners for polygons, parameters for curved shapes.
  function corners(o) {
    const r = o.r;
    if (o.type === "prism") {
      const out = [];
      for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; out.push([r * Math.cos(a), r * Math.sin(a)]); }
      return out;
    }
    if (o.type === "block") return [[-r, -r * 0.42], [r, -r * 0.42], [r, r * 0.42], [-r, r * 0.42]];
    if (o.type === "mirror") return [[-r, 0], [r, 0]];
    return null;
  }
  function lensGeom(o) {
    const h = o.r, R = h * 2.1;
    return { R: R, d: Math.sqrt(R * R - h * h), th: Math.asin(h / R) };
  }

  function build(o) {
    const c = Math.cos(o.rot), s = Math.sin(o.rot), prims = [];
    const tx = function (p) { return [o.x + p[0] * c - p[1] * s, o.y + p[0] * s + p[1] * c]; };
    const pts = corners(o);
    if (pts) {
      const n = pts.length, mirror = o.type === "mirror";
      for (let i = 0; i < (mirror ? 1 : n); i++) {
        const a = tx(pts[i]), b = tx(pts[(i + 1) % n]);
        let nx = b[1] - a[1], ny = a[0] - b[0];
        const l = Math.hypot(nx, ny); nx /= l; ny /= l;
        // Outward means away from the centre of the (convex) shape.
        if (!mirror && (nx * ((a[0] + b[0]) / 2 - o.x) + ny * ((a[1] + b[1]) / 2 - o.y)) < 0) { nx = -nx; ny = -ny; }
        prims.push({ seg: true, ax: a[0], ay: a[1], ex: b[0] - a[0], ey: b[1] - a[1], nx: nx, ny: ny, mirror: mirror });
      }
    } else if (o.type === "ball") {
      prims.push({ cx: o.x, cy: o.y, r: o.r, mid: 0, span: Math.PI + 1 });
    } else if (o.type === "lens") {
      const g = lensGeom(o);
      const A = tx([-g.d, 0]), B = tx([g.d, 0]);
      prims.push({ cx: A[0], cy: A[1], r: g.R, mid: o.rot, span: g.th });
      prims.push({ cx: B[0], cy: B[1], r: g.R, mid: o.rot + Math.PI, span: g.th });
    }
    o.prims = prims;
  }

  function allPrims() {
    const list = [];
    for (const o of objects) for (const p of o.prims) list.push(p);
    return list;
  }

  /* ── Ray tracing ── */
  let prims = [], segCount = 0;
  const verts = new Float32Array(MAX_SEGS * 10);   // per segment: 2 × (x, y, r, g, b)
  const hit = { t: 0, nx: 0, ny: 0, mirror: false };

  function nearest(ox, oy, dx, dy) {
    let best = Infinity;
    for (let i = 0; i < prims.length; i++) {
      const p = prims[i];
      if (p.seg) {
        const den = dx * p.ey - dy * p.ex;
        if (den > -1e-9 && den < 1e-9) continue;
        const qx = p.ax - ox, qy = p.ay - oy;
        const t = (qx * p.ey - qy * p.ex) / den;
        if (t < 0.02 || t >= best) continue;
        const u = (qx * dy - qy * dx) / den;
        if (u < 0 || u > 1) continue;
        best = t; hit.nx = p.nx; hit.ny = p.ny; hit.mirror = p.mirror;
      } else {
        const fx = ox - p.cx, fy = oy - p.cy;
        const b = fx * dx + fy * dy, disc = b * b - (fx * fx + fy * fy - p.r * p.r);
        if (disc < 0) continue;
        const sq = Math.sqrt(disc);
        for (let k = 0; k < 2; k++) {
          const t = k ? -b + sq : -b - sq;
          if (t < 0.02 || t >= best) continue;
          const nx = (fx + dx * t) / p.r, ny = (fy + dy * t) / p.r;
          let da = Math.atan2(ny, nx) - p.mid;
          da -= TAU * Math.round(da / TAU);
          if (da > p.span || da < -p.span) continue;
          best = t; hit.nx = nx; hit.ny = ny; hit.mirror = false;
        }
      }
    }
    hit.t = best;
    return best < Infinity;
  }

  function emit(ox, oy, dx, dy, q, power) {
    const stack = [ox, oy, dx, dy, power, 0];
    const n = INDEX[q];
    const cr = COLOURS[q * 3], cg = COLOURS[q * 3 + 1], cb = COLOURS[q * 3 + 2];
    while (stack.length && segCount < MAX_SEGS) {
      let depth = stack.pop(), inten = stack.pop();
      dy = stack.pop(); dx = stack.pop(); oy = stack.pop(); ox = stack.pop();
      while (depth < MAX_BOUNCES && inten > 0.02 && segCount < MAX_SEGS) {
        const found = nearest(ox, oy, dx, dy);
        const px = ox + dx * (found ? hit.t : 4000), py = oy + dy * (found ? hit.t : 4000);
        const o = segCount++ * 10, r = cr * inten, g = cg * inten, b = cb * inten;
        verts[o] = ox; verts[o + 1] = oy; verts[o + 2] = r; verts[o + 3] = g; verts[o + 4] = b;
        verts[o + 5] = px; verts[o + 6] = py; verts[o + 7] = r; verts[o + 8] = g; verts[o + 9] = b;
        if (!found) break;
        let nx = hit.nx, ny = hit.ny;
        let dn = dx * nx + dy * ny;
        depth++;
        if (hit.mirror) {
          dx -= 2 * dn * nx; dy -= 2 * dn * ny;
          inten *= 0.96;
        } else {
          const entering = dn < 0;
          if (!entering) { nx = -nx; ny = -ny; dn = -dn; }
          const n1 = entering ? 1 : n, n2 = entering ? n : 1;
          const eta = n1 / n2, cosi = -dn, k = 1 - eta * eta * (1 - cosi * cosi);
          const rx = dx - 2 * dn * nx, ry = dy - 2 * dn * ny;
          if (k < 0) {
            dx = rx; dy = ry;                      // total internal reflection
          } else {
            const cost = Math.sqrt(k);
            let r0 = (n1 - n2) / (n1 + n2); r0 *= r0;
            const cf = 1 - (n1 > n2 ? cost : cosi);
            const refl = r0 + (1 - r0) * cf * cf * cf * cf * cf;   // Schlick's approximation
            if (inten * refl > 0.02 && stack.length < 240) stack.push(px, py, rx, ry, inten * refl, depth);
            const m = eta * cosi - cost;
            dx = eta * dx + m * nx; dy = eta * dy + m * ny;
            inten *= 1 - refl;
          }
        }
        ox = px; oy = py;
      }
    }
  }

  function traceAll() {
    prims = allPrims();
    segCount = 0;
    const step = NQ / PER_RAY;
    for (const o of objects) {
      if (o.type === "beam") {
        const dx = Math.cos(o.rot), dy = Math.sin(o.rot);
        const half = Math.max(14, S * 0.034), count = Math.round(half * 2 * (gl ? dpr : 0.4));
        for (let j = 0; j < count; j++) {
          const off = -half + (j + 0.5) * (2 * half / count);
          const ox = o.x + dx * 20 - dy * off, oy = o.y + dy * 20 + dx * off;
          // Stagger the colours from ray to ray so the spectrum is continuous, not banded.
          for (let i = 0; i < PER_RAY; i++) emit(ox, oy, dx, dy, Math.floor(i * step + (j % 4) * step / 4), 1);
        }
      } else if (o.type === "lamp") {
        const count = gl ? (S < 520 ? 800 : 1300) : 300;
        for (let j = 0; j < count; j++) {
          const a = TAU * j / count, dx = Math.cos(a), dy = Math.sin(a);
          for (let i = 0; i < 4; i++) {
            emit(o.x + dx * 8, o.y + dy * 8, dx, dy, Math.floor(((i + (j % 12) / 12) / 4) * NQ), 0.5);
          }
        }
      }
    }
  }

  /* ── GPU setup: one program that draws coloured lines, blended additively ── */
  let uRes = null;
  if (gl) {
    const sh = function (type, src) {
      const o = gl.createShader(type);
      gl.shaderSource(o, src); gl.compileShader(o);
      return o;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER,
      "attribute vec2 aPos; attribute vec3 aCol; uniform vec2 uRes; varying vec3 vCol;" +
      "void main(){ vCol = aCol; vec2 c = aPos / uRes * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); }"));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER,
      "precision mediump float; varying vec3 vCol; void main(){ gl_FragColor = vec4(vCol, 1.0); }"));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    const aPos = gl.getAttribLocation(prog, "aPos"), aCol = gl.getAttribLocation(prog, "aCol");
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(aCol); gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 20, 8);
    uRes = gl.getUniformLocation(prog, "uRes");
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(7 / 255, 8 / 255, 12 / 255, 1);
    lightCanvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
    lightCanvas.addEventListener("webglcontextrestored", function () { location.reload(); });
  }

  /* ── Drawing ── */
  function shapePath(o) {
    const pts = corners(o);
    ctx.beginPath();
    if (pts) {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      if (pts.length > 2) ctx.closePath();
    } else if (o.type === "ball") {
      ctx.arc(0, 0, o.r, 0, TAU);
    } else if (o.type === "lens") {
      const g = lensGeom(o);
      ctx.arc(-g.d, 0, g.R, -g.th, g.th);
      ctx.arc(g.d, 0, g.R, Math.PI - g.th, Math.PI + g.th);
      ctx.closePath();
    }
  }

  function ringRadius(o) { return o.r + (o.type === "beam" || o.type === "lamp" ? 16 : 20); }
  function hasKnob(o) { return o.type !== "lamp" && o.type !== "ball"; }
  function knobPos(o) {
    // The beam's knob sits behind it so it never blocks the light.
    const a = o.type === "beam" ? o.rot + Math.PI : o.type === "mirror" || o.type === "block" ? o.rot : o.rot - Math.PI / 2;
    const rr = ringRadius(o);
    return [o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr];
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (gl) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, segCount * 10), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.LINES, 0, segCount * 2);
    } else {
      // No WebGL: paint a thinned-out set of rays the slow way.
      ctx.fillStyle = "#07080c";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < segCount * 10; i += 10) {
        ctx.strokeStyle = "rgb(" + Math.min(255, verts[i + 2] * 640 | 0) + "," + Math.min(255, verts[i + 3] * 640 | 0) + "," + Math.min(255, verts[i + 4] * 640 | 0) + ")";
        ctx.beginPath(); ctx.moveTo(verts[i], verts[i + 1]); ctx.lineTo(verts[i + 5], verts[i + 6]); ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    // Objects
    for (const o of objects) {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.rot);
      if (o.type === "beam") {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-22, -15, 42, 30, 7); else ctx.rect(-22, -15, 42, 30);
        ctx.fillStyle = "#1b1e27"; ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.fillRect(17, -9, 3, 18);
      } else if (o.type === "lamp") {
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU);
        ctx.fillStyle = "#fff"; ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU);
        ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.5; ctx.stroke();
      } else if (o.type === "mirror") {
        shapePath(o);
        ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.stroke();
        ctx.strokeStyle = "#d5dcea"; ctx.lineWidth = 3.5; ctx.stroke();
      } else {
        shapePath(o);
        ctx.fillStyle = "rgba(150,195,255,0.07)"; ctx.fill();
        ctx.strokeStyle = "rgba(210,228,255,0.42)"; ctx.lineWidth = 1.25; ctx.stroke();
      }
      ctx.restore();
    }

    // Selection ring and rotate knob
    if (selected) {
      const rr = ringRadius(selected);
      ctx.beginPath(); ctx.arc(selected.x, selected.y, rr, 0, TAU);
      ctx.setLineDash([3, 6]);
      ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 1.25; ctx.stroke();
      ctx.setLineDash([]);
      if (hasKnob(selected)) {
        const k = knobPos(selected);
        ctx.beginPath(); ctx.arc(k[0], k[1], 8, 0, TAU);
        ctx.fillStyle = "#7fb6ff"; ctx.fill();
        ctx.strokeStyle = "#07080c"; ctx.lineWidth = 2.5; ctx.stroke();
      }
    }
  }

  function frame(now) {
    if (demo && objects.length) {
      // Until someone touches it, rock the first glass piece so the light is alive.
      const g = objects.find(function (o) { return o.type !== "beam" && o.type !== "lamp"; });
      if (g && g.base !== undefined) {
        g.rot = g.base + Math.sin((now - t0) / 1900) * 0.2;
        build(g); dirty = true;
      }
    }
    if (dirty) { dirty = false; traceAll(); render(); }
    requestAnimationFrame(frame);
  }

  /* ── Scenes ── */
  // Scenes are laid out for a landscape table, in units of half the long side (x)
  // and half the short side (y), then turned a quarter turn on portrait screens.
  function at(type, fx, fy, rot) {
    return make(type, fx * Math.max(W, H) / 2, fy * Math.min(W, H) / 2, rot || 0);
  }
  function aimAt(o, x, y) { o.rot = Math.atan2(y - o.y, x - o.x); return o; }
  function bounce(m, from, to) {
    // Turn a mirror so light arriving from `from` leaves towards `to`.
    const a = Math.atan2(from.y - m.y, from.x - m.x), b = Math.atan2(to.y - m.y, to.x - m.x);
    m.rot = Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b)) + Math.PI / 2;
    return m;
  }
  const SCENES = [
    { name: "Rainbow", make: function () {
        const beam = at("beam", -0.62, 0.16), prism = at("prism", -0.1, 0);
        aimAt(beam, prism.x - prism.r * 0.4, prism.y - prism.r * 0.18);
        return [beam, prism];
      } },
    { name: "Focus", make: function () {
        return [at("beam", -0.76, -0.17), at("beam", -0.76, 0.17), at("lens", -0.3, 0), at("ball", 0.38, 0)];
      } },
    { name: "Hall of mirrors", make: function () {
        const beam = at("beam", -0.72, -0.5);
        const m1 = at("mirror", 0.62, -0.12), m2 = at("mirror", 0.02, 0.62), m3 = at("mirror", -0.5, 0.05);
        aimAt(beam, m1.x, m1.y);
        bounce(m1, beam, m2); bounce(m2, m1, m3); bounce(m3, m2, { x: m3.x + 300, y: m3.y - 260 });
        return [beam, m1, m2, m3, at("block", 0.34, 0.22, 0.2)];
      } },
    { name: "Lamp", make: function () {
        return [at("lamp", 0, 0), at("prism", 0.45, -0.32, 0.4), at("ball", -0.42, 0.4), at("lens", -0.28, -0.56, 0.9)];
      } }
  ];
  let sceneIdx = 0;
  function loadScene(i) {
    sceneIdx = (i + SCENES.length) % SCENES.length;
    objects = SCENES[sceneIdx].make();
    const portrait = H > W;
    for (const o of objects) {
      const x = o.x, y = o.y;
      if (portrait) { o.x = W / 2 - y; o.y = H / 2 + x; o.rot += Math.PI / 2; }
      else { o.x = W / 2 + x; o.y = H / 2 + y; }
      o.base = o.rot; build(o);
    }
    sub.textContent = SCENES[sceneIdx].name;
    select(null);
    dirty = true;
  }

  function select(o) {
    selected = o;
    removeBtn.disabled = !o;
    dirty = true;
  }

  /* ── Pointer input ── */
  const pointers = new Map();
  let mode = null, grabDX = 0, grabDY = 0, twist = 0;

  function pick(x, y) {
    let best = null, bestD = Infinity;
    for (const o of objects) {
      let d;
      if (o.type === "mirror") {
        const c = Math.cos(o.rot), s = Math.sin(o.rot);
        const u = Math.max(-o.r, Math.min(o.r, (x - o.x) * c + (y - o.y) * s));
        d = Math.hypot(x - (o.x + u * c), y - (o.y + u * s)) - 20;
      } else {
        d = Math.hypot(x - o.x, y - o.y) - o.r - 12;
      }
      if (d < 0 && d < bestD) { best = o; bestD = d; }
    }
    return best;
  }
  function twoAngle() {
    const p = Array.from(pointers.values());
    return Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]);
  }

  canvas.addEventListener("pointerdown", function (e) {
    if (e.button) return;
    demo = false;
    hint.classList.add("hidden");
    closePopups();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    const x = e.clientX, y = e.clientY;
    pointers.set(e.pointerId, [x, y]);
    if (pointers.size === 2 && selected) { mode = "twist"; twist = twoAngle(); return; }
    if (pointers.size > 1) return;
    if (selected && hasKnob(selected)) {
      const k = knobPos(selected);
      if (Math.hypot(x - k[0], y - k[1]) < (e.pointerType === "mouse" ? 14 : 26)) { mode = "rotate"; return; }
    }
    const o = pick(x, y);
    select(o);
    if (o) {
      mode = "drag"; grabDX = o.x - x; grabDY = o.y - y;
      objects.splice(objects.indexOf(o), 1); objects.push(o);   // bring to front
    } else mode = null;
  });

  canvas.addEventListener("pointermove", function (e) {
    const x = e.clientX, y = e.clientY;
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === "mouse") {
        let cur = "default";
        if (selected && hasKnob(selected)) {
          const k = knobPos(selected);
          if (Math.hypot(x - k[0], y - k[1]) < 14) cur = "grab";
        }
        if (cur === "default" && pick(x, y)) cur = "move";
        canvas.style.cursor = cur;
      }
      return;
    }
    pointers.set(e.pointerId, [x, y]);
    if (!selected) return;
    if (mode === "twist" && pointers.size === 2) {
      const a = twoAngle();
      selected.rot += a - twist; twist = a;
    } else if (mode === "drag") {
      selected.x = Math.max(10, Math.min(W - 10, x + grabDX));
      selected.y = Math.max(10, Math.min(H - 10, y + grabDY));
    } else if (mode === "rotate") {
      const a = Math.atan2(y - selected.y, x - selected.x);
      selected.rot = selected.type === "beam" ? a + Math.PI : selected.type === "mirror" || selected.type === "block" ? a : a + Math.PI / 2;
    } else return;
    build(selected);
    dirty = true;
  });

  function release(e) {
    pointers.delete(e.pointerId);
    if (mode === "twist" && pointers.size === 1 && selected) {
      const p = pointers.values().next().value;
      mode = "drag"; grabDX = selected.x - p[0]; grabDY = selected.y - p[1];
    } else if (!pointers.size) mode = null;
  }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  canvas.addEventListener("wheel", function (e) {
    const o = pick(e.clientX, e.clientY) || selected;
    if (!o) return;
    e.preventDefault();
    demo = false;
    o.rot += (e.deltaY > 0 ? 1 : -1) * (e.shiftKey ? 0.01 : 0.05);
    build(o); dirty = true;
  }, { passive: false });

  /* ── Controls ── */
  const addMenu = document.getElementById("addMenu"), addBtn = document.getElementById("addBtn");
  const info = document.getElementById("info"), infoBtn = document.getElementById("infoBtn");
  function closePopups() {
    addMenu.classList.remove("open"); addBtn.setAttribute("aria-expanded", "false");
    info.classList.remove("open"); infoBtn.setAttribute("aria-expanded", "false");
  }
  addBtn.addEventListener("click", function () {
    const open = !addMenu.classList.contains("open");
    closePopups();
    addMenu.classList.toggle("open", open); addBtn.setAttribute("aria-expanded", open);
  });
  infoBtn.addEventListener("click", function () {
    const open = !info.classList.contains("open");
    closePopups();
    info.classList.toggle("open", open); infoBtn.setAttribute("aria-expanded", open);
  });
  addMenu.addEventListener("click", function (e) {
    const b = e.target.closest("[data-add]");
    if (!b) return;
    demo = false;
    const n = objects.length;
    const o = make(b.getAttribute("data-add"), W / 2 + ((n * 47) % 90 - 45), H / 2 + ((n * 31) % 70 - 35), 0);
    build(o);
    objects.push(o);
    select(o);
    closePopups();
    hint.classList.add("hidden");
  });
  function removeSelected() {
    if (!selected) return;
    objects.splice(objects.indexOf(selected), 1);
    select(null);
  }
  removeBtn.addEventListener("click", removeSelected);
  document.getElementById("sceneBtn").addEventListener("click", function () {
    closePopups(); demo = false; hint.classList.add("hidden");
    loadScene(sceneIdx + 1);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closePopups(); select(null); }
    if ((e.key === "Delete" || e.key === "Backspace") && selected) { e.preventDefault(); removeSelected(); }
    if (selected && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      selected.rot += (e.key === "ArrowLeft" ? -1 : 1) * 0.03;
      build(selected); dirty = true;
    }
  });

  /* ── Layout ── */
  function resize() {
    const oldW = W, oldH = H;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    S = Math.max(300, Math.min(820, Math.min(W, H)));
    canvas.width = lightCanvas.width = Math.round(W * dpr);
    canvas.height = lightCanvas.height = Math.round(H * dpr);
    if (gl) { gl.viewport(0, 0, lightCanvas.width, lightCanvas.height); gl.uniform2f(uRes, W, H); }
    if (oldW && objects.length) {
      for (const o of objects) { o.x *= W / oldW; o.y *= H / oldH; build(o); }
    }
    dirty = true;
  }

  window.addEventListener("resize", resize);
  resize();
  loadScene(0);
  setTimeout(function () { hint.classList.add("hidden"); }, 9000);
  requestAnimationFrame(frame);
})();
