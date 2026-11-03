const svg = document.getElementById('flowSvg');
const eventLog = document.getElementById('eventLog');
const protoTitle = document.getElementById('protoTitle');
const protoTagline = document.getElementById('protoTagline');
const whyContent = document.getElementById('whyContent');
const connectBtn = document.getElementById('connectBtn');
const sendBtn = document.getElementById('sendBtn');
const dropBtn = document.getElementById('dropBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const compareBody = document.getElementById('compareBody');

const asideTabs = document.querySelectorAll('.aside-tab');
const whyPane = document.getElementById('whyPane');
const packetPane = document.getElementById('packetPane');
const packetForm = document.getElementById('packetForm');
const byteView = document.getElementById('byteView');
const byteLegend = document.getElementById('byteLegend');
const resetPacketBtn = document.getElementById('resetPacketBtn');
const corruptToggle = document.getElementById('corruptToggle');
const corruptLabel = document.getElementById('corruptLabel');
const corruptRow = document.getElementById('corruptRow');
const packetHint = document.getElementById('packetHint');
const modeToggle = document.getElementById('modeToggle');
const wireBlock = document.getElementById('wireBlock');
const hexDump = document.getElementById('hexDump');

const captureList = document.getElementById('captureList');
const captureCompare = document.getElementById('captureCompare');
const compareCaptureBtn = document.getElementById('compareCaptureBtn');
const clearCaptureBtn = document.getElementById('clearCaptureBtn');

const client = { x: 110, y: 160 };
const server = { x: 790, y: 160 };

// The flow diagram uses a compact viewBox on narrow screens so its labels stay
// legible instead of shrinking to ~4px when a 900-unit-wide drawing is squeezed
// onto a phone.
const SCENE_WIDE = { viewBox: '0 0 900 320', cx: 110, sx: 790, y: 160 };
const SCENE_NARROW = { viewBox: '0 0 460 250', cx: 75, sx: 385, y: 125 };
let sceneNarrow = null;
function layoutScene() {
  const w = svg.getBoundingClientRect().width || window.innerWidth;
  const narrow = w < 520;
  if (narrow === sceneNarrow) return false;
  sceneNarrow = narrow;
  const L = narrow ? SCENE_NARROW : SCENE_WIDE;
  svg.setAttribute('viewBox', L.viewBox);
  client.x = L.cx; server.x = L.sx; client.y = server.y = L.y;
  return true;
}

const reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

// ---------------------------------------------------------------------------
// Byte / hex / checksum helpers — real algorithms, run entirely client-side.
// ---------------------------------------------------------------------------
function strToBytes(str) { return Array.from(new TextEncoder().encode(str)); }
function bytesToStr(bytes) {
  try { return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes)); }
  catch (e) { return ''; }
}
function bytesToHex(bytes) { return bytes.map(b => (b & 0xFF).toString(16).padStart(2, '0')).join(''); }
function hexToBytes(hex) {
  const clean = (hex || '').replace(/[^0-9a-fA-F]/g, '');
  const trimmed = clean.length % 2 ? clean.slice(0, -1) : clean;
  const out = [];
  for (let i = 0; i < trimmed.length; i += 2) out.push(parseInt(trimmed.substr(i, 2), 16));
  return out;
}
function numToBytes(num, len) {
  const n = Math.max(0, Math.floor(Number(num) || 0));
  const out = [];
  for (let i = len - 1; i >= 0; i--) out.push((n >> (i * 8)) & 0xFF);
  return out;
}
function toHexPadded(num, len) { return bytesToHex(numToBytes(num, len)); }
function clampByte(n) { return Math.max(0, Math.min(255, Math.floor(Number(n) || 0))); }
function ipToBytes(ipStr) {
  const parts = (ipStr || '').split('.').map(p => clampByte(parseInt(p, 10)));
  while (parts.length < 4) parts.push(0);
  return parts.slice(0, 4);
}
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// RFC 1071 one's-complement Internet checksum — the same algorithm real
// TCP/UDP/IP headers use.
function internetChecksum(bytes) {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 2) {
    const word = ((bytes[i] << 8) | (bytes[i + 1] ?? 0)) & 0xFFFF;
    sum += word;
    while (sum >> 16) sum = (sum & 0xFFFF) + (sum >> 16);
  }
  return (~sum) & 0xFFFF;
}

