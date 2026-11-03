// HTTP/3 over QUIC (RFC 9000 / 9001 / 9002 / 9114), simplified but faithful.
//
// What is modelled:
//  - Three packet-number spaces (Initial, Handshake, Application). 0-RTT and
//    1-RTT share the application space. Packet numbers are never reused: lost
//    data is re-sent in NEW packets with new numbers ("(retx)").
//  - TLS 1.3 inside CRYPTO frames: ClientHello in a padded (>= 1200 B) Initial;
//    the server's ServerHello (Initial) and EncryptedExtensions, Certificate,
//    CertificateVerify, Finished (Handshake) are packed into ~1350 B datagrams,
//    coalescing Initial + Handshake packets where they fit, within the 3x
//    anti-amplification limit until the client's address is validated.
//  - Requests on client bidirectional streams 0, 4, 8, ...; the server
//    interleaves STREAM frames of all responses round-robin.
//  - ACK frames with ranges; Initial/Handshake ACKed immediately, 1-RTT after
//    every 2nd ack-eliciting packet, on reordering, or within max_ack_delay.
//  - RFC 9002 loss detection: packet threshold 3, time threshold
//    9/8 x max(srtt, latest_rtt), PTO = srtt + 4 rttvar (+ max_ack_delay) with
//    exponential backoff; client anti-deadlock probes during the handshake.
//  - NewReno congestion control on bytes in flight (initial window 13,500 B).
//  - Per-stream delivery: a missing range only blocks the stream it belongs to.
// Not modelled: HTTP/3 control/QPACK unidirectional streams (2, 3, 6, 7, 10, 11),
// flow-control credit, pacing, persistent congestion, key updates, connection
// migration, and real encryption.

const MAX_UDP = 1350;                  // UDP payload per datagram (a common QUIC server setting)
const MIN_INITIAL = 1200;              // client Initial datagrams are padded to at least this
const INITIAL_RTT = 333;               // kInitialRtt
const MAX_ACK_DELAY = 25;              // ms (default transport parameter)
const PKT_THRESHOLD = 3, TIME_THRESHOLD = 9 / 8, GRANULARITY = 1;
const INIT_CWND = Math.min(10 * MAX_UDP, Math.max(14720, 2 * MAX_UDP));
const MIN_CWND = 2 * MAX_UDP;
const LONG_HDR = 1 + 4 + 1 + 8 + 1 + 8 + 2 + 2;  // flags, version, DCID/SCID (8 B each), length, pn
const SHORT_HDR = 1 + 8 + 2;
const AEAD_TAG = 16;
const SEGMENT = 1460;                  // "size" counts 1460-B units, same bytes as the TCP stacks
const REQ_BYTES = 110;                 // HEADERS frame, QPACK-compressed request
const RESP_HDR_BYTES = 60;             // HEADERS frame (+ DATA frame header) of a response
const GIVE_UP_AT = 25000;              // the engine stops at 30 s; give up cleanly before that

const CID = { client: "5e1c7a02", server: "c3a1f04e9b2d7e10" };
const PATHS = ["/index.html", "/app.js", "/style.css", "/logo.svg", "/hero.jpg", "/font.woff2",
  "/api/user", "/vendor.js", "/icons.svg", "/data.json", "/photo.webp", "/analytics.js"];

// TLS messages carried in CRYPTO frames (bytes).
const CH = [["ClientHello", 300]];
const SH = [["ServerHello", 90]];
const SERVER_HS_FULL = [["EE", 120], ["Certificate", 2300], ["CertVerify", 80], ["Finished", 36]];
const SERVER_HS_PSK = [["EE", 120], ["Finished", 36]];
const CLIENT_FIN = [["Finished", 36]];

const TYPE = { initial: "Initial", handshake: "Handshake" };
const KIND = { Initial: "INITIAL", Handshake: "HANDSHAKE", "0-RTT": "0-RTT", "1-RTT": "1-RTT" };

// ---------------------------------------------------------------------------
// Byte-range bookkeeping

class Ranges {
  constructor() { this.r = []; }          // sorted, disjoint [a, b)
  add(a, b) {
    if (b <= a) return;
    const out = []; let placed = false;
    for (const [x, y] of this.r) {
      if (y < a) out.push([x, y]);
      else if (x > b) { if (!placed) { out.push([a, b]); placed = true; } out.push([x, y]); }
      else { a = Math.min(a, x); b = Math.max(b, y); }
    }
    if (!placed) out.push([a, b]);
    this.r = out;
  }
  covers(a, b) { return this.r.some(([x, y]) => x <= a && y >= b); }
  has(n) { return this.covers(n, n + 1); }
  endFrom(o) { const r = this.r.find(([x, y]) => x <= o && o < y); return r ? r[1] : o; }
}

