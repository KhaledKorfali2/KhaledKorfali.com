import { PROBLEMS, PATTERNS, CATEGORIES, LISTS, patternById } from "../data/index.js";
import { status, STATUS_LABEL, settings } from "../store.js";
import { ICON, esc, difficultyTag } from "../ui.js";

// Filters survive navigating into a problem and back.
const filters = { q: "", pattern: "", difficulty: "", list: "", status: "", reveal: false };
const PAGE = 60;

export function render(el) {
  if (!filters.list) filters.list = settings().list;
  el.innerHTML = `<div class="page">
    <div class="page-head"><div class="eyebrow">Problem bank</div><h1>${PROBLEMS.length} problems</h1>
      <p>Every NeetCode 150 problem plus a few extras. Open one to practise it on its own.</p></div>
    <div class="toolbar">
      <label class="search"><span class="sr-only">Search problems</span>${ICON.search}
        <input class="input" type="search" placeholder="Search by title or number" data-f="q" value="${esc(filters.q)}" autocomplete="off"></label>
    </div>
    <div class="filters" style="margin-bottom:16px">
      <label class="sr-only" for="f-list">Problem set</label>
      <select class="select" id="f-list" data-f="list" style="width:auto">${Object.entries(LISTS).map(([k, v]) =>
        `<option value="${k}" ${filters.list === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      <label class="sr-only" for="f-pattern">Pattern</label>
      <select class="select" id="f-pattern" data-f="pattern" style="width:auto;max-width:100%">
        <option value="">All patterns</option>
        ${CATEGORIES.map((c) => `<optgroup label="${esc(c)}">${PATTERNS.filter((p) => p.category === c).map((p) =>
          `<option value="${p.id}" ${filters.pattern === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</optgroup>`).join("")}
      </select>
      <label class="sr-only" for="f-status">Status</label>
      <select class="select" id="f-status" data-f="status" style="width:auto">
        <option value="">Any status</option>
        ${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}" ${filters.status === k ? "selected" : ""}>${v}</option>`).join("")}
      </select>
      <span class="segmented" role="group" aria-label="Difficulty">
        ${["", "Easy", "Medium", "Hard"].map((d) => `<button type="button" data-diff="${d}" aria-pressed="${filters.difficulty === d}">${d || "All"}</button>`).join("")}
      </span>
      <label class="switch" style="border:0;padding:0;gap:10px;margin-left:auto">
        <span class="switch-text"><b style="font-size:13.5px">Show patterns</b></span>
        <input type="checkbox" data-reveal ${filters.reveal ? "checked" : ""}></label>
    </div>
    <p class="result-count" data-count aria-live="polite"></p>
    <div data-list></div>
  </div>`;

  const listEl = el.querySelector("[data-list]");
  const countEl = el.querySelector("[data-count]");
  let limit = PAGE;

  function draw() {
    const q = filters.q.trim().toLowerCase();
    const rows = PROBLEMS.filter((p) =>
      (!q || p.title.toLowerCase().includes(q) || String(p.number) === q.replace(/^#/, "")) &&
      (!filters.pattern || p.pattern === filters.pattern) &&
      (!filters.difficulty || p.difficulty === filters.difficulty) &&
      (filters.list === "all" || (p.lists || []).includes(filters.list)) &&
      (!filters.status || status(p.id) === filters.status));
    countEl.textContent = `${rows.length} problem${rows.length === 1 ? "" : "s"}`;
    if (!rows.length) {
      listEl.innerHTML = `<div class="empty"><h3>No problems match</h3><p>Try clearing a filter.</p><button type="button" class="btn" data-clear>Clear filters</button></div>`;
      return;
    }
    listEl.innerHTML = `<div class="list">${rows.slice(0, limit).map((p) => {
      const st = status(p.id);
      const sub = filters.reveal || filters.pattern ? patternById.get(p.pattern).name : "";
      return `<a class="row" href="#/problems/${p.id}">
        <span class="status-dot ${st}" title="${STATUS_LABEL[st]}" aria-label="${STATUS_LABEL[st]}"></span>
        <span style="min-width:0"><span class="row-title" style="display:block">${esc(p.title)}</span>${sub ? `<span class="row-sub" style="display:block">${esc(sub)}</span>` : ""}</span>
        <span class="row-num">#${p.number}</span>${difficultyTag(p.difficulty)}</a>`;
    }).join("")}
    ${rows.length > limit ? `<div class="list-foot"><button type="button" class="btn btn-sm" data-more>Show ${Math.min(PAGE, rows.length - limit)} more</button></div>` : ""}</div>`;
  }

  el.addEventListener("input", (e) => {
    const f = e.target.dataset.f;
    if (f) { filters[f] = e.target.value; limit = PAGE; draw(); }
  });
  el.addEventListener("change", (e) => {
    if (e.target.matches("[data-reveal]")) { filters.reveal = e.target.checked; draw(); }
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && e.target.dataset.f === "q" && e.target.value) { e.target.value = ""; filters.q = ""; draw(); }
  });
  el.addEventListener("click", (e) => {
    const d = e.target.closest("[data-diff]");
    if (d) {
      filters.difficulty = d.dataset.diff;
      el.querySelectorAll("[data-diff]").forEach((b) => b.setAttribute("aria-pressed", String(b === d)));
      limit = PAGE; draw();
    }
    if (e.target.closest("[data-more]")) { limit += PAGE; draw(); }
    if (e.target.closest("[data-clear]")) {
      Object.assign(filters, { q: "", pattern: "", difficulty: "", list: "all", status: "" });
      el.querySelectorAll("[data-f]").forEach((f) => { f.value = filters[f.dataset.f]; });
      el.querySelectorAll("[data-diff]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.diff === "")));
      limit = PAGE; draw();
    }
  });
  draw();
}
