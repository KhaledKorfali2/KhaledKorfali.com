import { PATTERNS, PROBLEMS, CATEGORIES, DATA_STRUCTURES, TIME_BUCKETS, patternById, problemById, templateById, acceptedPatterns, leetcodeUrl } from "../data/index.js";
import { settings, record, card, INTERVALS } from "../store.js";
import { getSession, endSession, singleSession, currentProblem, submitResult, advance, retrySession } from "../session.js";
import { ICON, esc, difficultyTag, codeBlock, wireCode, shuffle, confirmDialog } from "../ui.js";
import { loadViz } from "../viz/index.js";
import { mountViz } from "../viz/player.js";

const LIST_LABEL = { blind75: "Blind 75", neetcode150: "NeetCode 150" };
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

// Real signals for this problem plus plausible ones borrowed from problems that need a different pattern.
function signalOptions(pr) {
  const truth = pr.clues.slice(0, 4);
  const accepted = new Set(acceptedPatterns(pr));
  const taken = new Set(truth.map(norm));
  const truthWords = new Set(truth.flatMap((c) => norm(c).split(" ").filter((w) => w.length > 3)));
  const pool = shuffle(PROBLEMS.filter((p) => !accepted.has(p.pattern)).flatMap((p) => p.clues));
  const decoys = [];
  for (const c of pool) {
    const n = norm(c);
    if (taken.has(n) || n.length < 4 || n.length > 34) continue;
    // Size/constraint phrases ("n up to 10⁵") could be true of any problem, so never use them as decoys.
    if (/\d|[⁰-⁹]|input size|up to|constraint/i.test(c)) continue;
    // Skip decoys that share a meaningful word with a real signal; they'd be ambiguous.
    if (n.split(" ").some((w) => truthWords.has(w))) continue;
    taken.add(n);
    decoys.push(c);
    if (truth.length + decoys.length >= 6) break;
  }
  return shuffle([...truth.map((t) => ({ text: t, real: true })), ...decoys.map((t) => ({ text: t, real: false }))]);
}

