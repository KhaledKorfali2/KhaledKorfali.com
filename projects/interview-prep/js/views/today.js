// Today: the one screen that says what to study now. Re-solves first, then new problems.
import { PHASES, TOPICS, problemById, patternById, weekLabel } from "../data/index.js";
import { plan, streak, studySec, settings, solves, draft, review, solveStatus, built, topicProgress, dueProblems, today } from "../store.js";
import { launchSolve } from "../solve-session.js";
import { LADDER } from "../domain/scheduler.js";
import { ICON, esc, difficultyTag, statusChip, minutes, dueLabel, pct } from "../ui.js";

export function render(el) {
  const p = plan();
  const t = today();
  const all = solves();
  const first = !all.length;
  const topic = p.topic;
  const phase = PHASES.find((x) => x.id === topic.phase);
  const mins = minutes(studySec());
  const goal = settings().dailyMinutes;
  const doneToday = p.done.reviews + p.done.fresh;
  const listed = new Set([...p.reviews.map((r) => r.p), ...p.fresh.map((f) => f.p)]);
  // Attempts left half-finished that aren't already in today's lists.
  const drafts = [...problemById.values()].filter((pr) => { const d = draft(pr.id); return d && !listed.has(pr.id); });
  const clueDue = dueProblems().length;
  const prog = topicProgress(topic);
  const nextUp = TOPICS.flatMap((x) => x.problems).find((id) => !review(id) && !listed.has(id));

  const row = (pr, { hidden = false, sub = "", right = "" } = {}) => {
    const d = draft(pr.id);
    return `<button type="button" class="row" data-solve="${pr.id}" ${hidden ? "data-hidden" : ""}>
      <span class="status-dot ${solveStatus(pr.id)}" aria-hidden="true"></span>
      <span style="min-width:0"><span class="row-title" style="display:block">${esc(pr.title)}</span>
        <span class="row-sub" style="display:block">${d ? "In progress · " : ""}${sub}</span></span>
      <span class="row-right">${right}</span>${difficultyTag(pr.difficulty)}</button>`;
  };

  el.innerHTML = `<div class="page">
    <div class="page-head">
      <div class="eyebrow">Week ${Math.min(p.week, 99)} of your plan · ${esc(phase.name)}</div>
      <h1>${first ? "Welcome to your study plan" : p.empty ? "Done for today" : "Today"}</h1>
      ${first ? `<p>Sixteen weeks from zero to solving unseen mediums. Each day: clear your re-solves, then work the next new problems through the same five steps and write a short note. The app schedules everything else.</p>`
        : p.empty ? `<p>${doneToday ? `You finished ${doneToday} problem${doneToday === 1 ? "" : "s"} and studied for ${mins} minute${mins === 1 ? "" : "s"}.` : `Nothing is scheduled. You studied for ${mins} minute${mins === 1 ? "" : "s"} today.`} Rest, or add something optional below.</p>` : ""}
    </div>

    <div class="kpis">
      <div class="kpi"><b>${streak()}</b><span>day streak</span></div>
      <div class="kpi"><b>${mins}<span class="faint" style="font-size:14px"> / ${goal}</span></b><span>minutes today</span>
        <div class="meter ${mins >= goal ? "good" : ""}" style="margin-top:8px" aria-hidden="true"><i style="width:${Math.min(100, (mins / goal) * 100)}%"></i></div></div>
      <div class="kpi"><b>${p.reviews.length}</b><span>re-solves due</span><small>${p.done.reviews} done today${p.overflow ? ` · ${p.overflow} moved to tomorrow` : ""}</small></div>
      <div class="kpi"><b>${p.fresh.length}</b><span>new problems</span><small>${p.done.fresh} done today</small></div>
    </div>

    ${drafts.length ? `<div class="section-title">Pick up where you left off</div>
      <div class="list">${drafts.map((pr) => row(pr, { sub: "Draft saved", right: `<span class="st st-attempted">Resume</span>` })).join("")}</div>` : ""}

    ${p.reviews.length || p.overflow ? `<div class="section-title">Re-solves <span class="faint" style="text-transform:none;letter-spacing:0;font-family:var(--font)">start from a blank page; your old note shows afterwards</span></div>
      ${p.reviews.length ? `<div class="list">${p.reviews.map((r) => {
        const pr = problemById.get(r.p);
        const rv = review(r.p);
        return row(pr, {
          sub: `Rung ${rv.stage + 1} of ${LADDER.length} · ${r.overdue > 0 ? dueLabel(r.due, t) : "due " + dueLabel(r.due, t)}`,
          right: (r.leech ? `<span class="st st-leech" title="Lapsed ${rv.lapses} times">Leech</span>` : "") + statusChip("due"),
        });
      }).join("")}</div>` : `<p class="muted">You've done today's six. The rest can wait.</p>`}
      ${p.overflow ? `<p class="faint" style="font-size:13px;margin-top:8px">${p.overflow} more ${p.overflow === 1 ? "is" : "are"} due but moved to tomorrow, so re-solves never take over the day. <a href="#/review">See the queue</a></p>` : ""}` : ""}

    ${p.fresh.length ? `<div class="section-title">New problems</div>
      <div class="list">${p.fresh.map((f) => {
        const pr = problemById.get(f.p);
        return row(pr, {
          hidden: f.hidden,
          sub: f.hidden ? "Topic hidden: guess the pattern before the reveal" : esc(TOPICS.find((x) => x.id === f.topic)?.title || ""),
          right: f.hidden ? `<span class="st st-hidden">Hidden</span>` : statusChip("new"),
        });
      }).join("")}</div>` : ""}

    ${p.leeches.length ? `<div class="section-title">Leeches</div>
      <div class="prompt is-bad">${ICON.alert}<div><b>${p.leeches.length === 1 ? "One problem keeps" : p.leeches.length + " problems keep"} slipping.</b>
        Three or more lapses usually means the pattern, not the problem, is shaky. Reread the primer before the next attempt:
        ${p.leeches.map((id) => { const pr = problemById.get(id); return `<a href="#/patterns/${pr.pattern}">${esc(pr.title)} (${esc(patternById.get(pr.pattern).name)})</a>`; }).join(", ")}.</div></div>` : ""}

    <div class="section-title">Current topic</div>
    <a class="topic-card" href="#/curriculum/${topic.id}">
      <div><div class="eyebrow">${esc(weekLabel(topic))}</div>
        <h2>${esc(topic.title)}</h2>
        <p>${prog == null ? "Hidden-topic problems and mock interviews from here on." : `${topic.problems.filter((id) => review(id)).length} of ${topic.problems.length} problems attempted`}${topic.build ? ` · build exercise ${built(topic.id) ? "done" : "to do"}` : ""}</p>
        ${prog == null ? "" : `<div class="meter ${prog >= 0.7 ? "good" : ""}" style="margin-top:12px;max-width:320px" aria-label="${pct(prog)} attempted"><i style="width:${prog * 100}%"></i></div>`}</div>
      <span class="btn btn-sm">Read the primer ${ICON.arrow}</span>
    </a>

    <div class="section-title">${p.empty ? "Optional extras" : "More practice"}</div>
    <div class="mode-grid">
      ${nextUp ? `<button type="button" class="mode" data-solve="${nextUp}">
        <span class="mode-icon">${ICON.book}</span>
        <span class="mode-text"><b>One more new problem</b><span>${esc(problemById.get(nextUp).title)}, next in the plan.</span></span></button>` : ""}
      <a class="mode" href="#/drills">
        <span class="mode-icon">${ICON.target}</span>
        <span class="mode-text"><b>Clue drill</b><span>${clueDue ? `${clueDue} due. ` : ""}Read a statement, name the pattern in under a minute.</span></span></a>
      <a class="mode" href="#/mock">
        <span class="mode-icon">${ICON.timer}</span>
        <span class="mode-text"><b>Mock interview</b><span>An unseen problem, topic hidden, 45 minutes on the clock.</span></span></a>
    </div>
  </div>`;

  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-solve]");
    if (!b) return;
    const pr = problemById.get(b.dataset.solve);
    launchSolve(pr, { hidden: b.hasAttribute("data-hidden") });
  });
}