class SendBuf {
  constructor(total, msgs = null) {
    this.total = total; this.next = 0; this.retx = []; this.acked = new Ranges(); this.msgs = msgs;
  }
  prune() { this.retx = this.retx.filter(([o, l]) => !this.acked.covers(o, o + l)); }
  hasData() { this.prune(); return this.retx.length > 0 || this.next < this.total; }
  hasRetx() { this.prune(); return this.retx.length > 0; }
  take(max) {
    if (max <= 0) return null;
    this.prune();
    if (this.retx.length) {
      const [o, l] = this.retx[0];
      if (l <= max) { this.retx.shift(); return { off: o, len: l, retx: true }; }
      this.retx[0] = [o + max, l - max];
      return { off: o, len: max, retx: true };
    }
    if (this.next < this.total) {
      const o = this.next, l = Math.min(max, this.total - o);
      this.next += l;
      return { off: o, len: l, retx: false };
    }
    return null;
  }
  requeue(o, l) {
    if (this.acked.covers(o, o + l) || this.retx.some(([a, b]) => a === o && b === l)) return;
    this.retx.push([o, l]);
    this.retx.sort((x, y) => x[0] - y[0]);
  }
  done() { return this.acked.covers(0, this.total); }
  names(o, l) {
    if (!this.msgs) return [];
    const out = []; let at = 0;
    for (const [n, len] of this.msgs) { if (at < o + l && at + len > o) out.push(n); at += len; }
    return out;
  }
}
const cryptoBuf = (msgs) => new SendBuf(msgs.reduce((s, m) => s + m[1], 0), msgs);
const msgsLen = (msgs) => msgs.reduce((s, m) => s + m[1], 0);

function frameSize(f) {
  switch (f.type) {
    case "ACK": return 5 + 2 * f.ranges.length;
    case "CRYPTO": return 5 + f.length;
    case "STREAM": return 6 + f.length;
    case "PADDING": return f.length;
    default: return 1; // PING, HANDSHAKE_DONE
  }
}
const isEliciting = (frames) => frames.some((f) => f.type !== "ACK" && f.type !== "PADDING");

class Space {
  constructor(name) {
    this.name = name; this.nextPn = 0; this.sent = new Map(); this.largestAcked = -1;
    this.recv = new Ranges(); this.largestRecv = -1; this.largestRecvT = 0;
    this.ackPending = false; this.ackNow = false; this.unackedElic = 0;
    this.lossTime = null; this.lastElicT = null; this.discarded = false;
    this.crypto = null; this.cryptoRecv = new Ranges(); this.ping = false;
  }
  inFlight() { for (const r of this.sent.values()) if (r.inFlight) return true; return false; }
}

// ---------------------------------------------------------------------------
// One QUIC endpoint

class Conn {
  constructor(sim, role, ctx) {
    this.sim = sim; this.role = role; this.me = role; this.peer = role === "client" ? "server" : "client"; this.ctx = ctx;
    this.sp = { initial: new Space("initial"), handshake: new Space("handshake"), app: new Space("app") };
    this.srtt = null; this.rttvar = INITIAL_RTT / 2; this.minRtt = Infinity; this.latestRtt = 0; this.ptoCount = 0;
    this.cwnd = INIT_CWND; this.ssthresh = Infinity; this.bif = 0; this.recoveryStart = -1;
    this.keys = { handshake: false, appRead: false, appWrite: false, zeroRttWrite: false, zeroRttRead: false };
    this.validated = role === "client";      // server: has the client's address been validated?
    this.peerValidated = role === "server";  // client: has the server validated our address?
    this.bytesRecv = 0; this.bytesSent = 0; this.ampNoted = false;
    this.confirmed = false; this.buffered = []; this.probes = 0;
    this.timerId = null; this.timerAt = null; this.ackTimer = null; this.flushPending = false; this.stopped = false;
    this.streams = new Map(); this.order = []; this.rr = -1;
    this.hsDonePending = false; this.hsDoneAcked = false;
  }

  // -- sending ---------------------------------------------------------------
  kick() {
    if (this.flushPending || this.stopped) return;
    this.flushPending = true;
    this.sim.timer(this.me, 0, () => { this.flushPending = false; this.flush(); }, "send");
  }

  flush() {
    if (this.stopped) return;
    for (let i = 0; i < 8 && this.sendHandshakeDatagram(); i++);
    for (let i = 0; i < 300 && this.sendAppPacket(); i++);
    this.probes = 0;
    this.setLossTimer();
    this.armAckTimer();
  }

  ampLeft() { return this.validated ? Infinity : 3 * this.bytesRecv - this.bytesSent; }
  ccAllows() { return this.probes > 0 || this.bif + MAX_UDP <= this.cwnd; }
  noteAmp() {
    if (this.ampNoted) return;
    this.ampNoted = true;
    this.sim.note(this.me, `anti-amplification: ≤ 3 × ${this.bytesRecv} B received until the client's address is validated`, "warn");
  }

