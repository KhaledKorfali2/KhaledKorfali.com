# Course Kit: writing your own course

The kit turns a folder of plain-text lessons into an interactive course with
practice questions, progress tracking and flashcards that feed the site's
[Review](../projects/review/) page. There is nothing to build or install.
You write text files and refresh the browser.

[Arabic Foundations](../projects/arabic-foundations/) is a full course made
this way. [`template/`](template/) is a two-lesson course that shows every
feature, and is the thing to copy.

## Start a course in five steps

1. Copy `kit/template/` to `projects/<your-course>/`.
2. Edit `course.json`: give it a new `id`, a `title`, and list your lessons.
3. Write one `.md` file per lesson in `lessons/`.
4. Serve the site and open it:
   ```bash
   python3 -m http.server 8000
   ```
   Then visit `http://localhost:8000/projects/<your-course>/`.
5. Open `http://localhost:8000/kit/check.html?course=/projects/<your-course>/course.json`
   to check every lesson for mistakes.

When it's ready, add a card for it in the site's root `script.js` (copy an
existing entry in the `projects` list) and a line in `sitemap.xml`.

## course.json

```json
{
  "id": "my-course",
  "title": "My Course",
  "description": "One or two sentences shown under the title.",
  "accent": "#1f5fa8",
  "accentDark": "#8fbdf2",
  "units": [
    { "title": "First unit", "summary": "Optional line under the unit title.",
      "lessons": ["01-first-lesson", "02-second-lesson"] }
  ]
}
```

| Field | Needed | What it does |
|-------|--------|--------------|
| `id` | yes | Short name with no spaces. Progress and flashcards are saved under it, so **don't change it once people have started the course**. |
| `title`, `description` | title yes | Shown on the course's front page. |
| `units` | yes | Each has a `title`, an optional `summary`, and `lessons`: file names from `lessons/` without `.md`, in order. |
| `accent`, `accentDark` | no | The course's colour in light and dark mode. |
| `speak` | no | A language code such as `"ar-SA"` or `"fr-FR"`. Adds a button that reads each word aloud, on devices that have a voice for that language. |
| `drills` | no | Set to `false` to turn off the automatic word questions. |
| `back` | no | Where the "Projects" link at the top goes. Defaults to `/projects.html`. |

JSON is strict: double quotes only, and no comma after the last item in a list.
If the file is invalid the course page says so.

## A lesson file

```markdown
# The lesson's title

The reading, in Markdown.

## Words

| Term | Meaning |
|------|---------|
| photosynthesis | how plants make food from light |

## Practice

? Which gas do plants take in?
+ Carbon dioxide
- Oxygen
! Plants take in carbon dioxide and give out oxygen.

## Cards

Q: What do plants need for photosynthesis?
A: Light, water and carbon dioxide.
```

The first line is the title. Everything up to the first special heading is the
reading. The three special headings, `## Words`, `## Practice` and `## Cards`,
are all optional. Any other `##` heading is an ordinary heading in the reading.

### Formatting in the reading

| You write | You get |
|-----------|---------|
| `**bold**`, `*italic*` | **bold**, *italic* |
| `` `code` `` | inline code |
| `[text](https://example.com)` | a link |
| `## Heading`, `### Smaller heading` | headings |
| lines starting with `- ` or `1. ` | lists |
| lines starting with `> ` | a highlighted box, for examples and key rules |
| lines starting with `\|` | a table (an optional `\|---\|` line makes the first row a header) |
| text between lines of three backticks | a code block |
| `---` on its own line | a dividing line |

Arabic, Persian and Urdu text is detected automatically and shown larger, in
an Arabic typeface, reading right to left. For that, the course's `index.html`
should load the Amiri font, as Arabic Foundations does.

HTML tags are not interpreted. They are shown as text, so a lesson can't break
the page.

### Words

A table with two to four columns:

```markdown
| Term | Meaning |
| Term | How to say it | Meaning |
| Term | How to say it | Meaning | A note |
```

A header row followed by a `|---|` line is skipped. Each word then does three
things without any more work from you:

- It is listed at the end of the lesson.
- It becomes a flashcard (term on the front, meaning on the back).
- It gets one automatic multiple-choice question. The wrong answers are other
  words from the course, taken from the nearest lessons first.

For the automatic questions to work, a course needs at least three words with
different meanings. Give each word a meaning that no other word shares, or the
question becomes ambiguous. The checker lists repeated terms.