// FNV-1a — a real, fast non-cryptographic hash. Used here as a stand-in for
// the authentication tag QUIC's AEAD encryption produces (illustrative, not
// real cryptography — genuine QUIC uses AES-GCM / ChaCha20-Poly1305).
function fnv1a(bytes) {
  let h = 0x811c9dc5;
  for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

function xorRepeating(bytes, keyBytes) {
  if (!keyBytes.length) return bytes.slice();
  return bytes.map((b, i) => b ^ keyBytes[i % keyBytes.length]);
}

function keystreamFromSeed(seedStr, len) {
  const seedBytes = strToBytes(seedStr);
  let state = fnv1a(seedBytes) || 1;
  const out = [];
  for (let i = 0; i < len; i++) {
    state = Math.imul(state ^ (state << 13), 0x2545F491) >>> 0;
    state ^= state >>> 17;
    out.push(state & 0xFF);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Protocol definitions, including editable packet field schemas.
// Field types: 'number' | 'text' | 'payload' | 'flags' | 'checkbox' | 'select' | 'computed'
// bytes: fixed byte size, or 'auto' to size from payload length.
// hideInAdvanced: field is replaced by the richer "on the wire" block in Bit mode.
// advancedOnly: field only appears in Bit mode (kept out of Field mode to stay simple).
// ---------------------------------------------------------------------------
const protocols = {
  tcp: {
    title: 'TCP — Transmission Control Protocol',
    tagline: 'Reliable, ordered, connection-based. Every byte arrives, or the sender knows it didn\u2019t.',
    why: `
      <p><strong>The handshake exists so both sides agree they're ready.</strong> SYN, SYN-ACK, ACK — three messages just to confirm "I want to talk," "I hear you, I want to talk too," "great, let's go." Nothing useful is sent until all three land.</p>
      <p><strong>Every packet gets acknowledged.</strong> If an ACK doesn't come back in time, TCP assumes the packet was lost and resends it automatically — your application never even knows it happened.</p>
      <p><strong>The cost is latency.</strong> All that bookkeeping — handshakes, acks, retransmits, in-order delivery — takes time. That's the trade TCP makes: slower, but nothing goes missing and nothing arrives scrambled.</p>
    `,
    connectLabel: 'Connect (handshake)',
    needsHandshake: true,
    corruptLabel: 'Corrupt the checksum before sending',
    fields: [
      { id: 'srcPort', label: 'Source port', type: 'number', default: 51422, bytes: 2 },
      { id: 'dstPort', label: 'Destination port', type: 'number', default: 443, bytes: 2 },
      { id: 'seq', label: 'Sequence number', type: 'number', default: 1000, bytes: 4 },
      { id: 'ack', label: 'Ack number', type: 'number', default: 0, bytes: 4 },
      { id: 'flags', label: 'Flags', type: 'flags', options: ['SYN', 'ACK', 'PSH', 'FIN', 'RST'], optionsAdvanced: ['CWR', 'ECE', 'URG', 'ACK', 'PSH', 'RST', 'SYN', 'FIN'], default: ['PSH', 'ACK'], bytes: 1 },
      { id: 'window', label: 'Window size', type: 'number', default: 64240, bytes: 2 },
      { id: 'checksum', label: 'Checksum (computed automatically)', type: 'computed', bytes: 2, hideInAdvanced: true },
      { id: 'payload', label: 'Payload data', type: 'payload', default: 'hello server', bytes: 'auto' }
    ]
  },
  udp: {
    title: 'UDP — User Datagram Protocol',
    tagline: 'Fast and connectionless. Packets go out — what happens to them isn\u2019t UDP\u2019s problem.',
    why: `
      <p><strong>There's no handshake because there's no connection.</strong> UDP doesn't establish anything or remember state between packets — each datagram is sent and forgotten, addressed and shipped independently.</p>
      <p><strong>No acknowledgment means no retransmission.</strong> If a packet gets lost, nobody resends it, and nobody upstream is even told. The next packet just keeps going.</p>
      <p><strong>That's a feature, not a bug, for real-time data.</strong> In a video call or a multiplayer game, a frame from half a second ago is worse than no frame at all — so why pay the cost of recovering it?</p>
    `,
    connectLabel: 'Mark ready (no handshake)',
    needsHandshake: false,
    noHandshakeNote: 'UDP has no connection state — marking ready.',
    noTeardownNote: 'UDP has nothing to tear down — there was never a connection.',
    corruptLabel: 'Corrupt the checksum before sending',
    fields: [
      { id: 'srcPort', label: 'Source port', type: 'number', default: 60123, bytes: 2 },
      { id: 'dstPort', label: 'Destination port', type: 'number', default: 53, bytes: 2 },
      { id: 'checksum', label: 'Checksum (computed automatically)', type: 'computed', bytes: 2, hideInAdvanced: true },
      { id: 'payload', label: 'Payload data', type: 'payload', default: 'ping', bytes: 'auto' }
    ]
  },
  ws: {
    title: 'WebSocket',
    tagline: 'A single TCP connection that both sides keep open, so messages can flow either direction at any time.',
    why: `
      <p><strong>It starts as a normal HTTP request.</strong> The client asks to "upgrade" the connection; the server agrees with a 101 response. From that point on, it's no longer HTTP — it's a raw, persistent TCP socket both sides can write to.</p>
      <p><strong>No more request/response back-and-forth.</strong> A regular HTTP client has to ask before it gets anything. Over WebSocket, the server can push a message the instant something happens — a chat message, a price update, a notification.</p>
      <p><strong>It inherits TCP's reliability underneath.</strong> Because it's still TCP, delivery and ordering guarantees come along for free — WebSocket just adds the "stay open, talk whenever" behavior on top.</p>
    `,
    connectLabel: 'Connect (HTTP upgrade)',
    needsHandshake: true,
    corruptLabel: 'Flip a bit in the payload before sending',
    fields: [
      { id: 'opcode', label: 'Opcode', type: 'select', options: ['text', 'binary', 'ping', 'pong', 'close'], default: 'text', bytes: 1 },
      { id: 'fin', label: 'FIN bit (final fragment)', type: 'checkbox', default: true, bytes: 0 },
      { id: 'mask', label: 'Mask (client → server frames are always masked)', type: 'checkbox', default: true, bytes: 4 },
      { id: 'payload', label: 'Payload data', type: 'payload', default: 'hey there', bytes: 'auto' }
    ]
  },
  quic: {
    title: 'QUIC — the transport under HTTP/3',
    tagline: 'TCP\u2019s reliability, rebuilt on UDP, with encryption baked in and streams that don\u2019t block each other.',
    why: `
      <p><strong>The handshake and the encryption setup happen together.</strong> TCP does its 3-way handshake, then TLS negotiates encryption on top, costing two round trips before data flows. QUIC folds both into one — the first packet a client sends already carries TLS 1.3 key material.</p>
      <p><strong>Loss on one stream doesn't stall the others.</strong> TCP delivers bytes in one strict order, so a lost packet blocks everything behind it, even unrelated requests. QUIC multiplexes independent streams inside a single connection, so one stream can retransmit while the rest keep moving.</p>
      <p><strong>It rides on UDP because the kernel won't cooperate.</strong> Middleboxes and OS network stacks are slow to adopt new transport protocols, but nearly everything already lets UDP through — so QUIC implements its own reliability, ordering, and congestion control entirely in user space, on top of UDP's bare datagrams.</p>
    `,
    connectLabel: 'Connect (1-RTT handshake)',
    needsHandshake: true,
    corruptLabel: 'Corrupt the encrypted payload before sending',
    fields: [
      { id: 'connId', label: 'Connection ID (hex)', type: 'text', default: '8f3a1c9d', bytes: 8 },
      { id: 'packetNumber', label: 'Packet number', type: 'number', default: 42, bytes: 4 },
      { id: 'streamId', label: 'Stream ID', type: 'number', default: 0, bytes: 2 },
      { id: 'payload', label: 'Payload data (encrypted on the wire)', type: 'payload', default: 'GET /index.html', bytes: 'auto' }
    ]
  },
  ip: {
    title: 'IPv4 — Internet Protocol',
    tagline: 'The addressing and routing layer underneath everything else — best-effort, hop by hop, with no promise your packet arrives.',
    why: `
      <p><strong>Every other tab in this app rides inside an IP packet.</strong> TCP, UDP, and QUIC segments are IP's payload — IP's only job is getting that payload from one address to another, one router hop at a time.</p>
      <p><strong>TTL exists to stop packets from wandering forever.</strong> Every router that forwards a packet decrements its TTL by one. If it hits zero, the packet is discarded right there — a safety net against routing loops, and the trick traceroute is built on.</p>
      <p><strong>The checksum only covers the header, never the payload.</strong> Verifying your data's integrity is left entirely to whatever's riding inside — TCP, UDP, and QUIC each do their own. IP just needs its own addressing fields to arrive intact.</p>
    `,
    connectLabel: 'Mark ready (no handshake)',
    needsHandshake: false,
    noHandshakeNote: 'IPv4 has no connection state — marking ready.',
    noTeardownNote: 'IPv4 has nothing to tear down — every packet is routed independently.',
    corruptLabel: 'Corrupt the header checksum before sending',
    fields: [
      { id: 'srcIp', label: 'Source IP', type: 'text', default: '203.0.113.10', bytes: 4 },
      { id: 'dstIp', label: 'Destination IP', type: 'text', default: '198.51.100.20', bytes: 4 },
      { id: 'ttl', label: 'TTL (hops remaining)', type: 'number', default: 64, bytes: 1 },
      { id: 'protocol', label: 'Encapsulated protocol', type: 'select', options: ['UDP', 'TCP', 'ICMP'], default: 'UDP', bytes: 1 },
      { id: 'identification', label: 'Identification', type: 'number', default: 1000, bytes: 2, advancedOnly: true },
      { id: 'tos', label: 'Type of Service (ToS)', type: 'number', default: 0, bytes: 1, advancedOnly: true },
      { id: 'checksum', label: 'Header checksum (computed automatically)', type: 'computed', bytes: 2, hideInAdvanced: true },
      { id: 'payload', label: 'Payload data', type: 'payload', default: 'ping', bytes: 'auto' }
    ]
  }
};

const compareRows = [
  ['Connection', 'Established (3-way handshake, 1 RTT)', 'None — connectionless', 'TCP handshake + HTTP Upgrade, then persistent', 'Transport + TLS 1.3 together: 1 RTT (0-RTT on resumption)'],
  ['Delivery guarantee', 'Guaranteed, retransmits on loss', 'Best-effort, no retries', 'Guaranteed (runs over TCP)', 'Guaranteed, per-stream retransmit'],
  ['Ordering', 'Strictly in order', 'No ordering guarantee', 'In order (inherits TCP)', 'In order per stream only'],
  ['Direction', 'Full-duplex byte stream; the app protocol (e.g. HTTP) decides who speaks', 'Either side can send datagrams anytime; no session, no replies implied', 'Full-duplex messages, either side pushes anytime', 'Full-duplex, many independent streams at once'],
  ['Overhead', 'Higher — headers, acks, handshake', 'Minimal — just the datagram', 'Handshake once, then low per-message overhead', 'Handshake + encryption combined, then low'],
  ['Typical use', 'Web pages, file transfer, APIs', 'Video/voice calls, DNS, gaming', 'Chat, live dashboards, multiplayer state, notifications', 'HTTP/3 web traffic, modern APIs']
];

function renderCompareTable() {
  compareBody.innerHTML = '';
  compareRows.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = row.map((cell, i) => i === 0 ? `<th scope="row">${cell}</th>` : `<td>${cell}</td>`).join('');
    compareBody.appendChild(tr);
  });
}
renderCompareTable();

let currentProto = 'tcp';
let currentMode = 'general'; // 'general' | 'advanced'
let connected = false;
let sentSinceConnect = false;
let wsSide = 'client'; // alternates for bidirectional demo

// Checksum algorithms shared by TCP, UDP, and IPv4 (each with a real,
// currently-computed checksum in packetState).
const checksumComputers = {
  tcp: () => toHexPadded(internetChecksum(tcpUdpHeaderBytes('tcp')), 2),
  udp: () => toHexPadded(internetChecksum(tcpUdpHeaderBytes('udp')), 2),
  ip: () => toHexPadded(internetChecksum(ipHeaderBytesForChecksum()), 2)
};
const wireBadgeText = {
  tcp: { valid: 'Checksum matches — packet is valid', invalid: 'Checksum mismatch — packet will be treated as corrupted' },
  udp: { valid: 'Checksum matches — packet is valid', invalid: 'Checksum mismatch — packet will be treated as corrupted' },
  ip: { valid: 'Checksum matches — packet is valid', invalid: 'Checksum mismatch — a router would discard this packet' },
  ws: { valid: 'Bytes match the expected mask — frame is valid', invalid: 'Bytes were hand-edited — server will decode garbage' },
  quic: { valid: 'Auth tag verifies — packet decrypts cleanly', invalid: 'Auth tag fails to verify — packet will be dropped as corrupted' }
};
const checksumNotes = {
  tcp: "RFC 1071 Internet checksum, computed live over this packet's header + payload bytes (simplified — omits the IP pseudo-header real TCP/UDP checksums include).",
  udp: "RFC 1071 Internet checksum, computed live over this packet's header + payload bytes (simplified — omits the IP pseudo-header real TCP/UDP checksums include).",
  ip: "RFC 791 Internet checksum, computed over exactly this packet's 20-byte header with the checksum field zeroed — no simplifications here, it's exactly what a real router computes."
};
const extraLabels = {
  tcp: { checksum: 'Checksum', dataOffset: 'Data offset', urgPtr: 'Urgent pointer' },
  udp: { checksum: 'Checksum', length: 'Length' },
  ws: { maskKey: 'Mask key', payload: 'Payload (on the wire)', extLen: 'Extended payload length' },
  quic: { payload: 'Ciphertext', tag: 'Auth tag' },
  ip: { verIhl: 'Version / IHL', totalLength: 'Total length', flagsFrag: 'Flags / Fragment offset', checksum: 'Checksum' }
};
function fieldLabelFor(key, fieldId) {
  if (extraLabels[key] && extraLabels[key][fieldId]) return extraLabels[key][fieldId];
  const f = protocols[key].fields.find(x => x.id === fieldId);
  return f ? f.label : fieldId;
}

// Live packet state per protocol, seeded from field defaults plus
// Bit-mode-only extras (override toggles, mask keys, hex/text view state).
const packetState = {};
function seedPacketState(key) {
  const state = {};
  protocols[key].fields.forEach(f => {
    state[f.id] = Array.isArray(f.default) ? [...f.default] : f.default;
  });
  state.payloadHexMode = false;
  if (checksumComputers[key]) {
    state.manualChecksum = false;
    state.checksumValue = '0000';
  }
  if (key === 'ws') {
    state.maskKey = 'a3f1c2d4';
    state.wireOverride = false;
    state.wireBytesHex = '';
  } else if (key === 'quic') {
    state.cipherOverride = false;
    state.cipherHexVal = '';
    state.tagOverride = false;
    state.tagValue = '0000';
  }
  packetState[key] = state;
}
Object.keys(protocols).forEach(seedPacketState);

function log(text, cls = '') {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = text;
  eventLog.appendChild(line);
  eventLog.scrollTop = eventLog.scrollHeight;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  svg.appendChild(el);
  return el;
}
function svgText(x, y, text, cls) {
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  t.setAttribute('x', x); t.setAttribute('y', y);
  t.setAttribute('text-anchor', 'middle');
  t.setAttribute('class', cls);
  t.textContent = text;
  svg.appendChild(t);
}

function drawScene() {
  svg.innerHTML = '';
  svgEl('line', { x1: client.x + 60, y1: client.y, x2: server.x - 60, y2: server.y, stroke: connected ? '#4ADE80' : '#2A2240', 'stroke-width': connected ? 2 : 1.5, 'stroke-dasharray': connected ? 'none' : '5 5' });

  svgEl('rect', { x: client.x - 60, y: client.y - 34, width: 120, height: 68, rx: 10, class: 'endpoint-box ' + (connected ? 'live' : '') });
  svgText(client.x, client.y - 6, 'Client', 'endpoint-label');
  svgText(client.x, client.y + 16, connected ? 'connected' : 'idle', 'flow-msg');

  svgEl('rect', { x: server.x - 60, y: server.y - 34, width: 120, height: 68, rx: 10, class: 'endpoint-box ' + (connected ? 'live' : '') });
  svgText(server.x, server.y - 6, 'Server', 'endpoint-label');
  svgText(server.x, server.y + 16, connected ? 'connected' : 'idle', 'flow-msg');
}

async function animatePacket(label, fromX, fromY, toX, toY, color, willDrop, opts = {}) {
  const group = svgEl('g', {});
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('width', 56); rect.setAttribute('height', 22); rect.setAttribute('rx', 5);
  rect.setAttribute('fill', color);
  group.appendChild(rect);
  if (opts.title) {
    const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    titleEl.textContent = opts.title;
    group.appendChild(titleEl);
  }
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('class', 'packet-label');
  text.setAttribute('x', 28); text.setAttribute('y', 15); text.setAttribute('text-anchor', 'middle');
  text.textContent = label;
  group.appendChild(text);
  svg.appendChild(group);

  // Fewer, longer steps under prefers-reduced-motion: the packet still visibly
  // travels (it carries meaning), just without the smooth slide.
  const steps = reducedMotion.matches ? 4 : 30;
  const delay = reducedMotion.matches ? 90 : 11;
  const gen = opGen;
  const dropAt = opts.dropPoint !== undefined ? opts.dropPoint : (willDrop ? 0.6 : 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (willDrop && t >= dropAt) {
      group.remove();
      return false;
    }
    const x = fromX + (toX - fromX) * t - 28;
    const y = fromY + (toY - fromY) * t - 11;
    group.setAttribute('transform', `translate(${x},${y})`);
    await sleep(delay);
    if (gen !== opGen) { group.remove(); throw new OpAborted(); }
  }
  group.remove();
  return true;
}

// ---------------------------------------------------------------------------
// Real packet byte layout — the single source of truth for the byte-view
// bar, the live hex dump, and every capture entry.
// ---------------------------------------------------------------------------
function flagsToByte(activeFlags, order) {
  let byte = 0;
  order.forEach((name, i) => {
    if (activeFlags.includes(name)) byte |= (1 << (order.length - 1 - i));
  });
  return byte;
}

// TCP: 20-byte header (no options) — data offset 5 words = 0x50.
// UDP: 8-byte header — length covers header + payload.
const TCP_DATA_OFFSET = 0x50;
function udpLength(s) { return 8 + strToBytes(s.payload).length; }

// Bytes the checksum is computed over: the header with the checksum field
// zeroed, followed by the payload (pseudo-header omitted, see checksumNotes).
function tcpUdpHeaderBytes(key) {
  const s = packetState[key];
  let bytes = [...numToBytes(s.srcPort, 2), ...numToBytes(s.dstPort, 2)];
  if (key === 'tcp') {
    bytes = bytes.concat(
      numToBytes(s.seq, 4),
      numToBytes(s.ack, 4),
      [TCP_DATA_OFFSET, flagsToByte(s.flags, protocols.tcp.fields.find(f => f.id === 'flags').optionsAdvanced)],
      numToBytes(s.window, 2),
      [0, 0],      // checksum (zeroed while computing)
      [0, 0]       // urgent pointer
    );
  } else {
    bytes = bytes.concat(numToBytes(udpLength(s), 2), [0, 0]);
  }
  return bytes.concat(strToBytes(s.payload));
}

function ipHeaderBytesForChecksum() {
  const s = packetState.ip;
  const protoMap = { UDP: 17, TCP: 6, ICMP: 1 };
  const totalLen = 20 + strToBytes(s.payload).length;
  return [
    0x45, clampByte(s.tos),
    (totalLen >> 8) & 0xFF, totalLen & 0xFF,
    ...numToBytes(s.identification, 2),
    0x40, 0x00,
    clampByte(s.ttl),
    protoMap[s.protocol] || 17,
    0, 0,
    ...ipToBytes(s.srcIp),
    ...ipToBytes(s.dstIp)
  ];
}

function safeMaskKeyBytes(state) {
  const b = hexToBytes(state.maskKey);
  while (b.length < 4) b.push(0);
  return b.slice(0, 4);
}
function computeWsWireBytes(state) {
  const payloadBytes = strToBytes(state.payload);
  const key = safeMaskKeyBytes(state);
  return bytesToHex(state.mask ? xorRepeating(payloadBytes, key) : payloadBytes);
}
function computeQuicCipherAndTag(state) {
  const payloadBytes = strToBytes(state.payload);
  const keystream = keystreamFromSeed(`${state.connId}:${state.packetNumber}`, payloadBytes.length);
  const cipherBytes = xorRepeating(payloadBytes, keystream);
  return { cipherHex: bytesToHex(cipherBytes), tagHex: toHexPadded(fnv1a(cipherBytes) & 0xFFFFFFFF, 4) };
}

// "Effective" values honor a Bit-mode manual override; otherwise they're
// always the freshly, correctly computed value — General mode never lies
// about what's really on the wire, it just doesn't let you edit it yet.
function effectiveChecksumHex(key, clean = false) {
  const computed = checksumComputers[key]();
  const state = packetState[key];
  return (!clean && currentMode === 'advanced' && state.manualChecksum) ? (state.checksumValue || '0000').toLowerCase().padStart(4, '0').slice(-4) : computed;
}
function effectiveWsWireHex(clean = false) {
  const state = packetState.ws;
  const expected = computeWsWireBytes(state);
  return (!clean && currentMode === 'advanced' && state.wireOverride) ? (state.wireBytesHex || expected) : expected;
}
function effectiveQuicHex(clean = false) {
  const state = packetState.quic;
  const { cipherHex, tagHex } = computeQuicCipherAndTag(state);
  const adv = !clean && currentMode === 'advanced';
  return {
    cipher: (adv && state.cipherOverride) ? (state.cipherHexVal || cipherHex) : cipherHex,
    tag: (adv && state.tagOverride) ? (state.tagValue || tagHex) : tagHex
  };
}

// opts.clean: ignore Bit-mode manual overrides (what a correct retransmit sends).
// opts.fromServer: WebSocket server -> client frame, which is never masked.
function buildPacketBytes(key, opts = {}) {
  const s = packetState[key];
  const clean = !!opts.clean;
  if (key === 'tcp' || key === 'udp') {
    const checksumHex = effectiveChecksumHex(key, clean);
    const segs = [
      { fieldId: 'srcPort', bytes: numToBytes(s.srcPort, 2) },
      { fieldId: 'dstPort', bytes: numToBytes(s.dstPort, 2) }
    ];
    if (key === 'tcp') {
      segs.push(
        { fieldId: 'seq', bytes: numToBytes(s.seq, 4) },
        { fieldId: 'ack', bytes: numToBytes(s.ack, 4) },
        { fieldId: 'dataOffset', bytes: [TCP_DATA_OFFSET] },
        { fieldId: 'flags', bytes: [flagsToByte(s.flags, protocols.tcp.fields.find(f => f.id === 'flags').optionsAdvanced)] },
        { fieldId: 'window', bytes: numToBytes(s.window, 2) }
      );
    } else {
      segs.push({ fieldId: 'length', bytes: numToBytes(udpLength(s), 2) });
    }
    segs.push({ fieldId: 'checksum', bytes: numToBytes(parseInt(checksumHex, 16) || 0, 2), cls: 'computed' });
    if (key === 'tcp') segs.push({ fieldId: 'urgPtr', bytes: [0, 0] });
    segs.push({ fieldId: 'payload', bytes: strToBytes(s.payload), cls: 'payload' });
    return segs;
  }
  if (key === 'ws') {
    const opcodeMap = { text: 1, binary: 2, ping: 9, pong: 10, close: 8 };
    const opcodeByte = (s.fin ? 0x80 : 0) | (opcodeMap[s.opcode] || 1);
    const masked = s.mask && !opts.fromServer;
    const wireBytes = opts.fromServer ? strToBytes(s.payload) : hexToBytes(effectiveWsWireHex(clean));
    const payloadLen = wireBytes.length;
    // RFC 6455 §5.2: 0–125 fits in 7 bits; 126 => 16-bit length follows; 127 => 64-bit length follows.
    const len7 = payloadLen <= 125 ? payloadLen : (payloadLen <= 0xFFFF ? 126 : 127);
    const lenByte = (masked ? 0x80 : 0) | len7;
    const segs = [
      { fieldId: 'opcode', bytes: [opcodeByte] },
      { fieldId: 'mask', bytes: [lenByte] }
    ];
    if (len7 === 126) segs.push({ fieldId: 'extLen', bytes: numToBytes(payloadLen, 2) });
    else if (len7 === 127) segs.push({ fieldId: 'extLen', bytes: [0, 0, 0, 0, ...numToBytes(payloadLen, 4)] });
    if (masked) segs.push({ fieldId: 'maskKey', bytes: safeMaskKeyBytes(s), cls: 'computed' });
    segs.push({ fieldId: 'payload', bytes: wireBytes, cls: 'payload' });
    return segs;
  }
  if (key === 'quic') {
    const { cipher, tag } = effectiveQuicHex(clean);
    return [
      { fieldId: 'connId', bytes: hexToBytes(s.connId) },
      { fieldId: 'packetNumber', bytes: numToBytes(s.packetNumber, 4) },
      { fieldId: 'streamId', bytes: numToBytes(s.streamId, 2) },
      { fieldId: 'payload', bytes: hexToBytes(cipher), cls: 'payload' },
      { fieldId: 'tag', bytes: numToBytes(parseInt(tag, 16) || 0, 4), cls: 'computed' }
    ];
  }
  if (key === 'ip') {
    const protoMap = { UDP: 17, TCP: 6, ICMP: 1 };
    const payloadBytes = strToBytes(s.payload);
    const totalLen = 20 + payloadBytes.length;
    const checksumHex = effectiveChecksumHex('ip', clean);
    return [
      { fieldId: 'verIhl', bytes: [0x45] },
      { fieldId: 'tos', bytes: [clampByte(s.tos)] },
      { fieldId: 'totalLength', bytes: numToBytes(totalLen, 2) },
      { fieldId: 'identification', bytes: numToBytes(s.identification, 2) },
      { fieldId: 'flagsFrag', bytes: [0x40, 0x00] },
      { fieldId: 'ttl', bytes: [clampByte(s.ttl)] },
      { fieldId: 'protocol', bytes: [protoMap[s.protocol] || 17] },
      { fieldId: 'checksum', bytes: numToBytes(parseInt(checksumHex, 16) || 0, 2), cls: 'computed' },
      { fieldId: 'srcIp', bytes: ipToBytes(s.srcIp) },
      { fieldId: 'dstIp', bytes: ipToBytes(s.dstIp) },
      { fieldId: 'payload', bytes: payloadBytes, cls: 'payload' }
    ];
  }
  return [];
}

function flattenSegments(segments) {
  const flat = [];
  segments.forEach(seg => seg.bytes.forEach(b => flat.push({ value: b & 0xFF, fieldId: seg.fieldId, cls: seg.cls || 'header' })));
  return flat;
}

function hexDumpHTML(segments, opts = {}) {
  const flat = flattenSegments(segments);
  if (!flat.length) return '<div class="hex-empty">No bytes yet.</div>';
  const perRow = 8;
  let rows = '';
  for (let i = 0; i < flat.length; i += perRow) {
    const rowBytes = flat.slice(i, i + perRow);
    const offset = i.toString(16).padStart(4, '0');
    const byteSpans = rowBytes.map((b, j) => {
      const diff = opts.diffIdx && opts.diffIdx.has(i + j) ? ' hb-diff' : '';
      return `<span class="hex-byte hb-${b.cls}${diff}" data-field="${b.fieldId}">${b.value.toString(16).padStart(2, '0')}</span>`;
    }).join('');
    const asciiSpans = rowBytes.map((b, j) => {
      const diff = opts.diffIdx && opts.diffIdx.has(i + j) ? ' hb-diff' : '';
      const ch = (b.value >= 32 && b.value <= 126) ? String.fromCharCode(b.value) : '.';
      return `<span class="${diff.trim()}" data-field="${b.fieldId}">${escapeHtml(ch)}</span>`;
    }).join('');
    rows += `<div class="hex-row"><span class="hex-offset">${offset}</span><span class="hex-bytes">${byteSpans}</span><span class="hex-ascii">${asciiSpans}</span></div>`;
  }
  return rows;
}

function renderByteView(key) {
  const segments = buildPacketBytes(key);
  const total = segments.reduce((sum, s) => sum + s.bytes.length, 0) || 1;

  byteView.innerHTML = '';
  segments.forEach(seg => {
    const label = fieldLabelFor(key, seg.fieldId);
    const pct = (seg.bytes.length / total) * 100;
    const div = document.createElement('div');
    div.className = 'byte-segment ' + (seg.cls === 'payload' ? 'bv-payload' : 'bv-header');
    div.style.width = pct + '%';
    div.title = `${label}: ${seg.bytes.length} byte${seg.bytes.length === 1 ? '' : 's'}`;
    if (pct > 9) div.textContent = label.split(' ')[0];
    byteView.appendChild(div);
  });

  const headerBytes = segments.filter(s => s.cls !== 'payload').reduce((s, x) => s + x.bytes.length, 0);
  const payloadBytes = segments.filter(s => s.cls === 'payload').reduce((s, x) => s + x.bytes.length, 0);
  byteLegend.innerHTML = `
    <div class="leg-header"><b>${headerBytes}B</b> header</div>
    <div class="leg-payload"><b>${payloadBytes}B</b> payload</div>
  `;
}

function renderHexDump(key) {
  hexDump.innerHTML = hexDumpHTML(buildPacketBytes(key));
}

function refreshComputedViews(key) {
  renderByteView(key);
  renderWireBlock(key);
  renderHexDump(key);
}

// ---------------------------------------------------------------------------
// Packet inspector form
// ---------------------------------------------------------------------------
function payloadBytesFor(key) {
  return Math.max(1, strToBytes(packetState[key].payload || '').length);
}

function fieldValueDisplay(f, value) {
  if (f.type === 'flags') return value.length ? value.join(',') : 'none';
  if (f.type === 'checkbox') return value ? 'yes' : 'no';
  if (f.type === 'payload') return `"${value}"`;
  return String(value);
}

function renderPayloadField(f, key) {
  const state = packetState[key];
  const row = document.createElement('div');
  row.className = 'field-row';
  row.dataset.fieldRow = f.id;

  if (currentMode !== 'advanced') {
    row.innerHTML = `<label for="pf-${f.id}">${f.label}</label><textarea id="pf-${f.id}" data-field="${f.id}" rows="2">${escapeHtml(state.payload)}</textarea>`;
    return row;
  }

  const hexMode = state.payloadHexMode;
  const displayValue = hexMode ? bytesToHex(strToBytes(state.payload)) : state.payload;
  row.innerHTML = `
    <div class="payload-toolbar">
      <span class="field-row-label-inline">${f.label}</span>
      <div class="view-switch">
        <button type="button" data-payload-view="text" class="${!hexMode ? 'active' : ''}" aria-pressed="${!hexMode}">Text</button>
        <button type="button" data-payload-view="hex" class="${hexMode ? 'active' : ''}" aria-pressed="${hexMode}">Hex</button>
      </div>
    </div>
    <textarea data-field="payload" data-payload-hex="${hexMode}" rows="2" aria-label="${escapeHtml(f.label)} (${hexMode ? 'hex' : 'text'})">${escapeHtml(displayValue)}</textarea>
  `;
  return row;
}

function renderPacketForm(key) {
  const fields = protocols[key].fields;
  const state = packetState[key];
  packetForm.innerHTML = '';

  fields.forEach(f => {
    if (currentMode === 'advanced' && f.hideInAdvanced) return;
    if (f.advancedOnly && currentMode !== 'advanced') return;

    if (f.type === 'payload') {
      packetForm.appendChild(renderPayloadField(f, key));
      return;
    }

    const row = document.createElement('div');
    row.dataset.fieldRow = f.id;

    if (f.type === 'computed') {
      row.className = 'field-row';
      const hex = checksumComputers[key] ? checksumComputers[key]() : '';
      row.innerHTML = `<label for="pf-${f.id}">${f.label}</label><input type="text" id="pf-${f.id}" value="0x${hex}" disabled>`;
    } else if (f.type === 'checkbox') {
      row.className = 'field-row field-row-inline';
      row.innerHTML = `<input type="checkbox" id="pf-${f.id}" data-field="${f.id}" ${state[f.id] ? 'checked' : ''}><label for="pf-${f.id}">${f.label}</label>`;
    } else if (f.type === 'select') {
      row.className = 'field-row';
      const opts = f.options.map(o => `<option value="${o}" ${state[f.id] === o ? 'selected' : ''}>${o}</option>`).join('');
      row.innerHTML = `<label for="pf-${f.id}">${f.label}</label><select id="pf-${f.id}" data-field="${f.id}">${opts}</select>`;
    } else if (f.type === 'flags') {
      row.className = 'field-row';
      const opts = (currentMode === 'advanced' && f.optionsAdvanced) ? f.optionsAdvanced : f.options;
      const chips = opts.map(o => {
        const on = state[f.id].includes(o);
        return `<button type="button" class="flag-chip ${on ? 'on' : ''}" aria-pressed="${on}" data-flag-group="${f.id}" data-flag-value="${o}">${o}</button>`;
      }).join('');
      row.innerHTML = `<span class="field-row-label" id="pf-${f.id}-label">${f.label}</span><div class="flags-group" role="group" aria-labelledby="pf-${f.id}-label">${chips}</div>`;
      if (currentMode === 'advanced' && f.optionsAdvanced) {
        const byteVal = flagsToByte(state[f.id], f.optionsAdvanced);
        const bitReadout = document.createElement('div');
        bitReadout.className = 'bit-readout';
        bitReadout.innerHTML = `binary: <b>${byteVal.toString(2).padStart(8, '0')}</b> &nbsp; hex: <b>0x${byteVal.toString(16).padStart(2, '0')}</b>`;
        row.appendChild(bitReadout);
      }
    } else {
      row.className = 'field-row';
      // Number fields get min/max from their byte width so the browser can flag out-of-range values.
      const range = (f.type === 'number' && typeof f.bytes === 'number' && f.bytes > 0)
        ? ` min="0" max="${2 ** (8 * f.bytes) - 1}" inputmode="numeric"` : '';
      row.innerHTML = `<label for="pf-${f.id}">${f.label}</label><input type="${f.type}" id="pf-${f.id}" data-field="${f.id}" value="${escapeHtml(state[f.id])}"${range} spellcheck="false" autocomplete="off">`;
      if (currentMode === 'advanced' && f.type === 'number' && f.bytes) {
        const hexRow = document.createElement('div');
        hexRow.className = 'field-row-hex';
        hexRow.innerHTML = `<span class="hex-tag" aria-hidden="true">hex</span><input type="text" aria-label="${escapeHtml(f.label)} in hex" data-hex-mirror="${f.id}" data-hex-bytes="${f.bytes}" value="${toHexPadded(state[f.id], f.bytes)}" spellcheck="false" autocomplete="off">`;
        row.appendChild(hexRow);
      }
    }
    packetForm.appendChild(row);
  });

  corruptLabel.textContent = protocols[key].corruptLabel;
  corruptToggle.checked = false;
  corruptRow.classList.toggle('hidden', currentMode === 'advanced');

  refreshComputedViews(key);
}

packetForm.addEventListener('submit', e => e.preventDefault());

packetForm.addEventListener('input', e => {
  const target = e.target;

  if (target.dataset.hexMirror) {
    const fieldId = target.dataset.hexMirror;
    const bytes = Number(target.dataset.hexBytes);
    const clean = target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, bytes * 2);
    const num = clean ? parseInt(clean, 16) : 0;
    packetState[currentProto][fieldId] = num;
    const decimalInput = packetForm.querySelector(`input[data-field="${fieldId}"]`);
    if (decimalInput) decimalInput.value = num;
    refreshComputedViews(currentProto);
    return;
  }

  const fieldId = target.dataset.field;
  if (!fieldId) return;

  if (fieldId === 'payload' && target.dataset.payloadHex !== undefined) {
    const state = packetState[currentProto];
    state.payload = target.dataset.payloadHex === 'true' ? bytesToStr(hexToBytes(target.value)) : target.value;
  } else if (target.type === 'checkbox') {
    packetState[currentProto][fieldId] = target.checked;
  } else if (target.type === 'number') {
    packetState[currentProto][fieldId] = target.value === '' ? 0 : Number(target.value);
    const hexMirror = packetForm.querySelector(`input[data-hex-mirror="${fieldId}"]`);
    if (hexMirror) hexMirror.value = toHexPadded(packetState[currentProto][fieldId], Number(hexMirror.dataset.hexBytes));
  } else {
    packetState[currentProto][fieldId] = target.value;
  }
  refreshComputedViews(currentProto);
});

