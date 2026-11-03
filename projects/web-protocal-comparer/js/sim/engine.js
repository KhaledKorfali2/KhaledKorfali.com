// Discrete-event network simulator.
//
// A simulation is a line of nodes (endpoints at both ends, optional routers
// between). Protocol stacks register handlers on endpoints, send packets and
// set timers; the engine moves packets hop by hop with latency, jitter,
// serialisation delay (bandwidth), random or scripted loss, and TTL expiry at
// routers. run() returns a complete, deterministic trace that the UI replays.

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
  r2: "10.24.0.1",
  r3: "72.14.215.85",
  r4: "142.250.64.1",
};

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
   */
  constructor({ nodes = ["client", "server"], link = {}, drops = [], seed = 7, maxTime = 90000 } = {}) {
    this.nodes = nodes;
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
  isRouter(node) { return node !== this.nodes[0] && node !== this.nodes[this.nodes.length - 1]; }
  hops() { return this.nodes.length - 1; }

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
      p.headers.ip = { ttl: 64, id: 0x1c46 + p.no, src: this.addr(p.from), dst: this.addr(p.to), ...p.headers.ip };
    }
    this.packets.push(p);
    if (this.packets.length > 4000) { this.truncated = true; return p; }
    const doomed = this.shouldDrop(p);
    this.forward(p, p.from, doomed);
    return p;
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
    const next = this.nodes[i + Math.sign(j - i)];
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
      nodes: this.nodes, link: this.link, duration: end,
      packets: this.packets, notes: this.notes, deliveries: this.deliveries,
      series: this.series, marks: this.marks, truncated: this.truncated,
    };
  }
}

/** Convenience: build a Sim, let a stack set it up, run it, attach the stack's summary. */
export function simulate(stack, { link, drops, seed, options = {}, nodes } = {}) {
  const opts = { ...Object.fromEntries((stack.options || []).map((o) => [o.key, o.default])), ...options };
  const sim = new Sim({ nodes: nodes || (stack.nodes ? stack.nodes(opts) : ["client", "server"]), link, drops, seed });
  const api = stack.setup(sim, opts) || {};
  const trace = sim.run();
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
