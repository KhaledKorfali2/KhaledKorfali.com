// App shell: hash router, navigation, streak card and the settings sheet.
import { ICON, toast, confirmDialog } from "./ui.js";
import { subscribe, settings, setSetting, streak, activity, dueProblems, exportData, importData, resetProgress, attempts } from "./store.js";
import { LISTS } from "./data/index.js";
import * as home from "./views/home.js";
import * as drill from "./views/drill.js";
import * as patterns from "./views/patterns.js";
import * as problems from "./views/problems.js";
import * as progress from "./views/progress.js";

const NAV = [
  { href: "#/", key: "home", label: "Practice", icon: ICON.practice },
  { href: "#/patterns", key: "patterns", label: "Patterns", icon: ICON.patterns },
  { href: "#/problems", key: "problems", label: "Problems", icon: ICON.problems },
  { href: "#/progress", key: "progress", label: "Progress", icon: ICON.progress },
];

const ROUTES = [
  { re: /^\/?$/, view: home, nav: "home" },
  { re: /^\/drill$/, view: drill, nav: "home" },
  { re: /^\/patterns$/, view: patterns, nav: "patterns" },
  { re: /^\/patterns\/([\w-]+)$/, view: patterns, nav: "patterns", param: "id" },
  { re: /^\/problems$/, view: problems, nav: "problems" },
  { re: /^\/problems\/([\w-]+)$/, view: drill, nav: "problems", param: "problem" },
  { re: /^\/progress$/, view: progress, nav: "progress" },
];

const main = document.getElementById("main");
let active = null;     // { view, cleanup }
let activeNav = "home";

function renderNav() {
  const due = dueProblems().length;
  document.querySelectorAll("[data-nav]").forEach((nav) => {
    nav.innerHTML = NAV.map((n) => `<a href="${n.href}" ${n.key === activeNav ? 'aria-current="page"' : ""}>
      ${n.icon}<span>${n.label}</span>${n.key === "home" && due ? `<span class="nav-badge" aria-label="${due} due">${due > 99 ? "99+" : due}</span>` : ""}</a>`).join("");
  });
  const s = streak();
  const week = activity(7);
  document.querySelector("[data-streak]").innerHTML = `
    <div class="streak-row"><span class="streak-num">${s}</span><span class="streak-lbl">day streak</span></div>
    <div class="week" aria-label="Practice in the last 7 days">${week.map((d, i) =>
      `<i class="${d.n ? "on" : ""} ${i === 6 ? "today" : ""}" title="${d.n} answered"></i>`).join("")}</div>`;
  const mini = document.querySelector("[data-streak-mini]");
  mini.hidden = !s;
  mini.innerHTML = `${ICON.flame.replace("<svg", '<svg width="12" height="12"')} ${s}`;
  mini.setAttribute("aria-label", `${s} day streak`);
}