packetForm.addEventListener('click', e => {
  const chip = e.target.closest('.flag-chip');
  if (chip) {
    const group = chip.dataset.flagGroup;
    const value = chip.dataset.flagValue;
    const arr = packetState[currentProto][group];
    const idx = arr.indexOf(value);
    if (idx === -1) arr.push(value); else arr.splice(idx, 1);
    renderPacketForm(currentProto);
    const again = packetForm.querySelector(`.flag-chip[data-flag-group="${group}"][data-flag-value="${value}"]`);
    if (again) again.focus();
    return;
  }
  const viewBtn = e.target.closest('[data-payload-view]');
  if (viewBtn) {
    const view = viewBtn.dataset.payloadView;
    packetState[currentProto].payloadHexMode = view === 'hex';
    renderPacketForm(currentProto);
    const again = packetForm.querySelector(`[data-payload-view="${view}"]`);
    if (again) again.focus();
  }
});

resetPacketBtn.addEventListener('click', () => {
  seedPacketState(currentProto);
  renderPacketForm(currentProto);
  log('Packet fields reset to defaults.', 'info');
});

asideTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    asideTabs.forEach(t => { t.classList.toggle('active', t === tab); t.setAttribute('aria-pressed', t === tab); });
    const showPacket = tab.dataset.aside === 'packet';
    whyPane.classList.toggle('hidden', showPacket);
    packetPane.classList.toggle('hidden', !showPacket);
  });
});

