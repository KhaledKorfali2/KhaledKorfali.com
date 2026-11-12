// HTTP/2 over one TCP + TLS 1.3 connection (ALPN "h2").
//
// After the handshake the client sends every request at once as a HEADERS
// frame on its own stream (1, 3, 5, …). The server interleaves the responses
// round-robin, one frame per TCP segment, writing only when the socket can
// send (like a real server's write loop), so streams that arrive later join
// the rotation. Streams are an HTTP/2 idea: TCP below sees one byte stream, so
// a single lost segment holds back the data of EVERY stream behind it — TCP
// head-of-line blocking, which HTTP/3 removes.
//
// Frames: client preface + SETTINGS + WINDOW_UPDATE ride with the first
// HEADERS; the server's SETTINGS goes out with its TLS flight (0.5-RTT data)
// and its SETTINGS ACK with the first response frame. Flow-control windows are
// opened wide (as Chrome does), so they never limit this demo.

import { tcpConnection } from "./lib/tcp.js";
import { tlsSession, OVERHEAD } from "./lib/tls.js";
import { PATHS, SERVER_THINK, DELAYED_ACK, MSS, contentType, pageTracker, clamp } from "./lib/http.js";

const CLIENT_PORT = 51514, SERVER_PORT = 443;
const FRAME_HDR = 9;
const PREFACE = 24 + (FRAME_HDR + 12) + FRAME_HDR + (FRAME_HDR + 4);   // magic, SETTINGS(2), SETTINGS ACK, WINDOW_UPDATE
const REQ_HPACK_FIRST = 120, REQ_HPACK = 38;   // later requests reuse the HPACK dynamic table
const RESP_HPACK = 40;
const SEG_APP = MSS - OVERHEAD["1.3"];        // h2 bytes per full segment (one TLS record each)

