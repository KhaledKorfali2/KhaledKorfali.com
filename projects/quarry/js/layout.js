// Workspace layout: lets the learner resize, collapse and rearrange the lesson
// and workspace panes, and remembers the arrangement. Desktop only; on narrow
// screens the app keeps its Lesson / Workspace tabs (see layout.css).
// This file is shared verbatim by Breach and Quarry.
import { el, icon } from "./ui.js";

const ICON = {
  layout: ["M4 5h16v14H4z", "M10 5v14"],
  hide: ["M5 12h14"],
};
const POSITIONS = ["left", "right", "top", "bottom"];
const DEFAULTS = { pos: "left", size: 39, collapsed: "none", text: 0 };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function loadPrefs(key, defaults) {
  try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v && typeof v === "object" ? { ...defaults, ...v } : { ...defaults }; }
  catch { return { ...defaults }; }
}
export function savePrefs(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: layout just isn't remembered */ } }

/** Pointer-drag helper. Works over iframes because the handle captures the pointer. */
export function drag(handle, { start, move, end }) {
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    e.preventDefault();
    try { handle.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer: plain events still work */ }
    document.body.classList.add("is-resizing");
    handle.classList.add("is-dragging");
    start?.(e);
    const onMove = (ev) => move(ev);
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("is-resizing");
      handle.classList.remove("is-dragging");
      end?.();
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  });
}

/**
 * initLayout({ split, brief, workspace, key, workLabel }) → cleanup
 * split: the element holding the two panes; key: localStorage key.
 */
