// Discrete-event network simulator.
//
// A simulation is either a line of nodes (endpoints at both ends, optional
// routers between) or, with `lan: true`, one shared segment where every node
// hears broadcasts. Protocol stacks register handlers on endpoints, send
// packets and set timers; the engine moves packets hop by hop with latency,
// jitter, serialisation delay (bandwidth), random or scripted loss, TTL expiry
// at routers and optional NAT at one router. run() returns a complete,
// deterministic trace that the UI replays.

const DEFAULT_LINK = {
  latency: 40,     // one-way, end to end, ms
  jitter: 0,       // extra 0..jitter ms of queueing delay per packet (order preserved)
  loss: 0,         // probability 0..1 that a packet is lost
  reorder: 0,      // probability 0..1 that a packet takes a slower path and arrives out of order
  bandwidth: 0,    // bytes per ms at the sender (0 = unlimited); 1250 B/ms = 10 Mbit/s
};

export const ADDRESSES = {
  client: "192.168.1.20",
  server: "93.184.216.34",
  resolver: "1.1.1.1",
  r1: "192.168.1.1",
  gateway: "192.168.1.1",
  dhcp: "192.168.1.1",
  printer: "192.168.1.30",
  r2: "10.24.0.1",
  r3: "72.14.215.85",
  r4: "142.250.64.1",
};

// Hardware (Ethernet) addresses for nodes on the local segment.
export const MACS = {
  client: "3c:22:fb:1a:2b:3c",
  printer: "00:1b:a9:52:7c:10",
  gateway: "f4:92:bf:0c:11:2e",
  dhcp: "f4:92:bf:0c:11:2e",
  r1: "f4:92:bf:0c:11:2e",
  broadcast: "ff:ff:ff:ff:ff:ff",
};
export const PUBLIC_IP = "203.0.113.7";

// Small, fast, seedable PRNG so every run of a scenario is reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Queue {
  constructor() { this.h = []; }
  get size() { return this.h.length; }
  push(e) {
    const h = this.h; h.push(e);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (Queue.less(h[p], h[i])) break;
      [h[p], h[i]] = [h[i], h[p]]; i = p;
    }
  }
  pop() {
    const h = this.h, top = h[0], last = h.pop();
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < h.length && Queue.less(h[l], h[m])) m = l;
        if (r < h.length && Queue.less(h[r], h[m])) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]]; i = m;
      }
    }
    return top;
  }
  static less(a, b) { return a.t < b.t || (a.t === b.t && a.seq < b.seq); }
}

export class Sim {
  /**
   * @param {object} o
   * @param {string[]} [o.nodes]  path order, e.g. ["client","server"] or ["client","r1","r2","server"]
   * @param {object}   [o.link]   see DEFAULT_LINK
   * @param {object[]} [o.drops]  scripted losses: { kind, label, from, to, n = 1, retx = false, stream }
   *                              — the n-th packet matching every given field is lost.
   * @param {number}   [o.seed]
   * @param {number}   [o.maxTime] ms of simulated time before giving up
   * @param {boolean}  [o.lan]   all nodes share one segment: one hop between any two, `to: "broadcast"` reaches all
   * @param {object}   [o.nat]   { router, publicIp?, forward: [{ proto: "tcp"|"udp", port, toPort }] } —
   *                             the router rewrites inside→outside packets to its public address and drops
   *                             inbound packets that match no mapping or port-forward rule.
   */
  constructor({ nodes = ["client", "server"], link = {}, drops = [], seed = 7, maxTime = 90000, lan = false, nat = null } = {}) {
    this.nodes = nodes;
    this.lan = lan;
    this.nat = nat ? { publicIp: PUBLIC_IP, forward: [], ...nat } : null;
    this.natMap = [];
    this.link = { ...DEFAULT_LINK, ...link };
    this.drops = drops.map((d) => ({ n: 1, ...d, seen: 0 }));
    this.rand = mulberry32(seed);
    this.maxTime = maxTime;
    this.now = 0;
    this.q = new Queue();
    this.seq = 0;
    this.handlers = new Map();
    this.timers = new Map();
    this.busyUntil = new Map(); // "from>to" → time the sender's link is free
    this.lastArrive = new Map(); // "from>to" → latest in-order arrival on that hop
    this.packets = [];
    this.notes = [];
    this.deliveries = [];
    this.series = {};
    this.marks = [];
    this.truncated = false;
  }

