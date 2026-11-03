// FTP (RFC 959) with passive (RFC 959 PASV) or active (PORT) data connections,
// optionally behind a home NAT, optionally as explicit FTPS (RFC 4217, AUTH TLS).
//
// Control connection client:52100 → server:21 carries text commands and
// 3-digit replies. Every transfer (a file with RETR, a directory listing with
// LIST) uses a SEPARATE TCP data connection:
//  - passive: the client sends PASV, the server answers
//    "227 Entering Passive Mode (93,184,216,34,199,56)" = address 93.184.216.34,
//    port 199×256+56 = 51000, and the CLIENT connects there.
//  - active: the client listens on a port and sends "PORT h1,h2,h3,h4,p1,p2"
//    with its own address; the SERVER connects back from port 20.
// Behind NAT the PORT command carries the client's private address
// (192.168.1.20) — and even if it carried the public one, the NAT has no
// mapping for a connection coming IN, so the router drops the server's SYN.
// The server retries, gives up and answers 425. Passive mode works because
// both connections are opened from the inside.
// FTPS (explicit): AUTH TLS → 234 → TLS 1.3 handshake on the control
// connection, then PBSZ 0 / PROT P so the data connection is encrypted too;
// its own TLS handshake starts once the client has the 150 reply (as curl does).
// Simplified: no ALG on the router, no TLS session resumption on the data
// connection (many servers require it), no SIZE / MDTM / FEAT / EPSV, and the
// server gives up after 3 SYN retransmissions (Linux tries 6, ~2 minutes).

import { tcpConnection, MSS } from "./lib/tcp.js";
import { textChannel } from "./lib/textproto.js";
import { DELAYED_ACK, clamp } from "./lib/http.js";

const CTRL_PORT = 52100, PASV_CLIENT_PORT = 52101, ACTIVE_PORT = 50000, PASV_PORT = 51000;
const SERVER_SYN_RETRIES = 3;
const USER = "alice", PASS = "s3cret!";
const FILE = "report.pdf";
const LISTING = [
  "-rw-r--r--    1 1001     1001       %SIZE% Nov 03 11:58 report.pdf",
  "-rw-r--r--    1 1001     1001         4096 Nov 02 09:14 notes.txt",
  "drwxr-xr-x    2 1001     1001         4096 Oct 30 17:21 photos",
].join("\r\n");

const hostPort = (ip, port) => [...ip.split("."), Math.floor(port / 256), port % 256].join(",");

