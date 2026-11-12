// Shared by every engine: statement splitting and result comparison.
export { normCell, compareResult } from "./mysql.js";

/**
 * Split a script into statements on semicolons, respecting quotes and comments.
 * hash: treat # as a comment (MySQL). dollar: PostgreSQL $tag$ … $tag$ strings.
 */
export function splitSql(src, { hash = false, dollar = false, backtick = false } = {}) {
  const out = [];
  let cur = "", i = 0;
  const n = src.length, quotes = backtick ? "'\"`" : "'\"";
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (quotes.includes(c)) {
      let j = i + 1;
      while (j < n) { if (src[j] === c) { if (src[j + 1] === c) { j += 2; continue; } break; } j++; }
      cur += src.slice(i, j + 1); i = j + 1; continue;
    }
    if (dollar && c === "$") {
      const m = src.slice(i).match(/^\$[A-Za-z_]*\$/);
      if (m) { const end = src.indexOf(m[0], i + m[0].length); const j = end < 0 ? n : end + m[0].length; cur += src.slice(i, j); i = j; continue; }
    }
    if ((c === "-" && d === "-") || (hash && c === "#")) { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { const j = src.indexOf("*/", i + 2); i = j < 0 ? n : j + 2; cur += " "; continue; }
    if (c === ";") { if (cur.trim()) out.push(cur.trim()); cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Canonical JSON (sorted keys) for comparing documents and nested values. */
export function canon(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return String(Math.round(v * 100) / 100);
  if (typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
}
