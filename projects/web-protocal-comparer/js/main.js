// App shell: hash router, navigation, theme.
import { ICON } from "./util.js";
import { subscribe, theme, setTheme, doneCount } from "./store.js";
import { LESSONS } from "./content/lessons.js";
import * as home from "./views/home.js";

// Only the home view is needed for the first screen. The others (the simulator, the protocol
// reference, the quiz bank) load when first opened, and are fetched ahead of time once the page is idle.
const lazy = (load) => { let p = null; return () => (p ||= load().catch((e) => { p = null; throw e; })); };
const VIEWS = {
  home: () => home,
  lesson: lazy(() => import("./views/lesson.js")),
  lab: lazy(() => import("./views/lab.js")),
  protocols: lazy(() => import("./views/protocols.js")),
  quiz: lazy(() => import("./views/quiz.js")),
};

const NAV = [
  { href: "#/", key: "learn", label: "Learn", icon: ICON.learn },
  { href: "#/lab", key: "lab", label: "Lab", icon: ICON.lab },
  { href: "#/protocols", key: "protocols", label: "Protocols", icon: ICON.protocols },
  { href: "#/quiz", key: "quiz", label: "Quiz", icon: ICON.quiz },
];
const ROUTES = [
  { re: /^\/?$/, view: "home", nav: "learn" },
  { re: /^\/learn\/([\w-]+)$/, view: "lesson", nav: "learn", param: "id" },
  { re: /^\/lab$/, view: "lab", nav: "lab" },
  { re: /^\/protocols$/, view: "protocols", nav: "protocols" },
  { re: /^\/protocols\/([\w-]+)$/, view: "protocols", nav: "protocols", param: "id" },
  { re: /^\/glossary$/, view: "protocols", nav: "protocols", param: "glossary", value: true },
  { re: /^\/quiz$/, view: "quiz", nav: "quiz" },
];

const main = document.getElementById("main");
let active = null, activeNav = "learn", first = true, routeGen = 0;

function renderNav() {
  document.querySelectorAll("[data-nav]").forEach((nav) => {
    nav.innerHTML = NAV.map((n) => `<a href="${n.href}" ${n.key === activeNav ? 'aria-current="page"' : ""}>${n.icon}<span>${n.label}</span></a>`).join("");
  });
  const done = doneCount(), total = LESSONS.length;
  document.querySelector("[data-course]").innerHTML = `
    <div class="streak-row"><span class="streak-num">${done}<span class="faint" style="font-size:14px">/${total}</span></span><span class="streak-lbl">lessons done</span></div>
    <div class="meter" style="margin-top:10px" aria-label="${Math.round((done / Math.max(1, total)) * 100)}% of the course complete"><i style="width:${(done / Math.max(1, total)) * 100}%"></i></div>`;
  const light = document.documentElement.dataset.theme === "light";
  document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
    b.innerHTML = (light ? ICON.moon : ICON.sun) + (b.closest(".side-links") ? `<span>${light ? "Dark" : "Light"} mode</span>` : "");
    b.setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode");
  });
}

async function route() {
  const path = (location.hash.replace(/^#/, "") || "/").split("?")[0];
  let match = null; const params = {};
  for (const r of ROUTES) {
    const m = path.match(r.re);
    if (m) { match = r; if (r.param) params[r.param] = r.value ?? decodeURIComponent(m[1]); break; }
  }
  if (!match) { location.replace("#/"); return; }
  const mine = ++routeGen;
  activeNav = match.nav;
  renderNav();
  let view;
  try {
    const loaded = VIEWS[match.view]();
    view = loaded instanceof Promise ? await loaded : loaded;
  } catch (err) {
    console.error(err);
    if (mine !== routeGen) return;
    if (active?.cleanup) active.cleanup();
    active = null;
    main.innerHTML = `<div class="empty" role="alert"><h3>This page didn't load</h3><p>Usually a dropped connection. Your progress is safe.</p><button type="button" class="btn" data-retry-route>Try again</button></div>`;
    main.querySelector("[data-retry-route]").addEventListener("click", route);
    return;
  }
  if (mine !== routeGen) return;   // the visitor navigated again while this view was loading
  if (active?.cleanup) active.cleanup();
  main.innerHTML = "";
  const host = document.createElement("div");
  main.appendChild(host);
  const cleanup = view.render(host, params);
  active = { view, cleanup };
  const h1 = host.querySelector("h1");
  document.title = (h1 && view !== home ? h1.textContent.trim() + " · " : "") + "Wire";
  window.scrollTo(0, 0);
  if (!first) main.focus({ preventScroll: true });
  first = false;
}

const mq = window.matchMedia("(prefers-color-scheme: light)");
function applyTheme() {
  const t = theme();
  document.documentElement.dataset.theme = t === "light" || (t === "system" && mq.matches) ? "light" : "dark";
}
mq.addEventListener?.("change", applyTheme);
applyTheme();

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-theme-toggle]")) {
    setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
    applyTheme();
    renderNav();
  }
});

window.addEventListener("hashchange", route);
subscribe(() => renderNav());
route();
// Warm the other views once the first screen is up, so moving between tabs stays instant.
(window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(() => { for (const k of ["lesson", "lab", "protocols", "quiz"]) VIEWS[k]().catch(() => {}); });
