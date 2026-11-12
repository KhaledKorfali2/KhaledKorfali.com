// MySQL-flavoured session on top of SQLite (sql.js, WebAssembly).
// SQLite does the real work: parsing, constraints, transactions, indexes and
// query planning. This layer makes it speak MySQL: it rewrites MySQL-only
// syntax, emulates SHOW / DESCRIBE / EXPLAIN / GRANT, adds MySQL functions and
// phrases errors the way the mysql client does. No DOM in here, so the same
// code runs under Node for tests.

export const DB_NAME = "shop";
export const VERSION = "8.0.36-quarry-sandbox";

/* ── text helpers ────────────────────────────────────────────────── */
const QUOTES = "'\"`";

/** Split a script into statements; strips comments (-- , #, block). */
export function splitStatements(src) {
  const out = [];
  let cur = "", i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (QUOTES.includes(c)) {
      let j = i + 1;
      while (j < n) { if (src[j] === c) { if (src[j + 1] === c) { j += 2; continue; } break; } j++; }
      cur += src.slice(i, j + 1); i = j + 1; continue;
    }
    if ((c === "-" && d === "-") || c === "#") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { const j = src.indexOf("*/", i + 2); i = j < 0 ? n : j + 2; cur += " "; continue; }
    if (c === ";") { if (cur.trim()) out.push(cur.trim()); cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Apply fn to the parts of a statement that are not inside quotes. */
function mapCode(sql, fn) {
  let out = "", i = 0, start = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (QUOTES.includes(c)) {
      out += fn(sql.slice(start, i));
      let j = i + 1;
      while (j < n) { if (sql[j] === c) { if (sql[j + 1] === c) { j += 2; continue; } break; } j++; }
      out += sql.slice(i, j + 1); i = j + 1; start = i;
    } else i++;
  }
  return out + fn(sql.slice(start));
}
function splitTop(s) {
  const out = [];
  let depth = 0, cur = "", q = null;
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (QUOTES.includes(ch)) { q = ch; cur += ch; continue; }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function matchParen(s, open) {
  let depth = 0, q = null;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === q) q = null; continue; }
    if (QUOTES.includes(ch)) { q = ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return i;
  }
  return -1;
}
const codeOnly = (sql) => { let o = ""; mapCode(sql, (s) => { o += s + " "; return s; }); return o; };
const bare = (s) => String(s || "").replace(/[`'"]/g, "");
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

/* ── MySQL → SQLite rewriting ────────────────────────────────────── */
const fixCode = (s) => s
  .replace(/\bSTART\s+TRANSACTION\b/gi, "BEGIN")
  .replace(/\bINSERT\s+IGNORE\b/gi, "INSERT OR IGNORE")
  .replace(/\bLEFT\s*\(/gi, "_left(")
  .replace(/\bRIGHT\s*\(/gi, "_right(")
  .replace(/\bIF\s*\(/gi, "iif(")
  .replace(/\bLAST_INSERT_ID\s*\(\s*\)/gi, "last_insert_rowid()")
  .replace(/\bINTERVAL\s+(-?\d+)\s+(DAY|WEEK|MONTH|YEAR|HOUR|MINUTE)S?\b/gi, "'$1 $2'")
  .replace(/\bDEFAULT\s+NOW\s*\(\s*\)/gi, "DEFAULT CURRENT_TIMESTAMP")
  .replace(/\bFOR\s+UPDATE\b/gi, "");

function generic(stmt) {
  const m = stmt.match(/\bON\s+DUPLICATE\s+KEY\s+UPDATE\b/i);
  if (m) {
    const head = stmt.slice(0, m.index), tail = stmt.slice(m.index + m[0].length);
    return mapCode(head, fixCode) + " ON CONFLICT DO UPDATE SET " +
      mapCode(tail, (s) => fixCode(s).replace(/\bVALUES\s*\(\s*(\w+)\s*\)/gi, "excluded.$1"));
  }
  return mapCode(stmt, fixCode);
}

function columnDef(part, table, meta) {
  const m = part.match(/^`?(\w+)`?\s+([\s\S]*)$/);
  if (!m) return part;
  const name = m[1];
  let rest = m[2];
  const type = (rest.match(/^\w+(\s*\([^)]*\))?/) || [""])[0].replace(/\s+/g, "").toLowerCase();
  const info = { type, extra: "" };
  rest = mapCode(rest, (s) => s
    .replace(/\b(UNSIGNED|ZEROFILL)\b/gi, "")
    .replace(/\bCHARACTER\s+SET\s+\w+/gi, "")
    .replace(/\bCOLLATE\s+\w+/gi, "")
    .replace(/\bON\s+UPDATE\s+CURRENT_TIMESTAMP(\(\))?/gi, "")
    .replace(/\bCOMMENT\s*$/i, "")).replace(/\bCOMMENT\s+'[^']*'/gi, "");
  if (/\bAUTO_INCREMENT\b/i.test(codeOnly(rest))) {
    info.type = "int"; info.extra = "auto_increment";
    meta[name] = info;
    return { def: `${name} INTEGER PRIMARY KEY AUTOINCREMENT`, ai: name };
  }
  const en = rest.match(/^ENUM\s*\(([^)]*)\)/i);
  if (en) rest = "TEXT" + rest.slice(en[0].length) + ` CHECK (${name} IN (${en[1]}))`;
  meta[name] = info;
  return { def: `${name} ${generic(rest)}` };
}

function createTable(stmt) {
  const m = stmt.match(/^CREATE\s+(?:TEMPORARY\s+)?TABLE\s+(IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\(/i);
  if (!m) return null;
  const open = m[0].length - 1, close = matchParen(stmt, open);
  if (close < 0) return null;
  const table = m[2], meta = {}, defs = [], after = [];
  let ai = null;
  const parts = splitTop(stmt.slice(open + 1, close));
  for (const part of parts) {
    let k;
    if ((k = part.match(/^(UNIQUE\s+)?(?:KEY|INDEX)\s+`?(\w+)`?\s*\(([\s\S]+)\)$/i))) {
      after.push(`CREATE ${k[1] ? "UNIQUE " : ""}INDEX ${k[2]} ON ${table} (${k[3]})`);
    } else if (/^(CONSTRAINT\s+`?\w+`?\s+)?(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK)\b/i.test(part)) {
      const fk = part.match(/FOREIGN\s+KEY\s*\(\s*`?(\w+)`?\s*\)/i);
      // InnoDB indexes every foreign key column automatically.
      if (fk) after.push(`CREATE INDEX IF NOT EXISTS fk_${table}_${fk[1]} ON ${table} (${fk[1]})`);
      defs.push({ tableLevel: true, def: generic(part) });
    } else {
      const c = columnDef(part, table, meta);
      if (typeof c === "string") defs.push({ def: c });
      else { defs.push(c); if (c.ai) ai = c.ai; }
    }
  }
  const body = defs
    .filter((d) => !(ai && d.tableLevel && new RegExp(`^PRIMARY\\s+KEY\\s*\\(\\s*\`?${ai}\`?\\s*\\)$`, "i").test(d.def.trim())))
    .map((d) => d.def).join(", ");
  return { table, meta, sql: [`CREATE TABLE ${m[1] ? "IF NOT EXISTS " : ""}${table} (${body})`, ...after] };
}

