// TLS 1.3 (RFC 8446) and TLS 1.2 (RFC 5246, ECDHE-RSA-AES128-GCM) handshakes on
// top of a lib/tcp connection, plus encrypted application-data records.
//
// Flights and realistic sizes (bytes on the wire, record headers included):
//  1.3  C→S  ClientHello (key_share x25519, supported_versions, ALPN, SNI)       517
//       S→C  ServerHello, ChangeCipherSpec (middlebox compat, ignored),
//            {EncryptedExtensions}, {Certificate}, {CertificateVerify}, {Finished} ≈ 3.4 KB → 3 segments
//       C→S  ChangeCipherSpec (compat), {Finished}  — then application data at once (1-RTT)
//  1.2  C→S  ClientHello                                                       517
//       S→C  ServerHello, Certificate, ServerKeyExchange, ServerHelloDone        ≈ 3.3 KB
//       C→S  ClientKeyExchange, ChangeCipherSpec, Finished (encrypted)
//       S→C  ChangeCipherSpec, Finished                — only now may the client send (2-RTT)
// {braces} = encrypted with handshake keys, as in RFC 8446. Records are not
// really encrypted; the inspector shows what each record contains.
// Not modelled: HelloRetryRequest, session resumption / 0-RTT, client certs,
// TLS False Start, record padding.

export const OVERHEAD = { "1.3": 22, "1.2": 29 };   // per record: 5 B header + 16 B AEAD tag (+1 B inner type | +8 B explicit nonce)
const MAX_RECORD = 16384;
const CERT_CHAIN = 2890;  // leaf (RSA-2048, ~1.4 KB) + intermediate (~1.3 KB) in one Certificate record

