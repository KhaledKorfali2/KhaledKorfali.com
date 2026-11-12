// Loads the SQLite runtime (vendor/sql-wasm.js, a classic script included by index.html)
// once for the MySQL and SQLite engines.
//
// sql.js remembers its own start-up promise, including a failed one, so after a failed
// download the script itself has to be loaded again before a retry can succeed.
let sqlPromise = null, stale = false;

function reloadScript() {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = new URL("../../vendor/sql-wasm.js", import.meta.url).href;
    s.onload = () => { stale = false; resolve(); };
    s.onerror = () => { s.remove(); reject(new Error("the database engine script (vendor/sql-wasm.js) did not load")); };
    document.head.append(s);
  });
}

export function loadSqlJs() {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      if (stale || typeof window.initSqlJs !== "function") await reloadScript();
      return window.initSqlJs({ locateFile: (f) => new URL(`../../vendor/${f}`, import.meta.url).href });
    })();
    sqlPromise.catch(() => { sqlPromise = null; stale = true; });
  }
  return sqlPromise;
}