// ---------------------------------------------------------------------------
// Hover-linked highlighting: point at a hex byte or a field, see the other.
// ---------------------------------------------------------------------------
function setHighlight(fieldId, on) {
  packetPane.querySelectorAll(`[data-field="${fieldId}"]`).forEach(x => x.classList.toggle('hb-hover', on));
  packetPane.querySelectorAll(`.field-row[data-field-row="${fieldId}"]`).forEach(x => x.classList.toggle('field-highlight', on));
  packetPane.querySelectorAll(`.wire-row[data-field-row="${fieldId}"]`).forEach(x => x.classList.toggle('field-highlight', on));
}
packetPane.addEventListener('mouseover', e => {
  const hexEl = e.target.closest('[data-field]');
  const rowEl = e.target.closest('[data-field-row]');
  const fid = hexEl ? hexEl.dataset.field : (rowEl ? rowEl.dataset.fieldRow : null);
  if (fid) setHighlight(fid, true);
});
packetPane.addEventListener('mouseout', e => {
  const hexEl = e.target.closest('[data-field]');
  const rowEl = e.target.closest('[data-field-row]');
  const fid = hexEl ? hexEl.dataset.field : (rowEl ? rowEl.dataset.fieldRow : null);
  if (fid) setHighlight(fid, false);
});
// Same linking for keyboard users: focusing a field highlights its bytes.
packetPane.addEventListener('focusin', e => {
  const rowEl = e.target.closest('[data-field-row]');
  if (rowEl) setHighlight(rowEl.dataset.fieldRow, true);
});
packetPane.addEventListener('focusout', e => {
  const rowEl = e.target.closest('[data-field-row]');
  if (rowEl) setHighlight(rowEl.dataset.fieldRow, false);
});

