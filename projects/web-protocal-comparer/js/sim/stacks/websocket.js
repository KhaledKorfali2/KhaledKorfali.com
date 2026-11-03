// WebSocket (RFC 6455) over plain TCP (ws://).
//
// TCP handshake → HTTP/1.1 GET with "Upgrade: websocket" and a random
// Sec-WebSocket-Key → "101 Switching Protocols" whose Sec-WebSocket-Accept is
// base64(SHA-1(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")). From then on the
// same TCP connection carries frames in both directions with no request /
// response pairing: the client sends text frames (always masked with a fresh
// 4-byte key), the server pushes whenever it likes (never masked). The server
// pings; the browser answers with a pong automatically. Closing is a CLOSE
// frame each way (status 1000), then the server closes TCP first (RFC 6455
// §7.1.1) so the TIME_WAIT lands on the server.

import { tcpConnection } from "./lib/tcp.js";
import { DELAYED_ACK, clamp, bytesLen } from "./lib/http.js";

const CLIENT_PORT = 51514, SERVER_PORT = 80;
// The RFC 6455 §1.3 example pair (verified: base64(SHA-1(key + GUID))).
const WS_KEY = "dGhlIHNhbXBsZSBub25jZQ==";
const WS_ACCEPT = "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=";
const CLIENT_EVERY = 150;   // ms between chat messages typed by the user
const PUSH_EVERY = 220;     // ms between server pushes
const PING_AT = 300;        // ms after the upgrade

const UPGRADE = [
  "GET /chat HTTP/1.1",
  "Host: example.com",
  "Upgrade: websocket",
  "Connection: Upgrade",
  `Sec-WebSocket-Key: ${WS_KEY}`,
  "Sec-WebSocket-Version: 13",
  "Origin: http://example.com",
  "User-Agent: Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0",
  "Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits",
  "", "",
].join("\r\n");
const SWITCH = [
  "HTTP/1.1 101 Switching Protocols",
  "Upgrade: websocket",
  "Connection: Upgrade",
  `Sec-WebSocket-Accept: ${WS_ACCEPT}`,
  "", "",
].join("\r\n");

// 2 B base header (+2 B extended length when > 125) (+4 B mask key from the client).
const frameLen = (payload, masked) => 2 + (payload > 125 ? 2 : 0) + (masked ? 4 : 0) + payload;

