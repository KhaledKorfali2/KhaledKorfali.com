# Adding challenges to Breach

Breach is a set of **tracks**, each a list of **challenges**. A challenge gives
the learner a simulated target, and they extract a flag from it. This guide
covers adding a challenge or a track by hand.

## Ground rules

These shaped the whole course. Keep to them.

- **Analysis and defence only.** Challenges teach by reading, identifying and
  preventing: find the leaked secret, spot the flaw in the code, trace the
  attacker in the log. They don't teach building working exploits against real
  systems.
- **Every target is simulated and read-only.** Nothing talks to the network.
  The page's Content-Security-Policy has `connect-src 'none'`.
- **Untrusted HTML only ever renders inside the sandbox frame** (`js/engines/sandbox.js`),
  which has its own origin and policy. The app itself treats all input as text.
- **End each challenge with the defender's view.** The `debrief` says how the
  problem is prevented or detected in practice.

## Where things are

| Path | What it holds |
|------|---------------|
| `js/challenges/<track>.js` | One file per track, exporting an array of challenges |
| `js/challenges/index.js` | The list of tracks, in order |
| `js/flags.js` | Per-learner flags, from a seed stored in the browser |
| `js/store.js` | Saved progress (`localStorage` key `breach.v1`) |
| `js/main.js` | Screens, and `submit()`, which checks an answer |

## A challenge

Copy the nearest existing challenge and change it. The fields:

```js
{
  id: "web-my-challenge",          // unique, never changes once published
  title: "A Short Title",
  level: 1,                        // 1 (easiest) to 4
  slug: "words_for_the_flag",      // goes inside the flag text
  time: 5,                         // minutes, roughly
  certs: ["Security+"],            // certifications it maps to
  objective: "One sentence: what to find.",
  lesson: `Markdown teaching text.`,
  hints: ["A nudge.", "A stronger nudge.", "Nearly the answer."],
  workspace: { type: "browser" },  // or "files", "pcap", "sql", …
  setup(ctx) { return { /* the simulated target, containing ctx.flag */ }; },
  debrief: `What happened, and how defenders stop it.`,
}
```

Optional: `check(value, ctx, env)` for answers that aren't the flag itself,
with `answerLabel` and `answerPlaceholder` for the input box.

Look at an existing challenge with the same `workspace.type` to see what
`setup` must return for it.

## Things that will catch you out

- **Lessons are JavaScript template literals.** A backtick inside one ends the
  string. Escape code fences and inline code as the existing lessons do.
- **`ctx` is created once and shared.** If `check()` needs a value that
  `setup()` generated, store it on what `setup` returns and read it from `env`.
  Don't call `ctx.rng` again in `check`: it won't produce the same numbers.
- **Flags differ per learner.** Always put `ctx.flag` into the target. Never
  hard-code a flag.
- **`id` is permanent.** Progress and review cards are stored under it.
- Unlocking is in order within a track, so put a new challenge where its
  difficulty fits.

## Adding a track

1. Create `js/challenges/<name>.js` that default-exports an array of challenges.
2. In `js/challenges/index.js`, import it and add an entry to `TRACKS`:
   `{ id, title, icon, blurb, list }`.

## Testing

There is no automated suite for Breach, so play each new challenge through:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/projects/breach/`, then for each new challenge:

1. Solve it as a learner would, using only what the lesson teaches.
2. Check that each hint helps without giving the next step away.
3. Reset progress (which changes your flags) and solve it again, to confirm
   nothing depends on one particular seed.
4. Keep the browser console open. The strict security policy reports anything
   it blocks there.

## Review cards

When a challenge is solved, `remember()` at the bottom of `js/main.js` sends a
flashcard to the site's Review page: the title as the question and the start
of the `debrief` as the answer. So write the first paragraph of each debrief
as a summary that stands on its own.
