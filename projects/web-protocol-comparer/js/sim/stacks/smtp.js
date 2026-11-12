// SMTP (RFC 5321) relay between two mail servers on port 25, with optional
// STARTTLS (RFC 3207).
//
// The client is the sending mail server (MTA) of sender.org delivering to the
// receiving server named in example.com's MX record, on port 25 (server to
// server; port 587 "submission" is for mail apps, with mandatory auth). The
// dialogue is lockstep: each command waits for its reply.
//   220 banner · EHLO → 250-extensions (STARTTLS, SIZE, 8BITMIME, PIPELINING…)
//   STARTTLS → 220 → TLS 1.3 handshake → EHLO again (RFC 3207: everything said
//   before TLS is forgotten) · MAIL FROM → 250 · RCPT TO → 250 (per recipient)
//   DATA → 354 · message headers + body ending "<CRLF>.<CRLF>" → 250 queued
//   QUIT → 221, the server closes.
// Without STARTTLS every byte — envelope, headers, body — crosses in plaintext.
// Simplified: no PIPELINING (allowed: a client may always wait), no SMTP AUTH,
// no DKIM/SPF checks, no TLS certificate verification policy (port-25
// STARTTLS is usually opportunistic).

import { tcpConnection, MSS } from "./lib/tcp.js";
import { textChannel } from "./lib/textproto.js";
import { DELAYED_ACK, clamp } from "./lib/http.js";

const CLIENT_PORT = 49812, SERVER_PORT = 25;
const FROM = "alice@sender.org";
const RCPTS = ["bob@example.com", "carol@example.com", "dave@example.com"];
const QUEUE_ID = "4XkT2c1Zz9z9vQ";
const EHLO_REPLY = (tls) => [
  "250-mx.example.com",
  "250-PIPELINING",
  "250-SIZE 10240000",
  ...(tls ? [] : ["250-STARTTLS"]),
  "250-ENHANCEDSTATUSCODES",
  "250-8BITMIME",
  "250-DSN",
  "250 SMTPUTF8",
];