function flights(version, alpn, sni, ticket, offer = "h2, http/1.1") {
  // offer === null: no ALPN extension at all (e.g. SMTP STARTTLS); alpn is then ignored.
  const alpnList = offer;
  const alpnLine = (v) => (offer === null ? "" : `\n  ALPN: ${v}`);
  if (version === "1.3") {
    return {
      client1: { label: "ClientHello", msgs: [
        ["ClientHello", "handshake", 517, `ClientHello\n  legacy_version: 0x0303 (TLS 1.2 — real version is in supported_versions)\n  random: 32 B\n  cipher_suites: TLS_AES_128_GCM_SHA256, TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256\n  server_name: ${sni}\n  supported_versions: TLS 1.3, TLS 1.2\n  key_share: x25519, 32 B public key  ← lets the server derive keys right away\n  signature_algorithms: ecdsa_secp256r1_sha256, rsa_pss_rsae_sha256, …${alpnLine(alpnList)}\n  padding to 512 B`],
      ] },
      server1: { label: "ServerHello … {Finished}", msgs: [
        ["ServerHello", "handshake", 127, `ServerHello\n  cipher_suite: TLS_AES_128_GCM_SHA256\n  supported_versions: TLS 1.3\n  key_share: x25519, 32 B public key\n  → both sides now derive handshake keys (ECDHE)`],
        ["ChangeCipherSpec (compat)", "change_cipher_spec", 6, "ChangeCipherSpec — dummy record for middlebox compatibility, ignored by TLS 1.3"],
        ["{EncryptedExtensions}", "application_data", 38, `{EncryptedExtensions}${alpnLine(alpn) || "\n  (no extensions to report)"}`],
        ["{Certificate}", "application_data", CERT_CHAIN, `{Certificate}\n  ${sni} (RSA-2048) + intermediate CA, ~2.9 KB`],
        ["{CertificateVerify}", "application_data", 286, "{CertificateVerify}\n  rsa_pss_rsae_sha256 signature over the transcript (proves the private key)"],
        ["{Finished}", "application_data", 58, "{Finished}\n  HMAC over the whole handshake transcript"],
      ] },
      client2: { label: "{Finished}", msgs: [
        ["ChangeCipherSpec (compat)", "change_cipher_spec", 6, "ChangeCipherSpec — middlebox compatibility, ignored"],
        ["{Finished}", "application_data", 58, "{Finished}\n  HMAC over the transcript — client is done; application data may follow immediately"],
      ] },
      server2: ticket ? { label: "{NewSessionTicket}", msgs: [
        ["{NewSessionTicket}", "application_data", 239, "{NewSessionTicket}\n  lifetime 7200 s, ~190 B ticket — lets the next connection resume (PSK)"],
      ] } : null,
    };
  }
  return {
    client1: { label: "ClientHello", msgs: [
      ["ClientHello", "handshake", 517, `ClientHello\n  client_version: TLS 1.2\n  random: 32 B\n  cipher_suites: ECDHE-RSA-AES128-GCM-SHA256, ECDHE-ECDSA-AES128-GCM-SHA256, …\n  server_name: ${sni}\n  supported_groups: x25519, secp256r1\n  (no key_share: TLS 1.2 exchanges keys in a second round trip)${alpnLine(alpnList)}\n  session_ticket (empty), padding`],
    ] },
    server1: { label: "ServerHello … ServerHelloDone", msgs: [
      ["ServerHello", "handshake", 90, `ServerHello\n  version: TLS 1.2\n  cipher_suite: ECDHE-RSA-AES128-GCM-SHA256${alpnLine(alpn)}`],
      ["Certificate", "handshake", CERT_CHAIN, `Certificate (sent in the clear in TLS 1.2)\n  ${sni} (RSA-2048) + intermediate CA, ~2.9 KB`],
      ["ServerKeyExchange", "handshake", 305, "ServerKeyExchange\n  x25519 public key, signed with the certificate's RSA key"],
      ["ServerHelloDone", "handshake", 9, "ServerHelloDone — your turn"],
    ] },
    client2: { label: "ClientKeyExchange, CCS, Finished", msgs: [
      ["ClientKeyExchange", "handshake", 42, "ClientKeyExchange\n  x25519 public key → both sides derive the session keys"],
      ["ChangeCipherSpec", "change_cipher_spec", 6, "ChangeCipherSpec — switch to the new keys"],
      ["Finished", "handshake", 45, "Finished (encrypted)\n  verify_data over the transcript"],
    ] },
    server2: { label: ticket ? "NewSessionTicket, CCS, Finished" : "ChangeCipherSpec, Finished", msgs: [
      ...(ticket ? [["NewSessionTicket", "handshake", 207, "NewSessionTicket\n  lifetime 7200 s, ~190 B ticket for resumption"]] : []),
      ["ChangeCipherSpec", "change_cipher_spec", 6, "ChangeCipherSpec — switch to the new keys"],
      ["Finished", "handshake", 45, "Finished (encrypted)\n  verify_data — handshake complete, client may send"],
    ] },
  };
}

function flightMeta(id, f, version) {
  const starts = []; let total = 0;
  for (const m of f.msgs) { starts.push(total); total += m[2]; }
  const overlap = (k) => f.msgs.map((m, j) => ({ m, a: starts[j], b: starts[j] + m[2] }))
    .filter((x) => x.a < k.offset + k.len && x.b > k.offset);
  return [total, {
    kind: "TLS", tlsHs: id,
    label: (k) => (k.n > 1 ? `${f.label} (${k.i}/${k.n})` : f.label),
    headers: (k) => {
      const o = overlap(k);
      return { tls: {
        record: o[0].m[1], version,
        messages: o.map((x) => x.m[0] + (x.a < k.offset ? " (cont.)" : x.b > k.offset + k.len ? " (part)" : "")),
      } };
    },
    payload: (k) => overlap(k).map((x) => (x.a < k.offset ? `…${x.m[0]} continued (${Math.min(x.b, k.offset + k.len) - k.offset} B)` : x.m[3])).join("\n\n"),
  }];
}

