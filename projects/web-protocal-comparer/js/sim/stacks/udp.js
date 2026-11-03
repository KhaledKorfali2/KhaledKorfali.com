// UDP: fire-and-forget datagrams.
//
// UDP adds only ports, a length and a checksum to IP — no sequence numbers,
// no acknowledgements, no retransmission, no ordering. To *see* loss and
// reordering, this demo app (think game state or telemetry) writes its own
// message counter into each payload; the receiving app compares counters.
// That counter is application data, not part of the UDP header.

const SRC_PORT = 50514;
const DST_PORT = 9000;
const IDLE_REPORT = 1000; // receiver reports gaps after this long without traffic

export default {
  id: "udp",
  name: "UDP",
  short: "Datagrams with no handshake, no ordering and no retransmission.",
  layers: ["IPv4", "UDP"],
  options: [
    { key: "count", label: "Datagrams", type: "number", default: 8, min: 1, max: 20, step: 1 },
    { key: "interval", label: "Send interval (ms)", type: "number", default: 20, min: 0, max: 200, step: 5,
      hint: "0 sends them back-to-back." },
    { key: "size", label: "Payload size (B)", type: "number", default: 500, min: 50, max: 1400, step: 50,
      hint: "Application bytes; 28 B of UDP + IP headers are added on the wire." },
  ],

  setup(sim, opts) {
    const count = clamp(opts.count, 1, 20), interval = clamp(opts.interval, 0, 200), size = clamp(opts.size, 50, 1400);
    const got = [];         // app counters in arrival order
    let highest = 0, reordered = 0, idle = null;

    sim.note("client", "UDP has no sequence numbers — the app puts its own counter (msg #n) in each payload", "info");
    for (let i = 1; i <= count; i++) {
      sim.timer("client", (i - 1) * interval, () => {
        sim.send({
          from: "client", to: "server", kind: "DGRAM", label: `msg #${i} (${size} B)`, size: size + 28, stream: i,
          headers: { ip: { proto: 17 }, udp: { srcPort: SRC_PORT, dstPort: DST_PORT, length: size + 8 } },
          payload: `app counter=${i} | ${size - 12} B of game state`,
        });
      }, "send interval");
    }

    sim.on("server", (p) => {
      if (p.kind !== "DGRAM") return;
      const n = p.stream;
      got.push(n);
      sim.deliver("server", { stream: n, label: `msg #${n}`, bytes: size });
      if (n < highest) {
        reordered++;
        sim.note("server", `app sees #${n} after #${highest} — out of order; UDP delivers in arrival order`, "warn");
      } else {
        if (n > highest + 1) {
          const gap = range(highest + 1, n - 1).filter((k) => !got.includes(k));
          if (gap.length) sim.note("server", `app skipped ${gap.map((k) => "#" + k).join(", ")} — late or lost? UDP can't say`, "warn");
        }
        highest = n;
      }
      if (idle) sim.cancel(idle);
      idle = sim.timer("server", IDLE_REPORT, report, "idle report");
    });

    function report() {
      idle = null;
      const missing = range(1, count).filter((k) => !got.includes(k));
      if (missing.length) {
        sim.note("server", `missing for good: ${missing.map((k) => "#" + k).join(", ")} — nobody retransmits them`, "loss");
      } else {
        sim.note("server", `all ${count} messages arrived` + (reordered ? ` (${reordered} out of order)` : ""), "good");
      }
    }

    return {
      summary() {
        return { sent: count, received: got.length, lost: count - got.length, reordered, arrivalOrder: got.slice() };
      },
    };
  },
};

function clamp(v, lo, hi) { v = Number(v); return Math.max(lo, Math.min(hi, Number.isFinite(v) ? Math.round(v) : lo)); }
function range(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }
