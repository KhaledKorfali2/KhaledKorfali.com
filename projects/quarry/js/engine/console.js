// The database console: schema browser, SQL editor, results, and the goal
// tracker that awards the flag. All output is rendered as text nodes.
import { el, icon, ICONS, copy } from "../ui.js";
import { createSession, compareResult } from "./mysql.js";
import { buildShop } from "../data/shop.js";
import { drag, loadPrefs, savePrefs } from "../layout.js";

// Console preferences (panel sizes), unsaved queries per challenge, and run history.
const PREFS_KEY = "quarry.console", DRAFTS_KEY = "quarry.drafts";
const PREF_DEFAULTS = { schemaW: 210, editorH: 132, schema: true };
const history = [];
function saveDraft(id, text, starter) {
  const d = loadPrefs(DRAFTS_KEY, {});
  if (text === (starter || "") || !text.trim()) delete d[id]; else d[id] = text.slice(0, 8000);
  savePrefs(DRAFTS_KEY, d);
}

let sqlPromise = null;
/** Load the SQLite WebAssembly module once (vendor/sql-wasm.js defines initSqlJs). */
export function loadSql() {
  if (!sqlPromise) {
    if (typeof window.initSqlJs !== "function") return Promise.reject(new Error("the database engine script (vendor/sql-wasm.js) did not load"));
    sqlPromise = window.initSqlJs({ locateFile: (f) => `vendor/${f}` });
  }
  return sqlPromise;
}

const shopCache = new Map();
const shopFor = (seed) => { if (!shopCache.has(seed)) shopCache.set(seed, buildShop(seed)); return shopCache.get(seed); };

const MAX_ROWS = 200;
const fmt = (v) => (typeof v === "number" && !Number.isInteger(v) ? String(Number(v.toFixed(6))) : String(v));

