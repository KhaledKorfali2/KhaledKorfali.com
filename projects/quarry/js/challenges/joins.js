// Track 3: Joins. Keys and relationships, INNER/LEFT joins, anti-joins,
// self joins, and aggregating across joined tables.

export default [
  {
    id: "j-inner",
    title: "INNER JOIN",
    level: 3, time: 15, slug: "inner_join",
    tags: ["JOIN", "primary key", "foreign key"],
    mode: "match",
    objective: "Support needs to chase up pending orders. Return order_id, order_date and the customer's last_name for every order whose status is 'pending'.",
    lesson: `The ~orders~ table doesn't store the customer's name. It stores a ~customer_id~, a pointer to a row in ~customers~. Storing each fact in exactly one place is the central idea of a **relational** database: if a customer changes their email you update one row, not every order they ever placed.

### Keys
- A **primary key** uniquely identifies each row of a table: ~customers.customer_id~.
- A **foreign key** is a column that holds another table's primary key: ~orders.customer_id~.

In the schema panel, primary keys are marked ~PRI~ and indexed foreign keys ~MUL~.

### JOIN puts the pieces back together
~~~sql
SELECT orders.order_id, customers.email
FROM orders
JOIN customers ON customers.customer_id = orders.customer_id;
~~~
For each order, the server finds the customer row whose ~customer_id~ matches and glues the two rows together. The ~ON~ clause says how rows match.

### Aliases keep it readable
~~~sql
SELECT o.order_id, o.status, c.email
FROM orders AS o
JOIN customers AS c ON c.customer_id = o.customer_id
WHERE o.status = 'shipped';
~~~
~o~ and ~c~ are short names for the tables (the word ~AS~ is optional). Prefix columns with them. It's **required** when both tables have a column of the same name, as with ~customer_id~ here; otherwise MySQL reports ~Column 'customer_id' is ambiguous~.

~JOIN~ on its own means ~INNER JOIN~: only rows with a match on both sides appear.`,
    hints: ["Start from orders and join customers on the shared ~customer_id~.", "Filter with ~WHERE o.status = 'pending'~ after the join.", "~SELECT o.order_id, o.order_date, c.last_name FROM orders o JOIN customers c ON c.customer_id = o.customer_id WHERE o.status = 'pending';~"],
    starter: "SELECT o.order_id, o.customer_id, o.status\nFROM orders AS o\nWHERE o.status = 'pending';",
    solution: "SELECT o.order_id, o.order_date, c.last_name FROM orders o JOIN customers c ON c.customer_id = o.customer_id WHERE o.status = 'pending';",
    debrief: `Joins are the skill that separates someone who can look things up from someone who can answer real questions, because real questions almost always span tables.

**Always write the ~ON~ condition.** If you forget it, MySQL pairs *every* order with *every* customer: 264 × 80 = 21,120 rows of nonsense, called a cross join or Cartesian product. On production-sized tables that's billions of rows and a very bad afternoon.

**A sanity check worth doing every time:** joining orders to their customer shouldn't change the number of orders. If the row count goes up after a join, the join condition matches more than one row per order and something is wrong (or you've joined to a "many" side, which is the topic two challenges from now).`,
  },

  {
    id: "j-multi",
    title: "Joining Three Tables",
    level: 3, time: 15, slug: "multi_join",
    tags: ["JOIN", "SUM", "GROUP BY"],
    mode: "match",
    objective: "Which categories bring in the money? Return each category name and its total revenue across all order items (sum of quantity × unit_price, rounded to 2 decimals).",
    lesson: `A query can join as many tables as it needs. Each ~JOIN~ adds one table and says how it connects to what's already there.

### Follow the keys
The schema of the shop, as a chain of foreign keys:

~~~text
customers ──< orders ──< order_items >── products >── categories
~~~
~──<~ reads "one … has many …". One order has many order items; each order item points at one product; each product belongs to one category.

~order_items~ is a **junction table**. An order can contain many products and a product can appear in many orders, a many-to-many relationship, and a table in the middle with one row per pairing is how relational databases represent that.

### Chaining joins
~~~sql
SELECT o.order_id, p.name, oi.quantity
FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
JOIN products p     ON p.product_id = oi.product_id
WHERE o.order_id = 1;
~~~
Read it top to bottom: start with orders, attach each order's items, attach each item's product.

### Then aggregate
A joined result is just a (wide) table, so ~GROUP BY~ works on it as usual. An order line is worth ~quantity * unit_price~; ~unit_price~ is the price charged at the time of the order, which is why it's stored on the line instead of read from ~products~.`,
    hints: ["You need three tables: order_items (quantities and prices), products (to reach the category) and categories (for its name).", "Join order_items → products on product_id, then products → categories on category_id, and group by the category name.", "~SELECT c.name AS category, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue FROM order_items oi JOIN products p ON p.product_id = oi.product_id JOIN categories c ON c.category_id = p.category_id GROUP BY c.name;~"],
    starter: "SELECT oi.order_id, p.name, oi.quantity, oi.unit_price\nFROM order_items oi\nJOIN products p ON p.product_id = oi.product_id\nLIMIT 10;",
    solution: "SELECT c.name AS category, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue FROM order_items oi JOIN products p ON p.product_id = oi.product_id JOIN categories c ON c.category_id = p.category_id GROUP BY c.name;",
    debrief: `Finding the path of keys between the table that has your numbers and the table that has your labels is most of the work in a multi-table query. Sketching the tables as boxes with arrows, as in the lesson, is a legitimate professional technique: it's called an **entity-relationship diagram**, and most teams keep one for their database.

Why does ~order_items~ keep its own ~unit_price~ when ~products~ already has ~price~? Because prices change. An order from last year must still add up to what the customer actually paid. Copying a value on purpose because it's a historical fact, not a live reference, is good design, and knowing the difference matters when you design tables yourself.`,
  },

  {
    id: "j-left",
    title: "LEFT JOIN: Find What's Missing",
    level: 3, time: 15, slug: "left_join_anti",
    tags: ["LEFT JOIN", "IS NULL"],
    mode: "match",
    objective: "Marketing wants to email people who signed up but never bought anything. Return customer_id and email for every customer who has no orders at all.",
    lesson: `An inner join only returns rows that match on both sides. A customer with no orders has nothing to match, so they vanish from the result. Sometimes those are exactly the rows you're after.

### LEFT JOIN keeps every row from the left table
~~~sql
SELECT c.customer_id, c.email, o.order_id
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id;
~~~
Every customer appears at least once. Where a customer has orders you get one row per order, as before. Where they have none, you still get one row, with **NULL in every column that would have come from ~orders~**.

"Left" means the table written before the word ~JOIN~. (~RIGHT JOIN~ is the mirror image; almost nobody uses it, because you can swap the tables and write a ~LEFT JOIN~.)

### The anti-join pattern
Those NULLs are a signal you can filter on:
~~~sql
SELECT p.product_id, p.name
FROM products p
LEFT JOIN order_items oi ON oi.product_id = p.product_id
WHERE oi.product_id IS NULL;      -- products never ordered
~~~
"Left join, then keep the rows where the right side is NULL" finds everything in A that has no partner in B.

### A classic mistake
A condition on the right-hand table in ~WHERE~ quietly turns a left join back into an inner join, because NULL fails the test:
~~~sql
LEFT JOIN orders o ON o.customer_id = c.customer_id
WHERE o.status = 'delivered'      -- drops customers with no orders
~~~
To keep them, move the condition into the ~ON~ clause: ~ON o.customer_id = c.customer_id AND o.status = 'delivered'~.`,
    hints: ["Customers go on the left, because you want to keep all of them: ~FROM customers c LEFT JOIN orders o ON …~.", "After the join, customers without orders have NULL in ~o.order_id~.", "~SELECT c.customer_id, c.email FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id WHERE o.order_id IS NULL;~"],
    starter: "SELECT c.customer_id, c.email, o.order_id\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.customer_id\nORDER BY c.customer_id DESC\nLIMIT 20;",
    solution: "SELECT c.customer_id, c.email FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id WHERE o.order_id IS NULL;",
    debrief: `"What's missing?" questions come up constantly: customers without orders, orders without payments, users who never logged in, invoices with no matching shipment. The anti-join answers all of them.

Rule of thumb for choosing a join:
- **INNER JOIN** when a row is only meaningful if it has a match.
- **LEFT JOIN** when rows from the first table must appear whether or not a match exists (totals that should show zero, optional data, and finding gaps).

When you use ~COUNT~ with a left join, count a column from the right-hand table, not ~*~: ~COUNT(o.order_id)~ gives 0 for a customer with no orders, while ~COUNT(*)~ would give 1, because the customer's own row is still there.`,
  },

  {
    id: "j-self",
    title: "Self Joins",
    level: 3, time: 12, slug: "self_join",
    tags: ["self join", "LEFT JOIN", "hierarchy"],
    mode: "match",
    objective: "Print the org chart. Return each employee's first_name and last_name, plus their manager's last_name as a third column. Every employee must appear, including the one with no manager (whose manager column is NULL).",
    lesson: `Look at the ~employees~ table: ~manager_id~ holds the ~employee_id~ of another row *in the same table*. The foreign key points back at its own table. That's how hierarchies (org charts, category trees, comment threads) are usually stored.

To show an employee next to their manager, you join the table **to itself**. Aliases make that possible: you give the same table two names and treat them as two tables.

~~~sql
SELECT e.first_name AS employee,
       m.first_name AS manager
FROM employees e
JOIN employees m ON m.employee_id = e.manager_id;
~~~
Read ~e~ as "the employee" and ~m~ as "that employee's manager". The ~ON~ clause says: the manager row is the one whose id equals the employee's ~manager_id~.

### Mind the top of the tree
The chief executive has ~manager_id = NULL~. NULL never equals anything, so an inner join drops that row. Decide on purpose whether you want it: if you do, that's a ~LEFT JOIN~.`,
    hints: ["Use two aliases of the same table: ~employees e~ for the person and ~employees m~ for the manager.", "Match with ~m.employee_id = e.manager_id~, and use LEFT JOIN so the chief executive isn't dropped.", "~SELECT e.first_name, e.last_name, m.last_name AS manager FROM employees e LEFT JOIN employees m ON m.employee_id = e.manager_id;~"],
    starter: "SELECT employee_id, first_name, last_name, title, manager_id\nFROM employees;",
    solution: "SELECT e.first_name, e.last_name, m.last_name AS manager FROM employees e LEFT JOIN employees m ON m.employee_id = e.manager_id;",
    debrief: `A self join isn't a special feature. It's an ordinary join where both sides happen to be the same table, and the aliases are what let you talk about "this row" and "that other row" separately.

The same trick answers questions that compare rows within one table: pairs of customers in the same city, an order and the same customer's previous order, products priced higher than another product.

One join shows one level of the hierarchy. Walking a whole tree of unknown depth (everyone under the Head of Engineering, at any level) needs a **recursive CTE**, which MySQL 8 supports with ~WITH RECURSIVE~. It's worth knowing the term exists for the day you need it.`,
  },

  {
    id: "j-top",
    title: "Top Customers",
    level: 4, time: 18, slug: "join_aggregate_rank",
    tags: ["JOIN", "GROUP BY", "ORDER BY", "LIMIT"],
    mode: "match", ordered: true,
    objective: "Find our 5 best customers. Return customer_id, email and total spent (sum of quantity × unit_price over all their order items, rounded to 2 decimals), ignoring cancelled orders, highest spender first.",
    lesson: `This one uses most of what you've learned: a three-table join, a row filter, grouping, an aggregate, sorting and a limit. Nothing new, just all of it at once, which is what real work looks like.

### One row per what?
Before writing a grouped query, say out loud what one output row represents. Here: **one row per customer**. That tells you what to ~GROUP BY~.

Then ask what one row of the *joined* data represents. After joining customers → orders → order_items it's **one row per order line**. Summing line values per customer therefore gives each customer's total. Good.

### The fan-out trap
Joining to a "many" side multiplies rows. That's fine when you aggregate at the finest level, as here. It bites when you aggregate something from a coarser level:

~~~sql
SELECT c.customer_id, COUNT(*) AS orders      -- wrong!
FROM customers c
JOIN orders o       ON o.customer_id = c.customer_id
JOIN order_items oi ON oi.order_id = o.order_id
GROUP BY c.customer_id;
~~~
That counts order *lines*, not orders, because each order appears once per line. ~COUNT(DISTINCT o.order_id)~ fixes it. Whenever a total looks too big, suspect fan-out.

### Grouping by more than the key
You want ~email~ in the output, so it must be in ~GROUP BY~ too (or be wrapped in an aggregate). Grouping by ~c.customer_id, c.email~ doesn't change the groups, since email is determined by the id.`,
    hints: ["Join customers → orders → order_items. The cancelled filter is on the orders table and goes in WHERE.", "~GROUP BY c.customer_id, c.email~, then ~ORDER BY~ the summed value descending and ~LIMIT 5~.", "~SELECT c.customer_id, c.email, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS total_spent FROM customers c JOIN orders o ON o.customer_id = c.customer_id JOIN order_items oi ON oi.order_id = o.order_id WHERE o.status <> 'cancelled' GROUP BY c.customer_id, c.email ORDER BY total_spent DESC LIMIT 5;~"],
    starter: "SELECT c.customer_id, c.email, o.order_id, o.status, oi.quantity, oi.unit_price\nFROM customers c\nJOIN orders o ON o.customer_id = c.customer_id\nJOIN order_items oi ON oi.order_id = o.order_id\nLIMIT 10;",
    solution: "SELECT c.customer_id, c.email, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS total_spent FROM customers c JOIN orders o ON o.customer_id = c.customer_id JOIN order_items oi ON oi.order_id = o.order_id WHERE o.status <> 'cancelled' GROUP BY c.customer_id, c.email ORDER BY total_spent DESC LIMIT 5;",
    debrief: `If you got that one, you can already answer the majority of ad-hoc business questions a company throws at its data: "top N things by some total, under some conditions" is the single most requested report there is.

What you practised, in the order a professional thinks about it:
1. **Grain:** one row per customer.
2. **Path:** which tables, joined on which keys.
3. **Filter:** which rows count (not cancelled).
4. **Measure:** what to sum.
5. **Presentation:** sort and limit.

The next track adds the tools for questions a single ~SELECT~ can't express cleanly: subqueries, CTEs and window functions.`,
  },
];
