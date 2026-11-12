// Pcap workspace: a Wireshark-like packet viewer with display filters,
// a details tree, a payload dump and Follow Stream. Text only, no innerHTML.
import { el } from "../ui.js";

const UDP_PROTOS = new Set(["UDP", "DNS", "DHCP", "NTP", "SNMP", "TFTP", "SYSLOG", "MDNS", "LLMNR", "NBNS", "QUIC"]);
const NO_PORTS = new Set(["ICMP", "ARP", "ICMPV6"]);
const KNOWN = ["ip", "tcp", "udp", "http", "ftp", "ftp-data", "dns", "tls", "ssl", "telnet", "smtp", "icmp", "ssh", "arp", "pop", "imap", "smb", "dhcp", "ntp", "snmp", "tftp"];
const FULL = {
  HTTP: "Hypertext Transfer Protocol", FTP: "File Transfer Protocol (FTP)", "FTP-DATA": "FTP Data",
  DNS: "Domain Name System", TLS: "Transport Layer Security", TELNET: "Telnet",
  SMTP: "Simple Mail Transfer Protocol", ICMP: "Internet Control Message Protocol", SSH: "SSH Protocol",
  POP: "Post Office Protocol", IMAP: "Internet Message Access Protocol", SMB: "SMB (Server Message Block Protocol)",
};
const IP_NUM = { TCP: 6, UDP: 17, ICMP: 1 };
const FLAG_NAMES = { F: "FIN", S: "SYN", R: "RST", P: "PSH", A: "ACK", U: "URG" };
const FLAG_BITS = { F: 0x01, S: 0x02, R: 0x04, P: 0x08, A: 0x10, U: 0x20 };

/* ── helpers ─────────────────────────────────────────────────────── */
function toBytes(s) {
  s = String(s ?? "");
  if (!/[^\u0000-ÿ]/.test(s)) {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  return new TextEncoder().encode(s);
}
const hex2 = (b) => b.toString(16).padStart(2, "0");
const printable = (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".");

function transportOf(p) {
  const pr = p.proto;
  if (NO_PORTS.has(pr)) return null;
  if (UDP_PROTOS.has(pr)) return "UDP";
  return "TCP";
}
function flagsOf(p) {
  if (p.transport !== "TCP") return "";
  if (p.flags) return String(p.flags).toUpperCase();
  const info = String(p.info || "").toUpperCase();
  const found = ["SYN", "FIN", "RST", "PSH", "ACK", "URG"].filter((n) => new RegExp(`\\b${n}\\b`).test(info));
  if (found.length) return found.map((n) => n[0]).join("");
  return p.bytes.length ? "PA" : "A";
}
function ipMatch(addr, pattern) {
  const m = pattern.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (!m) return addr === pattern;
  const toInt = (ip) => ip.split(".").reduce((a, o) => ((a << 8) | (+o & 255)) >>> 0, 0);
  const bits = +m[2];
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(addr)) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((toInt(addr) & mask) >>> 0) === ((toInt(m[1]) & mask) >>> 0);
}

/* ── display filter compiler ─────────────────────────────────────── */
function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const two = src.slice(i, i + 2);
    if (["&&", "||", "==", "!=", ">=", "<="].includes(two)) { toks.push({ t: "op", v: two }); i += 2; continue; }
    if ("!()<>".includes(c)) { toks.push({ t: "op", v: c }); i++; continue; }
    if (c === "=") throw new Error('Use "==" to compare');
    if (c === '"' || c === "'") {
      let j = i + 1, s = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) {
          const n = src[j + 1];
          if (n === "x" && /^[0-9a-f]{2}$/i.test(src.slice(j + 2, j + 4))) { s += String.fromCharCode(parseInt(src.slice(j + 2, j + 4), 16)); j += 4; continue; }
          s += n === "n" ? "\n" : n === "r" ? "\r" : n === "t" ? "\t" : n;
          j += 2; continue;
        }
        s += src[j++];
      }
      if (j >= src.length) throw new Error("Unterminated string");
      toks.push({ t: "str", v: s });
      i = j + 1; continue;
    }
    const m = src.slice(i).match(/^[A-Za-z0-9_.:\-/]+/);
    if (!m) throw new Error(`Unexpected "${c}"`);
    toks.push({ t: "word", v: m[0] });
    i += m[0].length;
  }
  return toks;
}

