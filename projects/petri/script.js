/* Petri: "particle life". Every particle has one of six colours, and a 6×6
   table says how strongly each colour is attracted to (or repelled by) each
   other colour. Because the table needn't be symmetric, A can chase B while B
   flees A, and the system never comes to rest.

   The physics runs on the CPU with a grid of buckets so each particle only
   looks at its near neighbours. Drawing is one WebGL call of glowing points. */
(function () {
  "use strict";

  const KINDS = 6;
  const REACH = 72;             // how far a particle can feel another, in CSS pixels
  const CORE = 0.3;             // inside this fraction of the reach everything repels
  const FORCE = 9;
  const HALF_LIFE = 0.045;      // seconds for a particle to lose half its speed
  const COLOURS = [[1.0, 0.36, 0.33], [1.0, 0.72, 0.25], [0.55, 0.9, 0.42], [0.3, 0.82, 0.95], [0.5, 0.56, 1.0], [0.95, 0.5, 0.92]];

  const canvas = document.getElementById("stage");
  const hint = document.getElementById("hint");
  const sub = document.getElementById("sub");
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: true });

  let W = 0, H = 0, dpr = 1, N = 0;
  let px, py, vx, vy, kind;                 // particle state
  let cols = 0, rows = 0, head, next;       // bucket grid: a linked list of particles per cell
  const rule = new Float32Array(KINDS * KINDS);
  let trails = true, touchMode = "pull";
  const pointers = new Map();

  /* ── Rules ── */
  const STEPS = [-1, -0.5, 0, 0.5, 1];
  function setRule(a, b, value) { rule[a * KINDS + b] = value; }
  function randomRules() {
    for (let i = 0; i < rule.length; i++) rule[i] = Math.round((Math.random() * 2 - 1) * 10) / 10;
  }
  const PRESETS = {
    // Each colour chases the next one round the ring and runs from the one behind: chains and loops.
    snakes: function (a, b) { return a === b ? 0.3 : b === (a + 1) % KINDS ? 0.7 : b === (a + KINDS - 1) % KINDS ? -0.5 : 0.05; },
    // Like sticks to like and keeps the rest at arm's length: separate blobs with skins.
    cells: function (a, b) { return a === b ? 0.5 : -0.3; },
    // Half the colours hunt the other half, which flee: chases that never end.
    hunters: function (a, b) { return a === b ? 0.35 : (a % 2 === 0 && b % 2 === 1) ? 0.9 : (a % 2 === 1 && b % 2 === 0) ? -0.8 : -0.1; },
    calm: function () { return 0; }
  };
  function loadPreset(name) {
    for (let a = 0; a < KINDS; a++) for (let b = 0; b < KINDS; b++) setRule(a, b, PRESETS[name](a, b));
    drawMatrix();
  }

  /* ── World ── */
  function populate() {
    // Scale the population with the screen so density, and so behaviour, stays the same.
    N = Math.max(600, Math.min(2600, Math.round(W * H / 420)));
    px = new Float32Array(N); py = new Float32Array(N);
    vx = new Float32Array(N); vy = new Float32Array(N);
    kind = new Uint8Array(N);
    next = new Int32Array(N);
    const colour = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      px[i] = Math.random() * W; py[i] = Math.random() * H;
      kind[i] = i % KINDS;
      colour.set(COLOURS[kind[i]], i * 3);
    }
    if (gl) {
      gl.bindBuffer(gl.ARRAY_BUFFER, colourBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, colour, gl.STATIC_DRAW);
    }
    positions = new Float32Array(N * 2);
    sub.textContent = N.toLocaleString() + " particles";
  }

  function step(dt) {
    // Sort particles into buckets one reach wide.
    head.fill(-1);
    for (let i = 0; i < N; i++) {
      const c = Math.min(cols - 1, (px[i] / W * cols) | 0) + Math.min(rows - 1, (py[i] / H * rows) | 0) * cols;
      next[i] = head[c]; head[c] = i;
    }
    const keep = Math.pow(0.5, dt / HALF_LIFE);
    const reach2 = REACH * REACH, halfW = W / 2, halfH = H / 2;

    for (let i = 0; i < N; i++) {
      const x = px[i], y = py[i], row = kind[i] * KINDS;
      const cx = Math.min(cols - 1, (x / W * cols) | 0), cy = Math.min(rows - 1, (y / H * rows) | 0);
      let fx = 0, fy = 0;
      for (let oy = -1; oy <= 1; oy++) {
        const gy = (cy + oy + rows) % rows;
        for (let ox = -1; ox <= 1; ox++) {
          const gx = (cx + ox + cols) % cols;
          for (let j = head[gx + gy * cols]; j >= 0; j = next[j]) {
            if (j === i) continue;
            // The world wraps round, so take the shorter way across.
            let dx = px[j] - x, dy = py[j] - y;
            if (dx > halfW) dx -= W; else if (dx < -halfW) dx += W;
            if (dy > halfH) dy -= H; else if (dy < -halfH) dy += H;
            const d2 = dx * dx + dy * dy;
            if (d2 >= reach2 || d2 === 0) continue;
            const d = Math.sqrt(d2), r = d / REACH;
            // Close up: always push apart. Further out: the table decides, strongest at mid-range.
            const f = r < CORE ? r / CORE - 1 : rule[row + kind[j]] * (1 - Math.abs(2 * r - 1 - CORE) / (1 - CORE));
            fx += dx / d * f; fy += dy / d * f;
          }
        }
      }
      vx[i] = vx[i] * keep + fx * REACH * FORCE * dt;
      vy[i] = vy[i] * keep + fy * REACH * FORCE * dt;
    }

    // Your fingers: pull particles in (with a little swirl so they orbit), or push them away.
    pointers.forEach(function (p) {
      const R = 190, sign = touchMode === "pull" ? 1 : -1.6;
      for (let i = 0; i < N; i++) {
        const dx = p.x - px[i], dy = p.y - py[i], d2 = dx * dx + dy * dy;
        if (d2 > R * R || d2 < 1) continue;
        const d = Math.sqrt(d2), k = (1 - d / R) * 2600 * dt * sign;
        vx[i] += (dx / d - (sign > 0 ? dy / d * 0.45 : 0)) * k;
        vy[i] += (dy / d + (sign > 0 ? dx / d * 0.45 : 0)) * k;
      }
    });

    for (let i = 0; i < N; i++) {
      let x = px[i] + vx[i] * dt, y = py[i] + vy[i] * dt;
      if (x < 0) x += W; else if (x >= W) x -= W;
      if (y < 0) y += H; else if (y >= H) y -= H;
      px[i] = x; py[i] = y;
    }
  }

  /* ── Drawing ── */
  let positions, positionBuffer, colourBuffer, pointProg, fadeProg, quadBuffer, uPoint = {}, uFade = {};
  function program(vs, fs) {
    const make = function (type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    return p;
  }
  function setupGL() {
    pointProg = program(
      "attribute vec2 aPos; attribute vec3 aCol; uniform vec2 uRes; uniform float uSize; varying vec3 vCol;" +
      "void main(){ vCol = aCol; vec2 c = aPos / uRes * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); gl_PointSize = uSize; }",
      "precision mediump float; varying vec3 vCol;" +
      "void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float core = smoothstep(0.55, 0.3, d); float halo = max(0.0, 1.0 - d);" +
      "gl_FragColor = vec4(vCol * (core * 0.8 + halo * halo * 0.3), 1.0); }");
    fadeProg = program("attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }",
      "precision mediump float; uniform float uAlpha; void main(){ gl_FragColor = vec4(0.024, 0.027, 0.043, uAlpha); }");
    uPoint.res = gl.getUniformLocation(pointProg, "uRes"); uPoint.size = gl.getUniformLocation(pointProg, "uSize");
    uFade.alpha = gl.getUniformLocation(fadeProg, "uAlpha");
    positionBuffer = gl.createBuffer(); colourBuffer = gl.createBuffer(); quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enable(gl.BLEND);
    gl.clearColor(0.024, 0.027, 0.043, 1);
  }
  function render() {
    // Instead of wiping the frame, lay a see-through sheet of background over it:
    // old positions fade out over a few frames and leave trails.
    gl.useProgram(fadeProg);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(uFade.alpha, trails ? 0.2 : 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    for (let i = 0; i < N; i++) { positions[i * 2] = px[i]; positions[i * 2 + 1] = py[i]; }
    gl.useProgram(pointProg);
    gl.blendFunc(gl.ONE, gl.ONE);
    const aPos = gl.getAttribLocation(pointProg, "aPos"), aCol = gl.getAttribLocation(pointProg, "aCol");
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, colourBuffer);
    gl.enableVertexAttribArray(aCol); gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0);
    gl.uniform2f(uPoint.res, W, H);
    gl.uniform1f(uPoint.size, (W < 600 ? 5.5 : 6.5) * dpr);
    gl.drawArrays(gl.POINTS, 0, N);
  }

  /* ── The rules panel ── */
  const matrixEl = document.getElementById("matrix");
  const css = function (c) { return "rgb(" + c.map(function (v) { return Math.round(v * 255); }).join(",") + ")"; };
  function cellColour(v) {
    // Red for repel, green for attract, dark for no effect.
    const k = Math.abs(v);
    const from = [35, 38, 45], to = v < 0 ? [200, 73, 63] : [63, 174, 90];
    return "rgb(" + from.map(function (f, i) { return Math.round(f + (to[i] - f) * k); }).join(",") + ")";
  }
  const NAMES = ["red", "orange", "green", "cyan", "blue", "pink"];
  function describe(a, b) {
    const v = rule[a * KINDS + b];
    return NAMES[a] + (v > 0 ? " is drawn to " : v < 0 ? " is pushed away from " : " ignores ") + NAMES[b] + (v ? " (" + Math.round(Math.abs(v) * 100) + "%)" : "");
  }
  function drawMatrix() {
    matrixEl.style.gridTemplateColumns = "18px repeat(" + KINDS + ", 1fr)";
    matrixEl.textContent = "";
    const dot = function (k) { const d = document.createElement("span"); d.className = "dot"; if (k >= 0) { const i = document.createElement("i"); i.style.background = css(COLOURS[k]); d.appendChild(i); } return d; };
    matrixEl.appendChild(dot(-1));
    for (let b = 0; b < KINDS; b++) matrixEl.appendChild(dot(b));
    for (let a = 0; a < KINDS; a++) {
      matrixEl.appendChild(dot(a));
      for (let b = 0; b < KINDS; b++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.style.background = cellColour(rule[a * KINDS + b]);
        cell.setAttribute("aria-label", describe(a, b));
        cell.addEventListener("click", function () {
          // Step to the next strength: −100%, −50%, 0, 50%, 100%, and round again.
          const v = rule[a * KINDS + b];
          let at = 0;
          STEPS.forEach(function (s, i) { if (Math.abs(s - v) < Math.abs(STEPS[at] - v)) at = i; });
          setRule(a, b, STEPS[(at + 1) % STEPS.length]);
          cell.style.background = cellColour(rule[a * KINDS + b]);
          cell.setAttribute("aria-label", describe(a, b));
        });
        matrixEl.appendChild(cell);
      }
    }
  }

  /* ── Input ── */
  function track(e) { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); }
  canvas.addEventListener("pointerdown", function (e) {
    if (e.button) return;
    closePanels();
    hint.classList.add("hidden");
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    track(e);
  });
  canvas.addEventListener("pointermove", function (e) { if (pointers.has(e.pointerId)) track(e); });
  const release = function (e) { pointers.delete(e.pointerId); };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  const rules = document.getElementById("rules"), rulesBtn = document.getElementById("rulesBtn");
  const info = document.getElementById("info"), infoBtn = document.getElementById("infoBtn");
  function closePanels() {
    rules.classList.remove("open"); rulesBtn.setAttribute("aria-expanded", "false");
    info.classList.remove("open"); infoBtn.setAttribute("aria-expanded", "false");
  }
  rulesBtn.addEventListener("click", function () {
    const open = !rules.classList.contains("open");
    closePanels();
    rules.classList.toggle("open", open); rulesBtn.setAttribute("aria-expanded", open);
  });
  document.getElementById("rulesClose").addEventListener("click", closePanels);
  infoBtn.addEventListener("click", function () {
    const open = !info.classList.contains("open");
    closePanels();
    info.classList.toggle("open", open); infoBtn.setAttribute("aria-expanded", open);
  });
  document.getElementById("newBtn").addEventListener("click", function () {
    randomRules(); drawMatrix();
    hint.classList.add("hidden");
    // A small kick so the change is felt at once.
    for (let i = 0; i < N; i++) { vx[i] += (Math.random() - 0.5) * 160; vy[i] += (Math.random() - 0.5) * 160; }
  });
  document.getElementById("presets").addEventListener("click", function (e) {
    const b = e.target.closest("[data-preset]");
    if (b) loadPreset(b.getAttribute("data-preset"));
  });
  document.getElementById("touch").addEventListener("click", function (e) {
    const b = e.target.closest("[data-touch]");
    if (!b) return;
    touchMode = b.getAttribute("data-touch");
    document.querySelectorAll("[data-touch]").forEach(function (o) { o.classList.toggle("active", o === b); });
  });
  const trailBtn = document.getElementById("trailBtn");
  trailBtn.addEventListener("click", function () { trails = !trails; trailBtn.setAttribute("aria-pressed", trails); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closePanels();
    if (e.key === "n" || e.key === "N") document.getElementById("newBtn").click();
  });

  /* ── Loop ── */
  function resize() {
    const oldW = W, oldH = H;
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    cols = Math.max(3, Math.floor(W / REACH)); rows = Math.max(3, Math.floor(H / REACH));
    head = new Int32Array(cols * rows);
    if (gl) { gl.viewport(0, 0, canvas.width, canvas.height); gl.clear(gl.COLOR_BUFFER_BIT); }
    // A very different screen size gets a fresh population; a small change keeps what's there.
    if (!N || Math.abs(W * H - oldW * oldH) > oldW * oldH * 0.35) populate();
    else for (let i = 0; i < N; i++) { px[i] = px[i] / oldW * W; py[i] = py[i] / oldH * H; }
  }
  let last = 0, cost = 0, trimmed = 0;
  function frame(now) {
    const dt = Math.min(1 / 40, (now - last) / 1000 || 1 / 60);
    last = now;
    const before = performance.now();
    step(dt);
    // If the physics is eating most of a frame on this device, thin the population
    // until it fits. Fewer particles at a smooth rate beats more at a stutter.
    cost += (performance.now() - before - cost) * 0.05;
    if (cost > 10 && N > 500 && now - trimmed > 1500) {
      N = Math.max(500, Math.floor(N * 0.82));
      trimmed = now; cost *= 0.75;
      sub.textContent = N.toLocaleString() + " particles";
    }
    render();
    requestAnimationFrame(frame);
  }

  if (!gl) {
    hint.textContent = "This one needs WebGL, which is switched off or unsupported in this browser.";
    return;
  }
  setupGL();
  resize();
  loadPreset("snakes");
  window.addEventListener("resize", resize);
  canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  canvas.addEventListener("webglcontextrestored", function () { location.reload(); });
  setTimeout(function () { hint.classList.add("hidden"); }, 9000);
  requestAnimationFrame(frame);
})();
