// pandas course engine: real CPython with real pandas (Pyodide). Each challenge
// gets a fresh namespace holding the shop tables as DataFrames; a cell's last
// expression is shown, notebook style, and is what result-match challenges check.
import { compareResult } from "./common.js";
import { shopTables } from "../data/shop.js";

export const meta = { id: "pandas", name: "pandas", prompt: "In [ ]: ", note: "Python 3.14 · pandas 3.0 · real interpreter (Pyodide)", placeholder: "orders.head()", sidebar: "DataFrames", whole: true };

const BOOT = `
import json, io, sys, ast, traceback
import pandas as pd, numpy as np
pd.set_option("display.width", 110); pd.set_option("display.max_columns", 20); pd.set_option("display.max_rows", 30)

def _mk(tables_json):
    ns = {"pd": pd, "np": np, "__name__": "__main__"}
    for name, t in json.loads(tables_json).items():
        ns[name] = pd.DataFrame(t["rows"], columns=t["cols"])
    return ns

def _table(v):
    if isinstance(v, pd.Series):
        v = v.to_frame(name=v.name if v.name is not None else "value")
    if not isinstance(v, pd.DataFrame):
        return None
    d = v
    # A leftover positional index is noise; a named or non-integer index (group keys, dates) is data.
    plain = d.index.nlevels == 1 and d.index.name is None and pd.api.types.is_integer_dtype(d.index)
    d = d.reset_index(drop=True) if plain else d.reset_index()
    if isinstance(d.columns, pd.MultiIndex):
        d.columns = ["_".join(str(x) for x in c if str(x) != "") for c in d.columns]
    d.columns = [str(c) for c in d.columns]
    for c in d.columns:
        if isinstance(d[c].dtype, pd.PeriodDtype) or str(d[c].dtype) == "category":
            d[c] = d[c].astype(str)
    return json.loads(d.to_json(orient="split", date_format="iso", default_handler=str))

def _run(ns, code):
    out, old = io.StringIO(), sys.stdout
    sys.stdout = out
    res = {}
    try:
        tree = ast.parse(code, mode="exec")
        last = None
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            last = ast.Expression(tree.body.pop().value)
        exec(compile(tree, "<cell>", "exec"), ns)
        if last is not None:
            v = eval(compile(last, "<cell>", "eval"), ns)
            if v is not None:
                ns["_"] = v
                t = _table(v)
                if t is not None:
                    res["table"] = t
                    res["shape"] = list(v.shape)
                    res["kind"] = type(v).__name__
                else:
                    if isinstance(v, np.generic):
                        v = v.item()
                    if isinstance(v, (bool, int, float, str)):
                        res["scalar"] = v
                    res["repr"] = repr(v)
    except SyntaxError as e:
        res["error"] = f"  Cell line {e.lineno}\\n    {(e.text or '').rstrip()}\\nSyntaxError: {e.msg}"
    except Exception as e:
        tb = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == "<cell>"]
        where = f"  Cell line {tb[-1].lineno}\\n" if tb else ""
        res["error"] = where + "".join(traceback.format_exception_only(type(e), e)).strip()
    finally:
        sys.stdout = old
    res["stdout"] = out.getvalue()
    return json.dumps(res, default=str)

def _frames(ns):
    out = []
    for k, v in ns.items():
        if isinstance(v, pd.DataFrame) and not k.startswith("_"):
            out.append({"name": k, "rows": int(len(v)), "cols": [[str(c), str(t)] for c, t in v.dtypes.items()]})
    return json.dumps(out)

def _check(ns, sol, expr):
    try:
        return bool(eval(expr, {**ns, "sol": sol}))
    except Exception:
        return False
`;

let pyPromise = null;
export function loadRuntime(indexURL) {
  if (!pyPromise) {
    pyPromise = (async () => {
      const { loadPyodide } = await import("../../vendor/pyodide/pyodide.mjs");
      const py = await loadPyodide({ indexURL: indexURL || new URL("../../vendor/pyodide/", import.meta.url).href });
      await py.loadPackage(["pandas"], { messageCallback: () => {} });
      py.runPython(BOOT);
      return py;
    })();
    pyPromise.catch(() => { pyPromise = null; });
  }
  return pyPromise;
}

/** The shop tables with their id columns, as { name: { cols, rows } } for DataFrames. */
export function shopFrames(seed) {
  const out = {};
  for (const t of shopTables(seed)) {
    const bool = t.cols.indexOf("discontinued");
    out[t.name] = { cols: [...(t.id ? [t.id] : []), ...t.cols], rows: t.rows.map((r, i) => [...(t.id ? [i + 1] : []), ...r.map((v, j) => (j === bool ? !!v : v))]) };
  }
  return out;
}
const tidy = (v) => (typeof v === "string" ? v.replace(/T00:00:00\.000Z?$/, "").replace(/^(\d{4}-\d\d-\d\d)T(\d\d:\d\d:\d\d)\.000Z?$/, "$1 $2") : v);

export async function open({ seed, challenge: c, ctx }, py) {
  py = py || await loadRuntime();
  const tables = JSON.stringify(shopFrames(seed));
  const mk = py.globals.get("_mk"), runPy = py.globals.get("_run"), frames = py.globals.get("_frames"), checkPy = py.globals.get("_check");
  const made = [];
  const fresh = () => { const ns = mk(tables); made.push(ns); for (const code of c.setup ? c.setup(ctx) : []) runPy(ns, code); return ns; };
  const ns = fresh();
  let sol = null, solLast = null;
  const solved = () => { if (!sol) { sol = fresh(); solLast = JSON.parse(runPy(sol, c.solution)); if (solLast.error) throw new Error(`reference solution failed: ${solLast.error}`); } return sol; };

  const asRows = (r) => (r.table ? { columns: r.table.columns, rows: r.table.data.map((row) => row.map(tidy)) } : "scalar" in r ? { columns: ["value"], rows: [[r.scalar]] } : null);
  function exec(target, code) {
    const r = JSON.parse(runPy(target, code));
    const out = [];
    if (r.stdout) out.push({ kind: "text", text: r.stdout.replace(/\n$/, "") });
    if (r.error) { out.push({ kind: "error", message: r.error }); return out; }
    const rows = asRows(r);
    if (r.table) out.push({ kind: "rows", ...rows, note: `${r.kind} · ${r.shape.join(" × ")}`, checkable: true });
    else if (rows) out.push({ kind: "rows", ...rows, plain: r.repr, checkable: true });
    else if (r.repr) out.push({ kind: "text", text: r.repr });
    if (!out.length) out.push({ kind: "ok", message: "(ran; nothing to display. End the cell with an expression to see its value.)" });
    return out;
  }
  return {
    run(text) { const out = exec(ns, text); out[0].stmt = text.trim().split("\n").filter((l) => l.trim()).pop() || ""; out.slice(1).forEach((o) => { o.stmt = ""; }); return out; },
    tables: () => JSON.parse(frames(ns)).map((f) => ({ name: f.name, note: String(f.rows), preview: `${f.name}.head(10)`, cols: f.cols.map(([name, type]) => ({ name, type })) })),
    expected() { solved(); const rows = asRows(solLast); if (!rows) throw new Error("reference solution has no table or value"); return rows; },
    compare: (mine, exp, ordered) => compareResult(mine, exp, ordered),
    resolve(checks) { solved(); return checks; },
    check: (k) => !!checkPy(ns, solved(), k.py),
    close() { for (const n of made) { try { n.destroy(); } catch { /* gone */ } } },
  };
}
