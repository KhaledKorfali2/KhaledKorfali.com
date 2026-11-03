// Interactive simulation: controls → simulate() → ladder + playback + inspector + metrics.
// Used inline in lessons (with a subset of controls) and by the Lab (all controls, optional race).
import { simulate, ADDRESSES } from "../sim/engine.js";
import { loadStack } from "../sim/stacks/index.js";
import { mountLadder, nodeLabel, packetClass } from "./ladder.js";
import { renderInspector } from "./inspector.js";
import { seriesChart } from "./charts.js";
import { esc, fmtMs, fmtBytes, ICON, reducedMotion } from "../util.js";

export const LINK_CONTROLS = {
  latency: { label: "Latency (one way)", min: 2, max: 300, step: 1, unit: "ms", hint: (v) => `RTT ${v * 2} ms` },
  loss: { label: "Packet loss", min: 0, max: 30, step: 1, unit: "%" },
  jitter: { label: "Jitter", min: 0, max: 100, step: 1, unit: "ms" },
  reorder: { label: "Reordering", min: 0, max: 30, step: 1, unit: "%" },
  bandwidth: { label: "Bandwidth", choices: [[0, "Unlimited"], [12500, "100 Mbit/s"], [1250, "10 Mbit/s"], [125, "1 Mbit/s"]] },
};
const PCT = new Set(["loss", "reorder"]);
export const DEFAULT_LINK = { latency: 40, loss: 0, jitter: 0, reorder: 0, bandwidth: 0 };

// A few headline numbers per protocol (then packets / lost / retransmitted) — enough to compare runs without a wall of stats.
const HEADLINE = {
  arp: ["resolvedMs", "pingRttMs", "arpRequests", "mac"],
  dhcp: ["offerMs", "ackMs", "configuredMs", "address"],
  nat: ["connectMs", "responseMs", "mappedPort", "inboundBlocked"],
  ip: ["rttAvg", "lossPct", "timeExceeded"],
  udp: ["sent", "received", "reordered"],
  dns: ["resolvedMs", "attempts", "answer"],
  tcp: ["handshakeMs", "completeMs", "rtoCount", "fastRetransmits", "maxCwnd"],
  tls: ["handshakeMs", "firstByteMs"],
  ssh: ["handshakeMs", "authMs", "echoRttMs"],
  http1: ["firstResourceMs", "pageLoadMs", "connections"],
  http2: ["firstResourceMs", "pageLoadMs"],
  http3: ["handshakeMs", "firstResourceMs", "pageLoadMs"],
  websocket: ["upgradeMs", "messages"],
  ftp: ["loginMs", "transferMs", "completeMs", "connections"],
  smtp: ["tlsMs", "deliveredMs", "completeMs"],
};
const COMMON = ["packets", "lost", "retransmissions"];
const METRICS = {
  handshakeMs: "Handshake done", upgradeMs: "Upgrade done", resolvedMs: "Resolved", firstResourceMs: "First resource",
  pageLoadMs: "Page load", completeMs: "Complete", firstByteMs: "First byte", pingRttMs: "Ping RTT", arpRequests: "ARP requests",
  mac: "MAC learned", offerMs: "Offer received", ackMs: "Lease granted", configuredMs: "Ready to use", address: "Address",
  connectMs: "Connected", responseMs: "Response", mappedPort: "Public port", inboundBlocked: "Inbound SYNs blocked",
  rttAvg: "Avg RTT", lossPct: "Ping loss %", timeExceeded: "Time exceeded", sent: "Sent", received: "Received",
  reordered: "Out of order", attempts: "Attempts", answer: "Answer", rtoCount: "Timeouts (RTO)", fastRetransmits: "Fast retransmits",
  maxCwnd: "Peak cwnd", authMs: "Authenticated", echoRttMs: "Keystroke echo", connections: "Connections", messages: "Messages",
  loginMs: "Logged in", transferMs: "Transfer done", tlsMs: "TLS ready", deliveredMs: "Mail accepted",
  packets: "Packets", lost: "Lost", retransmissions: "Retransmitted", done: "Finished",
};
const TIME_KEYS = /Ms$|^rtt|^done$/;

