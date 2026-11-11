// Track: Recon & Social Engineering. Open-source intelligence and the human attack surface.
import { norm } from "../flags.js";

const doc = (name, note, text, kind = "text") => ({ files: [{ name, kind, note, data: text }] });

export default [
  {
    id: "osint-technique",
    title: "Name the Play",
    level: 1,
    slug: "social_engineering_techniques",
    time: 7,
    certs: ["Security+", "ISC2 CC", "CEH"],
    objective: "Read the scenario and name the social-engineering technique being used.",
    answerLabel: "Technique",
    answerPlaceholder: "phishing, pretexting, baiting…",
    lesson: `Technology aside, the easiest way into an organisation is often a **person**. **Social engineering** manipulates people into breaking security. The named techniques:

- **Phishing** — a mass deceptive message (usually email) luring clicks or credentials. **Spear phishing** targets one person; **whaling** targets an executive.
- **Vishing** — phishing by voice call. **Smishing** — by SMS.
- **Pretexting** — inventing a believable scenario/role ("IT support needs your password to fix your account").
- **Baiting** — leaving tempting malware-laden bait, like a USB drive in the car park.
- **Tailgating / piggybacking** — following an authorised person through a secure door.
- **Quid pro quo** — offering a "service" in exchange for access or info.

They lean on urgency, authority and helpfulness.

### Your task
Read the scenario and answer with the **technique** it describes.`,
    hints: ["Focus on the method: a phone call? a dropped USB? following someone through a door? a fake identity?", "A USB left to be found is baiting. Following someone through a badge door is tailgating. A convincing fake role is pretexting."],
    workspace: { type: "files" },
    setup(ctx) {
      const cases = [
        { a: "baiting", keys: ["baiting", "bait"], text: "An attacker scatters several USB drives labelled 'Q3 Layoffs — Confidential' in the company car park, hoping an employee plugs one into their work machine." },
        { a: "tailgating", keys: ["tailgating", "tailgate", "piggyback"], text: "Carrying two coffees and no badge, a stranger smiles at an employee badging into the server floor and slips through the door right behind them." },
        { a: "pretexting", keys: ["pretext"], text: "A caller claims to be from the IT help desk, says there's an urgent account problem, and asks the employee to confirm their password so they can 'fix' it." },
        { a: "vishing", keys: ["vishing"], text: "The finance team gets a phone call from someone impersonating the CFO, using a spoofed caller ID, pressuring them to approve a wire transfer immediately." },
        { a: "spear phishing", keys: ["spear", "phishing"], text: "One specific engineer receives a tailored email referencing a real project and a colleague's name, with a link to a fake login page for their code repository." },
      ];
      const pick = cases[ctx.int(0, cases.length - 1)];
      return { _keys: pick.keys, ...doc("scenario.txt", "A social-engineering scenario. Which technique is it?", pick.text + "\n\nAnswer with the technique's name.") };
    },
    check(input, ctx, env) {
      const v = norm.text(input);
      return env._keys.some((k) => v.includes(k));
    },
    debrief: `You named the technique. Classifying the *method* matters because the **defence** differs: baiting needs endpoint controls and USB policy; tailgating needs physical access control and awareness; pretexting and vishing need verification procedures.

### How defenders stop it
- Security-awareness training and realistic phishing simulations.
- Verify identity out-of-band for any sensitive request (callbacks, code words).
- Physical controls (mantraps, badge-in/badge-out) and endpoint controls (USB blocking, app allow-listing).

**On the exam:** the social-engineering taxonomy and its psychological triggers are guaranteed on Security+, ISC2 CC and CEH.`,
  },

  {
    id: "osint-metadata",
    title: "Hidden in the Metadata",
    level: 2,
    slug: "document_metadata_leaks",
    time: 9,
    certs: ["CEH", "CySA+", "PenTest+"],
    objective: "A PDF the company published online carries revealing metadata. Read it and recover the flag.",
    lesson: `Every file quietly records **metadata** — data about the data. Photos store **EXIF** (camera model, timestamp, often **GPS coordinates**). Office documents and PDFs store the **author**, the **software** and version, the **original filename**, edit history, even internal usernames and paths.

Organisations publish documents online without scrubbing this, handing attackers free **reconnaissance**: valid usernames (for password attacks), internal software versions (for exploits), folder structures, and physical locations from photo GPS. Tools like \`exiftool\` dump it in seconds.

### Your task
The file is an \`exiftool\`-style metadata dump of a published PDF. Read the fields — one of them leaks a secret. Recover the flag.`,
    hints: ["Read every metadata field, not just the obvious ones.", "Fields like Author, Creator, Keywords, Producer or Comments often leak internal info — the flag is in one of them."],
    workspace: { type: "files" },
    setup(ctx) {
      const dump = [
        `File Name                       : quarterly-report.pdf`,
        `File Size                       : 842 kB`,
        `PDF Version                     : 1.7`,
        `Author                          : j.okafor`,
        `Creator                         : Microsoft Word 2016`,
        `Producer                        : Acrobat Distiller 11.0 (Windows)`,
        `Create Date                     : 2026:05:30 14:22:09`,
        `Company                         : Northwind Traders`,
        `Comments                        : internal draft — do not circulate — review token ${ctx.flag}`,
        `Original Path                   : C:\\Users\\j.okafor\\Documents\\Finance\\drafts\\`,
      ].join("\n");
      return doc("metadata.txt", "exiftool output for a PDF the company put on its website.", dump);
    },
    debrief: `The metadata leaked a valid internal **username** (\`j.okafor\`), the exact **software versions**, an internal **folder path**, and a secret **token** in the Comments field — all from a file published without scrubbing.

### How defenders stop it
- **Strip metadata** from documents and images before publishing (automated sanitisers, "Inspect Document" in Office).
- Set policy for what goes on the public site and scan published files.
- Strip EXIF/GPS from images users upload.

**On the exam:** metadata as a recon source and metadata scrubbing are tested in CEH, CySA+ and PenTest+.`,
  },

  {
    id: "osint-typosquat",
    title: "Spot the Lookalike",
    level: 2,
    slug: "typosquatting_domains",
    time: 9,
    certs: ["Security+", "ISC2 CC", "CEH"],
    objective: "One domain in the list impersonates a legitimate brand to phish users. Submit the fraudulent domain.",
    answerLabel: "Fraudulent domain",
    answerPlaceholder: "the lookalike domain",
    lesson: `Phishing links work because the domain **looks** right at a glance. Attackers register lookalikes:

- **Typosquatting** — a near-miss spelling: \`paypa1.com\` (digit 1 for l), \`gooogle.com\`, \`micros0ft.com\`.
- **Combosquatting** — adding words: \`apple-support-secure.com\`, \`login-microsoft.com\`.
- **Different TLD** — \`yourbank.co\` instead of \`.com\`, or a random subdomain: \`yourbank.com.evil.ru\`.
- **Homoglyphs** — characters that look identical (a Cyrillic \`а\` for a Latin \`a\`).

The skill is reading a domain **right-to-left**: the real site is the registered domain just before the TLD. In \`login.microsoft.com.evil.ru\`, the real owner is \`evil.ru\`, not Microsoft.

### Your task
Review the domains. Exactly one is a fraudulent lookalike of a well-known brand. Submit that domain.`,
    hints: ["Read each domain carefully, right to left. What's the real registered domain before the TLD?", "Look for a digit standing in for a letter, an extra word, a wrong TLD, or the brand pushed into a subdomain.", "Submit the full fraudulent domain exactly as written."],
    workspace: { type: "files" },
    setup(ctx) {
      const squats = [
        `secure-${ctx.pick(["paypa1", "app1e", "netf1ix", "micros0ft"])}.com`,
        `${ctx.pick(["microsoft", "google", "apple"])}.com.account-verify.${ctx.word()}.ru`,
        `${ctx.pick(["amazon", "paypal", "netflix"])}-support-login.com`,
      ];
      const squat = squats[ctx.int(0, squats.length - 1)];
      const legit = ctx.shuffle([
        "www.google.com", "github.com", "login.microsoftonline.com", "accounts.google.com",
        "www.paypal.com", "outlook.office.com", "cdn.cloudflare.com",
      ]).slice(0, 5);
      const all = ctx.shuffle([squat, ...legit]);
      return { _domain: squat, ...doc("domains.txt", "Domains seen in this week's inbound email links. One is fraudulent.", all.join("\n")) };
    },
    check(input, ctx, env) {
      return norm.text(input).replace(/^https?:\/\//, "").replace(/\/.*$/, "") === norm.text(env._domain);
    },
    debrief: `One domain impersonated a trusted brand — a digit swapped for a letter, an extra "support/login", or the brand buried in a subdomain so the real owner was something else entirely. Reading right-to-left exposes it.

### How defenders stop it
- Email security that detects lookalike/newly-registered domains and brand impersonation.
- **DMARC** to stop spoofing of your *own* domain; register common typo variants defensively.
- Teach users to hover links and read the registered domain, and to navigate by bookmark, not by link.

**On the exam:** typosquatting, combosquatting and reading URLs are tested in Security+, ISC2 CC and CEH.`,
  },

  {
    id: "osint-breach-reuse",
    title: "Password Reuse",
    level: 3,
    slug: "credential_stuffing_source",
    time: 11,
    certs: ["CySA+", "CEH", "PenTest+"],
    objective: "A target reused a password exposed in an old breach. Given their email and a breach dump, find the password they likely reused.",
    answerLabel: "Reused password",
    answerPlaceholder: "the exposed password",
    lesson: `People reuse passwords. Attackers exploit this with **credential stuffing**: take username/password pairs leaked from one breached site and try them on *other* sites. If a user's password from a hobby forum breach matches their work email, the attacker is in — no "hacking" required.

**OSINT** feeds this: services and leaked **combo lists** map an email address to passwords exposed in past breaches. An attacker looks up the target's email and tries whatever comes back.

This is also a defender's tool: checking whether your users' credentials appear in known breaches (e.g., Have I Been Pwned) lets you force resets before attackers strike.

### Your task
You have the target's **email** and a **breach dump** (\`email:password\` lines). Find the entry for the target's email and submit the **password** exposed for it.`,
    hints: ["The target's email is given in the note. Search the breach dump for that exact address.", "Use the file's filter box to find the line starting with the target's email.", "Submit the password after the colon on that line."],
    workspace: { type: "files" },
    setup(ctx) {
      const target = `${ctx.word()}.${ctx.pick(["okafor", "nguyen", "silva", "ahmed"])}@northwind.com`;
      const pass = ctx.word() + ctx.int(1980, 2024);
      const others = [];
      for (let i = 0; i < 30; i++) others.push(`${ctx.word()}${ctx.int(1, 99)}@${ctx.pick(["mail.com", "example.org", "webmail.net", "fastmail.co"])}:${ctx.word()}${ctx.int(10, 9999)}`);
      others.splice(ctx.int(5, 24), 0, `${target}:${pass}`);
      return {
        _pass: pass,
        files: [{ name: "breach_combo.txt", kind: "log", note: `Leaked combo list from a 2021 forum breach. Target email: ${target}`, data: others.join("\n") }],
      };
    },
    check(input, ctx, env) {
      return norm.text(input) === norm.text(env._pass);
    },
    debrief: `The target's work email appeared in an old third-party breach with a password beside it. If they reused it, credential stuffing walks straight into their account — the breach wasn't even of your systems.

### How defenders stop it
- Check credentials against **breach corpora** and force resets on hits.
- Kill reuse with **MFA** and a password manager pushing unique passwords.
- Detect stuffing: many failed logins across many accounts from one source; add rate-limiting and bot detection.

**On the exam:** credential stuffing, password reuse and breach-data OSINT are tested in CySA+, CEH and PenTest+.`,
  },
];