function route() {
  const path = location.hash.replace(/^#/, "") || "/";
  let match = null, params = {};
  for (const r of ROUTES) {
    const m = path.match(r.re);
    if (m) { match = r; if (r.param) params[r.param] = decodeURIComponent(m[1]); break; }
  }
  if (!match) { location.replace("#/"); return; }

  if (active?.cleanup) active.cleanup();
  activeNav = match.nav;
  renderNav();
  document.body.classList.remove("has-actionbar");
  // A fresh host per route, so listeners a view attaches die with it.
  main.innerHTML = "";
  const host = document.createElement("div");
  main.appendChild(host);
  const cleanup = match.view.render(host, params);
  active = { view: match.view, cleanup };
  const h1 = main.querySelector("h1");
  document.title = (h1 && match.view !== home ? h1.textContent.trim() + " · " : "") + "Pattern Trace";
  // Keep scroll when re-rendering in place (e.g. ?query changes), otherwise start at the top.
  window.scrollTo(0, 0);
  if (!route.first) main.focus({ preventScroll: true });
  route.first = false;
}
route.first = true;

window.addEventListener("hashchange", route);
subscribe(() => renderNav());

/* ── Theme ── */
const mq = window.matchMedia("(prefers-color-scheme: light)");
function applyTheme() {
  const t = settings().theme;
  const light = t === "light" || (t === "system" && mq.matches);
  document.documentElement.dataset.theme = light ? "light" : "dark";
}
mq.addEventListener?.("change", applyTheme);
applyTheme();

/* ── Settings sheet ── */
function openSettings() {
  const s = settings();
  const d = document.createElement("dialog");
  d.className = "sheet";
  d.setAttribute("aria-labelledby", "settings-title");
  const seg = (key, opts) => `<span class="segmented" role="group">${opts.map(([v, l]) =>
    `<button type="button" data-set="${key}" data-val="${v}" aria-pressed="${String(s[key]) === String(v)}">${l}</button>`).join("")}</span>`;
  d.innerHTML = `
    <div class="sheet-head"><h2 id="settings-title">Settings</h2>
      <button type="button" class="icon-btn" data-close aria-label="Close">${ICON.close}</button></div>
    <div class="sheet-body">
      <div class="section-title">Appearance</div>
      <div class="btn-row" style="justify-content:space-between"><span>Theme</span>${seg("theme", [["system", "Auto"], ["dark", "Dark"], ["light", "Light"]])}</div>

      <div class="section-title">Practice</div>
      <div class="btn-row" style="justify-content:space-between;margin-bottom:12px"><span>Problems per session</span>${seg("sessionSize", [[5, "5"], [10, "10"], [20, "20"]])}</div>
      <div class="btn-row" style="justify-content:space-between;margin-bottom:6px"><span>Draw problems from</span>${seg("list", Object.entries(LISTS).map(([k, v]) => [k, v.replace("All problems", "All")]))}</div>
      <div style="margin-top:14px">
        ${[["hideTitles", "Hide problem titles", "Famous titles give the answer away. Tap a blurred title to peek."],
           ["askSignals", "Ask for signals", "Pick the phrases that hint at the pattern."],
           ["askStructures", "Ask for data structures", ""],
           ["askTime", "Ask for time complexity", ""]].map(([k, t, sub]) => `
          <label class="switch"><span class="switch-text"><b>${t}</b>${sub ? `<span>${sub}</span>` : ""}</span>
          <input type="checkbox" data-toggle="${k}" ${s[k] ? "checked" : ""}></label>`).join("")}
      </div>
      <div class="btn-row" style="justify-content:space-between;margin-top:8px"><span>Template language</span>${seg("lang", [["python", "Python"], ["javascript", "JavaScript"]])}</div>

      <div class="section-title">Your data</div>
      <p class="muted" style="font-size:13.5px;margin-bottom:12px">Progress is saved in this browser. Export it to back it up or move it to another device.</p>
      <div class="btn-row">
        <button type="button" class="btn btn-sm" data-export>Export progress</button>
        <label class="btn btn-sm" style="cursor:pointer">Import…<input type="file" accept="application/json,.json" data-import hidden></label>
        <button type="button" class="btn btn-sm btn-danger" data-reset ${attempts().length ? "" : "disabled"}>Reset progress</button>
      </div>
    </div>`;
  document.body.appendChild(d);
  const close = () => { d.close(); d.remove(); };
  d.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  d.addEventListener("click", async (e) => {
    if (e.target === d || e.target.closest("[data-close]")) return close();
    const b = e.target.closest("[data-set]");
    if (b) {
      const key = b.dataset.set;
      const val = typeof DEFAULT_TYPES[key] === "number" ? Number(b.dataset.val) : b.dataset.val;
      setSetting(key, val);
      b.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      if (key === "theme") applyTheme();
      rerender();
    }
    if (e.target.closest("[data-export]")) {
      const blob = new Blob([exportData()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `pattern-trace-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast("Progress exported");
    }
    if (e.target.closest("[data-reset]")) {
      close();
      if (await confirmDialog({ title: "Reset all progress?", body: `This deletes ${attempts().length} answers and your review schedule. Settings are kept. Export first if you might want it back.`, confirm: "Reset", danger: true })) {
        resetProgress(); toast("Progress reset"); rerender();
      }
    }
  });
  d.addEventListener("change", async (e) => {
    const t = e.target.closest("[data-toggle]");
    if (t) { setSetting(t.dataset.toggle, t.checked); rerender(); }
    const f = e.target.closest("[data-import]");
    if (f && f.files[0]) {
      try {
        const n = importData(await f.files[0].text());
        toast(`Imported ${n} answers`); close(); rerender();
      } catch (err) {
        toast(err.message && err.message.includes("Pattern Trace") ? err.message : "Couldn't read that file");
      }
    }
  });
  d.showModal();
}
const DEFAULT_TYPES = { sessionSize: 10 };

// Re-render the current view after a settings change, unless mid-drill (don't lose answers).
function rerender() {
  if (active?.view === drill) return;
  const y = window.scrollY;
  route();
  window.scrollTo(0, y);
}

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-settings]")) openSettings();
});

route();
