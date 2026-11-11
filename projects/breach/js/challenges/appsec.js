// Track: Secure Coding & Review. Read code and config like a reviewer: find the
// secret, the vulnerable dependency, the missing validation. Identification, not exploitation.
import { norm } from "../flags.js";

const code = (name, note, text) => ({ files: [{ name, kind: "text", note, data: text }] });
const lines = (name, note, text) => ({ files: [{ name, kind: "log", note, data: text }] });

export default [
  {
    id: "appsec-secret",
    title: "Hardcoded Secret",
    level: 1,
    slug: "secrets_dont_belong_in_code",
    time: 7,
    certs: ["Security+", "PenTest+", "GSEC"],
    objective: "A developer left a secret in the source. Find it and submit the flag.",
    lesson: `One of the most common real-world findings: a **secret hardcoded in source code**. API keys, passwords and tokens get typed directly into a file "just to get it working", then committed and forgotten. Anyone who can read the code — a leaked repo, a decompiled app, an insider — gets the key.

Automated **secret scanners** (gitleaks, truffleHog, GitHub's own) grep code for things shaped like credentials: long random strings, \`API_KEY =\`, \`password =\`, private-key headers.

### Your task
Read the source file on the right. Find the hardcoded secret — it's the flag. The file view's filter box can help you jump to suspicious lines like \`key\` or \`secret\`.`,
    hints: ["Scan for variable names like key, token, secret or password.", "The assigned string value that looks like a credential is the flag."],
    workspace: { type: "files" },
    setup(ctx) {
      const src = `# config.py  — app configuration
import os

DEBUG = False
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = 5432

# TODO: move this to an env var before launch (ticket #4471)
PAYMENTS_API_KEY = "${ctx.flag}"

CACHE_TTL = 300
ALLOWED_HOSTS = ["app.example.com"]
LOG_LEVEL = "INFO"
`;
      return code("config.py", "Application config pulled from the repo. Review it.", src);
    },
    debrief: `The payment API key was sitting in plain text in \`config.py\`. Even with a TODO to fix it, once committed it lives in the repo's **history forever** — rotating the key is the only real remedy.

### How defenders stop it
- Keep secrets in **environment variables** or a secrets manager (Vault, AWS/GCP Secret Manager), never in code.
- Run **secret scanning** in CI and as a pre-commit hook to block them before they land.
- If a secret is committed, treat it as compromised: **rotate it**, don't just delete the line.

**On the exam:** hardcoded secrets and secrets management appear in Security+, PenTest+ and secure-coding objectives.`,
  },

  {
    id: "appsec-dependency",
    title: "A Vulnerable Dependency",
    level: 2,
    slug: "software_composition_analysis",
    time: 10,
    certs: ["Security+", "CySA+", "GSEC"],
    objective: "A security advisory names a vulnerable package version. Find the matching dependency in the project and submit its name.",
    answerLabel: "Package name",
    answerPlaceholder: "the vulnerable package",
    lesson: `Modern apps are mostly **other people's code** — dozens or hundreds of open-source dependencies. When a vulnerability (a **CVE**) is found in one of those packages, every app using the affected version inherits it. The Log4Shell crisis of 2021 was exactly this: one logging library, everywhere.

**Software Composition Analysis (SCA)** is the defence: inventory every dependency and version (a **Software Bill of Materials**, SBOM), then match it against vulnerability advisories. A hit means "you ship this flaw — upgrade."

### Your task
You have a **security advisory** and the project's **dependency list**. Find the package whose installed version falls in the advisory's vulnerable range, and submit its **name**.`,
    hints: ["Read the advisory: which package and which versions are affected?", "Find that package in the dependency list and check whether its version is in the vulnerable range.", "Submit the package name that matches both."],
    workspace: { type: "files" },
    setup(ctx) {
      const pkg = ctx.pick(["fastjson", "libimage", "authkit", "xmlparse", "netcache"]);
      const badVer = `2.${ctx.int(0, 6)}.${ctx.int(0, 9)}`;
      const deps = ctx.shuffle([
        `${pkg}==${badVer}`,
        `requests==2.31.0`,
        `${ctx.word()}lib==1.4.2`,
        `${ctx.word()}-core==3.9.1`,
        `pytz==2024.1`,
        `${ctx.word()}util==0.8.0`,
      ]);
      const advisory = `SECURITY ADVISORY  CVE-2024-${ctx.int(10000, 49999)}\n` +
        `Severity: CRITICAL (CVSS 9.8) — remote code execution\n` +
        `Affected package: ${pkg}\n` +
        `Affected versions: >= 2.0.0, < 3.0.0\n` +
        `Fixed in: 3.0.0\n` +
        `Action: upgrade immediately.`;
      return {
        _pkg: pkg,
        files: [
          { name: "advisory.txt", kind: "text", note: "A vulnerability advisory from your intel feed.", data: advisory },
          { name: "requirements.txt", kind: "log", note: "The project's installed dependencies.", data: deps.join("\n") },
        ],
      };
    },
    check(input, ctx, env) {
      return norm.text(input).replace(/[=<>!].*/, "").replace(/\s+/g, "") === norm.text(env._pkg);
    },
    debrief: `The project pinned a version of \`${""}\` inside the advisory's vulnerable range — a known-critical flaw shipped straight into production. SCA turns a public advisory into an actionable "upgrade this now".

### How defenders stop it
- Maintain an **SBOM** and run **SCA** (Dependabot, Snyk, OWASP Dependency-Check) continuously in CI.
- Patch or pin to fixed versions quickly; subscribe to advisories for your stack.
- Reduce dependency sprawl — every package is attack surface you don't control.

**On the exam:** supply-chain risk, CVEs/CVSS and dependency scanning are tested in Security+, CySA+ and GSEC.`,
  },

  {
    id: "appsec-validation",
    title: "Trusting the Input",
    level: 3,
    slug: "input_validation_review",
    time: 12,
    certs: ["Security+", "PenTest+", "GSEC"],
    objective: "Review the function and submit the line number where untrusted input is used unsafely.",
    answerLabel: "Line number",
    answerPlaceholder: "a line number",
    lesson: `The root cause behind most injection flaws is the same: **untrusted input used without validation**. User-controlled data (from a request, a file, an argument) flows into something powerful — a shell command, a file path, a query, an HTML page — without being checked or neutralised first.

Secure-code review is about tracing that flow. You look for:
- a **source** of untrusted data (request parameters, form fields, headers),
- reaching a **sink** (a command runner, file opener, query, template),
- with no **validation or encoding** in between.

Spotting the dangerous line is the first step; the fix is to validate/allow-list the input and use safe APIs.

### Your task
The file is numbered (a \`log\` view with line numbers). Read the function, find the single line where user input reaches a dangerous operation unchecked, and submit that **line number**.`,
    hints: ["Trace where the request data comes in, then where it's used.", "Look for user input passed straight into a command, path or query with no validation between.", "The line that combines untrusted input with a powerful call (run/exec/open/query) is the answer."],
    workspace: { type: "files" },
    setup(ctx) {
      // A snippet where a request param flows into a file read with no validation.
      // Randomise the vulnerable line position by varying a preamble.
      const pad = ctx.int(0, 3);
      const preamble = ["# Report download endpoint", "# -- internal tool --", "import os, flask", "from app import auth"].slice(0, pad);
      const body = [
        "def download_report(request):",
        "    name = request.args.get('file')          # untrusted: from the URL",
        "    folder = '/var/reports/'",
        "    path = folder + name                      # VULN: no validation of name",
        "    with open(path, 'rb') as f:               # path traversal reaches any file",
        "        return f.read()",
      ];
      const all = [...preamble, ...body];
      const vulnLine = all.length - 2; // the `path = folder + name` line (1-indexed below)
      const numbered = all; // the log view adds line numbers itself
      return { _line: all.indexOf("    path = folder + name                      # VULN: no validation of name") + 1,
        ...lines("download.py", "A file-download handler. Find the unsafe line (the viewer numbers lines for you).", numbered.join("\n")) };
    },
    check(input, ctx, env) {
      return norm.num(input) === env._line;
    },
    debrief: `The request's \`file\` parameter was concatenated into a path and opened with **no validation** — a classic path-traversal sink (\`?file=../../etc/passwd\` escapes the folder). The flaw is the unchecked flow from source to sink.

### How defenders stop it
- **Validate and allow-list** input: permit only expected filenames, reject \`..\` and separators, and resolve the final path to confirm it stays inside the intended folder.
- Use safe APIs that don't build paths/queries/commands from raw strings.
- Add **SAST** (static analysis) in CI to flag source-to-sink flows automatically.

**On the exam:** input validation, path traversal and secure code review are tested in Security+, PenTest+ and secure-coding/GSEC objectives.`,
  },

  {
    id: "appsec-config",
    title: "Left the Door Open",
    level: 2,
    slug: "security_misconfiguration",
    time: 9,
    certs: ["Security+", "CySA+", "GSEC"],
    objective: "Review the server config and submit the flag that the one dangerous setting exposes.",
    lesson: `**Security misconfiguration** is an entire OWASP category because it's so common: the software could be safe, but a setting left it open. Debug mode on in production, directory listing enabled, default credentials unchanged, an admin panel exposed, verbose errors leaking internals.

Reviewing configuration is quick, high-value defensive work: read the settings, compare against a hardened baseline, flag anything that widens exposure.

### Your task
Read the config file. One setting is dangerous for production and ends up exposing a secret. Find it, follow what it reveals, and submit the flag.`,
    hints: ["Scan the config for anything that should never be on in production (debug, listing, exposed endpoints).", "A debug or status setting that's enabled exposes internal values — the flag is among them."],
    workspace: { type: "files" },
    setup(ctx) {
      const cfg = `# nginx + app production config
server_tokens on;                 # (leaks version)
location /status { allow all; }    # app status page, no auth

[app]
environment = production
debug = true                      # debug mode ON in production
show_detailed_errors = true
secret_diagnostic_token = ${ctx.flag}
admin_panel = /admin  (no IP restriction)
`;
      return code("app.conf", "Production server configuration. Review it for unsafe settings.", cfg);
    },
    debrief: `\`debug = true\` in production turned on detailed diagnostics — including a \`secret_diagnostic_token\` that should never be exposed. Combined with an open \`/status\` page and an unrestricted admin panel, the config did the attacker's reconnaissance for them.

### How defenders stop it
- Harden to a **baseline** (CIS Benchmarks): debug off, errors generic, version headers suppressed, admin restricted by IP/auth.
- Separate config per environment so production never ships debug settings.
- Scan configuration automatically and review it in change control.

**On the exam:** security misconfiguration and hardening/baselines are tested across Security+, CySA+ and GSEC.`,
  },
];
