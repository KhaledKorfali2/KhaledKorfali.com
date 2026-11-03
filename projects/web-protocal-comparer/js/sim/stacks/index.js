// Stack id → lazily imported module. Groups follow the course order (bottom of the stack first);
// `short` is shown under the Lab picker before the module has loaded.
export const GROUPS = ["Local network", "Internet", "Transport", "Security", "Web", "Applications"];

export const STACKS = [
  { id: "arp", name: "ARP", group: "Local network", short: "Find the hardware (MAC) address behind an IP on your network." },
  { id: "dhcp", name: "DHCP", group: "Local network", short: "How a new device gets an IP address, gateway and DNS server." },
  { id: "nat", name: "NAT", group: "Local network", short: "How a home router shares one public address, and why it blocks inbound connections." },
  { id: "ip", name: "IP & ICMP", group: "Internet", short: "Hop-by-hop routing, TTL, ping and traceroute." },
  { id: "udp", name: "UDP", group: "Transport", short: "Fire-and-forget datagrams: no handshake, no retries, no ordering." },
  { id: "tcp", name: "TCP", group: "Transport", short: "Reliable, ordered byte stream with retransmission and congestion control." },
  { id: "tls", name: "TLS", group: "Security", short: "The handshake that encrypts TCP connections (1.2 vs 1.3)." },
  { id: "ssh", name: "SSH", group: "Security", short: "Encrypted remote shell: key exchange, authentication, keystroke echo." },
  { id: "http1", name: "HTTP/1.1", group: "Web", short: "One request at a time per connection; browsers open up to six." },
  { id: "http2", name: "HTTP/2", group: "Web", short: "Many requests multiplexed over one TCP connection." },
  { id: "http3", name: "HTTP/3 (QUIC)", group: "Web", short: "HTTP over QUIC: faster handshake, no cross-stream blocking." },
  { id: "websocket", name: "WebSocket", group: "Web", short: "A long-lived, two-way message channel upgraded from HTTP." },
  { id: "dns", name: "DNS", group: "Applications", short: "Turning names into addresses over UDP, with retries." },
  { id: "ftp", name: "FTP", group: "Applications", short: "File transfer with separate control and data connections." },
  { id: "smtp", name: "SMTP", group: "Applications", short: "How mail servers hand messages to each other." },
];

const LOADERS = {
  arp: () => import("./arp.js"),
  dhcp: () => import("./dhcp.js"),
  nat: () => import("./nat.js"),
  ip: () => import("./ip.js"),
  udp: () => import("./udp.js"),
  tcp: () => import("./tcp.js"),
  tls: () => import("./tls.js"),
  ssh: () => import("./ssh.js"),
  http1: () => import("./http1.js"),
  http2: () => import("./http2.js"),
  http3: () => import("./http3.js"),
  websocket: () => import("./websocket.js"),
  dns: () => import("./dns.js"),
  ftp: () => import("./ftp.js"),
  smtp: () => import("./smtp.js"),
};

const cache = new Map();
export async function loadStack(id) {
  if (!LOADERS[id]) return null;
  if (!cache.has(id)) cache.set(id, LOADERS[id]().then((m) => m.default).catch((e) => { cache.delete(id); console.error("Stack failed to load:", id, e); return null; }));
  return cache.get(id);
}

/** A grouped <select> of every stack. */
export function stackSelect(current, attrs = "") {
  return `<select class="select stack-select" ${attrs}>${GROUPS.map((g) => `<optgroup label="${g}">${STACKS.filter((s) => s.group === g).map((s) =>
    `<option value="${s.id}" ${s.id === current ? "selected" : ""}>${s.name}</option>`).join("")}</optgroup>`).join("")}</select>`;
}