  sendHandshakeDatagram() {
    let room = Math.min(MAX_UDP, this.ampLeft());
    if (room < 64) { if (this.wantsHandshakeSend()) this.noteAmp(); return false; }
    const pkts = []; let retx = false;
    for (const name of ["initial", "handshake"]) {
      const s = this.sp[name];
      if (s.discarded || (name === "handshake" && !this.keys.handshake)) continue;
      // Server: an ack-eliciting Initial forces a >= 1200 B datagram; skip it if the budget can't cover that.
      const canElicit = this.ccAllows() && !(this.role === "server" && name === "initial" && room < MIN_INITIAL);
      const wantCrypto = canElicit && s.crypto && s.crypto.hasData();
      const wantPing = canElicit && s.ping;
      if (!s.ackNow && !wantCrypto && !wantPing) continue;
      const frames = []; let size = LONG_HDR + AEAD_TAG + (name === "initial" ? 1 : 0);
      if (s.ackPending) { const f = this.ackFrame(s); frames.push(f); size += frameSize(f); this.clearAck(s); }
      if (wantCrypto) {
        while (room - size - 5 >= 32) {
          const c = s.crypto.take(room - size - 5);
          if (!c) break;
          frames.push({ type: "CRYPTO", offset: c.off, length: c.len, msgs: s.crypto.names(c.off, c.len) });
          size += 5 + c.len; retx ||= c.retx;
        }
      }
      if (wantPing && !isEliciting(frames)) { frames.push({ type: "PING" }); size += 1; }
      if (isEliciting(frames)) s.ping = false;
      if (!frames.length) continue;
      pkts.push({ space: name, type: TYPE[name], frames, size });
      room -= size;
      if (room < 80) break;
    }
    if (!pkts.length) return false;
    // Padding: every client datagram with an Initial packet, and server datagrams with an ack-eliciting Initial.
    const init = pkts.find((p) => p.space === "initial");
    if (init && (this.role === "client" || isEliciting(init.frames))) {
      const total = pkts.reduce((s, p) => s + p.size, 0);
      if (total < MIN_INITIAL) { const pad = { type: "PADDING", length: MIN_INITIAL - total }; init.frames.push(pad); init.size += pad.length; }
    }
    this.sendDatagram(pkts, retx);
    return true;
  }

  wantsHandshakeSend() {
    return ["initial", "handshake"].some((n) => { const s = this.sp[n]; return !s.discarded && s.crypto && s.crypto.hasData(); }) ||
      this.streamsWithData().length > 0 || this.hsDonePending;
  }

  streamsWithData() { return this.order.filter((id) => this.streams.get(id).buf.hasData()); }

  sendAppPacket() {
    const s = this.sp.app;
    if (s.discarded || !(this.keys.appWrite || this.keys.zeroRttWrite)) return false;
    const type = this.keys.appWrite ? "1-RTT" : "0-RTT";
    let room = Math.min(MAX_UDP, this.ampLeft());
    if (room < 64) { if (this.wantsHandshakeSend()) this.noteAmp(); return false; }
    const frames = []; let size = (type === "0-RTT" ? LONG_HDR : SHORT_HDR) + AEAD_TAG, retx = false, stream;
    const ackable = s.ackPending && type === "1-RTT";
    if (ackable) { const f = this.ackFrame(s); frames.push(f); size += frameSize(f); }
    if (this.ccAllows()) {
      if (this.hsDonePending && type === "1-RTT") {
        frames.push({ type: "HANDSHAKE_DONE" }); size += 1; this.hsDonePending = false;
        retx = this.hsDoneSent; this.hsDoneSent = true;
      } else {
        // Retransmissions first (lowest stream id), then new data round-robin across streams.
        let id = this.order.find((k) => this.streams.get(k).buf.hasRetx());
        if (id === undefined) {
          const live = this.order.filter((k) => this.streams.get(k).buf.next < this.streams.get(k).buf.total);
          if (live.length) { id = live.find((k) => k > this.rr) ?? live[0]; this.rr = id; }
        }
        if (id !== undefined) {
          const st = this.streams.get(id), c = st.buf.take(room - size - 6);
          if (c) {
            frames.push({ type: "STREAM", stream: id, offset: c.off, length: c.len, fin: c.off + c.len === st.buf.total });
            size += 6 + c.len; retx = c.retx; stream = id;
          }
        }
        if (!isEliciting(frames) && s.ping) { frames.push({ type: "PING" }); size += 1; }
      }
    }
    if (isEliciting(frames)) s.ping = false;
    else if (!(ackable && s.ackNow)) return false;       // nothing worth a packet yet
    if (ackable) this.clearAck(s);
    this.sendDatagram([{ space: "app", type, frames, size }], retx, stream);
    return true;
  }

  ackFrame(s) {
    const ranges = s.recv.r.map(([a, b]) => [a, b - 1]).reverse().slice(0, 32); // descending, inclusive
    return { type: "ACK", largest: ranges[0][1], ranges, ackDelay: s.name === "app" ? Math.round(this.sim.now - s.largestRecvT) : 0 };
  }
  clearAck(s) {
    s.ackPending = false; s.ackNow = false; s.unackedElic = 0;
    if (s.name === "app" && this.ackTimer) { this.sim.cancel(this.ackTimer); this.ackTimer = null; }
  }

