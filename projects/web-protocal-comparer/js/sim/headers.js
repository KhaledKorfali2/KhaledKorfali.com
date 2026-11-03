// Packet headers: RFC-style bit layouts and real byte encodings.
//
// HEADER_LAYOUTS  — bit diagrams (each row is one 32-bit word) for the Protocols pages and lessons.
// encodeLayers(p) — turns a simulator packet into its on-the-wire layers, outermost first, with real
//                   bytes: valid IPv4/TCP/UDP/ICMP checksums, DNS wire format, TLS records, HTTP/1.1
//                   text, HTTP/2 + HPACK, QUIC with varints and header protection, HTTP/3 + QPACK,
//                   masked WebSocket frames.
// describePacket(p) — one-line human summary.
//
// Layer shape: { id, name, layout?, fields, bytes, totalLength, truncated, decrypted?, note? }
//   field: { name, key?, value, bits, desc, offset, length, bitOffset, protected? }
//   offset/length are in BYTES within the layer's bytes (the bytes that contain the field);
//   bitOffset/bits give the exact bit position for sub-byte fields (flags, IHL, …).
//   bytes is capped at CAP for display; totalLength is the real size.
//   Layers with decrypted: true are NOT on the wire as shown: they are what the endpoints see after
//   removing TLS / QUIC packet protection (the wire carries the encrypted layer above them).
// Anything that is genuinely secret or random (keys, ciphertext, randoms, certificate data) is
// deterministic pseudo-random filler, labelled as such.

import { ADDRESSES } from "./engine.js";

export const CAP = 256;

/* ------------------------------------------------------------------------------------------------
 * Layouts
 * ---------------------------------------------------------------------------------------------- */

const f = (name, bits, key, desc, extra) => ({ name, bits, key, desc, ...(extra || {}) });

export const HEADER_LAYOUTS = {
  ipv4: {
    id: "ipv4", name: "IPv4", rfc: "RFC 791",
    rows: [
      [
        f("Version", 4, "version", "IP version number; always 4 for IPv4."),
        f("IHL", 4, "ihl", "Internet Header Length in 32-bit words (5 = 20 bytes, no options)."),
        f("DSCP", 6, "dscp", "Differentiated Services code point: which traffic class (0 = best effort).",
          { note: "RFC 791 called these 8 bits 'Type of Service'; RFC 2474 and RFC 3168 redefined them as DSCP + ECN." }),
        f("ECN", 2, "ecn", "Explicit Congestion Notification: routers can mark congestion here instead of dropping."),
        f("Total Length", 16, "totalLength", "Size of the whole datagram, header plus data, in bytes."),
      ],
      [
        f("Identification", 16, "id", "Number shared by all fragments of one original datagram, so they can be reassembled."),
        f("Reserved", 1, "flagReserved", "Reserved flag bit; must be zero.", { note: "Flags field, bit 0." }),
        f("DF", 1, "df", "Don't Fragment: drop the packet rather than split it (used for path-MTU discovery)."),
        f("MF", 1, "mf", "More Fragments: set on every fragment except the last."),
        f("Fragment Offset", 13, "fragOffset", "Where this fragment's data belongs in the original, in 8-byte units."),
      ],
      [
        f("Time to Live", 8, "ttl", "Hop limit: every router subtracts 1 and discards the packet when it reaches 0."),
        f("Protocol", 8, "protocol", "What is inside the data: 1 = ICMP, 6 = TCP, 17 = UDP."),
        f("Header Checksum", 16, "checksum", "Ones'-complement checksum of this header only; routers recompute it after changing TTL."),
      ],
      [f("Source Address", 32, "src", "IPv4 address of the sender.")],
      [f("Destination Address", 32, "dst", "IPv4 address of the final recipient (routers forward toward it).")],
      [f("Options + Padding", 32, "options", "Rarely used extras; present only when IHL > 5, padded to a 32-bit boundary.", { variable: true })],
    ],
  },

  tcp: {
    id: "tcp", name: "TCP", rfc: "RFC 9293",
    rows: [
      [
        f("Source Port", 16, "srcPort", "Port of the sending application (clients usually use a random 'ephemeral' port)."),
        f("Destination Port", 16, "dstPort", "Port of the receiving application, e.g. 443 for HTTPS."),
      ],
      [f("Sequence Number", 32, "seq", "Byte number of the first data byte in this segment (the SYN itself consumes one number).")],
      [f("Acknowledgment Number", 32, "ack", "Next byte the sender expects to receive; valid only when ACK is set (cumulative).")],
      [
        f("Data Offset", 4, "dataOffset", "Header length in 32-bit words, so the receiver knows where data starts."),
        f("Rsrvd", 4, "reserved", "Reserved for future use; must be zero."),
        f("CWR", 1, "cwr", "Congestion Window Reduced: sender has reacted to an ECN echo."),
        f("ECE", 1, "ece", "ECN-Echo: tells the sender the network marked congestion."),
        f("URG", 1, "urg", "Urgent Pointer field is significant (almost never used)."),
        f("ACK", 1, "ackFlag", "Acknowledgment Number field is valid; set on every segment after the first SYN."),
        f("PSH", 1, "psh", "Push: hand the data to the application promptly."),
        f("RST", 1, "rst", "Reset: abort the connection immediately."),
        f("SYN", 1, "syn", "Synchronize sequence numbers: opens a connection."),
        f("FIN", 1, "fin", "Finish: the sender has no more data to send."),
        f("Window", 16, "window", "How many more bytes the receiver is willing to accept (flow control)."),
      ],
      [
        f("Checksum", 16, "checksum", "Ones'-complement checksum over a pseudo-header (IPs, protocol, length) plus header and data."),
        f("Urgent Pointer", 16, "urgentPtr", "Offset of the end of urgent data when URG is set; otherwise zero."),
      ],
      [f("Options", 32, "options", "Optional extras such as Maximum Segment Size (on SYN), window scale, SACK, timestamps.", { variable: true })],
      [f("Data", 32, "data", "The application bytes carried by this segment (may be empty).", { variable: true })],
    ],
  },

  udp: {
    id: "udp", name: "UDP", rfc: "RFC 768",
    rows: [
      [
        f("Source Port", 16, "srcPort", "Port of the sending application."),
        f("Destination Port", 16, "dstPort", "Port of the receiving application, e.g. 53 for DNS, 443 for QUIC."),
      ],
      [
        f("Length", 16, "length", "Length of the UDP header plus data, in bytes (minimum 8)."),
        f("Checksum", 16, "checksum", "Ones'-complement checksum over pseudo-header, header and data (0 = not computed)."),
      ],
      [f("Data", 32, "data", "The datagram's payload, delivered as one unit or not at all.", { variable: true })],
    ],
  },

  icmp: {
    id: "icmp", name: "ICMP", rfc: "RFC 792",
    rows: [
      [
        f("Type", 8, "type", "Kind of message: 8 = echo request, 0 = echo reply, 11 = time exceeded, 3 = unreachable."),
        f("Code", 8, "code", "Sub-kind of the type, e.g. 0 = 'TTL exceeded in transit' for type 11."),
        f("Checksum", 16, "checksum", "Ones'-complement checksum of the whole ICMP message."),
      ],
      [
        f("Identifier", 16, "identifier", "Echo only: matches replies to the ping process that sent the request.",
          { note: "For Time Exceeded and Destination Unreachable these 32 bits are unused (zero)." }),
        f("Sequence Number", 16, "sequence", "Echo only: counts requests so replies can be matched and losses spotted."),
      ],
      [f("Data", 32, "data", "Echo: arbitrary bytes echoed back. Errors: the original IP header + first 8 bytes of its data.", { variable: true })],
    ],
  },

  dns: {
    id: "dns", name: "DNS", rfc: "RFC 1035",
    rows: [
      [
        f("ID", 16, "id", "Random query identifier; the response must carry the same ID."),
        f("QR", 1, "qr", "0 = query, 1 = response."),
        f("Opcode", 4, "opcode", "Kind of query: 0 = standard query."),
        f("AA", 1, "aa", "Authoritative Answer: the responder owns this zone."),
        f("TC", 1, "tc", "Truncated: the response did not fit in the UDP datagram; retry over TCP."),
        f("RD", 1, "rd", "Recursion Desired: please resolve the name fully for me."),
        f("RA", 1, "ra", "Recursion Available: this server does recursive lookups."),
        f("Z", 3, "z", "Reserved; zero.", { note: "RFC 4035 later used two of these bits as AD and CD for DNSSEC." }),
        f("RCODE", 4, "rcode", "Response code: 0 = no error, 2 = server failure, 3 = name does not exist (NXDOMAIN)."),
      ],
      [
        f("QDCOUNT", 16, "qdcount", "Number of entries in the Question section (almost always 1)."),
        f("ANCOUNT", 16, "ancount", "Number of resource records in the Answer section."),
      ],
      [
        f("NSCOUNT", 16, "nscount", "Number of name-server records in the Authority section."),
        f("ARCOUNT", 16, "arcount", "Number of records in the Additional section."),
      ],
      [f("Question, Answer, Authority, Additional", 32, "sections", "Variable-length sections: the name asked about, then resource records.", { variable: true })],
    ],
  },

  "quic-long": {
    id: "quic-long", name: "QUIC long header", rfc: "RFC 9000 §17.2",
    rows: [
      [
        f("Header Form", 1, "form", "1 = long header (used during the handshake: Initial, 0-RTT, Handshake, Retry)."),
        f("Fixed Bit", 1, "fixed", "Always 1 in QUIC v1, so QUIC can be told apart from other protocols on the same port."),
        f("Long Packet Type", 2, "longType", "0 = Initial, 1 = 0-RTT, 2 = Handshake, 3 = Retry."),
        f("Reserved Bits", 2, "reserved", "Must be 0; protected by header protection.", { note: "Type-specific bits for Initial, 0-RTT and Handshake." }),
        f("Packet Number Length", 2, "pnLength", "Packet number length minus 1 (0–3 → 1–4 bytes); protected by header protection."),
        f("Version", 24, "version", "QUIC version (0x00000001 = QUIC v1).", { note: "32 bits; continues on the next row." }),
      ],
      [
        f("Version (cont.)", 8, "version", "Last 8 bits of the 32-bit Version."),
        f("DCID Length", 8, "dcidLen", "Length of the Destination Connection ID in bytes (0–20)."),
        f("Destination Connection ID", 16, "dcid", "Identifies the connection at the receiver, so it survives IP/port changes.", { variable: true, note: "0–160 bits." }),
      ],
      [
        f("SCID Length", 8, "scidLen", "Length of the Source Connection ID in bytes (0–20)."),
        f("Source Connection ID", 24, "scid", "The ID the sender wants the peer to use when replying.", { variable: true, note: "0–160 bits." }),
      ],
      [
        f("Token Length", 8, "tokenLength", "Initial packets only: length of the token (variable-length integer).", { variable: true, note: "Initial only; 1–8 byte varint." }),
        f("Token", 24, "token", "Initial packets only: address-validation token from a Retry or NEW_TOKEN (often empty).", { variable: true }),
      ],
      [
        f("Length", 16, "length", "Length of Packet Number + Payload in bytes (variable-length integer).", { variable: true, note: "1–8 byte varint." }),
        f("Packet Number", 16, "pn", "Per-space counter, never reused; truncated to 1–4 bytes and protected by header protection.", { variable: true, note: "8–32 bits." }),
      ],
      [f("Packet Payload", 32, "payload", "Encrypted frames (CRYPTO, ACK, STREAM, PADDING, …) plus a 16-byte authentication tag.", { variable: true })],
    ],
  },

  "quic-short": {
    id: "quic-short", name: "QUIC short header (1-RTT)", rfc: "RFC 9000 §17.3.1",
    rows: [
      [
        f("Header Form", 1, "form", "0 = short header, used for all application data after the handshake."),
        f("Fixed Bit", 1, "fixed", "Always 1 in QUIC v1."),
        f("Spin Bit", 1, "spin", "Flips once per round trip, letting on-path observers estimate RTT (optional)."),
        f("Reserved Bits", 2, "reserved", "Must be 0; protected by header protection."),
        f("Key Phase", 1, "keyPhase", "Which generation of 1-RTT keys encrypted this packet (flips on key update); protected."),
        f("Packet Number Length", 2, "pnLength", "Packet number length minus 1; protected by header protection."),
        f("Destination Connection ID", 24, "dcid", "Connection ID chosen by the receiver; its length is not on the wire (the receiver knows it).", { variable: true, note: "0–160 bits." }),
      ],
      [f("Packet Number", 32, "pn", "Truncated packet number (1–4 bytes), protected by header protection.", { variable: true, note: "8–32 bits." })],
      [f("Protected Payload", 32, "payload", "Encrypted frames plus a 16-byte authentication tag.", { variable: true })],
    ],
  },

  websocket: {
    id: "websocket", name: "WebSocket frame", rfc: "RFC 6455 §5.2",
    rows: [
      [
        f("FIN", 1, "fin", "1 = this is the final fragment of the message."),
        f("RSV1", 1, "rsv1", "Reserved for extensions (e.g. permessage-deflate); 0 otherwise."),
        f("RSV2", 1, "rsv2", "Reserved for extensions; 0."),
        f("RSV3", 1, "rsv3", "Reserved for extensions; 0."),
        f("Opcode", 4, "opcode", "0 = continuation, 1 = text, 2 = binary, 8 = close, 9 = ping, 10 = pong."),
        f("MASK", 1, "mask", "1 = payload is XOR-masked with the masking key (required for client-to-server frames)."),
        f("Payload len", 7, "payloadLen", "0–125 = the length; 126 = next 16 bits hold it; 127 = next 64 bits hold it."),
        f("Extended payload length", 16, "extLen", "Present if Payload len is 126 (16-bit length) or 127 (64-bit length).", { variable: true, note: "if payload len == 126/127" }),
      ],
      [f("Extended payload length continued", 32, "extLen", "Remaining bits of the 64-bit length, if Payload len is 127.", { variable: true, note: "if payload len == 127" })],
      [
        f("Extended payload length continued", 16, "extLen", "Last 16 bits of the 64-bit length, if Payload len is 127.", { variable: true }),
        f("Masking-key", 16, "maskKey", "Random 4-byte key the client XORs over the payload, if MASK is set.", { variable: true, note: "if MASK set to 1" }),
      ],
      [
        f("Masking-key (continued)", 16, "maskKey", "Second half of the 4-byte masking key.", { variable: true }),
        f("Payload Data", 16, "payload", "Extension data followed by application data.", { variable: true }),
      ],
      [f("Payload Data continued …", 32, "payload", "The rest of the payload.", { variable: true })],
    ],
  },

  "http2-frame": {
    id: "http2-frame", name: "HTTP/2 frame header", rfc: "RFC 9113 §4.1",
    rows: [
      [
        f("Length", 24, "length", "Length of the frame payload in bytes (the 9-byte header is not included)."),
        f("Type", 8, "type", "0 = DATA, 1 = HEADERS, 3 = RST_STREAM, 4 = SETTINGS, 6 = PING, 7 = GOAWAY, 8 = WINDOW_UPDATE …"),
      ],
      [
        f("Flags", 8, "flags", "Type-specific flags, e.g. END_STREAM (0x1), END_HEADERS (0x4)."),
        f("R", 1, "r", "Reserved bit; must be 0."),
        f("Stream Identifier", 23, "streamId", "Which stream (request/response) this frame belongs to; 0 = the whole connection.", { note: "31 bits; continues on the next row." }),
      ],
      [
        f("Stream Identifier (cont.)", 8, "streamId", "Last 8 bits of the 31-bit stream identifier."),
        f("Frame Payload", 24, "payload", "Depends on Type: HPACK-compressed headers, body bytes, settings …", { variable: true }),
      ],
    ],
  },

  "tls-record": {
    id: "tls-record", name: "TLS record header", rfc: "RFC 8446 §5.1",
    rows: [
      [
        f("ContentType", 8, "contentType", "20 = change_cipher_spec, 21 = alert, 22 = handshake, 23 = application_data."),
        f("legacy_record_version", 16, "version", "Frozen at 0x0303 ('TLS 1.2') for compatibility; the real version is negotiated inside the handshake."),
        f("Length", 8, "length", "Length of the fragment that follows, in bytes (max 2^14 plus encryption overhead).", { note: "16 bits; continues on the next row." }),
      ],
      [
        f("Length (cont.)", 8, "length", "Low byte of the 16-bit length."),
        f("Fragment", 24, "fragment", "Handshake messages, or ciphertext + authentication tag once encryption is on.", { variable: true }),
      ],
    ],
  },
};

