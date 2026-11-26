// Guided solve: one attempt walked through five fixed steps, with a timer, a hint gate
// and a reflection note that must be written before the attempt can be saved.
import { PATTERNS, CATEGORIES, TIME_BUCKETS, CONSTRAINT_TABLE, patternById, problemBySlug, problemById, templateById, topicOfProblem, weekLabel, problemUrl, problemSite, solutionUrl } from "../data/index.js";
import { draft, saveDraft, clearDraft, saveSolve, addStudy, solvesOf, review, today, leech } from "../store.js";
import { OUTCOMES, OUTCOME_LABEL, OUTCOME_HELP, outcomeAllowed, outcomeFloor, LADDER } from "../domain/scheduler.js";
import { newDraft, mockRun, mockAdvance, mockContinue, endMock, guessRight } from "../solve-session.js";
import { ICON, esc, difficultyTag, codeBlock, wireCode, confirmDialog, toast, clock, dayLabel, dueLabel } from "../ui.js";

const STEPS = [
  { key: "restate", name: "Restate", title: "Restate the problem",
    help: "In your own words: what goes in, what comes out, and which edge cases matter (empty input, one element, duplicates, negatives)?",
    placeholder: "Given …, return …. Edge cases: …" },
  { key: "brute", name: "Brute force", title: "Find the brute force",
    help: "The simplest approach that is obviously correct, and what it costs. Don't optimise yet.",
    placeholder: "Try every … and check …. That is O(…) because …" },
  { key: "waste", name: "Wasted work", title: "Find the wasted work",
    help: "What does the brute force recompute, rescan or re-check? What would you need to remember, sort or skip to avoid it?",
    placeholder: "It rescans … for every …. If I kept …, each step would be O(1)." },
  { key: "code", name: "Code & trace", title: "Code it, then trace it",
    help: "Write the solution in the site's editor. Before you submit, trace one example by hand, line by line." },
  { key: "reflect", name: "Reflect", title: "Record the outcome and write the note",
    help: "The note is the part that makes the next problem easier. It can't be skipped." },
];
const THINK_ALOUD = [
  "Restated the problem and confirmed the inputs and output",
  "Asked about constraints and edge cases",
  "Gave a brute force and its cost first",
  "Explained the optimisation before coding",
  "Talked while coding",
  "Traced an example by hand",
  "Stated the final time and space complexity",
];
const SPACE_OPTIONS = ["O(1)", "O(log n)", "O(h)", "O(k)", "O(n)", "O(n·m)", "O(V + E)", "O(n²)"];
const HINTS = [
  { name: "Pattern", cap: "hinted" },
  { name: "Key insight", cap: "hinted" },
  { name: "Outside solution", cap: "solution" },
];
const MIN_CLUE = 15;
const MODE_LABEL = { learn: "New problem", review: "Re-solve", mock: "Mock interview" };
const normC = (s) => String(s || "").toLowerCase().replace(/\s+/g, "").replace(/\*/g, "·");

