// Parent side of the sandbox. Untrusted page HTML is rendered in an iframe with
// sandbox="allow-scripts" (so it gets an OPAQUE origin: no access to this site's
// storage, cookies or DOM, and its own document.* is a throwaway). The page can't
// reach the network — its CSP is default-src 'none' — so simulated pages talk to
// the simulated server only through postMessage back to this parent.
//
// The frame loads ../../sandbox.html, a real file with its own Content-Security-Policy,
// which then asks for the page to show. (A srcdoc frame would inherit THIS document's
// strict policy, and every inline script and style in a simulated site would be blocked.)
// sandbox.html refuses to do anything unless its origin is opaque, so it cannot be
// used to run script with this site's privileges.
import { el } from "../ui.js";

const token = () => {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
};

// Runs inside the rendered page, before its own markup. Serialised into the srcdoc.
function PRELUDE(cfg) {
  var token = cfg.token, base = cfg.url, cookieJar = cfg.cookie;
  var send = function (type, data) {
    try { parent.postMessage({ __breach: token, type: type, data: data }, "*"); } catch (err) { /* ignore */ }
  };
  var resolve = function (href) { try { return new URL(href, base).href; } catch (err) { return null; } };

  ["alert", "confirm", "prompt"].forEach(function (kind) {
    window[kind] = function (msg) { send("xss", { kind: kind, message: String(msg === undefined ? "" : msg) }); return kind === "confirm" ? true : null; };
  });

  try {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: function () { return cookieJar; },
      set: function (v) {
        var pair = String(v).split(";")[0], i = pair.indexOf("=");
        if (i < 1) return;
        var name = pair.slice(0, i).trim(), value = pair.slice(i + 1).trim();
        var parts = cookieJar ? cookieJar.split("; ").filter(function (c) { return c.split("=")[0] !== name; }) : [];
        parts.push(name + "=" + value);
        cookieJar = parts.join("; ");
        send("cookie", { name: name, value: value });
      },
    });
  } catch (err) { /* ignore */ }

  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || e.defaultPrevented) return;
    var href = a.getAttribute("href");
    e.preventDefault();
    if (/^\s*javascript:/i.test(href)) {
      try { (0, eval)(decodeURIComponent(href.replace(/^\s*javascript:/i, ""))); } catch (err) { /* ignore */ }
      return;
    }
    if (href.charAt(0) === "#") return;
    var u = resolve(href);
    if (u) send("nav", { method: "GET", url: u });
  }, false);

  var submitForm = function (form, submitter) {
    var method = (form.getAttribute("method") || "GET").toUpperCase();
    var action = resolve(form.getAttribute("action") || base);
    var fd = new FormData(form);
    if (submitter && submitter.name) fd.append(submitter.name, submitter.value || "");
    var body = new URLSearchParams();
    fd.forEach(function (v, k) { body.append(k, typeof v === "string" ? v : ""); });
    if (method === "GET") { var u = new URL(action); u.search = body.toString(); send("nav", { method: "GET", url: u.href }); }
    else send("nav", { method: "POST", url: action, body: body.toString(), contentType: "application/x-www-form-urlencoded" });
  };
  document.addEventListener("submit", function (e) { e.preventDefault(); submitForm(e.target, e.submitter); });
  try { HTMLFormElement.prototype.submit = function () { submitForm(this); }; } catch (err) { /* ignore */ }

  // location.assign/replace/href and the Navigation API all route back to the server.
  var navTo = function (href) { var u = resolve(href); if (u) send("nav", { method: "GET", url: u }); };
  try {
    var loc = { toString: function () { return base; }, assign: navTo, replace: navTo, reload: function () { navTo(base); } };
    Object.defineProperty(loc, "href", { get: function () { return base; }, set: navTo });
    ["protocol", "host", "hostname", "pathname", "search", "hash", "origin", "port"].forEach(function (k) {
      try { Object.defineProperty(loc, k, { get: function () { return new URL(base)[k]; }, set: function () {} }); } catch (e) {}
    });
    Object.defineProperty(window, "location", { get: function () { return loc; }, set: navTo, configurable: true });
    Object.defineProperty(document, "location", { get: function () { return loc; }, set: navTo, configurable: true });
  } catch (err) { /* older engines: fall back to the Navigation API */ }
  if (window.navigation && navigation.addEventListener) {
    navigation.addEventListener("navigate", function (e) {
      if (!e.cancelable || e.hashChange || e.downloadRequest) return;
      var u = e.destination && e.destination.url;
      if (u && u.indexOf("about:") !== 0) { e.preventDefault(); send("nav", { method: "GET", url: u }); }
    });
  }

  var pending = {}, seq = 0;
  addEventListener("message", function (e) {
    if (e.source !== parent || !e.data || e.data.__breach !== token || e.data.type !== "fetch-res") return;
    var p = pending[e.data.id]; if (!p) return; delete pending[e.data.id]; p(e.data);
  });
  var simFetch = function (method, url, headers, body) {
    return new Promise(function (done) { var id = ++seq; pending[id] = done; send("fetch", { id: id, method: method, url: url, headers: headers || {}, body: body == null ? "" : String(body) }); });
  };
  window.fetch = function (input, init) {
    init = init || {};
    var url = resolve(typeof input === "string" ? input : (input && input.url) || "");
    var headers = {};
    if (init.headers) { if (typeof init.headers.forEach === "function") init.headers.forEach(function (v, k) { headers[k] = v; }); else for (var k in init.headers) headers[k] = init.headers[k]; }
    return simFetch((init.method || "GET").toUpperCase(), url, headers, init.body).then(function (r) {
      return new Response(r.body, { status: r.status || 200, headers: r.headers || {} });
    });
  };
  window.XMLHttpRequest = function () {
    var x = this, method = "GET", url = "", headers = {}, listeners = {};
    x.readyState = 0; x.status = 0; x.responseText = ""; x.response = "";
    x.open = function (m, u) { method = String(m).toUpperCase(); url = resolve(u); x.readyState = 1; };
    x.setRequestHeader = function (k, v) { headers[k] = v; };
    x.addEventListener = function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); };
    x.getResponseHeader = function () { return null; };
    x.send = function (body) { simFetch(method, url, headers, body).then(function (r) {
      x.status = r.status; x.responseText = x.response = r.body; x.readyState = 4;
      if (x.onreadystatechange) x.onreadystatechange();
      if (x.onload) x.onload();
      (listeners.load || []).forEach(function (fn) { fn(); });
    }); };
  };
  navigator.sendBeacon = function (u, data) { simFetch("POST", resolve(u), {}, data); return true; };
  try {
    var srcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      configurable: true,
      get: function () { return srcDesc.get.call(this); },
      set: function (v) { var u = resolve(v); if (u && /^https?:/i.test(u)) simFetch("GET", u, {}, ""); else srcDesc.set.call(this, v); },
    });
  } catch (err) { /* ignore */ }
  window.open = function (u) { var r = resolve(u); if (r) send("nav", { method: "GET", url: r }); return null; };

  document.addEventListener("securitypolicyviolation", function (e) {
    if (/^https?:/i.test(e.blockedURI || "")) send("blocked", { url: e.blockedURI });
  });
  addEventListener("error", function (e) { send("console", { level: "error", text: String(e.message || "Script error") }); });
}