// ---------------------------------------------------------------------------
// Mode toggle: Field mode (guided, named fields) vs Bit mode (raw bytes,
// real checksums / masking / cipher math).
// ---------------------------------------------------------------------------
const modeHints = {
  general: 'Edit the fields below, then hit "Send packet" — your edits travel on the wire. The checksum below is always real; you just can\u2019t break it yet.',
  advanced: 'Every byte here is real and yours to edit. Checksums, the WebSocket mask, and the QUIC auth tag are computed live from what you type — get them wrong and the wire will show it.'
};

modeToggle.addEventListener('click', e => {
  const btn = e.target.closest('.mode-btn');
  if (!btn) return;
  currentMode = btn.dataset.mode;
  modeToggle.querySelectorAll('.mode-btn').forEach(b => { b.classList.toggle('active', b === btn); b.setAttribute('aria-pressed', b === btn); });
  packetHint.textContent = modeHints[currentMode];
  renderPacketForm(currentProto);
});

// ---------------------------------------------------------------------------
// Bit-mode "on the wire" block — real checksum / masking / cipher UI.
// ---------------------------------------------------------------------------
function badge(valid, validText, invalidText) {
  return `<div class="validity-badge ${valid ? 'valid' : 'invalid'}" id="wireBadge">${valid ? '✓' : '✕'} ${valid ? validText : invalidText}</div>`;
}
function refreshWireBadge(key) {
  const el = document.getElementById('wireBadge');
  if (!el) return;
  const invalid = computeIsCorrupt(key);
  el.className = 'validity-badge ' + (invalid ? 'invalid' : 'valid');
  el.textContent = (invalid ? '✕ ' : '✓ ') + wireBadgeText[key][invalid ? 'invalid' : 'valid'];
}

