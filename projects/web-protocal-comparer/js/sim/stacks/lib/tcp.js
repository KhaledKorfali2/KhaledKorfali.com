// Reusable TCP connection model (RFC 9293 behaviour, RFC 5681 Reno congestion
// control, RFC 6298 retransmission timer), shared by the tcp, tls, http1, http2
// and websocket stacks.
//
// What is modelled:
//  - 3-way handshake (SYN carries the MSS and window-scale options), client ISN
//    1000 and server ISN 5000 for readability, retransmitted SYN / SYN-ACK.
//  - A byte stream in each direction. The app writes messages with
//    write(bytes, meta); each write is cut into MSS-sized segments (a segment
//    never mixes two writes, like an app writing with TCP_NODELAY).
//  - Cumulative ACKs, piggybacked on data whenever the app answers right away.
//    Optional delayed ACKs (every 2nd segment or after `delayedAck` ms; at once
//    for out-of-order data, gap fills and FIN).
//  - RTO per RFC 6298: initial 1 s, SRTT/RTTVAR, Karn's algorithm (no samples
//    from retransmitted segments), 200 ms floor, exponential backoff, 60 s cap.
//  - Reno / NewReno (RFC 5681, RFC 6582): slow start (cwnd += acked segments, at most 2 per ACK — RFC 3465),
//    congestion avoidance (+1 segment per RTT), fast retransmit on the 3rd
//    duplicate ACK with fast recovery (ssthresh = FlightSize/2, cwnd =
//    ssthresh + 3, +1 per further dup ACK; a partial ACK resends the next
//    hole at once (NewReno), the ACK covering the whole window ends recovery);
//    on RTO ssthresh = FlightSize/2, cwnd = 1 and go-back-N from snd.una.
//    cwnd counts segments (like Linux) and only grows while it is the limit.
//  - Receiver window (constant buffer; the app reads in-order data at once)
//    limits the bytes in flight.
//  - In-order delivery to the app with an out-of-order buffer: one missing
//    segment holds back every later byte — TCP head-of-line blocking.
//  - FIN teardown (FIN_WAIT/CLOSE_WAIT/LAST_ACK/CLOSING/TIME_WAIT). TIME_WAIT's
//    2×MSL wait is noted, not simulated, but the socket still re-ACKs a FIN.
// Not modelled: SACK, timestamps, delayed-ACK quick-ack mode, Nagle, pacing,
// RST, zero-window probes, keep-alives.

export const MSS = 1460;
const HDR = 40;              // IPv4 20 + TCP 20
const SYN_OPTIONS = 8;       // MSS (4) + NOP + window scale (3)
const MIN_RTO = 200, MAX_RTO = 60000, INIT_RTO = 1000;

const hosts = new WeakMap();         // sim → node → "lport:rport" → Endpoint
const segOf = new WeakMap();         // packet record → segment it carries
let audit = null;
/** Test hook: fn({ node, conn, seq, len, t }) for every byte range handed to an app, in order. */
export function setTcpAudit(fn) { audit = fn; }

function demux(sim, node) {
  let byNode = hosts.get(sim);
  if (!byNode) { byNode = new Map(); hosts.set(sim, byNode); }
  let m = byNode.get(node);
  if (!m) {
    m = new Map();
    byNode.set(node, m);
    sim.on(node, (pkt) => {
      const t = pkt.headers && pkt.headers.tcp;
      if (!t) return;
      const ep = m.get(t.dstPort + ":" + t.srcPort);
      if (ep) ep.receive(pkt);
    });
  }
  return m;
}

/**
 * Create both ends of one TCP connection. Call conn.client.connect() to start.
 * @param {object} o
 *  client, server: node names; clientPort, serverPort
 *  clientOpts / serverOpts: { initCwnd = 10, ssthresh = Infinity, rcvBuf = 65535, fastRetransmit = true,
 *                             delayedAck = 0 (ms), metrics = false, tag = "" }
 */
