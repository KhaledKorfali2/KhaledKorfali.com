// Emits, as JSON, everything a SQLite checker needs to validate the course:
// the seed data, each challenge's setup, reference solution and checks, all
// already translated from MySQL to SQLite by the app's own dialect layer.
// Runs this project's code only (no SQL engine).   node test/dump.mjs <seed>
import { ALL } from "../js/challenges/index.js";
import { makeCtx } from "../js/flags.js";
import { buildShop } from "../js/data/shop.js";
import { translate, splitStatements } from "../js/engine/mysql.js";

const seed = process.argv[2] || "0123456789abcdef01234567";
const tr = (stmt) => { const t = translate(stmt); if (t.builtin) throw new Error(`builtin in script: ${stmt.slice(0, 60)}`); return t.sql; };
const script = (text) => splitStatements(text).flatMap(tr);
const ids = new Set();
const out = { seed, shop: buildShop(seed).flatMap(tr), challenges: ALL.map((c) => {
  for (const k of ["id", "title", "slug", "objective", "lesson", "debrief", "mode", "solution"]) if (!c[k]) throw new Error(`${c.id}: missing ${k}`);
  if (ids.has(c.id)) throw new Error(`duplicate id ${c.id}`); ids.add(c.id);
  if (c.hints.length !== 3 || !c.tags.length) throw new Error(`${c.id}: hints/tags`);
  if ((c.mode === "verify") !== !!c.checks) throw new Error(`${c.id}: checks vs mode`);
  const ctx = makeCtx(seed, c);
  return {
    id: c.id, mode: c.mode, flag: ctx.flag, ordered: !!c.ordered, mustUse: c.mustUse || null,
    setup: (c.setup ? c.setup(ctx) : []).flatMap(tr),
    setupAgain: (c.setup ? c.setup(makeCtx(seed, c)) : []).flatMap(tr),
    starter: c.starter ? splitStatements(c.starter).map((s) => { const t = translate(s); return t.builtin ? null : t.sql; }) : [],
    solution: script(c.solution),
    checks: (c.checks || []).map((k) => ({ label: k.label, stat: k.stat || null, pre: (k.pre || []).flatMap(tr), sql: k.sql ? tr(k.sql) : null,
      is: "is" in k ? k.is : null, expect: k.expect ? tr(k.expect) : null, rejects: k.rejects ? tr(k.rejects) : null, plan: k.plan ? tr(k.plan)[0] : null, uses: k.uses || null })),
  };
}) };
process.stdout.write(JSON.stringify(out));