  sendDatagram(pkts, retx, stream) {
    const now = this.sim.now, quic = [];
    let total = 0;
    for (const pk of pkts) {
      const s = this.sp[pk.space], pn = s.nextPn++, elic = isEliciting(pk.frames);
      pk.pn = pn;
      if (elic) {
        s.sent.set(pn, { pn, t: now, bytes: pk.size, inFlight: true, frames: pk.frames, type: pk.type });
        this.bif += pk.size; s.lastElicT = now;
      }
      total += pk.size;
      quic.push({
        form: pk.type === "1-RTT" ? "short" : "long", type: pk.type, dcid: CID[this.peer],
        ...(pk.type === "1-RTT" ? {} : { scid: CID[this.me] }), pn, length: pk.size, frames: pk.frames,
      });
    }
    if (!this.validated) this.bytesSent += total;
    const elicPkts = pkts.filter((p) => isEliciting(p.frames));
    let kind, label;
    if (!elicPkts.length) {
      kind = "ACK";
      const a = pkts[0].frames.find((f) => f.type === "ACK");
      label = (pkts.length > 1 ? pkts.map((p) => p.type).join("+") + " ACK" :
        (pkts[0].type === "1-RTT" ? "ACK " : pkts[0].type + " ACK ") + rangeText(a.ranges));
    } else {
      kind = KIND[elicPkts[0].type];
      const head = elicPkts.length === 1 ? `${elicPkts[0].type} pn ${elicPkts[0].pn}` : elicPkts.map((p) => p.type).join("+");
      label = head + " · " + this.describe(elicPkts) + (retx ? " (retx)" : "");
    }
    this.sim.send({
      from: this.me, to: this.peer, kind, label, size: total + 28, retx: !!retx, stream,
      headers: {
        ip: { proto: 17 }, udp: { srcPort: this.role === "client" ? 54872 : 443, dstPort: this.role === "client" ? 443 : 54872 },
        quic: { ...quic[0], coalesced: quic.slice(1) },
      },
      payload: this.payload(elicPkts.length ? elicPkts : pkts),
    });
    if (this.role === "client" && pkts.some((p) => p.space === "handshake")) this.discard("initial");
    if (elicPkts.length && this.probes > 0) this.probes--;
  }

  describe(pkts) {
    const parts = [];
    for (const p of pkts) for (const f of p.frames) {
      if (f.type === "CRYPTO") parts.push(...f.msgs);
      else if (f.type === "STREAM") parts.push(this.role === "client" ? `GET ${this.ctx.pathOf(f.stream)}` : `STREAM ${f.stream}`);
      else if (f.type === "HANDSHAKE_DONE") parts.push("HANDSHAKE_DONE");
      else if (f.type === "PING") parts.push("PING");
    }
    return [...new Set(parts)].join(", ");
  }

  payload(pkts) {
    const out = [];
    for (const p of pkts) for (const f of p.frames) {
      if (f.type === "CRYPTO") out.push(`CRYPTO [${f.offset}..${f.offset + f.length}) TLS 1.3 ${f.msgs.join(" + ")}` +
        (f.msgs.includes("ClientHello") ? " (ALPN h3, SNI example.com, key_share x25519)" : ""));
      else if (f.type === "STREAM" && this.role === "client") out.push(`STREAM ${f.stream}: HEADERS :method GET :scheme https :authority example.com :path ${this.ctx.pathOf(f.stream)} (QPACK)`);
      else if (f.type === "STREAM") out.push(`STREAM ${f.stream} [${f.offset}..${f.offset + f.length})` + (f.offset === 0 ? ": HEADERS :status 200, then DATA" : ": DATA") + (f.fin ? " FIN" : ""));
      else if (f.type === "ACK") out.push(`ACK ${rangeText(f.ranges)}` + (f.ackDelay ? ` delay ${f.ackDelay} ms` : ""));
      else if (f.type === "PADDING") out.push(`PADDING ${f.length} B`);
      else out.push(f.type);
    }
    return out.join(" | ");
  }

  // -- receiving -------------------------------------------------------------
  onDatagram(p) {
    if (this.stopped) return;
    if (!this.validated) this.bytesRecv += p.size - 28;
    const q = p.headers.quic;
    for (const qp of [q, ...(q.coalesced || [])]) this.onPacket(qp);
    this.kick();
  }

  canRead(qp) {
    if (qp.type === "Initial") return true;
    if (qp.type === "Handshake") return this.keys.handshake;
    if (qp.type === "0-RTT") return this.keys.zeroRttRead;
    return this.keys.appRead;
  }

