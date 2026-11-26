import { PATTERNS, PROBLEMS, CATEGORIES, patternById, problemById } from "../data/index.js";
import { attempts, patternStats, patternMastery, confusions, streak, activity, dueProblems, status, inList, metrics, solves, review, studyActivity, settings, today } from "../store.js";
import { focusSession } from "../session.js";
import { launchSolve } from "../solve-session.js";
import { TARGETS, UNSEEN_WINDOW } from "../domain/metrics.js";
import { ICON, esc, pct, minutes, dayLabel, difficultyTag, statusChip } from "../ui.js";

// One readiness metric: a bar with a tick at the target.
function metricRow({ label, value, shown, target, targetShown, note, met, lowerIsBetter = false }) {
  const w = value == null ? 0 : Math.max(0, Math.min(1, value)) * 100;
  return `<div class="metric">
    <div class="metric-top"><span class="metric-label">${label}</span>
      <span class="metric-val ${value == null ? "" : met ? "is-good" : "is-bad"}">${shown}</span></div>
    <div class="metric-bar ${value == null ? "" : met ? "good" : "bad"}" role="img" aria-label="${label}: ${shown}, target ${targetShown}">
      <i style="width:${w}%"></i><b style="left:${target * 100}%"></b></div>
    <div class="metric-foot"><span>Target ${lowerIsBetter ? "≤" : "≥"} ${targetShown}</span><span>${note}</span></div>
  </div>`;
}