const userRe = /'?([\w.-]+)'?(?:\s*@\s*'?([\w.%-]+)'?)?/;

/**
 * Translate one MySQL statement.
 * → { sql: [sqlite statements], table?, meta?, kind } or { builtin: name, ... }
 */
export function translate(stmt) {
  const s = stmt.trim();
  const head = (s.match(/^\w+/) || [""])[0].toUpperCase();
  let m;
  if (head === "SHOW") {
    if (/^SHOW\s+(FULL\s+)?TABLES/i.test(s)) return { builtin: "tables" };
    if (/^SHOW\s+(DATABASES|SCHEMAS)/i.test(s)) return { builtin: "databases" };
    if ((m = s.match(/^SHOW\s+(?:FULL\s+)?(?:COLUMNS|FIELDS)\s+(?:FROM|IN)\s+`?(\w+)`?/i))) return { builtin: "describe", table: m[1] };
    if ((m = s.match(/^SHOW\s+(?:INDEX|INDEXES|KEYS)\s+(?:FROM|IN)\s+`?(\w+)`?/i))) return { builtin: "indexes", table: m[1] };
    if ((m = s.match(/^SHOW\s+CREATE\s+(?:TABLE|VIEW)\s+`?(\w+)`?/i))) return { builtin: "showcreate", table: m[1] };
    if ((m = s.match(/^SHOW\s+GRANTS(?:\s+FOR\s+([\s\S]+))?$/i))) { const u = (m[1] || "'root'@'localhost'").match(userRe); return { builtin: "grants", user: u[1], host: u[2] || "%" }; }
    return { builtin: "error", message: "ERROR 1064 (42000): this SHOW command isn't available in the sandbox. Try SHOW TABLES, SHOW COLUMNS FROM t, SHOW INDEX FROM t, SHOW CREATE TABLE t or SHOW GRANTS FOR user." };
  }
  if ((m = s.match(/^(?:DESCRIBE|DESC)\s+`?(\w+)`?$/i))) return { builtin: "describe", table: m[1] };
  if ((m = s.match(/^(?:EXPLAIN|DESCRIBE|DESC)\s+((?:SELECT|WITH|UPDATE|DELETE)\b[\s\S]*)$/i))) return { builtin: "explain", query: generic(m[1]), raw: m[1] };
  if ((m = s.match(/^USE\s+`?(\w+)`?$/i))) return { builtin: "use", db: m[1] };
  if (/^(SET|LOCK|UNLOCK|FLUSH|ANALYZE)\b/i.test(s)) return { builtin: "ok" };
  if (/^CREATE\s+(DATABASE|SCHEMA)\b/i.test(s)) return { builtin: "ok", message: "Query OK, 1 row affected" };
  if (/^(PRAGMA|ATTACH|DETACH|VACUUM)\b/i.test(s)) return { builtin: "error", message: `ERROR 1064 (42000): You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '${head}'` };

  if ((m = s.match(/^CREATE\s+USER\s+(IF\s+NOT\s+EXISTS\s+)?([\s\S]+)$/i))) {
    const u = m[2].match(userRe);
    return { kind: "acct", sql: [`INSERT ${m[1] ? "OR IGNORE " : ""}INTO _users (user, host) VALUES (${lit(u[1])}, ${lit(u[2] || "%")})`] };
  }
  if ((m = s.match(/^DROP\s+USER\s+(?:IF\s+EXISTS\s+)?([\s\S]+)$/i))) {
    const u = m[1].match(userRe), w = `user = ${lit(u[1])} AND host = ${lit(u[2] || "%")}`;
    return { kind: "acct", sql: [`DELETE FROM _grants WHERE ${w}`, `DELETE FROM _users WHERE ${w}`] };
  }
  if ((m = s.match(/^(GRANT|REVOKE)\s+([\s\S]+?)\s+ON\s+(\S+)\s+(?:TO|FROM)\s+([\s\S]+)$/i))) {
    const u = m[4].match(userRe), user = u[1], host = u[2] || "%";
    const [d, t] = bare(m[3]).includes(".") ? bare(m[3]).split(".") : [DB_NAME, bare(m[3])];
    const privs = m[2].split(",").map((p) => p.trim().toUpperCase().replace(/^ALL(\s+PRIVILEGES)?$/, "ALL")).filter(Boolean);
    const sql = m[1].toUpperCase() === "GRANT"
      ? privs.map((p) => `INSERT OR IGNORE INTO _grants (user, host, priv, db, tbl) VALUES (${lit(user)}, ${lit(host)}, ${lit(p)}, ${lit(d)}, ${lit(t)})`)
      : privs.map((p) => `DELETE FROM _grants WHERE user = ${lit(user)} AND host = ${lit(host)} AND db = ${lit(d)} AND tbl = ${lit(t)}${p === "ALL" ? "" : ` AND priv = ${lit(p)}`}`);
    return { kind: "acct", needsUser: [user, host], sql };
  }

  if (head === "CREATE") {
    const ct = createTable(s);
    if (ct) return { kind: "ddl", ...ct };
    if ((m = s.match(/^CREATE\s+OR\s+REPLACE\s+VIEW\s+`?(\w+)`?\s+([\s\S]+)$/i))) return { kind: "ddl", sql: [`DROP VIEW IF EXISTS ${m[1]}`, generic(`CREATE VIEW ${m[1]} ${m[2]}`)] };
    if (/^CREATE\s+(PROCEDURE|FUNCTION|TRIGGER|EVENT)\b/i.test(s)) return { builtin: "error", message: "ERROR 1289 (HY000): stored procedures, functions, triggers and events aren't available in the sandbox." };
    return { kind: "ddl", sql: [generic(s)] };
  }
  if (head === "ALTER") {
    if ((m = s.match(/^ALTER\s+TABLE\s+`?(\w+)`?\s+ADD\s+(UNIQUE\s+)?(?:INDEX|KEY)\s+`?(\w+)`?\s*\(([\s\S]+)\)$/i))) return { kind: "ddl", sql: [`CREATE ${m[2] ? "UNIQUE " : ""}INDEX ${m[3]} ON ${m[1]} (${m[4]})`] };
    if ((m = s.match(/^ALTER\s+TABLE\s+`?(\w+)`?\s+ADD\s+(?:CONSTRAINT\s+`?(\w+)`?\s+)?UNIQUE\s*(?:KEY\s+|INDEX\s+)?`?(\w+)?`?\s*\(([\s\S]+)\)$/i))) return { kind: "ddl", sql: [`CREATE UNIQUE INDEX ${m[2] || m[3] || `uq_${m[1]}_${bare(m[4]).replace(/\W+/g, "_")}`} ON ${m[1]} (${m[4]})`] };
    if (/^ALTER\s+TABLE\s+`?\w+`?\s+(MODIFY|CHANGE|ADD\s+CONSTRAINT|ADD\s+FOREIGN|ADD\s+PRIMARY|DROP\s+(FOREIGN|PRIMARY|INDEX|KEY))\b/i.test(s)) {
      if ((m = s.match(/^ALTER\s+TABLE\s+`?\w+`?\s+DROP\s+(?:INDEX|KEY)\s+`?(\w+)`?$/i))) return { kind: "ddl", sql: [`DROP INDEX ${m[1]}`] };
      return { builtin: "error", message: "ERROR 1235 (42000): the sandbox can't change column types or constraints in place (real MySQL can). Here you can ADD COLUMN, DROP COLUMN, RENAME COLUMN, RENAME TO, and ADD/DROP INDEX." };
    }
    if ((m = s.match(/^(ALTER\s+TABLE\s+`?\w+`?\s+ADD\s+(?:COLUMN\s+)?)([\s\S]+)$/i))) {
      const c = columnDef(m[2].replace(/\s+(AFTER\s+`?\w+`?|FIRST)\s*$/i, ""), "", {});
      return { kind: "ddl", sql: [m[1] + (typeof c === "string" ? c : c.def)] };
    }
    return { kind: "ddl", sql: [generic(s)] };
  }
  if ((m = s.match(/^DROP\s+INDEX\s+`?(\w+)`?\s+ON\s+`?\w+`?$/i))) return { kind: "ddl", sql: [`DROP INDEX ${m[1]}`] };
  if ((m = s.match(/^TRUNCATE\s+(?:TABLE\s+)?`?(\w+)`?$/i))) return { kind: "ddl", sql: [`DELETE FROM ${m[1]}`] };
  if (head === "DROP" || head === "RENAME") return { kind: "ddl", sql: [generic(s)] };
  if (head === "START" || head === "BEGIN") return { kind: "begin", sql: ["BEGIN"] };
  if (head === "COMMIT") return { kind: "commit", sql: ["COMMIT"] };
  if (head === "ROLLBACK" && !/\bTO\b/i.test(s)) return { kind: "rollback", sql: ["ROLLBACK"] };
  return { kind: /^(SELECT|WITH|VALUES)$/.test(head) ? "query" : "dml", sql: [generic(s)] };
}