  onPacket(qp) {
    const name = qp.type === "Initial" ? "initial" : qp.type === "Handshake" ? "handshake" : "app";
    const s = this.sp[name];
    if (s.discarded) return; // keys already dropped: packet is undecryptable and ignored
    if (!this.canRead(qp)) {
      if (!this.buffered.length) this.sim.note(this.me, `${qp.type} packet buffered until its keys are available`, "info");
      // RFC 9002 §6.2.3: Handshake/1-RTT data before Handshake keys means the server's Initial was lost.
      if (this.role === "client" && !this.keys.handshake) this.speedUp("server Initial missing");
      this.buffered.push(qp);
      return;
    }
    const elic = isEliciting(qp.frames);
    if (s.recv.has(qp.pn)) return;
    const outOfOrder = qp.pn !== s.largestRecv + 1;
    s.recv.add(qp.pn, qp.pn + 1);
    if (qp.pn > s.largestRecv) { s.largestRecv = qp.pn; s.largestRecvT = this.sim.now; }
    if (this.role === "server" && name === "handshake") {
      this.validated = true;                 // a Handshake packet proves the client owns its address
      this.discard("initial");               // and the server drops its Initial keys (RFC 9001 §4.9.1)
    }
    for (const f of qp.frames) {
      if (f.type === "ACK") this.onAck(s, f);
      else if (f.type === "CRYPTO") {
        // RFC 9002 §6.2.3: a server seeing duplicate ClientHello data may assume its flight was lost.
        if (this.role === "server" && name === "initial" && s.cryptoRecv.covers(f.offset, f.offset + f.length)) this.speedUp("duplicate ClientHello");
        s.cryptoRecv.add(f.offset, f.offset + f.length); this.ctx.onCrypto(this, name);
      }
      else if (f.type === "STREAM") this.ctx.onStream(this, f);
      else if (f.type === "HANDSHAKE_DONE" && this.role === "client") this.confirm("HANDSHAKE_DONE");
    }
    if (elic && !s.discarded) {
      s.ackPending = true; s.unackedElic++;
      if (name !== "app" || outOfOrder || s.unackedElic >= 2) s.ackNow = true;
    }
  }

  reprocessBuffered() {
    const b = this.buffered; this.buffered = [];
    this.replaying = true;                   // ACKs that sat in a buffer would give inflated RTT samples
    for (const qp of b) this.onPacket(qp);
    this.replaying = false;
  }

  discard(name) {
    const s = this.sp[name];
    if (s.discarded) return;
    for (const r of s.sent.values()) if (r.inFlight) this.bif -= r.bytes;
    s.sent.clear(); s.lossTime = null; s.discarded = true; s.ackPending = s.ackNow = false; s.ping = false;
  }

  confirm(why) {
    if (this.confirmed) return;
    this.confirmed = true; this.peerValidated = true;
    this.discard("handshake");
    if (this.role === "client") this.sim.note("client", `handshake confirmed (${why}) — Handshake keys discarded`, "info");
  }

  onAck(s, f) {
    const inAck = (pn) => f.ranges.some(([lo, hi]) => pn >= lo && pn <= hi);
    const newly = [...s.sent.values()].filter((r) => inAck(r.pn));
    if (this.role === "client" && s.name === "handshake") this.peerValidated = true;
    if (!newly.length) return;
    s.largestAcked = Math.max(s.largestAcked, f.largest);
    const top = newly.find((r) => r.pn === f.largest);
    if (top && !this.replaying) this.updateRtt(this.sim.now - top.t, s.name === "app" ? Math.min(f.ackDelay || 0, MAX_ACK_DELAY) : 0);
    let acked1Rtt = false;
    for (const r of newly) {
      s.sent.delete(r.pn);
      this.bif -= r.bytes;
      this.onPacketAcked(r);
      if (r.type === "1-RTT") acked1Rtt = true;
      for (const fr of r.frames) {
        if (fr.type === "CRYPTO") s.crypto.acked.add(fr.offset, fr.offset + fr.length);
        else if (fr.type === "STREAM") this.streams.get(fr.stream).buf.acked.add(fr.offset, fr.offset + fr.length);
        else if (fr.type === "HANDSHAKE_DONE") this.hsDoneAcked = true;
      }
    }
    if (this.role === "client" && acked1Rtt) this.confirm("1-RTT packet acknowledged");
    this.detectLost(s);
    if (this.peerValidated) this.ptoCount = 0;
  }

  updateRtt(latest, ackDelay) {
    this.latestRtt = latest;
    this.minRtt = Math.min(this.minRtt, latest);
    if (this.srtt === null) { this.srtt = latest; this.rttvar = latest / 2; return; }
    const adjusted = latest >= this.minRtt + ackDelay ? latest - ackDelay : latest;
    this.rttvar = 0.75 * this.rttvar + 0.25 * Math.abs(this.srtt - adjusted);
    this.srtt = 0.875 * this.srtt + 0.125 * adjusted;
  }

  onPacketAcked(r) {
    if (r.t <= this.recoveryStart) return; // no growth for packets sent before the recovery started
    if (this.cwnd < this.ssthresh) this.cwnd += r.bytes;               // slow start
    else this.cwnd += Math.floor(MAX_UDP * r.bytes / this.cwnd);       // congestion avoidance
    if (this.role === "server") this.sim.metric("cwnd", this.cwnd);
  }

  detectLost(s) {
    if (s.largestAcked < 0) return;
    const delay = Math.max(TIME_THRESHOLD * Math.max(this.latestRtt, this.srtt ?? INITIAL_RTT), GRANULARITY);
    const now = this.sim.now, lost = [];
    s.lossTime = null;
    for (const r of s.sent.values()) {
      if (r.pn > s.largestAcked) continue;
      const byCount = s.largestAcked >= r.pn + PKT_THRESHOLD;
      if (byCount || r.t + delay <= now) lost.push({ r, why: byCount ? `${s.largestAcked - r.pn} newer packets acked` : "time threshold" });
      else s.lossTime = Math.min(s.lossTime ?? Infinity, r.t + delay);
    }
    if (!lost.length) return;
    for (const { r, why } of lost) {
      s.sent.delete(r.pn);
      this.bif -= r.bytes;
      this.requeue(s, r);
      const what = this.describe([r]) || "frames";
      this.sim.note(this.me, `${r.type} pn ${r.pn} declared lost (${why}) → ${what} re-sent in a new packet`, "loss");
    }
    this.onCongestion(Math.max(...lost.map((x) => x.r.t)));
  }

