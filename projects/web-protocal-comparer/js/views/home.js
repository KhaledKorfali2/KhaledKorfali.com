import { MODULES, LESSONS } from "../content/lessons.js";
import { isDone, doneCount } from "../store.js";
import { mountSim } from "../ui/simview.js";
import { esc, ICON } from "../util.js";

export function render(el) {
  const done = doneCount();
  const next = LESSONS.find((l) => !isDone(l.id)) || LESSONS[0];
  const started = done > 0;
  el.innerHTML = `<div class="page page-wide">
    <section class="wire-hero">
      <div class="wire-hero-text">
        <div class="eyebrow">An interactive networking course</div>
        <h1>Watch the internet <span class="glow">move data.</span></h1>
        <p>Every web page, video call and API request is packets crossing a wire. Learn what IP, UDP, TCP, TLS, DNS, HTTP/2, HTTP/3 and WebSockets actually do by watching real packet exchanges unfold, then break them on purpose.</p>
        <div class="btn-row" style="margin-top:22px">
          <a class="btn btn-primary btn-lg" href="#/learn/${next.id}">${started ? "Continue: " + esc(next.title) : "Start the course"} ${ICON.arrow}</a>
          <a class="btn btn-lg" href="#/lab">Open the lab</a>
        </div>
        ${started ? `<p class="faint" style="margin-top:12px;font-size:13.5px">${done} of ${LESSONS.length} lessons complete</p>` : ""}
      </div>
      <div class="wire-hero-demo card" data-demo aria-label="Live example: a TCP connection"></div>
    </section>

    <div class="section-title">How to read a sequence diagram</div>
    <div class="howto">
      <div><b>Lanes</b><span>Each vertical line is a machine. The client is on the left.</span></div>
      <div><b>Time flows down</b><span>The further down an arrow ends, the later it arrived.</span></div>
      <div><b>Slanted arrows</b><span>The slope is latency: steeper means slower.</span></div>
      <div><b>✕ marks</b><span>Lost packets. Watch how each protocol reacts.</span></div>
    </div>

    <div class="section-title">The course</div>
    <div class="modules">${MODULES.map((m, mi) => {
      const ls = LESSONS.filter((l) => l.module === m.id);
      const d = ls.filter((l) => isDone(l.id)).length;
      return `<section class="module card">
        <div class="module-head"><span class="module-num mono">${String(mi + 1).padStart(2, "0")}</span>
          <div><h2>${esc(m.title)}${m.level ? ` <span class="level level-${esc(m.level.toLowerCase())}">${esc(m.level)}</span>` : ""}</h2><p>${esc(m.blurb)}</p></div>
          <span class="module-prog mono" aria-label="${d} of ${ls.length} done">${d}/${ls.length}</span></div>
        <ol class="lesson-list">${ls.map((l) => `<li><a href="#/learn/${l.id}" class="${isDone(l.id) ? "is-done" : ""}">
          <span class="ll-check" aria-hidden="true">${isDone(l.id) ? ICON.check : ""}</span>
          <span class="ll-title">${esc(l.title)}</span><span class="ll-min mono">${l.minutes} min</span>
          ${isDone(l.id) ? '<span class="sr-only">(completed)</span>' : ""}</a></li>`).join("")}</ol>
      </section>`;
    }).join("")}</div>
  </div>`;

  const sim = mountSim(el.querySelector("[data-demo]"), {
    stack: "tcp", options: { segments: 3, initCwnd: 2, teardown: true }, link: { latency: 40 }, seed: 3,
  }, { showControls: false, mini: true });
  return () => sim.destroy();
}
