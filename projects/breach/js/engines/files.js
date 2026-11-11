// Files workspace: a forensic file viewer (text, log, hex, image, email).
// All file content is untrusted-ish and goes into the DOM as text only.
import { el } from "../ui.js";

const KIND_LABEL = { text: "TXT", log: "LOG", hex: "HEX", image: "IMG", email: "EML" };

/* ── byte / text helpers ─────────────────────────────────────────── */
export function toBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const s = String(data ?? "");
  // Binary strings ("\x89PNG…") map 1:1 to bytes; real Unicode text is UTF-8 encoded.
  if (!/[^\u0000-ÿ]/.test(s)) {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  return new TextEncoder().encode(s);
}
function toText(data) {
  if (typeof data === "string") return data;
  if (data instanceof Uint8Array || data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    return new TextDecoder("utf-8").decode(toBytes(data));
  }
  return String(data ?? "");
}
const hex2 = (b) => b.toString(16).padStart(2, "0");
const printable = (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".");
function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

const MAGIC = [
  { sig: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], name: "PNG image", ext: ".png" },
  { sig: [0xff, 0xd8, 0xff], name: "JPEG image", ext: ".jpg" },
  { sig: [0x47, 0x49, 0x46, 0x38], name: "GIF image", ext: ".gif" },
  { sig: [0x25, 0x50, 0x44, 0x46, 0x2d], name: "PDF document", ext: ".pdf" },
  { sig: [0x50, 0x4b, 0x03, 0x04], name: "ZIP archive (also DOCX / XLSX / PPTX / JAR / APK)", ext: ".zip" },
  { sig: [0x50, 0x4b, 0x05, 0x06], name: "ZIP archive (empty)", ext: ".zip" },
  { sig: [0x7f, 0x45, 0x4c, 0x46], name: "ELF executable (Linux)", ext: "" },
  { sig: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], name: "7-Zip archive", ext: ".7z" },
  { sig: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07], name: "RAR archive", ext: ".rar" },
  { sig: [0x1f, 0x8b], name: "gzip compressed data", ext: ".gz" },
  { sig: [0x4d, 0x5a], name: "PE / MZ executable (Windows .exe / .dll)", ext: ".exe" },
  { sig: [0x42, 0x5a, 0x68], name: "bzip2 compressed data", ext: ".bz2" },
  { sig: [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66], name: "SQLite database", ext: ".db" },
  { sig: [0xca, 0xfe, 0xba, 0xbe], name: "Java class / Mach-O fat binary", ext: ".class" },
  { sig: [0x42, 0x4d], name: "BMP image", ext: ".bmp" },
  { sig: [0x23, 0x21], name: "Script with shebang (#!)", ext: ".sh" },
];
export function detectMagic(bytes) {
  for (const m of MAGIC) {
    if (bytes.length >= m.sig.length && m.sig.every((b, i) => bytes[i] === b)) return m;
  }
  return null;
}
export function findStrings(bytes, min = 4) {
  const out = [];
  let start = -1;
  for (let i = 0; i <= bytes.length; i++) {
    const b = i < bytes.length ? bytes[i] : 0;
    const ok = (b >= 0x20 && b < 0x7f) || b === 0x09;
    if (ok) { if (start < 0) start = i; }
    else if (start >= 0) {
      if (i - start >= min) out.push({ off: start, text: String.fromCharCode(...bytes.subarray(start, i)) });
      start = -1;
    }
  }
  return out;
}
/** LSB text: R,G,B LSBs in pixel order, MSB-first into bytes; stops at NUL or `max` bytes. */
export function extractLsb(imageData, max = 256) {
  const d = imageData.data;
  const out = [];
  let cur = 0, n = 0;
  for (let p = 0; p < d.length; p += 4) {
    for (let c = 0; c < 3; c++) {
      cur = (cur << 1) | (d[p + c] & 1);
      if (++n === 8) {
        if (cur === 0) return new Uint8Array(out);
        out.push(cur);
        if (out.length >= max) return new Uint8Array(out);
        cur = 0; n = 0;
      }
    }
  }
  return new Uint8Array(out);
}

