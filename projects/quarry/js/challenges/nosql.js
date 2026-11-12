// Course: NoSQL (document databases, MongoDB-style). Engine: Quarry's document
// store emulator, which speaks the mongosh shell language (see engine/e-mongo.js).

const OLD = '{ status: "cancelled", order_date: { $lt: "2024-07-01" } }';
const TOP = `db.orders.aggregate([
  { $match: { status: { $ne: "cancelled" } } },
  { $unwind: "$items" },
  { $group: { _id: "$items.name", units: { $sum: "$items.quantity" }, revenue: { $sum: { $multiply: ["$items.quantity", "$items.unit_price"] } } } },
  { $sort: { revenue: -1 } },
  { $limit: 5 },
  { $project: { _id: 0, product: "$_id", units: 1, revenue: { $round: ["$revenue", 2] } } }
])`;

export default [
  {
    id: "n-find",
    title: "Documents and find()",
    level: 1, time: 10, slug: "documents_find",
    tags: ["document", "collection", "find"],
    mode: "match",
    objective: "Return every product document in the Climbing category.",
    lesson: `Relational databases store data in tables of rows. **Document databases** store **documents**: self-contained records that look like JSON, with nested objects and arrays allowed. MongoDB is the best-known, and its query language is what this course teaches.

### Same shop, different shape
| Relational | Document |
|---|---|
| database | database |
| table | **collection** |
| row | **document** |
| column | **field** |
| primary key | ~_id~ |
| join | usually **embedding**: related data lives inside the document |

Look at one order with ~db.orders.findOne()~. Its line items aren't in a separate table; they're an array **inside** the order. Reading an order is one lookup, with no join.

Documents in a collection don't have to share the same fields. A customer with no phone number simply has no ~phone~ field at all.

### The shell
You talk to MongoDB in JavaScript-like syntax:

~~~javascript
show collections
db.products.findOne()                       // one document, to see the shape
db.products.find()                          // all documents
db.products.find({ category: "Tents" })     // documents matching a filter
~~~
The argument to ~find~ is a **filter document**: ~{ field: value }~ means "where field equals value". Several fields in one filter are combined with AND:

~~~javascript
db.products.find({ category: "Tents", discontinued: false })
~~~
Strings need quotes (single or double). Field names usually don't.

This console is an emulator of MongoDB's shell built for Quarry. The commands you learn are real MongoDB; the Reference page lists what it supports.`,
    hints: ["Run ~db.products.findOne()~ to see what a product document looks like.", "The filter is a document with the field and the value you want.", '~db.products.find({ category: "Climbing" })~'],
    starter: "db.products.findOne()",
    solution: 'db.products.find({ category: "Climbing" })',
    debrief: `In SQL that was ~SELECT * FROM products WHERE category = 'Climbing'~, after a join to get the category name. Here the name is simply stored on each product.

That's the document model's central trade: **store data in the shape you read it**. No joins on the read path, at the price of repeating some data (every Climbing product carries the string "Climbing") and having to keep the copies consistent yourself.

**Why "NoSQL" exists.** These systems appeared when web companies needed to spread data across many machines, which is hard for joins and multi-table transactions. Several families emerged:

| Family | Example | Shape |
|---|---|---|
| Document | MongoDB, Couchbase, Firestore | JSON-like documents |
| Key-value | Redis, DynamoDB | a value looked up by a key |
| Wide-column | Cassandra, HBase | rows with flexible columns, built for huge write volumes |
| Graph | Neo4j | nodes and relationships |

"NoSQL" is best read as "not only SQL". Most serious systems use a relational database *and* one or more of these, each for what it's good at.`,
  },

  {
    id: "n-ops",
    title: "Operators, Projection, Sort",
    level: 2, time: 12, slug: "query_operators",
    tags: ["$gte", "$lte", "projection", "sort"],
    mode: "match", ordered: true,
    objective: "Return products that cost between 50 and 150 inclusive and are not discontinued. Each result should contain only name and price (no _id), cheapest first.",
    lesson: `Equality is written ~{ field: value }~. For anything else you use **query operators**, which start with ~$~ and sit in a nested document:

~~~javascript
db.products.find({ price: { $gt: 100 } })
db.products.find({ price: { $gte: 20, $lte: 50 } })           // both conditions on one field
db.products.find({ category: { $in: ["Tents", "Packs"] } })
~~~

| Operator | Meaning |
|---|---|
| ~$gt~ ~$gte~ ~$lt~ ~$lte~ | greater / less than (or equal) |
| ~$ne~ | not equal |
| ~$in~ ~$nin~ | in / not in a list |
| ~$exists~ | the field is present (or not) |
| ~$regex~ or ~/pattern/i~ | pattern match |
| ~$or~ ~$and~ ~$nor~ | combine whole filters: ~{ $or: [ {…}, {…} ] }~ |

### Projection: choosing fields
The **second** argument to ~find~ says which fields to return:

~~~javascript
db.products.find({ category: "Tents" }, { name: 1, price: 1 })          // only these (plus _id)
db.products.find({ category: "Tents" }, { name: 1, price: 1, _id: 0 })  // and drop _id
db.products.find({}, { tags: 0 })                                        // everything except tags
~~~
~_id~ is included unless you switch it off. You can't mix 1s and 0s, except for ~_id: 0~.

### Sort, limit, skip
These chain onto the cursor that ~find~ returns:

~~~javascript
db.products.find({}).sort({ price: -1 }).limit(5)      // 1 ascending, -1 descending
~~~

SQL's ~SELECT name, price FROM products WHERE … ORDER BY price DESC LIMIT 5~ maps directly: projection, filter, sort, limit.`,
    hints: ["Two conditions on price go in one nested document: ~{ price: { $gte: 50, $lte: 150 } }~.", "Add ~discontinued: false~ to the filter, and a projection ~{ name: 1, price: 1, _id: 0 }~.", '~db.products.find({ price: { $gte: 50, $lte: 150 }, discontinued: false }, { name: 1, price: 1, _id: 0 }).sort({ price: 1 })~'],
    starter: "db.products.find({ price: { $gt: 300 } }, { name: 1, price: 1 })",
    solution: "db.products.find({ price: { $gte: 50, $lte: 150 }, discontinued: false }, { name: 1, price: 1, _id: 0 }).sort({ price: 1 })",
    debrief: `Every piece of a basic SQL query has a counterpart:

| SQL | MongoDB |
|---|---|
| ~WHERE price > 100~ | ~{ price: { $gt: 100 } }~ |
| ~WHERE a = 1 AND b = 2~ | ~{ a: 1, b: 2 }~ |
| ~WHERE a = 1 OR b = 2~ | ~{ $or: [ { a: 1 }, { b: 2 } ] }~ |
| ~SELECT name, price~ | second argument: ~{ name: 1, price: 1 }~ |
| ~ORDER BY price DESC~ | ~.sort({ price: -1 })~ |
| ~LIMIT 10 OFFSET 20~ | ~.skip(20).limit(10)~ |
| ~COUNT(*)~ | ~db.c.countDocuments({…})~ |
| ~SELECT DISTINCT category~ | ~db.c.distinct("category")~ |

A common mistake: ~{ price: { $gte: 50 }, price: { $lte: 150 } }~. A document can't have the same key twice, so the second ~price~ silently replaces the first. Put both operators in one nested document, as you did.`,
  },

  {
    id: "n-nested",
    title: "Nested Fields and Missing Fields",
    level: 2, time: 12, slug: "dot_notation",
    tags: ["dot notation", "$exists", "embedded document"],
    mode: "match",
    objective: "Find customers in Canada who have no phone number on file. Return only each customer's email and their city (no _id).",
    lesson: `Customer documents contain **embedded documents**: fields whose value is another document.

~~~javascript
{
  _id: 7,
  name: { first: "Ava", last: "Kim" },
  email: "ava.kim7@example.com",
  address: { city: "Calgary", country: "Canada" },
  signup_date: "2023-05-02"
}
~~~

### Dot notation
Reach inside with a dotted path. Because of the dot, the path **must be in quotes**:

~~~javascript
db.customers.find({ "address.country": "Japan" })
db.customers.find({}, { "name.last": 1, "address.city": 1 })     // works in projections too
~~~

### Fields that aren't there
In SQL a missing phone number is a NULL in a column every row has. In a document database the field is usually just **absent**. Look at a few customers: some have a ~phone~ field and some don't.

~~~javascript
db.customers.find({ phone: { $exists: false } })    // no phone field at all
db.customers.find({ phone: { $exists: true } })
~~~
(~{ phone: null }~ also matches documents where the field is missing *or* explicitly null.)

### Schema flexibility cuts both ways
Not having to declare columns is convenient: adding a field needs no migration. It also means **nothing stops** one document from saying ~phone~, another ~phoneNumber~, and a third ~Phone~. The structure still exists; it has just moved out of the database and into your application code and your discipline. MongoDB offers optional **schema validation** to get some of it back.`,
    hints: ["~db.customers.findOne()~ shows the nested address.", 'The filter needs ~"address.country": "Canada"~ and ~phone: { $exists: false }~.', '~db.customers.find({ "address.country": "Canada", phone: { $exists: false } }, { email: 1, "address.city": 1, _id: 0 })~'],
    starter: 'db.customers.find({ "address.country": "Portugal" })',
    solution: 'db.customers.find({ "address.country": "Canada", phone: { $exists: false } }, { email: 1, "address.city": 1, _id: 0 })',
    debrief: `The projection ~"address.city": 1~ kept the nesting: each result has an ~address~ document containing only ~city~. Projections trim documents; they don't flatten them. (Reshaping is what the aggregation pipeline's ~$project~ is for, coming up.)

**Embedded documents are the document model's replacement for a one-to-one join.** An address that belongs to exactly one customer and is always read with them has no reason to live elsewhere.

**Dates in this console** are stored as ISO strings like ~"2024-03-01"~, which compare correctly with ~$lt~ and ~$gte~. Real MongoDB has a proper date type, written ~ISODate("2024-03-01")~; this console accepts that spelling and treats it as the string.`,
  },

  {
    id: "n-arrays",
    title: "Querying Arrays",
    level: 3, time: 12, slug: "array_queries",
    tags: ["arrays", "$elemMatch", "embedded array"],
    mode: "match",
    objective: "Find orders that contain a line for product 5 with a quantity of 3 or more (both conditions on the same line item). Return only _id and customer_id.",
    lesson: `Each order embeds its line items as an **array of documents**:

~~~javascript
items: [
  { product_id: 33, name: "Spork Set", quantity: 2, unit_price: 12.99 },
  { product_id: 5,  name: "Family Dome 6P", quantity: 1, unit_price: 508.49 }
]
~~~

### Matching inside arrays
A filter on an array field matches if **any element** matches:

~~~javascript
db.products.find({ tags: "premium" })              // tags array contains "premium"
db.orders.find({ "items.product_id": 5 })          // some line item is product 5
~~~
Dot notation reaches through the array into each element.

### The trap
Now two conditions:

~~~javascript
db.orders.find({ "items.product_id": 5, "items.quantity": { $gte: 3 } })
~~~
This matches an order with *some* item that is product 5 and *some* item with quantity 3 or more. They need **not be the same item**. An order with one unit of product 5 and three sporks matches.

### $elemMatch
To require one element to satisfy all the conditions:

~~~javascript
db.orders.find({
  items: { $elemMatch: { product_id: 5, quantity: { $gte: 3 } } }
})
~~~
This is the single most common bug in MongoDB queries. If two conditions are about the same array element, use ~$elemMatch~.

Other array operators: ~$size~ (exact length), ~$all~ (contains all of these values), and ~$in~ (contains any).`,
    hints: ["Start with ~db.orders.find({ \"items.product_id\": 5 }).count()~ to see how many orders include the product.", "Both conditions must be on the same line item, so they go inside ~$elemMatch~.", "~db.orders.find({ items: { $elemMatch: { product_id: 5, quantity: { $gte: 3 } } } }, { _id: 1, customer_id: 1 })~"],
    starter: 'db.orders.find({ "items.product_id": 5, "items.quantity": { $gte: 3 } }).count()',
    solution: "db.orders.find({ items: { $elemMatch: { product_id: 5, quantity: { $gte: 3 } } } }, { _id: 1, customer_id: 1 })",
    debrief: `Compare the count from the starter query with the number of documents you just returned. The difference is orders that have product 5 on one line and a large quantity on another: wrong answers the dotted version lets through.

**Embedding is a design decision.** Line items are embedded in the order because they are:
- **owned** by exactly one order,
- **read together** with it almost every time, and
- **bounded** in number (an order has a handful of lines, not millions).

When any of those fails, reference instead. Customers are *referenced* from orders by ~customer_id~, not embedded, because a customer has many orders and their details change independently. A document also has a size limit (16 MB in MongoDB), so "embed an unbounded, ever-growing list" is always the wrong design.`,
  },

  {
    id: "n-write",
    title: "Insert, Update, Delete",
    level: 3, time: 15, slug: "write_operations",
    tags: ["insertOne", "$set", "$inc", "$addToSet", "deleteMany"],
    mode: "verify",
    objective: 'Four changes. (1) Insert a product with _id 100: name "Headlamp", category "Lighting", price 34.5, stock 20, discontinued false, tags ["lighting"]. (2) On product 1: add 25 to its stock and add the tag "restocked". (3) Set stock to 0 on every discontinued product. (4) Delete every cancelled order placed before 2024-07-01.',
    lesson: `### Insert
~~~javascript
db.products.insertOne({ _id: 200, name: "Compass", price: 19.5 })
db.products.insertMany([ { name: "A" }, { name: "B" } ])
~~~
If you leave ~_id~ out, MongoDB generates a unique ~ObjectId~. Inserting an ~_id~ that already exists fails with a duplicate key error (E11000).

### Update: filter, then operators
~~~javascript
db.products.updateOne(
  { _id: 7 },                                  // which document
  { $set: { price: 24.99 }, $inc: { stock: -1 } }   // what to change
)
~~~
The second argument uses **update operators**. Without them you'd be replacing the whole document, so the shell refuses.

| Operator | Does |
|---|---|
| ~$set~ | sets fields (creates them if missing) |
| ~$unset~ | removes fields |
| ~$inc~ | adds to a number |
| ~$push~ | appends to an array |
| ~$addToSet~ | appends only if not already present |
| ~$pull~ | removes matching elements from an array |

~updateOne~ changes the first match; ~updateMany~ changes every match. Adding ~{ upsert: true }~ as a third argument inserts a new document when nothing matches.

### Delete
~~~javascript
db.orders.deleteOne({ _id: 12 })
db.orders.deleteMany({ status: "cancelled" })
~~~

### The same warning as SQL
~updateMany({}, …)~ and ~deleteMany({})~ with an empty filter hit **every document**. Run the filter through ~find~ or ~countDocuments~ first, exactly as you'd run a ~SELECT~ before an ~UPDATE~.

Operators like ~$inc~ are **atomic** on a single document: two clients incrementing the same counter can't lose an update. That's the right way to change a value based on its current value.`,
    hints: ['~db.products.insertOne({ _id: 100, name: "Headlamp", category: "Lighting", price: 34.5, stock: 20, discontinued: false, tags: ["lighting"] })~', '~db.products.updateOne({ _id: 1 }, { $inc: { stock: 25 }, $addToSet: { tags: "restocked" } })~ and ~db.products.updateMany({ discontinued: true }, { $set: { stock: 0 } })~', `Check first with ~db.orders.countDocuments(${OLD})~, then ~db.orders.deleteMany(${OLD})~`],
    starter: "db.products.findOne({ _id: 1 })",
    setup: () => ['db.products.updateOne({ _id: 1 }, { $set: { stock: 10, tags: ["tents"] } })'],
    checks: [
      { label: "Product 100 (Headlamp) exists with the right fields", js: 'db.products.countDocuments({ _id: 100, name: "Headlamp", category: "Lighting", price: 34.5, stock: 20, discontinued: false, tags: "lighting" })', is: 1 },
      { label: 'Product 1 has 35 in stock and the tag "restocked" (once)', js: 'db.products.countDocuments({ _id: 1, stock: 35, tags: { $all: ["tents", "restocked"], $size: 2 } })', is: 1 },
      { label: "Every discontinued product has stock 0", js: "db.products.countDocuments({ discontinued: true, stock: { $ne: 0 } })", is: 0 },
      { label: "Products that are still sold kept their stock", js: "db.products.countDocuments({ discontinued: false, stock: 0, _id: { $nin: [1, 100] } })", expect: "db.products.countDocuments({ discontinued: false, stock: 0, _id: { $nin: [1, 100] } })" },
      { label: "No cancelled orders from before 2024-07-01 remain", js: `db.orders.countDocuments(${OLD})`, is: 0 },
      { label: "All other orders are still there", js: "db.orders.countDocuments({})", expect: `db.orders.countDocuments({ $nor: [${OLD}] })` },
    ],
    solution: `db.products.insertOne({ _id: 100, name: "Headlamp", category: "Lighting", price: 34.5, stock: 20, discontinued: false, tags: ["lighting"] })
db.products.updateOne({ _id: 1 }, { $inc: { stock: 25 }, $addToSet: { tags: "restocked" } })
db.products.updateMany({ discontinued: true }, { $set: { stock: 0 } })
db.orders.deleteMany(${OLD})`,
    debrief: `Notice what the delete did **not** require: because line items are embedded in each order, removing an order removed its items with it. No children to delete first, no foreign key to satisfy.

Notice also what the database did **not** check: nothing verified that category "Lighting" is a real category, or that a product you insert has a price at all. In the relational shop a foreign key and a NOT NULL constraint would have. That freedom is the trade.

**Transactions.** A change to **one document** is always atomic, embedded arrays included, which is another reason to embed things that must change together. Changes across several documents are not atomic by default. MongoDB has supported multi-document transactions since version 4.0, but if a design needs them constantly, that's a hint the data is relational.

~$push~ versus ~$addToSet~: run your product 1 update twice with ~$push~ and the tag appears twice. With ~$addToSet~ the second run changes nothing. It's idempotent, which you want for anything that may be retried.`,
  },

  {
    id: "n-group",
    title: "The Aggregation Pipeline",
    level: 3, time: 12, slug: "aggregate_group",
    tags: ["aggregate", "$match", "$group", "$sum"],
    mode: "match",
    objective: "Count orders by status. Return one document per status, with the status as _id and a field named orders holding the count.",
    lesson: `~find~ filters and returns documents. For anything like ~GROUP BY~, calculations or reshaping, MongoDB uses the **aggregation pipeline**: a list of **stages**, each taking the documents produced by the stage before it.

~~~javascript
db.orders.aggregate([
  { $match: { status: "delivered" } },                 // stage 1: filter   (WHERE)
  { $group: { _id: "$customer_id", n: { $sum: 1 } } }, // stage 2: group    (GROUP BY + COUNT)
  { $sort: { n: -1 } },                                // stage 3: sort     (ORDER BY)
  { $limit: 3 }                                        // stage 4: limit
])
~~~
Read it top to bottom, like a CTE chain. That order is also the order it runs in, which makes pipelines easier to reason about than a SQL statement whose clauses run in a different order than they're written.

### $group
~~~javascript
{ $group: { _id: <what to group by>, <field>: { <accumulator>: <expression> } } }
~~~
- ~_id~ is the grouping key. ~"$status"~, with the **dollar sign**, means "the value of the status field". Without the dollar it would be the literal text "status". Use ~_id: null~ to aggregate everything into one group.
- Accumulators: ~$sum~, ~$avg~, ~$min~, ~$max~, ~$push~ (collect into an array), ~$addToSet~, ~$first~.
- ~{ $sum: 1 }~ adds 1 per document: that's ~COUNT(*)~.

| SQL | Pipeline stage |
|---|---|
| ~WHERE~ | ~$match~ (before ~$group~) |
| ~GROUP BY~ | ~$group~ |
| ~HAVING~ | ~$match~ (after ~$group~) |
| ~SELECT~ expressions | ~$project~ |
| ~ORDER BY~, ~LIMIT~ | ~$sort~, ~$limit~ |`,
    hints: ["One stage is enough: a ~$group~.", 'Group by ~"$status"~ (with the dollar) and count with ~{ $sum: 1 }~.', '~db.orders.aggregate([ { $group: { _id: "$status", orders: { $sum: 1 } } } ])~'],
    starter: 'db.orders.aggregate([\n  { $match: { status: "delivered" } },\n  { $group: { _id: "$customer_id", n: { $sum: 1 } } },\n  { $sort: { n: -1 } },\n  { $limit: 3 }\n])',
    solution: 'db.orders.aggregate([ { $group: { _id: "$status", orders: { $sum: 1 } } } ])',
    debrief: `In SQL: ~SELECT status, COUNT(*) AS orders FROM orders GROUP BY status~.

**HAVING is just another $match.** To keep only statuses with more than 20 orders, add a stage after the group:
~~~javascript
{ $match: { orders: { $gt: 20 } } }
~~~
The same stage means WHERE or HAVING depending on where it sits. That's the pipeline idea paying off.

**Put ~$match~ first.** A ~$match~ at the start of a pipeline can use an index and shrinks everything downstream. Filtering late means grouping documents you're about to discard.

If you forget the dollar sign and write ~_id: "status"~, every document gets the same key, the literal string, and you get one group containing everything. When a ~$group~ returns a single surprising document, look for a missing ~$~.`,
  },

  {
    id: "n-unwind",
    title: "$unwind: Aggregating Embedded Arrays",
    level: 4, time: 18, slug: "unwind_group_project",
    tags: ["$unwind", "$group", "$project", "$multiply"],
    mode: "match", ordered: true,
    objective: "Find the 5 best-selling products by revenue, ignoring cancelled orders. Return documents with exactly three fields: product (the product name), units (total quantity sold) and revenue (quantity × unit_price summed, rounded to 2 decimals), highest revenue first.",
    lesson: `Revenue lives in the line items, and the line items are arrays inside orders. To aggregate **per item**, you first need one document per item.

### $unwind
~$unwind~ takes an array field and emits **one copy of the document per element**, with the array replaced by that element:

~~~javascript
db.orders.aggregate([
  { $match: { _id: 1 } },
  { $unwind: "$items" }
])
// an order with 2 items becomes 2 documents, each with items: { product_id: …, quantity: … }
~~~
After unwinding, ~"$items.quantity"~ is a single number, and you can group on ~"$items.name"~. This is the document world's version of joining orders to order_items.

### Expressions
Inside stages you can compute with **expression operators**, written prefix-style with their arguments in an array:

~~~javascript
{ $multiply: ["$items.quantity", "$items.unit_price"] }
{ $round: ["$revenue", 2] }
{ $concat: ["$name.first", " ", "$name.last"] }
~~~
They nest: ~{ $sum: { $multiply: [ … ] } }~ sums a product per group.

### $project: shape the output
~~~javascript
{ $project: { _id: 0, product: "$_id", units: 1, revenue: { $round: ["$revenue", 2] } } }
~~~
- ~field: 1~ keeps a field, ~_id: 0~ drops the id.
- ~newName: "$oldField"~ renames.
- ~newName: { expression }~ computes.

### Plan the pipeline
1. ~$match~ non-cancelled orders.
2. ~$unwind~ the items.
3. ~$group~ by item name: sum the quantity, sum quantity × unit_price.
4. ~$sort~ by revenue, descending.
5. ~$limit~ 5.
6. ~$project~ into the three requested fields.

Build it one stage at a time and run after each. The starter gives you the first two.`,
    hints: ['After the unwind, add ~{ $group: { _id: "$items.name", units: { $sum: "$items.quantity" }, revenue: { $sum: { $multiply: ["$items.quantity", "$items.unit_price"] } } } }~', "Then ~{ $sort: { revenue: -1 } }~ and ~{ $limit: 5 }~.", 'Finish with ~{ $project: { _id: 0, product: "$_id", units: 1, revenue: { $round: ["$revenue", 2] } } }~'],
    starter: 'db.orders.aggregate([\n  { $match: { status: { $ne: "cancelled" } } },\n  { $unwind: "$items" },\n  { $limit: 3 }\n])',
    solution: TOP,
    debrief: `Six stages, each doing one thing. In SQL this was a three-table join with ~GROUP BY~, ~ORDER BY~ and ~LIMIT~; here the "join" was an ~$unwind~ because the data was already together.

**The cost of embedding shows up here.** Reading one order is trivially fast in this model. But a question that cuts *across* orders, like revenue per product, has to open every order and unpack its array. The relational model is the other way round: per-order reads need a join, cross-cutting questions are natural. **Model for the questions you ask most.**

Also note that each line item carries the product ~name~. That copy is what made this pipeline possible without a lookup, and it's a snapshot of the name at order time, like ~unit_price~. Deliberate duplication of this kind is called **denormalization**, and in document databases it's a standard tool, not a mistake.`,
  },

  {
    id: "n-lookup",
    title: "$lookup: Joining Collections",
    level: 4, time: 15, slug: "lookup_join",
    tags: ["$lookup", "reference", "embed vs reference"],
    mode: "match",
    objective: "Support needs to contact customers with pending orders. For every order with status pending, return its _id, its order_date and a field email holding the customer's email address.",
    lesson: `Orders **reference** customers by ~customer_id~ instead of embedding them. So getting a customer's email onto an order needs a join after all. In the pipeline, that's ~$lookup~.

~~~javascript
db.orders.aggregate([
  { $lookup: {
      from: "customers",            // the other collection
      localField: "customer_id",    // field in orders
      foreignField: "_id",          // field in customers
      as: "customer"                // where to put the matches
  } }
])
~~~
It's a **left outer join**: every order comes through, with a new field ~customer~ holding an **array** of matching customer documents. The array has one element here, and would be empty if no customer matched.

### Unwrapping the array
Since it's an array, ~"$customer.email"~ would give you an array of emails. Flatten it first:

~~~javascript
{ $unwind: "$customer" }          // customer: [ {…} ]  →  customer: {…}
{ $project: { order_date: 1, email: "$customer.email" } }
~~~

### Embed or reference?
| Embed when… | Reference when… |
|---|---|
| the data is owned by the parent | it's shared by many parents |
| it's read with the parent | it's read and updated on its own |
| the list is small and bounded | the list can grow without limit |
| it changes with the parent | it changes independently |

Order → items: embed. Order → customer: reference. Product → category name: copy the name (it almost never changes).

~$lookup~ works, but it's the expensive operation in this model: no join optimizer, and it doesn't work across shards in all configurations. **If most of your queries need ~$lookup~, the data is relational** and a relational database will serve it better.`,
    hints: ['Start with ~{ $match: { status: "pending" } }~ so the lookup only runs for the orders you need.', 'Add the ~$lookup~ from the lesson, then ~{ $unwind: "$customer" }~.', '~db.orders.aggregate([ { $match: { status: "pending" } }, { $lookup: { from: "customers", localField: "customer_id", foreignField: "_id", as: "customer" } }, { $unwind: "$customer" }, { $project: { order_date: 1, email: "$customer.email" } } ])~'],
    starter: 'db.orders.aggregate([\n  { $match: { status: "pending" } },\n  { $lookup: { from: "customers", localField: "customer_id", foreignField: "_id", as: "customer" } },\n  { $limit: 1 }\n])',
    solution: 'db.orders.aggregate([ { $match: { status: "pending" } }, { $lookup: { from: "customers", localField: "customer_id", foreignField: "_id", as: "customer" } }, { $unwind: "$customer" }, { $project: { order_date: 1, email: "$customer.email" } } ])',
    debrief: `The SQL equivalent is one line: ~SELECT o.order_id, o.order_date, c.email FROM orders o JOIN customers c ON … WHERE o.status = 'pending'~. Joins are what relational databases are built around; in a document database they're possible but second-class.

**Choosing between the two models**

Reach for a **relational** database when:
- the data has many relationships and you ask ad-hoc questions across them;
- correctness matters across records: money, inventory, anything needing multi-row transactions and constraints.

Reach for a **document** database when:
- each record is a self-contained aggregate read and written as a unit (a product page, a user profile, a shopping cart, an event);
- the shape varies from record to record or changes often;
- you need to scale writes horizontally across many servers.

And remember PostgreSQL's ~jsonb~ from the PostgreSQL course: for a relational system that needs a few flexible documents, that's often all the "NoSQL" a project requires.`,
  },

  {
    id: "n-index",
    title: "Indexes and explain()",
    level: 4, time: 12, slug: "mongo_indexes",
    tags: ["createIndex", "explain", "COLLSCAN", "IXSCAN"],
    mode: "verify",
    objective: "Two indexes. (1) The order history page runs db.orders.find({ customer_id: 7 }) and scans the whole collection: add an index so it doesn't. (2) Customer emails must be unique: create a unique index on customers.email.",
    lesson: `Document databases need indexes for the same reason relational ones do, and they use the same structure, B-trees. Without one, a query reads every document in the collection.

### explain()
~~~javascript
db.orders.find({ customer_id: 7 }).explain()
~~~
Look at ~queryPlanner.winningPlan~:

| stage | Meaning |
|---|---|
| ~COLLSCAN~ | collection scan: every document read |
| ~IXSCAN~ (under ~FETCH~) | an index found the matches, then the documents were fetched |

and at ~executionStats~: ~totalDocsExamined~ compared with ~nReturned~. Examining 264 documents to return 6 is the signature of a missing index.

### Creating indexes
~~~javascript
db.orders.createIndex({ customer_id: 1 })                 // 1 ascending, -1 descending
db.orders.createIndex({ status: 1, order_date: -1 })      // compound: same leftmost-prefix rule as SQL
db.products.createIndex({ tags: 1 })                      // on an array: indexes every element ("multikey")
db.customers.createIndex({ "address.country": 1 })        // on a nested field
db.orders.getIndexes()
~~~
Every collection already has one index, on ~_id~.

### Unique indexes are your constraints
There's no ~UNIQUE~ keyword on a field, because there are no column definitions. Uniqueness is enforced by an index:

~~~javascript
db.customers.createIndex({ email: 1 }, { unique: true })
~~~
After that, inserting a second customer with the same email fails with E11000. In a schemaless database this is one of the few guarantees the server itself will enforce, so use it for anything that must be unique.`,
    hints: ["Run the starter: the stage is COLLSCAN and all 264 documents are examined.", "~db.orders.createIndex({ customer_id: 1 })~, then run the explain again.", "~db.customers.createIndex({ email: 1 }, { unique: true })~"],
    starter: "db.orders.find({ customer_id: 7 }).explain()",
    checks: [
      { label: "Finding a customer's orders uses an index (IXSCAN, not COLLSCAN)", js: "db.orders.find({ customer_id: 7 }).explain().queryPlanner.winningPlan.inputStage.stage", is: "IXSCAN" },
      { label: "customers has an index on email", js: 'db.customers.find({ email: "x@y.z" }).explain().queryPlanner.winningPlan.inputStage.indexName', is: "email_1" },
      { label: "The email index is unique", js: "db.customers.getIndexes().1.unique", is: true },
    ],
    solution: "db.orders.createIndex({ customer_id: 1 })\ndb.customers.createIndex({ email: 1 }, { unique: true })",
    debrief: `~totalDocsExamined~ went from the whole collection down to exactly the documents returned.

Everything from the MySQL course's Performance track applies unchanged: index the fields you filter and sort on, order compound indexes with equality fields before range fields, and remember that each index slows writes a little.

**Beyond this course**
- **Replica sets:** several copies of the data on different servers, with automatic failover. This is how MongoDB stays available.
- **Sharding:** splitting a collection across servers by a **shard key**. Choosing that key is the most consequential design decision in a large deployment, and very hard to change later.
- **Consistency settings:** read and write "concerns" let you trade speed against the guarantee that a write has reached a majority of servers. Relational databases mostly make that choice for you; distributed NoSQL systems hand it to you.

That's the working core of a document database: documents and collections, filters and operators, nested fields and arrays, atomic updates, the aggregation pipeline, ~$lookup~, and indexes, plus the judgement about when this model fits.`,
  },
];
