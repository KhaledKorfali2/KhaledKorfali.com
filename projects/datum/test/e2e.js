// Browser test. To run: copy index.html to e2e.html, add
//   <script type="module" src="test/e2e.js"></script>  after main.js, serve the repo and open it
// (headless: chrome --headless=new --window-size=1440,900 --virtual-time-budget=400000 --dump-dom URL).
// Delete e2e.html after. It solves every challenge through the workbench, then drives
// the real UI (sketching, typing dimensions, picking edges and faces) for a few of them.
import { ALL, byId } from "../js/challenges/index.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(25); } return null; };
const log = [], errors = [];
const ok = (name, cond, extra = "") => log.push(`${cond ? "ok  " : "FAIL"} ${name} ${extra}`);
window.addEventListener("error", (e) => errors.push(e.message));
window.addEventListener("unhandledrejection", (e) => errors.push(String(e.reason?.message || e.reason)));
document.addEventListener("securitypolicyviolation", (e) => errors.push(`CSP ${e.violatedDirective} ${e.blockedURI}`));
if (localStorage.getItem("datum.v1") && !sessionStorage.getItem("e2e")) { sessionStorage.setItem("e2e", "1"); localStorage.clear(); location.reload(); await sleep(60000); }
await sleep(300);
const $ = (q) => document.querySelector(q), $$ = (q) => [...document.querySelectorAll(q)];
const pe = (type, [x, y], button = 0) => new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button, pointerId: 1 });
const click = (target, pt) => { target.dispatchEvent(pe("pointerdown", pt)); target.dispatchEvent(pe("pointerup", pt)); };
const dragOn = (target, a, b) => { target.dispatchEvent(pe("pointerdown", a)); target.dispatchEvent(pe("pointermove", b)); target.dispatchEvent(pe("pointerup", b)); };
const tool = (name) => $$(".wb-tool").find((b) => b.textContent.trim() === name);
const field = (label) => $$(".wb-field").find((f) => f.firstChild.textContent === label)?.querySelector("input, select");
const type = (label, v) => { const i = field(label); if (!i) throw new Error(`no field "${label}"`); i.value = String(v); i.dispatchEvent(new Event(i.tagName === "SELECT" ? "change" : "input", { bubbles: true })); };
const check = (text) => { const b = $$(".wb-check").find((c) => c.textContent.startsWith(text)).querySelector("input"); b.checked = !b.checked; b.dispatchEvent(new Event("change", { bubbles: true })); };
const open = async (id) => { location.hash = `#/c/${id}`; const c = byId(id); await until(() => $(".brief h1")?.textContent === c.title); return until(() => $(".wb")?._wb); };
const revealed = () => !$(".reveal").hidden;
const capture = async () => { const b = await until(() => $(".reveal:not([hidden]) button"), 4000); if (!b) return false; b.click(); return !!(await until(() => !$(".debrief").hidden, 3000)); };

