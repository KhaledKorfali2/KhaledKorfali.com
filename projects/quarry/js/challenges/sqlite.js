// Course: SQLite. For people who know SQL: what is different about the database
// that lives in a single file. Engine: real SQLite (sql.js), no dialect layer.

const NEWS = [
  "CREATE TABLE newsletter (email TEXT PRIMARY KEY, subscribed INTEGER NOT NULL DEFAULT 1, source TEXT NOT NULL)",
  "INSERT INTO newsletter (email, subscribed, source) SELECT email, 1, 'signup' FROM customers WHERE customer_id <= 12",
  "INSERT INTO newsletter (email, subscribed, source) VALUES ('ops@tidewater.test', 0, 'signup')",
];

export default [
  {
    id: "l-shell",
    title: "One File, No Server",
    level: 1, time: 8, slug: "sqlite_master",
    tags: [".tables", ".schema", "sqlite_master"],
    mode: "match", ordered: true,
    objective: "Using a query (not a dot-command), return the name of every table in this database, in alphabetical order.",
    lesson: `MySQL and PostgreSQL are **servers**: a program that runs all the time, listens on a network port, and manages users. **SQLite** is a library. The whole database is **one ordinary file**, and the program using it reads and writes that file directly. There's nothing to install, start, or log in to.

That makes it the most widely deployed database in the world: it's inside every phone, every web browser, and most desktop apps. It's also what powers the MySQL course's sandbox in Quarry.

### The sqlite3 shell
You'd normally open a database with ~sqlite3 shop.db~. The shell has **dot-commands**, which are instructions to the shell itself, not SQL. They start with a dot and take no semicolon:

~~~text
.tables            list tables
.schema orders     show the CREATE statement for a table
.indexes orders    list its indexes
~~~
There is no ~SHOW TABLES~ or ~DESCRIBE~ here; those are MySQL's.

### The catalogue is a table
SQLite keeps its own schema in a table called ~sqlite_master~ (also spelled ~sqlite_schema~), which you can query like any other:

~~~sql
SELECT type, name, sql
FROM sqlite_master;
~~~
Each row is a table, index, view or trigger, with the SQL that created it. Tools that inspect a SQLite file are just reading this table.

This console is a real SQLite, with the shop database you know from the MySQL course loaded into it.`,
    hints: ["Run ~.tables~ and ~.schema orders~ first to look around.", "~sqlite_master~ has a ~type~ column ('table', 'index', …) and a ~name~ column.", "~SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;~"],
    starter: ".tables",
    solution: "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;",
    debrief: `**When SQLite is the right tool**
- Apps on a phone or desktop: settings, caches, offline data.
- Small and medium websites. A single file on fast storage handles a surprising amount of traffic, especially reads.
- Data analysis and file exchange: a ~.db~ file is a far better container than a pile of CSVs.
- Tests and prototypes.

**When it isn't**
- Many writers at once. SQLite allows any number of readers but **one writer at a time**.
- Several application servers sharing one database over a network. That's what a client/server database is for.
- When you need users and permissions inside the database. SQLite has none; access is whatever the file system allows.

"Backing up" a SQLite database can be as simple as copying the file, though while it's in use you should use the ~.backup~ command or ~VACUUM INTO~ so you don't copy it mid-write.`,
  },

  {
    id: "l-types",
    title: "Flexible Typing",
    level: 2, time: 10, slug: "type_affinity",
    tags: ["typeof()", "type affinity"],
    mode: "match",
    objective: "The sensor_log table was loaded from a messy file. Report what is really stored in its reading column: one row per storage type, with the type name and how many values have it.",
    lesson: `In MySQL or PostgreSQL, a column's type is a rule: an ~INTEGER~ column cannot hold the text 'banana'. In SQLite, by default, a column's type is only a **preference**, called its **affinity**. Any column can hold any kind of value.

~~~sql
CREATE TABLE t (n INTEGER);
INSERT INTO t VALUES (42), ('banana'), (3.5);   -- all three succeed
~~~
SQLite tries to convert what you give it to the column's affinity (the text ~'42'~ becomes the integer 42) and, if it can't, **stores the value as it is**, without complaint.

### Storage classes
Every individual value has one of five storage classes, and ~typeof()~ tells you which:

| typeof() | Holds |
|---|---|
| ~null~ | NULL |
| ~integer~ | whole numbers |
| ~real~ | floating-point numbers |
| ~text~ | strings |
| ~blob~ | raw bytes |

There is no boolean (use 0 and 1), and no date type (next lesson).

### Why it matters
A column you believe is numeric can contain stray text, and nothing warns you until a ~SUM~ looks wrong or a comparison behaves oddly (in SQLite, any text sorts after any number). Checking ~typeof()~ is the first step when inheriting a SQLite file.

The ~reading~ column here was declared with no type at all, which is legal in SQLite and means "store whatever arrives".`,
    hints: ["Look at the raw data first: ~SELECT reading, typeof(reading) FROM sensor_log;~", "Group by ~typeof(reading)~ and count.", "~SELECT typeof(reading) AS kind, COUNT(*) AS n FROM sensor_log GROUP BY kind;~"],
    starter: "SELECT reading, typeof(reading)\nFROM sensor_log;",
    setup: () => ["CREATE TABLE sensor_log (id INTEGER PRIMARY KEY, reading)",
      "INSERT INTO sensor_log (reading) VALUES (21.5), (22), ('23.1'), ('n/a'), (NULL), (19.75), ('18'), (20), ('error'), (22.25), (NULL), (17)"],
    solution: "SELECT typeof(reading) AS kind, COUNT(*) AS n FROM sensor_log GROUP BY kind;",
    debrief: `Four kinds of value in one column. The texts ~'23.1'~ and ~'18'~ look like numbers but are stored as text, because the column had no numeric affinity to convert them.

**Cleaning it up** is a ~CAST~ plus a decision about the junk:
~~~sql
SELECT CAST(reading AS REAL)
FROM sensor_log
WHERE typeof(reading) IN ('integer', 'real')
   OR reading GLOB '[0-9]*';
~~~

**You can opt out of flexible typing.** Since version 3.37, adding the keyword ~STRICT~ after a table definition makes SQLite enforce column types the way other databases do. You'll use it two challenges from now. For new tables there's rarely a reason not to.`,
  },

  {
    id: "l-dates",
    title: "Dates Without a Date Type",
    level: 2, time: 12, slug: "sqlite_dates",
    tags: ["strftime", "julianday", "date()"],
    mode: "match", ordered: true,
    objective: "How fast do we ship? For orders placed from 2025-01-01 that have a shipped_date, return one row per month (as YYYY-MM) with the average number of days between order_date and shipped_date, rounded to 1 decimal, in chronological order.",
    lesson: `SQLite has no ~DATE~ or ~DATETIME~ type. Dates are stored as ordinary values and interpreted by a small set of functions. The convention almost everyone uses is **ISO 8601 text**: ~'2025-03-14'~ or ~'2025-03-14 09:30:00'~.

That format has a useful property: sorting it as text sorts it chronologically, so ~WHERE order_date >= '2025-01-01'~ works with no date type at all.

### The date functions
| Function | Returns |
|---|---|
| ~date('now')~, ~datetime('now')~ | today, and the current UTC time |
| ~date(d, '+7 days')~, ~date(d, 'start of month')~ | a shifted date |
| ~strftime('%Y-%m', d)~ | formatted text; ~%Y %m %d %H %M %S~ |
| ~julianday(d)~ | the date as a number of days (with fractions) |

~YEAR()~, ~MONTH()~, ~DATEDIFF()~ and ~DATE_FORMAT()~ don't exist here. Their equivalents:

~~~sql
SELECT strftime('%Y', order_date)                         AS year,
       julianday(shipped_date) - julianday(order_date)    AS days_to_ship
FROM orders
WHERE shipped_date IS NOT NULL;
~~~
Subtracting two ~julianday()~ values is the standard way to get the days between dates.

### The risk
Because dates are just text, nothing stops ~'14/03/2025'~ or ~'yesterday'~ from being stored. A ~CHECK~ constraint such as ~CHECK (order_date IS date(order_date))~ rejects anything that isn't a valid ISO date.`,
    hints: ["Month label: ~strftime('%Y-%m', order_date)~. Days to ship: ~julianday(shipped_date) - julianday(order_date)~.", "Filter with ~shipped_date IS NOT NULL AND order_date >= '2025-01-01'~, group by the month label.", "~SELECT strftime('%Y-%m', order_date) AS month, ROUND(AVG(julianday(shipped_date) - julianday(order_date)), 1) AS avg_days FROM orders WHERE shipped_date IS NOT NULL AND order_date >= '2025-01-01' GROUP BY month ORDER BY month;~"],
    starter: "SELECT order_id, order_date, shipped_date,\n       julianday(shipped_date) - julianday(order_date) AS days\nFROM orders\nWHERE shipped_date IS NOT NULL\nLIMIT 5;",
    solution: "SELECT strftime('%Y-%m', order_date) AS month, ROUND(AVG(julianday(shipped_date) - julianday(order_date)), 1) AS avg_days FROM orders WHERE shipped_date IS NOT NULL AND order_date >= '2025-01-01' GROUP BY month ORDER BY month;",
    debrief: `Text dates feel primitive, but they're portable, readable in any tool, and index and sort correctly. Two other conventions exist: Unix timestamps (integers, compact, good for arithmetic) and Julian day numbers. Pick one per database and stick to it.

**Time zones:** ~'now'~ is UTC. ~datetime('now', 'localtime')~ converts to the machine's zone. Store UTC, convert when displaying.

SQLite's function library is small on purpose, but applications can register their own functions in the host language. That's how Quarry's MySQL sandbox provides ~YEAR()~ and ~DATE_FORMAT()~ on top of this same engine.`,
  },

  {
    id: "l-upsert",
    title: "Upsert and RETURNING",
    level: 3, time: 12, slug: "on_conflict",
    tags: ["ON CONFLICT", "excluded", "RETURNING"],
    mode: "verify",
    objective: "Import three addresses into newsletter in ONE statement: ops@tidewater.test, new.hire@tidewater.test and events@tidewater.test, each with subscribed = 1 and source = 'import'. One already exists (unsubscribed) and must end up subscribed with source 'import'.",
    lesson: `MySQL's upsert is ~INSERT … ON DUPLICATE KEY UPDATE~. SQLite (and PostgreSQL, which it copied this from) spells it differently:

~~~sql
INSERT INTO newsletter (email, subscribed, source)
VALUES ('a@example.com', 1, 'import'),
       ('b@example.com', 1, 'import')
ON CONFLICT (email) DO UPDATE SET
  subscribed = excluded.subscribed,
  source     = excluded.source;
~~~

- ~ON CONFLICT (email)~ names the unique column whose collision you're handling. This is more precise than MySQL's version, which fires on any unique key.
- ~excluded~ is the row that was trying to get in. ~excluded.source~ is the value it carried.
- ~ON CONFLICT (email) DO NOTHING~ skips duplicates silently.

### RETURNING
Add ~RETURNING~ to an ~INSERT~, ~UPDATE~ or ~DELETE~ and the statement hands back the rows it touched:

~~~sql
INSERT INTO categories (name) VALUES ('Lighting')
RETURNING category_id, name;
~~~
That saves a second query to find out which id was generated or what a row looks like after an update. MySQL has no equivalent.`,
    hints: ["~SELECT * FROM newsletter;~ shows the existing row for ops@tidewater.test with subscribed = 0.", "One INSERT with three rows, then ~ON CONFLICT (email) DO UPDATE SET subscribed = excluded.subscribed, source = excluded.source~.", "~INSERT INTO newsletter (email, subscribed, source) VALUES ('ops@tidewater.test', 1, 'import'), ('new.hire@tidewater.test', 1, 'import'), ('events@tidewater.test', 1, 'import') ON CONFLICT (email) DO UPDATE SET subscribed = excluded.subscribed, source = excluded.source RETURNING *;~"],
    starter: "SELECT *\nFROM newsletter;",
    setup: () => NEWS,
    checks: [
      { label: "ops@tidewater.test is now subscribed, with source 'import'", sql: "SELECT COUNT(*) FROM newsletter WHERE email = 'ops@tidewater.test' AND subscribed = 1 AND source = 'import'", is: 1 },
      { label: "The two new addresses were added", sql: "SELECT COUNT(*) FROM newsletter WHERE email IN ('new.hire@tidewater.test', 'events@tidewater.test') AND subscribed = 1 AND source = 'import'", is: 2 },
      { label: "The 12 existing subscribers are untouched", sql: "SELECT COUNT(*) FROM newsletter WHERE source = 'signup' AND subscribed = 1", is: 12 },
      { label: "The table has exactly 15 rows", sql: "SELECT COUNT(*) FROM newsletter", is: 15 },
    ],
    solution: "INSERT INTO newsletter (email, subscribed, source) VALUES ('ops@tidewater.test', 1, 'import'), ('new.hire@tidewater.test', 1, 'import'), ('events@tidewater.test', 1, 'import') ON CONFLICT (email) DO UPDATE SET subscribed = excluded.subscribed, source = excluded.source;",
    debrief: `If you added ~RETURNING *~ you saw all three rows come back, including the one that was updated instead of inserted.

**Portability note.** ~ON CONFLICT … DO UPDATE~ and ~RETURNING~ work the same way in PostgreSQL, so this lesson transfers there unchanged. MySQL uses ~ON DUPLICATE KEY UPDATE~ and has no ~RETURNING~. SQL Server uses ~MERGE~ and ~OUTPUT~.

SQLite also has the older ~INSERT OR REPLACE~ and ~INSERT OR IGNORE~. Be careful with ~OR REPLACE~: it **deletes** the old row and inserts a new one, which resets any columns you didn't supply and can fire delete triggers. ~ON CONFLICT DO UPDATE~ is almost always what you actually want.`,
  },

  {
    id: "l-strict",
    title: "Making SQLite Strict",
    level: 3, time: 15, slug: "strict_and_foreign_keys",
    tags: ["STRICT", "PRAGMA foreign_keys", "constraints"],
    mode: "verify",
    objective: "Two jobs. (1) Turn on foreign-key enforcement for this connection. (2) Create a STRICT table stock_moves: move_id (integer primary key), product_id (required integer referencing products), qty (required integer) and moved_at (required text).",
    lesson: `Two of SQLite's defaults surprise everyone who arrives from another database. Both are there for backward compatibility, and both can be switched off.

### 1. Foreign keys are not enforced by default
You can declare ~REFERENCES~ and SQLite will parse it, store it, and then **ignore it**, unless the connection first runs:

~~~sql
PRAGMA foreign_keys = ON;
~~~
A **PRAGMA** is a SQLite-specific setting or query. This one is per connection, so every program that opens the database has to turn it on, every time. Check it with ~PRAGMA foreign_keys;~ (0 is off, 1 is on).

Try it now, before turning it on: ~DELETE FROM customers WHERE customer_id = 1;~ succeeds and leaves that customer's orders pointing at nobody. (Press **Reset database** afterwards.)

### 2. Types are not enforced by default
As you saw in "Flexible Typing". The fix is the ~STRICT~ keyword after the closing parenthesis:

~~~sql
CREATE TABLE readings (
  id    INTEGER PRIMARY KEY,
  value REAL NOT NULL,
  unit  TEXT NOT NULL
) STRICT;
~~~
In a STRICT table every column must be ~INTEGER~, ~REAL~, ~TEXT~, ~BLOB~ or ~ANY~, and a value of the wrong type is rejected.

### INTEGER PRIMARY KEY
A column declared exactly ~INTEGER PRIMARY KEY~ becomes an alias for SQLite's internal row id and auto-numbers itself. No ~AUTO_INCREMENT~ keyword is needed. (The ~AUTOINCREMENT~ keyword exists but only adds a guarantee that deleted ids are never reused, at a small cost; most tables don't need it.)`,
    hints: ["Run ~PRAGMA foreign_keys = ON;~ on its own, then ~PRAGMA foreign_keys;~ to confirm it says 1.", "Write the CREATE TABLE as usual, with ~REFERENCES products (product_id)~ on product_id, and add ~STRICT~ after the closing parenthesis.", "~CREATE TABLE stock_moves (move_id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products (product_id), qty INTEGER NOT NULL, moved_at TEXT NOT NULL) STRICT;~"],
    starter: "PRAGMA foreign_keys;",
    checks: [
      { label: "Foreign-key enforcement is on for this connection", pragma: "foreign_keys", is: 1 },
      { label: "A valid stock move is accepted and numbered automatically", pre: ["INSERT INTO stock_moves (product_id, qty, moved_at) VALUES (1, 5, '2025-06-01')"], sql: "SELECT COUNT(*) FROM stock_moves WHERE move_id IS NOT NULL AND qty = 5", is: 1 },
      { label: "Text in the qty column is rejected (the table is STRICT)", pre: ["INSERT INTO stock_moves (product_id, qty, moved_at) VALUES (1, 5, '2025-06-01')"], rejects: "INSERT INTO stock_moves (product_id, qty, moved_at) VALUES (1, 'ten', '2025-06-01')" },
      { label: "A product that doesn't exist is rejected", pre: ["INSERT INTO stock_moves (product_id, qty, moved_at) VALUES (1, 5, '2025-06-01')"], rejects: "INSERT INTO stock_moves (product_id, qty, moved_at) VALUES (9999, 5, '2025-06-01')" },
      { label: "moved_at is required", pre: ["INSERT INTO stock_moves (product_id, qty, moved_at) VALUES (1, 5, '2025-06-01')"], rejects: "INSERT INTO stock_moves (product_id, qty) VALUES (1, 5)" },
    ],
    solution: "PRAGMA foreign_keys = ON; CREATE TABLE stock_moves (move_id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products (product_id), qty INTEGER NOT NULL, moved_at TEXT NOT NULL) STRICT;",
    debrief: `With both switched on, SQLite protects data as firmly as a server database.

**A sensible opening sequence** for an application using SQLite:
~~~sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;      -- readers no longer block the writer, and vice versa
PRAGMA busy_timeout = 5000;     -- wait up to 5 s for a lock instead of failing at once
~~~
~journal_mode = WAL~ (write-ahead logging) is stored in the file, so it only needs setting once; the other two are per connection. Most "SQLite is slow" or "database is locked" complaints disappear with those three lines.

**Changing tables later is limited.** SQLite's ~ALTER TABLE~ can add, rename and drop columns, but can't change a column's type or add a constraint. The documented procedure is: create a new table, copy the data across, drop the old one, rename. Migration tools do this for you.`,
  },

  {
    id: "l-plan",
    title: "EXPLAIN QUERY PLAN",
    level: 3, time: 12, slug: "sqlite_query_plan",
    tags: ["EXPLAIN QUERY PLAN", "CREATE INDEX"],
    mode: "verify",
    objective: "The app looks up a customer's orders with SELECT * FROM orders WHERE customer_id = 7, and SQLite scans the whole table to do it. Add an index so it searches instead.",
    lesson: `Indexes work in SQLite exactly as they do in MySQL: B-trees that let the engine jump to matching rows. The way you inspect a plan is different.

~~~sql
EXPLAIN QUERY PLAN
SELECT * FROM orders WHERE customer_id = 7;
~~~
The output is a short description, one line per step:

| You see | Meaning |
|---|---|
| ~SCAN orders~ | reads every row: a full table scan |
| ~SEARCH orders USING INDEX idx (customer_id=?)~ | jumps into an index |
| ~SEARCH orders USING INTEGER PRIMARY KEY (rowid=?)~ | direct lookup by primary key |
| ~USING COVERING INDEX~ | answered from the index alone |
| ~USE TEMP B-TREE FOR ORDER BY~ | had to sort; an index could avoid it |

**SCAN is the word to look for.** On a big table it's the slow one.

### No automatic foreign-key indexes
MySQL's InnoDB quietly creates an index on every foreign key column. **SQLite does not** (neither does PostgreSQL). ~orders.customer_id~ is a foreign key with no index, so finding one customer's orders reads all of them. Indexing foreign keys you join or filter on is your job here.

~~~sql
CREATE INDEX idx_orders_customer ON orders (customer_id);
~~~

(Plain ~EXPLAIN~ without ~QUERY PLAN~ also exists; it prints the low-level bytecode program SQLite will run, which is fascinating and rarely what you want.)`,
    hints: ["Run the EXPLAIN QUERY PLAN in the editor: it says SCAN orders.", "Create an index on the column in the WHERE clause.", "~CREATE INDEX idx_orders_customer ON orders (customer_id);~ then run the EXPLAIN QUERY PLAN again."],
    starter: "EXPLAIN QUERY PLAN\nSELECT * FROM orders WHERE customer_id = 7;",
    checks: [
      { label: "Looking up a customer's orders uses an index (SEARCH, not SCAN)", plan: "SELECT * FROM orders WHERE customer_id = 7", uses: "SEARCH orders USING (COVERING )?INDEX \\S+ \\(customer_id=" },
    ],
    solution: "CREATE INDEX idx_orders_customer ON orders (customer_id);",
    debrief: `~SCAN orders~ became ~SEARCH orders USING INDEX idx_orders_customer (customer_id=?)~.

**SQLite's planner needs statistics too.** Run ~ANALYZE;~ occasionally (or ~PRAGMA optimize;~ when closing a connection) so it knows how selective each index is. Without statistics it guesses.

**Everything else you learned about indexes carries over:** composite indexes and the leftmost-prefix rule, equality columns before range columns, and not wrapping an indexed column in a function. SQLite adds two tricks worth knowing: **partial indexes** (~CREATE INDEX … WHERE status = 'pending'~, tiny and fast for a hot subset) and **indexes on expressions** (~CREATE INDEX … ON customers (lower(email))~).

That's the practical difference list for SQLite: dot-commands, flexible typing and STRICT, text dates, ~ON CONFLICT~ and ~RETURNING~, the foreign-key pragma, and ~EXPLAIN QUERY PLAN~. The SQL itself is what you already know.`,
  },
];