/* ── mount ───────────────────────────────────────────────────────── */
export function mount(host, env, api = {}) {
  const files = (env && env.files) || [];
  const list = el("div", { class: "fv-list", role: "tablist", "aria-label": "Files" });
  const view = el("div", { class: "fv-view" });
  const root = el("div", { class: "fv" }, el("div", { class: "fv-shell" }, list, view));
  host.append(root);

  let cleanupView = null;
  const buttons = files.map((f, i) =>
    el("button", {
      class: "fv-file", type: "button", role: "tab", "aria-selected": "false",
      dataset: { kind: f.kind || "text" }, title: f.name,
      on: { click: () => open(i) },
    },
    el("span", { class: "fv-kind", text: KIND_LABEL[f.kind] || "FILE" }),
    el("span", { class: "fv-name", text: f.name || `file ${i + 1}` })));
  list.append(...buttons);

  function open(i) {
    if (cleanupView) { try { cleanupView(); } catch { /* ignore */ } cleanupView = null; }
    buttons.forEach((b, j) => b.setAttribute("aria-selected", String(i === j)));
    const f = files[i];
    const r = (RENDER[f.kind] || RENDER.text)(f, api);
    const size = f.data instanceof Uint8Array ? f.data.length
      : typeof f.data === "string" ? toBytes(f.data).length : null;
    const head = el("div", { class: "fv-head" },
      el("span", { class: "fv-title", text: f.name || "" }),
      el("span", { class: "fv-meta", text: [f.kind || "text", size != null ? fmtSize(size) : null].filter(Boolean).join(" · ") }));
    view.replaceChildren(...[head, f.note ? el("div", { class: "fv-note", text: f.note }) : null, ...[].concat(r.nodes)].filter(Boolean));
    cleanupView = r.cleanup || null;
    // Keep the active tab visible without scrolling the page itself.
    const b = buttons[i];
    if (b.offsetLeft < list.scrollLeft || b.offsetLeft + b.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollLeft = b.offsetLeft - 8;
    if (b.offsetTop < list.scrollTop || b.offsetTop + b.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = b.offsetTop - 8;
  }

  if (files.length) open(0);
  else view.append(el("div", { class: "fv-empty", text: "No files." }));

  return () => {
    if (cleanupView) { try { cleanupView(); } catch { /* ignore */ } }
    root.remove();
  };
}

/* ── renderers: each returns { nodes, cleanup? } ─────────────────── */
function toggle(label, initial, onChange) {
  const b = el("button", { class: "fv-btn", type: "button", "aria-pressed": String(initial) }, label);
  b.addEventListener("click", () => {
    const v = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(v));
    onChange(v);
  });
  return b;
}
function segmented(options, initial, onChange) {
  const wrap = el("div", { class: "fv-seg", role: "group" });
  const btns = options.map(([value, label]) => el("button", {
    type: "button", class: "fv-btn", "aria-pressed": String(value === initial),
    on: { click: () => { btns.forEach((x) => x.setAttribute("aria-pressed", String(x === btn(value)))); onChange(value); } },
  }, label));
  const btn = (v) => btns[options.findIndex((o) => o[0] === v)];
  wrap.append(...btns);
  return wrap;
}

const RENDER = {
  text(f) {
    const pre = el("pre", { class: "fv-pre fv-wrap", text: toText(f.data) });
    const bar = el("div", { class: "fv-bar" },
      toggle("Wrap lines", true, (v) => pre.classList.toggle("fv-wrap", v)));
    return { nodes: [bar, el("div", { class: "fv-body" }, pre)] };
  },

  log(f) {
    const lines = toText(f.data).replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
    const width = String(lines.length).length;
    const input = el("input", {
      class: "fv-input", type: "search", placeholder: "Filter: text or /regex/", spellcheck: "false",
      autocomplete: "off", "aria-label": "Filter lines",
    });
    const count = el("span", { class: "fv-count", "aria-live": "polite" });
    const err = el("span", { class: "fv-err" });
    const out = el("div", { class: "fv-log fv-wrap" });
    const body = el("div", { class: "fv-body" }, out);
    const bar = el("div", { class: "fv-bar" }, input,
      toggle("Wrap", true, (v) => out.classList.toggle("fv-wrap", v)), count, err);

    const CHUNK = 1000;
    let matches = [], shown = 0, re = null, timer = 0;

    function compile(q) {
      if (!q) return null;
      const m = q.match(/^\/(.+)\/([a-z]*)$/);
      if (m) {
        const flags = [...new Set((m[2] + "g").replace(/[^dgimsuy]/g, ""))].join("");
        return new RegExp(m[1], flags);
      }
      return new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    }
    function lineNode(i) {
      const text = lines[i];
      const tx = el("span", { class: "fv-tx" });
      if (re) {
        re.lastIndex = 0;
        let last = 0, m, guard = 0;
        while ((m = re.exec(text)) && guard++ < 500) {
          if (m[0] === "") { re.lastIndex++; continue; }
          if (m.index > last) tx.append(text.slice(last, m.index));
          tx.append(el("mark", { class: "fv-hit", text: m[0] }));
          last = m.index + m[0].length;
        }
        if (last < text.length) tx.append(text.slice(last));
      } else tx.textContent = text || " ";
      return el("div", { class: "fv-ln" }, el("span", { class: "fv-no", text: String(i + 1).padStart(width, " ") }), tx);
    }
    function renderMore() {
      out.querySelector(".fv-more")?.remove();
      const frag = document.createDocumentFragment();
      const end = Math.min(matches.length, shown + CHUNK);
      for (let k = shown; k < end; k++) frag.append(lineNode(matches[k]));
      shown = end;
      out.append(frag);
      if (shown < matches.length) {
        out.append(el("button", { class: "fv-btn fv-more", type: "button", on: { click: renderMore } },
          `Show ${Math.min(CHUNK, matches.length - shown)} more (${matches.length - shown} remaining)`));
      }
    }
    function apply() {
      const q = input.value;
      err.textContent = "";
      input.classList.remove("fv-bad");
      try { re = compile(q); }
      catch (e) { re = null; err.textContent = "Invalid regex: " + (e.message || "").replace(/^Invalid regular expression: /, ""); input.classList.add("fv-bad"); }
      matches = [];
      if (re) {
        for (let i = 0; i < lines.length; i++) { re.lastIndex = 0; if (re.test(lines[i])) matches.push(i); }
      } else for (let i = 0; i < lines.length; i++) matches.push(i);
      count.textContent = re ? `${matches.length} of ${lines.length} lines match` : `${lines.length} lines`;
      out.replaceChildren();
      shown = 0;
      if (re && !matches.length) out.append(el("div", { class: "fv-empty", text: "No lines match." }));
      renderMore();
      body.scrollTop = 0;
    }
    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(apply, 90); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { clearTimeout(timer); apply(); } });
    apply();
    return { nodes: [bar, body], cleanup: () => clearTimeout(timer) };
  },

  hex(f) {
    const bytes = toBytes(f.data);
    const magic = detectMagic(bytes);
    const first = Array.from(bytes.subarray(0, 8), hex2).join(" ");
    const info = el("div", { class: "fv-magic" },
      el("span", { class: "fv-magic-k", text: "Magic bytes" }),
      magic
        ? el("span", {}, el("code", { text: Array.from(bytes.subarray(0, magic.sig.length), hex2).join(" ") }), " → ", el("strong", { text: magic.name }))
        : el("span", {}, "No known signature", bytes.length ? el("span", { class: "fv-dim" }, " (starts with ", el("code", { text: first }), ")") : null));
    const body = el("div", { class: "fv-body" });
    const ROWS = 2048;
    let rowsShown = 0;

    function hexRow(off) {
      const slice = bytes.subarray(off, off + 16);
      const hexParts = [];
      for (let i = 0; i < 16; i++) hexParts.push(i < slice.length ? hex2(slice[i]) : "  ");
      const hexText = hexParts.slice(0, 8).join(" ") + "  " + hexParts.slice(8).join(" ");
      let hexNode;
      if (off === 0 && magic) {
        // Highlight the signature bytes in the first row.
        const n = magic.sig.length;
        const cut = n * 3 - 1 + (n > 8 ? 1 : 0);
        hexNode = el("span", { class: "fv-hx" }, el("mark", { class: "fv-sig", text: hexText.slice(0, cut) }), hexText.slice(cut));
      } else hexNode = el("span", { class: "fv-hx", text: hexText });
      return el("div", { class: "fv-hrow" },
        el("span", { class: "fv-off", text: off.toString(16).padStart(8, "0") }),
        hexNode,
        el("span", { class: "fv-asc", text: Array.from(slice, printable).join("") }));
    }
    function renderHex(reset) {
      if (reset) { body.replaceChildren(); rowsShown = 0; }
      body.querySelector(".fv-more")?.remove();
      const box = body.querySelector(".fv-hex") || body.appendChild(el("div", { class: "fv-hex" }));
      const total = Math.ceil(bytes.length / 16);
      const end = Math.min(total, rowsShown + ROWS);
      const frag = document.createDocumentFragment();
      for (let r = rowsShown; r < end; r++) frag.append(hexRow(r * 16));
      box.append(frag);
      rowsShown = end;
      if (!total) box.append(el("div", { class: "fv-empty", text: "(empty file)" }));
      if (rowsShown < total) body.append(el("button", { class: "fv-btn fv-more", type: "button", on: { click: () => renderHex(false) } }, `Show more (${fmtSize((total - rowsShown) * 16)} remaining)`));
    }
    function renderStrings() {
      body.replaceChildren();
      const found = findStrings(bytes, 4);
      const box = el("div", { class: "fv-strings" },
        el("div", { class: "fv-dim", text: `${found.length} printable string${found.length === 1 ? "" : "s"} of 4+ characters` }));
      for (const s of found.slice(0, 5000)) {
        box.append(el("div", { class: "fv-srow" }, el("span", { class: "fv-off", text: s.off.toString(16).padStart(8, "0") }), el("span", { class: "fv-str", text: s.text })));
      }
      body.append(box);
    }
    const bar = el("div", { class: "fv-bar" },
      segmented([["hex", "Hex"], ["strings", "Strings"]], "hex", (v) => (v === "hex" ? renderHex(true) : renderStrings())),
      el("span", { class: "fv-count", text: `${bytes.length} bytes` }));
    renderHex(true);
    return { nodes: [bar, info, body] };
  },

  image(f) {
    const src = el("canvas", { class: "fv-canvas" });
    const plane = el("canvas", { class: "fv-canvas" });
    const stage = el("div", { class: "fv-stage" }, src);
    const output = el("div", { class: "fv-lsb", hidden: true });
    const body = el("div", { class: "fv-body fv-imgbody" }, stage, output);
    let img = null;
    let mode = "orig";

    const chanSel = el("select", { class: "fv-select", "aria-label": "Channel" },
      ["R", "G", "B", "All"].map((c) => el("option", { value: c, text: c === "All" ? "All (RGB)" : c })));
    const bitSel = el("select", { class: "fv-select", "aria-label": "Bit" },
      [0, 1, 2, 3, 4, 5, 6, 7].map((b) => el("option", { value: String(b), text: `bit ${b}${b === 0 ? " (LSB)" : b === 7 ? " (MSB)" : ""}` })));
    const planeTools = el("span", { class: "fv-group", hidden: true }, chanSel, bitSel);
    const seg = segmented([["orig", "Original"], ["plane", "Bit plane"]], "orig", (v) => { mode = v; planeTools.hidden = v !== "plane"; draw(); });
    const lsbBtn = el("button", { class: "fv-btn", type: "button", on: { click: doLsb } }, "Extract LSB text");
    const dims = el("span", { class: "fv-count" });
    const bar = el("div", { class: "fv-bar" }, seg, planeTools, lsbBtn, dims);
    chanSel.addEventListener("change", draw);
    bitSel.addEventListener("change", draw);

    function scale(c) {
      const k = Math.max(1, Math.min(8, Math.floor(360 / Math.max(c.width, c.height, 1))));
      c.style.width = c.width * k + "px";
    }
    function load() {
      const d = f.data;
      try {
        if (typeof d === "function") {
          src.width = 256; src.height = 256;
          d(src);
        } else if (typeof ImageData !== "undefined" && d instanceof ImageData) {
          src.width = d.width; src.height = d.height;
          src.getContext("2d").putImageData(d, 0, 0);
        } else if (d instanceof HTMLCanvasElement || d instanceof HTMLImageElement) {
          src.width = d.width || d.naturalWidth; src.height = d.height || d.naturalHeight;
          src.getContext("2d").drawImage(d, 0, 0);
        } else if (typeof d === "string") {
          const im = new Image();
          im.onload = () => { src.width = im.naturalWidth; src.height = im.naturalHeight; src.getContext("2d").drawImage(im, 0, 0); ready(); };
          im.onerror = () => stage.replaceChildren(el("div", { class: "fv-empty", text: "Could not load image." }));
          im.src = d;
          return;
        }
        ready();
      } catch (e) {
        stage.replaceChildren(el("div", { class: "fv-empty", text: "Could not draw image: " + e.message }));
      }
    }
    function ready() {
      img = src.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, src.width, src.height);
      dims.textContent = `${src.width}×${src.height} px`;
      scale(src);
      draw();
    }
    function draw() {
      if (!img) return;
      if (mode === "orig") { stage.replaceChildren(src); return; }
      const ch = chanSel.value, bit = +bitSel.value;
      plane.width = img.width; plane.height = img.height;
      const out = new ImageData(img.width, img.height);
      const s = img.data, o = out.data;
      for (let p = 0; p < s.length; p += 4) {
        if (ch === "All") {
          o[p] = (s[p] >> bit) & 1 ? 255 : 0;
          o[p + 1] = (s[p + 1] >> bit) & 1 ? 255 : 0;
          o[p + 2] = (s[p + 2] >> bit) & 1 ? 255 : 0;
        } else {
          const v = (s[p + "RGB".indexOf(ch)] >> bit) & 1 ? 255 : 0;
          o[p] = o[p + 1] = o[p + 2] = v;
        }
        o[p + 3] = 255;
      }
      plane.getContext("2d").putImageData(out, 0, 0);
      scale(plane);
      stage.replaceChildren(plane, el("div", { class: "fv-cap", text: `${ch === "All" ? "R,G,B" : ch} bit ${bit}: white = 1, black = 0` }));
    }
    function doLsb() {
      if (!img) return;
      const bytes = extractLsb(img, 256);
      const text = Array.from(bytes, printable).join("");
      output.hidden = false;
      output.replaceChildren(
        el("div", { class: "fv-lsb-h" }, el("strong", { text: "LSB text" }),
          el("span", { class: "fv-dim", text: ` · R,G,B bit 0 in pixel order · ${bytes.length} byte${bytes.length === 1 ? "" : "s"} before NUL${bytes.length >= 256 ? " (stopped at 256)" : ""}` })),
        el("pre", { class: "fv-pre fv-wrap fv-lsb-text", text: text || "(nothing: the first byte was NUL)" }),
        el("div", { class: "fv-dim fv-lsb-hex", text: Array.from(bytes.subarray(0, 64), hex2).join(" ") + (bytes.length > 64 ? " …" : "") }));
    }
    load();
    return { nodes: [bar, body] };
  },

  email(f) {
    const raw = toText(f.data).replace(/\r\n?/g, "\n");
    const split = raw.search(/\n\n/);
    const headText = split >= 0 ? raw.slice(0, split) : raw;
    const bodyText = split >= 0 ? raw.slice(split + 2) : "";
    // Unfold headers: continuation lines start with whitespace.
    const headers = [];
    for (const line of headText.split("\n")) {
      if (/^[ \t]/.test(line) && headers.length) headers[headers.length - 1].raw += "\n" + line;
      else {
        const m = line.match(/^([!-9;-~]+):[ \t]?(.*)$/);
        headers.push(m ? { name: m[1], raw: m[2] } : { name: "", raw: line });
      }
    }
    headers.forEach((h) => { h.value = h.raw.replace(/\n[ \t]+/g, " ").trim(); });
    const KEY = new Set(["from", "to", "subject", "reply-to", "return-path", "date", "message-id", "x-originating-ip", "authentication-results", "received", "sender", "cc"]);

    // Auth results summary
    const ar = headers.filter((h) => /^authentication-results$/i.test(h.name)).map((h) => h.value).join(" ; ");
    const auth = el("div", { class: "fv-auth" }, el("span", { class: "fv-magic-k", text: "Auth results" }));
    if (!ar) auth.append(el("span", { class: "fv-dim", text: "No Authentication-Results header" }));
    else {
      for (const mech of ["spf", "dkim", "dmarc"]) {
        const m = ar.match(new RegExp(`\\b${mech}\\s*=\\s*([a-z]+)`, "i"));
        const res = m ? m[1].toLowerCase() : "absent";
        const tone = res === "pass" ? "ok" : /^(fail|softfail|permerror|temperror)$/.test(res) ? "bad" : "warn";
        auth.append(el("span", { class: "fv-chip", dataset: { tone } }, el("b", { text: mech.toUpperCase() }), " " + res));
      }
    }

    // Received chain (bottom = oldest hop first)
    const rec = headers.filter((h) => /^received$/i.test(h.name)).reverse();
    const chain = el("details", { class: "fv-chain", open: true },
      el("summary", {}, el("span", { class: "fv-magic-k", text: "Received chain" }), el("span", { class: "fv-dim", text: ` ${rec.length} hop${rec.length === 1 ? "" : "s"}, oldest first` })));
    const ol = el("ol", { class: "fv-hops" });
    rec.forEach((h) => {
      const v = h.value;
      const from = v.match(/\bfrom\s+(\S+)/i)?.[1];
      const ip = v.match(/\[(\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:]+:[0-9a-f:]*)\]/i)?.[1] || v.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/)?.[1];
      const by = v.match(/\bby\s+(\S+)/i)?.[1];
      const date = v.includes(";") ? v.slice(v.lastIndexOf(";") + 1).trim() : "";
      ol.append(el("li", { class: "fv-hop" },
        el("div", { class: "fv-hop-main" },
          el("span", { class: "fv-dim", text: "from " }), el("strong", { text: from || "?" }),
          ip ? el("code", { class: "fv-ip", text: ip }) : null,
          el("span", { class: "fv-dim", text: " → by " }), el("strong", { text: by || "?" })),
        date ? el("div", { class: "fv-dim fv-hop-date", text: date }) : null,
        el("div", { class: "fv-hop-raw", text: v })));
    });
    if (!rec.length) ol.append(el("li", { class: "fv-dim", text: "No Received headers." }));
    chain.append(ol);

    const hdrs = el("div", { class: "fv-hdrs" }, headers.map((h) => h.name
      ? el("div", { class: "fv-h", dataset: { key: KEY.has(h.name.toLowerCase()) ? "1" : "0" } },
        el("span", { class: "fv-hn", text: h.name + ":" }), " ", el("span", { class: "fv-hv", text: h.raw }))
      : el("div", { class: "fv-h", text: h.raw })));
    const bodyBox = el("div", { class: "fv-mailbody" },
      el("div", { class: "fv-sep", text: "Body" }),
      el("pre", { class: "fv-pre fv-wrap", text: bodyText || "(empty body)" }));
    return { nodes: [el("div", { class: "fv-body fv-mail" }, auth, chain, hdrs, bodyBox)] };
  },
};
