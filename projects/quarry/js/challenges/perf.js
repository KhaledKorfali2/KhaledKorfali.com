// Track 7: Performance & Indexes. EXPLAIN, single and composite indexes,
// and writing conditions an index can serve. Checked against the query plan.

export default [
  {
    id: "p-explain",
    title: "EXPLAIN and Your First Index",
    level: 3, time: 15, slug: "explain_index",
    tags: ["EXPLAIN", "CREATE INDEX", "full table scan"],
    mode: "verify",
    objective: "The order-lookup page runs SELECT order_id, customer_id FROM orders WHERE order_date = '2025-03-14' and it's getting slower as the table grows. Use EXPLAIN to see why, then add an index so the query no longer scans the whole table.",
    lesson: `Every query so far came back instantly, because the tables are tiny. Production tables have millions of rows, and there the *way* the server finds your rows decides whether a query takes a millisecond or a minute.

### How the server finds rows
Without help, the only way to find orders from one date is to read **every row** and test it. That's a **full table scan**, and its cost grows with the table.

An **index** is a separate, sorted structure (a B-tree) that maps a column's values to the rows containing them, like the index at the back of a book. With an index on ~order_date~ the server jumps straight to the matching entries. On a 10-million-row table that's roughly 25 steps instead of 10 million reads.

### EXPLAIN: ask the server for its plan
Put ~EXPLAIN~ in front of a query and MySQL shows how it *would* run it, without running it:
~~~sql
EXPLAIN SELECT order_id, customer_id
FROM orders
WHERE order_date = '2025-03-14';
~~~
The columns to read first:

| Column | Meaning |
|---|---|
| ~type~ | how the table is accessed (see below) |
| ~key~ | the index actually used; NULL means none |
| ~rows~ | estimated rows the server must examine |
| ~Extra~ | notes such as ~Using where~, ~Using filesort~, ~Using index~ |

Access ~type~, from worst to best:

| type | Meaning |
|---|---|
| ~ALL~ | full table scan: every row is read |
| ~index~ | full scan of an index: every entry is read |
| ~range~ | part of an index, for ~<~, ~>~, ~BETWEEN~ |
| ~ref~ | index lookup that may match several rows |
| ~eq_ref~, ~const~ | lookup by primary or unique key: at most one row |

### Creating an index
~~~sql
CREATE INDEX idx_products_name ON products (name);
~~~
The usual naming convention is ~idx_table_column~. ~SHOW INDEX FROM products;~ lists a table's indexes.`,
    hints: ["Run the EXPLAIN from the lesson. ~type: ALL~ and ~key: NULL~ mean a full scan; ~rows~ is the whole table.", "The WHERE filters on ~order_date~, so that's the column to index.", "~CREATE INDEX idx_orders_order_date ON orders (order_date);~ then run the EXPLAIN again and compare type, key and rows."],
    starter: "EXPLAIN\nSELECT order_id, customer_id\nFROM orders\nWHERE order_date = '2025-03-14';",
    checks: [
      { label: "The date lookup uses an index instead of scanning every order", plan: "SELECT order_id, customer_id FROM orders WHERE order_date = '2025-03-14'", uses: "SEARCH .*USING (COVERING )?INDEX \\S+ \\(order_date=" },
    ],
    solution: "CREATE INDEX idx_orders_order_date ON orders (order_date);",
    debrief: `Compare the two EXPLAIN outputs: ~type~ went from ~ALL~ to ~ref~, ~key~ now names your index, and ~rows~ dropped from the whole table to a handful. Reading those three columns is the core skill of query tuning.

**Indexes aren't free.** Each one:
- takes disk space and memory, and
- must be updated on every ~INSERT~, ~UPDATE~ and ~DELETE~ to the table.

So you index the columns your queries actually filter, join and sort on, not every column. A table with fifteen indexes has slow writes and usually several indexes nothing uses.

**What's already indexed:** the primary key always, every ~UNIQUE~ column, and (in InnoDB) every foreign key column. That's why the joins in earlier tracks were already efficient.

**On the job:** find slow statements with MySQL's *slow query log* or the ~performance_schema~, run ~EXPLAIN~ on the worst, and look for ~type: ALL~ on a big table. Real MySQL also offers ~EXPLAIN ANALYZE~, which runs the query and reports actual timings.`,
  },

  {
    id: "p-composite",
    title: "Composite Indexes and Column Order",
    level: 4, time: 18, slug: "composite_index",
    tags: ["composite index", "leftmost prefix", "EXPLAIN"],
    mode: "verify",
    objective: "The CRM runs SELECT customer_id, email FROM customers WHERE country = 'Canada' AND signup_date >= '2024-01-01' constantly. Create ONE index that lets the server use both conditions: jump to Canada, then read only the matching date range.",
    lesson: `An index can cover several columns. The entries are sorted by the first column, then by the second within each value of the first, and so on, exactly like a phone book sorted by last name and then first name.

~~~sql
CREATE INDEX idx_orders_status_date ON orders (status, order_date);
~~~

### The leftmost-prefix rule
A phone book helps you find "Garcia" and "Garcia, Maria". It's useless for finding everyone called "Maria", because first names are only sorted *within* each last name.

An index on ~(status, order_date)~ behaves the same way:

| Query filters on | Index used? |
|---|---|
| ~status~ | yes |
| ~status~ and ~order_date~ | yes, both columns |
| ~order_date~ only | no: it isn't the leading column |

### Equality first, range last
Within one index, the server can use columns left to right **until it hits a range condition** (~>~, ~<~, ~BETWEEN~, ~LIKE 'abc%'~). Columns after that can't narrow the search any further.

So the rule of thumb for column order is:
1. columns compared with ~=~ first,
2. then the one range column.

For ~WHERE status = 'paid' AND order_date >= '2025-01-01'~ the index ~(status, order_date)~ lets the server jump to "paid" and walk just the recent dates. The index ~(order_date, status)~ makes it walk every recent date of every status and filter afterwards.

Check your work with ~EXPLAIN~: look at ~key~ and ~rows~, and experiment. Creating the index in the wrong order and seeing the difference is the fastest way to make this rule stick. ~DROP INDEX name ON customers;~ removes an attempt.`,
    hints: ["Which condition is an equality and which is a range? Equality column first.", "~country~ is compared with ~=~, ~signup_date~ with ~>=~. The index is on (country, signup_date), in that order.", "~CREATE INDEX idx_customers_country_signup ON customers (country, signup_date);~"],
    starter: "EXPLAIN\nSELECT customer_id, email\nFROM customers\nWHERE country = 'Canada'\n  AND signup_date >= '2024-01-01';",
    checks: [
      { label: "One index serves both the country match and the signup_date range", plan: "SELECT customer_id, email FROM customers WHERE country = 'Canada' AND signup_date >= '2024-01-01'", uses: "USING (COVERING )?INDEX \\S+ \\(country=\\? AND signup_date>\\?\\)" },
    ],
    solution: "CREATE INDEX idx_customers_country_signup ON customers (country, signup_date);",
    debrief: `Two single-column indexes, one on ~country~ and one on ~signup_date~, would not have passed: the server generally picks **one** index per table and filters the rest row by row. A well-ordered composite index beats a pile of single-column ones.

More you get from composite indexes:
- **One index, several queries.** ~(country, signup_date)~ also serves any query filtering on ~country~ alone, so a separate index on ~country~ would be redundant.
- **Sorting for free.** Index entries are already in order, so ~WHERE country = 'Canada' ORDER BY signup_date~ needs no sort step (no ~Using filesort~ in Extra).
- **Covering indexes.** If an index contains every column a query needs, the server answers from the index alone and never touches the table. EXPLAIN shows ~Using index~ in Extra. This is one of the biggest speed-ups available.

Designing indexes is about knowing your queries. Start from the slow ones, not from the table definition.`,
  },

  {
    id: "p-sargable",
    title: "Queries That Defeat Their Index",
    level: 4, time: 15, slug: "sargable_query",
    tags: ["sargable", "range scan", "EXPLAIN"],
    mode: "match",
    mustUse: "SEARCH .*USING (COVERING )?INDEX \\S+ \\(order_date>",
    objective: "orders.order_date is indexed here, yet the starter query (orders from March 2025) still reads every entry. Rewrite it so it returns exactly the same rows (order_id, order_date) but lets the server seek into the index as a range.",
    lesson: `An index only helps if the query is written so the server can use it. This table has an index on ~order_date~, and this query still can't seek into it:

~~~sql
SELECT order_id, order_date
FROM orders
WHERE YEAR(order_date) = 2025 AND MONTH(order_date) = 3;
~~~

### Why
The index is sorted by ~order_date~. It is **not** sorted by ~YEAR(order_date)~ or ~MONTH(order_date)~; those are values the server would have to compute for every single entry before it could compare them. So it does exactly that: computes and tests all of them. Run ~EXPLAIN~ on it and you'll see ~type: index~ (or ~ALL~) with ~rows~ equal to the whole table.

### The rule
**Leave the indexed column alone on one side of the comparison.** Move all the work to the other side, where it's done once:

| Defeats the index | Index-friendly equivalent |
|---|---|
| ~WHERE YEAR(d) = 2025~ | ~WHERE d >= '2025-01-01' AND d < '2026-01-01'~ |
| ~WHERE price * 1.2 > 100~ | ~WHERE price > 100 / 1.2~ |
| ~WHERE LOWER(email) = 'a@b.c'~ | ~WHERE email = 'a@b.c'~ (with a case-insensitive collation) |
| ~WHERE name LIKE '%tent'~ | ~WHERE name LIKE 'tent%'~ (only if that's what you mean) |

Conditions the server can answer by seeking in an index are called **sargable** (from "Search ARGument-able"). You'll hear the word in code reviews.

For this challenge the console checks both that your rows match the target and, through the query plan, that your query does a range seek on the index.`,
    hints: ["Run ~EXPLAIN~ on the starter query: ~rows~ is the full table. Your version should show ~type: range~.", "March 2025 is every date from 2025-03-01 up to, but not including, 2025-04-01.", "~SELECT order_id, order_date FROM orders WHERE order_date >= '2025-03-01' AND order_date < '2025-04-01';~"],
    starter: "SELECT order_id, order_date\nFROM orders\nWHERE YEAR(order_date) = 2025\n  AND MONTH(order_date) = 3;",
    setup: () => ["CREATE INDEX idx_orders_order_date ON orders (order_date)"],
    solution: "SELECT order_id, order_date FROM orders WHERE order_date >= '2025-03-01' AND order_date < '2025-04-01';",
    debrief: `Same rows, a fraction of the work. This is one of the most common real-world performance fixes: nobody adds or changes anything on the server, someone just rewrites a ~WHERE~ clause.

Notice the shape ~>= start AND < next_start~ (a half-open range). It's correct for dates *and* timestamps and never needs to know how many days a month has. Prefer it to ~BETWEEN~ for time ranges.

Other silent index-killers to recognise:
- **Type mismatch:** comparing a ~VARCHAR~ column to a number (~WHERE phone = 5551234~) forces a conversion of every row.
- **Leading wildcard:** ~LIKE '%term'~. Full-text search needs a different kind of index (~FULLTEXT~).
- **~OR~ across different columns** often prevents index use; sometimes a ~UNION~ of two indexed queries is faster.

When a query has an index available and is still slow, ~EXPLAIN~ it and look for one of these.`,
  },
];