export default {
  id: "smtp",
  name: "SMTP",
  short: "Mail servers relay a message with text commands on port 25 — upgraded to TLS by STARTTLS, if both agree.",
  layers: ["IPv4", "TCP", "(TLS)", "SMTP"],
  options: [
    { key: "starttls", label: "STARTTLS", type: "bool", default: true,
      hint: "Upgrade the connection to TLS after EHLO. Off: the whole message crosses in plaintext." },
    { key: "recipients", label: "Recipients", type: "number", default: 1, min: 1, max: 3, step: 1,
      hint: "One RCPT TO (and one 250) per recipient — the envelope, not the To: header." },
    { key: "size", label: "Message size", type: "number", default: 2, min: 1, max: 8, step: 1,
      hint: "Segments of message (headers + body) sent after DATA." },
  ],
  labels: { client: "Sending server (MTA)", server: "Mail server (MX)" },

  setup(sim, opts) {
    const starttls = opts.starttls !== false;
    const nRcpt = clamp(opts.recipients, 1, 3), size = clamp(opts.size, 1, 8);
    const rcpts = RCPTS.slice(0, nRcpt);
    const msgBytes = size * MSS;
    const res = { tlsMs: null, deliveredMs: null, completeMs: null, received: 0, rcptOk: 0 };

    const conn = tcpConnection(sim, {
      clientPort: CLIENT_PORT, serverPort: SERVER_PORT,
      clientOpts: { delayedAck: DELAYED_ACK },
      serverOpts: { delayedAck: DELAYED_ACK, metrics: true },
    });
    const ch = textChannel(sim, conn, {
      proto: "smtp", sni: "mx.example.com", alpnOffer: null,
      readyNote: "TLS 1.3 handshake done — from here on the envelope and the message are encrypted",
      onClient: (d) => { if (d.last) onReply(d.meta.msg); },
      onServer: onServerData,
    });
    const cmd = (line, label = line, extra = {}) => ch.send("client", { kind: "CMD", line, label, encLabel: "encrypted command", ...extra });
    const reply = (lines, label, code) => {
      const arr = Array.isArray(lines) ? lines : [lines];
      ch.send("server", { kind: "REPLY", line: arr.join("\r\n"), label, encLabel: "encrypted reply", code });
    };

    const message = [
      `From: Alice <${FROM}>`,
      `To: ${rcpts.map((r) => `<${r}>`).join(", ")}`,
      "Subject: Quarterly report",
      "Date: Tue, 03 Nov 2026 12:00:00 +0000",
      "Message-ID: <20261103120000.1234@sender.org>",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Hi all,",
      "",
      "the numbers for Q3 are attached below…",
    ].join("\r\n");

    // ---------- client (sending MTA) ----------
    let phase = "banner", ehloCount = 0, rcptIdx = 0;
    function ehlo() { ehloCount++; phase = "ehlo"; cmd("EHLO mail.sender.org", ehloCount > 1 ? "EHLO (again)" : "EHLO mail.sender.org"); }
    function mailFrom() { phase = "mail"; cmd(`MAIL FROM:<${FROM}> SIZE=${msgBytes}`, `MAIL FROM:<${FROM}>`); }
    function onReply(m) {
      const code = m.code;
      if (phase === "banner" && code === 220) { ehlo(); return; }
      if (phase === "ehlo" && code === 250) {
        if (starttls && !ch.secure.client) {
          sim.note("client", "server offers STARTTLS → upgrade before sending the envelope", "info");
          phase = "starttls";
          cmd("STARTTLS");
        } else {
          if (!starttls) sim.note("client", "no STARTTLS: the envelope and the whole message will cross in plaintext", "warn");
          mailFrom();
        }
        return;
      }
      if (phase === "starttls" && code === 220) {
        ch.startTls(() => {
          res.tlsMs = sim.now;
          sim.mark("TLS ready", "client");
          sim.note("client", "RFC 3207: forget everything learned before TLS — say EHLO again", "info");
          ehlo();
        });
        return;
      }
      if (phase === "mail" && code === 250) { phase = "rcpt"; rcptIdx = 0; cmd(`RCPT TO:<${rcpts[0]}>`); return; }
      if (phase === "rcpt" && code === 250) {
        res.rcptOk++;
        if (++rcptIdx < rcpts.length) { cmd(`RCPT TO:<${rcpts[rcptIdx]}>`); return; }
        phase = "data"; cmd("DATA");
        return;
      }
      if (phase === "data" && code === 354) {
        phase = "message";
        ch.send("client", {
          kind: "MAIL", bytes: msgBytes, encLabel: "encrypted message", mail: true,
          label: (k) => (k.n > 1 ? `message (${k.i}/${k.n})` : "message") + (k.i === k.n ? ' + "."' : ""),
          headers: { data: true },
          payload: (k) => (k.i === 1 ? message + `\r\n… (${msgBytes} B in all)` : `…message body continued (${k.len} B)`) +
            (k.i === k.n ? "\r\n.\r\n  ← a line with just \".\" ends the message" : ""),
        });
        return;
      }
      if (phase === "message" && code === 250) {
        res.deliveredMs = sim.now;
        sim.mark("message accepted", "client");
        sim.note("client", `250 queued as ${QUEUE_ID}: the MX has taken responsibility for the message`, "good");
        phase = "quit"; cmd("QUIT");
        return;
      }
      if (phase === "quit" && code === 221) { res.completeMs = sim.now; sim.mark("session closed", "client"); }
    }
    conn.client.onPeerClose = () => ch.close("client");

    // ---------- server (receiving MX) ----------
    conn.server.onEstablished = () => reply("220 mx.example.com ESMTP Postfix", "220 banner", 220);
    function onServerData(d) {
      const m = d.meta.msg;
      if (m.mail) {
        res.received += d.appBytes;
        if (d.appBytes) sim.deliver("server", { stream: "mail", label: `message ${res.received}/${msgBytes} B`, bytes: d.appBytes, offset: d.appOffset });
        if (d.last) {
          reply(`250 2.0.0 Ok: queued as ${QUEUE_ID}`, `250 queued as ${QUEUE_ID}`, 250);
        }
        return;
      }
      if (!d.last) return;
      const line = m.line, verb = line.split(/[ :]/)[0].toUpperCase();
      if (verb === "EHLO") reply(EHLO_REPLY(ch.secure.server), "250 EHLO + extensions", 250);
      else if (verb === "STARTTLS") reply("220 2.0.0 Ready to start TLS", "220 ready for TLS", 220);
      else if (verb === "MAIL") reply("250 2.1.0 Ok", "250 sender ok", 250);
      else if (verb === "RCPT") reply("250 2.1.5 Ok", "250 recipient ok", 250);
      else if (verb === "DATA") reply("354 End data with <CR><LF>.<CR><LF>", "354 go ahead", 354);
      else if (verb === "QUIT") { reply("221 2.0.0 Bye", "221 bye", 221); ch.close("server"); }
    }
    conn.server.onPeerClose = () => ch.close("server");

    conn.client.connect();

    return {
      summary() {
        return {
          starttls, recipients: nRcpt, tlsMs: res.tlsMs,
          deliveredMs: res.deliveredMs, completeMs: res.completeMs, bytes: res.received,
          rtoCount: conn.client.stats.rto + conn.server.stats.rto,
          completed: res.deliveredMs !== null && res.completeMs !== null && res.received === msgBytes,
        };
      },
    };
  },
};
