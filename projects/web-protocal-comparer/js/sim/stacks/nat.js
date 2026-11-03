// NAT (network address and port translation, RFC 3022 / RFC 4787) at a home router.
//
// The laptop has a private address (192.168.1.20, RFC 1918) that can't be
// routed on the Internet. When it opens a TCP connection to a web server,
// the router rewrites the source 192.168.1.20:51514 to its own public address
// 203.0.113.7 and a free port (40001), remembers the mapping, and translates
// the server's replies back. The server only ever sees 203.0.113.7:40001.
// The mapping only exists because the inside host spoke first — so when the
// outside server later tries to open a connection to the laptop's port 8080,
// the router has nothing to translate it to and silently drops the SYN; the
// server retries and gives up. A port-forward rule (203.0.113.7:8080 →
// 192.168.1.20:8080) is the static mapping that lets it in.
// TLS on :443 is left out so the TCP segments and the translation stay visible.

import { tcpConnection } from "./lib/tcp.js";
import { PUBLIC_IP } from "../engine.js";

const CLIENT_PORT = 51514;     // the laptop's ephemeral port
const HTTPS = 443;
const LISTEN_PORT = 8080;      // a service the laptop runs (dev web server, game host…)
const REMOTE_PORT = 50612;     // the outside host's ephemeral port for the inbound attempt
const REQ = 420, RES = 1300;   // small request / response (bytes of TCP payload)
const SYN_RETRIES = 2;         // outside host gives up after 3 SYNs (Linux default is 6, ~2 min)
const WATCHDOG = 30000;        // ms: stop a connection still stuck in retransmissions (keeps the sim short)

