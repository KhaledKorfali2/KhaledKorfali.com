// SQL workspace: a read-only query console over small in-memory tables.
// Supports a practical subset of SELECT (joins, WHERE, GROUP BY, aggregates,
// ORDER BY, LIMIT). Anything that would change data is refused, like a
// least-privilege analyst role. Results are rendered as text only.
import { el } from "../ui.js";

/* ── lexer ───────────────────────────────────────────────────────── */
function lex(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (src.startsWith("--", i)) { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "'") {
      let j = i + 1, s = "";
      for (;;) {
        if (j >= src.length) throw new Error("unterminated quoted string");
        if (src[j] === "'") { if (src[j + 1] === "'") { s += "'"; j += 2; continue; } break; }
        s += src[j++];
      }
      toks.push({ t: "str", v: s }); i = j + 1; continue;
    }
    if (c === '"') {
      const j = src.indexOf('"', i + 1);
      if (j < 0) throw new Error("unterminated quoted identifier");
      toks.push({ t: "id", v: src.slice(i + 1, j), quoted: true }); i = j + 1; continue;
    }
    let m = src.slice(i).match(/^\d+(\.\d+)?/);
    if (m) { toks.push({ t: "num", v: Number(m[0]) }); i += m[0].length; continue; }
    m = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (m) { toks.push({ t: "id", v: m[0] }); i += m[0].length; continue; }
    m = src.slice(i).match(/^(<>|!=|<=|>=|\|\||[=<>(),.*+\-/;%])/);
    if (m) { toks.push({ t: "op", v: m[0] }); i += m[0].length; continue; }
    throw new Error(`syntax error at or near "${c}"`);
  }
  return toks;
}

const AGG = new Set(["count", "sum", "avg", "min", "max"]);
const FUNCS = {
  upper: (a) => (a == null ? null : String(a).toUpperCase()),
  lower: (a) => (a == null ? null : String(a).toLowerCase()),
  length: (a) => (a == null ? null : String(a).length),
  abs: (a) => (a == null ? null : Math.abs(a)),
  round: (a, n = 0) => (a == null ? null : Math.round(a * 10 ** n) / 10 ** n),
  coalesce: (...a) => a.find((x) => x != null) ?? null,
};
const RESERVED = new Set(["from", "where", "group", "order", "having", "limit", "join", "inner", "left", "on", "and", "or", "not", "as", "asc", "desc", "by", "like", "ilike", "in", "is", "between", "offset"]);