export default {
  id: "ftp",
  name: "FTP",
  short: "Two TCP connections: text commands on :21, every file or listing on a fresh data connection.",
  layers: ["IPv4", "TCP", "(TLS)", "FTP"],
  options: [
    { key: "mode", label: "Data connection", type: "select", default: "passive",
      choices: [["passive", "Passive (PASV: client connects)"], ["active", "Active (PORT: server connects back)"]],
      hint: "Who opens the data connection: passive = the client, active = the server, from port 20." },
    { key: "nat", label: "Client behind NAT", type: "bool", default: false,
      hint: "Put the client behind a home router. Inbound connections have no NAT mapping — watch active mode." },
    { key: "secure", label: "Explicit FTPS (AUTH TLS)", type: "bool", default: false,
      hint: "Upgrade the control connection to TLS before logging in, and encrypt the data connection too." },
    { key: "command", label: "Command", type: "select", default: "RETR",
      choices: [["RETR", "RETR (download a file)"], ["LIST", "LIST (directory listing)"]],
      hint: "Both use a data connection — even a tiny directory listing." },
    { key: "size", label: "Transfer size", type: "number", default: 4, min: 1, max: 20, step: 1,
      hint: "Segments of data sent over the data connection." },
  ],
  nodes(opts) { return opts.nat ? ["client", "r1", "server"] : ["client", "server"]; },
  nat(opts) { return opts.nat ? { router: "r1" } : null; },
  labels(opts) { return opts.nat ? { r1: "Home router (NAT)", server: "FTP server" } : { server: "FTP server" }; },

  setup(sim, opts) {
    const passive = opts.mode !== "active", secure = !!opts.secure, natted = !!opts.nat;
    const list = opts.command === "LIST";
    const size = clamp(opts.size, 1, 20);
    const dataBytes = size * MSS;
    const res = { loginMs: null, transferMs: null, completeMs: null, connections: 0, failed: false,
      dataStartMs: null, received: 0, dataOpener: null };
    const clientIp = sim.addr("client"), serverIp = sim.addr("server");
    const publicIp = sim.nat ? sim.nat.publicIp : clientIp;   // where the server sees the control connection from

    const ctrlConn = tcpConnection(sim, {
      clientPort: CTRL_PORT, serverPort: 21,
      clientOpts: { delayedAck: DELAYED_ACK, tag: "control" },
      serverOpts: { delayedAck: DELAYED_ACK, tag: "control", anyPeerPort: true },   // behind NAT the server sees the mapped port
    });
    ctrlConn.client.onEstablished = () => { res.connections++; sim.mark("control connected", "client"); };

    // ---------- control channel ----------
    const ctrl = textChannel(sim, ctrlConn, {
      proto: "ftp", sni: "ftp.example.com", alpn: "ftp", alpnOffer: "ftp", tag: "control",
      readyNote: "control: TLS 1.3 handshake done — commands, replies and the password are now encrypted",
      onClient: (d) => { if (d.last) onReply(d.meta.msg); },
      onServer: (d) => { if (d.last) onCommand(d.meta.msg); },
    });
    const cmd = (line, label = line, encLabel = "encrypted command") =>
      ctrl.send("client", { kind: "CMD", line, label, encLabel, verb: line.split(" ")[0] });
    const reply = (code, text, label, extra = {}) =>
      ctrl.send("server", { kind: "REPLY", line: `${code} ${text}`, label: label || `${code}`, encLabel: "encrypted reply", code, ...extra });

    // ---------- data connection ----------
    let data = null;        // { conn: tcpConnection, cep (client-node endpoint), sep (server-node endpoint), ch }
    const dataState = { cEst: false, sEst: false, got150: false, retr: false, sent: false, eof: false, got226: false, tlsStarted: false };

    function makeData() {
      const conn = passive
        ? tcpConnection(sim, { clientPort: PASV_CLIENT_PORT, serverPort: PASV_PORT,
            clientOpts: { delayedAck: DELAYED_ACK, tag: "data" }, serverOpts: { delayedAck: DELAYED_ACK, tag: "data", metrics: true, anyPeerPort: true } })
        // Active: the SERVER performs the active open, from port 20 to the port named in PORT.
        : tcpConnection(sim, { client: "server", server: "client", clientPort: 20, serverPort: ACTIVE_PORT,
            clientOpts: { delayedAck: DELAYED_ACK, tag: "data", metrics: true, synRetries: SERVER_SYN_RETRIES },
            serverOpts: { delayedAck: DELAYED_ACK, tag: "data" } });
      const cep = passive ? conn.client : conn.server, sep = passive ? conn.server : conn.client;
      // The FTP client is always the TLS client on the data connection (RFC 4217 §7), whoever opened TCP.
      const ch = textChannel(sim, { client: cep, server: sep }, {
        proto: "ftp", sni: "ftp.example.com", alpn: "ftp", alpnOffer: "ftp", tag: "data",
        readyNote: "data: TLS 1.3 handshake done (a full one here; real servers often insist on resuming the control connection's session)",
        onClient: onDataSegment,
        onServer: () => {},
        onServerTls: () => serverSendData(),
      });
      cep.onEstablished = () => {
        dataState.cEst = true;
        res.connections++;
        sim.note("client", passive ? `data connection to ${serverIp}:${PASV_PORT} open` : `accepted data connection from ${serverIp}:20`, "good");
        maybeClientTls();
      };
      sep.onEstablished = () => { dataState.sEst = true; serverDataReady(); };
      cep.onPeerClose = () => {
        dataState.eof = true;
        sim.note("client", "data connection closed by the server = end of " + (list ? "listing" : "file") + " (stream mode)", "info");
        ch.close("client");
        clientMaybeDone();
      };
      sep.onAllAcked = () => {
        if (sep.finSeg && sep.una >= sep.finSeg.end && !dataState.sent226) {
          dataState.sent226 = true;
          reply(226, list ? "Directory send OK." : "Transfer complete.", "226 transfer complete");
        }
      };
      data = { conn, cep, sep, ch };
    }

    // ---------- client ----------
    const script = [];
    if (secure) script.push(["AUTH TLS"]);
    script.push([`USER ${USER}`], [`PASS ${PASS}`]);
    if (secure) script.push(["PBSZ 0"], ["PROT P"]);
    script.push([list ? "TYPE A" : "TYPE I"]);
    script.push([passive ? "PASV" : "PORT"]);
    script.push([list ? "LIST" : `RETR ${FILE}`]);
    let step = 0;
    function next() {
      const [line, label] = script[step++];
      if (line === "PORT") {
        makeData();     // start listening first
        const arg = hostPort(clientIp, ACTIVE_PORT);
        if (natted) {
          sim.note("client", `PORT carries this host's PRIVATE address ${clientIp}:${ACTIVE_PORT} — meaningless on the Internet (an FTP-aware router "ALG" would rewrite it; this one doesn't)`, "warn");
        } else {
          sim.note("client", `listening on ${clientIp}:${ACTIVE_PORT} — PORT ${arg} = ${clientIp}, port ${Math.floor(ACTIVE_PORT / 256)}×256+${ACTIVE_PORT % 256}`, "info");
        }
        cmd(`PORT ${arg}`, `PORT ${arg}`);
        return;
      }
      if (line.startsWith("PASS") && !secure) sim.note("client", `password "${PASS}" crosses the network in plaintext — anyone on the path can read it`, "warn");
      if (line === "LIST" || line.startsWith("RETR")) res.dataStartMs = sim.now;
      cmd(line, label || line);
    }
    function onReply(m) {
      const code = m.code;
      if (code === 220) { next(); return; }
      if (code === 234) {
        sim.note("client", "234: server agrees — TLS handshake on the control connection before anything else", "info");
        ctrl.startTls(() => next());
        return;
      }
      if (code === 230) { res.loginMs = sim.now; sim.mark("logged in", "client"); next(); return; }
      if (code === 331 || (code === 200 && step < script.length)) { next(); return; }
      if (code === 227) {
        sim.note("client", `227: data port ${Math.floor(PASV_PORT / 256)}×256+${PASV_PORT % 256} = ${PASV_PORT} → connect to ${serverIp}:${PASV_PORT}`, "info");
        data.cep.connect();
        next();      // send RETR / LIST right away (the server waits for the data connection if needed)
        return;
      }
      if (code === 150) { dataState.got150 = true; maybeClientTls(); return; }
      if (code === 226) { dataState.got226 = true; clientMaybeDone(); return; }
      if (code === 425) {
        res.failed = true;
        sim.note("client", "425: the server could not open the data connection — transfer failed (active mode behind NAT)", "loss");
        sim.mark("transfer failed", "client");
        data.cep.abort();      // stop listening
        cmd("QUIT");
        return;
      }
      if (code === 221) {
        res.completeMs = sim.now;
        sim.mark("session closed", "client");
      }
    }
    function maybeClientTls() {
      if (!secure || dataState.tlsStarted || !dataState.got150 || !dataState.cEst) return;
      dataState.tlsStarted = true;
      data.ch.startTls(null);
    }
    function onDataSegment(d) {
      if (!d.appBytes) return;
      if (res.received === 0) sim.mark("first data byte", "client");
      res.received += d.appBytes;
      sim.deliver("client", { stream: "data", label: `${list ? "listing" : FILE} ${res.received}/${dataBytes} B`, bytes: d.appBytes, offset: d.appOffset });
    }
    function clientMaybeDone() {
      if (!dataState.eof || !dataState.got226 || dataState.quit) return;
      dataState.quit = true;
      res.transferMs = sim.now;
      sim.mark("transfer complete", "client");
      sim.note("client", `${list ? "listing" : FILE} complete: 226 received and the data connection is closed`, "good");
      cmd("QUIT");
    }
    ctrlConn.client.onPeerClose = () => ctrl.close("client");

    // ---------- server ----------
    ctrlConn.server.onEstablished = () => reply(220, "(vsFTPd 3.0.5)", "220 ready");
    function onCommand(m) {
      const line = m.line, verb = m.verb;
      if (verb === "AUTH") { reply(234, "Proceed with negotiation.", "234 go TLS"); return; }
      if (verb === "USER") { reply(331, "Please specify the password.", "331 need password"); return; }
      if (verb === "PASS") { reply(230, "Login successful.", "230 logged in"); return; }
      if (verb === "PBSZ") { reply(200, "PBSZ set to 0.", "200 PBSZ 0"); return; }
      if (verb === "PROT") { reply(200, "PROT now Private.", "200 PROT P"); return; }
      if (verb === "TYPE") { reply(200, line.endsWith("A") ? "Switching to ASCII mode." : "Switching to Binary mode.", "200 TYPE ok"); return; }
      if (verb === "PASV") {
        makeData();
        const arg = hostPort(serverIp, PASV_PORT);
        sim.note("server", `listening on port ${PASV_PORT} for the data connection`, "info");
        reply(227, `Entering Passive Mode (${arg}).`, `227 (${arg})`);
        return;
      }
      if (verb === "PORT") {
        if (natted) {
          sim.note("server", `PORT names ${clientIp} — a private address it can't reach. This server falls back to the control connection's address ${publicIp} (some refuse with "500 Illegal PORT command" instead)`, "warn");
        }
        reply(200, "PORT command successful. Consider using PASV.", "200 PORT ok");
        return;
      }
      if (verb === "LIST" || verb === "RETR") {
        dataState.retr = true;
        if (passive) {
          if (!dataState.sEst) sim.note("server", "waiting for the client's data connection", "info");
          serverDataReady();
          return;
        }
        const target = natted ? publicIp : clientIp;
        sim.note("server", `active mode: connecting from port 20 to ${target}:${ACTIVE_PORT}`, "info");
        data.sep.onConnectFail = () => {
          sim.note("server", "data connection never answered — giving up", "loss");
          reply(425, "Can't open data connection.", "425 can't open data");
        };
        data.sep.connect();
        return;
      }
      if (verb === "QUIT") {
        reply(221, "Goodbye.", "221 goodbye");
        ctrl.close("server");      // the server closes the control connection after 221
      }
    }
    // The transfer starts once RETR/LIST has arrived AND the data connection is up.
    function serverDataReady() {
      if (!dataState.retr || !dataState.sEst || dataState.got150Sent) return;
      dataState.got150Sent = true;
      reply(150, list ? "Here comes the directory listing." : `Opening BINARY mode data connection for ${FILE} (${dataBytes} bytes).`, "150 opening data");
      if (!secure) serverSendData();
      // FTPS: serverSendData runs when the data connection's TLS handshake completes (onServerTls).
    }
    function serverSendData() {
      if (dataState.sent) return;
      dataState.sent = true;
      const listing = LISTING.replace("%SIZE%", String(dataBytes).padStart(8));
      data.ch.send("server", {
        kind: "DATA", bytes: dataBytes, encLabel: "encrypted data",
        label: list ? "listing" : FILE,
        payload: (k) => (list
          ? (k.i === 1 ? listing + `\r\n… (${dataBytes} B of listing text)` : `…listing continued (${k.len} B)`)
          : (k.i === 1 ? `%PDF-1.7\n%âãÏÓ … binary file bytes (${k.len} of ${dataBytes} B)` : `…file bytes ${k.offset + 1}–${k.offset + k.len}`)),
      });
      // Stream mode: closing the data connection marks the end of the file.
      data.ch.close("server");
    }
    ctrlConn.server.onPeerClose = () => ctrl.close("server");

    ctrlConn.client.connect();

    return {
      summary() {
        return {
          mode: passive ? "passive" : "active", nat: natted, secure,
          loginMs: res.loginMs, transferMs: res.transferMs, completeMs: res.completeMs,
          connections: res.connections, failed: res.failed || res.transferMs === null,
          bytes: res.received,
          rtoCount: ctrlConn.client.stats.rto + ctrlConn.server.stats.rto + (data ? data.cep.stats.rto + data.sep.stats.rto : 0),
          completed: !res.failed && res.transferMs !== null && res.completeMs !== null,
        };
      },
    };
  },
};
