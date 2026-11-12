// DOM helpers. Everything is built with nodes and textContent: learner input is
// never parsed as HTML in this document.

/**
 * el("div", { class: "x", text: "hi", on: { click }, dataset: { id: 1 }, style: { color: "red" }, "aria-label": "…" }, ...children)
 * Children: nodes, strings (as text), arrays, null/false (skipped).
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k === "value") node.value = v;
    else if (k === "checked" || k === "disabled" || k === "hidden" || k === "selected") node[k] = !!v;
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  append(node, children);
  return node;
}
function append(node, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(node, c);
    else node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Small inline SVG icon from path data (24×24 viewBox, stroked). */
export function icon(d, size = 16) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size); svg.setAttribute("height", size);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "ico");
  for (const part of [].concat(d)) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", part);
    svg.append(p);
  }
  return svg;
}
export const ICONS = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  lock: ["M6 11h12v9H6z", "M8.5 11V8a3.5 3.5 0 017 0v3"],
  flag: ["M5 21V4", "M5 4h11l-2 4 2 4H5"],
  bulb: ["M9 18h6", "M10 21h4", "M12 3a6 6 0 00-3.5 10.9V16h7v-2.1A6 6 0 0012 3z"],
  back: "M15 5l-7 7 7 7",
  next: "M9 5l7 7-7 7",
  tool: ["M14.5 6.5a4 4 0 00-5.6 5L3 17.4 6.6 21l5.9-5.9a4 4 0 005-5.6l-2.5 2.5-2.5-.6-.6-2.5z"],
  term: ["M4 5h16v14H4z", "M7.5 9.5l3 2.5-3 2.5", "M12.5 15h4"],
  globe: ["M12 3a9 9 0 100 18 9 9 0 000-18z", "M3 12h18", "M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"],
  file: ["M7 3h7l5 5v13H7z", "M14 3v5h5"],
  wave: ["M3 12h3l3-7 4 14 3-7h5"],
  chip: ["M7 7h10v10H7z", "M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"],
  shield: ["M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"],
  x: "M6 6l12 12M18 6L6 18",
  copy: ["M9 9h10v11H9z", "M5 15V4h10"],
  refresh: ["M20 11a8 8 0 10-2.3 5.7", "M20 4v7h-7"],
  db: ["M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z", "M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6", "M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"],
  code: ["M8 7l-5 5 5 5", "M16 7l5 5-5 5", "M13.5 4l-3 16"],
  map: ["M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z", "M9 4v14M15 6v14"],
};

/* ── Markdown-lite → DOM (authored lesson text; still built as nodes) ── */
export function md(src) {
  const frag = document.createDocumentFragment();
  const lines = String(src || "").replace(/\r/g, "").split("\n");
  let i = 0;
  const para = [];
  const flush = () => { if (para.length) { frag.append(el("p", {}, inline(para.join(" ")))); para.length = 0; } };
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      const lang = line.slice(3).trim();
      const body = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      frag.append(el("pre", { class: "code", dataset: lang ? { lang } : {} }, el("code", { text: body.join("\n") })));
      continue;
    }
    if (/^#{2,4} /.test(line)) { flush(); frag.append(el("h4", {}, inline(line.replace(/^#+ /, "")))); i++; continue; }
    if (/^> /.test(line)) {
      flush();
      const body = [];
      while (i < lines.length && /^> ?/.test(lines[i])) body.push(lines[i++].replace(/^> ?/, ""));
      frag.append(el("div", { class: "callout" }, inline(body.join(" "))));
      continue;
    }
    if (/^\s*([-*]|\d+\.) /.test(line)) {
      flush();
      const ordered = /^\s*\d+\./.test(line);
      const list = el(ordered ? "ol" : "ul");
      while (i < lines.length && /^\s*([-*]|\d+\.) /.test(lines[i])) {
        list.append(el("li", {}, inline(lines[i].replace(/^\s*([-*]|\d+\.) /, ""))));
        i++;
      }
      frag.append(list);
      continue;
    }
    if (/^\|.*\|\s*$/.test(line)) {
      flush();
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const table = el("table", { class: "md-table" });
      const body = rows.filter((r) => !/^\|[\s:|-]+\|$/.test(r.trim()));
      body.forEach((r, n) => {
        const tr = el("tr", {}, cells(r).map((c) => el(n === 0 ? "th" : "td", {}, inline(c))));
        table.append(tr);
      });
      frag.append(el("div", { class: "table-wrap" }, table));
      continue;
    }
    if (!line.trim()) { flush(); i++; continue; }
    para.push(line.trim());
    i++;
  }
  flush();
  return frag;
}

// **bold**, *em*, `code`, [text](url)
function inline(text) {
  const frag = document.createDocumentFragment();
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    const t = m[0];
    if (m[1]) frag.append(el("code", { text: t.slice(1, -1) }));
    else if (m[2]) frag.append(el("strong", {}, inline(t.slice(2, -2))));
    else if (m[3]) frag.append(el("em", {}, inline(t.slice(1, -1))));
    else {
      const [, label, href] = t.match(/\[([^\]]+)\]\(([^)]+)\)/);
      const safe = /^(https?:|#|\/)/.test(href) ? href : "#";
      frag.append(el("a", { href: safe, text: label, ...(safe.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {}) }));
    }
    last = m.index + t.length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}

let toastTimer;
export function toast(msg, tone = "") {
  const t = document.querySelector(".toast");
  if (!t) return;
  t.textContent = msg;
  t.dataset.tone = tone;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

export async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("Copied"); }
  catch { toast("Couldn't copy: select and copy manually"); }
}

/** Escape text for HTML strings that go into the sandbox (never into this document). */
export const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
