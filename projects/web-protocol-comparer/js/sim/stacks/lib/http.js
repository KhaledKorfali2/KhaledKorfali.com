// Shared bits for the HTTP stacks: resource names, message text, sizes, results.

import { MSS } from "./tcp.js";

// Same names as the HTTP/3 stack so races line up.
export const PATHS = ["/index.html", "/app.js", "/style.css", "/logo.svg", "/hero.jpg", "/font.woff2",
  "/api/user", "/vendor.js", "/icons.svg", "/data.json", "/photo.webp", "/analytics.js"];
export const SERVER_THINK = 2;   // ms the server takes to produce a response
export const DELAYED_ACK = 40;   // ms (Linux minimum delayed-ACK timeout); ACK at least every 2nd segment
export { MSS };

const TYPES = { html: "text/html", js: "text/javascript", css: "text/css", svg: "image/svg+xml", jpg: "image/jpeg",
  woff2: "font/woff2", json: "application/json", webp: "image/webp" };
export const contentType = (path) => TYPES[path.split(".").pop()] || "application/json";

export function requestText(path, { keepAlive = true, upgrade = false } = {}) {
  return [
    `GET ${path} HTTP/1.1`,
    "Host: example.com",
    "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    `Accept: ${path.endsWith(".html") ? "text/html,application/xhtml+xml,*/*;q=0.8" : "*/*"}`,
    "Accept-Encoding: gzip, deflate, br, zstd",
    "Accept-Language: en-US,en;q=0.9",
    "Referer: https://example.com/",
    `Connection: ${keepAlive ? "keep-alive" : "close"}`,
    "", "",
  ].join("\r\n");
}

export function responseHead(path, bodyLen, { keepAlive = true } = {}) {
  return [
    "HTTP/1.1 200 OK",
    "Date: Tue, 03 Nov 2026 12:00:00 GMT",
    "Server: nginx",
    `Content-Type: ${contentType(path)}`,
    `Content-Length: ${bodyLen}`,
    "Cache-Control: max-age=3600",
    `Connection: ${keepAlive ? "keep-alive" : "close"}`,
    "", "",
  ].join("\r\n");
}

/** Bookkeeping for "page" metrics shared by http1 / http2. */
export function pageTracker(sim, paths) {
  const r = { firstRequestMs: null, handshakeMs: null, firstResourceMs: null, pageLoadMs: null, streamDone: {}, done: 0 };
  r.complete = (key, path) => {
    if (r.streamDone[key] !== undefined) return;
    r.streamDone[key] = sim.now;
    r.done++;
    sim.note("client", `${path} complete`, "good");
    if (r.firstResourceMs === null) { r.firstResourceMs = sim.now; sim.mark("first resource", "client"); }
    if (r.done === paths.length) {
      r.pageLoadMs = sim.now;
      sim.mark("page loaded", "client");
    }
  };
  return r;
}

export function clamp(v, lo, hi) { v = Number(v); return Math.max(lo, Math.min(hi, Number.isFinite(v) ? Math.round(v) : lo)); }
export const bytesLen = (s) => new TextEncoder().encode(s).length;
