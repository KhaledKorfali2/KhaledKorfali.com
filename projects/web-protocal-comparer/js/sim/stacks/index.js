// Stack id → lazily imported module. Order is the Lab's picker order.
export const STACKS = [
  { id: "ip", name: "IP & ICMP", group: "Network" },
  { id: "udp", name: "UDP", group: "Transport" },
  { id: "tcp", name: "TCP", group: "Transport" },
  { id: "dns", name: "DNS", group: "Application" },
  { id: "tls", name: "TLS", group: "Security" },
  { id: "http1", name: "HTTP/1.1", group: "Web" },
  { id: "http2", name: "HTTP/2", group: "Web" },
  { id: "http3", name: "HTTP/3 (QUIC)", group: "Web" },
  { id: "websocket", name: "WebSocket", group: "Web" },
];

const LOADERS = {
  ip: () => import("./ip.js"),
  udp: () => import("./udp.js"),
  tcp: () => import("./tcp.js"),
  dns: () => import("./dns.js"),
  tls: () => import("./tls.js"),
  http1: () => import("./http1.js"),
  http2: () => import("./http2.js"),
  http3: () => import("./http3.js"),
  websocket: () => import("./websocket.js"),
};

const cache = new Map();
export async function loadStack(id) {
  if (!LOADERS[id]) return null;
  if (!cache.has(id)) cache.set(id, LOADERS[id]().then((m) => m.default).catch((e) => { cache.delete(id); console.error("Stack failed to load:", id, e); return null; }));
  return cache.get(id);
}
