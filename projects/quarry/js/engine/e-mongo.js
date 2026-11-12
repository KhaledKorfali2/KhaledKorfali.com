// NoSQL course engine: a document store that speaks MongoDB's shell language.
// It is an emulator written for this course (no MongoDB runs in a browser): a
// parser for mongosh-style commands (never eval) and an evaluator for the query
// operators, update operators and aggregation stages the lessons teach.
import { canon } from "./common.js";
import { shopTables } from "../data/shop.js";

export const meta = { id: "mongo", name: "MongoDB", prompt: "shop> ", note: "mongosh-style shell · document store emulator", placeholder: 'db.products.find({ category: "Tents" })', sidebar: "shop", docs: true };
export const loadRuntime = async () => null;

/* ── parser ──────────────────────────────────────────────────────── */
function lex(src) {
  const t = [];
  let i = 0;
  const n = src.length;
  const valueNext = () => { const p = t[t.length - 1]; return !p || (p.t === "p" && "([{,:".includes(p.v)); };
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, s = "";
      while (j < n && src[j] !== c) { if (src[j] === "\\" && j + 1 < n) { s += src[j + 1] === "n" ? "\n" : src[j + 1]; j += 2; } else s += src[j++]; }
      if (j >= n) throw new Error("SyntaxError: unterminated string");
      t.push({ t: "s", v: s }); i = j + 1; continue;
    }
    if (c === "/" && valueNext()) {
      let j = i + 1, s = "";
      while (j < n && src[j] !== "/") { if (src[j] === "\\") s += src[j++]; s += src[j++]; }
      const fl = (src.slice(j + 1).match(/^[a-z]*/) || [""])[0];
      t.push({ t: "re", v: new RegExp(s, fl.replace(/[^imsu]/g, "")) }); i = j + 1 + fl.length; continue;
    }
    let m = src.slice(i).match(/^-?\d+(\.\d+)?([eE][-+]?\d+)?/);
    if (m && (c !== "-" || valueNext())) { t.push({ t: "n", v: Number(m[0]) }); i += m[0].length; continue; }
    m = src.slice(i).match(/^[A-Za-z_$][\w$]*/);
    if (m) { t.push({ t: "id", v: m[0] }); i += m[0].length; continue; }
    if ("(){}[],:.;".includes(c)) { t.push({ t: "p", v: c }); i++; continue; }
    throw new Error(`SyntaxError: unexpected character "${c}"`);
  }
  return t;
}
function parse(src) {
  const t = lex(src);
  let i = 0;
  const is = (v) => t[i] && t[i].t === "p" && t[i].v === v;
  const eat = (v) => { if (!is(v)) throw new Error(`SyntaxError: expected "${v}"${t[i] ? ` but found "${t[i].v}"` : " at the end of the command"}`); i++; };
  function value() {
    const k = t[i];
    if (!k) throw new Error("SyntaxError: the command ends too early (a missing value, } or ) ?)");
    if (k.t === "s" || k.t === "n" || k.t === "re") { i++; return k.v; }
    if (is("{")) {
      i++; const o = {};
      while (!is("}")) {
        const key = t[i];
        if (!key || !(key.t === "id" || key.t === "s" || key.t === "n")) throw new Error("SyntaxError: expected a field name");
        i++; eat(":"); o[String(key.v)] = value();
        if (is(",")) i++; else if (!is("}")) throw new Error('SyntaxError: expected "," or "}" in the object');
      }
      i++; return o;
    }
    if (is("[")) {
      i++; const a = [];
      while (!is("]")) { a.push(value()); if (is(",")) i++; else if (!is("]")) throw new Error('SyntaxError: expected "," or "]" in the array'); }
      i++; return a;
    }
    if (k.t === "id") {
      i++;
      if (k.v === "true") return true;
      if (k.v === "false") return false;
      if (k.v === "null" || k.v === "undefined") return null;
      if (k.v === "new") return value();
      if (/^(ISODate|Date|ObjectId|NumberInt|NumberLong|NumberDecimal)$/.test(k.v)) { eat("("); const v = is(")") ? null : value(); eat(")"); return /Number/.test(k.v) ? Number(v) : v; }
      throw new Error(`ReferenceError: ${k.v} is not defined (strings need quotes)`);
    }
    throw new Error(`SyntaxError: unexpected "${k.v}"`);
  }
  if (t[0] && t[0].t === "id" && t[0].v === "show") return { show: t[1] ? t[1].v : "" };
  if (!t[0] || t[0].v !== "db") throw new Error('SyntaxError: commands start with "db." (for example db.products.find()) or "show collections"');
  i = 1;
  const chain = [];
  while (is(".")) {
    i++;
    const name = t[i];
    if (!name || (name.t !== "id" && name.t !== "n")) throw new Error('SyntaxError: expected a name after "."');
    i++;
    let args = null;
    if (is("(")) { i++; args = []; while (!is(")")) { args.push(value()); if (is(",")) i++; else if (!is(")")) throw new Error('SyntaxError: expected "," or ")"'); } i++; }
    chain.push({ name: String(name.v), args });
  }
  if (is(";")) i++;
  if (i < t.length) throw new Error(`SyntaxError: unexpected "${t[i].v}"`);
  return { chain };
}
/** Split a script into commands: on ";" or on a new line that starts a new db./show command. */
function commands(src) {
  const out = [];
  let cur = "", depth = 0, q = null;
  const text = src.replace(/\r/g, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { cur += c; if (c === "\\") cur += text[++i] ?? ""; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; i--; continue; }
    if ("([{".includes(c)) depth++;
    if (")]}".includes(c)) depth--;
    if (depth === 0 && (c === ";" || (c === "\n" && /^\s*(db\b|show\b)/.test(text.slice(i + 1))))) { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* ── values, paths, matching ─────────────────────────────────────── */
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof RegExp);
const eq = (a, b) => canon(a) === canon(b);
const rank = (v) => (v === null || v === undefined ? 0 : typeof v === "number" ? 1 : typeof v === "string" ? 2 : isObj(v) ? 3 : Array.isArray(v) ? 4 : 5);
const order = (a, b) => (rank(a) !== rank(b) ? rank(a) - rank(b) : a < b ? -1 : a > b ? 1 : 0);

/** Every value a dotted path can reach; arrays along the way fan out (MongoDB semantics). */
function reach(doc, path) {
  let cur = [doc];
  for (const part of path.split(".")) {
    const next = [];
    for (const v of cur) {
      if (Array.isArray(v)) { if (/^\d+$/.test(part) && v[+part] !== undefined) next.push(v[+part]); for (const e of v) if (isObj(e) && part in e) next.push(e[part]); }
      else if (isObj(v) && part in v) next.push(v[part]);
    }
    cur = next;
  }
  return cur;
}
const withElements = (vals) => vals.flatMap((v) => (Array.isArray(v) ? [v, ...v] : [v]));
const isOps = (c) => isObj(c) && Object.keys(c).length > 0 && Object.keys(c).every((k) => k.startsWith("$"));

function testOp(op, arg, vals, all, cond) {
  const cmpAny = (fn) => all.some((v) => v !== null && rank(v) === rank(arg) && fn(order(v, arg)));
  switch (op) {
    case "$eq": return arg === null ? !vals.length || all.includes(null) : all.some((v) => eq(v, arg));
    case "$ne": return !testOp("$eq", arg, vals, all);
    case "$gt": return cmpAny((c) => c > 0);
    case "$gte": return cmpAny((c) => c >= 0);
    case "$lt": return cmpAny((c) => c < 0);
    case "$lte": return cmpAny((c) => c <= 0);
    case "$in": if (!Array.isArray(arg)) throw new Error("MongoServerError: $in needs an array"); return arg.some((a) => (a instanceof RegExp ? all.some((v) => typeof v === "string" && a.test(v)) : testOp("$eq", a, vals, all)));
    case "$nin": return !testOp("$in", arg, vals, all);
    case "$exists": return (vals.length > 0) === !!arg;
    case "$regex": { const re = arg instanceof RegExp ? arg : new RegExp(arg, cond.$options || ""); return all.some((v) => typeof v === "string" && re.test(v)); }
    case "$options": return true;
    case "$size": return vals.some((v) => Array.isArray(v) && v.length === arg);
    case "$all": return vals.some((v) => Array.isArray(v) && arg.every((a) => v.some((e) => eq(e, a))));
    case "$elemMatch": return vals.some((v) => Array.isArray(v) && v.some((e) => (isObj(e) && !isOps(arg) ? matches(e, arg) : matchValue(arg, [e]))));
    case "$not": return !matchValue(arg, vals);
  }
  throw new Error(`MongoServerError: unknown operator: ${op}`);
}
function matchValue(cond, vals) {
  const all = withElements(vals);
  if (cond instanceof RegExp) return all.some((v) => typeof v === "string" && cond.test(v));
  if (isOps(cond)) return Object.entries(cond).every(([op, arg]) => testOp(op, arg, vals, all, cond));
  return testOp("$eq", cond, vals, all);
}
function matches(doc, filter) {
  return Object.entries(filter || {}).every(([k, cond]) => {
    if (k === "$and") return cond.every((f) => matches(doc, f));
    if (k === "$or") return cond.some((f) => matches(doc, f));
    if (k === "$nor") return !cond.some((f) => matches(doc, f));
    if (k.startsWith("$")) throw new Error(`MongoServerError: unknown top level operator: ${k}`);
    return matchValue(cond, reach(doc, k));
  });
}
function setPath(doc, path, value, remove = false) {
  const parts = path.split(".");
  let cur = doc;
  for (const p of parts.slice(0, -1)) { if (!isObj(cur[p]) && !Array.isArray(cur[p])) { if (remove) return; cur[p] = {}; } cur = cur[p]; }
  if (remove) delete cur[parts[parts.length - 1]]; else cur[parts[parts.length - 1]] = value;
}
const getPath = (doc, path) => path.split(".").reduce((v, p) => (Array.isArray(v) ? (/^\d+$/.test(p) ? v[+p] : v.map((e) => (isObj(e) ? e[p] : undefined)).filter((x) => x !== undefined)) : isObj(v) ? v[p] : undefined), doc);
const sortDocs = (docs, spec) => docs.sort((a, b) => { for (const [k, dir] of Object.entries(spec)) { const c = order(getPath(a, k) ?? null, getPath(b, k) ?? null); if (c) return c * (dir < 0 ? -1 : 1); } return 0; });

/* ── aggregation expressions ─────────────────────────────────────── */
function expr(e, doc) {
  if (typeof e === "string" && e.startsWith("$")) { const v = getPath(doc, e.slice(1)); return v === undefined ? null : v; }
  if (Array.isArray(e)) return e.map((x) => expr(x, doc));
  if (!isObj(e)) return e;
  const keys = Object.keys(e);
  if (keys.length !== 1 || !keys[0].startsWith("$")) return Object.fromEntries(keys.map((k) => [k, expr(e[k], doc)]));
  const op = keys[0], raw = e[op], a = Array.isArray(raw) ? raw.map((x) => expr(x, doc)) : [expr(raw, doc)];
  const nums = a.flat().filter((x) => typeof x === "number");
  switch (op) {
    case "$literal": return raw;
    case "$add": return a.reduce((s, x) => s + (x ?? 0), 0);
    case "$subtract": return a[0] - a[1];
    case "$multiply": return a.reduce((s, x) => s * (x ?? 0), 1);
    case "$divide": return a[0] / a[1];
    case "$round": return Math.round(a[0] * 10 ** (a[1] || 0)) / 10 ** (a[1] || 0);
    case "$sum": return nums.reduce((s, x) => s + x, 0);
    case "$avg": return nums.length ? nums.reduce((s, x) => s + x, 0) / nums.length : null;
    case "$min": return nums.length ? Math.min(...nums) : null;
    case "$max": return nums.length ? Math.max(...nums) : null;
    case "$size": if (!Array.isArray(a[0])) throw new Error("MongoServerError: The argument to $size must be an array"); return a[0].length;
    case "$concat": return a.some((x) => x === null) ? null : a.join("");
    case "$toUpper": return String(a[0] ?? "").toUpperCase();
    case "$toLower": return String(a[0] ?? "").toLowerCase();
    case "$toString": return a[0] === null ? null : String(a[0]);
    case "$substr": case "$substrCP": return String(a[0] ?? "").substr(a[1], a[2] < 0 ? undefined : a[2]);
    case "$year": return a[0] ? Number(String(a[0]).slice(0, 4)) : null;
    case "$month": return a[0] ? Number(String(a[0]).slice(5, 7)) : null;
    case "$dateToString": { const d = String(expr(raw.date, doc) ?? ""); return d ? String(raw.format || "%Y-%m-%d").replace("%Y", d.slice(0, 4)).replace("%m", d.slice(5, 7)).replace("%d", d.slice(8, 10)) : null; }
    case "$ifNull": return a.find((x) => x !== null) ?? null;
    case "$cond": return isObj(raw) ? (expr(raw.if, doc) ? expr(raw.then, doc) : expr(raw.else, doc)) : (a[0] ? a[1] : a[2]);
    case "$eq": return eq(a[0], a[1]);
    case "$ne": return !eq(a[0], a[1]);
    case "$gt": return order(a[0], a[1]) > 0;
    case "$gte": return order(a[0], a[1]) >= 0;
    case "$lt": return order(a[0], a[1]) < 0;
    case "$lte": return order(a[0], a[1]) <= 0;
  }
  throw new Error(`MongoServerError: Unrecognized expression '${op}'`);
}
function includePath(src, dst, parts) {
  const [h, ...rest] = parts;
  if (!isObj(src) || !(h in src)) return;
  const v = src[h];
  if (!rest.length) dst[h] = clone(v);
  else if (Array.isArray(v)) { dst[h] = dst[h] || v.map(() => ({})); v.forEach((e, i) => { if (isObj(e)) includePath(e, dst[h][i], rest); }); }
  else if (isObj(v)) { dst[h] = dst[h] || {}; includePath(v, dst[h], rest); }
}
function project(doc, spec, strict = true) {
  const entries = Object.entries(spec), plain = (v) => v === 1 || v === 0 || v === true || v === false, on = (v) => v === 1 || v === true;
  // Inclusion mode if anything is switched on or computed; { _id: 0 } alone (or only zeros) is exclusion mode.
  if (!entries.some(([, v]) => !plain(v) || on(v))) { const out = clone(doc); for (const [k] of entries) setPath(out, k, null, true); return out; }
  const out = {};
  if (spec._id !== 0 && spec._id !== false && "_id" in doc) out._id = doc._id;
  for (const [k, v] of entries) {
    if (k === "_id" && plain(v)) continue;
    if (v === 0 || v === false) { if (strict) throw new Error("MongoServerError: Cannot do exclusion on a field in an inclusion projection"); continue; }
    if (on(v)) includePath(doc, out, k.split(".")); else setPath(out, k, expr(v, doc));
  }
  return out;
}
const ACC = {
  $sum: (xs) => xs.reduce((s, x) => s + (typeof x === "number" ? x : 0), 0),
  $avg: (xs) => { const n = xs.filter((x) => typeof x === "number"); return n.length ? n.reduce((s, x) => s + x, 0) / n.length : null; },
  $min: (xs) => xs.filter((x) => x !== null).sort(order)[0] ?? null,
  $max: (xs) => xs.filter((x) => x !== null).sort(order).pop() ?? null,
  $push: (xs) => xs, $addToSet: (xs) => xs.filter((x, i) => xs.findIndex((y) => eq(x, y)) === i),
  $first: (xs) => xs[0] ?? null, $last: (xs) => xs[xs.length - 1] ?? null, $count: (xs) => xs.length,
};
function aggregate(db, docs, pipeline) {
  if (!Array.isArray(pipeline)) throw new Error("MongoServerError: aggregate() takes an array of stages: [ { $match: … }, { $group: … } ]");
  let cur = docs.map(clone);
  for (const stage of pipeline) {
    const keys = Object.keys(stage || {});
    if (keys.length !== 1) throw new Error("MongoServerError: A pipeline stage specification object must contain exactly one field.");
    const op = keys[0], arg = stage[op];
    if (op === "$match") cur = cur.filter((d) => matches(d, arg));
    else if (op === "$sort") sortDocs(cur, arg);
    else if (op === "$limit") cur = cur.slice(0, arg);
    else if (op === "$skip") cur = cur.slice(arg);
    else if (op === "$count") cur = [{ [arg]: cur.length }];
    else if (op === "$project") cur = cur.map((d) => project(d, arg));
    else if (op === "$addFields" || op === "$set") cur = cur.map((d) => { const o = clone(d); for (const [k, v] of Object.entries(arg)) setPath(o, k, expr(v, d)); return o; });
    else if (op === "$unwind") {
      const path = (typeof arg === "string" ? arg : arg.path).replace(/^\$/, "");
      cur = cur.flatMap((d) => { const v = getPath(d, path); if (!Array.isArray(v)) return v === undefined || v === null ? [] : [d]; return v.map((e) => { const o = clone(d); setPath(o, path, clone(e)); return o; }); });
    } else if (op === "$lookup") {
      const other = db.get(arg.from) || [];
      cur = cur.map((d) => { const keys2 = withElements(reach(d, arg.localField)); return { ...d, [arg.as]: other.filter((o) => withElements(reach(o, arg.foreignField)).some((v) => keys2.some((k) => eq(k, v)))).map(clone) }; });
    } else if (op === "$group") {
      if (!("_id" in arg)) throw new Error("MongoServerError: a group specification must include an _id");
      const groups = new Map();
      for (const d of cur) { const id = expr(arg._id, d), key = canon(id); if (!groups.has(key)) groups.set(key, { id, docs: [] }); groups.get(key).docs.push(d); }
      cur = [...groups.values()].map((g) => {
        const out = { _id: g.id };
        for (const [field, spec] of Object.entries(arg)) {
          if (field === "_id") continue;
          const acc = Object.keys(spec || {})[0];
          if (!ACC[acc]) throw new Error(`MongoServerError: unknown group operator '${acc}'`);
          out[field] = ACC[acc](g.docs.map((d) => expr(spec[acc], d)));
        }
        return out;
      });
    } else throw new Error(`MongoServerError: Unrecognized pipeline stage name: '${op}'`);
  }
  return cur;
}

/* ── updates ─────────────────────────────────────────────────────── */
function applyUpdate(doc, upd) {
  if (!isObj(upd) || !Object.keys(upd).every((k) => k.startsWith("$"))) throw new Error("MongoInvalidArgumentError: Update document requires atomic operators (for example { $set: { … } })");
  const before = canon(doc);
  for (const [op, spec] of Object.entries(upd)) for (const [path, v] of Object.entries(spec)) {
    const cur = getPath(doc, path);
    if (op === "$set") setPath(doc, path, clone(v));
    else if (op === "$unset") setPath(doc, path, null, true);
    else if (op === "$inc") setPath(doc, path, (typeof cur === "number" ? cur : 0) + v);
    else if (op === "$mul") setPath(doc, path, (typeof cur === "number" ? cur : 0) * v);
    else if (op === "$push") { if (cur !== undefined && !Array.isArray(cur)) throw new Error(`MongoServerError: The field '${path}' must be an array`); setPath(doc, path, [...(cur || []), ...(isObj(v) && "$each" in v ? clone(v.$each) : [clone(v)])]); }
    else if (op === "$addToSet") setPath(doc, path, (cur || []).some((e) => eq(e, v)) ? cur : [...(cur || []), clone(v)]);
    else if (op === "$pull") setPath(doc, path, (cur || []).filter((e) => !(isObj(v) ? (isObj(e) && !isOps(v) ? matches(e, v) : matchValue(v, [e])) : eq(e, v))));
    else throw new Error(`MongoServerError: Unknown modifier: ${op}`);
  }
  return canon(doc) !== before;
}

/* ── the database ────────────────────────────────────────────────── */
function makeDb(collections) {
  const db = new Map(Object.entries(collections).map(([k, v]) => [k, v.map(clone)]));
  const indexes = new Map();
  let oid = 0x65f1a2b3;
  const idx = (name) => { if (!indexes.has(name)) indexes.set(name, [{ name: "_id_", key: { _id: 1 }, unique: true }]); return indexes.get(name); };
  const coll = (name) => { if (!db.has(name)) db.set(name, []); return db.get(name); };
  const dupe = (name, doc, self) => { for (const ix of idx(name)) if (ix.unique) { const f = Object.keys(ix.key); const clash = coll(name).find((d) => d !== self && f.every((k) => eq(getPath(d, k) ?? null, getPath(doc, k) ?? null))); if (clash) throw new Error(`MongoServerError: E11000 duplicate key error collection: shop.${name} index: ${ix.name} dup key: { ${f.map((k) => `${k}: ${JSON.stringify(getPath(doc, k) ?? null)}`).join(", ")} }`); } };
  function insert(name, doc) {
    if (!isObj(doc)) throw new Error("MongoInvalidArgumentError: a document must be an object: { field: value }");
    const d = clone(doc);
    if (!("_id" in d)) d._id = `ObjectId("${(oid++).toString(16)}${"a1b2c3d4e5f60718".slice(0, 16)}")`;
    dupe(name, d, null);
    coll(name).push(d);
    return d._id;
  }
  function explain(name, filter, n) {
    const docs = coll(name), fields = Object.keys(filter || {}).filter((k) => !k.startsWith("$"));
    const ix = idx(name).find((x) => fields.includes(Object.keys(x.key)[0]));
    if (!ix) return { queryPlanner: { namespace: `shop.${name}`, winningPlan: { stage: "COLLSCAN", direction: "forward" } }, executionStats: { nReturned: n, totalKeysExamined: 0, totalDocsExamined: docs.length } };
    const lead = Object.keys(ix.key)[0], examined = docs.filter((d) => matchValue(filter[lead], reach(d, lead))).length;
    return { queryPlanner: { namespace: `shop.${name}`, winningPlan: { stage: "FETCH", inputStage: { stage: "IXSCAN", indexName: ix.name, keyPattern: ix.key } } }, executionStats: { nReturned: n, totalKeysExamined: examined, totalDocsExamined: examined } };
  }
  function cursor(name, filter, proj) {
    const st = { sort: null, skip: 0, limit: 0 };
    const docs = () => { let r = coll(name).filter((d) => matches(d, filter)); if (st.sort) r = sortDocs(r.slice(), st.sort); r = r.slice(st.skip, st.limit ? st.skip + st.limit : undefined); return r.map((d) => (proj && Object.keys(proj).length ? project(d, proj) : clone(d))); };
    const c = { __cursor: true, docs,
      sort(s) { st.sort = s; return c; }, limit(n) { st.limit = n; return c; }, skip(n) { st.skip = n; return c; },
      pretty: () => c, toArray: () => c, count: () => docs().length, explain: () => explain(name, filter, docs().length) };
    return c;
  }
  const C = (name) => ({
    find: (f = {}, p) => cursor(name, f, p),
    findOne: (f = {}, p) => { const d = coll(name).find((x) => matches(x, f)); return d ? (p && Object.keys(p).length ? project(d, p) : clone(d)) : null; },
    countDocuments: (f = {}) => coll(name).filter((d) => matches(d, f)).length,
    estimatedDocumentCount: () => coll(name).length,
    distinct: (field, f = {}) => { const out = []; for (const d of coll(name).filter((x) => matches(x, f))) for (const v of withElements(reach(d, field)).filter((x) => !Array.isArray(x))) if (!out.some((o) => eq(o, v))) out.push(v); return out.sort(order); },
    insertOne: (doc) => ({ acknowledged: true, insertedId: insert(name, doc) }),
    insertMany: (docs) => { if (!Array.isArray(docs)) throw new Error("MongoInvalidArgumentError: insertMany() takes an array of documents"); const ids = docs.map((d) => insert(name, d)); return { acknowledged: true, insertedCount: ids.length, insertedIds: ids }; },
    updateOne: (f, u, o) => update(name, f, u, o, false), updateMany: (f, u, o) => update(name, f, u, o, true),
    deleteOne: (f = {}) => { const i = coll(name).findIndex((d) => matches(d, f)); if (i >= 0) coll(name).splice(i, 1); return { acknowledged: true, deletedCount: i >= 0 ? 1 : 0 }; },
    deleteMany: (f = {}) => { const keep = coll(name).filter((d) => !matches(d, f)), n = coll(name).length - keep.length; db.set(name, keep); return { acknowledged: true, deletedCount: n }; },
    aggregate: (p = []) => ({ __cursor: true, docs: () => aggregate(db, coll(name), p) }),
    createIndex: (key, o = {}) => { const nm = o.name || Object.entries(key).map(([k, v]) => `${k}_${v}`).join("_"); if (o.unique) { const seen = new Set(); for (const d of coll(name)) { const k = canon(Object.keys(key).map((f) => getPath(d, f) ?? null)); if (seen.has(k)) throw new Error(`MongoServerError: E11000 duplicate key error collection: shop.${name} index: ${nm}: existing documents already share a value`); seen.add(k); } } if (!idx(name).some((x) => x.name === nm)) idx(name).push({ name: nm, key, unique: !!o.unique }); return nm; },
    getIndexes: () => idx(name).map((x) => ({ v: 2, key: x.key, name: x.name, ...(x.unique && x.name !== "_id_" ? { unique: true } : {}) })),
    dropIndex: (nm) => { const l = idx(name), i = l.findIndex((x) => x.name === nm); if (i < 1) throw new Error(`MongoServerError: index not found with name [${nm}]`); l.splice(i, 1); return { ok: 1 }; },
    drop: () => { db.delete(name); indexes.delete(name); return true; },
  });
  function update(name, f, u, o = {}, many) {
    const hits = coll(name).filter((d) => matches(d, f)).slice(0, many ? undefined : 1);
    let modified = 0;
    for (const d of hits) { const copy = clone(d); if (applyUpdate(copy, u)) { dupe(name, copy, d); Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, copy); modified++; } }
    if (!hits.length && o && o.upsert) { const d = {}; for (const [k, v] of Object.entries(f || {})) if (!k.startsWith("$") && !isOps(v) && !(v instanceof RegExp)) setPath(d, k, clone(v)); applyUpdate(d, u); return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: insert(name, d) }; }
    return { acknowledged: true, matchedCount: hits.length, modifiedCount: modified, upsertedCount: 0 };
  }
  /** Evaluate one command → a plain value, or { __cursor, docs() }. */
  function evaluate(src) {
    const ast = parse(src);
    if (ast.show !== undefined) { if (/^(collections|tables)$/.test(ast.show)) return [...db.keys()].sort(); if (/^dbs|databases$/.test(ast.show)) return ["admin", "shop"]; throw new Error(`MongoshInvalidInputError: '${ast.show}' is not a valid argument for "show"`); }
    const [first, ...rest] = ast.chain;
    if (!first) return "shop";
    let v;
    if (first.args) {
      if (first.name === "getCollectionNames") v = [...db.keys()].sort();
      else if (first.name === "createCollection") { coll(first.args[0]); v = { ok: 1 }; }
      else if (first.name === "getName") v = "shop";
      else throw new Error(`TypeError: db.${first.name} is not a function`);
    } else {
      const api = C(first.name), call = rest.shift();
      if (!call) return `shop.${first.name}`;
      if (!call.args || typeof api[call.name] !== "function") throw new Error(`TypeError: db.${first.name}.${call.name} is not a function`);
      v = api[call.name](...call.args);
    }
    for (const step of rest) {
      if (step.args) { if (!v || typeof v[step.name] !== "function") throw new Error(`TypeError: ${step.name} is not a function here`); v = v[step.name](...step.args); }
      else { if (v && v.__cursor) v = v.docs(); v = v === null || v === undefined ? undefined : v[step.name]; if (v === undefined) v = null; }
    }
    return v;
  }
  return { db, evaluate, snapshot: () => Object.fromEntries([...db.entries()].map(([k, v]) => [k, v.map(clone)])), indexNames: (n) => idx(n).map((x) => x.name) };
}

