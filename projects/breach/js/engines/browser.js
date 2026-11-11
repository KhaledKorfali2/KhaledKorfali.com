// Simulated web browser + web server.
// The "server" is a set of route handlers written by each challenge; the browser
// renders their HTML inside the sandbox iframe and gives the learner dev tools:
// page source, a network log with edit-and-resend (like Burp Repeater), a cookie
// editor and a console. Nothing here touches the real network.
import { el, icon, ICONS, escHtml } from "../ui.js";
import { renderPage, createSandbox } from "./sandbox.js";

export const esc = escHtml;
export const ATTACKER_HOST = "attacker.example";

/* ───────────── Server ───────────── */

function compile(pattern) {
  if (pattern === "*") return { re: /^.*$/, keys: ["*"] };
  const keys = [];
  const src = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\/:(\w+)/g, (_, k) => { keys.push(k); return "/([^/]+)"; })
    .replace(/\*/g, () => { keys.push("*"); return "(.*)"; });
  return { re: new RegExp(`^${src}/?$`), keys };
}

export function parseCookieHeader(h) {
  const out = {};
  for (const part of String(h || "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

const STATUS_TEXT = { 200: "OK", 201: "Created", 204: "No Content", 301: "Moved Permanently", 302: "Found", 303: "See Other", 307: "Temporary Redirect",
  400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 418: "I'm a teapot", 429: "Too Many Requests", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable" };
export const statusText = (n) => STATUS_TEXT[n] || "";

const errorPage = (status, msg) => `<!doctype html><title>${status} ${statusText(status)}</title><body style="font-family:sans-serif;padding:24px"><h1>${status} ${esc(statusText(status))}</h1><p>${esc(msg || "")}</p><hr><small>nginx/1.18.0 (Ubuntu)</small></body>`;

export class NetworkError extends Error {}

/**
 * createServer(sites, sim) → { handle({ method, url, headers, body }) → Promise<{ status, headers, body, cookies }> }
 * headers in and out are lowercase-keyed objects. `cookies` lists Set-Cookie objects.
 */
export function createServer(sites, sim = {}) {
  const compiled = {};
  for (const [host, site] of Object.entries(sites || {})) {
    compiled[host] = (site.routes || []).map(([method, pattern, fn]) => ({ method: method.toUpperCase(), ...compile(pattern), fn }));
  }
  async function handle({ method = "GET", url, headers = {}, body = "" }) {
    let u;
    try { u = new URL(url); } catch { throw new NetworkError(`Invalid URL: ${url}`); }
    const host = u.host.toLowerCase();
    const hdrs = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
    hdrs.host ||= host;
    if (host === ATTACKER_HOST) {
      sim.listen?.({ method, url: u.href, headers: hdrs, body });
      return { status: 200, headers: { "content-type": "text/plain" }, body: "ok", cookies: [] };
    }
    const site = sites?.[host] || sites?.[u.hostname];
    if (!site) throw new NetworkError(`Could not resolve host: ${u.hostname}`);
    const ctype = hdrs["content-type"] || "";
    let form = {}, json = null;
    if (/x-www-form-urlencoded/.test(ctype) || (method !== "GET" && body && !/json/.test(ctype) && /=/.test(body))) {
      form = Object.fromEntries(new URLSearchParams(body));
    }
    if (/json/.test(ctype)) { try { json = JSON.parse(body); } catch { json = null; } }
    const req = {
      method: method.toUpperCase(), url: u.href, host, path: decodeURIComponentSafe(u.pathname), rawPath: u.pathname, search: u.search,
      query: Object.fromEntries(u.searchParams), queryAll: (k) => u.searchParams.getAll(k),
      headers: hdrs, cookies: parseCookieHeader(hdrs.cookie), body: String(body ?? ""), form, json, params: {},
    };
    const r = { status: 200, headers: { server: "nginx/1.18.0 (Ubuntu)", "content-type": "text/html; charset=utf-8" }, body: "", cookies: [] };
    const res = {
      html(s, st) { r.headers["content-type"] = "text/html; charset=utf-8"; r.body = String(s); if (st) r.status = st; return res; },
      text(s, st) { r.headers["content-type"] = "text/plain; charset=utf-8"; r.body = String(s); if (st) r.status = st; return res; },
      json(o, st) { r.headers["content-type"] = "application/json"; r.body = JSON.stringify(o, null, 2); if (st) r.status = st; return res; },
      redirect(loc, st = 302) { r.status = st; r.headers.location = loc; r.body = ""; return res; },
      status(n) { r.status = n; return res; },
      header(k, v) { r.headers[k.toLowerCase()] = String(v); return res; },
      cookie(name, value, opts = {}) { r.cookies.push({ name, value: String(value), httpOnly: !!opts.httpOnly, path: opts.path || "/" }); return res; },
      clearCookie(name) { r.cookies.push({ name, value: "", clear: true, path: "/" }); return res; },
      notFound(msg) { r.status = 404; r.headers["content-type"] = "text/html; charset=utf-8"; r.body = errorPage(404, msg || `The requested URL ${req.path} was not found on this server.`); return res; },
      error(st, msg) { r.status = st; r.headers["content-type"] = "text/html; charset=utf-8"; r.body = errorPage(st, msg); return res; },
    };
    const routes = compiled[host] || compiled[u.hostname] || [];
    let matched = false;
    for (const rt of routes) {
      if (rt.method !== "*" && rt.method !== req.method && !(rt.method === "GET" && req.method === "HEAD")) continue;
      const m = rt.re.exec(req.path);
      if (!m) continue;
      rt.keys.forEach((k, i) => { req.params[k] = m[i + 1]; });
      matched = true;
      try { await rt.fn(req, res, sim); }
      catch (err) { console.error(err); res.error(500, "The server encountered an internal error."); }
      break;
    }
    if (!matched) {
      if (site.notFound) await site.notFound(req, res, sim);
      else res.notFound();
    }
    if (r.cookies.length) r.headers["set-cookie"] = r.cookies.map(cookieString).join("\n");
    r.headers["content-length"] = String(new TextEncoder().encode(r.body).length);
    if (req.method === "HEAD") r.body = "";
    return r;
  }
  return { handle };
}
const decodeURIComponentSafe = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const cookieString = (c) => `${c.name}=${c.value}; Path=${c.path || "/"}${c.httpOnly ? "; HttpOnly" : ""}${c.clear ? "; Max-Age=0" : ""}`;

/** Raw HTTP text for display. */
export function rawRequest({ method, url, headers, body }) {
  const u = new URL(url);
  const lines = [`${method} ${u.pathname}${u.search} HTTP/1.1`, `Host: ${u.host}`];
  for (const [k, v] of Object.entries(headers || {})) if (k !== "host") lines.push(`${titleCase(k)}: ${v}`);
  return lines.join("\n") + "\n\n" + (body || "");
}
export function rawResponse(r) {
  const lines = [`HTTP/1.1 ${r.status} ${statusText(r.status)}`];
  for (const [k, v] of Object.entries(r.headers || {})) {
    if (k === "set-cookie") v.split("\n").forEach((c) => lines.push(`Set-Cookie: ${c}`));
    else lines.push(`${titleCase(k)}: ${v}`);
  }
  return lines.join("\n") + "\n\n" + (r.body || "");
}
const titleCase = (k) => k.replace(/(^|-)([a-z])/g, (_, d, c) => d + c.toUpperCase());

/** Parse raw HTTP request text (Repeater). Host header gives the target. */
export function parseRawRequest(text, scheme = "http") {
  const norm = text.replace(/\r/g, "");
  const split = norm.indexOf("\n\n");
  const head = split < 0 ? norm : norm.slice(0, split);
  const body = split < 0 ? "" : norm.slice(split + 2);
  const [first, ...hl] = head.split("\n");
  const m = /^([A-Z]+)\s+(\S+)(?:\s+HTTP\/[\d.]+)?\s*$/i.exec(first.trim());
  if (!m) throw new Error("First line must look like: GET /path HTTP/1.1");
  const headers = {};
  for (const line of hl) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  if (!headers.host) throw new Error("Missing Host header");
  const target = /^https?:\/\//i.test(m[2]) ? m[2] : `${scheme}://${headers.host}${m[2].startsWith("/") ? "" : "/"}${m[2]}`;
  return { method: m[1].toUpperCase(), url: target, headers, body };
}

/* ───────────── Browser view ───────────── */

const UA = "Mozilla/5.0 (X11; Linux x86_64) BreachBrowser/1.0";

export function mount(root, env, api) {
  const jar = {};       // host → { name: { value, httpOnly } }
  for (const [host, cookies] of Object.entries(env.cookies || {})) {
    jar[host] = {};
    for (const [k, v] of Object.entries(cookies)) jar[host][k] = typeof v === "object" ? { value: String(v.value), httpOnly: !!v.httpOnly } : { value: String(v), httpOnly: false };
  }
  const log = [];        // network log
  const consoleLog = [];
  const heard = [];      // attacker.example listener
  const hist = [];
  let hi = -1;
  let current = null;    // { url, res }
  let page = null;
  let destroyed = false;
  const bots = new Set();

  const sim = {
    reveal: (t) => api.reveal(t),
    toast: (t) => api.toast(t),
    listen: (r) => record(r, "you"),
    botVisit: (url, opts) => botVisit(url, opts),
    ctx: api.ctx,
  };
  const server = createServer(env.sites, sim);

  const cookieHeader = (host, includeHttpOnly = true) =>
    Object.entries(jar[host] || {}).filter(([, c]) => includeHttpOnly || !c.httpOnly).map(([k, c]) => `${k}=${c.value}`).join("; ");
  function storeCookies(host, res) {
    for (const c of res.cookies || []) {
      jar[host] ||= {};
      if (c.clear) delete jar[host][c.name];
      else jar[host][c.name] = { value: c.value, httpOnly: c.httpOnly };
    }
  }

  async function send(method, url, { body = "", headers = {}, from = "page" } = {}) {
    const u = new URL(url);
    const h = { "user-agent": UA, accept: "text/html,*/*", ...headers };
    const ck = cookieHeader(u.host);
    if (ck && !h.cookie) h.cookie = ck;
    if (body && !h["content-type"]) h["content-type"] = "application/x-www-form-urlencoded";
    const entry = { method, url: u.href, headers: h, body, from, t: Date.now() };
    log.push(entry);
    try {
      const res = await server.handle({ method, url: u.href, headers: h, body });
      entry.res = res;
      storeCookies(u.host, res);
    } catch (err) {
      entry.error = err.message;
    }
    refreshDev();
    return entry;
  }

  async function navigate(method, url, opts = {}) {
    let target;
    try { target = new URL(/^[a-z]+:\/\//i.test(url) ? url : `http://${url}`); } catch { return showError(`Invalid address: ${url}`); }
    if (!/^https?:$/.test(target.protocol)) return showError("Only http:// and https:// addresses work in this browser.");
    let entry = await send(method, target.href, opts);
    for (let hops = 0; hops < 5 && entry.res && [301, 302, 303, 307].includes(entry.res.status) && entry.res.headers.location; hops++) {
      const next = new URL(entry.res.headers.location, entry.url).href;
      entry = entry.res.status === 307 ? await send(method, next, opts) : await send("GET", next);
    }
    if (opts.push !== false) { hist.splice(hi + 1); hist.push({ method: "GET", url: entry.url }); hi = hist.length - 1; }
    if (method !== "GET" && opts.push !== false) hist[hi] = { method, url: entry.url, body: opts.body, headers: opts.headers };
    current = { url: entry.url, entry };
    addr.value = entry.url;
    if (entry.error) return showError(entry.error, entry.url);
    show(entry);
    env.onEvent?.("nav", { url: entry.url, status: entry.res.status, method }, sim);
  }

  function show(entry) {
    const res = entry.res;
    const type = res.headers["content-type"] || "";
    const html = /html/.test(type) ? res.body : `<pre style="white-space:pre-wrap;font:13px/1.5 monospace;margin:12px">${esc(res.body || (res.status >= 300 ? `${res.status} ${statusText(res.status)}` : ""))}</pre>`;
    page.render({
      html, url: entry.url, cookie: cookieHeader(new URL(entry.url).host, false), title: `Page: ${entry.url}`,
      onMessage: (type, data, reply) => onPageMessage(type, data, reply, entry.url),
    });
    refreshDev();
  }
  function showError(msg, url = "") {
    page.render({
      html: `<body style="font-family:sans-serif;padding:32px;color:#444"><h2>This site can't be reached</h2><p>${esc(msg)}</p></body>`,
      url: url || "http://error.invalid/", onMessage() {},
    });
    refreshDev();
  }

  async function onPageMessage(type, data, reply, pageUrl) {
    if (type === "nav") {
      return navigate(data.method || "GET", data.url, { body: data.body || "", headers: data.contentType ? { "content-type": data.contentType } : {} });
    }
    if (type === "fetch") {
      let host = "";
      try { host = new URL(data.url).host; } catch { /* bad url */ }
      const sameSite = host === new URL(pageUrl).host;
      // Cross-site requests don't carry the target site's cookies (SameSite defaults); attacker.example gets logged.
      const entry = await send(data.method || "GET", data.url, { body: data.body, headers: { ...(data.headers || {}), ...(sameSite ? {} : { cookie: "" }) }, from: "script" });
      reply({ type: "fetch-res", id: data.id, status: entry.res?.status || 0, headers: entry.res ? { "content-type": entry.res.headers["content-type"] || "text/plain" } : {}, body: entry.res?.body || "" });
      return;
    }
    if (type === "blocked") {
      if (data.url.includes(ATTACKER_HOST)) await send("GET", data.url, { from: "page" });
      else consoleLog.push({ level: "warn", text: `Blocked request to ${data.url} (unknown host)` });
      refreshDev();
      return;
    }
    if (type === "cookie") {
      const host = new URL(pageUrl).host;
      jar[host] ||= {};
      if (!jar[host][data.name]?.httpOnly) jar[host][data.name] = { value: data.value, httpOnly: false };
      refreshDev();
      return;
    }
    if (type === "xss") {
      consoleLog.push({ level: "info", text: `${data.kind}("${data.message}")` });
      showDialog(new URL(pageUrl).host, data);
      env.onEvent?.("xss", { ...data, url: pageUrl }, sim);
      refreshDev();
      return;
    }
    if (type === "console") { consoleLog.push(data); refreshDev(); }
  }

  /** An "admin" browser visits url with its own cookies in a hidden sandbox. */
  async function botVisit(url, { cookies = {}, wait = 2500 } = {}) {
    const u = new URL(url);
    const ck = Object.entries(cookies).map(([k, v]) => `${k}=${typeof v === "object" ? v.value : v}`).join("; ");
    const jsCookies = Object.entries(cookies).filter(([, v]) => !(typeof v === "object" && v.httpOnly)).map(([k, v]) => `${k}=${typeof v === "object" ? v.value : v}`).join("; ");
    let res;
    try { res = await server.handle({ method: "GET", url: u.href, headers: { cookie: ck, "user-agent": "AdminBot/1.0 (HeadlessChrome)" } }); }
    catch { return; }
    const box = el("div", { class: "br-bot", "aria-hidden": "true" });
    document.body.append(box);
    const p = renderPage(box, {
      html: res.body, url: u.href, cookie: jsCookies, title: "Admin browser",
      onMessage: async (type, data, reply) => {
        if (type === "fetch" || type === "blocked" || type === "nav") {
          let target;
          try { target = new URL(data.url); } catch { return; }
          if (target.host === ATTACKER_HOST) { record({ method: data.method || "GET", url: target.href, headers: { "user-agent": "AdminBot/1.0 (HeadlessChrome)" }, body: data.body || "" }, "admin bot"); }
          else if (type === "fetch") {
            const r = await server.handle({ method: data.method || "GET", url: target.href, headers: { ...(data.headers || {}), cookie: target.host === u.host ? ck : "" }, body: data.body || "" }).catch(() => null);
            reply({ type: "fetch-res", id: data.id, status: r?.status || 0, body: r?.body || "" });
          }
        }
        if (type === "xss") env.onEvent?.("bot-xss", data, sim);
      },
    });
    bots.add(p);
    setTimeout(() => { p.destroy(); box.remove(); bots.delete(p); }, wait);
  }

  function record(r, who) {
    heard.push({ ...r, who, t: Date.now() });
    env.onEvent?.("exfil", { url: r.url, who, body: r.body }, sim);
    if (who === "admin bot") api.toast("📡 attacker.example received a request");
    refreshDev();
  }

  /* ── UI ── */
  const addr = el("input", { class: "br-addr", type: "text", spellcheck: "false", autocapitalize: "off", autocomplete: "off", "aria-label": "Address" });
  const btn = (label, d, fn) => el("button", { type: "button", class: "br-btn", "aria-label": label, title: label, on: { click: fn } }, icon(d, 16));
  const back = btn("Back", ICONS.back, () => { if (hi > 0) { hi--; const h = hist[hi]; navigate(h.method, h.url, { push: false, body: h.body, headers: h.headers }); } });
  const fwd = btn("Forward", ICONS.next, () => { if (hi < hist.length - 1) { hi++; const h = hist[hi]; navigate(h.method, h.url, { push: false, body: h.body, headers: h.headers }); } });
  const reload = btn("Reload", ICONS.refresh, () => { const h = hist[hi]; if (h) navigate(h.method, h.url, { push: false, body: h.body, headers: h.headers }); });
  const devBtn = el("button", { type: "button", class: "br-devbtn", "aria-pressed": "false", on: { click: () => toggleDev() } }, icon(ICONS.tool, 15), el("span", { text: "DevTools" }));
  const go = () => {
    const v = addr.value.trim();
    if (!v) return;
    if (/^view-source:/i.test(v)) { toggleDev(true); setTab("source"); addr.value = current?.url || ""; return; }
    navigate("GET", v);
  };
  addr.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  const bar = el("div", { class: "br-bar" }, back, fwd, reload,
    el("div", { class: "br-addr-wrap" }, el("span", { class: "br-lock", "aria-hidden": "true" }, icon(ICONS.globe, 13)), addr),
    env.devtools === false ? null : devBtn);
  const viewport = el("div", { class: "br-viewport" });
  const dialog = el("div", { class: "br-dialog", hidden: true });
  const pageWrap = el("div", { class: "br-page" }, viewport, dialog);

  // dev panel
  const tabs = [["network", "Network"], ["source", "Source"], ["storage", "Cookies"], ["console", "Console"], ...(env.listener ? [["listener", ATTACKER_HOST]] : [])];
  let tab = "network";
  const tabBar = el("div", { class: "br-tabs", role: "tablist" }, tabs.map(([k, label]) =>
    el("button", { type: "button", role: "tab", class: "br-tab", dataset: { tab: k }, text: label, on: { click: () => setTab(k) } })));
  const devBody = el("div", { class: "br-devbody" });
  const dev = el("div", { class: "br-dev", hidden: true }, tabBar, devBody);
  const body = el("div", { class: "br-body" }, pageWrap, dev);
  root.replaceChildren(el("div", { class: "br" }, bar, body));
  page = createSandbox(viewport);

  function toggleDev(force) {
    const open = force ?? dev.hidden;
    dev.hidden = !open;
    devBtn.setAttribute("aria-pressed", String(open));
    body.classList.toggle("dev-open", open);
    refreshDev();
  }
  function setTab(k) { tab = k; refreshDev(); }

  let selected = null;     // network entry index
  let repeater = null;     // { text, result }
  function refreshDev() {
    if (destroyed || dev.hidden) return;
    tabBar.querySelectorAll(".br-tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    const listenerTab = tabBar.querySelector('[data-tab="listener"]');
    if (listenerTab) listenerTab.textContent = heard.length ? `${ATTACKER_HOST} (${heard.length})` : ATTACKER_HOST;
    // keep focus in editable fields: don't rebuild while the learner types in them
    if (devBody.contains(document.activeElement) && document.activeElement.matches("input, textarea")) return;
    devBody.replaceChildren(({ network: netView, source: sourceView, storage: cookieView, console: consoleView, listener: listenerView })[tab]());
  }

  function netView() {
    if (repeater) return repeaterView();
    const list = el("div", { class: "br-netlist" }, log.length ? log.map((e, i) => el("button", {
      type: "button", class: `br-netrow${selected === i ? " is-sel" : ""}${e.error || (e.res && e.res.status >= 400) ? " is-err" : ""}`,
      on: { click: () => { selected = i; refreshDev(); } },
    }, el("span", { class: "br-m", text: e.method }), el("span", { class: "br-u", text: shortUrl(e.url) }), el("span", { class: "br-s", text: e.error ? "ERR" : String(e.res.status) }))) : el("p", { class: "br-empty", text: "Requests appear here as you browse." }));
    const e = log[selected];
    const detail = e ? el("div", { class: "br-netdetail" },
      el("div", { class: "br-detail-head" }, el("b", { text: "Request" }),
        el("button", { type: "button", class: "br-mini", text: "Edit & resend", on: { click: () => { repeater = { text: rawRequest(e), result: null }; refreshDev(); } } })),
      el("pre", { class: "br-raw", text: rawRequest(e) }),
      el("div", { class: "br-detail-head" }, el("b", { text: "Response" })),
      el("pre", { class: "br-raw", text: e.error ? e.error : truncate(rawResponse(e.res)) })) : el("p", { class: "br-empty", text: "Select a request to inspect its headers and body." });
    return el("div", { class: "br-net" }, list, detail);
  }

  function repeaterView() {
    const ta = el("textarea", { class: "br-rep-in", spellcheck: "false", autocapitalize: "off", "aria-label": "Raw HTTP request", value: repeater.text });
    ta.addEventListener("input", () => { repeater.text = ta.value; });
    const out = el("pre", { class: "br-raw br-rep-out", text: repeater.result || "Edit the request above, then Send." });
    const sendIt = async () => {
      let req;
      try { req = parseRawRequest(ta.value); } catch (err) { out.textContent = `✗ ${err.message}`; return; }
      // Repeater sends exactly what you wrote, including the Cookie header (or none).
      const entry = { ...req, from: "repeater", t: Date.now() };
      log.push(entry);
      try {
        entry.res = await server.handle(req);
        storeCookies(new URL(req.url).host, entry.res);
        repeater.result = truncate(rawResponse(entry.res));
      } catch (err) { entry.error = err.message; repeater.result = `✗ ${err.message}`; }
      repeater.last = entry;
      out.textContent = repeater.result;
      showBtn.disabled = !entry.res;
    };
    const showBtn = el("button", { type: "button", class: "br-mini", text: "Show in page", disabled: !repeater.last?.res, on: { click: () => { if (repeater.last?.res) { current = { url: repeater.last.url, entry: repeater.last }; addr.value = repeater.last.url; show(repeater.last); } } } });
    return el("div", { class: "br-rep" },
      el("div", { class: "br-detail-head" }, el("b", { text: "Repeater" }),
        el("span", { class: "br-rep-actions" },
          el("button", { type: "button", class: "br-mini is-primary", text: "Send", on: { click: sendIt } }), showBtn,
          el("button", { type: "button", class: "br-mini", text: "Close", on: { click: () => { repeater = null; refreshDev(); } } }))),
      ta, el("div", { class: "br-detail-head" }, el("b", { text: "Response" })), out);
  }

  function sourceView() {
    if (!current?.entry?.res) return el("p", { class: "br-empty", text: "Load a page to see its source." });
    const lines = String(current.entry.res.body).split("\n");
    return el("div", { class: "br-source" },
      el("div", { class: "br-src-url", text: `view-source:${current.url}` }),
      el("pre", { class: "br-src" }, lines.map((l, i) => el("span", { class: "br-ln" }, el("i", { text: String(i + 1) }), l + "\n"))));
  }

  function cookieView() {
    const host = current ? new URL(current.url).host : Object.keys(jar)[0];
    if (!host) return el("p", { class: "br-empty", text: "No site loaded yet." });
    const rows = Object.entries(jar[host] || {});
    const name = el("input", { class: "br-in", placeholder: "name", "aria-label": "New cookie name", spellcheck: "false", autocapitalize: "off" });
    const value = el("input", { class: "br-in", placeholder: "value", "aria-label": "New cookie value", spellcheck: "false", autocapitalize: "off" });
    return el("div", { class: "br-cookies" },
      el("p", { class: "br-note" }, "Cookies for ", el("b", { text: host }), ". Edits apply immediately; reload the page to send them."),
      el("table", { class: "br-table" },
        el("tr", {}, el("th", { text: "Name" }), el("th", { text: "Value" }), el("th", { text: "HttpOnly" }), el("th")),
        rows.map(([k, c]) => {
          const v = el("input", { class: "br-in", value: c.value, "aria-label": `Value of ${k}`, spellcheck: "false", autocapitalize: "off" });
          v.addEventListener("change", () => { jar[host][k].value = v.value; });
          v.addEventListener("keydown", (e) => { if (e.key === "Enter") { jar[host][k].value = v.value; v.blur(); api.toast(`${k} updated`); } });
          return el("tr", {}, el("td", { class: "br-mono", text: k }), el("td", {}, v), el("td", { text: c.httpOnly ? "✓" : "" }),
            el("td", {}, el("button", { type: "button", class: "br-mini", text: "Delete", on: { click: () => { delete jar[host][k]; refreshDev(); } } })));
        })),
      el("div", { class: "br-addrow" }, name, value, el("button", { type: "button", class: "br-mini", text: "Add", on: { click: () => {
        if (!name.value.trim()) return;
        (jar[host] ||= {})[name.value.trim()] = { value: value.value, httpOnly: false };
        name.value = value.value = "";
        name.blur(); value.blur();
        refreshDev();
      } } })));
  }

  function consoleView() {
    return el("div", { class: "br-console" }, consoleLog.length ? consoleLog.map((c) => el("div", { class: `br-con is-${c.level || "info"}`, text: c.text })) : el("p", { class: "br-empty", text: "Script errors and dialogs from the page show up here." }));
  }

  function listenerView() {
    return el("div", { class: "br-listener" },
      el("p", { class: "br-note" }, "You control ", el("b", { text: `http://${ATTACKER_HOST}/` }), ". Any request that reaches it is logged here, from your browser or anyone else's."),
      heard.length ? heard.slice().reverse().map((h) => {
        const u = new URL(h.url);
        const params = [...u.searchParams.entries()];
        return el("div", { class: "br-heard" },
          el("div", { class: "br-heard-top" }, el("span", { class: `br-who ${h.who === "you" ? "" : "is-bot"}`, text: h.who }), el("span", { class: "br-mono", text: `${h.method} ${u.pathname}${u.search}` })),
          params.length ? el("div", { class: "br-params" }, params.map(([k, v]) => el("div", {}, el("b", { text: k + " = " }), el("span", { class: "br-mono", text: v })))) : null,
          h.body ? el("pre", { class: "br-raw", text: h.body }) : null);
      }) : el("p", { class: "br-empty", text: "Nothing yet." }));
  }

  function showDialog(host, data) {
    dialog.replaceChildren(el("div", { class: "br-dialog-box", role: "alertdialog", "aria-label": `${host} says` },
      el("b", { text: `${host} says` }),
      el("p", { text: data.message }),
      el("button", { type: "button", class: "br-mini is-primary", text: "OK", on: { click: () => { dialog.hidden = true; } } })));
    dialog.hidden = false;
    dialog.querySelector("button").focus();
  }

  if (env.listener) { toggleDev(true); setTab("listener"); }
  navigate("GET", env.start);
  return () => { destroyed = true; page?.destroy(); bots.forEach((b) => b.destroy()); document.querySelectorAll(".br-bot").forEach((b) => b.remove()); };
}

const shortUrl = (u) => { try { const x = new URL(u); return x.host + x.pathname + x.search; } catch { return u; } };
const truncate = (s, n = 6000) => (s.length > n ? s.slice(0, n) + `\n… (${s.length - n} more characters)` : s);
