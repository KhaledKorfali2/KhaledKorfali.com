// PostgreSQL course engine: real PostgreSQL 17 compiled to WebAssembly (PGlite),
// with the pgvector extension available. Adds psql's backslash commands and
// formats values the way psql prints them. Also used by the vector course.
import { splitSql, normCell, canon } from "./common.js";
import { shopTables, insertsFor, POSTGRES_SCHEMA } from "../data/shop.js";
import { embedInSql } from "../data/vectors.js";

export const meta = { id: "postgres", name: "PostgreSQL", prompt: "shop=# ", note: "psql · PostgreSQL 17 · real server (PGlite)", placeholder: "SELECT … ;   or a psql command such as \\dt", sidebar: "shop" };

let libPromise = null;
export function loadRuntime() {
  if (!libPromise) libPromise = Promise.all([import("../../vendor/pglite/dist/index.js"), import("../../vendor/pglite/dist/vector/index.js")]).then(([a, b]) => ({ PGlite: a.PGlite, vector: b.vector }));
  libPromise.catch(() => { libPromise = null; });   // so Try again really retries
  return libPromise;
}

// Keep dates and times as the text PostgreSQL sends, instead of JavaScript Date objects.
const TEXT = (s) => s;
const PARSERS = { 1082: TEXT, 1083: TEXT, 1114: TEXT, 1184: TEXT, 1186: TEXT };
const NUMERIC = new Set([20, 21, 23, 700, 701, 1700, 26]);
const pgArray = (a) => `{${a.map((v) => (v === null ? "NULL" : Array.isArray(v) ? pgArray(v) : typeof v === "string" && /[\s,{}"]|^$/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : String(v))).join(",")}}`;
const show = (v) => (v === null || v === undefined ? null : typeof v === "boolean" ? (v ? "t" : "f") : typeof v === "bigint" ? Number(v) : Array.isArray(v) ? pgArray(v) : typeof v === "object" ? JSON.stringify(v) : v);
const cmp = (v, oid) => (v === null || v === undefined ? null : typeof v === "bigint" ? Number(v) : NUMERIC.has(oid) && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : typeof v === "boolean" ? String(v) : typeof v === "object" ? canon(v) : v);
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

const META = {
  "\\dt": () => [`SELECT schemaname AS "Schema", tablename AS "Name", 'table' AS "Type", tableowner AS "Owner" FROM pg_tables WHERE schemaname = 'public' ORDER BY 2`],
  "\\dv": () => [`SELECT schemaname AS "Schema", viewname AS "Name", 'view' AS "Type" FROM pg_views WHERE schemaname = 'public' ORDER BY 2`],
  "\\dm": () => [`SELECT schemaname AS "Schema", matviewname AS "Name", 'materialized view' AS "Type" FROM pg_matviews WHERE schemaname = 'public' ORDER BY 2`],
  "\\di": () => [`SELECT indexname AS "Name", tablename AS "Table", indexdef AS "Definition" FROM pg_indexes WHERE schemaname = 'public' ORDER BY 2, 1`],
  "\\du": () => [`SELECT rolname AS "Role name", concat_ws(', ', CASE WHEN rolsuper THEN 'Superuser' END, CASE WHEN rolcreatedb THEN 'Create DB' END, CASE WHEN NOT rolcanlogin THEN 'Cannot login' END) AS "Attributes" FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY 1`],
  "\\dx": () => [`SELECT extname AS "Name", extversion AS "Version" FROM pg_extension ORDER BY 1`],
  "\\l": () => [`SELECT datname AS "Name", pg_get_userbyid(datdba) AS "Owner" FROM pg_database WHERE NOT datistemplate ORDER BY 1`],
  "\\d": (t) => (t ? [
    `SELECT a.attname AS "Column", format_type(a.atttypid, a.atttypmod) AS "Type", CASE WHEN a.attnotnull THEN 'not null' ELSE '' END AS "Nullable", coalesce(pg_get_expr(d.adbin, d.adrelid), CASE WHEN a.attidentity <> '' THEN 'generated as identity' END, '') AS "Default" FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum WHERE a.attrelid = ${lit("public." + t)}::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`,
    `SELECT indexname AS "Index", indexdef AS "Definition" FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${lit(t)} ORDER BY 1`,
    `SELECT conname AS "Constraint", pg_get_constraintdef(oid) AS "Definition" FROM pg_constraint WHERE conrelid = ${lit("public." + t)}::regclass AND contype IN ('c', 'f') ORDER BY 1`,
  ] : [`SELECT n.nspname AS "Schema", c.relname AS "Name", CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' WHEN 'S' THEN 'sequence' END AS "Type" FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm') ORDER BY 2`]),
};
const HELP = "\\dt          list tables\n\\d [name]    describe a table, or list relations\n\\di          list indexes\n\\dv  \\dm     list views / materialized views\n\\du          list roles\n\\dx          list installed extensions\n\\l           list databases";

