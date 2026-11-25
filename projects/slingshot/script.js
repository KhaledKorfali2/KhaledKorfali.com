/* Slingshot: orbital golf. You give a probe one push; after that only gravity
   acts on it. Levels are in levels.js.

   The flight is simulated in fixed steps of 1/120 s, so the same launch always
   gives exactly the same path on every device. That also lets `solve()` at the
   bottom try thousands of launches to prove a level can be finished.

   The picture is drawn on a 2D canvas, then a WebGL shader bends it around
   each black hole (the same lensing as the Singularity sandbox). */
(function () {
  "use strict";

  const LEVELS = window.SLINGSHOT_LEVELS;
  const M = window.SlingshotModel;                 // the rules of flight live in model.js
  const FIELD_W = M.FIELD_W, FIELD_H = M.FIELD_H;  // every level is laid out in this space
  const STEP = M.STEP, MIN_SPEED = M.MIN_SPEED, MAX_SPEED = M.MAX_SPEED;
  const TARGET_R = M.TARGET_R, PROBE_R = M.PROBE_R;
  const TAU = Math.PI * 2;
  const KEY = "slingshot.v2";                      // v2: the levels were redesigned, so old scores don't carry over
  const place = M.place, advance = M.advance, launchState = M.launch, countBits = M.countBits;

  const view = document.getElementById("stage");
  const hint = document.getElementById("hint");
  const sub = document.getElementById("sub");
  let gl = view.getContext("webgl", { antialias: false, alpha: false });
  const scene = gl ? document.createElement("canvas") : view;
  const ctx = scene.getContext("2d");

  /* ════════════ Saved progress ════════════ */
  let save = { best: {}, sound: true };
  try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && s.best) save = Object.assign(save, s); } catch (err) { /* start fresh */ }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (err) { /* storage unavailable */ } }
  const solved = function (i) { return !!save.best[i]; };
  // A level opens once the one before it is finished; one extra is kept open so a hard level can be skipped.
  function unlocked(i) {
    if (i < 2 || solved(i)) return true;
    return solved(i - 1) || solved(i - 2);
  }

  /* ════════════ Sound: a few synthesised blips, nothing to download ════════════ */
  let audio = null;
  function tone(freq, start, length, type, volume, slideTo) {
    if (!save.sound || !audio) return;
    const o = audio.createOscillator(), g = audio.createGain(), t0 = audio.currentTime + start;
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + length);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(volume || 0.08, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
    o.connect(g); g.connect(audio.destination);
    o.start(t0); o.stop(t0 + length + 0.02);
  }
  const SOUNDS = {
    launch: function (power) { tone(160 + power * 260, 0, 0.28, "triangle", 0.07, 70 + power * 60); },
    star: function (n) { tone([784, 988, 1175][n % 3], 0, 0.22, "sine", 0.09); tone([1568, 1976, 2349][n % 3], 0.02, 0.18, "sine", 0.03); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.09, 0.42, "sine", 0.08); }); },
    crash: function () { tone(140, 0, 0.3, "sawtooth", 0.06, 45); },
    lost: function () { tone(300, 0, 0.35, "sine", 0.05, 120); }
  };
  function wake() {
    if (audio || !save.sound) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { try { audio = new AC(); } catch (err) { audio = null; } }
  }

  /* ════════════ Game state ════════════ */
  let index = 0, level = LEVELS[0];
  let phase = "aim";              // aim → fly → (won | back to aim)
  let probe = null, shots = 0;
  let aim = { x: 120, y: 0 };      // the aiming arrow, as an offset from the probe; it stays put between shots
  const REACH = 240;               // arrow length for full power
  let trail = [], ghosts = [], sparks = [], collected = 0;
  let acc = 0, last = 0, flash = 0;

  function loadLevel(i) {
    index = Math.max(0, Math.min(LEVELS.length - 1, i));
    level = LEVELS[index];
    shots = 0; ghosts = []; collected = 0;
    // Start each level with the arrow pointing at the ring, at medium power.
    const toT = Math.atan2(level.target[1] - level.start[1], level.target[0] - level.start[0]);
    aim = { x: Math.cos(toT) * REACH * 0.5, y: Math.sin(toT) * REACH * 0.5 };
    reset();
    document.getElementById("result").hidden = true;
    updateHud();
    if (level.tip) { hint.textContent = level.tip; hint.classList.remove("hidden"); }
    else hint.classList.add("hidden");
    save.last = index; persist();
  }
  // Keep the last three attempts on screen to adjust from.
  function remember() {
    if (trail.length > 3) ghosts.push(trail);
    if (ghosts.length > 3) ghosts.shift();
  }
  function reset() {
    phase = "aim"; probe = null; trail = []; collected = 0; acc = 0;
    setLaunchButton();
  }
  function updateHud() {
    sub.textContent = "Level " + (index + 1) + " of " + LEVELS.length + (shots ? " · " + shots + (shots === 1 ? " shot" : " shots") : "");
  }

  function aimValues() {
    const len = Math.hypot(aim.x, aim.y), k = Math.min(1, len / REACH);
    return { angle: Math.atan2(aim.y, aim.x), speed: MIN_SPEED + (MAX_SPEED - MIN_SPEED) * k, power: k };
  }
  function launch() {
    if (phase !== "aim") return;
    const a = aimValues(), angle = a.angle, speed = a.speed;
    wake();
    probe = launchState(level, angle, speed);
    phase = "fly"; trail = [probe.x, probe.y]; collected = 0; acc = 0;
    shots++;
    updateHud();
    hint.classList.add("hidden");
    SOUNDS.launch((speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED));
    setLaunchButton();
  }

  function burst(x, y, colour, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * (0.25 + Math.random());
      sparks.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.6, colour: colour });
    }
  }

  function endFlight(how) {
    if (how === "arrived") {
      phase = "won";
      setLaunchButton();
      flash = 1;
      burst(level.target[0], level.target[1], "#ffd978", 46, 220);
      SOUNDS.win();
      const stars = countBits(probe.stars);
      const before = save.best[index];
      if (!before || stars > before.stars || (stars === before.stars && shots < before.shots)) save.best[index] = { stars: stars, shots: shots };
      persist();
      showResult(stars);
      return;
    }
    burst(probe.x, probe.y, how === "swallowed" ? "#ffb070" : "#ff7a5c", how === "lost" ? 0 : 26, 150);
    SOUNDS[how === "lost" ? "lost" : "crash"]();
    remember();
    reset();
  }

  /* ════════════ Layout: the field is turned on its side for tall screens ════════════ */
  let W = 0, H = 0, dpr = 1, scale = 1, ox = 0, oy = 0, tall = false;
  function layout() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.width = scene.width = Math.round(W * dpr);
    view.height = scene.height = Math.round(H * dpr);
    if (gl) gl.viewport(0, 0, view.width, view.height);
    tall = H > W * 1.05;
    const top = 62, bottom = 84, availW = W - 12, availH = H - top - bottom;
    const fw = tall ? FIELD_H : FIELD_W, fh = tall ? FIELD_W : FIELD_H;
    scale = Math.min(availW / fw, availH / fh);
    ox = (W - fw * scale) / 2; oy = top + (availH - fh * scale) / 2;
  }
  function toScreen(x, y) { return tall ? [ox + (FIELD_H - y) * scale, oy + x * scale] : [ox + x * scale, oy + y * scale]; }
  function toWorld(sx, sy) { return tall ? [(sy - oy) / scale, FIELD_H - (sx - ox) / scale] : [(sx - ox) / scale, (sy - oy) / scale]; }
  function worldTransform() {
    if (tall) ctx.setTransform(0, scale * dpr, -scale * dpr, 0, (ox + FIELD_H * scale) * dpr, oy * dpr);
    else ctx.setTransform(scale * dpr, 0, 0, scale * dpr, ox * dpr, oy * dpr);
  }

  /* ════════════ Drawing ════════════ */
  const TILE = 640;
  const backdrop = (function () {
    const c = document.createElement("canvas");
    c.width = c.height = TILE;
    const g = c.getContext("2d");
    g.fillStyle = "#05060a"; g.fillRect(0, 0, TILE, TILE);
    const wrap = function (fn, x, y, r) { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) fn(x + a * TILE, y + b * TILE, r); };
    ["rgba(90,70,160,", "rgba(40,110,130,", "rgba(150,70,60,"].forEach(function (colour, i) {
      for (let k = 0; k < 2; k++) {
        const x = (i * 211 + k * 337) % TILE, y = (i * 173 + k * 419) % TILE, r = 150 + ((i + k) * 53) % 110;
        wrap(function (px, py, pr) {
          const grad = g.createRadialGradient(px, py, 0, px, py, pr);
          grad.addColorStop(0, colour + "0.11)"); grad.addColorStop(1, colour + "0)");
          g.fillStyle = grad; g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
        }, x, y, r);
      }
    });
    let seed = 7;
    const rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 380; i++) {
      const x = rnd() * TILE, y = rnd() * TILE, big = rnd() < 0.07, tint = rnd();
      g.fillStyle = "rgba(" + (tint < 0.2 ? "255,214,170" : tint > 0.8 ? "180,205,255" : "255,255,255") + "," + (0.2 + rnd() * 0.7) + ")";
      wrap(function (px, py, pr) { g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill(); }, x, y, big ? 1.3 : 0.5 + rnd() * 0.5);
    }
    return c;
  })();
  let pattern = null;
  const PLANETS = [["#f4b183", "#b5572f"], ["#8fd0e8", "#2c6f95"], ["#c9b6ff", "#6a55b8"], ["#9fe0a4", "#3c8a55"], ["#f2a0b5", "#a8455f"], ["#f6d887", "#b98a2b"]];

  function starPath(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  function predict(angle, speed) {
    // The first second and a bit is shown; the rest is for you to work out.
    const p = launchState(level, angle, speed), pts = [];
    for (let i = 0; i < 156; i++) {
      if (advance(level, p)) break;
      if (i % 6 === 5) pts.push(p.x, p.y);
    }
    return pts;
  }

  function drawScene(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!pattern) pattern = ctx.createPattern(backdrop, "repeat");
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, W, H);

    worldTransform();
    ctx.lineCap = "round"; ctx.lineJoin = "round";

    // The edge of the map.
    ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 1.5; ctx.setLineDash([2, 8]);
    ctx.strokeRect(0, 0, FIELD_W, FIELD_H);
    ctx.setLineDash([]);

    // Walls: energy barriers the probe can't pass.
    (level.walls || []).forEach(function (w) {
      ctx.strokeStyle = "rgba(255,90,110,0.22)"; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(w[0], w[1]); ctx.lineTo(w[2], w[3]); ctx.stroke();
      ctx.strokeStyle = "rgba(255,150,160,0.95)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(w[0], w[1]); ctx.lineTo(w[2], w[3]); ctx.stroke();
    });

    // Bodies: planets are drawn here; black holes are added by the lensing shader.
    level.bodies.forEach(function (b, i) {
      if (b.orbit) {
        ctx.strokeStyle = "rgba(255,255,255,0.09)"; ctx.lineWidth = 1; ctx.setLineDash([2, 7]);
        ctx.beginPath(); ctx.arc(b.orbit.cx, b.orbit.cy, b.orbit.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      }
      // Moons wait at their starting point while you aim and only move during a flight,
      // so what you see when you let go is exactly where they start from.
      const c = place(b, probe ? probe.t : 0, { x: 0, y: 0 });
      b.sx = c.x; b.sy = c.y;
      if (b.hole) {
        if (!gl) {
          const glow = ctx.createRadialGradient(c.x, c.y, b.r * 0.9, c.x, c.y, b.r * 3.2);
          glow.addColorStop(0, "rgba(255,190,110,0.9)"); glow.addColorStop(1, "rgba(255,120,30,0)");
          ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(c.x, c.y, b.r * 3.2, 0, TAU); ctx.fill();
          ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(c.x, c.y, b.r, 0, TAU); ctx.fill();
        }
        return;
      }
      // Faint rings hint at how far a planet's pull reaches.
      const reach = Math.sqrt(b.m / 110);
      ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1;
      [0.55, 1].forEach(function (k) { ctx.beginPath(); ctx.arc(c.x, c.y, reach * k, 0, TAU); ctx.stroke(); });
      const col = PLANETS[i % PLANETS.length];
      const halo = ctx.createRadialGradient(c.x, c.y, b.r * 0.8, c.x, c.y, b.r * 1.7);
      halo.addColorStop(0, col[0] + "55"); halo.addColorStop(1, col[0] + "00");
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(c.x, c.y, b.r * 1.7, 0, TAU); ctx.fill();
      const body = ctx.createRadialGradient(c.x - b.r * 0.35, c.y - b.r * 0.4, b.r * 0.1, c.x, c.y, b.r);
      body.addColorStop(0, col[0]); body.addColorStop(1, col[1]);
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(c.x, c.y, b.r, 0, TAU); ctx.fill();
    });

    // The target ring.
    const tx = level.target[0], ty = level.target[1], pulse = 0.5 + 0.5 * Math.sin(t * 3);
    const tg = ctx.createRadialGradient(tx, ty, 2, tx, ty, TARGET_R * 1.9);
    tg.addColorStop(0, "rgba(120,255,190," + (0.2 + flash * 0.6) + ")"); tg.addColorStop(1, "rgba(120,255,190,0)");
    ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(tx, ty, TARGET_R * 1.9, 0, TAU); ctx.fill();
    // The reach of the ring's tractor beam.
    ctx.strokeStyle = "rgba(140,255,200,0.13)"; ctx.lineWidth = 1; ctx.setLineDash([2, 7]);
    ctx.beginPath(); ctx.arc(tx, ty, M.BEAM_R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(140,255,200,0.95)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(tx, ty, TARGET_R - 2, 0, TAU); ctx.stroke();
    ctx.strokeStyle = "rgba(140,255,200," + (0.5 - pulse * 0.4) + ")"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(tx, ty, TARGET_R + 4 + pulse * 10, 0, TAU); ctx.stroke();

    // Stars.
    const have = probe ? probe.stars : 0;
    level.stars.forEach(function (s, i) {
      const got = have & (1 << i);
      ctx.fillStyle = got ? "rgba(255,200,80,0.16)" : "#ffc94d";
      if (!got) { ctx.shadowColor = "rgba(255,200,80,0.9)"; ctx.shadowBlur = 14 * scale * dpr; }
      starPath(s[0], s[1], got ? 9 : 11 + Math.sin(t * 4 + i) * 1.2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Your last attempt, then this one.
    ghosts.forEach(function (ghost, n) {
      // Older attempts are fainter.
      ctx.strokeStyle = "rgba(255,255,255," + (0.09 + 0.09 * (n + 3 - ghosts.length)) + ")"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 7]);
      ctx.beginPath(); ctx.moveTo(ghost[0], ghost[1]);
      for (let i = 2; i < ghost.length; i += 2) ctx.lineTo(ghost[i], ghost[i + 1]);
      ctx.stroke(); ctx.setLineDash([]);
    });
    if (trail.length > 3) {
      const n = trail.length, from = Math.max(0, n - 520);
      ctx.strokeStyle = "rgba(140,210,255,0.28)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(trail[0], trail[1]);
      for (let i = 2; i < n; i += 2) ctx.lineTo(trail[i], trail[i + 1]);
      ctx.stroke();
      ctx.strokeStyle = "rgba(190,230,255,0.9)"; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(trail[from], trail[from + 1]);
      for (let i = from + 2; i < n; i += 2) ctx.lineTo(trail[i], trail[i + 1]);
      ctx.stroke();
    }

    // The probe, or the launch pad with the aiming guide.
    const px = probe ? probe.x : level.start[0], py = probe ? probe.y : level.start[1];
    if (phase === "aim") {
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, 15 + Math.sin(t * 3) * 2, 0, TAU); ctx.stroke();
      // The aiming arrow and the first stretch of the path it gives.
      const v = aimValues();
      const dots = predict(v.angle, v.speed);
      ctx.fillStyle = "#fff";
      for (let i = 0; i < dots.length; i += 2) {
        ctx.globalAlpha = 0.9 * (1 - i / dots.length * 0.75);
        ctx.beginPath(); ctx.arc(dots[i], dots[i + 1], 2.6, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const len = Math.min(REACH, Math.hypot(aim.x, aim.y)), ux = Math.cos(v.angle), uy = Math.sin(v.angle);
      const hx = px + ux * len, hy = py + uy * len;
      ctx.strokeStyle = "rgba(255,194,71,0.95)"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(px + ux * 14, py + uy * 14); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.fillStyle = "#ffc247";
      ctx.beginPath();
      ctx.moveTo(hx + ux * 12, hy + uy * 12);
      ctx.lineTo(hx - ux * 6 - uy * 8, hy - uy * 6 + ux * 8);
      ctx.lineTo(hx - ux * 6 + uy * 8, hy - uy * 6 - ux * 8);
      ctx.closePath(); ctx.fill();
    }
    if (phase !== "won") {
      ctx.shadowColor = "rgba(170,220,255,0.95)"; ctx.shadowBlur = 16 * scale * dpr;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(px, py, PROBE_R + 1, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.globalCompositeOperation = "lighter";
    sparks.forEach(function (s) {
      ctx.globalAlpha = Math.min(1, s.life * 1.8);
      ctx.fillStyle = s.colour; ctx.beginPath(); ctx.arc(s.x, s.y, 2.2, 0, TAU); ctx.fill();
    });
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
  }

  /* ── Lensing pass ── */
  const MAX_HOLES = 4;
  const U = {}, holeData = new Float32Array(MAX_HOLES * 3);
  function setupGL() {
    const FRAG = `
precision highp float;
uniform sampler2D uScene; uniform vec2 uRes; uniform float uTime;
uniform vec3 uHoles[${MAX_HOLES}];
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 shift = vec2(0.0); vec3 glow = vec3(0.0); float shadow = 0.0;
  for (int i = 0; i < ${MAX_HOLES}; i++) {
    vec3 h = uHoles[i];
    if (h.z <= 0.0) continue;
    vec2 d = p - h.xy;
    float r = length(d) + 0.001, e = h.z, x = r / e, q = x / 4.0;
    shift += d * (e * e / (r * r)) / (1.0 + q * q * q * q);
    shadow = max(shadow, 1.0 - smoothstep(0.58, 0.64, x));
    float ang = atan(d.y, d.x), lx = log(x);
    float swirl = 0.6 + 0.25 * sin(ang * 3.0 + 6.0 * lx - uTime * 2.2) + 0.15 * sin(ang * 7.0 - 11.0 * lx + uTime * 3.4);
    float band = smoothstep(0.6, 0.76, x) * exp(-(x - 0.76) * 2.3);
    vec3 heat = mix(vec3(1.0, 0.88, 0.66), vec3(1.0, 0.36, 0.06), clamp((x - 0.7) / 1.1, 0.0, 1.0));
    glow += heat * band * swirl * 1.5;
    float edge = (x - 0.635) / 0.03;
    glow += vec3(1.0, 0.92, 0.78) * exp(-edge * edge) * 0.9;
  }
  vec2 uv = clamp((p - shift) / uRes, 0.0, 1.0);
  gl_FragColor = vec4((texture2D(uScene, uv).rgb + glow) * (1.0 - shadow), 1.0);
}`;
    const sh = function (type, src) {
      const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
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
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ["uScene", "uRes", "uTime", "uHoles"].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]
      .forEach(function (kv) { gl.texParameteri(gl.TEXTURE_2D, kv[0], kv[1]); });
    gl.uniform1i(U.uScene, 0);
  }
  function lensPass(t) {
    holeData.fill(0);
    let n = 0;
    level.bodies.forEach(function (b) {
      if (!b.hole || n >= MAX_HOLES) return;
      const s = toScreen(b.sx, b.sy);
      // The black disc is 0.61 of the ring's radius, and has to match the radius that swallows the probe.
      holeData[n * 3] = s[0] * dpr; holeData[n * 3 + 1] = s[1] * dpr; holeData[n * 3 + 2] = b.r / 0.61 * scale * dpr;
      n++;
    });
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, scene);
    gl.uniform2f(U.uRes, view.width, view.height);
    gl.uniform1f(U.uTime, t);
    gl.uniform3fv(U.uHoles, holeData);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ════════════ Loop ════════════ */
  let clock = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now; clock += dt;
    if (phase === "fly") {
      acc += dt;
      let ended = "";
      while (acc >= STEP && !ended) {
        acc -= STEP;
        ended = advance(level, probe);
        if (probe.got >= 0) {
          const s = level.stars[probe.got];
          burst(s[0], s[1], "#ffd978", 18, 130);
          SOUNDS.star(collected++);
          probe.got = -1;
        }
      }
      trail.push(probe.x, probe.y);
      if (ended) endFlight(ended);
    }
    sparks.forEach(function (s) { s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.97; s.vy *= 0.97; s.life -= dt; });
    sparks = sparks.filter(function (s) { return s.life > 0; });
    flash = Math.max(0, flash - dt * 1.5);

    drawScene(clock);
    if (gl) lensPass(clock);
    requestAnimationFrame(frame);
  }

  /* ════════════ Input: set the arrow, then launch ════════════
     Dragging anywhere moves the arrow's tip by the same amount, so your finger
     never has to cover it and small movements make small changes. The arrow
     stays where you leave it, which is what makes fine adjustment possible. */
  let dragging = null;
  function clampAim() {
    const len = Math.hypot(aim.x, aim.y);
    if (len > REACH) { aim.x *= REACH / len; aim.y *= REACH / len; }
    if (len < 12) { const a = len ? Math.atan2(aim.y, aim.x) : 0; aim.x = Math.cos(a) * 12; aim.y = Math.sin(a) * 12; }
  }
  view.addEventListener("pointerdown", function (e) {
    if (e.button) return;
    closePanels();
    wake();
    if (phase !== "aim") return;
    try { view.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    const w = toWorld(e.clientX, e.clientY);
    dragging = { id: e.pointerId, wx: w[0], wy: w[1] };
    hint.classList.add("hidden");
  });
  view.addEventListener("pointermove", function (e) {
    if (!dragging || dragging.id !== e.pointerId || phase !== "aim") return;
    const w = toWorld(e.clientX, e.clientY);
    const fine = e.shiftKey ? 0.25 : 1;                 // hold Shift for finer control with a mouse
    aim.x += (w[0] - dragging.wx) * fine; aim.y += (w[1] - dragging.wy) * fine;
    dragging.wx = w[0]; dragging.wy = w[1];
    clampAim();
  });
  function letGo(e) { if (dragging && dragging.id === e.pointerId) dragging = null; }
  view.addEventListener("pointerup", letGo);
  view.addEventListener("pointercancel", letGo);

  // Arrow keys nudge the aim: left/right turn it half a degree, up/down change the power.
  function nudge(turn, power) {
    if (phase !== "aim") return;
    const len = Math.hypot(aim.x, aim.y), a = Math.atan2(aim.y, aim.x) + turn * Math.PI / 360;
    const l = Math.max(12, Math.min(REACH, len + power * 2));
    aim.x = Math.cos(a) * l; aim.y = Math.sin(a) * l;
  }

  /* ════════════ Panels and buttons ════════════ */
  const result = document.getElementById("result");
  function showResult(stars) {
    const lastLevel = index === LEVELS.length - 1;
    document.getElementById("resEyebrow").textContent = "Level " + (index + 1) + " complete";
    document.getElementById("resStars").innerHTML = [0, 1, 2].map(function (i) { return '<i class="' + (i < stars ? "on" : "") + '">★</i>'; }).join("");
    document.getElementById("resLine").textContent = (shots === 1 ? "First shot." : shots + " shots.") +
      (stars === 3 ? " Every star collected." : " " + stars + " of 3 stars. A different path picks up the rest.");
    document.getElementById("nextBtn").textContent = lastLevel ? "All levels" : "Next level";
    setTimeout(function () { if (phase === "won") { result.hidden = false; document.getElementById("nextBtn").focus({ preventScroll: true }); } }, 650);
    updateHud();
  }
  document.getElementById("nextBtn").addEventListener("click", function () {
    if (index === LEVELS.length - 1) { result.hidden = true; reset(); openLevels(); } else loadLevel(index + 1);
  });
  document.getElementById("againBtn").addEventListener("click", function () { loadLevel(index); });
  const launchBtn = document.getElementById("launchBtn");
  function setLaunchButton() {
    const flying = phase === "fly";
    document.getElementById("launchLabel").textContent = flying ? "Recall" : "Launch";
    launchBtn.setAttribute("aria-label", flying ? "Bring the probe back" : "Launch the probe");
    launchBtn.disabled = phase === "won";
  }
  launchBtn.addEventListener("click", function () {
    if (phase === "fly") { remember(); reset(); } else launch();
  });

  const levelsEl = document.getElementById("levels"), levelsBtn = document.getElementById("levelsBtn");
  const info = document.getElementById("info"), infoBtn = document.getElementById("infoBtn");
  function closePanels() {
    levelsEl.classList.remove("open"); levelsBtn.setAttribute("aria-expanded", "false");
    info.classList.remove("open"); infoBtn.setAttribute("aria-expanded", "false");
  }
  function openLevels() {
    const grid = document.getElementById("levelGrid");
    grid.textContent = "";
    LEVELS.forEach(function (lv, i) {
      const b = document.createElement("button");
      b.type = "button";
      const best = save.best[i];
      b.innerHTML = "<b>" + (i + 1) + "</b><span>" + (best ? "★".repeat(best.stars) + "☆".repeat(3 - best.stars) : "") + "</span>";
      b.setAttribute("aria-label", "Level " + (i + 1) + (best ? ", " + best.stars + " of 3 stars" : unlocked(i) ? "" : ", locked"));
      if (i === index) b.className = "current";
      if (!unlocked(i)) b.disabled = true;
      b.addEventListener("click", function () { closePanels(); loadLevel(i); });
      grid.appendChild(b);
    });
    info.classList.remove("open"); infoBtn.setAttribute("aria-expanded", "false");
    levelsEl.classList.add("open"); levelsBtn.setAttribute("aria-expanded", "true");
  }
  levelsBtn.addEventListener("click", function () { if (levelsEl.classList.contains("open")) closePanels(); else openLevels(); });
  document.getElementById("levelsClose").addEventListener("click", closePanels);
  infoBtn.addEventListener("click", function () {
    const open = !info.classList.contains("open");
    closePanels();
    info.classList.toggle("open", open); infoBtn.setAttribute("aria-expanded", open);
  });
  const soundBtn = document.getElementById("soundBtn");
  soundBtn.setAttribute("aria-pressed", save.sound);
  soundBtn.addEventListener("click", function () {
    save.sound = !save.sound; persist();
    soundBtn.setAttribute("aria-pressed", save.sound);
    if (save.sound) { wake(); SOUNDS.star(0); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closePanels();
    if (e.target.tagName === "BUTTON" && (e.key === " " || e.key === "Enter")) return;      // let buttons handle their own keys
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); launchBtn.click(); }
    const step = e.shiftKey ? 0.2 : 1;
    if (e.key === "ArrowLeft") { e.preventDefault(); nudge(-step, 0); }
    if (e.key === "ArrowRight") { e.preventDefault(); nudge(step, 0); }
    if (e.key === "ArrowUp") { e.preventDefault(); nudge(0, step); }
    if (e.key === "ArrowDown") { e.preventDefault(); nudge(0, -step); }
  });

  /* ════════════ Start ════════════ */
  if (gl) { try { setupGL(); } catch (err) { console.error(err); gl = null; } }
  layout();
  window.addEventListener("resize", layout);
  view.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  view.addEventListener("webglcontextrestored", function () { location.reload(); });
  // Come back to where you left off, or to the first unfinished level.
  let startAt = typeof save.last === "number" ? save.last : 0;
  if (!unlocked(startAt)) startAt = 0;
  loadLevel(startAt);
  requestAnimationFrame(frame);

  /* ════════════ For designing and checking levels ════════════
     Slingshot.check(index) tries 5,760 launches on a level and reports how many
     reach the ring, how many collect all three stars, and the size of the largest
     patch of neighbouring winning launches (bigger means more forgiving). */
  function check(i) {
    const solved = M.solve(LEVELS[i]);
    return {
      level: i + 1, name: LEVELS[i].name, wins: solved.wins.length,
      threeStar: solved.wins.filter(function (w) { return w.stars === 3; }).length,
      forgiveness: M.largestPatch(solved).size,
      straightest: solved.wins.reduce(function (m, w) { return Math.min(m, w.turned); }, Infinity)
    };
  }
  function solve(i, opts) { return M.solve(LEVELS[i], opts); }
  window.Slingshot = { solve: solve, check: check, LEVELS: LEVELS, load: loadLevel };
})();
