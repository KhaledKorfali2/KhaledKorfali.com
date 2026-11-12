// Track: Packets, Byte by Byte. Where the Networks track reads conversations,
// this one opens the envelope: headers, byte order, flags, sequence numbers and
// what happens when code trusts a length field. Frames are built byte-accurately.
import { norm } from "../flags.js";

const be16 = (n) => [(n >> 8) & 255, n & 255];
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ipBytes = (ip) => ip.split(".").map(Number);
const macBytes = (m) => m.split(":").map((h) => parseInt(h, 16));
function checksum(bytes) {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 2) sum += (bytes[i] << 8) | (bytes[i + 1] || 0);
  while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16);
  return ~sum & 0xffff;
}
/** A real Ethernet + IPv4 + TCP frame (no options), with valid checksums. */
function tcpFrame({ smac, dmac, src, dst, sport, dport, seq = 1, ack = 0, flags = 0x18, ttl = 64, payload = "" }) {
  const data = [...payload].map((c) => c.charCodeAt(0) & 255);
  const tcp = [...be16(sport), ...be16(dport), ...be32(seq), ...be32(ack), 0x50, flags, 0xfa, 0xf0, 0, 0, 0, 0];
  const pseudo = [...ipBytes(src), ...ipBytes(dst), 0, 6, ...be16(tcp.length + data.length)];
  const tsum = checksum([...pseudo, ...tcp, ...data]);
  tcp[16] = tsum >> 8; tcp[17] = tsum & 255;
  const ip = [0x45, 0x00, ...be16(20 + tcp.length + data.length), 0x1c, 0x46, 0x40, 0x00, ttl, 6, 0, 0, ...ipBytes(src), ...ipBytes(dst)];
  const isum = checksum(ip);
  ip[10] = isum >> 8; ip[11] = isum & 255;
  return new Uint8Array([...macBytes(dmac), ...macBytes(smac), 0x08, 0x00, ...ip, ...tcp, ...data]);
}
const mac = (ctx, oui = "52:54:00") => `${oui}:${ctx.hex(2)}:${ctx.hex(2)}:${ctx.hex(2)}`;
const two = (n) => String(n).padStart(2, "0");

const HEADER_MAP = `### Where things are in a TCP/IPv4 frame
Offsets count bytes from the start of the frame, in hex (decimal in brackets). The hex viewer shows 16 bytes per row, so row \`00000010\` starts at byte 16.

| Offset | Size | Field |
|---|---|---|
| \`00\` (0) | 6 | Ethernet: destination MAC |
| \`06\` (6) | 6 | Ethernet: source MAC |
| \`0c\` (12) | 2 | EtherType: \`08 00\` = IPv4 |
| \`0e\` (14) | 1 | IP: version and header length (\`45\`) |
| \`16\` (22) | 1 | IP: time to live (TTL) |
| \`17\` (23) | 1 | IP: protocol (\`06\` TCP, \`11\` UDP, \`01\` ICMP) |
| \`1a\` (26) | 4 | IP: source address |
| \`1e\` (30) | 4 | IP: destination address |
| \`22\` (34) | 2 | TCP: source port |
| \`24\` (36) | 2 | TCP: destination port |
| \`26\` (38) | 4 | TCP: sequence number |
| \`2a\` (42) | 4 | TCP: acknowledgement number |
| \`2f\` (47) | 1 | TCP: flags |
| \`36\` (54) | … | payload (application data) |`;

