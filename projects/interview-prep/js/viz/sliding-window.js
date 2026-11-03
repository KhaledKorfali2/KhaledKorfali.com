import { arrayView, stats, parseNumbers, parseNumber, InputError } from "./kit.js";

// Longest subarray whose sum stays within a limit (non-negative values, so
// shrinking from the left always lowers the sum — the variable-window invariant).
export default {
  id: "sliding-window",
  title: "Longest subarray with sum ≤ limit",
  blurb: "Grow the window on the right; shrink from the left only while it breaks the rule.",
  inputs: [
    { key: "nums", label: "nums", default: "2, 1, 5, 1, 3, 2", hint: "0–99, up to 12 values", wide: true },
    { key: "limit", label: "limit", default: "7", numeric: true },
  ],
  presets: [
    { label: "Example", values: { nums: "2, 1, 5, 1, 3, 2", limit: "7" } },
    { label: "Many shrinks", values: { nums: "4, 2, 2, 7, 8, 1, 2, 8, 1", limit: "8" } },
    { label: "Fits entirely", values: { nums: "1, 1, 1, 1", limit: "10" } },
  ],
  parse(v) {
    const nums = parseNumbers(v.nums, { min: 0, max: 99, label: "nums" });
    const limit = parseNumber(v.limit, { min: 0, max: 999, label: "limit" });
    return { nums, limit };
  },
  code: [
    "left = 0; total = 0; best = 0",
    "for right in range(len(nums)):",
    "    total += nums[right]",
    "    while total > limit:",
    "        total -= nums[left]",
    "        left += 1",
    "    best = max(best, right - left + 1)",
    "return best",
  ],
  steps({ nums, limit }) {
    const s = [];
    let left = 0, total = 0, best = 0, bestL = 0, bestR = -1;
    const snap = (o) => s.push({ left, total, best, bestL, bestR, ...o });
    snap({ line: 0, right: -1, msg: "Start with an empty window: left = 0, total = 0." });
    for (let right = 0; right < nums.length; right++) {
      total += nums[right];
      snap({ line: 2, right, msg: `Add nums[${right}] = ${nums[right]} → total = ${total}.` });
      while (total > limit) {
        snap({ line: 3, right, bad: true, msg: `total ${total} > ${limit}: the window is invalid, shrink it.` });
        total -= nums[left];
        left++;
        snap({ line: [4, 5], right, msg: `Drop nums[${left - 1}] = ${nums[left - 1]} → total = ${total}, left = ${left}.` });
      }
      const len = right - left + 1;
      if (len > best) { best = len; bestL = left; bestR = right; }
      snap({ line: 6, right, msg: len === best && bestR === right
        ? `Window [${left}..${right}] has length ${len} — new best.`
        : `Window [${left}..${right}] has length ${len}; best stays ${best}.` });
    }
    snap({ line: 7, right: nums.length - 1, done: true, msg: best
      ? `Done in one pass: the longest valid window is [${bestL}..${bestR}], length ${best}.`
      : `Done: every value is larger than ${limit}, so no window fits.` });
    return s;
  },
  render(st, { nums, limit }) {
    const inWin = (i) => !st.done && i >= st.left && i <= st.right;
    return arrayView(nums, {
      states: (i) => st.done
        ? [i >= st.bestL && i <= st.bestR ? "good" : "dim"]
        : [inWin(i) && (st.bad ? "bad" : "window"), i === st.right && "active"],
      pointers: (i) => st.done ? [] : [i === st.left && st.left <= st.right && "L", i === st.right && "R"].filter(Boolean),
    }) + stats([
      ["window sum", st.done ? "—" : st.total, st.bad ? ["bad"] : []],
      ["limit", limit],
      ["best length", st.best, st.done ? ["good"] : []],
    ]);
  },
  legend: [["window", "current window"], ["active", "right pointer"], ["bad", "over the limit"], ["good", "best window"]],
};
