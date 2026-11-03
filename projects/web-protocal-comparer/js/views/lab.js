import { STACKS, loadStack, stackSelect } from "../sim/stacks/index.js";
import { mountSim, LINK_CONTROLS, DEFAULT_LINK } from "../ui/simview.js";
import { labState, saveLab } from "../store.js";
import { esc, fmtMs, ICON } from "../util.js";

const RACES = [
  { label: "HTTP/2 vs HTTP/3 with 3% loss", a: { stack: "http2" }, b: { stack: "http3" }, link: { latency: 50, loss: 0.03 } },
  { label: "HTTP/1.1 vs HTTP/2", a: { stack: "http1", options: { connections: 1 } }, b: { stack: "http2" }, link: { latency: 50, loss: 0 } },
  { label: "TLS 1.2 vs TLS 1.3", a: { stack: "tls", options: { version: "1.2" } }, b: { stack: "tls", options: { version: "1.3" } }, link: { latency: 80, loss: 0 } },
  { label: "HTTP/3 vs HTTP/3 + 0-RTT", a: { stack: "http3" }, b: { stack: "http3", options: { zeroRtt: true } }, link: { latency: 80, loss: 0 } },
];
const DONE_KEYS = ["pageLoadMs", "completeMs", "resolvedMs", "done"];
const finishTime = (s) => { for (const k of DONE_KEYS) if (s?.[k] != null) return s[k]; return null; };
const stackName = (id) => STACKS.find((s) => s.id === id)?.name || id;