export default {
  id: "nat",
  name: "NAT",
  short: "How a home router shares one public IP: address/port translation, and why inbound connections are blocked.",
  layers: ["IPv4", "TCP"],
  options: [
    { key: "portForward", label: "Port forward :8080 → laptop", type: "bool", default: false,
      hint: "A static rule on the router: 203.0.113.7:8080 → 192.168.1.20:8080, so outside hosts can connect in." },
    { key: "inbound", label: "Outside host connects in", type: "bool", default: true,
      hint: "After the outbound request, the server tries to open a connection to the laptop's port 8080." },
  ],
  nodes() { return ["client", "r1", "server"]; },
  nat: (opts) => ({ router: "r1", forward: opts.portForward ? [{ proto: "tcp", port: LISTEN_PORT, toPort: LISTEN_PORT }] : [] }),
  labels: { client: "Laptop", r1: "Home router (NAT)", server: "Web server" },

  setup(sim, opts) {
    const portForward = !!opts.portForward, inbound = opts.inbound !== false;
    const res = { connectMs: null, responseMs: null, inboundTried: false, inboundBlocked: 0, inboundConnected: null, inboundDoneMs: null, inboundFailed: false };
    const priv = sim.addr("client"), srvIp = sim.addr("server");

    // ---- 1. outbound: laptop → server:443 -------------------------------------------------------------
    const out = tcpConnection(sim, {
      client: "client", server: "server", clientPort: CLIENT_PORT, serverPort: HTTPS,
      serverOpts: { anyPeerPort: true },   // the server sees the NAT's port, not 51514
    });
    // Let the server say who it thinks is calling (wrap the TCP demultiplexer's handler).
    const tcpServer = sim.handlers.get("server");
    let seenFrom = false;
    sim.on("server", (p) => {
      if (!seenFrom && p.kind === "SYN" && p.headers.tcp.dstPort === HTTPS) {
        seenFrom = true;
        sim.note("server", `SYN from ${p.headers.ip.src}:${p.headers.tcp.srcPort} — the router's public address; ${priv} is invisible out here`, "info");
      }
      tcpServer(p);
    });

    out.client.onEstablished = () => {
      res.connectMs = sim.now;
      sim.mark("connected", "client");
      out.client.write(REQ, { kind: "DATA", label: `request (${REQ} B)`, payload: "HTTPS request (encrypted; TLS not shown)" });
    };
    out.server.onData = (d) => {
      if (!d.last) return;
      out.server.write(RES, { kind: "DATA", label: `response (${RES} B)`, payload: "HTTPS response (encrypted; TLS not shown)" });
    };
    out.client.onData = (d) => {
      sim.deliver("client", { label: `response bytes ${d.offset + 1}–${d.offset + d.len}`, bytes: d.len });
      if (!d.last || res.responseMs !== null) return;
      res.responseMs = sim.now;
      sim.mark("response received", "client");
      sim.note("client", `reply came back to ${priv}:${CLIENT_PORT} — the router translated it using its mapping`, "good");
      out.client.close();
      if (inbound) sim.timer("server", 4 * sim.link.latency + 100, startInbound, "inbound attempt");
    };
    out.server.onPeerClose = () => out.server.close();

    // Under heavy loss TCP's exponential backoff can run for minutes; stop waiting after a while.
    const finished = (e) => ["CLOSED", "TIME_WAIT", "LISTEN"].includes(e.state);
    const settle = (c) => { if (c.dog && finished(c.client) && finished(c.server)) { sim.cancel(c.dog); c.dog = null; } };
    const watchdog = (c, what) => c.dog = sim.timer("client", WATCHDOG, () => {
      c.dog = null;
      const stuck = [c.client, c.server].filter((e) => !finished(e));
      if (!stuck.length) return;
      for (const e of stuck) e.abort();
      sim.note("client", `${what}: still retransmitting after ${WATCHDOG / 1000} s — the sim stops here (real TCP keeps backing off, then resets)`, "warn");
    }, "give up");

    // ---- 2. inbound: server → 203.0.113.7:8080 -------------------------------------------------------
    const startInbound = () => {
      res.inboundTried = true;
      const inb = tcpConnection(sim, {
        client: "server", server: "client", clientPort: REMOTE_PORT, serverPort: LISTEN_PORT,
        clientOpts: { synRetries: SYN_RETRIES, tag: "inbound" }, serverOpts: { tag: ":8080" },
      });
      sim.note("client", `an app on the laptop is listening on ${priv}:${LISTEN_PORT}`, "info");
      sim.note("server", `now the server tries to connect IN: ${PUBLIC_IP}:${LISTEN_PORT}` +
        (portForward ? " (the router has a port-forward rule)" : " — no mapping exists for that port"), "info");
      inb.client.onEstablished = () => {
        res.inboundConnected = sim.now;
        sim.mark("inbound connected", "server");
        sim.note("server", `connected through the port forward to ${PUBLIC_IP}:${LISTEN_PORT}`, "good");
        inb.client.write(200, { kind: "DATA", label: "request (200 B)", payload: "GET / HTTP/1.1 (to the laptop's server)" });
      };
      inb.server.onData = (d) => {
        if (!d.last) return;
        inb.server.write(600, { kind: "DATA", label: "response (600 B)", payload: "HTTP/1.1 200 OK (from the laptop)" });
      };
      inb.client.onData = (d) => {
        if (!d.last || res.inboundDoneMs !== null) return;
        res.inboundDoneMs = sim.now;
        sim.deliver("server", { label: "inbound response", bytes: d.len });
        inb.client.close();
      };
      watchdog(inb, "inbound connection");
      inb.client.onClosed = inb.server.onClosed = () => settle(inb);
      inb.server.onPeerClose = () => inb.server.close();
      inb.client.onConnectFail = () => {
        res.inboundFailed = true;
        settle(inb);
        sim.note("server", `connection to ${PUBLIC_IP}:${LISTEN_PORT} timed out — NAT drops unsolicited inbound connections` +
          (portForward ? "" : " (fix: a port-forward rule)"), "loss");
      };
      inb.client.connect();
    };

    sim.note("client", `private address ${priv} (RFC 1918) — not routable on the Internet; connect to ${srvIp}:${HTTPS}`, "info");
    out.client.connect();
    watchdog(out, "outbound connection");
    out.client.onClosed = out.server.onClosed = () => settle(out);

    return {
      summary(trace) {
        const m = sim.natMap.find((e) => e.privPort === CLIENT_PORT);
        res.inboundBlocked = trace.packets.filter((p) => p.blocked).length;
        return {
          publicIp: PUBLIC_IP, mappedPort: m ? m.pubPort : null,
          connectMs: res.connectMs, responseMs: res.responseMs,
          inboundTried: res.inboundTried, inboundBlocked: res.inboundBlocked,
          inboundConnectedMs: res.inboundConnected, inboundFailed: res.inboundFailed,
          failed: res.responseMs === null,
        };
      },
    };
  },
};
