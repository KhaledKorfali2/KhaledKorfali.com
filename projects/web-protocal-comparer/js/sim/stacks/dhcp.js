// DHCP (RFC 2131) on one Ethernet segment: how a new device gets an address.
//
// DORA — the client has no IP yet, so it talks from 0.0.0.0:68 to the
// broadcast address 255.255.255.255:67:
//   DISCOVER (broadcast) → OFFER (yiaddr + lease, mask, router, DNS)
//   → REQUEST (broadcast, naming the chosen server so any other server sees
//   its offer was declined) → ACK.
// The client sets the BOOTP broadcast flag (as Windows does), so the server
// broadcasts its OFFER and ACK too: the client can't receive unicast IP yet.
// Before using the address the client checks nobody else has it with an ARP
// probe (RFC 5227: sender IP 0.0.0.0, so no one's cache is polluted), then
// announces it. Renewal: at T1 (50 % of the lease) the client unicasts a
// REQUEST straight to its server, which unicasts the ACK.
// Retransmissions: 1 s, then doubling, ±100 ms, at most 3 tries (RFC 2131
// starts at 4 s and keeps going; shortened for the sim).

const ETH_ARP = 0x0806, ETH_IP = 0x0800;
const ZERO_MAC = "00:00:00:00:00:00";
const DHCP_SIZE = 342;     // Ethernet 14 + IP 20 + UDP 8 + 300 B BOOTP message incl. options
const ARP_SIZE = 42;
const LEASE = 86400;       // 24 h lease, the common home-router default
const OFFER_IP = "192.168.1.20";
const MASK = "255.255.255.0";
const TRIES = 3;
const PROBE_WAIT = 1000;   // RFC 5227 probes 3× over 1–2 s and waits 2 s more; shortened
const PARAM_LIST = [1, 3, 6, 15, 51];   // subnet mask, router, DNS, domain name, lease time

