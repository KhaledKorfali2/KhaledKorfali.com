// Breach Toolkit: pure encoding / cipher / hash functions. No DOM; runs in Node too.
// Text <-> bytes is always UTF-8.

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: false });

/** UTF-8 bytes of a string (Uint8Array passes through). */
export const toBytes = (s) => (s instanceof Uint8Array ? s : enc.encode(String(s ?? "")));
/** Bytes to string, decoding as UTF-8 (invalid sequences become U+FFFD). */
export const fromBytes = (b) => dec.decode(b);

/* ───────────────────────── Encodings ───────────────────────── */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_REV = (() => { const m = {}; for (let i = 0; i < 64; i++) m[B64[i]] = i; return m; })();

export function b64encode(input) {
  const b = toBytes(input);
  let out = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < b.length ? B64[(n >> 6) & 63] : "=";
    out += i + 2 < b.length ? B64[n & 63] : "=";
  }
  return out;
}

/** Base64 → bytes. Lenient: ignores whitespace, accepts URL-safe (-_) and missing padding. */
export function b64decodeBytes(input) {
  let s = String(input ?? "").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (s.length % 4 === 1) throw new Error("Not valid Base64: wrong length");
  const out = [];
  let buf = 0, bits = 0;
  for (const c of s) {
    const v = B64_REV[c];
    if (v === undefined) throw new Error(`Not valid Base64: unexpected character "${c}"`);
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); }
  }
  return new Uint8Array(out);
}
export const b64decode = (input) => fromBytes(b64decodeBytes(input));

export function hexEncode(input, sep = "") {
  return Array.from(toBytes(input), (x) => x.toString(16).padStart(2, "0")).join(sep);
}
/** Hex → bytes. Ignores whitespace, `0x` and `\x` prefixes (and `:`/`,` separators). */
export function hexDecodeBytes(input) {
  const s = String(input ?? "").replace(/0x|\\x/gi, "").replace(/[\s:,]+/g, "");
  if (/[^0-9a-f]/i.test(s)) throw new Error(`Not valid hex: unexpected character "${s.match(/[^0-9a-f]/i)[0]}"`);
  if (s.length % 2) throw new Error("Not valid hex: odd number of digits");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}
export const hexDecode = (input) => fromBytes(hexDecodeBytes(input));

export const urlEncode = (s) => encodeURIComponent(String(s ?? ""));
/** URL-decode; `+` becomes a space, malformed `%` sequences are left as-is. */
export function urlDecode(input) {
  const s = String(input ?? "").replace(/\+/g, " ");
  try { return decodeURIComponent(s); } catch { /* fall through to lenient decoding */ }
  return s.replace(/(?:%[0-9a-f]{2})+/gi, (run) => {
    try { return decodeURIComponent(run); } catch { return fromBytes(hexDecodeBytes(run.replace(/%/g, ""))); }
  });
}

/** Text → space-separated 8-bit groups (UTF-8 bytes). */
export const toBinary = (input) => Array.from(toBytes(input), (x) => x.toString(2).padStart(8, "0")).join(" ");
export function fromBinary(input) {
  const s = String(input ?? "").replace(/\s+/g, "");
  if (/[^01]/.test(s)) throw new Error("Not valid binary: only 0 and 1 allowed");
  if (s.length % 8) throw new Error(`Not valid binary: ${s.length} bits is not a multiple of 8`);
  const out = new Uint8Array(s.length / 8);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 8, 8), 2);
  return fromBytes(out);
}

/** "72 105 33" (any non-digit separators) → "Hi!" */
export function fromDecimal(input) {
  const nums = String(input ?? "").match(/\d+/g) || [];
  return nums.map((n) => {
    const c = Number(n);
    if (c > 0x10ffff) throw new Error(`Not a valid character code: ${n}`);
    return String.fromCodePoint(c);
  }).join("");
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", trade: "™",
  hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»",
  sol: "/", bsol: "\\", colon: ":", semi: ";", lpar: "(", rpar: ")", lsqb: "[", rsqb: "]", lcub: "{", rcub: "}",
  equals: "=", excl: "!", quest: "?", num: "#", percnt: "%", dollar: "$", plus: "+", comma: ",", period: ".",
  grave: "`", Hat: "^", lowbar: "_", verbar: "|", ast: "*", commat: "@", Tab: "\t", NewLine: "\n", deg: "°", euro: "€", pound: "£", yen: "¥", cent: "¢" };
/** Decode HTML entities (named, &#ddd; and &#xhh;, semicolon optional for numeric). No DOM involved. */
export function htmlDecode(input) {
  return String(input ?? "").replace(/&(?:#(\d+);?|#x([0-9a-f]+);?|([a-z][a-z0-9]*);)/gi, (m, d, h, name) => {
    if (d || h) {
      const c = d ? parseInt(d, 10) : parseInt(h, 16);
      return c > 0x10ffff || c === 0 ? "�" : String.fromCodePoint(c);
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, name) ? ENTITIES[name] : m;
  });
}

