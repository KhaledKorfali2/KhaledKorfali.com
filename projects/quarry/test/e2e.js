// Browser smoke test. To run: copy index.html to e2e.html, add
//   <script type="module" src="test/e2e.js"></script>  after main.js, serve the repo and open it
// (headless: chrome --headless=new --virtual-time-budget=120000 --dump-dom URL). Delete e2e.html after.
// It: plays every
// challenge through the real UI and reports into <pre id="e2e">.
import { ALL } from "../js/challenges/index.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(20); } return null; };
const log = [];
const errors = [];
window.addEventListener("error", (e) => errors.push(e.message));
window.addEventListener("unhandledrejection", (e) => errors.push(String(e.reason)));
// Start from a clean slate: progress is read at module load, so clear and reload once.
if (localStorage.getItem("quarry.v1") && !sessionStorage.getItem("e2e")) { sessionStorage.setItem("e2e", "1"); localStorage.clear(); location.reload(); await sleep(60000); }
await sleep(300);
for (const c of ALL) {
  location.hash = `#/c/${c.id}`;
  const h1 = await until(() => { const h = document.querySelector(".brief h1"); return h && h.textContent === c.title ? h : null; });
  if (!h1) { log.push(`FAIL ${c.id}: page did not open (locked?)`); continue; }
  const sq = await until(() => document.querySelector(".sq"));
  if (!sq) { log.push(`FAIL ${c.id}: console did not mount: ${document.querySelector(".ws-loading")?.textContent}`); continue; }
  const goalBefore = document.querySelector(".sq-goal").textContent.slice(0, 60);
  if (c.starter) sq._console.run(c.starter);
  if (!document.querySelector(".reveal").hidden) { log.push(`FAIL ${c.id}: flag revealed by starter`); continue; }
  sq._console.run(c.solution);
  if (c.mode === "find") {
    const flag = [...document.querySelectorAll(".sq-grid td")].map((t) => t.textContent.match(/QUARRY\{[^}]+\}/)?.[0]).find(Boolean);
    document.querySelector(".answer").value = flag || "";
    document.querySelector("form.submit button").click();
  } else {
    const btn = await until(() => document.querySelector(".reveal:not([hidden]) button"), 1500);
    if (!btn) { log.push(`FAIL ${c.id}: no flag revealed. goal="${document.querySelector(".sq-goal").textContent.slice(0, 200)}" out="${document.querySelector(".sq-result").textContent.slice(0, 200)}"`); continue; }
    btn.click();
  }
  const ok = await until(() => !document.querySelector(".debrief").hidden, 1500);
  log.push(`${ok ? "ok  " : "FAIL"} ${c.id} | ${goalBefore}`);
}
location.hash = "#/reference"; await sleep(200);
const refLen = document.querySelector(".prose").textContent.length, tables = document.querySelectorAll(".md-table").length, codes = document.querySelectorAll("pre.code").length;
location.hash = "#/"; await sleep(200);
log.push(`reference: ${refLen} chars, ${tables} tables, ${codes} code blocks; score="${document.querySelector("[data-score]").textContent}"; done nodes=${document.querySelectorAll(".node.is-done").length}; errors=${JSON.stringify(errors)}`);
const pre = document.createElement("pre"); pre.id = "e2e"; pre.textContent = "E2E-BEGIN\n" + log.join("\n") + "\nE2E-END"; document.body.append(pre);