export function render(el, params) {
  let session = params.problem ? singleSession(params.problem) : getSession();
  if (!session) { location.replace("#/"); return; }

  let viz = null;         // mounted visualiser handle
  let state = null;       // answers for the current problem
  const onKey = (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest("input, textarea, select, dialog, .vz")) return;
    // Enter checks / advances even when focus sits on an answer option (Space still toggles it).
    if (e.key === "Enter" && (!e.target.closest("button, a") || e.target.closest(".opt"))) {
      const btn = el.querySelector("[data-primary]");
      if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
    }
  };
  document.addEventListener("keydown", onKey);

  function destroyViz() { if (viz) { viz.destroy(); viz = null; } }

  function show() {
    destroyViz();
    const pr = currentProblem();
    if (!pr) return summary();
    const s = settings();
    state = {
      pr, graded: false, start: Date.now(), titleShown: !s.hideTitles || session.single,
      ask: { signals: s.askSignals, ds: s.askStructures, time: s.askTime },
      signals: s.askSignals ? signalOptions(pr) : [],
      pick: { signals: new Set(), pattern: null, ds: new Set(), time: null },
    };
    const total = session.queue.length;
    const pos = session.index + 1;
    // Missed problems are appended after the original set; count them as a separate retry phase.
    const isRetry = session.index >= session.base;
    const counter = isRetry ? `Retry ${session.index - session.base + 1} / ${total - session.base}` : `${pos} / ${session.base}`;
    let n = 0;
    const qNum = () => String(++n).padStart(2, "0");

    el.innerHTML = `<div class="page">
      <div class="drill-bar">
        <button type="button" class="icon-btn" data-exit aria-label="${session.single ? "Back to problems" : "End session"}" title="${session.single ? "Back to problems" : "End session"}">${session.single ? ICON.back : ICON.close}</button>
        ${session.single ? `<span class="drill-count">Single problem</span><span style="flex:1"></span>` : `
        <div class="meter" role="progressbar" aria-label="Session progress" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${pos - 1}"><i style="width:${((pos - 1) / total) * 100}%"></i></div>
        <span class="drill-count">${counter}</span>`}
      </div>

      <article class="card problem" aria-labelledby="ptitle">
        <div class="problem-top">
          <div style="min-width:0">
            ${isRetry ? `<div class="eyebrow" style="margin-bottom:8px">Second chance</div>` : ""}
            <h1 id="ptitle">${state.titleShown ? esc(pr.title)
              : `<button type="button" class="title-hidden" data-reveal-title style="all:unset;cursor:pointer" aria-label="Title hidden. Reveal title"><span class="title-hidden">${esc(pr.title)}</span></button>`}</h1>
            <div class="tags">${difficultyTag(pr.difficulty)}<span class="tag">#${pr.number}</span></div>
          </div>
        </div>
        <p class="problem-statement">${esc(pr.statement)}</p>
        ${pr.examples?.length ? `<div class="examples">${pr.examples.map((x) =>
          `<div class="example"><span>Input:</span> ${esc(x.input)}<br><span>Output:</span> ${esc(x.output)}</div>`).join("")}</div>` : ""}
        ${pr.constraints?.length ? `<ul class="constraints" aria-label="Constraints">${pr.constraints.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
      </article>

      <section class="card" aria-label="Your answer" data-quiz>
        ${state.ask.signals ? `
        <div class="q" data-q="signals" role="group" aria-labelledby="q-sig">
          <div class="q-head"><div id="q-sig"><span class="q-num">${qNum()}</span><span class="q-title">Which of these are signals in this problem?</span></div><span class="q-help">Select all that apply</span></div>
          <div class="opts">${state.signals.map((o, i) => opt("signals", i, o.text, false)).join("")}</div>
        </div>` : ""}

        <div class="q" data-q="pattern" role="group" aria-labelledby="q-pat" ${state.ask.signals ? 'style="margin-top:26px"' : ""}>
          <div class="q-head"><div id="q-pat"><span class="q-num">${qNum()}</span><span class="q-title">Which pattern solves it best?</span></div><span class="q-help">Pick one</span></div>
          ${CATEGORIES.map((cat) => `<div class="opts-group"><div class="opts-group-label">${esc(cat)}</div>
            <div class="opts">${PATTERNS.filter((p) => p.category === cat).map((p) => opt("pattern", p.id, p.name, true)).join("")}</div></div>`).join("")}
        </div>

        ${state.ask.ds ? `
        <div class="q" data-q="ds" role="group" aria-labelledby="q-ds" style="margin-top:26px">
          <div class="q-head"><div id="q-ds"><span class="q-num">${qNum()}</span><span class="q-title">Which data structures does the optimal solution use?</span></div><span class="q-help">Select all that apply, or none</span></div>
          <div class="opts opts-tight">${DATA_STRUCTURES.map((d) => opt("ds", d, d, false)).join("")}</div>
        </div>` : ""}

        ${state.ask.time ? `
        <div class="q" data-q="time" role="group" aria-labelledby="q-time" style="margin-top:26px">
          <div class="q-head"><div id="q-time"><span class="q-num">${qNum()}</span><span class="q-title">Target time complexity?</span></div><span class="q-help">Pick one</span></div>
          <div class="opts opts-tight">${TIME_BUCKETS.map((t) => opt("time", t, t, true, "opt-mono")).join("")}</div>
        </div>` : ""}

        <div class="actionbar" data-actions>
          <button type="button" class="btn btn-ghost" data-giveup>Show answer</button>
          <button type="button" class="btn btn-primary btn-lg" data-primary data-check disabled>Check <kbd class="hint">Enter</kbd></button>
        </div>
      </section>
      <div data-result></div>
    </div>`;
    document.body.classList.add("has-actionbar");
    el.querySelector("[data-check]").title = "Pick a pattern first";
  }

  function opt(group, value, label, single, extra = "") {
    return `<button type="button" class="opt ${single ? "opt-radio" : ""} ${extra}" data-group="${group}" data-value="${esc(value)}" aria-pressed="false">
      <span class="opt-check">${ICON.check}</span><span>${esc(label)}</span><span class="opt-note"></span></button>`;
  }

  function onPick(btn) {
    if (state.graded) return;
    const { group, value } = btn.dataset;
    const p = state.pick;
    if (group === "pattern" || group === "time") {
      p[group] = p[group] === value ? null : value;
      el.querySelectorAll(`[data-group="${group}"]`).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === p[group])));
    } else {
      const set = p[group];
      const key = group === "signals" ? +value : value;
      set.has(key) ? set.delete(key) : set.add(key);
      btn.setAttribute("aria-pressed", String(set.has(key)));
    }
    const check = el.querySelector("[data-check]");
    check.disabled = !p.pattern;
    check.title = p.pattern ? "" : "Pick a pattern first";
  }

  function grade(gaveUp = false) {
    const { pr, pick, ask } = state;
    state.graded = true;
    const accepted = acceptedPatterns(pr);
    const patternOk = !gaveUp && accepted.includes(pick.pattern);

    // signals
    let sig = null;
    if (ask.signals) {
      const real = state.signals.filter((o) => o.real).length;
      const hits = [...pick.signals].filter((i) => state.signals[i].real).length;
      const falseAlarms = pick.signals.size - hits;
      sig = { hits, real, falseAlarms, score: gaveUp ? 0 : Math.max(0, (hits - falseAlarms) / real) };
    }
    // data structures
    let ds = null;
    if (ask.ds) {
      const need = new Set(pr.dataStructures);
      const got = pick.ds;
      const inter = [...got].filter((d) => need.has(d)).length;
      const union = new Set([...need, ...got]).size;
      // union is 0 when the problem needs no extra structure and none were picked: that's fully right.
      ds = { score: gaveUp ? 0 : union ? inter / union : 1, exact: !gaveUp && inter === need.size && got.size === need.size };
    }
    const timeOk = ask.time ? !gaveUp && pick.time === pr.time : null;

    const result = { id: pr.id, ok: patternOk, pick: gaveUp ? null : pick.pattern };
    record({ p: pr.id, pat: pr.pattern, pick: result.pick, ok: patternOk, sig: sig ? +sig.score.toFixed(2) : null, ds: ds ? +ds.score.toFixed(2) : null, tc: timeOk, ms: Date.now() - state.start, gaveUp });
    submitResult(result);

    paintOptions(accepted, gaveUp);
    paintResult({ patternOk, sig, ds, timeOk, gaveUp });
  }

  function paintOptions(accepted, gaveUp) {
    const { pr, pick } = state;
    el.querySelectorAll("[data-quiz] .opt").forEach((b) => {
      b.disabled = true;
      const { group, value } = b.dataset;
      let right = false, chosen = false;
      if (group === "pattern") { right = accepted.includes(value); chosen = pick.pattern === value; }
      if (group === "time") { right = pr.time === value; chosen = pick.time === value; }
      if (group === "ds") { right = pr.dataStructures.includes(value); chosen = pick.ds.has(value); }
      if (group === "signals") { right = state.signals[+value].real; chosen = pick.signals.has(+value); }
      const note = b.querySelector(".opt-note");
      if (chosen && right) { b.classList.add("is-right"); note.textContent = "✓"; }
      else if (chosen && !right) {
        b.classList.add("is-wrong");
        b.querySelector(".opt-check").innerHTML = ICON.x;
        note.textContent = group === "signals" ? "decoy" : "";
      }
      else if (right) { b.classList.add("is-missed"); note.textContent = group === "pattern" && value !== pr.pattern ? "also ok" : gaveUp ? "answer" : "missed"; }
      b.setAttribute("aria-pressed", String(chosen));
    });
    el.querySelector("[data-quiz]").classList.add("is-graded");
  }

  function paintResult({ patternOk, sig, ds, timeOk, gaveUp }) {
    const { pr, pick } = state;
    const pat = patternById.get(pr.pattern);
    const picked = pick.pattern ? patternById.get(pick.pattern) : null;
    const others = (pr.alsoAccept || []).map((id) => patternById.get(id)?.name).filter(Boolean);
    const c = card(pr.id);
    const nextIn = c ? INTERVALS[c.box] : 1;
    const last = !session.single && session.index + 1 >= session.queue.length;

    let whyNot = "";
    if (picked && !patternOk) {
      const specific = (pr.confusions || []).find((x) => x.pattern === picked.id);
      const rel = (picked.related || []).find((r) => r.id === pr.pattern) || (pat.related || []).find((r) => r.id === picked.id);
      whyNot = `<div class="confusion"><b>Why not ${esc(picked.name)}?</b> ${esc(specific ? specific.why : rel ? rel.how : `${picked.name} doesn't fit the signals here. ${pat.question}`)}</div>`;
    }
    const otherConfusions = (pr.confusions || []).filter((x) => x.pattern !== pick.pattern && patternById.has(x.pattern));
    const tpl = templateById.get(pr.template) || pat.templates[0];

    const grades = [];
    grades.push(gradeRow(patternOk ? "good" : "bad", "Pattern",
      `<p><strong>${esc(pat.name)}</strong>${others.length ? ` <span class="faint">(also accepted: ${esc(others.join(", "))})</span>` : ""}</p>
       ${!patternOk && picked ? `<p>You picked ${esc(picked.name)}.</p>` : ""}`));
    if (sig) grades.push(gradeRow(sig.score >= 0.99 ? "good" : sig.score > 0 ? "part" : "bad", "Signals",
      `<p>${gaveUp ? "" : `Found ${sig.hits} of ${sig.real}${sig.falseAlarms ? `, ${sig.falseAlarms} false alarm${sig.falseAlarms > 1 ? "s" : ""}` : ""}. `}The real signals: ${pr.clues.map((x) => `<strong>${esc(x)}</strong>`).join(", ")}.</p>`));
    if (ds) grades.push(gradeRow(ds.exact ? "good" : ds.score > 0 ? "part" : "bad", "Data structures",
      `<p><strong>${pr.dataStructures.length ? esc(pr.dataStructures.join(", ")) : "None needed"}</strong>${pr.dataStructures.length ? "" : " <span class=\"faint\">(just integer arithmetic / bit operations)</span>"}</p>`));
    grades.push(gradeRow(timeOk === null ? "" : timeOk ? "good" : "bad", "Complexity",
      `<p>Time <strong class="mono">${esc(pr.timeExact || pr.time)}</strong> · Space <strong class="mono">${esc(pr.space)}</strong></p>
       ${timeOk === false && pick.time ? `<p>You picked <span class="mono">${esc(pick.time)}</span>.</p>` : ""}`));

    const box = el.querySelector("[data-result]");
    box.innerHTML = `
      <section class="verdict ${patternOk ? "good" : "bad"}" style="margin-top:18px" aria-live="polite">
        <span class="verdict-icon">${patternOk ? ICON.check : ICON.x}</span>
        <div><h2 tabindex="-1" data-verdict>${gaveUp ? "Here's the answer" : patternOk ? "Right pattern" : "Not quite"}</h2>
          <p>${session.single ? "" : patternOk ? `Next review in ${nextIn} day${nextIn === 1 ? "" : "s"}.` : "This one comes back tomorrow" + (session.requeued.has(pr.id) && session.queue.indexOf(pr.id, session.index + 1) > -1 ? ", and once more at the end of this session." : ".")}</p></div>
      </section>

      <section class="card" style="margin-top:14px">
        <div class="insight"><b>Key insight</b>${esc(pr.insight)}</div>
        ${whyNot ? `<div style="margin-top:14px">${whyNot}</div>` : ""}
        <ol class="steps-list">${pr.explanation.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
        ${otherConfusions.length ? `<details style="margin-top:14px"><summary class="faint" style="cursor:pointer;font-size:13.5px">Common wrong turns</summary>
          <div style="margin-top:10px">${otherConfusions.map((x) => `<div class="confusion"><b>${esc(patternById.get(x.pattern).name)}:</b> ${esc(x.why)}</div>`).join("")}</div></details>` : ""}
      </section>

      <section class="card">
        <div class="card-head"><span class="card-title">Answer key</span></div>
        <div class="grade-list">${grades.join("")}</div>
      </section>

      <section class="card">
        <div class="card-head"><span class="card-title">Template</span><a class="btn btn-ghost btn-sm" href="#/patterns/${pat.id}">${esc(pat.name)} guide ${ICON.arrow}</a></div>
        ${codeBlock(tpl)}
      </section>

      <section class="card" data-viz-card>
        <div class="card-head"><span class="card-title">See ${esc(pat.name)} in action</span></div>
        <div data-viz><button type="button" class="btn" data-load-viz>${ICON.play} Open the step-by-step walkthrough</button></div>
      </section>

      <div class="actionbar" data-actions-after>
        <a class="btn btn-ghost" href="${leetcodeUrl(pr)}" target="_blank" rel="noopener noreferrer">Solve on LeetCode ${ICON.external}</a>
        ${session.single
          ? `<a class="btn btn-primary btn-lg" data-primary href="#/problems">Back to problems</a>`
          : `<button type="button" class="btn btn-primary btn-lg" data-primary data-next>${last ? "See results" : "Next problem"} <kbd class="hint">Enter</kbd></button>`}
      </div>`;
    el.querySelector("[data-actions]").remove();
    wireCode(box, templateById);
    const v = box.querySelector("[data-verdict]");
    v.closest(".verdict").scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    v.focus({ preventScroll: true });
  }

  function gradeRow(kind, label, body) {
    return `<div class="grade"><div class="grade-k"><i class="${kind}"></i>${label}</div><div class="grade-v">${body}</div></div>`;
  }

  async function openViz(btn) {
    const pid = state.pr.pattern;
    btn.disabled = true;
    btn.textContent = "Loading…";
    const spec = await loadViz(pid);
    const mount = el.querySelector("[data-viz]");
    if (!mount) return;
    if (!spec) { mount.innerHTML = `<p class="muted">The walkthrough couldn't be loaded. Check your connection and try again.</p>`; return; }
    destroyViz();
    viz = mountViz(mount, spec);
  }

  function summary() {
    document.body.classList.remove("has-actionbar");
    const res = session.results;
    // Score the first attempt at each problem; retries are practice.
    const firsts = new Map();
    res.forEach((r) => { if (!firsts.has(r.id)) firsts.set(r.id, r); });
    const list = [...firsts.values()];
    const right = list.filter((r) => r.ok).length;
    const missed = list.filter((r) => !r.ok).map((r) => r.id);
    const ratio = list.length ? right / list.length : 0;
    el.innerHTML = `<div class="page">
      <div class="page-head"><div class="eyebrow">${esc(session.title)} · complete</div>
        <h1>${ratio === 1 ? "Perfect session" : ratio >= 0.7 ? "Nice work" : "Session complete"}</h1>
        <p>You named the right pattern for <strong>${right} of ${list.length}</strong> problems on the first try.</p></div>
      <div class="list">${list.map((r) => {
        const pr = problemById.get(r.id);
        const p = patternById.get(pr.pattern);
        const picked = r.pick && r.pick !== pr.pattern && !r.ok ? patternById.get(r.pick) : null;
        return `<a class="row" href="#/problems/${pr.id}">
          <span class="status-dot ${r.ok ? "mastered" : "missed"}" aria-label="${r.ok ? "Right" : "Missed"}"></span>
          <span style="min-width:0"><span class="row-title" style="display:block">${esc(pr.title)}</span>
            <span class="row-sub" style="display:block">${esc(p.name)}${picked ? ` · you said ${esc(picked.name)}` : !r.pick && !r.ok ? " · revealed" : ""}</span></span>
          <span class="row-num">#${pr.number}</span>${difficultyTag(pr.difficulty)}</a>`;
      }).join("")}</div>
      <div class="btn-row" style="margin-top:20px">
        ${missed.length ? `<button type="button" class="btn btn-primary" data-retry>Retry the ${missed.length} missed</button>` : ""}
        <a class="btn ${missed.length ? "" : "btn-primary"}" href="#/" data-home>Back to practice</a>
        <a class="btn btn-ghost" href="#/progress">View progress</a>
      </div>
    </div>`;
    const retry = el.querySelector("[data-retry]");
    if (retry) retry.addEventListener("click", () => { session = retrySession(missed); show(); window.scrollTo(0, 0); });
    el.querySelector("h1").setAttribute("tabindex", "-1");
    el.querySelector("h1").focus();
    endSessionOnLeave = true;
  }
  let endSessionOnLeave = false;

  el.addEventListener("click", async (e) => {
    const t = e.target;
    const o = t.closest(".opt[data-group]");
    if (o) return onPick(o);
    if (t.closest("[data-check]")) return grade(false);
    if (t.closest("[data-giveup]")) return grade(true);
    if (t.closest("[data-reveal-title]")) {
      state.titleShown = true;
      el.querySelector("#ptitle").textContent = state.pr.title;
      return;
    }
    if (t.closest("[data-load-viz]")) return openViz(t.closest("[data-load-viz]"));
    if (t.closest("[data-next]")) {
      if (advance()) { show(); window.scrollTo(0, 0); el.querySelector("#ptitle")?.focus?.(); }
      else summary();
      return;
    }
    if (t.closest("[data-exit]")) {
      if (session.single) { location.hash = "#/problems"; return; }
      const answered = session.results.length;
      if (!answered || await confirmDialog({ title: "End this session?", body: `Your ${answered} answer${answered === 1 ? " is" : "s are"} saved. You'll see a summary of what you did.`, confirm: "End session" })) {
        if (answered) summary(); else { endSession(); location.hash = "#/"; }
      }
    }
  });

  show();

  return () => {
    destroyViz();
    document.removeEventListener("keydown", onKey);
    document.body.classList.remove("has-actionbar");
    if (endSessionOnLeave || session.single) endSession();
  };
}
