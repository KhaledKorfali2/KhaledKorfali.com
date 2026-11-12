// Loads each course's runtime under Node (tests only).
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const cache = {};
export async function runtime(engine) {
  if (engine in cache) return cache[engine];
  let r = null;
  if (engine === "mysql" || engine === "sqlite") r = cache.sql || (cache.sql = await createRequire(import.meta.url)("../vendor/sql-wasm.js")());
  else if (engine === "postgres") { const [a, b] = await Promise.all([import("../vendor/pglite/dist/index.js"), import("../vendor/pglite/dist/vector/index.js")]); r = { PGlite: a.PGlite, vector: b.vector }; }
  else if (engine === "pandas") { const m = await import("../js/engine/e-pandas.js"); r = await m.loadRuntime(fileURLToPath(new URL("../vendor/pyodide/", import.meta.url))); }
  return (cache[engine] = r);
}
export const engineModule = (engine) => import(`../js/engine/e-${engine}.js`);