  addr(node) { return ADDRESSES[node] || "10.0.0." + (this.nodes.indexOf(node) + 1); }
  mac(node) { return MACS[node] || "02:00:00:00:00:" + String(this.nodes.indexOf(node) + 1).padStart(2, "0"); }
  isRouter(node) { return !this.lan && node !== this.nodes[0] && node !== this.nodes[this.nodes.length - 1]; }
  hops() { return this.lan ? 1 : this.nodes.length - 1; }
  /** NAT: is this node on the private side of the NAT router? */
  inside(node) { return !!this.nat && this.nodes.indexOf(node) < this.nodes.indexOf(this.nat.router); }

  /** Register the packet handler for an endpoint: fn(pkt). */
  on(node, fn) { this.handlers.set(node, fn); }

  schedule(t, fn, rec) { this.q.push({ t, seq: this.seq++, fn, rec }); }

  /** Run fn after ms. Returns an id for cancel(). `label` shows up in the trace. */
  timer(node, ms, fn, label = "") {
    const id = this.seq + 1;
    const rec = { id, node, label, at: this.now + ms, live: true };
    this.timers.set(id, rec);
    this.schedule(this.now + ms, () => {
      if (!rec.live) return;
      rec.live = false;
      this.timers.delete(id);
      fn();
    }, rec);
    return id;
  }
  cancel(id) {
    const rec = this.timers.get(id);
    if (rec) { rec.live = false; this.timers.delete(id); }
  }

  /** Annotate a node's timeline at the current time (e.g. "RTO fired", "cwnd 4 → 8"). */
  note(node, text, kind = "info") { this.notes.push({ t: this.now, node, text, kind }); }
  /** Record that the application on `node` received data (used for latency metrics and HOL demos). */
  deliver(node, info = {}) { this.deliveries.push({ t: this.now, node, ...info }); }
  /** Append a point to a named time series (e.g. cwnd). */
  metric(name, value) { (this.series[name] ||= []).push({ t: this.now, v: value }); }
  /** A named instant, e.g. "first byte", shown as a horizontal marker. */
  mark(label, node) { this.marks.push({ t: this.now, label, node }); }

  /**
   * Send a packet from an endpoint (or router) toward `to`.
   * pkt: { from, to, kind, label, size, headers, payload?, stream?, retx?, color? }
   * Returns the stored packet record.
   */
  send(pkt) {
    const p = {
      no: this.packets.length + 1,
      size: 64, headers: {}, retx: false,
      ...pkt,
      t: this.now, hops: [], lost: false,
    };
    if (p.headers.ip) {
      p.headers.ip = { ttl: 64, id: 0x1c46 + p.no, src: this.addr(p.from), dst: p.to === "broadcast" ? "255.255.255.255" : this.addr(p.to), ...p.headers.ip };
    }
    // Seen from outside, an inside host only exists as the NAT's public address and mapped port.
    if (this.nat && p.headers.ip && !this.inside(p.from) && this.inside(p.to) && p.from !== this.nat.router) this.natOutsideView(p);
    this.packets.push(p);
    if (this.packets.length > 4000) { this.truncated = true; return p; }
    const doomed = this.shouldDrop(p);
    if (p.to === "broadcast") { this.broadcast(p, doomed); return p; }
    this.forward(p, p.from, doomed);
    return p;
  }

  // LAN broadcast: one frame, heard by every other node on the segment.
  broadcast(p, doomed) {
    p.broadcast = true;
    const jitter = this.link.jitter > 0 ? this.rand() * this.link.jitter : 0;
    const arrive = this.now + this.link.latency + jitter;
    for (const node of this.nodes) {
      if (node === p.from) continue;
      if (doomed) {
        p.lost = true;
        p.hops.push({ from: p.from, to: node, t0: this.now, t1: this.now + this.link.latency / 2, lost: true });
        continue;
      }
      p.hops.push({ from: p.from, to: node, t0: this.now, t1: arrive });
      this.schedule(arrive, () => {
        this.now = Math.max(this.now, arrive);
        p.arrived ??= this.now;
        const h = this.handlers.get(node);
        if (h) h(p, node);
      });
    }
  }

