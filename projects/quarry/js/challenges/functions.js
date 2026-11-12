// Track 2: Functions & Aggregates. Expressions, string/date functions, CASE,
// COUNT/SUM/AVG, GROUP BY, HAVING.

export default [
  {
    id: "f-expr",
    title: "Calculated Columns",
    level: 2, time: 10, slug: "expressions",
    tags: ["arithmetic", "AS", "ROUND"],
    mode: "match", ordered: true,
    objective: "Finance wants to know where the money is sitting on the shelves. For products that are still sold (discontinued = 0), return name and stock value (price × stock), for the 3 products with the highest stock value, highest first.",
    lesson: `A column in ~SELECT~ doesn't have to come straight from the table. It can be an **expression** the server calculates for every row:

~~~sql
SELECT name,
       price,
       price * 0.8 AS sale_price
FROM products;
~~~

- Arithmetic: ~+~ ~-~ ~*~ ~/~ and ~%~ (remainder).
- ~ROUND(x, 2)~ rounds to 2 decimal places. Use it when showing money.
- Give calculated columns a name with ~AS~. Without one, the column is labelled with the raw expression.

### Using the alias
You can sort by an alias, because ~ORDER BY~ runs after ~SELECT~:
~~~sql
SELECT name, price * stock AS stock_value
FROM products
ORDER BY stock_value DESC;
~~~
But you **can't** use it in ~WHERE~, because ~WHERE~ runs *before* ~SELECT~ has produced it. There you repeat the expression: ~WHERE price * stock > 1000~.

### Order of evaluation
This is the order the server works in, and it explains many "unknown column" errors:

1. ~FROM~: pick the table
2. ~WHERE~: filter rows
3. ~SELECT~: compute the output columns
4. ~ORDER BY~: sort
5. ~LIMIT~: cut`,
    hints: ["The value of one product's stock is ~price * stock~.", "Alias it, sort by the alias descending, and take 3.", "~SELECT name, price * stock AS stock_value FROM products WHERE discontinued = 0 ORDER BY stock_value DESC LIMIT 3;~"],
    starter: "SELECT name, price, stock\nFROM products\nWHERE discontinued = 0;",
    solution: "SELECT name, price * stock AS stock_value FROM products WHERE discontinued = 0 ORDER BY stock_value DESC LIMIT 3;",
    debrief: `Letting the database do the arithmetic means the calculation happens next to the data, once, in one place, instead of in a spreadsheet someone has to maintain.

**Money and types.** The ~price~ column is ~DECIMAL(8,2)~, an *exact* type. That's deliberate: floating-point types (~FLOAT~, ~DOUBLE~) can't represent 0.10 exactly and accumulate rounding errors, so they should never store money. You'll choose types yourself in the Designing Tables track.

**Integer division.** In MySQL ~7 / 2~ is ~3.5~. In several other databases (PostgreSQL, SQL Server, SQLite) dividing two integers gives ~3~. When a percentage comes out as 0, this is usually why; multiply by ~1.0~ first.`,
  },

  {
    id: "f-strings",
    title: "Text and Date Functions",
    level: 2, time: 12, slug: "string_date_functions",
    tags: ["CONCAT", "UPPER", "YEAR", "DATE_FORMAT"],
    mode: "match",
    objective: "Build a welcome list for customers who signed up in 2025. Return three columns: full name (first and last name separated by one space), the country in UPPERCASE, and the month number of their signup date.",
    lesson: `MySQL has hundreds of built-in **functions**. You call one by name with its inputs in parentheses. These are the ones you'll use weekly.

### Text
| Function | Result |
|---|---|
| ~CONCAT('a', 'b', 'c')~ | ~'abc'~ (joins values) |
| ~UPPER(s)~, ~LOWER(s)~ | change case |
| ~LENGTH(s)~ | number of characters |
| ~SUBSTRING(s, 1, 3)~ | 3 characters starting at position 1 |
| ~LEFT(s, 2)~, ~RIGHT(s, 2)~ | first or last 2 characters |
| ~TRIM(s)~ | remove surrounding spaces |
| ~REPLACE(s, 'a', 'b')~ | swap text |

~~~sql
SELECT CONCAT(first_name, ' ', last_name) AS full_name
FROM customers;
~~~

### Dates
| Function | Result |
|---|---|
| ~YEAR(d)~, ~MONTH(d)~, ~DAY(d)~ | one part of a date, as a number |
| ~DATE_FORMAT(d, '%Y-%m')~ | text such as ~2025-03~ |
| ~DATEDIFF(a, b)~ | days from b to a |
| ~DATE_ADD(d, INTERVAL 7 DAY)~ | a week later |
| ~CURDATE()~, ~NOW()~ | today, and the current date and time |

~~~sql
SELECT order_id, DATEDIFF(shipped_date, order_date) AS days_to_ship
FROM orders
WHERE shipped_date IS NOT NULL;
~~~

Functions work in ~WHERE~ too: ~WHERE YEAR(signup_date) = 2025~.

### NULL in, NULL out
Nearly every function returns NULL when given NULL. ~COALESCE(phone, 'no phone')~ returns the first non-NULL value in its list, which makes it the standard way to supply a fallback.`,
    hints: ["Filter with ~WHERE YEAR(signup_date) = 2025~.", "Three expressions: ~CONCAT(first_name, ' ', last_name)~, ~UPPER(country)~, ~MONTH(signup_date)~.", "~SELECT CONCAT(first_name, ' ', last_name) AS full_name, UPPER(country) AS country, MONTH(signup_date) AS signup_month FROM customers WHERE YEAR(signup_date) = 2025;~"],
    starter: "SELECT first_name, last_name, country, signup_date\nFROM customers\nWHERE signup_date >= '2025-01-01';",
    solution: "SELECT CONCAT(first_name, ' ', last_name) AS full_name, UPPER(country) AS country, MONTH(signup_date) AS signup_month FROM customers WHERE YEAR(signup_date) = 2025;",
    debrief: `Function names are the least portable part of SQL. ~CONCAT~, ~DATE_FORMAT~ and ~DATEDIFF~ are MySQL's spellings; PostgreSQL uses ~||~, ~TO_CHAR~ and date subtraction. The *ideas* transfer completely. Nobody memorises the full list: professionals keep the manual's function reference one search away, and so should you.

One thing to file away: ~WHERE YEAR(signup_date) = 2025~ is easy to read, but wrapping a column in a function stops the server from using an index on it. On a large table the range form is far faster:
~~~sql
WHERE signup_date >= '2025-01-01' AND signup_date < '2026-01-01'
~~~
You'll measure that difference yourself in the Performance track.`,
  },

  {
    id: "f-case",
    title: "CASE: If/Else in SQL",
    level: 2, time: 10, slug: "case_when",
    tags: ["CASE", "IF"],
    mode: "match",
    objective: "Label every product with a price tier. Return name, price and a third column that is 'budget' when price is under 25, 'mid' when it is 25 or more but under 100, and 'premium' otherwise.",
    lesson: `~CASE~ picks a value depending on conditions. It's SQL's if / else-if / else:

~~~sql
SELECT name, stock,
       CASE
         WHEN stock = 0  THEN 'out of stock'
         WHEN stock < 10 THEN 'low'
         ELSE 'ok'
       END AS availability
FROM products;
~~~

- Conditions are checked **top to bottom** and the first true one wins, so order them from most specific to least.
- ~ELSE~ is the fallback. Leave it out and unmatched rows get NULL.
- Don't forget ~END~.

~CASE~ is an expression, so it works anywhere a value does: in ~SELECT~, in ~ORDER BY~ (custom sort orders), in ~WHERE~, and inside aggregate functions.

MySQL also has a two-way shortcut, ~IF(condition, value_if_true, value_if_false)~:
~~~sql
SELECT name, IF(discontinued = 1, 'retired', 'active') AS state
FROM products;
~~~
~IF()~ is MySQL-only. ~CASE~ works in every SQL database, so prefer it when in doubt.`,
    hints: ["Because the first true WHEN wins, you can write ~WHEN price < 25~ and then just ~WHEN price < 100~.", "Shape: ~CASE WHEN … THEN 'budget' WHEN … THEN 'mid' ELSE 'premium' END~.", "~SELECT name, price, CASE WHEN price < 25 THEN 'budget' WHEN price < 100 THEN 'mid' ELSE 'premium' END AS tier FROM products;~"],
    starter: "SELECT name, price\nFROM products;",
    solution: "SELECT name, price, CASE WHEN price < 25 THEN 'budget' WHEN price < 100 THEN 'mid' ELSE 'premium' END AS tier FROM products;",
    debrief: `~CASE~ turns raw values into the categories people actually talk about: tiers, buckets, statuses, "late" vs "on time".

It becomes far more powerful combined with the aggregates in the next challenges. This counts two things in one pass over the table, a pattern called **conditional aggregation**:
~~~sql
SELECT SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
       SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered
FROM orders;
~~~
Dashboards are full of it.`,
  },

  {
    id: "f-count",
    title: "COUNT, SUM, AVG, MIN, MAX",
    level: 2, time: 10, slug: "aggregate_functions",
    tags: ["COUNT", "AVG", "MAX"],
    mode: "match",
    objective: "Summarise the active catalogue in a single row. For products with discontinued = 0 return: how many there are, their average price rounded to 2 decimals, and the highest price.",
    lesson: `So far every query returned one output row per table row. **Aggregate functions** collapse many rows into one value:

| Function | Returns |
|---|---|
| ~COUNT(*)~ | number of rows |
| ~COUNT(col)~ | number of rows where col is **not NULL** |
| ~COUNT(DISTINCT col)~ | number of different values |
| ~SUM(col)~, ~AVG(col)~ | total and mean |
| ~MIN(col)~, ~MAX(col)~ | smallest and largest (works on dates and text too) |

~~~sql
SELECT COUNT(*) AS orders,
       MIN(order_date) AS first_order,
       MAX(order_date) AS latest_order
FROM orders
WHERE status = 'delivered';
~~~
~WHERE~ runs first, so the aggregates only see the rows that survive it.

### The NULL detail that matters
~COUNT(*)~ counts rows. ~COUNT(phone)~ counts rows that *have* a phone. Run this and compare the two numbers:
~~~sql
SELECT COUNT(*), COUNT(phone) FROM customers;
~~~
~AVG~ likewise ignores NULLs rather than treating them as zero, which is usually what you want and occasionally a surprise.`,
    hints: ["One SELECT with three aggregate expressions, and a WHERE for discontinued.", "~COUNT(*)~, ~ROUND(AVG(price), 2)~ and ~MAX(price)~.", "~SELECT COUNT(*) AS products, ROUND(AVG(price), 2) AS avg_price, MAX(price) AS max_price FROM products WHERE discontinued = 0;~"],
    starter: "SELECT COUNT(*), COUNT(phone)\nFROM customers;",
    solution: "SELECT COUNT(*) AS products, ROUND(AVG(price), 2) AS avg_price, MAX(price) AS max_price FROM products WHERE discontinued = 0;",
    debrief: `One row back from thousands in: that's the first step from *reading* data to *analysing* it.

Something you may have bumped into: you can't mix a plain column with an aggregate.
~~~sql
SELECT name, MAX(price) FROM products;   -- which name?
~~~
The server has one ~MAX~ but dozens of names, so the question makes no sense. Modern MySQL rejects it (error 1140, because of the ~ONLY_FULL_GROUP_BY~ setting). Older MySQL versions answered with an arbitrary name, which caused years of subtly wrong reports. To get "the name of the most expensive product" you'd use ~ORDER BY price DESC LIMIT 1~ or a subquery, coming up later.`,
  },

  {
    id: "f-group",
    title: "GROUP BY",
    level: 3, time: 12, slug: "group_by",
    tags: ["GROUP BY", "COUNT"],
    mode: "match",
    objective: "How are orders distributed across statuses? Return one row per order status with two columns: the status and the number of orders in it.",
    lesson: `An aggregate over the whole table gives one number. ~GROUP BY~ gives one number **per group**:

~~~sql
SELECT country, COUNT(*) AS customers
FROM customers
GROUP BY country;
~~~

Picture the server sorting rows into piles, one pile per distinct ~country~, and then running ~COUNT(*)~ on each pile. You get one output row per pile.

### The rule
Every column in ~SELECT~ must be either
- listed in ~GROUP BY~, or
- inside an aggregate function.

Anything else is ambiguous: a pile has many rows, so which row's value would be shown?

### Several grouping columns
~~~sql
SELECT country, city, COUNT(*) AS customers
FROM customers
GROUP BY country, city
ORDER BY country, customers DESC;
~~~
One pile per distinct country-and-city combination.

### Where it sits
~~~sql
SELECT …
FROM …
WHERE …        -- filter rows before grouping
GROUP BY …
ORDER BY …
LIMIT …
~~~`,
    hints: ["The grouping column is ~status~ in the orders table.", "Select the grouping column and ~COUNT(*)~.", "~SELECT status, COUNT(*) AS orders FROM orders GROUP BY status;~"],
    starter: "SELECT country, COUNT(*) AS customers\nFROM customers\nGROUP BY country;",
    solution: "SELECT status, COUNT(*) AS orders FROM orders GROUP BY status;",
    debrief: `~GROUP BY~ is the workhorse of reporting. "Sales per month", "tickets per agent", "signups per country" are all the same query with different columns.

Remember that groups come back in **no particular order** unless you add ~ORDER BY~. Old MySQL versions happened to sort by the grouping column, and plenty of legacy code relies on that by accident; MySQL 8 doesn't do it.

**On the job:** a ~GROUP BY~ with ~COUNT(*)~ is also your best data-quality tool. Grouping by a column you assumed was clean (~status~, ~country~, ~currency~) quickly reveals the typo'd, differently-cased and NULL values hiding in it.`,
  },

  {
    id: "f-having",
    title: "HAVING: Filter the Groups",
    level: 3, time: 10, slug: "having_clause",
    tags: ["HAVING", "GROUP BY"],
    mode: "match", ordered: true,
    objective: "Which countries are our big markets? Return country and customer count for countries with at least 12 customers, largest first.",
    lesson: `~WHERE~ filters **rows** before they're grouped. To filter **groups** by an aggregate, you need ~HAVING~, which runs after ~GROUP BY~:

~~~sql
SELECT customer_id, COUNT(*) AS orders
FROM orders
GROUP BY customer_id
HAVING COUNT(*) >= 5;
~~~

This fails, because when ~WHERE~ runs there are no groups yet and so no counts:
~~~sql
WHERE COUNT(*) >= 5      -- ERROR 1111: Invalid use of group function
~~~

### Both in one query
~~~sql
SELECT customer_id, COUNT(*) AS orders
FROM orders
WHERE status <> 'cancelled'     -- 1. drop cancelled rows
GROUP BY customer_id            -- 2. pile up by customer
HAVING COUNT(*) >= 5            -- 3. keep only the big piles
ORDER BY orders DESC;           -- 4. sort what's left
~~~

### The full order of a SELECT
You now know every main clause. Written order, which is fixed:

~SELECT → FROM → WHERE → GROUP BY → HAVING → ORDER BY → LIMIT~

Order the server runs them in:

~FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT~`,
    hints: ["Group customers by country and count them, as in the previous challenge.", "Add ~HAVING COUNT(*) >= 12~ after the GROUP BY, then sort by the count descending.", "~SELECT country, COUNT(*) AS customers FROM customers GROUP BY country HAVING COUNT(*) >= 12 ORDER BY customers DESC;~"],
    starter: "SELECT country, COUNT(*) AS customers\nFROM customers\nGROUP BY country;",
    solution: "SELECT country, COUNT(*) AS customers FROM customers GROUP BY country HAVING COUNT(*) >= 12 ORDER BY customers DESC;",
    debrief: `The quick test for which clause to use: **does the condition mention an aggregate?** If yes it belongs in ~HAVING~; if no, put it in ~WHERE~.

Putting a non-aggregate condition in ~HAVING~ works but wastes effort: the server groups rows it's about to throw away. Filter early with ~WHERE~ whenever you can.

~HAVING COUNT(*) > 1~ deserves a special mention. Grouping by a column that should be unique and keeping groups with more than one row is the standard way to **find duplicates**. You'll use it to clean up an incident in the last track.`,
  },

  {
    id: "f-report",
    title: "Your First Report",
    level: 3, time: 15, slug: "monthly_report",
    tags: ["DATE_FORMAT", "GROUP BY", "ORDER BY"],
    mode: "match", ordered: true,
    objective: "The ops lead wants monthly order volume for 2025. Return one row per month with the month as text in YYYY-MM form and the number of orders placed in it, counting only orders from 2025-01-01 onward that are not cancelled, in chronological order.",
    lesson: `Time to combine everything from the last two tracks into the kind of query you'd be asked for in a first week on the job.

### Grouping by a calculated value
~GROUP BY~ accepts expressions, not only plain columns. To group dates by month, turn each date into a month label and group on that:

~~~sql
SELECT DATE_FORMAT(signup_date, '%Y-%m') AS month,
       COUNT(*) AS signups
FROM customers
GROUP BY month
ORDER BY month;
~~~

~DATE_FORMAT(d, '%Y-%m')~ produces text like ~2025-03~. Putting the year first means the labels sort chronologically as plain text, which a format like ~03/2025~ would not.

MySQL lets you refer to the alias (~month~) in ~GROUP BY~ and ~ORDER BY~. Some databases require repeating the whole expression.

### Build it in steps
Professionals rarely write a query like this in one go. A reliable routine:

1. ~SELECT~ a few raw rows with the ~WHERE~ you think you need. Do they look right?
2. Add the calculated grouping column and look again.
3. Add ~GROUP BY~ and the aggregate.
4. Add ~ORDER BY~ last.

Run after every step. When something looks wrong you know which step caused it.`,
    hints: ["Two row filters go in WHERE: ~status <> 'cancelled'~ and ~order_date >= '2025-01-01'~.", "Group by ~DATE_FORMAT(order_date, '%Y-%m')~ and count rows per group.", "~SELECT DATE_FORMAT(order_date, '%Y-%m') AS month, COUNT(*) AS orders FROM orders WHERE status <> 'cancelled' AND order_date >= '2025-01-01' GROUP BY month ORDER BY month;~"],
    starter: "SELECT order_id, order_date, status\nFROM orders\nWHERE order_date >= '2025-01-01'\nLIMIT 10;",
    solution: "SELECT DATE_FORMAT(order_date, '%Y-%m') AS month, COUNT(*) AS orders FROM orders WHERE status <> 'cancelled' AND order_date >= '2025-01-01' GROUP BY month ORDER BY month;",
    debrief: `That's a real report: filtered, bucketed by time, aggregated and ordered. Swap ~COUNT(*)~ for a ~SUM~ and it's a revenue chart.

One limitation you may have noticed: a month with **no** orders simply doesn't appear, because there are no rows to form a group. Reports that must show a zero for empty periods need a list of all periods to join against, which is one reason data teams keep a "calendar" table.

So far every query read from a single table. The order *amounts* live in ~order_items~, the customer names in ~customers~, the category names in ~categories~. Combining tables is what makes a relational database relational, and it's the next track.`,
  },
];
