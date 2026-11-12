// Breach: router and views (map, challenge, toolkit, certifications, safety).
import { el, icon, ICONS, md, toast } from "./ui.js";
import * as store from "./store.js";
import { makeCtx, defaultCheck } from "./flags.js";
import { TRACKS, ALL, CERTS, byId, trackOf, isUnlocked } from "./challenges/index.js";
import { mountToolkit } from "./tools/toolkit.js";

const main = document.getElementById("main");
const ENGINES = {
  browser: () => import("./engines/browser.js"),
  files: () => import("./engines/files.js"),
  pcap: () => import("./engines/pcap.js"),
  sql: () => import("./engines/sql.js"),
};
let cleanup = null;

/* ───────────── Router ───────────── */
function route() {
  cleanup?.(); cleanup = null;
  const hash = location.hash.replace(/^#\/?/, "");
  const [view, arg] = hash.split("/");
  document.querySelectorAll("[data-nav]").forEach((a) => a.toggleAttribute("aria-current", a.dataset.nav === (view || "home") || (view === "c" && a.dataset.nav === "home")));
  if (view === "c" && byId(arg)) viewChallenge(byId(arg));
  else if (view === "tools") viewTools();
  else if (view === "certs") viewCerts();
  else if (view === "safety") viewSafety();
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
      el("p", { class: "eyebrow", text: "> hands-on cybersecurity" }),
      el("h1", {}, "Learn to break in.", el("br"), el("span", { class: "accent", text: "Then learn to keep others out." })),
      el("p", { class: "lead", text: "Every challenge hands you a real-feeling target: a website, a packet capture, a log file, an encoded message. Investigate it, extract the flag, prove it. You'll start at what a web page actually sends you and work up to the analysis skills real certifications test." }),
      el("div", { class: "hero-cta" },
        resume ? el("a", { class: "btn btn-primary", href: `#/c/${resume.id}` }, solved ? `Continue: ${resume.title}` : "Start with challenge 1", icon(ICONS.next, 16)) : el("span", { class: "btn btn-primary", text: "Everything solved. Respect." }),
        el("a", { class: "btn", href: "#/certs", text: "How this maps to certifications" }))),
    el("div", { class: "hero-stat" },
      ring(pct),
      el("div", {}, el("b", { text: `${solved} of ${ALL.length}` }), el("span", { text: "flags captured" })),
      el("ul", { class: "hero-tracks" }, TRACKS.map((t) => {
        const n = t.list.filter((c) => store.isSolved(c.id)).length;
        return el("li", {}, el("span", { text: t.title }), el("span", { class: "mono", text: `${n}/${t.list.length}` }));
      }))));

  const tracks = el("section", { class: "tracks", "aria-label": "Tracks" }, TRACKS.map((t, ti) => {
    const done = t.list.filter((c) => store.isSolved(c.id)).length;
    return el("article", { class: "track" },
      el("header", { class: "track-head" },
        el("span", { class: "track-num", text: String(ti + 1).padStart(2, "0") }),
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

  main.replaceChildren(el("div", { class: "page" }, hero, tracks,
    el("footer", { class: "foot" },
      el("p", {}, "Breach runs entirely in your browser. Nothing you type is sent anywhere. ", el("a", { href: "#/safety", text: "How it's kept safe →" })),
      el("button", { type: "button", class: "linkish", text: "Reset progress", on: { click: () => {
        if (confirm("Reset all progress? You'll get brand-new flags for every challenge.")) { store.reset(); route(); toast("Progress reset"); }
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
  const ctx = makeCtx(store.seed(), c);
  const idx = track.list.indexOf(c);
  const next = track.list[idx + 1] || TRACKS[TRACKS.indexOf(track) + 1]?.list[0];

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

  const answer = el("input", { class: "answer", type: "text", spellcheck: "false", autocapitalize: "off", autocomplete: "off",
    "aria-label": c.answerLabel || "Flag", placeholder: c.answerPlaceholder || "BREACH{…}" });
  const feedback = el("p", { class: "feedback", role: "status", "aria-live": "polite" });
  const form = el("form", { class: "submit", on: { submit: (e) => { e.preventDefault(); submit(); } } },
    el("label", { class: "submit-label", text: c.answerLabel || "Flag" }),
    el("div", { class: "submit-row" }, answer, el("button", { class: "btn btn-primary", type: "submit" }, icon(ICONS.flag, 15), "Submit")),
    feedback);
  const debrief = el("section", { class: "debrief", hidden: true });

  let env = null;
  async function submit() {
    const v = answer.value;
    if (!v.trim()) { feedback.textContent = "Paste or type your answer first."; feedback.dataset.tone = ""; return; }
    let ok = false;
    try { ok = c.check ? await c.check(v, ctx, env) : defaultCheck(v, ctx); } catch (err) { console.error(err); }
    if (!ok) {
      store.addAttempt(c.id);
      feedback.dataset.tone = "bad";
      feedback.textContent = /^BREACH\{/i.test(v.trim()) && !c.check ? "That's a flag format, but not this challenge's flag. Flags are unique to you, so a copied one won't work." : "Not quite. Keep digging.";
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
      el("div", { class: "solved-banner" }, icon(ICONS.check, 20), el("div", {}, el("b", { text: first ? "Flag captured" : "Solved" }), el("span", { text: c.answerLabel ? `${c.answerLabel} confirmed.` : "Nice work." }))),
      el("div", { class: "prose" }, md(c.debrief)),
      el("div", { class: "debrief-actions" },
        next ? el("a", { class: "btn btn-primary", href: `#/c/${next.id}` }, `Next: ${next.title}`, icon(ICONS.next, 16)) : el("a", { class: "btn btn-primary", href: "#/", text: "Back to the map" }),
        el("a", { class: "btn", href: "#/", text: "Map" })));
    if (first) debrief.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const brief = el("section", { class: "brief", "aria-label": "Briefing" },
    el("nav", { class: "crumbs" }, el("a", { href: "#/", text: "Map" }), el("span", { text: "/" }), el("span", { text: track.title })),
    el("h1", { text: c.title }),
    el("div", { class: "meta" }, pips(c.level), el("span", { class: "mono", text: `~${c.time} min` }),
      c.certs.map((x) => el("span", { class: "cert-chip", text: x }))),
    el("div", { class: "objective" }, icon(ICONS.flag, 16), el("p", { text: c.objective })),
    el("div", { class: "prose" }, md(c.lesson)),
    hintsBox, form, debrief);

  // ── workspace (right) ──
  const reveal = el("div", { class: "reveal", hidden: true, role: "status", "aria-live": "polite" });
  const ws = el("div", { class: "ws-body" });
  const toolDrawer = el("aside", { class: "drawer", hidden: true, "aria-label": "Toolkit" });
  const wsHead = el("div", { class: "ws-head" },
    el("span", { class: "ws-title" }, icon(wsIcon(c.workspace.type), 15), wsName(c.workspace.type)),
    el("span", { class: "ws-actions" },
      el("button", { type: "button", class: "btn btn-sm", on: { click: () => restart() } }, icon(ICONS.refresh, 14), "Reset target"),
      el("button", { type: "button", class: "btn btn-sm", "aria-expanded": "false", on: { click: (e) => toggleDrawer(e.currentTarget) } }, icon(ICONS.tool, 14), "Toolkit")));
  const workspace = el("section", { class: "workspace", "aria-label": "Target" }, wsHead, reveal, el("div", { class: "ws-stage" }, ws, toolDrawer));
  let tk = null;
  function toggleDrawer(btn) {
    toolDrawer.hidden = !toolDrawer.hidden;
    btn.setAttribute("aria-expanded", String(!toolDrawer.hidden));
    if (!toolDrawer.hidden && !tk) {
      tk = true;
      toolDrawer.append(el("div", { class: "drawer-head" }, el("b", { text: "Toolkit" }),
        el("button", { type: "button", class: "icon-btn", "aria-label": "Close toolkit", on: { click: () => toggleDrawer(btn) } }, icon(ICONS.x, 16))));
      const box = el("div", { class: "drawer-body" });
      toolDrawer.append(box);
      mountToolkit(box, { compact: true });
    }
  }

  const api = {
    ctx,
    flag: ctx.flag,
    toast,
    reveal(text) {
      reveal.hidden = false;
      reveal.replaceChildren(icon(ICONS.flag, 16), el("span", { text: String(text) }),
        el("button", { type: "button", class: "btn btn-sm", text: "Use as answer", on: { click: () => { answer.value = String(text).match(/BREACH\{[^}]+\}/)?.[0] || String(text); answer.focus(); } } }));
    },
  };
  let engineCleanup = null;
  async function restart() {
    engineCleanup?.(); engineCleanup = null;
    reveal.hidden = true;
    ws.replaceChildren(el("p", { class: "ws-loading", text: "Booting target…" }));
    try {
      env = await c.setup(ctx);
      // Mount into a fresh stage so no loading text lingers above the engine.
      const stage = el("div", { class: "engine-stage" });
      ws.replaceChildren(stage);
      if (c.workspace.type === "custom") engineCleanup = c.workspace.mount(stage, env, api) || null;
      else {
        const mod = await ENGINES[c.workspace.type]();
        engineCleanup = mod.mount(stage, env, api) || null;
      }
    } catch (err) {
      console.error(err);
      ws.replaceChildren(el("p", { class: "ws-loading", text: `The target failed to start: ${err.message}` }));
    }
  }

  // mobile: Brief / Target tabs
  const tabs = el("div", { class: "split-tabs", role: "tablist" },
    ["Brief", "Target"].map((name, i) => el("button", { type: "button", role: "tab", "aria-selected": String(i === 0), text: name, on: { click: (e) => {
      layout.dataset.pane = i ? "target" : "brief";
      tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b === e.currentTarget)));
    } } })));
  const layout = el("div", { class: "split", dataset: { pane: "brief" } }, brief, workspace);
  main.replaceChildren(el("div", { class: "challenge" }, tabs, layout));
  if (store.isSolved(c.id)) showSolved(false);
  await restart();
  cleanup = () => engineCleanup?.();
}
const wsName = (t) => ({ terminal: "Terminal", browser: "Browser", files: "Evidence", pcap: "Packet capture", sql: "Database console", stack: "Memory", custom: "Target" })[t] || "Target";
const wsIcon = (t) => ({ terminal: ICONS.term, browser: ICONS.globe, files: ICONS.file, pcap: ICONS.wave, sql: ICONS.db, stack: ICONS.chip })[t] || ICONS.flag;

/* ───────────── Toolkit page ───────────── */
function viewTools() {
  const box = el("div", { class: "tools-box" });
  main.replaceChildren(el("div", { class: "page" },
    el("header", { class: "page-head" }, el("h1", { text: "Toolkit" }),
      el("p", { class: "lead", text: "Decode, decrypt, hash and convert, all locally. It's also one click away inside every challenge." })),
    box));
  mountToolkit(box);
}

/* ───────────── Certifications ───────────── */
function viewCerts() {
  main.replaceChildren(el("div", { class: "page" },
    el("header", { class: "page-head" }, el("h1", { text: "Certifications" }),
      el("p", { class: "lead", text: "Breach is built around the hands-on skills behind the best-known security certifications. Here's what each one covers, and which challenges train for it." })),
    el("div", { class: "callout" }, md("**Be realistic.** Breach builds practical skill and intuition for the analysis and defense side of these exams, but no single resource is enough on its own. Each exam has an official objectives list: download it, tick off topics as you meet them here, and pair Breach with a study guide and practice exams. The hands-on certifications also expect live tooling and lab time beyond what a browser can simulate.")),
    el("div", { class: "cert-grid" }, CERTS.map((cert) => {
      const list = ALL.filter((c) => c.certs.includes(cert.id));
      const done = list.filter((c) => store.isSolved(c.id)).length;
      return el("article", { class: "cert" },
        el("header", {}, el("div", {}, el("h2", { text: cert.id }), el("span", { class: "cert-org", text: `${cert.org} · ${cert.level}` })),
          el("span", { class: "mono cert-count", text: `${done}/${list.length}` })),
        el("div", { class: "bar" }, el("i", { style: { width: `${list.length ? (done / list.length) * 100 : 0}%` } })),
        el("p", { text: cert.about }),
        el("details", {}, el("summary", { text: `${list.length} challenges` }),
          el("ul", { class: "cert-list" }, list.map((c) => el("li", {}, el("a", { href: `#/c/${c.id}`, class: store.isSolved(c.id) ? "is-done" : "" }, store.isSolved(c.id) ? "✓ " : "", c.title))))));
    }))));
}

/* ───────────── Safety ───────────── */
function viewSafety() {
  main.replaceChildren(el("div", { class: "page narrow" },
    el("header", { class: "page-head" }, el("h1", { text: "How Breach stays safe" }),
      el("p", { class: "lead", text: "Breach asks you to attack things. It's built so that what you do can only ever affect your own simulation." })),
    el("div", { class: "prose" }, md(`### Every target is simulated
The websites, servers, terminals and networks are **simulations written in JavaScript that run inside your browser tab**. No request ever leaves your machine to "attack" anything. The SQL database, the Linux shell and the web servers are all built into the app.

### Attack code runs in a sealed box
Pages that can contain your payloads (XSS and the like) render inside a **sandboxed iframe** with an *opaque origin*:
- It can't read this site's storage or cookies, or those of any other project here.
- It can't reach the network. Its Content Security Policy is \`default-src 'none'\`.
- It can't navigate the main page or open popups.

The "attacker.example" server you exfiltrate data to is pretend too. Requests are caught before they leave the sandbox.

### The app itself is locked down
- The main page has a strict **Content Security Policy**: only its own scripts, no inline script, and no network connections.
- Everything you type is treated as text, never as HTML, so you can't inject into Breach itself, only into the targets.

### Your progress is yours
Progress lives in your browser's local storage. There are no accounts and no server, and nothing you do can affect another learner. Flags are generated per browser, so they can't be shared either.

### Use these skills legally
Outside a lab, only test systems you own or have **written permission** to test. Bug bounty programmes, CTF events and practice ranges are the legitimate places to keep going.`))));
}

route();