const FIELDS = {
  "ip.addr": { kind: "ip", get: (p) => [p.src, p.dst] },
  "ip.src": { kind: "ip", get: (p) => [p.src] },
  "ip.dst": { kind: "ip", get: (p) => [p.dst] },
  "ip.src_host": { kind: "ip", get: (p) => [p.src] },
  "ip.dst_host": { kind: "ip", get: (p) => [p.dst] },
  "tcp.port": { kind: "num", get: (p) => (p.transport === "TCP" ? [p.sport, p.dport] : []) },
  "tcp.srcport": { kind: "num", get: (p) => (p.transport === "TCP" ? [p.sport] : []) },
  "tcp.dstport": { kind: "num", get: (p) => (p.transport === "TCP" ? [p.dport] : []) },
  "udp.port": { kind: "num", get: (p) => (p.transport === "UDP" ? [p.sport, p.dport] : []) },
  "udp.srcport": { kind: "num", get: (p) => (p.transport === "UDP" ? [p.sport] : []) },
  "udp.dstport": { kind: "num", get: (p) => (p.transport === "UDP" ? [p.dport] : []) },
  "frame.len": { kind: "num", get: (p) => [p.len] },
  "frame.number": { kind: "num", get: (p) => [p.no] },
  "frame.time_relative": { kind: "num", get: (p) => [p.t] },
  "tcp.len": { kind: "num", get: (p) => (p.transport === "TCP" ? [p.bytes.length] : []) },
};
const PAYLOAD_FIELDS = new Set(["frame", "data", "tcp.payload", "udp.payload", "payload"]);