/* ── shop data as documents ──────────────────────────────────────── */
export function shopDocs(seed) {
  const t = Object.fromEntries(shopTables(seed).map((x) => [x.name, x.rows]));
  const cats = t.categories.map((r) => r[0]);
  const products = t.products.map((r, i) => ({ _id: i + 1, name: r[0], category: cats[r[1] - 1], price: r[2], stock: r[3], discontinued: !!r[4],
    tags: [cats[r[1] - 1].toLowerCase(), ...(r[2] >= 150 ? ["premium"] : r[2] < 25 ? ["budget"] : []), ...(r[3] === 0 ? ["out-of-stock"] : []), ...(r[4] ? ["clearance"] : [])] }));
  const customers = t.customers.map((r, i) => ({ _id: i + 1, name: { first: r[0], last: r[1] }, email: r[2], ...(r[3] ? { phone: r[3] } : {}), address: { city: r[4], country: r[5] }, signup_date: r[6] }));
  const orders = t.orders.map((r, i) => ({ _id: i + 1, customer_id: r[0], order_date: r[1], status: r[2], ...(r[3] ? { shipped_date: r[3] } : {}),
    items: t.order_items.filter((it) => it[0] === i + 1).map((it) => ({ product_id: it[1], name: products[it[1] - 1].name, quantity: it[2], unit_price: it[3] })) }));
  return { customers, products, orders };
}

