import { arrayView, stats, parseNumbers, parseNumber } from "./kit.js";

// Pair with target sum in a sorted array: the sum is too small → only moving
// lo right can raise it; too big → only moving hi left can lower it.
export default {
  id: "two-pointers",
  title: "Pair with target sum in a sorted array",
  blurb: "Start at both ends; the comparison with the target tells you which pointer may move.",
  inputs: [
    { key: "nums", label: "nums (sorted for you if needed)", default: "2, 3, 5, 7, 8, 11, 13, 16", hint: "−99…99, up to 10 values", wide: true },
    { key: "target", label: "target", default: "20", numeric: true },
  ],
  presets: [
    { label: "Example", values: { nums: "2, 3, 5, 7, 8, 11, 13, 16", target: "20" } },
    { label: "Unsorted input", values: { nums: "9, 2, 7, 4, 1, 12", target: "13" } },
    { label: "No pair", values: { nums: "2, 4, 6, 8, 10", target: "7" } },
  ],
  parse(v) {
    const raw = parseNumbers(v.nums, { min: -99, max: 99, maxLen: 10, label: "nums" });
    const target = parseNumber(v.target, { min: -198, max: 198, label: "target" });
    const nums = [...raw].sort((a, b) => a - b);
    const sortedNow = raw.some((x, i) => x !== nums[i]);
    return { nums, target, sortedNow };
  },
  code: [
    "lo, hi = 0, len(nums) - 1",
    "while lo < hi:",
    "    s = nums[lo] + nums[hi]",
    "    if s == target:",
    "        return [lo, hi]",
    "    elif s < target:",
    "        lo += 1  # need bigger",
    "    else:",
    "        hi -= 1  # need smaller",
    "return None",
  ],
  steps({ nums, target, sortedNow }) {
    const s = [];
    let lo = 0, hi = nums.length - 1;
    const snap = (o) => s.push({ lo, hi, sum: null, ...o });
    snap({ line: 0, msg: `${sortedNow ? "The input was sorted first (the trick needs sorted order). " : ""}Put lo at the smallest value and hi at the largest.` });
    while (lo < hi) {
      const sum = nums[lo] + nums[hi];
      if (sum === target) {
        snap({ line: [2, 3], sum, hit: true, msg: `${nums[lo]} + ${nums[hi]} = ${sum} — equals the target!` });
        snap({ line: 4, sum, hit: true, done: true, answer: [lo, hi],
          msg: `Answer: indices [${lo}, ${hi}] (${nums[lo]} + ${nums[hi]} = ${target}). Each step discards a value for good → O(n).` });
        return s;
      }
      if (sum < target) {
        snap({ line: [2, 5], sum, low: true, msg: `${nums[lo]} + ${nums[hi]} = ${sum} < ${target}. ${nums[lo]} can't reach ${target} even with the largest partner left, so drop it.` });
        lo++;
        snap({ line: 6, msg: lo < hi ? `lo moves right to index ${lo} (value ${nums[lo]}).` : `lo moves to ${lo} and meets hi — no candidates left.` });
      } else {
        snap({ line: [2, 7], sum, high: true, msg: `${nums[lo]} + ${nums[hi]} = ${sum} > ${target}. ${nums[hi]} overshoots even with the smallest partner left, so drop it.` });
        hi--;
        snap({ line: 8, msg: lo < hi ? `hi moves left to index ${hi} (value ${nums[hi]}).` : `hi moves to ${hi} and meets lo — no candidates left.` });
      }
    }
    snap({ line: 9, done: true, answer: null, msg: `No pair sums to ${target}. The pointers swept the array once → O(n), no extra space.` });
    return s;
  },
  render(st, { nums, target, sortedNow }) {
    const ans = st.answer;
    const arr = arrayView(nums, {
      states: (i) => {
        if (st.done) return ans ? [ans.includes(i) ? "good" : "dim"] : ["dim"];
        if (i < st.lo || i > st.hi) return ["dim"];
        if (i === st.lo || i === st.hi) return [st.hit ? "good" : st.low && i === st.lo ? "bad" : st.high && i === st.hi ? "bad" : "active"];
        return ["window"];
      },
      pointers: (i) => (st.done && !ans ? [] : [i === st.lo && "lo", i === st.hi && "hi"].filter(Boolean)),
    });
    const cmp = st.sum === null ? "—" : st.sum === target ? `${st.sum} =` : st.sum < target ? `${st.sum} <` : `${st.sum} >`;
    return (sortedNow ? `<div class="vz-two-pointers-note">Sorted from your input</div>` : "") + `<div class="vz-two-pointers-fit">${arr}</div>` + stats([
      ["lo + hi", cmp, st.hit ? ["good"] : st.sum !== null ? ["bad"] : []],
      ["target", target],
      ...(st.done ? [["answer", ans ? `[${ans.join(", ")}]` : "None", ans ? ["good"] : ["bad"]]] : []),
    ]);
  },
  legend: [["window", "still possible"], ["active", "lo / hi"], ["bad", "ruled out next"], ["dim", "discarded"], ["good", "pair"]],
  css: `
.vz-two-pointers-fit { width: 100%; display: flex; flex-direction: column; align-items: center; }
.vz-two-pointers-fit .vz-array { flex-wrap: nowrap; width: 100%; }
.vz-two-pointers-fit .vz-col { flex: 0 1 var(--cell); min-width: 0; }
.vz-two-pointers-fit .vz-cell { min-width: 0; width: 100%; padding: 0; }
@media (max-width: 600px) { .vz-two-pointers-fit .vz-array { gap: 3px; } .vz-two-pointers-fit .vz-cell { font-size: 12.5px; } }.vz-two-pointers-note { font-size: 12px; color: var(--text-3); margin-bottom: -6px; }`,
};
