import { esc, chips, stats, parseNumbers, InputError } from "./kit.js";

// Node ids are bit-strings of decisions: "" root, "1" = took nums[0], "10" = took nums[0], skipped nums[1] …
const fmtSet = (arr) => `[${arr.join(",")}]`;

function treeSvg(n, nums, st) {
  const leaves = 1 << n;
  const gapY = n === 4 ? 6.4 : n === 3 ? 9 : 12;
  const height = leaves * gapY + 2;
  const colX = (d) => 5 + d * (n === 4 ? 64 : 56) / n;
  const r = n === 4 ? 2.5 : 3.2;
  // leaf index range of a node → its y is the middle of its leaves
  const pos = (id) => {
    const d = id.length;
    let lo = 0;
    for (let i = 0; i < d; i++) if (id[i] === "0") lo += 1 << (n - i - 1);
    const span = 1 << (n - d);
    return { x: colX(d), y: 3 + (lo + (span - 1) / 2) * gapY };
  };
  const ids = [];
  const walk = (id) => { ids.push(id); if (id.length < n) { walk(id + "1"); walk(id + "0"); } };
  walk("");
  const onPath = (id) => st.node !== undefined && st.node.startsWith(id);
  let svg = `<svg class="vz-graph vz-backtracking-svg vz-backtracking-n${n}" viewBox="-2 -2 104 ${height + 4}" role="img" aria-label="decision tree">`;
  // column headers: which number is being decided
  for (let d = 0; d < n; d++) {
    svg += `<text class="vz-backtracking-head" x="${(colX(d) + colX(d + 1)) / 2}" y="0.6">${esc(nums[d])}?</text>`;
  }
  for (const id of ids) {
    if (!id) continue;
    const parent = id.slice(0, -1);
    const a = pos(parent), b = pos(id);
    const take = id.endsWith("1");
    const seen = st.seen.has(id);
    const states = onPath(id) ? ["path"] : seen ? [take ? "good" : "visited"] : ["dim"];
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    svg += `<line class="vz-edge ${states.map((s) => "is-" + s).join(" ")}${take ? "" : " vz-backtracking-skip"}" x1="${a.x + (dx / L) * r}" y1="${a.y + (dy / L) * r}" x2="${b.x - (dx / L) * r}" y2="${b.y - (dy / L) * r}"/>`;
    if (take && (n < 4 || id.length < n)) {
      svg += `<text class="vz-elabel ${states.map((s) => "is-" + s).join(" ")} vz-backtracking-el" x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 1.6}">+${esc(nums[id.length - 1])}</text>`;
    }
  }
  for (const id of ids) {
    const p = pos(id);
    const leaf = id.length === n;
    let state = "dim";
    if (id === st.node) state = "active";
    else if (onPath(id)) state = "path";
    else if (leaf && st.recorded.has(id)) state = "good";
    else if (st.seen.has(id) || id === "") state = "visited";
    svg += `<g class="vz-node is-${state}"><circle cx="${p.x}" cy="${p.y}" r="${r}"/></g>`;
    if (leaf) {
      const set = [...id].map((b, i) => (b === "1" ? nums[i] : null)).filter((x) => x !== null);
      svg += `<text class="vz-backtracking-leaf${st.recorded.has(id) ? " is-on" : ""}" x="${p.x + r + 2}" y="${p.y}">${esc(fmtSet(set))}</text>`;
    }
  }
  return `<div class="vz-label">decision tree (↗ take, ↘ skip)</div><div class="vz-graph-wrap vz-backtracking-wrap vz-backtracking-w${n}">${svg}</svg></div>`;
}

