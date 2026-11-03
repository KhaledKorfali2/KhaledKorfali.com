import { chips, stats, parseNumbers, parseNumber, esc, InputError } from "./kit.js";

// Subarray Sum Equals K: sum(nums[p..i]) = P[i+1] − P[p], so every earlier prefix
// equal to (prefix − k) ends a valid subarray here. A count map makes that O(1).
const MAX_MATCHES = 20;

function countSubarrays(nums, k) {
  const seen = new Map([[0, 1]]);
  let p = 0, c = 0;
  for (const x of nums) { p += x; c += seen.get(p - k) || 0; seen.set(p, (seen.get(p) || 0) + 1); }
  return c;
}

export default {
  id: "prefix-sum",
  title: "Count subarrays that sum to k",
  blurb: "A subarray sums to k exactly when an earlier prefix sum equals (current prefix − k).",
  inputs: [
    { key: "nums", label: "nums", default: "1, 2, 1, -1, 3, 1, 2", hint: "−9…9, up to 10 values", wide: true },
    { key: "k", label: "k", default: "3", numeric: true },
  ],
  presets: [
    { label: "Example", values: { nums: "1, 2, 1, -1, 3, 1, 2", k: "3" } },
    { label: "Zeros", values: { nums: "0, 0, 2, 0", k: "2" } },
    { label: "None", values: { nums: "4, -1, 6, 2", k: "1" } },
  ],
  parse(v) {
    const nums = parseNumbers(v.nums, { min: -9, max: 9, maxLen: 10, label: "nums" });
    const k = parseNumber(v.k, { min: -90, max: 90, label: "k" });
    if (countSubarrays(nums, k) > MAX_MATCHES) throw new InputError(`More than ${MAX_MATCHES} subarrays match — too many to animate. Try fewer zeros or a different k.`);
    return { nums, k };
  },
  code: [
    "count = prefix = 0",
    "seen = Counter({0: 1})",
    "for x in nums:",
    "    prefix += x",
    "    count += seen[prefix - k]",
    "    seen[prefix] += 1",
    "return count",
  ],
  steps({ nums, k }) {
    const s = [];
    const P = [0];
    const seen = new Map([[0, 1]]);
    let count = 0, prefix = 0;
    const snap = (o) => s.push({ seen: [...seen.entries()], count, prefix, upto: P.length - 1, i: -1, ...o });
    snap({ line: [0, 1], msg: `Start with prefix 0 already "seen" once — it stands for the empty prefix before nums[0].` });
    for (let i = 0; i < nums.length; i++) {
      prefix += nums[i];
      P.push(prefix);
      const need = prefix - k;
      snap({ line: [2, 3], i, msg: `Add nums[${i}] = ${nums[i]}: prefix = ${prefix}. We look for earlier prefixes equal to ${prefix} − ${k} = ${need}.` });
      const hits = [];
      for (let p = 0; p <= i; p++) if (P[p] === need) hits.push(p);
      if (!hits.length) snap({ line: 4, i, need, miss: true, msg: `${need} isn't in the map, so no subarray ending at index ${i} sums to ${k}.` });
      hits.forEach((p, n) => {
        count++;
        snap({ line: 4, i, need, from: p, msg: `Prefix ${need} was seen before index ${p}, so nums[${p}..${i}] sums to ${prefix} − ${need} = ${k}. count = ${count}${hits.length > 1 ? ` (match ${n + 1} of ${hits.length})` : ""}.` });
      });
      seen.set(prefix, (seen.get(prefix) || 0) + 1);
      snap({ line: 5, i, stored: prefix, msg: `Record prefix ${prefix} (now seen ×${seen.get(prefix)}) for later positions.` });
    }
    snap({ line: 6, done: true, answer: count, msg: `Done: ${count} subarray${count === 1 ? "" : "s"} sum${count === 1 ? "s" : ""} to ${k}. One pass with a hash map → O(n) instead of checking all O(n²) subarrays.` });
    return s;
  },
  render(st, { nums, k }) {
    const n = nums.length;
    const cell = (text, states, extra = "") => `<div class="vz-cell ${states.filter(Boolean).map((x) => "is-" + x).join(" ")} ${extra}">${esc(text)}</div>`;
    let h = `<div class="vz-prefix-sum-tbl" style="--n:${n + 1}">`;
    // index row
    h += `<div class="vz-prefix-sum-rh">i</div><div></div>`;
    for (let i = 0; i < n; i++) h += `<div class="vz-prefix-sum-ix">${i}</div>`;
    // nums row
    h += `<div class="vz-prefix-sum-rh">nums</div><div></div>`;
    for (let i = 0; i < n; i++) {
      const inMatch = st.from !== undefined && i >= st.from && i <= st.i;
      h += cell(nums[i], [inMatch ? "good" : i === st.i ? "active" : !st.done && i > st.i ? "dim" : ""]);
    }
    // prefix row: P[j] = sum of the first j values, drawn under nums[j-1]
    let run = 0;
    const P = [0, ...nums.map((x) => (run += x))];
    h += `<div class="vz-prefix-sum-rh">prefix</div>`;
    for (let j = 0; j <= n; j++) {
      const known = j <= st.upto;
      const states = [];
      if (!known) states.push("dim");
      else if (st.from !== undefined && j === st.from) states.push("good");
      else if (j === st.upto && st.i >= 0 && !st.done) states.push("window");
      h += cell(known ? P[j] : "·", states, "vz-prefix-sum-p");
    }
    h += `</div>`;
    const items = st.seen.map(([pv, c]) => ({
      text: `${pv} ×${c}`,
      states: [st.from !== undefined && pv === st.need ? "good" : st.stored === pv ? "active" : ""],
    }));
    return h + `<div class="vz-row">` +
      chips("seen prefix ×count", items) +
      stats([
        ["prefix", st.prefix, st.i >= 0 && !st.done ? ["active"] : []],
        ["need", st.need === undefined ? "—" : st.need, st.from !== undefined ? ["good"] : st.miss ? ["bad"] : []],
        ["k", k],
        ["count", st.count, st.done ? ["good"] : []],
      ]) + `</div>`;
  },
  legend: [["active", "current value"], ["window", "current prefix"], ["good", "matching subarray & earlier prefix"]],
  css: `
.vz-prefix-sum-tbl { display: grid; grid-template-columns: 52px repeat(var(--n), minmax(0, 46px)); gap: 5px 4px; width: 100%; justify-content: center; align-items: center; }
.vz-prefix-sum-tbl .vz-cell { min-width: 0; padding: 0; height: 40px; font-size: 14px; }
.vz-prefix-sum-tbl .vz-prefix-sum-p { height: 34px; font-size: 13px; color: var(--text-2); background: var(--panel-2); border-style: dashed; }
.vz-prefix-sum-tbl .vz-prefix-sum-p.is-window { color: var(--text); border-style: solid; }
.vz-prefix-sum-tbl .vz-prefix-sum-p.is-good { color: var(--good); border-style: solid; }
.vz-prefix-sum-rh { font: 600 10px/1 var(--mono); letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); text-align: right; padding-right: 4px; }
.vz-prefix-sum-ix { font: 500 10px/1 var(--mono); color: var(--text-3); text-align: center; }
@media (max-width: 600px) {
  .vz-prefix-sum-tbl { grid-template-columns: 40px repeat(var(--n), minmax(0, 38px)); gap: 4px 3px; }
  .vz-prefix-sum-tbl .vz-cell { height: 34px; font-size: 12px; border-radius: 6px; }
  .vz-prefix-sum-tbl .vz-prefix-sum-p { height: 30px; font-size: 11.5px; }
  .vz-prefix-sum-rh { font-size: 8.5px; letter-spacing: 0; }
}`,
};