export async function open({ seed, challenge: c, ctx }, lib) {
  const { PGlite, vector } = lib || await loadRuntime();
  const db = new PGlite({ extensions: { vector } });
  await db.waitReady;
  await db.exec("SET enable_seqscan = on");   // PGlite ships with it off; use PostgreSQL's normal planner defaults
  for (const s of [...POSTGRES_SCHEMA, ...insertsFor(shopTables(seed), { bool: ["discontinued"] }), ...(c.setup ? c.setup(ctx) : [])]) await db.exec(embedInSql(s));

  const stats = { begins: 0, commits: 0, rollbacks: 0, open: 0 };
  let inTx = false, aborted = false, wrote = false, lastTables = [];
  const query = (sql) => db.query(embedInSql(sql), [], { rowMode: "array", parsers: PARSERS });
  const scalar = async (sql) => { const r = await query(sql); return r.rows.length ? cmp(r.rows[0][0], r.fields[0].dataTypeID) : null; };

  function tag(stmt, r) {
    const w = stmt.trim().split(/\s+/).map((x) => x.toUpperCase().replace(/;$/, ""));
    if (w[0] === "INSERT") return `INSERT 0 ${r.affectedRows ?? 0}`;
    if (w[0] === "UPDATE" || w[0] === "DELETE" || w[0] === "MERGE") return `${w[0]} ${r.affectedRows ?? 0}`;
    if (/^(CREATE|DROP|ALTER)$/.test(w[0])) return `${w[0]} ${w[1] === "OR" ? w[3] : w[1] === "UNIQUE" || w[1] === "MATERIALIZED" || w[1] === "TEMP" || w[1] === "TEMPORARY" ? `${w[1] === "UNIQUE" ? "" : w[1] + " "}${w[2]}`.trim() : w[1]}`;
    if (w[0] === "START" || w[0] === "BEGIN") return "BEGIN";
    if (w[0] === "END") return "COMMIT";
    if (w[0] === "REFRESH") return "REFRESH MATERIALIZED VIEW";
    return w[0];
  }
  function result(stmt, r) {
    if (!r.fields.length) return { kind: "ok", message: tag(stmt, r) };
    const oids = r.fields.map((f) => f.dataTypeID), columns = r.fields.map((f) => f.name);
    if (columns.length === 1 && columns[0] === "QUERY PLAN") return { kind: "text", text: r.rows.map((row) => row[0]).join("\n") };
    return { kind: "rows", columns, rows: r.rows.map((row) => row.map(show)), cmp: r.rows.map((row) => row.map((v, i) => cmp(v, oids[i]))), checkable: true };
  }
  async function one(stmt) {
    if (stmt.startsWith("\\")) {
      const [cmd, arg] = stmt.replace(/;$/, "").trim().split(/\s+/);
      if (cmd === "\\?" || cmd === "\\h") return [{ kind: "text", text: HELP }];
      if (cmd === "\\q") return [{ kind: "ok", message: "(this console stays connected; just keep typing)" }];
      if (!META[cmd]) return [{ kind: "error", message: `invalid command ${cmd}\nTry \\? for help.` }];
      try {
        const out = [];
        for (const sql of META[cmd](arg)) { const r = result(sql, await query(sql)); if (r.kind === "rows" && (r.rows.length || !out.length)) out.push({ ...r, checkable: false }); }
        if (arg && out[0] && !out[0].rows.length) return [{ kind: "error", message: `Did not find any relation named "${arg}".` }];
        return out;
      } catch (e) { return [{ kind: "error", message: /does not exist/.test(e.message) ? `Did not find any relation named "${arg}".` : `ERROR:  ${e.message}` }]; }
    }
    const head = (stmt.match(/^\s*(\w+)/) || ["", ""])[1].toUpperCase();
    try {
      const r = await query(stmt);
      if (head === "BEGIN" || head === "START") { if (!inTx) { inTx = true; aborted = false; wrote = false; stats.begins++; stats.open = 1; } }
      else if (head === "COMMIT" || head === "END" || (head === "ROLLBACK" && !/\bTO\b/i.test(stmt)) || head === "ABORT") {
        const rolled = head === "ROLLBACK" || head === "ABORT" || aborted;
        if (inTx && wrote) stats[rolled ? "rollbacks" : "commits"]++;
        inTx = false; stats.open = 0;
        if (aborted && (head === "COMMIT" || head === "END")) { aborted = false; return [{ kind: "ok", message: "ROLLBACK   (the transaction had failed, so COMMIT rolled it back)" }]; }
        aborted = false;
      } else if (inTx && /^(INSERT|UPDATE|DELETE|MERGE|TRUNCATE)$/.test(head)) wrote = true;
      return [result(stmt, r)];
    } catch (e) {
      if (inTx) aborted = true;
      return [{ kind: "error", message: `ERROR:  ${e.message}${e.detail ? `\nDETAIL:  ${e.detail}` : ""}${e.hint ? `\nHINT:  ${e.hint}` : ""}` }];
    }
  }
  /** psql commands end at the line break; SQL ends at the semicolon. */
  function statements(text) {
    const out = [];
    let sql = "";
    for (const line of text.split("\n")) {
      if (!sql.trim() && line.trim().startsWith("\\")) out.push(line.trim());
      else sql += line + "\n";
    }
    return [...out, ...splitSql(sql, { dollar: true })];
  }
  async function run(text) {
    const out = [];
    for (const stmt of statements(text)) {
      const rs = await one(stmt);
      rs.forEach((r, i) => { r.stmt = i ? "" : stmt; out.push(r); });
      if (rs.some((r) => r.kind === "error")) break;
    }
    return out;
  }
  // Checks run where they can't leave a trace: in a savepoint if the learner has a transaction open, else in their own.
  async function probe(fn) {
    if (inTx && aborted) return false;
    await db.exec(inTx ? "SAVEPOINT _chk" : "BEGIN");
    try { return await fn(); } catch { return false; }
    finally { await db.exec(inTx ? "ROLLBACK TO _chk; RELEASE _chk" : "ROLLBACK"); }
  }
  const plan = async (stmt) => { try { return (await query(`EXPLAIN ${stmt.replace(/;\s*$/, "")}`)).rows.map((r) => r[0]).join("\n"); } catch { return ""; } };

  return {
    run, plan,
    async tables() {
      if (inTx && aborted) return lastTables;
      try {
        const rels = (await query(`SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm') ORDER BY 1`)).rows;
        const cols = (await query(`SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod), coalesce(i.indisprimary, false) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary AND a.attnum = ANY (i.indkey) WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm') AND a.attnum > 0 AND NOT a.attisdropped ORDER BY c.relname, a.attnum`)).rows;
        const out = [];
        for (const [name, kind] of rels) {
          const n = (await query(`SELECT count(*)::int FROM public."${name}"`)).rows[0][0];
          out.push({ name, note: kind === "r" ? String(n) : kind === "v" ? "view" : "mat. view", preview: `SELECT *\nFROM ${name}\nLIMIT 10;`,
            cols: cols.filter((r) => r[0] === name).map((r) => ({ name: r[1], type: `${String(r[2]).replace("character varying", "varchar").replace("timestamp without time zone", "timestamp")}${r[3] ? " · pk" : ""}` })) });
        }
        lastTables = out;
      } catch { /* keep the last good listing */ }
      return lastTables;
    },
    expected: async (solution) => (await run(solution)).filter((r) => r.kind === "rows").pop(),
    async resolve(checks) {
      const out = [];
      for (const k of checks) out.push("expect" in k ? { ...k, is: await probe(() => scalar(k.expect)) } : k);
      return out;
    },
    async check(k) {
      if (k.stat) { const v = stats[k.stat]; return v >= (k.min ?? -Infinity) && v <= (k.max ?? Infinity); }
      return probe(async () => {
        for (const s of k.pre || []) await db.exec(embedInSql(s));
        if (k.plan) { const p = await plan(k.plan); return new RegExp(k.uses, "i").test(p) && !(k.avoids && new RegExp(k.avoids, "i").test(p)); }
        if (k.rejects) { try { await db.exec("SAVEPOINT _rej"); await db.exec(embedInSql(k.rejects)); return false; } catch (e) { return /^(23|22)/.test(String(e.code || "")) || /permission denied/.test(e.message); } }
        if (k.sql) return normCell(await scalar(k.sql)) === normCell(k.is);
        return true;
      });
    },
    close: () => { db.close().catch(() => {}); },
  };
}
