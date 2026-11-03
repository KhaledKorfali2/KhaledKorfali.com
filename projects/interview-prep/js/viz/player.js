// Generic step-through player for a visualiser spec (see viz/README.md).
// Owns the input form, transport controls, code highlighting, keyboard
// shortcuts and the play timer; the spec only computes steps and renders one.
import { esc, InputError } from "./kit.js";

const SPEEDS = [["0.5×", 1500], ["1×", 850], ["2×", 420], ["4×", 200]];
let uid = 0;
const injectedCss = new Set();

export function mountViz(container, spec, { startExpanded = false } = {}) {
  const id = "vz" + (++uid);
  if (spec.css && !injectedCss.has(spec.id)) {
    const st = document.createElement("style");
    st.textContent = spec.css;
    document.head.appendChild(st);
    injectedCss.add(spec.id);
  }

  const defaults = Object.fromEntries(spec.inputs.map((f) => [f.key, f.default]));
  let values = { ...defaults };
  let input = spec.parse(values);
  let steps = spec.steps(input);
  let idx = 0, timer = null, speed = 1, destroyed = false;

  container.innerHTML = `
    <div class="vz" tabindex="-1" id="${id}">
      <div class="vz-top">
        <div class="vz-heading">
          <div class="vz-title">${esc(spec.title)}</div>
          ${spec.blurb ? `<div class="vz-blurb">${esc(spec.blurb)}</div>` : ""}
        </div>
        <button type="button" class="btn btn-ghost btn-sm vz-edit-toggle" aria-expanded="${startExpanded}" aria-controls="${id}-form">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M11.5 2.5l2 2-8 8H3.5v-2z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
          Edit input
        </button>
      </div>
      <form class="vz-form" id="${id}-form" ${startExpanded ? "" : "hidden"} novalidate>
        ${spec.presets && spec.presets.length ? `<div class="vz-presets" role="group" aria-label="Example inputs">
          ${spec.presets.map((p, i) => `<button type="button" class="chip-btn" data-preset="${i}">${esc(p.label)}</button>`).join("")}
        </div>` : ""}
        <div class="vz-fields">
          ${spec.inputs.map((f) => `
            <label class="field ${f.multiline ? "field-wide" : f.wide ? "field-wide" : ""}">
              <span class="field-label">${esc(f.label)}</span>
              ${f.multiline
                ? `<textarea name="${f.key}" rows="${f.rows || 4}" spellcheck="false" autocapitalize="off">${esc(f.default)}</textarea>`
                : `<input name="${f.key}" value="${esc(f.default)}" spellcheck="false" autocomplete="off" autocapitalize="off" ${f.numeric ? 'inputmode="numeric"' : ""}>`}
              ${f.hint ? `<span class="field-hint">${esc(f.hint)}</span>` : ""}
            </label>`).join("")}
        </div>
        <div class="vz-form-foot">
          <p class="vz-error" role="alert"></p>
          <button type="submit" class="btn btn-primary btn-sm">Run</button>
        </div>
      </form>
      <div class="vz-body">
        <div class="vz-stage-wrap"><div class="vz-stage" aria-hidden="false"></div></div>
        <div class="vz-code-wrap">
          <div class="vz-code-head">Algorithm</div>
          <ol class="vz-code">${spec.code.map((l) => `<li><code>${esc(l) || " "}</code></li>`).join("")}</ol>
        </div>
      </div>
      <div class="vz-msg" aria-live="polite"></div>
      <div class="vz-transport">
        <button type="button" class="icon-btn" data-act="first" aria-label="First step" title="First step (Home)">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3v10M13 3L6 8l7 5z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg></button>
        <button type="button" class="icon-btn" data-act="prev" aria-label="Previous step" title="Previous step (←)">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 3L5 8l5.5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button type="button" class="icon-btn icon-btn-primary" data-act="play" aria-label="Play" title="Play / pause (Space)">
          <svg class="i-play" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8v10.4L13 8z" fill="currentColor"/></svg>
          <svg class="i-pause" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor"/></svg></button>
        <button type="button" class="icon-btn" data-act="next" aria-label="Next step" title="Next step (→)">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3L11 8l-5.5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <input type="range" class="vz-scrub" min="0" value="0" aria-label="Step">
        <span class="vz-count" aria-hidden="true"></span>
        <button type="button" class="chip-btn vz-speed" aria-label="Playback speed">1×</button>
      </div>
      ${spec.legend && spec.legend.length ? `<div class="vz-legend">${spec.legend.map(([s, l]) =>
        `<span><i class="vz-swatch is-${esc(s)}"></i>${esc(l)}</span>`).join("")}</div>` : ""}
    </div>`;

  const root = container.querySelector(".vz");
  const $ = (sel) => root.querySelector(sel);
  const stage = $(".vz-stage"), msg = $(".vz-msg"), scrub = $(".vz-scrub"), count = $(".vz-count");
  const codeLines = [...root.querySelectorAll(".vz-code li")];
  const form = $(".vz-form"), errEl = $(".vz-error"), toggle = $(".vz-edit-toggle");
  const playBtn = $('[data-act="play"]'), speedBtn = $(".vz-speed");

  function draw() {
    if (destroyed) return;
    const step = steps[idx];
    stage.innerHTML = spec.render(step, input);
    msg.textContent = step.msg || "";
    codeLines.forEach((li, i) => li.classList.toggle("is-current", Array.isArray(step.line) ? step.line.includes(i) : step.line === i));
    const cur = codeLines.find((li) => li.classList.contains("is-current"));
    if (cur) {
      const box = cur.parentElement;
      const top = cur.offsetTop - box.offsetTop;
      if (top < box.scrollTop || top + cur.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top - box.clientHeight / 3;
    }
    scrub.max = steps.length - 1;
    scrub.value = idx;
    scrub.style.setProperty("--p", steps.length > 1 ? (idx / (steps.length - 1)) * 100 + "%" : "100%");
    count.textContent = `${idx + 1}/${steps.length}`;
    scrub.setAttribute("aria-valuetext", `Step ${idx + 1} of ${steps.length}`);
    $('[data-act="prev"]').disabled = $('[data-act="first"]').disabled = idx === 0;
    $('[data-act="next"]').disabled = idx === steps.length - 1;
    root.classList.toggle("is-final", idx === steps.length - 1);
  }

  function go(i) { idx = Math.max(0, Math.min(steps.length - 1, i)); draw(); }
  function stop() {
    clearInterval(timer); timer = null;
    root.classList.remove("is-playing");
    playBtn.setAttribute("aria-label", "Play");
    msg.setAttribute("aria-live", "polite");
  }
  function play() {
    if (timer) return stop();
    if (idx >= steps.length - 1) go(0);
    root.classList.add("is-playing");
    playBtn.setAttribute("aria-label", "Pause");
    msg.setAttribute("aria-live", "off"); // don't flood screen readers while auto-playing
    timer = setInterval(() => {
      if (destroyed || !root.isConnected) return destroy();
      if (idx >= steps.length - 1) return stop();
      go(idx + 1);
    }, SPEEDS[speed][1]);
  }

  root.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "play") return play();
    stop();
    if (act === "first") go(0);
    if (act === "prev") go(idx - 1);
    if (act === "next") go(idx + 1);
  });
  scrub.addEventListener("input", () => { stop(); go(+scrub.value); });
  speedBtn.addEventListener("click", () => {
    speed = (speed + 1) % SPEEDS.length;
    speedBtn.textContent = SPEEDS[speed][0];
    if (timer) { stop(); play(); }
  });
  toggle.addEventListener("click", () => {
    const open = form.hidden;
    form.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) form.querySelector("input, textarea")?.focus();
  });

  function run(newValues) {
    try {
      const parsed = spec.parse(newValues);
      const s = spec.steps(parsed);
      stop();
      values = newValues; input = parsed; steps = s; idx = 0;
      errEl.textContent = "";
      form.classList.remove("has-error");
      draw();
      return true;
    } catch (err) {
      if (!(err instanceof InputError)) console.error(err);
      errEl.textContent = err instanceof InputError ? err.message : "That input couldn't be visualised.";
      form.classList.add("has-error");
      return false;
    }
  }
  const readForm = () => Object.fromEntries(spec.inputs.map((f) => [f.key, form.elements[f.key].value]));
  form.addEventListener("submit", (e) => { e.preventDefault(); run(readForm()); });
  form.addEventListener("keydown", (e) => {
    // Ctrl/Cmd+Enter runs from a textarea; Enter already submits from inputs.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(readForm()); }
  });
  root.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
    const p = spec.presets[+b.dataset.preset];
    const vals = { ...defaults, ...p.values };
    spec.inputs.forEach((f) => { form.elements[f.key].value = vals[f.key]; });
    run(vals);
  }));

  // Keyboard: arrows/space/home/end when focus is inside the player but not in a field.
  root.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === "ArrowRight") { stop(); go(idx + 1); }
    else if (k === "ArrowLeft") { stop(); go(idx - 1); }
    else if (k === "Home") { stop(); go(0); }
    else if (k === "End") { stop(); go(steps.length - 1); }
    else if (k === " " && !e.target.closest("button")) play();
    else return;
    e.preventDefault();
  });

  function destroy() { destroyed = true; stop(); }
  draw();
  return { destroy, root };
}
