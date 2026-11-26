// Review queue: every scheduled re-solve, due and upcoming.
import { PATTERNS, CATEGORIES, problemById, patternById } from "../data/index.js";
import { reviews, today } from "../store.js";
import { launchSolve } from "../solve-session.js";
import { LADDER, OUTCOME_LABEL, isLeech, isDue } from "../domain/scheduler.js";
import { esc, difficultyTag, statusChip, dueLabel, dayLabel } from "../ui.js";

let filter = "";

export function render(el) {
  const t = today();
  const all = Object.entries(reviews()).map(([id, r]) => ({ pr: problemById.get(id), r })).filter((x) => x.pr);
  if (!all.length) {
    el.innerHTML = `<div class="page"><div class="page-head"><div class="eyebrow">Review</div><h1>Re-solve queue</h1></div>
      <div class="empty"><h3>Nothing scheduled yet</h3><p>Every problem you attempt is scheduled to come back: in 7 days if it went cleanly, in 3 if it didn't.</p>
      <a class="btn btn-primary" href="#/">Go to Today</a></div></div>`;
    return;
  }
  const used = new Set(all.map((x) => x.pr.pattern));

  el.innerHTML = `<div class="page">
    <div class="page-head"><div class="eyebrow">Review</div><h1>Re-solve queue</h1>
      <p>A problem climbs the ladder (${LADDER.join(", ")} days) each time you re-solve it cleanly, and drops back when you don't. Past the last rung it's mastered.</p></div>
    <div class="filters" style="margin-bottom:16px">
      <label class="sr-only" for="rv-pattern">Pattern</label>
      <select class="select" id="rv-pattern" data-filter style="width:auto;max-width:100%">
        <option value="">All patterns</option>
        ${CATEGORIES.map((c) => { const ps = PATTERNS.filter((p) => p.category === c && used.has(p.id));
          return ps.length ? `<optgroup label="${esc(c)}">${ps.map((p) => `<option value="${p.id}" ${filter === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</optgroup>` : ""; }).join("")}
      </select>
    </div>
    <div data-lists></div>
  </div>`;

  const lists = el.querySelector("[data-lists]");
  const row = ({ pr, r }) => {
    const due = isDue(r, t);
    return `<button type="button" class="row" data-solve="${pr.id}">
      <span class="status-dot ${r.mastered ? "mastered" : due ? "due" : "attempted"}" aria-hidden="true"></span>
      <span style="min-width:0"><span class="row-title" style="display:block">${esc(pr.title)}</span>
        <span class="row-sub" style="display:block">${r.mastered ? "Mastered" : `Rung ${r.stage + 1} of ${LADDER.length}`} · last time: ${OUTCOME_LABEL[r.last].toLowerCase()}${r.lapses ? ` · ${r.lapses} lapse${r.lapses === 1 ? "" : "s"}` : ""}${filter ? "" : ` · ${esc(patternById.get(pr.pattern).name)}`}</span></span>
      <span class="row-right">${isLeech(r) ? `<span class="st st-leech">Leech</span>` : ""}${r.mastered ? statusChip("mastered") : due ? statusChip("due") : `<span class="row-num" title="${dayLabel(r.due)}">${dueLabel(r.due, t)}</span>`}</span>
      ${difficultyTag(pr.difficulty)}</button>`;
  };
  function draw() {
    const rows = all.filter((x) => !filter || x.pr.pattern === filter);
    const due = rows.filter((x) => isDue(x.r, t)).sort((a, b) => a.r.due - b.r.due);
    const later = rows.filter((x) => !x.r.mastered && !isDue(x.r, t)).sort((a, b) => a.r.due - b.r.due);
    const done = rows.filter((x) => x.r.mastered);
    const block = (title, list, empty) => `<div class="section-title">${title} (${list.length})</div>
      ${list.length ? `<div class="list">${list.map(row).join("")}</div>` : `<p class="muted">${empty}</p>`}`;
    lists.innerHTML = block("Due now", due, "Nothing due. Nice.") + block("Upcoming", later, "Nothing scheduled.") +
      (done.length ? block("Mastered", done, "") : "");
  }
  el.addEventListener("change", (e) => { if (e.target.matches("[data-filter]")) { filter = e.target.value; draw(); } });
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-solve]");
    if (b) launchSolve(problemById.get(b.dataset.solve), { mode: "review" });
  });
  draw();
}
