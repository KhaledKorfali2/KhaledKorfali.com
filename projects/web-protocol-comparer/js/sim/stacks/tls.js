// TLS: TCP handshake + TLS 1.3 (1-RTT) or TLS 1.2 (2-RTT) handshake, then one
// HTTPS request and response. See lib/tls.js for the exact flights and sizes.

import { tcpConnection } from "./lib/tcp.js";
import { tlsSession } from "./lib/tls.js";
import { requestText, responseHead, DELAYED_ACK, bytesLen, MSS } from "./lib/http.js";

const CLIENT_PORT = 51514, SERVER_PORT = 443;
const BODY = 3 * MSS - 300;   // a ~4 KB HTML page: with headers and record overhead, 3 segments

export default {
  id: "tls",
  name: "TLS",
  short: "TCP + TLS handshake (1.3: 1 RTT, 1.2: 2 RTTs) before the first encrypted HTTPS request.",
  layers: ["IPv4", "TCP", "TLS", "HTTP/1.1"],
  options: [
    { key: "version", label: "TLS version", type: "select", default: "1.3",
      choices: [["1.3", "TLS 1.3 (1-RTT)"], ["1.2", "TLS 1.2 (2-RTT)"]],
      hint: "1.3 sends its key share in the ClientHello, saving a round trip." },
  ],

  setup(sim, opts) {
    const version = opts.version === "1.2" ? "1.2" : "1.3";
    const res = { tcpMs: null, tlsMs: null, requestMs: null, firstByteMs: null, completeMs: null };
    const conn = tcpConnection(sim, {
      clientPort: CLIENT_PORT, serverPort: SERVER_PORT,
      clientOpts: { delayedAck: DELAYED_ACK },
      serverOpts: { delayedAck: DELAYED_ACK, metrics: true },
    });
    const req = requestText("/");
    const head = responseHead("/", BODY);
    const respLen = bytesLen(head) + BODY;
    let got = 0;

    const tls = tlsSession(sim, conn, {
      version, alpn: "http/1.1", ticket: true,
      onClientEstablished() { res.tcpMs = sim.now; sim.mark("TCP connected", "client"); },
      onClientReady() {
        res.tlsMs = sim.now;
        sim.mark("TLS ready", "client");
        res.requestMs = sim.now;
        tls.clientWrite(bytesLen(req), {
          kind: "REQ", label: "GET /", payload: req,
          headers: { http: { version: "1.1", method: "GET", path: "/", headers: { Host: "example.com", Connection: "keep-alive" } } },
        });
      },
      onServerData(d) {
        if (!d.last) return;
        tls.serverWrite(respLen, {
          kind: "RES", label: "200 /",
          payload: (k) => (k.i === 1 ? head + `<!doctype html>… (${BODY} B of HTML)` : `…HTML continued (${k.len} B incl. TLS record bytes)`),
          headers: (k) => ({ http: { version: "1.1", status: 200, path: "/", ...(k.i === 1 ? { headers: { "Content-Type": "text/html", "Content-Length": String(BODY) } } : {}) } }),
        });
      },
      onClientData(d) {
        if (res.firstByteMs === null) { res.firstByteMs = sim.now; sim.mark("first byte", "client"); }
        got += d.appBytes;
        sim.deliver("client", { stream: 0, label: `/ ${got}/${respLen} B`, bytes: d.appBytes, offset: d.appOffset });
        if (d.last) {
          res.completeMs = sim.now;
          sim.mark("page loaded", "client");
          sim.note("client", "response complete — connection stays open (keep-alive) for further requests", "good");
        }
      },
    });

    conn.client.connect();

    return {
      summary() {
        const rtt = 2 * sim.link.latency;
        const r = (t) => (t === null || !rtt ? null : +(t / rtt).toFixed(1));
        return {
          version, handshakeMs: res.tlsMs, tcpMs: res.tcpMs, requestMs: res.requestMs, firstByteMs: res.firstByteMs,
          completeMs: res.completeMs, requestRtts: r(res.requestMs), completeRtts: r(res.completeMs),
          rtoCount: conn.client.stats.rto + conn.server.stats.rto,
          fastRetransmits: conn.client.stats.fastRetx + conn.server.stats.fastRetx,
          completed: res.completeMs !== null,
        };
      },
    };
  },
};
