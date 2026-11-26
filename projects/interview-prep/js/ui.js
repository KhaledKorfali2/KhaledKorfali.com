// Small view helpers shared by every screen.
import { settings, setSetting } from "./store.js";

export function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const svg = (body, vb = "0 0 20 20") => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const st = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
export const ICON = {
  practice: svg(`<path d="M4 15l4-5 3 3 5-7" ${st}/><circle cx="16" cy="6" r="1.4" fill="currentColor"/>`),
  patterns: svg(`<rect x="3" y="3" width="6" height="6" rx="1.5" ${st}/><rect x="11" y="3" width="6" height="6" rx="1.5" ${st}/><rect x="3" y="11" width="6" height="6" rx="1.5" ${st}/><rect x="11" y="11" width="6" height="6" rx="1.5" ${st}/>`),
  problems: svg(`<path d="M7 5h10M7 10h10M7 15h10" ${st}/><circle cx="3.5" cy="5" r="1" fill="currentColor"/><circle cx="3.5" cy="10" r="1" fill="currentColor"/><circle cx="3.5" cy="15" r="1" fill="currentColor"/>`),
  progress: svg(`<path d="M4 16V9M10 16V4M16 16v-5" ${st} stroke-width="2.2"/>`),
  check: svg(`<path d="M4.5 10.5l3.5 3.5 7.5-8" ${st} stroke-width="2.4"/>`),
  x: svg(`<path d="M5.5 5.5l9 9M14.5 5.5l-9 9" ${st} stroke-width="2.4"/>`),
  close: svg(`<path d="M5.5 5.5l9 9M14.5 5.5l-9 9" ${st}/>`),
  back: svg(`<path d="M12 4.5L6.5 10l5.5 5.5" ${st}/>`),
  arrow: svg(`<path d="M4 10h12M11 5l5 5-5 5" ${st}/>`),
  external: svg(`<path d="M8 4H5a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1v-3M11 4h5v5M16 4l-7 7" ${st}/>`),
  search: svg(`<circle cx="9" cy="9" r="5.5" ${st}/><path d="M13.2 13.2L17 17" ${st}/>`),
  bolt: svg(`<path d="M11 2L4 11h5l-1 7 7-9h-5z" ${st}/>`),
  target: svg(`<circle cx="10" cy="10" r="7" ${st}/><circle cx="10" cy="10" r="3.5" ${st}/><circle cx="10" cy="10" r="0.8" fill="currentColor"/>`),
  repeat: svg(`<path d="M4 9a6 6 0 0110.5-4M16 11a6 6 0 01-10.5 4" ${st}/><path d="M14.5 2v3h-3M5.5 18v-3h3" ${st}/>`),
  flame: svg(`<path d="M10 2.5c.5 3 4 4.5 4 8.5a4 4 0 01-8 0c0-1.7.8-2.8 1.8-3.6.2 1.4.9 2.1 1.7 2.1C9 7.5 9 5 10 2.5z" ${st}/>`),
  copy: svg(`<rect x="7" y="7" width="9" height="9" rx="1.5" ${st}/><path d="M4 13V5a1 1 0 011-1h8" ${st}/>`),
  play: svg(`<path d="M6 4.5v11l9-5.5z" fill="currentColor"/>`),
  eye: svg(`<path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" ${st}/><circle cx="10" cy="10" r="2.3" ${st}/>`),
  skip: svg(`<path d="M5 5l6 5-6 5zM14 5v10" ${st}/>`),
  today: svg(`<rect x="3" y="4.5" width="14" height="12.5" rx="2" ${st}/><path d="M3 8.5h14M7 2.5v3.5M13 2.5v3.5" ${st}/><path d="M7.2 12.6l2 2 3.8-4" ${st}/>`),
  book: svg(`<path d="M10 5.2C8.4 4 6.2 3.6 3.5 3.8v11.4c2.7-.2 4.9.2 6.5 1.4 1.6-1.2 3.8-1.6 6.5-1.4V3.8C13.8 3.6 11.6 4 10 5.2zM10 5.2v11.4" ${st}/>`),
  timer: svg(`<circle cx="10" cy="11" r="6.2" ${st}/><path d="M10 7.5V11l2.3 1.6M8 2.5h4" ${st}/>`),
  note: svg(`<path d="M5 3h7l4 4v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" ${st}/><path d="M12 3v4h4M7 11h6M7 14h4" ${st}/>`),
  pause: svg(`<path d="M7 5v10M13 5v10" ${st} stroke-width="2.2"/>`),
  lock: svg(`<rect x="4.5" y="9" width="11" height="8" rx="1.8" ${st}/><path d="M7 9V6.5a3 3 0 016 0V9" ${st}/>`),
  bulb: svg(`<path d="M7.5 14.5h5M8.5 17h3M10 2.8a5 5 0 00-3 9c.5.4.8 1 .8 1.6h4.4c0-.6.3-1.2.8-1.6a5 5 0 00-3-9z" ${st}/>`),
  alert: svg(`<path d="M10 3.2l7.2 12.6H2.8L10 3.2z" ${st}/><path d="M10 8.5v3.4" ${st}/><circle cx="10" cy="13.9" r=".9" fill="currentColor"/>`),
};

export const difficultyTag = (d) => `<span class="tag tag-${esc(d.toLowerCase())}">${esc(d)}</span>`;

export function ring(fraction, color) {
  const p = Math.round(Math.max(0, Math.min(1, fraction || 0)) * 100);
  return `<span class="ring" style="--p:${p}${color ? `;--ring-c:${color}` : ""}" aria-hidden="true"></span>`;
}

export const pct = (x) => (x == null ? "—" : Math.round(x * 100) + "%");

