// IP + ICMP: ping (Echo Request / Echo Reply) and traceroute.
//
// Routers between client and server are real hops in the engine: each one
// decrements the IP TTL and, when it would reach zero, discards the packet and
// sends an ICMP Time Exceeded (type 11) back to the source. traceroute exploits
// exactly that: probes with TTL 1, 2, 3 … make each router on the path reveal
// itself, until a probe finally reaches the destination and gets an Echo Reply.
// (This is ICMP traceroute, like Windows `tracert` or `traceroute -I`; classic
// Unix traceroute sends UDP probes to high ports instead.)

const PING_ID = 0x4d2;        // ICMP identifier (ping uses its process id)
const PING_SIZE = 84;         // 20 IP + 8 ICMP + 56 data bytes (Linux default)
const PING_INTERVAL = 1000;   // ping sends one request per second
const PING_LINGER = 2000;     // how long ping waits for the last reply
const TR_SIZE = 60;           // traceroute -I default packet length
const TR_WAIT = 2000;         // per-probe wait (real traceroute: up to 5 s)
const TR_MAX_HOPS = 12;       // real default is 30; kept small so the sim stays short

const fmt = (ms) => ms.toFixed(1);

export default {
  id: "ip",
  name: "IP & ICMP",
  short: "Ping and traceroute: TTL, router hops and ICMP messages.",
  layers: ["IPv4", "ICMP"],
  options: [
    { key: "mode", label: "Tool", type: "select", default: "ping",
      choices: [["ping", "ping"], ["traceroute", "traceroute"]],
      hint: "ping measures round-trip time; traceroute reveals each router on the path." },
    { key: "routers", label: "Routers on the path", type: "number", default: 3, min: 1, max: 4, step: 1 },
    { key: "ttl", label: "Initial TTL (ping)", type: "number", default: 64, min: 1, max: 64, step: 1,
      hint: "Each router decrements TTL; at zero the packet is discarded and ICMP Time Exceeded comes back." },
    { key: "count", label: "Echo requests (ping)", type: "number", default: 2, min: 1, max: 4, step: 1 },
  ],

  nodes(opts) {
    const n = Math.max(1, Math.min(4, opts.routers | 0 || 1));
    return ["client", ...Array.from({ length: n }, (_, i) => "r" + (i + 1)), "server"];
  },

  setup(sim, opts) {
    const nameOf = (addr) => sim.nodes.find((n) => sim.addr(n) === addr) || "?";
    // Server: answer every Echo Request with an Echo Reply carrying the same id/seq/data.
    sim.on("server", (p) => {
      if (p.kind !== "ECHO") return;
      const { id, seq } = p.headers.icmp;
      sim.send({
        from: "server", to: "client", kind: "ECHO-REPLY", label: `Echo Reply seq ${seq}`, size: p.size,
        headers: { ip: { proto: 1, ttl: 64 }, icmp: { type: 0, code: 0, id, seq } }, payload: p.payload,
      });
    });
    return opts.mode === "traceroute" ? traceroute(sim, opts, nameOf) : ping(sim, opts, nameOf);
  },
};

