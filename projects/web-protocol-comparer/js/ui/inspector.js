// Packet inspector: per-layer header fields with a linked hex dump.
import { esc, fmtMs, ICON } from "../util.js";

const ICON_LOCK = ICON.lock.replace("<svg", '<svg width="11" height="11" style="display:inline;vertical-align:-1px"');
import { nodeLabel, packetClass } from "./ladder.js";

let headers = null;
const headersReady = import("../sim/headers.js").then((m) => { headers = m; }).catch((e) => console.error("headers.js failed to load", e));

const LAYER_TONE = { ipv4: "ip", ip: "ip", icmp: "icmp", udp: "l4", tcp: "l4", dns: "app", tls: "tls", "tls-record": "tls", http: "app", http1: "app", http2: "app", quic: "l4", websocket: "app", ws: "app" };

export function renderInspector(host, pkt, trace) {
  if (!pkt) { host.innerHTML = `<p class="faint insp-empty">Select a packet on the diagram to inspect it.</p>`; return; }
  const cls = packetClass(pkt);
  const status = pkt.blocked
    ? `<span class="tag tag-bad">dropped by ${esc(nodeLabel(pkt.blocked, trace))}</span>`
    : pkt.lost
    ? `<span class="tag tag-bad">lost${pkt.scripted ? " (staged)" : ""}</span>`
    : pkt.expired ? `<span class="tag tag-bad">TTL expired at ${esc(nodeLabel(pkt.expired, trace))}</span>`
    : pkt.arrived != null ? `<span class="tag">arrived ${fmtMs(pkt.arrived)}</span>` : "";
  host.innerHTML = `
    <div class="insp-head">
      <div class="insp-title"><i class="pk-swatch pk-${cls}"></i><b>${esc(pkt.label)}</b></div>
      <div class="insp-meta">#${pkt.no} · ${esc(nodeLabel(pkt.from, trace))} → ${pkt.broadcast ? "everyone (broadcast)" : esc(nodeLabel(pkt.to, trace))} · ${pkt.size} B · sent ${fmtMs(pkt.t)} ${status} ${pkt.retx ? '<span class="tag tag-warn">retransmission</span>' : ""}</div>
      ${pkt.nat ? `<div class="insp-nat"><b>NAT ${pkt.nat.dir === "out" ? "rewrote the source" : pkt.nat.forwarded ? "port-forwarded" : "translated back"}</b> <code>${esc(pkt.nat.before)}</code> → <code>${esc(pkt.nat.after)}</code></div>` : ""}
      ${pkt.blocked ? `<div class="insp-nat insp-bad">No NAT mapping matched this inbound packet, so the router discarded it.</div>` : ""}
      ${headers?.describePacket ? `<code class="insp-sum">${esc(safeCall(() => headers.describePacket(pkt), ""))}</code>` : ""}
    </div>
    <div class="insp-layers" data-layers><p class="faint">Decoding…</p></div>`;
  const draw = () => {
    const box = host.querySelector("[data-layers]");
    if (!box) return;
    if (!headers) { box.innerHTML = `<p class="faint">Header details are unavailable.</p>`; return; }
    const layers = safeCall(() => headers.encodeLayers(pkt), []);
    if (!layers.length) { box.innerHTML = `<p class="faint">No header details for this packet.</p>`; return; }
    box.innerHTML = layers.map((L, li) => `
      <details class="layer layer-${LAYER_TONE[L.id] || "app"}" ${li >= layers.length - 2 ? "open" : ""}>
        <summary><span class="layer-name">${esc(L.name)}${L.decrypted ? ` <span class="tag tag-good" title="Shown decrypted. On the wire these bytes are encrypted inside the layer above.">${ICON_LOCK} decrypted view</span>` : ""}</span><span class="layer-len">${L.totalLength ?? L.bytes?.length ?? 0} B</span></summary>
        <table class="fields"><tbody>${L.fields.map((f, fi) => `
          <tr data-l="${li}" data-f="${fi}" tabindex="0"><th>${esc(f.name)}</th><td><code>${esc(f.value)}</code>${f.desc ? `<span class="fdesc">${esc(f.desc)}</span>` : ""}</td></tr>`).join("")}
        </tbody></table>
        ${L.bytes?.length ? `<div class="hex" aria-label="${esc(L.name)} bytes">${hexHtml(L, li)}</div>` : ""}
      </details>`).join("");
    // Hover/focus a field → highlight its bytes.
    const hl = (row, on) => {
      const L = layers[+row.dataset.l], f = L.fields[+row.dataset.f];
      if (f.offset == null || !f.length) return;
      for (let i = f.offset; i < f.offset + f.length; i++) box.querySelector(`[data-b="${row.dataset.l}-${i}"]`)?.classList.toggle("on", on);
    };
    box.querySelectorAll("tr[data-l]").forEach((row) => {
      row.addEventListener("mouseenter", () => hl(row, true));
      row.addEventListener("mouseleave", () => hl(row, false));
      row.addEventListener("focus", () => hl(row, true));
      row.addEventListener("blur", () => hl(row, false));
    });
  };
  if (headers) draw(); else headersReady.then(draw);
}

function hexHtml(L, li) {
  const b = L.bytes;
  let out = "";
  for (let i = 0; i < b.length; i += 16) {
    out += `<div class="hex-row"><span class="hex-off">${i.toString(16).padStart(4, "0")}</span><span class="hex-bytes">`;
    for (let j = i; j < Math.min(i + 16, b.length); j++) out += `<span data-b="${li}-${j}">${(b[j] & 255).toString(16).padStart(2, "0")}</span>`;
    out += `</span><span class="hex-ascii">`;
    for (let j = i; j < Math.min(i + 16, b.length); j++) { const c = b[j] & 255; out += esc(c >= 32 && c < 127 ? String.fromCharCode(c) : "."); }
    out += `</span></div>`;
  }
  if (L.truncated) out += `<div class="hex-more">… ${L.totalLength - b.length} more bytes</div>`;
  return out;
}

function safeCall(fn, fallback) {
  try { return fn(); } catch (e) { console.error(e); return fallback; }
}
