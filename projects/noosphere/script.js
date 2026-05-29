(function () {
  'use strict';

  /* ═══════════════════════════════════════════════
     DOM refs
  ═══════════════════════════════════════════════ */
  var canvas   = document.getElementById('c');
  var ctx      = canvas.getContext('2d');
  var curEl    = document.getElementById('cursor');
  var ringEl   = document.getElementById('cursor-ring');
  var hintEl   = document.getElementById('hint');
  var sCount   = document.getElementById('s-count');
  var sFps     = document.getElementById('s-fps');
  var sMode    = document.getElementById('s-mode');
  var modeBtns = document.querySelectorAll('.mode-btn');

  /* ═══════════════════════════════════════════════
     Canvas
  ═══════════════════════════════════════════════ */
  var W, H;
  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    gridDirty = true;
  }
  window.addEventListener('resize', function () {
    resize();
    if (textForming) doForm(lastWord);
  }, { passive: true });
  resize();

  /* ═══════════════════════════════════════════════
     Mouse
  ═══════════════════════════════════════════════ */
  var mouse = { x: -9999, y: -9999, down: false };

  document.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    curEl.style.left  = e.clientX + 'px';
    curEl.style.top   = e.clientY + 'px';
    ringEl.style.left = e.clientX + 'px';
    ringEl.style.top  = e.clientY + 'px';
    hintEl.classList.add('gone');
  });
  canvas.addEventListener('mousedown', function () {
    mouse.down = true;
    curEl.classList.add('attract');
    ringEl.classList.add('attract');
  });
  window.addEventListener('mouseup', function () {
    mouse.down = false;
    curEl.classList.remove('attract');
    ringEl.classList.remove('attract');
  });

  /* ═══════════════════════════════════════════════
     Colour palette
     Pre-build the rgba prefix string once on colour
     change, then append only the alpha per draw.
  ═══════════════════════════════════════════════ */
  var PALETTE = {
    orange: { r: 232, g: 84,  b: 26  },
    blue:   { r: 58,  g: 143, b: 245 },
    teal:   { r: 29,  g: 184, b: 133 },
    violet: { r: 155, g: 109, b: 255 },
    white:  { r: 200, g: 196, b: 190 }
  };
  var rgb        = PALETTE.orange;
  var rgbStr     = '';   // "232,84,26"  — rebuilt on colour change
  // 32-slot alpha lookup: avoids string-building inside the hot loop.
  // Slot k → alpha = k/32.  Links use alpha ≤ 0.15 so slots 0-5 are active.
  var ALPHA_LUT  = [];
  var ALPHA_SLOTS = 32;

  function buildColorCache() {
    rgbStr    = rgb.r + ',' + rgb.g + ',' + rgb.b;
    ALPHA_LUT = [];
    for (var k = 0; k < ALPHA_SLOTS; k++) {
      ALPHA_LUT[k] = 'rgba(' + rgbStr + ',' + (k / ALPHA_SLOTS).toFixed(3) + ')';
    }
    // Precompute dot styles for each particle (stored on the particle)
    for (var i = 0; i < particles.length; i++) {
      particles[i].fillStyle = 'rgba(' + rgbStr + ',' + particles[i].alpha.toFixed(3) + ')';
    }
  }

  function setColor(name) {
    if (PALETTE[name]) { rgb = PALETTE[name]; buildColorCache(); }
  }

  /* ═══════════════════════════════════════════════
     Parameters
  ═══════════════════════════════════════════════ */
  var P = {
    count: 400,
    repel: 120,
    link:  100,
    speed: 8,
    grav:  0,
    damp:  0.88
  };

  /* ═══════════════════════════════════════════════
     Particles
     Use flat typed arrays for x/y/vx/vy — much
     better cache locality than an array of objects.
     Object properties (r, alpha, tx, ty) change
     rarely so they stay on small companion objects.
  ═══════════════════════════════════════════════ */
  var MAX_PARTICLES = 800;

  // Hot per-frame data in typed arrays
  var px  = new Float32Array(MAX_PARTICLES);  // position x
  var py  = new Float32Array(MAX_PARTICLES);  // position y
  var pvx = new Float32Array(MAX_PARTICLES);  // velocity x
  var pvy = new Float32Array(MAX_PARTICLES);  // velocity y
  var ptx = new Float32Array(MAX_PARTICLES);  // spring target x
  var pty = new Float32Array(MAX_PARTICLES);  // spring target y

  // Cold data (seldom changes)
  var particles = [];   // companion objects: { r, alpha, fillStyle, hasTgt }
  var MODE = 'text';

  function mkParticle(i) {
    var a = Math.random() * Math.PI * 2;
    var s = (P.speed / 10) * (0.5 + Math.random() * 0.5);
    px[i]  = Math.random() * W;
    py[i]  = Math.random() * H;
    pvx[i] = Math.cos(a) * s;
    pvy[i] = Math.sin(a) * s;
    ptx[i] = -1;
    pty[i] = -1;
    var alpha = 0.4 + Math.random() * 0.55;
    return {
      r:         0.9 + Math.random() * 1.4,
      alpha:     alpha,
      fillStyle: '',   // filled by buildColorCache
      hasTgt:    false
    };
  }

  function initParticles() {
    particles = [];
    for (var i = 0; i < P.count; i++) particles.push(mkParticle(i));
    buildColorCache();
    sCount.textContent = P.count;
  }
  initParticles();
  requestAnimationFrame(function () { doForm('Hello World'); });

  /* ═══════════════════════════════════════════════
     Spatial grid
     Uses a flat Int32Array instead of a string-keyed
     object.  Layout:
       buckets[cell]  = index of first entry in `chain`
       chain[i]       = index of next particle in same cell (-1 = end)
     This gives O(1) insert and O(k) traversal with
     zero string allocation.
  ═══════════════════════════════════════════════ */
  var COLS, ROWS;
  var buckets, chain;
  var gridDirty = true;

  function initGrid() {
    var cellSize = Math.max(P.link, 1);
    COLS = Math.ceil(W / cellSize) + 2;
    ROWS = Math.ceil(H / cellSize) + 2;
    buckets = new Int32Array(COLS * ROWS).fill(-1);
    chain   = new Int32Array(MAX_PARTICLES).fill(-1);
    gridDirty = false;
  }

  function rebuildGrid() {
    if (gridDirty) initGrid();
    var cellSize = Math.max(P.link, 1);
    var n = particles.length;
    // clear only used buckets (faster than fill(-1) on large grids)
    buckets.fill(-1);
    for (var i = 0; i < n; i++) {
      var cx  = (px[i] / cellSize) | 0;
      var cy  = (py[i] / cellSize) | 0;
      // clamp to grid bounds
      if (cx < 0) cx = 0; else if (cx >= COLS) cx = COLS - 1;
      if (cy < 0) cy = 0; else if (cy >= ROWS) cy = ROWS - 1;
      var idx = cy * COLS + cx;
      chain[i]    = buckets[idx];   // prepend to linked list
      buckets[idx] = i;
    }
  }

  /* ═══════════════════════════════════════════════
     Text mode
  ═══════════════════════════════════════════════ */
  var ofc = document.createElement('canvas');
  var ofx = ofc.getContext('2d');
  var textForming = false;
  var lastWord    = '';

  function sampleWord(word) {
    ofc.width  = W;
    ofc.height = H;
    ofx.clearRect(0, 0, W, H);

    // Binary-search for the largest font size that fits within 90% of canvas width
    // using measureText — handles spaces, wide chars, and multi-word strings correctly.
    var maxW  = W * 0.90;
    var maxH  = H * 0.60;
    var lo = 10, hi = Math.floor(maxH), fs = lo;
    ofx.textAlign    = 'center';
    ofx.textBaseline = 'middle';
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      ofx.font = '900 ' + mid + 'px "Space Mono", monospace';
      if (ofx.measureText(word.toUpperCase()).width <= maxW) {
        fs = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    fs = Math.max(fs, 20);

    ofx.font      = '900 ' + fs + 'px "Space Mono", monospace';
    ofx.fillStyle = '#fff';
    ofx.fillText(word.toUpperCase(), W / 2, H / 2);

    var data = ofx.getImageData(0, 0, W, H).data;
    var gap  = Math.max(3, Math.floor(W / 180));
    var pts  = [];
    for (var y = 0; y < H; y += gap) {
      for (var x = 0; x < W; x += gap) {
        if (data[(y * W + x) * 4 + 3] > 128) pts.push(x, y);
      }
    }
    // Fisher-Yates on flat pairs
    var len = pts.length / 2;
    for (var i = len - 1; i > 0; i--) {
      var j  = (Math.random() * (i + 1)) | 0;
      var tx = pts[i * 2], ty = pts[i * 2 + 1];
      pts[i * 2]     = pts[j * 2];
      pts[i * 2 + 1] = pts[j * 2 + 1];
      pts[j * 2]     = tx;
      pts[j * 2 + 1] = ty;
    }
    return pts;
  }

  function doForm(word) {
    if (!word.trim()) { doScatter(); return; }
    lastWord    = word;
    textForming = true;
    var pts  = sampleWord(word);
    var need = Math.min(pts.length / 2, particles.length) | 0;
    for (var i = 0; i < particles.length; i++) {
      if (i < need) {
        ptx[i] = pts[i * 2];
        pty[i] = pts[i * 2 + 1];
        particles[i].hasTgt = true;
      } else {
        // Reset target to current position — prevents stale off-screen
        // coordinates from launching the particle if hasTgt is set later.
        ptx[i] = px[i];
        pty[i] = py[i];
        particles[i].hasTgt = false;
        pvx[i] = (Math.random() - 0.5) * 5;
        pvy[i] = (Math.random() - 0.5) * 5;
      }
    }
    sCount.textContent = need;
  }

  function doScatter() {
    textForming = false;
    for (var i = 0; i < particles.length; i++) {
      particles[i].hasTgt = false;
      pvx[i] = (Math.random() - 0.5) * 8;
      pvy[i] = (Math.random() - 0.5) * 8;
    }
    sCount.textContent = particles.length;
  }

  /* ═══════════════════════════════════════════════
     Vortex
  ═══════════════════════════════════════════════ */
  var vortexOn    = false;
  var vortexTimer = 0;

  /* ═══════════════════════════════════════════════
     FPS counter
  ═══════════════════════════════════════════════ */
  var fpsCount = 0;
  var fpsLast  = performance.now();

  /* ═══════════════════════════════════════════════
     Main loop
  ═══════════════════════════════════════════════ */
  function tick() {
    requestAnimationFrame(tick);
    ctx.clearRect(0, 0, W, H);

    // FPS
    fpsCount++;
    var now = performance.now();
    if (now - fpsLast > 600) {
      sFps.textContent = Math.round(fpsCount / (now - fpsLast) * 1000);
      fpsCount = 0;
      fpsLast  = now;
    }

    var n        = particles.length;
    var cx       = W / 2, cy = H / 2;
    var linkSq   = P.link * P.link;
    var cellSize = Math.max(P.link, 1);
    var repR     = P.repel;
    var repRSq   = repR * repR;
    var attraR   = repR * 1.4;
    var attraRSq = attraR * attraR;
    var capSq    = (P.speed / 10 * 6) * (P.speed / 10 * 6);
    var gravDelta = P.grav * 0.008;
    var damp      = P.damp;
    var isSandbox = MODE === 'sandbox';

    // Rebuild spatial grid
    rebuildGrid();

    /* ── Phase 1: update physics (no drawing) ── */
    for (var i = 0; i < n; i++) {
      var xi = px[i], yi = py[i];
      var vxi = pvx[i], vyi = pvy[i];

      // Mouse — squared distance check first, sqrt only if inside radius
      var mdx = xi - mouse.x;
      var mdy = yi - mouse.y;
      var md2 = mdx * mdx + mdy * mdy;

      if (mouse.down) {
        if (md2 < attraRSq && md2 > 0) {
          var md  = Math.sqrt(md2);
          var af  = (attraR - md) / attraR * 0.85;
          vxi -= (mdx / md) * af;
          vyi -= (mdy / md) * af;
        }
      } else {
        if (md2 < repRSq && md2 > 0) {
          var md  = Math.sqrt(md2);
          var rf  = (repR - md) / repR * 0.7;
          vxi += (mdx / md) * rf;
          vyi += (mdy / md) * rf;
        }
      }

      if (isSandbox) {
        vyi += gravDelta;

        if (vortexOn) {
          var vdx = xi - cx, vdy = yi - cy;
          var vd  = Math.sqrt(vdx * vdx + vdy * vdy) || 1;
          vxi += (-vdy / vd) * 0.6;
          vyi += ( vdx / vd) * 0.6;
        }

        vxi *= damp;
        vyi *= damp;
        // Only sqrt when we know we're over the cap
        var spdSq = vxi * vxi + vyi * vyi;
        if (spdSq > capSq) {
          var inv = Math.sqrt(capSq / spdSq);   // = cap/spd, no division
          vxi *= inv;
          vyi *= inv;
        }

      } else {
        // Text mode spring
        if (textForming && particles[i].hasTgt) {
          vxi += (ptx[i] - xi) * 0.065;
          vyi += (pty[i] - yi) * 0.065;
        }
        vxi *= 0.80;
        vyi *= 0.80;
        var spdSq = vxi * vxi + vyi * vyi;
        if (spdSq > 400) {   // 400 = 20²
          var inv = Math.sqrt(400 / spdSq);
          vxi *= inv;
          vyi *= inv;
        }
      }

      xi += vxi;
      yi += vyi;

      // wrap
      if (xi < -10) xi = W + 10; else if (xi > W + 10) xi = -10;
      if (yi < -10) yi = H + 10; else if (yi > H + 10) yi = -10;

      px[i]  = xi;
      py[i]  = yi;
      pvx[i] = vxi;
      pvy[i] = vyi;
    }

    /* ── Phase 2: draw links (batched by alpha bucket) ──
       Instead of one beginPath/stroke per line, we group
       lines into ALPHA_SLOTS buckets and draw each bucket
       as one single path → vastly fewer canvas state changes.
    ──────────────────────────────────────────────────────── */

    // Each bucket holds a flat array of line coords [x0,y0,x1,y1,...]
    // We reuse these across frames to avoid allocation.
    if (!tick.lineBufs) {
      tick.lineBufs = [];
      for (var k = 0; k < ALPHA_SLOTS; k++) tick.lineBufs[k] = [];
    }
    var lineBufs = tick.lineBufs;
    // Clear buckets (just reset length, no allocation)
    for (var k = 0; k < ALPHA_SLOTS; k++) lineBufs[k].length = 0;

    for (var i = 0; i < n; i++) {
      var xi  = px[i], yi = py[i];
      var cxi = (xi / cellSize) | 0;
      var cyi = (yi / cellSize) | 0;
      if (cxi < 0) cxi = 0; else if (cxi >= COLS) cxi = COLS - 1;
      if (cyi < 0) cyi = 0; else if (cyi >= ROWS) cyi = ROWS - 1;

      // Walk the 3×3 neighbourhood via the linked-list grid
      for (var dx = -1; dx <= 1; dx++) {
        var nx = cxi + dx;
        if (nx < 0 || nx >= COLS) continue;
        for (var dy = -1; dy <= 1; dy++) {
          var ny = cyi + dy;
          if (ny < 0 || ny >= ROWS) continue;
          var j = buckets[ny * COLS + nx];
          while (j !== -1) {
            if (j > i) {   // each pair once
              var ex = xi - px[j];
              var ey = yi - py[j];
              var d2 = ex * ex + ey * ey;
              if (d2 < linkSq) {
                // Map distance → alpha bucket (integer, no string)
                var slot = ((1 - Math.sqrt(d2) / P.link) * 0.15 * ALPHA_SLOTS) | 0;
                if (slot >= ALPHA_SLOTS) slot = ALPHA_SLOTS - 1;
                var buf = lineBufs[slot];
                buf.push(xi, yi, px[j], py[j]);
              }
            }
            j = chain[j];
          }
        }
      }
    }

    // Flush each non-empty bucket as one path
    ctx.lineWidth = 0.6;
    for (var k = 0; k < ALPHA_SLOTS; k++) {
      var buf = lineBufs[k];
      if (buf.length === 0) continue;
      ctx.strokeStyle = ALPHA_LUT[k];
      ctx.beginPath();
      for (var m = 0; m < buf.length; m += 4) {
        ctx.moveTo(buf[m],     buf[m + 1]);
        ctx.lineTo(buf[m + 2], buf[m + 3]);
      }
      ctx.stroke();
    }

    /* ── Phase 3: draw dots (batched by fill style) ──
       All dots share the same rgb; only alpha differs.
       Pre-built fillStyle strings on each particle mean
       no string work in the hot loop.
    ──────────────────────────────────────────────────── */
    for (var i = 0; i < n; i++) {
      ctx.fillStyle = particles[i].fillStyle;
      ctx.beginPath();
      ctx.arc(px[i], py[i], particles[i].r, 0, 6.2832);
      ctx.fill();
    }

    if (vortexOn) { if (--vortexTimer <= 0) vortexOn = false; }
  }

  tick();

  /* ═══════════════════════════════════════════════
     Mode switching
  ═══════════════════════════════════════════════ */
  function switchMode(m) {
    MODE        = m;
    textForming = false;
    for (var i = 0; i < particles.length; i++) particles[i].hasTgt = false;
    modeBtns.forEach(function (b) { b.classList.remove('active'); });
    document.querySelector('[data-mode=' + m + ']').classList.add('active');
    sMode.textContent = m;
    document.getElementById('sec-sandbox').classList.remove('visible');
    document.getElementById('sec-text').classList.remove('visible');
    document.getElementById('sec-' + m).classList.add('visible');
  }

  modeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchMode(btn.getAttribute('data-mode'));
    });
  });

  /* ═══════════════════════════════════════════════
     Sliders
  ═══════════════════════════════════════════════ */
  function wire(id, valId, key, divisor) {
    var el  = document.getElementById(id);
    var vEl = document.getElementById(valId);
    if (!el) return;
    el.addEventListener('input', function () {
      var v  = parseFloat(el.value);
      P[key] = divisor ? v / divisor : v;
      vEl.textContent = v;
      if (key === 'count') {
        while (particles.length < P.count) {
          var idx = particles.length;
          particles.push(mkParticle(idx));
        }
        while (particles.length > P.count) particles.pop();
        buildColorCache();
        sCount.textContent = particles.length;
      }
      if (key === 'link') gridDirty = true;  // cell size changed → rebuild grid dims
    });
  }

  wire('sl-count', 'v-count', 'count');
  wire('sl-repel', 'v-repel', 'repel');
  wire('sl-link',  'v-link',  'link');
  wire('sl-speed', 'v-speed', 'speed');
  wire('sl-grav',  'v-grav',  'grav');
  wire('sl-damp',  'v-damp',  'damp', 100);

  /* ═══════════════════════════════════════════════
     Sandbox buttons
  ═══════════════════════════════════════════════ */
  document.getElementById('btn-explode').addEventListener('click', function () {
    for (var i = 0; i < particles.length; i++) {
      var a  = Math.random() * 6.2832;
      var s  = 5 + Math.random() * 15;
      pvx[i] = Math.cos(a) * s;
      pvy[i] = Math.sin(a) * s;
    }
  });

  document.getElementById('btn-vortex').addEventListener('click', function () {
    vortexOn    = true;
    vortexTimer = 120;
  });

  document.getElementById('btn-reset').addEventListener('click', function () {
    vortexOn = false;
    initParticles();
  });

  /* ═══════════════════════════════════════════════
     Text buttons
  ═══════════════════════════════════════════════ */
  document.getElementById('btn-form').addEventListener('click', function () {
    doForm(document.getElementById('word-input').value.trim());
  });
  document.getElementById('btn-scatter').addEventListener('click', doScatter);
  document.getElementById('word-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter')  doForm(this.value.trim());
    if (e.key === 'Escape') doScatter();
  });

  /* ═══════════════════════════════════════════════
     Colour swatches
  ═══════════════════════════════════════════════ */
  document.querySelectorAll('.swatch').forEach(function (sw) {
    sw.addEventListener('click', function () {
      sw.closest('.swatch-row').querySelectorAll('.swatch')
        .forEach(function (s) { s.classList.remove('active'); });
      sw.classList.add('active');
      setColor(sw.getAttribute('data-color'));
    });
  });

})();