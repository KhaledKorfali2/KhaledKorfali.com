// Curriculum: the four phases and their weekly topics; each topic has a primer,
// a build-it-yourself exercise and an ordered problem list.
import { PHASES, TOPICS, topicById, problemById, patternById, weekLabel } from "../data/index.js";
import { plan, topicProgress, built, setBuilt, solveStatus, review, draft } from "../store.js";
import { launchSolve } from "../solve-session.js";
import { ICON, esc, difficultyTag, statusChip, md, pct } from "../ui.js";

export function render(el, params) {
  return params.topic ? topicPage(el, params.topic) : overview(el);
}

function overview(el) {
  const current = plan().topic;
  el.innerHTML = `<div class="page">
    <div class="page-head"><div class="eyebrow">Curriculum</div><h1>The 16-week plan</h1>
      <p>Topics are never locked. Today suggests the first one you haven't got 70% through, but you can open any of them.</p></div>
    ${PHASES.map((ph) => {
      const topics = TOPICS.filter((t) => t.phase === ph.id);
      return `<section class="phase">
        <div class="section-title">Phase ${ph.id} · ${esc(ph.name)} <span class="faint" style="text-transform:none;letter-spacing:0;font-family:var(--font)">weeks ${ph.weeks[0]}–${ph.weeks[1]}${ph.id === 3 ? "+" : ""}</span></div>
        <p class="muted" style="margin:-4px 0 12px;font-size:14px">${esc(ph.goal)}</p>
        <div class="list">${topics.map((t) => {
          const prog = topicProgress(t);
          const n = t.problems.filter((id) => review(id)).length;
          return `<a class="row topic-row" href="#/curriculum/${t.id}">
            <span class="week-num">${t.weeks ? t.weeks[0] + "–" + t.weeks[1] : t.week}</span>
            <span style="min-width:0"><span class="row-title" style="display:block">${esc(t.title)}${t.id === current.id ? ` <span class="st st-due" style="margin-left:6px">Current</span>` : ""}</span>
              <span class="row-sub" style="display:block">${prog == null ? "Hidden-topic practice and mock interviews" : `${n} of ${t.problems.length} problems attempted`}${t.build ? ` · build exercise ${built(t.id) ? "done" : "to do"}` : ""}</span></span>
            <span class="topic-meter">${prog == null ? "" : `<span class="meter ${prog >= 0.7 ? "good" : ""}" aria-label="${pct(prog)} attempted"><i style="width:${prog * 100}%"></i></span>`}</span>
            <span class="row-num">${prog == null ? "" : pct(prog)}</span></a>`;
        }).join("")}</div>
      </section>`;
    }).join("")}
    <div class="btn-row" style="margin-top:24px"><a class="btn btn-ghost btn-sm" href="#/problems">Browse every problem ${ICON.arrow}</a></div>
  </div>`;
}

function topicPage(el, id) {
  const t = topicById.get(id);
  if (!t) {
    el.innerHTML = `<div class="page"><div class="empty"><h3>Topic not found</h3><a class="btn" href="#/curriculum">Back to the curriculum</a></div></div>`;
    return;
  }
  const ph = PHASES.find((p) => p.id === t.phase);
  const i = TOPICS.indexOf(t);
  const prev = TOPICS[i - 1], next = TOPICS[i + 1];

  el.innerHTML = `<div class="page">
    <a class="back" href="#/curriculum">${ICON.back} Curriculum</a>
    <div class="page-head"><div class="eyebrow">${esc(weekLabel(t))} · Phase ${ph.id} · ${esc(ph.name)}</div><h1>${esc(t.title)}</h1>
      ${t.patterns.length ? `<div class="tags" style="margin-top:12px">${t.patterns.map((p) => `<a class="tag tag-outline" href="#/patterns/${p}">${esc(patternById.get(p).name)}</a>`).join("")}</div>` : ""}</div>

    <section class="card"><div class="card-head"><span class="card-title">Primer</span></div><div class="prose">${md(t.primer)}</div></section>

    ${t.build ? `<section class="card"><div class="card-head"><span class="card-title">Build it yourself</span></div>
      <label class="switch" style="border:0;padding:0"><span class="switch-text"><b>${esc(t.build)}</b><span>From a blank file, no reference. Building the structure once is what makes its costs obvious.</span></span>
      <input type="checkbox" data-built ${built(t.id) ? "checked" : ""}></label></section>` : ""}

    ${t.problems.length ? `<div class="section-title">Problems (${t.problems.length}) <span class="faint" style="text-transform:none;letter-spacing:0;font-family:var(--font)">in order, easy to medium</span></div>
      <div class="list">${t.problems.map((pid, n) => {
        const pr = problemById.get(pid);
        const st = solveStatus(pid);
        return `<button type="button" class="row" data-solve="${pid}">
          <span class="week-num">${n + 1}</span>
          <span style="min-width:0"><span class="row-title" style="display:block">${esc(pr.title)}</span>${draft(pid) ? `<span class="row-sub" style="display:block">In progress</span>` : ""}</span>
          <span class="row-right">${statusChip(st)}</span>${difficultyTag(pr.difficulty)}</button>`;
      }).join("")}</div>`
      : `<div class="btn-row" style="margin-top:18px"><a class="btn btn-primary" href="#/mock">${ICON.timer} Start a mock interview</a><a class="btn" href="#/">Today's hidden-topic problems</a></div>`}

    <div class="pager">
      ${prev ? `<a class="btn btn-ghost btn-sm" href="#/curriculum/${prev.id}">${ICON.back} ${esc(prev.title)}</a>` : "<span></span>"}
      ${next ? `<a class="btn btn-ghost btn-sm" href="#/curriculum/${next.id}">${esc(next.title)} ${ICON.arrow}</a>` : ""}
    </div>
  </div>`;

  el.addEventListener("change", (e) => { if (e.target.matches("[data-built]")) setBuilt(t.id, e.target.checked); });
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-solve]");
    if (b) launchSolve(problemById.get(b.dataset.solve));
  });
}