/* ───────────────────────── Ciphers ───────────────────────── */

const shiftChar = (c, k) => {
  const code = c.charCodeAt(0);
  const base = code >= 65 && code <= 90 ? 65 : code >= 97 && code <= 122 ? 97 : 0;
  if (!base) return c;
  return String.fromCharCode(base + ((((code - base + k) % 26) + 26) % 26));
};

/** Shift letters by `shift` (negative = left). Case kept, other characters untouched. */
export const caesar = (text, shift = 3) => String(text ?? "").replace(/[a-z]/gi, (c) => shiftChar(c, Math.trunc(Number(shift) || 0)));
export const rot13 = (text) => caesar(text, 13);
/** All 26 shifts: [{ shift, text }] for shift 0..25. */
export const caesarAll = (text) => Array.from({ length: 26 }, (_, shift) => ({ shift, text: caesar(text, shift) }));

/** Vigenère. Key letters only (others ignored); non-letters in text pass through without using the key. */
export function vigenere(text, key, decrypt = false) {
  const ks = String(key ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!ks) return String(text ?? "");
  let j = 0;
  return String(text ?? "").replace(/[a-z]/gi, (c) => {
    const k = ks.charCodeAt(j++ % ks.length) - 97;
    return shiftChar(c, decrypt ? -k : k);
  });
}

export const atbash = (text) => String(text ?? "").replace(/[a-z]/gi, (c) => {
  const base = c <= "Z" ? 65 : 97;
  return String.fromCharCode(base + 25 - (c.charCodeAt(0) - base));
});

/** XOR bytes with a repeating key. Both accept Uint8Array or string (UTF-8). */
export function xorBytes(bytes, keyBytes) {
  const b = toBytes(bytes), k = toBytes(keyBytes);
  if (!k.length) return Uint8Array.from(b);
  return b.map((x, i) => x ^ k[i % k.length]);
}

// Rough English letter frequencies (%), space slightly above 'e'.
const FREQ = { " ": 15, e: 12.7, t: 9.1, a: 8.2, o: 7.5, i: 7.0, n: 6.7, s: 6.3, h: 6.1, r: 6.0, d: 4.3, l: 4.0, c: 2.8, u: 2.8,
  m: 2.4, w: 2.4, f: 2.2, g: 2.0, y: 2.0, p: 1.9, b: 1.5, v: 1.0, k: 0.8, j: 0.15, x: 0.15, q: 0.1, z: 0.07 };

