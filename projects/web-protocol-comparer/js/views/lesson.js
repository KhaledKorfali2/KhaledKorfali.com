import { MODULES, LESSONS } from "../content/lessons.js";
import { isDone, markDone, checkAnswer, setCheck } from "../store.js";
import { mountSim } from "../ui/simview.js";
import { headerDiagram, headersLoaded } from "../ui/charts.js";
import { esc, safeHtml, ICON, toast } from "../util.js";

const TONE = { key: "Key idea", note: "Note", warn: "Watch out" };

export function render(el, { id }) {
  const i = LESSONS.findIndex((l) => l.id === id);
  if (i < 0) {
    el.innerHTML = `<div class="page"><div class="empty"><h3>Lesson not found</h3><a class="btn" href="#/">Back to the course</a></div></div>`;
    return;
  }
  const L = LESSONS[i];
  const mod = MODULES.find((m) => m.id === L.module);
  const inModule = LESSONS.filter((l) => l.module === L.module);
  const prev = LESSONS[i - 1], next = LESSONS[i + 1];
  const sims = [];

  el.innerHTML = `<div class="page lesson">
    <a class="back" href="#/">${ICON.back} Course</a>
    <header class="page-head">
      <div class="eyebrow">${esc(mod?.title || "")} · ${inModule.indexOf(L) + 1} of ${inModule.length}</div>
      <h1>${esc(L.title)}</h1>
      <p>${esc(L.summary)} <span class="faint mono" style="font-size:12.5px;white-space:nowrap">· ${L.minutes} min</span></p>
    </header>
    <div class="lesson-body">${L.blocks.map((b, bi) => block(b, bi, L)).join("")}</div>
    <footer class="lesson-foot">
      <button type="button" class="btn ${isDone(L.id) ? "" : "btn-primary"} btn-lg" data-done>${isDone(L.id) ? `${ICON.check} Completed` : next ? "Mark complete & continue" : "Mark complete"}</button>
      <nav class="lesson-nav" aria-label="Lessons">
        ${prev ? `<a class="lesson-nav-link" href="#/learn/${prev.id}"><span>Previous</span><b>${esc(prev.title)}</b></a>` : "<span></span>"}
        ${next ? `<a class="lesson-nav-link is-next" href="#/learn/${next.id}"><span>Next</span><b>${esc(next.title)}</b></a>` : `<a class="lesson-nav-link is-next" href="#/quiz"><span>Finished?</span><b>Test yourself in the quiz</b></a>`}
      </nav>
    </footer>
  </div>`;

  // Mount simulations and header diagrams.
  el.querySelectorAll("[data-sim]").forEach((host) => {
    const b = L.blocks[+host.dataset.sim];
    sims.push(mountSim(host, b.scenario, {}));
  });
  headersLoaded.then(() => {
    el.querySelectorAll("[data-header]").forEach((h) => { h.innerHTML = headerDiagram(h.dataset.header); });
  });

  el.addEventListener("click", (e) => {
    const opt = e.target.closest("[data-check-opt]");
    if (opt) {
      const box = opt.closest("[data-check]");
      const bi = +box.dataset.check, choice = +opt.dataset.checkOpt;
      setCheck(L.id, bi, choice);
      paintCheck(box, L.blocks[bi], choice);
      return;
    }
    const lab = e.target.closest("[data-open-lab]");
    if (lab) {
      const s = sims[+lab.dataset.openLab];
      if (s) sessionStorage.setItem("wire.labImport", JSON.stringify(s.scenario));
      location.hash = "#/lab";
      return;
    }
    if (e.target.closest("[data-done]")) {
      if (!isDone(L.id)) { markDone(L.id); toast("Lesson complete"); }
      if (next) location.hash = "#/learn/" + next.id;
      else { e.target.closest("[data-done]").innerHTML = `${ICON.check} Completed`; e.target.closest("[data-done]").classList.remove("btn-primary"); }
    }
  });
  // Restore previous checkpoint answers.
  el.querySelectorAll("[data-check]").forEach((box) => {
    const prior = checkAnswer(L.id, +box.dataset.check);
    if (prior != null) paintCheck(box, L.blocks[+box.dataset.check], prior);
  });

  return () => sims.forEach((s) => s.destroy());
}

function block(b, bi, L) {
  switch (b.type) {
    case "p": return `<p class="lp">${safeHtml(b.html)}</p>`;
    case "callout": return `<aside class="callout callout-${esc(b.tone || "note")}"><b>${TONE[b.tone] || "Note"}</b><p>${safeHtml(b.html)}</p></aside>`;
    case "sim": {
      const n = L.blocks.slice(0, bi).filter((x) => x.type === "sim").length;
      return `<figure class="lesson-sim">
        ${b.caption ? `<figcaption>${safeHtml(b.caption)}</figcaption>` : ""}
        <div data-sim="${bi}"></div>
        <div class="sim-foot">
          ${b.tryThis?.length ? `<div class="try"><b>Try this</b><ul>${b.tryThis.map((t) => `<li>${safeHtml(t)}</li>`).join("")}</ul></div>` : "<span></span>"}
          <button type="button" class="btn btn-ghost btn-sm" data-open-lab="${n}">${ICON.lab} Open in Lab</button>
        </div>
      </figure>`;
    }
    case "header": return `<div class="lesson-header" data-header="${esc(b.proto)}"><p class="faint">Loading header layout…</p></div>`;
    case "table": return `<div class="table-wrap"><table class="tbl"><thead><tr>${b.head.map((h) => `<th scope="col">${safeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>${b.rows.map((r) => `<tr>${r.map((c, ci) => ci === 0 ? `<th scope="row">${safeHtml(c)}</th>` : `<td>${safeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    case "check": return `<section class="check" data-check="${bi}" aria-label="Checkpoint question">
        <div class="check-q"><span class="eyebrow">Checkpoint</span><p>${safeHtml(b.q)}</p></div>
        <div class="check-opts" role="group">${b.options.map((o, oi) => `<button type="button" class="check-opt" data-check-opt="${oi}"><span class="co-key mono">${String.fromCharCode(65 + oi)}</span><span>${safeHtml(o)}</span></button>`).join("")}</div>
        <div class="check-why" aria-live="polite"></div>
      </section>`;
    default: return "";
  }
}

function paintCheck(box, b, choice) {
  const ok = choice === b.answer;
  box.querySelectorAll("[data-check-opt]").forEach((o) => {
    const i = +o.dataset.checkOpt;
    o.classList.toggle("is-right", i === b.answer);
    o.classList.toggle("is-wrong", i === choice && !ok);
    o.classList.toggle("is-dim", i !== b.answer && i !== choice);
  });
  box.classList.add("is-answered");
  box.querySelector(".check-why").innerHTML = `<p><b class="${ok ? "ok" : "no"}">${ok ? "Correct." : "Not quite."}</b> ${safeHtml(b.why)}</p>`;
}
