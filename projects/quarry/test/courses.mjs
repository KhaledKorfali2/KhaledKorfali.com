// Runs every challenge of every course on its real engine: the starter must not
// already solve it, and the reference solution must.   node test/courses.mjs [engine …]
import { runtime, engineModule } from "./runtimes.mjs";
import { COURSES, ALL } from "../js/challenges/index.js";
import { makeCtx } from "../js/flags.js";
import { compareResult } from "../js/engine/common.js";

const only = process.argv.slice(2);
const seeds = ["0123456789abcdef01234567", "deadbeefdeadbeefdeadbeef"];
let bad = 0, n = 0;
const fail = (id, msg) => { bad++; console.log(`FAIL ${id}: ${String(msg).replace(/\n/g, " ⏎ ").slice(0, 400)}`); };
const ids = new Set();
for (const c of ALL) { if (ids.has(c.id)) fail(c.id, "duplicate id"); ids.add(c.id); for (const k of ["title", "slug", "objective", "lesson", "debrief", "mode", "solution", "engine"]) if (!c[k]) fail(c.id, `missing ${k}`); if (c.hints?.length !== 3 || !c.tags?.length) fail(c.id, "hints/tags"); for (const line of (c.lesson + "\n" + c.debrief).split("\n")) if (line.startsWith("|") && (line.match(/~[^~]*~/g) || []).some((x) => x.includes("|"))) fail(c.id, `a pipe inside inline code in a table row: ${line}`); }

for (const course of COURSES) {
  if (course.id === "mysql" || (only.length && !only.includes(course.id))) continue;
  const mod = await engineModule(course.engine), rt = await runtime(course.engine);
  for (const seed of seeds) for (const c of course.tracks.flatMap((t) => t.list)) {
    n++;
    const t0 = Date.now();
    let s;
    try {
      s = await mod.open({ seed, challenge: c, ctx: makeCtx(seed, c) }, rt);
      const cmp = (mine, exp) => (s.compare ? s.compare(mine, exp, c.ordered) : compareResult({ columns: mine.columns, rows: mine.cmp || mine.rows }, { columns: exp.columns, rows: exp.cmp || exp.rows }, c.ordered));
      const errOf = (rs) => rs.find((r) => r.kind === "error");
      const last = (rs) => rs.filter((r) => r.checkable).pop();
      let info = "";
      if (c.mode === "match") {
        const exp = await s.expected(c.solution);
        if (!exp) { fail(c.id, "no expected result"); continue; }
        const size = exp.docs ? exp.docs.length : exp.rows.length;
        if (!size) fail(c.id, "expected result is empty");
        info = exp.docs ? `${size} docs` : `${size}×${exp.columns.length}`;
        if (c.starter) { const st = await s.run(c.starter); if (errOf(st)) fail(c.id, `starter: ${errOf(st).message}`); const m = last(st); if (m && cmp(m, exp).ok && !c.mustUse) fail(c.id, "starter already matches"); }
        const rs = await s.run(c.solution);
        if (errOf(rs)) { fail(c.id, errOf(rs).message); continue; }
        const mine = last(rs);
        if (!mine) { fail(c.id, "solution produced nothing checkable"); continue; }
        const r = cmp(mine, exp);
        if (!r.ok) fail(c.id, `solution does not match: ${r.msg}`);
      } else if (c.mode === "verify") {
        const checks = await s.resolve(c.checks);
        if (c.starter) { const st = await s.run(c.starter); if (errOf(st)) fail(c.id, `starter: ${errOf(st).message}`); }
        const before = []; for (const k of checks) before.push(await s.check(k));
        if (before.every(Boolean)) fail(c.id, "passes before the solution");
        const rs = await s.run(c.solution);
        if (errOf(rs)) { fail(c.id, errOf(rs).message); continue; }
        const after = []; for (const k of checks) after.push(await s.check(k));
        after.forEach((ok, i) => { if (!ok) fail(c.id, `check fails after solution: ${checks[i].label}`); });
        info = `before ${before.map((b) => (b ? "Y" : "n")).join("")} after ${after.map((b) => (b ? "Y" : "n")).join("")}`;
      } else fail(c.id, `unsupported mode ${c.mode}`);
      const tables = await s.tables();
      if (!tables.length) fail(c.id, "no tables in the sidebar");
      if (seed === seeds[0]) console.log(`ok   ${course.id.padEnd(9)} ${c.id.padEnd(12)} ${c.mode.padEnd(6)} ${info.padEnd(24)} ${Date.now() - t0}ms`);
    } catch (e) { fail(c.id, `threw: ${e.stack || e}`); }
    finally { try { s?.close(); } catch { /* ignore */ } }
  }
}
console.log(`\n${n} challenge runs, ${bad} failures`);
process.exit(bad ? 1 : 0);
