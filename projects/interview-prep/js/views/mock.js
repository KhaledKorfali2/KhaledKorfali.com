// Mock interview: unseen problems with the topic hidden, a countdown, and a pattern guess before the reveal.
import { problemById, patternById } from "../data/index.js";
import { solves, draft, metrics } from "../store.js";
import { OUTCOME_LABEL } from "../domain/scheduler.js";
import { TARGETS } from "../domain/metrics.js";
import { startMock, mockRun, endMock, mockContinue, guessRight } from "../solve-session.js";
import { ICON, esc, difficultyTag, clock, dayLabel, pct, toast } from "../ui.js";

const setup = { count: 1, minutes: 45, difficulty: "Medium" };

export function render(el) {
  const run = mockRun();
  const active = run && run.index < run.queue.length ? problemById.get(run.queue[run.index]) : null;
  const finished = run && run.index >= run.queue.length ? run : null;
  const past = solves().filter((a) => a.mode === "mock").slice(-10).reverse();
  const m = metrics();
  const seg = (key, opts) => `<span class="segmented" role="group">${opts.map(([v, l]) =>
    `<button type="button" data-set="${key}" data-val="${v}" aria-pressed="${String(setup[key]) === String(v)}">${l}</button>`).join("")}</span>`;

  const resultRow = (r) => {
    const pr = problemById.get(r.p);
    const ok = r.guess ? guessRight(pr, r.guess) : null;
    return `<a class="row" href="#/patterns/${pr.pattern}">
      <span class="status-dot ${r.outcome === "clean" ? "mastered" : r.outcome === "hinted" ? "attempted" : "missed"}" aria-hidden="true"></span>
      <span style="min-width:0"><span class="row-title" style="display:block">${esc(pr.title)}</span>
        <span class="row-sub" style="display:block">${esc(patternById.get(pr.pattern).name)}${r.guess ? ` · you guessed ${esc(patternById.get(r.guess).name)} ${ok ? "✓" : "✗"}` : " · no guess (pattern hint used)"}</span></span>
      <span class="row-right"><span class="tag outcome-tag-${r.outcome}">${OUTCOME_LABEL[r.outcome]}</span><span class="row-num">${clock(r.dur)}</span></span>
      ${difficultyTag(pr.difficulty)}</a>`;
  };

  el.innerHTML = `<div class="page">
    <div class="page-head"><div class="eyebrow">Mock interview</div><h1>${finished ? "Mock complete" : "Mock interview"}</h1>
      <p>${finished ? `${finished.results.filter((r) => r.outcome === "clean").length} of ${finished.results.length} solved cleanly.`
        : "A problem you haven't attempted, with its topic hidden. Talk through it out loud, and commit to a pattern guess before the reveal."}</p></div>

    ${finished ? `<div class="list">${finished.results.map(resultRow).join("")}</div>
      <div class="btn-row" style="margin:16px 0 8px"><button type="button" class="btn btn-primary" data-again>Set up another</button><a class="btn btn-ghost" href="#/progress">View progress</a></div>` : ""}

    ${active ? `<section class="hero-card"><div><h2>Mock in progress</h2>
      <p>Problem ${run.index + 1} of ${run.queue.length}${draft(active.id) ? `, ${clock(Math.max(0, run.limit - draft(active.id).elapsed))} left on the clock` : ""}.</p>
      <div class="btn-row"><button type="button" class="btn btn-primary btn-lg" data-resume>Resume ${ICON.arrow}</button>
        <button type="button" class="btn btn-ghost" data-abandon>Abandon</button></div></div></section>` : ""}

    ${!active && !finished ? `<section class="card">
      <div class="setup">
        <div class="setup-row"><span><b>Problems</b><small>Back to back, one clock each</small></span>${seg("count", [[1, "1"], [2, "2"], [3, "3"]])}</div>
        <div class="setup-row"><span><b>Minutes per problem</b><small>A real interview gives you about 45</small></span>${seg("minutes", [[30, "30"], [45, "45"], [60, "60"]])}</div>
        <div class="setup-row"><span><b>Difficulty</b><small>Readiness is measured on Mediums</small></span>${seg("difficulty", [["Medium", "Medium"], ["Any", "Any"]])}</div>
      </div>
      <div class="btn-row" style="margin-top:20px"><button type="button" class="btn btn-primary btn-lg" data-start>${ICON.timer} Start the clock</button></div>
    </section>

    <div class="section-title">How it runs</div>
    <ul class="bullets">
      <li>The topic and pattern stay hidden until you record the outcome. Your guess is saved next to the real pattern.</li>
      <li>The timer counts down. When it reaches zero you can finish, but be honest about the outcome.</li>
      <li>A think-aloud checklist sits beside the steps. Say each item out loud as you do it.</li>
      <li>Hints still work, and they still cap the outcome.</li>
    </ul>` : ""}

    <div class="section-title">Unseen-problem numbers</div>
    <div class="kpis">
      <div class="kpi"><b>${pct(m.unseen.rate)}</b><span>unseen-medium clean rate</span><small>target ${pct(TARGETS.unseen)} · ${m.unseen.n} of 20 attempts</small></div>
      <div class="kpi"><b>${pct(m.guess.rate)}</b><span>pattern-guess accuracy</span><small>target ${pct(TARGETS.guess)} · ${m.guess.n} guess${m.guess.n === 1 ? "" : "es"}</small></div>
    </div>

    ${past.length ? `<div class="section-title">Recent mock problems</div>
      <div class="list">${past.map((a) => resultRow({ p: a.p, outcome: a.outcome, dur: a.dur, guess: a.guess }).replace('<span class="row-num">', `<span class="row-num">${dayLabel(a.day)} · `)).join("")}</div>` : ""}
  </div>`;

  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-set]");
    if (b) {
      const key = b.dataset.set;
      setup[key] = key === "difficulty" ? b.dataset.val : Number(b.dataset.val);
      b.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      return;
    }
    if (e.target.closest("[data-start]")) { if (!startMock(setup)) toast("No problems available."); return; }
    if (e.target.closest("[data-resume]")) return mockContinue(active);
    if (e.target.closest("[data-abandon]") || e.target.closest("[data-again]")) { endMock(); window.dispatchEvent(new HashChangeEvent("hashchange")); }
  });
}