function fmtMetric(k, v) {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string") return v;
  if (TIME_KEYS.test(k)) return fmtMs(v);
  if (k === "bytesOnWire") return fmtBytes(v);
  return String(Math.round(v * 100) / 100);
}

// Link controls compute their hint from the value; stack options give a fixed string.
const hintText = (c, v) => (typeof c.hint === "function" ? c.hint(v) : c.hint);

let uid = 0;

/**
 * mountSim(host, scenario, opts)
 * scenario: { stack, options, link, drops, seed, controls }
 * opts: { lab: bool (show every control), compact: bool, onTrace(trace), showControls: bool, title }
 */
export function mountSim(host, scenario, opts = {}) {
  const id = "sim" + (++uid);
  const base = JSON.parse(JSON.stringify(scenario));
  let sc = JSON.parse(JSON.stringify(scenario));
  sc.link = { ...DEFAULT_LINK, ...(sc.link || {}) };
  sc.options = sc.options || {};
  let stack = null, trace = null, ladder = null, chart = null;
  let t = 0, playing = false, raf = 0, lastFrame = 0, speedIdx = 1, selected = null, destroyed = false, loopTimer = 0;
  const SPEEDS = [0.5, 1, 2, 4];

  host.innerHTML = `<div class="sim${opts.mini ? " sim-mini" : ""}" id="${id}">
    ${opts.title ? `<div class="sim-title">${esc(opts.title)}</div>` : ""}
    ${opts.lab ? `<details class="sim-settings" ${window.matchMedia("(max-width: 760px)").matches ? "" : "open"}>
      <summary><span>Network &amp; protocol settings</span><span class="sim-settings-sum faint" data-sum></span></summary>
      <div class="sim-controls" data-controls></div></details>` : `<div class="sim-controls" data-controls></div>`}
    <div class="sim-main">
      <div class="sim-diagram"><div class="sim-ladder" id="${id}-ladder"><p class="faint" style="padding:40px;text-align:center">Loading simulation…</p></div></div>
      <aside class="sim-side" aria-label="Packet inspector"><div class="sim-side-head">Packet inspector</div><div data-insp></div></aside>
    </div>
    <div class="sim-transport">
      <button type="button" class="icon-btn icon-btn-primary" data-act="play" aria-label="Play" title="Play / pause">${ICON.play}</button>
      <button type="button" class="icon-btn" data-act="replay" aria-label="Replay from start" title="Replay">${ICON.replay}</button>
      <input type="range" class="sim-scrub" min="0" max="1000" value="1000" aria-label="Time">
      <span class="sim-time mono" aria-live="off"></span>
      <button type="button" class="chip-btn" data-act="speed" aria-label="Playback speed">1×</button>
    </div>
    <div class="sim-stats" data-stats></div>
    <div class="sim-chart" data-chart hidden></div>
    <details class="sim-log"><summary>Event log <span class="faint" data-logcount></span></summary><div class="log" data-log role="list"></div></details>
  </div>`;
  const root = host.querySelector(".sim");
  const $ = (s) => root.querySelector(s);
  const ladderHost = $(`#${id}-ladder`), insp = $("[data-insp]"), scrub = $(".sim-scrub"), timeEl = $(".sim-time");
  const playBtn = $('[data-act="play"]');

  /* ── controls ── */
  function controlKeys() {
    if (opts.showControls === false) return [];
    if (opts.lab) return ["latency", "loss", "jitter", "reorder", "bandwidth", ...(stack?.options || []).map((o) => o.key)];
    return sc.controls || [];
  }
  // One-line summary for the collapsed Lab settings, e.g. "RTT 80 ms · 2% loss".
  function renderSummary() {
    const el2 = root.querySelector("[data-sum]");
    if (!el2) return;
    const L = sc.link, bits = [`RTT ${L.latency * 2} ms`];
    if (L.loss) bits.push(`${Math.round(L.loss * 100)}% loss`);
    if (L.jitter) bits.push(`${L.jitter} ms jitter`);
    if (L.reorder) bits.push(`${Math.round(L.reorder * 100)}% reorder`);
    if (L.bandwidth) bits.push(LINK_CONTROLS.bandwidth.choices.find(([v]) => v === L.bandwidth)?.[1] || "");
    el2.textContent = bits.join(" · ");
  }
  function renderControls() {
    renderSummary();
    const keys = controlKeys();
    const box = $("[data-controls]");
    if (!keys.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = keys.map((k) => {
      if (LINK_CONTROLS[k]) return controlHtml(k, LINK_CONTROLS[k], PCT.has(k) ? Math.round((sc.link[k] || 0) * 100) : sc.link[k], "link");
      const o = (stack?.options || []).find((x) => x.key === k);
      return o ? controlHtml(k, o, sc.options[k] ?? o.default, "opt") : "";
    }).join("") + (opts.lab ? "" : `<div class="ctl ctl-actions"><button type="button" class="btn btn-ghost btn-sm" data-act="reset">Reset</button></div>`);
  }
  function controlHtml(k, c, v, scope) {
    const name = `${id}-${k}`;
    if (c.choices || c.type === "select") {
      const choices = c.choices.map((ch) => Array.isArray(ch) ? ch : [ch, ch]);
      return `<div class="ctl"><span class="ctl-label" id="${name}-l">${esc(c.label)}</span>
        <span class="segmented" role="group" aria-labelledby="${name}-l">${choices.map(([val, lab]) =>
          `<button type="button" data-scope="${scope}" data-key="${k}" data-val="${esc(val)}" aria-pressed="${String(val) === String(v)}">${esc(lab)}</button>`).join("")}</span></div>`;
    }
    if (c.type === "bool") {
      return `<label class="ctl ctl-bool"><span class="ctl-label">${esc(c.label)}</span>
        <span class="switch-mini"><input type="checkbox" data-scope="${scope}" data-key="${k}" ${v ? "checked" : ""}><i></i></span></label>`;
    }
    const unit = c.unit || "";
    return `<label class="ctl"><span class="ctl-label">${esc(c.label)} <output class="ctl-val mono" data-out="${k}">${v}${unit ? " " + unit : ""}</output>
        ${c.hint ? `<span class="ctl-hint" data-hint="${k}">${esc(hintText(c, v))}</span>` : ""}</span>
      <input type="range" min="${c.min}" max="${c.max}" step="${c.step || 1}" value="${v}" data-scope="${scope}" data-key="${k}"></label>`;
  }
  function readValue(elm) {
    const { scope, key } = elm.dataset;
    let v;
    if (elm.type === "checkbox") v = elm.checked;
    else if (elm.dataset.val !== undefined) {
      const raw = elm.dataset.val;
      v = raw === "true" ? true : raw === "false" ? false : isFinite(raw) && raw !== "" ? Number(raw) : raw;
    } else v = Number(elm.value);
    if (scope === "link") sc.link[key] = PCT.has(key) ? v / 100 : v;
    else sc.options[key] = v;
    return { key, v };
  }
  let debounce;
  root.addEventListener("input", (e) => {
    const r = e.target.closest("input[type=range][data-key]");
    if (!r) return;
    const { key, v } = readValue(r);
    const c = LINK_CONTROLS[key] || (stack?.options || []).find((o) => o.key === key) || {};
    const out = root.querySelector(`[data-out="${key}"]`); if (out) out.textContent = v + (c.unit ? " " + c.unit : "");
    const hint = root.querySelector(`[data-hint="${key}"]`); if (hint && c.hint) hint.textContent = hintText(c, v);
    renderSummary();
    clearTimeout(debounce); debounce = setTimeout(() => rerun(true), 180);
  });
  root.addEventListener("change", (e) => {
    const c = e.target.closest("input[type=checkbox][data-key]");
    if (c) { readValue(c); rerun(true); }
  });
  root.addEventListener("click", (e) => {
    const seg = e.target.closest("button[data-key]");
    if (seg) {
      readValue(seg);
      seg.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === seg)));
      renderSummary();
      return rerun(true);
    }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "play") return playing ? pause() : play();
    if (act === "replay") { t = 0; play(); return; }
    if (act === "speed") { speedIdx = (speedIdx + 1) % SPEEDS.length; e.target.closest("button").textContent = SPEEDS[speedIdx] + "×"; return; }
    if (act === "reset") {
      sc = JSON.parse(JSON.stringify(base)); sc.link = { ...DEFAULT_LINK, ...(sc.link || {}) }; sc.options = sc.options || {};
      renderControls(); rerun(true); return;
    }
    const row = e.target.closest("[data-pk]");
    if (row) selectPacket(+row.dataset.pk, true);
  });
  scrub.addEventListener("input", () => { if (!trace) return; pause(); setTime(ladder.timeAt(+scrub.value / 1000)); });

  /* ── simulation & rendering ── */
  function rerun(animate) {
    if (!stack || destroyed) return;
    pause();
    try {
      trace = simulate(stack, { link: sc.link, drops: sc.drops || [], seed: sc.seed ?? 7, options: sc.options });
    } catch (err) {
      console.error(err);
      ladderHost.innerHTML = `<p class="sim-error">This simulation hit an error. Try different settings.</p>`;
      return;
    }
    opts.onTrace?.(trace, sc);
    ladder = mountLadder(ladderHost, trace, { onSelect: (p) => selectPacket(p.no, false), addr: (n) => ADDRESSES[n] || "" });
    renderStats();
    renderChart();
    renderLog();
    const firstInteresting = trace.packets.find((p) => p.lost) || trace.packets[0];
    selectPacket(firstInteresting?.no, false);
    if (animate && !reducedMotion()) { t = 0; if (!opts.mini) ladder.followPlayback(true); play(); }
    else setTime(trace.duration);
  }

  function renderStats() {
    const s = trace.summary || {};
    const head = HEADLINE[trace.stack] || ["done"];
    const keys = [...head, ...COMMON].filter((k) => s[k] != null && s[k] !== "");
    $("[data-stats]").innerHTML = keys.map((k) => `<div class="stat ${head.includes(k) && TIME_KEYS.test(k) ? "stat-primary" : ""} ${(k === "lost" || k === "retransmissions" || k === "rtoCount" || k === "inboundBlocked") && s[k] ? "stat-bad" : ""}">
      <span>${esc(METRICS[k] || k)}</span><b>${esc(fmtMetric(k, s[k]))}</b></div>`).join("")
      + (s.failed ? `<div class="stat stat-bad"><span>Result</span><b>failed</b></div>` : "")
      + (trace.truncated ? `<p class="sim-trunc">Stopped after ${fmtMs(trace.duration)} of simulated time. At this much loss, retransmission timers keep doubling, so finishing can take minutes. Lower the loss to see the whole exchange.</p>` : "");
  }
  function renderChart() {
    const box = $("[data-chart]");
    const keys = ["cwnd", "ssthresh", "rwnd"].filter((k) => trace.series[k]?.length);
    if (!keys.includes("cwnd")) { box.hidden = true; chart = null; return; }
    box.hidden = false;
    // TCP counts cwnd in segments; QUIC (RFC 9002) counts it in bytes.
    const unit = stack?.cwndUnit || (trace.stack === "http3" ? "bytes" : "segments");
    chart = seriesChart(box, trace.series, trace.duration, { title: `Congestion window (${unit})`, keys, labels: { cwnd: "cwnd", ssthresh: "ssthresh", rwnd: "rwnd" } });
  }
  function renderLog() {
    const items = [
      ...trace.packets.map((p) => ({ t: p.t, html: `<span class="log-t mono">${p.t.toFixed(1)}</span><i class="pk-swatch pk-${packetClass(p)}"></i><span class="log-dir">${esc(short(p.from))}→${esc(short(p.to))}</span><span class="log-l">${esc(p.label)}</span>${p.lost ? '<span class="tag tag-bad">lost</span>' : ""}`, pk: p.no })),
      ...trace.notes.map((n) => ({ t: n.t, html: `<span class="log-t mono">${n.t.toFixed(1)}</span><i class="note-dot note-${n.kind}"></i><span class="log-dir">${esc(short(n.node))}</span><span class="log-l log-note">${esc(n.text)}</span>` })),
    ].sort((a, b) => a.t - b.t);
    $("[data-logcount]").textContent = `(${trace.packets.length} packets)`;
    $("[data-log]").innerHTML = items.map((it) => `<div class="log-row" role="listitem" data-t="${it.t}" ${it.pk ? `data-pk="${it.pk}" tabindex="0"` : ""}>${it.html}</div>`).join("");
  }
  const short = (n) => ({ client: "C", server: "S", resolver: "DNS", printer: "PRN", gateway: "GW", dhcp: "DHCP", broadcast: "all" }[n] || n.toUpperCase());

  function selectPacket(no, scroll) {
    if (!trace || !no) { renderInspector(insp, null); return; }
    selected = no;
    ladder.select(no, { scroll });
    renderInspector(insp, trace.packets[no - 1], trace);
    root.querySelectorAll(".log-row.is-sel").forEach((r) => r.classList.remove("is-sel"));
    root.querySelector(`.log-row[data-pk="${no}"]`)?.classList.add("is-sel");
  }

  function setTime(nt) {
    t = Math.max(0, Math.min(nt, trace.duration));
    ladder.setTime(t, { autoscroll: playing });
    chart?.setTime(t);
    // The scrubber follows the drawing (collapsed idle gaps take little room), not raw time.
    scrub.value = Math.round(ladder.fractionAt(t) * 1000);
    scrub.style.setProperty("--p", (scrub.value / 10) + "%");
    timeEl.textContent = `${fmtMs(t)} / ${fmtMs(trace.duration)}`;
  }
  function frame(now) {
    if (!playing || destroyed) return;
    if (!root.isConnected) return destroy();
    const dt = Math.min(64, now - lastFrame); lastFrame = now;
    // Move evenly down the diagram: the whole run takes ≈ 7 s at 1×.
    const f = Math.min(1, ladder.fractionAt(t) + (dt / 7000) * SPEEDS[speedIdx]);
    setTime(f >= 1 ? trace.duration : Math.max(ladder.timeAt(f), t + 0.001));
    if (t >= trace.duration) {
      pause();
      // The home-page demo loops quietly.
      if (opts.mini && !reducedMotion()) loopTimer = setTimeout(() => { if (!destroyed && root.isConnected) { t = 0; play(); } }, 2400);
      return;
    }
    raf = requestAnimationFrame(frame);
  }
  function play() {
    if (!trace) return;
    if (t >= trace.duration) t = 0;
    playing = true; root.classList.add("is-playing");
    playBtn.innerHTML = ICON.pause; playBtn.setAttribute("aria-label", "Pause");
    lastFrame = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function pause() {
    playing = false; cancelAnimationFrame(raf); root.classList.remove("is-playing");
    playBtn.innerHTML = ICON.play; playBtn.setAttribute("aria-label", "Play");
    ladder?.followPlayback(false);
  }
  function destroy() { destroyed = true; clearTimeout(loopTimer); pause(); }

  // Re-layout the diagram when the container width changes meaningfully.
  let lastW = 0;
  const ro = new ResizeObserver(() => {
    const w = ladderHost.clientWidth;
    if (trace && Math.abs(w - lastW) > 40) {
      lastW = w;
      const keep = t;
      ladder = mountLadder(ladderHost, trace, { onSelect: (p) => selectPacket(p.no, false), addr: (n) => ADDRESSES[n] || "" });
      setTime(keep);
      if (selected) ladder.select(selected);
    }
  });

  loadStack(sc.stack).then((s) => {
    if (destroyed) return;
    if (!s) { ladderHost.innerHTML = `<p class="sim-error">Couldn't load the ${esc(sc.stack)} model.</p>`; return; }
    stack = s;
    renderControls();
    lastW = ladderHost.clientWidth;
    rerun(!!opts.mini);
    ro.observe(ladderHost);
  });

  return {
    root,
    destroy() { destroy(); ro.disconnect(); },
    get trace() { return trace; },
    get scenario() { return sc; },
    /** Replace parts of the scenario (stack/options/link) and re-run. */
    async update(next, { animate = true } = {}) {
      if (next.stack && next.stack !== sc.stack) {
        stack = await loadStack(next.stack);
        sc.options = {};
      }
      Object.assign(sc, { ...next, link: { ...sc.link, ...(next.link || {}) }, options: { ...sc.options, ...(next.options || {}) } });
      renderControls();
      rerun(animate);
    },
    play, pause,
  };
}
