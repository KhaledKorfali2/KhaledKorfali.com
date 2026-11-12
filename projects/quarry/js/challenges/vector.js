// Course: Vector Databases. Similarity search with pgvector on real PostgreSQL.
// Embeddings come from Quarry's toy 16-dimension model (data/vectors.js); the
// console rewrites embed('text') into a vector literal before running the SQL.
import { PRODUCT_COPY, ARTICLES, DIMS } from "../data/vectors.js";

const q = (s) => `'${s.replace(/'/g, "''")}'`;
const EXT = "CREATE EXTENSION IF NOT EXISTS vector";
// catalog: one row per product with its description and embedding (ids follow data/shop.js order)
const CATALOG = [
  EXT,
  `CREATE TABLE catalog (product_id integer PRIMARY KEY REFERENCES products, description text NOT NULL, embedding vector(${DIMS}) NOT NULL)`,
  `INSERT INTO catalog (product_id, description, embedding) VALUES ${Object.values(PRODUCT_COPY).map((d, i) => `(${i + 1}, ${q(d)}, embed(${q(d)}))`).join(", ")}`,
];
const HELP = [
  EXT,
  `CREATE TABLE articles (article_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, title text NOT NULL, topic text NOT NULL, body text NOT NULL, embedding vector(${DIMS}) NOT NULL)`,
  `INSERT INTO articles (title, body, topic, embedding) VALUES ${ARTICLES.map(([t, b, k]) => `(${q(t)}, ${q(b)}, ${q(k)}, embed(${q(b)}))`).join(", ")}`,
];
const PROBE = `[${Array.from({ length: DIMS }, (_, i) => ((i * 37) % 10) / 10).join(",")}]`;

