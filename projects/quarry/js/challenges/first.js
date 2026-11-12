// Track 1: First Queries. Zero assumed knowledge: what a database is, then
// SELECT, WHERE, ORDER BY, LIMIT, LIKE, NULL, DISTINCT.
// Authoring note: inline code is ~like this~ and fences are ~~~ (see ui.js),
// because lessons live inside JS template literals.

export default [
  {
    id: "q-hello",
    title: "Hello, Database",
    level: 1, time: 8, slug: "first_select",
    tags: ["SHOW TABLES", "SELECT *"],
    mode: "find",
    objective: "Someone left you a welcome note inside the database. List the tables, find the one that isn't part of the shop, read it, and submit the flag it contains.",
    lesson: `A **database** is an organised collection of data that a program called a **database server** looks after. You don't open its files yourself. You send the server a request written in **SQL** (Structured Query Language) and it sends back an answer. MySQL is one of the most widely used servers in the world, and it is the one you'll learn first.

### Tables, rows, columns
A database is made of **tables**. A table looks like a spreadsheet tab with strict rules: every **column** has a name and a type, and every **row** is one record.

| customer_id | first_name | city |
|---|---|---|
| 1 | Ava | Seattle |
| 2 | Ben | Munich |

### Your workspace
On the right is a live MySQL-style console connected to a database called ~shop~. It belongs to Tidewater Outfitters, a small outdoor-gear store, and you'll use it for the whole course. It's your own private copy: you can't break anything, and **Reset database** puts it back.

Type SQL in the editor and press **Run** (or Ctrl+Enter). Every statement ends with a semicolon.

### Two statements to start
~~~sql
SHOW TABLES;              -- what tables exist?
SELECT * FROM customers;  -- show every column of every row
~~~

~SELECT~ is how you read data. ~*~ means "all columns", and ~FROM~ names the table. SQL keywords aren't case-sensitive, but writing them in capitals is a common convention that makes queries easier to read.

### How flags work
Each challenge ends with a **flag** that looks like ~QUARRY{something_1a2b3c}~. Sometimes it's hidden in the data and you have to dig it out. More often the console awards it when your query produces exactly the right result, or when the database ends up in the right state. Paste it into the box below to complete the challenge.`,
    hints: ["Run ~SHOW TABLES;~ first. Six of the tables belong to the shop: customers, categories, products, employees, orders, order_items. One doesn't.", "The extra table is ~welcome_notes~.", "~SELECT * FROM welcome_notes;~ then copy the flag out of the note column (click a cell to copy it)."],
    starter: "SHOW TABLES;",
    setup(ctx) {
      const notes = [
        ["dana (data lead)", "Welcome to the team. Everything in here is a private copy, so experiment freely."],
        ["sam (support)", "If a customer asks where their order is, the answer is in the orders table."],
        ["dana (data lead)", `Your access flag is ${ctx.flag} - paste it into the flag box to get started.`],
        ["priya (engineering)", "Semicolons end statements. Forget one and the console will wait for it."],
        ["lee (finance)", "Please never run an UPDATE without a WHERE. Ask me how I know."],
      ];
      return [
        "CREATE TABLE welcome_notes (note_id INT AUTO_INCREMENT PRIMARY KEY, author VARCHAR(40) NOT NULL, note VARCHAR(200) NOT NULL)",
        `INSERT INTO welcome_notes (author, note) VALUES ${ctx.shuffle(notes).map(([a, n]) => `('${a}', '${n}')`).join(", ")}`,
      ];
    },
    solution: "SELECT * FROM welcome_notes;",
    debrief: `You just did the two things every database session starts with: look at what's there, then read some of it.

- ~SHOW TABLES;~ lists the tables in the current database. It's a MySQL command. Other databases spell it differently, which you'll see later in the course.
- ~SELECT * FROM table;~ returns everything. It's fine for a quick look at a small table. On a production table with 200 million rows it's how you get an angry message from your team, so the next challenges teach you to ask for less.

**On the job:** the first hour with any unfamiliar database looks exactly like this. List the tables, peek at a few rows of each, and build a mental map before writing anything clever.`,
  },

  {
    id: "q-columns",
    title: "Pick Your Columns",
    level: 1, time: 8, slug: "choose_columns",
    tags: ["SELECT", "DESCRIBE", "AS"],
    mode: "match",
    objective: "Marketing wants a contact list. Return exactly three columns for every customer: first_name, last_name, email (in that order).",
    lesson: `~SELECT *~ returns every column. Usually you want a few. List them, separated by commas, in the order you want them back:

~~~sql
SELECT name, price
FROM products;
~~~

### What columns does a table have?
~~~sql
DESCRIBE customers;
~~~
~DESCRIBE~ (or ~DESC~) shows each column's name, its **type** (~int~ for whole numbers, ~varchar(50)~ for text up to 50 characters, ~date~, ~decimal(8,2)~ for exact money amounts) and whether it may be empty. The schema panel on the left of the console shows the same information.

### Renaming a column in the output
~AS~ gives a column a different label in the result. It doesn't change the table.
~~~sql
SELECT name AS product, price AS usd
FROM products;
~~~

### How this challenge is checked
From here on, most challenges check **the result of your query**. The console compares the rows and columns you return with the target result. Column *labels* don't matter, but the number of columns, their order and every value does. When they match, the console prints your flag.

Layout is free: SQL ignores line breaks and extra spaces, so spread a query over several lines when it helps.`,
    hints: ["Run ~DESCRIBE customers;~ to see the exact column names.", "List the three columns after SELECT, separated by commas. No WHERE is needed: you want every customer.", "~SELECT first_name, last_name, email FROM customers;~"],
    starter: "DESCRIBE customers;",
    solution: "SELECT first_name, last_name, email FROM customers;",
    debrief: `Asking for only the columns you need is a habit worth forming on day one.

- **It's faster.** The server reads and sends less. With wide tables (some have 100+ columns) the difference is large.
- **It's safer.** ~SELECT *~ in application code silently changes meaning when someone adds a column. Named columns don't.
- **It's clearer.** The next reader can see what the query is for.

**On the job:** ~SELECT *~ is fine at the console while exploring. In code that ships, name your columns.`,
  },

  {
    id: "q-where",
    title: "Filter Rows with WHERE",
    level: 1, time: 10, slug: "where_clause",
    tags: ["WHERE", "comparison"],
    mode: "match",
    objective: "List the name and price of every product that costs more than 100.",
    lesson: `~WHERE~ keeps only the rows for which a condition is true. It comes after ~FROM~:

~~~sql
SELECT name, stock
FROM products
WHERE stock = 0;
~~~

### Comparison operators
| Operator | Meaning |
|---|---|
| ~=~ | equal to |
| ~<>~ or ~!=~ | not equal to |
| ~<~ and ~>~ | less than, greater than |
| ~<=~ and ~>=~ | at most, at least |

### Text, numbers and dates
- **Numbers** are written bare: ~WHERE price > 100~
- **Text** goes in single quotes: ~WHERE city = 'Seattle'~
- **Dates** are text in ~'YYYY-MM-DD'~ form: ~WHERE order_date >= '2025-01-01'~. That format sorts and compares correctly, which is why databases use it.

Forgetting the quotes around text is the most common beginner error. ~WHERE city = Seattle~ makes MySQL look for a *column* called Seattle and fail with ~Unknown column 'Seattle'~.

### Reading errors
When a statement is wrong the console shows the same error MySQL would. ~ERROR 1064~ is a syntax error and tells you where it gave up reading: the problem is usually at or just before the text it quotes.`,
    hints: ["The products table has ~name~ and ~price~ columns.", "Numbers aren't quoted: ~price > 100~.", "~SELECT name, price FROM products WHERE price > 100;~"],
    starter: "SELECT name, price\nFROM products;",
    solution: "SELECT name, price FROM products WHERE price > 100;",
    debrief: `~WHERE~ is where most of the thinking in SQL happens: you describe *which* rows you want and the server works out how to find them.

Notice the order of the clauses: ~SELECT … FROM … WHERE …~. That order is fixed. Putting ~WHERE~ before ~FROM~ is a syntax error.

**On the job:** almost every question someone asks you ("which orders shipped late?", "who signed up this month?") turns into a ~WHERE~ clause. The skill is translating the plain-English condition into exact comparisons, including the edges: does "more than 100" include 100? (Here it doesn't: ~>~ not ~>=~.)`,
  },

  {
    id: "q-logic",
    title: "AND, OR, IN, BETWEEN",
    level: 2, time: 12, slug: "combine_conditions",
    tags: ["AND / OR", "IN", "BETWEEN"],
    mode: "match",
    objective: "Support is auditing early-2025 orders that never completed. Return order_id, order_date and status for orders whose status is 'pending' or 'cancelled' AND that were placed from 2025-01-01 to 2025-03-31 inclusive.",
    lesson: `Real questions have more than one condition. Combine them with ~AND~ (both must be true) and ~OR~ (either may be true):

~~~sql
SELECT name, price, stock
FROM products
WHERE price < 50 AND stock > 0;
~~~

### The precedence trap
~AND~ binds tighter than ~OR~, like multiplication before addition. This query does **not** do what it looks like:
~~~sql
WHERE status = 'pending' OR status = 'cancelled' AND order_date >= '2025-01-01'
~~~
MySQL reads it as *pending (any date)*, OR *cancelled and recent*. Use parentheses whenever you mix the two:
~~~sql
WHERE (status = 'pending' OR status = 'cancelled')
  AND order_date >= '2025-01-01'
~~~

### IN: a tidy list of ORs
~~~sql
WHERE status IN ('pending', 'cancelled')
~~~
Same meaning as the two ORs, shorter, and immune to the precedence trap. ~NOT IN (…)~ is the opposite.

### BETWEEN: a range, both ends included
~~~sql
WHERE price BETWEEN 20 AND 50      -- 20 <= price <= 50
WHERE order_date BETWEEN '2025-01-01' AND '2025-01-31'
~~~

~NOT~ flips any condition: ~WHERE NOT discontinued = 1~.`,
    hints: ["Start with the status condition alone and check the rows look right, then add the date condition.", "~status IN ('pending', 'cancelled')~ and ~order_date BETWEEN '2025-01-01' AND '2025-03-31'~, joined with AND.", "~SELECT order_id, order_date, status FROM orders WHERE status IN ('pending', 'cancelled') AND order_date BETWEEN '2025-01-01' AND '2025-03-31';~"],
    starter: "SELECT order_id, order_date, status\nFROM orders\nWHERE status = 'pending';",
    solution: "SELECT order_id, order_date, status FROM orders WHERE status IN ('pending', 'cancelled') AND order_date BETWEEN '2025-01-01' AND '2025-03-31';",
    debrief: `If you wrote the two statuses with ~OR~ and forgot parentheses, you got too many rows and the console told you so. That exact bug ships to production regularly, and it's dangerous in an ~UPDATE~ or ~DELETE~, where "too many rows" means lost data.

Two habits prevent it:
- Reach for ~IN~ when comparing one column against several values.
- Parenthesise any condition that mixes ~AND~ with ~OR~, even when you're sure of the precedence. The next reader may not be.

**A note on BETWEEN and timestamps:** ~BETWEEN '2025-01-01' AND '2025-03-31'~ is perfect for a ~DATE~ column. For a ~DATETIME~ column it silently drops almost all of March 31st, because ~'2025-03-31'~ means midnight. The safe pattern for timestamps is ~>= '2025-01-01' AND < '2025-04-01'~.`,
  },

  {
    id: "q-sort",
    title: "ORDER BY and LIMIT",
    level: 2, time: 10, slug: "sort_and_limit",
    tags: ["ORDER BY", "LIMIT"],
    mode: "match", ordered: true,
    objective: "Return the name and price of the 5 most expensive products that are still sold (discontinued = 0), most expensive first.",
    lesson: `Rows in a table have **no guaranteed order**. If you run a query twice without saying how to sort, the server is allowed to return rows in a different order each time. When order matters, ask for it:

~~~sql
SELECT name, price
FROM products
ORDER BY price;           -- ascending (smallest first) by default
~~~

- ~ORDER BY price DESC~ sorts largest first. ~ASC~ is the default.
- Sort by several columns: ~ORDER BY country, city~ sorts by country, then by city within each country.
- Each column gets its own direction: ~ORDER BY status ASC, order_date DESC~.

### LIMIT: only the first N rows
~~~sql
SELECT name, price
FROM products
ORDER BY price DESC
LIMIT 3;                  -- the 3 most expensive
~~~
~LIMIT 10 OFFSET 20~ skips 20 rows and returns the next 10, which is how "page 3" of a list is fetched.

### Clause order
~~~sql
SELECT …
FROM …
WHERE …
ORDER BY …
LIMIT …
~~~
The server filters with ~WHERE~ first, then sorts what's left, then cuts it off with ~LIMIT~.

For this challenge the console checks the **order** of your rows as well as their content.`,
    hints: ["Filter first: ~WHERE discontinued = 0~.", "Sort with ~ORDER BY price DESC~, then cut with ~LIMIT 5~.", "~SELECT name, price FROM products WHERE discontinued = 0 ORDER BY price DESC LIMIT 5;~"],
    starter: "SELECT name, price\nFROM products\nORDER BY price;",
    solution: "SELECT name, price FROM products WHERE discontinued = 0 ORDER BY price DESC LIMIT 5;",
    debrief: `"Top N by something" is one of the most common shapes of query you'll write: ~ORDER BY … DESC LIMIT N~.

Two things to carry forward:
- **~LIMIT~ without ~ORDER BY~ returns arbitrary rows.** It's fine for peeking at a table and wrong for anything that claims to be "the first" or "the latest".
- **Ties need a tie-breaker.** If two products cost the same, which comes first is undefined unless you add a second sort column, for example ~ORDER BY price DESC, product_id~. Paginated lists without a tie-breaker show duplicates and skip rows.

**On the job:** add ~LIMIT~ to exploratory queries on big tables. It keeps you from pulling ten million rows into your terminal by accident.`,
  },

  {
    id: "q-like",
    title: "Patterns and Missing Values",
    level: 2, time: 12, slug: "like_and_null",
    tags: ["LIKE", "IS NULL"],
    mode: "match",
    objective: "Sales wants to call business customers but some have no number on file. Return customer_id and email for customers whose email ends with @corp.test and whose phone is missing.",
    lesson: `### LIKE: match part of a text value
~LIKE~ compares text against a pattern with two wildcards:

| Wildcard | Matches |
|---|---|
| ~%~ | any number of characters, including none |
| ~_~ | exactly one character |

~~~sql
WHERE name LIKE 'Trail%'      -- starts with Trail
WHERE name LIKE '%Tent'       -- ends with Tent
WHERE name LIKE '%Pack%'      -- contains Pack
WHERE email LIKE '_o%'        -- second letter is o
~~~

### NULL: the value that isn't one
When a value is unknown or doesn't apply, the cell holds ~NULL~. It is not zero and not an empty string. It means "no value here".

The catch that trips up everyone once: **you can't compare against NULL with ~=~**.
~~~sql
WHERE phone = NULL       -- always matches nothing!
WHERE phone IS NULL      -- correct
WHERE phone IS NOT NULL  -- correct
~~~
Why: any comparison with an unknown value is itself unknown, and ~WHERE~ only keeps rows where the condition is definitely true. That also means ~WHERE phone <> '555'~ silently skips rows where phone is NULL.

In the console, NULL cells are shown in grey italics so you can tell them apart from the text 'NULL'.`,
    hints: ["Look at a few customers first: some ~phone~ cells are NULL.", "\"Ends with\" means the wildcard goes at the front: ~email LIKE '%@corp.test'~.", "~SELECT customer_id, email FROM customers WHERE email LIKE '%@corp.test' AND phone IS NULL;~"],
    starter: "SELECT customer_id, email, phone\nFROM customers\nLIMIT 15;",
    solution: "SELECT customer_id, email FROM customers WHERE email LIKE '%@corp.test' AND phone IS NULL;",
    debrief: `NULL handling is behind a large share of real-world "the numbers don't add up" bugs. The rule to remember: **NULL is never equal to anything, not even another NULL.** Use ~IS NULL~ / ~IS NOT NULL~.

On ~LIKE~:
- In MySQL's default configuration ~LIKE~ (and ~=~) on text ignores case, so ~'%@CORP.TEST'~ would match too. That depends on the column's *collation*, and other databases differ.
- A pattern that **starts** with ~%~ can't use an index, so on a big table it reads every row. ~LIKE 'Trail%'~ can use one. You'll see why in the Performance track.

**On the job:** before trusting a count, ask "can this column be NULL?" ~DESCRIBE~ tells you (the Null column).`,
  },

  {
    id: "q-distinct",
    title: "DISTINCT: Remove Duplicates",
    level: 2, time: 8, slug: "distinct_values",
    tags: ["DISTINCT", "ORDER BY"],
    mode: "match", ordered: true,
    objective: "Where do our customers live? Return each distinct (country, city) pair exactly once, sorted by country and then city.",
    lesson: `Selecting one column from a table returns one value per row, repeats and all:

~~~sql
SELECT country FROM customers;   -- 80 rows, lots of repeats
~~~

~DISTINCT~ removes duplicate rows from the result:

~~~sql
SELECT DISTINCT country FROM customers;   -- one row per country
~~~

With several columns, ~DISTINCT~ applies to the **combination**. This returns each different status-and-customer pairing once:

~~~sql
SELECT DISTINCT customer_id, status FROM orders;
~~~

It's a quick way to answer "what values does this column actually contain?", which is one of the first things to check in unfamiliar data. Is ~status~ always lowercase? Are there three spellings of the same country? ~SELECT DISTINCT~ shows you.`,
    hints: ["~SELECT DISTINCT country, city FROM customers~ gives the pairs.", "Add ~ORDER BY country, city~ so the order is defined.", "~SELECT DISTINCT country, city FROM customers ORDER BY country, city;~"],
    starter: "SELECT country, city\nFROM customers;",
    solution: "SELECT DISTINCT country, city FROM customers ORDER BY country, city;",
    debrief: `That's the core of reading data: choose columns, filter rows, sort, limit, de-duplicate. Every query you write from here builds on those five moves.

A caution about ~DISTINCT~: it's sometimes used to hide a bug. If a query returns duplicate rows you didn't expect (often after a join), adding ~DISTINCT~ makes the symptom go away without fixing the cause, and makes the query slower. When you see unexpected duplicates, find out why first.

**Next track:** making the database compute things for you, with functions, ~CASE~ and aggregates like ~COUNT~ and ~SUM~.`,
  },
];