  requeue(s, r) {
    for (const f of r.frames) {
      if (f.type === "CRYPTO") s.crypto.requeue(f.offset, f.length);
      else if (f.type === "STREAM") this.streams.get(f.stream).buf.requeue(f.offset, f.length);
      else if (f.type === "HANDSHAKE_DONE" && !this.hsDoneAcked) this.hsDonePending = true;
    }
  }

  onCongestion(sentT) {
    if (sentT <= this.recoveryStart) return; // one reduction per round trip of losses
    this.recoveryStart = this.sim.now;
    this.ssthresh = Math.max(Math.floor(this.cwnd / 2), MIN_CWND);
    this.cwnd = this.ssthresh;
    if (this.role === "server") {
      this.sim.metric("cwnd", this.cwnd);
      this.sim.metric("ssthresh", this.ssthresh);
      this.sim.note(this.me, `congestion: cwnd halved to ${(this.cwnd / 1000).toFixed(1)} kB`, "warn");
    }
  }

  // -- timers ----------------------------------------------------------------
  ptoBase() { return (this.srtt ?? INITIAL_RTT) + Math.max(4 * this.rttvar, GRANULARITY); }

  ptoTime() {
    const dur = this.ptoBase() * 2 ** this.ptoCount;
    const spaces = Object.values(this.sp).filter((s) => !s.discarded && s.inFlight());
    if (!spaces.length) {
      // Client anti-deadlock: until the server has validated us, keep a PTO armed so a lost
      // server flight can't leave both sides waiting (the server may be amplification-limited).
      if (this.role === "client" && !this.peerValidated) return { t: this.sim.now + dur, space: null };
      return null;
    }
    let best = null;
    for (const s of spaces) {
      if (s.name === "app" && !this.confirmed && spaces.length > 1) continue;
      const t = s.lastElicT + dur + (s.name === "app" ? MAX_ACK_DELAY * 2 ** this.ptoCount : 0);
      if (!best || t < best.t) best = { t, space: s };
    }
    return best;
  }

  setLossTimer() {
    if (this.stopped) return;
    let t = null;
    for (const s of Object.values(this.sp)) if (!s.discarded && s.lossTime !== null) t = Math.min(t ?? Infinity, s.lossTime);
    if (t === null) {
      if (this.role === "server" && this.ampLeft() < MIN_INITIAL) { this.cancelTimer(); return; } // blocked: RFC 9002 §6.2.2.1
      const pto = this.ptoTime();
      if (!pto) { this.cancelTimer(); return; }
      t = pto.t;
    }
    t = Math.min(Math.max(t, this.sim.now), Math.max(GIVE_UP_AT, this.sim.now));
    if (this.timerId && this.timerAt === t) return;
    this.cancelTimer();
    this.timerAt = t;
    this.timerId = this.sim.timer(this.me, t - this.sim.now, () => { this.timerId = null; this.onTimeout(); }, "loss detection");
  }
  cancelTimer() { if (this.timerId) this.sim.cancel(this.timerId); this.timerId = null; this.timerAt = null; }

  armAckTimer() {
    const s = this.sp.app;
    if (!s.ackPending || s.ackNow || this.ackTimer || this.stopped) return;
    this.ackTimer = this.sim.timer(this.me, MAX_ACK_DELAY, () => {
      this.ackTimer = null;
      if (s.ackPending) { s.ackNow = true; this.flush(); }
    }, "max_ack_delay");
  }

  onTimeout() {
    if (this.stopped) return;
    const now = this.sim.now;
    const lossy = Object.values(this.sp).find((s) => !s.discarded && s.lossTime !== null && s.lossTime <= now + 1e-9);
    if (lossy) { this.detectLost(lossy); this.flush(); return; }
    if (now >= GIVE_UP_AT) { this.ctx.giveUp(); return; } // giveUp() just stops quietly once the page is done
    if (this.ctx.pageDone && this.ptoCount >= 3) {
      this.sim.note(this.me, "page done; peer silent after 3 probes — sim stops here (a real stack waits for its idle timeout)", "info");
      this.stop();
      return;
    }
    const pto = this.ptoTime();
    if (!pto) return;
    this.ptoCount++;
    // RFC 9002 §6.2.4: send up to two probe datagrams; with little to re-send, both carry the same data.
    let s, which = "";
    if (!pto.space) {
      // anti-deadlock probe: Handshake if we have the keys, else a padded Initial
      s = this.keys.handshake && !this.sp.handshake.discarded ? this.sp.handshake : this.sp.initial;
      this.sim.note(this.me, `PTO #${this.ptoCount}: nothing to retransmit, handshake incomplete → ${TYPE[s.name]} probe`, "retx");
    } else {
      s = pto.space;
      which = [...s.sent.values()].filter((r) => r.inFlight).sort((a, b) => a.pn - b.pn).slice(0, 2).map((r) => r.pn).join(", ");
      this.sim.note(this.me, `PTO #${this.ptoCount} (${Math.round(this.ptoBase())} ms × ${2 ** (this.ptoCount - 1)}): probes re-send pn ${which}`, "retx");
    }
    this.probes = 2;
    for (let round = 0; round < 2 && this.probes > 0 && !s.discarded; round++) {
      if (pto.space) {
        // probe the PTO space; during the handshake also re-send the other handshake space's oldest data (coalesced)
        const spaces = s.name === "app" ? [s] : [this.sp.initial, this.sp.handshake].filter((x) => !x.discarded);
        for (const x of spaces) {
          const oldest = [...x.sent.values()].filter((r) => r.inFlight).sort((a, b) => a.pn - b.pn).slice(0, 2);
          for (const r of oldest) this.requeue(x, r);
        }
        if (!this.hasQueued(s)) s.ping = true;
      } else s.ping = true;
      for (let i = 0; i < 8 && this.probes > 0 && this.sendHandshakeDatagram(); i++);
      for (let i = 0; i < 8 && this.probes > 0 && this.sendAppPacket(); i++);
    }
    this.flush();
  }

