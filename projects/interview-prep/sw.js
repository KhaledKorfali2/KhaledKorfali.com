// Pattern Trace service worker: makes the app work offline after the first visit.
//
// Scope is this folder only, so it never touches the rest of the site.
// Strategy is network-first: online you always get the files that are deployed (an
// update can't be hidden by a stale cache); the cache is only read when the network
// fails or takes longer than a few seconds.
//
// When you add, rename or delete a file, update FILES and bump VERSION.
// tests/sw.test.mjs fails if FILES doesn't match what is on disk.

const VERSION = "v2";
const CACHE = "pattern-trace-" + VERSION;
const FONT_CACHE = "pattern-trace-fonts";
const NETWORK_TIMEOUT_MS = 4000;

const FILES = [
  "./",
  "index.html",
  "css/app.css",
  "js/main.js",
  "js/session.js",
  "js/solve-session.js",
  "js/store.js",
  "js/ui.js",
  "js/data/curriculum.js",
  "js/data/index.js",
  "js/data/neetcode.js",
  "js/data/patterns.js",
  "js/data/problems-a.js",
  "js/data/problems-b.js",
  "js/domain/metrics.js",
  "js/domain/planner.js",
  "js/domain/scheduler.js",
  "js/views/curriculum.js",
  "js/views/drill.js",
  "js/views/home.js",
  "js/views/mock.js",
  "js/views/notes.js",
  "js/views/patterns.js",
  "js/views/problems.js",
  "js/views/progress.js",
  "js/views/review.js",
  "js/views/solve.js",
  "js/views/today.js",
  "js/viz/backtracking.js",
  "js/viz/bfs.js",
  "js/viz/binary-search.js",
  "js/viz/bit-manipulation.js",
  "js/viz/dfs.js",
  "js/viz/dynamic-programming.js",
  "js/viz/greedy.js",
  "js/viz/hash-map.js",
  "js/viz/heap.js",
  "js/viz/index.js",
  "js/viz/intervals.js",
  "js/viz/kit.js",
  "js/viz/linked-list.js",
  "js/viz/math-sim.js",
  "js/viz/monotonic-stack.js",
  "js/viz/player.js",
  "js/viz/prefix-sum.js",
  "js/viz/shortest-path.js",
  "js/viz/sliding-window.js",
  "js/viz/stack.js",
  "js/viz/topological-sort.js",
  "js/viz/trie.js",
  "js/viz/two-pointers.js",
  "js/viz/union-find.js",
];

self.addEventListener("install", (event) => {
  // cache: "reload" skips the browser's HTTP cache, so the copy stored is the deployed one.
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith("pattern-trace-") && k !== CACHE && k !== FONT_CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

// Network first; fall back to the cached copy. A good response refreshes the cache.
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await Promise.race([fetch(request), timeout(NETWORK_TIMEOUT_MS)]);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true })
      || (request.mode === "navigate" ? await cache.match("index.html") : null);
    if (cached) return cached;
    throw err;
  }
}

// Fonts never change at a given URL: serve from cache, fetch once.
async function cacheFirst(request) {
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(request));
    return;
  }
  // Only this app's own files; links out to the rest of the site are left alone.
  if (url.origin === self.location.origin && url.href.startsWith(self.registration.scope)) {
    event.respondWith(networkFirst(request));
  }
});
