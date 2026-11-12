// Track: Databases & SQL. Learn to read and write SQL in a read-only console,
// then review how applications and database servers get it wrong. The console
// only runs SELECT; injection is taught by code review and log analysis.
import { norm } from "../flags.js";

const FIRST = ["ana", "ben", "chloe", "dev", "elif", "farid", "grace", "hugo", "ines", "jonas", "kira", "liam", "maya", "noor", "omar", "priya", "quinn", "rosa", "sami", "tess", "uma", "viktor", "wren", "yusuf", "zoe"];
const two = (n) => String(n).padStart(2, "0");

export default [
  {
    id: "db-select",
    title: "Ask the Database",
    level: 1,
    slug: "select_from_where",
    time: 10,
    certs: ["Security+", "CySA+", "GSEC"],
    objective: "One disabled account still holds the dba role. Query the staff table to find it and submit its recovery code.",
    lesson: `Almost every application keeps its valuable data in a **relational database**: PostgreSQL, MySQL, SQL Server, Oracle, SQLite. Customer records, password hashes, orders, audit logs. That makes the database the real target of most attacks, and makes **SQL**, the language every one of them speaks, a core skill for attackers and investigators alike.

### Tables, rows, columns
A database holds **tables**. Each table has named, typed **columns** and any number of **rows**:

| id | username | role | active |
|---|---|---|---|
| 1 | ana | analyst | t |
| 2 | ben | dba | f |

### SELECT
\`\`\`sql
SELECT username, role        -- which columns (* means all)
FROM staff                   -- which table
WHERE role = 'dba'           -- which rows
  AND active = false;
\`\`\`

- Text values go in **single quotes**: \`'dba'\`. Numbers and \`true\`/\`false\` don't.
- Combine conditions with \`AND\`, \`OR\`, \`NOT\`. Compare with \`=\`, \`!=\`, \`<\`, \`>\`.
- \`LIKE\` matches patterns: \`'adm%'\` is "starts with adm" (\`%\` = any characters, \`_\` = one character).
- \`LIMIT 10\` returns only the first 10 rows.
- Keywords aren't case-sensitive; \`--\` starts a comment.

### The console
The workspace is a PostgreSQL-style console connected as a **read-only** role: it can \`SELECT\` but nothing else, which is how analyst access should be set up. Tables and columns are listed on the left; *Preview* shows the first rows. Press **Run** or Ctrl+Enter.

### Your task
The \`staff\` table has an \`active\` flag and a \`role\`. An audit rule says no disabled account may keep the \`dba\` role. Exactly one does. Find it and submit its \`recovery_code\`. (Every row has a code that looks like a flag; only the right row's is yours.)`,
    hints: ["Preview the staff table to see its columns and what the values look like.", "You need two conditions joined with AND: one on role, one on active.", "SELECT username, recovery_code FROM staff WHERE role = 'dba' AND active = false;"],
    workspace: { type: "sql" },
    setup(ctx) {
      const roles = ["analyst", "developer", "support", "dba", "manager"];
      const depts = ["eng", "ops", "finance", "sales"];
      const names = ctx.shuffle(FIRST).concat(ctx.shuffle(FIRST).map((n) => n + "2"));
      const slug = "select_from_where";
      const n = 44, target = ctx.int(8, n - 4);
      const rows = [];
      for (let i = 0; i < n; i++) {
        let role = ctx.pick(roles), active = ctx.rng() > 0.25;
        if (role === "dba" && !active) active = true;
        if (i === target) { role = "dba"; active = false; }
        rows.push([i + 1, names[i], ctx.pick(depts), role, active, i === target ? ctx.flag : `BREACH{${slug}_${ctx.hex(6)}}`]);
      }
      return {
        tables: [{ name: "staff", cols: [["id", "int"], ["username", "text"], ["dept", "text"], ["role", "text"], ["active", "bool"], ["recovery_code", "text"]], rows }],
        query: "SELECT * FROM staff LIMIT 5;",
      };
    },
    debrief: `Two conditions and an \`AND\` picked one row out of dozens. That is the whole idea of SQL: you describe *which* rows you want and the database finds them.

The finding itself is a classic: a **disabled account that kept a privileged role**. If the account is ever re-enabled (or its credentials still work somewhere), it comes back with full database-administrator rights.

### How defenders use this
- Access reviews are SQL queries: "privileged roles on inactive accounts", "accounts with no login in 90 days", "users in more than one admin group".
- Offboarding must remove **roles and group memberships**, not just flip an active flag.
- Give people and tools **read-only** roles unless they truly need to write. The console you used could not have changed a thing.

**On the exam:** account reviews, privilege creep and least privilege are Security+ and CySA+ staples; being able to query the data is how you perform them.`,
  },

  {
    id: "db-aggregate",
    title: "Count, Group, Sort",
    level: 2,
    slug: "group_by_finds_the_outlier",
    time: 12,
    certs: ["CySA+", "Security+", "GCIH", "GSEC"],
    objective: "Somebody is guessing passwords. Summarise the login table to find the source IP with the most failed logins and submit it.",
    answerLabel: "Source IP",
    answerPlaceholder: "e.g. 203.0.113.7",
    lesson: `Reading rows one at a time doesn't scale to a log table with millions of entries. Investigators **aggregate**: collapse many rows into a summary.

### Aggregate functions
\`\`\`sql
SELECT COUNT(*) FROM logins;                      -- how many rows
SELECT COUNT(*) FROM logins WHERE success = false; -- how many failures
\`\`\`
Others: \`SUM(col)\`, \`AVG(col)\`, \`MIN(col)\`, \`MAX(col)\`, \`COUNT(DISTINCT col)\`.

### GROUP BY
\`GROUP BY\` splits the rows into buckets, one per distinct value, and runs the aggregate **per bucket**:

\`\`\`sql
SELECT username, COUNT(*) AS attempts
FROM logins
GROUP BY username;          -- one output row per username
\`\`\`

### ORDER BY and LIMIT
\`\`\`sql
ORDER BY attempts DESC      -- biggest first (ASC is the default)
LIMIT 5;                    -- top five
\`\`\`

The clauses always appear in this order: \`SELECT … FROM … WHERE … GROUP BY … ORDER BY … LIMIT\`. \`WHERE\` filters rows *before* grouping.

Put together, "top talkers" is the single most useful query shape in security analytics: which IP, which user, which host did the most of something.

### Your task
The \`logins\` table records every sign-in attempt. One source is running a password-guessing attack. Find the \`src_ip\` with the most **failed** attempts. Be careful: the busiest IP overall is an office gateway with mostly successful logins.`,
    hints: ["Filter to failures first: WHERE success = false.", "Then GROUP BY src_ip with COUNT(*) to count failures per address.", "SELECT src_ip, COUNT(*) AS fails FROM logins WHERE success = false GROUP BY src_ip ORDER BY fails DESC LIMIT 5;"],
    workspace: { type: "sql" },
    setup(ctx) {
      const office = "198.51.100." + ctx.int(2, 60), attacker = "203.0.113." + ctx.int(2, 250);
      const others = Array.from({ length: 9 }, () => `192.0.2.${ctx.int(2, 250)}`);
      const users = ctx.shuffle(FIRST).slice(0, 12);
      const ev = [];
      for (let i = 0; i < 96; i++) ev.push([ctx.pick(users), office, ctx.rng() > 0.06]);
      for (let i = 0; i < 70; i++) ev.push([ctx.pick(users), ctx.pick(others), ctx.rng() > 0.18]);
      const nAtk = ctx.int(38, 55);
      for (let i = 0; i < nAtk; i++) ev.push([ctx.pick(["admin", "root", "administrator", users[0], users[1]]), attacker, false]);
      const rows = ctx.shuffle(ev).map((e, i) => {
        const m = Math.floor((i * 1440) / ev.length);
        return [i + 1, `2026-11-03 ${two(Math.floor(m / 60))}:${two(m % 60)}`, e[0], e[1], e[2]];
      });
      return {
        _ip: attacker,
        tables: [{ name: "logins", cols: [["id", "int"], ["at", "timestamp"], ["username", "text"], ["src_ip", "text"], ["success", "bool"]], rows }],
        query: "SELECT COUNT(*) FROM logins;",
      };
    },
    check(input, ctx, env) { return norm.ip(input) === env._ip; },
    debrief: `Filtering to failures, grouping by source and sorting put the attacker at the top by a wide margin. Without the \`WHERE\`, the office gateway would have led the list: raw volume isn't the signal, **failures per source** is.

Try following up in the console: \`SELECT DISTINCT username FROM logins WHERE src_ip = '…'\` shows the guessed accounts (admin, root…), a **brute-force / password-spraying** pattern.

### How defenders use this
- This query *is* a detection rule. A SIEM runs the same aggregation continuously and alerts past a threshold.
- Respond with rate limiting, account lockout or progressive delays, MFA, and blocking the source.
- Also check the other direction: \`success = true\` from that IP means a guess worked and the account is compromised.

**On the exam:** brute force vs password spraying, log aggregation and SIEM correlation are core CySA+, Security+ and GCIH topics.`,
  },

  {
    id: "db-join",
    title: "Joining the Dots",
    level: 3,
    slug: "join_across_tables",
    time: 13,
    certs: ["CySA+", "GCIH", "GSEC"],
    objective: "A file in the finance share was downloaded by someone outside the finance department. Join the two tables to find the username and submit it.",
    answerLabel: "Username",
    answerPlaceholder: "the account's username",
    lesson: `Relational databases avoid repeating data. Instead of writing a username and department on every download record, the \`downloads\` table stores just an **account id**, and the details live once in \`accounts\`:

\`\`\`
accounts                     downloads
id | username | dept         id | account_id | file            | bytes
 7 | maya     | finance      31 |     7      | finance/q3.xlsx | 48211
\`\`\`

- \`accounts.id\` is the **primary key**: a unique identifier for each row.
- \`downloads.account_id\` is a **foreign key**: it points at a row in \`accounts\`.

### JOIN
A \`JOIN\` stitches the tables back together by matching those keys:

\`\`\`sql
SELECT a.username, a.dept, d.file
FROM downloads d
JOIN accounts a ON a.id = d.account_id
WHERE d.bytes > 1000000;
\`\`\`

- \`downloads d\` gives the table a short **alias**, so \`d.file\` means "the file column of downloads".
- \`ON\` says which rows belong together.
- After the join you can filter and select using columns from **both** tables.

Investigations are almost always joins: the event is in one table, the "who" or "what" it refers to is in another.

### Your task
Files under \`finance/\` should only be downloaded by members of the \`finance\` department. Exactly one download breaks that rule. Find the username responsible.`,
    hints: ["Join downloads to accounts on accounts.id = downloads.account_id.", "Filter with d.file LIKE 'finance/%' to keep only finance files.", "Add AND a.dept != 'finance'. One row remains."],
    workspace: { type: "sql" },
    setup(ctx) {
      const depts = ["finance", "eng", "sales", "support"];
      const names = ctx.shuffle(FIRST).slice(0, 20);
      const accounts = names.map((n, i) => [i + 1, n, depts[i % 4]]);
      const filesBy = {
        finance: ["finance/payroll_2026.xlsx", "finance/q3_forecast.xlsx", "finance/invoices_oct.zip", "finance/bank_details.csv", "finance/budget_draft.docx"],
        eng: ["eng/build_notes.md", "eng/arch_diagram.png", "eng/release_plan.pdf"],
        sales: ["sales/leads_nov.csv", "sales/pricing_v4.pdf", "sales/deck_final.pptx"],
        support: ["support/macros.txt", "support/kb_export.zip"],
      };
      const dl = [];
      for (let i = 0; i < 150; i++) {
        const acct = ctx.pick(accounts);
        // People mostly fetch their own department's files; never finance unless in finance.
        const pool = ctx.rng() < 0.75 ? acct[2] : ctx.pick(depts.filter((d) => d !== "finance"));
        dl.push([acct[0], ctx.pick(filesBy[pool]), ctx.int(2, 900) * 1024]);
      }
      const culprit = ctx.pick(accounts.filter((a) => a[2] !== "finance"));
      dl.splice(ctx.int(40, 120), 0, [culprit[0], "finance/payroll_2026.xlsx", 2318 * 1024]);
      const downloads = dl.map((d, i) => {
        const m = Math.floor((i * 1440) / dl.length);
        return [i + 1, d[0], d[1], d[2], `2026-11-05 ${two(Math.floor(m / 60))}:${two(m % 60)}`];
      });
      return {
        _user: culprit[1],
        tables: [
          { name: "accounts", cols: [["id", "int"], ["username", "text"], ["dept", "text"]], rows: accounts },
          { name: "downloads", cols: [["id", "int"], ["account_id", "int"], ["file", "text"], ["bytes", "int"], ["at", "timestamp"]], rows: downloads },
        ],
        query: "SELECT * FROM downloads LIMIT 5;",
      };
    },
    check(input, ctx, env) { return norm.text(input) === env._user; },
    debrief: `The download record alone only had a number. Joining it to \`accounts\` turned that number into a person and a department, and the mismatch (a finance file, a non-finance user) stood out immediately.

That one row is a lead for an **insider-threat or compromised-account** investigation: who is this user, was it really them, what else did that session touch?

### How defenders use this
- Access-anomaly rules are joins between activity and identity data (HR system, directory, asset inventory).
- The better fix is prevention: enforce department-based access on the share itself (RBAC), so the download is denied instead of merely logged.
- Keep audit data and identity data joinable: consistent IDs, synchronised clocks, retained long enough to investigate.

**On the exam:** data correlation, user-behaviour analytics and insider threat appear in CySA+ and GCIH; the mechanics underneath are joins like this one.`,
  },

  {
    id: "db-injection",
    title: "When Data Becomes Code",
    level: 3,
    slug: "parameterize_every_query",
    time: 12,
    certs: ["Security+", "PenTest+", "CEH", "GSEC", "CISSP"],
    objective: "Four functions query the database. One builds its SQL by gluing user input into the query text. Submit that line number.",
    answerLabel: "Line number",
    answerPlaceholder: "a line number",
    lesson: `You now know SQL is a language. **SQL injection** is what happens when an application lets a user write part of it.

### The mistake
\`\`\`python
query = "SELECT * FROM users WHERE name = '" + name + "'"
\`\`\`
The developer imagines \`name\` is a name. But the database receives one string of SQL and cannot tell which characters came from the programmer and which from the user. Suppose the "name" submitted is \`x' OR '1'='1\`. The text sent to the database is:

\`\`\`sql
SELECT * FROM users WHERE name = 'x' OR '1'='1'
\`\`\`

The user's quote closed the string early, and the rest was read as **SQL logic**. \`'1'='1'\` is always true, so the \`WHERE\` matches every row. Data became code. With the same trick an attacker can read other tables, bypass logins, or modify data. It has been at or near the top of the OWASP Top 10 for two decades.

### The fix: parameterized queries
\`\`\`python
cur.execute("SELECT * FROM users WHERE name = %s", (name,))
\`\`\`
The query text contains only a **placeholder**. The value travels separately, and the database treats it strictly as data: a quote inside it is just a quote. (Placeholders look like \`%s\`, \`?\`, \`$1\` or \`:name\` depending on the library; that \`%s\` is not Python string formatting.)

### Reviewing code for it
Look at every place SQL text is built. Any query assembled with \`+\`, f-strings, \`.format()\` or \`%\` **from a variable** is suspect. Joining two constant strings is harmless: there is no user input in it.

### Your task
Review \`orders_api.py\`. Three queries are safe. One concatenates a request value into the SQL. Submit its line number.`,
    hints: ["Safe queries pass values as a second argument to execute(), with a placeholder in the SQL.", "One query uses + between two string constants only. That is not user input.", "Find the execute() where a variable is joined into the query text with + and quotes."],
    workspace: { type: "files" },
    setup(ctx) {
      const fns = ctx.shuffle([
        ["def get_order(cur, order_id):", '    cur.execute("SELECT * FROM orders WHERE id = %s", (order_id,))', "    return cur.fetchone()"],
        ["def orders_by_status(cur, status):", `    cur.execute("SELECT * FROM orders WHERE status = '" + status + "'")`, "    return cur.fetchall()"],
        ["def recent_orders(cur, customer_id, limit):", '    cur.execute("SELECT id, total FROM orders WHERE customer_id = %s " +', '                "ORDER BY created_at DESC LIMIT %s", (customer_id, limit))', "    return cur.fetchall()"],
        ["def search_notes(cur, term):", '    pattern = "%" + term + "%"', '    cur.execute("SELECT id, note FROM orders WHERE note LIKE %s", (pattern,))', "    return cur.fetchall()"],
      ]);
      const src = ["# orders_api.py: every argument below comes from the HTTP request", "import psycopg2", "", ...fns.flatMap((f) => [...f, ""])].join("\n");
      const line = src.split("\n").findIndex((l) => l.includes("WHERE status = '\" + status")) + 1;
      return { _line: line, files: [{ name: "orders_api.py", kind: "code", label: "PY", note: "Database access layer of a web API (Python, psycopg2 for PostgreSQL).", data: src }] };
    },
    check(input, ctx, env) { return norm.num(input) === env._line; },
    debrief: `\`orders_by_status\` pasted \`status\` between two quote characters inside the SQL text. Whatever the request supplies becomes part of the statement the database parses.

The others were safe for different reasons worth noticing:
- \`recent_orders\` uses \`+\`, but only to join two **constant** strings; the values go through placeholders.
- \`search_notes\` builds a pattern with \`+\`, but that pattern is passed **as a parameter**, so it stays data.

### How defenders stop it
- **Parameterized queries / prepared statements everywhere.** This is the fix; escaping by hand is not.
- ORMs and query builders parameterize by default; watch for their raw-SQL escape hatches.
- Things that can't be parameters (table or column names, sort direction) must come from a fixed **allow-list**.
- Defense in depth: least-privilege database roles (the app shouldn't own the schema), a WAF, generic error messages, SAST rules that flag string-built SQL.

**On the exam:** SQL injection and parameterized queries/input validation are tested in Security+, PenTest+, CEH and CISSP. Know the cause and the fix cold.`,
  },

  {
    id: "db-sqli-log",
    title: "Injection in the Logs",
    level: 3,
    slug: "union_select_in_the_logs",
    time: 13,
    certs: ["CySA+", "GCIH", "CEH", "Security+"],
    objective: "The database's statement log captured an injection attack against the product search. Identify the table the attacker pulled data from and submit its name.",
    answerLabel: "Table name",
    answerPlaceholder: "a table name",
    lesson: `PostgreSQL can log every statement it runs (\`log_statement = 'all'\`) and every error. When an application is vulnerable to injection, that log shows the attack from the database's side: you see the **final SQL text**, after the application glued the attacker's input into it.

### What an attack looks like here
A healthy application sends the same few query shapes over and over, differing only in the values:

\`\`\`
LOG:  statement: SELECT id, name, price FROM products WHERE category = 'garden'
\`\`\`

An injection attempt breaks that pattern. Typical stages, in order:
1. **Probing**: a stray quote causes a syntax error. \`ERROR:  unterminated quoted string\`
2. **Mapping the query**: \`ORDER BY 1\`, \`ORDER BY 2\`… until an error reveals how many columns the original query returns.
3. **Extraction**: \`UNION SELECT\` appends a second query, with the same number of columns, that reads from a **different table**. The results come back mixed into the normal response.
4. A trailing \`--\` comments out whatever SQL the application placed after the input.

\`UNION\` combines the rows of two SELECTs into one result. In legitimate application code it is rare; in a WHERE clause of a product search it is a siren.

### Your task
\`postgresql.log\` covers a few minutes of traffic. Use the filter box (plain text or \`/regex/\`) to cut through the normal queries, find the statement where extraction succeeded, and submit the name of the table it read from.`,
    hints: ["Filter the log for ERROR to see the probing, then for UNION to see the extraction.", "In the UNION SELECT statement, the table after its own FROM is the one being read.", "It is not products: that is the application's normal table. Look at the FROM that follows UNION SELECT."],
    workspace: { type: "files" },
    setup(ctx) {
      const table = ctx.pick(["staff_accounts", "api_keys", "customers", "admin_users", "payment_tokens", "password_resets"]);
      const cats = ["garden", "tools", "kitchen", "lighting", "outdoor", "storage"];
      const atk = "203.0.113." + ctx.int(2, 250);
      const lines = [];
      let sec = ctx.int(0, 20) + 13 * 60;
      const ts = () => { sec += ctx.int(1, 6); return `2026-11-03 02:${two(Math.floor(sec / 60) % 60)}:${two(sec % 60)} UTC`; };
      const normal = () => {
        const pid = ctx.int(4100, 4130), ip = "10.20.0." + ctx.int(11, 14);
        const q = ctx.pick([
          `SELECT id, name, price FROM products WHERE category = '${ctx.pick(cats)}'`,
          `SELECT id, name, price FROM products WHERE category = '${ctx.pick(cats)}'`,
          `SELECT * FROM carts WHERE session_id = '${ctx.hex(16)}'`,
          `UPDATE carts SET updated_at = now() WHERE id = ${ctx.int(100, 999)}`,
          `SELECT count(*) FROM products`,
        ]);
        lines.push(`${ts()} [${pid}] shop_app@shop ${ip} LOG:  statement: ${q}`);
      };
      const evil = (q, err) => {
        lines.push(`${ts()} [4127] shop_app@shop 10.20.0.12 LOG:  statement: ${q}    /* client=${atk} */`);
        if (err) lines.push(`${ts()} [4127] shop_app@shop 10.20.0.12 ERROR:  ${err}`);
      };
      const base = "SELECT id, name, price FROM products WHERE category = ";
      for (let i = 0; i < 14; i++) normal();
      evil(`${base}'garden''`, "unterminated quoted string at or near \"'garden''\"");
      for (let i = 0; i < 5; i++) normal();
      evil(`${base}'garden' ORDER BY 3--'`);
      normal();
      evil(`${base}'garden' ORDER BY 4--'`, "ORDER BY position 4 is not in select list");
      for (let i = 0; i < 6; i++) normal();
      evil(`${base}'x' UNION SELECT NULL, table_name, NULL FROM information_schema.tables--'`);
      for (let i = 0; i < 4; i++) normal();
      evil(`${base}'x' UNION SELECT id, login || ':' || secret, 0 FROM ${table}--'`);
      for (let i = 0; i < 12; i++) normal();
      return { _t: table, files: [{ name: "postgresql.log", kind: "log", note: "Statement log from the shop database (log_statement = 'all').", data: lines.join("\n") }] };
    },
    check(input, ctx, env) { return norm.text(input).replace(/^public\./, "") === env._t; },
    debrief: `The log reads like a diary of the attack: a stray quote and a syntax error (probing), \`ORDER BY 3\` succeeding and \`ORDER BY 4\` failing (the query has three columns), a look through \`information_schema.tables\` (listing table names), and finally a \`UNION SELECT\` that returned logins and secrets from another table through the product-search page.

Notice the connection details: every statement came from the application's own account (\`shop_app\`) and server address. To the database, an injected query is indistinguishable from a legitimate one. Only the *shape* of the SQL gives it away.

### How defenders use this
- Alert on SQL **errors** from application accounts (apps with correct queries don't produce syntax errors) and on \`UNION\`, \`information_schema\`, \`pg_catalog\`, \`--\` in application statements.
- Fix the root cause with parameterized queries, then assume the exposed table is **compromised**: rotate those secrets and notify as required.
- Limit the blast radius: the shop's database role had no business being able to read that table. Grant each role only the tables it needs.

**On the exam:** recognising SQL injection in logs and the response steps are CySA+ and GCIH objectives; UNION-based injection is named in CEH and PenTest+.`,
  },

  {
    id: "db-privileges",
    title: "Who Can Connect, and As What",
    level: 3,
    slug: "trust_is_not_authentication",
    time: 12,
    certs: ["Security+", "SSCP", "CISSP", "GSEC"],
    objective: "Review the PostgreSQL server's client-authentication file. One rule lets anyone on the internet connect as any user with no password. Submit its line number.",
    answerLabel: "Line number",
    answerPlaceholder: "a line number",
    lesson: `A database server is itself a system to harden. Two questions decide most of its exposure: **who may connect**, and **what may they do once in**.

### Who may connect: pg_hba.conf
PostgreSQL checks each incoming connection against the rules in \`pg_hba.conf\` (host-based authentication), top to bottom, and uses the **first rule that matches**:

\`\`\`
# TYPE   DATABASE   USER       ADDRESS          METHOD
host     shop       shop_app   10.20.0.0/24     scram-sha-256
\`\`\`

- **ADDRESS** is a network in CIDR form. \`10.20.0.0/24\` is one internal subnet; \`0.0.0.0/0\` is **every IPv4 address on earth**.
- **METHOD** is how the client must prove its identity:

| Method | Meaning |
|---|---|
| \`scram-sha-256\` | password, verified with a modern challenge-response. The right default |
| \`md5\` | password with a weak legacy hash. Deprecated |
| \`peer\` | local connections only: trust the operating-system username |
| \`cert\` | TLS client certificate |
| \`reject\` | always refuse |
| \`trust\` | **no authentication at all**: anyone matching the rule is let in as whoever they claim to be |

\`hostssl\` rules additionally require TLS, so credentials and data are encrypted in transit.

### What they may do: roles and GRANT
Inside the database, permissions belong to **roles**. Least privilege means the web app's role can \`SELECT\`/\`INSERT\` on its own tables and nothing more:

\`\`\`sql
GRANT SELECT, INSERT ON orders TO shop_app;
REVOKE ALL ON staff_accounts FROM shop_app;
\`\`\`

A role marked **Superuser** bypasses every permission check. Applications should never run as one.

### Your task
Review \`pg_hba.conf\` and submit the line number of the rule that allows unauthenticated access from anywhere. \`roles.txt\` (the output of \`\\du\`) shows a second problem to think about.`,
    hints: ["Ignore lines starting with #: those are comments.", "Look for the widest ADDRESS (0.0.0.0/0) combined with the weakest METHOD.", "The rule ending in 'trust' with address 0.0.0.0/0 is the answer."],
    workspace: { type: "files" },
    setup(ctx) {
      const rules = ctx.shuffle([
        "hostssl shop            shop_app        10.20.0.0/24            scram-sha-256",
        "hostssl shop            reporting_ro    10.30.5.0/24            scram-sha-256",
        "host    all             all             0.0.0.0/0               trust",
        "hostssl replication     replicator      10.20.9.7/32            cert",
        "host    shop            legacy_etl      10.40.1.15/32           md5",
      ]);
      const conf = [
        "# PostgreSQL Client Authentication Configuration File",
        "# ===================================================",
        "# TYPE  DATABASE        USER            ADDRESS                 METHOD",
        "",
        "# local administration over the Unix socket",
        "local   all             postgres                                peer",
        "",
        "# application and reporting access",
        ...rules,
        "",
        "# refuse everything else",
        "host    all             all             0.0.0.0/0               reject",
      ].join("\n");
      const roles = `shop=# \\du
                                List of roles
  Role name    |                         Attributes
---------------+------------------------------------------------------------
 legacy_etl    |
 postgres      | Superuser, Create role, Create DB, Replication, Bypass RLS
 replicator    | Replication
 reporting_ro  |
 shop_app      | Superuser, Create DB
`;
      return { _line: conf.split("\n").findIndex((l) => /0\.0\.0\.0\/0\s+trust/.test(l)) + 1, files: [
        { name: "pg_hba.conf", kind: "code", label: "CONF", note: "Client authentication rules. First matching rule wins.", data: conf },
        { name: "roles.txt", kind: "text", note: "Output of \\du: the roles defined on this server.", data: roles },
      ] };
    },
    check(input, ctx, env) { return norm.num(input) === env._line; },
    debrief: `\`host all all 0.0.0.0/0 trust\` means: any database, any user, from any address, **no password**. Because rules are matched top to bottom, the careful \`reject\` at the end never gets a chance. Anyone who can reach port 5432 can connect as \`postgres\`.

It is usually left behind from debugging ("just make it connect") and it is one of the main reasons exposed databases get emptied and held for ransom.

\`roles.txt\` held the second finding: **\`shop_app\` is a Superuser**. Combined with the injection you investigated earlier, that would let an attacker read every table, not only the shop's.

Also worth fixing: the \`md5\` rule (legacy hashing, and \`host\` rather than \`hostssl\`, so no TLS).

### How defenders stop it
- Never use \`trust\` for network connections. Require \`scram-sha-256\` or certificates, over \`hostssl\`.
- Don't expose database ports to the internet: bind to internal interfaces and firewall the port to the app servers.
- Application roles get the minimum \`GRANT\`s; no Superuser, no ownership of the schema.
- Audit against a baseline (the CIS PostgreSQL Benchmark) and log connections.

**On the exam:** authentication vs authorization, least privilege, secure configuration baselines and encryption in transit are Security+, SSCP and CISSP fundamentals.`,
  },
];