export function initLayout({ split, brief, workspace, key, workLabel = "Workspace" }) {
  const s = loadPrefs(key, DEFAULTS);
  if (!POSITIONS.includes(s.pos)) s.pos = DEFAULTS.pos;
  if (!["none", "lesson", "work"].includes(s.collapsed)) s.collapsed = "none";
  s.size = clamp(Number(s.size) || DEFAULTS.size, 18, 82);
  s.text = clamp(Math.round(Number(s.text) || 0), -1, 4);

  const restore = el("button", { type: "button", class: "lay-restore", on: { click: () => set({ collapsed: "none" }) } });
  const gutter = el("div", { class: "lay-gutter", role: "separator", tabindex: "0", "aria-label": "Resize lesson and workspace (arrow keys; Enter hides the lesson)" }, restore);
  brief.after(gutter);
  split.classList.add("lay");

  const horizontal = () => s.pos === "left" || s.pos === "right";
  function set(patch) { Object.assign(s, patch); apply(); savePrefs(key, s); }

  // ── menu in the top bar ──
  const seg = (label, options, current, pick) => el("div", { class: "lay-group" }, el("span", { class: "lay-label", text: label }),
    el("div", { class: "lay-seg", role: "group", "aria-label": label }, options.map(([value, text, title]) =>
      el("button", { type: "button", text, title: title || null, "aria-pressed": String(current() === value), dataset: { v: String(value) }, on: { click: () => pick(value) } }))));
  const panel = el("div", { class: "lay-panel", hidden: true, role: "dialog", "aria-label": "Layout" },
    seg("Lesson position", [["left", "Left"], ["right", "Right"], ["top", "Top"], ["bottom", "Bottom"]], () => s.pos, (v) => set({ pos: v })),
    seg("Show", [["none", "Both"], ["work", "Lesson only"], ["lesson", `${workLabel} only`]], () => s.collapsed, (v) => set({ collapsed: v })),
    seg("Lesson text size", [[-1, "A−", "Smaller"], [0, "A", "Default"], [1, "A+", "Larger"]], () => 0, (v) => set({ text: v === 0 ? 0 : clamp(s.text + v, -1, 4) })),
    el("button", { type: "button", class: "btn btn-sm lay-reset", text: "Reset layout", on: { click: () => set({ ...DEFAULTS }) } }),
    el("p", { class: "lay-tip", text: "Drag the divider to resize; double-click it to reset. Ctrl+\\ hides or shows the lesson, Ctrl+Shift+\\ the other pane." }));
  const toggle = el("button", { type: "button", class: "btn btn-sm lay-toggle", "aria-expanded": "false", title: "Arrange the lesson and workspace", on: { click: () => openPanel(panel.hidden) } }, icon(ICON.layout, 14), "Layout");
  const menu = el("div", { class: "lay-menu" }, toggle, panel);
  document.querySelector(".top-right")?.prepend(menu);
  function openPanel(open) { panel.hidden = !open; toggle.setAttribute("aria-expanded", String(open)); }
  const onDocClick = (e) => { if (!menu.contains(e.target)) openPanel(false); };
  document.addEventListener("pointerdown", onDocClick);

  // ── per-pane hide buttons ──
  const hideLesson = el("button", { type: "button", class: "lay-min", title: "Hide the lesson (Ctrl+\\)", "aria-label": "Hide the lesson", on: { click: () => set({ collapsed: "lesson" }) } }, icon(ICON.hide, 14));
  const hideWork = el("button", { type: "button", class: "btn btn-sm lay-min", title: `Hide the ${workLabel.toLowerCase()} (Ctrl+Shift+\\)`, "aria-label": `Hide the ${workLabel.toLowerCase()}`, on: { click: () => set({ collapsed: "work" }) } }, icon(ICON.hide, 14));
  brief.querySelector(".crumbs")?.append(hideLesson);
  workspace.querySelector(".ws-actions")?.append(hideWork);

  function apply() {
    split.dataset.pos = s.pos;
    split.dataset.collapsed = s.collapsed;
    split.style.setProperty("--lay-size", `${s.size}%`);
    brief.style.fontSize = s.text ? `${15 + s.text * 1.5}px` : "";
    // The lesson body, code samples and hints have their own sizes; they read this multiplier.
    if (s.text) brief.style.setProperty("--lesson-scale", String((15 + s.text * 1.5) / 15)); else brief.style.removeProperty("--lesson-scale");
    gutter.setAttribute("aria-orientation", horizontal() ? "vertical" : "horizontal");
    gutter.setAttribute("aria-valuenow", String(Math.round(s.size)));
    restore.hidden = s.collapsed === "none";
    restore.textContent = s.collapsed === "lesson" ? "Show lesson" : `Show ${workLabel.toLowerCase()}`;
    panel.querySelectorAll(".lay-group").forEach((g, i) => {
      const cur = i === 0 ? s.pos : i === 1 ? s.collapsed : null;
      if (cur !== null) g.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === cur)));
    });
  }

  // ── divider: drag, double-click, keyboard ──
  let rect = null;
  drag(gutter, {
    start: () => { rect = split.getBoundingClientRect(); },
    move: (e) => {
      let pct = horizontal() ? ((e.clientX - rect.left) / rect.width) * 100 : ((e.clientY - rect.top) / rect.height) * 100;
      if (s.pos === "right" || s.pos === "bottom") pct = 100 - pct;
      // Dragging to an edge hides that pane.
      if (pct < 7) Object.assign(s, { collapsed: "lesson" });
      else if (pct > 93) Object.assign(s, { collapsed: "work" });
      else Object.assign(s, { collapsed: "none", size: clamp(pct, 18, 82) });
      apply();
    },
    end: () => savePrefs(key, s),
  });
  gutter.addEventListener("dblclick", (e) => { if (!e.target.closest("button")) set({ size: DEFAULTS.size, collapsed: "none" }); });
  gutter.addEventListener("keydown", (e) => {
    const grow = { left: "ArrowRight", right: "ArrowLeft", top: "ArrowDown", bottom: "ArrowUp" }[s.pos];
    const shrink = { left: "ArrowLeft", right: "ArrowRight", top: "ArrowUp", bottom: "ArrowDown" }[s.pos];
    if (e.key === grow) set({ size: clamp(s.size + 3, 18, 82), collapsed: "none" });
    else if (e.key === shrink) set({ size: clamp(s.size - 3, 18, 82), collapsed: "none" });
    else if (e.key === "Enter" && e.target === gutter) set({ collapsed: s.collapsed === "none" ? "lesson" : "none" });
    else return;
    e.preventDefault();
  });
  const onKey = (e) => {
    if (e.key === "Escape" && !panel.hidden) { openPanel(false); toggle.focus(); return; }
    if (!(e.ctrlKey || e.metaKey) || e.code !== "Backslash") return;
    e.preventDefault();
    const which = e.shiftKey ? "work" : "lesson";
    set({ collapsed: s.collapsed === which ? "none" : which });
  };
  document.addEventListener("keydown", onKey);

  apply();
  return () => {
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("pointerdown", onDocClick);
    menu.remove();
  };
}