export function render(el) {
  const imported = (() => { try { const v = JSON.parse(sessionStorage.getItem("wire.labImport") || "null"); sessionStorage.removeItem("wire.labImport"); return v; } catch { return null; } })();
  const saved = labState() || {};
  let mode = imported ? "single" : saved.mode || "single";
  let single = imported ? { stack: imported.stack, options: imported.options || {}, link: imported.link, drops: imported.drops || [], seed: imported.seed }
    : saved.single || { stack: "tcp", options: {}, link: { ...DEFAULT_LINK, latency: 40 } };
  let race = saved.race || { a: RACES[0].a, b: RACES[0].b, link: { ...DEFAULT_LINK, ...RACES[0].link } };
  let views = [];

  el.innerHTML = `<div class="page page-wide">
    <div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap">
      <div><div class="eyebrow">Network lab</div><h1>Lab</h1>
        <p>Pick a protocol, shape the network, and watch what happens. Click any packet to open its headers.</p></div>
      <span class="segmented" role="group" aria-label="Lab mode">
        <button type="button" data-mode="single" aria-pressed="${mode === "single"}">${ICON.lab} Explore</button>
        <button type="button" data-mode="race" aria-pressed="${mode === "race"}">${ICON.race} Race two</button>
      </span>
    </div>
    <div data-body></div>
  </div>`;
  const body = el.querySelector("[data-body]");

  function persist() { saveLab({ mode, single, race }); }
  // One grouped dropdown instead of fifteen buttons; the line under it says what the protocol is for.
  const stackPicker = (cur, name) => `<div class="stack-picker">
      <label class="stack-picker-label" for="pick-${name}">${name === "single" ? "Protocol" : "Protocol " + name.toUpperCase()}</label>
      ${stackSelect(cur, `id="pick-${name}" data-pick="${name}"`)}
      <p class="stack-desc">${esc(STACKS.find((s) => s.id === cur)?.short || "")}</p>
    </div>`;

  function renderSingle() {
    views.forEach((v) => v.destroy()); views = [];
    body.innerHTML = `${stackPicker(single.stack, "single")}
      ${imported && single.drops?.length ? `<p class="faint" style="font-size:13px;margin:-4px 0 12px">Imported from a lesson, including its staged packet losses.</p>` : ""}
      <div data-sim></div>`;
    const v = mountSim(body.querySelector("[data-sim]"), single, {
      lab: true,
      onTrace: (_, sc) => { single = { stack: sc.stack, options: sc.options, link: sc.link, drops: sc.drops, seed: sc.seed }; persist(); },
    });
    views.push(v);
  }

  async function renderRace() {
    views.forEach((v) => v.destroy()); views = [];
    const [sa, sb] = await Promise.all([loadStack(race.a.stack), loadStack(race.b.stack)]);
    const shared = (sa?.options || []).filter((o) => (sb?.options || []).some((p) => p.key === o.key) && o.type !== "select" && o.type !== "bool");
    body.innerHTML = `<div class="race-presets"><span class="faint">Classic races:</span>${RACES.map((r, i) => `<button type="button" class="chip-btn" data-preset="${i}">${esc(r.label)}</button>`).join("")}</div>
      <div class="race-pickers">
        <div><div class="race-tag race-a">A</div>${stackPicker(race.a.stack, "a")}${optionPills(sa, race.a, "a")}</div>
        <div><div class="race-tag race-b">B</div>${stackPicker(race.b.stack, "b")}${optionPills(sb, race.b, "b")}</div>
      </div>
      <div class="card race-controls">
        ${["latency", "loss", "jitter"].map((k) => slider(k, LINK_CONTROLS[k], k === "loss" ? Math.round((race.link.loss || 0) * 100) : race.link[k] || 0)).join("")}
        ${shared.map((o) => slider(o.key, o, race.options?.[o.key] ?? o.default)).join("")}
      </div>
      <div class="race-result card" data-result aria-live="polite"></div>
      <div class="race-grid"><div data-slot="a"></div><div data-slot="b"></div></div>`;
    const traces = {};
    const mk = (side) => mountSim(body.querySelector(`[data-slot="${side}"]`),
      { stack: race[side].stack, options: { ...(race.options || {}), ...(race[side].options || {}) }, link: race.link, seed: 11 },
      { showControls: false, title: `${side.toUpperCase()} · ${stackName(race[side].stack)}${optLabel(race[side])}`, onTrace: (t) => { traces[side] = t; result(); } });
    views = [mk("a"), mk("b")];
    function result() {
      const box = body.querySelector("[data-result]");
      if (!box || !traces.a || !traces.b) return;
      const ta = finishTime(traces.a.summary), tb = finishTime(traces.b.summary);
      const max = Math.max(ta || 0, tb || 0, 1);
      const row = (side, t, tr) => `<div class="race-row"><span class="race-tag race-${side}">${side.toUpperCase()}</span>
        <span class="race-name">${esc(stackName(race[side].stack))}${esc(optLabel(race[side]))}</span>
        <span class="race-bar"><i class="race-${side}" style="width:${t ? (t / max) * 100 : 0}%"></i></span>
        <b class="mono">${t == null ? "didn't finish" : fmtMs(t)}</b><span class="faint race-pk">${tr.summary.packets} pkts${tr.summary.retransmissions ? ` · ${tr.summary.retransmissions} retx` : ""}</span></div>`;
      let verdict = "";
      if (ta != null && tb != null) {
        const diff = Math.abs(ta - tb), rtt = race.link.latency * 2;
        verdict = diff < 1 ? "Dead heat." : `<b>${ta < tb ? "A" : "B"}</b> finishes ${fmtMs(diff)} sooner, about ${(diff / rtt).toFixed(1)} round trips.`;
      }
      box.innerHTML = `<div class="card-title" style="margin-bottom:10px">Time to finish</div>${row("a", ta, traces.a)}${row("b", tb, traces.b)}<p class="race-verdict">${verdict}</p>`;
    }
  }
  const optLabel = (side) => {
    const o = side.options || {};
    const bits = [];
    if (o.version) bits.push(o.version);
    if (o.zeroRtt) bits.push("0-RTT");
    if (o.connections > 1) bits.push(o.connections + " conns");
    return bits.length ? ` (${bits.join(", ")})` : "";
  };
  function optionPills(stack, side, name) {
    const sel = (stack?.options || []).filter((o) => o.type === "select" || o.type === "bool");
    if (!sel.length) return "";
    return `<div class="race-opts">${sel.map((o) => {
      const cur = side.options?.[o.key] ?? o.default;
      const choices = o.type === "bool" ? [[false, "off"], [true, "on"]] : o.choices.map((c) => Array.isArray(c) ? c : [c, c]);
      return `<span class="race-opt"><span class="faint">${esc(o.label)}</span><span class="segmented">${choices.map(([v, l]) =>
        `<button type="button" data-ropt="${o.key}" data-rside="${name}" data-val="${esc(v)}" aria-pressed="${String(v) === String(cur)}">${esc(l)}</button>`).join("")}</span></span>`;
    }).join("")}</div>`;
  }
  function slider(k, c, v) {
    return `<label class="ctl"><span class="ctl-label">${esc(c.label)} <output class="ctl-val mono" data-out="${k}">${v}${c.unit ? " " + c.unit : ""}</output></span>
      <input type="range" min="${c.min}" max="${c.max}" step="${c.step || 1}" value="${v}" data-race="${k}"></label>`;
  }

  let debounce;
  el.addEventListener("input", (e) => {
    const r = e.target.closest("[data-race]");
    if (!r) return;
    const k = r.dataset.race, v = +r.value;
    const c = LINK_CONTROLS[k];
    el.querySelector(`[data-out="${k}"]`).textContent = v + (c?.unit ? " " + c.unit : "");
    if (c) race.link[k] = k === "loss" ? v / 100 : v;
    else race.options = { ...(race.options || {}), [k]: v };
    persist();
    clearTimeout(debounce);
    debounce = setTimeout(() => views.forEach((vw) => vw.update({ link: race.link, options: race.options || {} })), 200);
  });
  el.addEventListener("change", (e) => {
    const sel = e.target.closest("[data-pick]");
    if (!sel) return;
    const side = sel.dataset.pick;
    if (side === "single") {
      single = { stack: sel.value, options: {}, link: single.link, seed: single.seed };
      persist(); renderSingle();
    } else {
      race[side] = { stack: sel.value, options: {} };
      persist(); renderRace();
    }
    el.querySelector(`[data-pick="${side}"]`)?.focus();
  });
  el.addEventListener("click", (e) => {
    const m = e.target.closest("[data-mode]");
    if (m) {
      mode = m.dataset.mode;
      el.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b === m)));
      persist();
      return mode === "single" ? renderSingle() : renderRace();
    }
    const p = e.target.closest("[data-preset]");
    if (p) {
      const r = RACES[+p.dataset.preset];
      race = { a: r.a, b: r.b, link: { ...DEFAULT_LINK, ...r.link }, options: {} };
      persist(); return renderRace();
    }
    const o = e.target.closest("[data-ropt]");
    if (o) {
      const raw = o.dataset.val;
      const v = raw === "true" ? true : raw === "false" ? false : raw;
      const side = o.dataset.rside;
      race[side] = { ...race[side], options: { ...(race[side].options || {}), [o.dataset.ropt]: v } };
      persist(); return renderRace();
    }
  });

  mode === "single" ? renderSingle() : renderRace();
  return () => views.forEach((v) => v.destroy());
}