/* ── parser → AST ────────────────────────────────────────────────── */
function parse(src) {
  const toks = lex(src);
  let i = 0;
  const peek = () => toks[i];
  const kw = (w) => toks[i] && toks[i].t === "id" && !toks[i].quoted && toks[i].v.toLowerCase() === w;
  const op = (o) => toks[i] && toks[i].t === "op" && toks[i].v === o;
  const near = () => (toks[i] ? `at or near "${toks[i].v}"` : "at end of input");
  const eat = (w) => { if (!kw(w)) throw new Error(`syntax error ${near()} (expected ${w.toUpperCase()})`); i++; };
  const eatOp = (o) => { if (!op(o)) throw new Error(`syntax error ${near()} (expected "${o}")`); i++; };

  if (!toks.length) throw new Error("empty query");
  if (!kw("select")) {
    const w = toks[0].t === "id" ? toks[0].v.toUpperCase() : toks[0].v;
    if (/^(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY)$/.test(w)) throw new Error(`permission denied: role "analyst" is read-only (${w} is not allowed, only SELECT)`);
    throw new Error(`syntax error ${near()} (queries start with SELECT)`);
  }
  i++;
  const q = { distinct: false, items: [], from: null, joins: [], where: null, group: [], having: null, order: [], limit: null };
  if (kw("distinct")) { q.distinct = true; i++; }
  do {
    if (op("*")) { i++; q.items.push({ star: true }); continue; }
    if (peek()?.t === "id" && toks[i + 1]?.v === "." && toks[i + 2]?.v === "*") { q.items.push({ star: true, table: toks[i].v.toLowerCase() }); i += 3; continue; }
    const expr = orExpr();
    let alias = null;
    if (kw("as")) { i++; alias = ident(); }
    else if (peek()?.t === "id" && (peek().quoted || !RESERVED.has(peek().v.toLowerCase()))) alias = ident();
    q.items.push({ expr, alias });
  } while (op(",") && ++i);
  eat("from");
  q.from = tableRef();
  for (;;) {
    let left = false;
    if (kw("inner")) i++;
    else if (kw("left")) { left = true; i++; if (kw("outer")) i++; }
    if (!kw("join")) { if (left) throw new Error(`syntax error ${near()} (expected JOIN)`); break; }
    i++;
    const ref = tableRef();
    eat("on");
    q.joins.push({ ...ref, left, on: orExpr() });
  }
  if (kw("where")) { i++; q.where = orExpr(); }
  if (kw("group")) { i++; eat("by"); do q.group.push(orExpr()); while (op(",") && ++i); }
  if (kw("having")) { i++; q.having = orExpr(); }
  if (kw("order")) {
    i++; eat("by");
    do {
      const expr = orExpr();
      let desc = false;
      if (kw("desc")) { desc = true; i++; } else if (kw("asc")) i++;
      q.order.push({ expr, desc });
    } while (op(",") && ++i);
  }
  if (kw("limit")) { i++; if (peek()?.t !== "num") throw new Error("LIMIT needs a number"); q.limit = toks[i++].v; }
  if (op(";")) i++;
  if (i < toks.length) throw new Error(`syntax error ${near()}`);
  return q;

  function ident() {
    const t = toks[i];
    if (!t || t.t !== "id") throw new Error(`syntax error ${near()} (expected a name)`);
    i++;
    return t.v.toLowerCase();
  }
  function tableRef() {
    const name = ident();
    let alias = name;
    if (kw("as")) { i++; alias = ident(); }
    else if (peek()?.t === "id" && !RESERVED.has(peek().v.toLowerCase())) alias = ident();
    return { name, alias };
  }
  function orExpr() {
    let a = andExpr();
    while (kw("or")) { i++; a = { k: "or", a, b: andExpr() }; }
    return a;
  }
  function andExpr() {
    let a = notExpr();
    while (kw("and")) { i++; a = { k: "and", a, b: notExpr() }; }
    return a;
  }
  function notExpr() {
    if (kw("not")) { i++; return { k: "not", a: notExpr() }; }
    return cmpExpr();
  }
  function cmpExpr() {
    const a = addExpr();
    if (peek()?.t === "op" && ["=", "<>", "!=", "<", ">", "<=", ">="].includes(peek().v)) {
      const o = toks[i++].v;
      return { k: "cmp", o: o === "<>" ? "!=" : o, a, b: addExpr() };
    }
    if (kw("is")) {
      i++;
      let neg = false;
      if (kw("not")) { neg = true; i++; }
      eat("null");
      return { k: "isnull", a, neg };
    }
    let neg = false;
    if (kw("not") && toks[i + 1]?.t === "id" && ["like", "ilike", "in", "between"].includes(toks[i + 1].v.toLowerCase())) { neg = true; i++; }
    if (kw("like") || kw("ilike")) {
      const ci = toks[i++].v.toLowerCase() === "ilike";
      return wrap({ k: "like", a, b: addExpr(), ci });
    }
    if (kw("in")) {
      i++; eatOp("(");
      const list = [];
      do list.push(orExpr()); while (op(",") && ++i);
      eatOp(")");
      return wrap({ k: "in", a, list });
    }
    if (kw("between")) {
      i++;
      const lo = addExpr(); eat("and"); const hi = addExpr();
      return wrap({ k: "and", a: { k: "cmp", o: ">=", a, b: lo }, b: { k: "cmp", o: "<=", a, b: hi } });
    }
    return a;
    function wrap(n) { return neg ? { k: "not", a: n } : n; }
  }
  function addExpr() {
    let a = mulExpr();
    while (op("+") || op("-") || op("||")) { const o = toks[i++].v; a = { k: "bin", o, a, b: mulExpr() }; }
    return a;
  }
  function mulExpr() {
    let a = unary();
    while (op("*") || op("/") || op("%")) { const o = toks[i++].v; a = { k: "bin", o, a, b: unary() }; }
    return a;
  }
  function unary() {
    if (op("-")) { i++; return { k: "bin", o: "-", a: { k: "lit", v: 0 }, b: unary() }; }
    return primary();
  }
  function primary() {
    const t = toks[i];
    if (!t) throw new Error("syntax error at end of input");
    if (t.t === "num" || t.t === "str") { i++; return { k: "lit", v: t.v }; }
    if (op("(")) { i++; const e = orExpr(); eatOp(")"); return e; }
    if (t.t === "id") {
      const low = t.v.toLowerCase();
      if (!t.quoted && low === "null") { i++; return { k: "lit", v: null }; }
      if (!t.quoted && (low === "true" || low === "false")) { i++; return { k: "lit", v: low === "true" }; }
      if (toks[i + 1]?.t === "op" && toks[i + 1].v === "(") {
        i += 2;
        if (AGG.has(low)) {
          let arg = null, distinct = false;
          if (op("*")) { if (low !== "count") throw new Error(`${low}(*) is not valid`); i++; }
          else { if (kw("distinct")) { distinct = true; i++; } arg = orExpr(); }
          eatOp(")");
          return { k: "agg", f: low, arg, distinct };
        }
        if (!FUNCS[low]) throw new Error(`function ${low}() does not exist`);
        const args = [];
        if (!op(")")) do args.push(orExpr()); while (op(",") && ++i);
        eatOp(")");
        return { k: "fn", f: low, args };
      }
      i++;
      if (op(".")) { i++; return { k: "col", table: low, name: ident() }; }
      return { k: "col", name: low };
    }
    throw new Error(`syntax error ${near()}`);
  }
}

