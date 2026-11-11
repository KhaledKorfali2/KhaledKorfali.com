// Track: Web Recon & Client Trust. Uses the simulated browser. Framing is analysis:
// read what a site sends, and show why trusting the client is a mistake.
import { esc } from "../engines/browser.js";
import * as C from "../tools/crypto.js";

const shell = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>:root{font-family:system-ui,sans-serif}body{margin:0;color:#1b2430;background:#eef2f6}
header{background:#12263a;color:#fff;padding:12px 22px;display:flex;gap:18px;align-items:center}header b{font-size:17px}header a{color:#bcd4ec;text-decoration:none;font-size:14px}
main{max-width:720px;margin:26px auto;padding:0 18px}.card{background:#fff;border:1px solid #dde4ec;border-radius:10px;padding:18px 20px;margin:14px 0}
h1{font-size:22px}label{display:block;margin:8px 0 4px;font-size:14px;color:#44515f}input{font:inherit;padding:8px 10px;border:1px solid #c2ccd6;border-radius:6px;width:100%;max-width:280px}
button{font:inherit;background:#1667d6;color:#fff;border:0;border-radius:6px;padding:9px 16px;cursor:pointer;margin-top:10px}.muted{color:#6b7785;font-size:13px}.ok{color:#15803d}.bad{color:#b4232f}</style></head><body>${body}</body></html>`;

export default [
  {
    id: "web-headers",
    title: "What the Server Tells You",
    level: 1,
    slug: "headers_leak_info",
    time: 7,
    certs: ["Security+", "CEH", "PenTest+", "GSEC"],
    objective: "A server reveals too much about itself. Read the response headers and submit the flag hidden in one of them.",
    lesson: `Every web response comes with **HTTP headers**: metadata the browser reads but doesn't usually show you. They sit above the page content:

\`\`\`
HTTP/1.1 200 OK
Server: nginx/1.18.0 (Ubuntu)
X-Powered-By: PHP/7.4.3
Set-Cookie: session=...
\`\`\`

For an attacker or auditor, headers are a goldmine of **reconnaissance**:
- \`Server\` and \`X-Powered-By\` reveal exact software versions, which map to known vulnerabilities.
- Custom \`X-\` headers often leak internal details developers forgot about.

### How to read them here
Open **DevTools** (toolbar button), go to the **Network** tab, click the request, and read the **Response** section. Everything above the blank line is headers.`,
    hints: ["Open DevTools → Network, then click the request to the site.", "Read the response headers (the lines above the blank line). One custom X- header carries the flag."],
    workspace: { type: "browser" },
    setup(ctx) {
      return {
        start: "http://status.internal/",
        sites: { "status.internal": { routes: [["GET", "/", (req, res) => {
          res.header("X-Powered-By", "PHP/7.4.3");
          res.header("X-Debug-Token", ctx.flag);
          res.header("X-Internal-Build", "2019-03-11-rc2");
          return res.html(shell("Status", `<header><b>status.internal</b></header><main><div class="card"><h1>All systems operational.</h1><p class="muted">Nothing to see on the page itself.</p></div></main>`));
        }]] } },
      };
    },
    debrief: `The flag rode in a custom **\`X-Debug-Token\`** response header, invisible on the page but plain in the Network tab. The \`X-Powered-By: PHP/7.4.3\` header also handed an attacker the exact runtime version to look up exploits for.

### How defenders stop it
- Strip or minimise version and debug headers (\`server_tokens off\`, remove \`X-Powered-By\`).
- Add security headers instead: \`Content-Security-Policy\`, \`Strict-Transport-Security\`, \`X-Content-Type-Options\`.
- Never leave debug tokens or internal build info in production responses.

**On the exam:** header reconnaissance and security headers appear in Security+, CySA+ and CEH.`,
  },

  {
    id: "web-cookie-trust",
    title: "The Server That Trusted the Browser",
    level: 2,
    slug: "never_trust_the_client",
    time: 12,
    certs: ["Security+", "CEH", "PenTest+"],
    objective: "You're logged in as a normal user. The admin page is blocked — but the server decides your role in a way you control. Reach the admin page and read its flag.",
    lesson: `The golden rule of web security: **never trust the client.** Anything stored in the browser — cookies, hidden form fields, local storage — can be changed by the person using it. If the server makes a *security decision* based on that data, the user can rewrite the decision.

A classic mistake: after login, the server sets a cookie like \`role=user\`, then on each request it reads that cookie to decide what you can see. But cookies live in *your* browser. Change \`role=user\` to \`role=admin\` and, if the server blindly believes it, you're an admin.

### How to edit a cookie here
Open **DevTools → Cookies**. You'll see the cookies for this site. You can change a value or add a new one. Then **reload** the page so the browser sends the changed cookie.

> This is one of the most-tested vulnerabilities in web security. You're playing the attacker to understand exactly why the server's design is wrong.`,
    hints: ["Log in first (any username and password work here). Then look at the cookies the server set.", "DevTools → Cookies. The server set a cookie that records your role. Change it.", "Set the role cookie's value to admin, then reload and visit /admin."],
    workspace: { type: "browser" },
    setup(ctx) {
      const page = (title, body, role) => shell(title, `<header><b>Acme Intranet</b><a href="/">Home</a><a href="/admin">Admin</a><span style="margin-left:auto;font-size:13px">role: ${esc(role || "guest")}</span></header><main>${body}</main>`);
      return {
        start: "http://intranet.acme/",
        sites: { "intranet.acme": { routes: [
          ["GET", "/", (req, res) => {
            const role = req.cookies.role;
            if (!role) return res.html(page("Sign in", `<div class="card"><h1>Sign in</h1><form method="post" action="/login"><label>Username</label><input name="u" value="jdoe"><label>Password</label><input name="p" type="password" value="password"><button>Sign in</button></form></div>`));
            return res.html(page("Home", `<div class="card"><h1>Welcome back.</h1><p>You are signed in as <b>${esc(role)}</b>.</p><p class="muted">The Admin page is for administrators only.</p></div>`, role));
          }],
          ["POST", "/login", (req, res) => { res.cookie("role", "user"); return res.redirect("/"); }],
          ["GET", "/admin", (req, res) => {
            if (req.cookies.role !== "admin") return res.html(page("Forbidden", `<div class="card"><h1 class="bad">403 — Admins only</h1><p>Your role is <b>${esc(req.cookies.role || "none")}</b>.</p></div>`, req.cookies.role), 403);
            return res.html(page("Admin", `<div class="card"><h1 class="ok">Admin console</h1><p>Server configuration flag:</p><p style="font-family:monospace;font-size:17px">${esc(ctx.flag)}</p></div>`, "admin"));
          }],
        ] } },
      };
    },
    debrief: `The server stored your role in a **cookie** and trusted it. By editing \`role\` to \`admin\`, you granted yourself access — the server never verified it server-side. This is **broken access control**, OWASP's current #1 web risk.

### How defenders stop it
- Keep authorization state on the **server** (a session record keyed by an opaque, random session ID). The browser should only hold that meaningless ID.
- Check permissions on the server for **every** sensitive request, from the session, never from client-supplied data.
- Sign and validate any state that must live client-side, so tampering is detected.

**On the exam:** "never trust the client" and broken access control are central to Security+, CEH and the OWASP Top 10.`,
  },

  {
    id: "web-idor",
    title: "Off by One ID",
    level: 3,
    slug: "guessable_object_ids",
    time: 12,
    certs: ["CEH", "CySA+", "PenTest+"],
    objective: "You can see your own invoice. The flag is on someone else's. Access it.",
    lesson: `Web apps refer to data by **IDs** in the URL: \`/invoice/1005\`, \`/user/42/profile\`. That's fine — until the server shows you the data *without checking whether it's yours*. Then changing the number in the URL hands you other people's records. This is **IDOR** — Insecure Direct Object Reference — a form of broken access control.

It's everywhere because it's so easy to write: the developer loads \`invoice WHERE id = <url value>\` and renders it, forgetting to also check \`AND owner = <you>\`.

### How to test it
Look at the ID in your own invoice's URL. Then try nearby IDs by editing the address bar. If you can read records that aren't yours, the app is vulnerable.`,
    hints: ["Open your invoice and look at the number in its URL.", "Try changing that number in the address bar — go up and down from your own ID.", "One nearby invoice belongs to the admin and shows the flag."],
    workspace: { type: "browser" },
    setup(ctx) {
      const mine = ctx.int(1000, 1008);
      const target = mine + ctx.pick([-2, -1, 1, 2]);
      const inv = (id, owner, lines) => shell(`Invoice ${id}`, `<header><b>BillingPro</b><a href="/invoice/${mine}">My invoice</a></header><main><div class="card"><h1>Invoice #${id}</h1><p class="muted">Account holder: ${esc(owner)}</p>${lines}</div></main>`);
      return {
        start: `http://billing.corp/invoice/${mine}`,
        sites: { "billing.corp": { routes: [
          ["GET", "/", (req, res) => res.redirect(`/invoice/${mine}`)],
          ["GET", "/invoice/:id", (req, res) => {
            const id = parseInt(req.params.id, 10);
            if (id === target) return res.html(inv(id, "A. Admin (administrator)", `<p>Consulting — <b>confidential</b></p><p style="font-family:monospace">${esc(ctx.flag)}</p>`));
            if (id === mine) return res.html(inv(id, "You (jdoe)", `<p>Monthly plan — $29.00</p><p class="muted">This is your invoice. Can you see others?</p>`));
            if (id >= 1000 && id <= 1008) return res.html(inv(id, `Customer #${id}`, `<p>Monthly plan — $29.00</p>`));
            return res.notFound("No such invoice.");
          }],
        ] } },
      };
    },
    debrief: `By incrementing the invoice ID you read a record that wasn't yours. The server checked that the invoice *existed*, never that it was *yours*. That's **IDOR / broken access control**.

### How defenders stop it
- On every request, verify the logged-in user **owns** (or may access) the specific object, server-side.
- Prefer unguessable identifiers (random UUIDs) so IDs can't be enumerated — though that's defence in depth, not a substitute for the ownership check.
- Log and rate-limit access patterns that walk through IDs.

**On the exam:** IDOR is a staple of PenTest+, CEH and CySA+, and a top OWASP item.`,
  },

  {
    id: "web-jwt",
    title: "Reading a Token",
    level: 3,
    slug: "jwt_is_not_encrypted",
    time: 10,
    certs: ["Security+", "CySA+", "PenTest+"],
    objective: "Your session is a JWT. Decode it to read what the server put inside, and submit the flag from its payload.",
    lesson: `Modern apps often carry your session in a **JWT** (JSON Web Token). It looks like three chunks separated by dots:

\`\`\`
eyJhbGci... . eyJzdWIi... . SflKxwRJ...
  header        payload       signature
\`\`\`

Each of the first two parts is just **Base64url-encoded JSON** — *not encrypted*. Anyone holding the token can read its contents. The third part is a **signature** that lets the server detect tampering, but it does nothing to hide the data.

People constantly assume JWTs are secret and stuff sensitive information inside. It's readable by anyone who has the token.

### How to read it
Find the token (DevTools → Cookies). Copy the **middle** part (between the two dots) and decode it with **Toolkit → Base64 → text**. Base64url uses \`-\` and \`_\`; the Toolkit handles that.`,
    hints: ["The session cookie is a JWT: three Base64url parts split by dots.", "Copy the MIDDLE section (between the first and second dot) into the Toolkit.", "Base64 → text gives JSON. The flag is one of the fields."],
    workspace: { type: "browser" },
    setup(ctx) {
      const b64url = (o) => C.b64encode(typeof o === "string" ? o : JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const jwt = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: "jdoe", role: "user", note: ctx.flag, iat: 1730000000 })}.${ctx.hex(43)}`;
      return {
        start: "http://app.cloudbox/",
        cookies: { "app.cloudbox": { token: jwt } },
        sites: { "app.cloudbox": { routes: [["GET", "/", (req, res) => res.html(shell("CloudBox", `<header><b>CloudBox</b></header><main><div class="card"><h1>Dashboard</h1><p class="muted">Your session token is stored as a cookie. Have you looked inside it?</p></div></main>`))]] } },
      };
    },
    debrief: `The JWT's payload was readable with a plain Base64 decode — it was never encrypted. The server had tucked a secret into a token it assumed nobody would open.

### How defenders stop it
- Treat a JWT payload as **public**. Never put secrets or sensitive personal data in it.
- Keep the **signing key** secret and always verify the signature server-side, so tampered tokens are rejected.
- For data that must stay confidential, encrypt it or keep it server-side and reference it by an opaque session ID.

**On the exam:** Security+ and PenTest+ expect you to know a JWT is signed-but-readable, and the difference between integrity (signature) and confidentiality (encryption).`,
  },

  {
    id: "web-backup",
    title: "The Forgotten Backup",
    level: 2,
    slug: "exposed_source_backup",
    time: 9,
    certs: ["Security+", "PenTest+", "CEH"],
    objective: "A developer's editor left a backup of a server file on the web server. Download it and read the secret inside.",
    lesson: `Editors and deploy scripts leave litter on web servers: `+"`config.php~`"+` (editor backup), `+"`index.php.bak`"+`, `+"`.env`"+`, `+"`.git/`"+` folders, `+"`settings.py.save`"+`. These often contain **source code or secrets** that the live site would never reveal, because the server sends the *backup* as plain text instead of executing it.

Attackers and pentesters guess these filenames directly (and tools like `+"`gobuster`"+` automate it). Finding one can hand over database passwords, API keys, or the whole application source.

### Your task
The site runs `+"`config.php`"+` (which executes, revealing nothing). But an editor left a backup copy with a telltale suffix. Guess its name in the address bar and read it.`,
    hints: ["The live config.php executes and hides its contents. Editors often save a backup with a ~ or .bak suffix.", "Try http://.../config.php~ or http://.../config.php.bak in the address bar.", "The backup is served as plain text — the secret flag is inside it."],
    workspace: { type: "browser" },
    setup(ctx) {
      const flag = ctx.flag;
      return {
        start: "http://shop.vendor.local/",
        sites: { "shop.vendor.local": { routes: [
          ["GET", "/", (req, res) => res.html(`<h1>VendorShop</h1><p>Welcome. Our site is fully patched and secure.</p>`)],
          ["GET", "/config.php", (req, res) => res.html(`<!-- config loaded -->`)],
          ["GET", "/config.php~", (req, res) => res.text(`<?php\n// DB + API config\n$DB_PASS = "hunter2";\n$API_SECRET = "${flag}";\n?>`)],
          ["GET", "/config.php.bak", (req, res) => res.text(`<?php\n$DB_PASS = "hunter2";\n$API_SECRET = "${flag}";\n?>`)],
        ] } },
      };
    },
    debrief: `The live `+"`config.php`"+` executed server-side and showed nothing, but `+"`config.php~`"+` — an editor backup — was served as **plain text**, spilling the source and its secrets. The server had no handler for the `+"`~`"+` extension, so it just handed the file over.

### How defenders stop it
- Keep backups and source out of the web root entirely; deploy only built artefacts.
- Block dotfiles and backup suffixes (`+"`~`"+`, `+"`.bak`"+`, `+"`.save`"+`, `+"`.git`"+`) at the web server.
- Scan your own site for these files before attackers do.

**On the exam:** forced browsing for backup/source files is standard web enumeration in PenTest+ and CEH.`,
  },
];