function ping(sim, opts, nameOf) {
  const count = Math.max(1, Math.min(4, opts.count | 0 || 1));
  const ttl = Math.max(1, Math.min(64, opts.ttl | 0 || 64));
  const sent = new Map();     // seq → send time
  const byPacket = new Map(); // packet no → seq (to match Time Exceeded to its probe)
  const rtts = [];
  let errors = 0, finished = false, lingerTimer = null;
  const dst = sim.addr("server");

  const finish = () => {
    if (finished) return;
    finished = true;
    if (lingerTimer) sim.cancel(lingerTimer);
    const loss = Math.round(100 * (1 - rtts.length / count));
    let text = `--- ${count} transmitted, ${rtts.length} received` + (errors ? `, +${errors} errors` : "") + `, ${loss}% loss`;
    if (rtts.length) {
      const avg = rtts.reduce((a, b) => a + b, 0) / rtts.length;
      text += ` · rtt min/avg/max ${fmt(Math.min(...rtts))}/${fmt(avg)}/${fmt(Math.max(...rtts))} ms`;
    }
    sim.note("client", text, rtts.length === count ? "good" : "warn");
  };
  const maybeDone = () => { if (sent.size === count && rtts.length + errors >= count) finish(); };

  sim.on("client", (p) => {
    if (finished) return;
    if (p.kind === "ECHO-REPLY") {
      const seq = p.headers.icmp.seq;
      if (!sent.has(seq)) return;
      const rtt = sim.now - sent.get(seq);
      rtts.push(rtt);
      sim.note("client", `64 bytes from ${dst}: icmp_seq=${seq} ttl=${p.headers.ip.ttl} time=${fmt(rtt)} ms`, "good");
      maybeDone();
    } else if (p.kind === "TIME-EXCEEDED") {
      const seq = byPacket.get(p.headers.icmp.about);
      if (seq === undefined) return;
      errors++;
      sim.note("client", `From ${p.headers.ip.src} (${nameOf(p.headers.ip.src)}) icmp_seq=${seq} Time to live exceeded`, "warn");
      maybeDone();
    }
  });

  if (ttl <= sim.nodes.length - 2) {
    sim.note("client", `TTL ${ttl} < ${sim.nodes.length - 1} hops: router r${ttl} will discard the request`, "info");
  }
  for (let i = 0; i < count; i++) {
    sim.timer("client", i * PING_INTERVAL, () => {
      const seq = i + 1;
      sent.set(seq, sim.now);
      const p = sim.send({
        from: "client", to: "server", kind: "ECHO", label: `Echo Request seq ${seq}`, size: PING_SIZE,
        headers: { ip: { proto: 1, ttl }, icmp: { type: 8, code: 0, id: PING_ID, seq } },
        payload: "56 bytes of timestamp + pattern data",
      });
      byPacket.set(p.no, seq);
      if (i === count - 1) lingerTimer = sim.timer("client", PING_LINGER, () => { lingerTimer = null; finish(); }, "ping linger");
    }, "ping interval");
  }

  return {
    summary() {
      const avg = rtts.length ? rtts.reduce((a, b) => a + b, 0) / rtts.length : null;
      return {
        transmitted: count, received: rtts.length, timeExceeded: errors,
        lossPct: Math.round(100 * (1 - rtts.length / count)),
        rttMin: rtts.length ? Math.min(...rtts) : null, rttAvg: avg, rttMax: rtts.length ? Math.max(...rtts) : null,
      };
    },
  };
}

function traceroute(sim, opts, nameOf) {
  const hops = [];   // { ttl, addr, node, rtt } — addr null for "*"
  let ttl = 0, probe = null, reached = false;
  sim.note("client", "traceroute (ICMP): one probe per TTL, waiting up to 2 s for each", "info");

  const next = () => {
    if (reached) return;
    if (ttl >= TR_MAX_HOPS) { sim.note("client", `max hops (${TR_MAX_HOPS}) reached without an answer`, "warn"); return; }
    ttl++;
    const t0 = sim.now, myTtl = ttl;
    const p = sim.send({
      from: "client", to: "server", kind: "ECHO", label: `Echo Request TTL ${myTtl}`, size: TR_SIZE,
      headers: { ip: { proto: 1, ttl: myTtl }, icmp: { type: 8, code: 0, id: PING_ID, seq: myTtl } },
      payload: "32 bytes of probe data",
    });
    probe = {
      ttl: myTtl, no: p.no, t0,
      timer: sim.timer("client", TR_WAIT, () => {
        hops.push({ ttl: myTtl, addr: null, node: null, rtt: null });
        sim.note("client", `${String(myTtl).padStart(2)}  *  (no reply)`, "loss");
        probe = null;
        next();
      }, "probe timeout"),
    };
  };

  sim.on("client", (p) => {
    if (!probe) return; // late answer to a probe we already gave up on
    let match = false, done = false;
    if (p.kind === "TIME-EXCEEDED" && p.headers.icmp.about === probe.no) match = true;
    if (p.kind === "ECHO-REPLY" && p.headers.icmp.seq === probe.ttl) { match = true; done = true; }
    if (!match) return;
    sim.cancel(probe.timer);
    const addr = p.headers.ip.src, rtt = sim.now - probe.t0;
    hops.push({ ttl: probe.ttl, addr, node: nameOf(addr), rtt });
    sim.note("client", `${String(probe.ttl).padStart(2)}  ${addr} (${nameOf(addr)})  ${fmt(rtt)} ms` + (done ? "  — destination reached" : ""), done ? "good" : "info");
    probe = null;
    if (done) { reached = true; sim.mark("destination reached", "client"); }
    else next();
  });

  next();
  return {
    summary() {
      return { hops, hopCount: hops.length, reached, routers: sim.nodes.length - 2 };
    },
  };
}
