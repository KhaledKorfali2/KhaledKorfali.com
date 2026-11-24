# Adding challenges to Quarry

Quarry is organised as **courses** (MySQL, PostgreSQL, SQLite, pandas, NoSQL,
vector search), each made of **tracks**, each a list of **challenges**. Every
challenge runs on a real engine in the browser and ends with a flag.

## Where things are

| Path | What it holds |
|------|---------------|
| `js/challenges/<track>.js` | One file per track, exporting an array of challenges |
| `js/challenges/index.js` | `TRACKS`, `COURSE_TRACKS` and `COURSES` |
| `js/data/shop.js` | Builds each learner's sample database from their seed |
| `js/engine/e-<engine>.js` | One adapter per engine: mysql, sqlite, postgres, mongo, pandas |
| `js/reference.js` | The Reference page, including the honest list of engine differences |
| `test/` | The test suites described below |

## A challenge

```js
{
  id: "q-my-challenge",            // unique, never changes once published
  title: "A Short Title",
  level: 1, time: 5,               // level 1 (easiest) to 5; time in minutes
  slug: "words_for_the_flag",
  tags: ["select", "where"],
  mode: "match",                   // "match", "verify" or "find"
  objective: "One sentence: what the query should return.",
  lesson: `Teaching text.`,
  hints: ["A nudge.", "A stronger nudge.", "Nearly the answer."],   // exactly three
  starter: "SELECT 1;",            // what the editor opens with
  setup: [],                       // extra SQL, or a function (ctx) => [sql, …]
  solution: "SELECT …;",           // a reference answer
  debrief: `What they learned and where it matters.`,
}
```

The three modes decide how an answer is checked:

| Mode | The learner passes when | Extra fields |
|------|-------------------------|--------------|
| `find` | they find the flag planted in the data | `setup` must embed `ctx.flag` |
| `match` | their result set equals the `solution`'s | `ordered: true` if row order matters; `mustUse` is a pattern the query plan must match |
| `verify` | a list of `checks` all pass | `checks`: statements with expected results, things that must be rejected, plan requirements |

Copy an existing challenge of the same mode from the same course. `verify`
checks have several forms and the existing ones show each.

## Things that will catch you out

- **Inline code is `~like this~` and code blocks use `~~~`**, not backticks,
  because lessons sit inside JavaScript template literals.
- **Don't put `|` inside a table cell** in a lesson.
- **In the pandas course `~` is the inline-code marker**, so Python's `~`
  operator can only appear inside a fenced block.
- **The starter must not already be a correct answer.** The tests check this.
- **The MySQL course runs on SQLite with a MySQL layer** (`js/engine/mysql.js`).
  If a challenge depends on behaviour that differs from real MySQL, say so in
  the lesson and add it to the table in `js/reference.js`.
- **SQLite has foreign keys off by default**, and one lesson relies on that.
- **`id` is permanent.** Progress and review cards are stored under it.

## Adding a track or a course

- A track for the MySQL course: create the file, import it in `index.js`, add
  it to `TRACKS`.
- A track for another course: add it to `COURSE_TRACKS`, then list it in that
  course's `tracks` in `COURSES`. The course's `engine` decides which adapter
  runs it.

## Testing

The suites run on Node.js. Run them from `projects/quarry/`.

```bash
node test/run.mjs
```

Runs every MySQL-course challenge on the real engine. For each one it checks
that the starter runs without error and isn't already correct, that the
reference `solution` passes, and that `verify` checks fail before the solution
and pass after it. Pass seeds as arguments to try several learners:
`node test/run.mjs a1b2c3d4 deadbeef`.

```bash
node test/courses.mjs
```

Does the same for the other five courses on their real engines (this one
loads PostgreSQL and Python, so it takes longer). It also checks for duplicate
ids and missing fields. Name engines to limit it: `node test/courses.mjs postgres`.

```bash
node test/dump.mjs a1b2c3d4 > dump.json
```

```bash
python3 test/validate.py dump.json
```

Cross-checks the MySQL course against Python's own SQLite, as a second opinion.

`test/e2e.js` plays every challenge through the real page in headless Chrome.
The instructions are at the top of that file.

Always run at least two seeds after adding a challenge. A challenge that
passes for one learner's data and fails for another's is the most common bug.

## Review cards

When a challenge is solved, `remember()` at the bottom of `js/main.js` sends a
flashcard to the site's Review page: the title as the question and the start
of the `debrief` as the answer. Write the first paragraph of each debrief as a
summary that stands on its own.
