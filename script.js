// Project list with category metadata. Order matters: the first four are
// shown as "Featured" on the home page.
const projects = [
  {
    name: "Breach",
    description: "Learn cybersecurity by doing: capture flags from simulated websites, packet captures, logs and code, across 12 tracks mapped to ten certifications from ISC2 CC and Security+ up to CISSP.",
    image: "screenshots/breach.webp",
    path: "./projects/breach/index.html",
    category: "security"
  },
  {
    name: "Pattern Trace",
    description: "Spot the pattern in 150+ LeetCode problems, with spaced repetition and step-through visualisations.",
    image: "screenshots/interview-prep.webp",
    path: "./projects/interview-prep/index.html",
    category: "programming"
  },
  {
    name: "Falling Sand Simulator",
    description: "A particle sandbox of sand, water, fire and smoke interacting cell by cell.",
    image: "screenshots/falling-sand.webp",
    path: "./projects/falling-sand/index.html",
    category: "simulation"
  },
  {
    name: "Boid Simulator",
    description: "Flocking behaviour from three simple rules: separation, alignment, cohesion.",
    image: "screenshots/boid-simulator.webp",
    path: "./projects/boid-simulator/index.html",
    category: "simulation"
  },
  {
    name: "Quarry",
    description: "Learn databases by doing: write real SQL in a live MySQL-style console and capture a flag for every skill, from your first SELECT to joins, window functions, schema design, indexes and production data fixes.",
    image: "screenshots/quarry.webp",
    path: "./projects/quarry/index.html",
    category: "programming"
  },
  {
    name: "Vim System",
    description: "An interactive course that teaches Vim motions and operators in the browser.",
    image: "screenshots/vim-sim.webp",
    path: "./projects/cs-courses/vim-sim-index.html",
    category: "programming"
  },
  {
    name: "Arabic Letter Quiz",
    description: "Drill the 28 letters of the Arabic alphabet and their forms.",
    image: "screenshots/arabic-letter-quiz.webp",
    path: "./projects/arabic-letter-quiz/index.html",
    category: "arabic"
  },
  {
    name: "Linux File System",
    description: "Learn the shell by navigating a simulated Linux file system.",
    image: "screenshots/fs-sim.webp",
    path: "./projects/cs-courses/fs-sim-index.html",
    category: "programming"
  },
  {
    name: "Git System",
    description: "See commits, branches and merges take shape as you type git commands.",
    image: "screenshots/git-sim.webp",
    path: "./projects/cs-courses/git-sim-index.html",
    category: "programming"
  },
  {
    name: "Sorting Algorithm Simulator",
    description: "Step through sorting algorithms and watch every comparison and swap.",
    image: "screenshots/sorting-alg.webp",
    path: "./projects/sorting-simulator/index.html",
    category: "programming"
  },
  {
    name: "Graph Algorithm Simulator",
    description: "Build a graph and watch BFS, Dijkstra, A*, Kruskal and more run step by step.",
    image: "screenshots/graph-sim.webp",
    path: "./projects/graph-simulator/index.html",
    category: "programming"
  },
  {
    name: "Frontend Playground",
    description: "Guided HTML, CSS and JavaScript lessons with a live preview.",
    image: "screenshots/css-playground.webp",
    path: "./projects/frontend-playground/index.html",
    category: "programming"
  },
  {
    name: "Logic Gate Simulator",
    description: "Wire up logic gates and watch signals propagate through the circuit.",
    image: "screenshots/gatevis.webp",
    path: "./projects/gatevis/index.html",
    category: "programming"
  },
  {
    name: "Facepaint",
    description: "Draw with your face using your webcam: open your mouth to paint.",
    image: "screenshots/facepaint.webp",
    path: "./projects/facepaint/index.html",
    category: "simulation"
  },
  {
    name: "Noosphere",
    description: "An interactive particle field that responds to your cursor or touch.",
    image: "screenshots/noosphere.webp",
    path: "./projects/noosphere/index.html",
    category: "programming"
  },
  {
    name: "Conway's Game of Life",
    description: "The classic cellular automaton: draw a pattern and let it evolve.",
    image: "screenshots/game-of-life.webp",
    path: "./projects/game-of-life/index.html",
    category: "simulation"
  },
  {
    name: "Wire: How Networks Work",
    description: "An interactive networking course: watch real packets as you learn TCP, TLS, HTTP/2, HTTP/3 and more.",
    image: "screenshots/web-protocal-comparer.webp",
    path: "./projects/web-protocal-comparer/index.html",
    category: "programming"
  },
  {
    name: "Arabic Flashcards",
    description: "Flip through Arabic letters and their isolated, initial, medial and final forms.",
    image: "screenshots/arabic-flashcards.webp",
    path: "./projects/arabic-flashcards/index.html",
    category: "arabic"
  },
  {
    name: "Arabic Word Guess",
    description: "A Wordle-style game for guessing Qur'anic Arabic words letter by letter.",
    image: "screenshots/arabic-word-guess.webp",
    path: "./projects/arabic-word-guess/index.html",
    category: "arabic"
  },
  {
    name: "Arabic Word Breakdown",
    description: "Paste or scan Arabic text and hear it broken down letter by letter.",
    image: "screenshots/arabic-breakdown.webp",
    path: "./projects/arabic-breakdown/index.html",
    category: "arabic"
  },
  {
    name: "Surah Quiz",
    description: "Test your knowledge of the 114 surahs: names, numbers and order.",
    image: "screenshots/surah-quiz.webp",
    path: "./projects/surah-quiz/index.html",
    category: "arabic"
  },
];