/** mount(host, { challenge, ctx, seed }, api) → cleanup */
export async function mount(host, { challenge: c, ctx, seed }, api) {
  const SQL = await loadSql();
  const sess = createSession(SQL, [...shopFor(seed), ...(c.setup ? c.setup(ctx) : [])]);

  // What "done" means for this challenge, worked out on the untouched database.
  let expected = null, checks = null;
  if (c.mode === "match") expected = sess.run(c.solution).filter((r) => r.kind === "rows").pop();
  if (c.mode === "verify") checks = sess.resolve(c.checks);

  const editor = el("textarea", { class: "sq-editor", spellcheck: "false", autocapitalize: "off", autocomplete: "off", autocorrect: "off", rows: "6",
    "aria-label": "SQL editor", placeholder: "Type SQL here, then press Run (Ctrl+Enter)", value: loadPrefs(DRAFTS_KEY, {})[c.id] || c.starter || "" });
  const output = el("div", { class: "sq-result", "aria-live": "polite" });
  const goal = el("div", { class: "sq-goal" });
  const schema = el("div", { class: "sq-schema", "aria-label": "Schema" });
  let won = false;

  function renderSchema() {
    const tables = sess.tables();
    schema.replaceChildren(el("div", { class: "sq-h", text: "shop" }),
      ...tables.map((t) => el("details", { class: "sq-table" },
        el("summary", {}, el("b", { text: t.name }), el("span", { class: "sq-dim", text: t.type === "view" ? " view" : ` ${t.rows}` })),
        el("ul", {}, t.cols.map((col) => el("li", {}, el("span", { text: col.name }), el("span", { class: "sq-dim", text: `${col.type}${col.key ? " · " + col.key : ""}` })))),
        el("button", { class: "sq-btn sq-mini", type: "button", on: { click: () => { setEditor(`SELECT *\nFROM ${t.name}\nLIMIT 10;`); editor.setSelectionRange(0, 0); run(); } } }, "Preview"))));
  }

  function cell(v) {
    if (v == null) return el("td", { class: "sq-null", text: "NULL" });
    const text = fmt(v);
    return el("td", { class: typeof v === "number" ? "sq-num" : "", text, title: "Click to copy", on: { click: () => copy(text) } });
  }
  function block(r) {
    const head = el("div", { class: "sq-stmt", text: r.stmt.replace(/\s+/g, " ").slice(0, 160) + (r.stmt.length > 160 ? " …" : "") });
    if (r.kind === "error") return el("div", { class: "sq-block" }, head, el("div", { class: "sq-msg", dataset: { tone: "bad" }, text: r.message }));
    if (r.kind === "ok") return el("div", { class: "sq-block" }, head, el("div", { class: "sq-msg", text: r.message }));
    const n = r.rows.length;
    const note = n === 0 ? "Empty set" : `${n} row${n === 1 ? "" : "s"} in set${n > MAX_ROWS ? ` (showing the first ${MAX_ROWS})` : ""}`;
    return el("div", { class: "sq-block" }, head,
      n ? el("div", { class: "sq-scroll" }, el("table", { class: "sq-grid" },
        el("thead", {}, el("tr", {}, r.columns.map((name) => el("th", { text: name })))),
        el("tbody", {}, r.rows.slice(0, MAX_ROWS).map((row) => el("tr", {}, row.map(cell)))))) : null,
      el("div", { class: "sq-msg", text: note }));
  }

  function win() {
    if (won) return;
    won = true;
    api.reveal(ctx.flag);
  }
  function renderGoal(results) {
    if (c.mode === "find") {
      goal.replaceChildren(el("div", { class: "sq-goal-line" }, icon(ICONS.flag, 14), el("span", { text: "The flag is somewhere in the data. Find it, copy it (click a cell), and submit it." })));
      return;
    }
    if (c.mode === "verify") {
      const state = checks.map((k) => sess.check(k));
      goal.replaceChildren(el("div", { class: "sq-h", text: "Checklist" }),
        el("ul", { class: "sq-checks" }, checks.map((k, i) => el("li", { class: state[i] ? "is-ok" : "" }, icon(state[i] ? ICONS.check : ICONS.x, 13), el("span", { text: k.label })))));
      if (state.every(Boolean)) win();
      return;
    }
    // match
    const shape = `${expected.rows.length} row${expected.rows.length === 1 ? "" : "s"} × ${expected.columns.length} column${expected.columns.length === 1 ? "" : "s"}${c.ordered ? ", in order" : ""}`;
    const line = (tone, text) => goal.replaceChildren(el("div", { class: "sq-goal-line", dataset: { tone } }, icon(tone === "ok" ? ICONS.check : ICONS.flag, 14), el("span", { text })));
    const mine = results && !results.some((r) => r.kind === "error") ? results.filter((r) => r.kind === "rows" && r.sqlite).pop() : null;
    if (!mine) { if (!won) line("", `Target result: ${shape}. Run a query that returns exactly that to earn the flag.`); return; }
    const cmp = compareResult(mine, expected, c.ordered);
    if (cmp.ok && c.mustUse && !new RegExp(c.mustUse, "i").test(sess.plan(mine.stmt))) {
      line("warn", "Right rows. But the server still can't seek into the index for this query: put EXPLAIN in front of it and look at type and rows.");
      return;
    }
    if (cmp.ok) { line("ok", "Result matches the target."); win(); }
    else line("warn", `${cmp.msg} (Target: ${shape}.)`);
  }

  function run() {
    // With text selected, run only the selection (handy for trying one statement of several).
    const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    const text = sel.trim() ? sel : editor.value;
    if (!text.trim()) return;
    if (history[history.length - 1] !== editor.value) { history.push(editor.value); if (history.length > 50) history.shift(); }
    histAt = history.length;
    let results;
    try { results = sess.run(text); }
    catch (e) { results = [{ kind: "error", stmt: text, message: `ERROR: ${e.message}` }]; }
    if (!results.length) results = [{ kind: "error", stmt: text.trim(), message: "Nothing to run: that was only a comment." }];
    output.replaceChildren(...results.map(block));
    output.scrollTop = 0;
    renderSchema();
    renderGoal(results);
  }

  let histAt = history.length, draftTimer = 0;
  const setEditor = (text) => { editor.value = text; saveDraft(c.id, text, c.starter); syncRunLabel(); };
  const syncRunLabel = () => { runBtn.textContent = editor.selectionStart !== editor.selectionEnd && document.activeElement === editor ? "Run selection" : "Run"; };
  editor.addEventListener("input", () => { clearTimeout(draftTimer); draftTimer = setTimeout(() => saveDraft(c.id, editor.value, c.starter), 400); });
  for (const ev of ["select", "keyup", "mouseup", "blur", "focus"]) editor.addEventListener(ev, syncRunLabel);
  editor.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
    else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      // Alt+Up / Alt+Down walk back and forth through queries you've run.
      e.preventDefault();
      const to = histAt + (e.key === "ArrowUp" ? -1 : 1);
      if (to >= 0 && to < history.length) { histAt = to; setEditor(history[to]); }
    }
    else if (e.key === "Tab" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const s = editor.selectionStart;
      editor.setRangeText("  ", s, editor.selectionEnd, "end");
    }
  });

  // ── resizable panels: schema width, editor height (remembered) ──
  const prefs = loadPrefs(PREFS_KEY, PREF_DEFAULTS);
  const runBtn = el("button", { class: "sq-btn sq-primary", type: "button", on: { mousedown: (e) => e.preventDefault(), click: run } }, "Run");
  const schemaBtn = el("button", { class: "sq-btn", type: "button", title: "Show or hide the table list", on: { click: () => { prefs.schema = !prefs.schema; applyPrefs(); savePrefs(PREFS_KEY, prefs); } } }, "Schema");
  const gutterX = el("div", { class: "sq-gutter sq-gutter-x", role: "separator", "aria-orientation": "vertical", title: "Drag to resize the table list; double-click to reset" });
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

  const root = el("div", { class: "sq" }, schema, gutterX,
    el("div", { class: "sq-main" },
      el("div", { class: "sq-top" }, editor,
        el("div", { class: "sq-bar" }, runBtn, schemaBtn,
          c.starter ? el("button", { class: "sq-btn", type: "button", title: "Put the starter query back in the editor", on: { click: () => { setEditor(c.starter); editor.focus(); } } }, "Starter query") : null,
          el("span", { class: "sq-dim sq-keys", text: "Ctrl+Enter runs · select text to run part · Alt+↑/↓ history" }))),
      gutterY, goal, output));
  host.append(root);
  applyPrefs();
  renderSchema();
  renderGoal(null);
  output.append(el("p", { class: "sq-empty", text: "Results appear here. Each statement ends with a semicolon; you can run several at once." }));
  root._console = { run: (s) => { editor.value = s; editor.setSelectionRange(s.length, s.length); run(); }, sess };
  return () => { clearTimeout(draftTimer); saveDraft(c.id, editor.value, c.starter); sess.close(); root.remove(); };
}