### Practice

Each question starts on a line beginning with `?`. Two things work in every type:

- A line starting with `!` is the explanation shown after answering. Write one
  for every question: it is where most of the learning happens.
- Lines starting with `>` appear in a box under the question, for a quote or
  example to study.

**Choice.** `-` for wrong answers, `+` for right ones. The order is shuffled
each time unless you add a line saying `@fixed`. With more than one `+`, the
learner must tick all of them.

```markdown
? Which of these is a prime number?
- 9
+ 7
- 15
! 7 has no divisors except 1 and itself.
```

**Typed.** List every answer you'll accept after `=`. Capital letters,
punctuation, extra spaces and Arabic vowel marks are ignored when checking.

```markdown
?type What is the capital of Japan?
= Tokyo
= Tokyo, Japan
```

**Order.** One line of tiles separated by `|`, in the right order. They are
shown shuffled. An optional `x` line adds decoy tiles that don't belong.

```markdown
?order Put the steps in order.
plan | build | test | ship
x panic
```

**Match.** One pair per line, joined by ` = ` with a space on each side.

```markdown
?match Match each country to its capital.
France = Paris
Kenya = Nairobi
```

**Sort.** One group per line: the group's name, a colon, then its items.
Separate items with commas, or with `|` if an item contains a comma.

```markdown
?sort Mammal or reptile?
Mammal: whale, bat, human
Reptile: gecko, cobra
```

A question the learner gets wrong comes round again at the end of the session,
and the score counts only first attempts.

### Cards

Extra flashcards for ideas that aren't single words:

```markdown
Q: Why does ice float?
A: Water expands as it freezes, so ice is less dense than liquid water.
```

A lesson's flashcards are sent to the Review page when the learner finishes
its practice (or marks it as read, if it has no questions).

## Writing lessons that teach

- **One idea per lesson.** If the title needs "and", it's probably two lessons.
- **Keep the reading short**, about what fits on two phone screens. Put the
  rest into questions.
- **Ask about the idea, not the wording.** A good question can't be answered
  by spotting a phrase from the reading.
- **Make the wrong answers tempting.** Use the mistakes people really make,
  then say in the `!` line why they're wrong.
- **Aim for six to ten questions a lesson**, mixing the types.
- **Bring earlier material back.** Use words and rules from earlier lessons in
  later questions.

## Checking your work

`/kit/check.html?course=/projects/<your-course>/course.json` loads every
lesson and reports:

- **Problems** (red): things written wrongly, with the line number. A choice
  question with no right answer, a card with no answer, a lesson file that is
  listed but missing, an unknown question type.
- **Suggestions** (grey): things that work but are probably slips. A question
  with no explanation, a word that appears in two lessons, a lesson with
  nothing to practise.

A course with problems still opens. The broken lesson shows a notice listing
them, so you can see the fault next to the content.

## What's saved, and where

Everything is kept in the browser's `localStorage`. Nothing is sent anywhere.

| Key | Holds |
|-----|-------|
| `kit.<course id>` | Which lessons are finished, and the best score for each |
| `kk.review.v1` | Every flashcard on the site and its review schedule |

The Review page can download all of the site's saved progress as one file and
restore it later, on this device or another.

## Sending flashcards from any other page

A page that isn't built with the kit can still add cards. Load
`/shared/review.js` and call:

```js
Review.add(
  [{ id: "my-page:fact-1", front: "Question", back: "Answer" }],
  { id: "my-page", title: "My Page", url: "/projects/my-page/" }
);
```

Card ids must be unique and stable: adding a card whose id already exists
updates its text and leaves its schedule alone. Breach, Quarry and Datum use
this to add a card each time a challenge is solved.

## How the pieces fit

| File | Job |
|------|-----|
| `kit/kit.js` | Reads `course.json` and the lesson files, draws every screen, saves progress |
| `kit/kit.css` | All the styling. Colours are variables at the top |
| `kit/check.html` | The checker |
| `kit/template/` | The starter course |
| `shared/review.js` | The flashcard store and scheduler, used by every course |
| `projects/review/` | The Review page, and backup and restore |

`kit.js` is commented in four parts: text formatting, the lesson parser,
loading and progress, and the screens. To add a new question type, add a
branch for it in `parseQuestion` and a matching entry in `WIDGETS`.
