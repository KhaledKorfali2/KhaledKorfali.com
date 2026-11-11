// Track: Forensics & Defense. Uses the files engine (log / email / hex / image).
import { norm } from "../flags.js";

// Draw a gradient, then hide `text` (then a NUL) in the R,G,B LSBs, MSB-first per byte,
// matching the files engine's "Extract LSB text" reader.
function lsbImage(text) {
  return (canvas) => {
    const w = 120, h = 120;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      d[i] = (x * 2) % 256; d[i + 1] = (y * 2) % 256; d[i + 2] = ((x + y)) % 256; d[i + 3] = 255;
    }
    const bytes = [...text].map((c) => c.charCodeAt(0)).concat(0);
    let bit = 0;
    for (const byte of bytes) for (let b = 7; b >= 0; b--) {
      const channel = bit % 3, pixel = Math.floor(bit / 3);
      const idx = pixel * 4 + channel;
      d[idx] = (d[idx] & 0xfe) | ((byte >> b) & 1);
      bit++;
    }
    ctx.putImageData(img, 0, 0);
  };
}

export default [
  {
    id: "blue-logs",
    title: "Who Broke In?",
    level: 2,
    slug: "read_the_auth_log",
    time: 11,
    certs: ["Security+", "CySA+", "GSEC", "ISC2 CC"],
    objective: "An attacker brute-forced an SSH login and eventually succeeded. Find the IP address that logged in successfully.",
    answerLabel: "Attacker IP",
    answerPlaceholder: "e.g. 203.0.113.9",
    lesson: `When something goes wrong, the **logs** tell the story. A Linux auth log records every login attempt:

\`\`\`
Failed password for root from 203.0.113.9 port 51144 ssh2
Accepted password for admin from 198.51.100.7 port 4012 ssh2
\`\`\`

A **brute-force attack** shows up as a flood of \`Failed password\` lines from one IP in a short window. If one of those attempts finally says \`Accepted\`, the attacker got in.

### How to read it
The file opens as a **log** with a filter box and line numbers. Filter for \`Failed password\` to see the attack, and for \`Accepted\` to see which login succeeded. Note the IP that appears in both: hammering with failures, then one success.`,
    hints: ["Open auth.log and filter for 'Failed password' — one IP dominates.", "Now filter for 'Accepted password'. The attacker's IP is the one that failed many times AND then succeeded."],
    workspace: { type: "files" },
    setup(ctx) {
      const attacker = `203.0.113.${ctx.int(2, 250)}`;
      const normals = ["198.51.100.7", "192.0.2.44", "10.0.0.15"];
      const users = ["root", "admin", "oracle", "test", "ubuntu", "git"];
      const lines = [];
      let mo = "Jun 14", hh = 2, mm = 11, ss = 3;
      const ts = () => { ss += ctx.int(1, 3); if (ss >= 60) { ss -= 60; mm++; } if (mm >= 60) { mm -= 60; hh++; } return `${mo} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`; };
      // background noise + the brute force interleaved
      for (let i = 0; i < 60; i++) {
        if (ctx.rng() < 0.75) lines.push(`${ts()} web01 sshd[${ctx.int(1000, 9999)}]: Failed password for ${ctx.pick(users)} from ${attacker} port ${ctx.int(40000, 60000)} ssh2`);
        else lines.push(`${ts()} web01 sshd[${ctx.int(1000, 9999)}]: Accepted password for deploy from ${ctx.pick(normals)} port ${ctx.int(4000, 6000)} ssh2`);
      }
      lines.push(`${ts()} web01 sshd[${ctx.int(1000, 9999)}]: Accepted password for root from ${attacker} port ${ctx.int(40000, 60000)} ssh2`);
      for (let i = 0; i < 6; i++) lines.push(`${ts()} web01 sshd[${ctx.int(1000, 9999)}]: Accepted password for deploy from ${ctx.pick(normals)} port ${ctx.int(4000, 6000)} ssh2`);
      return { _ip: attacker, files: [{ name: "auth.log", kind: "log", note: "SSH authentication log from web01. The flag for this challenge is the attacker's IP address.", data: lines.join("\n") }] };
    },
    check(input, ctx, env) {
      return norm.ip(input) === env._ip;
    },
    debrief: `The attacker's IP showed dozens of \`Failed password\` lines (a brute-force), then a single \`Accepted password for root\` — a successful compromise. Correlating failures with the eventual success is the core move of log analysis.

### How defenders stop it
- Rate-limit and lock out repeated failures (fail2ban), and disable password SSH in favour of keys.
- Centralise logs into a **SIEM** and alert on brute-force patterns automatically.
- Alert on successful logins from IPs that just generated many failures.

**On the exam:** log correlation and brute-force detection are central to CySA+ and appear in Security+.`,
  },

  {
    id: "blue-phish",
    title: "Spot the Spoof",
    level: 2,
    slug: "headers_reveal_phishing",
    time: 11,
    certs: ["Security+", "CySA+", "CEH"],
    objective: "This email claims to be from the CEO. Read its headers to decide if it's genuine, and submit the flag shown once you've found the proof it's forged.",
    lesson: `A phishing email's **From** line is trivially faked — it's just text the sender chooses. The truth is in the **headers**, which record the mail's real journey:

- **Received:** chain — the servers it actually passed through, bottom (oldest) to top (newest).
- **Return-Path / envelope sender** — where bounces really go.
- **Authentication-Results:** — the receiving server's verdicts:
  - **SPF** — was the sending server allowed to send for that domain?
  - **DKIM** — is the cryptographic signature valid?
  - **DMARC** — do the above line up with the From domain?

A \`From:\` of \`ceo@yourcompany.com\` with **SPF fail / DKIM fail / DMARC fail** and a \`Received\` from some unrelated server is a forgery.

### How to read it
The file opens as an **email**: header names highlighted, with an **Auth results** summary and a **Received chain**. Judge whether the sender is who they claim.`,
    hints: ["Look at the Authentication-Results (or the Auth results summary): do SPF, DKIM and DMARC pass?", "Compare the From domain with the server in the Received chain and the Return-Path.", "Everything fails and the mail came from an unrelated server — it's forged. The flag is in the X-Analysis header."],
    workspace: { type: "files" },
    setup(ctx) {
      const realDomain = "northwind.com";
      const badHost = `mail-${ctx.hex(4)}.cheap-vps.example`;
      const raw = [
        `Return-Path: <billing@${badHost}>`,
        `Received: from ${badHost} (${ctx.ip("185.220.101.")}) by mx.northwind.com with ESMTP id ${ctx.hex(12)}; Tue, 14 Jun 2026 02:41:07 +0000`,
        `Authentication-Results: mx.northwind.com; spf=fail (sender not permitted) smtp.mailfrom=${badHost}; dkim=fail; dmarc=fail (p=reject) header.from=${realDomain}`,
        `From: "Dana Pike, CEO" <ceo@${realDomain}>`,
        `To: ap@${realDomain}`,
        `Subject: Urgent wire transfer needed before 3pm`,
        `Date: Tue, 14 Jun 2026 02:41:05 +0000`,
        `X-Analysis: ${ctx.flag}`,
        `Content-Type: text/plain`,
        ``,
        `Hi — I'm in back-to-back meetings. Please wire $48,200 to the new vendor account below immediately. Don't call, just get it done. — Dana`,
      ].join("\n");
      return { files: [{ name: "urgent.eml", kind: "email", note: "Reported to the SOC by an accounts-payable clerk. Is it really from the CEO?", data: raw }] };
    },
    debrief: `The \`From\` said CEO, but **SPF, DKIM and DMARC all failed** and the mail entered through an unrelated cheap-VPS server — a classic **Business Email Compromise** attempt pairing a spoofed sender with urgency and a payment request.

### How defenders stop it
- Publish and enforce **SPF, DKIM and DMARC** (with \`p=reject\`) so forged mail is rejected or quarantined.
- Flag external mail and train staff to verify payment changes out-of-band.
- Alert the SOC on auth failures that impersonate internal domains.

**On the exam:** email authentication (SPF/DKIM/DMARC) and phishing/BEC analysis are heavily tested in Security+, CySA+ and CEH.`,
  },

  {
    id: "blue-magic",
    title: "The Wrong Extension",
    level: 3,
    slug: "magic_bytes_dont_lie",
    time: 10,
    certs: ["CySA+", "CEH"],
    objective: "A file named like an image was quarantined. Identify what it really is from its magic bytes, and submit the flag hidden inside.",
    lesson: `A file's **extension** (\`.jpg\`, \`.pdf\`) is just part of its name and can claim anything. The real type is told by the first few bytes — the **magic number** or signature:

| Bytes | Type |
|---|---|
| \`89 50 4E 47\` | PNG |
| \`FF D8 FF\` | JPEG |
| \`25 50 44 46\` (\`%PDF\`) | PDF |
| \`4D 5A\` (\`MZ\`) | Windows executable |
| \`50 4B 03 04\` (\`PK\`) | ZIP / Office doc |

Malware is often disguised with an innocent extension. Analysts check the magic bytes to see what a file *really* is.

### How to read it
The file opens in a **hex view**: offset, hex bytes, ASCII. It identifies the signature for you. Look at what the file truly is, then read the ASCII column — the flag is in plain sight among the bytes.`,
    hints: ["Open the file and read the first bytes in the hex view. The magic-bytes line names the real type.", "The extension lies. Read the ASCII column on the right for the BREACH{...} string."],
    workspace: { type: "files" },
    setup(ctx) {
      // "photo.jpg" that is really a Windows executable (MZ), with the flag embedded in a string.
      const head = [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00];
      const filler = [];
      for (let i = 0; i < 48; i++) filler.push(ctx.int(0, 255));
      const tag = [...`This program cannot be run in DOS mode.`].map((c) => c.charCodeAt(0));
      const flag = [...`\x00FLAG=${ctx.flag}\x00`].map((c) => c.charCodeAt(0));
      const tail = [];
      for (let i = 0; i < 40; i++) tail.push(ctx.int(0, 255));
      return { files: [{ name: "photo.jpg", kind: "hex", note: "Quarantined attachment. The name says .jpg — does the file agree?", data: new Uint8Array([...head, ...filler, ...tag, ...flag, ...tail]) }] };
    },
    debrief: `The \`.jpg\` began with \`4D 5A\` (\`MZ\`) — a **Windows executable**, not an image. The magic bytes exposed the disguise, and the flag sat in a readable string inside the file.

### How defenders stop it
- Mail and web gateways check **true file type**, not extension, and block executables.
- EDR inspects file content and behaviour.
- Never trust a file's name; verify its signature.

**On the exam:** file signatures / magic bytes and content-based detection appear in CySA+ and CEH (and GCFA-style forensics).`,
  },

  {
    id: "blue-stego",
    title: "Hidden in Plain Sight",
    level: 4,
    slug: "least_significant_bits",
    time: 12,
    certs: ["CySA+", "CEH"],
    objective: "This innocent image carries a hidden message in its pixels. Extract it.",
    lesson: `**Steganography** hides data *inside* ordinary files so nothing looks amiss. The most common image method is **LSB** (least-significant-bit): tweak the last bit of each colour value. A red channel of \`200\` (\`11001000\`) becomes \`201\` (\`11001001\`) — a change no eye can see, but that last bit now carries one bit of a secret message. Spread across thousands of pixels, you can hide whole files.

Attackers use it to sneak data past filters; CTFs love it. To the viewer it's just a picture.

### How to read it
The file opens as an **image** with a **Bit plane** tool and an **Extract LSB text** button. The bit-plane view lets you *see* that the lowest bit isn't random noise. Then extract the hidden text directly.`,
    hints: ["Open the image. Try the Bit plane tool at bit 0 — structure there means data is hidden.", "Use the 'Extract LSB text' button to pull the message out of the pixels."],
    workspace: { type: "files" },
    setup(ctx) {
      return { files: [{ name: "vacation.png", kind: "image", note: "Looks like an ordinary photo. The lowest bit of each pixel tells another story.", data: lsbImage(ctx.flag) }] };
    },
    debrief: `The flag was encoded one bit per colour channel, invisible to the eye but obvious once you isolate the LSB plane and extract it. That's **LSB steganography**.

### How defenders stop it
- Steganography is hard to spot by eye; defenders use **stego-detection** tools and look for unusually high entropy in media.
- DLP and gateways can strip or re-encode images to destroy hidden payloads.
- Watch for the *behaviour* around stego — odd uploads/downloads of media — more than the images themselves.

**On the exam:** steganography and anti-forensics are named topics in CySA+ and CEH.`,
  },

  {
    id: "blue-weblog",
    title: "Needle in the Access Log",
    level: 3,
    slug: "find_the_attacker_requests",
    time: 12,
    certs: ["CySA+", "CEH", "GSEC"],
    objective: "An attacker probed this web server before getting a hit. In the access log, find the path that returned 200 after a run of 404s and submit it.",
    answerLabel: "The successful path",
    answerPlaceholder: "e.g. /admin/config.bak",
    lesson: `A web server's **access log** records every request: the client IP, the time, the method and path, and the **status code** the server returned.

\`\`\`
203.0.113.9 - - [14/Jun/2026:03:11:02] "GET /admin HTTP/1.1" 404
\`\`\`

An attacker **enumerating** hidden paths generates a burst of **404s** (not found) as they guess — then a **200** (or **403**) when they hit something real. That one success among the misses is the find. Spotting the pattern — many 404s from one IP, then a 200 — is bread-and-butter log analysis.

### Your task
Open the access log (filter box available). One IP sprays many 404s, then gets a single **200** on a sensitive path. Submit that **path** (the one that returned 200).`,
    hints: ["Find the IP making lots of requests. Most return 404.", "Filter for that activity and look for the one request that returned 200 instead of 404.", "Submit the URL path of that 200 response."],
    workspace: { type: "files" },
    setup(ctx) {
      const ip = `203.0.113.${ctx.int(2, 250)}`;
      const hitPath = ctx.pick([`/backup/db.sql`, `/.git/config`, `/admin/config.bak`, `/old/.env`, `/wp-config.php.save`]);
      const misses = ["/admin", "/login.bak", "/phpinfo.php", "/.env", "/config.php~", "/backup.zip", "/server-status", "/.htpasswd", "/test.php", "/api/debug"];
      const lines = [];
      let s = 2;
      const ts = () => { s += ctx.int(0, 1); return `14/Jun/2026:03:11:${String(s).padStart(2, "0")}`; };
      // normal traffic
      for (let i = 0; i < 4; i++) lines.push(`10.0.0.${ctx.int(2, 50)} - - [${ts()}] "GET / HTTP/1.1" 200`);
      // attacker scan
      for (const p of ctx.shuffle(misses)) lines.push(`${ip} - - [${ts()}] "GET ${p} HTTP/1.1" 404`);
      // the hit, inserted mid-scan
      lines.splice(ctx.int(6, 12), 0, `${ip} - - [${ts()}] "GET ${hitPath} HTTP/1.1" 200`);
      for (let i = 0; i < 3; i++) lines.push(`10.0.0.${ctx.int(2, 50)} - - [${ts()}] "GET /about HTTP/1.1" 200`);
      return { _path: hitPath, files: [{ name: "access.log", kind: "log", note: "Apache access log. Find the attacker's one successful hit.", data: lines.join("\n") }] };
    },
    check(input, ctx, env) {
      return norm.text(input).replace(/^https?:\/\/[^/]+/, "") === norm.text(env._path);
    },
    debrief: `One IP requested a dozen guessable paths — almost all **404** — then landed a **200** on an exposed backup/config path. The scan pattern (many misses, one hit, from a single IP in seconds) is exactly what to hunt for.

### How defenders stop it
- Alert on bursts of 404s from one source, and on 200s for sensitive paths.
- Remove the files attackers look for, and block dotfiles/backups at the server.
- Rate-limit and block scanning IPs; feed web logs into the SIEM.

**On the exam:** access-log analysis and enumeration detection are central to CySA+, CEH and GSEC.`,
  },

  {
    id: "blue-correlate",
    title: "Connect the Logs",
    level: 4,
    slug: "correlate_across_sources",
    time: 13,
    certs: ["CySA+", "GCIH", "GSEC"],
    objective: "A VPN login and a server login share a user. Correlate the two logs to find the external IP the attacker logged in from, then submit it.",
    lesson: `Real investigations join **multiple log sources**. One log rarely tells the whole story; the truth emerges when you line events up by **time** and a shared key (a username, a host, a session id).

Here you have a **VPN log** (who connected from which external IP, and when) and a **server auth log** (which user logged into a sensitive server, and when). A compromised account shows up as: a VPN connection from an **unusual external IP**, immediately followed by that same user authenticating to a server they don't normally touch.

### Your task
Find the user who connected over VPN from a suspicious external address and then, seconds later, logged into the finance server in the auth log. Submit the **external IP** of that VPN session.`,
    hints: ["Read both logs. Line them up by timestamp and username.", "Find a VPN session whose user then appears in the server auth log moments later.", "Submit the external IP from that VPN session (the public address, not the internal 10.x one)."],
    workspace: { type: "files" },
    setup(ctx) {
      const user = ctx.pick(["rkhan", "amoreno", "tcole", "pvarga"]);
      const badIP = ctx.int(80, 200) + "." + ctx.int(1, 254) + "." + ctx.int(1, 254) + "." + ctx.int(1, 254);
      const users = ["jlee", "swilson", user, "dkaur", "mobrien"];
      const vpn = [];
      const ts = (base) => `08:${String(base).padStart(2, "0")}`;
      users.forEach((u, i) => {
        const ip = u === user ? badIP : "198.51.100." + ctx.int(2, 250);
        vpn.push(`${ts(10 + i * 3)}  VPN connect  user=${u}  src=${ip}  assigned=10.8.0.${10 + i}`);
      });
      const auth = [
        `${ts(9)}  finance-srv  login user=jlee  from=10.8.0.10  OK`,
        `${ts(13 + users.indexOf(user) * 3)}  finance-srv  login user=${user}  from=10.8.0.${10 + users.indexOf(user)}  OK`,
        `${ts(30)}  finance-srv  login user=dkaur  from=10.8.0.13  OK`,
      ];
      return {
        _ip: badIP,
        files: [
          { name: "vpn.log", kind: "log", note: "VPN concentrator log: who connected from where.", data: vpn.join("\n") },
          { name: "finance-auth.log", kind: "log", note: "Finance server authentication log.", data: auth.join("\n") },
        ],
      };
    },
    check(input, ctx, env) {
      return norm.ip(input) === env._ip;
    },
    debrief: `Neither log was damning alone. Joined on **username and time**, they told the story: a user connected over VPN from an unfamiliar external IP, got an internal VPN address, and seconds later used that address to log into the finance server. That pivot is the attacker.

### How defenders stop it
- Centralise logs in a **SIEM** and write correlation rules that join sources (VPN + auth + endpoint).
- Alert on VPN logins from new countries/IPs (impossible travel) and on access to sensitive systems right after.
- Keep clocks in sync (NTP) so cross-source timestamps line up.

**On the exam:** multi-source correlation and SIEM analysis are central to CySA+, GCIH and GSEC.`,
  },
];