export default {
  id: "websocket",
  name: "WebSocket",
  short: "An HTTP Upgrade turns one TCP connection into a full-duplex message channel.",
  layers: ["IPv4", "TCP", "HTTP/1.1", "WebSocket"],
  options: [
    { key: "messages", label: "Client messages", type: "number", default: 4, min: 1, max: 10, step: 1,
      hint: "Text frames the browser sends (masked)." },
    { key: "pushes", label: "Server pushes", type: "number", default: 3, min: 0, max: 10, step: 1,
      hint: "Frames the server sends unprompted — no request needed." },
    { key: "ping", label: "Ping / pong", type: "bool", default: true,
      hint: "Server checks the connection is alive; the browser answers automatically." },
  ],

  setup(sim, opts) {
    const messages = clamp(opts.messages, 1, 10), pushes = clamp(opts.pushes, 0, 10), ping = opts.ping !== false;
    const res = { tcpMs: null, upgradeMs: null, closeMs: null, toServer: 0, toClient: 0, pong: !ping, closing: false };
    const { client, server } = tcpConnection(sim, {
      clientPort: CLIENT_PORT, serverPort: SERVER_PORT,
      clientOpts: { delayedAck: DELAYED_ACK },
      serverOpts: { delayedAck: DELAYED_ACK, metrics: true },
    });
    const maskKey = () => Array.from({ length: 4 }, () => Math.floor(sim.rand() * 256).toString(16).padStart(2, "0")).join("");

    function sendFrame(ep, { kind, opcode, text, label, code }) {
      const masked = ep === client;               // client → server frames MUST be masked
      const key = masked ? maskKey() : undefined;
      const len = code ? 2 + bytesLen(text || "") : bytesLen(text || "");
      const ws = { fin: true, opcode, masked, ...(masked ? { maskKey: key } : {}), length: len };
      ep.write(frameLen(len, masked), {
        kind, label, ws: { opcode, text, code },
        headers: { ws },
        payload: (code ? `status ${code}${text ? ` "${text}"` : ""}` : text || "(empty)") +
          (masked ? `\n(masked on the wire: each byte XOR mask key ${key})` : ""),
      });
    }

    // ---- client ----
    client.onEstablished = () => {
      res.tcpMs = sim.now;
      client.write(bytesLen(UPGRADE), {
        kind: "UPGRADE", label: "GET /chat (Upgrade: websocket)", payload: UPGRADE, http: true,
        headers: { http: { version: "1.1", method: "GET", path: "/chat", headers: { Upgrade: "websocket", Connection: "Upgrade", "Sec-WebSocket-Key": WS_KEY, "Sec-WebSocket-Version": "13" } } },
      });
    };
    client.onData = (d) => {
      if (!d.last) return;
      const m = d.meta;
      if (m.http) {
        res.upgradeMs = sim.now;
        sim.mark("WebSocket open", "client");
        sim.note("client", `101 received: Sec-WebSocket-Accept ${WS_ACCEPT} matches base64(SHA-1(key + GUID)) → socket open`, "good");
        for (let i = 1; i <= messages; i++) {
          sim.timer("client", (i - 1) * CLIENT_EVERY, () => {
            sendFrame(client, { kind: "FRAME", opcode: "text", text: JSON.stringify({ type: "chat", text: `hello #${i}` }), label: `text "hello #${i}"` });
            sent++;
            maybeClose();
          }, "user types");
        }
        return;
      }
      const ws = m.ws;
      if (ws.opcode === "text") {
        res.toClient++;
        sim.deliver("client", { stream: "ws", label: `push ${res.toClient}`, bytes: bytesLen(ws.text) });
        maybeClose();
      } else if (ws.opcode === "ping") {
        sendFrame(client, { kind: "PONG", opcode: "pong", text: ws.text, label: "PONG" });
        res.pong = true;
        maybeClose();
      } else if (ws.opcode === "close") {
        sim.note("client", "server echoed CLOSE — waiting for the server to close TCP", "info");
      }
    };
    let sent = 0;
    function maybeClose() {
      if (res.closing || sent < messages || res.toClient < pushes || !res.pong) return;
      res.closing = true;
      sim.note("client", "done: start the WebSocket closing handshake", "info");
      sendFrame(client, { kind: "CLOSE", opcode: "close", code: 1000, text: "done", label: "CLOSE 1000" });
    }
    client.onPeerClose = () => { res.closeMs = sim.now; sim.mark("closed", "client"); client.close(); };

    // ---- server ----
    let serverOpen = false;
    server.onData = (d) => {
      if (!d.last) return;
      const m = d.meta;
      if (m.http) {
        server.write(bytesLen(SWITCH), {
          kind: "101", label: "101 Switching Protocols", payload: SWITCH, http: true,
          headers: { http: { version: "1.1", status: 101, headers: { Upgrade: "websocket", Connection: "Upgrade", "Sec-WebSocket-Accept": WS_ACCEPT } } },
        });
        serverOpen = true;
        for (let j = 1; j <= pushes; j++) {
          sim.timer("server", 100 + (j - 1) * PUSH_EVERY, () => {
            if (!serverOpen) return;
            const px = (101 + sim.rand() * 4).toFixed(2);
            sendFrame(server, { kind: "FRAME", opcode: "text", text: JSON.stringify({ type: "price", sym: "ACME", px: +px }), label: `push ${j}: ACME ${px}` });
          }, "server push");
        }
        if (ping) sim.timer("server", PING_AT, () => { if (serverOpen) sendFrame(server, { kind: "PING", opcode: "ping", text: "hb", label: "PING" }); }, "heartbeat");
        return;
      }
      const ws = m.ws;
      if (ws.opcode === "text") {
        res.toServer++;
        sim.deliver("server", { stream: "ws", label: `message ${res.toServer}`, bytes: bytesLen(ws.text) });
      } else if (ws.opcode === "close") {
        serverOpen = false;
        sendFrame(server, { kind: "CLOSE", opcode: "close", code: 1000, text: "", label: "CLOSE 1000" });
        server.close();      // the server closes the TCP connection first
      }
    };

    client.connect();

    return {
      summary() {
        const rtt = 2 * sim.link.latency;
        return {
          tcpMs: res.tcpMs, upgradeMs: res.upgradeMs, closeMs: res.closeMs,
          upgradeRtts: res.upgradeMs === null || !rtt ? null : +(res.upgradeMs / rtt).toFixed(1),
          messages: res.toServer + res.toClient, clientMessages: res.toServer, serverPushes: res.toClient,
          pong: ping ? res.pong : null,
          rtoCount: client.stats.rto + server.stats.rto, fastRetransmits: client.stats.fastRetx + server.stats.fastRetx,
          completed: res.closeMs !== null && res.toServer === messages && res.toClient === pushes,
        };
      },
    };
  },
};
