// End-to-end test of the real engine: runs every challenge through the same
// session, dialect layer and goal checks the browser uses.   node test/run.mjs [seed...]
import { createRequire } from "node:module";
import { ALL as EVERY } from "../js/challenges/index.js";
const ALL = EVERY.filter((c) => c.engine === "mysql");   // the other courses are covered by test/courses.mjs
import { makeCtx } from "../js/flags.js";
import { buildShop } from "../js/data/shop.js";
import { createSession, compareResult } from "../js/engine/mysql.js";

const SQL = await createRequire(import.meta.url)("../vendor/sql-wasm.js")();
const seeds = process.argv.slice(2).length ? process.argv.slice(2) : ["0123456789abcdef01234567", "deadbeefdeadbeefdeadbeef"];
let bad = 0;
const fail = (id, msg) => { bad++; console.log(`FAIL ${id}: ${msg}`); };

for (const seed of seeds) {
  const shop = buildShop(seed);
  for (const c of ALL) {
    const ctx = makeCtx(seed, c);
    const open = () => createSession(SQL, [...shop, ...(c.setup ? c.setup(makeCtx(seed, c)) : [])]);
    try {
      const s = open();
      const lastRows = (rs) => rs.filter((r) => r.kind === "rows" && r.sqlite).pop();
      const err = (rs) => rs.find((r) => r.kind === "error");
      const starter = c.starter ? s.run(c.starter) : [];
      if (err(starter)) fail(c.id, `starter errors: ${err(starter).message}`);
      if (c.mode === "find") {
        const r = s.run(c.solution);
        if (!JSON.stringify(lastRows(r)?.rows || []).includes(ctx.flag)) fail(c.id, "flag not in output");
      } else if (c.mode === "match") {
        const exp = open().run(c.solution).filter((r) => r.kind === "rows").pop();
        if (!exp || !exp.rows.length) { fail(c.id, "no expected rows"); continue; }
        const st = lastRows(starter);
        if (st && compareResult(st, exp, c.ordered).ok && !c.mustUse) fail(c.id, "starter already matches");
        if (c.mustUse && st && new RegExp(c.mustUse, "i").test(s.plan(st.stmt))) fail(c.id, "starter satisfies mustUse");
        const r = s.run(c.solution);
        if (err(r)) { fail(c.id, err(r).message); continue; }
        const mine = lastRows(r), cmp = compareResult(mine, exp, c.ordered);
        if (!cmp.ok) fail(c.id, cmp.msg);
        if (c.mustUse && !new RegExp(c.mustUse, "i").test(s.plan(mine.stmt))) fail(c.id, `mustUse not met: ${s.plan(mine.stmt)}`);
      } else {
        const checks = s.resolve(c.checks);
        if (checks.every((k) => s.check(k))) fail(c.id, "passes before solution");
        const r = s.run(c.solution);
        if (err(r)) { fail(c.id, err(r).message); continue; }
        checks.forEach((k) => { if (!s.check(k)) fail(c.id, `check fails: ${k.label}`); });
        if (s.tables().some((t) => t.name.startsWith("_"))) fail(c.id, "internal table leaked into schema");
      }
      s.close();
    } catch (e) { fail(c.id, `threw: ${e.message}`); }
  }
}

// Dialect layer spot checks
const s = createSession(SQL, buildShop(seeds[0]));
const show = (sql) => { const r = s.run(sql).pop(); return r.kind === "rows" ? JSON.stringify([r.columns, r.rows.slice(0, 4)]) : r.message; };
for (const sql of ["SELECT VERSION(), DATABASE(), 7/2, CONCAT('a','b'), LEFT('hello',2), IF(1>0,'y','n'), DATE_ADD('2025-01-31', INTERVAL 1 DAY), DATEDIFF('2025-03-01','2025-02-01')",
  "SHOW TABLES", "DESCRIBE orders", "SHOW INDEX FROM order_items", "EXPLAIN SELECT * FROM orders WHERE order_date = '2025-03-14'",
  "EXPLAIN SELECT o.order_id, c.email FROM orders o JOIN customers c ON c.customer_id = o.customer_id WHERE c.email = 'x' ORDER BY o.order_date",
  "SELEC 1", "SELECT * FROM nope", "SELECT nope FROM orders", "INSERT INTO orders (customer_id, order_date) VALUES (9999, '2025-01-01')",
  "INSERT INTO orders (customer_id, order_date, status) VALUES (1, '2025-01-01', 'bogus')", "DELETE FROM customers WHERE customer_id = 1",
  "SELECT * FROM _users", "SHOW GRANTS FOR 'root'@'localhost'", "GRANT SELECT ON shop.* TO 'ghost'@'%'",
  "START TRANSACTION; UPDATE products SET stock = 1; CREATE TABLE t (a INT); ROLLBACK; SELECT COUNT(DISTINCT stock) FROM products",
  "SHOW CREATE TABLE orders", "ALTER TABLE orders MODIFY status VARCHAR(5)", "TRUNCATE TABLE order_items"]) console.log(`\n> ${sql}\n${show(sql)}`);
console.log(`\n${ALL.length} challenges x ${seeds.length} seeds, ${bad} failures`);
process.exit(bad ? 1 : 0);
