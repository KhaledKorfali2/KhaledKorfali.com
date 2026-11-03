# Visualisers

One ES module per pattern (`<pattern-id>.js`) exporting a spec object as `default`.
`player.js` turns a spec into the interactive widget (input form, presets, transport,
keyboard, highlighted algorithm lines); `kit.js` has parsers and HTML/SVG views.
`sliding-window.js` and `dfs.js` are the reference implementations — copy their shape.

```js
export default {
  id: "two-pointers",                 // pattern id
  title: "Pair with target sum in a sorted array",   // what this demo solves (a real LeetCode-style task)
  blurb: "One sentence on the idea the animation shows.",
  inputs: [                           // raw string fields; keep to 1–3
    { key: "nums", label: "nums (sorted)", default: "1, 3, 4, 6, 9", hint: "up to 12 values", wide: true },
    { key: "target", label: "target", default: "10", numeric: true },
    // multiline: true, rows: 5  → textarea (grids, edge lists)
  ],
  presets: [{ label: "Found", values: { nums: "…", target: "…" } }, …],   // 2–3 interesting cases incl. an edge case
  parse(values) { … return input; },  // throw InputError (from kit) with a friendly message on bad input
  code: ["python-like pseudo-code lines", "    indented with 4 spaces"],   // ≤ 14 lines, readable
  steps(input) { return [{ line: 2, msg: "…", …state }]; },  // pure; line = index into code (or array of indices)
  render(step, input) { return htmlString; },               // build with kit views
  legend: [["active", "current"], ["window", "…"]],          // state → label, only states you use
  css: ".vz-xyz { … }",                                      // optional, scoped to classes prefixed .vz-<id>-
};
```

Rules
- Correctness first: the steps must be exactly what the shown code does, and the final message must state the
  correct answer. Write a node test that runs `steps()` on many random inputs and compares the final answer with an
  independent brute force.
- Every step's `msg` explains *why*, in plain language (≤ 2 short sentences). The first step says what we start
  with; the last says the result and, briefly, why the pattern is efficient.
- Keep inputs small and bounded (parse must reject inputs that would make > ~150 steps or overflow the stage).
- States available on cells/chips/nodes/edges: active, window, good, bad, visited, frontier, path, dim, water,
  c0–c5 (component colours). Don't invent colours; use these classes so light/dark themes work.
- Must look good at 360 px wide (stage is ~320 px there; `--cell` drops to 38 px) and at desktop width.
- Graphs/trees: `graphView` with `layoutTree` or explicit coordinates in a 0–100 × 0–height box.
- No external dependencies, no timers, no DOM access outside the returned HTML.