export function compileFilter(src, protosPresent = new Set()) {
  const toks = tokenize(String(src || ""));
  if (!toks.length) return () => true;
  let i = 0;
  const peek = () => toks[i];
  const isWord = (w) => toks[i] && toks[i].t === "word" && toks[i].v.toLowerCase() === w;
  const isOp = (o) => toks[i] && toks[i].t === "op" && toks[i].v === o;
  const need = (what) => { if (!toks[i]) throw new Error(`Expected ${what} at end of filter`); return toks[i++]; };

  function orExpr() {
    let a = andExpr();
    while (isOp("||") || isWord("or")) { i++; const l = a, r = andExpr(); a = (p) => l(p) || r(p); }
    return a;
  }
  function andExpr() {
    let a = notExpr();
    while (isOp("&&") || isWord("and")) { i++; const l = a, r = notExpr(); a = (p) => l(p) && r(p); }
    return a;
  }
  function notExpr() {
    if (isOp("!") || isWord("not")) { i++; const e = notExpr(); return (p) => !e(p); }
    return primary();
  }
  function stringArg() {
    const t = need("a quoted string");
    if (t.t !== "str" && t.t !== "word") throw new Error('contains needs a value, e.g. contains "pass"');
    return t.v;
  }
  function primary() {
    const t = need("an expression");
    if (t.t === "op" && t.v === "(") {
      const e = orExpr();
      if (!isOp(")")) throw new Error('Missing ")"');
      i++;
      return e;
    }
    if (t.t !== "word") throw new Error(`Unexpected ${t.t === "str" ? "string" : `"${t.v}"`}`);
    const name = t.v.toLowerCase();
    if (name === "contains" || name === "matches") return payloadTest(name, "frame");
    if (isWord("contains") || isWord("matches")) { const op = peek().v.toLowerCase(); i++; return payloadTest(op, name); }
    const opTok = peek();
    const cmp = opTok && ((opTok.t === "op" && ["==", "!=", ">", "<", ">=", "<="].includes(opTok.v)) || (opTok.t === "word" && ["eq", "ne", "gt", "lt", "ge", "le"].includes(opTok.v.toLowerCase())));
    if (FIELDS[name]) {
      const f = FIELDS[name];
      if (!cmp) return (p) => f.get(p).length > 0; // field present
      i++;
      const op = { eq: "==", ne: "!=", gt: ">", lt: "<", ge: ">=", le: "<=" }[opTok.v.toLowerCase()] || opTok.v;
      const vt = need("a value");
      if (vt.t === "op") throw new Error(`Expected a value after ${op}`);
      if (f.kind === "ip") {
        const v = vt.v;
        if (!/^\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?$/.test(v) && !/^[a-z0-9.-]+$/i.test(v)) throw new Error(`"${v}" is not a valid IP address`);
        if (op !== "==" && op !== "!=") throw new Error(`${name} only supports == and !=`);
        const eq = (p) => f.get(p).some((a) => ipMatch(String(a), v));
        return op === "==" ? eq : (p) => !eq(p);
      }
      const n = Number(vt.v);
      if (!Number.isFinite(n)) throw new Error(`"${vt.v}" is not a number`);
      const test = { "==": (a) => a === n, "!=": (a) => a !== n, ">": (a) => a > n, "<": (a) => a < n, ">=": (a) => a >= n, "<=": (a) => a <= n }[op];
      if (op === "!=") return (p) => !f.get(p).some((a) => Number(a) === n);
      return (p) => f.get(p).some((a) => test(Number(a)));
    }
    if (cmp) throw new Error(`Unknown field "${t.v}"`);
    return protoTest(name, t.v);
  }
  function protoTest(name, orig) {
    if (name === "ip") return () => true;
    if (name === "tcp") return (p) => p.transport === "TCP";
    if (name === "udp") return (p) => p.transport === "UDP";
    const want = name === "ssl" ? "TLS" : name.toUpperCase();
    if (!KNOWN.includes(name) && !protosPresent.has(want)) throw new Error(`"${orig}" is neither a field nor a protocol`);
    return (p) => p.proto === want;
  }
  function payloadTest(op, field) {
    const needle = stringArg();
    let base;
    if (PAYLOAD_FIELDS.has(field)) base = () => true;
    else base = protoTest(field, field);
    if (op === "matches") {
      let re;
      try { re = new RegExp(needle, "i"); } catch (e) { throw new Error("Bad regex: " + e.message); }
      return (p) => base(p) && re.test(p.text);
    }
    return (p) => base(p) && p.text.includes(needle);
  }

  const fn = orExpr();
  if (i < toks.length) throw new Error(`Unexpected "${toks[i].v}"`);
  return fn;
}