// 754 -> "12:34"; over an hour -> "1:02:34".
export function clock(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(s).padStart(2, "0");
}
export const minutes = (sec) => Math.round(sec / 60);

// Day number (store.today()) -> "Nov 26".
export function dayLabel(day, opts = { month: "short", day: "numeric" }) {
  return new Date(day * 86400000).toLocaleDateString(undefined, { timeZone: "UTC", ...opts });
}
// Relative wording for a due day: "today", "tomorrow", "in 6 days", "3 days overdue".
export function dueLabel(due, today) {
  const d = due - today;
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d > 1) return `in ${d} days`;
  return `${-d} day${d === -1 ? "" : "s"} overdue`;
}

// One chip style for a problem's study-plan status, everywhere it is listed.
const CHIP_LABEL = { new: "Not started", attempted: "Attempted", due: "Due", mastered: "Mastered" };
export const statusChip = (st) => `<span class="st st-${st}">${CHIP_LABEL[st]}</span>`;

// Markdown subset for primers: paragraphs, "- " lists, **bold**, `code`.
export function md(text) {
  const inline = (t) => esc(t)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return text.trim().split(/\n\s*\n/).map((block) => {
    const lines = block.split("\n").map((l) => l.trim());
    if (lines.every((l) => l.startsWith("- "))) return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join("")}</ul>`;
    return `<p>${inline(lines.join(" "))}</p>`;
  }).join("");
}

/* ── Syntax highlighting (enough for short Python / JS templates) ── */
const KW = {
  python: "def return if elif else for while in not and or is None True False class import from as with lambda yield break continue pass global nonlocal try except finally raise del",
  javascript: "function return if else for while of in let const var new class this null undefined true false break continue typeof instanceof try catch finally throw do switch case default",
};
const BUILTINS = "len range min max sorted enumerate zip set dict list tuple int str float abs sum map filter reversed any all print heapq deque defaultdict Counter Math Map Set Array Number String Infinity push pop shift unshift has get add delete fill sort length heappush heappop heapify append popleft appendleft".split(" ");

export function highlight(code, lang = "python") {
  const kw = new Set(KW[lang].split(" "));
  const bi = new Set(BUILTINS);
  const comment = lang === "python" ? "#" : "//";
  const re = new RegExp(
    `(${comment === "#" ? "#[^\\n]*" : "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/"})|("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\`\\\\])*\`)|\\b(\\d+(?:\\.\\d+)?)\\b|\\b([A-Za-z_$][\\w$]*)\\b`,
    "g");
  let out = "", last = 0, m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    const [tok, c, s, n, w] = m;
    if (c) out += `<span class="tok-c">${esc(c)}</span>`;
    else if (s) out += `<span class="tok-s">${esc(s)}</span>`;
    else if (n) out += `<span class="tok-n">${esc(n)}</span>`;
    else if (kw.has(w)) out += `<span class="tok-k">${esc(w)}</span>`;
    else if (bi.has(w)) out += `<span class="tok-f">${esc(w)}</span>`;
    else out += esc(tok);
    last = re.lastIndex;
  }
  return out + esc(code.slice(last));
}

// A template block with a language switch and copy button. Wire with wireCode().
export function codeBlock(tpl) {
  const lang = settings().lang;
  return `<div class="code" data-code="${esc(tpl.id)}">
    <div class="code-head">
      <span class="code-name">${esc(tpl.name)}</span>
      <span class="btn-row" style="gap:4px">
        <span class="segmented" role="group" aria-label="Language">
          <button type="button" data-lang="python" aria-pressed="${lang === "python"}">Python</button>
          <button type="button" data-lang="javascript" aria-pressed="${lang === "javascript"}">JS</button>
        </span>
        <button type="button" class="icon-btn" data-copy aria-label="Copy code" title="Copy">${ICON.copy}</button>
      </span>
    </div>
    <pre tabindex="0"><code>${highlight(tpl[lang] || tpl.python, lang)}</code></pre>
  </div>`;
}

export function wireCode(root, templates) {
  root.querySelectorAll("[data-code]").forEach((block) => {
    const tpl = templates.get(block.dataset.code);
    if (!tpl) return;
    block.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => {
      setSetting("lang", b.dataset.lang);
      // Keep every code block on the page in sync.
      root.querySelectorAll("[data-code]").forEach((other) => {
        const t = templates.get(other.dataset.code);
        if (!t) return;
        other.querySelector("code").innerHTML = highlight(t[b.dataset.lang] || t.python, b.dataset.lang);
        other.querySelectorAll("[data-lang]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.lang === b.dataset.lang)));
      });
    }));
    block.querySelector("[data-copy]").addEventListener("click", async () => {
      const lang = settings().lang;
      try { await navigator.clipboard.writeText(tpl[lang] || tpl.python); toast("Copied to clipboard"); }
      catch { toast("Couldn't access the clipboard"); }
    });
  });
}

let toastTimer;
export function toast(text) {
  const el = document.querySelector(".toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// Promise-based confirm in a styled <dialog>.
export function confirmDialog({ title, body, confirm = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "sheet";
    d.innerHTML = `<div class="sheet-head"><h2>${esc(title)}</h2></div>
      <div class="sheet-body"><p class="muted">${esc(body)}</p></div>
      <div class="sheet-foot"><button type="button" class="btn" value="no">Cancel</button>
      <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" value="yes">${esc(confirm)}</button></div>`;
    document.body.appendChild(d);
    const done = (v) => { d.close(); d.remove(); resolve(v); };
    d.addEventListener("click", (e) => {
      if (e.target === d) return done(false); // backdrop
      const v = e.target.closest("button")?.value;
      if (v) done(v === "yes");
    });
    d.addEventListener("cancel", (e) => { e.preventDefault(); done(false); });
    d.showModal();
    d.querySelector('[value="no"]').focus();
  });
}

export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