function renderWireBlock(key) {
  if (currentMode !== 'advanced') { wireBlock.classList.add('hidden'); wireBlock.innerHTML = ''; return; }
  wireBlock.classList.remove('hidden');
  const state = packetState[key];

  if (checksumComputers[key]) {
    const computed = checksumComputers[key]();
    const valid = effectiveChecksumHex(key) === computed;
    wireBlock.innerHTML = `
      <div class="wire-block-title">On the wire — checksum</div>
      <p class="wire-note">${checksumNotes[key]}</p>
      <div class="wire-row" data-field-row="checksum">
        <div class="wire-row-head"><label>Computed checksum</label></div>
        <div class="wire-computed">0x${computed}</div>
      </div>
      <label class="override-toggle"><input type="checkbox" id="csOverride" ${state.manualChecksum ? 'checked' : ''}> Manually set the checksum field instead</label>
      ${state.manualChecksum ? `<div class="wire-row" data-field-row="checksum"><input type="text" id="csValue" maxlength="4" value="${escapeHtml(state.checksumValue)}" placeholder="hex, e.g. 1a2b" aria-label="Checksum field (hex)" spellcheck="false" autocomplete="off"></div>` : ''}
      ${badge(valid, wireBadgeText[key].valid, wireBadgeText[key].invalid)}
      <div class="wire-actions"><button type="button" class="btn-ghost btn-tiny" id="flipBitBtn">Flip a random bit</button></div>
    `;
    document.getElementById('csOverride').addEventListener('change', e => {
      state.manualChecksum = e.target.checked;
      if (state.manualChecksum) state.checksumValue = computed;
      refreshComputedViews(key);
    });
    const csValueEl = document.getElementById('csValue');
    if (csValueEl) csValueEl.addEventListener('input', e => {
      state.checksumValue = e.target.value;
      renderByteView(key); renderHexDump(key); refreshWireBadge(key);
    });
    document.getElementById('flipBitBtn').addEventListener('click', () => {
      state.manualChecksum = true;
      const bad = (parseInt(computed, 16) ^ (1 << Math.floor(Math.random() * 16))).toString(16).padStart(4, '0');
      state.checksumValue = bad;
      refreshComputedViews(key);
      log(`Flipped one bit of the checksum by hand: 0x${computed} → 0x${bad}.`, 'warn');
    });

  } else if (key === 'ws') {
    const expected = computeWsWireBytes(state);
    const current = effectiveWsWireHex();
    const valid = current === expected;
    const safeKey = safeMaskKeyBytes(state);
    const decoded = state.mask ? bytesToStr(xorRepeating(hexToBytes(current), safeKey)) : bytesToStr(hexToBytes(current));
    wireBlock.innerHTML = `
      <div class="wire-block-title">On the wire — masking</div>
      <p class="wire-note">Real RFC 6455 masking: masked byte = payload byte XOR mask-key byte (repeating). Only client → server frames are masked.</p>
      <div class="wire-row" data-field-row="maskKey">
        <div class="wire-row-head"><label for="maskKeyInput">Mask key (4 bytes, hex)</label></div>
        <input type="text" id="maskKeyInput" maxlength="8" value="${escapeHtml(state.maskKey)}" spellcheck="false" autocomplete="off">
      </div>
      <label class="override-toggle"><input type="checkbox" id="wireOverride" ${state.wireOverride ? 'checked' : ''}> Manually edit the on-the-wire bytes</label>
      ${state.wireOverride ? `<div class="wire-row" data-field-row="payload"><input type="text" id="wireBytesInput" value="${escapeHtml(state.wireBytesHex)}" placeholder="hex bytes" aria-label="On-the-wire payload bytes (hex)" spellcheck="false" autocomplete="off"></div>` : `<div class="wire-row" data-field-row="payload"><div class="wire-computed">0x${expected || '(empty)'}</div></div>`}
      <div class="wire-row">
        <div class="wire-row-head"><label>What the server decodes</label></div>
        <div class="wire-computed">"${escapeHtml(decoded)}"</div>
      </div>
      ${badge(valid, wireBadgeText.ws.valid, wireBadgeText.ws.invalid)}
      <div class="wire-actions"><button type="button" class="btn-ghost btn-tiny" id="flipBitBtn">Flip a random bit</button></div>
    `;
    document.getElementById('maskKeyInput').addEventListener('input', e => {
      state.maskKey = e.target.value;
      renderByteView(key); renderHexDump(key); refreshWireBadge(key);
    });
    document.getElementById('wireOverride').addEventListener('change', e => {
      state.wireOverride = e.target.checked;
      if (state.wireOverride) state.wireBytesHex = expected;
      refreshComputedViews(key);
    });
    const wireBytesEl = document.getElementById('wireBytesInput');
    if (wireBytesEl) wireBytesEl.addEventListener('input', e => {
      state.wireBytesHex = e.target.value;
      renderByteView(key); renderHexDump(key); refreshWireBadge(key);
    });
    document.getElementById('flipBitBtn').addEventListener('click', () => {
      state.wireOverride = true;
      const bytes = hexToBytes(expected || '00');
      const i = Math.floor(Math.random() * bytes.length);
      bytes[i] ^= (1 << Math.floor(Math.random() * 8));
      state.wireBytesHex = bytesToHex(bytes);
      refreshComputedViews(key);
      log('Flipped one bit of the on-the-wire bytes by hand.', 'warn');
    });

  } else if (key === 'quic') {
    const { cipherHex, tagHex } = computeQuicCipherAndTag(state);
    const eff = effectiveQuicHex();
    const valid = eff.cipher === cipherHex && eff.tag === tagHex;
    wireBlock.innerHTML = `
      <div class="wire-block-title">On the wire — encryption</div>
      <p class="wire-note">Illustrative stand-in for QUIC's AEAD encryption (real QUIC uses AES-GCM / ChaCha20-Poly1305): a keystream derived from the connection ID and packet number, plus an FNV-1a hash acting as the auth tag.</p>
      <div class="wire-row" data-field-row="payload">
        <div class="wire-row-head"><label>Ciphertext</label></div>
        <div class="wire-computed">0x${eff.cipher || '(empty)'}</div>
      </div>
      <label class="override-toggle"><input type="checkbox" id="cipherOverride" ${state.cipherOverride ? 'checked' : ''}> Manually edit the ciphertext</label>
      ${state.cipherOverride ? `<div class="wire-row" data-field-row="payload"><input type="text" id="cipherInput" value="${escapeHtml(state.cipherHexVal)}" aria-label="Ciphertext (hex)" spellcheck="false" autocomplete="off"></div>` : ''}
      <div class="wire-row" data-field-row="tag">
        <div class="wire-row-head"><label>Auth tag</label></div>
        <div class="wire-computed">0x${eff.tag}</div>
      </div>
      <label class="override-toggle"><input type="checkbox" id="tagOverride" ${state.tagOverride ? 'checked' : ''}> Manually set the auth tag</label>
      ${state.tagOverride ? `<div class="wire-row" data-field-row="tag"><input type="text" id="tagInput" maxlength="8" value="${escapeHtml(state.tagValue)}" aria-label="Auth tag (hex)" spellcheck="false" autocomplete="off"></div>` : ''}
      ${badge(valid, wireBadgeText.quic.valid, wireBadgeText.quic.invalid)}
      <div class="wire-actions"><button type="button" class="btn-ghost btn-tiny" id="flipBitBtn">Flip a random bit</button></div>
    `;
    document.getElementById('cipherOverride').addEventListener('change', e => {
      state.cipherOverride = e.target.checked;
      if (state.cipherOverride) state.cipherHexVal = cipherHex;
      refreshComputedViews(key);
    });
    const cipherInputEl = document.getElementById('cipherInput');
    if (cipherInputEl) cipherInputEl.addEventListener('input', e => {
      state.cipherHexVal = e.target.value;
      renderByteView(key); renderHexDump(key); refreshWireBadge(key);
    });
    document.getElementById('tagOverride').addEventListener('change', e => {
      state.tagOverride = e.target.checked;
      if (state.tagOverride) state.tagValue = tagHex;
      refreshComputedViews(key);
    });
    const tagInputEl = document.getElementById('tagInput');
    if (tagInputEl) tagInputEl.addEventListener('input', e => {
      state.tagValue = e.target.value;
      renderByteView(key); renderHexDump(key); refreshWireBadge(key);
    });
    document.getElementById('flipBitBtn').addEventListener('click', () => {
      state.tagOverride = true;
      const bad = (parseInt(tagHex, 16) ^ (1 << Math.floor(Math.random() * 32))).toString(16).padStart(8, '0');
      state.tagValue = bad;
      refreshComputedViews(key);
      log(`Flipped one bit of the auth tag by hand: 0x${tagHex} → 0x${bad}.`, 'warn');
    });
  }
}

function computeIsCorrupt(key) {
  if (currentMode === 'general') return corruptToggle.checked;
  if (checksumComputers[key]) return effectiveChecksumHex(key) !== checksumComputers[key]();
  if (key === 'ws') return effectiveWsWireHex() !== computeWsWireBytes(packetState.ws);
  if (key === 'quic') {
    const { cipherHex, tagHex } = computeQuicCipherAndTag(packetState.quic);
    const eff = effectiveQuicHex();
    return eff.cipher !== cipherHex || eff.tag !== tagHex;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Packet capture / history panel
// ---------------------------------------------------------------------------
const captures = [];
let captureSeq = 0;
const expandedCaptureIds = new Set();
const selectedCaptureIds = new Set();

function snapshotSegments(segments) { return JSON.parse(JSON.stringify(segments)); }

function addCapture({ proto, dir, label, summary, outcome, segments }) {
  const entry = {
    id: 'cap_' + (captureSeq++),
    time: new Date(),
    proto, dir, label, summary, outcome,
    segments: snapshotSegments(segments || buildPacketBytes(proto))
  };
  captures.unshift(entry);
  if (captures.length > 30) {
    const removed = captures.splice(30);
    removed.forEach(r => { expandedCaptureIds.delete(r.id); selectedCaptureIds.delete(r.id); });
  }
  renderCaptureList();
}

function captureRowHTML(c) {
  const expanded = expandedCaptureIds.has(c.id);
  const checked = selectedCaptureIds.has(c.id);
  const disableCheck = !checked && selectedCaptureIds.size >= 2;
  const timeStr = c.time.toLocaleTimeString([], { hour12: false });
  return `
    <div class="capture-row ${expanded ? 'expanded' : ''}" data-capture-id="${c.id}">
      <div class="capture-row-head" data-capture-toggle="${c.id}">
        <input type="checkbox" class="capture-check" data-capture-select="${c.id}" ${checked ? 'checked' : ''} ${disableCheck ? 'disabled' : ''} aria-label="Select ${escapeHtml(c.label)} at ${timeStr} for comparison">
        <span class="capture-proto">${c.proto.toUpperCase()}</span>
        <span class="capture-dir">${c.dir}</span>
        <span class="capture-status ${c.outcome}">${c.outcome}</span>
        <span class="capture-summary">${escapeHtml(c.label)} — ${escapeHtml(c.summary)}</span>
        <span class="capture-time">${timeStr}</span>
        <button type="button" class="capture-expand-btn" data-capture-expand="${c.id}" aria-expanded="${expanded}" aria-label="${expanded ? 'Hide' : 'Show'} bytes for ${escapeHtml(c.label)} at ${timeStr}"><span class="capture-expand-icon" aria-hidden="true">▶</span></button>
      </div>
      <div class="capture-row-body">${hexDumpHTML(c.segments)}</div>
    </div>
  `;
}

function renderCaptureList() {
  captureList.innerHTML = captures.length
    ? captures.map(captureRowHTML).join('')
    : '<div class="capture-empty" id="captureEmpty">No packets sent yet — hit "Send packet" above to start capturing.</div>';
  compareCaptureBtn.textContent = `Compare selected (${selectedCaptureIds.size}/2)`;
  compareCaptureBtn.disabled = selectedCaptureIds.size !== 2;
}

captureList.addEventListener('click', e => {
  const checkbox = e.target.closest('[data-capture-select]');
  if (checkbox) {
    e.stopPropagation();
    const id = checkbox.dataset.captureSelect;
    if (checkbox.checked) selectedCaptureIds.add(id); else selectedCaptureIds.delete(id);
    renderCaptureList();
    const again = captureList.querySelector(`[data-capture-select="${id}"]`);
    if (again) again.focus();
    return;
  }
  const head = e.target.closest('[data-capture-toggle]');
  if (head) {
    const id = head.dataset.captureToggle;
    const viaButton = !!e.target.closest('[data-capture-expand]');
    if (expandedCaptureIds.has(id)) expandedCaptureIds.delete(id); else expandedCaptureIds.add(id);
    renderCaptureList();
    if (viaButton) {
      const again = captureList.querySelector(`[data-capture-expand="${id}"]`);
      if (again) again.focus();
    }
  }
});

clearCaptureBtn.addEventListener('click', () => {
  captures.length = 0;
  expandedCaptureIds.clear();
  selectedCaptureIds.clear();
  renderCaptureList();
  captureCompare.classList.add('hidden');
  captureCompare.innerHTML = '';
});

compareCaptureBtn.addEventListener('click', () => {
  const [idA, idB] = [...selectedCaptureIds];
  const a = captures.find(c => c.id === idA);
  const b = captures.find(c => c.id === idB);
  if (!a || !b) return;
  const flatA = flattenSegments(a.segments);
  const flatB = flattenSegments(b.segments);
  const len = Math.max(flatA.length, flatB.length);
  const diffIdx = new Set();
  for (let i = 0; i < len; i++) if ((flatA[i] && flatA[i].value) !== (flatB[i] && flatB[i].value)) diffIdx.add(i);
  captureCompare.classList.remove('hidden');
  captureCompare.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'nearest' });
  captureCompare.innerHTML = `
    <div class="compare-diff-grid">
      <div class="compare-diff-col"><h4>${a.proto.toUpperCase()} — ${escapeHtml(a.label)} (${a.outcome})</h4>${hexDumpHTML(a.segments, { diffIdx })}</div>
      <div class="compare-diff-col"><h4>${b.proto.toUpperCase()} — ${escapeHtml(b.label)} (${b.outcome})</h4>${hexDumpHTML(b.segments, { diffIdx })}</div>
    </div>
    <div class="compare-legend"><b>Highlighted</b> bytes differ between the two captures, position for position.</div>
  `;
});

