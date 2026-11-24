# Adding challenges to Datum

Datum shows the learner a target part and has them build a matching solid. A
challenge is mostly a description of that target as a list of features.

## Where things are

| Path | What it holds |
|------|---------------|
| `js/challenges/<track>.js` | One file per track, exporting an array of challenges |
| `js/challenges/parts.js` | Short helper functions for describing models |
| `js/challenges/index.js` | `TRACKS` in order, and `UPCOMING` for the roadmap |
| `js/cad/model.js` | Turns a feature list into a solid, and compares two solids |
| `test/run.mjs` | Builds every target on the real kernel |

## A challenge

```js
import { sk, rect, circle, ext } from "./parts.js";

{
  id: "c-my-part",                 // unique, never changes once published
  title: "A Short Title",
  level: 1, time: 8,               // level 1 (easiest) to 5; time in minutes
  slug: "words_for_the_flag",
  tags: ["extrude"],
  tools: ["sketch", "extrude"],    // feature tools the learner may use
  sketchTools: ["rect", "circle"], // shapes available in the sketcher
  objective: "One sentence: what to build.",
  lesson: `Teaching text.`,
  hints: ["A nudge.", "A stronger nudge.", "Nearly the answer."],   // exactly three
  target: [
    sk("s1", "XY", 0, rect(0, 0, 60, 40), circle(0, 0, 10)),
    ext("e1", "s1", 10),
  ],
  debrief: `What they learned and where it matters.`,
}
```

Optional: `starter`, a feature list the learner begins with, and `tol`, to
loosen the match for a hard part.

The learner passes when the volume that differs between their solid and the
target is no more than 0.1% of the target's volume.

## Describing a model

A model is a list of features in the order they are applied. `parts.js` has a
helper for each:

| Helper | Makes |
|--------|-------|
| `sk(id, plane, offset, ...shapes)` | A sketch on `"XY"`, `"XZ"` or `"YZ"`, offset from the origin |
| `rect`, `circle`, `poly`, `slot`, `path` | Shapes inside a sketch |
| `grid(shape, nx, ny, dx, dy)`, `polar(shape, n)` | A pattern of one shape |
| `ext(id, sketchId, distance, options)` | An extrude. Options include `mode: "cut"`, `sym`, `flip` |
| `rev(id, sketchId, options)` | A revolve |
| `fil`, `cham` | Fillet and chamfer, on listed edges or `"all"` |
| `shell(id, thickness, ...faces)` | Hollow the part, opening the listed faces |
| `mir(id, plane)` | Mirror |

Inside a sketch, a shape drawn within another becomes a hole, and shapes that
overlap merge into one outline.

## Things that will catch you out

- **Inline code is `~like this~` and code blocks use `~~~`**, because lessons
  sit inside JavaScript template literals.
- **The target may only use tools listed in `tools`.** Otherwise the learner
  can't build it. The tests check this.
- **Every feature id must be unique** within a model.
- **Each feature must matter.** The tests remove each one in turn and expect
  the match to fail. A feature that changes nothing, such as a fillet too
  small to measure, fails the test.
- **A `starter` must not already match the target.**
- **Use the plane names `"XY"`, `"XZ"`, `"YZ"`.** Names like "top" come out
  mirrored in the drawing views.
- **`id` is permanent.** Progress, saved models and review cards use it.

## Adding a track

Create `js/challenges/<name>.js`, import it in `index.js`, and add an entry to
`TRACKS`: `{ id, title, icon, blurb, list }`. If it was listed in `UPCOMING`,
remove it from there.

## Testing

Run from `projects/datum/` with Node.js:

```bash
node test/run.mjs
```

It loads the real CAD kernel and, for every challenge, checks the required
fields, unique ids, exactly three hints, that the target only uses its listed
tools, that the target builds and matches itself, that the starter doesn't
already match, that removing any one feature is detected, and that the views
and STL export work. It takes a little while because the kernel is large.

`test/e2e.js` solves every challenge through the real page in headless
Chrome. The instructions are at the top of that file.

Then open the challenge in the browser and build it yourself. The tests prove
the target is valid. Only doing it by hand shows whether the lesson and the
drawing give a learner enough to work from.

## Review cards

When a challenge is solved, `remember()` at the bottom of `js/main.js` sends a
flashcard to the site's Review page: the title as the question and the start
of the `debrief` as the answer. Write the first paragraph of each debrief as a
summary that stands on its own.