  /* ── NAT ── */
  l4(p) {
    if (p.headers.tcp) return { key: "tcp", h: p.headers.tcp };
    if (p.headers.udp) return { key: "udp", h: p.headers.udp };
    return null;
  }
  natOutsideView(p) {
    p.headers.ip = { ...p.headers.ip, dst: this.nat.publicIp };
    const l = this.l4(p);
    if (!l) return;
    const m = this.natMap.find((e) => e.proto === l.key && e.privPort === l.h.dstPort && e.privIp === this.addr(p.to));
    const rule = this.nat.forward.find((r) => (r.proto || "tcp") === l.key && r.toPort === l.h.dstPort);
    const pub = m ? m.pubPort : rule ? rule.port : null;
    if (pub != null) p.headers[l.key] = { ...l.h, dstPort: pub };
  }
  natTranslate(p, node) {
    const l = this.l4(p);
    const ip = p.headers.ip;
    if (this.inside(p.from) && !this.inside(p.to)) {
      // Outbound: rewrite the private source to the public address, creating a mapping if needed.
      if (!l) { p.headers = { ...p.headers, ip: { ...ip, src: this.nat.publicIp } }; return true; }
      let m = this.natMap.find((e) => e.proto === l.key && e.privIp === ip.src && e.privPort === l.h.srcPort);
      // Replies from a port-forwarded service leave from the forwarded public port, not a new mapping.
      const fwd = !m && this.nat.forward.find((r) => (r.proto || "tcp") === l.key && r.toPort === l.h.srcPort);
      if (fwd) {
        p.nat = { dir: "out", before: `${ip.src}:${l.h.srcPort}`, after: `${this.nat.publicIp}:${fwd.port}`, forwarded: true };
        p.headers = { ...p.headers, ip: { ...ip, src: this.nat.publicIp }, [l.key]: { ...l.h, srcPort: fwd.port } };
        return true;
      }
      if (!m) {
        m = { proto: l.key, privIp: ip.src, privPort: l.h.srcPort, pubPort: 40001 + this.natMap.length, remoteIp: ip.dst };
        this.natMap.push(m);
        this.note(node, `NAT: ${ip.src}:${l.h.srcPort} → ${this.nat.publicIp}:${m.pubPort}`, "info");
      }
      p.nat = { dir: "out", before: `${ip.src}:${l.h.srcPort}`, after: `${this.nat.publicIp}:${m.pubPort}` };
      p.headers = { ...p.headers, ip: { ...ip, src: this.nat.publicIp }, [l.key]: { ...l.h, srcPort: m.pubPort } };
      return true;
    }
    if (!this.inside(p.from) && this.inside(p.to)) {
      // Inbound: only traffic matching an existing mapping (or a port-forward rule) gets in.
      const priv = this.addr(p.to);
      if (!l) { p.headers = { ...p.headers, ip: { ...ip, dst: priv } }; return true; }
      const m = this.natMap.find((e) => e.proto === l.key && e.pubPort === l.h.dstPort && e.remoteIp === ip.src);
      const rule = this.nat.forward.find((r) => (r.proto || "tcp") === l.key && r.port === l.h.dstPort);
      if (!m && !rule) {
        p.lost = true;
        p.blocked = node;
        p.hops[p.hops.length - 1].blocked = true;
        this.note(node, `Dropped: no NAT mapping for ${l.key.toUpperCase()} :${l.h.dstPort}`, "loss");
        return false;
      }
      const privPort = m ? m.privPort : rule.toPort;
      p.nat = { dir: "in", before: `${ip.dst}:${l.h.dstPort}`, after: `${priv}:${privPort}`, forwarded: !m };
      p.headers = { ...p.headers, ip: { ...ip, dst: priv }, [l.key]: { ...l.h, dstPort: privPort } };
      return true;
    }
    return true;
  }

  shouldDrop(p) {
    // Every matching rule counts the packet, so rules stay independent ("drop the 2nd and the 3rd").
    let hit = false;
    for (const d of this.drops) {
      if (d.kind && d.kind !== p.kind) continue;
      if (d.label && d.label !== p.label) continue;
      if (d.from && d.from !== p.from) continue;
      if (d.to && d.to !== p.to) continue;
      if (d.stream !== undefined && d.stream !== p.stream) continue;
      if (!d.retx && p.retx) continue;
      d.seen++;
      if (d.seen === d.n) hit = true;
    }
    if (hit) { p.scripted = true; return true; }
    return this.link.loss > 0 && this.rand() < this.link.loss;
  }

