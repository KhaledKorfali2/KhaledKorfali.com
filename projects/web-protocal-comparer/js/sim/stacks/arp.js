// ARP (RFC 826) on one Ethernet segment: the client wants to ping a neighbour
// whose IP it knows but whose MAC address it doesn't.
//
// IP can't put a packet on Ethernet without the next hop's MAC, so with an
// empty cache the client broadcasts "Who has 192.168.1.1? Tell 192.168.1.20"
// to ff:ff:ff:ff:ff:ff. Every station on the segment receives that frame; only
// the owner of the IP answers, by unicast, and (RFC 826 "merge") also learns
// the asker's mapping from the request, so its Echo Reply needs no ARP of its
// own. Then the ping can go out. Unanswered requests are retried once per
// second, 3 requests in all (Linux mcast_solicit = 3), before the stack gives
// up with "Destination Host Unreachable".
// A gratuitous ARP (RFC 5227 §2.4 announcement: a request whose sender and
// target IP are both the client's own) tells everyone "192.168.1.20 is at …".

const ETH_ARP = 0x0806, ETH_IP = 0x0800;
const ZERO_MAC = "00:00:00:00:00:00";
const ARP_SIZE = 42;          // Ethernet 14 + ARP 28 (the NIC pads to the 60-byte minimum)
const PING_SIZE = 98;         // Ethernet 14 + IP 20 + ICMP 8 + 56 data
const ARP_RETRY = 1000;       // Linux retrans_time: 1 s between ARP requests
const ARP_TRIES = 3;          // Linux mcast_solicit: 3 broadcast requests, then give up
const PING_TRIES = 3;         // one Echo Request per second until one is answered
const PING_ID = 0x4d2;
const NAMES = { gateway: "Gateway router", printer: "Printer", client: "Laptop" };

const fmt = (ms) => (Math.round(ms * 10) / 10).toString();

