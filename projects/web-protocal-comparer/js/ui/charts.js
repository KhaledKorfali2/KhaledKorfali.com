// Header bit-layout diagrams and the time-series chart (cwnd etc.).
import { esc } from "../util.js";

let headersMod = null;
export const headersLoaded = import("../sim/headers.js").then((m) => (headersMod = m)).catch(() => null);

/** RFC-style 32-bit-wide header diagram. */
export function headerDiagram(id) {
  const L = headersMod?.HEADER_LAYOUTS?.[id];
  if (!L) return `<p class="faint">Header layout unavailable.</p>`;
  const ruler = Array.from({ length: 32 }, (_, i) => `<span>${i % 8 === 0 ? i : ""}</span>`).join("");
  return `<figure class="hdr" aria-label="${esc(L.name)} header layout">
    <figcaption><b>${esc(L.name)}</b>${L.rfc ? `<span>${esc(L.rfc)}</span>` : ""}</figcaption>
    ${L.note ? `<p class="hdr-note">${esc(L.note)}</p>` : ""}
    <div class="hdr-scroll"><div class="hdr-grid">
      <div class="hdr-ruler" aria-hidden="true">${ruler}</div>
      ${L.rows.map((row) => `<div class="hdr-row">${row.map((f) =>
        `<div class="hdr-f ${f.variable ? "is-var" : ""}" style="grid-column: span ${f.bits}" title="${esc(f.name)}${f.desc ? " — " + esc(f.desc) : ""}" tabindex="0">
          <span class="hdr-name">${esc(f.name)}</span><span class="hdr-bits">${f.variable ? (f.bytes ? f.bytes + " bytes" : "variable") : f.bits + (f.bits === 1 ? " bit" : " bits")}</span>
        </div>`).join("")}</div>`).join("")}
    </div></div>
    ${L.rows.flat().some((f) => f.desc) ? `<details class="hdr-legend"><summary>What each field does</summary><dl>${L.rows.flat().filter((f) => f.desc).map((f) =>
      `<div><dt>${esc(f.name)}</dt><dd>${esc(f.desc)}</dd></div>`).join("")}</dl></details>` : ""}
  </figure>`;
}

/** Step chart of one or more series against time, with a playhead. Returns { setTime }. */
export function seriesChart(host, series, duration, { title = "", keys = Object.keys(series), labels = {} } = {}) {
  const W = 600, H = 150, padL = 30, padR = 8, padT = 10, padB = 20;
  const maxV = Math.max(1, ...keys.flatMap((k) => (series[k] || []).map((p) => p.v)));
  const x = (t) => padL + (t / Math.max(1, duration)) * (W - padL - padR);
  const y = (v) => padT + (1 - v / maxV) * (H - padT - padB);
  const path = (pts) => {
    if (!pts?.length) return "";
    let d = `M${x(0)},${y(pts[0].v)} L${x(pts[0].t)},${y(pts[0].v)}`;
    for (let i = 1; i < pts.length; i++) d += ` L${x(pts[i].t)},${y(pts[i - 1].v)} L${x(pts[i].t)},${y(pts[i].v)}`;
    return d + ` L${x(duration)},${y(pts[pts.length - 1].v)}`;
  };
  const ticks = [0, Math.round(maxV / 2), maxV];
  host.innerHTML = `<div class="chart-head"><span class="card-title">${esc(title)}</span>
    <span class="chart-keys">${keys.map((k, i) => `<span><i class="ck ck-${i}"></i>${esc(labels[k] || k)}</span>`).join("")}</span></div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
      ${ticks.map((v) => `<line class="cg" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text class="ct" x="${padL - 6}" y="${y(v) + 3}">${v}</text>`).join("")}
      ${keys.map((k, i) => `<path class="cl cl-${i}" d="${path(series[k])}"/>`).join("")}
      <line class="cph" x1="${padL}" x2="${padL}" y1="${padT}" y2="${H - padB}"/>
      <text class="ct" x="${padL}" y="${H - 4}" text-anchor="start">0</text>
      <text class="ct" x="${W - padR}" y="${H - 4}" text-anchor="end">${Math.round(duration)} ms</text>
    </svg>`;
  const ph = host.querySelector(".cph");
  return { setTime(t) { const xx = x(Math.min(t, duration)); ph.setAttribute("x1", xx); ph.setAttribute("x2", xx); } };
}
