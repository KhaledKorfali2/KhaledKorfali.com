import { PATTERNS, PROBLEMS, CATEGORIES, patternById, problemById } from "../data/index.js";
import { attempts, patternStats, patternMastery, confusions, streak, activity, dueProblems, status, inList } from "../store.js";
import { focusSession } from "../session.js";
import { ICON, esc, pct } from "../ui.js";

export function render(el) {
  const all = attempts();
  if (!all.length) {
    el.innerHTML = `<div class="page"><div class="page-head"><div class="eyebrow">Progress</div><h1>Your progress</h1></div>
      <div class="empty"><h3>Nothing to show yet</h3><p>Answer a few problems and your accuracy by pattern, common mix-ups and streak will appear here.</p>
      <a class="btn btn-primary" href="#/">Start practising</a></div></div>`;
    return;
  }
  const stats = patternStats();
  const right = all.filter((a) => a.ok).length;
  const recent = all.slice(-50);
  const recentAcc = recent.filter((a) => a.ok).length / recent.length;
  const pool = PROBLEMS.filter((p) => inList(p));
  const counts = { new: 0, learning: 0, mastered: 0, missed: 0 };
  pool.forEach((p) => counts[status(p.id)]++);
  const days = activity(14);
  const maxDay = Math.max(1, ...days.map((d) => d.n));
  const conf = confusions(6);

  el.innerHTML = `<div class="page">
    <div class="page-head"><div class="eyebrow">Progress</div><h1>Your progress</h1>
      <p>Accuracy here means naming the right pattern, which is the skill that matters most in an interview.</p></div>

    <div class="kpis">
      <div class="kpi"><b>${pct(recentAcc)}</b><span>recent accuracy</span><small>last ${recent.length} · all-time ${pct(right / all.length)}</small></div>
      <div class="kpi"><b>${all.length}</b><span>answers</span><small>${new Set(all.map((a) => a.p)).size} distinct problems</small></div>
      <div class="kpi"><b>${streak()}</b><span>day streak</span><small>${days.filter((d) => d.n).length} of the last 14 days</small></div>
      <div class="kpi"><b>${dueProblems().length}</b><span>due now</span><small>${counts.mastered} mastered · ${counts.learning + counts.missed} learning</small></div>
    </div>

    <div class="section-title">Last 14 days</div>
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

    <div class="section-title">Pattern accuracy <span class="faint" style="text-transform:none;letter-spacing:0;font-family:var(--font)">tap to drill</span></div>
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
    }).join("")}</div>
  </div>`;

  el.addEventListener("click", (e) => {
    const f = e.target.closest("[data-focus]");
    if (f) { e.preventDefault(); if (focusSession([f.dataset.focus])) location.hash = "#/drill"; }
    if (e.target.closest("[data-focus-conf]")) {
      const ids = [...new Set(conf.flatMap((c) => [c.expected, c.picked]))].slice(0, 4);
      if (focusSession(ids)) location.hash = "#/drill";
    }
  });
}