// ---------------------------------------------------------------------------
// Beginner-friendly step hint above the controls
// ---------------------------------------------------------------------------
function updateFlowSteps() {
  const s1 = document.querySelector('.flow-step[data-step="1"]');
  const s2 = document.querySelector('.flow-step[data-step="2"]');
  const s3 = document.querySelector('.flow-step[data-step="3"]');
  [s1, s2, s3].forEach(s => s.classList.remove('active', 'done'));
  if (!connected) {
    s1.classList.add('active');
  } else if (!sentSinceConnect) {
    s1.classList.add('done'); s2.classList.add('active');
  } else {
    s1.classList.add('done'); s2.classList.add('done'); s3.classList.add('active');
  }
}

// ---------------------------------------------------------------------------
// Operation guard. Connect / send / disconnect are multi-step async
// animations. Only one may run at a time, and switching protocol mid-flight
// aborts the old one — otherwise a TCP handshake finishing after you switched
// to UDP would mark UDP "connected" and log into the wrong protocol.
// ---------------------------------------------------------------------------
class OpAborted extends Error {}
let opGen = 0;
let busy = false;
let nextDrops = false;
let layoutPending = false;

async function pause(ms) {
  const gen = opGen;
  await sleep(ms);
  if (gen !== opGen) throw new OpAborted();
}

function syncControls() {
  connectBtn.disabled = busy || connected;
  sendBtn.disabled = busy || !connected;
  dropBtn.disabled = !connected;
  disconnectBtn.disabled = busy || !connected;
  connectBtn.setAttribute('aria-busy', busy);
  if (!busy && layoutPending) {
    layoutPending = false;
    if (layoutScene()) drawScene();
  }
}

function setDropArmed(on) {
  nextDrops = on;
  dropBtn.classList.toggle('armed', on);
  dropBtn.setAttribute('aria-pressed', on);
  dropBtn.textContent = on ? 'Next packet will be lost ✕' : 'Simulate packet loss';
}

function runOp(fn) {
  return async () => {
    if (busy) return;
    const gen = opGen;
    busy = true;
    syncControls();
    try {
      await fn();
    } catch (err) {
      if (!(err instanceof OpAborted)) throw err;
    } finally {
      if (gen === opGen) { busy = false; syncControls(); }
    }
  };
}

// ---------------------------------------------------------------------------
// Protocol switching
// ---------------------------------------------------------------------------
function setProtoUI(key) {
  opGen++;              // abort any in-flight animation for the old protocol
  busy = false;
  currentProto = key;
  const p = protocols[key];
  protoTitle.textContent = p.title;
  protoTagline.textContent = p.tagline;
  whyContent.innerHTML = p.why;
  connectBtn.textContent = p.connectLabel;
  connected = false;
  sentSinceConnect = false;
  wsSide = 'client';
  setDropArmed(false);
  eventLog.innerHTML = '';
  layoutScene();
  drawScene();
  updateFlowSteps();
  syncControls();
  renderPacketForm(key);
  log(`Switched to ${key.toUpperCase()}. ${p.needsHandshake ? 'Click connect to begin.' : 'No connection needed — you can send immediately after marking ready.'}`, 'info');
}

const protoTabEls = document.querySelectorAll('.tab');
protoTabEls.forEach(tab => {
  tab.addEventListener('click', () => {
    protoTabEls.forEach(t => { t.classList.toggle('active', t === tab); t.setAttribute('aria-pressed', t === tab); });
    setProtoUI(tab.dataset.proto);
  });
});

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (busy) { layoutPending = true; return; }
    if (layoutScene()) drawScene();
  }, 120);
});

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------
connectBtn.addEventListener('click', runOp(async () => {
  const p = protocols[currentProto];
  if (p.needsHandshake) {
    if (currentProto === 'tcp') {
      const isn = packetState.tcp.seq;
      log(`→ SYN  seq=${isn}`, 'info');
      await animatePacket('SYN', client.x, client.y, server.x, server.y, '#A78BFA', false);
      log(`← SYN-ACK  ack=${(Number(isn) + 1) >>> 0}`, 'info');
      await animatePacket('SYN-ACK', server.x, server.y, client.x, client.y, '#67E8F9', false);
      log('→ ACK', 'info');
      await animatePacket('ACK', client.x, client.y, server.x, server.y, '#A78BFA', false);
      log('Connection established after 1 round trip (the final ACK can carry data).', 'ok');
    } else if (currentProto === 'ws') {
      log('(Assumes a TCP connection — and TLS for wss:// — is already open underneath.)', 'info');
      log('→ GET / HTTP/1.1  Upgrade: websocket', 'info');
      await animatePacket('UPGRADE', client.x, client.y, server.x, server.y, '#A78BFA', false);
      log('← 101 Switching Protocols', 'info');
      await animatePacket('101', server.x, server.y, client.x, client.y, '#67E8F9', false);
      log('Connection upgraded. Socket stays open.', 'ok');
    } else if (currentProto === 'quic') {
      log('→ Initial (ClientHello + connection ID)', 'info');
      await animatePacket('INITIAL', client.x, client.y, server.x, server.y, '#A78BFA', false);
      log('← Initial + Handshake (ServerHello, cert, Finished)', 'info');
      await animatePacket('HELLO', server.x, server.y, client.x, client.y, '#67E8F9', false);
      log('→ Handshake (client Finished) — application data may ride along', 'info');
      await animatePacket('FINISH', client.x, client.y, server.x, server.y, '#A78BFA', false);
      log('1-RTT handshake complete — transport and TLS set up together.', 'ok');
    }
  } else {
    log(p.noHandshakeNote, 'info');
  }
  connected = true;
  drawScene();
  updateFlowSteps();
}));

// ---------------------------------------------------------------------------
// Simulate physical packet loss (one-shot toggle, available in both modes)
// ---------------------------------------------------------------------------
dropBtn.addEventListener('click', () => {
  setDropArmed(!nextDrops);
  log(nextDrops ? 'Next packet will be simulated as lost in transit.' : 'Packet loss disarmed.', 'info');
});

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------
function buildDetail(key) {
  const fields = protocols[key].fields.filter(f => !(currentMode === 'advanced' && f.hideInAdvanced) && !(f.advancedOnly && currentMode !== 'advanced'));
  const state = packetState[key];
  return fields.map(f => {
    if (f.type === 'computed') return `${f.id}=0x${checksumComputers[key] ? effectiveChecksumHex(key) : ''}`;
    return `${f.id}=${fieldValueDisplay(f, state[f.id])}`;
  }).join(' ');
}