/* ── output formatting (mongosh style) ───────────────────────────── */
export function show(v, indent = 0) {
  const pad = "  ".repeat(indent);
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return /^ObjectId\(/.test(v) ? v : `'${v.replace(/'/g, "\\'")}'`;
  if (typeof v !== "object") return String(Math.round(v * 1e6) / 1e6 === v || typeof v !== "number" ? v : Math.round(v * 1e6) / 1e6);
  if (Array.isArray(v)) { if (!v.length) return "[]"; const flat = v.every((x) => x === null || typeof x !== "object"); return flat ? `[ ${v.map((x) => show(x)).join(", ")} ]` : `[\n${v.map((x) => `${pad}  ${show(x, indent + 1)}`).join(",\n")}\n${pad}]`; }
  const keys = Object.keys(v);
  if (!keys.length) return "{}";
  const one = `{ ${keys.map((k) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`}: ${show(v[k], indent + 1)}`).join(", ")} }`;
  if (one.length + pad.length <= 96 && !one.includes("\n")) return one;
  return `{\n${keys.map((k) => `${pad}  ${/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`}: ${show(v[k], indent + 1)}`).join(",\n")}\n${pad}}`;
}

/** Compare two document lists the way the SQL engines compare result sets. */
export function compareDocs(got, exp, ordered) {
  if (!got) return { ok: false, msg: "Run a find() or aggregate() that returns the documents the objective asks for." };
  if (got.length !== exp.length) return { ok: false, msg: `Not there yet: the target has ${exp.length} document${exp.length === 1 ? "" : "s"}; yours has ${got.length}.` };
  const a = got.map(canon), b = exp.map(canon);
  if (ordered && a.every((k, i) => k === b[i])) return { ok: true };
  const sa = a.slice().sort(), sb = b.slice().sort(), same = sa.every((k, i) => k === sb[i]);
  if (same) return ordered ? { ok: false, msg: "Right documents, wrong order. Check your sort." } : { ok: true };
  const fields = (l) => [...new Set(l.flatMap((d) => (isObj(d) ? Object.keys(d) : ["(value)"])))].sort().join(", ");
  if (fields(got) !== fields(exp)) return { ok: false, msg: `Right number of documents, but the fields differ. Target fields: ${fields(exp)}. Yours: ${fields(got)}.` };
  return { ok: false, msg: "Right shape, but some values differ from the target. Re-read the conditions in the objective." };
}

export async function open({ seed, challenge: c, ctx }) {
  const base = shopDocs(seed);
  const session = makeDb(base);
  for (const cmd of c.setup ? c.setup(ctx) : []) session.evaluate(cmd);
  const pristine = session.snapshot();
  const value = (s, src) => { const v = s.evaluate(src); return v && v.__cursor ? v.docs() : v; };

  function run(text) {
    const out = [];
    for (const stmt of commands(text)) {
      try {
        const v = session.evaluate(stmt);
        if (v && v.__cursor) { const docs = v.docs(); out.push({ kind: "docs", stmt, docs, text: docs.length ? docs.slice(0, 40).map((d) => show(d)).join("\n") + (docs.length > 40 ? `\n… ${docs.length - 40} more (${docs.length} in total). Add .limit() or a tighter filter.` : "") : "(no documents)", checkable: true }); }
        else out.push({ kind: "docs", stmt, docs: Array.isArray(v) ? v : [v], text: show(v), checkable: Array.isArray(v) || typeof v !== "object" || v === null ? /\.(distinct|countDocuments|count|findOne)\s*\(/.test(stmt) : /\.findOne\s*\(/.test(stmt) });
      } catch (e) { out.push({ kind: "error", stmt, message: String(e.message || e) }); break; }
    }
    return out;
  }
  return {
    run,
    tables: () => [...session.db.keys()].sort().map((name) => {
      const docs = session.db.get(name), sample = docs[0] || {};
      return { name, note: String(docs.length), preview: `db.${name}.find().limit(3)`,
        cols: [...Object.keys(sample).map((k) => ({ name: k, type: Array.isArray(sample[k]) ? "array" : sample[k] === null ? "null" : isObj(sample[k]) ? "object" : typeof sample[k] })),
          ...session.indexNames(name).filter((n) => n !== "_id_").map((n) => ({ name: n, type: "index" }))] };
    }),
    expected(solution) { const s = makeDb(pristine); let last = null; for (const cmd of commands(solution)) last = value(s, cmd); return { docs: Array.isArray(last) ? last : [last] }; },
    compare: (mine, exp, ordered) => compareDocs(mine.docs, exp.docs, ordered),
    shape: (exp) => `${exp.docs.length} document${exp.docs.length === 1 ? "" : "s"}`,
    resolve: (checks) => checks.map((k) => ("expect" in k ? { ...k, is: value(makeDb(pristine), k.expect) } : k)),
    check(k) { try { return canon(value(session, k.js)) === canon(k.is); } catch { return false; } },
    close() {},
  };
}