const PAGE_CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'";

function buildDoc({ html, url, cookie, token }) {
  const cfg = JSON.stringify({ token, url, cookie: cookie || "" }).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8">`
    + `<meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}">`
    + `<script>(${PRELUDE.toString()})(${cfg});<\/script></head><body>${html}</body></html>`;
}

/**
 * A persistent sandboxed frame in `container`. Call render() for each page; the frame
 * is REUSED (navigated to a fresh sandbox.html) rather than recreated — removing and
 * re-inserting an iframe in the same slot can skip script execution in Chromium.
 *
 * allow-forms lets the page's submit event fire so the prelude can intercept it; the
 * frame's form-action 'none' still stops any real submission.
 *
 * render({ html, url, cookie, onMessage, title }):
 *   onMessage(type, data, reply): xss, nav, fetch, cookie, blocked, console.
 */
export function createSandbox(container) {
  const frame = el("iframe", { class: "sb-frame", sandbox: "allow-scripts allow-forms", title: "Simulated page", referrerpolicy: "no-referrer" });
  container.replaceChildren(frame);
  let tok = null, onMsg = null, doc = null;
  const handler = (e) => {
    if (e.source !== frame.contentWindow || !e.data) return;
    // A freshly loaded sandbox.html asks for its page; hand over the latest one.
    if (e.data.__breach_ready) { if (doc !== null) frame.contentWindow.postMessage({ __breach_doc: doc }, "*"); return; }
    if (e.data.__breach !== tok) return;
    const reply = (obj) => frame.contentWindow?.postMessage({ ...obj, __breach: tok }, "*");
    onMsg?.(e.data.type, e.data.data || {}, reply);
  };
  window.addEventListener("message", handler);
  return {
    frame,
    render({ html, url, cookie = "", onMessage, title }) {
      tok = token();
      onMsg = onMessage;
      if (title) frame.title = title;
      doc = buildDoc({ html, url, cookie, token: tok });
      frame.src = new URL(`../../sandbox.html?${tok}`, import.meta.url).href;
    },
    destroy() { window.removeEventListener("message", handler); onMsg = null; doc = null; frame.remove(); },
  };
}

/** One-shot render into a fresh container (used for hidden bot frames). */
export function renderPage(container, opts) {
  const sb = createSandbox(container);
  sb.render(opts);
  return sb;
}