  // Re-send all unacknowledged CRYPTO data now instead of waiting for the PTO (limited to twice per connection).
  speedUp(why) {
    if ((this.speedUps = (this.speedUps || 0) + 1) > 2) return;
    let any = false;
    for (const x of [this.sp.initial, this.sp.handshake]) {
      if (x.discarded) continue;
      for (const r of x.sent.values()) if (r.inFlight && r.frames.some((f) => f.type === "CRYPTO")) { this.requeue(x, r); any = true; }
    }
    if (any) this.sim.note(this.me, `${why} → re-sending unacknowledged handshake data before the PTO`, "retx");
  }

  hasQueued(s) {
    if (s.name !== "app") return s.crypto && s.crypto.hasData();
    return this.hsDonePending || this.order.some((id) => this.streams.get(id).buf.hasRetx());
  }

  stop() {
    this.stopped = true;
    this.cancelTimer();
    if (this.ackTimer) { this.sim.cancel(this.ackTimer); this.ackTimer = null; }
  }
}

function rangeText(ranges) {
  const asc = ranges.slice().reverse().map(([lo, hi]) => (lo === hi ? `${lo}` : `${lo}–${hi}`));
  return (asc.length > 3 ? "…, " : "") + asc.slice(-3).join(", ");
}

// ---------------------------------------------------------------------------