export default [
  {
    id: "pkt-layers",
    title: "Envelopes Inside Envelopes",
    level: 2,
    slug: "headers_wrap_headers",
    time: 12,
    certs: ["Network+", "Security+", "CySA+", "GSEC"],
    objective: "This is one raw frame exactly as it crossed the wire. Decode the IP header by hand and submit the destination IP address.",
    answerLabel: "Destination IP",
    answerPlaceholder: "e.g. 172.16.4.20",
    lesson: `Tools like Wireshark show you tidy fields: source, destination, port. Underneath, a packet is just **bytes in a fixed order**. Reading those bytes yourself is what lets you understand a tool's output, write detection signatures, and spot traffic that a parser gets wrong.

### Encapsulation
Each network layer wraps the data from the layer above in its own **header**, like envelopes inside envelopes:

\`\`\`
[ Ethernet header | IP header | TCP header | application data ]
   who on this       which       which        the actual
   local network     machines    programs     message
\`\`\`

- **Ethernet** (layer 2) delivers a frame to the next device on the local network, by **MAC address**.
- **IP** (layer 3) carries it between networks, by **IP address**.
- **TCP/UDP** (layer 4) deliver it to the right program, by **port**.
- The **payload** is the application's own protocol: HTTP, DNS, TLS…

A header is not text. An IPv4 address is 4 raw bytes: \`c0 a8 01 0a\` is 192.168.1.10 (each byte converted from hex to decimal: c0 = 192, a8 = 168, 01 = 1, 0a = 10).

${HEADER_MAP}

### Your task
\`frame.bin\` is one captured frame. Find the four bytes of the **destination IP address**, convert each from hex to decimal, and submit the address in dotted form. The Toolkit's number converter accepts values like \`0xac\`.`,
    hints: ["The destination address is the 4 bytes at offset 0x1e (30).", "In the hex view, row 00000010 holds bytes 16 to 31. Byte 30 is the 15th byte on that row; the address continues onto the next row.", "Convert each of the four hex bytes to decimal and join them with dots."],
    workspace: { type: "files" },
    setup(ctx) {
      const src = `10.${ctx.int(11, 99)}.${ctx.int(11, 250)}.${ctx.int(11, 250)}`;
      const dst = `172.${ctx.int(16, 31)}.${ctx.int(11, 250)}.${ctx.int(11, 250)}`;
      const data = tcpFrame({ smac: mac(ctx), dmac: mac(ctx, "00:16:3e"), src, dst, sport: ctx.int(49152, 65000), dport: 80, seq: 0x1b2c3d4e, ack: 0x5e6f7081,
        payload: "GET /status HTTP/1.1\r\nHost: intranet.example\r\nUser-Agent: curl/8.5.0\r\n\r\n" });
      return { _ip: dst, files: [{ name: "frame.bin", kind: "hex", note: "One Ethernet frame, raw. The readable text on the right is the payload; everything before it is headers.", data }] };
    },
    check(input, ctx, env) { return norm.ip(input) === env._ip; },
    debrief: `Fourteen bytes of Ethernet, twenty of IP, twenty of TCP, then the HTTP request you could read in the ASCII column. The addresses that tools show as text were four raw bytes each, at fixed positions.

Things you can now see in any hex dump:
- \`08 00\` at offset 12: this frame carries IPv4. (\`08 06\` would be ARP, \`86 dd\` IPv6.)
- \`45\` at offset 14: IP version 4, header length 5 × 4 = 20 bytes.
- \`06\` at offset 23: the next header is TCP.

### Why defenders care
- **IDS signatures** (Snort, Suricata) match on exact bytes at exact offsets.
- Attackers hide in the gaps between layers: tunnelling one protocol in another, or crafting headers that two devices interpret differently.
- When a capture tool mislabels traffic, the bytes are the ground truth.

**On the exam:** encapsulation, the OSI/TCP-IP layers and header fields are core Network+ and Security+ material, and CySA+ expects you to read packet output fluently.`,
  },

  {
    id: "pkt-endian",
    title: "Big End First",
    level: 3,
    slug: "network_byte_order",
    time: 12,
    certs: ["Network+", "CySA+", "GSEC", "PenTest+"],
    objective: "A packet logger written in C prints the wrong destination port because it ignores byte order. Work out the real destination port and submit it.",
    answerLabel: "Real destination port",
    answerPlaceholder: "a port number",
    lesson: `A port number is 16 bits: two bytes. Which byte comes first? There are two conventions, and mixing them up is a classic bug.

- **Big-endian**: most significant byte first. Port 443 = 0x01BB is sent as \`01 bb\`. Every Internet protocol uses this; it's called **network byte order**.
- **Little-endian**: least significant byte first. x86 and most ARM systems store 0x01BB in memory as \`bb 01\`. (You met this in the format-string challenge, where a leaked word came out reversed.)

So if a C program on an x86 machine copies the two bytes \`01 bb\` straight off the wire into a \`uint16_t\` and uses it as a number, the CPU reads it little-endian and gets 0xBB01 = 47873 instead of 443.

### The C you need
\`\`\`c
struct tcp_header {          // a struct lays fields out in memory in order
    uint16_t src_port;       // bytes 0-1 of the TCP header
    uint16_t dst_port;       // bytes 2-3
    ...
};
const struct tcp_header *h = (const struct tcp_header *)bytes;  // a CAST
\`\`\`

A **cast** tells the compiler "treat this address as pointing to that type". No conversion happens: the struct is simply laid over the raw packet bytes. Fast, and the reason byte order suddenly matters.

The standard fix is a set of conversion functions:

| Function | Converts |
|---|---|
| \`ntohs(x)\` | **n**etwork **to** **h**ost, **s**hort (16-bit) |
| \`ntohl(x)\` | network to host, long (32-bit) |
| \`htons(x)\`, \`htonl(x)\` | host to network, for sending |

Forgetting them doesn't crash. It silently produces wrong numbers, so firewall rules match the wrong port, length checks use the wrong length, and logs mislead investigators.

${HEADER_MAP}

### Your task
\`sniffer.c\` logs each packet's destination port but forgets \`ntohs\`. \`sniffer.log\` shows what it printed for the frame in \`frame.bin\`. Submit the **real** destination port, either by swapping the logged number's two bytes or by reading the port straight from the frame.`,
    hints: ["Convert the logged number to hex with the Toolkit. It has two bytes: swap them, then convert back to decimal.", "Or read the frame: the destination port is the 2 bytes at offset 0x24 (36), most significant byte first.", "Example: logged 47873 = 0xbb01, swapped = 0x01bb = 443."],
    workspace: { type: "files" },
    setup(ctx) {
      const port = ctx.pick([22, 25, 53, 443, 3306, 3389, 5432, 8080, 8443]);
      const wrong = ((port & 255) << 8) | (port >> 8);
      const src = `10.4.${ctx.int(11, 250)}.${ctx.int(11, 250)}`, dst = `10.9.${ctx.int(11, 250)}.${ctx.int(11, 250)}`;
      const data = tcpFrame({ smac: mac(ctx), dmac: mac(ctx, "00:16:3e"), src, dst, sport: ctx.int(49152, 65000), dport: port, seq: ctx.int(1e6, 9e8), flags: 0x02 });
      const c = String.raw`#include <stdint.h>
#include <stdio.h>
#include <arpa/inet.h>

struct tcp_header {
    uint16_t src_port;      /* bytes 0-1, in network byte order */
    uint16_t dst_port;      /* bytes 2-3, in network byte order */
    uint32_t seq;
    uint32_t ack;
    uint8_t  data_offset;
    uint8_t  flags;
    uint16_t window;
};

void log_packet(const uint8_t *tcp_bytes) {
    const struct tcp_header *h = (const struct tcp_header *)tcp_bytes;

    /* BUG: should be ntohs(h->dst_port) */
    printf("tcp packet to port %u\n", h->dst_port);
}
`;
      return { _p: port, files: [
        { name: "sniffer.log", kind: "text", note: "Output of the logger for one packet (running on an x86-64 server).", data: `tcp packet to port ${wrong}\n` },
        { name: "sniffer.c", kind: "code", label: "C", note: "The logger. A struct is laid directly over the packet's bytes.", data: c },
        { name: "frame.bin", kind: "hex", note: "The frame that produced that log line (a TCP SYN, no payload).", data },
      ] };
    },
    check(input, ctx, env) { return norm.num(input) === env._p; },
    debrief: `The two port bytes arrived most-significant first, the x86 CPU read them least-significant first, and the logger printed a number that exists nowhere in the conversation. Swapping the bytes (which is all \`ntohs\` does on a little-endian machine) restored the real port.

### Why this matters for security
- A filter that compares un-swapped ports **never matches**, so traffic it was meant to block or log goes straight through.
- Length fields are multi-byte too. Read with the wrong byte order, a small length becomes a huge one, which is how parsing bugs turn into memory-safety bugs.
- When you read hex dumps of packets: big-endian. When you read hex dumps of x86 memory: little-endian. Knowing which one you're looking at prevents hours of confusion.

### How defenders stop it
- Always convert at the boundary: \`ntohs\`/\`ntohl\` when reading from the wire, \`htons\`/\`htonl\` when writing.
- Better, parse fields explicitly byte by byte (\`(b[0] << 8) | b[1]\`), which is correct on every CPU.
- Test parsers against captures of real traffic with known values.

**On the exam:** well-known ports and reading header fields are Network+ and CySA+ basics; byte order is assumed knowledge in packet-crafting and exploit-analysis questions.`,
  },

  {
    id: "pkt-flags",
    title: "Six Bits That Run TCP",
    level: 2,
    slug: "tcp_flags_decoded",
    time: 11,
    certs: ["Network+", "Security+", "CySA+", "CEH"],
    objective: "A sensor logged the raw TCP flags byte of each packet during a port scan. Decode the replies and submit how many ports were open.",
    answerLabel: "Open ports",
    answerPlaceholder: "a number",
    lesson: `TCP manages every connection with a handful of one-bit **flags** packed into a single byte of its header (offset 0x2f in a frame). Each flag is one bit:

| Bit value | Flag | Meaning |
|---|---|---|
| \`0x01\` | **FIN** | I'm finished sending; close politely |
| \`0x02\` | **SYN** | start a connection (synchronise sequence numbers) |
| \`0x04\` | **RST** | reset: abort immediately |
| \`0x08\` | **PSH** | deliver this data to the application now |
| \`0x10\` | **ACK** | I acknowledge what you sent |
| \`0x20\` | **URG** | urgent data (rare) |

When several flags are set, their values **add**. The byte \`0x12\` is 0x10 + 0x02: **SYN + ACK**. \`0x18\` is ACK + PSH (ordinary data). \`0x14\` is RST + ACK. \`0x11\` is FIN + ACK.

In C you test one with a bitwise AND: \`if (flags & 0x02)\` is "is the SYN bit set?". The \`&\` operator keeps only the bits set in both numbers.

### The three-way handshake
\`\`\`
client  -- SYN      (0x02) -->  server
client  <-- SYN+ACK (0x12) --   server      the port is OPEN
client  -- ACK      (0x10) -->  server
\`\`\`

If nothing is listening on the port, the server answers the SYN with **RST+ACK (0x14)** instead: the port is **closed**. No answer at all usually means a firewall dropped the packet (**filtered**).

A SYN scan sends a SYN to each port and classifies it by the reply. That makes the flags byte alone enough to reconstruct what a scanner learned.

### Your task
\`flags.log\` lists packets with their raw flags byte. One host probes many ports on a server. Count how many of those ports answered as **open**. Ignore the unrelated traffic between other hosts.`,
    hints: ["The scanner's packets all have flags=0x02 (SYN only). Find its IP and the server it targets.", "Look only at replies from the server back to the scanner. 0x12 means open; 0x14 means closed.", "Filter the log for 0x12 and count the lines that are replies to the scanner."],
    workspace: { type: "files" },
    setup(ctx) {
      const scanner = "10.0.9." + ctx.int(2, 60), server = "10.0.9." + ctx.int(100, 200);
      const a = "10.0.9." + ctx.int(61, 80), b = "10.0.9." + ctx.int(201, 250);
      const ports = [21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 993, 1433, 3306, 3389, 5432, 8080];
      const open = new Set(ctx.shuffle(ports).slice(0, ctx.int(3, 7)));
      const lines = [];
      let ms = 0;
      const t = () => { ms += ctx.int(1, 9); return `02:14:${two(7 + Math.floor(ms / 1000))}.${String(ms % 1000).padStart(3, "0")}`; };
      const row = (s, sp, d, dp, f) => lines.push(`${t()} IP ${s}.${sp} > ${d}.${dp}: tcp flags=0x${f.toString(16).padStart(2, "0")}`);
      const noise = () => {
        const sp = ctx.int(50000, 60000);
        const seq = ctx.pick([[0x18, 0x10], [0x18, 0x18], [0x10, 0x10], [0x11, 0x10]]);
        row(a, sp, b, 443, seq[0]); row(b, 443, a, sp, seq[1]);
      };
      row(a, 51515, b, 443, 0x02); row(b, 443, a, 51515, 0x12); row(a, 51515, b, 443, 0x10);
      noise();
      ports.forEach((p, i) => {
        row(scanner, 44000 + i, server, p, 0x02);
        row(server, p, scanner, 44000 + i, open.has(p) ? 0x12 : 0x14);
        if (open.has(p)) row(scanner, 44000 + i, server, p, 0x04);
        if (i % 4 === 1) noise();
      });
      return { _n: open.size, files: [{ name: "flags.log", kind: "log", note: `Sensor output: one line per packet with the raw TCP flags byte. Server under test: ${server}.`, data: lines.join("\n") }] };
    },
    check(input, ctx, env) { return norm.num(input) === env._n; },
    debrief: `Every probe was a bare SYN (\`0x02\`). The server's reply told the scanner everything: \`0x12\` (SYN+ACK) for a listening service, \`0x14\` (RST+ACK) for a closed port. After each open port the scanner sent \`0x04\` (RST) instead of completing the handshake: the signature of a **half-open SYN scan**, which never creates a full connection for the application to log.

The unrelated lines included a legitimate handshake to port 443 with its own \`0x12\`. Context matters: a signature has to look at who is talking to whom, not just at a byte value.

### How defenders use this
- IDS rules key on flag patterns: many SYNs from one source to many ports; or impossible combinations such as SYN+FIN, no flags at all (NULL scan), or FIN+PSH+URG (Xmas scan), which only scanners send.
- **Stateful firewalls** track the handshake and drop packets that don't belong to a properly established connection.
- SYN floods abuse the same mechanism for denial of service; SYN cookies are the defence.

**On the exam:** TCP flags, the three-way handshake and scan types (SYN, connect, NULL, FIN, Xmas) are tested in Network+, Security+, CySA+ and CEH.`,
  },

  {
    id: "pkt-seq",
    title: "Putting the Stream Back Together",
    level: 3,
    slug: "sequence_numbers_reassemble",
    time: 12,
    certs: ["Network+", "CySA+", "GCIH", "CEH"],
    objective: "The segments of one TCP stream were captured out of order, with a retransmission. Use the sequence numbers to reassemble the data and submit the flag.",
    lesson: `IP delivers packets individually and makes no promises: they can arrive out of order, twice, or not at all. **TCP** builds a reliable byte stream on top of that using **sequence numbers**.

### How it works
- Every byte in a TCP stream has a number. A segment's **sequence number** (\`seq\`) is the number of its **first** byte.
- A segment with \`seq=5000\` carrying 6 bytes covers bytes 5000 to 5005. The next segment in order has \`seq=5006\`.
- The receiver replies with an **acknowledgement number**: "I have everything up to here; send me this byte next."
- If no acknowledgement arrives in time, the sender **retransmits** the segment: same sequence number, same data.
- The starting value (the *initial sequence number*, ISN) is chosen at random during the handshake. If it were predictable, an attacker who can't even see the traffic could forge segments that the receiver accepts.

The receiver sorts segments by \`seq\`, discards duplicates, and hands the application a clean, ordered stream. When you use *Follow stream* in a packet tool, it is doing exactly this for you.

### Why analysts need to do it by hand sometimes
Security devices must reassemble streams the same way the destination host will. Attackers exploit differences: split a malicious string across tiny segments, send them out of order, or send **overlapping** segments with different content, hoping the IDS and the target reconstruct different data. This is called **evasion by fragmentation/segmentation**.

### Your task
\`segments.log\` lists the data segments of one connection in the order they were captured. Sort them by sequence number, drop the retransmitted duplicate, and join the payloads to recover the flag.`,
    hints: ["Find the lowest seq value: that segment starts the stream.", "Each next segment's seq equals the previous seq plus the previous length.", "One seq value appears twice (a retransmission). Use it once."],
    workspace: { type: "files" },
    setup(ctx) {
      const isn = ctx.int(100000, 4000000);
      const segs = [];
      let off = 0;
      while (off < ctx.flag.length) {
        const n = Math.min(ctx.int(5, 8), ctx.flag.length - off);
        segs.push({ seq: isn + off, data: ctx.flag.slice(off, off + n) });
        off += n;
      }
      const dup = segs[ctx.int(1, segs.length - 2)];
      let order = ctx.shuffle([...segs, { ...dup, re: true }]);
      // keep the retransmission after its original
      const oi = order.findIndex((s) => s.seq === dup.seq && !s.re), ri = order.findIndex((s) => s.re);
      if (ri < oi) [order[oi], order[ri]] = [order[ri], order[oi]];
      const c = `10.0.6.${ctx.int(20, 90)}.51820`, s = `192.0.2.${ctx.int(5, 200)}.8080`;
      let ms = ctx.int(100, 400);
      const lines = order.map((g) => { ms += ctx.int(3, 40); return `14:02:11.${String(ms).padStart(3, "0")} IP ${s} > ${c}: Flags [P.], seq ${g.seq}, len ${g.data.length}, data "${g.data}"${g.re ? "   [TCP Retransmission]" : ""}`; });
      return { files: [{ name: "segments.log", kind: "log", note: `Data segments of one TCP connection, in capture order. Initial sequence number: ${isn}.`, data: lines.join("\n") }] };
    },
    debrief: `Sorted by sequence number, with each segment starting exactly where the previous one ended and the retransmission dropped, the fragments became one continuous stream. That is TCP reassembly, the step every packet tool and intrusion-detection sensor performs before it can inspect content.

### Why this matters for security
- **IDS evasion**: content split or reordered across segments is invisible to a sensor that inspects packets one at a time. Modern sensors reassemble streams first (Suricata/Snort stream engines) and normalise overlaps.
- **Session hijacking and spoofing** depend on guessing sequence numbers; random ISNs and encryption (TLS) defeat it.
- **Forensics**: carving a file out of a capture means reassembling its stream in sequence order.

**On the exam:** sequence/acknowledgement numbers, retransmission and session hijacking are covered in Network+, CySA+ and CEH; stream reassembly underlies every "follow the stream" question.`,
  },

  {
    id: "pkt-ttl",
    title: "How Far Has It Travelled?",
    level: 2,
    slug: "ttl_fingerprints_the_os",
    time: 10,
    certs: ["Network+", "CySA+", "CEH", "PenTest+"],
    objective: "Five hosts answered a ping sweep. Use the TTL of each reply to identify the one most likely running Windows, and submit its IP address.",
    answerLabel: "IP of the Windows host",
    answerPlaceholder: "e.g. 10.0.0.5",
    lesson: `Every IP header has a one-byte **time to live (TTL)**. The sender sets it to a starting value, and **every router that forwards the packet subtracts 1**. If it reaches 0, the router discards the packet and sends back an ICMP "time exceeded" message. This stops packets circling forever in a routing loop.

Two useful things fall out of that.

### 1. traceroute
\`traceroute\` sends packets with TTL 1, then 2, then 3… Each one dies one hop further along, and the "time exceeded" replies reveal the address of every router on the path.

### 2. Passive OS fingerprinting
Operating systems choose different **starting** TTLs:

| Starting TTL | Typical systems |
|---|---|
| **64** | Linux, macOS, Android, iOS, most Unix |
| **128** | Windows |
| **255** | routers, switches and other network gear |

A packet rarely crosses more than a couple of dozen routers, so the TTL you *observe* is a little below one of those values. A reply arriving with TTL 121 almost certainly started at 128 (7 hops away): Windows. TTL 57 started at 64: Linux or similar. TTL 250: a network device.

It is a hint, not proof (the value can be changed), but it costs nothing: you learn it from traffic the host was sending anyway.

### Reading it in the capture
The viewer is the same one used in the Networks track. Filter to \`icmp\`, click a reply, and look under **Internet Protocol → Time to Live**. The Info column summarises it too.

### Your task
A monitoring host pinged five addresses. Find the reply whose TTL points to a starting value of 128, and submit that host's IP.`,
    hints: ["Filter to icmp and look only at the Echo replies (the requests all come from the monitoring host).", "For each reply, ask which of 64, 128 or 255 is the nearest value at or above its TTL.", "The reply with a TTL just under 128 (between 100 and 128) is the Windows machine."],
    workspace: { type: "pcap" },
    setup(ctx) {
      const mon = "10.0.3.5";
      const hosts = ctx.shuffle([
        { ttl: 64 - ctx.int(1, 9), os: "linux" },
        { ttl: 64 - ctx.int(1, 9), os: "linux" },
        { ttl: 128 - ctx.int(2, 14), os: "windows" },
        { ttl: 255 - ctx.int(1, 6), os: "net" },
        { ttl: 64 - ctx.int(10, 16), os: "linux" },
      ]).map((h, i) => ({ ...h, ip: `10.${ctx.int(20, 90)}.${ctx.int(1, 250)}.${ctx.int(2, 250)}`, i }));
      const packets = [];
      hosts.forEach((h, i) => {
        const t = 0.1 + i * 0.25;
        packets.push({ t, src: mon, dst: h.ip, proto: "ICMP", ttl: 64, len: 98, info: `Echo (ping) request  id=0x1f2e, seq=${i + 1}, ttl=64` });
        packets.push({ t: t + 0.004 + ctx.rng() * 0.03, src: h.ip, dst: mon, proto: "ICMP", ttl: h.ttl, len: 98, info: `Echo (ping) reply    id=0x1f2e, seq=${i + 1}, ttl=${h.ttl}` });
      });
      return { _ip: hosts.find((h) => h.os === "windows").ip, filter: "icmp", packets };
    },
    check(input, ctx, env) { return norm.ip(input) === env._ip; },
    debrief: `One reply arrived with a TTL just under 128: a Windows default, minus a few router hops. The values just under 64 are Linux/Unix-style hosts, and the one near 255 is network equipment. You identified operating systems without sending a single extra packet.

Subtracting also gives distance: a TTL of 121 from a start of 128 means the host is 7 routers away.

### How both sides use this
- **Attackers** fingerprint targets quietly during reconnaissance (tools like p0f do it from TTL, TCP window size and option order).
- **Defenders** use the same trick to spot anomalies: a "printer" whose TTL says Windows, a server whose TTL suddenly changes (a different machine answering: possible spoofing or man-in-the-middle), or packets claiming to be local that have clearly crossed many hops.
- Some organisations normalise TTLs at the perimeter to give away less.

**On the exam:** TTL, ICMP, traceroute and OS fingerprinting (active vs passive) appear in Network+, CySA+, CEH and PenTest+.`,
  },

  {
    id: "pkt-arp",
    title: "Two Machines, One Address",
    level: 3,
    slug: "arp_spoofing_detected",
    time: 12,
    certs: ["Network+", "Security+", "CySA+", "CEH"],
    objective: "Something on this LAN is impersonating the gateway. Find the MAC address making the false claim, work out which host it really belongs to, and submit that host's IP address.",
    answerLabel: "Attacker's real IP",
    answerPlaceholder: "e.g. 192.168.1.50",
    lesson: `On a local network, frames are delivered by **MAC address**, the hardware address of a network card. But programs only know **IP addresses**. The **Address Resolution Protocol (ARP)** bridges the two:

\`\`\`
Who has 192.168.1.1? Tell 192.168.1.23        (broadcast to everyone)
192.168.1.1 is at 52:54:00:aa:10:01           (the owner replies)
\`\`\`

The asker stores the answer in its **ARP cache** and uses that MAC for every frame it sends to that IP.

### The weakness
ARP has **no authentication**. Any machine can send a reply, at any time, claiming any IP. Hosts simply believe the most recent answer. An attacker on the LAN can announce:

\`\`\`
192.168.1.1 is at <attacker's MAC>
\`\`\`

and every victim that believes it starts sending its internet-bound traffic to the attacker, who forwards it on to the real gateway so nothing appears broken. That is **ARP spoofing** (or *ARP poisoning*), the classic way to become a **man-in-the-middle** on a local network: read cleartext traffic, capture credentials, tamper with responses.

### What it looks like in a capture
- The same IP address is claimed by **two different MAC addresses**.
- A burst of **unsolicited** replies ("gratuitous ARP") repeating the claim every second or two, to keep the victims' caches poisoned.
- The lying MAC also appears elsewhere in the capture **with its own, real IP address**.

### Your task
Filter to \`arp\`. The gateway is 192.168.1.1. Find the second MAC address claiming to be the gateway, then find which IP that MAC legitimately answers for. Submit that IP: the attacker's machine.`,
    hints: ["Filter to arp and read the Info column: note every MAC that says '192.168.1.1 is at …'.", "Two different MACs make that claim. The one repeating it over and over, unasked, is the impostor.", "Search for that MAC in the other replies: it also says '<some other IP> is at' the same MAC. That IP is the answer."],
    workspace: { type: "pcap" },
    setup(ctx) {
      const gw = "192.168.1.1", gwMac = mac(ctx, "00:1a:8c");
      const hostIps = ctx.shuffle(Array.from({ length: 200 }, (_, i) => i + 20)).slice(0, 5).map((n) => "192.168.1." + n);
      const hosts = hostIps.map((ip) => ({ ip, mac: mac(ctx, ctx.pick(["52:54:00", "3c:22:fb", "a4:83:e7", "f0:18:98"])) }));
      const atk = hosts[ctx.int(0, 4)], victims = hosts.filter((h) => h !== atk);
      const packets = [];
      let t = 0;
      const req = (from, ip) => { t += 0.2 + ctx.rng() * 0.6; packets.push({ t: +t.toFixed(3), src: from.ip, dst: ip, proto: "ARP", len: 42, smac: from.mac, info: `Who has ${ip}? Tell ${from.ip}` }); };
      const rep = (owner, ip, to) => { t += 0.002 + ctx.rng() * 0.004; packets.push({ t: +t.toFixed(3), src: ip, dst: to.ip, proto: "ARP", len: 42, smac: owner.mac, tmac: to.mac, info: `${ip} is at ${owner.mac}` }); };
      const gwHost = { ip: gw, mac: gwMac };
      req(victims[0], gw); rep(gwHost, gw, victims[0]);
      req(gwHost, atk.ip); rep(atk, atk.ip, gwHost);
      req(victims[1], victims[2].ip); rep(victims[2], victims[2].ip, victims[1]);
      req(victims[3], gw); rep(gwHost, gw, victims[3]);
      for (let i = 0; i < 9; i++) {
        t += 1.0;
        rep(atk, gw, victims[i % victims.length]);
        if (i === 3) { req(gwHost, victims[1].ip); rep(victims[1], victims[1].ip, gwHost); }
        if (i === 6) { req(victims[2], gw); rep(gwHost, gw, victims[2]); rep(atk, gw, victims[2]); }
      }
      return { _ip: atk.ip, filter: "arp", packets };
    },
    check(input, ctx, env) { return norm.ip(input) === env._ip; },
    debrief: `Two MAC addresses claimed 192.168.1.1. The real gateway answered only when asked. The other sent the claim again and again, unprompted, to different hosts, and earlier in the capture that same MAC had honestly answered for its own IP. That link from the lying MAC back to a real address identifies the attacking machine.

While the poisoning lasts, the victims' traffic to the internet flows through that host: a **man-in-the-middle** position.

### How defenders stop it
- **Dynamic ARP Inspection (DAI)** on managed switches drops ARP replies that don't match the DHCP-snooping table of legitimate IP-to-MAC bindings.
- **Port security** and network segmentation (VLANs) limit who shares a broadcast domain.
- Static ARP entries for critical systems such as the gateway.
- Monitoring tools (arpwatch, IDS rules) alert when an IP's MAC changes or one MAC claims several IPs.
- **Encrypt everything** (TLS, SSH, VPN): a man-in-the-middle who can only see ciphertext, and can't forge certificates, gains very little.

**On the exam:** ARP poisoning, man-in-the-middle/on-path attacks and DAI are tested by name in Network+, Security+, CySA+ and CEH.`,
  },

  {
    id: "pkt-length",
    title: "The Length Field Lies",
    level: 4,
    slug: "never_trust_a_length_field",
    time: 15,
    certs: ["Security+", "PenTest+", "CEH", "GSEC", "CISSP"],
    objective: "A heartbeat handler echoes back as many bytes as the request's length field claims. Compare the claim with what was really sent and submit how many bytes of the server's memory leak in the reply.",
    answerLabel: "Bytes leaked",
    answerPlaceholder: "a number",
    lesson: `Binary protocols constantly say "the next N bytes are the payload". That N is a **length field**, and it is written by whoever sent the packet. Code that believes it without checking is the bridge between this track and the memory-safety one.

### The record format
\`\`\`
byte 0      type          0x01 = heartbeat request
bytes 1-2   length        payload length, 16-bit, big-endian
bytes 3...  payload       "length" bytes of data to echo back
\`\`\`

A heartbeat is a keep-alive: the client sends a few bytes, the server echoes the same bytes back.

### The C that parses it
\`\`\`c
uint16_t claimed = (rec[1] << 8) | rec[2];
\`\`\`
Two new operators, both working on bits:
- \`x << 8\` shifts x left by 8 bits (the same as multiplying by 256), moving the first byte into the high half.
- \`a | b\` is bitwise OR, which here simply merges the low byte in.

So for bytes \`01 2c\`: (0x01 << 8) | 0x2c = 0x012c = 300. This is the portable way to read a big-endian number.

\`\`\`c
memcpy(reply + 3, payload, claimed);
\`\`\`
\`memcpy(dst, src, n)\` copies exactly n bytes. It doesn't look for a terminator and doesn't know how big either buffer is.

### The question to ask
The function is told how many bytes were **actually received** (\`rec_len\`). Does it ever compare that with the length the packet **claims**? If a client sends a 5-byte payload but claims 16,000, where do the other bytes in the reply come from?

### Your task
Read \`heartbeat.c\` and the raw request in \`request.bin\`. Decode the claimed length (bytes 1-2, big-endian), count the payload bytes that were really sent (everything after byte 2), and submit the difference: the number of bytes of adjacent server memory included in the reply.`,
    hints: ["Bytes 1 and 2 of request.bin form the claimed length: convert the 4 hex digits to decimal.", "The real payload is everything from byte 3 to the end of the file. The viewer shows the file's total size; subtract the 3 header bytes.", "Leaked bytes = claimed length - real payload length."],
    workspace: { type: "files" },
    setup(ctx) {
      const payload = `ping-${ctx.word()}`.slice(0, ctx.int(7, 12));
      const claimed = ctx.int(0x1000, 0x7fff);
      const req = new Uint8Array([0x01, claimed >> 8, claimed & 255, ...[...payload].map((c) => c.charCodeAt(0))]);
      const c = String.raw`#include <stdint.h>
#include <string.h>

/* record: [type:1][length:2, big-endian][payload: length bytes] */

int handle_heartbeat(const uint8_t *rec, size_t rec_len, uint8_t *reply) {
    if (rec_len < 3 || rec[0] != 0x01) {
        return -1;                                  /* not a heartbeat request */
    }

    uint16_t claimed = (rec[1] << 8) | rec[2];      /* length field FROM THE PACKET */
    const uint8_t *payload = rec + 3;               /* payload starts after the header */

    reply[0] = 0x02;                                /* heartbeat response */
    reply[1] = rec[1];
    reply[2] = rec[2];
    memcpy(reply + 3, payload, claimed);            /* echo "claimed" bytes back */

    return 3 + claimed;                             /* number of bytes to send */
}
`;
      return { _n: claimed - payload.length, files: [
        { name: "heartbeat.c", kind: "code", label: "C", note: "The server's heartbeat handler. rec points at the received bytes; rec_len is how many arrived.", data: c },
        { name: "request.bin", kind: "hex", note: "The complete request as received from the client. Nothing follows the last byte shown.", data: req },
      ] };
    },
    check(input, ctx, env) { return norm.num(input) === env._n; },
    debrief: `The client sent a payload of a few bytes and claimed thousands. The handler never compared \`claimed\` with \`rec_len\`, so \`memcpy\` read far past the end of the received record and copied whatever followed it in the server's memory into the reply: an **out-of-bounds read** triggered entirely by one dishonest number.

This is, in miniature, **Heartbleed** (CVE-2014-0160), the OpenSSL bug that let anyone on the internet pull up to 64 KB of memory per request from a vulnerable server, including passwords, session cookies and private keys. The real fix was the same single check that is missing here:

\`\`\`c
if (claimed > rec_len - 3) return -1;   /* claims more than was sent: discard */
\`\`\`

### How defenders stop it
- **Validate every length against the data actually received** before using it, and enforce a sane maximum.
- Parse with bounds-checked readers, or in memory-safe languages, so an out-of-range read fails instead of leaking.
- **Fuzz** protocol parsers under AddressSanitizer; this bug class is exactly what fuzzers find.
- After such a bug: patch, then **rotate everything the process held in memory** (keys, certificates, session tokens, passwords).

**On the exam:** Heartbleed is a standard case study for Security+, CEH and CISSP; improper input validation (CWE-20) and out-of-bounds read (CWE-125) are the weaknesses behind it.`,
  },
];
