import { chips, stats, parsePairs, esc, InputError } from "./kit.js";

// Merge Intervals: after sorting by start, an interval can only overlap the block
// we're currently building (the last merged one), so one comparison decides it.
const COLORS = ["c0", "c3", "c2", "c4", "c5"]; // c1 is skipped: it matches the "current" highlight

export default {
  id: "intervals",
  title: "Merge overlapping intervals",
  blurb: "Sort by start, then either stretch the last merged block or start a new one.",
  inputs: [
    { key: "iv", label: "intervals (start-end)", default: "8-10, 1-3, 2-6, 15-18, 17-20", hint: "0–30, up to 8, e.g. 1-3, 2-6", wide: true },
  ],
  presets: [
    { label: "Example", values: { iv: "8-10, 1-3, 2-6, 15-18, 17-20" } },
    { label: "Touching & nested", values: { iv: "1-4, 4-5, 2-3, 7-12, 8-9, 13-13" } },
    { label: "No overlaps", values: { iv: "9-11, 0-2, 5-7, 3-4" } },
  ],
  parse(v) {
    const iv = parsePairs(v.iv, { maxLen: 8, min: 0, max: 30, label: "intervals" });
    if (!iv.length) throw new InputError("Enter at least one interval, e.g. 1-3.");
    const bad = iv.find(([a, b]) => a > b);
    if (bad) throw new InputError(`intervals: ${bad[0]}-${bad[1]} ends before it starts.`);
    return { iv };
  },
  code: [
    "intervals.sort()  # by start",
    "out = []",
    "for s, e in intervals:",
    "    if out and s <= out[-1][1]:",
    "        last = out[-1]",
    "        last[1] = max(last[1], e)",
    "    else:",
    "        out.append([s, e])",
    "return out",
  ],
  steps({ iv }) {
    const sorted = iv.map((x, i) => ({ s: x[0], e: x[1], orig: i })).sort((a, b) => a.s - b.s || a.orig - b.orig);
    const merged = [];
    const group = []; // group[j] = merged block index of sorted interval j
    const s = [];
    const snap = (o) => s.push({ merged: merged.map((m) => [...m]), group: [...group], j: -1, ...o });
    const moved = sorted.some((x, i) => x.orig !== i);
    snap({ line: [0, 1], msg: moved
      ? `Sort by start: ${sorted.map((x) => `[${x.s},${x.e}]`).join(" ")}. Now overlaps can only happen with the block just before.`
      : "Already sorted by start, so any overlap is with the block right before. Start with no merged blocks." });
    sorted.forEach(({ s: a, e: b }, j) => {
      const last = merged[merged.length - 1];
      if (last && a <= last[1]) {
        snap({ line: 3, j, mark: last[1], overlap: true, msg: `[${a},${b}] starts at ${a} ≤ ${last[1]}, the end of the current block — they overlap.` });
        const grew = b > last[1];
        last[1] = Math.max(last[1], b);
        group.push(merged.length - 1);
        snap({ line: [4, 5], j, mark: last[1], grew, msg: grew
          ? `Extend the block to [${last[0]},${last[1]}].`
          : `${b} ≤ ${last[1]}: it lies inside the block, which stays [${last[0]},${last[1]}].` });
      } else {
        snap({ line: last ? [3, 6] : 3, j, mark: last ? last[1] : undefined, gap: true, msg: last
          ? `[${a},${b}] starts at ${a} > ${last[1]}: there's a gap, so the current block is finished.`
          : `No blocks yet, so [${a},${b}] starts the first one.` });
        merged.push([a, b]);
        group.push(merged.length - 1);
        snap({ line: 7, j, fresh: true, msg: `Start a new block [${a},${b}].` });
      }
    });
    snap({ line: 8, done: true, answer: merged.map((m) => [...m]), msg: `${merged.length} merged interval${merged.length === 1 ? "" : "s"}: ${merged.map((m) => `[${m[0]},${m[1]}]`).join(" ")}. Sorting dominates → O(n log n).` });
    return Object.assign(s, { sorted });
  },
  render(st, { iv }) {
    const sorted = iv.map((x, i) => ({ s: x[0], e: x[1], orig: i })).sort((a, b) => a.s - b.s || a.orig - b.orig);
    let lo = Math.min(...sorted.map((x) => x.s)), hi = Math.max(...sorted.map((x) => x.e));
    if (hi - lo < 4) { hi = lo + 4; }
    const step = [1, 2, 5, 10].find((t) => (hi - lo) / t <= 8) || 10;
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const X = (v) => ((v - lo) / (hi - lo)) * 100;
    const bar = (a, b, states, text, extra = "") =>
      `<div class="vz-chip vz-intervals-bar ${states.filter(Boolean).map((x) => "is-" + x).join(" ")} ${extra}" style="left:${X(a)}%;width:${X(b) - X(a)}%"><span>${esc(text)}</span></div>`;

    let grid = "";
    for (let t = lo; t <= hi; t += step) grid += `<div class="vz-intervals-grid" style="left:${X(t)}%"></div>`;
    const marker = st.mark !== undefined && !st.done
      ? `<div class="vz-intervals-mark" style="left:${X(st.mark)}%"><span>end ${st.mark}</span></div>` : "";

    const lanes = sorted.map((x, j) => {
      const g = st.group[j];
      const states = [];
      if (g !== undefined) states.push(COLORS[g % COLORS.length]);
      if (j === st.j && !st.done) states.push("active");
      const extra = g === undefined && j !== st.j ? "is-todo" : "";
      return `<div class="vz-intervals-lane">${bar(x.s, x.e, states, `${x.s}–${x.e}`, extra)}</div>`;
    }).join("");
    const lastIdx = st.merged.length - 1;
    const mergedLane = `<div class="vz-intervals-lane vz-intervals-mlane">${st.merged.map((m, g) =>
      bar(m[0], m[1], [COLORS[g % COLORS.length], g === lastIdx && !st.done && (st.overlap || st.grew !== undefined || st.fresh || st.gap) ? "active" : ""], `${m[0]}–${m[1]}`)).join("")}</div>`;
    let axis = "";
    for (let t = lo; t <= hi; t += step) axis += `<span style="left:${X(t)}%">${t}</span>`;

    const plot = `<div class="vz-intervals">
      <div class="vz-label">input, sorted by start</div>
      <div class="vz-intervals-plot">${grid}${marker}${lanes}
        <div class="vz-intervals-sep"><span class="vz-label">merged</span></div>
        ${mergedLane}
        <div class="vz-intervals-axis">${axis}</div>
      </div></div>`;
    return plot + `<div class="vz-row">` +
      chips("merged", st.merged.map((m, g) => ({ text: `[${m[0]}, ${m[1]}]`, states: [COLORS[g % COLORS.length]] })), { empty: "[ ]" }) +
      stats([["blocks", st.merged.length, st.done ? ["good"] : []]]) + `</div>`;
  },
  legend: [["active", "current interval / block"], ["c0", "merged block colour"]],
  css: `
.vz-intervals { width: 100%; max-width: 620px; }
.vz-intervals-plot { position: relative; margin: 0 14px; padding-bottom: 22px; }
.vz-intervals-grid { position: absolute; top: 0; bottom: 18px; width: 0; border-left: 1px dashed var(--line); }
.vz-intervals-mark { position: absolute; top: -4px; bottom: 18px; width: 0; border-left: 2px solid var(--accent); z-index: 0; pointer-events: none; }
.vz-intervals-mark span { position: absolute; bottom: -2px; left: 4px; font: 700 10px/1 var(--mono); color: var(--accent); background: var(--panel-2); padding: 2px 3px; border-radius: 3px; white-space: nowrap; }
.vz-intervals-lane { position: relative; height: 26px; margin-bottom: 5px; }
.vz-intervals .vz-intervals-bar { position: absolute; top: 0; height: 26px; min-width: 6px; padding: 0; border-radius: 6px; display: flex; align-items: center; overflow: visible; z-index: 1; }
.vz-intervals .vz-intervals-bar span { padding-left: 6px; font: 600 11.5px/1 var(--mono); white-space: nowrap; color: var(--text); }
.vz-intervals .vz-intervals-bar.is-todo { background: var(--panel); border-style: dashed; }
.vz-intervals .vz-intervals-bar.is-todo span { color: var(--text-3); }
.vz-intervals-sep { position: relative; z-index: 1; border-top: 1px solid var(--line-2); margin: 10px 0 8px; padding-top: 8px; }
.vz-intervals-sep .vz-label { margin: 0; background: var(--panel-2); padding-right: 6px; }
.vz-intervals-axis { position: absolute; left: 0; right: 0; bottom: 0; height: 14px; }
.vz-intervals-axis span { position: absolute; transform: translateX(-50%); font: 500 10px/1 var(--mono); color: var(--text-3); }
@media (max-width: 600px) {
  .vz-intervals-plot { margin: 0 8px; }
  .vz-intervals .vz-intervals-bar span { font-size: 10px; padding-left: 3px; }
}`,
};