/* ── errors, phrased like the mysql client ───────────────────────── */
function mysqlError(msg, head) {
  let m;
  if ((m = msg.match(/near "([\s\S]*?)": syntax error/))) return `ERROR 1064 (42000): You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '${m[1]}'`;
  if (/incomplete input/.test(msg)) return "ERROR 1064 (42000): You have an error in your SQL syntax; the statement ends too early (a missing closing parenthesis, quote or clause?)";
  if ((m = msg.match(/no such table: (\S+)/))) return `ERROR 1146 (42S02): Table '${DB_NAME}.${m[1]}' doesn't exist`;
  if ((m = msg.match(/no such column: (\S+)/))) return `ERROR 1054 (42S22): Unknown column '${m[1]}' in 'field list'`;
  if ((m = msg.match(/has no column named (\S+)/))) return `ERROR 1054 (42S22): Unknown column '${m[1]}' in 'field list'`;
  if ((m = msg.match(/(?:table|view) `?"?(\w+)"?`? already exists/))) return `ERROR 1050 (42S01): Table '${m[1]}' already exists`;
  if ((m = msg.match(/index (\w+) already exists/))) return `ERROR 1061 (42000): Duplicate key name '${m[1]}'`;
  if ((m = msg.match(/UNIQUE constraint failed: (.+)/))) return `ERROR 1062 (23000): Duplicate entry for key '${m[1]}'`;
  if ((m = msg.match(/NOT NULL constraint failed: \w+\.(\w+)/))) return `ERROR 1048 (23000): Column '${m[1]}' cannot be null`;
  if (/FOREIGN KEY constraint failed/.test(msg)) return head === "INSERT"
    ? "ERROR 1452 (23000): Cannot add or update a child row: a foreign key constraint fails"
    : head === "DELETE" || head === "DROP" ? "ERROR 1451 (23000): Cannot delete or update a parent row: a foreign key constraint fails"
    : "ERROR 1452 (23000): Cannot add or update a child row: a foreign key constraint fails";
  if ((m = msg.match(/CHECK constraint failed: (\w+) IN \(/))) return `ERROR 1265 (01000): Data truncated for column '${m[1]}' at row 1 (the value isn't one of the allowed choices)`;
  if ((m = msg.match(/CHECK constraint failed: (.+)/))) return `ERROR 3819 (HY000): Check constraint '${m[1]}' is violated.`;
  if ((m = msg.match(/no such function: (\w+)/))) return `ERROR 1305 (42000): FUNCTION ${DB_NAME}.${m[1]} does not exist`;
  if ((m = msg.match(/ambiguous column name: (\S+)/))) return `ERROR 1052 (23000): Column '${m[1]}' in field list is ambiguous`;
  if ((m = msg.match(/(\d+) values for (\d+) columns/))) return "ERROR 1136 (21S01): Column count doesn't match value count at row 1";
  if (/wrong number of arguments to function (\w+)/.test(msg)) return `ERROR 1582 (42000): Incorrect parameter count in the call to native function`;
  if (/misuse of aggregate/.test(msg)) return "ERROR 1111 (HY000): Invalid use of group function";
  return `ERROR 1105 (HY000): ${msg}`;
}

/* ── MySQL functions SQLite doesn't have ─────────────────────────── */
const pad = (n, w = 2) => String(n).padStart(w, "0");
const toDate = (s) => {
  if (s == null) return null;
  const m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))) : null;
};
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const hms = (d) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const localNow = () => { const n = new Date(); return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes(), n.getSeconds())); };
function shift(s, iv, sign) {
  const d = toDate(s), m = String(iv || "").match(/^(-?\d+) (\w+)$/);
  if (!d || !m) return null;
  const n = sign * Number(m[1]), u = m[2].toUpperCase(), hadTime = /\d:\d/.test(String(s));
  if (u === "DAY") d.setUTCDate(d.getUTCDate() + n);
  else if (u === "WEEK") d.setUTCDate(d.getUTCDate() + 7 * n);
  else if (u === "MONTH") d.setUTCMonth(d.getUTCMonth() + n);
  else if (u === "YEAR") d.setUTCFullYear(d.getUTCFullYear() + n);
  else if (u === "HOUR") d.setUTCHours(d.getUTCHours() + n);
  else if (u === "MINUTE") d.setUTCMinutes(d.getUTCMinutes() + n);
  return hadTime || u === "HOUR" || u === "MINUTE" ? `${ymd(d)} ${hms(d)}` : ymd(d);
}
export const FUNCTIONS = {
  now: () => { const d = localNow(); return `${ymd(d)} ${hms(d)}`; },
  curdate: () => ymd(localNow()),
  database: () => DB_NAME,
  version: () => VERSION,
  year: (s) => toDate(s)?.getUTCFullYear() ?? null,
  month: (s) => { const d = toDate(s); return d ? d.getUTCMonth() + 1 : null; },
  day: (s) => toDate(s)?.getUTCDate() ?? null,
  dayofmonth: (s) => toDate(s)?.getUTCDate() ?? null,
  monthname: (s) => { const d = toDate(s); return d ? MONTHS[d.getUTCMonth()] : null; },
  dayname: (s) => { const d = toDate(s); return d ? DAYS[d.getUTCDay()] : null; },
  datediff: (a, b) => { const x = toDate(a), y = toDate(b); return x && y ? Math.round((Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) - Date.UTC(y.getUTCFullYear(), y.getUTCMonth(), y.getUTCDate())) / 864e5) : null; },
  date_add: (s, iv) => shift(s, iv, 1),
  date_sub: (s, iv) => shift(s, iv, -1),
  date_format: (s, f) => {
    const d = toDate(s);
    if (!d || f == null) return null;
    const map = { Y: d.getUTCFullYear(), y: pad(d.getUTCFullYear() % 100), m: pad(d.getUTCMonth() + 1), c: d.getUTCMonth() + 1, d: pad(d.getUTCDate()), e: d.getUTCDate(),
      M: MONTHS[d.getUTCMonth()], b: MONTHS[d.getUTCMonth()].slice(0, 3), W: DAYS[d.getUTCDay()], a: DAYS[d.getUTCDay()].slice(0, 3),
      H: pad(d.getUTCHours()), i: pad(d.getUTCMinutes()), s: pad(d.getUTCSeconds()), "%": "%" };
    return String(f).replace(/%(.)/g, (_, k) => (k in map ? map[k] : k));
  },
  _left: (s, n) => (s == null ? null : String(s).slice(0, Math.max(0, n))),
  _right: (s, n) => (s == null ? null : n <= 0 ? "" : String(s).slice(-n)),
  lpad: (s, n, p) => (s == null ? null : String(s).padStart(n, p).slice(0, n)),
  rpad: (s, n, p) => (s == null ? null : String(s).padEnd(n, p).slice(0, n)),
  char_length: (s) => (s == null ? null : String(s).length),
  floor: (x) => (x == null ? null : Math.floor(x)),
  ceil: (x) => (x == null ? null : Math.ceil(x)),
  ceiling: (x) => (x == null ? null : Math.ceil(x)),
};