sendBtn.addEventListener('click', runOp(async () => {
  const key = currentProto;
  const willDropPhysically = nextDrops;
  setDropArmed(false);
  const isCorrupt = computeIsCorrupt(key);
  if (currentMode === 'general') corruptToggle.checked = false;

  const state = packetState[key];
  const detail = buildDetail(key);
  const payloadPreview = (state.payload || '').slice(0, 24);
  // Snapshot the bytes now, so edits made mid-animation don't leak into the capture.
  const sentSegs = snapshotSegments(buildPacketBytes(key));
  const cleanSegs = snapshotSegments(buildPacketBytes(key, { clean: true }));

  sentSinceConnect = true;
  updateFlowSteps();

  if (key === 'tcp') {
    log(`→ DATA  ${detail}`, '');
    if (willDropPhysically) {
      await animatePacket('DATA', client.x, client.y, server.x, server.y, '#A78BFA', true, { title: detail });
      log('✕ Packet lost in transit.', 'lost');
      addCapture({ proto: 'tcp', dir: 'C→S', label: 'DATA', summary: detail, outcome: 'lost', segments: sentSegs });
      await pause(300);
      log('… no ACK received, retransmission timer fired', 'lost');
      log('→ DATA (retransmit, same sequence number)', 'info');
      await animatePacket('DATA', client.x, client.y, server.x, server.y, '#A78BFA', false, { title: detail });
      log('← ACK', 'ok');
      await animatePacket('ACK', server.x, server.y, client.x, client.y, '#67E8F9', false);
      log('Delivered after retransmission. Application layer never saw the failure.', 'ok');
      addCapture({ proto: 'tcp', dir: 'C→S', label: 'DATA (retransmit)', summary: detail, outcome: 'delivered', segments: cleanSegs });
    } else if (isCorrupt) {
      await animatePacket('DATA', client.x, client.y, server.x, server.y, '#FB7185', false, { title: detail + ' (corrupted)' });
      log('⚠ Segment arrived, but the checksum doesn’t match — server silently discards it.', 'warn');
      addCapture({ proto: 'tcp', dir: 'C→S', label: 'DATA', summary: detail, outcome: 'corrupted', segments: sentSegs });
      await pause(300);
      log('… no ACK received, retransmission timer fired', 'lost');
      log('→ DATA (retransmit, checksum intact)', 'info');
      await animatePacket('DATA', client.x, client.y, server.x, server.y, '#A78BFA', false, { title: detail });
      log('← ACK', 'ok');
      await animatePacket('ACK', server.x, server.y, client.x, client.y, '#67E8F9', false);
      log('Delivered after retransmission.', 'ok');
      addCapture({ proto: 'tcp', dir: 'C→S', label: 'DATA (retransmit)', summary: detail, outcome: 'delivered', segments: cleanSegs });
    } else {
      await animatePacket('DATA', client.x, client.y, server.x, server.y, '#A78BFA', false, { title: detail });
      log('← ACK', 'ok');
      await animatePacket('ACK', server.x, server.y, client.x, client.y, '#67E8F9', false);
      log(`Delivered and acknowledged. "${payloadPreview}"`, 'ok');
      addCapture({ proto: 'tcp', dir: 'C→S', label: 'DATA', summary: detail, outcome: 'delivered', segments: sentSegs });
    }
  } else if (key === 'udp') {
    log(`→ DATAGRAM  ${detail}`, '');
    if (willDropPhysically) {
      await animatePacket('DGRAM', client.x, client.y, server.x, server.y, '#A78BFA', true, { title: detail });
      log('✕ Datagram lost. No retry, no notification. It’s simply gone.', 'lost');
      addCapture({ proto: 'udp', dir: 'C→S', label: 'DGRAM', summary: detail, outcome: 'lost', segments: sentSegs });
    } else if (isCorrupt) {
      await animatePacket('DGRAM', client.x, client.y, server.x, server.y, '#FB7185', false, { title: detail + ' (corrupted)' });
      log('⚠ Checksum mismatch — the kernel drops it before your app ever sees it. No retry.', 'warn');
      addCapture({ proto: 'udp', dir: 'C→S', label: 'DGRAM', summary: detail, outcome: 'corrupted', segments: sentSegs });
    } else {
      await animatePacket('DGRAM', client.x, client.y, server.x, server.y, '#A78BFA', false, { title: detail });
      log(`Delivered. No acknowledgment is ever sent back. "${payloadPreview}"`, 'ok');
      addCapture({ proto: 'udp', dir: 'C→S', label: 'DGRAM', summary: detail, outcome: 'delivered', segments: sentSegs });
    }
  } else if (key === 'ws') {
    const fromClient = wsSide === 'client';
    wsSide = fromClient ? 'server' : 'client';
    const [fx, fy, tx, ty] = fromClient ? [client.x, client.y, server.x, server.y] : [server.x, server.y, client.x, client.y];
    const dir = fromClient ? 'C→S' : 'S→C';
    // Server -> client frames are never masked (RFC 6455 §5.1), so capture those bytes unmasked.
    const frameSegs = fromClient ? sentSegs : snapshotSegments(buildPacketBytes('ws', { fromServer: true }));
    const frameLabel = state.opcode.slice(0, 6).toUpperCase();
    log((fromClient ? '→ ' : '← ') + `${state.opcode.toUpperCase()} frame${fromClient ? '' : ' (unmasked — server frames never are)'}  ${detail}`, '');
    if (willDropPhysically) {
      await animatePacket(frameLabel, fx, fy, tx, ty, fromClient ? '#A78BFA' : '#67E8F9', true, { title: detail });
      log('✕ The TCP segment carrying this frame was lost.', 'lost');
      addCapture({ proto: 'ws', dir, label: state.opcode.toUpperCase(), summary: detail, outcome: 'lost', segments: frameSegs });
      await pause(300);
      log('… TCP underneath notices the missing ACK and retransmits — WebSocket itself does nothing.', 'info');
      await animatePacket(frameLabel, fx, fy, tx, ty, fromClient ? '#A78BFA' : '#67E8F9', false, { title: detail });
      log(`Delivered late but intact — the app just sees a delay. "${payloadPreview}"`, 'ok');
      addCapture({ proto: 'ws', dir, label: state.opcode.toUpperCase() + ' (TCP retransmit)', summary: detail, outcome: 'delivered', segments: fromClient ? cleanSegs : frameSegs });
    } else if (isCorrupt) {
      await animatePacket(frameLabel, fx, fy, tx, ty, '#FB7185', false, { title: detail + ' (corrupted)' });
      log('⚠ The payload was altered before it was sent, so TCP’s checksum still passes and delivers it faithfully — the receiver decodes garbage. (A text frame that isn’t valid UTF-8 gets closed with code 1007.)', 'warn');
      addCapture({ proto: 'ws', dir, label: state.opcode.toUpperCase(), summary: detail, outcome: 'corrupted', segments: frameSegs });
    } else {
      await animatePacket(frameLabel, fx, fy, tx, ty, fromClient ? '#A78BFA' : '#67E8F9', false, { title: detail });
      log((fromClient ? 'Server received it instantly — no request needed.' : 'Client received an unsolicited push from the server.') + ` "${payloadPreview}"`, 'ok');
      addCapture({ proto: 'ws', dir, label: state.opcode.toUpperCase(), summary: detail, outcome: 'delivered', segments: frameSegs });
    }
  } else if (key === 'quic') {
    log(`→ STREAM ${state.streamId}  ${detail}`, '');
    if (willDropPhysically || isCorrupt) {
      const color = isCorrupt ? '#FB7185' : '#A78BFA';
      await animatePacket('STREAM', client.x, client.y, server.x, server.y, color, willDropPhysically, { title: detail, dropPoint: 0.6 });
      log(isCorrupt && !willDropPhysically ? '⚠ Auth tag fails — the encrypted packet can’t be decrypted, so it’s dropped.' : '✕ Packet lost in transit.', isCorrupt && !willDropPhysically ? 'warn' : 'lost');
      addCapture({ proto: 'quic', dir: 'C→S', label: 'STREAM', summary: detail, outcome: isCorrupt && !willDropPhysically ? 'corrupted' : 'lost', segments: sentSegs });
      log(`… only stream ${state.streamId} stalls — other streams on this connection keep flowing.`, 'info');
      // QUIC never re-sends a packet: the lost STREAM data goes out again in a
      // brand-new packet with the next packet number.
      const oldPn = Number(state.packetNumber) || 0;
      state.packetNumber = (oldPn + 1) >>> 0;
      renderPacketForm(key);
      const retxDetail = buildDetail(key);
      const retxSegs = snapshotSegments(buildPacketBytes(key, { clean: true }));
      log(`→ STREAM data re-sent in a new packet (packet number ${oldPn} → ${state.packetNumber})`, 'info');
      await animatePacket('STREAM', client.x, client.y, server.x, server.y, '#A78BFA', false, { title: retxDetail });
      log('← ACK', 'ok');
      await animatePacket('ACK', server.x, server.y, client.x, client.y, '#67E8F9', false);
      log('Delivered after retransmission, with zero head-of-line blocking on other streams.', 'ok');
      addCapture({ proto: 'quic', dir: 'C→S', label: 'STREAM (retransmit)', summary: retxDetail, outcome: 'delivered', segments: retxSegs });
    } else {
      await animatePacket('STREAM', client.x, client.y, server.x, server.y, '#A78BFA', false, { title: detail });
      log('← ACK', 'ok');
      await animatePacket('ACK', server.x, server.y, client.x, client.y, '#67E8F9', false);
      log(`Delivered and acknowledged. "${payloadPreview}"`, 'ok');
      addCapture({ proto: 'quic', dir: 'C→S', label: 'STREAM', summary: detail, outcome: 'delivered', segments: sentSegs });
    }
  } else if (key === 'ip') {
    log(`→ PACKET  ${detail}`, '');
    if (Number(state.ttl) <= 0) {
      await animatePacket('PACKET', client.x, client.y, server.x, server.y, '#A78BFA', true, { title: detail, dropPoint: 0.4 });
      log('✕ TTL is 0 — the first router discards it and would normally send back an ICMP Time Exceeded.', 'lost');
      addCapture({ proto: 'ip', dir: 'C→S', label: 'PACKET', summary: detail, outcome: 'lost', segments: sentSegs });
    } else if (willDropPhysically) {
      await animatePacket('PACKET', client.x, client.y, server.x, server.y, '#A78BFA', true, { title: detail });
      log('✕ Packet lost in transit — a router along the path dropped it. No notification, no retry at this layer.', 'lost');
      addCapture({ proto: 'ip', dir: 'C→S', label: 'PACKET', summary: detail, outcome: 'lost', segments: sentSegs });
    } else if (isCorrupt) {
      await animatePacket('PACKET', client.x, client.y, server.x, server.y, '#FB7185', false, { title: detail + ' (corrupted)' });
      log('⚠ Header checksum mismatch — the next router discards it immediately, before even looking at the payload.', 'warn');
      addCapture({ proto: 'ip', dir: 'C→S', label: 'PACKET', summary: detail, outcome: 'corrupted', segments: sentSegs });
    } else {
      await animatePacket('PACKET', client.x, client.y, server.x, server.y, '#A78BFA', false, { title: detail });
      log(`Delivered. IP itself never acknowledges — that's left to whatever protocol rides inside it. "${payloadPreview}"`, 'ok');
      addCapture({ proto: 'ip', dir: 'C→S', label: 'PACKET', summary: detail, outcome: 'delivered', segments: sentSegs });
    }
  }
}));

// ---------------------------------------------------------------------------
// Disconnect
// ---------------------------------------------------------------------------
disconnectBtn.addEventListener('click', runOp(async () => {
  const p = protocols[currentProto];
  if (currentProto === 'tcp') {
    log('→ FIN', 'info');
    await animatePacket('FIN', client.x, client.y, server.x, server.y, '#FB7185', false);
    log('← FIN-ACK (server ACKs and sends its own FIN)', 'info');
    await animatePacket('FIN-ACK', server.x, server.y, client.x, client.y, '#FB7185', false);
    log('→ ACK', 'info');
    await animatePacket('ACK', client.x, client.y, server.x, server.y, '#FB7185', false);
    log('Connection closed cleanly. The client lingers in TIME_WAIT briefly in case that last ACK was lost.', 'ok');
  } else if (currentProto === 'ws') {
    log('→ Close frame', 'info');
    await animatePacket('CLOSE', client.x, client.y, server.x, server.y, '#FB7185', false);
    log('← Close frame (server echoes it)', 'info');
    await animatePacket('CLOSE', server.x, server.y, client.x, client.y, '#FB7185', false);
    log('Closing handshake done. The underlying TCP connection is then torn down with FIN/ACK.', 'ok');
  } else if (currentProto === 'quic') {
    log('→ CONNECTION_CLOSE frame', 'info');
    await animatePacket('CLOSE', client.x, client.y, server.x, server.y, '#FB7185', false);
    log('Connection closed. No separate socket teardown — it was one encrypted session throughout.', 'ok');
  } else {
    log(p.noTeardownNote, 'info');
  }
  connected = false;
  sentSinceConnect = false;
  drawScene();
  updateFlowSteps();
}));

layoutScene();
setProtoUI('tcp');
