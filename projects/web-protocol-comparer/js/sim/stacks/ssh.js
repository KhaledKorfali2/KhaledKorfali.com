// SSH (RFC 4253 transport, RFC 4252 authentication, RFC 4254 connection) as
// OpenSSH 9.6 on both ends, port 22.
//
//  TCP handshake → both sides send their identification string
//  "SSH-2.0-OpenSSH_9.6" → KEXINIT both ways (algorithm lists; negotiated:
//  sntrup761x25519-sha512@openssh.com key exchange, ssh-ed25519 host key,
//  chacha20-poly1305@openssh.com cipher) → KEX_ECDH_INIT / KEX_ECDH_REPLY
//  (server's host key + signature over the exchange hash) → NEWKEYS both ways.
//  From here every packet is encrypted: SERVICE_REQUEST "ssh-userauth" →
//  SERVICE_ACCEPT → USERAUTH_REQUEST (publickey: first "is this key OK?" →
//  PK_OK, then the signed request; password: one request) → USERAUTH_SUCCESS
//  → CHANNEL_OPEN "session" → OPEN_CONFIRMATION → CHANNEL_REQUEST pty-req and
//  shell → CHANNEL_SUCCESS ×2 → the shell's prompt.
//  Interactive typing: each key press is its own encrypted CHANNEL_DATA packet
//  (36 B of TCP payload with chacha20-poly1305) and the character only appears
//  when the server's terminal echoes it back — one round trip per keystroke.
//  Ctrl-D ends the shell: exit-status, EOF and CLOSE, then the TCP close.
// Binary packet sizes follow RFC 4253 §6 (uint32 length, padding length,
// payload, ≥ 4 B random padding to the cipher block, 16 B Poly1305 tag).
// Simplified: no "none" auth probe, no EXT_INFO, no hostkeys-00 global request,
// no window adjusts, no keystroke-timing obfuscation chaff (OpenSSH ≥ 9.5).

import { tcpConnection } from "./lib/tcp.js";
import { clamp } from "./lib/http.js";

const CLIENT_PORT = 50522, SERVER_PORT = 22;
const VERSION = "SSH-2.0-OpenSSH_9.6";
const TYPED = "ls -l ~/www\r";             // 12 keystrokes, the last is Enter
const TYPE_EVERY = 180;                     // ms between key presses (~65 words per minute)
const SERVER_THINK = 1;
const PROMPT = "alice@server:~$ ";
const LS_OUTPUT = "\r\ntotal 8\r\n-rw-r--r-- 1 alice alice 1832 Nov  3 11:58 index.html\r\n-rw-r--r-- 1 alice alice  412 Nov  3 11:58 style.css\r\n" + PROMPT;
const FINGERPRINT = "SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU";

// RFC 4253 §6 packet length on the wire.
function packetLen(payload, encrypted) {
  if (!encrypted) {   // before NEWKEYS: no cipher, block size 8, no MAC; the length field counts toward the block
    let pad = 8 - ((4 + 1 + payload) % 8); if (pad < 4) pad += 8;
    return { total: 4 + 1 + payload + pad, padding: pad, macLen: 0 };
  }
  // chacha20-poly1305@openssh.com: the length is encrypted separately and not part of the block alignment.
  let pad = 8 - ((1 + payload) % 8); if (pad < 4) pad += 8;
  return { total: 4 + 1 + payload + pad + 16, padding: pad, macLen: 16 };
}

const show = (c) => (c === "\r" ? "⏎" : c === " " ? "␠" : c);