export default [
  {
    id: "v-distance",
    title: "Vectors and Distance",
    level: 2, time: 10, slug: "vector_distance",
    tags: ["vector", "<->", "nearest neighbour"],
    mode: "match", ordered: true,
    objective: "The points table holds six labelled 2-D vectors. Return the label and Euclidean distance of the 3 points nearest to [3,1], nearest first.",
    lesson: `A normal database answers **exact** questions: rows where the status *is* 'paid', the price *is under* 50. A **vector database** answers a different kind: *which rows are most like this one?*

### What's a vector?
A list of numbers: ~[3, 1]~ or ~[0.12, -0.4, 0.88, …]~. Think of it as a point in space. Two numbers place a point on a page; three place it in a room; real systems use hundreds or thousands of numbers, which can't be pictured but work the same way.

The numbers come from an **embedding model**, which turns text, images or audio into vectors so that **similar things end up close together**. Search then becomes geometry: find the points nearest to the query's point. That's called **nearest-neighbour search**.

### pgvector
You don't need a special database to do this. The **pgvector** extension adds a ~vector~ type and distance operators to PostgreSQL, and it's one of the most widely used vector stores in production. This console is a real PostgreSQL with pgvector installed.

~~~sql
CREATE EXTENSION vector;                           -- once per database
CREATE TABLE points (label text, v vector(2));     -- 2 = number of dimensions
INSERT INTO points VALUES ('A', '[1,1]');
~~~

### Distance is an operator
~~~sql
SELECT label, v <-> '[3,1]' AS distance
FROM points
ORDER BY distance
LIMIT 3;
~~~
~<->~ is **Euclidean distance**, the straight-line distance you'd measure with a ruler. ~ORDER BY distance LIMIT k~ is the whole idea of vector search: sort by closeness, keep the top **k**.

This first challenge uses 2-D points so you can check the answers by hand: A is at (1,1), so its distance to (3,1) is 2.`,
    hints: ["Look at the table first: ~SELECT * FROM points;~", "Compute ~v <-> '[3,1]'~ for each row, order by it, limit 3.", "~SELECT label, v <-> '[3,1]' AS distance FROM points ORDER BY distance LIMIT 3;~"],
    starter: "SELECT label, v\nFROM points;",
    setup: () => [EXT, "CREATE TABLE points (label text PRIMARY KEY, v vector(2) NOT NULL)", "INSERT INTO points VALUES ('A', '[1,1]'), ('B', '[2,4]'), ('C', '[6,1]'), ('D', '[4,4]'), ('E', '[0,5]'), ('F', '[3,0]')"],
    solution: "SELECT label, v <-> '[3,1]' AS distance FROM points ORDER BY distance LIMIT 3;",
    debrief: `F (distance 1), A (2), C (3). You just ran a k-nearest-neighbour query, with k = 3.

Everything else in this course is the same query with bigger vectors:
- **more dimensions**, so the vectors can capture meaning;
- **vectors that come from a model** instead of being typed in;
- **ordinary SQL around it** (~WHERE~, ~JOIN~) to filter and enrich the results;
- **an index**, so it stays fast with millions of rows.

**Dedicated vector databases** such as Pinecone, Qdrant, Weaviate and Milvus do the same job with their own APIs, and add scaling features. The concepts (embeddings, distance metrics, top-k, filtering, approximate indexes) are identical, which is why learning them in SQL transfers directly.`,
  },

  {
    id: "v-search",
    title: "Semantic Search",
    level: 3, time: 12, slug: "semantic_search",
    tags: ["embedding", "<=>", "top-k"],
    mode: "match", ordered: true,
    objective: "A shopper types: something to keep my feet dry in the rain. Return the names of the 5 catalog products whose descriptions are closest in meaning to that sentence, best match first, using cosine distance.",
    lesson: `Keyword search finds rows containing the words you typed. Search for "keep my feet dry" with ~LIKE~ and you'll miss a product described as a *waterproof trail running shoe*: no shared words, same meaning.

**Semantic search** compares meaning. Both the stored text and the query are turned into vectors by the same embedding model, and you look for the stored vectors nearest the query vector.

### The catalog table
~~~sql
SELECT product_id, description, embedding FROM catalog LIMIT 2;
~~~
Each product has a one-line description and its **embedding**, computed in advance. Storing embeddings next to the data they describe is the normal design.

### Embedding the query
In a real application, your code sends the query text to an embedding model (OpenAI, Cohere, a local sentence-transformer…) and passes the resulting vector to the database as a parameter. This console stands in for that step: write ~embed('some text')~ and it's replaced by the vector before the SQL runs.

~~~sql
SELECT p.name
FROM catalog c
JOIN products p USING (product_id)
ORDER BY c.embedding <=> embed('a place to sleep for two people')
LIMIT 5;
~~~
~<=>~ is **cosine distance**, the usual choice for text. It measures the *angle* between vectors: 0 means pointing the same way (same meaning), 1 means unrelated.

### About this model
Quarry's ~embed()~ is a **toy**: a hand-built map from a few hundred outdoor-gear words onto **16 dimensions**. Real models are neural networks with 384 to 3,072 dimensions that understand almost any sentence. The toy is small enough to run here and behaves the same way for this catalogue; words outside its vocabulary carry little meaning to it.`,
    hints: ["Join ~catalog~ to ~products~ to get names.", "Order by ~c.embedding <=> embed('…')~ with the shopper's sentence, and take 5.", "~SELECT p.name FROM catalog c JOIN products p USING (product_id) ORDER BY c.embedding <=> embed('something to keep my feet dry in the rain') LIMIT 5;~"],
    starter: "SELECT p.name, c.description\nFROM catalog c\nJOIN products p USING (product_id)\nWHERE c.description ILIKE '%feet dry%';",
    setup: () => CATALOG,
    solution: "SELECT p.name FROM catalog c JOIN products p USING (product_id) ORDER BY c.embedding <=> embed('something to keep my feet dry in the rain') LIMIT 5;",
    debrief: `The keyword query in the starter found one product. The vector query surfaced waterproof shoes, gaiters and boots, none of which need to contain the shopper's exact words.

Add the distance to the output to see how confident each match is:
~~~sql
SELECT p.name, round((c.embedding <=> embed('…'))::numeric, 3) AS distance …
~~~
Notice there's **always** a top 5, even for a query like "tax advice". Nearest doesn't mean near. Real systems apply a distance threshold or let a second model re-rank the candidates; you'll add a threshold in the last challenge.

**Two rules that prevent most embedding bugs**
1. Query and documents must be embedded by the **same model**. Vectors from different models live in unrelated spaces.
2. The column's dimension count is fixed (~vector(16)~ here). Changing models means re-embedding everything.`,
  },

  {
    id: "v-filter",
    title: "Filtered Search",
    level: 3, time: 12, slug: "filtered_vector_search",
    tags: ["WHERE + ORDER BY distance", "hybrid", "metadata"],
    mode: "match", ordered: true,
    objective: "A shopper wants: warm clothes for a cold night, with a budget of 100. Return the name and price of the 3 best semantic matches among products that cost under 100, are in stock (stock above 0) and are not discontinued. Best match first, cosine distance.",
    lesson: `Pure similarity is rarely enough. The best match for "warm clothes" is no use if it costs three times the shopper's budget or is out of stock. Real search combines **meaning** with **hard conditions**:

~~~sql
SELECT p.name, p.price
FROM catalog c
JOIN products p USING (product_id)
WHERE p.price < 100                 -- hard filter: exact, relational
  AND p.stock > 0
ORDER BY c.embedding <=> embed('warm clothes for a cold night')   -- soft ranking: similarity
LIMIT 3;
~~~
~WHERE~ decides what is **eligible**. ~ORDER BY distance~ decides what is **best** among the eligible rows. This is usually called **filtered** or **metadata-filtered** vector search.

### Why doing this in SQL is pleasant
Dedicated vector databases bolt "metadata filtering" on with their own filter syntax. In PostgreSQL the vectors live in the same database as prices, stock and permissions, so a filter is just ~WHERE~ and enrichment is just ~JOIN~. No second system to keep in sync. That convenience is the main argument for pgvector.

### Hybrid search
A related idea: combine **keyword** matching with **vector** similarity, because each catches what the other misses. Vectors understand paraphrase; keywords nail exact product codes, names and rare terms. Systems run both and merge the rankings (a common method is *reciprocal rank fusion*). PostgreSQL's built-in full-text search plus pgvector can do this in one database.`,
    hints: ["Start from the semantic search in the last challenge and select name and price.", "Add a WHERE with three conditions on the products table: price, stock, discontinued.", "~SELECT p.name, p.price FROM catalog c JOIN products p USING (product_id) WHERE p.price < 100 AND p.stock > 0 AND NOT p.discontinued ORDER BY c.embedding <=> embed('warm clothes for a cold night') LIMIT 3;~"],
    starter: "SELECT p.name, p.price, p.stock, p.discontinued\nFROM catalog c\nJOIN products p USING (product_id)\nORDER BY c.embedding <=> embed('warm clothes for a cold night')\nLIMIT 6;",
    setup: () => CATALOG,
    solution: "SELECT p.name, p.price FROM catalog c JOIN products p USING (product_id) WHERE p.price < 100 AND p.stock > 0 AND NOT p.discontinued ORDER BY c.embedding <=> embed('warm clothes for a cold night') LIMIT 3;",
    debrief: `Compare with the unfiltered starter: some of the top semantic matches were over budget or unavailable, and the filter replaced them with the best of what the shopper can actually buy.

**Filters and indexes interact.** With an approximate index (next challenge but one), the index finds the nearest candidates *first* and the filter is applied *afterwards*. If the filter is very selective, you can ask for 10 and get 2. Remedies:
- raise the index's search breadth (~hnsw.ef_search~), or enable iterative scans in recent pgvector versions;
- create a **partial index** for a common filter (~… WHERE NOT discontinued~);
- partition by the filter column (one index per tenant or category).

**Security is a filter too.** In a multi-user system, "only documents this user may see" must be a ~WHERE~ condition (or row-level security), never something you check after retrieval.`,
  },

  {
    id: "v-metrics",
    title: "Choosing a Distance Metric",
    level: 3, time: 12, slug: "distance_metrics",
    tags: ["cosine", "L2", "inner product", "normalisation"],
    mode: "match", ordered: true,
    objective: "The swatches table has five 3-D vectors of very different lengths. For the query vector [1,1,0], return each label with its cosine distance and its Euclidean (L2) distance, both rounded to 3 decimals, ordered by cosine distance and then by label.",
    lesson: `"Nearest" depends on how you measure. pgvector has three main distance operators, and they can **rank the same data differently**.

| Operator | Metric | Measures | Ignores |
|---|---|---|---|
| ~<->~ | Euclidean (L2) | straight-line distance between the points | nothing |
| ~<=>~ | cosine distance | the angle between the vectors | their lengths |
| ~<#>~ | negative inner product | angle **and** length together | nothing |

### Direction versus length
Take the query ~[1,1,0]~ and two stored vectors:
- ~[10,10,0]~ points in **exactly the same direction**, but it's ten times longer.
- ~[1,0.8,0.1]~ points in a slightly different direction, and is about the same length.

Cosine distance says the first is a perfect match (distance 0): same direction, length doesn't matter. Euclidean distance says the first is far away (about 12.7) and the second is close.

For text embeddings, direction carries the meaning and length is mostly an accident of the model, so **cosine is the default choice**.

### Normalised vectors
Many models output **unit-length** vectors (length exactly 1). When every vector has the same length, all three metrics give the **same ranking**, and inner product is the cheapest to compute. That's why you'll see ~<#>~ recommended with OpenAI embeddings.

(~<#>~ returns the *negative* inner product so that smaller still means closer and ~ORDER BY … ASC~ works for all three.)

### The rule
Use the metric **the model was trained with**; its documentation says which. If it doesn't say, use cosine.

Results from these operators are double precision. To round them for display, cast first: ~round((v <=> '[1,1,0]')::numeric, 3)~.`,
    hints: ["Two computed columns: one with ~<=>~ and one with ~<->~, each against '[1,1,0]'.", "Wrap each in ~round((…)::numeric, 3)~.", "~SELECT label, round((v <=> '[1,1,0]')::numeric, 3) AS cosine, round((v <-> '[1,1,0]')::numeric, 3) AS l2 FROM swatches ORDER BY cosine, label;~"],
    starter: "SELECT label, v\nFROM swatches;",
    setup: () => [EXT, "CREATE TABLE swatches (label text PRIMARY KEY, v vector(3) NOT NULL)",
      "INSERT INTO swatches VALUES ('same direction, long', '[10,10,0]'), ('close by', '[1,0.8,0.1]'), ('opposite', '[-1,-1,0]'), ('sideways', '[1,-1,0]'), ('tiny, same direction', '[0.1,0.1,0]')"],
    solution: "SELECT label, round((v <=> '[1,1,0]')::numeric, 3) AS cosine, round((v <-> '[1,1,0]')::numeric, 3) AS l2 FROM swatches ORDER BY cosine, label;",
    debrief: `Read your result as two rankings side by side:
- By **cosine**, the long and the tiny vectors tie for first at 0: both point exactly along the query. 'sideways' is at 1 (a right angle) and 'opposite' at 2 (the maximum).
- By **L2**, 'close by' wins easily and the long vector is the *worst* match in the table, further away than the one pointing in the opposite direction.

Same data, same query, opposite conclusions. Picking the wrong metric doesn't raise an error; it quietly returns worse results, which makes it one of the nastier bugs in a search system.

Whatever you choose must match in **three places**: how the model was trained, the operator in your query, and the operator class of the index (~vector_cosine_ops~, ~vector_l2_ops~ or ~vector_ip_ops~). An index built for one metric is simply not used by a query written with another.`,
  },

  {
    id: "v-index",
    title: "Approximate Search and HNSW",
    level: 4, time: 15, slug: "hnsw_index",
    tags: ["HNSW", "ANN", "recall", "EXPLAIN"],
    mode: "verify",
    objective: "The chunks table holds 3,000 random 16-dimension vectors. A nearest-neighbour query on it currently compares the query against every row. Create an HNSW index for cosine distance on chunks.embedding so that the starter query uses the index.",
    lesson: `Every search so far was **exact**: PostgreSQL computed the distance to every row and sorted. That's perfect for a few thousand rows. At ten million rows and 1,536 dimensions, it's seconds per query.

B-tree indexes can't help: they sort values along **one** line, and "near in 1,536 dimensions" has no single order. Vector search needs a different kind of index, and a different promise.

### Approximate nearest neighbours (ANN)
An ANN index finds *almost certainly* the nearest rows by looking at a small fraction of the data. You trade a little accuracy for a lot of speed. The accuracy has a name:

**Recall** = of the true top-k, what fraction did the index return? Recall of 0.97 means that on average 97 of every 100 true neighbours are found.

### HNSW
The most popular ANN index is **HNSW** (hierarchical navigable small world): a multi-layer graph in which each vector links to some of its neighbours. A search enters at the sparse top layer, hops greedily toward the query, and drops down layer by layer, like going from motorways to streets.

~~~sql
CREATE INDEX idx_chunks_embedding
ON chunks USING hnsw (embedding vector_cosine_ops);
~~~
~vector_cosine_ops~ ties the index to the ~<=>~ operator. Use ~vector_l2_ops~ for ~<->~ and ~vector_ip_ops~ for ~<#>~.

### Tuning knobs
| Setting | Effect of raising it |
|---|---|
| ~m~ (build) | more links per node: better recall, bigger index |
| ~ef_construction~ (build) | more careful build: better recall, slower build |
| ~hnsw.ef_search~ (query time) | examines more candidates: better recall, slower query |

pgvector's other index type, **IVFFlat**, clusters the vectors into lists and searches only the nearest few lists. It builds faster and uses less memory; HNSW generally gives better speed for the same recall.

Check the plan with ~EXPLAIN~, as in the PostgreSQL course: you're looking for ~Index Scan using …~ with an ~Order By~ line, instead of ~Seq Scan~ followed by ~Sort~.`,
    hints: ["Run the starter to see the current plan: a Seq Scan and a Sort.", "The index must be on the ~embedding~ column, ~USING hnsw~, with ~vector_cosine_ops~ to match the ~<=>~ operator.", "~CREATE INDEX idx_chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops);~ then run the EXPLAIN again."],
    starter: `EXPLAIN\nSELECT chunk_id\nFROM chunks\nORDER BY embedding <=> '${PROBE}'\nLIMIT 5;`,
    setup: () => [EXT, `CREATE TABLE chunks (chunk_id integer PRIMARY KEY, embedding vector(${DIMS}) NOT NULL)`,
      `INSERT INTO chunks SELECT g, (SELECT array_agg(random()) FROM generate_series(1, ${DIMS}) WHERE g > 0)::vector FROM generate_series(1, 3000) AS g`, "ANALYZE chunks"],
    checks: [
      { label: "The cosine nearest-neighbour query uses an index on chunks.embedding", plan: `SELECT chunk_id FROM chunks ORDER BY embedding <=> '${PROBE}' LIMIT 5`, uses: "Index Scan using \\S+ on chunks", avoids: "Seq Scan" },
    ],
    solution: "CREATE INDEX idx_chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops);",
    debrief: `The plan changed from *read all 3,000 rows and sort them* to *walk the graph*. At this size both are instant; the difference is how each grows. Exact search cost grows in step with the table. HNSW search cost grows roughly with its logarithm.

Try building the index with ~vector_l2_ops~ instead (drop the first one): the ~<=>~ query goes back to a sequential scan, because the index was built for a different metric.

**What production teams watch**
- **Measure recall**, don't assume it: run a sample of queries exactly (no index) and approximately, and compare the results.
- **Build time and memory.** HNSW indexes are large and slow to build; raise ~maintenance_work_mem~ and build after bulk loading, not before.
- **Don't index too early.** Below roughly ten thousand vectors, exact search is fast and perfectly accurate. An ANN index only adds complexity.
- **Updates are fine** (the graph is maintained on insert), but heavy churn degrades quality; rebuild occasionally.`,
  },

  {
    id: "v-rag",
    title: "Retrieval for RAG",
    level: 4, time: 15, slug: "rag_retrieval",
    tags: ["RAG", "top-k", "distance threshold", "chunks"],
    mode: "match", ordered: true,
    objective: "A support chatbot must answer: how do I look after my boots when they get wet? Retrieve its context from the articles table: the title and body of at most 3 passages closest in meaning to the question, keeping only passages with a cosine distance below 0.6. Best match first.",
    lesson: `The best-known use of vector search is **retrieval-augmented generation (RAG)**: making a language model answer from *your* documents instead of from memory.

### The loop
1. **Index (ahead of time).** Split your documents into passages ("chunks"), embed each one, and store text and vector together. That's the ~articles~ table here.
2. **Retrieve (per question).** Embed the user's question and fetch the top-k nearest passages. That's a vector query, and it's what you'll write.
3. **Generate.** Put the retrieved passages into the prompt ("Answer using only these sources…") and let the model write the answer, citing them.

The model never searches anything. **The quality of the answer is capped by the quality of step 2.** If retrieval returns the wrong passages, the model confidently answers from the wrong passages.

### Top-k and a threshold
~~~sql
SELECT title, body
FROM articles
WHERE embedding <=> embed('the question') < 0.6     -- relevant enough?
ORDER BY embedding <=> embed('the question')         -- best first
LIMIT 3;                                             -- at most k
~~~
- **k** is how many passages you pass to the model. Too few and the answer may be missing; too many and you bury it in noise and pay for the extra tokens.
- The **threshold** handles questions your documents don't cover. Without it, an off-topic question still returns its 3 "nearest" passages, and the model will try to use them. With it, you get nothing back and can say "I don't know".

The right threshold depends on the model and the data; teams find it by testing real questions. 0.6 is the figure for this exercise.`,
    hints: ["Look at the table: ~SELECT title, topic, body FROM articles LIMIT 5;~", "The distance expression appears twice: once in WHERE (below 0.6) and once in ORDER BY.", "~SELECT title, body FROM articles WHERE embedding <=> embed('how do I look after my boots when they get wet') < 0.6 ORDER BY embedding <=> embed('how do I look after my boots when they get wet') LIMIT 3;~"],
    starter: "SELECT title, topic, body\nFROM articles\nLIMIT 6;",
    setup: () => HELP,
    solution: "SELECT title, body FROM articles WHERE embedding <=> embed('how do I look after my boots when they get wet') < 0.6 ORDER BY embedding <=> embed('how do I look after my boots when they get wet') LIMIT 3;",
    debrief: `Those passages, pasted into a prompt, are what lets a chatbot answer with your shop's actual boot-care advice instead of something plausible it made up.

Now try a question the help centre doesn't cover, such as ~embed('what is the capital of France')~: the threshold returns no rows. That empty result is a feature. It's the signal to answer "I don't have information on that".

**Where RAG systems are actually won and lost**
- **Chunking.** Too large and each vector blurs several topics; too small and passages lose their context. A few hundred words with some overlap is a common starting point.
- **Metadata.** Store source, date and access rights with each chunk, and filter on them (the Filtered Search lesson).
- **Hybrid retrieval and re-ranking.** Fetch 20 to 50 candidates by vector and keyword, then let a re-ranking model choose the best few.
- **Evaluation.** Keep a set of real questions with known good passages and measure whether retrieval finds them, every time you change anything.
- **Freshness.** When a document changes, its chunks must be re-embedded. Stale vectors are a silent bug.

That's the vector toolkit: embeddings, distance metrics, top-k search, filtering, approximate indexes, and the retrieval step of RAG. All of it in a database you already knew.`,
  },
];
