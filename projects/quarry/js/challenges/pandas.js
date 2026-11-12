// Course: pandas. The same questions as the SQL courses, answered in Python.
// Engine: real CPython + pandas 3 (Pyodide). The shop tables are preloaded as
// DataFrames; a cell's last expression is displayed and is what gets checked.
// Note for authors: "~" is this file's inline-code marker, so Python's tilde
// operator only ever appears inside fenced blocks.

const code = (s) => `\n~~~python\n${s}\n~~~`;

export default [
  {
    id: "d-frame",
    title: "DataFrames",
    level: 1, time: 10, slug: "dataframe_basics",
    tags: ["DataFrame", "head", "columns"],
    mode: "match",
    objective: "Marketing wants a contact list. Produce a DataFrame with exactly three columns for every customer: first_name, last_name, email (in that order).",
    lesson: `SQL runs inside a database. A huge amount of data work happens somewhere else: in **Python**, with a library called **pandas**. Analysts and data scientists use it to load data from files, APIs and databases, then clean, reshape, combine and summarise it in code.

This console is a real Python interpreter with real pandas, running in your browser. The shop's tables are already loaded, one variable per table: ~customers~, ~products~, ~categories~, ~orders~, ~order_items~, ~employees~.

### The DataFrame
A **DataFrame** is pandas' table: rows and named columns, held in memory.

~~~python
customers.head()        # first 5 rows
customers.shape         # (rows, columns)
customers.columns       # column names
customers.dtypes        # each column's type
customers.info()        # all of the above, summarised
~~~
A single column is a **Series**: ~customers["email"]~ or, for simple names, ~customers.email~.

### How the console works
It behaves like a notebook cell. Everything you type runs, and **the value of the last line is displayed**. Use ~print()~ to show something earlier in the cell. Variables stay defined between runs; **Reset database** starts fresh.

### Selecting columns
Pass a **list** of names inside the brackets. Note the double brackets: the outer pair indexes the DataFrame, the inner pair is the list.

~~~python
products[["name", "price"]]
~~~

From here on, challenges check the last value in your cell against a target table. Column *labels* don't matter; the columns, their order and the values do.`,
    hints: ["Run ~customers.head()~ and ~customers.columns~ to see what's there.", "Select several columns with a list inside the brackets.", '~customers[["first_name", "last_name", "email"]]~'],
    starter: "customers.head()",
    solution: 'customers[["first_name", "last_name", "email"]]',
    debrief: `In SQL that was ~SELECT first_name, last_name, email FROM customers~.

| SQL | pandas |
|---|---|
| table | DataFrame |
| column | Series |
| ~SELECT a, b~ | ~df[["a", "b"]]~ |
| ~LIMIT 5~ | ~df.head(5)~ |
| ~DESCRIBE t~ | ~df.dtypes~, ~df.info()~ |
| ~COUNT(*)~ | ~len(df)~ |

**The index.** The bold numbers down the left of a printed DataFrame aren't a column; they're the **index**, pandas' row labels. By default it's 0, 1, 2… You'll see it carry real information once you start grouping.

**Where the data usually comes from:** ~pd.read_csv("file.csv")~, ~pd.read_excel(…)~, ~pd.read_json(…)~, or straight from a database with ~pd.read_sql("SELECT …", connection)~. Knowing SQL and pandas together is the standard analyst toolkit: SQL to get the data out, pandas to work on it.`,
  },

  {
    id: "d-filter",
    title: "Filtering Rows",
    level: 2, time: 12, slug: "boolean_masks",
    tags: ["boolean mask", "&", "isin", "query"],
    mode: "match",
    objective: "Return the name and price of every product that costs more than 100 and is not discontinued.",
    lesson: `pandas filters rows with a **boolean mask**: a Series of True/False values, one per row.

~~~python
products.price > 100             # a Series of booleans
products[products.price > 100]   # the rows where it's True
~~~
The comparison is applied to the whole column at once. You almost never write a loop in pandas; operations work on entire columns ("vectorised"), which is both shorter and far faster.

### Combining conditions
Use ~&~ for and, ~|~ for or, and the tilde for not. **Each condition needs its own parentheses**, because these operators bind tighter than comparisons:

~~~python
products[(products.price < 50) & (products.stock > 0)]
products[(products.category_id == 1) | (products.category_id == 4)]
products[~products.discontinued]                     # ~ flips True and False
~~~
Python's words ~and~, ~or~ and ~not~ don't work here; they'd try to treat a whole column as a single true/false value and raise *"The truth value of a Series is ambiguous"*. You will see that error at least once.

### Helpers
~~~python
orders[orders.status.isin(["pending", "cancelled"])]       # IN (…)
products[products.price.between(20, 50)]                   # BETWEEN, inclusive
customers[customers.email.str.endswith("@corp.test")]      # string methods live under .str
~~~

### Filter, then choose columns
~~~python
products[products.price > 100][["name", "price"]]
~~~

### query(): the same thing as a string
~~~python
products.query("price > 100 and not discontinued")
~~~
Inside ~query~ you *can* write ~and~/~or~/~not~, and column names need no prefix. Many people find it more readable for long conditions.`,
    hints: ["Two conditions joined with ~&~, each in parentheses.", "~discontinued~ is a boolean column. Negate it with the tilde operator, or compare it with ~== False~.", `One way:${code('products[(products.price > 100) & (~products.discontinued)][["name", "price"]]')}`],
    starter: "products[products.price > 100]",
    solution: 'products[(products.price > 100) & (~products.discontinued)][["name", "price"]]',
    debrief: `SQL: ~SELECT name, price FROM products WHERE price > 100 AND NOT discontinued~.

| SQL | pandas |
|---|---|
| ~WHERE a > 1~ | ~df[df.a > 1]~ |
| ~AND~ / ~OR~ / ~NOT~ | ampersand, vertical bar and tilde, each condition in parentheses |
| ~IN (…)~ | ~.isin([…])~ |
| ~BETWEEN x AND y~ | ~.between(x, y)~ |
| ~LIKE 'abc%'~ | ~.str.startswith("abc")~ |
| ~LIKE '%abc%'~ | ~.str.contains("abc")~ |

Look at the index of your result: it has gaps (0, 3, 4, …). Filtering keeps each row's original label. That's harmless, and ~.reset_index(drop=True)~ renumbers from 0 when you want a clean one.

**~.loc~** does row filter and column choice in one step and is the form to prefer in real code: ~products.loc[products.price > 100, ["name", "price"]]~.`,
  },

  {
    id: "d-sort",
    title: "New Columns and Sorting",
    level: 2, time: 12, slug: "assign_and_sort",
    tags: ["assign", "sort_values", "nlargest"],
    mode: "match", ordered: true,
    objective: "Find where the money is sitting on the shelves: return name and stock_value (price × stock) for the 3 products with the highest stock value, highest first.",
    lesson: `### Calculated columns
Arithmetic on columns works element by element:

~~~python
products.price * products.stock       # a new Series, one value per row
~~~
To attach it as a column, either assign to a new name or use ~assign~, which returns a **new** DataFrame and leaves the original alone:

~~~python
products["stock_value"] = products.price * products.stock      # changes products
p = products.assign(stock_value=products.price * products.stock)   # products untouched
~~~
Prefer ~assign~ while exploring: you can re-run the cell without piling up side effects.

### Sorting and top-N
~~~python
p.sort_values("stock_value", ascending=False)             # ORDER BY … DESC
p.sort_values(["category_id", "price"], ascending=[True, False])
p.sort_values("stock_value", ascending=False).head(3)     # ORDER BY … LIMIT 3
p.nlargest(3, "stock_value")                              # the same, shorter
~~~

### Method chaining
Each of these methods returns a DataFrame, so they chain into a pipeline that reads top to bottom. Wrapping the chain in parentheses lets you break it across lines:

~~~python
(
    products
    .assign(stock_value=products.price * products.stock)
    .nlargest(3, "stock_value")
    [["name", "stock_value"]]
)
~~~
This is the idiomatic pandas style, and it maps onto SQL clause by clause: compute, sort and limit, select.

For this challenge the **order** of the rows is checked.`,
    hints: ["Create the column with ~assign(stock_value=products.price * products.stock)~.", "Then ~.nlargest(3, \"stock_value\")~ and select the two columns.", '~products.assign(stock_value=products.price * products.stock).nlargest(3, "stock_value")[["name", "stock_value"]]~'],
    starter: "products.sort_values(\"price\", ascending=False).head()",
    solution: 'products.assign(stock_value=products.price * products.stock).nlargest(3, "stock_value")[["name", "stock_value"]]',
    debrief: `SQL: ~SELECT name, price * stock AS stock_value FROM products ORDER BY stock_value DESC LIMIT 3~.

**The copy-versus-view trap, mostly gone.** For years, the most confusing thing in pandas was the *SettingWithCopyWarning*: assigning into a filtered DataFrame sometimes changed the original and sometimes didn't. pandas 3, which this console runs, made **copy-on-write** the rule: a filtered or selected result always behaves as an independent copy. You'll still meet the old warning in older code and older versions.

Useful one-liners in the same family: ~df.nsmallest(n, col)~, ~df.rank()~, ~df.describe()~ for summary statistics of every numeric column, and ~df.round(2)~.`,
  },

  {
    id: "d-na",
    title: "Missing Data",
    level: 2, time: 12, slug: "missing_data",
    tags: ["NaN", "isna", "fillna", ".str"],
    mode: "match",
    objective: "Sales wants to call business customers but some have no number on file. Return customer_id and email for customers whose email ends with @corp.test and whose phone is missing.",
    lesson: `Real data has holes. pandas marks a missing value as **NaN** ("not a number") or **NA**, its equivalent of SQL's NULL, and it has the same quirk: **a missing value is not equal to anything, including itself**.

~~~python
customers[customers.phone == None]     # finds nothing!
customers[customers.phone.isna()]      # correct
customers[customers.phone.notna()]
~~~

### Finding it
~~~python
customers.isna().sum()          # missing values per column: the first thing to run on new data
customers.phone.isna().mean()   # the fraction missing
~~~

### Dealing with it
~~~python
customers.dropna(subset=["phone"])                 # drop rows with no phone
customers.phone.fillna("unknown")                  # replace missing values
customers.assign(has_phone=customers.phone.notna())
~~~
Which is right depends on meaning. Dropping rows quietly changes your totals; filling with a made-up value (0, an average) can fabricate facts. Decide deliberately and say what you did.

### Aggregates skip missing values
~mean()~, ~sum()~ and ~count()~ ignore NaN by default, just as SQL aggregates ignore NULL. ~len(df)~ counts rows; ~df.col.count()~ counts non-missing values. The difference between those two numbers is how many are missing.

### String methods
Text operations live under the ~.str~ accessor and apply to the whole column:

~~~python
customers.email.str.endswith("@corp.test")
customers.email.str.split("@").str[1]        # the domain
customers.city.str.upper()
~~~
They pass missing values through as missing, so they're safe on columns with holes.`,
    hints: ["Check ~customers.isna().sum()~ to see which column has missing values.", "Combine ~customers.email.str.endswith(\"@corp.test\")~ and ~customers.phone.isna()~ with ~&~.", '~customers[customers.email.str.endswith("@corp.test") & customers.phone.isna()][["customer_id", "email"]]~'],
    starter: "customers.isna().sum()",
    solution: 'customers[customers.email.str.endswith("@corp.test") & customers.phone.isna()][["customer_id", "email"]]',
    debrief: `SQL: ~WHERE email LIKE '%@corp.test' AND phone IS NULL~.

**Missing values and types.** Historically NaN was a floating-point value, so an integer column with one missing entry silently became floats (1.0, 2.0, NaN). Modern pandas has nullable types (~Int64~, ~boolean~, ~string~) that can hold a missing value without changing the column's type. If ids show up with ~.0~ on the end after a merge, this is why.

**Before trusting any number, profile the data:**
~~~python
df.shape
df.dtypes
df.isna().sum()
df.describe(include="all")
df["col"].value_counts(dropna=False)
~~~
Five lines that catch most surprises: wrong types, unexpected nulls, typo'd categories, impossible values.`,
  },

  {
    id: "d-group",
    title: "groupby",
    level: 3, time: 12, slug: "groupby_agg",
    tags: ["groupby", "size", "agg", "value_counts"],
    mode: "match",
    objective: "How are orders distributed across statuses? Return one row per order status with two columns: the status and the number of orders in it.",
    lesson: `~groupby~ is pandas' ~GROUP BY~: **split** the rows into groups, **apply** a calculation to each, **combine** the results.

~~~python
orders.groupby("status").size()                    # rows per group      (COUNT(*))
products.groupby("category_id")["price"].mean()    # one column, one aggregate
products.groupby("category_id")["price"].agg(["min", "max", "mean"])
~~~
Pick the column to aggregate in brackets after ~groupby~, then call the aggregate: ~sum~, ~mean~, ~min~, ~max~, ~count~, ~nunique~ (count distinct), ~median~.

### Named aggregation
For several calculations with your own column names:

~~~python
orders.groupby("status").agg(
    n=("order_id", "count"),
    first=("order_date", "min"),
    last=("order_date", "max"),
)
~~~
Each argument is ~new_name=(column, function)~. This is the clearest form and the one to use in real code.

### The group keys become the index
Look at the result of a ~groupby~: the status values sit on the left as the **index**, not as an ordinary column. That's by design, and useful for lookups, but if you want a plain table:

~~~python
orders.groupby("status").size().reset_index(name="orders")
orders.groupby("status", as_index=False).agg(n=("order_id", "count"))
~~~
Quarry's checker treats a named index as data, so both forms count as "status, then the number".

### A shortcut for counting
Counting rows per value of one column is so common it has its own method:

~~~python
orders.status.value_counts()
~~~`,
    hints: ["Group orders by the status column.", "~.size()~ counts the rows in each group.", '~orders.groupby("status").size()~ (or ~orders.status.value_counts()~)'],
    starter: 'products.groupby("category_id")["price"].mean()',
    solution: 'orders.groupby("status").size()',
    debrief: `SQL: ~SELECT status, COUNT(*) FROM orders GROUP BY status~.

| SQL | pandas |
|---|---|
| ~GROUP BY a~ | ~.groupby("a")~ |
| ~COUNT(*)~ | ~.size()~ |
| ~COUNT(col)~ | ~["col"].count()~ |
| ~COUNT(DISTINCT col)~ | ~["col"].nunique()~ |
| ~SUM / AVG / MIN / MAX~ | ~.sum() / .mean() / .min() / .max()~ |
| ~HAVING COUNT(*) > 5~ | filter the result: ~r[r > 5]~ |

**HAVING is just a filter afterwards.** A grouped result is an ordinary Series or DataFrame, so you filter it like any other:
~~~python
counts = orders.groupby("customer_id").size()
counts[counts >= 5]
~~~

**~transform~** is the pandas counterpart of a window function: it computes per group but returns one value **per original row**, for example each product's price as a share of its category's total: ~products.price / products.groupby("category_id").price.transform("sum")~.`,
  },

  {
    id: "d-transform",
    title: "Changing a DataFrame",
    level: 3, time: 15, slug: "add_columns_map",
    tags: ["new columns", "map", "in place"],
    mode: "verify",
    objective: "Prepare the data for analysis by changing the DataFrames themselves. (1) Add a column line_total to order_items: quantity × unit_price. (2) Add a column total to orders: the sum of line_total over that order's items.",
    lesson: `So far every answer was a new table. Often you instead need to **enrich the tables you have**, step by step, because later steps build on earlier ones. This challenge checks the state of your variables, not the last line.

### Adding a column in place
~~~python
order_items["line_total"] = order_items.quantity * order_items.unit_price
~~~
Assigning to a new name in square brackets adds the column to the DataFrame. (Attribute style, ~order_items.line_total = …~, does **not** create a column. Always use brackets when assigning.)

### Bringing a grouped value back onto rows
Each order's total is a sum over its items:

~~~python
per_order = order_items.groupby("order_id")["line_total"].sum()
~~~
~per_order~ is a Series whose **index is order_id** and whose values are totals. To attach it to ~orders~, look each order's id up in it with ~map~:

~~~python
orders["total"] = orders.order_id.map(per_order)
~~~
~Series.map(other_series)~ is a lookup: for each value, find it in the other Series' index and return the matching value. It's the simplest way to add one column from another table when you have a single key. (For several columns, use ~merge~, in the next challenge.)

### Notebook hygiene
Because variables persist between runs, running a cell like ~df["x"] = df["x"] * 2~ twice doubles it twice. Prefer assignments that give the same result however many times they run, like the two above, and press **Reset database** when you've lost track of what state you're in.`,
    hints: ['~order_items["line_total"] = order_items.quantity * order_items.unit_price~', 'Sum per order: ~order_items.groupby("order_id")["line_total"].sum()~', `Then map it onto orders:${code('order_items["line_total"] = order_items.quantity * order_items.unit_price\norders["total"] = orders.order_id.map(order_items.groupby("order_id")["line_total"].sum())')}`],
    starter: "order_items.head()",
    checks: [
      { label: "order_items has a line_total column", py: "'line_total' in order_items.columns" },
      { label: "line_total equals quantity × unit_price on every row", py: "bool(((order_items.line_total - order_items.quantity * order_items.unit_price).abs() < 0.005).all())" },
      { label: "orders has a total column", py: "'total' in orders.columns" },
      { label: "Each order's total is the sum of its line totals", py: "len(orders) == len(sol['orders']) and bool(((orders.sort_values('order_id').total.reset_index(drop=True) - sol['orders'].sort_values('order_id').total.reset_index(drop=True)).abs() < 0.005).all())" },
      { label: "No rows were added or dropped", py: "len(orders) == 264 and len(order_items) == len(sol['order_items'])" },
    ],
    solution: 'order_items["line_total"] = order_items.quantity * order_items.unit_price\norders["total"] = orders.order_id.map(order_items.groupby("order_id")["line_total"].sum())',
    debrief: `You've built a derived column on a child table and rolled it up to its parent: the pandas version of a subquery in an ~UPDATE~.

Now ~orders.total.describe()~ gives you the distribution of order values in one line, and ~orders.nlargest(5, "total")~ the biggest orders.

**In place versus chained.** Analysts mix both styles: mutate a working DataFrame while exploring, then rewrite the keepers as a clean chain (~assign~, ~merge~, ~groupby~) that starts from the raw data, so the result is reproducible from top to bottom. A notebook that only works if cells are run in a particular secret order is the pandas equivalent of an undocumented production hotfix.`,
  },

  {
    id: "d-merge",
    title: "merge: Joins in pandas",
    level: 3, time: 15, slug: "merge_join",
    tags: ["merge", "how=", "rename"],
    mode: "match",
    objective: "Which categories bring in the money? Return each category name and its total revenue across all order items (quantity × unit_price), rounded to 2 decimals.",
    lesson: `~merge~ is pandas' ~JOIN~.

~~~python
order_items.merge(products, on="product_id")
~~~
Rows are matched where ~product_id~ is equal, and the result has the columns of both.

| SQL | pandas |
|---|---|
| ~JOIN … ON a.k = b.k~ | ~a.merge(b, on="k")~ |
| ~LEFT JOIN~ | ~a.merge(b, on="k", how="left")~ |
| different key names | ~left_on="x", right_on="y"~ |

The default is an **inner** join. ~how~ can be ~"left"~, ~"right"~, ~"outer"~ or ~"cross"~.

### Chaining merges
~~~python
order_items.merge(products, on="product_id").merge(categories, on="category_id")
~~~
That follows the same foreign keys as the three-table join in the MySQL course.

### Name clashes
Both ~products~ and ~categories~ have a column called ~name~. pandas keeps both and renames them ~name_x~ and ~name_y~, which is confusing. Rename before merging:

~~~python
cats = categories.rename(columns={"name": "category"})
~~~

### Then group
A merged DataFrame is just a DataFrame:

~~~python
m = order_items.merge(products, on="product_id").merge(cats, on="category_id")
m.assign(revenue=m.quantity * m.unit_price).groupby("category")["revenue"].sum().round(2)
~~~

### Check your row counts
Joins can multiply or drop rows. ~len()~ before and after is the cheapest test there is: merging order items to their product should leave the number of order items unchanged. ~merge(…, validate="many_to_one")~ makes pandas check that for you and raise an error if the right-hand side has duplicate keys.`,
    hints: ['Rename first: ~cats = categories.rename(columns={"name": "category"})~', 'Merge order_items → products on product_id, then → cats on category_id.', `Then compute revenue and group:${code('cats = categories.rename(columns={"name": "category"})\nm = order_items.merge(products, on="product_id").merge(cats, on="category_id")\nm.assign(revenue=m.quantity * m.unit_price).groupby("category")["revenue"].sum().round(2)')}`],
    starter: 'order_items.merge(products, on="product_id").head()',
    solution: 'cats = categories.rename(columns={"name": "category"})\nm = order_items.merge(products, on="product_id").merge(cats, on="category_id")\nm.assign(revenue=m.quantity * m.unit_price).groupby("category")["revenue"].sum().round(2)',
    debrief: `The SQL was a three-table ~JOIN~ with ~GROUP BY c.name~. Same path through the keys, same result.

**The anti-join in pandas.** "Customers with no orders" uses ~indicator=True~, which adds a ~_merge~ column saying where each row came from:
~~~python
m = customers.merge(orders, on="customer_id", how="left", indicator=True)
m[m._merge == "left_only"]
~~~

**SQL or pandas for the join?** If the data lives in a database, do the joins and heavy filtering **in SQL** and pull only the result into pandas. The database has indexes and a query planner; pandas has to load whole tables into memory first. A good default: SQL to select and combine, pandas to reshape, analyse and plot.`,
  },

  {
    id: "d-dates",
    title: "Dates and Time Series",
    level: 3, time: 15, slug: "datetime_groupby",
    tags: ["to_datetime", ".dt", "resample"],
    mode: "match", ordered: true,
    objective: "Report monthly order volume for 2025. Return one row per month, labelled as YYYY-MM, with the number of orders placed in it, counting only orders from 2025-01-01 onward that are not cancelled, in chronological order.",
    lesson: `Run ~orders.dtypes~: ~order_date~ is a **string**. It came from a file, and pandas doesn't guess that text is a date. As text you can compare it (ISO dates sort correctly) but you can't ask for its month or do date arithmetic.

### Convert once
~~~python
orders["order_date"] = pd.to_datetime(orders["order_date"])
~~~
The column's type becomes ~datetime64~, a real timestamp. (When reading files you can do this up front: ~pd.read_csv(path, parse_dates=["order_date"])~.)

### The .dt accessor
Just as text methods live under ~.str~, date parts live under ~.dt~:

~~~python
orders.order_date.dt.year
orders.order_date.dt.month
orders.order_date.dt.day_name()
orders.order_date.dt.strftime("%Y-%m")        # formatted text, like DATE_FORMAT
orders.order_date.dt.to_period("M")           # a "month" value: 2025-03
~~~
Date arithmetic works directly: subtracting two datetime columns gives a duration, and ~.dt.days~ turns it into a number.

### Grouping by month
Group by a computed Series instead of a column name:

~~~python
orders.groupby(orders.order_date.dt.strftime("%Y-%m")).size()
~~~

### Filtering by date
Comparisons accept date strings: ~orders[orders.order_date >= "2025-01-01"]~.

### resample
For regular time buckets pandas has a dedicated tool. With the date as the index:

~~~python
orders.set_index("order_date").resample("MS").size()     # MS = month start
~~~
Unlike ~groupby~, ~resample~ **includes empty periods** as zeros, which is exactly the gap-filling that needed ~generate_series~ in PostgreSQL.`,
    hints: ['Convert first: ~o = orders.assign(order_date=pd.to_datetime(orders.order_date))~', 'Filter: ~o = o[(o.status != "cancelled") & (o.order_date >= "2025-01-01")]~', `Group by the month label:${code('o = orders.assign(order_date=pd.to_datetime(orders.order_date))\no = o[(o.status != "cancelled") & (o.order_date >= "2025-01-01")]\no.groupby(o.order_date.dt.strftime("%Y-%m")).size()')}`],
    starter: "orders.dtypes",
    solution: 'o = orders.assign(order_date=pd.to_datetime(orders.order_date))\no = o[(o.status != "cancelled") & (o.order_date >= "2025-01-01")]\no.groupby(o.order_date.dt.strftime("%Y-%m")).size()',
    debrief: `SQL: ~SELECT DATE_FORMAT(order_date, '%Y-%m'), COUNT(*) … GROUP BY 1 ORDER BY 1~.

Time series is where pandas is strongest, and where it goes well beyond SQL's comfort zone:
~~~python
daily = orders.set_index("order_date").resample("D").size()
daily.rolling(7).mean()          # 7-day moving average
daily.cumsum()                   # running total
daily.pct_change()               # day-over-day change
daily.shift(7)                   # the value a week earlier (SQL's LAG)
~~~

**Time zones.** A datetime column is "naive" unless you localise it: ~.dt.tz_localize("UTC")~, then ~.dt.tz_convert("Europe/Lisbon")~. Mixing naive and zone-aware timestamps raises an error, which is pandas protecting you from an off-by-hours bug.`,
  },

  {
    id: "d-pivot",
    title: "Pivot Tables",
    level: 4, time: 15, slug: "pivot_table",
    tags: ["pivot_table", "crosstab", "reshape"],
    mode: "match",
    objective: "Build a status-by-year summary: one row per order status, one column per year of order_date (2024, 2025), each cell holding the number of orders. Statuses down the side, years across.",
    lesson: `Every result so far has been **long**: one row per group. Reports for people are often **wide**: one row per status, one *column* per year. Turning one into the other is **pivoting**, and it's the operation spreadsheets made famous.

### pivot_table
~~~python
o = orders.assign(year=pd.to_datetime(orders.order_date).dt.year)

o.pivot_table(
    index="status",        # what goes down the side
    columns="year",        # what goes across the top
    values="order_id",     # what to aggregate
    aggfunc="count",       # how
    fill_value=0,          # show 0 instead of NaN for empty cells
)
~~~
It's a ~groupby~ on two keys, with one key's values spread out into columns.

- ~aggfunc~ can be ~"sum"~, ~"mean"~, ~"count"~, ~"nunique"~… or a list of them.
- ~margins=True~ adds row and column totals.

### crosstab: counting made simple
When all you want is counts of two categorical columns against each other:

~~~python
pd.crosstab(o.status, o.year)
~~~

### Long and wide
| Direction | Method |
|---|---|
| long → wide | ~pivot_table~, ~pivot~, ~unstack~ |
| wide → long | ~melt~, ~stack~ |

"Long" (also called *tidy*) data, with one observation per row, is the best shape for storing, filtering and grouping. "Wide" is the best shape for reading. Keep data long while you work and pivot at the end, for presentation.

SQL can pivot too, with one ~SUM(CASE WHEN … )~ or ~COUNT(*) FILTER (…)~ per output column, but you must know the columns in advance and type each one. pandas discovers them from the data.`,
    hints: ['Add the year first: ~o = orders.assign(year=pd.to_datetime(orders.order_date).dt.year)~', '~index="status"~, ~columns="year"~, count the order_id values.', `Full answer:${code('o = orders.assign(year=pd.to_datetime(orders.order_date).dt.year)\no.pivot_table(index="status", columns="year", values="order_id", aggfunc="count", fill_value=0)')}`],
    starter: 'o = orders.assign(year=pd.to_datetime(orders.order_date).dt.year)\no.groupby(["status", "year"]).size()',
    solution: 'o = orders.assign(year=pd.to_datetime(orders.order_date).dt.year)\no.pivot_table(index="status", columns="year", values="order_id", aggfunc="count", fill_value=0)',
    debrief: `The starter's ~groupby(["status", "year"]).size()~ holds exactly the same numbers in long form: ten rows instead of a five-by-two grid. Adding ~.unstack()~ to it pivots the inner key into columns and gives your answer a third way.

**Getting results out**
~~~python
result.to_csv("summary.csv")
result.to_excel("summary.xlsx")
result.to_sql("status_by_year", connection)     # write a table back to a database
result.plot(kind="bar")                          # a chart, via matplotlib
~~~

**Where pandas stops.** It holds everything in memory on one machine, which is comfortable up to a few million rows and painful beyond a few gigabytes. Past that, people push the work back into a database, or use tools with the same ideas and a different engine: **DuckDB** (SQL over files and DataFrames), **Polars** (a faster DataFrame library) or **Spark** (clusters).

That's the working core of pandas: DataFrames, boolean filtering, new columns, missing data, ~groupby~, ~merge~, dates and pivots. Everything maps onto SQL you already know, which is the fastest way to learn either one.`,
  },
];
