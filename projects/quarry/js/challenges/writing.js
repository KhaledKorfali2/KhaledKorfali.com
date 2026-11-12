// Track 5: Changing Data. INSERT, UPDATE, DELETE, transactions, upserts.
// These are checked by inspecting the database afterwards (mode "verify").

const OLD_CANCELLED = "status = 'cancelled' AND order_date < '2024-07-01'";

export default [
  {
    id: "w-insert",
    title: "INSERT: Add Rows",
    level: 2, time: 10, slug: "insert_rows",
    tags: ["INSERT", "NULL", "AUTO_INCREMENT"],
    mode: "verify",
    objective: "A new customer signed up by phone. Add her: Mira Okafor, email mira.okafor@example.com, living in Lisbon, Portugal, signed up on 2025-07-01. She didn't give a phone number.",
    lesson: `Until now you've only read data. The other three everyday statements change it: ~INSERT~ adds rows, ~UPDATE~ edits them, ~DELETE~ removes them. This database is your private copy, and **Reset database** restores it, so this is the place to make mistakes.

### INSERT
~~~sql
INSERT INTO categories (name)
VALUES ('Navigation');
~~~
Name the columns, then give one value per column in the same order. Text and dates are quoted, numbers aren't.

### Columns you leave out
Any column you don't list gets its **default**:
- An ~AUTO_INCREMENT~ primary key gets the next number automatically. You almost never supply ids yourself.
- A column with a declared ~DEFAULT~ gets that value.
- A column that allows NULL gets NULL.
- A ~NOT NULL~ column with no default **must** be supplied, or the insert fails.

~DESCRIBE customers;~ shows which is which.

### Several rows at once
~~~sql
INSERT INTO categories (name)
VALUES ('Navigation'), ('Lighting'), ('Repair');
~~~

### How these challenges are checked
In this track the console checks the **state of the database** after each statement. A checklist above the results shows what's done and what isn't. When every item is ticked, you get the flag. If you get into a mess, press **Reset database** and start clean.`,
    hints: ["List the six columns you have values for; leave out customer_id (automatic) and phone (unknown).", "~INSERT INTO customers (first_name, last_name, email, city, country, signup_date) VALUES (…);~", "~INSERT INTO customers (first_name, last_name, email, city, country, signup_date) VALUES ('Mira', 'Okafor', 'mira.okafor@example.com', 'Lisbon', 'Portugal', '2025-07-01');~"],
    starter: "DESCRIBE customers;",
    checks: [
      { label: "A customer with email mira.okafor@example.com exists", sql: "SELECT COUNT(*) FROM customers WHERE email = 'mira.okafor@example.com'", is: 1 },
      { label: "Her name, city, country and signup date are correct", sql: "SELECT COUNT(*) FROM customers WHERE email = 'mira.okafor@example.com' AND first_name = 'Mira' AND last_name = 'Okafor' AND city = 'Lisbon' AND country = 'Portugal' AND signup_date = '2025-07-01'", is: 1 },
      { label: "Her phone is NULL (unknown), not an empty string", sql: "SELECT COUNT(*) FROM customers WHERE email = 'mira.okafor@example.com' AND phone IS NULL", is: 1 },
      { label: "Exactly one row was added to customers", sql: "SELECT COUNT(*) FROM customers", is: 81 },
    ],
    solution: "INSERT INTO customers (first_name, last_name, email, city, country, signup_date) VALUES ('Mira', 'Okafor', 'mira.okafor@example.com', 'Lisbon', 'Portugal', '2025-07-01');",
    debrief: `Always name the columns in an ~INSERT~. The short form ~INSERT INTO t VALUES (…)~ relies on the table's column order and breaks, or worse puts values in the wrong columns, the day someone adds a column.

**NULL vs empty string.** Leaving ~phone~ out stored NULL: "we don't know". Storing ~''~ would say "we know, and it's blank". Queries like ~WHERE phone IS NULL~ only find the first kind, so mixing the two makes data hard to trust.

Try running your INSERT a second time. MySQL refuses with ~ERROR 1062: Duplicate entry~ because ~email~ is declared ~UNIQUE~. The database itself is protecting the data, and you'll set up rules like that in the Designing Tables track.`,
  },

  {
    id: "w-update",
    title: "UPDATE (and the WHERE You Must Never Forget)",
    level: 3, time: 12, slug: "update_where",
    tags: ["UPDATE", "WHERE", "SELECT first"],
    mode: "verify",
    objective: "Supplier costs went up. Raise the price of every product in the Footwear category (category_id 2) by 10%, rounded to 2 decimals. No other product may change.",
    lesson: `~~~sql
UPDATE products
SET stock = 0
WHERE product_id = 7;
~~~
~UPDATE~ changes existing rows: ~SET~ says what to change, ~WHERE~ says which rows.

- Change several columns with commas: ~SET price = 19.99, stock = 50~
- The new value can use the old one: ~SET stock = stock - 1~

### The most expensive mistake in SQL
~~~sql
UPDATE products
SET price = 0;        -- no WHERE: every product is now free
~~~
An ~UPDATE~ without ~WHERE~ changes **every row in the table**, instantly and without asking. There is no undo button on a production database. Careers have survived this mistake; many weekends haven't.

### The habit that prevents it: SELECT first
Write the ~WHERE~ as a ~SELECT~, check that it returns exactly the rows you mean to change, and only then turn it into an ~UPDATE~:

~~~sql
-- 1. look
SELECT product_id, name, price
FROM products
WHERE category_id = 2;

-- 2. then change, with the identical WHERE
UPDATE products
SET price = ROUND(price * 1.10, 2)
WHERE category_id = 2;
~~~
After the update, MySQL reports ~N rows affected~. If N isn't the number your SELECT showed, stop and find out why.`,
    hints: ["Look first: ~SELECT product_id, name, price FROM products WHERE category_id = 2;~ should show 6 products.", "A 10% rise is ~price * 1.10~; wrap it in ~ROUND(…, 2)~.", "~UPDATE products SET price = ROUND(price * 1.10, 2) WHERE category_id = 2;~ Run it once only. If you ran it twice, press Reset database."],
    starter: "SELECT product_id, name, category_id, price\nFROM products\nWHERE category_id = 2;",
    checks: [
      { label: "Footwear prices are 10% higher (rounded to 2 decimals)", sql: "SELECT ROUND(SUM(price), 2) FROM products WHERE category_id = 2", expect: "SELECT ROUND(SUM(ROUND(price * 1.10, 2)), 2) FROM products WHERE category_id = 2" },
      { label: "Every other product's price is unchanged", sql: "SELECT ROUND(SUM(price), 2) FROM products WHERE category_id <> 2", expect: "SELECT ROUND(SUM(price), 2) FROM products WHERE category_id <> 2" },
    ],
    solution: "UPDATE products SET price = ROUND(price * 1.10, 2) WHERE category_id = 2;",
    debrief: `Did you run it twice by accident? Then prices went up 21% and you had to reset. That's a real property of this statement worth naming: it isn't **idempotent**, meaning running it again changes the result again. ~SET price = 54.99~ is idempotent; ~SET price = price * 1.10~ is not. When a script might be retried, idempotent statements are much safer.

**On the job**, changes like this are run with extra seat belts:
- ~SELECT~ first, always.
- Run inside a **transaction** so you can back out (two challenges from now).
- The ~mysql~ client has a ~--safe-updates~ mode that rejects any ~UPDATE~ or ~DELETE~ without a key in the ~WHERE~. Many teams turn it on for everyone.`,
  },

  {
    id: "w-delete",
    title: "DELETE Safely",
    level: 3, time: 15, slug: "delete_with_fk",
    tags: ["DELETE", "foreign key", "subquery"],
    mode: "verify",
    objective: "Data retention policy: remove every cancelled order placed before 2024-07-01, along with its order items. Nothing else may be deleted.",
    lesson: `~~~sql
DELETE FROM orders
WHERE order_id = 12;
~~~
~DELETE~ removes whole rows. Like ~UPDATE~, **without a ~WHERE~ it empties the table**, so the same rule applies: write it as a ~SELECT~ first.

### Foreign keys push back
Try deleting an order that has items and MySQL stops you:

~~~text
ERROR 1451 (23000): Cannot delete or update a parent row:
a foreign key constraint fails
~~~
~order_items.order_id~ is declared as a foreign key to ~orders~. If the order vanished, its items would point at nothing; these are called orphan rows. The database refuses to create that inconsistency. That's a feature: it turns a silent data-corruption bug into a loud error.

So you delete **children first, then parents**:
~~~sql
DELETE FROM order_items
WHERE order_id IN (SELECT order_id FROM orders WHERE …);

DELETE FROM orders
WHERE …;
~~~
The subquery picks the same orders both times. The order of the two statements matters: once the parent rows are gone, you can no longer look up which children belonged to them.

(Tables can also be created with ~ON DELETE CASCADE~, which removes the children automatically. Convenient, and it means one ~DELETE~ can wipe out far more than it appears to. Know which kind you're dealing with: ~SHOW CREATE TABLE order_items;~ tells you.)`,
    hints: ["Look first: ~SELECT order_id, order_date, status FROM orders WHERE status = 'cancelled' AND order_date < '2024-07-01';~", "Delete from order_items where order_id is IN that list of order ids, then delete the orders themselves with the same WHERE.", "~DELETE FROM order_items WHERE order_id IN (SELECT order_id FROM orders WHERE status = 'cancelled' AND order_date < '2024-07-01');~ then ~DELETE FROM orders WHERE status = 'cancelled' AND order_date < '2024-07-01';~"],
    starter: "SELECT order_id, order_date, status\nFROM orders\nWHERE status = 'cancelled'\n  AND order_date < '2024-07-01';",
    checks: [
      { label: "No cancelled orders from before 2024-07-01 remain", sql: `SELECT COUNT(*) FROM orders WHERE ${OLD_CANCELLED}`, is: 0 },
      { label: "All other orders are still there", sql: "SELECT COUNT(*) FROM orders", expect: `SELECT COUNT(*) FROM orders WHERE NOT (${OLD_CANCELLED})` },
      { label: "Only the items of those orders were removed", sql: "SELECT COUNT(*) FROM order_items", expect: `SELECT COUNT(*) FROM order_items WHERE order_id NOT IN (SELECT order_id FROM orders WHERE ${OLD_CANCELLED})` },
    ],
    solution: `DELETE FROM order_items WHERE order_id IN (SELECT order_id FROM orders WHERE ${OLD_CANCELLED}); DELETE FROM orders WHERE ${OLD_CANCELLED};`,
    debrief: `The foreign key forced you to think about dependent data before destroying anything. Without it, the first ~DELETE~ would have "worked" and left order items pointing at orders that no longer exist, to be discovered months later when a revenue report didn't add up.

**Many teams rarely delete at all.** A common alternative is the *soft delete*: add a ~deleted_at~ timestamp column, set it instead of removing the row, and filter on ~deleted_at IS NULL~ in queries. Data stays recoverable and auditable. The cost is that every query must remember the filter.

~TRUNCATE TABLE t~ also empties a table, faster than ~DELETE~, but in MySQL it can't be rolled back and resets the auto-increment counter. It's for test data, not for production tables.`,
  },

  {
    id: "w-tx",
    title: "Transactions: COMMIT and ROLLBACK",
    level: 3, time: 18, slug: "transactions",
    tags: ["START TRANSACTION", "COMMIT", "ROLLBACK", "ACID"],
    mode: "verify",
    objective: "Two parts. (1) Experience the safety net: start a transaction, delete every row from order_items, confirm the table is empty, then roll it back. (2) Do a real change atomically: in one transaction, move 10 units of stock from product 1 to product 2, and commit.",
    lesson: `By default MySQL runs in **autocommit** mode: each statement is saved permanently the moment it finishes. A **transaction** groups statements so that they succeed or fail *together*.

~~~sql
START TRANSACTION;

UPDATE products SET stock = stock - 10 WHERE product_id = 1;
UPDATE products SET stock = stock + 10 WHERE product_id = 2;

COMMIT;       -- make both changes permanent
~~~
Until ~COMMIT~, the changes are provisional: you can see them, other connections can't. Instead of ~COMMIT~ you can say:

~~~sql
ROLLBACK;     -- throw away everything since START TRANSACTION
~~~

### Why it matters
Moving stock (or money) is two updates. If the server crashed, or the second statement failed, after the first one ran, ten units would simply disappear. Inside a transaction that can't happen: it's all or nothing. This guarantee is the **A** (atomicity) in **ACID**, the four properties that make a database trustworthy:

- **Atomic:** all of a transaction happens, or none of it.
- **Consistent:** constraints hold before and after.
- **Isolated:** concurrent transactions don't see each other's half-finished work.
- **Durable:** once committed, it survives a crash.

### Your undo button
A transaction is also how you make a risky manual change safely:
1. ~START TRANSACTION;~
2. run the ~UPDATE~ or ~DELETE~
3. ~SELECT~ to check the result and the rows-affected count
4. ~COMMIT;~ if it's right, ~ROLLBACK;~ if it isn't

Run the statements one at a time here so you can look around between them.`,
    hints: ["Part 1: ~START TRANSACTION;~ then ~DELETE FROM order_items;~ then ~SELECT COUNT(*) FROM order_items;~ (it says 0) then ~ROLLBACK;~ and count again.", "Part 2: start a new transaction, run one UPDATE subtracting 10 from product 1's stock and another adding 10 to product 2's, then ~COMMIT;~", "~START TRANSACTION; UPDATE products SET stock = stock - 10 WHERE product_id = 1; UPDATE products SET stock = stock + 10 WHERE product_id = 2; COMMIT;~"],
    starter: "SELECT product_id, name, stock\nFROM products\nWHERE product_id IN (1, 2);",
    setup: () => ["UPDATE products SET stock = 40 WHERE product_id = 1", "UPDATE products SET stock = 5 WHERE product_id = 2"],
    checks: [
      { label: "You rolled back a transaction that had changed data", stat: "rollbacks", min: 1 },
      { label: "order_items has all its rows again", sql: "SELECT COUNT(*) FROM order_items", expect: "SELECT COUNT(*) FROM order_items" },
      { label: "Product 1 has 30 in stock and product 2 has 15", sql: "SELECT COUNT(*) FROM products WHERE (product_id = 1 AND stock = 30) OR (product_id = 2 AND stock = 15)", is: 2 },
      { label: "The stock transfer was committed in a transaction", stat: "commits", min: 1 },
      { label: "No transaction is left open", stat: "open", max: 0 },
    ],
    solution: "START TRANSACTION; DELETE FROM order_items; ROLLBACK; START TRANSACTION; UPDATE products SET stock = stock - 10 WHERE product_id = 1; UPDATE products SET stock = stock + 10 WHERE product_id = 2; COMMIT;",
    debrief: `Seeing an empty table come back after ~ROLLBACK~ is the moment transactions stop being theory. Wrap manual changes to important data in one, every time.

Three practical warnings:

- **DDL commits implicitly.** In MySQL, statements that change structure (~CREATE TABLE~, ~ALTER TABLE~, ~DROP TABLE~, ~TRUNCATE~) end the current transaction and commit it. You can't roll back a ~DROP TABLE~.
- **Don't leave transactions open.** An open transaction holds locks on the rows it touched; other sessions that need them wait. "The app is hanging" is often someone's forgotten transaction in a terminal.
- **Only InnoDB tables are transactional.** InnoDB has been MySQL's default storage engine since 5.5, but old systems sometimes still have MyISAM tables, where ~ROLLBACK~ does nothing.

**On the job:** application code uses transactions the same way, usually through a library: begin, do the work, commit, and roll back if anything throws.`,
  },

  {
    id: "w-upsert",
    title: "Bulk Inserts and Upserts",
    level: 4, time: 15, slug: "upsert",
    tags: ["INSERT", "ON DUPLICATE KEY UPDATE", "INSERT … SELECT"],
    mode: "verify",
    objective: "Import a batch into the newsletter table in ONE statement: ops@tidewater.test, new.hire@tidewater.test and events@tidewater.test, each with subscribed = 1 and source = 'import'. One of them is already in the table (unsubscribed); it must end up subscribed with source 'import' instead of causing an error.",
    lesson: `A new table, ~newsletter~, has appeared for this challenge. Its primary key is ~email~, so the same address can't be stored twice.

### The problem
You're loading a batch of rows. Some are new; some already exist and should be updated. A plain ~INSERT~ fails on the first duplicate key and loads nothing:

~~~text
ERROR 1062 (23000): Duplicate entry for key 'newsletter.email'
~~~
Checking each row with a ~SELECT~ and then choosing ~INSERT~ or ~UPDATE~ is slow, and it's also wrong when two programs do it at the same moment.

### The upsert
MySQL can do "insert, or update if it already exists" as one atomic statement:

~~~sql
INSERT INTO newsletter (email, subscribed, source)
VALUES ('a@example.com', 1, 'import'),
       ('b@example.com', 1, 'import')
ON DUPLICATE KEY UPDATE
  subscribed = VALUES(subscribed),
  source     = VALUES(source);
~~~
For each row: if no row has that key, it's inserted. If one does, the ~UPDATE~ part runs instead, and ~VALUES(col)~ means "the value this row was trying to insert".

### Related tools
| Statement | On a duplicate key… |
|---|---|
| ~INSERT IGNORE …~ | silently skips the row |
| ~REPLACE INTO …~ | deletes the old row, inserts the new one |
| ~INSERT … ON DUPLICATE KEY UPDATE~ | updates the columns you list |

### INSERT … SELECT
You can also insert the result of a query, which is how data is copied between tables:
~~~sql
INSERT INTO newsletter (email, subscribed, source)
SELECT email, 1, 'signup' FROM customers WHERE country = 'Japan';
~~~`,
    hints: ["Look at what's there: ~SELECT * FROM newsletter;~ One of the three addresses is already present with subscribed = 0.", "One INSERT with three rows in VALUES, followed by ~ON DUPLICATE KEY UPDATE subscribed = VALUES(subscribed), source = VALUES(source)~.", "~INSERT INTO newsletter (email, subscribed, source) VALUES ('ops@tidewater.test', 1, 'import'), ('new.hire@tidewater.test', 1, 'import'), ('events@tidewater.test', 1, 'import') ON DUPLICATE KEY UPDATE subscribed = VALUES(subscribed), source = VALUES(source);~"],
    starter: "SELECT *\nFROM newsletter;",
    setup: () => [
      "CREATE TABLE newsletter (email VARCHAR(120) PRIMARY KEY, subscribed TINYINT NOT NULL DEFAULT 1, source VARCHAR(20) NOT NULL)",
      "INSERT INTO newsletter (email, subscribed, source) SELECT email, 1, 'signup' FROM customers WHERE customer_id <= 12",
      "INSERT INTO newsletter (email, subscribed, source) VALUES ('ops@tidewater.test', 0, 'signup')",
    ],
    checks: [
      { label: "ops@tidewater.test is now subscribed, with source 'import'", sql: "SELECT COUNT(*) FROM newsletter WHERE email = 'ops@tidewater.test' AND subscribed = 1 AND source = 'import'", is: 1 },
      { label: "The two new addresses were added, subscribed, source 'import'", sql: "SELECT COUNT(*) FROM newsletter WHERE email IN ('new.hire@tidewater.test', 'events@tidewater.test') AND subscribed = 1 AND source = 'import'", is: 2 },
      { label: "The 12 existing subscribers are untouched", sql: "SELECT COUNT(*) FROM newsletter WHERE source = 'signup' AND subscribed = 1", is: 12 },
      { label: "The table has exactly 15 rows", sql: "SELECT COUNT(*) FROM newsletter", is: 15 },
    ],
    solution: "INSERT INTO newsletter (email, subscribed, source) VALUES ('ops@tidewater.test', 1, 'import'), ('new.hire@tidewater.test', 1, 'import'), ('events@tidewater.test', 1, 'import') ON DUPLICATE KEY UPDATE subscribed = VALUES(subscribed), source = VALUES(source);",
    debrief: `Upserts are everywhere in real systems: syncing data from another service, importing files, counters (~ON DUPLICATE KEY UPDATE hits = hits + 1~), "save settings" buttons. They're also naturally **idempotent**: running the same import twice leaves the same result, which is exactly what you want from a job that might be retried.

Details worth knowing:
- The upsert triggers on **any** unique key, not just the primary key. On a table with several unique keys, be sure which one you expect to collide.
- MySQL 8.0.20+ prefers a row alias over ~VALUES()~: ~… VALUES (…) AS new ON DUPLICATE KEY UPDATE subscribed = new.subscribed~. The older form you used still works everywhere.
- Other databases spell it differently (PostgreSQL and SQLite: ~ON CONFLICT … DO UPDATE~; SQL Server: ~MERGE~), but every one of them has it.

You can now read and change data. Next: designing the tables themselves.`,
  },
];
