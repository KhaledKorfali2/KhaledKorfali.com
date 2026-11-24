/* Ink: a 2D fluid simulation (Jos Stam's "stable fluids") run entirely on the
   graphics card. Every quantity lives in a texture and each step is one
   full-screen shader pass:

     curl → vorticity → divergence → pressure (repeated) → subtract gradient
          → carry the velocity along itself → carry the dye along the velocity

   The velocity grid is small (about 128 cells on the short side), which is
   what keeps it fast on phones. The dye is stored at a higher resolution so
   the picture stays sharp. */
(function () {
  "use strict";

  const canvas = document.getElementById("stage");
  const hint = document.getElementById("hint");
  const fail = function () { document.getElementById("fallback").hidden = false; };

  const SIM = 128;                // velocity cells on the short side
  const PRESSURE_STEPS = 18;
  const VELOCITY_FADE = 0.25;     // how quickly motion dies away
  const SPLAT_FORCE = 5200;

  let swirl = 26, mode = "glow", stirring = false;

  /* ── WebGL setup: we need to render into half-float textures ── */
  const attrs = { alpha: false, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
  let gl = canvas.getContext("webgl2", attrs);
  const gl2 = !!gl;
  if (!gl) gl = canvas.getContext("webgl", attrs);
  if (!gl) { fail(); return; }

  let halfFloat, internal, canFilter;
  if (gl2) {
    gl.getExtension("EXT_color_buffer_float");
    gl.getExtension("EXT_color_buffer_half_float");
    halfFloat = gl.HALF_FLOAT; internal = gl.RGBA16F; canFilter = true;
  } else {
    const ext = gl.getExtension("OES_texture_half_float");
    if (!ext) { fail(); return; }
    gl.getExtension("EXT_color_buffer_half_float");
    halfFloat = ext.HALF_FLOAT_OES; internal = gl.RGBA;
    canFilter = !!gl.getExtension("OES_texture_half_float_linear");
  }

  function target(w, h, filter) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, halfFloat, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex: tex, fbo: fbo, w: w, h: h, tx: 1 / w, ty: 1 / h };
  }
  // Two copies of a field: read one, write the other, then swap.
  function pair(w, h, filter) {
    return { read: target(w, h, filter), write: target(w, h, filter), swap: function () { const t = this.read; this.read = this.write; this.write = t; } };
  }
  {
    const probe = target(4, 4, gl.NEAREST);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { fail(); return; }
    gl.deleteTexture(probe.tex); gl.deleteFramebuffer(probe.fbo);
  }

  /* ── Shaders ── */
  const VERT = `
    precision highp float;
    attribute vec2 aPos;
    uniform vec2 uTexel;
    varying vec2 vUv, vL, vR, vT, vB;
    void main () {
      vUv = aPos * 0.5 + 0.5;
      vL = vUv - vec2(uTexel.x, 0.0); vR = vUv + vec2(uTexel.x, 0.0);
      vT = vUv + vec2(0.0, uTexel.y); vB = vUv - vec2(0.0, uTexel.y);
      gl_Position = vec4(aPos, 0.0, 1.0);
    }`;
  const HEAD = "precision highp float; precision highp sampler2D; varying vec2 vUv, vL, vR, vT, vB;";
  const FRAG = {
    // Add a soft blob of something (velocity or dye) at a point.
    splat: `uniform sampler2D uTarget; uniform float uAspect, uRadius; uniform vec3 uColor; uniform vec2 uPoint;
      void main () { vec2 p = vUv - uPoint; p.x *= uAspect;
        gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + exp(-dot(p, p) / uRadius) * uColor, 1.0); }`,
    // Carry a field along the velocity: look upstream and copy what was there.
    advect: `uniform sampler2D uVelocity, uSource; uniform vec2 uVelTexel; uniform float uDt, uFade;
      void main () { vec2 from = vUv - uDt * texture2D(uVelocity, vUv).xy * uVelTexel;
        gl_FragColor = vec4(texture2D(uSource, from).xyz / (1.0 + uFade * uDt), 1.0); }`,
    // How much each cell is spinning.
    curl: `uniform sampler2D uVelocity;
      void main () { float c = texture2D(uVelocity, vR).y - texture2D(uVelocity, vL).y - texture2D(uVelocity, vT).x + texture2D(uVelocity, vB).x;
        gl_FragColor = vec4(0.5 * c, 0.0, 0.0, 1.0); }`,
    // Push fluid around each whirlpool to keep it spinning ("vorticity confinement").
    vorticity: `uniform sampler2D uVelocity, uCurl; uniform float uCurlStrength, uDt;
      void main () { float L = texture2D(uCurl, vL).x, R = texture2D(uCurl, vR).x, T = texture2D(uCurl, vT).x, B = texture2D(uCurl, vB).x, C = texture2D(uCurl, vUv).x;
        vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        f = f / (length(f) + 0.0001) * uCurlStrength * C; f.y *= -1.0;
        vec2 v = texture2D(uVelocity, vUv).xy + f * uDt;
        gl_FragColor = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0); }`,
    // How much fluid is piling up in (or draining from) each cell. Walls bounce the flow back.
    divergence: `uniform sampler2D uVelocity;
      void main () { float L = texture2D(uVelocity, vL).x, R = texture2D(uVelocity, vR).x, T = texture2D(uVelocity, vT).y, B = texture2D(uVelocity, vB).y;
        vec2 C = texture2D(uVelocity, vUv).xy;
        if (vL.x < 0.0) L = -C.x; if (vR.x > 1.0) R = -C.x; if (vT.y > 1.0) T = -C.y; if (vB.y < 0.0) B = -C.y;
        gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0); }`,
    // One round of working out the pressure that would cancel that piling up.
    pressure: `uniform sampler2D uPressure, uDivergence;
      void main () { float L = texture2D(uPressure, vL).x, R = texture2D(uPressure, vR).x, T = texture2D(uPressure, vT).x, B = texture2D(uPressure, vB).x;
        gl_FragColor = vec4((L + R + B + T - texture2D(uDivergence, vUv).x) * 0.25, 0.0, 0.0, 1.0); }`,
    // Let the pressure push back, leaving a flow that neither piles up nor drains.
    project: `uniform sampler2D uPressure, uVelocity;
      void main () { float L = texture2D(uPressure, vL).x, R = texture2D(uPressure, vR).x, T = texture2D(uPressure, vT).x, B = texture2D(uPressure, vB).x;
        gl_FragColor = vec4(texture2D(uVelocity, vUv).xy - vec2(R - L, T - B), 0.0, 1.0); }`,
    scale: `uniform sampler2D uSource; uniform float uValue;
      void main () { gl_FragColor = uValue * texture2D(uSource, vUv); }`,
    // Draw the dye. "Glow" is light on black; "ink" treats the dye as pigment soaking up light on paper.
    display: `uniform sampler2D uDye; uniform float uInk; uniform vec2 uDyeTexel;
      void main () {
        vec3 c = max(texture2D(uDye, vUv).rgb, 0.0);
        // A little relief shading from the slope of the dye makes it look thick.
        float l = length(texture2D(uDye, vL).rgb), r = length(texture2D(uDye, vR).rgb), t = length(texture2D(uDye, vT).rgb), b = length(texture2D(uDye, vB).rgb);
        vec3 n = normalize(vec3(l - r, b - t, 0.55));
        float light = clamp(dot(n, normalize(vec3(-0.4, 0.5, 0.75))) + 0.32, 0.55, 1.25);
        vec3 glow = 1.0 - exp(-c * 1.7 * light);
        vec3 paper = vec3(0.965, 0.95, 0.915);
        vec3 ink = paper * exp(-c * 1.55) * mix(1.0, light, 0.35);
        gl_FragColor = vec4(mix(glow, ink, uInk), 1.0);
      }`
  };

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const P = {};
  try {
    const vs = compile(gl.VERTEX_SHADER, VERT);
    Object.keys(FRAG).forEach(function (name) {
      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, HEAD + FRAG[name]));
      gl.bindAttribLocation(prog, 0, "aPos");
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      const u = {};
      const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const name2 = gl.getActiveUniform(prog, i).name; u[name2] = gl.getUniformLocation(prog, name2); }
      P[name] = { prog: prog, u: u };
    });
  } catch (err) { console.error(err); fail(); return; }

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  let active = null;
  function use(name) { active = P[name]; gl.useProgram(active.prog); return active.u; }
  function bind(unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.tex); return unit; }
  function draw(dest) {
    if (dest) { gl.bindFramebuffer(gl.FRAMEBUFFER, dest.fbo); gl.viewport(0, 0, dest.w, dest.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ── Fields ── */
  let velocity, dye, pressure, divergence, curl, aspect = 1;
  function build() {
    const W = window.innerWidth, H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    aspect = W / H;
    const size = function (short) { return aspect >= 1 ? [Math.round(short * aspect), short] : [short, Math.round(short / aspect)]; };
    const sim = size(SIM), big = size(Math.min(W, H) < 500 ? 512 : 800);
    const filter = canFilter ? gl.LINEAR : gl.NEAREST;
    velocity = pair(sim[0], sim[1], filter);
    dye = pair(big[0], big[1], filter);
    pressure = pair(sim[0], sim[1], gl.NEAREST);
    divergence = target(sim[0], sim[1], gl.NEAREST);
    curl = target(sim[0], sim[1], gl.NEAREST);
  }

  /* ── One step of the simulation ── */
  function step(dt) {
    let u;
    u = use("curl");
    gl.uniform2f(u.uTexel, velocity.read.tx, velocity.read.ty);
    gl.uniform1i(u.uVelocity, bind(0, velocity.read));
    draw(curl);

    u = use("vorticity");
    gl.uniform2f(u.uTexel, velocity.read.tx, velocity.read.ty);
    gl.uniform1i(u.uVelocity, bind(0, velocity.read));
    gl.uniform1i(u.uCurl, bind(1, curl));
    gl.uniform1f(u.uCurlStrength, swirl);
    gl.uniform1f(u.uDt, dt);
    draw(velocity.write); velocity.swap();

    u = use("divergence");
    gl.uniform2f(u.uTexel, velocity.read.tx, velocity.read.ty);
    gl.uniform1i(u.uVelocity, bind(0, velocity.read));
    draw(divergence);

    // Start each solve from a faded copy of the last pressure: a good first guess.
    u = use("scale");
    gl.uniform1i(u.uSource, bind(0, pressure.read));
    gl.uniform1f(u.uValue, 0.8);
    draw(pressure.write); pressure.swap();

    u = use("pressure");
    gl.uniform2f(u.uTexel, velocity.read.tx, velocity.read.ty);
    gl.uniform1i(u.uDivergence, bind(0, divergence));
    for (let i = 0; i < PRESSURE_STEPS; i++) {
      gl.uniform1i(u.uPressure, bind(1, pressure.read));
      draw(pressure.write); pressure.swap();
    }

    u = use("project");
    gl.uniform2f(u.uTexel, velocity.read.tx, velocity.read.ty);
    gl.uniform1i(u.uPressure, bind(0, pressure.read));
    gl.uniform1i(u.uVelocity, bind(1, velocity.read));
    draw(velocity.write); velocity.swap();

    u = use("advect");
    gl.uniform2f(u.uTexel, velocity.read.tx, velocity.read.ty);
    gl.uniform2f(u.uVelTexel, velocity.read.tx, velocity.read.ty);
    gl.uniform1i(u.uVelocity, bind(0, velocity.read));
    gl.uniform1i(u.uSource, bind(0, velocity.read));
    gl.uniform1f(u.uDt, dt);
    gl.uniform1f(u.uFade, VELOCITY_FADE);
    draw(velocity.write); velocity.swap();

    gl.uniform1i(u.uVelocity, bind(0, velocity.read));
    gl.uniform1i(u.uSource, bind(1, dye.read));
    gl.uniform1f(u.uFade, mode === "ink" ? 0.22 : 0.55);     // ink lingers longer than light
    draw(dye.write); dye.swap();
  }

  function render() {
    const u = use("display");
    gl.uniform2f(u.uTexel, dye.read.tx, dye.read.ty);
    gl.uniform1i(u.uDye, bind(0, dye.read));
    gl.uniform1f(u.uInk, mode === "ink" ? 1 : 0);
    draw(null);
  }

  /* ── Adding motion and dye ── */
  // x, y are 0..1 with y up; dx, dy is the push; colour is what to add to the dye.
  function splat(x, y, dx, dy, colour, radius) {
    let u = use("splat");
    gl.uniform2f(u.uTexel, velocity.read.tx, velocity.read.ty);
    gl.uniform1i(u.uTarget, bind(0, velocity.read));
    gl.uniform1f(u.uAspect, aspect);
    gl.uniform2f(u.uPoint, x, y);
    gl.uniform3f(u.uColor, dx, dy, 0);
    gl.uniform1f(u.uRadius, radius * (aspect > 1 ? aspect : 1));
    draw(velocity.write); velocity.swap();

    gl.uniform1i(u.uTarget, bind(0, dye.read));
    gl.uniform3f(u.uColor, colour[0], colour[1], colour[2]);
    draw(dye.write); dye.swap();
  }

  // Colours drift round the wheel as you draw. In ink mode the dye is stored as
  // "how much light it soaks up", so a colour is entered as its opposite.
  let hue = Math.random();
  function colour(strength, jump) {
    hue = (hue + (jump || 0.011)) % 1;
    const h = hue * 6, i = Math.floor(h), f = h - i, q = 1 - f;
    const rgb = [[1, f, 0], [q, 1, 0], [0, 1, f], [0, q, 1], [f, 0, 1], [1, 0, q]][i % 6];
    if (mode === "ink") return [(1.08 - rgb[0]) * strength * 1.15, (1.08 - rgb[1]) * strength * 1.15, (1.08 - rgb[2]) * strength * 1.15];
    return [rgb[0] * strength, rgb[1] * strength, rgb[2] * strength];
  }
  function burst(x, y, power) {
    const n = 7, c = colour(0.9);
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 2 * i / n + Math.random();
      splat(x, y, Math.cos(a) * power, Math.sin(a) * power, [c[0] * 0.35, c[1] * 0.35, c[2] * 0.35], 0.0016);
    }
  }
  function randomStir() {
    const a = Math.random() * Math.PI * 2, power = 300 + Math.random() * 600;
    splat(0.15 + Math.random() * 0.7, 0.15 + Math.random() * 0.7, Math.cos(a) * power, Math.sin(a) * power, colour(1.7, 0.13 + Math.random() * 0.2), 0.0042);
  }

  /* ── Pointer input: each finger is its own stream of dye ── */
  const pointers = new Map();
  function at(e) { return [e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight]; }
  canvas.addEventListener("pointerdown", function (e) {
    if (e.button) return;
    closeInfo();
    hint.classList.add("hidden");
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    const p = at(e);
    pointers.set(e.pointerId, { x: p[0], y: p[1], moved: 0, c: colour(1, 0.09) });
    burst(p[0], p[1], 260);
  });
  canvas.addEventListener("pointermove", function (e) {
    const s = pointers.get(e.pointerId);
    // A mouse stirs without a button held as well; it just adds less dye.
    if (!s && e.pointerType !== "mouse") return;
    const p = at(e);
    const from = s || hover;
    if (from.x === null) { from.x = p[0]; from.y = p[1]; return; }
    const dx = (p[0] - from.x) * (aspect > 1 ? aspect : 1), dy = (p[1] - from.y) * (aspect < 1 ? 1 / aspect : 1);
    from.x = p[0]; from.y = p[1];
    if (!dx && !dy) return;
    if (s) {
      s.moved += Math.hypot(dx, dy);
      if (s.moved > 0.08) { s.moved = 0; s.c = colour(1, 0.035); }      // a new colour every so often along a stroke
      splat(p[0], p[1], dx * SPLAT_FORCE, dy * SPLAT_FORCE, [s.c[0] * 0.3, s.c[1] * 0.3, s.c[2] * 0.3], 0.0019);
    } else {
      splat(p[0], p[1], dx * SPLAT_FORCE * 0.6, dy * SPLAT_FORCE * 0.6, [0, 0, 0], 0.0017);
    }
  });
  const hover = { x: null, y: null };
  function release(e) { pointers.delete(e.pointerId); }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("pointerleave", function () { hover.x = null; });

  /* ── Controls ── */
  document.getElementById("swirl").addEventListener("input", function (e) { swirl = +e.target.value; });
  document.getElementById("modes").addEventListener("click", function (e) {
    const b = e.target.closest("[data-mode]");
    if (!b || b.getAttribute("data-mode") === mode) return;
    mode = b.getAttribute("data-mode");
    document.querySelectorAll("[data-mode]").forEach(function (o) { o.classList.toggle("active", o === b); });
    clear();
    for (let i = 0; i < 5; i++) randomStir();
  });
  const stirBtn = document.getElementById("stirBtn");
  stirBtn.addEventListener("click", function () {
    stirring = !stirring;
    stirBtn.setAttribute("aria-pressed", stirring);
    hint.classList.add("hidden");
  });
  function clear() {
    [dye.read, dye.write, velocity.read, velocity.write, pressure.read, pressure.write].forEach(function (t) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.clear(gl.COLOR_BUFFER_BIT);
    });
  }
  document.getElementById("clearBtn").addEventListener("click", clear);

  const info = document.getElementById("info"), infoBtn = document.getElementById("infoBtn");
  function closeInfo() { info.classList.remove("open"); infoBtn.setAttribute("aria-expanded", "false"); }
  infoBtn.addEventListener("click", function () { infoBtn.setAttribute("aria-expanded", info.classList.toggle("open")); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeInfo(); });

  /* ── Loop ── */
  let last = 0, stirClock = 0, resizeTimer = 0;
  function frame(now) {
    const dt = Math.min(1 / 50, (now - last) / 1000 || 1 / 60);
    last = now;
    if (stirring) {
      stirClock -= dt;
      if (stirClock <= 0) { stirClock = 0.35 + Math.random() * 0.5; randomStir(); }
    }
    step(dt);
    render();
    requestAnimationFrame(frame);
  }
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { build(); for (let i = 0; i < 4; i++) randomStir(); }, 150);
  });
  canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  canvas.addEventListener("webglcontextrestored", function () { location.reload(); });

  build();
  for (let i = 0; i < 7; i++) randomStir();        // something to look at straight away
  setTimeout(function () { hint.classList.add("hidden"); }, 9000);
  requestAnimationFrame(frame);
})();