/** Score bytes as English-like text: higher is better. Non-printable bytes are heavily penalised. */
export function englishScore(bytes) {
  const b = toBytes(bytes);
  if (!b.length) return 0;
  let s = 0;
  for (const x of b) {
    if (x === 9 || x === 10 || x === 13) s += 1;
    else if (x < 32 || x === 127) s -= 20;
    else if (x >= 128) s -= 8;
    else {
      const f = FREQ[String.fromCharCode(x).toLowerCase()];
      s += f !== undefined ? f : /[0-9.,'!?{}_\-:;"()]/.test(String.fromCharCode(x)) ? 1 : -1;
    }
  }
  return s / b.length;
}

/** Try all 256 single-byte keys; returns [{ key, text, score, printable }] best first. */
export function xorBruteForce(bytes) {
  const b = toBytes(bytes);
  const out = [];
  for (let key = 0; key < 256; key++) {
    const r = b.map((x) => x ^ key);
    const printable = r.every((x) => (x >= 32 && x < 127) || x === 9 || x === 10 || x === 13);
    out.push({ key, text: Array.from(r, (c) => String.fromCharCode(c)).join(""), score: englishScore(r), printable });
  }
  return out.sort((a, c) => c.score - a.score || a.key - c.key);
}

/* ───────────────────────── Hashes ───────────────────────── */

const MD5_S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

/** In-house MD5 (RFC 1321). Strings are hashed as UTF-8. Returns lowercase hex. */
export function md5(input) {
  const msg = toBytes(input);
  const len = msg.length;
  const padded = new Uint8Array(((len + 8) >> 6) * 64 + 64);
  padded.set(msg);
  padded[len] = 0x80;
  const bitLen = len * 8;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, bitLen >>> 0, true);
  dv.setUint32(padded.length - 4, Math.floor(bitLen / 2 ** 32), true);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const M = new Uint32Array(16);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) & 15; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) & 15; }
      else { F = C ^ (B | ~D); g = (7 * i) & 15; }
      F = (F + A + MD5_K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((F << MD5_S[i]) | (F >>> (32 - MD5_S[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  [a0, b0, c0, d0].forEach((w, i) => out.setUint32(i * 4, w, true));
  return hexEncode(new Uint8Array(out.buffer));
}

async function subtleHex(algo, input) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error("Web Crypto is unavailable (needs a secure context: https or localhost)");
  return hexEncode(new Uint8Array(await subtle.digest(algo, toBytes(input))));
}
export const sha1 = (s) => subtleHex("SHA-1", s);
export const sha256 = (s) => subtleHex("SHA-256", s);
export const sha512 = (s) => subtleHex("SHA-512", s);

/** Keyed hash (message authentication code), hex output. Default SHA-256. */
export async function hmac(message, key, hash = "SHA-256") {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error("Web Crypto is unavailable (needs a secure context: https or localhost)");
  const k = await subtle.importKey("raw", toBytes(key), { name: "HMAC", hash }, false, ["sign"]);
  return hexEncode(new Uint8Array(await subtle.sign("HMAC", k, toBytes(message))));
}
export const hmacSha256 = (message, key) => hmac(message, key, "SHA-256");

/**
 * Guess what a hash is from its format. Returns [{ name, note }] most likely first;
 * an empty array means "doesn't look like a known hash".
 */
export function identifyHash(input) {
  const s = String(input ?? "").trim();
  if (!s) return [];
  const r = (name, note) => ({ name, note });

  // Modular crypt / prefixed formats
  if (/^\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(s)) return [r("bcrypt", `Cost ${s.split("$")[2]} (2^${+s.split("$")[2]} rounds). Deliberately slow; crack with a wordlist, not brute force.`)];
  if (/^\$1\$[^$]{0,8}\$[./A-Za-z0-9]{22}$/.test(s)) return [r("md5crypt", "Unix MD5-based crypt ($1$), salted. Old Linux /etc/shadow format.")];
  if (/^\$apr1\$[^$]{0,8}\$[./A-Za-z0-9]{22}$/.test(s)) return [r("Apache apr1 MD5", "Apache .htpasswd MD5 variant, salted.")];
  if (/^\$5\$(rounds=\d+\$)?[^$]{0,16}\$[./A-Za-z0-9]{43}$/.test(s)) return [r("sha256crypt", "Unix SHA-256 crypt ($5$), salted.")];
  if (/^\$6\$(rounds=\d+\$)?[^$]{0,16}\$[./A-Za-z0-9]{86}$/.test(s)) return [r("sha512crypt", "Unix SHA-512 crypt ($6$), salted. Common modern /etc/shadow format.")];
  if (/^\$y\$[./A-Za-z0-9]+\$[./A-Za-z0-9]+\$[./A-Za-z0-9]{43}$/.test(s)) return [r("yescrypt", "yescrypt ($y$), the default in newer Debian/Ubuntu /etc/shadow.")];
  if (/^\$argon2(id|i|d)\$/.test(s)) return [r("Argon2", "Memory-hard password hash; the current recommended choice.")];
  if (/^\$P\$|^\$H\$/.test(s) && s.length === 34) return [r("phpass", "WordPress / phpBB portable password hash.")];
  if (/^pbkdf2_sha256\$\d+\$/.test(s)) return [r("Django PBKDF2-SHA256", "Django's default password storage.")];
  if (/^\*[0-9A-F]{40}$/i.test(s)) return [r("MySQL 4.1+ (SHA1(SHA1))", "MySQL password() hash.")];
  if (/^[0-9a-f]{32}:[0-9a-f]{32}$/i.test(s)) return [r("LM:NTLM pair", "Windows hash pair as dumped from SAM (LM hash, then NTLM hash).")];
  if (/^\$/.test(s)) return [r("Unknown crypt format", `Prefix "${s.split("$")[1]}" not recognised.`)];

  if (/^[0-9a-f]+$/i.test(s)) {
    const byLen = {
      8: [r("CRC32", "A checksum, not a security hash."), r("Adler-32", "Checksum.")],
      16: [r("MySQL 3.x (old)", "Weak legacy MySQL hash."), r("Half MD5", "First 64 bits of an MD5.")],
      32: [r("MD5", "Most common 32-hex hash. Unsalted MD5 is cracked instantly with wordlists."),
        r("NTLM", "Windows password hash (MD4 of UTF-16LE password). Same length as MD5."),
        r("MD4", "Older hash, same length."), r("LM", "Legacy Windows LAN Manager hash.")],
      40: [r("SHA-1", "160-bit; broken for collisions, still unsalted and fast to crack."), r("RIPEMD-160", "Same length, rarer.")],
      56: [r("SHA-224", ""), r("SHA3-224", "")],
      64: [r("SHA-256", "Very common; fast, so unsalted ones fall to wordlists."), r("SHA3-256", "Same length, rarer.")],
      96: [r("SHA-384", ""), r("SHA3-384", "")],
      128: [r("SHA-512", "Very long hex; still fast to compute if unsalted."), r("SHA3-512", ""), r("Whirlpool", "")],
    }[s.length];
    if (byLen) return byLen;
    return [];
  }
  return [];
}
