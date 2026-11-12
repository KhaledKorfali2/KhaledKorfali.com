// The console every course shares: schema browser, editor, results, and the goal
// tracker that awards the flag. Each course plugs in an engine (e-*.js) that
// knows how to run commands and check results. All output is rendered as text.
import { el, icon, ICONS, copy } from "../ui.js";
import { compareResult } from "./common.js";
import { drag, loadPrefs, savePrefs } from "../layout.js";

export const ENGINES = {
  mysql: () => import("./e-mysql.js"),
  sqlite: () => import("./e-sqlite.js"),
  postgres: () => import("./e-postgres.js"),
  mongo: () => import("./e-mongo.js"),
  pandas: () => import("./e-pandas.js"),
};

// Console preferences (panel sizes), unsaved queries per challenge, and run history.
const PREFS_KEY = "quarry.console", DRAFTS_KEY = "quarry.drafts";
const PREF_DEFAULTS = { schemaW: 210, editorH: 132, schema: true };
const history = [];
function saveDraft(id, text, starter) {
  const d = loadPrefs(DRAFTS_KEY, {});
  if (text === (starter || "") || !text.trim()) delete d[id]; else d[id] = text.slice(0, 8000);
  savePrefs(DRAFTS_KEY, d);
}

const MAX_ROWS = 200;
const fmt = (v) => (typeof v === "number" && !Number.isInteger(v) ? String(Number(v.toFixed(6))) : String(v));