export default {
  id: "arp",
  name: "ARP",
  short: "How a host finds a neighbour's MAC address: broadcast question, unicast answer, cache.",
  layers: ["Ethernet", "ARP", "IPv4", "ICMP"],
  options: [
    { key: "target", label: "Ping target", type: "select", default: "gateway",
      choices: [["gateway", "Gateway 192.168.1.1"], ["printer", "Printer 192.168.1.30"]],
      hint: "The client knows the IP address; ARP finds the matching MAC address on the LAN." },
    { key: "cached", label: "MAC already in ARP cache", type: "bool", default: false,
      hint: "With a cache hit the ping goes out at once — no broadcast needed." },
    { key: "gratuitous", label: "Gratuitous ARP first", type: "bool", default: false,
      hint: "The client first announces its own IP→MAC mapping to the whole segment (e.g. after joining the network)." },
  ],
  lan: true,
  nodes() { return ["client", "printer", "gateway"]; },
  labels: { client: "Laptop", printer: "Printer", gateway: "Gateway router" },

  setup(sim, opts) {
    const target = opts.target === "printer" ? "printer" : "gateway";
    const cached = !!opts.cached, gratuitous = !!opts.gratuitous;
    const myIp = sim.addr("client"), myMac = sim.mac("client");
    const tIp = sim.addr(target), tMac = sim.mac(target);
    const res = { resolvedMs: cached ? 0 : null, arpRequests: 0, pingRttMs: null, echoes: 0, failed: false, mac: cached ? tMac : null };
    const cache = new Map(); // per node: ip → mac
    for (const n of sim.nodes) cache.set(n, new Map());
    if (cached) { cache.get("client").set(tIp, tMac); cache.get(target).set(myIp, myMac); }
    let arpTimer = null, pingTimer = null, pingSent = new Map(), pinging = false, done = false;

    const arpFrame = (o) => sim.send({
      from: o.from, to: o.to, kind: o.op === 1 ? "ARP-REQUEST" : "ARP-REPLY", label: o.label, size: ARP_SIZE, retx: !!o.retx,
      headers: {
        eth: { src: sim.mac(o.from), dst: o.to === "broadcast" ? sim.mac("broadcast") : sim.mac(o.to), type: ETH_ARP },
        arp: { op: o.op, sha: o.sha, spa: o.spa, tha: o.tha, tpa: o.tpa },
      },
      payload: o.payload,
    });

    // Every station runs the same receive logic (RFC 826): merge the sender if already known,
    // answer only requests for its own address, ignore everything else.
    const arpReceive = (p, node) => {
      const a = p.headers.arp, mine = sim.addr(node), table = cache.get(node);
      const known = table.has(a.spa) && a.spa !== "0.0.0.0";
      if (known) table.set(a.spa, a.sha);
      if (a.op === 1 && a.tpa === mine && a.spa !== a.tpa) {
        table.set(a.spa, a.sha);
        sim.note(node, `that's my IP → learn ${a.spa} is at ${a.sha}, reply by unicast`, "info");
        arpFrame({
          from: node, to: "client", op: 2, label: `${mine} is at ${sim.mac(node)}`,
          sha: sim.mac(node), spa: mine, tha: a.sha, tpa: a.spa,
          payload: `ARP reply: ${mine} is at ${sim.mac(node)}`,
        });
      } else if (a.op === 1 && a.spa === a.tpa) {
        sim.note(node, `gratuitous ARP heard: ${known ? "refreshed" : "no entry for"} ${a.spa}${known ? "" : " — not added (Linux default)"}`, "info");
      } else if (a.op === 1) {
        sim.note(node, `heard broadcast "who has ${a.tpa}?" — not my IP (${mine}), ignored`, "info");
      }
    };

    const ping = () => {
      if (done) return;
      pinging = true;
      const seq = pingSent.size + 1;
      pingSent.set(seq, sim.now);
      res.echoes = seq;
      sim.send({
        from: "client", to: target, kind: "ECHO", label: `Echo Request seq ${seq}`, size: PING_SIZE,
        headers: { eth: { src: myMac, dst: cache.get("client").get(tIp), type: ETH_IP },
          ip: { proto: 1 }, icmp: { type: 8, code: 0, id: PING_ID, seq } },
        payload: "56 bytes of timestamp + pattern data",
      });
      pingTimer = sim.timer("client", 1000, () => {
        pingTimer = null;
        if (seq < PING_TRIES) ping();
        else { done = true; sim.note("client", `--- ${PING_TRIES} transmitted, 0 received, 100% loss`, "loss"); }
      }, "ping interval");
    };

    const arpRequest = () => {
      res.arpRequests++;
      const retx = res.arpRequests > 1;
      if (retx) sim.note("client", `no ARP reply in 1 s → ask again (${res.arpRequests}/${ARP_TRIES})`, "retx");
      arpFrame({
        from: "client", to: "broadcast", op: 1, retx,
        label: `Who has ${tIp}? Tell ${myIp}` + (retx ? " (retx)" : ""),
        sha: myMac, spa: myIp, tha: ZERO_MAC, tpa: tIp,
        payload: `ARP request: who has ${tIp}? Tell ${myIp}`,
      });
      arpTimer = sim.timer("client", ARP_RETRY, () => {
        arpTimer = null;
        if (res.arpRequests < ARP_TRIES) { arpRequest(); return; }
        res.failed = true; done = true;
        sim.note("client", `no ARP reply after ${ARP_TRIES} requests → ping: From ${myIp} icmp_seq=1 Destination Host Unreachable`, "loss");
      }, "ARP retry");
    };

    sim.on("client", (p) => {
      if (p.kind === "ARP-REPLY") {
        const a = p.headers.arp;
        if (a.spa !== tIp) return;
        if (res.resolvedMs !== null) { sim.note("client", "duplicate ARP reply — cache already up to date", "info"); return; }
        if (arpTimer) { sim.cancel(arpTimer); arpTimer = null; }
        if (done) return;
        cache.get("client").set(a.spa, a.sha);
        res.resolvedMs = sim.now; res.mac = a.sha;
        sim.mark("MAC resolved", "client");
        sim.note("client", `ARP cache: ${a.spa} → ${a.sha} (in ${fmt(sim.now - startedAt)} ms) — now the ping can go out`, "good");
        ping();
        return;
      }
      if (p.kind === "ARP-REQUEST") { arpReceive(p, "client"); return; }
      if (p.kind === "ECHO-REPLY") {
        const seq = p.headers.icmp.seq;
        if (!pingSent.has(seq) || res.pingRttMs !== null) return;
        if (pingTimer) { sim.cancel(pingTimer); pingTimer = null; }
        done = true;
        res.pingRttMs = sim.now - pingSent.get(seq);
        sim.deliver("client", { label: `Echo Reply seq ${seq}`, bytes: 56 });
        sim.note("client", `64 bytes from ${tIp}: icmp_seq=${seq} time=${fmt(res.pingRttMs)} ms`, "good");
      }
    });
    for (const node of ["printer", "gateway"]) {
      sim.on(node, (p, at = node) => {
        if (p.headers.arp) { arpReceive(p, at); return; }
        if (p.kind === "ECHO" && at === target) {
          const mac = cache.get(at).get(myIp) || p.headers.eth.src; // learned from the ARP request
          sim.send({
            from: at, to: "client", kind: "ECHO-REPLY", label: `Echo Reply seq ${p.headers.icmp.seq}`, size: PING_SIZE,
            headers: { eth: { src: sim.mac(at), dst: mac, type: ETH_IP },
              ip: { proto: 1 }, icmp: { type: 0, code: 0, id: p.headers.icmp.id, seq: p.headers.icmp.seq } },
            payload: p.payload,
          });
        }
      });
    }

    let startedAt = 0;
    const start = () => {
      startedAt = sim.now;
      sim.note("client", `ping ${tIp} (${NAMES[target]}): need its MAC address first`, "info");
      if (cache.get("client").has(tIp)) {
        sim.note("client", `ARP cache hit: ${tIp} → ${tMac} — no broadcast needed`, "good");
        ping();
      } else {
        sim.note("client", `ARP cache miss for ${tIp} → broadcast a request`, "info");
        arpRequest();
      }
    };

    if (gratuitous) {
      sim.note("client", `joined the network: announce ${myIp} is at ${myMac} (gratuitous ARP)`, "info");
      arpFrame({
        from: "client", to: "broadcast", op: 1, label: `Gratuitous ARP: ${myIp} is at ${myMac}`,
        sha: myMac, spa: myIp, tha: ZERO_MAC, tpa: myIp,
        payload: `ARP announcement: ${myIp} is at ${myMac}`,
      });
      sim.timer("client", Math.max(20, 2 * sim.link.latency), start, "start ping");
    } else start();

    return {
      summary() {
        return {
          target, cacheHit: cached, arpRequests: res.arpRequests, resolvedMs: res.resolvedMs, mac: res.mac,
          echoes: res.echoes, pingRttMs: res.pingRttMs, failed: res.failed || res.pingRttMs === null,
        };
      },
    };
  },
};
