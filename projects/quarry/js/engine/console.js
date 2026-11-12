// The database console: schema browser, SQL editor, results, and the goal
// tracker that awards the flag. All output is rendered as text nodes.
import { el, icon, ICONS, copy } from "../ui.js";
import { createSession, compareResult } from "./mysql.js";
import { buildShop } from "../data/shop.js";

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
    "aria-label": "SQL editor", placeholder: "Type SQL here, then press Run (Ctrl+Enter)", value: c.starter || "" });
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
        el("button", { class: "sq-btn sq-mini", type: "button", on: { click: () => { editor.value = `SELECT *\nFROM ${t.name}\nLIMIT 10;`; run(); } } }, "Preview"))));
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
    const text = editor.value;
    if (!text.trim()) return;
    let results;
    try { results = sess.run(text); }
    catch (e) { results = [{ kind: "error", stmt: text, message: `ERROR: ${e.message}` }]; }
    if (!results.length) results = [{ kind: "error", stmt: text.trim(), message: "Nothing to run: that was only a comment." }];
    output.replaceChildren(...results.map(block));
    output.scrollTop = 0;
    renderSchema();
    renderGoal(results);
  }

  editor.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
    else if (e.key === "Tab" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const s = editor.selectionStart;
      editor.setRangeText("  ", s, editor.selectionEnd, "end");
    }
  });

  const root = el("div", { class: "sq" }, schema,
    el("div", { class: "sq-main" },
      el("div", { class: "sq-top" }, editor,
        el("div", { class: "sq-bar" },
          el("button", { class: "sq-btn sq-primary", type: "button", on: { click: run } }, "Run"),
          el("span", { class: "sq-dim", text: "Ctrl+Enter · root@shop · MySQL-compatible sandbox" }))),
      goal, output));
  host.append(root);
  renderSchema();
  renderGoal(null);
  output.append(el("p", { class: "sq-empty", text: "Results appear here. Each statement ends with a semicolon; you can run several at once." }));
  root._console = { run: (s) => { editor.value = s; run(); }, sess };
  return () => { sess.close(); root.remove(); };
}