export function tcpConnection(sim, o) {
  const cNode = o.client || "client", sNode = o.server || "server";
  const client = new Endpoint(sim, { ...o.clientOpts, node: cNode, peer: sNode, lport: o.clientPort, rport: o.serverPort, isn: 1000, role: "client" });
  const server = new Endpoint(sim, { ...o.serverOpts, node: sNode, peer: cNode, lport: o.serverPort, rport: o.clientPort, isn: 5000, role: "server" });
  const key = (ep) => ep.lport + ":" + ep.rport;
  const cm = demux(sim, cNode), sm = demux(sim, sNode);
  if (cm.has(key(client)) || sm.has(key(server))) throw new Error("TCP port pair already in use: " + key(client));
  cm.set(key(client), client);
  sm.set(key(server), server);
  return { client, server };
}

export class Endpoint {
  constructor(sim, o) {
    this.sim = sim; this.node = o.node; this.peer = o.peer; this.role = o.role;
    this.lport = o.lport; this.rport = o.rport; this.isn = o.isn;
    this.tag = o.tag || "";
    this.state = o.role === "client" ? "CLOSED" : "LISTEN";
    // congestion control
    this.initCwnd = o.initCwnd ?? 10;
    this.cwnd = this.initCwnd;
    this.ssthresh = o.ssthresh ?? Infinity;
    this.fastRetransmit = o.fastRetransmit ?? true;
    this.metrics = !!o.metrics;
    this.abc = o.delayedAck ? 2 : 1;
    // send side
    this.segs = []; this.ackIdx = 0; this.sendIdx = 0;
    this.writeSeq = this.isn;   // next sequence number to assign
    this.una = this.isn; this.nxt = this.isn; this.max = this.isn;
    this.peerWnd = 65535; this.peerMss = null; this.peerWscale = 0;
    this.rto = INIT_RTO; this.srtt = null; this.rttvar = null; this.timerId = null; this.timing = null;
    this.dupAcks = 0; this.inFR = false; this.recover = this.isn; this.synRetx = false;
    this.finSeg = null; this.wndNoted = false; this.caNoted = false;
    // receive side
    this.rcvBuf = o.rcvBuf ?? 65535;
    this.wscale = this.rcvBuf > 65535 ? Math.ceil(Math.log2(this.rcvBuf / 65535)) : 0;
    this.rcvNxt = null; this.ooo = new Map(); this.gapAt = null;
    this.delayedAck = o.delayedAck || 0; this.unackedSegs = 0; this.owe = null; this.delackTimer = null;
    // stats
    this.stats = { rto: 0, fastRetx: 0, dupAcks: 0, retxSegs: 0, maxCwnd: Math.floor(this.cwnd), established: null, allAcked: null };
    this.emitted = { cwnd: null, ssthresh: null };
    // callbacks set by the app
    this.onEstablished = null;   // ()
    this.onData = null;          // ({ len, meta, i, n, last, offset, seq })
    this.onPeerClose = null;     // () peer sent FIN (all its data delivered)
    this.onClosed = null;        // () both directions closed (or TIME_WAIT entered)
    this.onSendable = null;      // () after an ACK, when a new write would go out at once
    this.onAllAcked = null;      // () every written byte is acknowledged
    this.onHold = null;          // ({ missing, seg }) data buffered behind a gap
    this.onRelease = null;       // ({ count }) a gap was filled
  }

  get established() { return this.una > this.isn && this.rcvNxt !== null; }
  get mss() { return Math.min(MSS, this.peerMss || MSS); }
  rtt() { return this.srtt; }

  note(text, kind = "info") { this.sim.note(this.node, (this.tag ? this.tag + ": " : "") + text, kind); }

  // ---- app API ---------------------------------------------------------------------------------------

  connect() {
    if (this.state !== "CLOSED") return;
    this.state = "SYN_SENT";
    this.queueSyn();
    this.trySend();
  }