export default {
  id: "dhcp",
  name: "DHCP",
  short: "How a new device gets an IP address: Discover, Offer, Request, Ack.",
  layers: ["Ethernet", "IPv4", "UDP", "DHCP"],
  options: [
    { key: "mode", label: "Scenario", type: "select", default: "new",
      choices: [["new", "New device joins (DORA)"], ["renew", "Renew an existing lease"]],
      hint: "A new client broadcasts because it has no address; a renewing client unicasts to its server." },
    { key: "arpProbe", label: "ARP probe before use", type: "bool", default: true,
      hint: "RFC 5227: ask \"does anyone have this IP?\" (from 0.0.0.0) before configuring the offered address." },
  ],
  lan: true,
  nodes() { return ["client", "dhcp", "printer"]; },
  labels: { client: "Laptop", dhcp: "Home router (DHCP)", printer: "Printer" },

  setup(sim, opts) {
    const renew = opts.mode === "renew", probe = opts.arpProbe !== false;
    const cMac = sim.mac("client"), sIp = sim.addr("dhcp"), sMac = sim.mac("dhcp");
    const xid = Math.floor(sim.rand() * 0x100000000) >>> 0;
    const xidHex = "0x" + xid.toString(16).padStart(8, "0");
    const res = { offerMs: null, ackMs: null, configuredMs: null, tries: { DISCOVER: 0, REQUEST: 0 }, failed: false, renewed: false, address: null };
    let state = renew ? "RENEWING" : "SELECTING", timer = null, offered = null;

    const backoff = (n) => 1000 * 2 ** (n - 1) + Math.round(sim.rand() * 200 - 100);
    const serverOpts = () => ({ serverId: sIp, leaseTime: LEASE, subnetMask: MASK, router: sIp, dns: [sIp] });

    const dhcpSend = ({ from, to, type, label, dhcp, ip, retx = false, payload }) => {
      const bcast = to === "broadcast";
      return sim.send({
        from, to, kind: type, label: label + (retx ? " (retx)" : ""), size: DHCP_SIZE, retx,
        headers: {
          eth: { src: sim.mac(from), dst: bcast ? sim.mac("broadcast") : sim.mac(to), type: ETH_IP },
          ip: { proto: 17, ...ip },
          udp: from === "client" ? { srcPort: 68, dstPort: 67 } : { srcPort: 67, dstPort: 68 },
          dhcp: { op: from === "client" ? 1 : 2, xid, flags: { broadcast: !renew }, ciaddr: "0.0.0.0", yiaddr: "0.0.0.0",
            siaddr: "0.0.0.0", chaddr: cMac, msgType: type, ...dhcp },
        },
        payload,
      });
    };

    // ---- client ----------------------------------------------------------------------------------------
    const clientSend = (type) => {
      res.tries[type]++;
      const n = res.tries[type], retx = n > 1;
      if (renew) {
        dhcpSend({ from: "client", to: "dhcp", type, label: `DHCPREQUEST renew ${OFFER_IP}`, retx,
          dhcp: { ciaddr: OFFER_IP, options: { paramList: PARAM_LIST } },
          payload: `xid ${xidHex} · RENEWING: ciaddr ${OFFER_IP}, unicast to ${sIp}` });
      } else if (type === "DISCOVER") {
        dhcpSend({ from: "client", to: "broadcast", type, label: "DHCPDISCOVER", retx,
          ip: { src: "0.0.0.0", dst: "255.255.255.255" },
          dhcp: { options: { paramList: PARAM_LIST } },
          payload: `xid ${xidHex} · "Is there a DHCP server? My MAC is ${cMac}"` });
      } else {
        dhcpSend({ from: "client", to: "broadcast", type, label: `DHCPREQUEST ${offered}`, retx,
          ip: { src: "0.0.0.0", dst: "255.255.255.255" },
          dhcp: { options: { requestedIp: offered, serverId: sIp, paramList: PARAM_LIST } },
          payload: `xid ${xidHex} · "I take ${offered} from server ${sIp}"` });
      }
      timer = sim.timer("client", backoff(n), () => {
        timer = null;
        if (res.tries[type] < TRIES) {
          sim.note("client", `no ${type === "DISCOVER" ? "OFFER" : "ACK"} yet → retransmit ${type} (try ${n + 1}/${TRIES}, backoff doubles)`, "retx");
          clientSend(type);
          return;
        }
        res.failed = true; state = "FAILED";
        if (renew) sim.note("client", `renewal got no ACK after ${TRIES} tries — keep using the lease, retry later; at T2 (87.5 %) rebind by broadcast`, "loss");
        else sim.note("client", `no ${type === "DISCOVER" ? "OFFER" : "ACK"} after ${TRIES} tries — give up (a real client keeps retrying, or self-assigns 169.254.x.x)`, "loss");
      }, `${type} retransmit`);
    };

    const configure = () => {
      state = "BOUND";
      res.configuredMs = sim.now;
      res.address = OFFER_IP;
      sim.mark("address configured", "client");
      sim.deliver("client", { label: `${OFFER_IP}/24`, bytes: 0 });
      sim.note("client", `configured ${OFFER_IP}/24, gateway ${sIp}, DNS ${sIp}; lease 24 h → renew at T1 = 12 h`, "good");
      if (probe) {
        // RFC 5227 announcement: now the address is ours, tell the segment (sender IP = target IP).
        sim.send({
          from: "client", to: "broadcast", kind: "ARP-REQUEST", label: `ARP announce ${OFFER_IP}`, size: ARP_SIZE,
          headers: { eth: { src: cMac, dst: sim.mac("broadcast"), type: ETH_ARP },
            arp: { op: 1, sha: cMac, spa: OFFER_IP, tha: ZERO_MAC, tpa: OFFER_IP } },
          payload: `ARP announcement: ${OFFER_IP} is at ${cMac}`,
        });
      }
    };

    sim.on("client", (p) => {
      const d = p.headers.dhcp;
      if (p.kind === "ARP-REPLY" && state === "PROBING" && p.headers.arp.spa === offered) {
        // Someone already uses the address: decline it (not reached in this LAN, nobody else has .20).
        if (timer) { sim.cancel(timer); timer = null; }
        state = "FAILED"; res.failed = true;
        sim.note("client", `${offered} is already in use by ${p.headers.arp.sha} → DHCPDECLINE`, "loss");
        return;
      }
      if (!d || d.xid !== xid || d.op !== 2) return;
      if (p.kind === "OFFER") {
        if (state !== "SELECTING") { sim.note("client", `extra OFFER ignored — already chose ${offered}`, "info"); return; }
        if (timer) { sim.cancel(timer); timer = null; }
        offered = d.yiaddr;
        res.offerMs = sim.now;
        state = "REQUESTING";
        sim.note("client", `offer: ${d.yiaddr}, mask ${d.options.subnetMask}, router ${d.options.router}, lease ${d.options.leaseTime / 3600} h → request it`, "info");
        clientSend("REQUEST");
      } else if (p.kind === "ACK") {
        if (state !== "REQUESTING" && state !== "RENEWING") { sim.note("client", "duplicate ACK ignored", "info"); return; }
        if (timer) { sim.cancel(timer); timer = null; }
        res.ackMs = sim.now;
        if (renew) {
          state = "BOUND"; res.renewed = true; res.address = OFFER_IP; res.configuredMs = sim.now;
          sim.mark("lease renewed", "client");
          sim.deliver("client", { label: "lease renewed", bytes: 0 });
          sim.note("client", `lease renewed: ${OFFER_IP} for another 24 h → next T1 in 12 h (lease time, not sim time)`, "good");
          return;
        }
        sim.mark("DHCP ACK", "client");
        if (!probe) { configure(); return; }
        state = "PROBING";
        sim.note("client", `ACK for ${d.yiaddr} — first check nobody else is using it (ARP probe, RFC 5227)`, "info");
        sim.send({
          from: "client", to: "broadcast", kind: "ARP-REQUEST", label: `ARP probe: who has ${offered}?`, size: ARP_SIZE,
          headers: { eth: { src: cMac, dst: sim.mac("broadcast"), type: ETH_ARP },
            arp: { op: 1, sha: cMac, spa: "0.0.0.0", tha: ZERO_MAC, tpa: offered } },
          payload: `ARP probe from 0.0.0.0: is anyone using ${offered}?`,
        });
        timer = sim.timer("client", PROBE_WAIT, () => {
          timer = null;
          sim.note("client", `no reply to the probe → ${offered} is free (RFC 5227 sends 3 probes and waits longer; shortened)`, "info");
          configure();
        }, "probe wait");
      }
    });

    // ---- server (the home router) ------------------------------------------------------------------------
    let bound = false;
    sim.on("dhcp", (p, node = "dhcp") => {
      if (p.headers.arp) {
        if (p.headers.arp.spa === "0.0.0.0") sim.note(node, `ARP probe for ${p.headers.arp.tpa} — not mine, stay silent`, "info");
        return;
      }
      const d = p.headers.dhcp;
      if (!d || d.op !== 1) return;
      if (d.msgType === "DISCOVER") {
        sim.note(node, `DISCOVER from ${d.chaddr} → offer ${OFFER_IP} (held for this client)`, "info");
        dhcpSend({ from: "dhcp", to: "broadcast", type: "OFFER", label: `DHCPOFFER ${OFFER_IP}`,
          ip: { dst: "255.255.255.255" },
          dhcp: { yiaddr: OFFER_IP, options: serverOpts() },
          payload: `xid ${xidHex} · "You can have ${OFFER_IP} for 24 h; mask ${MASK}, router ${sIp}, DNS ${sIp}"` });
      } else if (d.msgType === "REQUEST") {
        const o = d.options || {};
        if (o.serverId && o.serverId !== sIp) return; // client chose another server's offer
        const unicast = d.ciaddr !== "0.0.0.0";
        if (!bound) sim.note(node, unicast ? `renewal from ${d.ciaddr} → extend the lease` : `REQUEST names me (${sIp}) → commit the lease, ACK`, "info");
        bound = true;
        dhcpSend({ from: "dhcp", to: unicast ? "client" : "broadcast", type: "ACK", label: `DHCPACK ${OFFER_IP}`,
          ip: unicast ? {} : { dst: "255.255.255.255" },
          dhcp: { ciaddr: d.ciaddr, yiaddr: OFFER_IP, options: serverOpts() },
          payload: `xid ${xidHex} · "${OFFER_IP} is yours for 24 h"` });
      }
    });

    // The printer hears every broadcast but isn't a DHCP server and doesn't own the probed address.
    let printerNoted = 0;
    sim.on("printer", (p, node = "printer") => {
      if (printerNoted++ >= 6) return;
      const what = p.headers.arp ? `ARP for ${p.headers.arp.tpa} — not my IP (${sim.addr(node)})` : `${p.label.replace(" (retx)", "")} — not a DHCP server`;
      sim.note(node, `heard broadcast ${what}, ignored`, "info");
    });

    if (renew) {
      sim.note("client", `holding ${OFFER_IP} (24 h lease); T1 = 50 % → 12 h in: unicast REQUEST to ${sIp}`, "info");
      state = "RENEWING";
      clientSend("REQUEST");
    } else {
      sim.note("client", `new device, no IP address yet → broadcast from 0.0.0.0`, "info");
      clientSend("DISCOVER");
    }

    return {
      summary() {
        return {
          mode: renew ? "renew" : "new", offerMs: res.offerMs, ackMs: res.ackMs, configuredMs: res.configuredMs,
          address: res.address, discovers: res.tries.DISCOVER, requests: res.tries.REQUEST,
          renewed: res.renewed, failed: res.failed || res.configuredMs === null,
        };
      },
    };
  },
};
