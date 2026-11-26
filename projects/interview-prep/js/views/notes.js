// Notes: every reflection note, searchable and grouped by pattern.
import { PATTERNS, CATEGORIES, problemById, patternById } from "../data/index.js";
import { solves } from "../store.js";
import { OUTCOME_LABEL } from "../domain/scheduler.js";
import { ICON, esc, dayLabel } from "../ui.js";

const filters = { q: "", pattern: "" };

// Shared with the pattern pages, which list the learner's notes for one pattern.
export function noteItem(a, { showPattern = false } = {}) {
  const pr = problemById.get(a.p);
  return `<article class="note-card">
    <div class="note-card-head"><a href="#/solve/${pr.slug}"><b>${esc(pr.title)}</b></a>
      <span class="note-meta">${showPattern ? esc(patternById.get(a.note.pattern)?.name || "") + " · " : ""}${dayLabel(a.day, { month: "short", day: "numeric", year: "numeric" })}
        <span class="tag outcome-tag-${a.outcome}">${OUTCOME_LABEL[a.outcome]}</span></span></div>
    <dl><dt>Clue</dt><dd>${esc(a.note.clue)}</dd><dt>Insight</dt><dd>${esc(a.note.insight)}</dd>
      ${a.note.mistakes ? `<dt>Mistakes</dt><dd>${esc(a.note.mistakes)}</dd>` : ""}</dl></article>`;
}

export function render(el) {
  const all = [...solves()].reverse();
  if (!all.length) {
    el.innerHTML = `<div class="page"><div class="page-head"><div class="eyebrow">Notes</div><h1>Pattern notes</h1></div>
      <div class="empty"><h3>No notes yet</h3><p>Every attempt ends with a short note: the pattern, the clue that should have pointed to it, and the key insight. They collect here.</p>
      <a class="btn btn-primary" href="#/">Go to Today</a></div></div>`;
    return;
  }
  const used = new Set(all.map((a) => a.note.pattern));
  el.innerHTML = `<div class="page">
    <div class="page-head"><div class="eyebrow">Notes</div><h1>Pattern notes</h1>
      <p>Read a pattern's clues before a session. They are your own words for what to look for.</p></div>
    <div class="toolbar">
      <label class="search"><span class="sr-only">Search notes</span>${ICON.search}
        <input class="input" type="search" placeholder="Search clues, insights, mistakes or titles" data-f="q" value="${esc(filters.q)}" autocomplete="off"></label>
      <label class="sr-only" for="n-pattern">Pattern</label>
      <select class="select" id="n-pattern" data-f="pattern" style="width:auto;max-width:100%">
        <option value="">All patterns</option>
        ${PATTERNS.filter((p) => used.has(p.id)).map((p) => `<option value="${p.id}" ${filters.pattern === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
      </select>
    </div>
    <p class="result-count" data-count aria-live="polite"></p>
    <div data-groups></div>
  </div>`;

  const groups = el.querySelector("[data-groups]");
  const count = el.querySelector("[data-count]");
  function draw() {
    const q = filters.q.trim().toLowerCase();
    const rows = all.filter((a) => (!filters.pattern || a.note.pattern === filters.pattern) &&
      (!q || [problemById.get(a.p).title, a.note.clue, a.note.insight, a.note.mistakes].some((x) => x.toLowerCase().includes(q))));
    count.textContent = `${rows.length} note${rows.length === 1 ? "" : "s"}`;
    if (!rows.length) { groups.innerHTML = `<div class="empty"><h3>No notes match</h3><p>Try a different word, or clear the pattern filter.</p></div>`; return; }
    const order = CATEGORIES.flatMap((c) => PATTERNS.filter((p) => p.category === c));
    groups.innerHTML = order.map((p) => {
      const mine = rows.filter((a) => a.note.pattern === p.id);
      return mine.length ? `<section><div class="section-title"><a href="#/patterns/${p.id}">${esc(p.name)}</a><span>${mine.length}</span></div>
        <div class="note-list">${mine.map((a) => noteItem(a)).join("")}</div></section>` : "";
    }).join("");
  }
  el.addEventListener("input", (e) => { const f = e.target.dataset.f; if (f) { filters[f] = e.target.value; draw(); } });
  draw();
}