/* ── result comparison ───────────────────────────────────────────── */
export const normCell = (v) => (v == null ? "NULL" : typeof v === "number" ? String(Math.round(v * 100) / 100) : String(v));
const rowKey = (r) => r.map(normCell).join("\u001f");

/** Compare a learner's result set with the expected one. */
export function compareResult(got, exp, ordered) {
  if (!got) return { ok: false, msg: "Run a SELECT that returns the rows the objective asks for." };
  if (got.columns.length !== exp.columns.length) return { ok: false, msg: `Not there yet: the target result has ${exp.columns.length} column${exp.columns.length === 1 ? "" : "s"} (${exp.columns.join(", ")}); yours has ${got.columns.length}.` };
  if (got.rows.length !== exp.rows.length) return { ok: false, msg: `Not there yet: the target result has ${exp.rows.length} row${exp.rows.length === 1 ? "" : "s"}; yours has ${got.rows.length}.` };
  const a = got.rows.map(rowKey), b = exp.rows.map(rowKey);
  if (ordered && a.every((k, i) => k === b[i])) return { ok: true };
  const sa = a.slice().sort(), sb = b.slice().sort();
  const same = sa.every((k, i) => k === sb[i]);
  if (same && !ordered) return { ok: true };
  if (same) return { ok: false, msg: "Right rows, wrong order. Check your ORDER BY (and its direction)." };
  // Same values in a different column order?
  const sortCols = (rows) => rows.map((r) => r.map(normCell).sort().join("\u001f")).sort();
  const ca = sortCols(got.rows), cb = sortCols(exp.rows);
  if (ca.every((k, i) => k === cb[i])) return { ok: false, msg: `Right data, but the columns are in a different order. Expected: ${exp.columns.join(", ")}.` };
  return { ok: false, msg: "Right shape, but some values differ from the target. Re-read the conditions in the objective." };
}

