import { arrayView, chips, stats, parseNumbers, parseNumber } from "./kit.js";

// Two Sum: one pass, remembering every value we've passed in a value → index map,
// so the partner of each new value is a single O(1) lookup away.
export default {
  id: "hash-map",
  title: "Two Sum with a value → index map",
  blurb: "For each value, ask the map whether its complement (target − x) has already been seen.",
  inputs: [
    { key: "nums", label: "nums", default: "3, 8, 11, 4, 7, 2", hint: "−99…99, up to 10 values", wide: true },
    { key: "target", label: "target", default: "9", numeric: true },
  ],
  presets: [
    { label: "Example", values: { nums: "3, 8, 11, 4, 7, 2", target: "9" } },
    { label: "Duplicates", values: { nums: "3, 5, 3, 1", target: "6" } },
    { label: "No pair", values: { nums: "1, 2, 4, 8, 16", target: "7" } },
  ],
  parse(v) {
    const nums = parseNumbers(v.nums, { min: -99, max: 99, maxLen: 10, label: "nums" });
    const target = parseNumber(v.target, { min: -198, max: 198, label: "target" });
    return { nums, target };
  },
  code: [
    "seen = {}  # value → index",
    "for i, x in enumerate(nums):",
    "    need = target - x",
    "    if need in seen:",
    "        return [seen[need], i]",
    "    seen[x] = i",
    "return None  # no pair",
  ],
  steps({ nums, target }) {
    const s = [];
    const seen = new Map();
    const snap = (o) => s.push({ seen: [...seen.entries()], i: -1, need: null, ...o });
    snap({ line: 0, msg: `Start with an empty map. We want two values that add up to ${target}.` });
    for (let i = 0; i < nums.length; i++) {
      const x = nums[i], need = target - x;
      if (seen.has(need)) {
        snap({ line: [2, 3], i, need, hit: true, msg: `x = ${x} needs ${target} − ${x} = ${need}. The map has ${need} (at index ${seen.get(need)}) — hit!` });
        const pair = [seen.get(need), i];
        snap({ line: 4, i, need, hit: true, done: true, answer: pair,
          msg: `Answer: indices [${pair[0]}, ${pair[1]}] (${nums[pair[0]]} + ${x} = ${target}). One pass with O(1) lookups → O(n).` });
        return s;
      }
      snap({ line: [2, 3], i, need, miss: true, msg: `x = ${x} needs ${need}, which isn't in the map yet.` });
      const old = seen.has(x);
      seen.set(x, i);
      snap({ line: 5, i, need, stored: x, msg: old
        ? `Store ${x} → ${i}, overwriting the older index; any later partner can use either one.`
        : `Remember ${x} → ${i}, so a later value needing ${x} finds it instantly.` });
    }
    snap({ line: 6, done: true, answer: null, msg: `No pair adds up to ${target}. We still only looked at each value once → O(n).` });
    return s;
  },
  render(st, { nums, target }) {
    const pair = st.answer || null;
    const idxOf = new Map(st.seen);
    const hitIdx = st.hit ? idxOf.get(st.need) : -1;
    const arr = arrayView(nums, {
      states: (i) => {
        if (st.done) return pair ? [pair.includes(i) ? "good" : "dim"] : ["dim"];
        if (i === st.i) return [st.hit ? "good" : "active"];
        if (i === hitIdx) return ["good"];
        if (i < st.i) return ["visited"];
        return [];
      },
      pointers: (i) => (!st.done && i === st.i ? ["i"] : []),
    });
    const items = st.seen.map(([k, v]) => ({
      text: `${k} → ${v}`,
      states: [st.hit && k === st.need ? "good" : st.stored === k ? "active" : ""],
    }));
    const look = st.need === null ? "—" : st.hit ? `${st.need} ✓` : `${st.need} ✗`;
    return `<div class="vz-hash-map-fit">${arr}</div>` + `<div class="vz-row">` +
      chips("seen (value → index)", items, { empty: "{ }" }) +
      stats([
        ["target", target],
        ["need", look, st.hit ? ["good"] : st.miss ? ["bad"] : []],
        ...(st.done ? [["answer", pair ? `[${pair.join(", ")}]` : "None", pair ? ["good"] : ["bad"]]] : []),
      ]) + `</div>`;
  },
  legend: [["active", "current x"], ["visited", "stored in the map"], ["good", "complement hit"]],
  css: `
.vz-hash-map-fit { width: 100%; display: flex; flex-direction: column; align-items: center; }
.vz-hash-map-fit .vz-array { flex-wrap: nowrap; width: 100%; }
.vz-hash-map-fit .vz-col { flex: 0 1 var(--cell); min-width: 0; }
.vz-hash-map-fit .vz-cell { min-width: 0; width: 100%; padding: 0; }
@media (max-width: 600px) { .vz-hash-map-fit .vz-array { gap: 3px; } .vz-hash-map-fit .vz-cell { font-size: 12.5px; } }`,
};
