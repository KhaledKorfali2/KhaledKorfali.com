// The curriculum: courses → tracks → challenges, in recommended order.
import first from "./first.js";
import functions from "./functions.js";
import joins from "./joins.js";
import advanced from "./advanced.js";
import writing from "./writing.js";
import design from "./design.js";
import perf from "./perf.js";
import job from "./job.js";

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

export const COURSES = [
  { id: "mysql", title: "MySQL", status: "live", blurb: "The complete path from your first SELECT to production-grade work, in a live MySQL-style console.", tracks: TRACKS },
];

export const UPCOMING = [
  { title: "PostgreSQL", icon: "db", blurb: "What changes when you switch servers: types, RETURNING, JSONB, arrays, materialized views, EXPLAIN ANALYZE and roles." },
  { title: "SQLite", icon: "file", blurb: "The database inside every phone and browser: single-file databases, the sqlite3 shell, type affinity, and when it's the right tool." },
  { title: "pandas", icon: "table", blurb: "The same questions in Python: DataFrames, filtering, groupby, merge, pivot tables, and moving data between pandas and SQL." },
  { title: "NoSQL", icon: "layers", blurb: "Document, key-value and wide-column stores: modelling without joins, MongoDB-style queries and aggregation pipelines, and choosing between models." },
  { title: "Vector Databases", icon: "wave", blurb: "Embeddings, similarity search, approximate nearest-neighbour indexes, hybrid search, and the retrieval step behind AI applications." },
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
