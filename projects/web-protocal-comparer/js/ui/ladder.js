// Ladder (sequence) diagram for a simulation trace, with time-based playback.
// One vertical lane per node, time flowing down; every packet hop is an arrow
// from (sender, send time) to (receiver, arrival time). Lost hops stop midway.
import { esc } from "../util.js";

const NS = "http://www.w3.org/2000/svg";
const LABEL = { client: "Client", server: "Server", resolver: "DNS resolver", r1: "Router 1", r2: "Router 2", r3: "Router 3", r4: "Router 4" };

export function packetClass(p) {
  if (p.lost) return "lost";
  if (p.retx) return "retx";
  const k = p.kind;
  if (["SYN", "SYN-ACK", "FIN", "UPGRADE", "101", "INITIAL", "HANDSHAKE", "CLOSE"].includes(k)) return "hand";
  if (k === "ACK" || k === "PONG" || (k === "ACK" && !p.size)) return "ack";
  if (k === "TLS") return "tls";
  if (["ECHO", "ECHO-REPLY", "TIME-EXCEEDED"].includes(k)) return "icmp";
  if (k === "PING") return "ctrl";
  return "data";
}
export const nodeLabel = (n) => LABEL[n] || n;

const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

function niceStep(ms) {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
  return steps.find((s) => s >= ms) || 20000;
}

/**
 * mountLadder(host, trace, { onSelect(pkt), addr(node) })
 * → { setTime(t), select(no), destroy(), height }
 */