  // Move p one hop from `at` toward its destination.
  forward(p, at, doomed) {
    const i = this.nodes.indexOf(at), j = this.nodes.indexOf(p.to);
    const next = this.lan ? p.to : this.nodes[i + Math.sign(j - i)];
    const hopLatency = this.link.latency / this.hops();
    // Serialisation (bandwidth) applies at the first hop only: the access link is the bottleneck.
    let start = this.now;
    if (at === p.from && this.link.bandwidth > 0) {
      const key = at + ">" + next;
      start = Math.max(this.now, this.busyUntil.get(key) || 0);
      const done = start + p.size / this.link.bandwidth;
      this.busyUntil.set(key, done);
      start = done;
    }
    const jitter = this.link.jitter > 0 ? this.rand() * this.link.jitter / this.hops() : 0;
    let arrive = start + hopLatency + jitter;
    // Jitter is queueing delay, so packets on the same hop stay in FIFO order —
    // unless `reorder` sends this one down a slower path (real reordering is rarer).
    const fifoKey = at + ">" + next;
    if (this.link.reorder > 0 && this.rand() < this.link.reorder) {
      arrive += hopLatency * 0.5 + 5;
      p.reordered = true;
    } else {
      arrive = Math.max(arrive, this.lastArrive.get(fifoKey) || 0); // ties keep send order via the queue's sequence numbers
      this.lastArrive.set(fifoKey, arrive);
    }
    // A doomed packet is lost on a random hop (always the first for a direct link).
    const loseHere = doomed && (this.hops() === 1 || this.rand() < 1 / Math.max(1, Math.abs(j - i)));
    if (loseHere) {
      p.lost = true;
      p.hops.push({ from: at, to: next, t0: this.now, t1: start + hopLatency / 2, lost: true });
      return;
    }
    const hop = { from: at, to: next, t0: this.now, t1: arrive };
    p.hops.push(hop);
    this.schedule(arrive, () => this.arrive(p, next, doomed));
  }

  arrive(p, node, doomed) {
    this.now = Math.max(this.now, p.hops[p.hops.length - 1].t1);
    if (node !== p.to) {
      if (this.nat && node === this.nat.router && p.headers.ip && !this.natTranslate(p, node)) return;
      // Router: decrement TTL; at zero, discard and report back with ICMP Time Exceeded.
      if (p.headers.ip) {
        if (p.headers.ip.ttl <= 1) {
          p.expired = node;
          p.headers = { ...p.headers, ip: { ...p.headers.ip, ttl: 0 } };
          this.send({
            from: node, to: p.from, kind: "TIME-EXCEEDED", label: "ICMP Time Exceeded", size: 56,
            headers: { ip: { proto: 1 }, icmp: { type: 11, code: 0, about: p.no } },
          });
          return;
        }
        p.headers = { ...p.headers, ip: { ...p.headers.ip, ttl: p.headers.ip.ttl - 1 } };
      }
      this.forward(p, node, doomed);
      return;
    }
    p.arrived = this.now;
    const h = this.handlers.get(node);
    if (h) h(p);
  }

  /** Process events until nothing is left (or maxTime). Returns the trace. */
  run() {
    let guard = 0;
    while (this.q.size) {
      const e = this.q.pop();
      if (e.rec && !e.rec.live) continue; // cancelled timer: must not advance the clock or extend the trace
      if (e.t > this.maxTime) { this.truncated = true; break; }
      this.now = e.t;
      e.fn();
      if (++guard > 50000) { this.truncated = true; break; }
    }
    const end = Math.max(this.now, ...this.packets.flatMap((p) => p.hops.map((h) => h.t1)), 0);
    return {
      nodes: this.nodes, link: this.link, duration: end, lan: this.lan, nat: this.nat,
      packets: this.packets, notes: this.notes, deliveries: this.deliveries,
      series: this.series, marks: this.marks, truncated: this.truncated,
    };
  }
}

/** Convenience: build a Sim, let a stack set it up, run it, attach the stack's summary. */
export function simulate(stack, { link, drops, seed, options = {}, nodes } = {}) {
  const opts = { ...Object.fromEntries((stack.options || []).map((o) => [o.key, o.default])), ...options };
  const pick = (v) => (typeof v === "function" ? v(opts) : v);
  const sim = new Sim({
    nodes: nodes || (stack.nodes ? stack.nodes(opts) : ["client", "server"]), link, drops, seed,
    lan: !!pick(stack.lan), nat: pick(stack.nat) || null,
  });
  const api = stack.setup(sim, opts) || {};
  const trace = sim.run();
  trace.labels = pick(stack.labels) || {};
  trace.stack = stack.id;
  trace.options = opts;
  trace.summary = { ...baseSummary(trace), ...(api.summary ? api.summary(trace) : {}) };
  return trace;
}

function baseSummary(trace) {
  const sent = trace.packets.length;
  const lost = trace.packets.filter((p) => p.lost).length;
  const retx = trace.packets.filter((p) => p.retx).length;
  const bytes = trace.packets.reduce((s, p) => s + (p.size || 0), 0);
  const appBytes = trace.deliveries.reduce((s, d) => s + (d.bytes || 0), 0);
  const first = trace.deliveries.find((d) => d.node === "client" && d.bytes) || trace.deliveries[0];
  const last = trace.deliveries[trace.deliveries.length - 1];
  return {
    packets: sent, lost, retransmissions: retx, bytesOnWire: bytes, appBytes,
    firstData: first ? first.t : null, done: last ? last.t : null,
  };
}