/** mount(host, { challenge, ctx, seed }, api) → cleanup */
export async function mount(host, { challenge: c, ctx, seed }, api) {
  const mod = await ENGINES[c.engine || "mysql"]();
  const meta = mod.meta;
  const sess = await mod.open({ seed, challenge: c, ctx });

  // What "done" means for this challenge, worked out on the untouched data.
  let expected = null, checks = null;
  if (c.mode === "match") expected = await sess.expected(c.solution);
  if (c.mode === "verify") checks = await sess.resolve(c.checks);

  const editor = el("textarea", { class: "sq-editor", spellcheck: "false", autocapitalize: "off", autocomplete: "off", autocorrect: "off", rows: "6",
    "aria-label": "Editor", placeholder: meta.placeholder, value: loadPrefs(DRAFTS_KEY, {})[c.id] || c.starter || "" });
  const output = el("div", { class: "sq-result", "aria-live": "polite" });
  const goal = el("div", { class: "sq-goal" });
  const schema = el("div", { class: "sq-schema", "aria-label": "Schema" });
  let won = false, busy = false, queue = Promise.resolve();

  async function renderSchema() {
    const tables = await sess.tables();
    schema.replaceChildren(el("div", { class: "sq-h", text: meta.sidebar }),
      ...tables.map((t) => el("details", { class: "sq-table" },
        el("summary", {}, el("b", { text: t.name }), el("span", { class: "sq-dim", text: ` ${t.note}` })),
        el("ul", {}, t.cols.map((col) => el("li", {}, el("span", { text: col.name }), el("span", { class: "sq-dim", text: col.type })))),
        el("button", { class: "sq-btn sq-mini", type: "button", on: { click: () => { setEditor(t.preview); editor.setSelectionRange(0, 0); run(); } } }, "Preview"))));
  }

  function cell(v) {
    if (v == null) return el("td", { class: "sq-null", text: meta.id === "pandas" ? "NaN" : "NULL" });
    const text = fmt(v);
    return el("td", { class: typeof v === "number" ? "sq-num" : "", text, title: "Click to copy", on: { click: () => copy(text) } });
  }
  function block(r) {
    const head = r.stmt ? el("div", { class: "sq-stmt", dataset: { prompt: meta.prompt }, text: r.stmt.replace(/\s+/g, " ").slice(0, 160) + (r.stmt.length > 160 ? " …" : "") }) : null;
    if (r.kind === "error") return el("div", { class: "sq-block" }, head, el("div", { class: "sq-msg", dataset: { tone: "bad" }, text: r.message }));
    if (r.kind === "ok") return el("div", { class: "sq-block" }, head, el("div", { class: "sq-msg", text: r.message }));
    if (r.kind === "text" || r.kind === "docs") return el("div", { class: "sq-block" }, head, el("pre", { class: "sq-pre", text: r.text }));
    const n = r.rows.length;
    const note = r.note || (n === 0 ? "Empty set" : `${n} row${n === 1 ? "" : "s"}`);
    return el("div", { class: "sq-block" }, head,
      r.plain ? el("pre", { class: "sq-pre", text: r.plain }) : n ? el("div", { class: "sq-scroll" }, el("table", { class: "sq-grid" },
        el("thead", {}, el("tr", {}, r.columns.map((name) => el("th", { text: name })))),
        el("tbody", {}, r.rows.slice(0, MAX_ROWS).map((row) => el("tr", {}, row.map(cell)))))) : null,
      r.plain ? null : el("div", { class: "sq-msg", text: `${note}${n > MAX_ROWS ? ` (showing the first ${MAX_ROWS})` : ""}` }));
  }

  function win() {
    if (won) return;
    won = true;
    api.reveal(ctx.flag);
  }
  const shapeOf = (exp) => (sess.shape ? sess.shape(exp) : `${exp.rows.length} row${exp.rows.length === 1 ? "" : "s"} × ${exp.columns.length} column${exp.columns.length === 1 ? "" : "s"}`);
  const comparable = (r) => ({ columns: r.columns, rows: r.cmp || r.rows });
  async function renderGoal(results) {
    if (c.mode === "find") {
      goal.replaceChildren(el("div", { class: "sq-goal-line" }, icon(ICONS.flag, 14), el("span", { text: "The flag is somewhere in the data. Find it, copy it (click a cell), and submit it." })));
      return;
    }
    if (c.mode === "verify") {
      const state = [];
      for (const k of checks) state.push(await sess.check(k));
      goal.replaceChildren(el("div", { class: "sq-h", text: "Checklist" }),
        el("ul", { class: "sq-checks" }, checks.map((k, i) => el("li", { class: state[i] ? "is-ok" : "" }, icon(state[i] ? ICONS.check : ICONS.x, 13), el("span", { text: k.label })))));
      if (state.every(Boolean)) win();
      return;
    }
    // match
    const shape = `${shapeOf(expected)}${c.ordered ? ", in order" : ""}`;
    const line = (tone, text) => goal.replaceChildren(el("div", { class: "sq-goal-line", dataset: { tone } }, icon(tone === "ok" ? ICONS.check : ICONS.flag, 14), el("span", { text })));
    const mine = results && !results.some((r) => r.kind === "error") ? results.filter((r) => r.checkable).pop() : null;
    if (!mine) { if (!won) line("", `Target result: ${shape}. Produce exactly that to earn the flag.`); return; }
    const cmp = sess.compare ? sess.compare(mine, expected, c.ordered) : compareResult(comparable(mine), comparable(expected), c.ordered);
    if (cmp.ok && c.mustUse && !new RegExp(c.mustUse, "i").test(await sess.plan(mine.stmt))) {
      line("warn", "Right rows. But the server still can't seek into the index for this query: put EXPLAIN in front of it and look at the plan.");
      return;
    }
    if (cmp.ok) { line("ok", "Result matches the target."); win(); }
    else line("warn", `${cmp.msg} (Target: ${shape}.)`);
  }

  async function runNow(text, record) {
    if (!text.trim()) return;
    if (record && history[history.length - 1] !== editor.value) { history.push(editor.value); if (history.length > 50) history.shift(); }
    histAt = history.length;
    busy = true; runBtn.disabled = true;
    let results;
    try { results = await sess.run(text); }
    catch (e) { results = [{ kind: "error", stmt: text, message: `ERROR: ${e.message || e}` }]; }
    if (!results.length) results = [{ kind: "error", stmt: text.trim(), message: "Nothing to run: that was only a comment." }];
    output.replaceChildren(...results.map(block));
    output.scrollTop = 0;
    try { await renderSchema(); await renderGoal(results); }
    finally { busy = false; runBtn.disabled = false; syncRunLabel(); }
  }
  /** Runs are queued, so a second click (or a test) never overlaps the first. */
  function run() {
    // With text selected, run only the selection (handy for trying one statement of several).
    const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    const text = sel.trim() ? sel : editor.value;
    queue = queue.then(() => runNow(text, true));
    return queue;
  }

  let histAt = history.length, draftTimer = 0;
  const setEditor = (text) => { editor.value = text; saveDraft(c.id, text, c.starter); syncRunLabel(); };
  const syncRunLabel = () => { runBtn.textContent = busy ? "Running…" : editor.selectionStart !== editor.selectionEnd && document.activeElement === editor ? "Run selection" : "Run"; };
  editor.addEventListener("input", () => { clearTimeout(draftTimer); draftTimer = setTimeout(() => saveDraft(c.id, editor.value, c.starter), 400); });
  for (const ev of ["select", "keyup", "mouseup", "blur", "focus"]) editor.addEventListener(ev, syncRunLabel);
  editor.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
    else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      // Alt+Up / Alt+Down walk back and forth through what you've run.
      e.preventDefault();
      const to = histAt + (e.key === "ArrowUp" ? -1 : 1);
      if (to >= 0 && to < history.length) { histAt = to; setEditor(history[to]); }
    } else if (e.key === "Tab" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const s = editor.selectionStart;
      editor.setRangeText(meta.id === "pandas" ? "    " : "  ", s, editor.selectionEnd, "end");
    }
  });

  // ── resizable panels: schema width, editor height (remembered) ──
  const prefs = loadPrefs(PREFS_KEY, PREF_DEFAULTS);
  const runBtn = el("button", { class: "sq-btn sq-primary", type: "button", on: { mousedown: (e) => e.preventDefault(), click: run } }, "Run");
  const schemaBtn = el("button", { class: "sq-btn", type: "button", title: "Show or hide the list on the left", on: { click: () => { prefs.schema = !prefs.schema; applyPrefs(); savePrefs(PREFS_KEY, prefs); } } }, "Schema");
  const gutterX = el("div", { class: "sq-gutter sq-gutter-x", role: "separator", "aria-orientation": "vertical", title: "Drag to resize the list; double-click to reset" });
  const gutterY = el("div", { class: "sq-gutter sq-gutter-y", role: "separator", "aria-orientation": "horizontal", title: "Drag to resize the editor; double-click to reset" });
  function applyPrefs() {
    schema.hidden = gutterX.hidden = !prefs.schema;
    schemaBtn.setAttribute("aria-pressed", String(!!prefs.schema));
    schema.style.flexBasis = `${prefs.schemaW}px`;
    editor.style.height = `${prefs.editorH}px`;
  }
  let box = null;
  drag(gutterX, { start: () => { box = root.getBoundingClientRect(); }, move: (e) => { prefs.schemaW = Math.round(Math.min(Math.max(e.clientX - box.left, 120), Math.max(140, box.width - 260))); applyPrefs(); }, end: () => savePrefs(PREFS_KEY, prefs) });
  drag(gutterY, { start: () => { box = editor.getBoundingClientRect(); box.max = root.getBoundingClientRect().height - 170; }, move: (e) => { prefs.editorH = Math.round(Math.min(Math.max(e.clientY - box.top - 4, 56), Math.max(80, box.max))); applyPrefs(); }, end: () => savePrefs(PREFS_KEY, prefs) });
  gutterX.addEventListener("dblclick", () => { prefs.schemaW = PREF_DEFAULTS.schemaW; applyPrefs(); savePrefs(PREFS_KEY, prefs); });
  gutterY.addEventListener("dblclick", () => { prefs.editorH = PREF_DEFAULTS.editorH; applyPrefs(); savePrefs(PREFS_KEY, prefs); });

  const root = el("div", { class: "sq", dataset: { engine: meta.id } }, schema, gutterX,
    el("div", { class: "sq-main" },
      el("div", { class: "sq-top" }, editor,
        el("div", { class: "sq-bar" }, runBtn, schemaBtn,
          c.starter ? el("button", { class: "sq-btn", type: "button", title: "Put the starter text back in the editor", on: { click: () => { setEditor(c.starter); editor.focus(); } } }, "Starter") : null,
          el("span", { class: "sq-dim sq-keys", text: `${meta.note} · Ctrl+Enter runs · select text to run part · Alt+↑/↓ history` }))),
      gutterY, goal, output));
  host.append(root);
  applyPrefs();
  await renderSchema();
  await renderGoal(null);
  output.append(el("p", { class: "sq-empty", text: meta.whole ? "Output appears here. The value of the last line is shown, like a notebook cell." : "Results appear here. You can run several commands at once." }));
  root._console = { run: (s) => { editor.value = s; editor.setSelectionRange(s.length, s.length); return run(); }, sess };
  return () => { clearTimeout(draftTimer); saveDraft(c.id, editor.value, c.starter); sess.close(); root.remove(); };
}