export function render(el, params) {
  const pr = problemBySlug.get(params.slug) || problemById.get(params.slug);
  if (!pr) {
    el.innerHTML = `<div class="page"><div class="empty"><h3>Problem not found</h3><a class="btn" href="#/">Back to Today</a></div></div>`;
    return;
  }
  let d = draft(pr.id) || newDraft(pr);
  if (!Array.isArray(d.checks)) d.checks = [];
  if (!d.note) d.note = { pattern: "", clue: "", insight: "", mistakes: "" };
  const topic = topicOfProblem.get(pr.id);
  const pat = patternById.get(pr.pattern);
  let saved = null;         // { attempt, before, after } once the outcome is recorded
  let running = true;
  let lastTick = Date.now();
  let unsaved = 0;          // seconds not yet written to the study log
  let dirtyTimer = null;

  const persist = () => { if (!saved) saveDraft(pr.id, d); };
  const persistSoon = () => { clearTimeout(dirtyTimer); dirtyTimer = setTimeout(persist, 500); };
  const flushStudy = () => { if (unsaved > 0) { addStudy(unsaved); unsaved = 0; } };

  /* ── Timer ── */
  const tick = () => {
    const now = Date.now();
    const delta = (now - lastTick) / 1000;
    lastTick = now;
    // A gap of several minutes means the laptop slept; don't count it.
    if (!running || saved || delta <= 0 || delta > 300) return;
    d.elapsed += delta;
    unsaved += delta;
    paintTimer();
    paintPrompt();
    if (unsaved >= 10) { flushStudy(); persist(); }
  };
  const interval = setInterval(tick, 1000);
  const onVisible = () => tick();
  document.addEventListener("visibilitychange", onVisible);

  function paintTimer() {
    const t = el.querySelector("[data-timer]");
    if (!t) return;
    const over = d.limit && d.elapsed > d.limit;
    t.textContent = d.limit ? (over ? "+" + clock(d.elapsed - d.limit) : clock(d.limit - d.elapsed)) : clock(d.elapsed);
    t.classList.toggle("is-over", !!over);
    t.classList.toggle("is-paused", !running);
    const b = el.querySelector("[data-pause]");
    if (b) {
      b.innerHTML = running ? ICON.pause : ICON.play;
      b.setAttribute("aria-label", running ? "Pause timer" : "Resume timer");
      b.title = running ? "Pause (t)" : "Resume (t)";
    }
  }
  function togglePause() {
    if (saved) return;
    tick();
    running = !running;
    lastTick = Date.now();
    paintTimer();
    if (!running) { flushStudy(); persist(); toast("Timer paused"); }
  }

  /* ── Shell ── */
  const tags = [difficultyTag(pr.difficulty), `<span class="tag">#${pr.number}</span>`,
    `<span class="tag tag-accent">${MODE_LABEL[d.mode]}</span>`,
    d.hidden ? `<span class="tag tag-outline">${ICON.lock.replace("<svg", '<svg width="12" height="12"')} Topic hidden</span>`
      : d.mode === "learn" && topic ? `<span class="tag tag-outline">${esc(weekLabel(topic))} · ${esc(topic.title)}</span>` : "",
    leech(pr.id) ? `<span class="tag tag-bad">Leech</span>` : ""].join("");

  el.innerHTML = `<div class="page">
    <div class="solve-bar">
      <button type="button" class="icon-btn" data-exit aria-label="Leave, keeping this attempt as a draft" title="Leave (your draft is saved)">${ICON.back}</button>
      <ol class="stepper" data-stepper aria-label="Steps"></ol>
      <div class="timer-box">
        <span class="timer" data-timer role="timer" aria-label="${d.limit ? "Time left" : "Time spent"}">0:00</span>
        <button type="button" class="icon-btn" data-pause></button>
      </div>
    </div>

    <article class="card problem" aria-labelledby="ptitle">
      <div class="problem-top">
        <div style="min-width:0">
          <h1 id="ptitle">${esc(pr.title)}</h1>
          <div class="tags">${tags}</div>
        </div>
        <a class="btn btn-sm" href="${problemUrl(pr)}" target="_blank" rel="noopener noreferrer">Open on ${problemSite(pr)} ${ICON.external}</a>
      </div>
      <p class="problem-statement">${esc(pr.statement)}</p>
      ${pr.examples?.length ? `<div class="examples">${pr.examples.map((x) =>
        `<div class="example"><span>Input:</span> ${esc(x.input)}<br><span>Output:</span> ${esc(x.output)}</div>`).join("")}</div>` : ""}
      ${pr.constraints?.length ? `<ul class="constraints" aria-label="Constraints">${pr.constraints.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
    </article>

    <div data-prompt aria-live="polite"></div>
    <div data-body></div>
  </div>`;

  /* ── Stepper ── */
  function paintStepper() {
    el.querySelector("[data-stepper]").innerHTML = STEPS.map((s, i) => `
      <li><button type="button" class="step-pill ${i === d.step ? "is-current" : i < d.step ? "is-done" : ""}" data-goto="${i}" ${i === d.step ? 'aria-current="step"' : ""}>
        <i>${i < d.step ? ICON.check : i + 1}</i><span>${s.name}</span></button></li>`).join("");
    // On a phone the row scrolls sideways; keep the current step in view.
    const bar = el.querySelector("[data-stepper]"), cur = bar.querySelector(".is-current");
    if (cur) bar.scrollLeft = cur.offsetLeft - bar.offsetLeft - 44;
  }

  /* ── 25 / 40 minute prompts and the mock countdown ── */
  function paintPrompt() {
    const host = el.querySelector("[data-prompt]");
    if (!host || saved) { if (host) host.innerHTML = ""; return; }
    let key = "", html = "";
    if (d.limit) {
      if (d.elapsed >= d.limit) { key = "over"; html = `<div class="prompt is-bad">${ICON.alert}<div><b>Time's up.</b> Finish your thought, then record the outcome as it really went.</div></div>`; }
    } else if (d.elapsed >= 40 * 60 && d.hint < 3 && !d.seen40) {
      key = "40";
      html = `<div class="prompt">${ICON.alert}<div><b>40 minutes in.</b> Read a solution now, then close it and write the code yourself. That still teaches you the pattern.</div>
        <span class="btn-row"><button type="button" class="btn btn-sm" data-hint-to="3">Read the solution</button><button type="button" class="btn btn-ghost btn-sm" data-dismiss="seen40">Keep going</button></span></div>`;
    } else if (d.elapsed >= 25 * 60 && d.hint < 2 && !d.seen25) {
      key = "25";
      html = `<div class="prompt">${ICON.bulb}<div><b>Stuck?</b> Reveal the idea only, not the code.</div>
        <span class="btn-row"><button type="button" class="btn btn-sm" data-hint-to="2">Reveal the idea</button><button type="button" class="btn btn-ghost btn-sm" data-dismiss="seen25">Not yet</button></span></div>`;
    }
    if (host.dataset.key !== key) { host.dataset.key = key; host.innerHTML = html; }
  }

  /* ── Hint gate ── */
  function hintBody(level) {
    if (level === 1) return `<p><strong>${esc(pat.name)}</strong></p><p class="muted">${esc(pat.question)}</p>`;
    if (level === 2) return `<p>${esc(pr.insight)}</p>`;
    return `<p>Read one solution, close it, then write the code from memory.</p>
      <div class="btn-row" style="margin-top:10px"><a class="btn btn-sm" href="${solutionUrl(pr)}" target="_blank" rel="noopener noreferrer">Solutions on ${problemSite(pr)} ${ICON.external}</a></div>
      <details class="walk"><summary>Walkthrough of the idea</summary><ol class="steps-list">${pr.explanation.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></details>`;
  }
  function hintsCard() {
    return `<section class="card" aria-label="Hints">
      <div class="card-head"><span class="card-title">Hints</span><span class="faint" style="font-size:12.5px">${d.hint ? `${d.hint} of 3 used` : "None used"}</span></div>
      <div class="hintrows">${HINTS.map((h, i) => {
        const level = i + 1;
        if (level <= d.hint) return `<div class="hintrow is-open"><div class="hint-k">${level} · ${h.name}</div><div class="hint-v">${hintBody(level)}</div></div>`;
        const next = level === d.hint + 1;
        return `<div class="hintrow"><div class="hint-k">${level} · ${h.name}</div>
          <div class="hint-v">${next
            ? `<button type="button" class="btn btn-sm" data-hint>${ICON.eye} Reveal <kbd class="hint">h</kbd></button>
               <span class="faint" style="font-size:12.5px">Caps this attempt at “${OUTCOME_LABEL[h.cap]}”.</span>`
            : `<span class="faint" style="font-size:13px">${ICON.lock.replace("<svg", '<svg width="13" height="13" style="vertical-align:-2px"')} Locked until hint ${level - 1} is revealed</span>`}</div></div>`;
      }).join("")}</div>
    </section>`;
  }
  async function revealHint(upTo) {
    if (saved || d.hint >= 3) return;
    const target = Math.min(3, upTo || d.hint + 1);
    if (target <= d.hint) return;
    const h = HINTS[target - 1];
    const ok = await confirmDialog({
      title: target === 3 ? "Open the solution?" : `Reveal hint ${target}: ${h.name.toLowerCase()}?`,
      body: `The best this attempt can then be recorded as is “${OUTCOME_LABEL[h.cap]}”, and the problem will come back sooner.`,
      confirm: "Reveal",
    });
    if (!ok) return;
    d.hint = target;
    if (d.outcome && !outcomeAllowed(d.outcome, d.hint)) d.outcome = "";
    persist();
    paintBody();
    paintPrompt();
  }

  /* ── Step bodies ── */
  const field = (key, label, value, { rows = 4, placeholder = "", hint = "" } = {}) => `
    <label class="field"><span class="field-label">${label}</span>
      <textarea rows="${rows}" data-field="${key}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>
      ${hint ? `<span class="field-hint" data-hint-for="${key}">${hint}</span>` : ""}</label>`;

  function stepBody() {
    const s = STEPS[d.step];
    const head = `<div class="step-head"><div class="eyebrow">Step ${d.step + 1} of ${STEPS.length}</div><h2 tabindex="-1" data-step-title>${s.title}</h2><p>${s.help}</p></div>`;
    if (s.key === "restate" || s.key === "brute") return head + field(s.key, "Your " + (s.key === "restate" ? "restatement" : "brute force"), d[s.key], { rows: 5, placeholder: s.placeholder });
    if (s.key === "waste") {
      return head + field("waste", "The wasted work, and what removes it", d.waste, { rows: 5, placeholder: s.placeholder }) + `
        <details class="walk"><summary>What do the constraints allow?</summary>
          <div class="table-wrap"><table class="ref"><thead><tr><th>Input size</th><th>Time you can afford</th><th>Likely approach</th></tr></thead>
          <tbody>${CONSTRAINT_TABLE.map((r) => `<tr><td class="mono">${esc(r.size)}</td><td class="mono">${esc(r.time)}</td><td>${esc(r.approach)}</td></tr>`).join("")}</tbody></table></div>
        </details>`;
    }
    if (s.key === "code") {
      return head + `
        <div class="btn-row" style="margin-bottom:20px"><a class="btn" href="${problemUrl(pr)}" target="_blank" rel="noopener noreferrer">Open on ${problemSite(pr)} ${ICON.external}</a></div>
        <div class="q" role="group" aria-labelledby="q-time">
          <div class="q-head"><div id="q-time"><span class="q-title">What is your solution's time complexity?</span></div><span class="q-help">Checked against the expected answer after you save</span></div>
          <div class="opts opts-tight">${TIME_BUCKETS.map((t) => `<button type="button" class="opt opt-radio opt-mono" data-time="${esc(t)}" aria-pressed="${d.time === t}"><span class="opt-check">${ICON.check}</span><span>${esc(t)}</span></button>`).join("")}</div>
        </div>
        <label class="field" style="margin-top:20px;max-width:260px"><span class="field-label">Extra space</span>
          <input type="text" data-field="space" list="space-opts" value="${esc(d.space)}" placeholder="e.g. O(n)" autocomplete="off">
          <datalist id="space-opts">${SPACE_OPTIONS.map((o) => `<option value="${o}">`).join("")}</datalist></label>`;
    }
    return head + reflectBody();
  }

  function missing() {
    const m = [];
    if (!d.outcome) m.push("an outcome");
    if (!d.note.pattern) m.push(d.hidden && d.hint < 1 ? "your pattern guess" : "the pattern");
    if (d.note.clue.trim().length < MIN_CLUE) m.push(`the clue (${MIN_CLUE}+ characters)`);
    if (!d.note.insight.trim()) m.push("the key insight");
    if (!d.time) m.push("your time complexity (step 4)");
    return m;
  }

  function reflectBody() {
    const guessing = d.hidden && d.hint < 1;
    return `
      <div class="q" role="group" aria-labelledby="q-out">
        <div class="q-head"><div id="q-out"><span class="q-title">How did it go?</span></div><span class="q-help">${d.hint ? `Hints used, so the best outcome is “${OUTCOME_LABEL[outcomeFloor(d.hint)]}”` : "Be honest: this sets when it comes back"}</span></div>
        <div class="opts outcome-opts">${OUTCOMES.map((o) => `
          <button type="button" class="opt opt-radio outcome-${o}" data-outcome="${o}" aria-pressed="${d.outcome === o}" ${outcomeAllowed(o, d.hint) ? "" : "disabled"}>
            <span class="opt-check">${ICON.check}</span><span><b>${OUTCOME_LABEL[o]}</b><small>${OUTCOME_HELP[o]}</small></span></button>`).join("")}</div>
      </div>

      <div class="note-form">
        <label class="field"><span class="field-label">${guessing ? "Your pattern guess" : "Pattern it used"}</span>
          <select data-field="note.pattern">
            <option value="">${guessing ? "Pick before the reveal…" : "Choose a pattern…"}</option>
            ${CATEGORIES.map((c) => `<optgroup label="${esc(c)}">${PATTERNS.filter((p) => p.category === c).map((p) =>
              `<option value="${p.id}" ${d.note.pattern === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</optgroup>`).join("")}
          </select>
          ${guessing ? `<span class="field-hint">The real pattern is shown after you record the outcome.</span>` : ""}</label>
        ${field("note.clue", "The clue", d.note.clue, { rows: 3, placeholder: "Which words or constraints in the statement should have pointed to this pattern?", hint: clueHint() })}
        ${field("note.insight", "The key insight", d.note.insight, { rows: 3, placeholder: "The one idea that makes it work, in a sentence you'd understand in a month." })}
        ${field("note.mistakes", "Mistakes to avoid next time (optional)", d.note.mistakes, { rows: 2, placeholder: "Off-by-one on the right pointer, forgot the empty case, …" })}
      </div>`;
  }
  const clueHint = () => {
    const n = d.note.clue.trim().length;
    return n >= MIN_CLUE ? "Good. Specific clues are the ones you'll recognise again." : `${n} / ${MIN_CLUE} characters minimum`;
  };

  function paintActions() {
    const bar = el.querySelector("[data-actions]");
    if (!bar) return;
    const last = d.step === STEPS.length - 1;
    const miss = last ? missing() : [];
    bar.innerHTML = `
      ${d.step > 0 ? `<button type="button" class="btn btn-ghost" data-goto="${d.step - 1}">${ICON.back} Back</button>` : `<button type="button" class="btn btn-ghost" data-discard>Discard attempt</button>`}
      <span class="actionbar-note" data-missing>${miss.length ? "Still needed: " + esc(miss.join(", ")) + "." : ""}</span>
      ${last
        ? `<button type="button" class="btn btn-primary btn-lg" data-save ${miss.length ? "disabled" : ""}>Record outcome</button>`
        : `<button type="button" class="btn btn-primary btn-lg" data-goto="${d.step + 1}">Next: ${STEPS[d.step + 1].name} <kbd class="hint">n</kbd></button>`}`;
  }

  function paintBody(focus = false) {
    if (saved) return;
    paintStepper();
    el.querySelector("[data-body]").innerHTML = `
      <section class="card step-card">${stepBody()}
        <div class="actionbar" data-actions></div>
      </section>
      ${d.mode === "mock" ? `<section class="card" aria-label="Think-aloud checklist">
        <div class="card-head"><span class="card-title">Think aloud</span><span class="faint" style="font-size:12.5px">Say each of these out loud</span></div>
        <div class="checklist">${THINK_ALOUD.map((t, i) => `<label><input type="checkbox" data-check="${i}" ${d.checks[i] ? "checked" : ""}><span>${t}</span></label>`).join("")}</div>
      </section>` : ""}
      ${hintsCard()}`;
    paintActions();
    document.body.classList.add("has-actionbar");
    if (focus) el.querySelector("[data-step-title]")?.focus({ preventScroll: true });
  }

  function goto(step) {
    if (saved) return;
    d.step = Math.max(0, Math.min(STEPS.length - 1, step));
    persist();
    paintBody(true);
    el.querySelector(".step-card").scrollIntoView({ block: "nearest", behavior: "auto" });
  }

  /* ── Saving and the result screen ── */
  function save() {
    if (missing().length) return;
    tick();
    flushStudy();
    clearTimeout(dirtyTimer);
    const guess = d.hidden && d.hint < 1 ? d.note.pattern : null;
    const previous = solvesOf(pr.id).slice(-1)[0] || null;
    saved = saveSolve({ ...d, dur: d.elapsed, guess });
    saved.previous = previous;
    running = false;
    paintResult();
  }

  const noteCard = (title, a) => `<div class="note-card">
    <div class="note-card-head"><b>${title}</b><span class="tag outcome-tag-${a.outcome}">${OUTCOME_LABEL[a.outcome]}</span></div>
    <dl><dt>Pattern</dt><dd>${esc(patternById.get(a.note.pattern)?.name || "—")}</dd>
      <dt>Clue</dt><dd>${esc(a.note.clue)}</dd><dt>Insight</dt><dd>${esc(a.note.insight)}</dd>
      ${a.note.mistakes ? `<dt>Mistakes</dt><dd>${esc(a.note.mistakes)}</dd>` : ""}</dl></div>`;

  function paintResult() {
    const { attempt: a, after, previous } = saved;
    const t = today();
    const good = a.outcome === "clean";
    const timeOk = a.time === pr.time;
    const spaceOk = a.space ? normC(pr.space).startsWith(normC(a.space)) : null;
    const notedRight = guessRight(pr, a.note.pattern);
    const tpl = templateById.get(pr.template) || pat.templates[0];
    const run = a.mode === "mock" ? mockRun() : null;
    const next = run ? mockAdvance({ p: pr.id, outcome: a.outcome, dur: a.dur, guess: a.guess }) : null;
    const runNow = run ? mockRun() : null;
    const dueText = after.mastered ? "Mastered. It leaves the re-solve queue."
      : `Comes back ${dueLabel(after.due, t)} (${dayLabel(after.due)}), rung ${after.stage + 1} of ${LADDER.length}.`;

    el.querySelector("[data-prompt]").innerHTML = "";
    paintStepper();
    el.querySelectorAll("[data-goto]").forEach((b) => { b.disabled = true; });
    paintTimer();
    document.body.classList.remove("has-actionbar");
    el.querySelector("[data-body]").innerHTML = `
      <section class="verdict ${good ? "good" : a.outcome === "hinted" ? "" : "bad"}" aria-live="polite">
        <span class="verdict-icon">${good ? ICON.check : a.outcome === "hinted" ? ICON.bulb : ICON.x}</span>
        <div><h2 tabindex="-1" data-verdict>${OUTCOME_LABEL[a.outcome]} in ${clock(a.dur)}</h2><p>${dueText}</p></div>
      </section>
      ${leech(pr.id) ? `<div class="prompt is-bad" style="margin-top:14px">${ICON.alert}<div><b>This one keeps slipping.</b> It has lapsed ${after.lapses} times. Reread the primer for its pattern before the next attempt.</div>
        ${topic ? `<a class="btn btn-sm" href="#/curriculum/${topic.id}">Open the primer</a>` : `<a class="btn btn-sm" href="#/patterns/${pat.id}">${esc(pat.name)} guide</a>`}</div>` : ""}

      <section class="card" style="margin-top:14px">
        <div class="card-head"><span class="card-title">Answer key</span></div>
        <div class="grade-list">
          <div class="grade"><div class="grade-k"><i class="${notedRight ? "good" : "bad"}"></i>Pattern</div><div class="grade-v">
            <p><strong>${esc(pat.name)}</strong>${(pr.alsoAccept || []).length ? ` <span class="faint">(also fine: ${esc(pr.alsoAccept.map((id) => patternById.get(id)?.name).filter(Boolean).join(", "))})</span>` : ""}</p>
            ${a.guess ? `<p>Your guess before the reveal: <strong>${esc(patternById.get(a.guess).name)}</strong>${notedRight ? "." : ". Add what should have tipped you off to your note next time."}</p>`
              : !notedRight ? `<p>Your note says ${esc(patternById.get(a.note.pattern)?.name || "—")}.</p>` : ""}</div></div>
          <div class="grade"><div class="grade-k"><i class="${timeOk ? "good" : "bad"}"></i>Time</div><div class="grade-v">
            <p>Expected <strong class="mono">${esc(pr.timeExact || pr.time)}</strong> · you said <span class="mono">${esc(a.time)}</span></p></div></div>
          <div class="grade"><div class="grade-k"><i class="${spaceOk == null ? "" : spaceOk ? "good" : "part"}"></i>Space</div><div class="grade-v">
            <p>Expected <strong class="mono">${esc(pr.space)}</strong>${a.space ? ` · you said <span class="mono">${esc(a.space)}</span>` : " · not stated"}</p></div></div>
          <div class="grade"><div class="grade-k"><i></i>Signals</div><div class="grade-v">
            <p>${pr.clues.map((x) => `<strong>${esc(x)}</strong>`).join(", ")}</p></div></div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><span class="card-title">${previous ? "Your notes, then and now" : "Your note"}</span><a class="btn btn-ghost btn-sm" href="#/notes">All notes ${ICON.arrow}</a></div>
        <div class="note-pair">${previous ? noteCard(dayLabel(previous.day), previous) : ""}${noteCard(previous ? "Today" : dayLabel(a.day), a)}</div>
      </section>

      <section class="card">
        <div class="insight"><b>Key insight</b>${esc(pr.insight)}</div>
        <details class="walk"><summary>Walkthrough and template</summary>
          <ol class="steps-list">${pr.explanation.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
          <div style="margin-top:14px">${codeBlock(tpl)}</div>
          <div class="btn-row" style="margin-top:12px"><a class="btn btn-ghost btn-sm" href="#/patterns/${pat.id}">${esc(pat.name)} guide ${ICON.arrow}</a></div>
        </details>
      </section>

      <div class="actionbar">
        <a class="btn btn-ghost" href="${problemUrl(pr)}" target="_blank" rel="noopener noreferrer">Open on ${problemSite(pr)} ${ICON.external}</a>
        ${next ? `<button type="button" class="btn btn-primary btn-lg" data-mock-next="${next.id}">Next problem (${runNow.index + 1} of ${runNow.queue.length}) ${ICON.arrow}</button>`
          : run ? `<a class="btn btn-primary btn-lg" href="#/mock" data-primary>See mock results</a>`
          : `<a class="btn btn-primary btn-lg" href="#/" data-primary>Back to Today</a>`}
      </div>`;
    wireCode(el, templateById);
    const v = el.querySelector("[data-verdict]");
    v.closest(".verdict").scrollIntoView({ block: "start", behavior: "auto" });
    v.focus({ preventScroll: true });
  }

  /* ── Events ── */
  function setField(key, value) {
    if (key.startsWith("note.")) d.note[key.slice(5)] = value; else d[key] = value;
    persistSoon();
    if (key === "note.clue") {
      const h = el.querySelector('[data-hint-for="note.clue"]');
      if (h) h.textContent = clueHint();
    }
    if (d.step === STEPS.length - 1) {
      const miss = missing();
      const b = el.querySelector("[data-save]");
      if (b) b.disabled = !!miss.length;
      const m = el.querySelector("[data-missing]");
      if (m) m.textContent = miss.length ? "Still needed: " + miss.join(", ") + "." : "";
    }
  }
  el.addEventListener("input", (e) => {
    const f = e.target.dataset.field;
    if (f) setField(f, e.target.value);
  });
  el.addEventListener("change", (e) => {
    const c = e.target.dataset.check;
    if (c != null) { d.checks[+c] = e.target.checked; persist(); }
  });
  el.addEventListener("click", async (e) => {
    const t = e.target;
    const g = t.closest("[data-goto]");
    if (g && !g.disabled) return goto(+g.dataset.goto);
    if (t.closest("[data-pause]")) return togglePause();
    if (t.closest("[data-hint]")) return revealHint();
    const to = t.closest("[data-hint-to]");
    if (to) return revealHint(+to.dataset.hintTo);
    const dis = t.closest("[data-dismiss]");
    if (dis) { d[dis.dataset.dismiss] = true; persist(); return paintPrompt(); }
    const tm = t.closest("[data-time]");
    if (tm) {
      d.time = d.time === tm.dataset.time ? "" : tm.dataset.time;
      el.querySelectorAll("[data-time]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.time === d.time)));
      return persist();
    }
    const oc = t.closest("[data-outcome]");
    if (oc && !oc.disabled) {
      d.outcome = oc.dataset.outcome;
      el.querySelectorAll("[data-outcome]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.outcome === d.outcome)));
      persist();
      return paintActions();
    }
    if (t.closest("[data-save]")) return save();
    const mn = t.closest("[data-mock-next]");
    if (mn) return mockContinue(problemById.get(mn.dataset.mockNext));
    if (t.closest("[data-discard]")) {
      if (await confirmDialog({ title: "Discard this attempt?", body: "Nothing from it is saved and the problem stays where it was in your plan.", confirm: "Discard", danger: true })) {
        saved = { discarded: true };
        clearTimeout(dirtyTimer);
        flushStudy();
        clearDraft(pr.id);
        if (d.mode === "mock") endMock();
        location.hash = "#/";
      }
      return;
    }
    if (t.closest("[data-exit]")) {
      if (!saved) toast("Draft saved. Pick it up from Today.");
      location.hash = d.mode === "mock" && saved ? "#/mock" : "#/";
    }
  });
  const onKey = (e) => {
    if (saved || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.("input, textarea, select, dialog") || document.querySelector("dialog[open]")) return;
    const k = e.key.toLowerCase();
    if (k === "n" && d.step < STEPS.length - 1) { e.preventDefault(); goto(d.step + 1); }
    else if (k === "h") { e.preventDefault(); revealHint(); }
    else if (k === "t") { e.preventDefault(); togglePause(); }
  };
  document.addEventListener("keydown", onKey);

  paintBody();
  paintTimer();
  paintPrompt();

  return () => {
    clearInterval(interval);
    clearTimeout(dirtyTimer);
    document.removeEventListener("visibilitychange", onVisible);
    document.removeEventListener("keydown", onKey);
    document.body.classList.remove("has-actionbar");
    // Keep the draft, unless the page was only glanced at.
    if (!saved) { tick(); flushStudy(); if (draft(pr.id) || d.elapsed >= 10) persist(); }
  };
}
