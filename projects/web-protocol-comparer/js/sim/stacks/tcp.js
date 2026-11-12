// TCP: a bulk upload from client to server over one connection.
//
// The client is the data sender, so cwnd / ssthresh are the client's. Every
// segment is ACKed (no delayed ACKs) so slow start's "one ACK → one more
// segment" doubling is easy to see. See lib/tcp.js for what is modelled.

import { tcpConnection, MSS } from "./lib/tcp.js";

const CLIENT_PORT = 51514;
const SERVER_PORT = 5201;   // iperf3's port: a bulk-transfer test

export default {
  id: "tcp",
  name: "TCP",
  short: "Reliable, ordered byte stream: handshake, ACKs, retransmission, congestion control.",
  layers: ["IPv4", "TCP"],
  options: [
    { key: "segments", label: "Segments to send", type: "number", default: 12, min: 1, max: 40, step: 1,
      hint: "Full-size 1460 B segments uploaded client → server." },
    { key: "initCwnd", label: "Initial cwnd (segments)", type: "number", default: 2, min: 1, max: 10, step: 1,
      hint: "Segments the client may send before the first ACK. Linux uses 10 (RFC 6928)." },
    { key: "ssthresh", label: "Initial ssthresh (segments)", type: "number", default: 16, min: 2, max: 64, step: 1,
      hint: "Slow start (doubling per RTT) stops here; then +1 segment per RTT." },
    { key: "rwnd", label: "Receive window (segments)", type: "number", default: 32, min: 1, max: 64, step: 1,
      hint: "Server's buffer: at most this many bytes may be unacknowledged." },
    { key: "fastRetransmit", label: "Fast retransmit", type: "bool", default: true,
      hint: "Resend after 3 duplicate ACKs instead of waiting for the retransmission timer." },
    { key: "teardown", label: "Close with FIN", type: "bool", default: true,
      hint: "FIN / ACK / FIN / ACK after the upload." },
  ],

  setup(sim, opts) {
    const segments = clamp(opts.segments, 1, 40), initCwnd = clamp(opts.initCwnd, 1, 10);
    const ssthresh = clamp(opts.ssthresh, 2, 64), rwnd = clamp(opts.rwnd, 1, 64);
    const fastRetransmit = opts.fastRetransmit !== false, teardown = opts.teardown !== false;
    const res = { handshakeMs: null, completeMs: null, deliveredMs: null };

    const { client, server } = tcpConnection(sim, {
      clientPort: CLIENT_PORT, serverPort: SERVER_PORT,
      clientOpts: { initCwnd, ssthresh, fastRetransmit, metrics: true },
      serverOpts: { rcvBuf: rwnd * MSS },
    });

    let received = 0;
    client.onEstablished = () => {
      res.handshakeMs = sim.now;
      sim.mark("handshake done", "client");
      sim.note("client", `connected after 1 RTT — cwnd ${initCwnd}, ssthresh ${ssthresh}, server window ${rwnd} × ${MSS} B`, "info");
      client.write(segments * MSS, {
        kind: "DATA",
        label: (k) => `seq ${k.seq} (${k.len} B)`,
        payload: (k) => `upload bytes ${k.offset + 1}–${k.offset + k.len} of ${k.total}`,
      });
    };
    client.onAllAcked = () => {
      if (res.completeMs !== null) return;
      res.completeMs = sim.now;
      sim.mark("upload acknowledged", "client");
      sim.note("client", `all ${segments} segments acknowledged`, "good");
      if (teardown) client.close();
    };
    server.onData = (d) => {
      received += d.len;
      sim.deliver("server", { stream: 0, label: `bytes ${d.offset + 1}–${d.offset + d.len}`, bytes: d.len, offset: d.offset });
      if (received === segments * MSS) { res.deliveredMs = sim.now; sim.mark("all data delivered", "server"); }
    };
    server.onPeerClose = () => server.close();

    client.connect();

    return {
      summary() {
        const rtt = 2 * sim.link.latency;
        return {
          handshakeMs: res.handshakeMs, completeMs: res.completeMs, deliveredMs: res.deliveredMs,
          rtoCount: client.stats.rto, fastRetransmits: client.stats.fastRetx, dupAcks: client.stats.dupAcks,
          maxCwnd: client.stats.maxCwnd, finalCwnd: Math.floor(client.cwnd),
          ssthresh: Number.isFinite(client.ssthresh) ? client.ssthresh : null,
          srttMs: client.srtt === null ? null : Math.round(client.srtt), rtoMs: Math.round(client.rto),
          roundTrips: res.completeMs === null || !rtt ? null : +(res.completeMs / rtt).toFixed(1),
          goodputKbps: res.deliveredMs ? Math.round((segments * MSS * 8) / res.deliveredMs) : null,
          completed: res.completeMs !== null,
        };
      },
    };
  },
};

function clamp(v, lo, hi) { v = Number(v); return Math.max(lo, Math.min(hi, Number.isFinite(v) ? Math.round(v) : lo)); }