/**
 * Run a TLS handshake over conn = { client, server } (lib/tcp endpoints).
 * o: { version: "1.3" | "1.2", alpn: "h2" | "http/1.1", sni, ticket, tag, halfRtt: [name, record, bytes, detail],
 *      alpnOffer: ALPN list in the ClientHello (default "h2, http/1.1"; null = no ALPN), readyNote: client note text,
 *      onClientReady(), onServerReady(), onClientData(d), onServerData(d) }
 * d (app data): { meta, len, appBytes, appOffset, i, n, last } — appBytes excludes TLS overhead.
 * Returns { clientWrite(bytes, meta), serverWrite(bytes, meta), clientReadyAt, ... }.
 */
export function tlsSession(sim, conn, o) {
  const version = o.version === "1.2" ? "1.2" : "1.3";
  const F = flights(version, o.alpn || "http/1.1", o.sni || "example.com", !!o.ticket, o.alpnOffer);
  // 0.5-RTT data: in TLS 1.3 the server may send application data right after its Finished.
  if (o.halfRtt && version === "1.3") F.server1.msgs.push(o.halfRtt);
  const { client, server } = conn;
  const tagged = (t) => (o.tag ? o.tag + ": " + t : t);
  const s = { version, clientReadyAt: null, serverReadyAt: null, hsStart: null };

  const send = (ep, id) => { const [len, meta] = flightMeta(id, F[id], version); ep.write(len, meta); };

  client.onEstablished = () => {
    s.hsStart = sim.now;
    send(client, "client1");
    if (o.onClientEstablished) o.onClientEstablished();
  };

  const clientReady = () => {
    s.clientReadyAt = sim.now;
    const rtts = version === "1.3" ? "1 RTT" : "2 RTTs";
    sim.note("client", tagged(o.readyNote || `TLS ${version} handshake done (${rtts} after TCP) — encrypted requests may go now`), "good");
    if (o.onClientReady) o.onClientReady();
  };
  const serverReady = () => {
    s.serverReadyAt = sim.now;
    if (o.onServerReady) o.onServerReady();
  };

  client.onData = (d) => {
    const hs = d.meta && d.meta.tlsHs;
    if (!hs) { if (o.onClientData) o.onClientData(appView(d)); return; }
    if (!d.last) return;
    if (hs === "server1") {
      send(client, "client2");
      if (version === "1.3") clientReady();
      else sim.note("client", tagged("TLS 1.2: keys exchanged, but must wait for the server's Finished before sending data"), "info");
    } else if (hs === "server2" && version === "1.2") clientReady();
  };
  server.onData = (d) => {
    const hs = d.meta && d.meta.tlsHs;
    if (!hs) { if (o.onServerData) o.onServerData(appView(d)); return; }
    if (!d.last) return;
    if (hs === "client1") {
      send(server, "server1");
    } else if (hs === "client2") {
      if (F.server2) send(server, "server2");
      serverReady();
    }
  };

  const write = (ep) => (bytes, meta = {}) => {
    const records = Math.max(1, Math.ceil(bytes / MAX_RECORD));
    const ovh = OVERHEAD[version] * records;
    const h = meta.headers;
    ep.write(bytes + ovh, {
      ...meta, tlsOverhead: ovh, appTotal: bytes,
      headers: (k) => ({
        tls: { record: "application_data", version, messages: ["application data (encrypted)"] },
        ...(typeof h === "function" ? h(k) : h || {}),
      }),
    });
  };
  s.clientWrite = write(client);
  s.serverWrite = write(server);
  return s;
}

// App bytes in a segment: the record overhead is counted at the start of the write.
function appView(d) {
  const ovh = (d.meta && d.meta.tlsOverhead) || 0;
  const a = Math.max(d.offset, ovh), b = d.offset + d.len;
  return { ...d, appOffset: Math.max(0, a - ovh), appBytes: Math.max(0, b - a) };
}
