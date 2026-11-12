// SQLite course engine: the real thing (sql.js), with no dialect layer. Adds the
// sqlite3 shell's most useful dot-commands so the console behaves like the CLI.
import { splitSql, normCell } from "./common.js";
import { shopTables, insertsFor, SQLITE_SCHEMA } from "../data/shop.js";

export const meta = { id: "sqlite", name: "SQLite", prompt: "sqlite> ", note: "sqlite3 · shop.db · real SQLite", placeholder: "SELECT … ;   or a dot-command such as .tables", sidebar: "shop.db" };

let sqlPromise = null;
export function loadRuntime() {
  if (!sqlPromise) sqlPromise = window.initSqlJs({ locateFile: (f) => `vendor/${f}` });
  return sqlPromise;
}

function raw(db, sql) {
  const st = db.prepare(sql);
  try { const columns = st.getColumnNames(), rows = []; while (st.step()) rows.push(st.get()); return { columns, rows }; }
  finally { st.free(); }
}

export async function open({ seed, challenge: c, ctx }, SQL) {
  SQL = SQL || await loadRuntime();
  const db = new SQL.Database();
  const q = (sql) => raw(db, sql);
  const scalar = (sql) => { const r = q(sql); return r.rows.length ? r.rows[0][0] : null; };
  for (const s of [...SQLITE_SCHEMA, ...insertsFor(shopTables(seed)), ...(c.setup ? c.setup(ctx) : [])]) db.run(s);
  const names = (types) => q(`SELECT name FROM sqlite_master WHERE type IN (${types}) AND name NOT LIKE 'sqlite_%' ORDER BY name`).rows.map((r) => r[0]);

  function dot(line) {
    const [cmd, arg] = line.trim().split(/\s+/);
    if (cmd === ".tables") return { kind: "text", text: names("'table','view'").join("  ") || "(no tables)" };
    if (cmd === ".schema") { const r = q(`SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'${arg ? ` AND (name = '${arg.replace(/'/g, "''")}' OR tbl_name = '${arg.replace(/'/g, "''")}')` : ""} ORDER BY type DESC, name`); return { kind: "text", text: r.rows.map((x) => x[0] + ";").join("\n") || "(nothing)" }; }
    if (cmd === ".indexes") return { kind: "text", text: q(`SELECT name FROM sqlite_master WHERE type = 'index'${arg ? ` AND tbl_name = '${arg.replace(/'/g, "''")}'` : ""} ORDER BY name`).rows.map((x) => x[0]).join("\n") || "(no indexes)" };
    if (/^\.(headers?|mode|timer|echo)$/.test(cmd)) return { kind: "ok", message: "(this console always shows headers and column mode)" };
    if (cmd === ".help") return { kind: "text", text: ".tables            list tables and views\n.schema [name]     show the CREATE statements\n.indexes [table]   list indexes" };
    return { kind: "error", message: `Error: unknown command or invalid arguments: "${cmd.slice(1)}". Enter ".help" for help` };
  }
  function one(stmt) {
    if (stmt.startsWith(".")) return dot(stmt);
    try {
      const before = scalar("SELECT total_changes()");
      const r = q(stmt);
      if (r.columns.length) return { kind: "rows", columns: r.columns, rows: r.rows, checkable: !/^\s*(PRAGMA|EXPLAIN)\b/i.test(stmt) };
      const n = scalar("SELECT total_changes()") - before;
      return { kind: "ok", message: /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(stmt) ? `OK · ${n} row${n === 1 ? "" : "s"} changed` : "OK" };
    } catch (e) { return { kind: "error", message: `Error: ${e.message || e}` }; }
  }
  /** Dot-commands end at the line break; SQL ends at the semicolon. */
  function statements(text) {
    const out = [];
    let sql = "";
    for (const line of text.split("\n")) {
      if (!sql.trim() && line.trim().startsWith(".")) out.push(line.trim());
      else { sql += line + "\n"; if (/;\s*$/.test(line)) { out.push(...splitSql(sql)); sql = ""; } }
    }
    return [...out, ...splitSql(sql)];
  }
  function run(text) {
    const out = [];
    for (const stmt of statements(text)) { const r = one(stmt); r.stmt = stmt; out.push(r); if (r.kind === "error") break; }
    return out;
  }
  function probe(fn) {
    db.run("SAVEPOINT _chk");
    try { return fn(); } catch { return false; } finally { db.run("ROLLBACK TO _chk"); db.run("RELEASE _chk"); }
  }
  const plan = (stmt) => { try { return q(`EXPLAIN QUERY PLAN ${stmt.replace(/;\s*$/, "")}`).rows.map((r) => String(r[3])).join("\n"); } catch { return ""; } };

  return {
    run, plan,
    // One unreadable table (a view whose base table was dropped, say) must not break the whole listing.
    tables: () => names("'table','view'").map((name) => {
      const preview = `SELECT *\nFROM ${name}\nLIMIT 10;`;
      try {
        return { name, note: String(scalar(`SELECT COUNT(*) FROM "${name}"`)), preview,
          cols: q(`PRAGMA table_info("${name}")`).rows.map((r) => ({ name: r[1], type: `${String(r[2] || "").toLowerCase() || "any"}${r[5] ? " · pk" : ""}` })) };
      } catch { return { name, note: "?", preview, cols: [] }; }
    }),
    expected: (solution) => run(solution).filter((r) => r.kind === "rows").pop(),
    resolve: (checks) => checks.map((k) => ("expect" in k ? { ...k, is: probe(() => scalar(k.expect)) } : k)),
    check(k) {
      if (k.plan) return new RegExp(k.uses, "i").test(plan(k.plan));
      if (k.pragma) return normCell(scalar(`PRAGMA ${k.pragma}`)) === normCell(k.is);
      return probe(() => {
        for (const s of k.pre || []) db.run(s);
        if (k.rejects) { try { db.run(k.rejects); return false; } catch (e) { return /constraint failed|cannot store|datatype mismatch/i.test(String(e.message || e)); } }
        if (k.sql) return normCell(scalar(k.sql)) === normCell(k.is);
        return true;
      });
    },
    close: () => { try { db.close(); } catch { /* closed */ } },
  };
}
