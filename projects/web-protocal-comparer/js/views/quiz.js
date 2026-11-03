import QUIZ from "../content/quiz.js";
import { quizState, recordQuiz } from "../store.js";
import { esc, safeHtml, ICON } from "../util.js";

const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const setup = { topics: new Set(), size: 10, missedOnly: false };

export function render(el) {
  const topics = [...new Set(QUIZ.map((q) => q.topic))];
  let run = null; // { qs, i, answers: [] }
  const onKey = (e) => {
    if (!run || e.metaKey || e.ctrlKey || e.altKey || e.target.closest("input, textarea")) return;
    const q = run.qs[run.i];
    if (!q) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= q.options.length && run.answers[run.i] == null) { e.preventDefault(); answer(n - 1); }
    else if (e.key === "Enter" && run.answers[run.i] != null && !e.target.closest("button, a")) { e.preventDefault(); next(); }
  };
  document.addEventListener("keydown", onKey);

  function home() {
    run = null;
    const st = quizState();
    const seen = QUIZ.filter((q) => st[q.id]).length;
    const right = QUIZ.filter((q) => st[q.id]?.last).length;
    const missed = QUIZ.filter((q) => st[q.id] && !st[q.id].last).length;
    el.innerHTML = `<div class="page">
      <div class="page-head"><div class="eyebrow">Practice</div><h1>Quiz</h1>
        <p>${QUIZ.length} questions on everything in the course. ${seen ? `You've answered ${seen}; ${right} are right on your latest try.` : "Short, specific, with an explanation for every answer."}</p></div>
      <section class="card">
        <div class="card-title" style="margin-bottom:12px">Topics</div>
        <div class="stack-pick" role="group" aria-label="Topics">
          <button type="button" class="chip-btn" data-topic="" aria-pressed="${setup.topics.size === 0}">All topics</button>
          ${topics.map((t) => `<button type="button" class="chip-btn" data-topic="${esc(t)}" aria-pressed="${setup.topics.has(t)}">${esc(t)} <span class="faint">${QUIZ.filter((q) => q.topic === t).length}</span></button>`).join("")}
        </div>
        <div class="btn-row" style="margin-top:18px;justify-content:space-between">
          <span class="segmented" role="group" aria-label="Number of questions">${[5, 10, 20, 0].map((n) => `<button type="button" data-size="${n}" aria-pressed="${setup.size === n}">${n || "All"}</button>`).join("")}</span>
          <label class="ctl-bool" style="display:inline-flex;align-items:center;gap:10px;cursor:pointer"><span>Only ones I missed (${missed})</span>
            <span class="switch-mini"><input type="checkbox" data-missed ${setup.missedOnly ? "checked" : ""} ${missed ? "" : "disabled"}><i></i></span></label>
        </div>
        <div class="btn-row" style="margin-top:20px"><button type="button" class="btn btn-primary btn-lg" data-start>Start ${ICON.arrow}</button><span class="faint" data-count style="font-size:13.5px"></span></div>
      </section>
    </div>`;
    count();
  }
  function pool() {
    const st = quizState();
    return QUIZ.filter((q) => (setup.topics.size === 0 || setup.topics.has(q.topic)) && (!setup.missedOnly || (st[q.id] && !st[q.id].last)));
  }
  function count() {
    const n = pool().length, take = setup.size ? Math.min(setup.size, n) : n;
    const c = el.querySelector("[data-count]"); if (c) c.textContent = `${take} question${take === 1 ? "" : "s"}`;
    const s = el.querySelector("[data-start]"); if (s) s.disabled = !take;
  }

  function start() {
    const qs = shuffle(pool()).slice(0, setup.size || undefined).map((q) => {
      // Shuffle options but remember where the answer went.
      const order = shuffle(q.options.map((_, i) => i));
      return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
    });
    run = { qs, i: 0, answers: [] };
    show();
  }
  function show() {
    const q = run.qs[run.i];
    if (!q) return summary();
    const a = run.answers[run.i];
    el.innerHTML = `<div class="page">
      <div class="drill-bar"><button type="button" class="icon-btn" data-quit aria-label="Quit quiz">${ICON.close}</button>
        <div class="meter" role="progressbar" aria-valuenow="${run.i}" aria-valuemax="${run.qs.length}" aria-label="Quiz progress"><i style="width:${(run.i / run.qs.length) * 100}%"></i></div>
        <span class="mono faint" style="font-size:12px">${run.i + 1} / ${run.qs.length}</span></div>
      <section class="check quiz-q ${a != null ? "is-answered" : ""}">
        <div class="check-q"><span class="eyebrow">${esc(q.topic)} · ${"●".repeat(q.level || 1)}${"○".repeat(3 - (q.level || 1))}</span><h1 class="quiz-title">${safeHtml(q.q)}</h1></div>
        <div class="check-opts" role="group" aria-label="Answers">${q.options.map((o, oi) => `<button type="button" class="check-opt ${a != null ? (oi === q.answer ? "is-right" : oi === a ? "is-wrong" : "is-dim") : ""}" data-opt="${oi}" ${a != null ? "disabled" : ""}>
          <span class="co-key mono">${oi + 1}</span><span>${safeHtml(o)}</span></button>`).join("")}</div>
        <div class="check-why" aria-live="polite">${a != null ? `<p><b class="${a === q.answer ? "ok" : "no"}">${a === q.answer ? "Correct." : "Not quite."}</b> ${safeHtml(q.why)}</p>` : ""}</div>
      </section>
      <div class="btn-row" style="margin-top:16px;justify-content:flex-end">${a != null
        ? `<button type="button" class="btn btn-primary btn-lg" data-next>${run.i + 1 < run.qs.length ? "Next question" : "See results"} <kbd class="hint">Enter</kbd></button>`
        : `<span class="faint kbd-hint" style="font-size:13px">Press 1–${q.options.length} to answer</span>`}</div>
    </div>`;
    el.querySelector(a != null ? "[data-next]" : ".quiz-title")?.focus?.();
  }
  function answer(i) {
    const q = run.qs[run.i];
    run.answers[run.i] = i;
    recordQuiz(q.id, i === q.answer);
    show();
  }
  function next() { run.i++; show(); window.scrollTo(0, 0); }
  function summary() {
    const right = run.qs.filter((q, i) => run.answers[i] === q.answer).length;
    const wrong = run.qs.filter((q, i) => run.answers[i] !== q.answer);
    el.innerHTML = `<div class="page">
      <div class="page-head"><div class="eyebrow">Quiz complete</div><h1 tabindex="-1">${right} / ${run.qs.length} correct</h1>
        <p>${right === run.qs.length ? "Flawless." : wrong.length <= 2 ? "Nearly there. Review the ones below." : "Worth another pass on these:"}</p></div>
      ${wrong.length ? `<div class="list">${wrong.map((q) => `<div class="row" style="grid-template-columns:22px 1fr;cursor:default">
        <span class="status-dot missed"></span><span><span class="row-title" style="display:block;white-space:normal">${safeHtml(q.q)}</span>
        <span class="row-sub" style="display:block;white-space:normal;margin-top:4px">Answer: ${safeHtml(q.options[q.answer])}</span></span></div>`).join("")}</div>` : ""}
      <div class="btn-row" style="margin-top:18px">
        ${wrong.length ? `<button type="button" class="btn btn-primary" data-retry>Retry the ${wrong.length} missed</button>` : ""}
        <button type="button" class="btn" data-home>New quiz</button>
        <a class="btn btn-ghost" href="#/">Back to the course</a>
      </div>
    </div>`;
    el.querySelector("h1").focus();
    run.wrong = wrong;
  }

  el.addEventListener("click", (e) => {
    const t = e.target.closest("[data-topic]");
    if (t) {
      const v = t.dataset.topic;
      if (!v) setup.topics.clear(); else setup.topics.has(v) ? setup.topics.delete(v) : setup.topics.add(v);
      el.querySelectorAll("[data-topic]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.topic ? setup.topics.has(b.dataset.topic) : setup.topics.size === 0)));
      return count();
    }
    const s = e.target.closest("[data-size]");
    if (s) { setup.size = +s.dataset.size; el.querySelectorAll("[data-size]").forEach((b) => b.setAttribute("aria-pressed", String(b === s))); return count(); }
    if (e.target.closest("[data-start]")) return start();
    const o = e.target.closest("[data-opt]");
    if (o && run && run.answers[run.i] == null) return answer(+o.dataset.opt);
    if (e.target.closest("[data-next]")) return next();
    if (e.target.closest("[data-quit]") || e.target.closest("[data-home]")) return home();
    if (e.target.closest("[data-retry]")) {
      run = { qs: shuffle(run.wrong), i: 0, answers: [] };
      return show();
    }
  });
  el.addEventListener("change", (e) => { if (e.target.matches("[data-missed]")) { setup.missedOnly = e.target.checked; count(); } });

  home();
  return () => document.removeEventListener("keydown", onKey);
}
