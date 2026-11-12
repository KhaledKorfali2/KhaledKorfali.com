// Datum: router and views (map, challenge, reference, roadmap).
import { el, icon, ICONS, md, toast } from "./ui.js";
import * as store from "./store.js";
import { initLayout } from "./layout.js";
import { makeCtx, checkFlag } from "./flags.js";
import { TRACKS, UPCOMING, ALL, byId, trackOf, isUnlocked } from "./challenges/index.js";
import { REFERENCE, PRINTING, SANDBOX } from "./reference.js";

const main = document.getElementById("main");
let cleanup = null;

/* ───────────── Router ───────────── */
function route() {
  cleanup?.(); cleanup = null;
  const [view, arg] = location.hash.replace(/^#\/?/, "").split("/");
  document.querySelectorAll("[data-nav]").forEach((a) => a.toggleAttribute("aria-current", a.dataset.nav === (view || "home") || (view === "c" && a.dataset.nav === "home")));
  if (view === "c" && byId(arg)) viewChallenge(byId(arg));
  else if (view === "reference") viewReference();
  else if (view === "roadmap") viewRoadmap();
  else viewHome();
  updateScore();
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

function updateScore() {
  document.querySelector("[data-score]").textContent = `${store.solvedCount()} / ${ALL.length} flags`;
}
const unlocked = (c) => isUnlocked(c, store.isSolved);
const nextUp = () => ALL.find((c) => !store.isSolved(c.id) && unlocked(c));
const pips = (n) => el("span", { class: "pips", "aria-label": `Difficulty ${n} of 5`, title: `Difficulty ${n}/5` },
  [1, 2, 3, 4, 5].map((i) => el("i", { class: i <= n ? "on" : "" })));

/* ───────────── Map (home) ───────────── */
function viewHome() {
  const solved = store.solvedCount();
  const next = nextUp();
  const last = store.lastVisited() && byId(store.lastVisited());
  const resume = last && !store.isSolved(last.id) ? last : next;
  const pct = Math.round((solved / ALL.length) * 100);

  const hero = el("section", { class: "hero" },
    el("div", { class: "hero-copy" },
      el("p", { class: "eyebrow", text: "> hands-on CAD" }),
      el("h1", {}, "Learn CAD", el("br"), el("span", { class: "accent", text: "by building the part." })),
      el("p", { class: "lead", text: "Every challenge shows you a part and a drawing. Sketch it, extrude it, cut it, round it, and when your solid matches the target you capture the flag. Start with no experience; finish designing real parts you can export and 3D print." }),
      el("div", { class: "hero-cta" },
        resume ? el("a", { class: "btn btn-primary", href: `#/c/${resume.id}` }, solved ? `Continue: ${resume.title}` : "Build your first solid", icon(ICONS.next, 16)) : el("span", { class: "btn btn-primary", text: "Every flag captured. Well done." }),
        el("a", { class: "btn", href: "#/reference", text: "CAD reference" }))),
    el("div", { class: "hero-stat" },
      ring(pct),
      el("div", {}, el("b", { text: `${solved} of ${ALL.length}` }), el("span", { text: "flags captured" })),
      el("ul", { class: "hero-tracks" }, TRACKS.map((t) => {
        const n = t.list.filter((c) => store.isSolved(c.id)).length;
        return el("li", {}, el("span", { text: t.title }), el("span", { class: "mono", text: `${n}/${t.list.length}` }));
      }))));

  let num = 0;
  const courses = el("section", { class: "tracks", "aria-label": "Course" },
    el("header", { class: "course-head" }, el("h2", {}, icon(ICONS.layers, 20), "Parametric modelling course"), el("p", { text: "The sketch-and-feature workflow used by Fusion 360, Onshape, SolidWorks and FreeCAD, taught on a real CAD kernel in your browser." })),
    TRACKS.map((t) => {
      const done = t.list.filter((c) => store.isSolved(c.id)).length;
      return el("article", { class: "track" },
        el("header", { class: "track-head" },
          el("span", { class: "track-num", text: String(++num).padStart(2, "0") }),
          el("div", {}, el("h2", {}, icon(ICONS[t.icon] || ICONS.flag, 18), t.title), el("p", { text: t.blurb })),
          el("span", { class: "track-count mono", text: `${done}/${t.list.length}` })),
        el("ol", { class: "nodes" }, t.list.map((c) => {
          const ok = store.isSolved(c.id), open = unlocked(c);
          const isNext = next && next.id === c.id;
          return el("li", {}, el(open ? "a" : "span", {
            class: `node${ok ? " is-done" : ""}${open ? "" : " is-locked"}${isNext ? " is-next" : ""}`,
            ...(open ? { href: `#/c/${c.id}` } : { "aria-disabled": "true", title: "Solve the previous challenge to unlock" }),
          },
          el("span", { class: "node-ico" }, icon(ok ? ICONS.check : open ? ICONS.flag : ICONS.lock, 14)),
          el("span", { class: "node-title", text: c.title }),
          el("span", { class: "node-meta" }, pips(c.level), el("span", { class: "mono", text: `~${c.time}m` }))));
        })));
    }));

  const soon = el("section", { class: "soon", "aria-label": "Coming next" },
    el("header", { class: "course-head" }, el("h2", {}, icon(ICONS.map, 20), "Coming next"), el("p", {}, "More tracks are planned on the same kernel and the same build-to-match format. ", el("a", { href: "#/roadmap", text: "See the roadmap →" }))),
    el("div", { class: "soon-grid" }, UPCOMING.map((u) => el("article", { class: "soon-card" },
      el("h3", {}, icon(ICONS[u.icon] || ICONS.db, 16), u.title, el("span", { class: "soon-tag", text: "planned" })),
      el("p", { text: u.blurb })))));

  main.replaceChildren(el("div", { class: "page" }, hero, courses, soon,
    el("footer", { class: "foot" },
      el("p", {}, "Datum runs entirely in your browser; your models never leave it. ", el("a", { href: "#/reference", text: "How this workbench differs from professional CAD →" })),
      el("button", { type: "button", class: "linkish", text: "Reset progress", on: { click: () => {
        if (confirm("Reset all progress? Your flags change and saved models stay in this browser until you reset each one.")) { store.reset(); route(); toast("Progress reset"); }
      } } }))));
}

function ring(pct) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 80 80"); svg.setAttribute("class", "ring"); svg.setAttribute("aria-hidden", "true");
  const mk = (cls, dash) => { const c = document.createElementNS(ns, "circle"); c.setAttribute("cx", 40); c.setAttribute("cy", 40); c.setAttribute("r", 34); c.setAttribute("class", cls); if (dash !== undefined) { c.setAttribute("stroke-dasharray", "213.6"); c.setAttribute("stroke-dashoffset", String(213.6 * (1 - dash))); } return c; };
  svg.append(mk("ring-bg"), mk("ring-fg", pct / 100));
  const t = document.createElementNS(ns, "text"); t.setAttribute("x", 40); t.setAttribute("y", 45); t.setAttribute("text-anchor", "middle"); t.textContent = `${pct}%`;
  svg.append(t);
  return svg;
}

/* ───────────── Challenge ───────────── */
async function viewChallenge(c) {
  if (!unlocked(c)) {
    main.replaceChildren(el("div", { class: "page narrow" }, el("h1", { text: "Locked" }),
      el("p", { class: "lead", text: "Solve the previous challenge in this track first." }),
      el("a", { class: "btn", href: "#/", text: "Back to the map" })));
    return;
  }
  store.visit(c.id);
  const track = trackOf(c);
  const flagCtx = makeCtx(store.seed(), c);
  const idx = track.list.indexOf(c);
  const next = track.list[idx + 1] || TRACKS[TRACKS.indexOf(track) + 1]?.list[0];
  const prev = track.list[idx - 1];

  // ── brief (left) ──
  const hintsBox = el("div", { class: "hints" });
  const renderHints = () => {
    const used = Math.min(store.hintsUsed(c.id), c.hints.length);
    hintsBox.replaceChildren(
      ...c.hints.slice(0, used).map((h, i) => el("div", { class: "hint" }, el("b", { text: `Hint ${i + 1}` }), md(h))),
      used < c.hints.length ? el("button", { type: "button", class: "btn btn-ghost", on: { click: () => { store.useHint(c.id); renderHints(); } } },
        icon(ICONS.bulb, 15), used ? `Another hint (${used}/${c.hints.length})` : `Stuck? Reveal a hint (${c.hints.length} available)`) : null);
  };
  renderHints();

  const answer = el("input", { class: "answer", type: "text", spellcheck: "false", autocapitalize: "off", autocomplete: "off", "aria-label": "Flag", placeholder: "DATUM{…}" });
  const feedback = el("p", { class: "feedback", role: "status", "aria-live": "polite" });
  const form = el("form", { class: "submit", on: { submit: (e) => { e.preventDefault(); submit(); } } },
    el("label", { class: "submit-label", text: "Flag" }),
    el("div", { class: "submit-row" }, answer, el("button", { class: "btn btn-primary", type: "submit" }, icon(ICONS.flag, 15), "Submit")),
    feedback);
  const debrief = el("section", { class: "debrief", hidden: true });

  function submit() {
    const v = answer.value;
    if (!v.trim()) { feedback.textContent = "Paste or type the flag first."; feedback.dataset.tone = ""; return; }
    if (!checkFlag(v, flagCtx)) {
      store.addAttempt(c.id);
      feedback.dataset.tone = "bad";
      feedback.textContent = /^DATUM\{/i.test(v.trim()) ? "That's a flag format, but not this challenge's flag. Flags are unique to you, so a copied one won't work." : "Not quite. A flag looks like DATUM{…}.";
      answer.select();
      return;
    }
    const first = !store.isSolved(c.id);
    store.markSolved(c.id);
    updateScore();
    showSolved(first);
  }
  function showSolved(first) {
    form.hidden = true;
    debrief.hidden = false;
    debrief.replaceChildren(
      el("div", { class: "solved-banner" }, icon(ICONS.check, 20), el("div", {}, el("b", { text: first ? "Flag captured" : "Solved" }), el("span", { text: "Nice work. The workbench stays live if you want to keep modelling." }))),
      el("div", { class: "prose" }, md(c.debrief)),
      el("div", { class: "debrief-actions" },
        next ? el("a", { class: "btn btn-primary", href: `#/c/${next.id}` }, `Next: ${next.title}`, icon(ICONS.next, 16)) : el("a", { class: "btn btn-primary", href: "#/", text: "Back to the map" }),
        el("a", { class: "btn", href: "#/", text: "Map" })));
    if (first) debrief.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const brief = el("section", { class: "brief", "aria-label": "Briefing" },
    el("nav", { class: "crumbs" }, el("a", { href: "#/", text: "Map" }), el("span", { text: "/" }), el("span", { text: track.title }),
      el("span", { class: "crumbs-nav" },
        prev ? el("a", { href: `#/c/${prev.id}`, title: `Previous: ${prev.title}`, text: "‹ Prev" }) : null,
        next && unlocked(next) ? el("a", { href: `#/c/${next.id}`, title: `Next: ${next.title}`, text: "Next ›" }) : next ? el("span", { title: "Solve this challenge to unlock the next one", text: "Next ›" }) : null)),
    el("h1", { text: c.title }),
    el("div", { class: "meta" }, pips(c.level), el("span", { class: "mono", text: `~${c.time} min` }), c.tags.map((x) => el("span", { class: "cert-chip", text: x }))),
    el("div", { class: "objective" }, icon(ICONS.flag, 16), el("p", { text: c.objective })),
    el("div", { class: "prose" }, md(c.lesson)),
    hintsBox, form, debrief);

  // ── workspace (right) ──
  const reveal = el("div", { class: "reveal", hidden: true, role: "status", "aria-live": "polite" });
  const ws = el("div", { class: "ws-body" });
  const wsHead = el("div", { class: "ws-head" },
    el("span", { class: "ws-title" }, icon(ICONS.layers, 15), "Workbench"),
    el("span", { class: "ws-actions" },
      el("button", { type: "button", class: "btn btn-sm", title: "Throw away your model and start this challenge again", on: { click: () => { if (confirm("Discard your model for this challenge and start again?")) restart(true); } } }, icon(ICONS.refresh, 14), "Reset model")));
  const workspace = el("section", { class: "workspace", "aria-label": "Workbench" }, wsHead, reveal, el("div", { class: "ws-stage" }, ws));

  const api = {
    toast,
    reveal(flag) {
      reveal.hidden = false;
      reveal.replaceChildren(...[icon(ICONS.flag, 16), el("span", { text: `Part matches. Your flag: ${flag}` }),
        store.isSolved(c.id) ? null : el("button", { type: "button", class: "btn btn-sm", text: "Capture flag", on: { click: () => { answer.value = flag; layout.dataset.pane = "brief"; syncTabs(); submit(); } } })].filter(Boolean));
    },
  };
  let engineCleanup = null, gen = 0;
  async function restart(fresh = false) {
    const mine = ++gen;
    engineCleanup?.(); engineCleanup = null;
    reveal.hidden = true;
    ws.replaceChildren(el("p", { class: "ws-loading", text: "Loading the CAD kernel… (a one-time download of about 7 MB; later visits start instantly)" }));
    try {
      const mod = await import("./cad/workbench.js");
      const stage = el("div", { class: "engine-stage" });
      const stop = await mod.mount(stage, { challenge: c, ctx: makeCtx(store.seed(), c), fresh }, api);
      if (mine === gen) ws.replaceChildren(stage);
      if (mine !== gen) { stop(); return; }
      engineCleanup = stop;
    } catch (err) {
      console.error(err);
      if (mine === gen) ws.replaceChildren(el("p", { class: "ws-loading", text: `The workbench failed to start: ${err.message}` }));
    }
  }

  // mobile: Lesson / Console tabs
  const tabs = el("div", { class: "split-tabs", role: "tablist" },
    ["Lesson", "Workbench"].map((name, i) => el("button", { type: "button", role: "tab", "aria-selected": String(i === 0), text: name, on: { click: () => { layout.dataset.pane = i ? "target" : "brief"; syncTabs(); } } })));
  const syncTabs = () => tabs.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-selected", String((layout.dataset.pane === "target") === (i === 1))));
  const layout = el("div", { class: "split", dataset: { pane: "brief" } }, brief, workspace);
  main.replaceChildren(el("div", { class: "challenge" }, tabs, layout));
  if (store.isSolved(c.id)) showSolved(false);
  const stopLayout = initLayout({ split: layout, brief, workspace, key: "datum.layout", workLabel: "Workbench" });
  cleanup = () => { gen++; stopLayout(); engineCleanup?.(); };
  await restart();
}

/* ───────────── Reference ───────────── */
function viewReference() {
  main.replaceChildren(el("div", { class: "page narrow" },
    el("header", { class: "page-head" }, el("h1", { text: "CAD reference" }),
      el("p", { class: "lead", text: "The vocabulary and the workflow this course teaches, on one page." })),
    el("div", { class: "prose" }, md(REFERENCE)),
    el("header", { class: "page-head" }, el("h1", { text: "Designing for 3D printing" })),
    el("div", { class: "prose" }, md(PRINTING)),
    el("header", { class: "page-head" }, el("h1", { text: "This workbench vs. professional CAD" })),
    el("div", { class: "prose" }, md(SANDBOX))));
}

/* ───────────── Roadmap ───────────── */
function viewRoadmap() {
  main.replaceChildren(el("div", { class: "page narrow" },
    el("header", { class: "page-head" }, el("h1", { text: "Roadmap" }),
      el("p", { class: "lead", text: "Datum starts with the core of part modelling. These are planned next, roughly in this order." })),
    el("div", { class: "soon-grid one" }, UPCOMING.map((u, i) => el("article", { class: "soon-card" },
      el("h3", {}, icon(ICONS[u.icon] || ICONS.layers, 16), `${i + 1}. ${u.title}`, el("span", { class: "soon-tag", text: "planned" })),
      el("p", { text: u.blurb }))))));
}


route();
