// Course: PostgreSQL. For people who know SQL from the MySQL course: what
// PostgreSQL does differently and what it adds. Engine: real PostgreSQL 17 (PGlite).

const NEWS = [
  "CREATE TABLE newsletter (email text PRIMARY KEY, subscribed boolean NOT NULL DEFAULT true, source text NOT NULL)",
  "INSERT INTO newsletter (email, subscribed, source) SELECT email, true, 'signup' FROM customers WHERE customer_id <= 12",
  "INSERT INTO newsletter (email, subscribed, source) VALUES ('ops@tidewater.test', false, 'signup')",
];
const PUBLIC_TABLES = "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'";

export default [
  {
    id: "g-psql",
    title: "Meet PostgreSQL",
    level: 2, time: 10, slug: "psql_basics",
    tags: ["psql", "||", "ILIKE", "::"],
    mode: "match",
    objective: "Return two columns for every customer whose email ends in @corp.test, matching regardless of upper or lower case: the full name (first and last name joined by a space, using the || operator) and the email.",
    lesson: `**PostgreSQL** ("Postgres") is the other major open-source database server. It's stricter than MySQL, follows the SQL standard more closely, and has a much richer set of types and features. Everything you learned in the MySQL course works here; this course covers what's different and what's new.

This console is a real PostgreSQL 17 server running in your browser, holding the same shop database.

### psql
PostgreSQL's command-line client is **psql**. Its housekeeping commands start with a backslash and take no semicolon:

| psql | MySQL equivalent |
|---|---|
| ~\\dt~ | ~SHOW TABLES~ |
| ~\\d orders~ | ~DESCRIBE orders~ (also shows indexes and constraints) |
| ~\\di~, ~\\dv~ | list indexes, views |
| ~\\du~ | list roles (users) |

### Differences you'll hit in the first hour
- **Strings are case-sensitive.** ~WHERE email = 'A@B.COM'~ does not match ~'a@b.com'~, and ~LIKE~ is case-sensitive too. Use ~ILIKE~ for a case-insensitive pattern match.
- **Double quotes mean identifiers**, never strings. ~"name"~ is a column called name; ~'name'~ is text. MySQL blurs this; PostgreSQL does not.
- **Concatenate with ~||~**: ~first_name || ' ' || last_name~. (~CONCAT()~ exists too.)
- **Cast with ~::~**: ~'42'::integer~, ~price::text~, ~order_date::timestamp~. It's shorthand for ~CAST(x AS type)~.
- **Booleans are real**: ~true~ and ~false~, shown as ~t~ and ~f~. ~WHERE discontinued~ is a complete condition.
- **No backticks, no ~LIMIT 5, 10~** (write ~LIMIT 10 OFFSET 5~), and **integer division truncates**: ~7 / 2~ is ~3~.`,
    hints: ["Try ~\\dt~ and ~\\d customers~ first.", "~ILIKE '%@corp.test'~ matches any letter case. Join the names with ~||~.", "~SELECT first_name || ' ' || last_name AS full_name, email FROM customers WHERE email ILIKE '%@CORP.TEST';~"],
    starter: "\\d customers",
    solution: "SELECT first_name || ' ' || last_name AS full_name, email FROM customers WHERE email ILIKE '%@CORP.TEST';",
    debrief: `Run ~SELECT * FROM customers WHERE email LIKE '%@CORP.TEST';~ and you get nothing: in PostgreSQL, ~LIKE~ means exactly what it says.

**Why people choose PostgreSQL**
- Correctness first: it rejects invalid data and ambiguous queries that MySQL historically let through.
- Types: arrays, JSON, ranges, UUIDs, network addresses, your own enums and composite types.
- Advanced SQL: window functions, recursive CTEs, ~DISTINCT ON~, ~FILTER~, lateral joins, all mature.
- Extensions: PostGIS for maps, pgvector for AI search (Quarry's vector course uses it), TimescaleDB for time series.

**NULL in concatenation.** ~'a' || NULL~ is NULL, the standard behaviour. If a part may be missing, use ~concat_ws(' ', first_name, last_name)~, which skips NULLs.

The rest of this course is a tour of features worth switching for.`,
  },

  {
    id: "g-returning",
    title: "ON CONFLICT and RETURNING",
    level: 3, time: 12, slug: "pg_upsert_returning",
    tags: ["ON CONFLICT", "EXCLUDED", "RETURNING", "identity"],
    mode: "verify",
    objective: "Import three addresses into newsletter in ONE statement: ops@tidewater.test, new.hire@tidewater.test and events@tidewater.test, each subscribed (true) with source 'import'. One already exists (unsubscribed) and must end up subscribed with source 'import'.",
    lesson: `### Auto-numbered keys
There's no ~AUTO_INCREMENT~ in PostgreSQL. The modern, standard way to say it is an **identity column**:

~~~sql
CREATE TABLE notes (
  note_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  body    text NOT NULL
);
~~~
Older code uses the ~serial~ pseudo-type, which does the same job with a separate sequence object. Run ~\\d orders~ to see how the shop tables declare theirs.

### RETURNING
So how do you learn the id that was just generated? Ask for it:

~~~sql
INSERT INTO categories (name) VALUES ('Lighting')
RETURNING category_id;
~~~
~RETURNING~ works on ~INSERT~, ~UPDATE~ and ~DELETE~ and returns the affected rows, any columns you like. It replaces MySQL's ~LAST_INSERT_ID()~ and saves a round trip.

### Upsert
PostgreSQL's "insert or update" names the conflict explicitly:

~~~sql
INSERT INTO newsletter (email, subscribed, source)
VALUES ('a@example.com', true, 'import')
ON CONFLICT (email) DO UPDATE
SET subscribed = EXCLUDED.subscribed,
    source     = EXCLUDED.source;
~~~
- ~ON CONFLICT (email)~ says which unique constraint you expect to collide.
- ~EXCLUDED~ is the row that was rejected.
- ~DO NOTHING~ skips duplicates.

Note the types: ~subscribed~ is a real ~boolean~ here, so the values are ~true~ and ~false~, not 1 and 0. PostgreSQL will not convert the integer 1 to a boolean for you.`,
    hints: ["~SELECT * FROM newsletter;~ shows ops@tidewater.test with subscribed = f.", "One INSERT with three rows using ~true~, then ~ON CONFLICT (email) DO UPDATE SET subscribed = EXCLUDED.subscribed, source = EXCLUDED.source~.", "~INSERT INTO newsletter (email, subscribed, source) VALUES ('ops@tidewater.test', true, 'import'), ('new.hire@tidewater.test', true, 'import'), ('events@tidewater.test', true, 'import') ON CONFLICT (email) DO UPDATE SET subscribed = EXCLUDED.subscribed, source = EXCLUDED.source RETURNING *;~"],
    starter: "SELECT *\nFROM newsletter\nORDER BY source, email;",
    setup: () => NEWS,
    checks: [
      { label: "ops@tidewater.test is now subscribed, with source 'import'", sql: "SELECT count(*) FROM newsletter WHERE email = 'ops@tidewater.test' AND subscribed AND source = 'import'", is: 1 },
      { label: "The two new addresses were added", sql: "SELECT count(*) FROM newsletter WHERE email IN ('new.hire@tidewater.test', 'events@tidewater.test') AND subscribed AND source = 'import'", is: 2 },
      { label: "The 12 existing subscribers are untouched", sql: "SELECT count(*) FROM newsletter WHERE source = 'signup' AND subscribed", is: 12 },
      { label: "The table has exactly 15 rows", sql: "SELECT count(*) FROM newsletter", is: 15 },
    ],
    solution: "INSERT INTO newsletter (email, subscribed, source) VALUES ('ops@tidewater.test', true, 'import'), ('new.hire@tidewater.test', true, 'import'), ('events@tidewater.test', true, 'import') ON CONFLICT (email) DO UPDATE SET subscribed = EXCLUDED.subscribed, source = EXCLUDED.source;",
    debrief: `With ~RETURNING *~ on the end you'd have seen all three final rows, including the updated one, from the same statement that wrote them.

A pattern you'll use constantly in application code:
~~~sql
UPDATE products SET stock = stock - 1
WHERE product_id = 7 AND stock > 0
RETURNING stock;
~~~
One statement that changes the row, guards against going negative, and tells you the new value. If no row comes back, there was no stock.

**Strictness is a feature.** Trying ~VALUES ('x@y.z', 1, 'import')~ fails with *column "subscribed" is of type boolean but expression is of type integer*. MySQL would have accepted it. PostgreSQL's habit of refusing to guess is why data in it tends to be cleaner.`,
  },

  {
    id: "g-filter",
    title: "FILTER and Date Functions",
    level: 3, time: 12, slug: "filter_date_trunc",
    tags: ["FILTER", "date_trunc", "to_char"],
    mode: "match", ordered: true,
    objective: "For orders placed from 2025-01-01, return one row per month with three columns: the month as YYYY-MM text, the total number of orders, and how many of those were cancelled. Chronological order.",
    lesson: `### Counting two things at once
In MySQL you counted a subset with ~SUM(CASE WHEN … THEN 1 ELSE 0 END)~. PostgreSQL has a clause made for it:

~~~sql
SELECT count(*)                                     AS all_orders,
       count(*) FILTER (WHERE status = 'cancelled') AS cancelled,
       sum(1)   FILTER (WHERE status = 'delivered') AS delivered
FROM orders;
~~~
~FILTER (WHERE …)~ attaches a condition to one aggregate. It reads the way you'd say it and works with every aggregate function.

### Dates
PostgreSQL has real date and time types and its own function names:

| PostgreSQL | MySQL |
|---|---|
| ~date_trunc('month', d)~ | (no direct equivalent) first instant of d's month |
| ~to_char(d, 'YYYY-MM')~ | ~DATE_FORMAT(d, '%Y-%m')~ |
| ~extract(year FROM d)~ | ~YEAR(d)~ |
| ~d2 - d1~ | ~DATEDIFF(d2, d1)~ (dates subtract to a number of days) |
| ~d + interval '7 days'~ | ~DATE_ADD(d, INTERVAL 7 DAY)~ |
| ~now()~, ~current_date~ | ~NOW()~, ~CURDATE()~ |

~date_trunc~ is the workhorse for time-bucketed reports: it rounds a timestamp **down** to the start of its hour, day, week, month, quarter or year, and the result is still a timestamp you can sort and join on.

### GROUP BY 1
You can refer to output columns by position: ~GROUP BY 1 ORDER BY 1~ means "the first column in the SELECT list". It's handy for long expressions. (You can also use the alias, as in MySQL.)`,
    hints: ["Month label: ~to_char(date_trunc('month', order_date), 'YYYY-MM')~, or just ~to_char(order_date, 'YYYY-MM')~.", "Two aggregates: ~count(*)~ and ~count(*) FILTER (WHERE status = 'cancelled')~.", "~SELECT to_char(order_date, 'YYYY-MM') AS month, count(*) AS orders, count(*) FILTER (WHERE status = 'cancelled') AS cancelled FROM orders WHERE order_date >= '2025-01-01' GROUP BY 1 ORDER BY 1;~"],
    starter: "SELECT order_id, order_date, date_trunc('month', order_date) AS month_start, status\nFROM orders\nWHERE order_date >= '2025-01-01'\nLIMIT 5;",
    solution: "SELECT to_char(order_date, 'YYYY-MM') AS month, count(*) AS orders, count(*) FILTER (WHERE status = 'cancelled') AS cancelled FROM orders WHERE order_date >= '2025-01-01' GROUP BY 1 ORDER BY 1;",
    debrief: `One pass over the table, two counts, no ~CASE~.

**~ONLY_FULL_GROUP_BY~ is not optional here.** Selecting a column that is neither grouped nor aggregated is always an error in PostgreSQL (*column must appear in the GROUP BY clause or be used in an aggregate function*). One refinement: if you group by a table's primary key, you may select its other columns, because they're determined by the key.

More aggregates PostgreSQL has that are worth knowing: ~string_agg(name, ', ' ORDER BY name)~ (MySQL's ~GROUP_CONCAT~), ~array_agg()~, ~bool_and()~ / ~bool_or()~, and ~percentile_cont(0.5) WITHIN GROUP (ORDER BY price)~ for a true median.`,
  },

  {
    id: "g-distinct",
    title: "DISTINCT ON",
    level: 3, time: 12, slug: "distinct_on",
    tags: ["DISTINCT ON", "latest per group"],
    mode: "match",
    objective: "Return each customer's most recent order: customer_id, order_id and order_date, one row per customer who has ordered. If a customer has two orders on their latest date, take the one with the higher order_id.",
    lesson: `"The latest row per group" is one of the most common questions in SQL: each customer's last order, each sensor's newest reading, each ticket's current status. In the MySQL course you solved it with ~ROW_NUMBER()~ in a CTE and a filter. That works here too. PostgreSQL also has a shortcut.

### DISTINCT ON
~~~sql
SELECT DISTINCT ON (customer_id)
       customer_id, order_id, order_date
FROM orders
ORDER BY customer_id, order_date DESC;
~~~
Read it as: *sort the rows, then keep the **first** row for each ~customer_id~.*

- The expressions in ~DISTINCT ON (…)~ define the groups.
- ~ORDER BY~ must start with those same expressions; what comes **after** them decides which row is "first" in each group.

So ~ORDER BY customer_id, order_date DESC~ keeps each customer's newest order. Add more sort keys to break ties deterministically.

Unlike ~GROUP BY~, you get whole rows back, any columns you like, with no aggregates and no subquery.

### Compared with the window-function version
~~~sql
WITH ranked AS (
  SELECT *, row_number() OVER (PARTITION BY customer_id ORDER BY order_date DESC) AS rn
  FROM orders
)
SELECT customer_id, order_id, order_date FROM ranked WHERE rn = 1;
~~~
Same result, three times the typing. The window version is still the one to use for "top 3 per group", which ~DISTINCT ON~ can't do.`,
    hints: ["Start from ~SELECT DISTINCT ON (customer_id) customer_id, order_id, order_date FROM orders~.", "The ORDER BY must begin with customer_id; then newest date first, then highest order_id.", "~SELECT DISTINCT ON (customer_id) customer_id, order_id, order_date FROM orders ORDER BY customer_id, order_date DESC, order_id DESC;~"],
    starter: "SELECT customer_id, order_id, order_date\nFROM orders\nORDER BY customer_id, order_date DESC\nLIMIT 12;",
    solution: "SELECT DISTINCT ON (customer_id) customer_id, order_id, order_date FROM orders ORDER BY customer_id, order_date DESC, order_id DESC;",
    debrief: `~DISTINCT ON~ is PostgreSQL-only, so it isn't portable, but it's so convenient that it shows up in a lot of real Postgres code. Recognise it when you read it.

**Make it fast:** an index on ~(customer_id, order_date DESC)~ lets PostgreSQL read each customer's newest order straight off the index without sorting anything.

**Tie-breaks matter.** Without ~order_id DESC~ at the end, a customer with two orders on the same day could return either one, and could return a different one tomorrow. Whenever you take "the first row", make sure the sort leaves no ties.`,
  },

  {
    id: "g-arrays",
    title: "Arrays",
    level: 3, time: 12, slug: "pg_arrays",
    tags: ["text[]", "ANY", "@>", "unnest"],
    mode: "match",
    objective: "The products table now has a tags column of type text[]. Return the name and price of every product that is tagged 'premium' but is not tagged 'out-of-stock'.",
    lesson: `A PostgreSQL column can hold an **array**: a list of values of one type. The ~tags~ column added to ~products~ for this challenge is a ~text[]~.

~~~sql
SELECT name, tags FROM products LIMIT 5;
--  Ridgeline 2P Tent | {tents}
--  Family Dome 6P    | {tents,premium}
~~~
Array literals are written ~ARRAY['a', 'b']~ or as the text ~'{a,b}'~.

### Asking questions of an array
| Expression | True when |
|---|---|
| ~'premium' = ANY (tags)~ | the array contains that value |
| ~tags @> ARRAY['premium', 'tents']~ | the array contains **all** of these |
| ~tags && ARRAY['premium', 'budget']~ | the arrays share **any** element |
| ~array_length(tags, 1)~ | number of elements |
| ~tags[1]~ | first element (arrays count from 1) |

### Rows to array and back
~~~sql
-- many rows → one array
SELECT category_id, array_agg(name ORDER BY name) AS products
FROM products GROUP BY category_id;

-- one array → many rows
SELECT name, unnest(tags) AS tag FROM products;
~~~

### When to use one
Arrays suit short lists that belong to the row and aren't shared: tags, a handful of phone numbers, a week of opening hours. They save a join table.

They don't suit anything you need to constrain or relate. An array element can't be a foreign key, so if tags should come from a controlled list with their own attributes, the classic junction table from the MySQL course is still right.`,
    hints: ["Look at the data: ~SELECT name, price, tags FROM products ORDER BY price DESC LIMIT 8;~", "Contains: ~'premium' = ANY (tags)~. Doesn't contain: ~NOT ('out-of-stock' = ANY (tags))~.", "~SELECT name, price FROM products WHERE 'premium' = ANY (tags) AND NOT ('out-of-stock' = ANY (tags));~"],
    starter: "SELECT name, price, stock, tags\nFROM products\nORDER BY price DESC\nLIMIT 8;",
    setup: () => ["ALTER TABLE products ADD COLUMN tags text[] NOT NULL DEFAULT '{}'",
      "UPDATE products p SET tags = ARRAY[lower(c.name)] || CASE WHEN p.price >= 150 THEN ARRAY['premium'] ELSE '{}'::text[] END || CASE WHEN p.stock = 0 THEN ARRAY['out-of-stock'] ELSE '{}'::text[] END || CASE WHEN p.discontinued THEN ARRAY['clearance'] ELSE '{}'::text[] END FROM categories c WHERE c.category_id = p.category_id"],
    solution: "SELECT name, price FROM products WHERE 'premium' = ANY (tags) AND NOT ('out-of-stock' = ANY (tags));",
    debrief: `Equivalent with the containment operator: ~WHERE tags @> ARRAY['premium'] AND NOT tags @> ARRAY['out-of-stock']~.

**Indexing arrays.** A normal B-tree index can't answer "contains this element". A **GIN** index can:
~~~sql
CREATE INDEX idx_products_tags ON products USING gin (tags);
~~~
It serves ~@>~ and ~&&~ queries (write the condition with ~@>~, not ~= ANY~, to use it).

**A caution about first normal form.** "One value per cell" was a rule in the MySQL course, and arrays bend it deliberately. That's fine when the list is truly an attribute of the row. If you find yourself updating one element across thousands of rows, or wanting to count per tag all day, the data wants to be a table.`,
  },

  {
    id: "g-jsonb",
    title: "JSONB",
    level: 4, time: 15, slug: "pg_jsonb",
    tags: ["jsonb", "->>", "@>", "GIN"],
    mode: "match",
    objective: "The events table stores a JSON payload per event. Counting only events whose payload has device set to 'mobile', return each event type (the payload's type field, as text) and how many such events there are.",
    lesson: `Some data doesn't have a fixed shape: API responses, event payloads, per-customer settings. PostgreSQL's **~jsonb~** type stores a whole JSON document in a column, validated and in a binary form that can be queried and indexed.

~~~sql
SELECT payload FROM events LIMIT 2;
--  {"type": "view", "device": "mobile", "product_id": 14}
~~~

### Getting values out
| Operator | Returns |
|---|---|
| ~payload -> 'type'~ | the value as **jsonb** (~"view"~, with quotes) |
| ~payload ->> 'type'~ | the value as **text** (~view~) |
| ~payload #>> '{a,b}'~ | nested path as text |
| ~(payload ->> 'product_id')::int~ | text cast to a number |

Use ~->>~ when you want to compare, group or display; ~->~ when you're going to keep drilling into nested JSON.

### Asking questions
~~~sql
WHERE payload @> '{"device": "mobile"}'   -- contains this key/value pair
WHERE payload ? 'coupon'                   -- has this key at the top level
~~~
~@>~ is **containment**: does the document on the left include everything in the document on the right? It can match several keys at once and nested structures.

### json vs jsonb
There's also a plain ~json~ type that stores the text as typed. Use ~jsonb~: it's faster to query and can be indexed. The only thing you lose is the original key order and whitespace.`,
    hints: ["Look first: ~SELECT payload, payload ->> 'type' FROM events LIMIT 5;~", "Filter with ~payload @> '{\"device\": \"mobile\"}'~ and group by ~payload ->> 'type'~.", "~SELECT payload ->> 'type' AS type, count(*) AS events FROM events WHERE payload @> '{\"device\": \"mobile\"}' GROUP BY 1;~"],
    starter: "SELECT event_id, payload, payload ->> 'type' AS type\nFROM events\nLIMIT 5;",
    setup: () => ["CREATE TABLE events (event_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, customer_id integer NOT NULL REFERENCES customers, payload jsonb NOT NULL)",
      "INSERT INTO events (customer_id, payload) SELECT (g % 72) + 1, jsonb_build_object('type', (ARRAY['view', 'view', 'view', 'cart', 'purchase'])[(g % 5) + 1], 'device', (ARRAY['mobile', 'desktop', 'mobile', 'tablet'])[(g * 7 % 4) + 1], 'product_id', (g * 13 % 36) + 1) FROM generate_series(1, 300) AS g"],
    solution: "SELECT payload ->> 'type' AS type, count(*) AS events FROM events WHERE payload @> '{\"device\": \"mobile\"}' GROUP BY 1;",
    debrief: `Relational columns for what's always there (~event_id~, ~customer_id~), JSON for what varies. That hybrid is the common, sensible way to use ~jsonb~.

**Index it.** A GIN index makes containment queries fast on millions of rows:
~~~sql
CREATE INDEX idx_events_payload ON events USING gin (payload);
~~~
For one hot field, an ordinary index on the expression is smaller: ~CREATE INDEX … ON events ((payload ->> 'type'))~.

**Don't overdo it.** A table that is one id and one giant ~jsonb~ column gives up types, constraints, foreign keys and clear documentation of what the data is. When a field shows up in most rows and most queries, promote it to a real column.

This is also PostgreSQL's answer to document databases. You'll meet the dedicated kind, and its trade-offs, in the NoSQL course.`,
  },

  {
    id: "g-series",
    title: "generate_series: Filling the Gaps",
    level: 4, time: 15, slug: "generate_series",
    tags: ["generate_series", "LEFT JOIN", "date_trunc"],
    mode: "match", ordered: true,
    objective: "Report cancellations for every month from January to June 2025, including months with none. Return the month as YYYY-MM and the number of cancelled orders placed in it (0 when there were none), in chronological order: exactly six rows.",
    lesson: `The MySQL course ended a report lesson with a warning: a month with no matching rows simply **doesn't appear** in a ~GROUP BY~ result, because there's nothing to group. A chart built on that has holes in it.

The fix is to start from the list of all months and attach the data to it. PostgreSQL can generate that list on the spot.

### generate_series
~~~sql
SELECT * FROM generate_series(1, 5);
SELECT * FROM generate_series('2025-01-01'::date, '2025-06-01', interval '1 month');
~~~
It's a **set-returning function**: it produces rows, and you can use it in ~FROM~ like a table. The second form yields one timestamp per month.

### The pattern
~~~sql
SELECT m AS month_start, count(o.order_id) AS orders
FROM generate_series('2025-01-01'::date, '2025-06-01', interval '1 month') AS m
LEFT JOIN orders o
       ON date_trunc('month', o.order_date) = m
GROUP BY m
ORDER BY m;
~~~
1. The series is on the **left**, so every month survives.
2. Orders are attached by truncating each order date to its month.
3. ~count(o.order_id)~ counts matched orders only. ~count(*)~ would return 1 for an empty month, because the month's own row is still there.

Extra conditions on the orders (such as "only cancelled ones") go in the **~ON~** clause. In ~WHERE~ they'd throw away the empty months again; that's the left-join trap from the Joins track.`,
    hints: ["Use the pattern from the lesson with the series from '2025-01-01' to '2025-06-01'.", "Put ~AND o.status = 'cancelled'~ in the ON clause, and format the month with ~to_char(m, 'YYYY-MM')~.", "~SELECT to_char(m, 'YYYY-MM') AS month, count(o.order_id) AS cancelled FROM generate_series('2025-01-01'::date, '2025-06-01', interval '1 month') AS m LEFT JOIN orders o ON date_trunc('month', o.order_date) = m AND o.status = 'cancelled' GROUP BY m ORDER BY m;~"],
    starter: "SELECT m\nFROM generate_series('2025-01-01'::date, '2025-06-01', interval '1 month') AS m;",
    solution: "SELECT to_char(m, 'YYYY-MM') AS month, count(o.order_id) AS cancelled FROM generate_series('2025-01-01'::date, '2025-06-01', interval '1 month') AS m LEFT JOIN orders o ON date_trunc('month', o.order_date) = m AND o.status = 'cancelled' GROUP BY m ORDER BY m;",
    debrief: `Six rows every time, whatever the data. That's what a dashboard needs.

~generate_series~ earns its keep in other ways:
- **Test data.** ~INSERT INTO t SELECT g, md5(g::text) FROM generate_series(1, 1000000) g~ builds a million-row table in a second. The next challenge's table was made that way.
- **Calendars and slots:** every day in a quarter, every 15 minutes in a working day.
- **Finding gaps:** generate the ids or dates you expect, anti-join to what you have.

MySQL 8 can do the same with a recursive CTE, more verbosely. Most data teams, whichever database they use, also keep a permanent **calendar table** (one row per day, with week, month, quarter and holiday flags) for exactly this purpose.`,
  },

  {
    id: "g-explain",
    title: "EXPLAIN ANALYZE on a Real Table",
    level: 4, time: 15, slug: "explain_analyze",
    tags: ["EXPLAIN ANALYZE", "Seq Scan", "Index Scan"],
    mode: "verify",
    objective: "page_views has 60,000 rows. The query SELECT * FROM page_views WHERE user_id = 4242 reads all of them to find about a dozen. Measure it with EXPLAIN ANALYZE, then add an index so PostgreSQL stops scanning the whole table.",
    lesson: `The shop tables are too small for speed to matter; PostgreSQL's planner correctly decides that scanning 264 orders is cheaper than using an index. So this challenge adds a table with real size, and this time you can **measure**.

### EXPLAIN ANALYZE
~EXPLAIN~ shows the plan. ~EXPLAIN ANALYZE~ **runs the query** and shows the plan with what actually happened:

~~~text
Seq Scan on page_views  (cost=0.00..1134.00 rows=12 width=27)
                        (actual time=0.5..6.1 rows=12 loops=1)
  Filter: (user_id = 4242)
  Rows Removed by Filter: 59988
Execution Time: 6.2 ms
~~~
How to read it:
- **Seq Scan** is a sequential scan: every row read. PostgreSQL's name for a full table scan.
- **~cost=…~** is the planner's estimate in arbitrary units; **~rows=12~** is how many rows it expected.
- **~actual time~** and **~rows~** are the truth. When estimated and actual rows differ wildly, the planner has stale statistics (fix with ~ANALYZE table~).
- **Rows Removed by Filter: 59988** is the giveaway: almost all the work was wasted.

### After adding an index
You'll see one of:
- **Index Scan using idx on …** with an **Index Cond**: jumps to matching entries, then fetches rows.
- **Bitmap Index Scan** feeding a **Bitmap Heap Scan**: collects matching row locations first, then fetches them in physical order. PostgreSQL picks this for a moderate number of matches.
- **Index Only Scan**: answered from the index without touching the table.

Careful: ~EXPLAIN ANALYZE~ really executes the statement. On an ~UPDATE~ or ~DELETE~, wrap it in a transaction and roll back.`,
    hints: ["Run the starter and note the plan type and the execution time.", "Index the column in the WHERE clause.", "~CREATE INDEX idx_page_views_user ON page_views (user_id);~ then run the EXPLAIN ANALYZE again and compare."],
    starter: "EXPLAIN ANALYZE\nSELECT * FROM page_views WHERE user_id = 4242;",
    setup: () => ["CREATE TABLE page_views AS SELECT g AS view_id, (g * 7919) % 5000 AS user_id, '/p/' || (g % 40) AS page, timestamp '2025-01-01' + g * interval '1 minute' AS viewed_at FROM generate_series(1, 60000) AS g",
      "ANALYZE page_views"],
    checks: [
      { label: "The lookup by user_id uses an index instead of a sequential scan", plan: "SELECT * FROM page_views WHERE user_id = 4242", uses: "Index", avoids: "Seq Scan" },
    ],
    solution: "CREATE INDEX idx_page_views_user ON page_views (user_id);",
    debrief: `"Rows Removed by Filter: 59988" disappeared: the server now touches about a dozen rows instead of sixty thousand. On a real server the execution time drops by roughly two orders of magnitude, and on a table a thousand times bigger the scan would take a thousand times longer while the index lookup barely changed.

(Browsers deliberately blur their clocks, so the times this in-browser server reports can be coarse or even 0.000 ms. Trust the plan shape and the row counts here; trust the timings on a real server.)

**PostgreSQL does not index foreign keys automatically.** MySQL does. Here, ~orders.customer_id~ has no index unless you create one, and joins or deletes involving it scan. Indexing foreign key columns is on you.

**Index types beyond B-tree**
| Type | For |
|---|---|
| B-tree (default) | equality, ranges, sorting |
| GIN | arrays, ~jsonb~, full-text search |
| GiST | geometry, ranges, nearest-neighbour |
| BRIN | huge tables in natural order (logs by time); tiny |
| HNSW, IVFFlat (pgvector) | vector similarity; see the vector course |

Also unique to PostgreSQL: ~CREATE INDEX CONCURRENTLY~ builds an index **without blocking writes**, which is how indexes are added to live production tables.`,
  },

  {
    id: "g-roles",
    title: "Roles and Privileges, Enforced",
    level: 4, time: 18, slug: "pg_roles",
    tags: ["CREATE ROLE", "GRANT", "SET ROLE", "least privilege"],
    mode: "verify",
    objective: "Create two roles. reporting: can SELECT from every table in the public schema and nothing else. checkout: can SELECT, INSERT and UPDATE on orders, can SELECT on products, and has no other table privileges.",
    lesson: `In the MySQL course the sandbox recorded your ~GRANT~ statements but couldn't enforce them. This is a real server: **privileges are enforced**, and you can prove it.

### Roles
PostgreSQL has one concept for users and groups: the **role**. A role that can log in is a user; a role that other roles are members of acts as a group.

~~~sql
CREATE ROLE analyst LOGIN PASSWORD 'a-long-random-password';
GRANT SELECT ON orders, customers TO analyst;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analyst;   -- every existing table
REVOKE SELECT ON customers FROM analyst;
~~~
There's no host part as in MySQL's ~'user'@'host'~. Where a role may connect from is controlled separately, in the server's ~pg_hba.conf~ file.

### Try it as that role
A superuser can temporarily become another role:

~~~sql
SET ROLE analyst;
SELECT count(*) FROM orders;      -- works
DELETE FROM orders;                -- ERROR: permission denied for table orders
RESET ROLE;
~~~
Do this after each grant. It's the honest test of whether you gave exactly what you meant to.

### Inspecting
~\\du~ lists roles. To ask about a specific privilege:
~~~sql
SELECT has_table_privilege('analyst', 'orders', 'INSERT');
~~~

### A default to know about
~GRANT … ON ALL TABLES~ covers tables that exist **now**. Tables created later aren't included unless you also set ~ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO analyst~. Forgetting this is the classic "the dashboard can't see the new table" incident.`,
    hints: ["~CREATE ROLE reporting LOGIN PASSWORD '…';~ then ~GRANT SELECT ON ALL TABLES IN SCHEMA public TO reporting;~", "~CREATE ROLE checkout LOGIN PASSWORD '…'; GRANT SELECT, INSERT, UPDATE ON orders TO checkout; GRANT SELECT ON products TO checkout;~", "Test with ~SET ROLE checkout; DELETE FROM orders;~ (it should be denied), then ~RESET ROLE;~. If you granted too much, REVOKE it."],
    starter: "\\du",
    checks: [
      { label: "Role reporting exists", sql: "SELECT count(*) FROM pg_roles WHERE rolname = 'reporting'", is: 1 },
      { label: "reporting can SELECT from every table", sql: `${PUBLIC_TABLES} AND has_table_privilege('reporting', format('%I.%I', schemaname, tablename), 'SELECT')`, expect: PUBLIC_TABLES },
      { label: "reporting cannot INSERT, UPDATE or DELETE anywhere", sql: `SELECT (${PUBLIC_TABLES} AND has_table_privilege('reporting', format('%I.%I', schemaname, tablename), 'INSERT, UPDATE, DELETE, TRUNCATE')) + (SELECT count(*) FROM pg_roles WHERE rolname = 'reporting' AND rolsuper)`, is: 0 },
      { label: "Role checkout exists", sql: "SELECT count(*) FROM pg_roles WHERE rolname = 'checkout'", is: 1 },
      { label: "checkout can SELECT, INSERT and UPDATE orders", sql: "SELECT has_table_privilege('checkout', 'orders', 'SELECT') AND has_table_privilege('checkout', 'orders', 'INSERT') AND has_table_privilege('checkout', 'orders', 'UPDATE')", is: true },
      { label: "checkout can read products", sql: "SELECT has_table_privilege('checkout', 'products', 'SELECT')", is: true },
      { label: "checkout cannot DELETE orders, write products, or read any other table", sql: "SELECT has_table_privilege('checkout', 'orders', 'DELETE') OR has_table_privilege('checkout', 'products', 'INSERT, UPDATE, DELETE') OR has_table_privilege('checkout', 'customers', 'SELECT') OR has_table_privilege('checkout', 'employees', 'SELECT') OR has_table_privilege('checkout', 'order_items', 'SELECT') OR has_table_privilege('checkout', 'categories', 'SELECT')", is: false },
    ],
    solution: "CREATE ROLE reporting LOGIN PASSWORD 'x7#Lq-long-random'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO reporting; CREATE ROLE checkout LOGIN PASSWORD 'p2$Vn-long-random'; GRANT SELECT, INSERT, UPDATE ON orders TO checkout; GRANT SELECT ON products TO checkout;",
    debrief: `If you ran ~SET ROLE checkout~ and tried to read ~employees~, the server said *permission denied*. Salaries are safe from a compromised checkout service because the database, not the application, refuses.

**How teams structure this**
- **Group roles** hold privileges: ~CREATE ROLE read_only NOLOGIN; GRANT SELECT … TO read_only;~
- **Login roles** get membership: ~GRANT read_only TO ana;~ Changing what analysts can do is then one statement.
- Privileges exist at several levels: database (~CONNECT~), schema (~USAGE~), table, even **column** (~GRANT SELECT (name, price) ON products~).
- **Row-level security** goes further: policies that decide which *rows* a role may see, which is how multi-tenant apps keep customers apart inside one table.

That's the PostgreSQL tour: psql, stricter typing, identity and ~RETURNING~, ~ON CONFLICT~, ~FILTER~ and date functions, ~DISTINCT ON~, arrays, ~jsonb~, ~generate_series~, ~EXPLAIN ANALYZE~, and enforced roles. Your SQL from the MySQL course carries over; these are the reasons people stay.`,
  },
];