  /**
   * Queue `bytes` of application data.
   * meta: { kind, label: string | (k) => string, headers: object | (k) => object,
   *         payload: string | (k) => string, stream, ...anything the receiving app needs }
   * k = { i, n, seq, len, offset } describes one segment of the write.
   */
  write(bytes, meta = {}) {
    if (this.finSeg) throw new Error("write after close");
    bytes = Math.max(1, Math.round(bytes));
    const mss = this.mss;
    const n = Math.ceil(bytes / mss);
    for (let i = 1, off = 0; i <= n; i++) {
      const len = Math.min(mss, bytes - off);
      const k = { i, n, seq: this.writeSeq, len, offset: off, total: bytes };
      const base = typeof meta.label === "function" ? meta.label(k) : (n > 1 ? `${meta.label} (${i}/${n})` : meta.label);
      this.segs.push({
        seq: this.writeSeq, len, end: this.writeSeq + len, meta, k,
        kind: meta.kind || "DATA", label: base || `seq ${this.writeSeq} (${len} B)`,
        headers: typeof meta.headers === "function" ? meta.headers(k) : meta.headers,
        payload: typeof meta.payload === "function" ? meta.payload(k) : (i === 1 ? meta.payload : undefined),
        stream: meta.stream, push: i === n,
      });
      this.writeSeq += len; off += len;
    }
    this.trySend();
  }

  /** Send FIN after all queued data. */
  close() {
    if (this.finSeg || this.state === "CLOSED" || this.state === "LISTEN") return;
    const seg = { seq: this.writeSeq, len: 0, end: this.writeSeq + 1, fin: true, k: {} };
    this.writeSeq += 1;
    this.finSeg = seg;
    this.segs.push(seg);
    if (this.state === "CLOSE_WAIT") this.state = "LAST_ACK";
    else this.state = "FIN_WAIT_1";
    this.trySend();
  }

  /** Would a write made now leave immediately (nothing queued, cwnd and rwnd have room)? */
  sendable() {
    if (!this.established || this.finSeg) return false;
    const flight = this.sendIdx - this.ackIdx;
    return this.sendIdx >= this.segs.length && flight < Math.floor(this.cwnd) &&
      (flight === 0 || this.writeSeq + this.mss - this.una <= this.peerWnd);
  }
  /** Unsent bytes queued in the socket. */
  queued() { let b = 0; for (let i = this.sendIdx; i < this.segs.length; i++) b += this.segs[i].len; return b; }
  allAcked() { return this.una >= this.writeSeq; }

  // ---- sending ---------------------------------------------------------------------------------------

  queueSyn() {
    const seg = { seq: this.isn, len: 0, end: this.isn + 1, syn: true, k: {} };
    this.writeSeq = this.isn + 1;
    this.segs.push(seg);
  }

  trySend() {
    let blockedBy = null;
    while (this.sendIdx < this.segs.length) {
      const seg = this.segs[this.sendIdx];
      if (!seg.syn) {
        if (!this.established) break;
        const flight = this.sendIdx - this.ackIdx;
        if (flight >= Math.floor(this.cwnd)) { blockedBy = "cwnd"; break; }
        if (flight > 0 && seg.end - this.una > this.peerWnd) {
          blockedBy = "rwnd";
          if (!this.wndNoted) {
            this.wndNoted = true;
            this.note(`receive window full: ${this.nxt - this.una} B (${flight} segments) in flight, peer allows ${this.peerWnd} B — waiting for ACKs`, "warn");
          }
          break;
        }
      }
      const retx = seg.seq < this.max;
      if (this.iwNote && !seg.syn) {
        this.iwNote = false;
        this.note("the handshake needed a retransmission → initial window is 1 segment, not " + this.initCwnd + " (RFC 5681)", "warn");
      }
      this.xmit(seg, retx);
      this.sendIdx++;
      this.nxt = seg.end;
      if (seg.end > this.max) this.max = seg.end;
      if (!retx && !this.timing) this.timing = { end: seg.end, t: this.sim.now };
      if (this.timerId === null) this.startTimer();
    }
    // Is cwnd what limits us? (Linux tcp_is_cwnd_limited: only then may cwnd grow.)
    if (this.established) {
      this.cwndLimited = blockedBy === "cwnd" ||
        (blockedBy === null && this.sendIdx - this.ackIdx >= Math.floor(this.cwnd));
    }
  }

