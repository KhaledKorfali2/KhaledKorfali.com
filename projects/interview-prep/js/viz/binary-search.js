import { arrayView, stats, parseNumbers, parseNumber } from "./kit.js";

// Lower bound / Search Insert Position: the first index whose value is ≥ target.
// The answer always lies in [lo, hi]; each comparison throws half of it away.
export default {
  id: "binary-search",
  title: "Search insert position (lower bound)",
  blurb: "Keep the answer inside [lo, hi] and halve that range with every comparison.",
  inputs: [
    { key: "nums", label: "nums (sorted for you if needed)", default: "1, 3, 5, 6, 8, 10, 13, 17", hint: "−99…99, up to 9 values", wide: true },
    { key: "target", label: "target", default: "7", numeric: true },
  ],
  presets: [
    { label: "Insert between", values: { nums: "1, 3, 5, 6, 8, 10, 13, 17", target: "7" } },
    { label: "Duplicates", values: { nums: "2, 4, 4, 4, 4, 7, 9", target: "4" } },
    { label: "Past the end", values: { nums: "1, 2, 3", target: "10" } },
  ],
  parse(v) {
    const raw = parseNumbers(v.nums, { min: -99, max: 99, maxLen: 9, label: "nums" });
    const target = parseNumber(v.target, { min: -999, max: 999, label: "target" });
    const nums = [...raw].sort((a, b) => a - b);
    return { nums, target, sortedNow: raw.some((x, i) => x !== nums[i]) };
  },
  code: [
    "lo, hi = 0, len(nums)",
    "while lo < hi:",
    "    mid = (lo + hi) // 2",
    "    if nums[mid] < target:",
    "        lo = mid + 1",
    "    else:",
    "        hi = mid",
    "return lo",
  ],
  steps({ nums, target, sortedNow }) {
    const s = [];
    let lo = 0, hi = nums.length, it = 0;
    const snap = (o) => s.push({ lo, hi, mid: -1, it, ...o });
    snap({ line: 0, msg: `${sortedNow ? "Input sorted first. " : ""}The insert position can be anywhere from 0 to ${nums.length} (after the last value), so lo = 0, hi = ${nums.length}.` });
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      it++;
      snap({ line: [1, 2], mid, msg: `Range [${lo}, ${hi}] still has ${hi - lo + 1} candidate slots. Check the middle: mid = ${mid}.` });
      if (nums[mid] < target) {
        snap({ line: 3, mid, small: true, msg: `nums[${mid}] = ${nums[mid]} < ${target}: the answer must be to the right of mid.` });
        lo = mid + 1;
        snap({ line: 4, mid, msg: `lo = ${lo}. Indices ${mid === 0 ? "0" : `0..${mid}`} are discarded.` });
      } else {
        snap({ line: [3, 5], mid, big: true, msg: `nums[${mid}] = ${nums[mid]} ≥ ${target}: mid could be the answer, but maybe something further left is too.` });
        hi = mid;
        snap({ line: 6, mid, msg: `hi = ${hi}. Everything right of ${mid} is discarded.` });
      }
    }
    const found = lo < nums.length && nums[lo] === target;
    snap({ line: 7, done: true, answer: lo, msg: found
      ? `lo = hi = ${lo}: target ${target} is at index ${lo} (its first occurrence). ${it} comparison${it === 1 ? "" : "s"} → O(log n).`
      : lo === nums.length
        ? `lo = hi = ${lo}: every value is smaller, so ${target} goes at the end. ${it} comparison${it === 1 ? "" : "s"} → O(log n).`
        : `lo = hi = ${lo}: ${target} isn't present; insert it before nums[${lo}] = ${nums[lo]}. ${it} comparisons → O(log n).` });
    return s;
  },
  render(st, { nums, target }) {
    const vals = [...nums, "end"];
    const arr = arrayView(vals, {
      states: (i) => {
        if (st.done) return [i === st.answer ? (nums[i] === target ? "good" : "path") : "dim"];
        if (i < st.lo || i > st.hi) return ["dim"];
        if (i === st.mid) return [st.small ? "bad" : st.big ? "good" : "active"];
        return ["window"];
      },
      pointers: (i) => st.done
        ? (i === st.answer ? ["ans"] : [])
        : [i === st.lo && "lo", i === st.mid && "mid", i === st.hi && "hi"].filter(Boolean),
    });
    return `<div class="vz-binary-search-arr vz-binary-search-fit">${arr}</div>` + stats([
      ["target", target],
      ["range", st.done ? `[${st.lo}]` : `[${st.lo}, ${st.hi}]`],
      ["checks", st.it],
      ...(st.done ? [["insert at", st.answer, ["good"]]] : []),
    ]);
  },
  legend: [["window", "answer still possible"], ["active", "mid"], ["bad", "mid too small"], ["good", "mid ≥ target"], ["dim", "discarded"]],
  css: `
.vz-binary-search-fit { width: 100%; display: flex; flex-direction: column; align-items: center; }
.vz-binary-search-fit .vz-array { flex-wrap: nowrap; width: 100%; }
.vz-binary-search-fit .vz-col { flex: 0 1 var(--cell); min-width: 0; }
.vz-binary-search-fit .vz-cell { min-width: 0; width: 100%; padding: 0; }
@media (max-width: 600px) { .vz-binary-search-fit .vz-array { gap: 3px; } .vz-binary-search-fit .vz-cell { font-size: 12.5px; } }
.vz-binary-search-arr .vz-col:last-child .vz-cell { border-style: dashed; font-size: 11px; color: var(--text-3); font-weight: 500; }
.vz-binary-search-arr .vz-col:last-child .vz-cell.is-path { color: var(--accent); }`,
};
