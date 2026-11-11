// Track: Identity & Access. How systems prove who you are and what you may do.
import { norm } from "../flags.js";

const doc = (name, note, text, kind = "text") => ({ files: [{ name, kind, note, data: text }] });

export default [
  {
    id: "iam-factors",
    title: "Something You Know",
    level: 1,
    slug: "authentication_factors",
    time: 8,
    certs: ["Security+", "CISSP", "SSCP", "ISC2 CC"],
    objective: "Read the login scheme and name the authentication-factor category of its second step.",
    answerLabel: "Factor category",
    answerPlaceholder: "something you know / have / are",
    lesson: `Authentication answers "are you who you claim to be?" using **factors**, grouped by category:

- **Something you know** — a password, PIN, or security question.
- **Something you have** — a phone running an authenticator app, a hardware token, a smart card.
- **Something you are** — a biometric: fingerprint, face, iris.

(Two more are sometimes added: **somewhere you are** — location — and **something you do** — behaviour.)

**Multi-factor authentication (MFA)** means using factors from **two or more different categories**. A password plus a security question is *not* MFA — both are "something you know". A password plus a code from your phone *is*, because it adds "something you have". That distinction is the whole point, and a favourite exam trap.

### Your task
Read the scheme on the right and name the **category** of the **second** factor (answer with "know", "have" or "are", or the full phrase).`,
    hints: ["Identify the second authenticator, then ask which category it falls in.", "A code from an authenticator app or a hardware key is 'something you have'. A fingerprint is 'something you are'."],
    workspace: { type: "files" },
    setup(ctx) {
      const cases = [
        { a: "have", second: "a 6-digit code from the Google Authenticator app on the user's phone" },
        { a: "are", second: "a fingerprint scan on the laptop's sensor" },
        { a: "know", second: "the answer to a security question ('mother's maiden name')" },
        { a: "have", second: "a tap of a YubiKey hardware security key" },
        { a: "are", second: "a face scan via the webcam" },
      ];
      const pick = cases[ctx.int(0, cases.length - 1)];
      return { _a: pick.a, ...doc("login-scheme.txt", "A two-step login. What category is the second factor?",
        `Corporate SSO login:\nStep 1 — the user types their username and password.\nStep 2 — the user provides ${pick.second}.\n\nQuestion: which authentication-factor category does Step 2 belong to?`) };
    },
    check(input, ctx, env) {
      const v = norm.text(input);
      return v.includes(env._a) || (env._a === "have" && v.includes("have")) || (env._a === "know" && v.includes("know")) || (env._a === "are" && (v.includes("are") || v.includes("biometric")));
    },
    debrief: `Password + the second factor here is genuine **MFA** only when the second factor is a *different* category (have/are) from the password (know). Mixing two "know" factors adds little, because one phishing page can grab both.

### How defenders stop it
- Require MFA that crosses categories, ideally **phishing-resistant** types (FIDO2/WebAuthn hardware keys, passkeys) over SMS codes.
- SMS and email codes are weak factors (SIM-swapping, interception) but still beat passwords alone.

**On the exam:** classifying factors and spotting fake "MFA" (two same-category factors) is guaranteed on Security+, SSCP and CISSP.`,
  },

  {
    id: "iam-weak-hash",
    title: "The Weakest Vault",
    level: 2,
    slug: "password_storage_schemes",
    time: 10,
    certs: ["Security+", "CySA+", "SSCP"],
    objective: "A password database uses different hashing schemes per account. Find the account stored with the weakest one and submit its username.",
    answerLabel: "Username",
    answerPlaceholder: "the at-risk account",
    lesson: `How a system **stores** passwords decides how bad a database leak is. You can read the scheme from the hash's prefix (the Unix \`crypt\` format \`$id$...\`):

| Prefix | Scheme | Verdict |
|---|---|---|
| (none, 32 hex) | unsalted MD5 | **terrible** — instant to crack |
| \`$1$\` | md5crypt | weak and ageing |
| \`$5$\` | sha256crypt | ok |
| \`$6$\` | sha512crypt | good |
| \`$2b$\` | bcrypt | strong (slow, salted) |
| \`$argon2\` | Argon2 | strongest (modern) |

After a breach, the accounts stored with the **weakest** scheme are cracked first, so they're the ones to force a reset on immediately.

### Your task
Open the password file. Use **Toolkit → Identify hash type** on each hash if you're unsure. Find the account using the **weakest** storage and submit its **username**.`,
    hints: ["Each line is user:hash. The prefix ($1$, $6$, $2b$…) tells you the scheme.", "A bare 32-hex hash with no $ prefix is unsalted MD5 — the weakest here. Submit that user.", "Toolkit → Identify hash type will name each scheme for you."],
    workspace: { type: "files" },
    setup(ctx) {
      const users = ctx.shuffle(["jdoe", "asmith", "rwong", "kpatel", "mgarcia", "tnguyen"]);
      // Give one user a bare unsalted MD5 (weakest); others get $1/$5/$6/$2b/argon2
      const weak = users[0];
      const schemes = ["$1$abc$", "$5$xyz$", "$6$def$", "$2b$12$", "$argon2id$v=19$"];
      const lines = users.map((u, i) => {
        if (u === weak) return `${u}:${ctx.hex(32)}`;
        const s = schemes[(i - 1 + schemes.length) % schemes.length];
        return `${u}:${s}${ctx.hex(20)}`;
      });
      return { _weak: weak, ...doc("passwd.db", "Password hashes, one scheme per account. Which account is most at risk?", lines.join("\n")) };
    },
    check(input, ctx, env) {
      return norm.text(input) === norm.text(env._weak);
    },
    debrief: `One account's password was a bare **unsalted MD5** — no salt, a lightning-fast hash — while others used bcrypt or Argon2. After a leak, that account falls first.

### How defenders stop it
- Store every password with a **slow, salted** algorithm: bcrypt, scrypt or **Argon2**. Never plain MD5/SHA.
- Migrate legacy hashes: upgrade the stored hash the next time each user logs in.
- A unique **salt** per user defeats rainbow tables and stops identical passwords sharing a hash.

**On the exam:** password-storage schemes, salting and work factors are core to Security+, SSCP and CySA+.`,
  },

  {
    id: "iam-least-privilege",
    title: "Too Much Power",
    level: 2,
    slug: "principle_of_least_privilege",
    time: 10,
    certs: ["Security+", "CISSP", "SSCP", "ISC2 CC"],
    objective: "Review the access matrix and find the one account that violates least privilege. Submit its username.",
    answerLabel: "Over-privileged account",
    answerPlaceholder: "the username",
    lesson: `**Least privilege** means every account gets **only** the access its job needs — no more. It limits the blast radius: if an account is phished or stolen, the attacker inherits only what that account could do.

The usual violations:
- A normal user with **admin** rights they never use.
- A service account granted **full** access "to be safe".
- Old permissions never removed after someone changed roles (**privilege creep**).

Reviewing access and stripping the excess is **access recertification**, a routine audit control.

### Your task
The file lists each account, its job role, and its granted access. Find the one whose access clearly **exceeds** what its role needs, and submit its username.`,
    hints: ["Compare each account's job role with what it can actually do.", "An intern or a read-only role with Domain Admin or full database write is the outlier.", "Submit the username whose granted access far exceeds its job."],
    workspace: { type: "files" },
    setup(ctx) {
      const offenders = [
        { u: "intern_" + ctx.word(), role: "Summer Intern (read-only reporting)", access: "Domain Admin" },
        { u: "svc_" + ctx.word(), role: "Backup service account", access: "Full write to ALL databases + Domain Admin" },
        { u: ctx.word() + "_tmp", role: "Contractor (single app)", access: "Global Administrator (all cloud tenants)" },
      ];
      const off = offenders[ctx.int(0, offenders.length - 1)];
      const normals = [
        { u: "jdoe", role: "Accountant", access: "Finance app (read/write), shared drive (read)" },
        { u: "asmith", role: "Help Desk", access: "Password reset, ticketing (read/write)" },
        { u: "rwong", role: "DBA", access: "Database admin (production)" },
        { u: "kpatel", role: "HR Manager", access: "HR system (read/write)" },
      ];
      const rows = ctx.shuffle([off, ...normals]);
      const text = "ACCOUNT          ROLE                               GRANTED ACCESS\n" +
        rows.map((r) => `${r.u.padEnd(16)} ${r.role.padEnd(34)} ${r.access}`).join("\n");
      return { _u: off.u, ...doc("access-matrix.txt", "Account access review. Spot the least-privilege violation.", text) };
    },
    check(input, ctx, env) {
      return norm.text(input) === norm.text(env._u);
    },
    debrief: `One account held sweeping admin rights far beyond its job — exactly the account an attacker dreams of phishing. Least privilege would have capped the damage.

### How defenders stop it
- Grant access by **role** (RBAC), review it regularly, and remove what's unused (recertification).
- Use **just-in-time** and **privileged access management (PAM)** so admin rights are temporary, not standing.
- Watch service accounts especially — they're often over-granted and rarely reviewed.

**On the exam:** least privilege, privilege creep and access recertification are heavily tested in Security+, SSCP and CISSP.`,
  },

  {
    id: "iam-cookie-flags",
    title: "An Insecure Session",
    level: 3,
    slug: "session_cookie_attributes",
    time: 11,
    certs: ["Security+", "CySA+", "PenTest+"],
    objective: "Review the Set-Cookie headers. One session cookie is dangerously configured. Submit that cookie's name.",
    answerLabel: "Cookie name",
    answerPlaceholder: "the insecure cookie's name",
    lesson: `After you log in, the server gives your browser a **session cookie** — the key to your account for that visit. How that cookie is configured decides how easily it can be stolen or misused. The important attributes:

- **HttpOnly** — JavaScript can't read it, which blunts cookie theft via cross-site scripting.
- **Secure** — only sent over HTTPS, so it can't leak over plain HTTP.
- **SameSite** (\`Lax\`/\`Strict\`) — not sent on cross-site requests, which blunts cross-site request forgery.

A **session** cookie missing these — readable by script, sent in the clear, attached to cross-site requests — is a prime target. (Non-sensitive cookies like a theme preference don't need them.)

### Your task
The file lists several \`Set-Cookie\` headers. Find the **session/auth** cookie that lacks the protections it needs, and submit its **name** (the part before the \`=\`).`,
    hints: ["Focus on the cookie that holds the session or auth token, not preferences like theme or language.", "Check for HttpOnly, Secure and SameSite. The session cookie missing them is the problem.", "Submit just the cookie's name, e.g. the text before the = sign."],
    workspace: { type: "files" },
    setup(ctx) {
      const sessName = ctx.pick(["SESSIONID", "auth_token", "sid", "JSESSIONID"]);
      const cookies = ctx.shuffle([
        `Set-Cookie: theme=dark; Path=/; Max-Age=31536000`,
        `Set-Cookie: lang=en; Path=/`,
        `Set-Cookie: ${sessName}=${ctx.hex(24)}; Path=/`, // the bad one: no HttpOnly/Secure/SameSite
        `Set-Cookie: csrftoken=${ctx.hex(16)}; Path=/; Secure; SameSite=Strict`,
        `Set-Cookie: remember=${ctx.hex(12)}; Path=/; HttpOnly; Secure; SameSite=Lax`,
      ]);
      return { _name: sessName, ...doc("set-cookie-headers.txt", "Response cookies from a web app. Which session cookie is unsafe?", cookies.join("\n")) };
    },
    check(input, ctx, env) {
      return norm.text(input).replace(/=.*/, "") === norm.text(env._name);
    },
    debrief: `The session cookie was set with **none** of HttpOnly, Secure or SameSite — so script could read it, it could leak over HTTP, and it rode along on cross-site requests. The other sensitive cookies were configured correctly, which is the contrast to learn.

### How defenders stop it
- Set session cookies with **HttpOnly; Secure; SameSite=Lax** (or Strict) by default.
- Serve the whole site over HTTPS and add **HSTS** so there's no HTTP to leak over.
- Rotate the session ID on login and log out, and expire idle sessions.

**On the exam:** secure cookie attributes and session management appear in Security+, CySA+ and PenTest+ (and OWASP).`,
  },
];