  windowField() { return Math.min(65535, this.rcvBuf >> this.wscale); }

  xmit(seg, retx) {
    const flags = [];
    if (seg.syn) flags.push("SYN");
    if (this.rcvNxt !== null) flags.push("ACK");
    if (seg.fin) flags.push("FIN");
    if (seg.push) flags.push("PSH");
    const tcp = {
      srcPort: this.lport, dstPort: this.rport, seq: seg.seq, ack: this.rcvNxt ?? 0, flags,
      window: seg.syn ? Math.min(65535, this.rcvBuf) : this.windowField(),
    };
    let kind, label;
    if (seg.syn) {
      tcp.mss = MSS; tcp.wscale = this.wscale;
      kind = label = this.rcvNxt === null ? "SYN" : "SYN-ACK";
    } else if (seg.fin) {
      kind = label = "FIN";
    } else {
      kind = seg.kind; label = seg.label;
    }
    if (retx) { label += " (retx)"; this.stats.retxSegs++; }
    const pkt = this.sim.send({
      from: this.node, to: this.peer, kind, label, size: HDR + (seg.syn ? SYN_OPTIONS : 0) + seg.len,
      headers: { ip: { proto: 6 }, tcp, ...(seg.headers || {}) },
      payload: seg.payload, stream: seg.stream, retx,
    });
    segOf.set(pkt, seg);
    this.ackSent();
  }

  sendAck() {
    if (this.rcvNxt === null) return;
    this.sim.send({
      from: this.node, to: this.peer, kind: "ACK", label: `ACK ${this.rcvNxt}`, size: HDR,
      headers: { ip: { proto: 6 }, tcp: { srcPort: this.lport, dstPort: this.rport, seq: this.nxt, ack: this.rcvNxt, flags: ["ACK"], window: this.windowField() } },
    });
    this.ackSent();
  }

  ackSent() {
    this.owe = null; this.unackedSegs = 0;
    if (this.delackTimer !== null) { this.sim.cancel(this.delackTimer); this.delackTimer = null; }
  }

  startTimer() {
    this.timerId = this.sim.timer(this.node, this.rto, () => { this.timerId = null; this.onRto(); }, "RTO");
  }
  stopTimer() { if (this.timerId !== null) { this.sim.cancel(this.timerId); this.timerId = null; } }
  restartTimer() { this.stopTimer(); this.startTimer(); }

  sample(r) {
    if (this.srtt === null) { this.srtt = r; this.rttvar = r / 2; }
    else {
      this.rttvar = 0.75 * this.rttvar + 0.25 * Math.abs(this.srtt - r);
      this.srtt = 0.875 * this.srtt + 0.125 * r;
    }
    this.rto = Math.min(MAX_RTO, Math.max(MIN_RTO, this.srtt + Math.max(1, 4 * this.rttvar)));
  }

  onRto() {
    if (this.una >= this.max) return;
    const seg = this.segs[this.ackIdx];
    const old = Math.round(this.rto);
    this.stats.rto++;
    this.timing = null;               // Karn: nothing in flight may be timed now
    this.dupAcks = 0;
    this.recover = this.max;
    let cc = "";
    if (seg.syn) {
      this.synRetx = true;
    } else {
      if (!seg.timerRetx) {
        const flight = Math.max(1, this.sendIdx - this.ackIdx);
        this.ssthresh = Math.max(Math.floor(flight / 2), 2);
      }
      this.cwnd = 1; this.inFR = false; this.caCount = 0;
      cc = `; ssthresh ${this.ssthresh}, cwnd 1 (slow start again)`;
    }
    seg.timerRetx = true;
    this.rto = Math.min(this.rto * 2, MAX_RTO);
    const what = seg.syn ? (this.role === "client" ? "SYN" : "SYN-ACK") : seg.fin ? "FIN" : `seq ${seg.seq}`;
    this.note(`RTO fired (${old} ms, no ACK) → retransmit ${what}${cc}; next RTO ${Math.round(this.rto)} ms`, "retx");
    this.emit();
    this.nxt = this.una; this.sendIdx = this.ackIdx;   // go back N
    this.trySend();
  }

