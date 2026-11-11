// Track: First Steps. Reference examples of the challenge format.
import { esc } from "../engines/browser.js";

const page = (title, body, extraHead = "") => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${extraHead}
<style>body{font-family:system-ui,sans-serif;margin:0;color:#1f2933;background:#f7f8fa}header{background:#0f2a43;color:#fff;padding:14px 24px;display:flex;gap:20px;align-items:center}
header a{color:#cfe3f7;text-decoration:none}main{max-width:720px;margin:28px auto;padding:0 20px;line-height:1.6}.card{background:#fff;border:1px solid #e3e7ec;border-radius:10px;padding:18px 20px;margin:14px 0}
input,button{font:inherit;padding:8px 10px;border-radius:6px;border:1px solid #c5ccd5}button{background:#0f6fde;color:#fff;border:0;cursor:pointer}</style></head><body>${body}</body></html>`;

export default [
  {
    id: "basics-first-flag",
    title: "Capture Your First Flag",
    level: 1,
    slug: "welcome_operator",
    time: 2,
    certs: ["Security+"],
    objective: "Find the flag on the page and submit it.",
    lesson: `Welcome to **Breach**. Every challenge here works the same way. You get a **target**: a website, a terminal, a packet capture or something else. Somewhere in it is a **flag**, a secret string that looks like this:

\`\`\`
BREACH{some_words_1a2b3c}
\`\`\`

Find it, paste it into the answer box and submit it. This format is called **capture the flag (CTF)**, and it is how security people practise. Competitions like DEF CON's run the same way.

### The rules of engagement
In the real world, attacking a system you don't own is a crime, even "just to look". Professionals only test with **written permission** and a defined **scope**. Everything in Breach is a simulation that runs inside your own browser, so here, attacking is the whole point.

> Your flags are unique to you. Each flag ends with a code generated for your browser, so a flag copied from someone else won't work.

This first one is a gift. The site on the right greets new operators. Read it.`,
    hints: ["Look at the website on the right. Read everything it shows you.", "The flag is printed in the welcome box. Copy all of it, including BREACH{ and the closing }."],
    workspace: { type: "browser" },
    setup(ctx) {
      return {
        devtools: false,
        start: "http://welcome.breach/",
        sites: {
          "welcome.breach": { routes: [["GET", "/", (req, res) => res.html(page("Welcome, operator",
            `<header><b>Breach Ops</b></header><main><h1>Welcome, operator.</h1><p>Your training starts now. Here is your first flag. Submit it to prove you can follow instructions:</p>
             <div class="card" style="font-family:monospace;font-size:18px">${esc(ctx.flag)}</div><p>Next time it won't be handed to you.</p></main>`))]] },
        },
      };
    },
    debrief: `You submitted your first flag. That's the whole loop: **explore the target, extract the secret, prove it**.

### How defenders stop it
Here, nothing needed stopping. In real systems, though, secrets end up on public pages far more often than you'd think: API keys in JavaScript, passwords in help text, internal links in comments. Defenders review what their pages expose before they ship, and scan for secrets automatically.

**On the exam:** Security+ and PenTest+ both stress **rules of engagement** and **scope**: written authorisation before any testing, and clear limits on what may be touched.`,
  },

  {
    id: "basics-view-source",
    title: "Read the Source",
    level: 1,
    slug: "comments_are_public",
    time: 5,
    certs: ["Security+", "CySA+", "CEH"],
    objective: "The login page hides something its developer left behind. Find the flag.",
    lesson: `A web page is just a text file of **HTML** that your browser downloads and draws. Everything in that file reaches your computer, including the parts that aren't drawn on screen.

Developers often leave **comments** in HTML. A browser never shows them, but they're right there in the source:

\`\`\`html
<!-- TODO: remove test account before launch -->
\`\`\`

### How to see the source
In a real browser you'd press **Ctrl+U** (view source), or open **DevTools** with F12. In the Breach browser on the right, click **DevTools** in the toolbar and open the **Source** tab. You can also type \`view-source:\` in front of an address.

Reading the source is the first step of **reconnaissance**: gathering information before you attack. It's passive and quiet, and it's astonishingly productive.`,
    hints: ["The flag isn't visible on the rendered page. Look at what the server actually sent.", "Open DevTools → Source and read the HTML line by line. Comments start with <!--."],
    workspace: { type: "browser" },
    setup(ctx) {
      return {
        start: "http://portal.acme.local/",
        sites: {
          "portal.acme.local": { routes: [["GET", "/", (req, res) => res.html(page("ACME Staff Portal",
            `<header><b>ACME</b><a href="/">Staff portal</a></header>
<main>
  <h1>Staff sign-in</h1>
  <!-- dev note: staging creds removed. leftover flag for QA: ${esc(ctx.flag)} -->
  <div class="card">
    <form action="/" method="get"><p><input name="user" placeholder="Username"></p><p><input name="pass" type="password" placeholder="Password"></p><button>Sign in</button></form>
  </div>
  <p style="color:#6b7785">Problems? Contact IT on ext. 4410.</p>
</main>`))]] },
        },
      };
    },
    debrief: `The flag was in an **HTML comment**. Browsers don't draw comments, but they download them, so anyone can read them.

### How defenders stop it
- Strip comments and debug output in the build step (minifiers do this).
- Never put secrets, credentials or internal hostnames in anything sent to the client.
- Run secret scanners in CI to catch keys before they ship.

**On the exam:** this is **information disclosure** found during **passive reconnaissance**. CEH and PenTest+ list reviewing page source and comments as a standard recon technique.`,
  },

  {
    id: "basics-robots",
    title: "Where Robots Fear to Tread",
    level: 1,
    slug: "robots_txt_is_a_map",
    time: 5,
    certs: ["CySA+", "CEH"],
    objective: "This site asks search engines to stay away from one place. Go there and get the flag.",
    lesson: `Sites tell search engines what not to index with a plain-text file at a fixed address: **/robots.txt**.

\`\`\`
User-agent: *
Disallow: /private-stuff/
\`\`\`

It's a polite request, not a lock. Crawlers that follow the rules skip those paths, but anybody can read the file, and it often lists exactly the places a site doesn't want seen.

Checking \`/robots.txt\` (and \`/sitemap.xml\`) is one of the first things an attacker does, and one of the first things a pentester checks during **enumeration**.

### What to do
Type an address in the Breach browser's address bar, just as in a normal browser. Try \`/robots.txt\` on this site.`,
    hints: ["Every site can publish a robots.txt at its root. Edit the address bar.", "Go to http://blog.nimbus.local/robots.txt, read the Disallow lines, then visit those paths."],
    workspace: { type: "browser" },
    setup(ctx) {
      const secret = `/${ctx.word()}-backup-${ctx.hex(4)}/`;
      return {
        start: "http://blog.nimbus.local/",
        sites: {
          "blog.nimbus.local": { routes: [
            ["GET", "/", (req, res) => res.html(page("Nimbus Blog", `<header><b>Nimbus</b><a href="/">Blog</a><a href="/about">About</a></header>
              <main><h1>Engineering at Nimbus</h1><div class="card"><h3>We moved to the cloud ☁️</h3><p>Our migration went great and nothing is misconfigured.</p></div>
              <div class="card"><h3>Hiring!</h3><p>We're looking for a security engineer. Nobody has applied.</p></div></main>`))],
            ["GET", "/about", (req, res) => res.html(page("About", `<header><b>Nimbus</b><a href="/">Blog</a></header><main><h1>About</h1><p>Nimbus makes weather APIs.</p></main>`))],
            ["GET", "/robots.txt", (req, res) => res.text(`User-agent: *\nDisallow: /admin/\nDisallow: ${secret}\n\nSitemap: http://blog.nimbus.local/sitemap.xml`)],
            ["GET", "/admin/*", (req, res) => res.error(403, "You don't have permission to access this resource.")],
            ["GET", secret + "flag.txt", (req, res) => res.text(ctx.flag)],
            ["GET", secret.replace(/\/$/, "") + "/*", (req, res) => res.html(page("Index of " + secret,
              `<main><h1>Index of ${esc(secret)}</h1><pre>../\ndb-dump-2024.sql.gz      12-Mar-2024 09:14   48M\nflag.txt                 12-Mar-2024 09:15   31\n</pre><p><a href="${esc(secret)}flag.txt">flag.txt</a></p></main>`))],
          ] },
        },
      };
    },
    debrief: `\`robots.txt\` pointed straight at a forgotten backup folder with **directory listing** switched on, which showed every file in it.

### How defenders stop it
- Never rely on robots.txt for secrecy. Treat it as public, because it is.
- Protect sensitive paths with real **authentication**, or don't put them on the web server at all.
- Turn off directory listing (\`autoindex off\` in nginx, \`Options -Indexes\` in Apache).
- Keep backups and database dumps off web roots.

**On the exam:** robots.txt, sitemaps and directory listing are classic **web enumeration** items in CEH and PenTest+. On OSCP, tools like \`gobuster\` and \`feroxbuster\` find such paths even when robots.txt doesn't list them.`,
  },
];
