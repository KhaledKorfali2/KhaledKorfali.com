// Track 6: Designing Tables. CREATE TABLE, types, constraints, foreign keys,
// normalization, ALTER TABLE. Checked by behaviour: the console tries inserts
// that should succeed or fail (inside a savepoint that is rolled back).

const GOLD = "SELECT customer_id FROM orders WHERE status <> 'cancelled' GROUP BY customer_id HAVING COUNT(*) >= 5";

export default [
  {
    id: "d-create",
    title: "CREATE TABLE and Data Types",
    level: 3, time: 15, slug: "create_table",
    tags: ["CREATE TABLE", "data types", "NOT NULL"],
    mode: "verify",
    objective: "The shop is adding product reviews. Create a table named reviews with: review_id (auto-incrementing integer primary key), product_id and customer_id (required integers), rating (required small integer), body (optional long text) and created_at (date and time).",
    lesson: `Someone designed every table you've queried so far. Now it's your turn.

~~~sql
CREATE TABLE suppliers (
  supplier_id INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  country     VARCHAR(40)  NOT NULL,
  rating      TINYINT,
  notes       TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
~~~
Each line is a column: **name**, **type**, then optional rules.

### Choosing types
| Type | Use for |
|---|---|
| ~INT~, ~BIGINT~ | whole numbers; ids, counts. ~BIGINT~ when it could pass 2 billion |
| ~TINYINT~ | small numbers (-128 to 127); also MySQL's boolean, as 0 or 1 |
| ~DECIMAL(10,2)~ | exact numbers: money. 10 digits in total, 2 after the point |
| ~VARCHAR(n)~ | text up to n characters: names, emails, codes |
| ~TEXT~ | long text of unpredictable length: descriptions, comments |
| ~DATE~ | a calendar day |
| ~DATETIME~, ~TIMESTAMP~ | a moment in time |
| ~ENUM('a','b')~ | one of a fixed list of values |

Pick the **smallest type that safely fits**. Types are documentation, validation and performance at once: an ~INT~ column can never contain 'banana', and a narrow table fits more rows in memory.

### Column rules
- ~PRIMARY KEY~: the row's unique identifier. Every table should have one.
- ~AUTO_INCREMENT~: MySQL assigns 1, 2, 3… for you.
- ~NOT NULL~: a value is required.
- ~DEFAULT x~: the value used when an insert doesn't supply one.

Columns without ~NOT NULL~ are optional (nullable).

### How this is checked
The console tests your table's **behaviour**: it tries inserts that should work and inserts that should be rejected, then undoes them. Inspect your work with ~DESCRIBE reviews;~. To start over: ~DROP TABLE reviews;~`,
    hints: ["Model it on the suppliers example: one line per column, commas between, no comma after the last.", "~review_id INT AUTO_INCREMENT PRIMARY KEY~; required columns get ~NOT NULL~; ~body TEXT~ has no NOT NULL because it's optional.", "~CREATE TABLE reviews (review_id INT AUTO_INCREMENT PRIMARY KEY, product_id INT NOT NULL, customer_id INT NOT NULL, rating TINYINT NOT NULL, body TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);~"],
    starter: "SHOW CREATE TABLE products;",
    checks: [
      { label: "A complete review can be inserted", pre: ["INSERT INTO reviews (product_id, customer_id, rating, body, created_at) VALUES (1, 1, 5, 'Great tent', '2025-06-01 10:00:00')"], sql: "SELECT COUNT(*) FROM reviews WHERE rating = 5 AND body = 'Great tent' AND review_id IS NOT NULL", is: 1 },
      { label: "review_id is assigned automatically and is unique", pre: ["INSERT INTO reviews (product_id, customer_id, rating) VALUES (1, 1, 4)", "INSERT INTO reviews (product_id, customer_id, rating) VALUES (2, 1, 3)"], sql: "SELECT COUNT(DISTINCT review_id) FROM reviews WHERE review_id IS NOT NULL", is: 2 },
      { label: "body is optional (may be NULL)", pre: ["INSERT INTO reviews (product_id, customer_id, rating) VALUES (1, 1, 4)"], sql: "SELECT COUNT(*) FROM reviews WHERE body IS NULL", is: 1 },
      { label: "A review without a rating is rejected", pre: ["INSERT INTO reviews (product_id, customer_id, rating) VALUES (1, 1, 4)"], rejects: "INSERT INTO reviews (product_id, customer_id) VALUES (1, 1)" },
      { label: "A review without a product_id is rejected", pre: ["INSERT INTO reviews (product_id, customer_id, rating) VALUES (1, 1, 4)"], rejects: "INSERT INTO reviews (customer_id, rating) VALUES (1, 4)" },
    ],
    solution: "CREATE TABLE reviews (review_id INT AUTO_INCREMENT PRIMARY KEY, product_id INT NOT NULL, customer_id INT NOT NULL, rating TINYINT NOT NULL, body TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);",
    debrief: `A table definition is a contract. Everything you declare is enforced by the server for every program that ever writes to it, which is far more reliable than hoping each application checks its own input.

Decisions experienced designers make almost automatically:
- **Default to ~NOT NULL~.** Allow NULL only when "unknown" is a real, meaningful state. Fewer NULLs means fewer surprises in queries.
- **Never store money in ~FLOAT~ or ~DOUBLE~.** Use ~DECIMAL~.
- **Store dates as dates**, not as text. You get validation, correct sorting and date functions for free.
- **Give every table a primary key**, usually a meaningless auto-increment id (a *surrogate key*), so rows can be referenced even if their real-world attributes change.

Your table still accepts a rating of 97 and a product_id that doesn't exist. The next two challenges close those gaps.`,
  },

  {
    id: "d-constraints",
    title: "Constraints: Let the Database Say No",
    level: 3, time: 15, slug: "constraints",
    tags: ["UNIQUE", "CHECK", "DEFAULT", "PRIMARY KEY"],
    mode: "verify",
    objective: "Create a coupons table that protects itself: code (text up to 20 characters, the primary key), percent_off (required integer that must be between 1 and 90), active (required, defaults to 1) and expires_on (required date).",
    lesson: `Types stop 'banana' going into a number column. **Constraints** stop values that are the right type but still wrong.

| Constraint | Guarantees |
|---|---|
| ~NOT NULL~ | a value is present |
| ~PRIMARY KEY~ | unique and not null; identifies the row |
| ~UNIQUE~ | no two rows share this value (or combination) |
| ~CHECK (condition)~ | the condition is true for every row |
| ~DEFAULT value~ | a sensible value when none is given |
| ~FOREIGN KEY~ | the value exists in another table (next challenge) |

~~~sql
CREATE TABLE gift_cards (
  card_no   VARCHAR(16) PRIMARY KEY,
  balance   DECIMAL(8,2) NOT NULL CHECK (balance >= 0),
  currency  VARCHAR(3) NOT NULL DEFAULT 'USD',
  email     VARCHAR(120) UNIQUE
);
~~~

### Natural keys
The primary key doesn't have to be an auto-increment number. When the data has an identifier that is genuinely unique and never changes, such as a coupon code or an ISO country code, it can be the key itself. That's called a **natural key**.

### Why put rules in the database?
The application could check these things, and it should. But applications have bugs, there may be three of them plus a nightly import script, and people run manual fixes at the console. The database is the one place every write passes through. A constraint there is a rule that **cannot be bypassed by mistake**.

~CHECK~ constraints are enforced from MySQL 8.0.16. Earlier versions accepted the syntax and silently ignored it, a notorious trap on old servers.`,
    hints: ["Four columns. ~code VARCHAR(20) PRIMARY KEY~ already implies unique and not null.", "~percent_off INT NOT NULL CHECK (percent_off BETWEEN 1 AND 90)~ and ~active TINYINT NOT NULL DEFAULT 1~.", "~CREATE TABLE coupons (code VARCHAR(20) PRIMARY KEY, percent_off INT NOT NULL CHECK (percent_off BETWEEN 1 AND 90), active TINYINT NOT NULL DEFAULT 1, expires_on DATE NOT NULL);~"],
    starter: "",
    checks: [
      { label: "A valid coupon is accepted, and active defaults to 1", pre: ["INSERT INTO coupons (code, percent_off, expires_on) VALUES ('SPRING10', 10, '2026-01-01')"], sql: "SELECT active FROM coupons WHERE code = 'SPRING10'", is: 1 },
      { label: "The same code can't be used twice", pre: ["INSERT INTO coupons (code, percent_off, expires_on) VALUES ('SPRING10', 10, '2026-01-01')"], rejects: "INSERT INTO coupons (code, percent_off, expires_on) VALUES ('SPRING10', 25, '2026-06-01')" },
      { label: "percent_off of 0 is rejected", pre: ["INSERT INTO coupons (code, percent_off, expires_on) VALUES ('OK1', 1, '2026-01-01')"], rejects: "INSERT INTO coupons (code, percent_off, expires_on) VALUES ('FREE', 0, '2026-01-01')" },
      { label: "percent_off of 95 is rejected, 90 is accepted", pre: ["INSERT INTO coupons (code, percent_off, expires_on) VALUES ('MAX', 90, '2026-01-01')"], rejects: "INSERT INTO coupons (code, percent_off, expires_on) VALUES ('TOOMUCH', 95, '2026-01-01')" },
      { label: "A coupon without an expiry date is rejected", pre: ["INSERT INTO coupons (code, percent_off, expires_on) VALUES ('OK2', 5, '2026-01-01')"], rejects: "INSERT INTO coupons (code, percent_off) VALUES ('FOREVER', 10)" },
    ],
    solution: "CREATE TABLE coupons (code VARCHAR(20) PRIMARY KEY, percent_off INT NOT NULL CHECK (percent_off BETWEEN 1 AND 90), active TINYINT NOT NULL DEFAULT 1, expires_on DATE NOT NULL);",
    debrief: `Try a bad insert yourself, for example a 150% coupon, and read the error. A rejected write is the database doing its job: bad data that never gets in never has to be found and cleaned up later.

A principle to design by: **make invalid states unrepresentable.** If a discount can't be over 90%, don't rely on everyone remembering that; make it impossible to store.

Constraints also document intent. A new teammate reading ~CHECK (percent_off BETWEEN 1 AND 90)~ learns a business rule without asking anyone.

**The trade-off:** every constraint is checked on every write, and changing one on a huge table takes planning. That cost is nearly always worth paying. The usual regret is the constraint that *wasn't* added, discovered when the bad rows already number in the thousands.`,
  },

  {
    id: "d-fk",
    title: "Foreign Keys and Relationships",
    level: 3, time: 15, slug: "foreign_keys",
    tags: ["FOREIGN KEY", "composite key", "many-to-many"],
    mode: "verify",
    objective: "Customers want wishlists. Create a table named wishlists that links customers to products: customer_id and product_id (both required, each a foreign key to its table), added_on (required date). A customer can wishlist many products, but the same product only once: make the pair (customer_id, product_id) the primary key.",
    lesson: `A customer can wishlist many products, and a product can be on many customers' wishlists. That's a **many-to-many** relationship, and you've met its solution already: a **junction table** with one row per pairing, like ~order_items~.

### Declaring a foreign key
~~~sql
CREATE TABLE product_tags (
  product_id INT NOT NULL,
  tag        VARCHAR(30) NOT NULL,
  PRIMARY KEY (product_id, tag),
  FOREIGN KEY (product_id) REFERENCES products (product_id)
);
~~~
~FOREIGN KEY (col) REFERENCES other_table (other_col)~ tells MySQL that every value in ~col~ must exist in the other table. From then on the server:
- **rejects inserts** that point at a row that doesn't exist, and
- **rejects deleting** a parent row that still has children (you hit this in the DELETE challenge).

This guarantee is called **referential integrity**.

### Composite primary keys
~PRIMARY KEY (product_id, tag)~ makes the *combination* the key. Each product can have many tags and each tag many products, but the same pair can't appear twice. For a junction table that is exactly the rule you want, and it comes for free.

### Relationship types
| Relationship | How it's stored |
|---|---|
| one-to-many (customer → orders) | foreign key column on the "many" side |
| many-to-many (orders ↔ products) | junction table with two foreign keys |
| one-to-one (user → profile) | foreign key that is also unique |

### Syntax note
Write foreign keys as separate ~FOREIGN KEY (…) REFERENCES …~ lines, as above. MySQL parses the shorter inline form (~product_id INT REFERENCES products(product_id)~) and then **silently ignores it**, so no constraint is created.`,
    hints: ["Three columns, then three table-level lines: one PRIMARY KEY over both id columns, and two FOREIGN KEY lines.", "~FOREIGN KEY (customer_id) REFERENCES customers (customer_id)~ and the same shape for products.", "~CREATE TABLE wishlists (customer_id INT NOT NULL, product_id INT NOT NULL, added_on DATE NOT NULL, PRIMARY KEY (customer_id, product_id), FOREIGN KEY (customer_id) REFERENCES customers (customer_id), FOREIGN KEY (product_id) REFERENCES products (product_id));~"],
    starter: "SHOW CREATE TABLE order_items;",
    checks: [
      { label: "A customer can wishlist several products", pre: ["INSERT INTO wishlists (customer_id, product_id, added_on) VALUES (1, 1, '2025-06-01')", "INSERT INTO wishlists (customer_id, product_id, added_on) VALUES (1, 2, '2025-06-01')", "INSERT INTO wishlists (customer_id, product_id, added_on) VALUES (2, 1, '2025-06-02')"], sql: "SELECT COUNT(*) FROM wishlists", is: 3 },
      { label: "The same customer can't wishlist the same product twice", pre: ["INSERT INTO wishlists (customer_id, product_id, added_on) VALUES (1, 1, '2025-06-01')"], rejects: "INSERT INTO wishlists (customer_id, product_id, added_on) VALUES (1, 1, '2025-06-09')" },
      { label: "A product that doesn't exist is rejected", pre: ["INSERT INTO wishlists (customer_id, product_id, added_on) VALUES (1, 1, '2025-06-01')"], rejects: "INSERT INTO wishlists (customer_id, product_id, added_on) VALUES (1, 9999, '2025-06-01')" },
      { label: "A customer that doesn't exist is rejected", pre: ["INSERT INTO wishlists (customer_id, product_id, added_on) VALUES (1, 1, '2025-06-01')"], rejects: "INSERT INTO wishlists (customer_id, product_id, added_on) VALUES (9999, 1, '2025-06-01')" },
      { label: "added_on is required", pre: ["INSERT INTO wishlists (customer_id, product_id, added_on) VALUES (1, 1, '2025-06-01')"], rejects: "INSERT INTO wishlists (customer_id, product_id) VALUES (2, 2)" },
    ],
    solution: "CREATE TABLE wishlists (customer_id INT NOT NULL, product_id INT NOT NULL, added_on DATE NOT NULL, PRIMARY KEY (customer_id, product_id), FOREIGN KEY (customer_id) REFERENCES customers (customer_id), FOREIGN KEY (product_id) REFERENCES products (product_id));",
    debrief: `You've now built both ends of what you used in the Joins track: the keys that joins follow are declared exactly like this.

**What should happen to children when a parent is deleted?** You choose, per foreign key:
- ~ON DELETE RESTRICT~ (the default): refuse to delete the parent.
- ~ON DELETE CASCADE~: delete the children too. Reasonable for wishlist rows when a customer account is removed.
- ~ON DELETE SET NULL~: keep the child, blank the reference.

**Foreign keys and indexes.** MySQL (InnoDB) automatically creates an index on every foreign key column, which is why joins along keys are fast. Run ~SHOW INDEX FROM wishlists;~ to see what your table got.

Some very large systems drop foreign key constraints for operational reasons and enforce integrity in application code. That's a deliberate trade-off made by teams with the tooling to manage it. For everything else, declare your foreign keys.`,
  },

  {
    id: "d-normalize",
    title: "Normalization: Split the Spreadsheet",
    level: 4, time: 25, slug: "normalization",
    tags: ["normalization", "INSERT … SELECT", "FOREIGN KEY"],
    mode: "verify",
    objective: "legacy_signups is a spreadsheet import that repeats each plan's name and price on every row. Normalize it into two tables. (1) plans: plan_id (auto-increment primary key), name (required, unique), price (required decimal), with one row per distinct plan. (2) subscribers: subscriber_id (auto-increment primary key), full_name, email (required, unique), plan_id (required foreign key to plans), with one row per legacy signup pointing at the right plan.",
    lesson: `Run the starter query and look at ~legacy_signups~. Every row repeats the plan's name **and** its price:

| full_name | email | plan_name | plan_price |
|---|---|---|---|
| Ava Kim | ava@… | Plus | 19.99 |
| Ben Diaz | ben@… | Plus | 19.99 |
| Chloe Xu | chloe@… | Pro | 49.99 |

That repetition causes three classic problems, known as **anomalies**:
- **Update anomaly:** changing the Plus price means editing many rows. Miss one and the data contradicts itself.
- **Insert anomaly:** you can't add a new plan until somebody subscribes to it.
- **Delete anomaly:** delete the last Pro subscriber and the database forgets Pro's price.

### Normalization
The cure is the rule you've seen throughout this course: **store each fact once.** A plan's price is a fact about the *plan*, not about a subscriber, so plans get their own table and subscribers refer to them by key.

The formal version comes as "normal forms". In plain terms:
- **1NF:** one value per cell. No comma-separated lists, no ~phone1, phone2, phone3~ columns.
- **2NF / 3NF:** every non-key column describes the **whole key and nothing but the key**. ~plan_price~ depends on ~plan_name~, not on the signup, so it has to move out.

### Doing the migration
~~~sql
-- 1. the lookup table, filled with the distinct values
INSERT INTO plans (name, price)
SELECT DISTINCT plan_name, plan_price FROM legacy_signups;

-- 2. the main table, swapping the repeated text for the new key
INSERT INTO subscribers (full_name, email, plan_id)
SELECT l.full_name, l.email, p.plan_id
FROM legacy_signups l
JOIN plans p ON p.name = l.plan_name;
~~~
Create both tables first, then fill ~plans~, then ~subscribers~ (parents before children). Leave ~legacy_signups~ in place: you never delete the source until the copy is verified.`,
    hints: ["Create ~plans~ first (name gets ~NOT NULL UNIQUE~, price ~DECIMAL(6,2) NOT NULL~), then ~subscribers~ with a ~FOREIGN KEY (plan_id) REFERENCES plans (plan_id)~.", "Fill plans with ~INSERT INTO plans (name, price) SELECT DISTINCT plan_name, plan_price FROM legacy_signups;~", "Fill subscribers with ~INSERT INTO subscribers (full_name, email, plan_id) SELECT l.full_name, l.email, p.plan_id FROM legacy_signups l JOIN plans p ON p.name = l.plan_name;~ and compare ~SELECT COUNT(*)~ on both tables with the legacy table."],
    starter: "SELECT *\nFROM legacy_signups\nLIMIT 10;",
    setup: () => [
      "CREATE TABLE legacy_signups (id INT AUTO_INCREMENT PRIMARY KEY, full_name VARCHAR(80) NOT NULL, email VARCHAR(120) NOT NULL, plan_name VARCHAR(20) NOT NULL, plan_price DECIMAL(6,2) NOT NULL)",
      "INSERT INTO legacy_signups (full_name, email, plan_name, plan_price) SELECT CONCAT(first_name, ' ', last_name), email, CASE customer_id % 3 WHEN 0 THEN 'Basic' WHEN 1 THEN 'Plus' ELSE 'Pro' END, CASE customer_id % 3 WHEN 0 THEN 9.99 WHEN 1 THEN 19.99 ELSE 49.99 END FROM customers WHERE customer_id <= 24",
    ],
    checks: [
      { label: "plans has exactly one row per distinct plan", sql: "SELECT COUNT(*) FROM plans", is: 3 },
      { label: "Plan names are unique", rejects: "INSERT INTO plans (name, price) VALUES ('Basic', 1.00)" },
      { label: "subscribers has one row per legacy signup", sql: "SELECT COUNT(*) FROM subscribers", is: 24 },
      { label: "Every subscriber points at the right plan and price", sql: "SELECT COUNT(*) FROM subscribers s JOIN plans p ON p.plan_id = s.plan_id JOIN legacy_signups l ON l.email = s.email AND l.full_name = s.full_name WHERE l.plan_name = p.name AND l.plan_price = p.price", is: 24 },
      { label: "A subscriber can't reference a plan that doesn't exist", rejects: "INSERT INTO subscribers (full_name, email, plan_id) VALUES ('Test Person', 'test.person@example.com', 9999)" },
      { label: "Subscriber emails are unique", rejects: "INSERT INTO subscribers (full_name, email, plan_id) SELECT 'Copy', email, plan_id FROM subscribers LIMIT 1" },
    ],
    solution: "CREATE TABLE plans (plan_id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(20) NOT NULL UNIQUE, price DECIMAL(6,2) NOT NULL); CREATE TABLE subscribers (subscriber_id INT AUTO_INCREMENT PRIMARY KEY, full_name VARCHAR(80) NOT NULL, email VARCHAR(120) NOT NULL UNIQUE, plan_id INT NOT NULL, FOREIGN KEY (plan_id) REFERENCES plans (plan_id)); INSERT INTO plans (name, price) SELECT DISTINCT plan_name, plan_price FROM legacy_signups; INSERT INTO subscribers (full_name, email, plan_id) SELECT l.full_name, l.email, p.plan_id FROM legacy_signups l JOIN plans p ON p.name = l.plan_name;",
    debrief: `Now changing the Plus price is one ~UPDATE~ of one row, and it's impossible for two subscribers on the same plan to disagree about what it costs. That's what normalization buys: the database *can't* contradict itself.

You also just performed a small **data migration**: new structure, copy with ~INSERT … SELECT~, verify counts, keep the source until you're sure. Real migrations are that same sequence with more zeros.

**When to break the rule.** Normalized data needs joins to read. Reporting systems and very read-heavy features sometimes **denormalize** on purpose, storing a copy of a value to avoid a join, and accept the burden of keeping the copies in sync. (And remember ~order_items.unit_price~: that's not denormalization, it's a historical fact that *should* be stored separately.) Normalize by default; denormalize deliberately, with a reason you can state.`,
  },

  {
    id: "d-alter",
    title: "ALTER TABLE: Changing a Live Schema",
    level: 4, time: 18, slug: "alter_table_backfill",
    tags: ["ALTER TABLE", "DEFAULT", "backfill"],
    mode: "verify",
    objective: "Launch the loyalty programme. Add a column loyalty_tier to customers (text up to 10 characters, required, default 'bronze'). Then backfill: every customer with 5 or more non-cancelled orders becomes 'gold'.",
    lesson: `Requirements change, and tables that already hold data have to change with them. ~ALTER TABLE~ modifies a table in place:

~~~sql
ALTER TABLE products ADD COLUMN weight_grams INT;
ALTER TABLE products DROP COLUMN weight_grams;
ALTER TABLE products RENAME COLUMN stock TO units_in_stock;
ALTER TABLE products MODIFY name VARCHAR(120) NOT NULL;   -- change a type
ALTER TABLE products ADD INDEX idx_products_name (name);
~~~

### Adding a column to a table that has rows
Existing rows need a value for the new column. So a new column must either allow NULL or come with a ~DEFAULT~:

~~~sql
ALTER TABLE orders
ADD COLUMN channel VARCHAR(10) NOT NULL DEFAULT 'web';
~~~
Every existing order now reads ~'web'~, and new inserts that don't mention the column get it too.

### Schema change, then backfill
A typical feature rollout is two steps:
1. **Schema change:** add the column with a safe default.
2. **Backfill:** an ~UPDATE~ that computes the real value for the rows that need it.

The backfill here needs "customers with 5 or more non-cancelled orders", which is a ~GROUP BY … HAVING~ you already know how to write, used as a subquery:
~~~sql
UPDATE customers
SET loyalty_tier = 'gold'
WHERE customer_id IN (SELECT customer_id FROM orders … GROUP BY … HAVING …);
~~~
As always, run the subquery on its own first and see who's in it.

(This sandbox supports ADD COLUMN, DROP COLUMN, RENAME and ADD INDEX. ~MODIFY~ works in real MySQL but not here.)`,
    hints: ["~ALTER TABLE customers ADD COLUMN loyalty_tier VARCHAR(10) NOT NULL DEFAULT 'bronze';~ then check with DESCRIBE.", "Find the gold customers: ~SELECT customer_id FROM orders WHERE status <> 'cancelled' GROUP BY customer_id HAVING COUNT(*) >= 5;~", "~UPDATE customers SET loyalty_tier = 'gold' WHERE customer_id IN (SELECT customer_id FROM orders WHERE status <> 'cancelled' GROUP BY customer_id HAVING COUNT(*) >= 5);~"],
    starter: "SELECT customer_id, COUNT(*) AS orders\nFROM orders\nWHERE status <> 'cancelled'\nGROUP BY customer_id\nORDER BY orders DESC\nLIMIT 10;",
    checks: [
      { label: "customers.loyalty_tier exists and defaults to 'bronze'", pre: ["INSERT INTO customers (first_name, last_name, email, city, country, signup_date) VALUES ('Probe', 'Row', 'probe.row@example.com', 'Porto', 'Portugal', '2025-07-01')"], sql: "SELECT loyalty_tier FROM customers WHERE email = 'probe.row@example.com'", is: "bronze" },
      { label: "loyalty_tier can't be NULL", rejects: "UPDATE customers SET loyalty_tier = NULL WHERE customer_id = 1" },
      { label: "Every customer with 5+ non-cancelled orders is gold", sql: `SELECT COUNT(*) FROM customers WHERE loyalty_tier = 'gold' AND customer_id IN (${GOLD})`, expect: `SELECT COUNT(*) FROM (${GOLD}) AS g` },
      { label: "Nobody else is gold; everyone else is bronze", sql: `SELECT COUNT(*) FROM customers WHERE loyalty_tier = 'bronze' AND customer_id NOT IN (${GOLD})`, expect: `SELECT COUNT(*) FROM customers WHERE customer_id NOT IN (${GOLD})` },
    ],
    solution: `ALTER TABLE customers ADD COLUMN loyalty_tier VARCHAR(10) NOT NULL DEFAULT 'bronze'; UPDATE customers SET loyalty_tier = 'gold' WHERE customer_id IN (${GOLD});`,
    debrief: `Add with a default, then backfill: you'll repeat that two-step for as long as you work with databases.

**On a real production table, think before you ALTER:**
- On big tables an ~ALTER~ can take minutes or hours and, depending on the change and MySQL version, may block writes while it runs. MySQL 8 can do many changes instantly (~ALGORITHM=INSTANT~), including adding a column, but not all. Teams use tools like *gh-ost* or *pt-online-schema-change* for the rest.
- A backfill ~UPDATE~ touching millions of rows in one statement holds locks for a long time. Real backfills run in **batches** of a few thousand rows.
- Schema changes are written as numbered **migration** files, reviewed, and applied by a tool (Flyway, Liquibase, or the one built into your web framework), so every environment gets the same changes in the same order. Nobody types ~ALTER TABLE~ into production by hand.
- Remember that DDL commits implicitly: an ~ALTER~ can't be rolled back with ~ROLLBACK~.`,
  },
];
