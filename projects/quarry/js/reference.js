// Reference page content (markdown-lite; ~code~ and ~~~ fences, see ui.js).

export const REFERENCE = `### Look around
~~~sql
SHOW TABLES;
DESCRIBE customers;
SHOW CREATE TABLE orders;
SHOW INDEX FROM orders;
~~~

### Read
~~~sql
SELECT col1, col2 AS label, expression
FROM table_name
WHERE condition
GROUP BY col1
HAVING aggregate_condition
ORDER BY col1 ASC, col2 DESC
LIMIT 10 OFFSET 20;
~~~
The server runs the clauses in this order: ~FROM~ → ~WHERE~ → ~GROUP BY~ → ~HAVING~ → ~SELECT~ → ~ORDER BY~ → ~LIMIT~.

### Filter
| Condition | Meaning |
|---|---|
| ~= <> < > <= >=~ | comparisons |
| ~AND~, ~OR~, ~NOT~ | combine; parenthesise when mixing AND with OR |
| ~IN ('a', 'b')~ | any of a list |
| ~BETWEEN 1 AND 9~ | range, both ends included |
| ~LIKE 'ab%'~ | pattern: ~%~ any characters, ~_~ one character |
| ~IS NULL~, ~IS NOT NULL~ | missing values (never ~= NULL~) |

### Functions
| Kind | Examples |
|---|---|
| Text | ~CONCAT(a, b)~, ~UPPER~, ~LOWER~, ~LENGTH~, ~SUBSTRING(s, 1, 3)~, ~LEFT~, ~RIGHT~, ~TRIM~, ~REPLACE~ |
| Numbers | ~ROUND(x, 2)~, ~FLOOR~, ~CEIL~, ~ABS~ |
| Dates | ~YEAR~, ~MONTH~, ~DAY~, ~DATE_FORMAT(d, '%Y-%m')~, ~DATEDIFF(a, b)~, ~DATE_ADD(d, INTERVAL 7 DAY)~, ~CURDATE()~, ~NOW()~ |
| NULLs | ~COALESCE(a, b, 'fallback')~, ~IFNULL(a, b)~, ~NULLIF(a, b)~ |
| Logic | ~CASE WHEN … THEN … ELSE … END~, ~IF(cond, a, b)~ |
| Aggregates | ~COUNT(*)~, ~COUNT(col)~, ~COUNT(DISTINCT col)~, ~SUM~, ~AVG~, ~MIN~, ~MAX~, ~GROUP_CONCAT~ |

### Join
~~~sql
SELECT o.order_id, c.email
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id;       -- matches only

SELECT c.email, o.order_id
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id      -- keep every customer
WHERE o.order_id IS NULL;                                -- …that has no order
~~~

### Subqueries, CTEs, windows
~~~sql
SELECT name FROM products
WHERE price > (SELECT AVG(price) FROM products);

SELECT name FROM products p
WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.product_id);

WITH ranked AS (
  SELECT name, category_id, price,
         ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY price DESC) AS rn
  FROM products
)
SELECT * FROM ranked WHERE rn <= 3;

SELECT order_date, SUM(1) OVER (ORDER BY order_date) AS running_count FROM orders;
~~~

### Change data
~~~sql
INSERT INTO t (a, b) VALUES (1, 'x'), (2, 'y');
INSERT INTO t (a, b) SELECT a, b FROM other;
INSERT INTO t (k, v) VALUES ('key', 1) ON DUPLICATE KEY UPDATE v = VALUES(v);

UPDATE t SET b = 'z' WHERE a = 1;     -- never without WHERE
DELETE FROM t WHERE a = 2;            -- never without WHERE

START TRANSACTION;
-- statements…
COMMIT;                               -- or ROLLBACK;
~~~

### Define structure
~~~sql
CREATE TABLE reviews (
  review_id   INT AUTO_INCREMENT PRIMARY KEY,
  product_id  INT NOT NULL,
  rating      TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (product_id, review_id),
  FOREIGN KEY (product_id) REFERENCES products (product_id)
);

ALTER TABLE reviews ADD COLUMN helpful INT NOT NULL DEFAULT 0;
CREATE INDEX idx_reviews_product ON reviews (product_id, created_at);
CREATE VIEW good_reviews AS SELECT * FROM reviews WHERE rating >= 4;
DROP TABLE reviews;
~~~

### Performance
~~~sql
EXPLAIN SELECT … ;      -- type: ALL = full scan; ref / range / const = index used
~~~
- Index the columns you filter, join and sort on.
- Composite index order: equality columns first, then one range column.
- Don't wrap an indexed column in a function in ~WHERE~.

### Access
~~~sql
CREATE USER 'app'@'10.0.%' IDENTIFIED BY '…';
GRANT SELECT, INSERT ON shop.orders TO 'app'@'10.0.%';
REVOKE INSERT ON shop.orders FROM 'app'@'10.0.%';
SHOW GRANTS FOR 'app'@'10.0.%';
~~~`;