  // ---- receiving -------------------------------------------------------------------------------------

  receive(pkt) {
    const t = pkt.headers.tcp, seg = segOf.get(pkt) || { seq: t.seq, len: 0, end: t.seq, k: {} };
    const f = t.flags || [];
    const SYN = f.includes("SYN"), ACK = f.includes("ACK");
    if (this.state === "CLOSED") return;
    if (this.state === "LISTEN") {
      if (!SYN || ACK) return;
      this.learnPeer(t);
      this.rcvNxt = t.seq + 1;
      this.state = "SYN_RCVD";
      this.queueSyn();
      this.trySend();
      return;
    }
    if (SYN) {
      if (this.state === "SYN_SENT" && ACK && t.ack === this.isn + 1) {
        this.learnPeer(t);
        this.rcvNxt = t.seq + 1;
        this.una = t.ack; this.ackIdx = 1;
        if (this.timing) { this.sample(this.sim.now - this.timing.t); this.timing = null; }
        this.stopTimer();
        this.state = "ESTABLISHED";
        this.sendAck();               // the 3rd packet of the handshake
        this.becomeEstablished();
        return;
      }
      if (this.state === "SYN_RCVD" && !ACK) {
        // Our SYN-ACK (or its ACK) was lost and the client retried: answer again at once.
        this.timing = null;
        this.xmit(this.segs[0], true);
        return;
      }
      if (this.rcvNxt !== null) this.sendAck();   // stale SYN-ACK: our ACK was lost
      return;
    }
    if (this.state === "SYN_SENT") return;
    const hasData = seg.len > 0 || !!seg.fin;
    if (ACK) this.processAck(t.ack, t.window << this.peerWscale, hasData);
    if (hasData) this.processData(seg);
    this.flushAck();
  }

  learnPeer(t) {
    this.peerMss = t.mss || 536;
    this.peerWscale = t.wscale ?? 0;
    this.peerWnd = t.window;
  }

  becomeEstablished() {
    this.stats.established = this.sim.now;
    if (this.synRetx && this.cwnd > 1) {
      this.cwnd = 1;               // RFC 5681 §3.1: lost SYN or SYN-ACK → initial window of one segment
      this.iwNote = true;          // explained when this side first sends data
    }
    this.emit();
    if (this.onEstablished) this.onEstablished();
    this.trySend();
  }