try {
  // 1. every challenge: starter isn't solved, target is, flag is captured
  for (const c of ALL) {
    const wb = await open(c.id);
    if (!wb) { log.push(`FAIL ${c.id}: workbench did not mount: ${$(".ws-loading")?.textContent} | main: ${$("#main").textContent.slice(0, 120)}`); break; }
    await sleep(60);
    if (revealed()) { log.push(`FAIL ${c.id}: solved before doing anything`); continue; }
    wb.load(c.target);
    const done = await capture();
    log.push(`${done ? "ok  " : "FAIL"} ${c.id} ${done ? "" : `| ${$(".wb-goal").textContent} | errors ${JSON.stringify(wb.result.errors)}`}`);
    if (!done) { log.push(`  reveal hidden=${$(".reveal").hidden} text=${$(".reveal").textContent}`); break; }
  }
  localStorage.removeItem("datum.models");

  // 2. build the first challenge with the real UI
  let wb = await open("c-plate");
  $(".ws-actions .btn").dispatchEvent(new Event("noop"));
  wb.load([]);
  tool("Sketch").click();
  let sk = await until(() => $(".wb")._wb.sketcher);
  ok("sketch mode opens", !!sk && !$(".wb-sketch").hidden && $(".wb-canvas").hidden);
  tool("Rectangle").click();
  const svg = $(".sk-svg");
  await sleep(80);
  dragOn(svg, sk.screen([-10, -5]), sk.screen([20, 15]));
  ok("rectangle drawn by dragging", wb.features[0].items.length === 1 && wb.features[0].items[0].w === 30 && wb.features[0].items[0].h === 20, JSON.stringify(wb.features[0].items[0]));
  type("Centre X", 0); type("Centre Y", 0); type("Width", 60); type("Height", 40);
  await sleep(250);
  ok("dimensions typed", wb.features[0].items[0].w === 60 && wb.features[0].items[0].x === 0);
  ok("sketch draws the shape and its dimension", $$(".sk-item").length === 1 && /60 × 40/.test($(".sk-labels").textContent));
  tool("Finish sketch").click();
  ok("back in 3D", !$(".wb-canvas").hidden && $(".wb-sketch").hidden);
  ok("no solid yet", /Nothing built yet/.test($(".wb-goal").textContent), $(".wb-goal").textContent.slice(0, 60));
  tool("Extrude").click();
  await sleep(50);
  type("Distance", 25); await sleep(300);
  ok("feedback names the size difference", /Overall size is 60 × 40 × 25 mm/.test($(".wb-goal").textContent), $(".wb-goal").textContent.slice(0, 80));
  ok("readout", /60 × 40 × 25 mm · 60 cm³/.test($(".wb-readout").textContent), $(".wb-readout").textContent);
  await sleep(1100);          // a pause, so the next edit is its own undo step
  type("Distance", 10); await sleep(300);
  ok("UI-built plate matches and reveals the flag", revealed(), $(".wb-goal").textContent);
  ok("timeline lists both features", $$(".wb-feat").length === 2, $$(".wb-feat").map((f) => f.textContent).join(" | "));
  // undo / redo
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true })); await sleep(50);
  const afterUndo = wb.features.find((f) => f.t === "extrude")?.dist;
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "y", ctrlKey: true, bubbles: true })); await sleep(50);
  ok("undo then redo", afterUndo === 25 && wb.features.find((f) => f.t === "extrude").dist === 10, `undo→${afterUndo}`);
  // drawing tab and export
  $$(".wb-tabs button")[1].click();
  ok("target drawing renders", !$(".wb-drawing").hidden && $$(".dw-svg path").length >= 6 && /60 \(X\)/.test($(".dw-svg").textContent), `${$$(".dw-svg path").length} paths`);
  $$(".wb-tabs button")[0].click();
  tool("STL").click(); tool("STEP").click();
  ok("export runs", /Exported/.test($(".toast").textContent), $(".toast").textContent);
  // draft persistence
  location.hash = "#/"; await sleep(150);
  wb = await open("c-plate");
  ok("model restored from draft", wb.features.length === 2 && revealed());

  // 3. path tool + front plane (c-front)
  wb = await open("c-front"); wb.load([]);
  tool("Sketch").click(); sk = await until(() => $(".wb")._wb.sketcher);
  type("Plane", "XZ"); sk = await until(() => $(".wb")._wb.sketcher && $(".wb")._wb.features[0].plane === "XZ" && $(".wb")._wb.sketcher); await sleep(120);
  sk = $(".wb")._wb.sketcher;
  tool("Profile").click(); await sleep(60);
  for (const p of [[0, 0], [40, 0], [40, 8], [8, 8], [8, 40], [0, 40], [0, 0]]) click($(".sk-svg"), sk.screen(p));
  ok("profile drawn by clicking corners", wb.features[0].items[0]?.k === "path" && wb.features[0].items[0].pts.length === 6, JSON.stringify(wb.features[0].items[0]?.pts));
  tool("Finish sketch").click(); tool("Extrude").click(); type("Distance", 30); await sleep(300);
  ok("front-plane L bracket built with the UI", revealed(), $(".wb-goal").textContent);

  // 4. picking edges (f-fillet) and faces (f-shell)
  wb = await open("f-fillet"); wb.load(byId("f-fillet").starter);
  tool("Fillet").click(); await sleep(120);
  const canvas = $(".vp-canvas");
  for (const p of [[25, 15, 10], [-25, 15, 10], [25, -15, 10], [-25, -15, 10]]) click(canvas, wb.vp.project(p));
  const fl = wb.features.find((f) => f.t === "fillet");
  ok("four edges picked by clicking", fl.picks.length === 4 && fl.picks.every((p) => p.kind === "edge"), JSON.stringify(fl.picks.map((p) => p.kind)));
  click(canvas, wb.vp.project([25, 15, 10]));
  ok("clicking an edge again unpicks it", fl.picks.length === 3);
  click(canvas, wb.vp.project([25, 15, 10]));
  type("Radius", 6); await sleep(350);
  ok("picked fillet matches the target", revealed(), $(".wb-goal").textContent);
  ok("too-large fillet reports an error", (type("Radius", 40), await sleep(350), /failed/.test($(".wb-error").textContent) && $$(".wb-feat.is-bad").length === 1), $(".wb-error").textContent.slice(0, 70));

  wb = await open("f-shell"); wb.load(byId("f-shell").target.slice(0, 2));
  tool("Shell").click(); await sleep(120);
  click($(".vp-canvas"), wb.vp.project([3, 2, 30]));
  const sh = wb.features.find((f) => f.t === "shell");
  ok("top face picked by clicking", sh.picks.length === 1 && sh.picks[0].kind === "face" && Math.abs(sh.picks[0].p[2] - 30) < 0.01, JSON.stringify(sh.picks));
  type("Wall thickness", 2); await sleep(350);
  ok("picked shell matches the target", revealed(), $(".wb-goal").textContent);

  // 5. reset model
  ok("canvas has a WebGL context", !!$(".vp-canvas").getContext("webgl2") || !!$(".vp-canvas").getContext("webgl"));
} catch (e) { log.push(`FAIL test crashed: ${e.stack || e}`); }
location.hash = "#/reference"; await sleep(200);
const ref = `${$$(".md-table").length} tables`;
location.hash = "#/"; await sleep(200);
log.push(`reference: ${ref}; score="${$("[data-score]").textContent}"; errors=${JSON.stringify(errors)}`);
const pre = document.createElement("pre"); pre.id = "e2e"; pre.textContent = "E2E-BEGIN\n" + log.join("\n") + "\nE2E-END"; document.body.append(pre);