export default {
  id: "http2",
  name: "HTTP/2",
  short: "All requests multiplexed as streams on one TCP + TLS connection.",
  layers: ["IPv4", "TCP", "TLS", "HTTP/2"],
  options: [
    { key: "resources", label: "Resources", type: "number", default: 6, min: 1, max: 12, step: 1,
      hint: "Each request is its own stream (ids 1, 3, 5, …) on the same connection." },
    { key: "size", label: "Size per resource (segments)", type: "number", default: 2, min: 1, max: 8, step: 1,
      hint: "Each response fills this many 1460 B TCP segments." },
  ],

  setup(sim, opts) {
    const resources = clamp(opts.resources, 1, 12), size = clamp(opts.size, 1, 8);
    const ids = Array.from({ length: resources }, (_, i) => 2 * i + 1);
    const pathOf = (id) => PATHS[((id - 1) / 2) % PATHS.length];
    const page = pageTracker(sim, ids);
    const conn = tcpConnection(sim, {
      clientPort: CLIENT_PORT, serverPort: SERVER_PORT,
      clientOpts: { delayedAck: DELAYED_ACK },
      serverOpts: { delayedAck: DELAYED_ACK, metrics: true },
    });
    const { client, server } = conn;

    // ---- server: per-stream frame queues, round-robin writer ----
    const pending = new Map();       // stream id → remaining segments to write
    const order = [];
    let rr = 0, pumpTimer = null, settingsAcked = false;

    function pump() {
      while (order.length && server.sendable()) {
        rr %= order.length;
        const id = order[rr], st = pending.get(id);
        writeFrame(id, st);
        if (st.next > size) { order.splice(rr, 1); pending.delete(id); } else rr++;
      }
    }
    server.onSendable = pump;

    function writeFrame(id, st) {
      const i = st.next++, first = i === 1, last = i === size, path = pathOf(id);
      const frames = [];
      if (!settingsAcked) { settingsAcked = true; frames.push("SETTINGS ACK"); }
      if (first) frames.push(`HEADERS (:status 200, ${contentType(path)})`);
      const hdr = (frames.includes("SETTINGS ACK") ? FRAME_HDR : 0) + (first ? FRAME_HDR + RESP_HPACK : 0);
      const data = SEG_APP - hdr - FRAME_HDR;
      frames.push(`DATA ${data} B${last ? " END_STREAM" : ""}`);
      tls.serverWrite(SEG_APP, {
        kind: "RES", label: `DATA s${id} ${path} (${i}/${size})`, stream: id, h2: { id, i, last, bytes: SEG_APP },
        payload: frames.map((f) => `[stream ${f.startsWith("SETTINGS") ? 0 : id}] ${f}`).join("\n"),
        headers: { http: { version: "2", stream: id, frame: first ? "HEADERS+DATA" : "DATA", ...(first ? { status: 200 } : {}), path, frames } },
      });
    }

    // ---- client ----
    const got = new Map(ids.map((id) => [id, 0]));
    const total = size * SEG_APP;
    let gapStreams = null;
    client.onHold = ({ seg }) => {
      const s = seg.meta && seg.meta.h2 && seg.meta.h2.id;
      if (s === undefined || !gapStreams || gapStreams.has(s)) return;
      gapStreams.add(s);
      if (gapStreams.size <= 3) {
        sim.note("client", `head-of-line blocked: stream ${s} (${pathOf(s)}) data is here, but TCP holds it until the missing segment is retransmitted`, "warn");
      }
    };
    client.onRelease = () => {
      if (gapStreams && gapStreams.size) {
        sim.note("client", `retransmission arrived → streams ${[...gapStreams].join(", ")} released together`, "good");
      }
      gapStreams = new Set();
    };
    gapStreams = new Set();

    const tls = tlsSession(sim, conn, {
      version: "1.3", alpn: "h2",
      halfRtt: ["SETTINGS (h2, 0.5-RTT data)", "application_data", OVERHEAD["1.3"] + FRAME_HDR + 18,
        "[stream 0] SETTINGS MAX_CONCURRENT_STREAMS 128, INITIAL_WINDOW_SIZE 64 KB, MAX_FRAME_SIZE 16 KB\n(server's first HTTP/2 frame, sent right after its Finished)"],
      onClientReady() {
        page.handshakeMs = sim.now;
        page.firstRequestMs = sim.now;
        sim.mark("TLS ready", "client");
        sim.note("client", `sending all ${resources} requests at once, one stream each — no waiting between them`, "info");
        ids.forEach((id, k) => {
          const path = pathOf(id);
          const len = (k === 0 ? PREFACE : 0) + FRAME_HDR + (k === 0 ? REQ_HPACK_FIRST : REQ_HPACK);
          const frames = [...(k === 0 ? ["connection preface (PRI * HTTP/2.0)", "SETTINGS", "SETTINGS ACK", "WINDOW_UPDATE +15 MB"] : []),
            `HEADERS END_STREAM (:method GET, :path ${path})`];
          tls.clientWrite(len, {
            kind: "REQ", label: `HEADERS s${id} GET ${path}`, stream: id, h2req: id,
            payload: frames.map((f) => `[stream ${f.startsWith("HEADERS") ? id : 0}] ${f}`).join("\n") +
              `\n\n:method GET\n:scheme https\n:authority example.com\n:path ${path}\n(HPACK-compressed${k ? ", mostly references to earlier headers" : ""})`,
            headers: { http: { version: "2", stream: id, frame: "HEADERS", method: "GET", path, frames } },
          });
        });
      },
      onServerData(d) {
        const id = d.meta.h2req;
        if (id === undefined || !d.last || pending.has(id)) return;
        pending.set(id, { next: 1 });
        order.push(id);
        // Gather requests that arrive together, then answer them round-robin.
        if (pumpTimer === null) pumpTimer = sim.timer("server", SERVER_THINK, () => { pumpTimer = null; pump(); }, "server think");
      },
      onClientData(d) {
        const h = d.meta.h2;
        if (!h) return;
        const now = got.get(h.id) + d.appBytes;
        got.set(h.id, now);
        sim.deliver("client", { stream: h.id, label: `${pathOf(h.id)} ${now}/${total} B`, bytes: d.appBytes, offset: now - d.appBytes });
        if (h.last && d.last) page.complete(h.id, `${pathOf(h.id)} (stream ${h.id})`);
      },
    });

    client.connect();

    return {
      summary() {
        const rtt = 2 * sim.link.latency;
        return {
          handshakeMs: page.handshakeMs, firstRequestMs: page.firstRequestMs,
          firstResourceMs: page.firstResourceMs, pageLoadMs: page.pageLoadMs,
          connections: 1, resources, completedResources: page.done,
          roundTrips: page.pageLoadMs === null || !rtt ? null : +(page.pageLoadMs / rtt).toFixed(1),
          rtoCount: client.stats.rto + server.stats.rto, fastRetransmits: client.stats.fastRetx + server.stats.fastRetx,
          maxCwnd: server.stats.maxCwnd,
          streamDone: { ...page.streamDone }, completed: page.pageLoadMs !== null,
        };
      },
    };
  },
};