export default {
  id: "ssh",
  name: "SSH",
  short: "Encrypted remote shell: key exchange, authentication, then every keystroke is a round trip.",
  layers: ["IPv4", "TCP", "SSH"],
  options: [
    { key: "auth", label: "Authentication", type: "select", default: "publickey",
      choices: [["publickey", "Public key (Ed25519)"], ["password", "Password"]],
      hint: "Public key proves you hold a private key without sending it; a password is sent (encrypted) to the server." },
    { key: "keystrokes", label: "Keystrokes", type: "number", default: 5, min: 0, max: 12, step: 1,
      hint: `Characters typed of "ls -l ~/www⏎" — each is its own packet, echoed back by the server.` },
  ],
  labels: { server: "SSH server" },

  setup(sim, opts) {
    const pubkey = opts.auth !== "password";
    const nKeys = clamp(opts.keystrokes, 0, 12);
    const res = { handshakeMs: null, authMs: null, shellMs: null, completeMs: null, echoes: [], keySent: [] };
    const { client, server } = tcpConnection(sim, {
      clientPort: CLIENT_PORT, serverPort: SERVER_PORT,
      clientOpts: { delayedAck: 40 }, serverOpts: { delayedAck: 40 },
    });
    const enc = { client: false, server: false };   // has this side sent NEWKEYS (its outgoing packets encrypted)?

    function send(ep, side, m) {
      // m: { msg, kind, label, payload (bytes of SSH payload), text, msgs?, raw? }
      const encrypted = enc[side];
      let size, ssh;
      if (m.raw) { size = m.raw; ssh = { msg: m.msg, version: VERSION, encrypted: false }; }
      else {
        const parts = m.parts || [[m.msg, m.payload]];
        size = 0;
        for (const [, p] of parts) size += packetLen(p, encrypted).total;
        const first = packetLen(parts[0][1], encrypted);
        ssh = { msg: m.msg, encrypted, padding: first.padding, macLen: first.macLen, length: first.total - 4 - first.macLen,
          ...(parts.length > 1 ? { msgs: parts.map((p) => p[0]) } : {}) };
      }
      const text = (encrypted ? "[encrypted on the wire — decrypted view]\n" : "") + m.text;
      ep.write(size, { kind: m.kind || "SSH", label: m.label || m.msg, ssh: m, headers: { ssh }, payload: text });
    }

    // ---------- client ----------
    const cState = { gotKexinit: false, newkeysSent: false, newkeysGot: false, typed: 0, outputSeen: 0 };
    client.onEstablished = () => {
      sim.mark("TCP connected", "client");
      send(client, "client", { msg: "VERSION", raw: VERSION.length + 2, label: VERSION, text: VERSION + "\\r\\n — identification string (RFC 4253 §4.2), sent by both sides at once" });
    };
    client.onData = (d) => {
      if (!d.last) return;
      const m = d.meta.ssh;
      switch (m.msg) {
        case "VERSION":
          send(client, "client", { msg: "KEXINIT", payload: 1480, text: "KEXINIT (client)\n  cookie: 16 random bytes\n  kex: sntrup761x25519-sha512@openssh.com, curve25519-sha256, ecdh-sha2-nistp256, …, ext-info-c, kex-strict-c-v00@openssh.com\n  host keys: ssh-ed25519, ecdsa-sha2-nistp256, rsa-sha2-512, …\n  ciphers: chacha20-poly1305@openssh.com, aes128-ctr, aes256-gcm@openssh.com, …\n  MACs: umac-64-etm@openssh.com, hmac-sha2-256-etm@openssh.com, …\n  compression: none, zlib@openssh.com" });
          break;
        case "KEXINIT":
          sim.note("client", "both KEXINITs seen → first match in the client's lists wins: sntrup761x25519-sha512 (post-quantum hybrid), ssh-ed25519, chacha20-poly1305", "info");
          send(client, "client", { msg: "KEX_ECDH_INIT", payload: 1195, text: "KEX_ECDH_INIT\n  Q_C: client's ephemeral public key — sntrup761 (1158 B) + X25519 (32 B)" });
          break;
        case "KEX_ECDH_REPLY":
          sim.note("client", `host key ED25519 ${FINGERPRINT} matches known_hosts; signature over the exchange hash verified → it really is the server`, "good");
          send(client, "client", { msg: "NEWKEYS", payload: 1, text: "NEWKEYS — from now on this side sends with the new keys" });
          enc.client = true; cState.newkeysSent = true;
          maybeService();
          break;
        case "NEWKEYS":
          cState.newkeysGot = true;
          maybeService();
          break;
        case "SERVICE_ACCEPT":
          if (pubkey) send(client, "client", { kind: "AUTH", msg: "USERAUTH_REQUEST", label: "USERAUTH_REQUEST publickey (query)", payload: 112, query: true,
            text: 'USERAUTH_REQUEST\n  user "alice", service "ssh-connection", method "publickey"\n  has signature: FALSE — "would you accept this key?"\n  key: ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI… (public part only)' });
          else send(client, "client", { kind: "AUTH", msg: "USERAUTH_REQUEST", label: "USERAUTH_REQUEST password", payload: 57,
            text: 'USERAUTH_REQUEST\n  user "alice", service "ssh-connection", method "password"\n  password: (12 B — readable by the server, protected on the wire only by the SSH encryption)' });
          break;
        case "USERAUTH_PK_OK":
          sim.note("client", "server would accept the key → sign the session identifier with the private key (which never leaves the client)", "info");
          send(client, "client", { kind: "AUTH", msg: "USERAUTH_REQUEST", label: "USERAUTH_REQUEST publickey (signed)", payload: 199,
            text: 'USERAUTH_REQUEST\n  user "alice", method "publickey", has signature: TRUE\n  key: ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI…\n  signature: Ed25519 over session id + this request (64 B)' });
          break;
        case "USERAUTH_SUCCESS":
          res.authMs = sim.now;
          sim.mark("authenticated", "client");
          send(client, "client", { msg: "CHANNEL_OPEN", label: "CHANNEL_OPEN session", payload: 24, text: 'CHANNEL_OPEN "session"\n  sender channel 0, initial window 2 MB, max packet 32 KB' });
          break;
        case "CHANNEL_OPEN_CONFIRMATION":
          send(client, "client", { msg: "CHANNEL_REQUEST", label: "CHANNEL_REQUEST pty-req", payload: 309, text: 'CHANNEL_REQUEST "pty-req" (want reply)\n  TERM=xterm-256color, 120×32 characters, terminal modes (echo on, …)' });
          send(client, "client", { msg: "CHANNEL_REQUEST", label: "CHANNEL_REQUEST shell", payload: 15, text: 'CHANNEL_REQUEST "shell" (want reply) — start the login shell' });
          break;
        case "CHANNEL_DATA": onOutput(m); break;
        case "CHANNEL_CLOSE":
          send(client, "client", { msg: "CHANNEL_CLOSE", payload: 5, text: "CHANNEL_CLOSE (channel 0) — both sides closed the channel" });
          client.close();
          break;
        default: break;
      }
    };
    function maybeService() {
      if (!cState.newkeysSent || !cState.newkeysGot || res.handshakeMs !== null) return;
      res.handshakeMs = sim.now;
      sim.mark("keys established", "client");
      sim.note("client", "NEWKEYS both ways: everything from here is encrypted and authenticated (chacha20-poly1305)", "good");
      send(client, "client", { msg: "SERVICE_REQUEST", label: "SERVICE_REQUEST ssh-userauth", payload: 17, text: 'SERVICE_REQUEST "ssh-userauth"' });
    }
    function typeKey(i) {
      const c = TYPED[i];
      res.keySent[i] = sim.now;
      send(client, "client", { kind: "KEYSTROKE", msg: "CHANNEL_DATA", label: `key "${show(c)}"`, payload: 9 + 1, key: i,
        text: `CHANNEL_DATA (channel 0, 1 B): "${c === "\r" ? "\\r" : c}" — one key press, one packet` });
      if (i === 0) sim.note("client", "the terminal does NOT draw the character itself — it waits for the server's echo", "info");
    }
    function onOutput(m) {
      if (m.prompt) {
        res.shellMs = sim.now;
        sim.mark("shell ready", "client");
        for (let i = 0; i < nKeys; i++) sim.timer("client", 150 + i * TYPE_EVERY, () => typeKey(i), "key press");
        if (nKeys === 0) sim.timer("client", 150, () => ctrlD(), "key press");
        return;
      }
      if (m.echoOf !== undefined) {
        const i = m.echoOf;
        const rtt = sim.now - res.keySent[i];
        res.echoes[i] = rtt;
        if (i === 0) sim.mark(`"${show(TYPED[0])}" appears`, "client");
        sim.note("client", `"${show(TYPED[i])}" appears on screen ${Math.round(rtt)} ms after the key press (≥ 1 round trip)`, i === 0 ? "warn" : "info");
        if (i === nKeys - 1) sim.timer("client", 250, () => ctrlD(), "key press");
      }
    }
    function ctrlD() {
      send(client, "client", { kind: "KEYSTROKE", msg: "CHANNEL_DATA", label: "key Ctrl-D", payload: 10, eof: true,
        text: "CHANNEL_DATA (channel 0, 1 B): 0x04 (Ctrl-D, end of input) — the shell exits" });
    }
    client.onClosed = () => { res.completeMs = sim.now; sim.mark("disconnected", "client"); };   // client closed first → TIME_WAIT

    // ---------- server ----------
    server.onEstablished = () => {
      send(server, "server", { msg: "VERSION", raw: VERSION.length + 2, label: VERSION, text: VERSION + "\\r\\n — identification string (RFC 4253 §4.2)" });
    };
    const reply = (fn) => sim.timer("server", SERVER_THINK, fn, "sshd");
    server.onData = (d) => {
      if (!d.last) return;
      const m = d.meta.ssh;
      switch (m.msg) {
        case "VERSION":
          send(server, "server", { msg: "KEXINIT", payload: 1080, text: "KEXINIT (server)\n  cookie: 16 random bytes\n  kex: sntrup761x25519-sha512@openssh.com, curve25519-sha256, …, kex-strict-s-v00@openssh.com\n  host keys: rsa-sha2-512, rsa-sha2-256, ecdsa-sha2-nistp256, ssh-ed25519\n  ciphers: chacha20-poly1305@openssh.com, aes128-ctr, aes256-gcm@openssh.com, …\n  compression: none, zlib@openssh.com" });
          break;
        case "KEX_ECDH_INIT":
          reply(() => {
            send(server, "server", { msg: "KEX_ECDH_REPLY", payload: 1218, text: `KEX_ECDH_REPLY\n  K_S: host key ssh-ed25519 (${FINGERPRINT})\n  Q_S: server's ephemeral reply — sntrup761 ciphertext (1039 B) + X25519 (32 B)\n  signature: Ed25519 over the exchange hash H — proves the server owns the host key` });
            send(server, "server", { msg: "NEWKEYS", payload: 1, text: "NEWKEYS — from now on this side sends with the new keys" });
            enc.server = true;
          });
          break;
        case "SERVICE_REQUEST":
          send(server, "server", { msg: "SERVICE_ACCEPT", label: "SERVICE_ACCEPT ssh-userauth", payload: 17, text: 'SERVICE_ACCEPT "ssh-userauth"' });
          break;
        case "USERAUTH_REQUEST":
          if (m.query) {
            send(server, "server", { kind: "AUTH", msg: "USERAUTH_PK_OK", payload: 71, text: "USERAUTH_PK_OK — key found in ~alice/.ssh/authorized_keys; prove you hold the private key" });
          } else {
            reply(() => {
              sim.note("server", pubkey ? "signature verified with the authorized public key" : "password checked against /etc/shadow (via PAM)", "good");
              send(server, "server", { kind: "AUTH", msg: "USERAUTH_SUCCESS", payload: 1, text: "USERAUTH_SUCCESS" });
            });
          }
          break;
        case "CHANNEL_OPEN":
          send(server, "server", { msg: "CHANNEL_OPEN_CONFIRMATION", label: "CHANNEL_OPEN_CONFIRMATION", payload: 17, text: "CHANNEL_OPEN_CONFIRMATION\n  recipient 0, sender channel 0, window 2 MB" });
          break;
        case "CHANNEL_REQUEST":
          send(server, "server", { msg: "CHANNEL_SUCCESS", payload: 5, text: "CHANNEL_SUCCESS (channel 0)" });
          if (/shell/.test(m.label)) {
            const motd = "Welcome to Ubuntu 24.04 LTS\r\nLast login: Mon Nov  2 18:04:11 2026 from 198.51.100.4\r\n" + PROMPT;
            reply(() => send(server, "server", { kind: "OUTPUT", msg: "CHANNEL_DATA", label: "prompt", payload: 9 + motd.length, prompt: true,
              text: `CHANNEL_DATA (channel 0): "${motd.replace(/\r\n/g, "\\r\\n")}"` }));
          }
          break;
        case "CHANNEL_DATA":
          if (m.eof) {
            reply(() => {
              send(server, "server", { kind: "OUTPUT", msg: "CHANNEL_DATA", label: "logout", payload: 9 + 8, text: 'CHANNEL_DATA: "logout\\r\\n"' });
              send(server, "server", { msg: "CHANNEL_CLOSE", label: "exit-status 0 · EOF · CLOSE", payload: 0,
                parts: [["CHANNEL_REQUEST", 25], ["CHANNEL_EOF", 5], ["CHANNEL_CLOSE", 5]],
                text: 'CHANNEL_REQUEST "exit-status" 0\nCHANNEL_EOF\nCHANNEL_CLOSE — three SSH packets in one TCP segment' });
            });
            break;
          }
          if (m.key !== undefined) {
            const c = TYPED[m.key];
            // The pty echoes the character; Enter runs the command and prints its output and a new prompt.
            const out = c === "\r" ? LS_OUTPUT : c;
            reply(() => send(server, "server", { kind: "OUTPUT", msg: "CHANNEL_DATA", label: c === "\r" ? "ls output + prompt" : `echo "${show(c)}"`,
              payload: 9 + out.length, echoOf: m.key,
              text: `CHANNEL_DATA (channel 0): "${out.replace(/\r\n/g, "\\r\\n")}"` + (c === "\r" ? " — the command ran; its output and a new prompt" : " — the pty echoes the typed character") }));
          }
          break;
        default: break;
      }
    };
    server.onPeerClose = () => server.close();

    client.connect();

    return {
      summary() {
        const e = res.echoes.filter((x) => x !== undefined);
        return {
          auth: pubkey ? "publickey" : "password", keystrokes: nKeys,
          handshakeMs: res.handshakeMs, authMs: res.authMs, shellMs: res.shellMs,
          echoRttMs: e.length ? Math.round(e.reduce((a, b) => a + b, 0) / e.length) : null,
          completeMs: res.completeMs,
          rtoCount: client.stats.rto + server.stats.rto,
          completed: res.completeMs !== null && e.length === nKeys,
        };
      },
    };
  },
};
