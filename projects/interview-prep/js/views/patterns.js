import { PATTERNS, CATEGORIES, patternById, problemsByPattern, templateById } from "../data/index.js";
import { patternStats, patternMastery, status, STATUS_LABEL } from "../store.js";
import { focusSession } from "../session.js";
import { ICON, esc, pct, codeBlock, wireCode, difficultyTag, toast } from "../ui.js";
import { loadViz } from "../viz/index.js";
import { mountViz } from "../viz/player.js";

export function render(el, params) {
  return params.id ? detail(el, params.id) : library(el);
}

function library(el) {
  const stats = patternStats();
  el.innerHTML = `<div class="page page-wide">
    <div class="page-head"><div class="eyebrow">Pattern library</div><h1>The ${PATTERNS.length} patterns</h1>
      <p>What each pattern looks like in a problem statement, the question that gives it away, and a template to start from.</p></div>
    <div class="toolbar">
      <label class="search"><span class="sr-only">Search patterns</span>${ICON.search}
        <input class="input" type="search" placeholder="Search by name or signal, e.g. “subarray”" data-q autocomplete="off"></label>
    </div>
    <p class="result-count" data-count aria-live="polite"></p>
    <div data-cats></div>
  </div>`;
  const cats = el.querySelector("[data-cats]");
  const count = el.querySelector("[data-count]");
  const draw = (q) => {
    const needle = q.trim().toLowerCase();
    const match = (p) => !needle || [p.name, p.short, p.category, ...p.signals].some((x) => x.toLowerCase().includes(needle));
    let shown = 0;
    cats.innerHTML = CATEGORIES.map((cat) => {
      const list = PATTERNS.filter((p) => p.category === cat && match(p));
      shown += list.length;
      if (!list.length) return "";
      return `<section class="cat-block"><div class="section-title">${esc(cat)}</div><div class="pattern-cards">${list.map((p) => {
        const s = stats.get(p.id);
        const n = problemsByPattern.get(p.id).length;
        const m = patternMastery(p.id);
        return `<a class="pcard" href="#/patterns/${p.id}">
          <h3>${esc(p.name)}</h3><p>${esc(p.short)}</p>
          <div class="pcard-foot"><span>${n} problem${n === 1 ? "" : "s"}</span>
            <div class="meter ${m >= 0.6 ? "good" : ""}" aria-label="${pct(m)} mastered"><i style="width:${m * 100}%"></i></div>
            <span>${s.attempts ? pct(s.acc) : "—"}</span></div>
        </a>`;
      }).join("")}</div></section>`;
    }).join("") || `<div class="empty"><h3>No patterns match “${esc(q)}”</h3><p>Try a signal like “sorted”, “intervals” or “k-th”.</p></div>`;
    count.textContent = needle ? `${shown} of ${PATTERNS.length} patterns` : "";
  };
  const input = el.querySelector("[data-q]");
  input.addEventListener("input", () => draw(input.value));
  input.addEventListener("keydown", (e) => { if (e.key === "Escape" && input.value) { input.value = ""; draw(""); } });
  draw("");
}

function detail(el, id) {
  const p = patternById.get(id);
  if (!p) {
    el.innerHTML = `<div class="page"><div class="empty"><h3>Pattern not found</h3><a class="btn" href="#/patterns">Back to the library</a></div></div>`;
    return;
  }
  const s = patternStats().get(id);
  const probs = problemsByPattern.get(id);
  let viz = null;

  el.innerHTML = `<div class="page page-wide">
    <a class="back" href="#/patterns">${ICON.back} All patterns</a>
    <div class="page-head" style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-end">
      <div><div class="eyebrow">${esc(p.category)}</div><h1>${esc(p.name)}</h1><p>${esc(p.description)}</p></div>
      <button type="button" class="btn btn-primary" data-drill>${ICON.target} Drill this pattern</button>
    </div>

    <div class="detail-grid">
      <div style="display:grid;gap:14px;min-width:0">
        <div class="question">${esc(p.question)}</div>
        ${p.related?.length ? `<section class="card">
          <div class="card-head"><span class="card-title">Easily confused with</span></div>
          <div class="related-list">${p.related.filter((r) => patternById.has(r.id)).map((r) =>
            `<a class="related" href="#/patterns/${r.id}"><b>${esc(patternById.get(r.id).name)}</b><span>${esc(r.how)}</span></a>`).join("")}</div>
        </section>` : ""}
      </div>

      <aside class="card facts" aria-label="Quick facts">
        <div class="fact"><b>Signals</b><div class="signal-list">${p.signals.map((x) => `<span class="signal">${esc(x)}</span>`).join("")}</div></div>
        <div class="fact"><b>Data structures</b><div class="tags">${p.dataStructures.map((d) => `<span class="tag">${esc(d)}</span>`).join("")}</div></div>
        <div class="fact"><b>Typical complexity</b><div class="mono" style="font-size:13.5px">Time ${esc(p.complexity.time)}<br>Space ${esc(p.complexity.space)}</div></div>
        ${p.variants?.length ? `<div class="fact"><b>Variants</b><ul class="bullets">${p.variants.map((v) => `<li>${esc(v)}</li>`).join("")}</ul></div>` : ""}
        ${p.pitfalls?.length ? `<div class="fact"><b>Pitfalls</b><ul class="bullets">${p.pitfalls.map((v) => `<li>${esc(v)}</li>`).join("")}</ul></div>` : ""}
        <div class="fact"><b>Your record</b><div style="font-size:14px">${s.attempts ? `${pct(s.acc)} over ${s.attempts} answer${s.attempts === 1 ? "" : "s"} · ${pct(patternMastery(id))} mastered` : "Not practised yet"}</div></div>
      </aside>
    </div>

    <section class="card" style="margin-top:14px">
      <div class="card-head"><span class="card-title">Interactive walkthrough</span></div>
      <div data-viz><p class="faint">Loading…</p></div>
    </section>
    <section class="card">
      <div class="card-head"><span class="card-title">Template${p.templates.length > 1 ? "s" : ""}</span></div>
      <div style="display:grid;gap:12px">${p.templates.map((t) => codeBlock(t)).join("")}</div>
    </section>

    <div class="section-title">Problems (${probs.length})</div>
    ${probs.length ? `<div class="list">${probs.map((pr) => {
      const st = status(pr.id);
      return `<a class="row" href="#/problems/${pr.id}">
        <span class="status-dot ${st}" title="${STATUS_LABEL[st]}" aria-label="${STATUS_LABEL[st]}"></span>
        <span style="min-width:0"><span class="row-title" style="display:block">${esc(pr.title)}</span></span>
        <span class="row-num">#${pr.number}</span>${difficultyTag(pr.difficulty)}</a>`;
    }).join("")}</div>` : `<div class="empty">No problems tagged with this pattern yet.</div>`}
  </div>`;

  wireCode(el, templateById);
  el.querySelector("[data-drill]").addEventListener("click", () => {
    if (focusSession([id])) location.hash = "#/drill";
    else toast("No problems available for this pattern.");
  });

  let alive = true;
  loadViz(id).then((spec) => {
    const mount = el.querySelector("[data-viz]");
    if (!alive || !mount) return;
    if (!spec) { mount.innerHTML = `<p class="muted">No walkthrough available for this pattern.</p>`; return; }
    viz = mountViz(mount, spec);
  });
  return () => { alive = false; viz?.destroy(); };
}