/* ── session ─────────────────────────────────────────────────────── */
function raw(db, sql) {
  const st = db.prepare(sql);
  try {
    const columns = st.getColumnNames();
    const rows = [];
    while (st.step()) rows.push(st.get());
    return { columns, rows };
  } finally { st.free(); }
}

/**
 * Open a sandbox database.
 * SQL: the initialised sql.js module. seed: array of MySQL statements.
 */
export function createSession(SQL, seed = []) {
  const db = new SQL.Database();
  for (const [name, fn] of Object.entries(FUNCTIONS)) db.create_function(name, fn);
  db.run("PRAGMA foreign_keys = ON");
  db.run("CREATE TABLE _users (user TEXT NOT NULL, host TEXT NOT NULL, PRIMARY KEY (user, host))");
  db.run("CREATE TABLE _grants (user TEXT NOT NULL, host TEXT NOT NULL, priv TEXT NOT NULL, db TEXT NOT NULL, tbl TEXT NOT NULL, PRIMARY KEY (user, host, priv, db, tbl))");
  db.run("INSERT INTO _users VALUES ('root', 'localhost')");
  db.run("INSERT INTO _grants VALUES ('root', 'localhost', 'ALL', '*', '*')");

  const sess = { db, stats: { begins: 0, commits: 0, rollbacks: 0, open: 0 }, meta: {}, ddl: {}, lastPlan: null };
  let inTx = false, mark = 0;
  const q = (sql) => raw(db, sql);
  const scalar = (sql) => { const r = q(sql); return r.rows.length ? r.rows[0][0] : null; };
  const changes = () => scalar("SELECT total_changes()");
  const exists = (t) => scalar(`SELECT COUNT(*) FROM sqlite_master WHERE type IN ('table','view') AND name = ${lit(t)} COLLATE NOCASE`) > 0;
  const noTable = (t) => ({ kind: "error", message: `ERROR 1146 (42S02): Table '${DB_NAME}.${t}' doesn't exist` });
  const userTables = () => q("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name").rows.filter((r) => !r[0].startsWith("_"));

  function columns(table) {
    const info = q(`PRAGMA table_info(${table})`).rows;
    const keys = {};
    for (const ix of q(`PRAGMA index_list(${table})`).rows) {
      const first = q(`PRAGMA index_info(${ix[1]})`).rows[0];
      if (first && first[2]) keys[first[2]] = keys[first[2]] === "UNI" || ix[2] ? "UNI" : "MUL";
    }
    const pkCount = info.filter((c) => c[5] > 0).length;
    return info.map((c) => {
      const mt = sess.meta[table.toLowerCase()]?.[c[1]];
      const type = mt?.type || String(c[2] || "text").toLowerCase().replace(/^integer$/, "int");
      return { name: c[1], type, nullable: !c[3] && !c[5], key: c[5] > 0 ? "PRI" : keys[c[1]] || "", dflt: c[4], extra: mt?.extra || "", pkCount };
    });
  }
  function indexes(table) {
    const out = [];
    const info = q(`PRAGMA table_info(${table})`).rows;
    const list = q(`PRAGMA index_list(${table})`).rows;
    if (!list.some((ix) => ix[3] === "pk")) info.filter((c) => c[5] > 0).sort((a, b) => a[5] - b[5]).forEach((c) => out.push({ name: "PRIMARY", unique: 1, seq: c[5], col: c[1], real: null }));
    for (const ix of list.slice().reverse()) {
      const cols = q(`PRAGMA index_info(${ix[1]})`).rows;
      const name = ix[3] === "pk" ? "PRIMARY" : ix[3] === "u" ? cols[0][2] : ix[1];
      cols.forEach((c) => out.push({ name, unique: ix[2], seq: c[0] + 1, col: c[2], real: ix[1] }));
    }
    return out;
  }
  const keyName = (table, real) => indexes(table).find((i) => i.real === real)?.name || real;

  function explain(query, rawQuery) {
    const plan = q(`EXPLAIN QUERY PLAN ${query}`).rows.map((r) => String(r[3]));
    sess.lastPlan = plan.join("\n");
    const alias = {};
    for (const m of rawQuery.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+`?(\w+)`?(?:\s+(?:AS\s+)?`?(\w+)`?)?/gi)) {
      alias[m[1].toLowerCase()] = m[1];
      if (m[2] && !/^(where|join|inner|left|right|on|group|order|limit|set|cross|using|having|union)$/i.test(m[2])) alias[m[2].toLowerCase()] = m[1];
    }
    const hasWhere = /\bWHERE\b/i.test(rawQuery);
    const rows = [];
    const extras = [];
    for (const d of plan) {
      let m;
      if ((m = d.match(/^(SCAN|SEARCH) (?:TABLE )?(\S+)(?: AS (\S+))?(.*)$/))) {
        const shown = m[3] || m[2], table = alias[shown.toLowerCase()] || alias[m[2].toLowerCase()] || m[2];
        const rest = m[4];
        const total = exists(table) ? scalar(`SELECT COUNT(*) FROM ${table}`) : null;
        let type = "ALL", key = null, est = total;
        const ex = [];
        const ix = rest.match(/USING (COVERING )?INDEX (\S+)(?: \((.*)\))?/);
        const pk = rest.match(/USING (?:INTEGER )?PRIMARY KEY(?: \((.*)\))?/);
        if (m[1] === "SCAN") {
          if (ix) { type = "index"; key = keyName(table, ix[2]); if (ix[1]) ex.push("Using index"); }
          else if (hasWhere) ex.push("Using where");
        } else if (pk) {
          key = "PRIMARY";
          const range = /[<>]/.test(pk[1] || "");
          type = range ? "range" : rows.length ? "eq_ref" : "const";
          est = range ? Math.max(1, Math.ceil(total / 3)) : 1;
          if (range) ex.push("Using where");
        } else if (ix) {
          key = keyName(table, ix[2]);
          const cond = ix[3] || "", range = /[<>]/.test(cond), col = (cond.match(/^(\w+)/) || [])[1];
          const uniq = indexes(table).some((i) => i.real === ix[2] && i.unique) && !range;
          type = range ? "range" : uniq ? (rows.length ? "eq_ref" : "const") : "ref";
          est = uniq ? 1 : Math.max(1, Math.ceil(range ? total / 3 : col ? total / Math.max(1, scalar(`SELECT COUNT(DISTINCT ${col}) FROM ${table}`)) : total / 10));
          if (range) ex.push("Using index condition");
          if (ix[1]) ex.push("Using index");
        }
        rows.push([1, "SIMPLE", shown, type, key, key, est, ex]);
      } else if (/TEMP B-TREE FOR (RIGHT PART OF )?ORDER BY/.test(d)) extras.push("Using filesort");
      else if (/TEMP B-TREE FOR (GROUP BY|DISTINCT)/.test(d)) extras.push("Using temporary");
    }
    if (!rows.length) rows.push([1, "SIMPLE", null, null, null, null, null, ["No tables used"]]);
    rows[0][7].push(...new Set(extras));
    return { kind: "rows", columns: ["id", "select_type", "table", "type", "possible_keys", "key", "rows", "Extra"], rows: rows.map((r) => [...r.slice(0, 7), r[7].join("; ") || null]) };
  }

  function builtin(t) {
    switch (t.builtin) {
      case "error": return { kind: "error", message: t.message };
      case "ok": return { kind: "ok", message: t.message || "Query OK, 0 rows affected" };
      case "use": return t.db.toLowerCase() === DB_NAME ? { kind: "ok", message: "Database changed" } : { kind: "error", message: `ERROR 1049 (42000): Unknown database '${t.db}'` };
      case "databases": return { kind: "rows", columns: ["Database"], rows: [["information_schema"], [DB_NAME]] };
      case "tables": return { kind: "rows", columns: [`Tables_in_${DB_NAME}`], rows: userTables().map((r) => [r[0]]) };
      case "describe": {
        if (!exists(t.table)) return noTable(t.table);
        return { kind: "rows", columns: ["Field", "Type", "Null", "Key", "Default", "Extra"], rows: columns(t.table).map((c) => [c.name, c.type, c.nullable ? "YES" : "NO", c.key, c.dflt == null ? null : String(c.dflt).replace(/^'|'$/g, ""), c.extra]) };
      }
      case "indexes": {
        if (!exists(t.table)) return noTable(t.table);
        return { kind: "rows", columns: ["Table", "Non_unique", "Key_name", "Seq_in_index", "Column_name"], rows: indexes(t.table).map((i) => [t.table, i.unique ? 0 : 1, i.name, i.seq, i.col]) };
      }
      case "showcreate": {
        if (!exists(t.table)) return noTable(t.table);
        const text = sess.ddl[t.table.toLowerCase()] || scalar(`SELECT sql FROM sqlite_master WHERE name = ${lit(t.table)} COLLATE NOCASE`);
        return { kind: "rows", columns: ["Table", "Create Table"], rows: [[t.table, text]] };
      }
      case "grants": {
        const w = `user = ${lit(t.user)} AND host = ${lit(t.host)}`;
        if (!scalar(`SELECT COUNT(*) FROM _users WHERE ${w}`)) return { kind: "error", message: `ERROR 1141 (42000): There is no such grant defined for user '${t.user}' on host '${t.host}'` };
        const who = `\`${t.user}\`@\`${t.host}\``;
        const rows = q(`SELECT db, tbl, GROUP_CONCAT(priv, ', ') FROM (SELECT * FROM _grants WHERE ${w} ORDER BY priv) GROUP BY db, tbl ORDER BY db, tbl`).rows;
        const fmt = (x) => (x === "*" ? "*" : `\`${x}\``);
        const out = rows.filter((r) => r[0] === "*").map((r) => [`GRANT ${r[2] === "ALL" ? "ALL PRIVILEGES" : r[2]} ON *.* TO ${who}`]);
        if (!out.length) out.push([`GRANT USAGE ON *.* TO ${who}`]);
        rows.filter((r) => r[0] !== "*").forEach((r) => out.push([`GRANT ${r[2] === "ALL" ? "ALL PRIVILEGES" : r[2]} ON ${fmt(r[0])}.${fmt(r[1])} TO ${who}`]));
        return { kind: "rows", columns: [`Grants for ${t.user}@${t.host}`], rows: out };
      }
      case "explain": return explain(t.query, t.raw);
    }
    return { kind: "error", message: "ERROR 1105 (HY000): unsupported command" };
  }

  /** Run one MySQL statement → { kind: rows|ok|error, … , sql } */
  function one(stmt) {
    const head = (stmt.match(/^\w+/) || [""])[0].toUpperCase();
    try {
      const t = translate(stmt);
      if (t.builtin) return builtin(t);
      if (/\b_(users|grants)\b|\bsqlite_\w+/i.test(codeOnly(stmt)) && t.kind !== "acct") return noTable((stmt.match(/\b(_users|_grants|sqlite_\w+)\b/i) || ["", "?"])[1]);
      if (t.needsUser && !scalar(`SELECT COUNT(*) FROM _users WHERE user = ${lit(t.needsUser[0])} AND host = ${lit(t.needsUser[1])}`)) {
        return { kind: "error", message: `ERROR 1410 (42000): You are not allowed to create a user with GRANT (create '${t.needsUser[0]}'@'${t.needsUser[1]}' with CREATE USER first)` };
      }
      if (t.kind === "commit" || t.kind === "rollback") {
        if (!inTx) return { kind: "ok", message: "Query OK, 0 rows affected" };
        const changed = changes() > mark;
        db.run(t.sql[0]);
        inTx = false; sess.stats.open = 0;
        if (changed) sess.stats[t.kind === "commit" ? "commits" : "rollbacks"]++;
        return { kind: "ok", message: "Query OK, 0 rows affected" };
      }
      // MySQL commits implicitly before DDL and before a new transaction.
      let note = "";
      if (inTx && (t.kind === "ddl" || t.kind === "begin")) {
        const changed = changes() > mark;
        db.run("COMMIT"); inTx = false; sess.stats.open = 0;
        if (changed) sess.stats.commits++;
        note = t.kind === "ddl" ? " (note: this DDL statement implicitly committed your open transaction, exactly as MySQL does)" : " (the previous transaction was committed implicitly)";
      }
      if (t.kind === "begin") {
        db.run("BEGIN"); inTx = true; mark = changes(); sess.stats.begins++; sess.stats.open = 1;
        return { kind: "ok", message: "Query OK, 0 rows affected" + note };
      }
      const before = changes();
      let res = null;
      for (const sql of t.sql) res = q(sql);
      if (t.table) { sess.meta[t.table.toLowerCase()] = t.meta; sess.ddl[t.table.toLowerCase()] = stmt; }
      // Show function names the way the learner typed them, not as rewritten for SQLite.
      const label = (n) => n.replace(/\b_left\(/g, "LEFT(").replace(/\b_right\(/g, "RIGHT(").replace(/\biif\(/g, "IF(").replace(/\blast_insert_rowid\(\)/g, "LAST_INSERT_ID()");
      if (res.columns.length) return { kind: "rows", columns: res.columns.map(label), rows: res.rows, sqlite: t.sql[t.sql.length - 1] };
      const n = t.kind === "ddl" && head !== "TRUNCATE" ? 0 : changes() - before;
      return { kind: "ok", message: `Query OK, ${n} row${n === 1 ? "" : "s"} affected${note}` };
    } catch (e) {
      return { kind: "error", message: mysqlError(String(e.message || e), head) };
    }
  }

  /** Run a script. Stops at the first error, like `mysql < file.sql`. */
  sess.run = (text) => {
    const out = [];
    for (const stmt of splitStatements(text)) {
      const r = one(stmt);
      r.stmt = stmt;
      out.push(r);
      if (r.kind === "error") break;
    }
    return out;
  };
  sess.one = one;
  // One unreadable table (a view whose base table was dropped, say) must not break the whole listing.
  sess.tables = () => userTables().map(([name, type]) => {
    try { return { name, type, cols: columns(name), rows: scalar(`SELECT COUNT(*) FROM "${name.replace(/"/g, '""')}"`) }; }
    catch { return { name, type, cols: [], rows: "?" }; }
  });
  sess.inTx = () => inTx;

  /** Query plan (SQLite's own wording) for a MySQL SELECT. */
  sess.plan = (mysql) => {
    try { return q(`EXPLAIN QUERY PLAN ${generic(mysql.replace(/;\s*$/, ""))}`).rows.map((r) => String(r[3])).join("\n"); }
    catch { return ""; }
  };

  // Each check runs inside a savepoint and is rolled back, so probing inserts leave no trace.
  function probe(fn) {
    db.run("SAVEPOINT _chk");
    try { return fn(); } catch { return false; } finally { db.run("ROLLBACK TO _chk"); db.run("RELEASE _chk"); }
  }
  const must = (stmt) => { for (const sql of translate(stmt).sql) q(sql); };
  const value = (stmt) => { const t = translate(stmt); let r; for (const sql of t.sql) r = q(sql); return r.rows.length ? r.rows[0][0] : null; };

  /** Fill in `is` for checks that say `expect: <sql>` (evaluated on the untouched database). */
  sess.resolve = (checks) => checks.map((c) => ("expect" in c ? { ...c, is: probe(() => value(c.expect)) } : c));

  sess.check = (c) => {
    if (c.stat) { const v = sess.stats[c.stat]; return v >= (c.min ?? -Infinity) && v <= (c.max ?? Infinity); }
    if (c.plan) { const p = sess.plan(c.plan); return new RegExp(c.uses, "i").test(p) && !(c.avoids && new RegExp(c.avoids, "i").test(p)); }
    return probe(() => {
      for (const s of c.pre || []) must(s);
      // "Rejected" must mean a constraint said no, not that the table is missing.
      if (c.rejects) { try { must(c.rejects); return false; } catch (e) { return /constraint failed/i.test(String(e.message || e)); } }
      if (c.sql) return normCell(value(c.sql)) === normCell(c.is);
      return true;
    });
  };

  sess.close = () => { try { db.close(); } catch { /* already closed */ } };

  for (const stmt of seed) {
    const r = one(stmt);
    if (r.kind === "error") throw new Error(`seed failed: ${r.message}\n${stmt.slice(0, 200)}`);
  }
  sess.stats = { begins: 0, commits: 0, rollbacks: 0, open: 0 };
  return sess;
}
