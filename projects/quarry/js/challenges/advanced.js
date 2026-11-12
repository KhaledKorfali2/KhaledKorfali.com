// Track 4: Subqueries, CTEs & Window Functions.

const TOTALS = "SELECT o.customer_id, SUM(oi.quantity * oi.unit_price) AS total FROM orders o JOIN order_items oi ON oi.order_id = o.order_id WHERE o.status <> 'cancelled' GROUP BY o.customer_id";

export default [
  {
    id: "s-sub",
    title: "Subqueries",
    level: 3, time: 12, slug: "scalar_subquery",
    tags: ["subquery", "AVG"],
    mode: "match",
    objective: "Return the name and price of every product that costs more than the average product price.",
    lesson: `"Products above the average price" needs two steps: work out the average, then compare each product with it. You could run two queries and paste the number across by hand. A **subquery** does both in one statement: it's a ~SELECT~ inside parentheses, used where a value is expected.

~~~sql
SELECT name, price
FROM products
WHERE price = (SELECT MAX(price) FROM products);
~~~
The inner query runs first and produces a single value; the outer query then uses it. A subquery that returns exactly one row and one column is called a **scalar subquery**, and it can go anywhere a value can: in ~WHERE~, in ~SELECT~, in an expression.

~~~sql
SELECT name,
       price,
       ROUND(price - (SELECT AVG(price) FROM products), 2) AS vs_average
FROM products;
~~~

### Why not just WHERE price > AVG(price)?
Because aggregates don't exist yet when ~WHERE~ runs (the same reason ~HAVING~ exists). The subquery computes the aggregate separately and hands back a plain number.

### Subquery in FROM
A subquery can also stand in for a table. It must be given an alias:
~~~sql
SELECT AVG(order_count)
FROM (SELECT customer_id, COUNT(*) AS order_count
      FROM orders
      GROUP BY customer_id) AS per_customer;
~~~
That's an average of counts, a two-level aggregation a single ~GROUP BY~ can't express.`,
    hints: ["First run ~SELECT AVG(price) FROM products;~ on its own to see the number you're comparing against.", "Put that query in parentheses on the right-hand side of ~price >~.", "~SELECT name, price FROM products WHERE price > (SELECT AVG(price) FROM products);~"],
    starter: "SELECT AVG(price)\nFROM products;",
    solution: "SELECT name, price FROM products WHERE price > (SELECT AVG(price) FROM products);",
    debrief: `Hard-coding the average would have "worked" today and been wrong the moment a price changed. A subquery keeps the query true as the data moves, which is the whole point of putting logic in SQL.

A useful debugging property: **a subquery is a complete query**. Select just the inner part and run it on its own to check it before trusting the whole thing. Building queries inside-out this way is standard practice.`,
  },

  {
    id: "s-exists",
    title: "IN, EXISTS and NOT EXISTS",
    level: 3, time: 15, slug: "exists_subquery",
    tags: ["EXISTS", "IN", "correlated subquery"],
    mode: "match",
    objective: "The buyer wants to clear dead stock. Return product_id and name for every product that has never appeared on any order.",
    lesson: `A subquery can return a whole **list** of values. Use it with ~IN~:

~~~sql
SELECT email
FROM customers
WHERE customer_id IN (SELECT customer_id
                      FROM orders
                      WHERE status = 'cancelled');
~~~
"Customers whose id is in the list of ids that have a cancelled order."

### EXISTS: is there at least one matching row?
~~~sql
SELECT c.email
FROM customers c
WHERE EXISTS (SELECT 1
              FROM orders o
              WHERE o.customer_id = c.customer_id
                AND o.status = 'cancelled');
~~~
This subquery mentions ~c.customer_id~ from the *outer* query. That makes it a **correlated subquery**: conceptually it's evaluated once per outer row, asking "for this customer, does any such order exist?" What it selects doesn't matter (~SELECT 1~ is conventional); only whether a row comes back.

### NOT EXISTS, and the NOT IN trap
~NOT EXISTS~ keeps the outer rows with **no** match, which is the anti-join again, written a different way.

~NOT IN~ looks equivalent but has a trap. If the list contains even one NULL, ~NOT IN~ returns **no rows at all**:
~~~sql
WHERE id NOT IN (1, 2, NULL)   -- never true
~~~
"Is 5 different from an unknown value?" is unknown, so the row is dropped. ~NOT EXISTS~ doesn't have this problem, which is why experienced SQL writers prefer it for "has no match" questions.`,
    hints: ["The products that *have* been ordered are the product_ids present in order_items.", "Use a correlated subquery: ~WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.product_id)~.", "~SELECT p.product_id, p.name FROM products p WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.product_id);~"],
    starter: "SELECT DISTINCT product_id\nFROM order_items\nORDER BY product_id;",
    solution: "SELECT p.product_id, p.name FROM products p WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.product_id);",
    debrief: `You now know three ways to ask "what has no match?":

- ~LEFT JOIN … WHERE right.key IS NULL~
- ~WHERE NOT EXISTS (correlated subquery)~
- ~WHERE key NOT IN (subquery)~, which is only safe when the subquery can never return NULL

They return the same rows here, and MySQL's optimizer usually runs the first two the same way. Pick whichever reads most clearly; many people find ~NOT EXISTS~ closest to the English sentence.

**IN vs JOIN:** use ~IN~/~EXISTS~ when you only need to *test* the other table, and ~JOIN~ when you need *columns* from it. A join to a "many" side can duplicate your rows; ~EXISTS~ never does.`,
  },

  {
    id: "s-cte",
    title: "CTEs: Name Your Steps",
    level: 4, time: 15, slug: "common_table_expression",
    tags: ["WITH", "CTE"],
    mode: "match",
    objective: "Find the above-average spenders. Compute each customer's total spend (quantity × unit_price over non-cancelled orders), then return customer_id and that total (rounded to 2 decimals) for customers whose total is greater than the average of all those customer totals.",
    lesson: `Nested subqueries get hard to read quickly: you have to find the innermost parentheses and work outward. A **common table expression** (CTE) lets you define a named, temporary result first and then use it like a table:

~~~sql
WITH per_customer AS (
  SELECT customer_id, COUNT(*) AS order_count
  FROM orders
  GROUP BY customer_id
)
SELECT AVG(order_count)
FROM per_customer;
~~~
~WITH name AS ( … )~ comes before the main ~SELECT~. The query now reads top to bottom, in the order you'd explain it.

### Several steps, each building on the last
~~~sql
WITH delivered AS (
  SELECT * FROM orders WHERE status = 'delivered'
),
ship_times AS (
  SELECT order_id, DATEDIFF(shipped_date, order_date) AS days
  FROM delivered
)
SELECT ROUND(AVG(days), 1) AS avg_days_to_ship
FROM ship_times;
~~~
Separate CTEs with commas; a later one may use an earlier one.

### Use it more than once
A CTE can be referenced several times in the same query. That's what this challenge needs: the per-customer totals are used once to compute the average and once to compare each customer against it.

CTEs arrived in MySQL 8.0. On the older 5.7 servers that are still around you'd write the same thing with subqueries in ~FROM~.`,
    hints: ["Step 1 as a CTE: one row per customer with their total, joining orders to order_items and excluding cancelled orders.", "Step 2: ~SELECT … FROM totals WHERE total > (SELECT AVG(total) FROM totals)~.", "~WITH totals AS (SELECT o.customer_id, SUM(oi.quantity * oi.unit_price) AS total FROM orders o JOIN order_items oi ON oi.order_id = o.order_id WHERE o.status <> 'cancelled' GROUP BY o.customer_id) SELECT customer_id, ROUND(total, 2) AS total FROM totals WHERE total > (SELECT AVG(total) FROM totals);~"],
    starter: "WITH totals AS (\n  SELECT o.customer_id, SUM(oi.quantity * oi.unit_price) AS total\n  FROM orders o\n  JOIN order_items oi ON oi.order_id = o.order_id\n  GROUP BY o.customer_id\n)\nSELECT *\nFROM totals\nLIMIT 10;",
    solution: `WITH totals AS (${TOTALS}) SELECT customer_id, ROUND(total, 2) AS total FROM totals WHERE total > (SELECT AVG(total) FROM totals);`,
    debrief: `CTEs don't make the database do anything it couldn't do before. They make *you* faster and your queries reviewable: each step has a name, can be tested by selecting from it alone, and reads in order.

A working style many analysts use: write the first CTE, finish the query with ~SELECT * FROM that_cte LIMIT 10~ to check it, then add the next CTE and move the ~SELECT~ down. The starter query in this challenge was set up that way.

**On the job:** a 60-line query made of five well-named CTEs gets approved in code review. The same logic as five levels of nested subqueries gets sent back.`,
  },

  {
    id: "s-rank",
    title: "Window Functions: Ranking",
    level: 4, time: 18, slug: "window_row_number",
    tags: ["ROW_NUMBER", "PARTITION BY", "OVER"],
    mode: "match",
    objective: "Return the 2 most expensive products in each category. Three columns: the category name, the product name and its price.",
    lesson: `~GROUP BY~ collapses each group into one row. Sometimes you want to compute something *across* a group while **keeping every row**: a rank within the group, a running total, the difference from the previous row. That's what **window functions** do.

~~~sql
SELECT name, category_id, price,
       ROW_NUMBER() OVER (PARTITION BY category_id
                          ORDER BY price DESC) AS rn
FROM products;
~~~
The ~OVER (…)~ clause defines the "window" of rows the function looks at:
- ~PARTITION BY category_id~ splits rows into groups, like ~GROUP BY~ but without collapsing them.
- ~ORDER BY price DESC~ orders rows *inside* each group.
- ~ROW_NUMBER()~ then numbers them 1, 2, 3… restarting in each partition.

### Three ranking functions
| Function | Ties | Example for prices 50, 50, 30 |
|---|---|---|
| ~ROW_NUMBER()~ | arbitrary order, no repeats | 1, 2, 3 |
| ~RANK()~ | same rank, then a gap | 1, 1, 3 |
| ~DENSE_RANK()~ | same rank, no gap | 1, 1, 2 |

### Top N per group
You can't filter on a window function in ~WHERE~ (windows are computed after it). Compute the rank in a CTE, then filter in the outer query:
~~~sql
WITH ranked AS (
  SELECT …, ROW_NUMBER() OVER (PARTITION BY … ORDER BY …) AS rn
  FROM …
)
SELECT … FROM ranked WHERE rn <= 3;
~~~
"Top N per group" is a famous interview question, and this is the standard answer.`,
    hints: ["Join products to categories to get the category name, and add ~ROW_NUMBER() OVER (PARTITION BY p.category_id ORDER BY p.price DESC) AS rn~.", "Wrap that in a CTE and select from it ~WHERE rn <= 2~. Return only the three requested columns, not rn.", "~WITH ranked AS (SELECT c.name AS category, p.name AS product, p.price, ROW_NUMBER() OVER (PARTITION BY p.category_id ORDER BY p.price DESC) AS rn FROM products p JOIN categories c ON c.category_id = p.category_id) SELECT category, product, price FROM ranked WHERE rn <= 2;~"],
    starter: "SELECT name, category_id, price,\n       ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY price DESC) AS rn\nFROM products;",
    solution: "WITH ranked AS (SELECT c.name AS category, p.name AS product, p.price, ROW_NUMBER() OVER (PARTITION BY p.category_id ORDER BY p.price DESC) AS rn FROM products p JOIN categories c ON c.category_id = p.category_id) SELECT category, product, price FROM ranked WHERE rn <= 2;",
    debrief: `Before window functions existed, "top N per group" required contorted self-joins. Now it's a pattern you can write from memory: rank inside a CTE, filter outside.

The same pattern solves a very common practical problem, **"latest row per something"**: each customer's most recent order, the newest price for each product, the last status of each ticket.
~~~sql
ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC) AS rn
… WHERE rn = 1
~~~

Window functions need MySQL 8.0 or later (and exist in PostgreSQL, SQL Server, SQLite and every modern analytics database with identical syntax).`,
  },

  {
    id: "s-running",
    title: "Running Totals",
    level: 4, time: 18, slug: "window_running_total",
    tags: ["SUM OVER", "LAG", "CTE"],
    mode: "match", ordered: true,
    objective: "Build the 2025 revenue tracker. One row per month (YYYY-MM) for non-cancelled orders placed from 2025-01-01, with three columns: the month, that month's revenue, and the running total of revenue up to and including that month. Round both amounts to 2 decimals and sort chronologically.",
    lesson: `Aggregates such as ~SUM~, ~AVG~ and ~COUNT~ become window functions when you add ~OVER~. With an ~ORDER BY~ inside the window, they accumulate:

~~~sql
SELECT order_id, order_date,
       COUNT(*) OVER (ORDER BY order_date, order_id) AS orders_so_far
FROM orders;
~~~
For each row, the function covers all rows from the start of the window up to the current one. That gives running counts, running totals and cumulative averages.

Without ~ORDER BY~, the window is the whole partition, which is handy for "share of total":
~~~sql
SELECT name, price,
       ROUND(100 * price / SUM(price) OVER (), 1) AS pct_of_all
FROM products;
~~~

### Looking at neighbouring rows
~LAG(col)~ returns the value from the previous row in the window, ~LEAD(col)~ from the next. They make period-over-period comparisons a one-liner:
~~~sql
revenue - LAG(revenue) OVER (ORDER BY month) AS change_vs_last_month
~~~

### Windows over grouped data
Window functions run **after** ~GROUP BY~, so the tidy way to get a running total of monthly figures is two steps: a CTE that produces one row per month, then a window over those rows.`,
    hints: ["CTE first: one row per month with ~SUM(oi.quantity * oi.unit_price) AS revenue~, joining orders to order_items with the two filters.", "Outer query: ~SUM(revenue) OVER (ORDER BY month)~ is the running total.", "~WITH monthly AS (SELECT DATE_FORMAT(o.order_date, '%Y-%m') AS month, SUM(oi.quantity * oi.unit_price) AS revenue FROM orders o JOIN order_items oi ON oi.order_id = o.order_id WHERE o.status <> 'cancelled' AND o.order_date >= '2025-01-01' GROUP BY month) SELECT month, ROUND(revenue, 2) AS revenue, ROUND(SUM(revenue) OVER (ORDER BY month), 2) AS running_total FROM monthly ORDER BY month;~"],
    starter: "WITH monthly AS (\n  SELECT DATE_FORMAT(o.order_date, '%Y-%m') AS month,\n         SUM(oi.quantity * oi.unit_price) AS revenue\n  FROM orders o\n  JOIN order_items oi ON oi.order_id = o.order_id\n  WHERE o.order_date >= '2025-01-01'\n  GROUP BY month\n)\nSELECT *\nFROM monthly\nORDER BY month;",
    solution: "WITH monthly AS (SELECT DATE_FORMAT(o.order_date, '%Y-%m') AS month, SUM(oi.quantity * oi.unit_price) AS revenue FROM orders o JOIN order_items oi ON oi.order_id = o.order_id WHERE o.status <> 'cancelled' AND o.order_date >= '2025-01-01' GROUP BY month) SELECT month, ROUND(revenue, 2) AS revenue, ROUND(SUM(revenue) OVER (ORDER BY month), 2) AS running_total FROM monthly ORDER BY month;",
    debrief: `Joins, grouping, a CTE and a window function in one query: that's solidly intermediate SQL, and it covers most of what analysts and backend developers write day to day.

The window-function family in one place:
- **Ranking:** ~ROW_NUMBER~, ~RANK~, ~DENSE_RANK~, ~NTILE(4)~ for quartiles
- **Running and moving aggregates:** ~SUM/AVG/COUNT … OVER (ORDER BY …)~
- **Neighbours:** ~LAG~, ~LEAD~, ~FIRST_VALUE~, ~LAST_VALUE~

Everything so far has only *read* data. Next you'll change it, which is where care starts to matter.`,
  },
];
