import PROTOCOLS from "../content/protocols.js";
import { GLOSSARY } from "../content/lessons.js";
import { headerDiagram, headersLoaded } from "../ui/charts.js";
import { esc, safeHtml, ICON } from "../util.js";
import { STACKS, GROUPS } from "../sim/stacks/index.js";

// Same grouping as the Lab picker, so a protocol lives in one place across the app.
const groupOf = (p) => STACKS.find((s) => s.id === p.lab)?.group || (["ipv4", "icmp"].includes(p.id) ? "Internet" : "Applications");

const GUARANTEES = [
  ["connection", "Connection setup"], ["reliable", "Reliable delivery"], ["ordered", "In-order delivery"],
  ["encrypted", "Encrypted"], ["messageBoundaries", "Message boundaries"], ["congestionControl", "Congestion control"],
];

export function render(el, params) {
  if (params.glossary) return glossary(el);
  if (params.id) return detail(el, params.id);
  return list(el);
}

const mark = (v) => v === true ? `<span class="yes" aria-label="yes">${ICON.check}</span>`
  : v === false ? `<span class="no" aria-label="no">—</span>` : `<span class="part">${esc(v)}</span>`;

function list(el) {
  el.innerHTML = `<div class="page page-wide">
    <div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap">
      <div><div class="eyebrow">Reference</div><h1>Protocols</h1><p>What each protocol promises, what its header looks like, and when to reach for it.</p></div>
      <a class="btn" href="#/glossary">Glossary</a>
    </div>
    ${GROUPS.map((g) => {
      const list = PROTOCOLS.filter((p) => groupOf(p) === g);
      if (!list.length) return "";
      return `<section class="proto-group"><div class="section-title">${esc(g)}</div><div class="proto-cards">${list.map((p) => `<a class="pcard" href="#/protocols/${p.id}">
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.tagline)}</p></a>`).join("")}</div></section>`;
    }).join("")}

    <div class="section-title">At a glance</div>
    <div class="table-wrap"><table class="tbl tbl-matrix">
      <thead><tr><th scope="col">Protocol</th>${GUARANTEES.map(([, l]) => `<th scope="col">${l}</th>`).join("")}</tr></thead>
      <tbody>${GROUPS.map((g) => {
        const list = PROTOCOLS.filter((p) => groupOf(p) === g);
        return list.length ? `<tr class="tbl-group"><th colspan="${GUARANTEES.length + 1}" scope="rowgroup">${esc(g)}</th></tr>` + list.map((p) =>
          `<tr><th scope="row"><a href="#/protocols/${p.id}">${esc(p.name)}</a></th>${GUARANTEES.map(([k]) => `<td>${mark(p.guarantees?.[k])}</td>`).join("")}</tr>`).join("") : "";
      }).join("")}</tbody>
    </table></div>
  </div>`;
}

function detail(el, id) {
  const p = PROTOCOLS.find((x) => x.id === id);
  if (!p) { el.innerHTML = `<div class="page"><div class="empty"><h3>Protocol not found</h3><a class="btn" href="#/protocols">All protocols</a></div></div>`; return; }
  el.innerHTML = `<div class="page page-wide">
    <a class="back" href="#/protocols">${ICON.back} All protocols</a>
    <div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap">
      <div><div class="eyebrow">${esc(groupOf(p))}${p.rfc ? " · " + esc(p.rfc) : ""}</div><h1>${esc(p.name)}</h1>
        <p><b>${esc(p.full)}.</b> ${esc(p.tagline)}</p>
        ${p.ports ? `<p class="proto-ports"><span>Ports</span> ${esc(p.ports)}</p>` : ""}</div>
      ${p.lab ? `<button type="button" class="btn btn-primary" data-lab="${esc(p.lab)}">${ICON.lab} Try it in the lab</button>` : ""}
    </div>
    <div class="guarantees">${GUARANTEES.map(([k, l]) => `<div class="g ${p.guarantees?.[k] === true ? "g-yes" : p.guarantees?.[k] === false ? "g-no" : "g-part"}">${mark(p.guarantees?.[k])}<span>${l}</span></div>`).join("")}</div>
    <div class="proto-grid">
      <section class="card"><div class="card-title" style="margin-bottom:12px">Key facts</div><ul class="bullets">${(p.facts || []).map((f) => `<li>${safeHtml(f)}</li>`).join("")}</ul></section>
      <section class="card"><div class="card-title" style="margin-bottom:12px">When to use it</div><ul class="bullets">${(p.whenToUse || []).map((f) => `<li>${safeHtml(f)}</li>`).join("")}</ul>
        ${p.gotchas?.length ? `<div class="card-title" style="margin:18px 0 12px">Gotchas</div><ul class="bullets">${p.gotchas.map((f) => `<li>${safeHtml(f)}</li>`).join("")}</ul>` : ""}</section>
    </div>
    ${p.header ? `<section class="card" style="margin-top:14px"><div class="card-title" style="margin-bottom:12px">Header</div><div data-header="${esc(p.header)}"><p class="faint">Loading…</p></div></section>` : ""}
  </div>`;
  headersLoaded.then(() => { const h = el.querySelector("[data-header]"); if (h) h.innerHTML = headerDiagram(h.dataset.header); });
  el.querySelector("[data-lab]")?.addEventListener("click", (e) => {
    sessionStorage.setItem("wire.labImport", JSON.stringify({ stack: e.currentTarget.dataset.lab, options: {}, link: { latency: 40, loss: 0, jitter: 0, bandwidth: 0 } }));
    location.hash = "#/lab";
  });
}

function glossary(el) {
  const terms = [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term));
  el.innerHTML = `<div class="page">
    <a class="back" href="#/protocols">${ICON.back} Protocols</a>
    <div class="page-head"><div class="eyebrow">Reference</div><h1>Glossary</h1><p>${terms.length} terms you'll meet in networking.</p></div>
    <label class="search" style="margin-bottom:16px;display:block"><span class="sr-only">Filter terms</span>
      <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M13.2 13.2L17 17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <input class="input" type="search" placeholder="Filter terms" data-q autocomplete="off"></label>
    <dl class="glossary" data-list></dl>
  </div>`;
  const list = el.querySelector("[data-list]");
  const draw = (q) => {
    const n = q.trim().toLowerCase();
    const shown = terms.filter((t) => !n || t.term.toLowerCase().includes(n) || t.def.toLowerCase().includes(n));
    list.innerHTML = shown.map((t) => `<div><dt>${esc(t.term)}</dt><dd>${safeHtml(t.def)}</dd></div>`).join("") || `<p class="muted">No terms match “${esc(q)}”.</p>`;
  };
  el.querySelector("[data-q]").addEventListener("input", (e) => draw(e.target.value));
  draw("");
}