const DESC = {};
for (const L of Object.values(HEADER_LAYOUTS)) {
  DESC[L.id] = {};
  for (const row of L.rows) for (const fl of row) if (fl.key && !DESC[L.id][fl.key]) DESC[L.id][fl.key] = fl.desc;
}
const d = (layout, key) => (DESC[layout] && DESC[layout][key]) || "";

/* ------------------------------------------------------------------------------------------------
 * Byte helpers
 * ---------------------------------------------------------------------------------------------- */

const u16 = (n) => [(n >>> 8) & 255, n & 255];
const u24 = (n) => [(n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const hex = (n, w) => "0x" + (n >>> 0).toString(16).padStart(w, "0");
const hexStr = (a) => a.map((b) => b.toString(16).padStart(2, "0")).join("");
const encoder = new TextEncoder();
const text = (s) => Array.from(encoder.encode(String(s)));
const sum = (parts) => parts.reduce((s, p) => s + p.bytes.length, 0);
const flat = (parts) => { const out = []; for (const p of parts) for (const b of p.bytes) out.push(b); return out; };
const MAX_PAYLOAD = 65000;

function int(v, def, min, max) {
  let n;
  try { n = typeof v === "bigint" ? Number(v) : Number(v); } catch { n = NaN; }
  if (v === null || v === undefined || v === "" || typeof v === "object" || !Number.isFinite(n)) n = def;
  n = Math.floor(n);
  return n < min ? min : n > max ? max : n;
}
const mod32 = (v, def) => {
  let n;
  try { n = Number(v); } catch { n = NaN; }
  if (v === null || v === undefined || typeof v === "object" || !Number.isFinite(n)) n = def;
  return ((Math.floor(n) % 4294967296) + 4294967296) % 4294967296;
};
const str = (v, def) => {
  if (typeof v === "string") return v;
  if (v === null || v === undefined || typeof v === "object" || typeof v === "function") return def;
  try { return String(v); } catch { return def; }
};
const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : null);
const arr = (x) => (Array.isArray(x) ? x : []);

/** RFC 1071 Internet checksum (ones' complement of the ones'-complement sum of 16-bit words). */
export function internetChecksum(bytes) {
  let s = 0;
  for (let i = 0; i < bytes.length; i += 2) {
    s += ((bytes[i] & 255) << 8) + (i + 1 < bytes.length ? bytes[i + 1] & 255 : 0);
    if (s > 0xffffff) s = (s & 0xffff) + Math.floor(s / 65536);
  }
  while (s > 0xffff) s = (s & 0xffff) + Math.floor(s / 65536);
  return ~s & 0xffff;
}

function hash32(s) {
  let h = 0x811c9dc5;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randBytes(n, seed) {
  const r = prng(hash32(seed));
  const out = new Array(Math.max(0, n));
  for (let i = 0; i < out.length; i++) out[i] = Math.floor(r() * 256);
  return out;
}
const WORDS = "the quick brown fox jumps over lazy dogs while packets cross the network one hop at a time".split(" ");
function textFill(n, seed) {
  const r = prng(hash32(seed));
  let s = "";
  while (s.length < n) s += WORDS[Math.floor(r() * WORDS.length)] + " ";
  return text(s.slice(0, Math.max(0, n)));
}
function preview(bytes, max = 40) {
  let s = "";
  for (const b of bytes.slice(0, max)) s += b >= 32 && b < 127 ? String.fromCharCode(b) : b === 10 ? "\\n" : b === 13 ? "\\r" : "·";
  return s + (bytes.length > max ? "…" : "");
}

function ipBytes(s) {
  if (typeof s !== "string") return null;
  const m = s.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const b = m.slice(1).map(Number);
  return b.every((x) => x <= 255) ? b : null;
}
function ip6Bytes(s) {
  if (typeof s !== "string" || !/^[0-9a-fA-F:]+$/.test(s) || !s.includes(":")) return null;
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const grp = (x) => (x ? x.split(":") : []);
  const a = grp(halves[0]), b = halves.length === 2 ? grp(halves[1]) : [];
  const fill = halves.length === 2 ? 8 - a.length - b.length : 0;
  if (fill < 0 || (halves.length === 1 && a.length !== 8)) return null;
  const words = [...a, ...Array(fill).fill("0"), ...b];
  if (words.length !== 8 || words.some((w) => !/^[0-9a-fA-F]{1,4}$/.test(w))) return null;
  return words.flatMap((w) => u16(parseInt(w, 16)));
}

/* QUIC variable-length integers (RFC 9000 §16). */
const VARINT_MAX = (1n << 62n) - 1n;
/** Encode a QUIC varint. `len` (1/2/4/8) forces a (possibly non-minimal) length, which §16 allows. */
export function quicVarint(v, len) {
  let b;
  try {
    if (typeof v === "bigint") b = v;
    else { const n = Number(v); b = !Number.isFinite(n) || n <= 0 ? 0n : n >= 2 ** 62 ? VARINT_MAX : BigInt(Math.floor(n)); }
  } catch { b = 0n; }
  if (b < 0n) b = 0n;
  if (b > VARINT_MAX) b = VARINT_MAX;
  const need = b < 64n ? 1 : b < 16384n ? 2 : b < 1n << 30n ? 4 : 8;
  const L = len && [1, 2, 4, 8].includes(len) && len >= need ? len : need;
  const out = [];
  for (let i = L - 1; i >= 0; i--) out.push(Number((b >> BigInt(8 * i)) & 0xffn));
  out[0] |= { 1: 0x00, 2: 0x40, 4: 0x80, 8: 0xc0 }[L];
  return out;
}
/** Decode a QUIC varint at `off` → { value (Number when safe, else BigInt), length }. */
export function quicVarintDecode(bytes, off = 0) {
  const length = 1 << (bytes[off] >> 6);
  let v = BigInt(bytes[off] & 0x3f);
  for (let i = 1; i < length; i++) v = (v << 8n) | BigInt(bytes[off + i]);
  return { value: v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v, length };
}
const vlen = (n) => quicVarint(n).length;

/* Bit writer that records a field entry for everything it writes. */
class W {
  constructor() { this.b = []; this.pos = 0; this.f = []; }
  bits(n, num) {
    for (let i = n - 1; i >= 0; i--) {
      const byte = this.pos >> 3;
      if (byte >= this.b.length) this.b.push(0);
      if (Math.floor(num / 2 ** i) % 2) this.b[byte] |= 0x80 >> (this.pos & 7);
      this.pos++;
    }
  }
  field(key, name, bits, num, value, desc, extra) {
    const s = this.pos;
    this.bits(bits, num);
    return this.rec(key, name, s, bits, value, desc, extra);
  }
  bytes(key, name, a, value, desc, extra) {
    if (this.pos & 7) this.bits(8 - (this.pos & 7), 0);
    const s = this.pos;
    for (let i = 0; i < a.length; i++) this.b.push(a[i] & 255);
    this.pos += a.length * 8;
    return this.rec(key, name, s, a.length * 8, value, desc, extra);
  }
  parts(parts, key) { for (const p of parts) this.bytes(p.key || key, p.name, p.bytes, p.value, p.desc, p.extra); }
  rec(key, name, start, bits, value, desc, extra) {
    const fl = {
      name, value: String(value), bits, desc: desc || "",
      offset: start >> 3, length: Math.ceil((start + bits) / 8) - (start >> 3), bitOffset: start,
    };
    if (key) fl.key = key;
    if (extra) Object.assign(fl, extra);
    this.f.push(fl);
    return fl;
  }
  set(off, a) { for (let i = 0; i < a.length; i++) this.b[off + i] = a[i]; }
}
const P = (name, bytes, value, desc, key) => ({ name, bytes, value, desc, key });
const mk = (id, name, w, extra) => ({ id, name, fields: w.f, full: w.b, ...(extra || {}) });

/* ------------------------------------------------------------------------------------------------
 * Packet normalisation
 * ---------------------------------------------------------------------------------------------- */

function normalize(packet) {
  const p = obj(packet) || {};
  const h = obj(p.headers) || {};
  const from = str(p.from, "client"), to = str(p.to, "server");
  const addr = (node) => (Object.prototype.hasOwnProperty.call(ADDRESSES, node) ? ADDRESSES[node] : null);
  const ip = obj(h.ip);
  const srcB = ipBytes(ip && ip.src) || ipBytes(addr(from)) || [10, 0, 0, 1];
  const dstB = ipBytes(ip && ip.dst) || ipBytes(addr(to)) || [10, 0, 0, 2];
  const label = str(p.label, ""), kind = str(p.kind, "");
  const sm = label.match(/\((\d+)\/(\d+)\)/);
  const size = p.size === undefined || p.size === null || typeof p.size === "object" || !Number.isFinite(Number(p.size))
    ? null : int(p.size, 0, 0, 65535);
  const ctx = {
    p, h, from, to, kind, label, size,
    srcB, dstB, src: srcB.join("."), dst: dstB.join("."),
    ip: ip ? { ttl: int(ip.ttl, 64, 0, 255), id: int(ip.id, 0x1c46, 0, 65535), proto: int(ip.proto, 0, 0, 255) } : null,
    tcp: obj(h.tcp), udp: obj(h.udp), icmp: obj(h.icmp), dns: obj(h.dns),
    tls: obj(h.tls), http: obj(h.http), quic: obj(h.quic), ws: obj(h.ws),
    payloadStr: typeof p.payload === "string" ? p.payload : null,
    seg: sm ? { k: +sm[1], n: Math.max(+sm[1], +sm[2]) } : null,
    seed: `${str(p.no, "0")}|${kind}|${label}|${from}>${to}`,
  };
  if (ctx.tcp) {
    const t = ctx.tcp, ordered = [];
    for (const x of arr(t.flags)) {
      const u = str(x, "").toUpperCase();
      if (TCP_FLAGS.includes(u) && !ordered.includes(u)) ordered.push(u);
    }
    const syn = ordered.includes("SYN");
    ctx.tcpN = {
      srcPort: int(t.srcPort, from === "client" ? 51422 : 443, 0, 65535),
      dstPort: int(t.dstPort, from === "client" ? 443 : 51422, 0, 65535),
      seq: mod32(t.seq, 0), ack: ordered.includes("ACK") ? mod32(t.ack, 0) : 0,
      flags: ordered, window: int(t.window, 64240, 0, 0x7fffffff),
      mss: t.mss !== undefined && t.mss !== null ? int(t.mss, 1460, 0, 65535) : syn ? 1460 : null,
    };
  }
  return ctx;
}

const TCP_FLAGS = ["CWR", "ECE", "URG", "ACK", "PSH", "RST", "SYN", "FIN"];
const PORTS = { 53: "DNS", 80: "HTTP", 443: "HTTPS", 22: "SSH", 25: "SMTP", 123: "NTP" };
const portName = (n) => (PORTS[n] ? `${n} (${PORTS[n]})` : String(n));

/* ------------------------------------------------------------------------------------------------
 * IPv4 / TCP / UDP / ICMP
 * ---------------------------------------------------------------------------------------------- */

const PROTO = { 1: "ICMP", 6: "TCP", 17: "UDP" };

function ipv4Header(ctx, proto, payloadLen, o = {}) {
  const ip = o.ip || ctx.ip || { ttl: 64, id: 0x1c46 };
  const srcB = o.srcB || ctx.srcB, dstB = o.dstB || ctx.dstB;
  const total = 20 + payloadLen;
  const df = proto === 1 ? 0 : 1;
  const w = new W();
  const D = (k) => d("ipv4", k);
  w.field("version", "Version", 4, 4, "4", D("version"));
  w.field("ihl", "IHL", 4, 5, "5 (5 × 4 = 20 bytes, no options)", D("ihl"));
  w.field("dscp", "DSCP", 6, 0, "0 (best effort)", D("dscp"));
  w.field("ecn", "ECN", 2, 0, "0 (not ECN-capable)", D("ecn"));
  w.field("totalLength", "Total Length", 16, Math.min(total, 65535), `${total} bytes (20 header + ${payloadLen} data)`, D("totalLength"));
  w.field("id", "Identification", 16, ip.id, `${hex(ip.id, 4)} (${ip.id})`, D("id"));
  w.field("flagReserved", "Reserved", 1, 0, "0", D("flagReserved"));
  w.field("df", "DF", 1, df, df ? "1 (don't fragment)" : "0 (may fragment)", D("df"));
  w.field("mf", "MF", 1, 0, "0 (last / only fragment)", D("mf"));
  w.field("fragOffset", "Fragment Offset", 13, 0, "0", D("fragOffset"));
  w.field("ttl", "Time to Live", 8, ip.ttl, ip.ttl === 0 ? "0 (expired at this router)" : `${ip.ttl} hops left`, D("ttl"));
  w.field("protocol", "Protocol", 8, proto, `${proto} (${PROTO[proto] || "other"})`, D("protocol"));
  const ck = w.field("checksum", "Header Checksum", 16, 0, "", D("checksum"));
  w.bytes("src", "Source Address", srcB, srcB.join("."), D("src"));
  w.bytes("dst", "Destination Address", dstB, dstB.join("."), D("dst"));
  const c = internetChecksum(w.b);
  w.set(10, u16(c));
  ck.value = `${hex(c, 4)} (correct)`;
  return w;
}

function pseudoHeader(ctx, proto, len) { return [...ctx.srcB, ...ctx.dstB, 0, proto, ...u16(len)]; }

function tcpLayer(ctx, payload) {
  const t = ctx.tcpN;
  const D = (k) => d("tcp", k);
  const opts = [];
  if (t.mss !== null) opts.push(P("Option: Maximum Segment Size", [2, 4, ...u16(t.mss)], `${t.mss} bytes (kind 2, length 4)`,
    "Largest segment payload this side can receive; sent only on SYN segments."));
  const optLen = sum(opts);
  if (optLen % 4) opts.push(P("Option: End of Option List", Array(4 - (optLen % 4)).fill(0), "padding", "Pads the options to a 32-bit boundary."));
  const doff = 5 + sum(opts) / 4;
  const w = new W();
  w.field("srcPort", "Source Port", 16, t.srcPort, portName(t.srcPort), D("srcPort"));
  w.field("dstPort", "Destination Port", 16, t.dstPort, portName(t.dstPort), D("dstPort"));
  w.field("seq", "Sequence Number", 32, t.seq, String(t.seq), D("seq"));
  w.field("ack", "Acknowledgment Number", 32, t.ack, t.flags.includes("ACK") ? `${t.ack} (next byte expected)` : "0 (ACK not set)", D("ack"));
  w.field("dataOffset", "Data Offset", 4, doff, `${doff} (${doff * 4}-byte header)`, D("dataOffset"));
  w.field("reserved", "Rsrvd", 4, 0, "0", D("reserved"));
  for (const fl of TCP_FLAGS) {
    const on = t.flags.includes(fl);
    w.field(fl === "ACK" ? "ackFlag" : fl.toLowerCase(), fl, 1, on ? 1 : 0, on ? "1" : "0", D(fl === "ACK" ? "ackFlag" : fl.toLowerCase()));
  }
  const win = Math.min(t.window, 65535);
  w.field("window", "Window", 16, win, t.window > 65535 ? `65535 (capped: ${t.window} needs the window-scale option)` : `${win} bytes`, D("window"));
  const ck = w.field("checksum", "Checksum", 16, 0, "", D("checksum"));
  w.field("urgentPtr", "Urgent Pointer", 16, 0, "0", D("urgentPtr"));
  w.parts(opts, "options");
  const seg = w.b.concat(payload);
  const c = internetChecksum(pseudoHeader(ctx, 6, seg.length).concat(seg));
  w.set(16, u16(c));
  ck.value = `${hex(c, 4)} (correct, incl. pseudo-header)`;
  return mk("tcp", "TCP", w, { layout: "tcp" });
}

function udpLayer(ctx, payload) {
  const u = ctx.udp || {};
  const D = (k) => d("udp", k);
  const sp = int(u.srcPort, ctx.from === "client" ? 54321 : 443, 0, 65535);
  const dp = int(u.dstPort, ctx.from === "client" ? 443 : 54321, 0, 65535);
  const len = 8 + payload.length;
  const w = new W();
  w.field("srcPort", "Source Port", 16, sp, portName(sp), D("srcPort"));
  w.field("dstPort", "Destination Port", 16, dp, portName(dp), D("dstPort"));
  w.field("length", "Length", 16, len, `${len} bytes (8 header + ${payload.length} data)`, D("length"));
  const ck = w.field("checksum", "Checksum", 16, 0, "", D("checksum"));
  const seg = w.b.concat(payload);
  let c = internetChecksum(pseudoHeader(ctx, 17, len).concat(seg));
  if (c === 0) c = 0xffff; // RFC 768: a computed zero is sent as all ones (0 means "no checksum").
  w.set(6, u16(c));
  ck.value = `${hex(c, 4)} (correct, incl. pseudo-header)`;
  return mk("udp", "UDP", w, { layout: "udp" });
}

const ICMP_TYPES = { 0: "Echo Reply", 3: "Destination Unreachable", 8: "Echo Request", 11: "Time Exceeded" };
const PING_PATTERN = text("abcdefghijklmnopqrstuvwabcdefghi");
const pingData = (n) => Array.from({ length: n }, (_, i) => PING_PATTERN[i % PING_PATTERN.length]);

function icmpEcho(type, id, seq, data) {
  const msg = [type, 0, 0, 0, ...u16(id), ...u16(seq), ...data];
  const c = internetChecksum(msg);
  msg[2] = c >> 8; msg[3] = c & 255;
  return msg;
}

function icmpLayer(ctx, target) {
  const i = ctx.icmp || {};
  const D = (k) => d("icmp", k);
  const type = int(i.type, 8, 0, 255), code = int(i.code, 0, 0, 255);
  const w = new W();
  w.field("type", "Type", 8, type, `${type} (${ICMP_TYPES[type] || "other"})`, D("type"));
  const codeName = type === 11 ? (code === 0 ? "TTL exceeded in transit" : code === 1 ? "fragment reassembly time exceeded" : "")
    : type === 3 ? ({ 0: "network unreachable", 1: "host unreachable", 3: "port unreachable", 4: "fragmentation needed" }[code] || "") : "";
  w.field("code", "Code", 8, code, codeName ? `${code} (${codeName})` : String(code), D("code"));
  const ck = w.field("checksum", "Checksum", 16, 0, "", D("checksum"));
  if (type === 0 || type === 8) {
    const id = int(i.id, 1, 0, 65535), seq = int(i.seq, 1, 0, 65535);
    w.field("identifier", "Identifier", 16, id, String(id), D("identifier"));
    w.field("sequence", "Sequence Number", 16, seq, String(seq), D("sequence"));
    const data = ctx.payloadStr !== null ? text(ctx.payloadStr) : pingData(target === null ? 32 : Math.min(target, MAX_PAYLOAD));
    w.bytes("data", "Data", data, `${data.length} bytes "${preview(data, 24)}"`,
      "Arbitrary bytes the reply must echo back unchanged (Windows ping sends the alphabet; Linux a timestamp + counter).");
  } else if (type === 11 || type === 3) {
    w.field("unused", "Unused", 32, 0, "0", "Unused for this message type; must be zero.");
    // Quote the datagram that triggered the error: its IPv4 header + first 8 bytes (an ICMP echo request).
    const o = obj(i.original) || {};
    const origSrc = ipBytes(o.src) || ctx.dstB;
    const origDst = ipBytes(o.dst) || ipBytes(ADDRESSES.server);
    const oid = int(o.id, int(i.id, 1, 0, 65535), 0, 65535), oseq = int(o.seq, int(i.seq, 1, 0, 65535), 0, 65535);
    const echo = icmpEcho(8, oid, oseq, pingData(32));
    const ipw = ipv4Header(ctx, 1, echo.length, { ip: { ttl: type === 11 ? 1 : 64, id: int(o.ipId, 0x1c46, 0, 65535) }, srcB: origSrc, dstB: origDst });
    w.bytes("data", "Original IPv4 header (quoted)", ipw.b,
      `${origSrc.join(".")} → ${origDst.join(".")}, TTL ${type === 11 ? 1 : 64}, protocol 1 (ICMP)`,
      "The header of the packet that caused this error, copied back so the sender can tell which packet it was.");
    w.bytes("data", "Original data, first 8 bytes (quoted)", echo.slice(0, 8), `ICMP Echo Request id=${oid} seq=${oseq}`,
      "The first 8 bytes of the original packet's data: enough to identify the ping (or the TCP/UDP ports).");
  } else {
    w.field("rest", "Rest of Header", 32, 0, "0", "Meaning depends on the type; zero here.");
    const data = ctx.payloadStr !== null ? text(ctx.payloadStr) : randBytes(target || 0, ctx.seed + "icmp");
    w.bytes("data", "Data", data, `${data.length} bytes`, D("data"));
  }
  const c = internetChecksum(w.b);
  w.set(2, u16(c));
  ck.value = `${hex(c, 4)} (correct)`;
  return mk("icmp", "ICMP", w, { layout: "icmp" });
}

function dataLayer(ctx, n, name = "Payload") {
  const isStr = ctx.payloadStr !== null;
  const bytes = isStr ? text(ctx.payloadStr) : randBytes(Math.min(n || 0, MAX_PAYLOAD), ctx.seed + ":data");
  const w = new W();
  w.bytes("data", "Data", bytes, isStr ? `"${preview(bytes)}" (${bytes.length} bytes)` : `${bytes.length} bytes (stand-in application bytes)`,
    "Application bytes carried by the transport; the network does not interpret them.");
  return mk("data", name, w);
}

/* ------------------------------------------------------------------------------------------------
 * DNS (RFC 1035)
 * ---------------------------------------------------------------------------------------------- */

const QTYPES = { A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, MX: 15, TXT: 16, AAAA: 28, SRV: 33, HTTPS: 65, ANY: 255 };
const QTYPE_NAMES = Object.fromEntries(Object.entries(QTYPES).map(([k, v]) => [v, k]));
const RCODES = { 0: "NOERROR", 1: "FORMERR", 2: "SERVFAIL", 3: "NXDOMAIN", 4: "NOTIMP", 5: "REFUSED" };

function dnsName(name) {
  const out = [], shown = [];
  for (const raw of String(name).split(".")) {
    if (!raw) continue;
    let b = text(raw).slice(0, 63);
    if (out.length + b.length + 2 > 255) break;
    out.push(b.length, ...b);
    shown.push(`${b.length} "${raw.slice(0, 63)}"`);
  }
  out.push(0);
  shown.push("0 (root)");
  return { bytes: out, shown: shown.join(" · ") };
}

function dnsLayer(ctx) {
  const q = ctx.dns;
  const D = (k) => d("dns", k);
  const id = int(q.id, 0x1a2b, 0, 65535);
  const qr = int(q.qr, 0, 0, 1);
  const rcode = int(q.rcode, 0, 0, 15);
  const qname = str(q.qname, "example.com");
  const qtype = typeof q.qtype === "number" ? int(q.qtype, 1, 0, 65535) : QTYPES[str(q.qtype, "A").toUpperCase()] || 1;
  const answers = qr ? arr(q.answers).map((a) => str(a, "")).filter(Boolean).slice(0, 16) : [];
  const ttl = int(q.ttl, 300, 0, 2147483647);
  const w = new W();
  w.field("id", "ID", 16, id, hex(id, 4), D("id"));
  w.field("qr", "QR", 1, qr, qr ? "1 (response)" : "0 (query)", D("qr"));
  w.field("opcode", "Opcode", 4, 0, "0 (standard query)", D("opcode"));
  w.field("aa", "AA", 1, 0, "0 (answer from a recursive resolver's cache, not the zone owner)", D("aa"));
  w.field("tc", "TC", 1, 0, "0 (not truncated)", D("tc"));
  w.field("rd", "RD", 1, 1, "1 (recursion desired)", D("rd"));
  w.field("ra", "RA", 1, qr, qr ? "1 (recursion available)" : "0", D("ra"));
  w.field("z", "Z", 3, 0, "0", D("z"));
  w.field("rcode", "RCODE", 4, qr ? rcode : 0, qr ? `${rcode} (${RCODES[rcode] || "other"})` : "0", D("rcode"));
  w.field("qdcount", "QDCOUNT", 16, 1, "1", D("qdcount"));
  const ansParts = [];
  for (const a of answers) {
    const v4 = ipBytes(a), v6 = v4 ? null : ip6Bytes(a);
    const type = v4 ? 1 : v6 ? 28 : 5;
    const rdata = v4 || v6 || dnsName(a).bytes;
    const n = ansParts.length / 6 + 1;
    ansParts.push(
      P(`Answer ${n}: NAME`, [0xc0, 0x0c], `pointer to offset 12 ("${qname}")`, "Compressed name: 0xC0 flags a pointer back to the name in the question."),
      P(`Answer ${n}: TYPE`, u16(type), `${type} (${QTYPE_NAMES[type]})`, "Record type: A = IPv4 address, AAAA = IPv6 address, CNAME = alias."),
      P(`Answer ${n}: CLASS`, u16(1), "1 (IN, Internet)", "Record class; always IN in practice."),
      P(`Answer ${n}: TTL`, u32(ttl), `${ttl} s`, "How long resolvers and clients may cache this answer."),
      P(`Answer ${n}: RDLENGTH`, u16(rdata.length), `${rdata.length} bytes`, "Length of the record data."),
      P(`Answer ${n}: RDATA`, rdata, a, type === 1 ? "The IPv4 address the name resolves to." : type === 28 ? "The IPv6 address." : "The canonical name this alias points to."),
    );
  }
  w.field("ancount", "ANCOUNT", 16, answers.length, String(answers.length), D("ancount"));
  w.field("nscount", "NSCOUNT", 16, 0, "0", D("nscount"));
  w.field("arcount", "ARCOUNT", 16, 0, "0", D("arcount"));
  const nm = dnsName(qname);
  w.bytes("sections", "Question: QNAME", nm.bytes, `${qname} → ${nm.shown}`,
    "The name as length-prefixed labels: each label's length byte, then its characters, ending with a zero byte.");
  w.bytes("sections", "Question: QTYPE", u16(qtype), `${qtype} (${QTYPE_NAMES[qtype] || "other"})`, "Which record type is wanted (A = IPv4 address).");
  w.bytes("sections", "Question: QCLASS", u16(1), "1 (IN, Internet)", "Class of the query; always IN in practice.");
  w.parts(ansParts, "sections");
  return mk("dns", qr ? "DNS response" : "DNS query", w, { layout: "dns" });
}

/* ------------------------------------------------------------------------------------------------
 * TLS (RFC 8446 / RFC 5246)
 * ---------------------------------------------------------------------------------------------- */

const HS_TYPES = {
  ClientHello: 1, ServerHello: 2, NewSessionTicket: 4, EndOfEarlyData: 5, EncryptedExtensions: 8,
  Certificate: 11, ServerKeyExchange: 12, CertificateRequest: 13, ServerHelloDone: 14,
  CertificateVerify: 15, ClientKeyExchange: 16, Finished: 20, KeyUpdate: 24,
};
const SUITES = {
  0x1301: "TLS_AES_128_GCM_SHA256", 0x1302: "TLS_AES_256_GCM_SHA384", 0x1303: "TLS_CHACHA20_POLY1305_SHA256",
  0xc02b: "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256", 0xc02f: "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
  0xc02c: "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384", 0xc030: "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
  0xcca9: "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256", 0xcca8: "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
};
const CT = { change_cipher_spec: 20, alert: 21, handshake: 22, application_data: 23 };
const CT_NAMES = { 20: "change_cipher_spec", 21: "alert", 22: "handshake", 23: "application_data" };

const ext = (type, name, data, value, desc) =>
  P(`Extension: ${name}`, [...u16(type), ...u16(data.length), ...data], value, desc);
const alpnData = (list) => { const l = list.flatMap((p) => { const b = text(p).slice(0, 255); return [b.length, ...b]; }); return [...u16(l.length), ...l]; };

function quicTransportParams(o) {
  const tp = (id, val) => [...quicVarint(id), ...quicVarint(val.length), ...val];
  return [
    ...tp(0x01, quicVarint(30000)), ...tp(0x04, quicVarint(1048576)), ...tp(0x05, quicVarint(262144)),
    ...tp(0x06, quicVarint(262144)), ...tp(0x08, quicVarint(100)), ...tp(0x0f, o.scid || randBytes(8, o.seed + "tpscid")),
  ];
}

/** Body parts for one handshake message (without its 4-byte header). `extra` grows elastic content. */
function hsBody(name, o) {
  const v13 = o.v13, seed = o.seed + name;
  switch (name) {
    case "ClientHello": {
      const sid = v13 && !o.quic ? randBytes(32, seed + "sid") : [];
      const suites = v13 ? [0x1301, 0x1302, 0x1303, ...(o.quic ? [] : [0xc02b, 0xc02f])] : [0xc02b, 0xc02f, 0xc02c, 0xc030, 0xcca9, 0xcca8];
      const sni = text(o.sni);
      const exts = [
        ext(0x0000, "server_name", [...u16(sni.length + 3), 0, ...u16(sni.length), ...sni], o.sni,
          "SNI: the hostname the client wants, so one IP can serve many sites (sent in clear text)."),
        ext(0x000a, "supported_groups", [...u16(4), 0x00, 0x1d, 0x00, 0x17], "x25519, secp256r1", "Key-exchange curves the client supports."),
        ext(0x000d, "signature_algorithms", [...u16(6), 0x04, 0x03, 0x08, 0x04, 0x04, 0x01], "ecdsa_secp256r1_sha256, rsa_pss_rsae_sha256, rsa_pkcs1_sha256",
          "Signature schemes the client accepts for the server's certificate proof."),
        ext(0x0010, "application_layer_protocol_negotiation", alpnData(o.alpn), o.alpn.join(", "),
          "ALPN: which application protocols the client speaks (h2, http/1.1, h3), chosen during the handshake."),
      ];
      if (!v13) exts.push(
        ext(0x000b, "ec_point_formats", [1, 0], "uncompressed", "Elliptic-curve point encodings the client can parse."),
        ext(0x0017, "extended_master_secret", [], "(empty)", "Binds the session keys to the full handshake transcript (RFC 7627)."),
        ext(0xff01, "renegotiation_info", [0], "(empty)", "Signals support for secure renegotiation (RFC 5746)."),
      );
      if (v13) exts.push(
        ext(0x002b, "supported_versions", o.quic ? [2, 3, 4] : [4, 3, 4, 3, 3], o.quic ? "TLS 1.3" : "TLS 1.3, TLS 1.2",
          "The real version negotiation in TLS 1.3 (the legacy version fields stay at 1.2)."),
        ext(0x002d, "psk_key_exchange_modes", [1, 1], "psk_dhe_ke", "How resumption keys may be used (with fresh Diffie-Hellman)."),
        ext(0x0033, "key_share", [...u16(36), 0x00, 0x1d, ...u16(32), ...randBytes(32, seed + "ks")], "x25519 public key (32 bytes)",
          "The client's Diffie-Hellman share, sent up front so TLS 1.3 needs only one round trip."),
      );
      if (o.quic) exts.push(ext(0x0039, "quic_transport_parameters", quicTransportParams(o), "max_idle_timeout, initial_max_data, initial_max_streams_bidi, …",
        "QUIC's own connection settings, carried (and authenticated) inside the TLS handshake."));
      if (o.extra >= 4) exts.push(ext(0x0015, "padding", Array(o.extra - 4).fill(0), `${o.extra - 4} zero bytes`,
        "Padding (RFC 7685) used by browsers to round the ClientHello up to a convenient size."));
      return [
        P("Version", [3, 3], v13 ? "0x0303 (legacy; TLS 1.3 is negotiated in supported_versions)" : "0x0303 (TLS 1.2)", "Highest version offered (frozen at 1.2 in TLS 1.3)."),
        P("Random", randBytes(32, seed + "rand"), "32 random bytes", "Fresh randomness mixed into the keys so every handshake is unique."),
        P("Session ID", [sid.length, ...sid], sid.length ? "32 bytes (compatibility mode)" : "empty", "Legacy session-resumption ID; TLS 1.3 sends a random one so middleboxes see a familiar handshake."),
        P("Cipher Suites", [...u16(suites.length * 2), ...suites.flatMap(u16)], suites.map((s) => SUITES[s]).join(", "), "Encryption algorithms the client supports, in preference order."),
        P("Compression Methods", [1, 0], "null (compression disabled)", "Always just 'null': TLS compression was abandoned after the CRIME attack."),
        P("Extensions Length", u16(sum(exts)), `${sum(exts)} bytes`, "Total length of the extensions that follow."),
        ...exts,
      ];
    }
    case "ServerHello": {
      const exts = v13
        ? [
          ext(0x002b, "supported_versions", [3, 4], "TLS 1.3", "The version the server picked."),
          ext(0x0033, "key_share", [0x00, 0x1d, ...u16(32), ...randBytes(32, seed + "ks")], "x25519 public key (32 bytes)",
            "The server's Diffie-Hellman share; with the client's, both sides now derive the same secret."),
        ]
        : [
          ext(0xff01, "renegotiation_info", [0], "(empty)", "Secure renegotiation supported (RFC 5746)."),
          ext(0x000b, "ec_point_formats", [1, 0], "uncompressed", "Point encoding the server will use."),
          ext(0x0017, "extended_master_secret", [], "(empty)", "Extended master secret accepted (RFC 7627)."),
          ...(o.alpnSel ? [ext(0x0010, "application_layer_protocol_negotiation", alpnData([o.alpnSel]), o.alpnSel, "The application protocol the server chose.")] : []),
        ];
      const sid = o.quic ? [] : randBytes(32, seed + "sid");
      const suite = v13 ? 0x1301 : 0xc02f;
      return [
        P("Version", [3, 3], v13 ? "0x0303 (legacy; real version in supported_versions)" : "0x0303 (TLS 1.2)", "Legacy version field."),
        P("Random", randBytes(32, seed + "rand"), "32 random bytes", "The server's fresh randomness."),
        P("Session ID", [sid.length, ...sid], sid.length ? (v13 ? "32 bytes (echo of the client's)" : "32 bytes") : "empty", "Echoes the client's legacy session ID (TLS 1.3) or names a new session (TLS 1.2)."),
        P("Cipher Suite", u16(suite), SUITES[suite], "The single cipher suite the server picked from the client's list."),
        P("Compression Method", [0], "null", "No compression."),
        P("Extensions Length", u16(sum(exts)), `${sum(exts)} bytes`, "Total length of the extensions that follow."),
        ...exts,
      ];
    }
    case "EncryptedExtensions": {
      const exts = [];
      if (o.alpnSel) exts.push(ext(0x0010, "application_layer_protocol_negotiation", alpnData([o.alpnSel]), o.alpnSel, "The application protocol the server chose."));
      if (o.quic) exts.push(ext(0x0039, "quic_transport_parameters", quicTransportParams(o), "server transport parameters", "The server's QUIC connection settings."));
      return [P("Extensions", [...u16(sum(exts)), ...flat(exts)], exts.length ? exts.map((e) => e.name.slice(11)).join(", ") : "none",
        "Server extensions that need no clear-text exposure; encrypted in TLS 1.3.")];
    }
    case "Certificate": {
      const len = 300 + (o.extra || 0);
      const der = [0x30, 0x82, ...u16(len - 4), ...randBytes(len - 4, seed + "der")];
      const entry = [...u24(der.length), ...der, ...(v13 ? u16(0) : [])];
      return [
        ...(v13 ? [P("Certificate Request Context", [0], "empty", "Empty for the server's certificate in the main handshake.")] : []),
        P("Certificate List", [...u24(entry.length), ...entry], `1 certificate, ${der.length} bytes of DER (stand-in data)`,
          "The server's X.509 certificate chain proving it owns the name (real chains are usually 2–4 KB)."),
      ];
    }
    case "CertificateVerify":
      return [P("Signature", [0x08, 0x04, ...u16(256), ...randBytes(256, seed)], "rsa_pss_rsae_sha256, 256 bytes",
        "Signature over the handshake so far, proving the server holds the certificate's private key.")];
    case "ServerKeyExchange":
      return [P("ECDHE Parameters", [3, 0x00, 0x1d, 32, ...randBytes(32, seed + "k"), 0x08, 0x04, ...u16(256), ...randBytes(256, seed + "s")],
        "x25519 public key + rsa_pss signature", "The server's Diffie-Hellman share, signed with its certificate key (TLS 1.2).")];
    case "ServerHelloDone": return [];
    case "ClientKeyExchange":
      return [P("ECDH Public Key", [32, ...randBytes(32, seed)], "x25519, 32 bytes", "The client's Diffie-Hellman share (TLS 1.2); both sides can now derive the keys.")];
    case "Finished": {
      const n = v13 ? 32 : 12;
      return [P("Verify Data", randBytes(n, seed), `${n} bytes (MAC of the whole handshake)`, "Proves both sides saw the same handshake and derived the same keys.")];
    }
    case "NewSessionTicket":
      return v13
        ? [P("Ticket", [...u32(7200), ...randBytes(4, seed + "age"), 8, ...randBytes(8, seed + "n"), ...u16(128), ...randBytes(128, seed + "t"), 0, 0],
          "lifetime 7200 s, 128-byte ticket", "Lets the client resume (or send 0-RTT data) on a later connection.")]
        : [P("Ticket", [...u32(7200), ...u16(128), ...randBytes(128, seed + "t")], "lifetime 7200 s, 128-byte ticket", "Lets the client resume this session later.")];
    case "EndOfEarlyData": return [];
    case "KeyUpdate": return [P("Request Update", [0], "update_not_requested", "Switches to the next generation of traffic keys.")];
    default: return null;
  }
}

function hsMessage(name, o) {
  const body = hsBody(name, o);
  if (!body) return null;
  const len = sum(body), type = HS_TYPES[name];
  return {
    name,
    parts: [
      P(`${name}: Handshake Type`, [type], `${type} (${name})`, "Which handshake message this is."),
      P(`${name}: Length`, u24(len), `${len} bytes`, "Length of the handshake message body."),
      ...body.map((b) => ({ ...b, name: `${name}: ${b.name}` })),
    ],
  };
}

function tlsOpts(ctx, extra = {}) {
  const t = ctx.tls || {};
  const alpn = typeof t.alpn === "string" ? [t.alpn] : arr(t.alpn).map((x) => str(x, "")).filter(Boolean);
  return {
    v13: str(t.version, "1.3") !== "1.2", quic: false, seed: ctx.seed,
    sni: str(t.sni, str(obj(ctx.http && ctx.http.headers) && ctx.http.headers.host, "example.com")),
    alpn: alpn.length ? alpn : ["h2", "http/1.1"], alpnSel: alpn.length === 1 ? alpn[0] : null, extra: 0, ...extra,
  };
}

function tlsHeader(w, type, version, len) {
  const D = (k) => d("tls-record", k);
  w.field("contentType", "Content Type", 8, type, `${type} (${CT_NAMES[type]})`, D("contentType"));
  w.field("version", "Legacy Record Version", 16, version,
    version === 0x0301 ? "0x0301 (TLS 1.0 — conventional for the first ClientHello, for old middleboxes)" : "0x0303 (TLS 1.2)", D("version"));
  w.field("length", "Length", 16, len, `${len} bytes`, D("length"));
}

/** One encrypted record (TLS 1.3: outer type 23; TLS 1.2: real type with explicit nonce). */
function encryptedRecord(ctx, v13, plainLen, outerType, what, seed) {
  const w = new W();
  const ctLen = v13 ? plainLen + 1 : plainLen;
  const len = (v13 ? 0 : 8) + ctLen + 16;
  tlsHeader(w, v13 ? 23 : outerType, 0x0303, len);
  if (!v13) w.bytes("fragment", "Explicit Nonce", randBytes(8, seed + "nonce"), "8 bytes", "Per-record nonce sent in the clear (TLS 1.2 AES-GCM).");
  w.bytes("fragment", "Encrypted Data", randBytes(ctLen, seed + "ct"),
    `${ctLen} bytes of ciphertext: ${what}${v13 ? ` + 1-byte inner content type (${CT_NAMES[outerType]})` : ""}`,
    "Encrypted with the negotiated AEAD cipher; only the endpoints can read it.", { encrypted: true });
  w.bytes("fragment", "Authentication Tag", randBytes(16, seed + "tag"), "16 bytes",
    "AEAD tag: any change to the record makes decryption fail.", { encrypted: true });
  return mk("tls", v13 && outerType !== 23 ? `TLS record · ${CT_NAMES[outerType]} (encrypted, sent as application_data)` : `TLS record · ${CT_NAMES[outerType]} (encrypted)`,
    w, { layout: "tls-record", encrypted: true });
}

function ccsRecord() {
  const w = new W();
  tlsHeader(w, 20, 0x0303, 1);
  w.bytes("fragment", "Change Cipher Spec", [1], "1", "TLS 1.2: 'from now on my records are encrypted'. In TLS 1.3 it is a meaningless compatibility record for middleboxes.");
  return mk("tls", "TLS record · change_cipher_spec", w, { layout: "tls-record" });
}

const PLAIN_13 = new Set(["ClientHello", "ServerHello"]);

function tlsHandshakeLayers(ctx, target) {
  const t = ctx.tls;
  const names = arr(t.messages).map((m) => str(m, "")).filter((m) => m === "ChangeCipherSpec" || HS_TYPES[m]).slice(0, 12);
  const v13 = str(t.version, "1.3") !== "1.2";
  const elastic = names.includes("Certificate") ? "Certificate" : names.includes("ClientHello") ? "ClientHello" : null;
  const build = (extra) => {
    const groups = [];
    let afterCcs = false;
    for (const n of names) {
      if (n === "ChangeCipherSpec") { groups.push({ ccs: true }); afterCcs = true; continue; }
      const enc = v13 ? !PLAIN_13.has(n) : afterCcs;
      const last = groups[groups.length - 1];
      const msg = hsMessage(n, tlsOpts(ctx, { extra: n === elastic ? extra : 0 }));
      if (last && !last.ccs && last.enc === enc) last.msgs.push(msg);
      else groups.push({ enc, msgs: [msg] });
    }
    return groups.map((g, i) => {
      if (g.ccs) return ccsRecord();
      const parts = g.msgs.flatMap((m) => m.parts);
      const len = sum(parts);
      if (g.enc) return encryptedRecord(ctx, v13, len, 22, `${g.msgs.map((m) => m.name).join(", ")} (${len} bytes of handshake)`, ctx.seed + "hs" + i);
      const w = new W();
      tlsHeader(w, 22, g.msgs[0].name === "ClientHello" ? 0x0301 : 0x0303, len);
      w.parts(parts, "fragment");
      return mk("tls", `TLS record · handshake (${g.msgs.map((m) => m.name).join(", ")})`, w, { layout: "tls-record" });
    });
  };
  if (!names.length) {
    // A handshake record with no recognisable messages: show an opaque one.
    const w = new W();
    const body = randBytes(Math.max(0, Math.min(target || 64, 16384) - 5), ctx.seed + "hsx");
    tlsHeader(w, 22, 0x0303, body.length);
    w.bytes("fragment", "Handshake data", body, `${body.length} bytes`, "Handshake messages (contents not modelled).");
    return [mk("tls", "TLS record · handshake", w, { layout: "tls-record" })];
  }
  let layers = build(0);
  const total = layers.reduce((s, l) => s + l.full.length, 0);
  const diff = target === null ? 0 : target - total;
  if (elastic && diff >= (elastic === "ClientHello" ? 4 : 1) && diff < 15000) layers = build(diff);
  return layers;
}

function tlsLayers(ctx, target, innerBuilder) {
  const t = ctx.tls;
  const v13 = str(t.version, "1.3") !== "1.2";
  const record = str(t.record, "");
  if (record === "change_cipher_spec" && !arr(t.messages).length) return { layers: [ccsRecord()] };
  if (record === "handshake" || (record !== "application_data" && arr(t.messages).length)) return { layers: tlsHandshakeLayers(ctx, target) };
  // application_data: encrypt whatever is inside (HTTP, WebSocket …) or opaque data.
  const overhead = 5 + (v13 ? 17 : 24);
  const innerTarget = target === null ? null : Math.max(0, Math.min(16384, target - overhead));
  const inner = innerBuilder ? innerBuilder(innerTarget) : null;
  if (inner) {
    const plain = inner.layers.reduce((s, l) => s + l.full.length, 0);
    const rec = encryptedRecord(ctx, v13, plain, 23, `${inner.layers.map((l) => l.name).join(" + ")} (${plain} bytes of plaintext)`, ctx.seed + "app");
    for (const l of inner.layers) { l.decrypted = true; l.note = "Shown decrypted: on the wire these bytes travel inside the encrypted TLS record above."; }
    return { layers: [rec, ...inner.layers] };
  }
  const plain = ctx.payloadStr !== null ? text(ctx.payloadStr).length : innerTarget === null ? 64 : innerTarget;
  return { layers: [encryptedRecord(ctx, v13, plain, 23, "application data", ctx.seed + "app")] };
}

/* ------------------------------------------------------------------------------------------------
 * HTTP/1.1, HTTP/2 + HPACK, HTTP/3 + QPACK
 * ---------------------------------------------------------------------------------------------- */

const REASONS = {
  100: "Continue", 101: "Switching Protocols", 200: "OK", 201: "Created", 204: "No Content", 206: "Partial Content",
  301: "Moved Permanently", 302: "Found", 304: "Not Modified", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
  404: "Not Found", 429: "Too Many Requests", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable",
};
const MIME = { html: "text/html; charset=utf-8", js: "text/javascript", mjs: "text/javascript", css: "text/css", json: "application/json",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", woff2: "font/woff2", txt: "text/plain" };
const mimeFor = (path) => { const m = /\.([a-z0-9]+)$/i.exec(path.split("?")[0]); return m ? MIME[m[1].toLowerCase()] || "application/octet-stream" : "text/html; charset=utf-8"; };
const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-connection", "transfer-encoding", "upgrade", "host"]);

function httpInfo(ctx) {
  const h = ctx.http;
  const method = h.method !== undefined ? str(h.method, "GET").toUpperCase().replace(/[^A-Z]/g, "") || "GET" : null;
  const status = h.status !== undefined && h.status !== null ? int(h.status, 200, 100, 999) : null;
  const isReq = method !== null || (status === null && (ctx.kind === "REQ" || ctx.kind === "UPGRADE" || (ctx.kind !== "RES" && ctx.kind !== "101" && ctx.from === "client")));
  const hdrs = Object.entries(obj(h.headers) || {}).map(([k, v]) => [String(k).replace(/[^\x21-\x7e]/g, "").slice(0, 64) || "x", str(v, "").replace(/[\r\n]/g, " ").slice(0, 200)]);
  const host = (hdrs.find(([k]) => k.toLowerCase() === "host") || [])[1] || str(ctx.tls && ctx.tls.sni, "example.com");
  const path = str(h.path, "/").replace(/\s/g, "") || "/";
  return { method: method || "GET", status: status ?? (ctx.kind === "101" ? 101 : 200), isReq, hdrs, host, path,
    stream: int(h.stream, 1, 0, 2 ** 31 - 1), frame: str(h.frame, "").toUpperCase() };
}

function http1Layers(ctx, target) {
  const hi = httpInfo(ctx);
  const w = new W();
  // Payload that already is a full HTTP message: show it verbatim.
  if (ctx.payloadStr !== null && /^([A-Z]+ \S+ HTTP\/1\.[01]|HTTP\/1\.[01] \d{3})/.test(ctx.payloadStr)) {
    const b = text(ctx.payloadStr);
    w.bytes("data", hi.isReq ? "Request" : "Response", b, `"${preview(b, 60)}"`, "HTTP/1.1 message as plain ASCII text.");
    return { layers: [mk("http1", hi.isReq ? "HTTP/1.1 request" : "HTTP/1.1 response", w)] };
  }
  const cont = !hi.isReq && ctx.seg && ctx.seg.k > 1;
  if (cont) {
    const body = ctx.payloadStr !== null ? text(ctx.payloadStr) : textFill(target ?? 0, ctx.seed + "body");
    w.bytes("data", "Body (continued)", body, `${body.length} bytes, part ${ctx.seg.k} of ${ctx.seg.n}`,
      "HTTP/1.1 has no framing: later segments are just more body bytes; Content-Length tells the client when the body ends.");
    return { layers: [mk("http1", "HTTP/1.1 response body (continued)", w, { note: "No HTTP header here: the status line was in the first segment." })] };
  }
  const lines = [];
  let bodyLen = 0, clTotal = null, start;
  const has = (n) => hi.hdrs.some(([k]) => k.toLowerCase() === n);
  if (hi.isReq) {
    start = `${hi.method} ${hi.path} HTTP/1.1`;
    lines.push(["Host", hi.host]);
    if (ctx.kind === "UPGRADE" || hi.hdrs.some(([k, v]) => k.toLowerCase() === "upgrade" && /websocket/i.test(v))) {
      if (!has("upgrade")) lines.push(["Upgrade", "websocket"]);
      if (!has("connection")) lines.push(["Connection", "Upgrade"]);
      if (!has("sec-websocket-key")) lines.push(["Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ=="]);
      if (!has("sec-websocket-version")) lines.push(["Sec-WebSocket-Version", "13"]);
    }
    lines.push(...hi.hdrs.filter(([k]) => k.toLowerCase() !== "host"));
    if (ctx.payloadStr !== null) { bodyLen = text(ctx.payloadStr).length; if (!has("content-length")) lines.push(["Content-Length", String(bodyLen)]); }
  } else {
    start = `HTTP/1.1 ${hi.status} ${REASONS[hi.status] || "Unknown"}`;
    if (hi.status === 101) {
      if (!has("upgrade")) lines.push(["Upgrade", "websocket"]);
      if (!has("connection")) lines.push(["Connection", "Upgrade"]);
      if (!has("sec-websocket-accept")) lines.push(["Sec-WebSocket-Accept", "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="]);
      lines.push(...hi.hdrs);
    } else {
      lines.push(...hi.hdrs);
      const noBody = hi.status === 204 || hi.status === 304 || hi.status < 200;
      if (!noBody) {
        if (!has("content-type")) lines.push(["Content-Type", mimeFor(hi.path)]);
        if (!has("content-length")) { clTotal = lines.length; lines.push(["Content-Length", "0"]); }
        bodyLen = ctx.payloadStr !== null ? text(ctx.payloadStr).length : -1;
      }
    }
  }
  const head = () => `${start}\r\n${lines.map(([k, v]) => `${k}: ${v}\r\n`).join("")}\r\n`;
  if (bodyLen < 0 || clTotal !== null) {
    // Fill the segment with body; Content-Length covers the whole body when it spans several segments.
    for (let i = 0; i < 3; i++) {
      if (ctx.payloadStr === null) bodyLen = Math.max(0, (target ?? 0) - text(head()).length);
      const total = ctx.seg && ctx.seg.n > 1 ? bodyLen + (ctx.seg.n - 1) * Math.max(0, target ?? 0) : bodyLen;
      if (clTotal !== null) lines[clTotal] = ["Content-Length", String(total)];
    }
  }
  w.bytes("data", hi.isReq ? "Request Line" : "Status Line", text(start + "\r\n"), start,
    hi.isReq ? "Method, path and protocol version, as plain ASCII ending in CRLF." : "Protocol version, status code and reason phrase.");
  for (const [k, v] of lines) w.bytes("data", `Header: ${k}`, text(`${k}: ${v}\r\n`), v, HEADER_DESC[k.toLowerCase()] || "A header field: 'Name: value' followed by CRLF.");
  w.bytes("data", "End of Headers", [13, 10], "CRLF", "An empty line marks the end of the headers; the body (if any) follows.");
  if (bodyLen > 0) {
    const body = ctx.payloadStr !== null ? text(ctx.payloadStr) : textFill(bodyLen, ctx.seed + "body");
    w.bytes("data", "Body", body, `${body.length} bytes${ctx.seg && ctx.seg.n > 1 ? ` (part 1 of ${ctx.seg.n})` : ""}`, "The resource itself (stand-in text here).");
  }
  return { layers: [mk("http1", hi.isReq ? "HTTP/1.1 request" : "HTTP/1.1 response", w, { note: "HTTP/1.1 is plain text: every byte is an ASCII character." })] };
}

const HEADER_DESC = {
  host: "Which site on this server the request is for (required in HTTP/1.1).",
  "content-length": "Body size in bytes, so the receiver knows where this message ends.",
  "content-type": "Media type of the body.",
  upgrade: "Asks to switch this connection to another protocol.",
  connection: "Hop-by-hop options; 'Upgrade' must accompany an Upgrade header.",
  "sec-websocket-key": "Random base64 nonce; the server hashes it to prove it understood the WebSocket handshake.",
  "sec-websocket-accept": "base64(SHA-1(key + fixed GUID)): proof the server speaks WebSocket.",
  "sec-websocket-version": "WebSocket protocol version; always 13.",
};

/* Integer with an N-bit prefix (RFC 7541 §5.1, reused by QPACK). */
function prefixInt(value, bits, first) {
  const max = (1 << bits) - 1;
  if (value < max) return [first | value];
  const out = [first | max];
  value -= max;
  while (value >= 128) { out.push((value % 128) | 128); value = Math.floor(value / 128); }
  out.push(value);
  return out;
}
const lit = (s) => { const b = text(s); return [...prefixInt(b.length, 7, 0), ...b]; }; // H = 0: no Huffman coding

const HPACK_STATIC = [null, [":authority", ""], [":method", "GET"], [":method", "POST"], [":path", "/"], [":path", "/index.html"],
  [":scheme", "http"], [":scheme", "https"], [":status", "200"], [":status", "204"], [":status", "206"], [":status", "304"],
  [":status", "400"], [":status", "404"], [":status", "500"], ["accept-charset", ""], ["accept-encoding", "gzip, deflate"],
  ["accept-language", ""], ["accept-ranges", ""], ["accept", ""], ["access-control-allow-origin", ""], ["age", ""], ["allow", ""],
  ["authorization", ""], ["cache-control", ""], ["content-disposition", ""], ["content-encoding", ""], ["content-language", ""],
  ["content-length", ""], ["content-location", ""], ["content-range", ""], ["content-type", ""], ["cookie", ""], ["date", ""],
  ["etag", ""], ["expect", ""], ["expires", ""], ["from", ""], ["host", ""], ["if-match", ""], ["if-modified-since", ""],
  ["if-none-match", ""], ["if-range", ""], ["if-unmodified-since", ""], ["last-modified", ""], ["link", ""], ["location", ""],
  ["max-forwards", ""], ["proxy-authenticate", ""], ["proxy-authorization", ""], ["range", ""], ["referer", ""], ["refresh", ""],
  ["retry-after", ""], ["server", ""], ["set-cookie", ""], ["strict-transport-security", ""], ["transfer-encoding", ""],
  ["user-agent", ""], ["vary", ""], ["via", ""], ["www-authenticate", ""]];
// QPACK static table (RFC 9204 Appendix A), entries 0–28.
const QPACK_STATIC = [[":authority", ""], [":path", "/"], ["age", "0"], ["content-disposition", ""], ["content-length", "0"],
  ["cookie", ""], ["date", ""], ["etag", ""], ["if-modified-since", ""], ["if-none-match", ""], ["last-modified", ""], ["link", ""],
  ["location", ""], ["referer", ""], ["set-cookie", ""], [":method", "CONNECT"], [":method", "DELETE"], [":method", "GET"],
  [":method", "HEAD"], [":method", "OPTIONS"], [":method", "POST"], [":method", "PUT"], [":scheme", "http"], [":scheme", "https"],
  [":status", "103"], [":status", "200"], [":status", "304"], [":status", "404"], [":status", "503"]];

function findStatic(table, name, value) {
  let full = -1, nameIdx = -1;
  table.forEach((e, i) => {
    if (!e || e[0] !== name) return;
    if (nameIdx < 0) nameIdx = i;
    if (full < 0 && e[1] === value && (e[1] !== "" || name === ":authority" && value === "")) full = i;
  });
  return { full, nameIdx };
}

/** HPACK (RFC 7541): indexed fields from the static table, otherwise literals without indexing, no Huffman. */
export function hpackEncode(list) {
  return list.map(([n, v]) => {
    const { full, nameIdx } = findStatic(HPACK_STATIC, n, v);
    if (full > 0) return P(`${n}: ${v}`, prefixInt(full, 7, 0x80), `indexed field, static table #${full}`, "One byte: this exact name+value is entry #" + full + " of HPACK's static table.");
    if (nameIdx > 0) return P(`${n}: ${v}`, [...prefixInt(nameIdx, 4, 0x00), ...lit(v)], `literal value, name = static #${nameIdx}`, "Name taken from the static table, value spelled out (not added to the dynamic table).");
    return P(`${n}: ${v}`, [0x00, ...lit(n), ...lit(v)], "literal name and value", "Both name and value spelled out.");
  });
}

/** QPACK (RFC 9204) field section using only the static table: prefix 0x0000, then field lines. */
export function qpackEncode(list) {
  const lines = list.map(([n, v]) => {
    const { full, nameIdx } = findStatic(QPACK_STATIC, n, v);
    if (full >= 0) return P(`${n}: ${v}`, prefixInt(full, 6, 0xc0), `indexed field line, static #${full}`, `One byte: entry #${full} of QPACK's static table.`);
    if (nameIdx >= 0) return P(`${n}: ${v}`, [...prefixInt(nameIdx, 4, 0x50), ...lit(v)], `literal value, name = static #${nameIdx}`, "Name from the static table, value spelled out.");
    const nb = text(n);
    return P(`${n}: ${v}`, [...prefixInt(nb.length, 3, 0x20), ...nb, ...lit(v)], "literal name and value", "Both name and value spelled out.");
  });
  return [P("Field Section Prefix", [0x00, 0x00], "Required Insert Count 0, Base 0", "Says no dynamic-table entries are needed, so this block can be decoded immediately."), ...lines];
}

function fieldList(ctx, hi, end) {
  const extra = hi.hdrs.map(([k, v]) => [k.toLowerCase(), v]).filter(([k]) => !HOP_BY_HOP.has(k) && !k.startsWith(":"));
  if (hi.isReq) return [[":method", hi.method], [":scheme", "https"], [":authority", hi.host], [":path", hi.path], ...extra];
  const l = [[":status", String(hi.status)], ...extra];
  if (!end && !extra.some(([k]) => k === "content-type")) l.push(["content-type", mimeFor(hi.path)]);
  return l;
}

/** Which frames this packet carries. */
function httpFrames(ctx, hi) {
  if (hi.frame === "HEADERS") return ["HEADERS"];
  if (hi.frame === "DATA") return ["DATA"];
  if (hi.isReq) return ["HEADERS"];
  return ctx.seg && ctx.seg.k > 1 ? ["DATA"] : ["HEADERS", "DATA"];
}

function bodyBytes(ctx, n) { return ctx.payloadStr !== null ? text(ctx.payloadStr) : textFill(Math.min(n, MAX_PAYLOAD), ctx.seed + "body"); }

function http2Layers(ctx, target) {
  const hi = httpInfo(ctx);
  const kinds = httpFrames(ctx, hi);
  const last = !ctx.seg || ctx.seg.k >= ctx.seg.n;
  const reqEnd = hi.isReq && hi.method !== "POST" && hi.method !== "PUT" && ctx.payloadStr === null;
  const D = (k) => d("http2-frame", k);
  const frames = [];
  for (const k of kinds) {
    if (k === "HEADERS") {
      const endStream = reqEnd || (!hi.isReq && (hi.status === 204 || hi.status === 304));
      const parts = hpackEncode(fieldList(ctx, hi, endStream));
      frames.push({ type: 1, name: "HEADERS", flags: 0x04 | (endStream ? 1 : 0), parts });
    } else {
      frames.push({ type: 0, name: "DATA", flags: last ? 1 : 0, parts: null });
    }
  }
  const fixed = frames.reduce((s, fr) => s + 9 + (fr.parts ? sum(fr.parts) : 0), 0);
  for (const fr of frames) if (!fr.parts) {
    const b = bodyBytes(ctx, Math.max(0, (target ?? 64 + fixed) - fixed));
    fr.parts = [P("Data", b, `${b.length} bytes${ctx.seg ? ` (part ${ctx.seg.k} of ${ctx.seg.n})` : ""}`, "Response body bytes for this stream.")];
  }
  const layers = frames.map((fr) => {
    const len = sum(fr.parts);
    const w = new W();
    const flagNames = [fr.flags & 1 ? "END_STREAM" : "", fr.flags & 4 ? "END_HEADERS" : ""].filter(Boolean);
    w.field("length", "Length", 24, len, `${len} bytes`, D("length"));
    w.field("type", "Type", 8, fr.type, `${fr.type} (${fr.name})`, D("type"));
    w.field("flags", "Flags", 8, fr.flags, `${hex(fr.flags, 2)}${flagNames.length ? ` (${flagNames.join(" | ")})` : ""}`, D("flags"));
    w.field("r", "R", 1, 0, "0", D("r"));
    w.field("streamId", "Stream Identifier", 31, hi.stream, String(hi.stream), D("streamId"));
    w.parts(fr.parts.map((p) => fr.type === 1 ? { ...p, name: `HPACK: ${p.name}` } : p), "payload");
    return mk("http2", `HTTP/2 ${fr.name} frame`, w, { layout: "http2-frame" });
  });
  return { layers };
}

function h3Frame(type, name, parts) {
  const len = sum(parts);
  const w = new W();
  w.bytes("type", "Frame Type", quicVarint(type), `${type} (${name})`, "HTTP/3 frame type as a QUIC varint: 0 = DATA, 1 = HEADERS.");
  w.bytes("length", "Length", quicVarint(len), `${len} bytes`, "Frame payload length as a QUIC varint.");
  w.parts(parts, "payload");
  return mk("http3", `HTTP/3 ${name} frame`, w);
}

function http3Layers(ctx, target) {
  const hi = httpInfo(ctx);
  const kinds = httpFrames(ctx, hi);
  const layers = [];
  let used = 0;
  for (const k of kinds) if (k === "HEADERS") {
    const l = h3Frame(1, "HEADERS", qpackEncode(fieldList(ctx, hi, hi.isReq)).map((p) => ({ ...p, name: p.name.startsWith("Field") ? p.name : `QPACK: ${p.name}` })));
    used += l.full.length;
    layers.push(l);
  }
  if (kinds.includes("DATA")) {
    let n = 0;
    if (target !== null) for (const vl of [1, 2, 4]) { n = target - used - 1 - vl; if (n >= 0 && vlen(n) === vl) break; }
    else n = 64;
    const b = bodyBytes(ctx, Math.max(0, n));
    layers.push(h3Frame(0, "DATA", [P("Data", b, `${b.length} bytes`, "Response body bytes for this stream.")]));
  }
  return { layers };
}

/* ------------------------------------------------------------------------------------------------
 * WebSocket (RFC 6455)
 * ---------------------------------------------------------------------------------------------- */

const WS_OPS = { continuation: 0, text: 1, binary: 2, close: 8, ping: 9, pong: 10 };
const WS_NAMES = Object.fromEntries(Object.entries(WS_OPS).map(([k, v]) => [v, k]));

function maskKeyBytes(k, seed) {
  if (Array.isArray(k) && k.length === 4) return k.map((x) => int(x, 0, 0, 255));
  if (typeof k === "string" && /^(0x)?[0-9a-fA-F]{8}$/.test(k.replace(/\s/g, ""))) return u32(parseInt(k.replace(/\s|0x/g, ""), 16));
  if (typeof k === "number" && Number.isFinite(k)) return u32(mod32(k, 0));
  return randBytes(4, seed + "mask");
}

function wsLayers(ctx, target) {
  const s = ctx.ws;
  const D = (k) => d("websocket", k);
  const opName = str(s.opcode, "text").toLowerCase();
  const op = typeof s.opcode === "number" ? int(s.opcode, 1, 0, 15) : WS_OPS[opName] ?? 1;
  const fin = s.fin === false || s.fin === 0 ? 0 : 1;
  const masked = s.masked === undefined || s.masked === null ? ctx.from === "client" : !!s.masked;
  let payload;
  if (ctx.payloadStr !== null) payload = text(ctx.payloadStr);
  else if (op === 8) payload = [0x03, 0xe8];
  else {
    let n;
    if (s.length !== undefined && s.length !== null) n = int(s.length, 0, 0, 1 << 24);
    else if (target !== null) { n = target - 2 - (masked ? 4 : 0); if (n >= 126) n -= 2; if (n > 65535) n -= 6; n = Math.max(0, n); }
    else n = 0;
    payload = op === 1 ? textFill(n, ctx.seed + "ws") : randBytes(n, ctx.seed + "ws");
  }
  if (op >= 8) payload = payload.slice(0, 125); // control frames carry at most 125 bytes
  const n = payload.length;
  const key = masked ? maskKeyBytes(s.maskKey, ctx.seed) : null;
  const w = new W();
  w.field("fin", "FIN", 1, fin, fin ? "1 (final fragment)" : "0 (more fragments follow)", D("fin"));
  w.field("rsv1", "RSV1", 1, 0, "0", D("rsv1"));
  w.field("rsv2", "RSV2", 1, 0, "0", D("rsv2"));
  w.field("rsv3", "RSV3", 1, 0, "0", D("rsv3"));
  w.field("opcode", "Opcode", 4, op, `${hex(op, 1)} (${WS_NAMES[op] || "reserved"})`, D("opcode"));
  w.field("mask", "MASK", 1, masked ? 1 : 0, masked ? "1 (client-to-server frames must be masked)" : "0 (server frames are not masked)", D("mask"));
  const code = n < 126 ? n : n <= 65535 ? 126 : 127;
  w.field("payloadLen", "Payload len", 7, code, code < 126 ? `${n} bytes` : `${code} (real length in the next ${code === 126 ? 16 : 64} bits)`, D("payloadLen"));
  if (code === 126) w.field("extLen", "Extended payload length", 16, n, `${n} bytes`, D("extLen"));
  if (code === 127) w.field("extLen", "Extended payload length", 64, n, `${n} bytes`, D("extLen"));
  if (key) w.bytes("maskKey", "Masking-key", key, hexStr(key), D("maskKey"));
  let wire = key ? payload.map((b, i) => b ^ key[i % 4]) : payload;
  // A frame bigger than one IP packet continues in later TCP segments: this segment carries its start.
  const room = Math.max(0, MAX_PAYLOAD - (w.pos >> 3));
  const partial = wire.length > room;
  if (partial) wire = wire.slice(0, room);
  const shown = op === 8 && n >= 2 ? `close code ${(payload[0] << 8) | payload[1]}${n > 2 ? ` "${preview(payload.slice(2))}"` : ""}` : op === 1 ? `"${preview(payload)}"` : `${n} bytes`;
  w.bytes("payload", key ? "Payload Data (masked)" : "Payload Data", wire, (key ? `${n} bytes; unmasked: ${shown}` : shown) + (partial ? ` (first ${wire.length} bytes; the rest follows in later TCP segments)` : ""),
    key ? "Payload XORed byte-by-byte with the masking key (byte i ^ key[i mod 4]), so proxies can't be tricked into caching it." : D("payload"));
  return { layers: [mk("websocket", `WebSocket ${WS_NAMES[op] || "frame"} frame`, w, { layout: "websocket" })] };
}

/* ------------------------------------------------------------------------------------------------
 * QUIC (RFC 9000 / RFC 9001)
 * ---------------------------------------------------------------------------------------------- */

const QUIC_LONG = { Initial: 0, "0-RTT": 1, Handshake: 2 };

function cidBytes(v, seed) {
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => int(x, 0, 0, 255));
  if (typeof v === "string") {
    const c = v.replace(/^0x/, "");
    if (/^([0-9a-fA-F]{2}){0,20}$/.test(c)) return c.match(/../g)?.map((x) => parseInt(x, 16)) || [];
    return randBytes(8, "cid:" + v);
  }
  if (typeof v === "number" && Number.isFinite(v)) return u32(mod32(v, 0)).concat(u32(hash32("cid" + v)));
  return randBytes(8, seed);
}

/** TLS handshake bytes carried in QUIC CRYPTO frames (no TLS record layer in QUIC). */
function cryptoStream(ctx, type, isClient, need) {
  const given = ctx.tls ? arr(ctx.tls.messages).map((m) => str(m, "")).filter((m) => HS_TYPES[m]) : [];
  const names = given.length ? given
    : type === "Initial" ? [isClient ? "ClientHello" : "ServerHello"]
      : type === "Handshake" ? (isClient ? ["Finished"] : ["EncryptedExtensions", "Certificate", "CertificateVerify", "Finished"])
        : ["NewSessionTicket"];
  const o = (extra) => tlsOpts(ctx, { v13: true, quic: true, alpn: ["h3"], alpnSel: isClient ? null : "h3", extra });
  const build = (extra) => names.map((n) => hsMessage(n, { ...o(n === "Certificate" ? extra : 0) })).filter(Boolean);
  let msgs = build(0);
  const total = msgs.reduce((s, m) => s + sum(m.parts), 0);
  if (need > total && names.includes("Certificate") && need - total < 15000) msgs = build(need - total);
  return { bytes: msgs.flatMap((m) => flat(m.parts)), names: msgs.map((m) => m.name) };
}

function quicLayers(ctx, target) {
  const q = ctx.quic;
  const typeIn = str(q.type, "Initial");
  const short = str(q.form, "") === "short" || typeIn === "1-RTT";
  const type = short ? "1-RTT" : QUIC_LONG[typeIn] !== undefined ? typeIn : "Initial";
  const isClient = ctx.from === "client";
  const dcid = cidBytes(q.dcid, ctx.seed + "dcid");
  const scid = cidBytes(q.scid, "scid:" + ctx.from);
  const pn = int(q.pn, 0, 0, 2 ** 32 - 1);
  const pnLen = pn < 0x100 ? 1 : pn < 0x10000 ? 2 : 4;
  const pnBytes = pnLen === 1 ? [pn] : pnLen === 2 ? u16(pn) : u32(pn);

  // --- plaintext frames (RFC 9000 §19) ---
  let frames = arr(q.frames).map(obj).filter(Boolean).slice(0, 32);
  let h3 = null;
  if (ctx.http) {
    const sIdx = frames.findIndex((fr) => str(fr.type, "").toUpperCase() === "STREAM" && (ctx.http.stream === undefined || int(fr.stream, -1, -1, 2 ** 31) === int(ctx.http.stream, 0, 0, 2 ** 31)));
    const idx = sIdx >= 0 ? sIdx : frames.findIndex((fr) => str(fr.type, "").toUpperCase() === "STREAM");
    if (idx < 0) frames = [...frames, { type: "STREAM", stream: ctx.http.stream ?? 0, offset: 0 }];
    const target3 = (idx >= 0 && frames[idx].length !== undefined) ? int(frames[idx].length, 0, 0, MAX_PAYLOAD) : null;
    h3 = { idx: idx >= 0 ? idx : frames.length - 1, ...http3Layers(ctx, target3) };
  }
  const fw = [];
  const fpart = (name, bytes, value, desc) => fw.push(P(name, bytes, value, desc));
  frames.forEach((fr, i) => {
    const t = str(fr.type, "").toUpperCase();
    const tag = `#${i + 1} ${t}`;
    if (t === "PADDING") {
      const n = int(fr.length, 1, 1, MAX_PAYLOAD);
      fpart(`${tag}`, Array(n).fill(0), `${n} × 0x00`, "PADDING frames are single zero bytes; they make packets bigger (e.g. Initial ≥ 1200 bytes).");
    } else if (t === "PING") {
      fpart(`${tag}`, [0x01], "type 0x01", "Asks the peer to acknowledge, to check the path is alive.");
    } else if (t === "HANDSHAKE_DONE") {
      fpart(`${tag}`, [0x1e], "type 0x1e", "Server tells the client the handshake is confirmed.");
    } else if (t === "ACK") {
      const largest = int(fr.largest, pn, 0, 2 ** 53 - 1);
      const first = int(fr.firstRange ?? fr.range, largest, 0, largest);
      const delay = int(fr.delay, 0, 0, 2 ** 53 - 1);
      fpart(`${tag}: Type`, [0x02], "0x02 (ACK)", "Acknowledges received packets by packet-number ranges.");
      fpart(`${tag}: Largest Acknowledged`, quicVarint(largest), String(largest), "Highest packet number being acknowledged.");
      fpart(`${tag}: ACK Delay`, quicVarint(delay), `${delay} (× 8 µs)`, "How long the receiver held this ACK, so RTT samples stay accurate.");
      fpart(`${tag}: ACK Range Count`, quicVarint(0), "0", "Number of extra gap/range pairs (0: one contiguous range).");
      fpart(`${tag}: First ACK Range`, quicVarint(first), `${first} (acks ${largest - first}–${largest})`, "How many packets below Largest are also acknowledged.");
    } else if (t === "CRYPTO") {
      const off = int(fr.offset, 0, 0, MAX_PAYLOAD);
      const want = fr.length !== undefined ? int(fr.length, 0, 0, MAX_PAYLOAD) : null;
      const cs = cryptoStream(ctx, type, isClient, want === null ? 0 : off + want);
      const data = cs.bytes.slice(off, want === null ? undefined : off + want);
      fpart(`${tag}: Type`, [0x06], "0x06 (CRYPTO)", "Carries TLS handshake messages (QUIC has no TLS record layer).");
      fpart(`${tag}: Offset`, quicVarint(off), String(off), "Position of this data in the handshake byte stream.");
      fpart(`${tag}: Length`, quicVarint(data.length), `${data.length} bytes`, "Length of the crypto data.");
      fpart(`${tag}: Crypto Data`, data, `TLS 1.3 ${cs.names.join(", ")}${off || (want !== null && off + want < cs.bytes.length) ? " (a slice)" : ""}`,
        "Raw TLS handshake messages; a message may be split across several CRYPTO frames.");
    } else if (t === "STREAM") {
      const sid = int(fr.stream, 0, 0, 2 ** 53 - 1);
      const off = int(fr.offset, 0, 0, 2 ** 53 - 1);
      const fin = !!fr.fin;
      const data = h3 && h3.idx === i ? h3.layers.flatMap((l) => l.full) : randBytes(int(fr.length, 0, 0, MAX_PAYLOAD), ctx.seed + "stream" + i);
      const typ = 0x08 | (off > 0 ? 4 : 0) | 2 | (fin ? 1 : 0);
      fpart(`${tag}: Type`, [typ], `${hex(typ, 2)} (STREAM, OFF=${off > 0 ? 1 : 0} LEN=1 FIN=${fin ? 1 : 0})`, "STREAM frame; the low 3 bits say which optional fields follow.");
      fpart(`${tag}: Stream ID`, quicVarint(sid), `${sid}${sid % 4 === 0 ? " (client-initiated, bidirectional)" : ""}`, "Which stream this data belongs to; each stream is ordered independently.");
      if (off > 0) fpart(`${tag}: Offset`, quicVarint(off), String(off), "Byte position of this data within the stream.");
      fpart(`${tag}: Length`, quicVarint(data.length), `${data.length} bytes`, "Length of the stream data.");
      fpart(`${tag}: Stream Data`, data, h3 && h3.idx === i ? h3.layers.map((l) => l.name).join(" + ") : `${data.length} bytes`, "Application bytes for this stream.");
    }
  });
  const natural = sum(fw);

  // --- sizes: Length is encoded in 2 bytes (common practice; non-minimal varints are allowed) ---
  const T = target !== null ? target : (!short && type === "Initial" && isClient ? 1200 : null);
  const fixed = short ? 1 + dcid.length : 1 + 4 + 1 + dcid.length + 1 + scid.length + (type === "Initial" ? 1 : 0) + 2;
  let plain = natural;
  if (T !== null) plain = Math.max(natural, T - fixed - pnLen - 16);
  plain = Math.max(plain, 4 - pnLen); // header protection needs ≥ 4 bytes of packet number + payload to sample
  if (plain > natural) fpart(`Padding`, Array(plain - natural).fill(0), `${plain - natural} PADDING frames (0x00)`,
    T !== null && !short && type === "Initial" && isClient ? "Client Initial datagrams must be at least 1200 bytes (anti-amplification)." : "Fills the packet to its size.");
  const lenField = pnLen + plain + 16;

  // --- header ---
  const D = (k) => d(short ? "quic-short" : "quic-long", k);
  const prot = { protected: true };
  const w = new W();
  if (short) {
    const spin = q.spin ? 1 : 0, kp = q.keyPhase ? 1 : 0;
    w.field("form", "Header Form", 1, 0, "0 (short header)", D("form"));
    w.field("fixed", "Fixed Bit", 1, 1, "1", D("fixed"));
    w.field("spin", "Spin Bit", 1, spin, String(spin), D("spin"));
    w.field("reserved", "Reserved Bits", 2, 0, "00 (before header protection)", D("reserved"), prot);
    w.field("keyPhase", "Key Phase", 1, kp, `${kp} (before header protection)`, D("keyPhase"), prot);
    w.field("pnLength", "Packet Number Length", 2, pnLen - 1, `${pnLen - 1} → ${pnLen}-byte packet number (before header protection)`, D("pnLength"), prot);
    w.bytes("dcid", "Destination Connection ID", dcid, hexStr(dcid) || "(empty)", D("dcid"));
  } else {
    w.field("form", "Header Form", 1, 1, "1 (long header)", D("form"));
    w.field("fixed", "Fixed Bit", 1, 1, "1", D("fixed"));
    w.field("longType", "Long Packet Type", 2, QUIC_LONG[type], `${QUIC_LONG[type]} (${type})`, D("longType"));
    w.field("reserved", "Reserved Bits", 2, 0, "00 (before header protection)", D("reserved"), prot);
    w.field("pnLength", "Packet Number Length", 2, pnLen - 1, `${pnLen - 1} → ${pnLen}-byte packet number (before header protection)`, D("pnLength"), prot);
    w.field("version", "Version", 32, 1, "0x00000001 (QUIC v1)", D("version"));
    w.field("dcidLen", "DCID Length", 8, dcid.length, `${dcid.length} bytes`, D("dcidLen"));
    if (dcid.length) w.bytes("dcid", "Destination Connection ID", dcid, hexStr(dcid), D("dcid"));
    w.field("scidLen", "SCID Length", 8, scid.length, `${scid.length} bytes`, D("scidLen"));
    if (scid.length) w.bytes("scid", "Source Connection ID", scid, hexStr(scid), D("scid"));
    if (type === "Initial") w.bytes("tokenLength", "Token Length", [0], "0 (no token)", D("tokenLength"));
    const lv = quicVarint(lenField, lenField < 16384 ? 2 : 4);
    w.bytes("length", "Length", lv, `${lenField} bytes (packet number + payload; ${lv.length}-byte varint ${hexStr(lv)})`, D("length"));
  }
  const pnOff = w.pos >> 3;
  w.bytes("pn", "Packet Number", pnBytes, `${pn} (before header protection)`, D("pn"), prot);
  w.bytes("payload", "Protected Payload", randBytes(plain + 16, ctx.seed + "quic-ct"),
    `${plain + 16} bytes: ${plain} bytes of encrypted frames + 16-byte AEAD tag`, D("payload"), { encrypted: true });
  // Header protection (RFC 9001 §5.4): XOR a mask derived from a sample of the ciphertext.
  const mask = randBytes(5, ctx.seed + "hp");
  w.b[0] ^= mask[0] & (short ? 0x1f : 0x0f);
  for (let i = 0; i < pnLen; i++) w.b[pnOff + i] ^= mask[1 + i];

  const header = mk("quic", short ? "QUIC 1-RTT packet (short header)" : `QUIC ${type} packet (long header)`, w, {
    layout: short ? "quic-short" : "quic-long",
    note: `Header protection (RFC 9001 §5.4): the low ${short ? 5 : 4} bits of the first byte and the packet number are XORed with a mask computed from a sample of the encrypted payload, so those wire bytes differ from the decoded values shown. ${type === "Initial" ? "Initial packets are encrypted with keys derived from the DCID, so anyone can decrypt them; " : ""}the payload and tag are deterministic stand-in bytes.`,
  });
  const fwW = new W();
  fwW.parts(fw, "frames");
  const framesLayer = mk("quic-frames", "QUIC frames (decrypted payload)", fwW, {
    decrypted: true, note: "What the endpoints see after removing packet protection; on the wire these bytes are encrypted inside the packet above.",
  });
  const inner = h3 ? h3.layers.map((l) => ({ ...l, decrypted: true, note: "Carried inside the STREAM frame above (decrypted view)." })) : [];
  return { layers: [header, framesLayer, ...inner] };
}

/* ------------------------------------------------------------------------------------------------
 * Assembly
 * ---------------------------------------------------------------------------------------------- */

const CONTROL_KINDS = new Set(["SYN", "SYN-ACK", "ACK", "FIN", "RST"]);

function build(ctx) {
  let transport = ctx.tcp ? "tcp" : ctx.udp ? "udp" : ctx.icmp ? "icmp" : null;
  if (!transport) {
    if (ctx.dns || ctx.quic || (ctx.http && str(ctx.http.version, "") === "3")) transport = "udp";
    else if (ctx.tls || ctx.http || ctx.ws) transport = "tcp";
    else if (ctx.ip && ctx.ip.proto === 6) transport = "tcp";
    else if (ctx.ip && ctx.ip.proto === 17) transport = "udp";
    else if (ctx.ip && ctx.ip.proto === 1) { transport = "icmp"; ctx.icmp = {}; }
  }
  if (transport === "tcp" && !ctx.tcpN) { ctx.tcp = {}; ctx.tcpN = normalize({ ...ctx.p, headers: { ...ctx.h, tcp: { flags: ["ACK", "PSH"] } } }).tcpN; }
  const ipLen = ctx.ip ? 20 : 0;
  const thl = transport === "tcp" ? 20 + (ctx.tcpN.mss !== null ? 4 : 0) : transport ? 8 : 0;
  const target = ctx.size === null ? null : Math.max(0, Math.min(MAX_PAYLOAD, ctx.size - ipLen - thl));

  let app = [];
  if (transport === "tcp") {
    const inner = (t) => {
      if (ctx.ws) return wsLayers(ctx, t);
      if (ctx.http) return str(ctx.http.version, "1.1").startsWith("2") || str(ctx.http.version, "") === "3" ? http2Layers(ctx, t) : http1Layers(ctx, t);
      return null;
    };
    if (ctx.tls) app = tlsLayers(ctx, target, ctx.ws || ctx.http ? inner : null).layers;
    else if (ctx.ws || ctx.http) app = inner(target).layers;
    else if (ctx.payloadStr !== null) app = [dataLayer(ctx, 0)];
    else {
      const control = ctx.tcpN.flags.includes("SYN") || CONTROL_KINDS.has(ctx.kind) || /^ACK\b/.test(ctx.label);
      if (!control && target) app = [dataLayer(ctx, target)];
    }
  } else if (transport === "udp") {
    if (ctx.dns) app = [dnsLayer(ctx)];
    else if (ctx.quic || ctx.http) { if (!ctx.quic) ctx.quic = { form: "short", pn: 0, frames: [] }; app = quicLayers(ctx, target).layers; }
    else if (ctx.payloadStr !== null || target) app = [dataLayer(ctx, target || 0)];
  } else if (!transport && (target || ctx.payloadStr !== null)) {
    app = [dataLayer(ctx, target || 0)];
  }

  const wire = [];
  for (const l of app) if (!l.decrypted) for (const b of l.full) wire.push(b);
  const layers = [];
  let tLayer = null, proto = ctx.ip ? ctx.ip.proto : 0;
  if (transport === "tcp") { tLayer = tcpLayer(ctx, wire); proto = 6; }
  else if (transport === "udp") { tLayer = udpLayer(ctx, wire); proto = 17; }
  else if (transport === "icmp") { tLayer = icmpLayer(ctx, target); proto = 1; }
  const tLen = (tLayer ? tLayer.full.length : 0) + wire.length;
  if (ctx.ip) layers.push(mk("ipv4", "IPv4", ipv4Header(ctx, proto, tLen), { layout: "ipv4" }));
  if (tLayer) layers.push(tLayer);
  layers.push(...app);
  return layers;
}

function publicLayer(l) {
  const out = {
    id: l.id, name: l.name, fields: l.fields, bytes: l.full.slice(0, CAP),
    totalLength: l.full.length, truncated: l.full.length > CAP,
  };
  for (const k of ["layout", "decrypted", "encrypted", "note"]) if (l[k] !== undefined) out[k] = l[k];
  return out;
}

/** Ordered header layers (outermost first) with real bytes. Never throws. */
export function encodeLayers(packet) {
  try {
    return build(normalize(packet)).map(publicLayer);
  } catch (err) {
    return [{ id: "error", name: "Could not encode packet", fields: [], bytes: [], totalLength: 0, truncated: false, note: String(err && err.message) }];
  }
}

/** The complete on-the-wire bytes (IPv4 datagram, or transport segment if there is no IP header). */
export function wireBytes(packet) {
  try {
    const out = [];
    for (const l of build(normalize(packet))) if (!l.decrypted) for (const b of l.full) out.push(b);
    return out;
  } catch { return []; }
}

/* ------------------------------------------------------------------------------------------------
 * One-line descriptions
 * ---------------------------------------------------------------------------------------------- */

export function describePacket(packet) {
  try {
    const ctx = normalize(packet);
    const layers = build(ctx);
    const app = describeApp(ctx, layers);
    if (app) return app;
    if (ctx.tcpN && ctx.tcp) {
      const t = ctx.tcpN;
      const tl = layers.find((l) => l.id === "tcp");
      const idx = layers.indexOf(tl);
      const len = layers.slice(idx + 1).filter((l) => !l.decrypted).reduce((s, l) => s + l.full.length, 0);
      return `TCP ${t.srcPort} → ${t.dstPort} [${t.flags.join(", ") || "none"}] seq=${t.seq}` +
        (t.flags.includes("ACK") ? ` ack=${t.ack}` : "") + ` win=${t.window}` + (len ? ` len=${len}` : "") + (t.mss !== null ? ` mss=${t.mss}` : "");
    }
    if (ctx.icmp) {
      const type = int(ctx.icmp.type, 8, 0, 255), code = int(ctx.icmp.code, 0, 0, 255);
      if (type === 8 || type === 0) return `ICMP Echo ${type === 8 ? "request" : "reply"} id=${int(ctx.icmp.id, 1, 0, 65535)} seq=${int(ctx.icmp.seq, 1, 0, 65535)}${ctx.ip ? ` ttl=${ctx.ip.ttl}` : ""}`;
      if (type === 11) return `ICMP Time Exceeded (${code === 0 ? "TTL expired in transit" : "reassembly timeout"}) ${ctx.src} → ${ctx.dst}`;
      return `ICMP type ${type} code ${code} ${ctx.src} → ${ctx.dst}`;
    }
    if (ctx.udp) {
      const u = layers.find((l) => l.id === "udp");
      const sp = u.fields[0].value.split(" ")[0], dp = u.fields[1].value.split(" ")[0];
      return `UDP ${sp} → ${dp} len=${u.fields[2].value.split(" ")[0] - 8}`;
    }
    return ctx.ip ? `IPv4 ${ctx.src} → ${ctx.dst}` : ctx.label || ctx.kind || "packet";
  } catch {
    return (packet && typeof packet.label === "string" && packet.label) || "packet";
  }
}

function describeApp(ctx, layers) {
  if (ctx.dns) {
    const q = ctx.dns, id = hex(int(q.id, 0x1a2b, 0, 65535), 4);
    const qt = typeof q.qtype === "number" ? QTYPE_NAMES[q.qtype] || q.qtype : str(q.qtype, "A").toUpperCase();
    const name = str(q.qname, "example.com");
    if (!int(q.qr, 0, 0, 1)) return `DNS query ${id} ${qt} ${name}`;
    const rc = int(q.rcode, 0, 0, 15);
    if (rc) return `DNS response ${id} ${qt} ${name} → ${RCODES[rc] || "rcode " + rc}`;
    const ans = arr(q.answers).map((a) => str(a, "")).filter(Boolean);
    return `DNS response ${id} ${qt} ${name} → ${ans.join(", ") || "(no answers)"}`;
  }
  const tlsV = ctx.tls ? `TLS ${str(ctx.tls.version, "1.3") === "1.2" ? "1.2" : "1.3"}` : "";
  const httpDesc = () => {
    if (!ctx.http) return "";
    const hi = httpInfo(ctx);
    const v = str(ctx.http.version, "1.1");
    const what = hi.isReq ? `${hi.method} ${hi.path}` : `${hi.status} ${REASONS[hi.status] || ""}`.trim() + (ctx.http.path !== undefined ? ` (${hi.path})` : "");
    if (v.startsWith("2") || v === "3") {
      const fr = layers.filter((l) => l.id === "http2" || l.id === "http3").map((l) => l.name.split(" ")[1]).join("+");
      return `HTTP/${v.startsWith("2") ? 2 : 3} ${fr} stream ${hi.stream}: ${what}`;
    }
    if (!hi.isReq && ctx.seg && ctx.seg.k > 1) return `HTTP/1.1 body (part ${ctx.seg.k}/${ctx.seg.n})${ctx.http.path !== undefined ? ` of ${hi.path}` : ""}`;
    return `HTTP/1.1 ${what}`;
  };
  if (ctx.quic) {
    const ql = layers.find((l) => l.id === "quic");
    const fr = layers.find((l) => l.id === "quic-frames");
    const kinds = [...new Set(arr(ctx.quic.frames).map((x) => str(obj(x) && x.type, "").toUpperCase()).filter(Boolean))];
    if (fr && fr.fields.some((x) => x.name === "Padding") && !kinds.includes("PADDING")) kinds.push("PADDING");
    const pn = int(ctx.quic.pn, 0, 0, 2 ** 32 - 1);
    const h = ctx.http ? ` · ${httpDesc()}` : "";
    return `QUIC ${ql ? ql.name.replace(/^QUIC | packet.*$/g, "") : ""} pn=${pn} [${kinds.join(", ")}]${h}`;
  }
  if (ctx.ws) {
    const l = layers.find((x) => x.id === "websocket");
    const op = l ? l.name.replace(/^WebSocket | frame$/g, "") : "frame";
    const masked = l && l.fields.some((x) => x.key === "maskKey");
    const plen = l ? l.fields.find((x) => x.key === "payload").length : 0;
    return `WebSocket ${op} frame (${masked ? "masked, " : ""}${plen} B)${tlsV ? ` over ${tlsV}` : ""}`;
  }
  if (ctx.http) return httpDesc() + (tlsV ? ` (in ${tlsV})` : "");
  if (ctx.tls) {
    const msgs = arr(ctx.tls.messages).map((m) => str(m, "")).filter(Boolean);
    if (msgs.length) return `${tlsV} handshake: ${msgs.join(", ")}`;
    const r = str(ctx.tls.record, "application_data");
    return `${tlsV} ${r === "change_cipher_spec" ? "ChangeCipherSpec" : r === "handshake" ? "handshake" : "application data (encrypted)"}`;
  }
  return "";
}