// Subsets via include / exclude backtracking.
export default {
  id: "backtracking",
  title: "Subsets — explore every take / skip decision",
  blurb: "At each number choose take or skip, recurse, then undo the choice; each leaf of the decision tree is one subset.",
  inputs: [
    { key: "nums", label: "nums (distinct)", default: "1, 2, 3", hint: "1–4 distinct values, −9..9", wide: true },
  ],
  presets: [
    { label: "Three numbers", values: { nums: "1, 2, 3" } },
    { label: "Four (16 subsets)", values: { nums: "1, 2, 3, 4" } },
    { label: "One number", values: { nums: "7" } },
  ],
  parse(v) {
    const nums = parseNumbers(v.nums, { min: -9, max: 9, minLen: 1, maxLen: 4, label: "nums" });
    if (new Set(nums).size !== nums.length) throw new InputError("nums: values must be distinct (duplicates need the Subsets II variant).");
    return { nums };
  },
  code: [
    "def backtrack(i, path):",
    "    if i == len(nums):",
    "        result.append(path[:])",
    "        return",
    "    path.append(nums[i])  # take",
    "    backtrack(i + 1, path)",
    "    path.pop()            # undo",
    "    backtrack(i + 1, path)  # skip",
    "backtrack(0, [])",
    "return result",
  ],
  steps({ nums }) {
    const n = nums.length;
    const result = [], recorded = [], seen = new Set();
    const path = [];
    const s = [];
    const snap = (o) => s.push({ path: [...path], result: result.map((r) => [...r]), recorded: new Set(recorded), seen: new Set(seen), ...o });
    snap({ node: "", line: 8, msg: `Start at the root with an empty path; we'll decide on ${fmtSet(nums)} one number at a time.` });
    const bt = (i, id) => {
      seen.add(id);
      if (i === n) {
        result.push([...path]); recorded.push(id);
        snap({ node: id, line: [1, 2, 3], msg: `All ${n} decided → record ${fmtSet(path)} (subset #${result.length}) and return.` });
        return;
      }
      path.push(nums[i]);
      snap({ node: id + "1", line: [4, 5], msg: `Take ${nums[i]} → path ${fmtSet(path)}; go decide ${i + 1 < n ? nums[i + 1] : "nothing more"}.` });
      bt(i + 1, id + "1");
      path.pop();
      snap({ node: id, line: 6, msg: `Back at this choice: undo — pop ${nums[i]} → path ${fmtSet(path)}.` });
      snap({ node: id + "0", line: 7, msg: `Skip ${nums[i]} → path stays ${fmtSet(path)}.` });
      bt(i + 1, id + "0");
    };
    bt(0, "");
    snap({ line: 9, done: true, answer: result.map((r) => [...r]), msg: `Done: ${result.length} = 2^${n} subsets. Every element is a take/skip choice, so the tree has 2^n leaves → O(n · 2^n).` });
    return s;
  },
  render(st, { nums }) {
    const n = nums.length;
    return treeSvg(n, nums, st) +
      `<div class="vz-row">` +
      chips("path", st.done ? [] : st.path.map((x) => ({ text: String(x), states: ["path"] })), { empty: "[ ]" }) +
      stats([["subsets", `${st.result.length}/${1 << n}`, st.done ? ["good"] : []]]) + `</div>` +
      chips("result", st.result.map((r, i) => ({ text: fmtSet(r), states: [i === st.result.length - 1 && !st.done ? "active" : "good"] })));
  },
  legend: [["active", "current call"], ["path", "current path"], ["good", "take / recorded"], ["visited", "skip / explored"], ["dim", "not explored yet"]],
  css: `
.vz-backtracking-wrap { max-width: 500px; }
.vz-backtracking-wrap.vz-backtracking-w4 { max-width: 400px; }
.vz-backtracking-svg .vz-backtracking-skip { stroke-dasharray: 1.4 1; }
.vz-backtracking-svg .vz-edge.is-path { stroke-dasharray: none; }
.vz-backtracking-head { font: 600 4px var(--mono); fill: var(--text-3); text-anchor: middle; }
.vz-backtracking-el { font-size: 3.8px; }
.vz-backtracking-n4 .vz-backtracking-leaf { font-size: 3.5px; }
.vz-backtracking-n4 .vz-backtracking-el { font-size: 3.2px; }
.vz-backtracking-leaf { font: 500 4.2px var(--mono); fill: var(--text-3); dominant-baseline: central; opacity: .55; }
.vz-backtracking-leaf.is-on { fill: var(--good); opacity: 1; font-weight: 600; }
`,
};
