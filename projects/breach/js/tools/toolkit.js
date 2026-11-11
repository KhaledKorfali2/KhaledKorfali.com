// The Toolkit: an in-house "CyberChef-lite". Paste input, pick an operation, chain the
// output back in. Everything runs locally; output is always shown as text.
import { el, icon, ICONS, copy } from "../ui.js";
import * as C from "./crypto.js";

const OPS = [
  { group: "Decode", items: [
    ["Base64 → text", (s) => C.b64decode(s)],
    ["Hex → text", (s) => C.hexDecode(s)],
    ["Binary → text", (s) => C.fromBinary(s)],
    ["URL decode", (s) => C.urlDecode(s)],
    ["HTML entities → text", (s) => C.htmlDecode(s)],
    ["Char codes → text", (s) => C.fromDecimal(s)],
  ] },
  { group: "Encode", items: [
    ["Text → Base64", (s) => C.b64encode(s)],
    ["Text → Hex", (s) => C.hexEncode(s, " ")],
    ["Text → Binary", (s) => C.toBinary(s)],
    ["URL encode", (s) => C.urlEncode(s)],
    ["Reverse", (s) => [...s].reverse().join("")],
  ] },
  { group: "Classical ciphers", items: [
    ["ROT13", (s) => C.rot13(s)],
    ["Atbash", (s) => C.atbash(s)],
    ["Caesar: every shift", (s) => C.caesarAll(s).map((r) => `${String(r.shift).padStart(2)}  ${r.text}`).join("\n")],
    ["Caesar: shift by key", (s, k) => C.caesar(s, -Number(k || 0)), "Shift to undo (e.g. 3)"],
    ["Vigenère decrypt", (s, k) => C.vigenere(s, k || "", true), "Key"],
    ["Vigenère encrypt", (s, k) => C.vigenere(s, k || "", false), "Key"],
  ] },
  { group: "XOR", items: [
    ["XOR with key (hex in)", (s, k) => latin1(C.xorBytes(C.hexDecodeBytes(s), keyBytes(k))), "Key: text, or 0x41 for hex"],
    ["XOR: try every 1-byte key (hex in)", (s) => C.xorBruteForce(C.hexDecodeBytes(s)).slice(0, 8)
      .map((r) => `key 0x${r.key.toString(16).padStart(2, "0")}  ${r.text}`).join("\n")],
  ] },
  { group: "Hashing", items: [
    ["MD5", (s) => C.md5(s)],
    ["SHA-1", (s) => C.sha1(s)],
    ["SHA-256", (s) => C.sha256(s)],
    ["SHA-512", (s) => C.sha512(s)],
    ["Identify hash type", (s) => { const r = C.identifyHash(s.trim()); return r.length ? r.map((x) => `${x.name}${x.note ? `  (${x.note})` : ""}`).join("\n") : "Not a recognised hash format."; }],
  ] },
  { group: "Numbers", items: [
    ["Number → dec / hex / bin", (s) => {
      const t = s.trim().toLowerCase();
      const n = /^0x[0-9a-f]+$/.test(t) ? BigInt(t) : /^0b[01]+$/.test(t) ? BigInt(t) : /^-?\d+$/.test(t) ? BigInt(t) : null;
      if (n === null) throw new Error("Enter a number like 255, 0xff or 0b1010");
      return `dec  ${n.toString(10)}\nhex  0x${n.toString(16)}\nbin  0b${n.toString(2)}\noct  0o${n.toString(8)}`;
    }],
  ] },
];
const latin1 = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join("");
const keyBytes = (k = "") => (/^0x[0-9a-f]+$/i.test(k.trim()) ? C.hexDecodeBytes(k.trim().slice(2)) : C.toBytes(k));

/** Build the toolkit UI into `root`. `initial` pre-fills the input. */
export function mountToolkit(root, { initial = "", compact = false } = {}) {
  const input = el("textarea", { class: "tk-in", spellcheck: "false", autocapitalize: "off", autocomplete: "off", "aria-label": "Input", placeholder: "Paste something to decode, decrypt or hash…", value: initial });
  const keyIn = el("input", { class: "tk-key", spellcheck: "false", autocapitalize: "off", "aria-label": "Key", hidden: true });
  const out = el("pre", { class: "tk-out", "aria-live": "polite", text: "Output appears here." });
  const opLabel = el("span", { class: "tk-op", text: "" });
  let last = null;

  async function run(item) {
    const [name, fn, keyHint] = item;
    last = item;
    keyIn.hidden = !keyHint;
    if (keyHint) keyIn.placeholder = keyHint;
    opLabel.textContent = name;
    if (keyHint && !keyIn.value && document.activeElement !== keyIn) { out.textContent = `Enter the ${keyHint.toLowerCase()} above, then run again.`; keyIn.focus(); return; }
    out.classList.remove("is-err");
    try {
      const r = await fn(input.value, keyIn.value);
      out.textContent = r === "" ? "(empty)" : String(r);
    } catch (err) {
      out.classList.add("is-err");
      out.textContent = `✗ ${err.message || err}`;
    }
  }
  keyIn.addEventListener("keydown", (e) => { if (e.key === "Enter" && last) run(last); });

  const groups = el("div", { class: "tk-ops" }, OPS.map((g) => el("div", { class: "tk-group" },
    el("span", { class: "tk-gname", text: g.group }),
    el("div", { class: "tk-btns" }, g.items.map((item) => el("button", { type: "button", class: "tk-btn", text: item[0], on: { click: () => run(item) } }))))));

  const actions = el("div", { class: "tk-actions" },
    el("button", { type: "button", class: "tk-mini", on: { click: () => { input.value = out.textContent; out.textContent = "Moved to input. Pick the next operation."; } } }, icon(ICONS.back, 13), "Use output as input"),
    el("button", { type: "button", class: "tk-mini", on: { click: () => copy(out.textContent) } }, icon(ICONS.copy, 13), "Copy"),
    el("button", { type: "button", class: "tk-mini", on: { click: () => { input.value = ""; out.textContent = "Output appears here."; input.focus(); } } }, "Clear"));

  root.replaceChildren(el("div", { class: `tk${compact ? " is-compact" : ""}` },
    el("div", { class: "tk-io" }, input, keyIn, el("div", { class: "tk-outhead" }, el("span", { class: "tk-label", text: "Output" }), opLabel), out, actions),
    groups));
  return { setInput(v) { input.value = v; } };
}
