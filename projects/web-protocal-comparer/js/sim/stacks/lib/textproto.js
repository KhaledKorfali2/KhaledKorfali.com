// Shared plumbing for the classic text protocols (FTP, SMTP): messages over a
// lib/tcp connection, optionally upgraded in-band to TLS 1.3 (FTP "AUTH TLS",
// SMTP "STARTTLS") or wrapped in TLS from the start of a data transfer.
//
// Before the upgrade a message goes out as itself (kind CMD / REPLY / DATA …,
// headers[proto].line, payload = the text). After it, the same message is a TLS
// application_data record: kind "TLS", an "encrypted …" label, a payload that
// shows ciphertext only, and headers[proto] = { line, encrypted: true } so the
// inspector can offer the decrypted view that only the two endpoints have.

import { tlsSession, OVERHEAD } from "./tls.js";
import { bytesLen } from "./http.js";

export { bytesLen };

// Deterministic stand-in for ciphertext (FNV-1a stream over the text) — shown instead of the plaintext.
export function fakeCipher(text, n = 24) {
  let h = 0x811c9dc5;
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = text.charCodeAt(i % Math.max(1, text.length)) || 0;
    h = Math.imul(h ^ (c + i * 31), 0x01000193) >>> 0;
    out.push((h >>> 24).toString(16).padStart(2, "0"));
  }
  return out.join(" ");
}

/**
 * conn = { client, server }: lib/tcp endpoints; `client` is the TLS client (it need not have opened the TCP connection).
 * o: { proto: "ftp" | "smtp", sni, alpn, alpnOffer, tag, readyNote,
 *      onClient(d), onServer(d) — every received segment of an app message: d.meta.msg, d.appBytes, d.last }
 */
export function textChannel(sim, conn, o) {
  const ch = { secure: { client: false, server: false }, tls: null, tlsStartedAt: null, tlsReadyAt: null };
  const recv = (side) => (d) => {
    if (d.meta && d.meta.alert) return;          // close_notify carries no application bytes
    const fn = side === "client" ? o.onClient : o.onServer;
    if (fn && d.meta && d.meta.msg) fn(d);
  };
  conn.client.onData = (d) => recv("client")({ ...d, appBytes: d.len, appOffset: d.offset });
  conn.server.onData = (d) => recv("server")({ ...d, appBytes: d.len, appOffset: d.offset });

  /**
   * msg: { kind, label, line?, text?, bytes?, encLabel?, headers?: extra protocol fields, payload?: string | fn(k) }
   * `line` is one protocol line (sent with CRLF); otherwise `text` / `bytes` describe a bulk write.
   */
  ch.send = (side, msg) => {
    const ep = conn[side];
    const text = msg.line !== undefined ? msg.line + "\r\n" : msg.text || "";
    const bytes = msg.bytes || bytesLen(text);
    const fields = { ...(msg.line !== undefined ? { line: msg.line } : {}), ...(msg.headers || {}) };
    if (ch.secure[side]) {
      const write = side === "client" ? ch.tls.clientWrite : ch.tls.serverWrite;
      const cipher = (k) => `TLS application_data — ciphertext only (${k.len} B in this segment): ${fakeCipher((msg.line || msg.label) + k.i)} …\n` +
        `(only the two endpoints can decrypt it; the decrypted ${o.proto.toUpperCase()} text is in the decrypted view)`;
      write(bytes, {
        kind: "TLS", label: msg.encLabel || "encrypted data", msg,
        headers: { [o.proto]: { ...fields, encrypted: true } },
        payload: cipher,
      });
      return;
    }
    ep.write(bytes, {
      kind: msg.kind, label: msg.label, msg,
      headers: { [o.proto]: fields },
      payload: msg.payload !== undefined ? msg.payload : text,
    });
  };

  /** Client side: start the TLS 1.3 handshake on this (established) connection; done() when the client may send. */
  ch.startTls = (done) => {
    ch.tlsStartedAt = sim.now;
    ch.tls = tlsSession(sim, conn, {
      version: "1.3", sni: o.sni, alpn: o.alpn, alpnOffer: o.alpnOffer === undefined ? null : o.alpnOffer,
      ticket: false, tag: o.tag, readyNote: o.readyNote,
      onClientReady() { ch.secure.client = true; ch.tlsReadyAt = sim.now; if (done) done(); },
      onServerReady() { ch.secure.server = true; if (o.onServerTls) o.onServerTls(); },
      onClientData: recv("client"),
      onServerData: recv("server"),
    });
    conn.client.onEstablished();                  // tlsSession's hook: sends the ClientHello now
  };

  /** Close one side: TLS sends its (encrypted) close_notify alert first (RFC 8446 §6.1), then TCP FIN. */
  ch.close = (side) => {
    const ep = conn[side];
    if (ep.finSeg || ep.state === "CLOSED") return;
    if (ch.secure[side]) {
      ep.write(OVERHEAD["1.3"] + 2, {
        kind: "TLS", label: "close_notify", alert: true,
        headers: { tls: { record: "application_data", version: "1.3", messages: ["Alert: close_notify (encrypted)"] } },
        payload: "TLS alert close_notify (level warning, description 0), encrypted — \"I'm done sending\"; " +
          "lets the peer tell a real end of data from a truncation attack",
      });
    }
    ep.close();
  };
  return ch;
}
