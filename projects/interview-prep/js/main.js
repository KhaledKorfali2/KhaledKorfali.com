// App shell: hash router, navigation, streak card and the settings sheet.
import { ICON, toast, confirmDialog } from "./ui.js";
import { subscribe, settings, setSetting, streak, activity, dueProblems, dueReviewCount, exportData, importData, resetProgress, attempts, solves } from "./store.js";
import { LISTS } from "./data/index.js";
import * as home from "./views/home.js";
import * as drill from "./views/drill.js";
import * as patterns from "./views/patterns.js";
import * as problems from "./views/problems.js";
import * as progress from "./views/progress.js";
import * as todayView from "./views/today.js";
import * as solve from "./views/solve.js";
import * as review from "./views/review.js";
import * as curriculum from "./views/curriculum.js";
import * as notes from "./views/notes.js";
import * as mock from "./views/mock.js";

// `tab` marks the five destinations that fit the phone tab bar; the rest are linked from Today.
const NAV = [
  { href: "#/", key: "today", label: "Today", icon: ICON.today, tab: true },
  { href: "#/curriculum", key: "curriculum", label: "Curriculum", short: "Plan", icon: ICON.book, tab: true },
  { href: "#/review", key: "review", label: "Review", icon: ICON.repeat, tab: true },
  { href: "#/mock", key: "mock", label: "Mock interview", icon: ICON.timer },
  { href: "#/drills", key: "drills", label: "Clue drill", icon: ICON.target },
  { href: "#/patterns", key: "patterns", label: "Patterns", icon: ICON.patterns, tab: true },
  { href: "#/notes", key: "notes", label: "Notes", icon: ICON.note },
  { href: "#/progress", key: "progress", label: "Progress", icon: ICON.progress, tab: true },
];

const ROUTES = [
  { re: /^\/?$/, view: todayView, nav: "today" },
  { re: /^\/solve\/([\w-]+)$/, view: solve, nav: "today", param: "slug" },
  { re: /^\/review$/, view: review, nav: "review" },
  { re: /^\/curriculum$/, view: curriculum, nav: "curriculum" },
  { re: /^\/curriculum\/([\w-]+)$/, view: curriculum, nav: "curriculum", param: "topic" },
  { re: /^\/mock$/, view: mock, nav: "mock" },
  { re: /^\/notes$/, view: notes, nav: "notes" },
  { re: /^\/drills$/, view: home, nav: "drills" },
  { re: /^\/drill$/, view: drill, nav: "drills" },
  { re: /^\/patterns$/, view: patterns, nav: "patterns" },
  { re: /^\/patterns\/([\w-]+)$/, view: patterns, nav: "patterns", param: "id" },
  { re: /^\/problems$/, view: problems, nav: "curriculum" },
  { re: /^\/problems\/([\w-]+)$/, view: drill, nav: "drills", param: "problem" },
  { re: /^\/progress$/, view: progress, nav: "progress" },
];

const main = document.getElementById("main");
let active = null;     // { view, cleanup }
let activeNav = "home";

function renderNav() {
  const badges = { review: dueReviewCount(), drills: dueProblems().length };
  document.querySelectorAll("[data-nav]").forEach((nav) => {
    const tabs = nav.classList.contains("tabbar");
    nav.innerHTML = NAV.filter((n) => !tabs || n.tab).map((n) => {
      const due = badges[n.key] || 0;
      return `<a href="${n.href}" ${n.key === activeNav ? 'aria-current="page"' : ""}>
      ${n.icon}<span>${tabs && n.short ? n.short : n.label}</span>${due ? `<span class="nav-badge" aria-label="${due} due">${due > 99 ? "99+" : due}</span>` : ""}</a>`;
    }).join("");
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
  document.title = (h1 && match.view !== todayView ? h1.textContent.trim() + " · " : "") + "Pattern Trace";
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

      <div class="section-title">Study plan</div>
      <div class="btn-row" style="justify-content:space-between;margin-bottom:12px"><label for="set-start">Plan start date</label>
        <input class="input" id="set-start" type="date" data-date="startDate" value="${s.startDate}" style="width:auto"></div>
      <div class="btn-row" style="justify-content:space-between;margin-bottom:12px"><span>Daily goal (minutes)</span>${seg("dailyMinutes", [[30, "30"], [60, "60"], [90, "90"], [120, "120"]])}</div>
      <div class="btn-row" style="justify-content:space-between"><span>New problems per day</span>${seg("newPerDay", [[1, "1"], [2, "2"], [3, "3"]])}</div>

      <div class="section-title">Clue drill</div>
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
        <button type="button" class="btn btn-sm btn-danger" data-reset ${attempts().length || solves().length ? "" : "disabled"}>Reset progress</button>
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
      if (await confirmDialog({ title: "Reset all progress?", body: `This deletes ${solves().length} solve attempts with their notes, ${attempts().length} drill answers and both review schedules. Settings are kept. Export first if you might want it back.`, confirm: "Reset", danger: true })) {
        resetProgress(); toast("Progress reset"); rerender();
      }
    }
  });
  d.addEventListener("change", async (e) => {
    const t = e.target.closest("[data-toggle]");
    if (t) { setSetting(t.dataset.toggle, t.checked); rerender(); }
    const dt = e.target.closest("[data-date]");
    if (dt && /^\d{4}-\d\d-\d\d$/.test(dt.value)) { setSetting(dt.dataset.date, dt.value); rerender(); }
    const f = e.target.closest("[data-import]");
    if (f && f.files[0]) {
      try {
        const text = await f.files[0].text();
        const raw = JSON.parse(text);
        if (!raw || raw.app !== "pattern-trace") throw new Error("That file isn't a Pattern Trace export.");
        close();
        const have = attempts().length + solves().length;
        if (have && !(await confirmDialog({ title: "Replace your current data?", body: `Importing replaces everything saved in this browser (${have} attempts and answers) with the contents of the file.`, confirm: "Replace", danger: true }))) return;
        const n = importData(text);
        toast(`Imported ${n} attempts and answers`); rerender();
      } catch (err) {
        toast(err.message && err.message.includes("Pattern Trace") ? err.message : "Couldn't read that file");
      }
    }
  });
  d.showModal();
}
const DEFAULT_TYPES = { sessionSize: 10, dailyMinutes: 90, newPerDay: 2 };

// Re-render the current view after a settings change, unless mid-drill (don't lose answers).
function rerender() {
  if (active?.view === drill || active?.view === solve) return;
  const y = window.scrollY;
  route();
  window.scrollTo(0, y);
}

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-settings]")) openSettings();
});

route();

/* ── Offline support ── */
// The worker is scoped to this folder and network-first, so it only matters when offline.
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}
