/* Epicycles: draw a loop, take its discrete Fourier transform, and replay it
   as a chain of rotating circles. */
(function () {
  "use strict";

  const N = 512;            // samples around the loop
  const MAX_CIRCLES = 300;
  const PERIOD = 10;        // seconds per trip around the loop
  const TAU = Math.PI * 2;

  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  const slider = document.getElementById("circles");
  const out = document.getElementById("circlesOut");
  const sub = document.getElementById("sub");
  const hint = document.getElementById("hint");

  const COS = new Float32Array(N), SIN = new Float32Array(N);
  for (let i = 0; i < N; i++) { COS[i] = Math.cos(TAU * i / N); SIN[i] = Math.sin(TAU * i / N); }

  let W = 0, H = 0, cx = 0, cy = 0;
  let shape = null;         // { px, py (Float32Array, relative to centre), dcx, dcy, terms[] }
  let K = 1;                // circles in use
  let approx = null;        // cached path for the current K
  let approxK = -1;
  let t = 0;                // 0..1 position around the loop
  let laps = 0;
  let ramp = null;          // { age } in seconds while the build-up animation runs
  let showCircles = true;
  let strokes = [];         // strokes being drawn right now
  let drawing = false;
  let finishTimer = 0;
  let last = 0;

  /* ── Geometry ── */
  function resample(points) {
    // Close the loop, then place N points at equal distances along it.
    const pts = points.concat([points[0]]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    const total = cum[cum.length - 1];
    const px = new Float32Array(N), py = new Float32Array(N);
    let j = 1;
    for (let i = 0; i < N; i++) {
      const d = total * i / N;
      while (j < cum.length - 1 && cum[j] < d) j++;
      const seg = cum[j] - cum[j - 1] || 1;
      const f = (d - cum[j - 1]) / seg;
      px[i] = pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * f;
      py[i] = pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * f;
    }
    return { px, py, total };
  }

  function transform(px, py) {
    const terms = [];
    let dcx = 0, dcy = 0;
    for (let k = 0; k < N; k++) {
      let re = 0, im = 0;
      for (let n = 0; n < N; n++) {
        const idx = (k * n) % N;
        // (x + iy) * (cos - i sin)
        re += px[n] * COS[idx] + py[n] * SIN[idx];
        im += py[n] * COS[idx] - px[n] * SIN[idx];
      }
      re /= N; im /= N;
      if (k === 0) { dcx = re; dcy = im; continue; }
      const amp = Math.hypot(re, im);
      if (amp < 0.02) continue;
      terms.push({ f: k > N / 2 ? k - N : k, re, im, amp });
    }
    terms.sort(function (a, b) { return b.amp - a.amp; });
    if (terms.length > MAX_CIRCLES) terms.length = MAX_CIRCLES;
    return { dcx, dcy, terms };
  }

  function setShape(points, withRamp) {
    const r = resample(points);
    const tr = transform(r.px, r.py);
    if (!tr.terms.length) return false;
    shape = { px: r.px, py: r.py, dcx: tr.dcx, dcy: tr.dcy, terms: tr.terms };
    t = 0; laps = 0; approxK = -1;
    if (withRamp) { ramp = { age: 0 }; setK(1, true); }
    else { ramp = null; setK(shape.terms.length, true); }
    return true;
  }

  function buildApprox() {
    if (!approx) approx = { x: new Float32Array(N), y: new Float32Array(N) };
    const ax = approx.x, ay = approx.y, terms = shape.terms;
    ax.fill(shape.dcx); ay.fill(shape.dcy);
    for (let j = 0; j < K; j++) {
      const c = terms[j], f = ((c.f % N) + N) % N;
      for (let n = 0; n < N; n++) {
        const idx = (f * n) % N;
        ax[n] += c.re * COS[idx] - c.im * SIN[idx];
        ay[n] += c.re * SIN[idx] + c.im * COS[idx];
      }
    }
    approxK = K;
  }

  /* ── Circle count: the slider is logarithmic so the low end has room ── */
  function sliderToK(v) {
    const max = shape ? shape.terms.length : 1;
    return Math.max(1, Math.min(max, Math.round(Math.exp(Math.log(max) * v / 1000))));
  }
  function setK(k, moveSlider) {
    const max = shape ? shape.terms.length : 1;
    K = Math.max(1, Math.min(max, k));
    out.textContent = K;
    sub.textContent = K + (K === 1 ? " circle" : " circles");
    if (moveSlider) slider.value = max > 1 ? Math.round(1000 * Math.log(K) / Math.log(max)) : 1000;
  }

  /* ── Examples ── */
  const EXAMPLES = [
    function heart(a) {
      const s = Math.sin(a);
      return [16 * s * s * s / 17, -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17 - 0.1];
    },
    function trefoil(a) {
      return [(Math.sin(a) + 2 * Math.sin(2 * a)) / 2.7, (Math.cos(a) - 2 * Math.cos(2 * a)) / 2.7];
    },
    function star(a) {
      // Walk the outline of a five-pointed star.
      const u = a / TAU * 10, i = Math.floor(u) % 10, f = u - Math.floor(u);
      const p = function (n) {
        const r = n % 2 ? 0.42 : 1, ang = -Math.PI / 2 + n * Math.PI / 5;
        return [r * Math.cos(ang), r * Math.sin(ang)];
      };
      const A = p(i), B = p(i + 1);
      return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
    },
    function square(a) {
      const u = a / TAU * 4, i = Math.floor(u) % 4, f = u - Math.floor(u);
      const c = [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]];
      const A = c[i], B = c[(i + 1) % 4];
      return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
    }
  ];
  let exampleIdx = 0;
  function loadExample(i) {
    exampleIdx = ((i % EXAMPLES.length) + EXAMPLES.length) % EXAMPLES.length;
    const s = Math.min(W, H - 150) * 0.36, pts = [];
    for (let n = 0; n < 720; n++) {
      const p = EXAMPLES[exampleIdx](TAU * n / 720);
      pts.push([p[0] * s, p[1] * s]);
    }
    setShape(pts, true);
  }

  /* ── Drawing input ── */
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left - cx, e.clientY - r.top - cy];
  }
  canvas.addEventListener("pointerdown", function (e) {
    if (e.button) return;
    closeInfo();
    clearTimeout(finishTimer);
    if (!strokes.length) hint.textContent = "Lift for a moment when you're done";
    hint.classList.remove("hidden");
    drawing = true;
    strokes.push([pos(e)]);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!drawing) return;
    const s = strokes[strokes.length - 1], p = pos(e), q = s[s.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1.5) s.push(p);
  });
  function endStroke() {
    if (!drawing) return;
    drawing = false;
    finishTimer = setTimeout(finish, 750);
  }
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

  function finish() {
    const pts = [].concat.apply([], strokes);
    strokes = [];
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    hint.classList.add("hidden");
    if (len < 60) return;       // a tap or a tiny scribble: keep what was there
    setShape(pts, true);
  }

  /* ── Rendering ── */
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = W / 2; cy = H / 2 - 14;
  }

  function pathFrom(ax, ay, from, to) {
    ctx.beginPath();
    ctx.moveTo(ax[from], ay[from]);
    for (let n = from + 1; n <= to; n++) ctx.lineTo(ax[n % N], ay[n % N]);
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineJoin = "round"; ctx.lineCap = "round";

    const sketching = drawing || strokes.length;

    if (shape && !sketching) {
      if (ramp) {
        // Build-up: add circles steadily on a log scale over about 11 seconds.
        ramp.age += dt;
        const e = Math.min(1, (ramp.age - 1.2) / 10);
        if (e > 0) setK(Math.round(Math.exp(Math.log(shape.terms.length) * e * e * (3 - 2 * e))), true);
        if (e >= 1) ramp = null;
      }
      if (approxK !== K) buildApprox();
      t += dt / PERIOD;
      if (t >= 1) { t -= 1; laps++; }

      // What you drew
      pathFrom(shape.px, shape.py, 0, N);
      ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 1.5; ctx.stroke();

      // Circles and arms
      let x = shape.dcx, y = shape.dcy;
      const ang = TAU * t;
      ctx.beginPath();
      const arms = [x, y];
      for (let j = 0; j < K; j++) {
        const c = shape.terms[j], a = c.f * ang, ca = Math.cos(a), sa = Math.sin(a);
        if (showCircles && c.amp > 1.5) { ctx.moveTo(x + c.amp, y); ctx.arc(x, y, c.amp, 0, TAU); }
        x += c.re * ca - c.im * sa;
        y += c.re * sa + c.im * ca;
        arms.push(x, y);
      }
      if (showCircles) {
        ctx.strokeStyle = "rgba(140,170,255,0.2)"; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(arms[0], arms[1]);
        for (let i = 2; i < arms.length; i += 2) ctx.lineTo(arms[i], arms[i + 1]);
        ctx.strokeStyle = "rgba(190,205,255,0.55)"; ctx.lineWidth = 1; ctx.stroke();
      }

      // The curve these K circles produce: whole loop dim, the part traced this lap bright
      pathFrom(approx.x, approx.y, 0, N);
      ctx.strokeStyle = "rgba(242,184,75," + (laps > 0 && !ramp ? 0.4 : 0.16) + ")";
      ctx.lineWidth = 2; ctx.stroke();

      const upTo = Math.floor(t * N);
      pathFrom(approx.x, approx.y, 0, upTo);
      ctx.lineTo(x, y);
      ctx.strokeStyle = "rgba(242,184,75,0.22)"; ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = "#f7c96b"; ctx.lineWidth = 2.4; ctx.stroke();

      ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU);
      ctx.fillStyle = "#fff"; ctx.fill();
    }

    if (sketching) {
      ctx.beginPath();
      for (const s of strokes) {
        ctx.moveTo(s[0][0], s[0][1]);
        for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0], s[i][1]);
        if (s.length === 1) ctx.lineTo(s[0][0] + 0.1, s[0][1]);
      }
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.stroke();
    }

    ctx.restore();
    requestAnimationFrame(frame);
  }

  /* ── Controls ── */
  slider.addEventListener("input", function () {
    ramp = null;
    setK(sliderToK(+slider.value), false);
  });
  document.getElementById("shapeBtn").addEventListener("click", function () {
    hint.classList.add("hidden");
    loadExample(exampleIdx + 1);
  });
  document.getElementById("rebuildBtn").addEventListener("click", function () {
    if (!shape) return;
    t = 0; laps = 0; ramp = { age: 0.9 }; setK(1, true);
  });
  const ghostBtn = document.getElementById("ghostBtn");
  ghostBtn.addEventListener("click", function () {
    showCircles = !showCircles;
    ghostBtn.setAttribute("aria-pressed", showCircles);
  });

  const info = document.getElementById("info"), infoBtn = document.getElementById("infoBtn");
  function closeInfo() { info.classList.remove("open"); infoBtn.setAttribute("aria-expanded", "false"); }
  infoBtn.addEventListener("click", function () {
    const open = info.classList.toggle("open");
    infoBtn.setAttribute("aria-expanded", open);
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeInfo(); });

  window.addEventListener("resize", resize);
  resize();
  loadExample(0);
  setTimeout(function () { if (!drawing && !strokes.length) hint.classList.add("hidden"); }, 9000);
  requestAnimationFrame(frame);
})();
