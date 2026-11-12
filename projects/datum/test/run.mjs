// Engine test: builds every challenge's target on the real kernel and checks that
// the challenge is solvable and not already solved.   node test/run.mjs
import { loadKernel } from "./kernel.mjs";
import { createModeler } from "../js/cad/model.js";
import { ALL, TRACKS } from "../js/challenges/index.js";

const M = createModeler(await loadKernel());
let bad = 0;
const fail = (id, msg) => { bad++; console.log(`FAIL ${id}: ${msg}`); };
const clone = (x) => JSON.parse(JSON.stringify(x));
const ids = new Set();
for (const c of ALL) {
  for (const k of ["id", "title", "slug", "objective", "lesson", "debrief", "target", "tools"]) if (!c[k]) fail(c.id, `missing ${k}`);
  if (ids.has(c.id)) fail(c.id, "duplicate id"); ids.add(c.id);
  if (c.hints?.length !== 3 || !c.tags?.length) fail(c.id, "hints/tags");
  const fid = new Set(); for (const f of c.target) { if (fid.has(f.id)) fail(c.id, `duplicate feature id ${f.id}`); fid.add(f.id); }
  for (const f of c.target) if (!c.tools.includes(f.t)) fail(c.id, `target uses ${f.t}, which isn't in tools`);
  const t0 = Date.now();
  const t = M.rebuild(clone(c.target));
  if (Object.keys(t.errors).length || !t.body) { fail(c.id, `target: ${JSON.stringify(t.errors)}`); continue; }
  const m = M.measure(t.body);
  const self = M.compare(M.rebuild(clone(c.target)).body, t.body, c.tol);
  if (!self.ok) fail(c.id, `target does not match itself: ${self.msg}`);
  const s = M.rebuild(clone(c.starter || []));
  if (Object.keys(s.errors).length) fail(c.id, `starter: ${JSON.stringify(s.errors)}`);
  const st = M.compare(s.body, t.body, c.tol);
  if (st.ok) fail(c.id, "starter already matches");
  // every single-feature omission must be detected (so no feature is too small to matter)
  const loose = [];
  c.target.forEach((f, i) => {
    if (f.t === "sketch") return;
    const r = M.rebuild(clone(c.target.filter((_, j) => j !== i)));
    if (r.body && M.compare(r.body, t.body, c.tol).ok) loose.push(f.id);
  });
  if (loose.length) fail(c.id, `removing ${loose.join(", ")} still passes`);
  let v = null; try { v = M.views(t.body); } catch (e) { fail(c.id, `views: ${e.message}`); }
  const stl = M.exportSTL(t.body).size;
  console.log(`ok   ${c.id.padEnd(12)} ${m.size.map((x) => +x.toFixed(2)).join(" × ").padEnd(22)} vol ${m.volume.toFixed(1).padStart(9)}  start ${(st.score * 100 || 0).toFixed(0).padStart(3)}%  views ${v ? v.front.visible.length + "/" + v.front.hidden.length : "-"}  stl ${stl}  ${Date.now() - t0}ms`);
}
console.log(`\n${TRACKS.length} tracks, ${ALL.length} challenges, ${bad} failures`);
process.exit(bad ? 1 : 0);