const CATEGORY_LABELS = {
  security: "Security",
  simulation: "Simulation",
  arabic: "Arabic Learning",
  programming: "Programming"
};

function categoryLabel(c) {
  return CATEGORY_LABELS[c] || "Programming";
}

const prefersReducedMotion =
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ── Shared hero particle field ──
   Pauses when the hero is off-screen or the tab is hidden, renders at the
   device pixel ratio, and draws a single static frame for reduced motion. */
function startParticles(canvas, hero, opts) {
  const ctx = canvas.getContext("2d");
  const mouse = { x: -9999, y: -9999 };
  let W = 0, H = 0, particles = [], rafId = 0, visible = true;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = hero.offsetWidth;
    H = hero.offsetHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!rafId) draw(false);
  }
  function mkParticle() {
    const a = Math.random() * Math.PI * 2;
    const s = opts.speed * (0.4 + Math.random() * 0.6);
    return { x: Math.random() * W, y: Math.random() * H,
             vx: Math.cos(a) * s, vy: Math.sin(a) * s,
             r: opts.radius + Math.random() * 1.2 };
  }

  function draw(move) {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (move) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < opts.repel && d > 0) {
          const f = (opts.repel - d) / opts.repel * 0.55;
          p.vx += (dx / d) * f; p.vy += (dy / d) * f;
        }
        const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (spd > opts.speed * 3) { p.vx *= 0.96; p.vy *= 0.96; }
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(232,84,26," + opts.alpha + ")";
      ctx.fill();

      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const ex = p.x - q.x, ey = p.y - q.y;
        const ld = Math.sqrt(ex * ex + ey * ey);
        if (ld < opts.link) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = "rgba(232,84,26," + ((1 - ld / opts.link) * opts.lineAlpha) + ")";
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }
  }

  function tick() {
    draw(true);
    rafId = requestAnimationFrame(tick);
  }
  function start() {
    if (rafId || prefersReducedMotion || !visible || document.hidden) return;
    rafId = requestAnimationFrame(tick);
  }
  function stop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  hero.addEventListener("pointermove", function (e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  });
  hero.addEventListener("pointerleave", function () { mouse.x = -9999; mouse.y = -9999; });
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else start();
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) start(); else stop();
    }).observe(hero);
  }

  resize();
  // Fewer particles on small screens keeps the O(n²) link pass cheap.
  const count = W < 600 ? Math.round(opts.count * 0.5) : opts.count;
  for (let k = 0; k < count; k++) particles.push(mkParticle());
  draw(false);
  start();
}

/* ── Text scramble on an element, settling into its original text ── */
function scrambleText(el, frames, delay) {
  if (!el || prefersReducedMotion) return;
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#";
  const orig = el.textContent;
  let f = 0;
  function step() {
    if (f >= frames) { el.textContent = orig; return; }
    const p = f / frames;
    let out = "";
    for (let i = 0; i < orig.length; i++) {
      if (orig[i] === " ") { out += " "; continue; }
      out += i / orig.length < p ? orig[i] : CHARS[Math.floor(Math.random() * CHARS.length)];
    }
    el.textContent = out; f++;
    setTimeout(step, 40);
  }
  setTimeout(step, delay);
}

/* ── Scroll-reveal: adds .revealed once an element enters the viewport ── */
function makeRevealer(threshold) {
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    return function (el) { el.classList.add("revealed"); };
  }
  const obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("revealed"); obs.unobserve(e.target); }
    });
  }, { threshold: threshold });
  return function (el) { obs.observe(el); };
}