/* ── mount ───────────────────────────────────────────────────────── */
export function mount(host, env, api = {}) {
  const packets = ((env && env.packets) || [])
    .map((p, k) => ({ ...p, _k: k }))
    .sort((a, b) => (a.t ?? 0) - (b.t ?? 0) || a._k - b._k)
    .map((p, k) => {
      const proto = String(p.proto || "TCP").toUpperCase();
      const text = String(p.data ?? "");
      const bytes = toBytes(text);
      const q = { ...p, proto, no: k + 1, t: Number(p.t) || 0, text, bytes, len: p.len ?? 54 + bytes.length };
      q.transport = transportOf(q);
      q.flagStr = flagsOf(q);
      return q;
    });
  const protos = new Set(packets.map((p) => p.proto));

  /* toolbar */
  const input = el("input", {
    class: "pc-filter", type: "text", spellcheck: "false", autocomplete: "off",
    placeholder: 'Display filter, e.g. ftp || ip.addr == 10.0.0.5 && contains "PASS"',
    "aria-label": "Display filter", value: env?.filter || "",
  });
  const applyBtn = el("button", { class: "pc-btn pc-primary", type: "button", on: { click: () => apply() } }, "Apply");
  const clearBtn = el("button", { class: "pc-btn", type: "button", title: "Clear filter", "aria-label": "Clear filter", on: { click: () => { input.value = ""; validate(); apply(); } } }, "Clear");
  const followBtn = el("button", { class: "pc-btn", type: "button", disabled: true, on: { click: () => follow() } }, "Follow stream");
  const status = el("div", { class: "pc-status", "aria-live": "polite" });
  const bar = el("div", { class: "pc-bar" }, el("div", { class: "pc-fwrap" }, input, applyBtn, clearBtn), followBtn);

  /* list */
  const tbody = el("tbody");
  const table = el("table", { class: "pc-table" },
    el("thead", {}, el("tr", {}, ["No.", "Time", "Source", "Destination", "Protocol", "Length", "Info"].map((h) =>
      el("th", { text: h, class: "pc-c-" + h.toLowerCase().replace(/\W/g, "") })))),
    tbody);
  const listBox = el("div", { class: "pc-list", tabindex: "0", "aria-label": "Packet list" }, table);

  /* details + bytes */
  const details = el("div", { class: "pc-details", "aria-label": "Packet details" }, el("div", { class: "pc-empty", text: "Select a packet to see its details." }));
  const bytesBox = el("div", { class: "pc-bytes", "aria-label": "Packet bytes" });
  const lower = el("div", { class: "pc-lower" },
    el("div", { class: "pc-pane" }, el("div", { class: "pc-pane-h", text: "Packet details" }), details),
    el("div", { class: "pc-pane" }, el("div", { class: "pc-pane-h", text: "Payload bytes" }), bytesBox));

  const menu = el("div", { class: "pc-menu", role: "menu", hidden: true });
  const shell = el("div", { class: "pc-shell" }, bar, listBox, status, lower, menu);
  const root = el("div", { class: "pc" }, shell);
  host.append(root);

  const rows = packets.map((p) => {
    const tr = el("tr", { class: "pc-row", dataset: { proto: p.proto.toLowerCase(), no: String(p.no) } },
      el("td", { class: "pc-c-no", text: String(p.no) }),
      el("td", { class: "pc-c-time", text: p.t.toFixed(6) }),
      el("td", { class: "pc-c-source", text: p.src || "" }),
      el("td", { class: "pc-c-destination", text: p.dst || "" }),
      el("td", { class: "pc-c-protocol", text: p.proto }),
      el("td", { class: "pc-c-length", text: String(p.len) }),
      el("td", { class: "pc-c-info", text: infoOf(p) }));
    tr.addEventListener("click", () => select(p));
    tr.addEventListener("dblclick", () => { select(p); if (p.transport) follow(); });
    tr.addEventListener("contextmenu", (e) => { e.preventDefault(); select(p); openMenu(e); });
    tbody.append(tr);
    return tr;
  });

  let visible = packets.slice();
  let selected = null;

  function infoOf(p) {
    if (p.info) return p.info;
    if (p.transport === "TCP" && p.proto === "TCP") return `${p.sport} → ${p.dport} [${p.flagStr.split("").map((f) => FLAG_NAMES[f] || f).join(", ")}] Len=${p.bytes.length}`;
    const first = p.text.split(/\r?\n/)[0];
    return first || `${p.sport ?? ""} → ${p.dport ?? ""}`;
  }

  function validate() {
    try {
      compileFilter(input.value, protos);
      input.classList.toggle("pc-ok", !!input.value.trim());
      input.classList.remove("pc-bad");
      input.title = "";
      return true;
    } catch (e) {
      input.classList.add("pc-bad");
      input.classList.remove("pc-ok");
      input.title = e.message;
      return e.message;
    }
  }
  function apply() {
    let fn;
    try { fn = compileFilter(input.value, protos); }
    catch (e) { validate(); status.textContent = "Invalid filter: " + e.message; status.dataset.tone = "bad"; return false; }
    validate();
    visible = [];
    packets.forEach((p, k) => {
      let ok = false;
      try { ok = !!fn(p); } catch { ok = false; }
      rows[k].hidden = !ok;
      if (ok) visible.push(p);
    });
    status.dataset.tone = "";
    status.textContent = `Packets: ${packets.length} · Displayed: ${visible.length}${input.value.trim() ? ` (${packets.length ? ((visible.length / packets.length) * 100).toFixed(1) : 0}%)` : ""}`;
    if (selected && !visible.includes(selected)) select(null);
    return true;
  }
  input.addEventListener("input", validate);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } });

  listBox.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    if (!visible.length) return;
    const k = selected ? visible.indexOf(selected) : -1;
    const next = visible[Math.max(0, Math.min(visible.length - 1, k + (e.key === "ArrowDown" ? 1 : -1)))];
    select(next);
    rows[next.no - 1].scrollIntoView({ block: "nearest" });
  });

  function select(p) {
    if (selected) rows[selected.no - 1].classList.remove("pc-sel");
    selected = p;
    followBtn.disabled = !(p && p.transport);
    followBtn.textContent = p && p.transport ? `Follow ${p.transport} stream` : "Follow stream";
    if (!p) {
      details.replaceChildren(el("div", { class: "pc-empty", text: "Select a packet to see its details." }));
      bytesBox.replaceChildren();
      return;
    }
    rows[p.no - 1].classList.add("pc-sel");
    renderDetails(p);
    renderBytes(p);
  }

  function node(summary, children, open = false) {
    const d = el("details", { class: "pc-node", open },
      el("summary", { text: summary }));
    for (const c of children) d.append(typeof c === "string" ? el("div", { class: "pc-leaf", text: c }) : c);
    return d;
  }
  function renderDetails(p) {
    const stack = ["eth", p.proto === "ARP" ? null : "ip", p.transport && p.transport.toLowerCase(), !["TCP", "UDP"].includes(p.proto) && p.proto.toLowerCase()].filter(Boolean);
    const parts = [
      node(`Frame ${p.no}: ${p.len} bytes on wire (${p.len * 8} bits)`, [
        `Frame Number: ${p.no}`,
        `Time since first frame: ${p.t.toFixed(6)} seconds`,
        `Frame Length: ${p.len} bytes`,
        `Protocols in frame: ${stack.join(":")}`,
      ]),
      p.proto === "ARP" ? node("Address Resolution Protocol", [
        `Hardware type: Ethernet (1)`,
        `Protocol type: IPv4 (0x0800)`,
        `Opcode: ${/reply|is at/i.test(p.info || "") ? "reply (2)" : "request (1)"}`,
        `Sender MAC address: ${p.smac || "?"}`,
        `Sender IP address: ${p.src}`,
        `Target MAC address: ${p.tmac || "00:00:00:00:00:00"}`,
        `Target IP address: ${p.dst}`,
      ], true) : node(`Internet Protocol Version 4, Src: ${p.src}, Dst: ${p.dst}`, [
        `Source Address: ${p.src}`,
        `Destination Address: ${p.dst}`,
        `Protocol: ${p.transport || p.proto} (${IP_NUM[p.transport || p.proto] ?? "?"})`,
        `Time to Live: ${p.ttl ?? 64}`,
        `Total Length: ${p.len - 14}`,
      ], true),
    ];
    if (p.transport === "TCP") {
      const fl = p.flagStr.split("");
      const bits = fl.reduce((a, f) => a | (FLAG_BITS[f] || 0), 0);
      parts.push(node(`Transmission Control Protocol, Src Port: ${p.sport}, Dst Port: ${p.dport}, Len: ${p.bytes.length}`, [
        `Source Port: ${p.sport}`,
        `Destination Port: ${p.dport}`,
        `Flags: 0x${bits.toString(16).padStart(3, "0")} (${fl.map((f) => FLAG_NAMES[f] || f).join(", ") || "none"})`,
        `TCP payload: ${p.bytes.length} bytes`,
      ], true));
    } else if (p.transport === "UDP") {
      parts.push(node(`User Datagram Protocol, Src Port: ${p.sport}, Dst Port: ${p.dport}`, [
        `Source Port: ${p.sport}`,
        `Destination Port: ${p.dport}`,
        `Length: ${8 + p.bytes.length}`,
      ], true));
    }
    const app = !["TCP", "UDP"].includes(p.proto);
    if (app || p.bytes.length) {
      const lines = p.text.length ? p.text.split(/(?<=\n)/).slice(0, 60).map((l) => l.replace(/\r/g, "\\r").replace(/\n/g, "\\n")) : [];
      const kids = [];
      if (p.info) kids.push(`Summary: ${p.info}`);
      for (const l of lines) kids.push(el("div", { class: "pc-leaf pc-mono", text: l }));
      if (p.text.split(/(?<=\n)/).length > 60) kids.push("…");
      parts.push(node(app ? FULL[p.proto] || p.proto : `Data (${p.bytes.length} bytes)`, kids, true));
    }
    details.replaceChildren(...parts);
  }
  function renderBytes(p) {
    if (!p.bytes.length) { bytesBox.replaceChildren(el("div", { class: "pc-empty", text: "No payload in this packet." })); return; }
    const box = el("div", { class: "pc-hex" });
    const b = p.bytes;
    const max = Math.min(b.length, 16 * 512);
    for (let off = 0; off < max; off += 16) {
      const s = b.subarray(off, off + 16);
      const h = [];
      for (let i = 0; i < 16; i++) h.push(i < s.length ? hex2(s[i]) : "  ");
      box.append(el("div", { class: "pc-hrow" },
        el("span", { class: "pc-off", text: off.toString(16).padStart(4, "0") }),
        el("span", { class: "pc-hx", text: h.slice(0, 8).join(" ") + "  " + h.slice(8).join(" ") }),
        el("span", { class: "pc-asc", text: Array.from(s, printable).join("") })));
    }
    if (b.length > max) box.append(el("div", { class: "pc-empty", text: `… ${b.length - max} more bytes` }));
    bytesBox.replaceChildren(box);
  }

  /* follow stream */
  let overlay = null;
  function streamOf(p) {
    const a = `${p.src}:${p.sport}`, b = `${p.dst}:${p.dport}`;
    const pkts = packets.filter((q) => q.transport === p.transport &&
      ((`${q.src}:${q.sport}` === a && `${q.dst}:${q.dport}` === b) || (`${q.src}:${q.sport}` === b && `${q.dst}:${q.dport}` === a)));
    pkts.sort((x, y) => x.t - y.t || x.no - y.no);
    const syn = pkts.find((q) => q.flagStr.includes("S") && !q.flagStr.includes("A"));
    const first = syn || pkts[0];
    return { pkts, client: { ip: first.src, port: first.sport }, server: { ip: first.dst, port: first.dport } };
  }
  function follow(p = selected) {
    if (!p || !p.transport) return;
    closeFollow();
    const s = streamOf(p);
    const isClient = (q) => q.src === s.client.ip && q.sport === s.client.port;
    const cBytes = s.pkts.filter(isClient).reduce((a, q) => a + q.bytes.length, 0);
    const sBytes = s.pkts.filter((q) => !isClient(q)).reduce((a, q) => a + q.bytes.length, 0);
    const pre = el("pre", { class: "pc-conv" });
    const show = el("select", { class: "pc-select", "aria-label": "Show" },
      el("option", { value: "both", text: `Entire conversation (${cBytes + sBytes} bytes)` }),
      el("option", { value: "c", text: `${s.client.ip}:${s.client.port} → ${s.server.ip}:${s.server.port} (${cBytes} bytes)` }),
      el("option", { value: "s", text: `${s.server.ip}:${s.server.port} → ${s.client.ip}:${s.client.port} (${sBytes} bytes)` }));
    function render() {
      pre.replaceChildren();
      let lastSide = null, span = null;
      for (const q of s.pkts) {
        if (!q.text) continue;
        const side = isClient(q) ? "c" : "s";
        if (show.value !== "both" && show.value !== side) continue;
        if (side !== lastSide) { span = el("span", { class: side === "c" ? "pc-cli" : "pc-srv" }); pre.append(span); lastSide = side; }
        span.append(q.text);
      }
      if (!pre.childNodes.length) pre.append(el("span", { class: "pc-empty", text: "(no payload data in this stream)" }));
    }
    show.addEventListener("change", render);
    render();
    const proto = p.transport.toLowerCase();
    const filterText = `ip.addr == ${s.client.ip} && ip.addr == ${s.server.ip} && ${proto}.port == ${s.client.port} && ${proto}.port == ${s.server.port}`;
    overlay = el("div", { class: "pc-follow", role: "dialog", "aria-label": `Follow ${p.transport} stream` },
      el("div", { class: "pc-follow-h" },
        el("strong", { text: `Follow ${p.transport} Stream` }),
        el("span", { class: "pc-dim", text: `${s.client.ip}:${s.client.port} ⇄ ${s.server.ip}:${s.server.port} · ${s.pkts.length} packets` }),
        el("button", { class: "pc-btn pc-x", type: "button", "aria-label": "Close", on: { click: closeFollow } }, "Close")),
      el("div", { class: "pc-legend" },
        el("span", { class: "pc-cli", text: `client ${s.client.ip}` }),
        el("span", { class: "pc-srv", text: `server ${s.server.ip}` })),
      pre,
      el("div", { class: "pc-follow-f" }, show,
        el("button", { class: "pc-btn", type: "button", on: { click: () => { input.value = filterText; closeFollow(); apply(); } } }, "Filter this stream")));
    shell.append(overlay);
    overlay.querySelector(".pc-x").focus();
  }
  function closeFollow() { if (overlay) { overlay.remove(); overlay = null; } }

  /* context menu */
  function openMenu(e) {
    const r = shell.getBoundingClientRect();
    menu.replaceChildren(
      el("button", { type: "button", role: "menuitem", disabled: !selected?.transport, on: { click: () => { closeMenu(); follow(); } } }, `Follow ${selected?.transport || ""} stream`),
      el("button", { type: "button", role: "menuitem", on: { click: () => { closeMenu(); input.value = `ip.addr == ${selected.src} && ip.addr == ${selected.dst}`; apply(); } } }, "Filter on this conversation"),
      el("button", { type: "button", role: "menuitem", on: { click: () => { closeMenu(); input.value = selected.proto.toLowerCase(); apply(); } } }, `Filter on ${selected.proto}`));
    menu.hidden = false;
    const x = Math.min(e.clientX - r.left, r.width - 220), y = Math.min(e.clientY - r.top, r.height - 110);
    menu.style.left = Math.max(4, x) + "px";
    menu.style.top = Math.max(4, y) + "px";
  }
  function closeMenu() { menu.hidden = true; }
  const onDocDown = (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); };
  const onKey = (e) => { if (e.key === "Escape") { closeMenu(); closeFollow(); } };
  document.addEventListener("mousedown", onDocDown);
  root.addEventListener("keydown", onKey);

  validate();
  apply();

  // Exposed for tests / challenge scripts.
  root._pcap = { apply: (f) => { input.value = f; return apply(); }, visible: () => visible.map((p) => p.no), select: (no) => select(packets[no - 1]), follow: () => follow() };

  return () => {
    document.removeEventListener("mousedown", onDocDown);
    root.remove();
  };
}