function readiness() {
  const m = metrics();
  const all = solves();
  const t = today();
  const strong = m.strength.filter((s) => s.value != null && s.value >= TARGETS.strength).length;
  const weak = m.weakest ? patternById.get(m.weakest.id) : null;
  // Three problems from the weakest pattern: ones never attempted first.
  const recs = weak ? PROBLEMS.filter((p) => p.pattern === weak.id)
    .sort((a, b) => (review(a.id) ? 1 : 0) - (review(b.id) ? 1 : 0)).slice(0, 3) : [];
  const med = m.medianClean.sec;

  // Study heatmap: 12 weeks, one column per week, Monday at the top.
  const WEEKS = 12;
  const dow = (new Date(t * 86400000).getUTCDay() + 6) % 7;      // 0 = Monday
  const days = studyActivity(WEEKS * 7 - (6 - dow));
  const goal = settings().dailyMinutes * 60;
  const level = (sec) => (sec <= 0 ? 0 : sec < goal * 0.25 ? 1 : sec < goal * 0.6 ? 2 : sec < goal ? 3 : 4);
  const totalMin = minutes(days.reduce((n, d) => n + d.sec, 0));
  const activeDays = days.filter((d) => d.sec > 0).length;

  return `
    ${m.ready ? `<section class="verdict good"><span class="verdict-icon">${ICON.check}</span>
        <div><h2>Interview-ready</h2><p>Unseen mediums, pattern guesses and every pattern's strength are all on target. Keep the re-solve queue clear and keep mocking.</p></div></section>`
      : `<section class="card readiness">
        <div><div class="eyebrow">Not interview-ready yet</div>
          <h2>${all.length ? (weak ? `Weakest pattern: ${esc(weak.name)}` : "Keep going") : "Readiness is measured on unseen problems"}</h2>
          <p>${all.length
            ? `Ready means three targets at once: a 65% clean rate on ${UNSEEN_WINDOW} hidden-topic mediums, 70% pattern-guess accuracy, and every pattern at strength 0.5 or better.${weak ? ` ${m.weakest.value == null ? "You haven't attempted this pattern yet." : `Its strength is ${m.weakest.value.toFixed(2)}.`} Try these next:` : ""}`
            : "Problem count doesn't predict interviews. These numbers fill in as you solve; the first two only count attempts where the topic was hidden."}</p></div>
        ${recs.length && all.length ? `<div class="list" style="margin-top:14px">${recs.map((pr) => `<button type="button" class="row" data-solve="${pr.id}">
          <span class="status-dot ${review(pr.id) ? "attempted" : ""}" aria-hidden="true"></span>
          <span style="min-width:0"><span class="row-title" style="display:block">${esc(pr.title)}</span></span>
          <span class="row-right">${statusChip(review(pr.id) ? "attempted" : "new")}</span>${difficultyTag(pr.difficulty)}</button>`).join("")}</div>` : ""}
      </section>`}

    <div class="section-title">Readiness</div>
    <div class="card metrics">
      ${metricRow({ label: "Unseen-medium clean rate", value: m.unseen.rate, shown: pct(m.unseen.rate), target: TARGETS.unseen, targetShown: pct(TARGETS.unseen),
        note: `${m.unseen.n} of ${UNSEEN_WINDOW} hidden-topic Medium first attempts, clean in 30 min`, met: m.met.unseen })}
      ${metricRow({ label: "Pattern-guess accuracy", value: m.guess.rate, shown: pct(m.guess.rate), target: TARGETS.guess, targetShown: pct(TARGETS.guess),
        note: `${m.guess.hits} of ${m.guess.n} guesses right`, met: m.met.guess })}
      ${metricRow({ label: "Median clean time (Medium)", value: med == null ? null : med / (50 * 60), shown: med == null ? "—" : Math.round(med / 60) + " min", target: 0.5, targetShown: "25 min",
        note: `${m.medianClean.n} clean Medium${m.medianClean.n === 1 ? "" : "s"} in the last 30 days`, met: m.met.medianClean, lowerIsBetter: true })}
      ${metricRow({ label: "Patterns at strength 0.5+", value: strong / m.strength.length, shown: `${strong} / ${m.strength.length}`, target: 1, targetShown: "all " + m.strength.length,
        note: "recency-weighted over each pattern's last 5 attempts", met: m.met.strength })}
      ${metricRow({ label: "Review health", value: m.reviewHealth.rate, shown: pct(m.reviewHealth.rate), target: TARGETS.reviewHealth, targetShown: pct(TARGETS.reviewHealth),
        note: `${m.reviewHealth.hits} of ${m.reviewHealth.n} re-solves on time, last 14 days`, met: m.met.reviewHealth })}
    </div>

    <div class="section-title">Pattern strength <span class="faint" style="text-transform:none;letter-spacing:0;font-family:var(--font)">clean 1 · hinted 0.5 · solution 0.2 · failed 0</span></div>
    <div class="card strength">
      <div class="strength-rows">${CATEGORIES.flatMap((c) => PATTERNS.filter((p) => p.category === c)).map((p) => {
        const s = m.strength.find((x) => x.id === p.id);
        const v = s.value;
        return `<a class="strength-row" href="#/patterns/${p.id}" title="${v == null ? "Not attempted" : v.toFixed(2) + " over " + s.n + " attempt" + (s.n === 1 ? "" : "s")}">
          <span class="strength-name">${esc(p.name)}</span>
          <span class="metric-bar ${v == null ? "" : v >= TARGETS.strength ? "good" : "bad"}"><i style="width:${(v || 0) * 100}%"></i><b style="left:50%"></b></span>
          <span class="strength-val">${v == null ? "—" : v.toFixed(2)}</span></a>`;
      }).join("")}</div>
    </div>

    <div class="section-title">Study time <span class="faint" style="text-transform:none;letter-spacing:0;font-family:var(--font)">${totalMin} min over ${activeDays} day${activeDays === 1 ? "" : "s"} in the last ${WEEKS} weeks</span></div>
    <div class="card">
      <div class="heatmap" role="img" aria-label="Minutes studied per day for the last ${WEEKS} weeks. ${totalMin} minutes over ${activeDays} days.">
        ${days.map((d) => `<i class="l${level(d.sec)}${d.day === t ? " today" : ""}" title="${dayLabel(d.day, { weekday: "short", month: "short", day: "numeric" })}: ${minutes(d.sec)} min"></i>`).join("")}
      </div>
      <div class="heatmap-legend"><span>Less</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>Daily goal met</span></div>
    </div>`;
}

export function render(el) {
  const all = attempts();
  const hasDrill = all.length > 0;
  const stats = patternStats();
  const right = all.filter((a) => a.ok).length;
  const recent = all.slice(-50);
  const recentAcc = recent.length ? recent.filter((a) => a.ok).length / recent.length : null;
  const pool = PROBLEMS.filter((p) => inList(p));
  const counts = { new: 0, learning: 0, mastered: 0, missed: 0 };
  pool.forEach((p) => counts[status(p.id)]++);
  const days = activity(14);
  const maxDay = Math.max(1, ...days.map((d) => d.n));
  const conf = confusions(6);

  el.innerHTML = `<div class="page">
    <div class="page-head"><div class="eyebrow">Progress</div><h1>Your progress</h1>
      <p>Measured by how you do on problems you haven't seen, not by how many you've done.</p></div>

    ${readiness()}

    <div class="section-title">Clue drill</div>
    ${hasDrill ? `
    <div class="kpis">
      <div class="kpi"><b>${pct(recentAcc)}</b><span>recent accuracy</span><small>last ${recent.length} · all-time ${pct(right / all.length)}</small></div>
      <div class="kpi"><b>${all.length}</b><span>answers</span><small>${new Set(all.map((a) => a.p)).size} distinct problems</small></div>
      <div class="kpi"><b>${streak()}</b><span>day streak</span><small>${days.filter((d) => d.n).length} of the last 14 days</small></div>
      <div class="kpi"><b>${dueProblems().length}</b><span>due now</span><small>${counts.mastered} mastered · ${counts.learning + counts.missed} learning</small></div>
    </div>

    <div class="section-title">Drill answers, last 14 days</div>
    <div class="card" style="padding:16px 18px">
      <div class="bars" role="img" aria-label="Answers per day for the last 14 days: ${days.map((d) => d.n).join(", ")}">
        ${days.map((d, i) => {
          const date = new Date(d.day * 86400000);
          const label = date.toLocaleDateString(undefined, { timeZone: "UTC", month: "short", day: "numeric" });
          return `<div class="bar-col" title="${label}: ${d.n} answered">
            <span class="bar-n">${d.n || ""}</span>
            <i class="${d.n ? "on" : ""}" style="height:${d.n ? Math.max(4, (d.n / maxDay) * 100) : 0}%"></i>
            <span class="bar-d">${i === days.length - 1 ? "today" : i % 2 ? date.getUTCDate() : ""}</span></div>`;
        }).join("")}
      </div>
    </div>

    <div class="section-title">Drill accuracy by pattern <span class="faint" style="text-transform:none;letter-spacing:0;font-family:var(--font)">tap to drill</span></div>
    ${CATEGORIES.map((cat) => `<div class="opts-group-label" style="margin:16px 0 8px">${esc(cat)}</div>
      <div class="heat">${PATTERNS.filter((p) => p.category === cat).map((p) => {
        const s = stats.get(p.id);
        const acc = s.attempts ? s.acc : null;
        const color = acc == null ? "transparent" : acc >= 0.8 ? "var(--good)" : acc >= 0.55 ? "var(--accent)" : "var(--bad)";
        return `<a href="#/drill" data-focus="${p.id}" style="--heat-c:${color};--heat-o:${acc == null ? 0 : 0.14}">
          <b>${esc(p.name)}</b><span>${s.attempts ? pct(acc) : "—"}</span>
          <small>${s.attempts ? `${s.right}/${s.attempts} · ${pct(patternMastery(p.id))} mastered` : "not practised"}</small></a>`;
      }).join("")}</div>`).join("")}

    <div class="section-title">Most common mix-ups</div>
    ${conf.length ? `<div class="confuse">${conf.map((c) => `
      <div class="confuse-row"><span>Was <strong>${esc(patternById.get(c.expected).name)}</strong></span><span class="arrow">→</span>
        <span>you said <strong>${esc(patternById.get(c.picked).name)}</strong></span><span class="n">${c.n}×</span></div>`).join("")}</div>
      <div class="btn-row" style="margin-top:12px"><button type="button" class="btn btn-sm" data-focus-conf>${ICON.target} Drill these pairs</button></div>`
      : `<p class="muted">No repeated mix-ups yet.</p>`}

    <div class="section-title">Recent answers</div>
    <div class="list">${all.slice(-15).reverse().map((a) => {
      const pr = problemById.get(a.p);
      const when = new Date(a.t);
      const picked = a.pick && !a.ok ? patternById.get(a.pick) : null;
      return `<a class="row" href="#/problems/${pr.id}">
        <span class="status-dot ${a.ok ? "mastered" : "missed"}" aria-label="${a.ok ? "Right" : "Missed"}"></span>
        <span style="min-width:0"><span class="row-title" style="display:block">${esc(pr.title)}</span>
          <span class="row-sub" style="display:block">${esc(patternById.get(pr.pattern).name)}${picked ? ` · you said ${esc(picked.name)}` : a.gaveUp ? " · revealed" : ""}</span></span>
        <span class="row-num">${when.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span><span></span></a>`;
    }).join("")}</div>` : `<p class="muted">The clue drill is a quick warm-up: read a statement and name the pattern. Its accuracy shows up here once you've tried it. <a href="#/drills">Open the clue drill</a></p>`}
  </div>`;

  el.addEventListener("click", (e) => {
    const sv = e.target.closest("[data-solve]");
    if (sv) return launchSolve(problemById.get(sv.dataset.solve));
    const f = e.target.closest("[data-focus]");
    if (f) { e.preventDefault(); if (focusSession([f.dataset.focus])) location.hash = "#/drill"; }
    if (e.target.closest("[data-focus-conf]")) {
      const ids = [...new Set(conf.flatMap((c) => [c.expected, c.picked]))].slice(0, 4);
      if (focusSession(ids)) location.hash = "#/drill";
    }
  });
}
