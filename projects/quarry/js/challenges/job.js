// Track 8: On the Job. Views, users and privileges, an incident clean-up,
// a safe production change, and a capstone report.

const LIVE = "o.status <> 'cancelled'";

export default [
  {
    id: "o-view",
    title: "Views: Save a Query for the Team",
    level: 3, time: 15, slug: "create_view",
    tags: ["CREATE VIEW", "COUNT DISTINCT"],
    mode: "verify",
    objective: "Everyone keeps rewriting the same customer-spend query, and getting it slightly wrong. Create a view named customer_totals with one row per customer who has at least one non-cancelled order, and four columns: customer_id, email, orders (how many non-cancelled orders they have) and total_spent (quantity × unit_price over those orders, rounded to 2 decimals).",
    lesson: `A **view** is a ~SELECT~ statement saved in the database under a name. You query it like a table:

~~~sql
CREATE VIEW active_products AS
SELECT product_id, name, price, stock
FROM products
WHERE discontinued = 0;

SELECT name FROM active_products WHERE stock < 10;
~~~
A view stores **no data**. Every time it's queried, the underlying ~SELECT~ runs against the current tables, so it's always up to date.

### Why teams use them
- **One definition of the truth.** "Revenue excludes cancelled orders" is written once, in the view, instead of being re-typed (and occasionally forgotten) in fifty reports.
- **Simplicity.** A five-table join becomes ~SELECT * FROM order_summary~.
- **Access control.** You can let someone read a view that exposes a few safe columns without giving them the tables behind it.

Change one with ~CREATE OR REPLACE VIEW name AS …~ and remove it with ~DROP VIEW name~.

### Watch the fan-out
The view you're asked for needs **two aggregates at different levels**: a count of orders and a sum over order lines. Once you join ~orders~ to ~order_items~, each order appears once per line, so ~COUNT(*)~ counts lines. You met the fix in the Joins track: ~COUNT(DISTINCT o.order_id)~.

Test the ~SELECT~ by itself until it's right, then put ~CREATE VIEW customer_totals AS~ in front of it.`,
    hints: ["Start from the Top Customers query: customers → orders → order_items, WHERE the order isn't cancelled, GROUP BY customer.", "Columns: ~c.customer_id, c.email, COUNT(DISTINCT o.order_id) AS orders, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS total_spent~.", "~CREATE VIEW customer_totals AS SELECT c.customer_id, c.email, COUNT(DISTINCT o.order_id) AS orders, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS total_spent FROM customers c JOIN orders o ON o.customer_id = c.customer_id JOIN order_items oi ON oi.order_id = o.order_id WHERE o.status <> 'cancelled' GROUP BY c.customer_id, c.email;~"],
    starter: "SELECT c.customer_id, c.email, o.order_id, oi.quantity, oi.unit_price\nFROM customers c\nJOIN orders o ON o.customer_id = c.customer_id\nJOIN order_items oi ON oi.order_id = o.order_id\nWHERE o.status <> 'cancelled'\nLIMIT 10;",
    checks: [
      { label: "customer_totals has one row per customer with a non-cancelled order", sql: "SELECT COUNT(*) FROM customer_totals", expect: "SELECT COUNT(DISTINCT customer_id) FROM orders WHERE status <> 'cancelled'" },
      { label: "It has customer_id and email columns that match customers", sql: "SELECT COUNT(*) FROM customer_totals t JOIN customers c ON c.customer_id = t.customer_id AND c.email = t.email", expect: "SELECT COUNT(DISTINCT customer_id) FROM orders WHERE status <> 'cancelled'" },
      { label: "orders counts orders, not order lines", sql: "SELECT SUM(orders) FROM customer_totals", expect: "SELECT COUNT(*) FROM orders WHERE status <> 'cancelled'" },
      { label: "total_spent adds up to total non-cancelled revenue", sql: "SELECT ROUND(SUM(total_spent), 2) FROM customer_totals", expect: `SELECT ROUND(SUM(oi.quantity * oi.unit_price), 2) FROM orders o JOIN order_items oi ON oi.order_id = o.order_id WHERE ${LIVE}` },
      { label: "It's a live view, not a copied table", pre: ["UPDATE orders SET status = 'cancelled'"], sql: "SELECT COUNT(*) FROM customer_totals", is: 0 },
    ],
    solution: `CREATE VIEW customer_totals AS SELECT c.customer_id, c.email, COUNT(DISTINCT o.order_id) AS orders, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS total_spent FROM customers c JOIN orders o ON o.customer_id = c.customer_id JOIN order_items oi ON oi.order_id = o.order_id WHERE ${LIVE} GROUP BY c.customer_id, c.email;`,
    debrief: `Now ~SELECT * FROM customer_totals ORDER BY total_spent DESC LIMIT 5;~ is the whole "top customers" report, and everyone who uses the view gets the same definition of "spent".

Things to know before leaning on views heavily:
- **A view is as slow as its query.** It isn't a cache. A heavy view queried in a loop runs the heavy query every time.
- Some databases offer **materialized views**, which do store the result and refresh it on a schedule. MySQL doesn't have them built in; teams build a summary table and a scheduled job instead. PostgreSQL does, and you'll meet them there.
- **Views built on views** get hard to reason about and hard to optimise. One layer is healthy; four is a maze.

**On the job:** views are how analysts and BI tools are usually given access. If you're asked to "expose" data to a dashboard, a well-named view is often the answer.`,
  },

  {
    id: "o-grant",
    title: "Users and Least Privilege",
    level: 3, time: 15, slug: "users_and_grants",
    tags: ["CREATE USER", "GRANT", "REVOKE", "security"],
    mode: "verify",
    objective: "Set up two accounts. (1) 'reporting'@'%' for the BI dashboard: read-only access to every table in the shop database. (2) 'checkout'@'10.0.%' for the checkout service: SELECT, INSERT and UPDATE on shop.orders, and SELECT on shop.products. Neither account may have anything more.",
    lesson: `You've been working as ~root~, the account that can do anything. Real systems never let applications or people connect as root. Each gets its own account with the **least privilege** needed for its job, so that a bug, a leaked password or a typo can only do limited damage.

### Accounts
~~~sql
CREATE USER 'analyst'@'%' IDENTIFIED BY 'a-long-random-password';
~~~
A MySQL account is a name **plus the host it may connect from**:
- ~'analyst'@'%'~: from anywhere
- ~'app'@'10.0.%'~: only from addresses starting 10.0.
- ~'admin'@'localhost'~: only from the database server itself

### Privileges
~~~sql
GRANT SELECT ON shop.* TO 'analyst'@'%';                  -- read every table in shop
GRANT SELECT, INSERT ON shop.orders TO 'app'@'10.0.%';    -- two privileges on one table
REVOKE INSERT ON shop.orders FROM 'app'@'10.0.%';         -- take one back
SHOW GRANTS FOR 'app'@'10.0.%';                           -- what can it do?
~~~
Privileges are granted **per action** (~SELECT~, ~INSERT~, ~UPDATE~, ~DELETE~, ~CREATE~, ~DROP~, ~ALTER~…) at a **scope**: ~*.*~ (everything), ~shop.*~ (one database), or ~shop.orders~ (one table).

~GRANT ALL PRIVILEGES ON *.*~ is the one you'll see in tutorials and should almost never run. It's root by another name.

### Thinking it through
For each account ask: *what is the minimum this needs to do its job?* A dashboard only reads. A checkout service creates and updates orders and reads the catalogue; it has no business deleting orders or seeing employee salaries.

The sandbox records accounts and grants so you can practise the statements; ~SHOW GRANTS~ works, but it doesn't actually log you in as the new users.`,
    hints: ["Create each user before granting to it: ~CREATE USER 'reporting'@'%' IDENTIFIED BY '…';~", "Reporting needs one grant: ~GRANT SELECT ON shop.* TO 'reporting'@'%';~ Checkout needs two GRANT statements, one per table.", "~CREATE USER 'checkout'@'10.0.%' IDENTIFIED BY '…'; GRANT SELECT, INSERT, UPDATE ON shop.orders TO 'checkout'@'10.0.%'; GRANT SELECT ON shop.products TO 'checkout'@'10.0.%';~ If you granted too much, use REVOKE (or Reset database)."],
    starter: "SHOW GRANTS FOR 'root'@'localhost';",
    checks: [
      { label: "Account 'reporting'@'%' exists", sql: "SELECT COUNT(*) FROM _users WHERE user = 'reporting' AND host = '%'", is: 1 },
      { label: "reporting can SELECT on shop.* and nothing else", sql: "SELECT GROUP_CONCAT(priv || ' ' || db || '.' || tbl, '; ') FROM _grants WHERE user = 'reporting'", is: "SELECT shop.*" },
      { label: "Account 'checkout'@'10.0.%' exists (restricted to the app network)", sql: "SELECT COUNT(*) FROM _users WHERE user = 'checkout' AND host = '10.0.%'", is: 1 },
      { label: "checkout has SELECT, INSERT and UPDATE on shop.orders", sql: "SELECT COUNT(*) FROM _grants WHERE user = 'checkout' AND host = '10.0.%' AND db = 'shop' AND tbl = 'orders' AND priv IN ('SELECT', 'INSERT', 'UPDATE')", is: 3 },
      { label: "checkout has SELECT on shop.products", sql: "SELECT COUNT(*) FROM _grants WHERE user = 'checkout' AND host = '10.0.%' AND db = 'shop' AND tbl = 'products' AND priv = 'SELECT'", is: 1 },
      { label: "checkout has no other privileges (no DELETE, no ALL)", sql: "SELECT COUNT(*) FROM _grants WHERE user = 'checkout'", is: 4 },
    ],
    solution: "CREATE USER 'reporting'@'%' IDENTIFIED BY 'x7#Lq-long-random'; GRANT SELECT ON shop.* TO 'reporting'@'%'; CREATE USER 'checkout'@'10.0.%' IDENTIFIED BY 'p2$Vn-long-random'; GRANT SELECT, INSERT, UPDATE ON shop.orders TO 'checkout'@'10.0.%'; GRANT SELECT ON shop.products TO 'checkout'@'10.0.%';",
    debrief: `Least privilege is the cheapest security control there is. If the dashboard's password leaks, the attacker can read. They can't alter prices, delete orders or drop tables. If the checkout service has a SQL-injection bug, the blast radius is two tables, not the company.

How professionals handle access:
- **One account per application or person.** Shared logins make it impossible to tell who did what.
- **Roles** (MySQL 8): ~CREATE ROLE 'read_only'; GRANT SELECT ON shop.* TO 'read_only'; GRANT 'read_only' TO 'ana'@'%';~ Manage privileges once per job function instead of once per person.
- **Restrict the host.** An app account that can only connect from the app servers is useless to someone who steals its password from elsewhere.
- **Passwords live in a secrets manager**, never in source code or a wiki page.
- **Review grants regularly.** ~SHOW GRANTS~ on every account is a standard audit step, and "why does this have ALL?" is the standard finding.

Humans on production should usually get read-only access by default, with write access granted for a specific change and removed afterwards.`,
  },

  {
    id: "o-dupes",
    title: "Incident: Duplicate Rows",
    level: 4, time: 20, slug: "dedupe_and_prevent",
    tags: ["GROUP BY HAVING", "DELETE", "UNIQUE"],
    mode: "verify",
    objective: "A retry bug in the signup service inserted some subscriptions two or three times. In the subscriptions table: (1) remove the duplicates, keeping the earliest row (lowest id) for each email, and (2) make it impossible for the same email to be inserted twice again.",
    lesson: `It's Monday. Support reports customers being billed twice. The ~subscriptions~ table should have one row per email, and it doesn't. This is a very common incident, and the response always has the same three phases.

### 1. Measure: how bad is it?
Group by the column that should be unique and keep groups with more than one row:
~~~sql
SELECT email, COUNT(*) AS copies, MIN(id) AS keep_id
FROM subscriptions
GROUP BY email
HAVING COUNT(*) > 1;
~~~
Now you know which emails are affected, how many copies each has, and which row you intend to keep.

### 2. Clean up
The rows to keep are the lowest ~id~ per email. Delete everything else:
~~~sql
DELETE FROM subscriptions
WHERE id NOT IN (
  SELECT keep_id FROM (
    SELECT MIN(id) AS keep_id
    FROM subscriptions
    GROUP BY email
  ) AS keepers
);
~~~
The extra ~SELECT … FROM ( … ) AS keepers~ wrapper looks pointless, but real MySQL needs it. Without it you get ~ERROR 1093: You can't specify target table 'subscriptions' for update in FROM clause~, because MySQL won't delete from a table while reading the same table in a direct subquery. Wrapping it makes MySQL compute the list first.

On production you'd do this inside a transaction and check the counts before ~COMMIT~.

### 3. Prevent it happening again
Cleaning up without fixing the cause means doing it again next month. The durable fix is a constraint:
~~~sql
ALTER TABLE subscriptions ADD UNIQUE INDEX uq_subscriptions_email (email);
~~~
You can only add it **after** the duplicates are gone; with duplicates present, MySQL refuses to build a unique index.`,
    hints: ["Start with the measuring query from the lesson so you can see the damage.", "Use the DELETE … WHERE id NOT IN (…) statement from the lesson as written. Then count again: no email should appear twice.", "After the delete: ~ALTER TABLE subscriptions ADD UNIQUE INDEX uq_subscriptions_email (email);~"],
    starter: "SELECT email, COUNT(*) AS copies, MIN(id) AS keep_id\nFROM subscriptions\nGROUP BY email\nHAVING COUNT(*) > 1;",
    setup(ctx) {
      const ids = ctx.shuffle(Array.from({ length: 30 }, (_, i) => i + 1)).slice(0, 7);
      return [
        "CREATE TABLE subscriptions (id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(120) NOT NULL, plan VARCHAR(10) NOT NULL, created_at DATE NOT NULL)",
        "INSERT INTO subscriptions (email, plan, created_at) SELECT email, IF(customer_id % 2 = 0, 'plus', 'basic'), '2025-05-01' FROM customers WHERE customer_id <= 30 ORDER BY customer_id",
        `INSERT INTO subscriptions (email, plan, created_at) SELECT email, IF(customer_id % 2 = 0, 'plus', 'basic'), '2025-06-10' FROM customers WHERE customer_id IN (${ids.join(", ")})`,
        `INSERT INTO subscriptions (email, plan, created_at) SELECT email, IF(customer_id % 2 = 0, 'plus', 'basic'), '2025-06-10' FROM customers WHERE customer_id IN (${ids.slice(0, 2).join(", ")})`,
      ];
    },
    checks: [
      { label: "No email appears more than once", sql: "SELECT COUNT(*) - COUNT(DISTINCT email) FROM subscriptions", is: 0 },
      { label: "The earliest row for every email was kept (all 30 originals)", sql: "SELECT COUNT(*) FROM subscriptions WHERE id <= 30", is: 30 },
      { label: "Nothing but the duplicates was deleted", sql: "SELECT COUNT(*) FROM subscriptions", is: 30 },
      { label: "A duplicate email is now rejected by the database", rejects: "INSERT INTO subscriptions (email, plan, created_at) SELECT email, plan, '2025-07-01' FROM subscriptions WHERE id = 1" },
    ],
    solution: "DELETE FROM subscriptions WHERE id NOT IN (SELECT keep_id FROM (SELECT MIN(id) AS keep_id FROM subscriptions GROUP BY email) AS keepers); ALTER TABLE subscriptions ADD UNIQUE INDEX uq_subscriptions_email (email);",
    debrief: `Measure, clean, prevent. That sequence applies to nearly every data incident, and the third step is the one that gets skipped under pressure.

Notice what the unique index changes. Before, correctness depended on the signup service never retrying at the wrong moment. Now the **database** guarantees it: the second insert fails with error 1062, and the service can handle that (or use the upsert you learned earlier). A constraint turns "we hope this never happens" into "this cannot happen".

What a good incident write-up would add:
- **How many** customers were affected and since when (your measuring query).
- **A backup** of the rows you deleted, taken first: ~CREATE TABLE subscriptions_removed AS SELECT …~.
- **The root cause** in the application, fixed separately. The constraint is the safety net, not the repair.`,
  },

  {
    id: "o-fix",
    title: "A Safe Production Change",
    level: 4, time: 18, slug: "safe_data_fix",
    tags: ["transaction", "UPDATE", "verification"],
    mode: "verify",
    objective: "A bad deploy reset some orders to 'paid' even though they had already shipped: they have status = 'paid' and a shipped_date. Set those orders to 'shipped'. Do it the professional way: inside a transaction, checking the row count before you commit. Genuinely paid orders (no shipped_date) must not change.",
    lesson: `This is the kind of task that lands on a developer or analyst with database access: a **data fix** on live data. The SQL is one easy ~UPDATE~. The skill is in the procedure around it, because there's no Reset button on production.

### The checklist
~~~sql
-- 1. Measure. How many rows SHOULD change?
SELECT COUNT(*) FROM orders
WHERE status = 'paid' AND shipped_date IS NOT NULL;

-- 2. Open a transaction.
START TRANSACTION;

-- 3. Change, using exactly the WHERE you just tested.
UPDATE orders
SET status = 'shipped'
WHERE status = 'paid' AND shipped_date IS NOT NULL;
-- "N rows affected" must equal the count from step 1.

-- 4. Verify from inside the transaction.
SELECT status, COUNT(*) FROM orders GROUP BY status;

-- 5. Decide.
COMMIT;      -- or ROLLBACK; if anything looks off
~~~
Run it **one statement at a time**. The point of the transaction is the pause between steps 3 and 5: you get to look at the result while you can still back out.

### Why each step exists
- **Measure first** so "rows affected" means something. If you expected 30 and the update says 3,000, you ~ROLLBACK~ and nobody ever knows.
- **Same WHERE** so what you tested is what you ran. Copy and paste it; don't retype.
- **Verify before commit** because afterwards is too late.

On a real system you'd also save the affected ids first, tell your team in the channel before starting, and paste the before and after counts into the ticket.`,
    hints: ["Count the broken rows first: ~SELECT COUNT(*) FROM orders WHERE status = 'paid' AND shipped_date IS NOT NULL;~", "~START TRANSACTION;~ then the UPDATE with that same WHERE, then check that rows affected matches your count.", "~UPDATE orders SET status = 'shipped' WHERE status = 'paid' AND shipped_date IS NOT NULL;~ then ~COMMIT;~"],
    starter: "SELECT status, COUNT(*) AS orders, COUNT(shipped_date) AS with_ship_date\nFROM orders\nGROUP BY status;",
    setup: (ctx) => [`UPDATE orders SET status = 'paid' WHERE shipped_date IS NOT NULL AND order_id % 9 = ${ctx.int(0, 8)}`],
    checks: [
      { label: "No order is 'paid' with a shipped_date any more", sql: "SELECT COUNT(*) FROM orders WHERE status = 'paid' AND shipped_date IS NOT NULL", is: 0 },
      { label: "The broken orders are now 'shipped'", sql: "SELECT COUNT(*) FROM orders WHERE status = 'shipped'", expect: "SELECT COUNT(*) FROM orders WHERE status = 'shipped' OR (status = 'paid' AND shipped_date IS NOT NULL)" },
      { label: "Genuinely paid orders are untouched", sql: "SELECT COUNT(*) FROM orders WHERE status = 'paid'", expect: "SELECT COUNT(*) FROM orders WHERE status = 'paid' AND shipped_date IS NULL" },
      { label: "Delivered, pending and cancelled orders are untouched", sql: "SELECT COUNT(*) FROM orders WHERE status IN ('delivered', 'pending', 'cancelled')", expect: "SELECT COUNT(*) FROM orders WHERE status IN ('delivered', 'pending', 'cancelled')" },
      { label: "The change was made in a transaction and committed", stat: "commits", min: 1 },
      { label: "No transaction is left open", stat: "open", max: 0 },
    ],
    solution: "START TRANSACTION; UPDATE orders SET status = 'shipped' WHERE status = 'paid' AND shipped_date IS NOT NULL; COMMIT;",
    debrief: `Nothing about that SQL was hard, and that's the lesson: on production, **discipline beats cleverness**. The people trusted with write access aren't the ones who know the most syntax. They're the ones who measure, use a transaction, verify, and leave a record.

One subtlety in this fix: those orders might have been 'delivered' before the bad deploy, not 'shipped'. The data alone can't tell you. A careful engineer would say so in the ticket and check the application logs or a backup before choosing. **Knowing what your data can't tell you** is part of the job.

What mature teams add on top:
- Fixes are written as a script, **reviewed by a second person**, and run by a tool that records who ran what and when.
- **Backups are tested** by actually restoring them. An untested backup is a hope, not a backup.
- **Point-in-time recovery** (from MySQL's binary log) can rewind a database to the moment before a mistake. Find out whether yours has it before you need it.`,
  },

  {
    id: "o-capstone",
    title: "Capstone: The Monday Report",
    level: 5, time: 30, slug: "capstone_report",
    tags: ["CTE", "window function", "JOIN", "GROUP BY"],
    mode: "match", ordered: true,
    objective: "The CEO wants a 2025 category scorecard. Considering only non-cancelled orders placed from 2025-01-01, return one row per category with four columns: category name, revenue (quantity × unit_price, rounded to 2 decimals), units sold (total quantity), and the name of its best-selling product by units (ties broken alphabetically by product name). Sort by revenue, highest first.",
    lesson: `No new syntax here. This is the kind of request that arrives as one sentence in a chat message, and answering it uses most of the course: a four-table join, filtering, two levels of grouping, a window function and CTEs to keep it readable.

### Plan before typing
**Grain of the answer:** one row per category.

**The awkward part:** "best-selling product in each category" is a *top-1-per-group* question, which needs per-product numbers first. So there are two levels of aggregation:

1. **Per product:** units and revenue for each product in 2025, with its category. (Join, filter, ~GROUP BY~ category and product.)
2. **Rank** products inside each category by units. (~ROW_NUMBER() OVER (PARTITION BY … ORDER BY units DESC, product)~; the second sort key is the alphabetical tie-break.)
3. **Per category:** add up the product rows, and pick out the name of the product ranked 1.

### A trick for step 3
To pull one row's value out of a group while aggregating the rest, use ~CASE~ inside ~MAX~:
~~~sql
MAX(CASE WHEN rn = 1 THEN product END) AS top_product
~~~
For the rank-1 row the ~CASE~ yields the product name; for all other rows it yields NULL, and ~MAX~ ignores NULLs.

### Skeleton
~~~sql
WITH sales AS (
  SELECT …            -- step 1: one row per category + product
),
ranked AS (
  SELECT sales.*, ROW_NUMBER() OVER (…) AS rn
  FROM sales          -- step 2
)
SELECT …              -- step 3: one row per category
FROM ranked
GROUP BY category
ORDER BY revenue DESC;
~~~
Build and check one CTE at a time. The starter query gives you step 1's joins.`,
    hints: ["Step 1: ~SELECT c.name AS category, p.name AS product, SUM(oi.quantity) AS units, SUM(oi.quantity * oi.unit_price) AS revenue … GROUP BY c.name, p.name~ with both filters on the orders table.", "Step 2: ~ROW_NUMBER() OVER (PARTITION BY category ORDER BY units DESC, product) AS rn~. Step 3 groups by category with ~ROUND(SUM(revenue), 2)~, ~SUM(units)~ and ~MAX(CASE WHEN rn = 1 THEN product END)~.", "~WITH sales AS (SELECT c.name AS category, p.name AS product, SUM(oi.quantity) AS units, SUM(oi.quantity * oi.unit_price) AS revenue FROM orders o JOIN order_items oi ON oi.order_id = o.order_id JOIN products p ON p.product_id = oi.product_id JOIN categories c ON c.category_id = p.category_id WHERE o.status <> 'cancelled' AND o.order_date >= '2025-01-01' GROUP BY c.name, p.name), ranked AS (SELECT sales.*, ROW_NUMBER() OVER (PARTITION BY category ORDER BY units DESC, product) AS rn FROM sales) SELECT category, ROUND(SUM(revenue), 2) AS revenue, SUM(units) AS units, MAX(CASE WHEN rn = 1 THEN product END) AS top_product FROM ranked GROUP BY category ORDER BY revenue DESC;~"],
    starter: "SELECT c.name AS category, p.name AS product, oi.quantity, oi.unit_price, o.order_date, o.status\nFROM orders o\nJOIN order_items oi ON oi.order_id = o.order_id\nJOIN products p ON p.product_id = oi.product_id\nJOIN categories c ON c.category_id = p.category_id\nLIMIT 10;",
    solution: `WITH sales AS (SELECT c.name AS category, p.name AS product, SUM(oi.quantity) AS units, SUM(oi.quantity * oi.unit_price) AS revenue FROM orders o JOIN order_items oi ON oi.order_id = o.order_id JOIN products p ON p.product_id = oi.product_id JOIN categories c ON c.category_id = p.category_id WHERE ${LIVE} AND o.order_date >= '2025-01-01' GROUP BY c.name, p.name), ranked AS (SELECT sales.*, ROW_NUMBER() OVER (PARTITION BY category ORDER BY units DESC, product) AS rn FROM sales) SELECT category, ROUND(SUM(revenue), 2) AS revenue, SUM(units) AS units, MAX(CASE WHEN rn = 1 THEN product END) AS top_product FROM ranked GROUP BY category ORDER BY revenue DESC;`,
    debrief: `That query would hold up in a professional code review, and you wrote it. Look back at challenge one, where ~SELECT *~ was new.

**What you can do now**
- Explore an unfamiliar database and read its schema.
- Answer business questions with joins, aggregates, subqueries, CTEs and window functions.
- Change data safely: transactions, constraints, the SELECT-first habit.
- Design normalized tables with the right types, keys and constraints.
- Read ~EXPLAIN~, add the right index, and spot a query that defeats one.
- Work like a professional: views, least-privilege accounts, incident clean-up, verified production changes.

**Take it to a real server.** Everything here used a MySQL-compatible sandbox in your browser. The next step is a real one: install MySQL Community Server or run ~docker run -e MYSQL_ROOT_PASSWORD=dev -p 3306:3306 mysql:8~, connect with the ~mysql~ client or MySQL Workbench, and load a sample database such as *Sakila* or *employees*. Your queries will work unchanged. The Reference page lists the handful of places where the sandbox differs.

**What's next in Quarry:** PostgreSQL, SQLite, pandas, NoSQL document stores and vector databases are on the roadmap. Most of what you learned transfers directly, which is the best argument for having learned SQL properly first.`,
  },
];
