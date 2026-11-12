// HTTP/1.1 over TCP (optionally TLS 1.3), browser-style.
//
// Up to `connections` parallel TCP connections (browsers allow 6 per host).
// Requests are handed to idle connections; each connection carries ONE
// outstanding request at a time (no pipelining, as in every modern browser),
// so a connection waits a full round trip per resource. With keep-alive the
// connection is reused; without it the server closes after each response
// ("Connection: close") and the next request needs a brand-new TCP (+TLS)
// handshake. Each response occupies exactly `size` full TCP segments.

import { tcpConnection } from "./lib/tcp.js";
import { tlsSession, OVERHEAD } from "./lib/tls.js";
import { PATHS, SERVER_THINK, DELAYED_ACK, MSS, requestText, responseHead, contentType, pageTracker, clamp, bytesLen } from "./lib/http.js";

const BASE_PORT = 51514;

export default {
  id: "http1",
  name: "HTTP/1.1",
  short: "One request at a time per TCP connection; browsers open up to 6 connections in parallel.",
  layers: ["IPv4", "TCP", "TLS", "HTTP/1.1"],
  options: [
    { key: "resources", label: "Resources", type: "number", default: 6, min: 1, max: 12, step: 1,
      hint: "Files the page needs (scripts, styles, images…)." },
    { key: "size", label: "Size per resource (segments)", type: "number", default: 2, min: 1, max: 8, step: 1,
      hint: "Each response fills this many 1460 B TCP segments." },
    { key: "connections", label: "Parallel connections", type: "number", default: 1, min: 1, max: 6, step: 1,
      hint: "Browsers open up to 6 per host; each carries one request at a time." },
    { key: "keepAlive", label: "Keep-alive (reuse connections)", type: "bool", default: true,
      hint: "Off: the server closes after every response, so each request pays a new handshake." },
    { key: "tls", label: "HTTPS (TLS 1.3)", type: "bool", default: true,
      hint: "Adds a 1-RTT TLS handshake to every new connection." },
  ],

  setup(sim, opts) {
    const resources = clamp(opts.resources, 1, 12), size = clamp(opts.size, 1, 8);
    const maxConns = clamp(opts.connections, 1, 6), keepAlive = opts.keepAlive !== false, useTls = opts.tls !== false;
    const paths = Array.from({ length: resources }, (_, i) => PATHS[i % PATHS.length]);
    const page = pageTracker(sim, paths);
    const queue = paths.map((_, i) => i);
    const conns = [];
    let open = 0, opened = 0;
    const scheme = useTls ? "TLS 1.3" : "plain TCP";
    sim.note("client", `${resources} resources, ${maxConns} connection${maxConns > 1 ? "s" : ""} (${scheme}), ` +
      (keepAlive ? "keep-alive" : "new connection per request") + " — one request in flight per connection", "info");

    function openConn() {
      const idle = conns.filter((c) => !c.closed && c.busy === null).length;  // connecting or idle
      if (open >= maxConns || queue.length <= idle) return;
      const n = ++opened; open++;
      const tag = maxConns > 1 || !keepAlive ? `conn ${n}` : "";
      const tcp = tcpConnection(sim, {
        clientPort: BASE_PORT + n - 1, serverPort: useTls ? 443 : 80,
        clientOpts: { delayedAck: DELAYED_ACK, tag },
        serverOpts: { delayedAck: DELAYED_ACK, tag, metrics: n === 1 },
      });
      const c = { n, tcp, tag, ready: false, busy: null, got: 0, closed: false };
      conns.push(c);
      if (useTls) {
        c.tls = tlsSession(sim, tcp, {
          version: "1.3", alpn: "http/1.1", tag,
          onClientReady() { ready(c); },
          onServerData: (d) => serverData(c, d),
          onClientData: (d) => clientData(c, d),
        });
        c.cwrite = c.tls.clientWrite; c.swrite = c.tls.serverWrite;
      } else {
        tcp.client.onEstablished = () => ready(c);
        tcp.server.onData = (d) => serverData(c, { ...d, appBytes: d.len, appOffset: d.offset });
        tcp.client.onData = (d) => clientData(c, { ...d, appBytes: d.len, appOffset: d.offset });
        c.cwrite = (b, m) => tcp.client.write(b, m); c.swrite = (b, m) => tcp.server.write(b, m);
      }
      tcp.server.onPeerClose = () => tcp.server.close();
      tcp.client.onPeerClose = () => tcp.client.close();
      tcp.client.connect();
    }

    function ready(c) {
      c.ready = true;
      if (page.handshakeMs === null) { page.handshakeMs = sim.now; sim.mark(useTls ? "TLS ready" : "TCP connected", "client"); }
      dispatch(c);
    }

    function dispatch(c) {
      if (!c.ready || c.busy !== null || c.closed || !queue.length) return;
      const i = queue.shift(), path = paths[i];
      c.busy = i; c.got = 0;
      if (page.firstRequestMs === null) page.firstRequestMs = sim.now;
      const text = requestText(path, { keepAlive });
      c.cwrite(bytesLen(text), {
        kind: "REQ", label: `GET ${path}`, payload: text, stream: i, res: i,
        headers: { http: { version: "1.1", method: "GET", path, headers: { Host: "example.com", Connection: keepAlive ? "keep-alive" : "close" } } },
      });
    }

    // Response: exactly `size` segments on the wire.
    const wireLen = size * MSS;
    const appLen = wireLen - (useTls ? OVERHEAD["1.3"] : 0);

    function serverData(c, d) {
      if (!d.last || d.meta.res === undefined) return;
      const i = d.meta.res, path = paths[i];
      sim.timer("server", SERVER_THINK, () => {
        let bodyLen = 0;
        for (let j = 0; j < 3; j++) bodyLen = appLen - bytesLen(responseHead(path, bodyLen, { keepAlive }));
        const head = responseHead(path, bodyLen, { keepAlive });
        c.swrite(appLen, {
          kind: "RES", label: `200 ${path}`, stream: i, res: i, appLen,
          payload: (k) => (k.i === 1 ? head + `(${bodyLen} B of ${contentType(path)})` : `…body continued (${k.len} B)`),
          headers: (k) => ({ http: { version: "1.1", status: 200, path, ...(k.i === 1 ? { headers: { "Content-Type": contentType(path), "Content-Length": String(bodyLen), Connection: keepAlive ? "keep-alive" : "close" } } : {}) } }),
        });
        if (!keepAlive) c.tcp.server.close();
      }, "server think");
    }

    function clientData(c, d) {
      const i = d.meta.res;
      if (i === undefined) return;
      c.got += d.appBytes;
      sim.deliver("client", { stream: i, label: `${paths[i]} ${c.got}/${appLen} B`, bytes: d.appBytes, offset: d.appOffset });
      if (!d.last) return;
      page.complete(i, paths[i]);
      c.busy = null;
      if (keepAlive) {
        dispatch(c);
        if (!queue.length && c.busy === null && !c.idleNoted) {
          c.idleNoted = true;
          if (conns.every((x) => x.busy === null)) sim.note("client", "all responses in — connections stay open, idle, for reuse (keep-alive)", "info");
        }
      } else {
        c.closed = true; open--;
        openConn();
      }
    }

    for (let k = 0; k < Math.min(maxConns, resources); k++) openConn();

    return {
      summary() {
        const rtt = 2 * sim.link.latency;
        const sum = (f) => conns.reduce((s, c) => s + f(c), 0);
        return {
          handshakeMs: page.handshakeMs, firstRequestMs: page.firstRequestMs,
          firstResourceMs: page.firstResourceMs, pageLoadMs: page.pageLoadMs,
          connections: opened, resources, completedResources: page.done,
          roundTrips: page.pageLoadMs === null || !rtt ? null : +(page.pageLoadMs / rtt).toFixed(1),
          rtoCount: sum((c) => c.tcp.client.stats.rto + c.tcp.server.stats.rto),
          fastRetransmits: sum((c) => c.tcp.client.stats.fastRetx + c.tcp.server.stats.fastRetx),
          streamDone: { ...page.streamDone }, completed: page.pageLoadMs !== null,
        };
      },
    };
  },
};
