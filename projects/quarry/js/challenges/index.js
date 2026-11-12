// The curriculum: courses → tracks → challenges, in recommended order.
import first from "./first.js";
import functions from "./functions.js";
import joins from "./joins.js";
import advanced from "./advanced.js";
import writing from "./writing.js";
import design from "./design.js";
import perf from "./perf.js";
import job from "./job.js";
import postgres from "./postgres.js";
import sqlite from "./sqlite.js";
import pandas from "./pandas.js";
import nosql from "./nosql.js";
import vector from "./vector.js";

export const TRACKS = [
  { id: "first", title: "First Queries", icon: "term", blurb: "From zero: what a database is, then reading data with SELECT, WHERE, ORDER BY, LIMIT, LIKE and NULL.", list: first },
  { id: "functions", title: "Functions & Aggregates", icon: "sigma", blurb: "Make the database compute: expressions, text and date functions, CASE, then COUNT, SUM, GROUP BY and HAVING.", list: functions },
  { id: "joins", title: "Joins", icon: "link", blurb: "Keys and relationships. Combine tables with INNER and LEFT joins, find what's missing, join a table to itself.", list: joins },
  { id: "advanced", title: "Subqueries, CTEs & Windows", icon: "layers", blurb: "Questions one SELECT can't answer cleanly: subqueries, EXISTS, WITH, ranking and running totals.", list: advanced },
  { id: "writing", title: "Changing Data", icon: "edit", blurb: "INSERT, UPDATE and DELETE without regrets, transactions with COMMIT and ROLLBACK, and upserts.", list: writing },
  { id: "design", title: "Designing Tables", icon: "table", blurb: "CREATE TABLE, choosing types, constraints, foreign keys, normalization, and changing a live schema.", list: design },
  { id: "perf", title: "Performance & Indexes", icon: "bolt", blurb: "Read EXPLAIN, add the right index, order composite indexes, and fix queries that defeat them.", list: perf },
  { id: "job", title: "On the Job", icon: "shield", blurb: "What the work really looks like: views, least-privilege accounts, an incident clean-up, a safe production fix, and a capstone report.", list: job },
];

const COURSE_TRACKS = [
  { id: "pg", title: "PostgreSQL for SQL Users", icon: "db", blurb: "What changes and what's new when you move to Postgres: psql, strict typing, RETURNING and upserts, FILTER, DISTINCT ON, arrays, JSONB, generate_series, EXPLAIN ANALYZE, and roles that are really enforced.", list: postgres },
  { id: "lite", title: "SQLite Essentials", icon: "file", blurb: "The database in a single file: the sqlite3 shell, flexible typing and STRICT tables, text dates, ON CONFLICT and RETURNING, the foreign-key pragma, and EXPLAIN QUERY PLAN.", list: sqlite },
  { id: "pd", title: "pandas for SQL Users", icon: "table", blurb: "The same questions in Python: DataFrames, boolean filtering, new columns, missing data, groupby, merge, dates and pivot tables, on a real interpreter.", list: pandas },
  { id: "doc", title: "Document Databases", icon: "layers", blurb: "MongoDB-style documents: find and query operators, nested fields and arrays, atomic updates, the aggregation pipeline, $lookup, indexes, and when this model fits.", list: nosql },
  { id: "vec", title: "Vector Search with pgvector", icon: "wave", blurb: "Embeddings and similarity search in real PostgreSQL: distance metrics, top-k and filtered search, HNSW indexes, and the retrieval step of RAG.", list: vector },
];
const track = (id) => COURSE_TRACKS.find((t) => t.id === id);

export const COURSES = [
  { id: "mysql", title: "MySQL", engine: "mysql", blurb: "The complete path from your first SELECT to production-grade work, in a live MySQL-style console. Start here.", tracks: TRACKS.slice() },
  { id: "postgres", title: "PostgreSQL", engine: "postgres", blurb: "For people who know SQL. A real PostgreSQL 17 server in your browser.", tracks: [track("pg")] },
  { id: "sqlite", title: "SQLite", engine: "sqlite", blurb: "For people who know SQL. Real SQLite, with the sqlite3 shell's dot-commands.", tracks: [track("lite")] },
  { id: "pandas", title: "pandas", engine: "pandas", blurb: "For people who know SQL. Real Python and pandas; the first load takes a few seconds.", tracks: [track("pd")] },
  { id: "nosql", title: "NoSQL", engine: "mongo", blurb: "Document databases, taught in MongoDB's shell language on an emulator built for this course.", tracks: [track("doc")] },
  { id: "vector", title: "Vector Databases", engine: "postgres", blurb: "Similarity search with the pgvector extension on real PostgreSQL, using a small toy embedding model.", tracks: [track("vec")] },
];
TRACKS.push(...COURSE_TRACKS);
for (const c of COURSES) for (const t of c.tracks) for (const ch of t.list) ch.engine = c.engine;

export const UPCOMING = [
  { title: "PostgreSQL in Depth", icon: "db", blurb: "Recursive CTEs, lateral joins, materialized views, partitioning, MVCC and locking, row-level security, and full-text search." },
  { title: "Key-Value and Caching", icon: "bolt", blurb: "Redis-style stores: strings, hashes, sorted sets, expiry, cache-aside patterns, and what happens when the cache and the database disagree." },
  { title: "Data Modelling and Warehousing", icon: "table", blurb: "Star schemas, facts and dimensions, slowly changing data, and how analytical databases differ from transactional ones." },
  { title: "Databases from Application Code", icon: "code", blurb: "Connections and pools, parameterised queries, ORMs and their N+1 trap, migrations, and transactions in code." },
];

for (const t of TRACKS) for (const c of t.list) c.track = t.id;
export const ALL = TRACKS.flatMap((t) => t.list);
export const byId = (id) => ALL.find((c) => c.id === id);
export const trackOf = (c) => TRACKS.find((t) => t.id === c.track);

/** Linear within a track: a challenge unlocks once the previous one in its track is solved. */
export function isUnlocked(c, isSolved) {
  const t = trackOf(c);
  const i = t.list.indexOf(c);
  return i === 0 || isSolved(t.list[i - 1].id);
}
