import { chips, stats, parseNumbers, esc, InputError } from "./kit.js";

// Single Number: XOR is its own inverse (a ^ a = 0) and order doesn't matter,
// so XOR-ing everything cancels every pair and leaves the lone value.
const BITS = 6;
const bitsOf = (x) => Array.from({ length: BITS }, (_, b) => (x >> (BITS - 1 - b)) & 1);

export default {
  id: "bit-manipulation",
  title: "Single number with XOR",
  blurb: "XOR every value together: each pair cancels itself bit by bit, leaving the one without a partner.",
  inputs: [
    { key: "nums", label: "nums (every value twice except one)", default: "4, 1, 2, 1, 2", hint: "0–63, up to 9 values", wide: true },
  ],
  presets: [
    { label: "Example", values: { nums: "4, 1, 2, 1, 2" } },
    { label: "Lone 0", values: { nums: "13, 0, 37, 13, 37" } },
    { label: "Just one", values: { nums: "42" } },
  ],
  parse(v) {
    const nums = parseNumbers(v.nums, { min: 0, max: 63, maxLen: 9, label: "nums" });
    const cnt = new Map();
    nums.forEach((x) => cnt.set(x, (cnt.get(x) || 0) + 1));
    const singles = [...cnt].filter(([, c]) => c === 1).length;
    if ([...cnt.values()].some((c) => c > 2) || singles !== 1)
      throw new InputError("Every value must appear exactly twice except one, which appears once.");
    return { nums };
  },
  code: [
    "result = 0",
    "for x in nums:",
    "    result ^= x  # a ^ a = 0",
    "return result",
  ],
  steps({ nums }) {
    const s = [];
    let result = 0;
    const odd = new Set();
    const snap = (o) => s.push({ result, odd: [...odd], i: -1, ...o });
    snap({ line: 0, msg: "result starts at 0 (all bits off) — XOR with 0 changes nothing." });
    nums.forEach((x, i) => {
      const before = result;
      result ^= x;
      if (odd.has(x)) odd.delete(x); else odd.add(x);
      const second = !odd.has(x);
      snap({ line: [1, 2], i, before, msg: x === 0
        ? `x = 0 has no 1-bits, so result stays ${result}.`
        : `${before} ^ ${x} = ${result}: every bit where ${x} has a 1 flips.${second ? ` That's ${x}'s second appearance, so its bits are cancelled out again.` : ""}` });
    });
    snap({ line: 3, done: true, answer: result, msg: `Every pair cancelled, leaving ${result} = ${result.toString(2).padStart(BITS, "0")}₂. O(n) time, O(1) extra space — no hash set needed.` });
    return s;
  },
  render(st, { nums }) {
    const cell = (b, states = []) => `<div class="vz-cell ${states.filter(Boolean).map((x) => "is-" + x).join(" ")}">${b}</div>`;
    let h = `<div class="vz-bit-manipulation">`;
    h += `<div class="vz-bit-manipulation-rh"></div>`;
    for (let b = 0; b < BITS; b++) h += `<div class="vz-bit-manipulation-col">${2 ** (BITS - 1 - b)}</div>`;
    nums.forEach((x, i) => {
      const cur = i === st.i, future = !st.done && i > st.i;
      h += `<div class="vz-bit-manipulation-rh ${cur ? "is-cur" : ""} ${future ? "is-future" : ""}">${esc(x)}</div>`;
      bitsOf(x).forEach((bit) => {
        h += cell(bit, [future ? "dim" : cur ? (bit ? "active" : "") : st.done ? "dim" : "", bit ? "" : "muted"]);
      });
    });
    const rb = bitsOf(st.result), xb = st.i >= 0 && !st.done ? bitsOf(nums[st.i]) : null;
    h += `<div class="vz-bit-manipulation-sep"></div>`;
    h += `<div class="vz-bit-manipulation-rh is-res">result</div>`;
    rb.forEach((bit, b) => {
      const flipped = xb && xb[b];
      h += cell(bit, [st.done ? (bit ? "good" : "") : flipped ? (bit ? "window" : "bad") : "", bit ? "" : "muted"]);
    });
    h += `</div>`;
    return h + `<div class="vz-row">` +
      chips("seen an odd number of times", st.odd.map((v) => ({ text: v, states: [st.done ? "good" : ""] })), { empty: "none" }) +
      stats([
        ["result", st.result, st.done ? ["good"] : []],
        ...(st.before !== undefined ? [["before", st.before]] : []),
      ]) + `</div>`;
  },
  legend: [["active", "1-bits of x (they flip)"], ["window", "flipped on"], ["bad", "flipped off"], ["good", "answer"]],
  css: `
.vz-bit-manipulation { display: grid; grid-template-columns: 58px repeat(${BITS}, minmax(0, 40px)); gap: 4px; justify-content: center; width: 100%; align-items: center; }
.vz-bit-manipulation .vz-cell { min-width: 0; padding: 0; height: 30px; font-size: 14px; border-radius: 6px; }
.vz-bit-manipulation .vz-cell.is-muted:not(.is-bad):not(.is-good) { color: var(--text-3); }
.vz-bit-manipulation-col { font: 500 10px/1 var(--mono); color: var(--text-3); text-align: center; padding-bottom: 2px; }
.vz-bit-manipulation-rh { font: 600 13px/1 var(--mono); text-align: right; padding-right: 8px; color: var(--text-2); }
.vz-bit-manipulation-rh.is-cur { color: var(--accent); }
.vz-bit-manipulation-rh.is-cur::before { content: "x = "; font-size: 10px; font-weight: 500; }
.vz-bit-manipulation-rh.is-future { opacity: .4; }
.vz-bit-manipulation-rh.is-res { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--text); }
.vz-bit-manipulation-sep { grid-column: 1 / -1; height: 0; border-top: 1.5px solid var(--line-2); margin: 3px 0; }
.vz-bit-manipulation .vz-cell { height: 30px; }
@media (max-width: 600px) { .vz-bit-manipulation .vz-cell { height: 26px; font-size: 13px; } .vz-bit-manipulation { grid-template-columns: 50px repeat(${BITS}, minmax(0, 36px)); } }`,
};
