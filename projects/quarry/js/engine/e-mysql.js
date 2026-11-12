// MySQL course engine: adapts the MySQL-flavoured session (mysql.js, on SQLite)
// to the interface the console uses for every engine.
import { createSession } from "./mysql.js";
import { buildShop } from "../data/shop.js";

export const meta = { id: "mysql", name: "MySQL", prompt: "mysql> ", note: "root@shop · MySQL-compatible sandbox", placeholder: "Type SQL here, then press Run (Ctrl+Enter)", sidebar: "shop" };

let sqlPromise = null;
export function loadRuntime() {
  if (!sqlPromise) {
    if (typeof window.initSqlJs !== "function") return Promise.reject(new Error("the database engine script (vendor/sql-wasm.js) did not load"));
    sqlPromise = window.initSqlJs({ locateFile: (f) => `vendor/${f}` });
  }
  return sqlPromise;
}

export async function open({ seed, challenge: c, ctx }, SQL) {
  SQL = SQL || await loadRuntime();
  const sess = createSession(SQL, [...buildShop(seed), ...(c.setup ? c.setup(ctx) : [])]);
  return {
    run: (text) => sess.run(text).map((r) => ({ ...r, checkable: r.kind === "rows" && !!r.sqlite })),
    tables: () => sess.tables().map((t) => ({ name: t.name, note: t.type === "view" ? "view" : String(t.rows), preview: `SELECT *\nFROM ${t.name}\nLIMIT 10;`,
      cols: t.cols.map((col) => ({ name: col.name, type: `${col.type}${col.key ? " · " + col.key : ""}` })) })),
    expected: (solution) => sess.run(solution).filter((r) => r.kind === "rows").pop(),
    resolve: (checks) => sess.resolve(checks),
    check: (k) => sess.check(k),
    plan: (stmt) => sess.plan(stmt),
    close: () => sess.close(),
  };
}