export const SANDBOX = `Quarry's console is a real SQL engine running in your browser: **SQLite compiled to WebAssembly**, with a layer on top that makes it accept MySQL syntax, answer MySQL commands (~SHOW~, ~DESCRIBE~, ~EXPLAIN~, ~GRANT~) and report errors with MySQL's codes and wording. Constraints, transactions, indexes and query planning are all real. No in-browser build of MySQL itself exists, so this is the closest practical thing, and the skills transfer directly.

For honesty's sake, these are the places where a real MySQL 8 server behaves differently:

| Topic | In the sandbox | In real MySQL |
|---|---|---|
| Text comparison with ~=~ | case-sensitive | case-insensitive by default (depends on collation) |
| Integer division | ~7 / 2~ gives ~3~ | ~7 / 2~ gives ~3.5~ |
| Type enforcement | lenient: an over-long ~VARCHAR~ or text in an ~INT~ column is accepted | rejected in strict mode (the default) |
| ~DECIMAL~ display | ~49.5~ | ~49.50~ |
| ~CONCAT~ with a NULL | NULL is treated as empty | the whole result is NULL |
| Non-grouped columns in ~SELECT~ | allowed | error 1055 (~ONLY_FULL_GROUP_BY~) |
| Deleting with a subquery on the same table | allowed | error 1093 unless wrapped in a derived table |
| Inline ~REFERENCES~ on a column | enforced | parsed, then ignored |
| ~ALTER TABLE … MODIFY / CHANGE~ | not available | available |
| ~EXPLAIN~ | same columns, derived from SQLite's planner; row estimates are approximate | MySQL's own optimizer |
| Users and ~GRANT~ | recorded and shown, not enforced | enforced |
| Stored procedures, triggers, events, user variables | not available | available |
| ~NOW()~ / ~CURDATE()~ | your computer's clock | the server's clock and time zone |

Where a lesson depends on one of these, it says so.

### Moving to a real server
When you're ready, install MySQL Community Server, or with Docker:

~~~text
docker run --name mysql8 -e MYSQL_ROOT_PASSWORD=dev -p 3306:3306 -d mysql:8
mysql -h 127.0.0.1 -u root -p
~~~
Then load a sample database (*Sakila* and *employees* are the classic ones from the MySQL documentation) and repeat a few challenges there.`;

export const CONSOLES = `Each course runs on the most faithful engine that can run inside a browser tab. Nothing is sent to a server.

| Course | What runs | How real is it? |
|---|---|---|
| MySQL | SQLite (WebAssembly) behind a MySQL dialect layer | An emulation of MySQL's syntax, commands and errors on a real SQL engine. Differences are listed below. |
| PostgreSQL | PGlite: PostgreSQL 17 compiled to WebAssembly | The real server. Single connection, so nothing about concurrency or replication can be shown. psql's backslash commands are re-implemented by the console. |
| SQLite | sql.js: SQLite 3.49 compiled to WebAssembly | The real engine. The dot-commands (~.tables~, ~.schema~, ~.indexes~) are re-implemented by the console. |
| pandas | Pyodide: CPython 3.14 with pandas 3.0 and numpy | The real interpreter and library. No file system or network, and no plotting. |
| NoSQL | A document store written for Quarry | An **emulator** of MongoDB's shell language, not MongoDB. It supports the commands the lessons use (see below); anything else reports an error. |
| Vector | PGlite with the pgvector extension | Real PostgreSQL and real pgvector, including HNSW indexes. The embeddings come from a hand-built 16-dimension toy model, not a neural network. |

### What the document-store emulator supports
- **Reads:** ~find~ (with projection), ~findOne~, ~countDocuments~, ~distinct~, and ~sort~ / ~limit~ / ~skip~ / ~count~ / ~explain~ on cursors.
- **Query operators:** ~$eq $ne $gt $gte $lt $lte $in $nin $exists $regex $and $or $nor $not $elemMatch $size $all~, dot notation and array matching.
- **Writes:** ~insertOne~, ~insertMany~, ~updateOne~, ~updateMany~ (~$set $unset $inc $mul $push $addToSet $pull~, ~upsert~), ~deleteOne~, ~deleteMany~.
- **Aggregation:** ~$match $group $sort $limit $skip $project $addFields $unwind $lookup $count~ with the common expression operators.
- **Indexes:** ~createIndex~ (including ~unique~), ~getIndexes~, ~dropIndex~. ~explain()~ reports a simplified plan.
- Dates are ISO strings; there are no ObjectId or date types, no transactions, and no replication or sharding.

### The toy embedding model
~embed('text')~ in the vector course maps a few hundred outdoor-gear words onto 16 concept dimensions (shelter, feet, warmth, waterproofing and so on) and normalises the result. It makes similar product descriptions land close together, which is all the lessons need. Words it doesn't know carry almost no meaning to it, so don't expect it to understand general English.`;
