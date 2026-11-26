// The service worker's precache list must match the files that make up the app,
// or a file added later would be missing offline.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

test("sw.js precaches exactly the app's files", () => {
  const src = readFileSync(join(root, "sw.js"), "utf8");
  const listed = [...src.match(/const FILES = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((f) => f !== "./");
  const onDisk = ["index.html", ...walk(join(root, "css")), ...walk(join(root, "js"))]
    .map((p) => (p === "index.html" ? p : relative(root, p).split(sep).join("/")))
    .filter((p) => /\.(js|css|html)$/.test(p));
  assert.deepEqual([...listed].sort(), [...onDisk].sort());
  assert.equal(new Set(listed).size, listed.length, "no duplicates");
});
