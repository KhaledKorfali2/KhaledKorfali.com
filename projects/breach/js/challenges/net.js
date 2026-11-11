// Track: Networks & Packet Analysis. Uses the pcap engine. Read captures like an analyst.
import { norm } from "../flags.js";

export default [
  {
    id: "net-cleartext",
    title: "Credentials in the Clear",
    level: 2,
    slug: "ftp_sends_plaintext",
    time: 10,
    certs: ["Security+", "CySA+", "CEH", "Network+", "GSEC", "ISC2 CC"],
    objective: "This capture contains an FTP login. Read the password out of the packets and submit it.",
    answerLabel: "Password",
    answerPlaceholder: "the FTP password",
    lesson: `A **packet capture** (pcap) is a recording of network traffic. Analysts open them in Wireshark to see exactly what crossed the wire. The viewer on the right works the same way: a list of packets up top, details below.

Many old protocols send everything **in plaintext**, including passwords:
- **FTP** (file transfer) — \`USER\` and \`PASS\` commands
- **Telnet** (remote shell)
- **HTTP** (web) — form fields

Anyone capturing the network — on shared Wi-Fi, a compromised switch, a tapped link — reads those credentials directly.

### How to read it
- Type a **display filter** like \`ftp\` and press Enter to show only FTP packets.
- Click a packet to see its details and payload.
- Right-click → **Follow stream** to read the whole conversation as text, with each side colour-coded.`,
    hints: ["Filter the capture to just FTP traffic: type ftp in the filter box and press Enter.", "Look for the FTP command 'PASS' — the password follows it. Or use Follow stream to read the whole login."],
    workspace: { type: "pcap" },
    setup(ctx) {
      const user = "svc_backup", pass = ctx.word() + ctx.int(100, 999);
      const c = "10.0.4.22", s = "10.0.4.9";
      return {
        _pass: pass,
        filter: "",
        packets: [
          { t: 0.001, src: c, dst: s, proto: "TCP", sport: 50112, dport: 21, info: "SYN", flags: "S" },
          { t: 0.002, src: s, dst: c, proto: "TCP", sport: 21, dport: 50112, info: "SYN, ACK", flags: "SA" },
          { t: 0.003, src: c, dst: s, proto: "TCP", sport: 50112, dport: 21, info: "ACK", flags: "A" },
          { t: 0.010, src: s, dst: c, proto: "FTP", sport: 21, dport: 50112, info: "Response: 220 Welcome to CorpFTP", data: "220 Welcome to CorpFTP\r\n" },
          { t: 0.021, src: c, dst: s, proto: "FTP", sport: 50112, dport: 21, info: `Request: USER ${user}`, data: `USER ${user}\r\n` },
          { t: 0.028, src: s, dst: c, proto: "FTP", sport: 21, dport: 50112, info: "Response: 331 Password required", data: "331 Password required\r\n" },
          { t: 0.035, src: c, dst: s, proto: "FTP", sport: 50112, dport: 21, info: `Request: PASS ${pass}`, data: `PASS ${pass}\r\n` },
          { t: 0.042, src: s, dst: c, proto: "FTP", sport: 21, dport: 50112, info: "Response: 230 Login successful", data: "230 Login successful\r\n" },
          { t: 0.060, src: c, dst: s, proto: "FTP", sport: 50112, dport: 21, info: "Request: RETR flag.txt", data: "RETR flag.txt\r\n" },
          { t: 0.071, src: s, dst: c, proto: "FTP", sport: 21, dport: 50112, info: "Response: 150 Opening data connection", data: "150 Opening data connection\r\n" },
          { t: 0.090, src: s, dst: c, proto: "FTP", sport: 20, dport: 50113, info: `FTP Data: ${ctx.flag}`, data: ctx.flag + "\n" },
        ],
      };
    },
    check(input, ctx, env) {
      return norm.text(input) === norm.text(env._pass);
    },
    debrief: `The FTP password crossed the network in a plain \`PASS\` command, readable to anyone capturing traffic. The file transfer, including our flag, was plaintext too.

### How defenders stop it
- Replace plaintext protocols with encrypted ones: **FTPS/SFTP** instead of FTP, **SSH** instead of Telnet, **HTTPS** instead of HTTP.
- Segment networks and use switch security so attackers can't easily capture others' traffic.
- Monitor for cleartext-credential protocols still in use.

**On the exam:** Security+, CySA+ and CEH all test recognising insecure protocols and reading credentials from a capture.`,
  },

  {
    id: "net-scan",
    title: "Someone's Knocking",
    level: 3,
    slug: "spot_the_port_scan",
    time: 10,
    certs: ["Security+", "CySA+", "CEH", "Network+"],
    objective: "One host is scanning another. Identify the attacker's IP address and submit it.",
    answerLabel: "Scanner IP",
    answerPlaceholder: "e.g. 10.0.0.5",
    lesson: `Before attacking, an intruder does **reconnaissance**: finding which services a target runs. A **port scan** sends a connection attempt (a TCP \`SYN\`) to many ports in quick succession and watches the replies:
- a \`SYN, ACK\` back → the port is **open** (a service is listening)
- a \`RST\` back → the port is **closed**

In a capture, a scan is obvious once you know the shape: **one source IP** firing \`SYN\` packets at **one destination** across **many different ports** in a very short time.

### How to read it
Scroll the packet list and watch the destination **ports** climb while the source stays the same. The **SYN** packets (no ACK) come from the scanner. Filter with \`tcp.flags\` concepts or just read the Info column.`,
    hints: ["A scan is one source hitting many destination ports fast. Watch the Info and port columns.", "The host sending all the SYN packets to many ports is the scanner. Submit its source IP."],
    workspace: { type: "pcap" },
    setup(ctx) {
      const attacker = ctx.ip("10.0.9."), victim = ctx.ip("10.0.9.");
      const openPorts = new Set([22, 80, 443]);
      const ports = [21, 22, 23, 25, 53, 80, 110, 139, 143, 443, 445, 3306, 3389, 8080];
      const packets = [];
      let t = 0;
      ports.forEach((p, i) => {
        t += 0.004 + ctx.rng() * 0.002;
        packets.push({ t: +t.toFixed(4), src: attacker, dst: victim, proto: "TCP", sport: 44000 + i, dport: p, info: "SYN", flags: "S" });
        t += 0.001;
        if (openPorts.has(p)) packets.push({ t: +t.toFixed(4), src: victim, dst: attacker, proto: "TCP", sport: p, dport: 44000 + i, info: "SYN, ACK", flags: "SA" });
        else packets.push({ t: +t.toFixed(4), src: victim, dst: attacker, proto: "TCP", sport: p, dport: 44000 + i, info: "RST, ACK", flags: "RA" });
      });
      return { _attacker: attacker, packets };
    },
    check(input, ctx, env) {
      return norm.ip(input) === env._attacker;
    },
    debrief: `One host swept fourteen ports on another in well under a second — the signature of a **port scan** (here, a TCP SYN scan). Three ports answered \`SYN, ACK\` (open); the rest answered \`RST\` (closed). The scanner is the single source of all those SYNs.

### How defenders stop it
- **IDS/IPS** (Snort, Suricata, Zeek) flag the many-ports-one-source pattern automatically.
- Firewalls drop unsolicited connection attempts and rate-limit them.
- Reducing exposed services shrinks what a scan can find.

**On the exam:** recognising scan patterns in traffic is core to CySA+ and appears in Security+ and CEH. The SYN → SYN/ACK (open) vs SYN → RST (closed) behaviour is frequently tested.`,
  },

  {
    id: "net-exfil",
    title: "Data Walking Out the Door",
    level: 4,
    slug: "dns_tunnel_exfil",
    time: 13,
    certs: ["CySA+", "CEH", "Network+"],
    objective: "Data is being smuggled out over DNS. Reassemble it to recover the flag.",
    lesson: `When attackers can't send stolen data out directly (a firewall blocks it), they **tunnel** it through a protocol that *is* allowed. **DNS** is a favourite: almost every network lets DNS queries out so names can be resolved.

The trick: encode the stolen data into the **subdomain** of lookups to a domain the attacker controls.

\`\`\`
QUERY  aGVsbG8.exfil.attacker.com
QUERY  d29ybGQ.exfil.attacker.com
\`\`\`

Each query carries a chunk. The attacker's DNS server logs them, strips the domain, and reassembles the pieces. To the firewall it looks like ordinary name resolution.

### How to read it
Filter to \`dns\`. Read the queried names in order. Pull out the **leftmost label** of each (the part before \`.exfil\`), concatenate them, and decode the result — it's Base64. The Toolkit will finish the job.`,
    hints: ["Filter the capture to dns and read the query names in time order.", "Take the first label of each query (before .exfil...) and join them together.", "The joined string is Base64. Decode it in the Toolkit to get the flag."],
    workspace: { type: "pcap" },
    setup(ctx) {
      const b64 = btoa(ctx.flag).replace(/=+$/, "");
      const dom = `exfil.${ctx.word()}.net`;
      const client = ctx.ip("10.0.2."), dns = "10.0.2.1";
      const chunks = b64.match(/.{1,8}/g) || [b64];
      const packets = [];
      let t = 0;
      chunks.forEach((ch, i) => {
        t += 0.05 + ctx.rng() * 0.03;
        packets.push({ t: +t.toFixed(3), src: client, dst: dns, proto: "DNS", sport: 50000 + i, dport: 53, info: `Standard query A ${ch}.${dom}`, data: `${ch}.${dom}` });
        t += 0.004;
        packets.push({ t: +t.toFixed(3), src: dns, dst: client, proto: "DNS", sport: 53, dport: 50000 + i, info: `Standard query response A ${ch}.${dom}`, data: `${ch}.${dom} NXDOMAIN` });
      });
      return { filter: "dns", packets };
    },
    debrief: `Each DNS query smuggled an 8-character chunk of Base64 in its subdomain. Joined and decoded, the chunks rebuilt the flag. This is **DNS exfiltration** (a form of tunnelling).

### How defenders stop it
- Watch for DNS anomalies: very long or high-entropy subdomains, huge query volume to one domain, lots of \`NXDOMAIN\` responses.
- Force all DNS through controlled resolvers and log it.
- DNS-security and DLP tools flag tunnelling patterns.

**On the exam:** DNS tunnelling/exfiltration is a named technique in CySA+ and CEH (and MITRE ATT&CK T1048/T1071).`,
  },

  {
    id: "net-http-creds",
    title: "Login Over HTTP",
    level: 2,
    slug: "http_post_is_plaintext",
    time: 10,
    certs: ["Security+", "CySA+", "Network+"],
    objective: "A user logged into a website over plain HTTP. Recover the password they submitted.",
    answerLabel: "Password",
    answerPlaceholder: "the submitted password",
    lesson: `When a site uses plain **HTTP** instead of HTTPS, the whole request — including anything you type into a form — crosses the network unencrypted. A login form sends your username and password in a **POST body**:

\`\`\`
POST /login HTTP/1.1
Host: example.com
Content-Type: application/x-www-form-urlencoded

username=alice&password=s3cr3t
\`\`\`

Anyone capturing the traffic reads that body directly. This is why the padlock (HTTPS) matters: it encrypts the request so the POST body can't be read in transit.

### Your task
Filter the capture to HTTP, find the POST to the login endpoint, and read the `+"`password=`"+` value from its body. **Follow stream** shows the whole request at once.`,
    hints: ["Filter to http and look for the POST request to a login path.", "The form body contains username= and password=. Read the password value.", "Follow stream on that packet shows the full request body."],
    workspace: { type: "pcap" },
    setup(ctx) {
      const user = ctx.word(), pass = ctx.word() + ctx.int(10, 99) + "!";
      const c = "10.0.5." + ctx.int(20, 90), s = "192.0.2." + ctx.int(5, 200);
      const body = `username=${user}&password=${pass}`;
      return {
        _pass: pass,
        filter: "http",
        packets: [
          { t: 0.01, src: c, dst: s, proto: "TCP", sport: 51020, dport: 80, info: "SYN", flags: "S" },
          { t: 0.02, src: s, dst: c, proto: "TCP", sport: 80, dport: 51020, info: "SYN, ACK", flags: "SA" },
          { t: 0.03, src: c, dst: s, proto: "TCP", sport: 51020, dport: 80, info: "ACK", flags: "A" },
          { t: 0.05, src: c, dst: s, proto: "HTTP", sport: 51020, dport: 80, info: "GET /login HTTP/1.1", data: "GET /login HTTP/1.1\r\nHost: portal.example\r\n\r\n" },
          { t: 0.07, src: s, dst: c, proto: "HTTP", sport: 80, dport: 51020, info: "HTTP/1.1 200 OK (text/html)", data: "HTTP/1.1 200 OK\r\n\r\n<form method=post action=/login>...</form>" },
          { t: 0.20, src: c, dst: s, proto: "HTTP", sport: 51020, dport: 80, info: "POST /login HTTP/1.1 (application/x-www-form-urlencoded)", data: `POST /login HTTP/1.1\r\nHost: portal.example\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: ${body.length}\r\n\r\n${body}` },
          { t: 0.24, src: s, dst: c, proto: "HTTP", sport: 80, dport: 51020, info: "HTTP/1.1 302 Found (Location: /dashboard)", data: "HTTP/1.1 302 Found\r\nLocation: /dashboard\r\n\r\n" },
        ],
      };
    },
    check(input, ctx, env) {
      return norm.text(input) === norm.text(env._pass);
    },
    debrief: `The login POST crossed the wire over plain HTTP, so its body — `+"`username=...&password=...`"+` — was fully readable in the capture. HTTPS would have encrypted the entire request.

### How defenders stop it
- Serve **everything** over HTTPS and add **HSTS** so browsers refuse plain HTTP.
- Redirect HTTP to HTTPS, and never post credentials to an http:// endpoint.
- On shared networks, assume unencrypted traffic is being captured.

**On the exam:** reading HTTP POST credentials from a capture and the HTTP-vs-HTTPS distinction are core to Security+, Network+ and CySA+.`,
  },
];