export function mountLadder(host, trace, { onSelect, addr = () => "" } = {}) {
  host.innerHTML = "";
  host.classList.add("ladder");
  const nodes = trace.nodes;
  const rtt = Math.max(2, trace.link.latency * 2);
  const duration = Math.max(trace.duration, rtt * 0.5);
  const width = Math.max(300, host.clientWidth || 600);
  const narrow = width < 520;
  // Scale so one round trip is ~120 px, but keep very long traces within reason.
  let pxPerMs = (narrow ? 104 : 124) / rtt;
  const maxH = 4200;
  if (duration * pxPerMs > maxH) pxPerMs = maxH / duration;
  const top = 18, bottom = 30;
  const height = Math.ceil(duration * pxPerMs) + top + bottom;
  const axisW = narrow ? 34 : 50;
  const margin = narrow ? 34 : 70;
  const laneX = (i) => nodes.length === 1 ? width / 2
    : axisW + margin + (i * (width - axisW - margin * 2)) / (nodes.length - 1);
  const X = Object.fromEntries(nodes.map((n, i) => [n, laneX(i)]));
  const Y = (t) => top + t * pxPerMs;

  // Lane headers (HTML, sticky)
  const head = document.createElement("div");
  head.className = "ladder-head";
  head.innerHTML = nodes.map((n) => `<div class="lane-tag" style="left:${(X[n] / width) * 100}%">
      <b>${esc(nodeLabel(n))}</b><span>${esc(addr(n))}</span></div>`).join("");
  host.appendChild(head);

  const scroller = document.createElement("div");
  scroller.className = "ladder-scroll";
  host.appendChild(scroller);
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width, height, class: "ladder-svg", role: "img",
    "aria-label": `Sequence diagram: ${trace.packets.length} packets between ${nodes.map(nodeLabel).join(", ")} over ${Math.round(duration)} ms` });
  scroller.appendChild(svg);

  const defs = el("defs", {}, svg);
  for (const c of ["hand", "data", "ack", "tls", "retx", "lost", "icmp", "ctrl", "sel"]) {
    const m = el("marker", { id: `arr-${c}-${host.id || "x"}`, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
    el("path", { d: "M0,1 L10,5 L0,9 z", class: `pk-fill pk-${c}` }, m);
  }
  const mid = (c) => `url(#arr-${c}-${host.id || "x"})`;

  // Time axis & grid
  const gAxis = el("g", { class: "ladder-axis" }, svg);
  const step = niceStep((narrow ? 46 : 40) / pxPerMs);
  for (let t = 0; t <= duration + 0.01; t += step) {
    el("line", { x1: axisW - 4, x2: width, y1: Y(t), y2: Y(t), class: "grid" }, gAxis);
    const tx = el("text", { x: axisW - 8, y: Y(t) + 3.5, class: "tick" }, gAxis);
    tx.textContent = t >= 1000 && step >= 100 ? (t / 1000).toFixed(t % 1000 ? 1 : 0) + "s" : Math.round(t) + (t === 0 ? " ms" : "");
  }
  // Lanes
  const gLanes = el("g", {}, svg);
  nodes.forEach((n) => el("line", { x1: X[n], x2: X[n], y1: top - 10, y2: height - 8, class: "lane" + (n.startsWith("r") ? " lane-router" : "") }, gLanes));

  // Marks (horizontal dashed lines)
  const gMarks = el("g", {}, svg);
  // Marks that land on (nearly) the same line share one label, e.g. "first resource · page loaded".
  const merged = [];
  [...trace.marks].sort((a, b) => a.t - b.t).forEach((m) => {
    const last = merged[merged.length - 1];
    if (last && Math.abs(Y(m.t) - Y(last.t)) < 12) last.label += " · " + m.label;
    else merged.push({ ...m });
  });
  merged.forEach((m) => {
    const g = el("g", { class: "mark", "data-t": m.t }, gMarks);
    el("line", { x1: axisW, x2: width - 4, y1: Y(m.t), y2: Y(m.t) }, g);
    const tx = el("text", { x: width - 6, y: Y(m.t) - 4 }, g);
    tx.textContent = m.label;
  });

  // Packets
  const gPk = el("g", {}, svg);
  const many = trace.packets.length > 36;
  const veryMany = trace.packets.length > 90;
  const pkEls = [];
  const hops = [];
  const labelYs = new Map(); // direction → y of labels already placed
  for (const p of trace.packets) {
    const c = packetClass(p);
    const g = el("g", { class: `pk pk-${c}`, "data-no": p.no, tabindex: -1 }, gPk);
    const h = { p, g, segs: [] };
    p.hops.forEach((hop, hi) => {
      const x1 = X[hop.from], y1 = Y(hop.t0);
      let x2 = X[hop.to], y2 = Y(hop.t1);
      if (hop.lost) { x2 = (x1 + x2) / 2; }
      const hit = el("line", { x1, y1, x2, y2, class: "hit" }, g);
      const line = el("line", { x1, y1, x2, y2, class: "arrow", "marker-end": hop.lost ? "" : mid(c) }, g);
      const seg = { hop, x1, y1, x2, y2, line, hit, lostMark: null, dot: null };
      if (hop.lost) {
        const lm = el("g", { class: "lost-x", transform: `translate(${x2},${y2})` }, g);
        el("path", { d: "M-5,-5 L5,5 M5,-5 L-5,5" }, lm);
        seg.lostMark = lm;
      }
      seg.dot = el("circle", { r: 3.6, class: "dot" }, g);
      h.segs.push(seg);
      hops.push(seg);
      // Label once per packet, on its first hop, along the arrow.
      if (hi === 0) {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        // Skip labels that would sit on top of a nearby one going the same way; the packet stays clickable.
        const dirKey = hop.from + ">" + hop.to;
        const crowded = labelYs.get(dirKey)?.some((y) => Math.abs(y - my) < (narrow ? 15 : 13));
        const showLabel = !crowded && !(veryMany && c === "ack") && !(narrow && many && c === "ack");
        if (showLabel) {
          (labelYs.get(dirKey) || labelYs.set(dirKey, []).get(dirKey)).push(my);
          const ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
          const flip = ang > 90 || ang < -90;
          const tx = el("text", { class: "pk-label", x: mx, y: my - 5,
            transform: `rotate(${flip ? ang + 180 : ang} ${mx} ${my})` }, g);
          tx.textContent = p.label;
          h.label = tx;
        }
      }
    });
    const title = el("title", {}, g);
    title.textContent = `#${p.no} ${p.label} — ${nodeLabel(p.from)} → ${nodeLabel(p.to)}, sent ${p.t.toFixed(1)} ms${p.lost ? ", lost" : p.arrived != null ? `, arrived ${p.arrived.toFixed(1)} ms` : ""}`;
    pkEls.push(h);
  }

  // Notes and deliveries
  const gNotes = el("g", {}, svg);
  const noteYs = new Map(); // lane → y of note texts already placed
  const notes = trace.notes.map((n) => {
    const x = X[n.node] ?? X[nodes[0]];
    const left = nodes.indexOf(n.node) === 0;
    const g = el("g", { class: `note note-${n.kind}`, "data-t": n.t }, gNotes);
    el("circle", { cx: x, cy: Y(n.t), r: narrow ? 3.5 : 3 }, g);
    // No room beside the lanes on phones: notes are dots there (text is in the event log and the tooltip).
    const laneNotes = noteYs.get(n.node) || noteYs.set(n.node, []).get(n.node);
    const clash = laneNotes.some((y) => Math.abs(y - Y(n.t)) < 12);
    if (narrow || clash) { const t2 = el("title", {}, g); t2.textContent = n.text; }
    else if (n.kind !== "info" || !many) {
      laneNotes.push(Y(n.t));
      const tx = el("text", { x: left ? x - 8 : x + 8, y: Y(n.t) + 3.5, "text-anchor": left ? "end" : "start" }, g);
      const max = narrow ? 11 : 22;
      tx.textContent = n.text.length > max ? n.text.slice(0, max - 1) + "…" : n.text;
      const t2 = el("title", {}, g); t2.textContent = n.text;
    }
    return { n, g };
  });
  const dels = trace.deliveries.map((d) => {
    const x = X[d.node] ?? X[nodes[0]];
    const g = el("g", { class: "delivery", "data-t": d.t }, gNotes);
    el("rect", { x: x - 4, y: Y(d.t) - 4, width: 8, height: 8, transform: `rotate(45 ${x} ${Y(d.t)})` }, g);
    const t2 = el("title", {}, g); t2.textContent = `App received ${d.label || (d.bytes ? d.bytes + " bytes" : "data")} at ${d.t.toFixed(1)} ms`;
    return { d, g };
  });

  // Playhead
  const head2 = el("g", { class: "playhead" }, svg);
  const phLine = el("line", { x1: axisW, x2: width, y1: top, y2: top }, head2);
  const phText = el("text", { x: axisW + 4, y: top - 4 }, head2);

  let selected = null;
  function select(no, { scroll = false } = {}) {
    if (selected) selected.g.classList.remove("is-selected");
    selected = pkEls.find((h) => h.p.no === no) || null;
    if (selected) {
      selected.g.classList.add("is-selected");
      if (scroll) {
        const y = selected.segs[0].y1;
        if (y < scroller.scrollTop || y > scroller.scrollTop + scroller.clientHeight - 40) scroller.scrollTop = y - 60;
      }
    }
  }
  svg.addEventListener("click", (e) => {
    const g = e.target.closest(".pk");
    if (!g) return;
    const no = +g.dataset.no;
    select(no);
    onSelect?.(trace.packets[no - 1]);
  });

  let follow = false;
  function setTime(t, { autoscroll = false } = {}) {
    const y = Y(t);
    phLine.setAttribute("y1", y); phLine.setAttribute("y2", y);
    phText.setAttribute("y", y - 4);
    phText.textContent = t.toFixed(0) + " ms";
    head2.style.display = t >= duration ? "none" : "";
    for (const s of hops) {
      const { hop } = s;
      if (t < hop.t0) { s.line.style.display = s.hit.style.display = "none"; s.dot.style.display = "none"; if (s.lostMark) s.lostMark.style.display = "none"; continue; }
      s.line.style.display = s.hit.style.display = "";
      const end = hop.lost ? hop.t0 + (hop.t1 - hop.t0) : hop.t1;
      if (t >= end) {
        s.line.setAttribute("x2", s.x2); s.line.setAttribute("y2", s.y2);
        s.dot.style.display = "none";
        if (s.lostMark) s.lostMark.style.display = "";
      } else {
        const f = (t - hop.t0) / Math.max(1e-9, end - hop.t0);
        const x = s.x1 + (s.x2 - s.x1) * f, yy = s.y1 + (s.y2 - s.y1) * f;
        s.line.setAttribute("x2", x); s.line.setAttribute("y2", yy);
        s.dot.setAttribute("cx", x); s.dot.setAttribute("cy", yy);
        s.dot.style.display = "";
        if (s.lostMark) s.lostMark.style.display = "none";
      }
    }
    for (const h of pkEls) {
      const vis = t >= h.p.t;
      h.g.classList.toggle("is-future", !vis);
      if (h.label) h.label.style.display = vis && t >= h.segs[0].hop.t0 + (h.segs[0].hop.t1 - h.segs[0].hop.t0) * 0.5 ? "" : "none";
    }
    notes.forEach(({ n, g }) => { g.style.display = t >= n.t ? "" : "none"; });
    dels.forEach(({ d, g }) => { g.style.display = t >= d.t ? "" : "none"; });
    gMarks.querySelectorAll(".mark").forEach((m) => { m.style.display = t >= +m.dataset.t ? "" : "none"; });
    if (autoscroll && follow) {
      const target = y - scroller.clientHeight * 0.6;
      if (target > scroller.scrollTop) scroller.scrollTop = target;
    }
  }
  function followPlayback(on) { follow = on; if (on) scroller.scrollTop = 0; }

  return { setTime, select, followPlayback, duration, destroy() { host.innerHTML = ""; } };
}
