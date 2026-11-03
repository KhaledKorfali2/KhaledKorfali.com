import { PATTERNS, PROBLEMS, CATEGORIES, patternById } from "../data/index.js";
import { dueProblems, attempts, streak, patternStats, patternMastery, status, inList, settings } from "../store.js";
import { dailySession, quickSession, focusSession, weakSession, weakPatterns, newCount } from "../session.js";
import { ICON, esc, ring, pct, toast } from "../ui.js";

export function render(el) {
  const due = dueProblems().length;
  const fresh = newCount();
  const all = attempts();
  const recent = all.slice(-50);
  const acc = recent.length ? recent.filter((a) => a.ok).length / recent.length : null;
  const seen = PROBLEMS.filter((p) => inList(p) && status(p.id) !== "new").length;
  const total = PROBLEMS.filter((p) => inList(p)).length;
  const mastered = PROBLEMS.filter((p) => inList(p) && status(p.id) === "mastered").length;
  const weak = weakPatterns();
  const stats = patternStats();
  const first = !all.length;
  const size = settings().sessionSize;

  const heroTitle = first ? "Learn to see the pattern before you code"
    : due ? `${due} problem${due === 1 ? "" : "s"} ready for review`
    : "You're all caught up";
  const heroText = first
    ? "Read a problem, pick the signals, name the pattern, the data structures and the time complexity, then see why. Problems you miss come back sooner."
    : due ? "Spaced repetition brings back problems right before you'd forget them. Clearing these keeps the pattern fresh."
    : `No reviews due today. A practice session adds new problems to your rotation (${fresh} you haven't seen).`;

  el.innerHTML = `<div class="page">
    <div class="page-head">
      <div class="eyebrow">Practice</div>
      <h1>${first ? "Welcome to Pattern Trace" : greeting()}</h1>
    </div>

    <section class="hero-card" aria-labelledby="hero-title">
      <div>
        <h2 id="hero-title">${esc(heroTitle)}</h2>
        <p>${esc(heroText)}</p>
        <div class="btn-row">
          <button type="button" class="btn btn-primary btn-lg" data-start="daily">
            ${first ? "Start your first session" : due ? "Start review" : "Practice " + size + " problems"} ${ICON.arrow}
          </button>
        </div>
      </div>
      ${first ? "" : `<div class="hero-due" aria-hidden="true"><b>${due}</b><span>due today</span></div>`}
    </section>

    <div class="section-title">Other ways to practise</div>
    <div class="mode-grid">
      <button type="button" class="mode" data-start="quick">
        <span class="mode-icon">${ICON.bolt}</span>
        <span class="mode-text"><b>Quick drill</b><span>${size} problems across every pattern, favouring ones you haven't seen.</span></span>
      </button>
      <button type="button" class="mode" data-start="weak" ${weak.length ? "" : "disabled"}>
        <span class="mode-icon">${ICON.target}</span>
        <span class="mode-text"><b>Weak spots</b><span>${weak.length ? esc(weak.map((id) => patternById.get(id).name).join(", ")) : "Unlocks after a few answers show where you slip."}</span></span>
      </button>
      <button type="button" class="mode" data-scroll="focus">
        <span class="mode-icon">${ICON.repeat}</span>
        <span class="mode-text"><b>Focus a pattern</b><span>Drill one pattern mixed with the patterns it's easily confused with.</span></span>
      </button>
    </div>

    ${first ? "" : `
    <div class="section-title">At a glance <a href="#/progress" class="faint" style="font-size:12px;letter-spacing:0;text-transform:none;font-family:var(--font)">Full progress →</a></div>
    <div class="kpis">
      <div class="kpi"><b>${streak()}</b><span>day streak</span></div>
      <div class="kpi"><b>${pct(acc)}</b><span>accuracy</span><small>last ${recent.length} answers</small></div>
      <div class="kpi"><b>${seen}<span class="faint" style="font-size:14px">/${total}</span></b><span>problems seen</span></div>
      <div class="kpi"><b>${mastered}</b><span>mastered</span></div>
    </div>`}

    <div class="section-title" id="focus">Focus a pattern</div>
    ${CATEGORIES.map((cat) => {
      const pats = PATTERNS.filter((p) => p.category === cat);
      return `<div class="opts-group-label" style="margin:16px 0 8px">${esc(cat)}</div>
      <div class="pattern-pick">${pats.map((p) => {
        const s = stats.get(p.id);
        const m = patternMastery(p.id);
        return `<button type="button" class="pp" data-focus="${p.id}" aria-label="Focus ${esc(p.name)}: ${s.attempts ? pct(s.acc) + " accuracy" : "not practised yet"}">
          ${ring(m, m >= 0.6 ? "var(--good)" : null)}
          <span class="pp-name">${esc(p.name)}</span>
          <span class="pp-meta">${s.attempts ? pct(s.recentAcc) : "new"}</span>
        </button>`;
      }).join("")}</div>`;
    }).join("")}
  </div>`;

  const go = (session) => {
    if (!session) return toast("No problems match your current problem set. Change it in Settings.");
    location.hash = "#/drill";
  };
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-start]");
    if (b) {
      const kind = b.dataset.start;
      return go(kind === "daily" ? dailySession() : kind === "quick" ? quickSession() : weakSession());
    }
    const f = e.target.closest("[data-focus]");
    if (f) return go(focusSession([f.dataset.focus]));
    if (e.target.closest("[data-scroll]")) {
      document.getElementById("focus").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      el.querySelector("[data-focus]")?.focus({ preventScroll: true });
    }
  });
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Late-night practice" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