export default {
  id: "http3",
  name: "HTTP/3 (QUIC)",
  short: "HTTP over QUIC: 1-RTT encrypted handshake, independent streams over UDP.",
  layers: ["IPv4", "UDP", "QUIC", "HTTP/3"],
  options: [
    { key: "resources", label: "Resources", type: "number", default: 6, min: 1, max: 12, step: 1,
      hint: "Each request gets its own QUIC stream (ids 0, 4, 8, …)." },
    { key: "size", label: "Size per resource (×1460 B)", type: "number", default: 2, min: 1, max: 8, step: 1,
      hint: "Same bytes as the TCP stacks' segments, so races are fair." },
    { key: "zeroRtt", label: "0-RTT (resumed session)", type: "bool", default: false,
      hint: "Requests ride in 0-RTT packets with the ClientHello." },
  ],

  setup(sim, opts) {
    const resources = clamp(opts.resources, 1, 12), sizeU = clamp(opts.size, 1, 8), zeroRtt = !!opts.zeroRtt;
    const body = sizeU * SEGMENT, respLen = RESP_HDR_BYTES + body;
    const ids = Array.from({ length: resources }, (_, i) => 4 * i);
    const pathOf = (id) => PATHS[(id / 4) % PATHS.length];
    const recv = new Map(ids.map((id) => [id, { got: new Ranges(), delivered: 0, total: respLen, done: null, blocked: false }]));
    const res = { handshakeMs: null, firstResourceMs: null, pageLoadMs: null, streamDone: {}, failed: false, firstRequestMs: null };

    const ctx = {
      pathOf, pageDone: false,
      giveUp() {
        if (ctx.pageDone) {
          sim.note("client", "page done; simulation stops (a real stack would keep the connection until idle timeout)", "info");
          client.stop(); server.stop();
          return;
        }
        if (res.failed) return;
        res.failed = true;
        sim.note("client", "giving up: connection stalled (simulated idle timeout)", "loss");
        client.stop(); server.stop();
      },
      onCrypto(conn, space) {
        const s = conn.sp[space];
        if (conn.role === "server") {
          if (space === "initial" && !conn.keys.handshake && s.cryptoRecv.covers(0, msgsLen(CH))) {
            conn.keys.handshake = true; conn.keys.appWrite = true; conn.keys.zeroRttRead = zeroRtt;
            conn.sp.initial.crypto = cryptoBuf(SH);
            conn.sp.handshake.crypto = cryptoBuf(zeroRtt ? SERVER_HS_PSK : SERVER_HS_FULL);
            if (zeroRtt) {
              conn.validated = true;
              sim.note("server", "ClientHello with PSK + address token: resumed session, 0-RTT accepted, no certificate needed", "info");
            } else {
              sim.note("server", "ClientHello → keys derived; replies with ServerHello + certificate chain", "info");
            }
            conn.reprocessBuffered();
          } else if (space === "handshake" && !conn.keys.appRead && s.cryptoRecv.covers(0, msgsLen(CLIENT_FIN))) {
            conn.keys.appRead = true;
            conn.confirmed = true;
            conn.hsDonePending = true;
            conn.discard("handshake");
            sim.note("server", "client Finished: handshake confirmed → HANDSHAKE_DONE", "good");
            conn.reprocessBuffered();
          }
        } else {
          if (space === "initial" && !conn.keys.handshake && s.cryptoRecv.covers(0, msgsLen(SH))) {
            conn.keys.handshake = true;
            conn.reprocessBuffered();
          } else if (space === "handshake" && !conn.keys.appRead &&
            s.cryptoRecv.covers(0, msgsLen(zeroRtt ? SERVER_HS_PSK : SERVER_HS_FULL))) {
            conn.keys.appRead = true; conn.keys.appWrite = true;
            conn.sp.handshake.crypto = cryptoBuf(CLIENT_FIN);
            res.handshakeMs = sim.now;
            sim.mark("handshake done", "client");
            sim.note("client", `handshake complete at ${Math.round(sim.now)} ms — 1-RTT keys ready`, "good");
            if (!zeroRtt) openRequests(conn);
            conn.reprocessBuffered();
          }
        }
      },
      onStream(conn, f) {
        if (conn.role === "server") {
          if (conn.streams.has(f.stream) || !ids.includes(f.stream)) return;
          // Request is a single small HEADERS frame with FIN.
          if (!(f.offset === 0 && f.fin)) return;
          conn.streams.set(f.stream, { buf: new SendBuf(respLen) });
          conn.order.push(f.stream);
          conn.order.sort((a, b) => a - b);
          return;
        }
        const st = recv.get(f.stream);
        if (!st || st.done !== null) return;
        if (st.got.covers(f.offset, f.offset + f.length)) return; // duplicate (e.g. PTO probe)
        st.got.add(f.offset, f.offset + f.length);
        const end = st.got.endFrom(st.delivered);
        if (end > st.delivered) {
          const bytes = end - st.delivered;
          sim.deliver("client", { stream: f.stream, label: `${pathOf(f.stream)} ${end}/${st.total} B`, bytes, offset: st.delivered });
          if (st.blocked) { st.blocked = false; sim.note("client", `stream ${f.stream} unblocked — gap filled`, "good"); }
          st.delivered = end;
          if (end === st.total) streamDone(f.stream, st);
        } else if (!st.blocked) {
          st.blocked = true;
          const others = ids.filter((k) => k !== f.stream && recv.get(k).done === null);
          sim.note("client", `stream ${f.stream} waits for bytes ${st.delivered}+ (lost) — head-of-line blocked on this stream only` +
            (others.length ? `; streams ${others.slice(0, 4).join(", ")}${others.length > 4 ? "…" : ""} keep flowing` : ""), "warn");
        }
      },
    };

    function streamDone(id, st) {
      st.done = sim.now;
      res.streamDone[id] = sim.now;
      sim.note("client", `${pathOf(id)} complete (stream ${id})`, "good");
      if (res.firstResourceMs === null) { res.firstResourceMs = sim.now; sim.mark("first resource", "client"); }
      if (ids.every((k) => recv.get(k).done !== null)) {
        res.pageLoadMs = sim.now; ctx.pageDone = true;
        sim.mark("page loaded", "client");
      }
    }

    function openRequests(conn) {
      if (res.firstRequestMs === null) res.firstRequestMs = sim.now;
      for (const id of ids) {
        if (conn.streams.has(id)) continue;
        conn.streams.set(id, { buf: new SendBuf(REQ_BYTES) });
        conn.order.push(id);
      }
    }

    const client = new Conn(sim, "client", ctx), server = new Conn(sim, "server", ctx);
    sim.on("client", (p) => client.onDatagram(p));
    sim.on("server", (p) => server.onDatagram(p));

    client.sp.initial.crypto = cryptoBuf(CH);
    sim.note("client", "Initial: ClientHello padded to 1200 B so the server may answer with up to 3× that", "info");
    if (zeroRtt) {
      client.keys.zeroRttWrite = true;
      openRequests(client);
      sim.note("client", "resumed session: requests go out in 0-RTT packets with the ClientHello", "info");
    }
    sim.metric("cwnd", server.cwnd);
    client.flush();

    return {
      summary() {
        return {
          handshakeMs: res.handshakeMs, firstResourceMs: res.firstResourceMs, pageLoadMs: res.pageLoadMs,
          firstRequestMs: res.firstRequestMs, streamDone: { ...res.streamDone }, completed: res.pageLoadMs !== null,
          failed: res.failed, zeroRtt,
        };
      },
    };
  },
};

function clamp(v, lo, hi) { v = Number(v); return Math.max(lo, Math.min(hi, Number.isFinite(v) ? Math.round(v) : lo)); }
