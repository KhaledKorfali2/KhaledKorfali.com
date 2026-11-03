// DNS over UDP: a stub resolver (the client's OS) asks a recursive resolver
// for an A record. One query datagram, one response datagram — no handshake.
// Because UDP never retransmits, the stub keeps its own timer and re-sends the
// query (same transaction ID, like glibc) when no answer arrives in time.
// The resolver here answers from its cache; a cache miss would add the
// resolver's own round trips to root / TLD / authoritative servers.

const NAMES = {
  "example.com": ["93.184.216.34"],
  "wikipedia.org": ["185.15.59.224"],
  "github.com": ["140.82.112.4"],
  "no-such-host.example": null, // → NXDOMAIN
};
const TTL = 3600;

export default {
  id: "dns",
  name: "DNS",
  short: "Name lookup over UDP port 53, with timeout and retry.",
  layers: ["IPv4", "UDP", "DNS"],
  options: [
    { key: "timeout", label: "Timeout per attempt (ms)", type: "number", default: 600, min: 100, max: 3000, step: 100,
      hint: "How long the stub waits for an answer before re-sending the query." },
    { key: "retries", label: "Retries", type: "number", default: 2, min: 0, max: 4, step: 1 },
    { key: "name", label: "Name to look up", type: "select", default: "example.com",
      choices: Object.keys(NAMES).map((n) => [n, n]) },
  ],
  nodes() { return ["client", "resolver"]; },

  setup(sim, opts) {
    const timeout = clamp(opts.timeout, 100, 3000), retries = clamp(opts.retries, 0, 4);
    const qname = opts.name in NAMES ? opts.name : "example.com";
    const answers = NAMES[qname];
    const id = Math.floor(sim.rand() * 0x10000);
    const port = 49152 + Math.floor(sim.rand() * 16384);
    const qsize = 20 + 8 + 12 + wireName(qname) + 4 + 11; // IP + UDP + DNS header + question + EDNS OPT
    const hex = "0x" + id.toString(16).padStart(4, "0");
    let attempts = 0, timer = null, resolvedAt = null, failed = false, rcode = null, result = null;

    const sendQuery = () => {
      attempts++;
      const retx = attempts > 1;
      sim.send({
        from: "client", to: "resolver", kind: "QUERY", label: `A? ${qname}` + (retx ? " (retx)" : ""), size: qsize, retx,
        headers: { ip: { proto: 17 }, udp: { srcPort: port, dstPort: 53 },
          dns: { id, qr: 0, rd: 1, qname, qtype: "A", answers: [], rcode: 0 } },
        payload: `id=${hex} QUERY rd=1 · ${qname} IN A`,
      });
      timer = sim.timer("client", timeout, () => {
        timer = null;
        if (attempts <= retries) {
          sim.note("client", `no answer in ${timeout} ms — retry ${attempts}/${retries}, same id ${hex}`, "retx");
          sendQuery();
        } else {
          failed = true;
          sim.note("client", `no answer after ${attempts} attempt${attempts > 1 ? "s" : ""} — lookup fails (SERVFAIL/timeout)`, "loss");
        }
      }, "DNS timeout");
    };

    // Resolver: answer every query (from cache), echoing the transaction id.
    sim.on("resolver", (p) => {
      if (p.kind !== "QUERY") return;
      const q = p.headers.dns;
      const ok = answers !== null;
      sim.send({
        from: "resolver", to: "client", kind: "RESPONSE",
        label: ok ? `A ${answers[0]}` : "NXDOMAIN",
        size: qsize + (ok ? 16 * answers.length : 0),
        headers: { ip: { proto: 17 }, udp: { srcPort: 53, dstPort: p.headers.udp.srcPort },
          dns: { id: q.id, qr: 1, rd: 1, ra: 1, qname: q.qname, qtype: "A", answers: ok ? answers.slice() : [], rcode: ok ? 0 : 3, ttl: ok ? TTL : undefined } },
        payload: `id=${hex} RESPONSE ` + (ok ? `${qname} ${TTL} IN A ${answers.join(", ")}` : `NXDOMAIN — ${qname} does not exist`),
      });
    });

    sim.on("client", (p) => {
      if (p.kind !== "RESPONSE" || p.headers.dns.id !== id) return;
      if (resolvedAt !== null || failed) {
        sim.note("client", failed ? "late answer ignored — lookup already failed" : "duplicate answer ignored (already resolved)", "info");
        return;
      }
      if (timer) sim.cancel(timer);
      resolvedAt = sim.now;
      rcode = p.headers.dns.rcode;
      result = p.headers.dns.answers;
      sim.deliver("client", { label: rcode ? "NXDOMAIN" : `${qname} → ${result[0]}`, bytes: p.size - 28 });
      sim.mark(rcode ? "NXDOMAIN" : "resolved", "client");
      sim.note("client", rcode ? `${qname}: NXDOMAIN (name does not exist) after ${fmt(sim.now)} ms`
        : `${qname} → ${result.join(", ")} in ${fmt(sim.now)} ms (${attempts} attempt${attempts > 1 ? "s" : ""})`, rcode ? "warn" : "good");
    });

    sendQuery();
    return {
      summary() {
        return { resolvedMs: resolvedAt, failed: resolvedAt === null, attempts, rcode, answer: result ? result[0] || null : null, id };
      },
    };
  },
};

function wireName(name) { return name.split(".").reduce((n, l) => n + 1 + l.length, 1); }
function fmt(ms) { return Math.round(ms); }
function clamp(v, lo, hi) { v = Number(v); return Math.max(lo, Math.min(hi, Number.isFinite(v) ? Math.round(v) : lo)); }