  processAck(ack, wnd, hasData) {
    if (ack > this.max) return;
    const wndChanged = wnd !== this.peerWnd;
    this.peerWnd = wnd;
    if (ack > this.una) {
      const flightBefore = this.sendIdx - this.ackIdx;
      let newly = 0;
      while (this.ackIdx < this.segs.length && this.segs[this.ackIdx].end <= ack) {
        if (!this.segs[this.ackIdx].syn) newly++;
        this.ackIdx++;
      }
      this.una = ack;
      if (this.nxt < ack) { this.nxt = ack; this.sendIdx = this.ackIdx; }
      if (this.timing && ack >= this.timing.end) { this.sample(this.sim.now - this.timing.t); this.timing = null; }
      this.dupAcks = 0;
      this.wndNoted = false;
      if (this.state === "SYN_RCVD") { this.state = "ESTABLISHED"; this.becomeEstablished(); }
      if (newly > 0) this.grow(newly, flightBefore);
      if (this.finSeg && ack >= this.finSeg.end) this.finAcked();
      if (this.una >= this.nxt) this.stopTimer(); else this.restartTimer();
      this.emit();
      this.trySend();
      if (this.allAcked()) {
        if (this.stats.allAcked === null || this.stats.allAckedAt !== this.writeSeq) { this.stats.allAcked = this.sim.now; this.stats.allAckedAt = this.writeSeq; }
        if (this.onAllAcked) this.onAllAcked();
      }
      if (this.onSendable && this.sendable()) this.onSendable();
      return;
    }
    if (ack === this.una && !hasData && !wndChanged && this.una < this.max && this.established) {
      this.dupAcks++;
      this.stats.dupAcks++;
      if (this.dupAcks <= 3) this.note(`duplicate ACK #${this.dupAcks} (ack ${ack}): receiver is missing seq ${ack}`, "warn");
      // Not again for losses from the same window (RFC 6582 "recover").
      if (this.dupAcks === 3 && this.fastRetransmit && !this.inFR && this.una >= this.recover) {
        const flight = this.sendIdx - this.ackIdx;
        this.ssthresh = Math.max(Math.floor(flight / 2), 2);
        this.cwnd = this.ssthresh + 3;
        this.caCount = 0;
        this.inFR = true;
        this.recover = this.max;
        this.stats.fastRetx++;
        this.timing = null;
        const seg = this.segs[this.ackIdx];
        this.note(`3 duplicate ACKs → fast retransmit seq ${seg.seq} without waiting for the RTO; ssthresh ${this.ssthresh}, cwnd ${this.ssthresh}+3 (fast recovery)`, "retx");
        this.xmit(seg, true);
        this.restartTimer();
        this.emit();
        this.trySend();          // the inflated window may already allow new data
      } else if (this.inFR && this.dupAcks > 3) {
        this.cwnd += 1;          // each dup ACK means a segment left the network
        this.emit();
        this.trySend();
      }
    }
  }

  grow(newly, flightBefore) {
    if (this.inFR) {
      if (this.una >= this.recover) {
        this.inFR = false;
        this.cwnd = this.ssthresh;
        this.note(`ACK covers everything sent before the loss → fast recovery over, cwnd = ssthresh ${this.ssthresh} (congestion avoidance)`, "info");
      } else {
        // NewReno partial ACK (RFC 6582): the next hole is lost too — resend it now, stay in recovery.
        const seg = this.segs[this.ackIdx];
        this.cwnd = Math.max(1, this.cwnd - newly + 1);
        this.timing = null;
        this.note(`partial ACK ${this.una} → seq ${seg.seq} was lost too: retransmit it now (NewReno), stay in fast recovery`, "retx");
        this.stats.fastRetx++;
        this.xmit(seg, true);
      }
      return;
    }
    const ss = this.cwnd < this.ssthresh;
    // Only grow while cwnd is what limits sending (RFC 7661 / Linux tcp_is_cwnd_limited).
    const limited = this.cwndLimited || (ss && Math.floor(this.cwnd) < 2 * flightBefore);
    if (!limited) return;
    if (ss) {
      this.cwnd = Math.min(this.cwnd + Math.min(newly, this.abc), this.ssthresh);
      if (this.cwnd >= this.ssthresh && !this.caNoted) {
        this.caNoted = true;
        this.note(`cwnd reached ssthresh ${this.ssthresh} → congestion avoidance (+1 segment per RTT)`, "info");
      }
    } else {
      // +1 segment once a full window has been ACKed (Linux snd_cwnd_cnt; avoids float drift).
      this.caCount = (this.caCount || 0) + newly;
      while (this.caCount >= this.cwnd) { this.caCount -= this.cwnd; this.cwnd += 1; }
    }
  }

  emit() {
    const c = Math.floor(this.cwnd);
    if (c > this.stats.maxCwnd) this.stats.maxCwnd = c;
    if (!this.metrics) return;
    if (c !== this.emitted.cwnd) { this.emitted.cwnd = c; this.sim.metric("cwnd", c); }
    if (Number.isFinite(this.ssthresh) && this.ssthresh !== this.emitted.ssthresh) {
      this.emitted.ssthresh = this.ssthresh; this.sim.metric("ssthresh", this.ssthresh);
    }
  }

  finAcked() {
    if (this.state === "FIN_WAIT_1") this.state = "FIN_WAIT_2";
    else if (this.state === "CLOSING") this.enterTimeWait();
    else if (this.state === "LAST_ACK") {
      this.state = "CLOSED";
      this.note("FIN acknowledged → connection closed", "good");
      if (this.onClosed) this.onClosed();
    }
  }

  enterTimeWait() {
    this.state = "TIME_WAIT";
    this.note("TIME_WAIT: this side closed first, so it keeps the port for 2×MSL (~60 s, not simulated) to re-ACK a lost FIN", "info");
    if (this.onClosed) this.onClosed();
  }

  processData(seg) {
    if (this.rcvNxt === null) return;
    if (seg.end <= this.rcvNxt) { this.owe = "now"; return; }       // duplicate: re-ACK at once
    if (seg.seq > this.rcvNxt) {
      if (!this.ooo.has(seg.seq)) {
        this.ooo.set(seg.seq, seg);
        if (this.gapAt !== this.rcvNxt) {
          this.gapAt = this.rcvNxt;
          this.note(`seq ${seg.seq} arrived but seq ${this.rcvNxt} is missing → buffered, app can't have it yet (head-of-line)`, "warn");
        }
        if (this.onHold) this.onHold({ missing: this.rcvNxt, seg });
      }
      this.owe = "now";                                              // duplicate ACK tells the sender
      return;
    }
    const gap = this.ooo.size > 0;
    // Decide the ACK before the app runs: if it answers at once, the ACK rides on its data.
    if (gap || seg.fin) this.owe = "now";
    else if (this.owe !== "now") {
      this.unackedSegs++;
      this.owe = !this.delayedAck || this.unackedSegs >= 2 ? "now" : "delayed";
    }
    this.accept(seg);
    let released = 0;
    while (this.ooo.has(this.rcvNxt)) {
      const s = this.ooo.get(this.rcvNxt);
      this.ooo.delete(s.seq);
      released++;
      this.accept(s);
    }
    for (const k of [...this.ooo.keys()]) if (k < this.rcvNxt) this.ooo.delete(k);
    if (gap) {
      if (released) {
        this.note(`gap filled → ${released} buffered segment${released > 1 ? "s" : ""} released to the app at once`, "good");
        if (this.onRelease) this.onRelease({ count: released });
      }
      if (this.ooo.size === 0) this.gapAt = null;
    }
  }

  accept(seg) {
    this.rcvNxt = seg.end;
    if (seg.len > 0) {
      if (audit) audit({ sim: this.sim, node: this.node, conn: this.lport + ":" + this.rport, seq: seg.seq, len: seg.len, t: this.sim.now });
      if (this.onData) this.onData({ ...seg.k, len: seg.len, meta: seg.meta, last: seg.k.i === seg.k.n });
    }
    if (seg.fin) {
      this.sendAck();                 // ACK the FIN on its own, before the app reacts
      if (this.state === "ESTABLISHED" || this.state === "SYN_RCVD") {
        this.state = "CLOSE_WAIT";
        if (this.onPeerClose) this.onPeerClose();
      } else if (this.state === "FIN_WAIT_1") {
        this.state = "CLOSING";
      } else if (this.state === "FIN_WAIT_2") {
        this.enterTimeWait();
      }
    }
  }

  flushAck() {
    if (this.owe === "now") this.sendAck();
    else if (this.owe === "delayed" && this.delackTimer === null) {
      this.delackTimer = this.sim.timer(this.node, this.delayedAck, () => {
        this.delackTimer = null;
        if (this.owe) this.sendAck();
      }, "delayed ACK");
    }
  }
}