/* ── evaluation ──────────────────────────────────────────────────── */
const AMBIG = Symbol("ambiguous");
const hasAgg = (n) => !!n && typeof n === "object" && (n.k === "agg" || Object.values(n).some((v) => (Array.isArray(v) ? v.some(hasAgg) : hasAgg(v))));
const truthy = (v) => v === true;

function cmp(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" || typeof b === "boolean") return Number(a) - Number(b);
  const na = Number(a), nb = Number(b);
  if (typeof a !== typeof b && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
function likeRe(pat, ci) {
  const body = String(pat).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, "[\\s\\S]*").replace(/_/g, "[\\s\\S]");
  return new RegExp(`^${body}$`, ci ? "i" : "");
}
function ev(n, row, group) {
  switch (n.k) {
    case "lit": return n.v;
    case "col": {
      const key = n.table ? `${n.table}.${n.name}` : n.name;
      if (!(key in row.v)) {
        if (n.table && !row.tables.has(n.table)) throw new Error(`missing FROM-clause entry for table "${n.table}"`);
        throw new Error(`column "${key}" does not exist`);
      }
      if (row.v[key] === AMBIG) throw new Error(`column reference "${n.name}" is ambiguous (prefix it with a table name)`);
      return row.v[key];
    }
    case "and": { const a = ev(n.a, row, group); if (a === false) return false; const b = ev(n.b, row, group); return b === false ? false : a == null || b == null ? null : true; }
    case "or": { const a = ev(n.a, row, group); if (a === true) return true; const b = ev(n.b, row, group); return b === true ? true : a == null || b == null ? null : false; }
    case "not": { const a = ev(n.a, row, group); return a == null ? null : !a; }
    case "cmp": {
      const a = ev(n.a, row, group), b = ev(n.b, row, group);
      if (a == null || b == null) return null;
      const c = cmp(a, b);
      return { "=": c === 0, "!=": c !== 0, "<": c < 0, ">": c > 0, "<=": c <= 0, ">=": c >= 0 }[n.o];
    }
    case "isnull": { const a = ev(n.a, row, group); return n.neg ? a != null : a == null; }
    case "like": { const a = ev(n.a, row, group), b = ev(n.b, row, group); return a == null || b == null ? null : likeRe(b, n.ci).test(String(a)); }
    case "in": { const a = ev(n.a, row, group); if (a == null) return null; return n.list.some((x) => { const v = ev(x, row, group); return v != null && cmp(a, v) === 0; }); }
    case "bin": {
      const a = ev(n.a, row, group), b = ev(n.b, row, group);
      if (a == null || b == null) return null;
      if (n.o === "||") return String(a) + String(b);
      if (typeof a !== "number" || typeof b !== "number") throw new Error(`operator ${n.o} needs numbers`);
      if ((n.o === "/" || n.o === "%") && b === 0) throw new Error("division by zero");
      return n.o === "+" ? a + b : n.o === "-" ? a - b : n.o === "*" ? a * b : n.o === "/" ? (Number.isInteger(a) && Number.isInteger(b) ? Math.trunc(a / b) : a / b) : a % b;
    }
    case "fn": return FUNCS[n.f](...n.args.map((x) => ev(x, row, group)));
    case "agg": {
      if (!group) throw new Error(`aggregate ${n.f}() is not allowed here`);
      if (!n.arg) return group.length;
      let vals = group.map((r) => ev(n.arg, r, null)).filter((v) => v != null);
      if (n.distinct) vals = [...new Map(vals.map((v) => [typeof v + v, v])).values()];
      if (n.f === "count") return vals.length;
      if (!vals.length) return null;
      if (n.f === "sum") return vals.reduce((a, b) => a + b, 0);
      if (n.f === "avg") return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
      return vals.reduce((a, b) => ((n.f === "min" ? cmp(b, a) < 0 : cmp(b, a) > 0) ? b : a));
    }
    default: throw new Error("unsupported expression");
  }
}

/** Run one SELECT against `tables` ([{ name, cols: [[name, type]…], rows }]). Returns { cols, rows }. */
export function runQuery(src, tables) {
  const q = parse(String(src || ""));
  const find = (name) => {
    const t = tables.find((x) => x.name.toLowerCase() === name);
    if (!t) throw new Error(`relation "${name}" does not exist`);
    return t;
  };
  const refs = [q.from, ...q.joins].map((r) => ({ ...r, table: find(r.name) }));
  const aliases = new Set();
  for (const r of refs) { if (aliases.has(r.alias)) throw new Error(`table name "${r.alias}" specified more than once`); aliases.add(r.alias); }

  const bind = (base, ref, vals) => {
    const v = { ...base };
    ref.table.cols.forEach(([c], k) => {
      const val = vals ? vals[k] ?? null : null;
      v[`${ref.alias}.${c}`] = val;
      v[c] = c in base ? AMBIG : val;
    });
    return v;
  };
  let rows = refs[0].table.rows.map((r) => bind({}, refs[0], r));
  refs.slice(1).forEach((ref) => {
    const out = [];
    const known = new Set([...aliases]);
    for (const base of rows) {
      let hit = false;
      for (const r of ref.table.rows) {
        const v = bind(base, ref, r);
        if (truthy(ev(ref.on, { v, tables: known }, null))) { out.push(v); hit = true; }
      }
      if (!hit && ref.left) out.push(bind(base, ref, null));
    }
    rows = out;
  });
  let ctxs = rows.map((v) => ({ v, tables: aliases }));
  const emptyRow = () => ({ v: refs.reduce((b, r) => bind(b, r, null), {}), tables: aliases });
  if (q.where) {
    if (hasAgg(q.where)) throw new Error("aggregate functions are not allowed in WHERE (use HAVING)");
    ctxs = ctxs.filter((r) => truthy(ev(q.where, r, null)));
  }

  // Expand * into concrete columns.
  const items = [];
  for (const it of q.items) {
    if (!it.star) { items.push(it); continue; }
    const targets = it.table ? refs.filter((r) => r.alias === it.table) : refs;
    if (!targets.length) throw new Error(`missing FROM-clause entry for table "${it.table}"`);
    for (const r of targets) for (const [c] of r.table.cols) items.push({ expr: { k: "col", table: r.alias, name: c }, alias: c });
  }
  const cols = items.map((it) => it.alias || (it.expr.k === "col" ? it.expr.name : it.expr.k === "agg" || it.expr.k === "fn" ? it.expr.f : "?column?"));

  const grouped = q.group.length > 0 || items.some((it) => hasAgg(it.expr)) || hasAgg(q.having) || q.order.some((o) => hasAgg(o.expr));
  let units; // { row, group }
  if (grouped) {
    const map = new Map();
    if (!q.group.length) map.set("", ctxs.slice());
    else for (const r of ctxs) {
      const key = JSON.stringify(q.group.map((g) => ev(g, r, null)));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    units = [...map.values()].map((g) => ({ row: g[0] || emptyRow(), group: g }));
    if (q.having) units = units.filter((u) => truthy(ev(q.having, u.row, u.group)));
  } else {
    if (q.having) throw new Error("HAVING needs GROUP BY or an aggregate");
    units = ctxs.map((r) => ({ row: r, group: null }));
  }
  let out = units.map((u) => ({ u, vals: items.map((it) => ev(it.expr, u.row, u.group)) }));
  if (q.distinct) { const seen = new Set(); out = out.filter((o) => { const k = JSON.stringify(o.vals); if (seen.has(k)) return false; seen.add(k); return true; }); }
  if (q.order.length) {
    const keyFns = q.order.map((o) => {
      if (o.expr.k === "lit" && Number.isInteger(o.expr.v)) {
        if (o.expr.v < 1 || o.expr.v > cols.length) throw new Error(`ORDER BY position ${o.expr.v} is not in select list`);
        return (x) => x.vals[o.expr.v - 1];
      }
      if (o.expr.k === "col" && !o.expr.table && items.some((it) => it.alias === o.expr.name)) { const k = items.findIndex((it) => it.alias === o.expr.name); return (x) => x.vals[k]; }
      return (x) => ev(o.expr, x.u.row, x.u.group);
    });
    const keyed = out.map((x) => ({ x, keys: keyFns.map((f) => f(x)) }));
    keyed.sort((a, b) => {
      for (let k = 0; k < keyFns.length; k++) {
        const va = a.keys[k], vb = b.keys[k];
        let c = va == null && vb == null ? 0 : va == null ? 1 : vb == null ? -1 : cmp(va, vb);
        if (q.order[k].desc) c = -c;
        if (c) return c;
      }
      return 0;
    });
    out = keyed.map((k) => k.x);
  }
  if (q.limit != null) out = out.slice(0, q.limit);
  return { cols, rows: out.map((o) => o.vals) };
}

/* ── mount ───────────────────────────────────────────────────────── */
export function mount(host, env, api = {}) {
  const tables = (env && env.tables) || [];
  const editor = el("textarea", {
    class: "sq-editor", spellcheck: "false", autocapitalize: "off", autocomplete: "off", rows: "4",
    "aria-label": "SQL query", placeholder: "SELECT * FROM … WHERE … ;", value: env?.query || "",
  });
  const status = el("div", { class: "sq-status", "aria-live": "polite", text: "Write a query and press Run (Ctrl+Enter)." });
  const result = el("div", { class: "sq-result" });
  const runBtn = el("button", { class: "sq-btn sq-primary", type: "button", on: { click: run } }, "Run");

  const schema = el("div", { class: "sq-schema", "aria-label": "Schema" },
    el("div", { class: "sq-h", text: "Tables" }),
    tables.map((t) => el("details", { class: "sq-table", open: tables.length <= 3 },
      el("summary", {}, el("b", { text: t.name }), el("span", { class: "sq-dim", text: ` ${t.rows.length} rows` })),
      el("ul", {}, t.cols.map(([c, type]) => el("li", {}, el("span", { text: c }), el("span", { class: "sq-dim", text: type || "" })))),
      el("button", { class: "sq-btn sq-mini", type: "button", on: { click: () => { editor.value = `SELECT * FROM ${t.name} LIMIT 10;`; run(); } } }, "Preview"))));

  function cell(v) {
    if (v == null) return el("td", { class: "sq-null", text: "NULL" });
    return el("td", { class: typeof v === "number" ? "sq-num" : "", text: typeof v === "boolean" ? (v ? "t" : "f") : String(v) });
  }
  function run() {
    status.dataset.tone = "";
    let r;
    try { r = runQuery(editor.value, tables); }
    catch (e) {
      status.dataset.tone = "bad";
      status.textContent = "ERROR:  " + e.message;
      result.replaceChildren();
      return;
    }
    const MAX = 300;
    const table = el("table", { class: "sq-grid" },
      el("thead", {}, el("tr", {}, r.cols.map((c) => el("th", { text: c })))),
      el("tbody", {}, r.rows.slice(0, MAX).map((row) => el("tr", {}, row.map(cell)))));
    result.replaceChildren(table);
    status.textContent = `(${r.rows.length} row${r.rows.length === 1 ? "" : "s"})${r.rows.length > MAX ? ` · showing the first ${MAX}; add a WHERE or LIMIT to narrow it` : ""}`;
  }
  editor.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); } });

  const root = el("div", { class: "sq" }, schema,
    el("div", { class: "sq-main" },
      el("div", { class: "sq-top" }, editor, el("div", { class: "sq-bar" }, runBtn, el("span", { class: "sq-dim", text: "Read-only role · SELECT only" }))),
      status, result));
  host.append(root);
  if (env?.query) run();
  root._sql = { run: (s) => { editor.value = s; run(); return status.textContent; } };
  return () => root.remove();
}
