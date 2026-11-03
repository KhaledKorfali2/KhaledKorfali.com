import { arrayView, chips, stats, graphView, parseNumbers, parseNumber, InputError } from "./kit.js";

// Kth Largest Element with a size-k MIN-heap: the heap holds the k largest values
// seen so far, and its root (the smallest of them) is the k-th largest.
// The heap is a real array-backed binary heap; every sift-up / sift-down swap is a step.

// Node position for heap index i in a complete binary tree (0..100 × 0..h box).
function pos(i) {
  const d = Math.floor(Math.log2(i + 1));
  const p = i - (2 ** d - 1);
  return { x: 6 + ((p + 0.5) / 2 ** d) * 88, y: 7 + d * 17 };
}

const ORD = (k) => (k === 1 ? "st" : k === 2 ? "nd" : k === 3 ? "rd" : "th");

export default {
  id: "heap",
  title: "K-th largest element with a min-heap",
  blurb: "Keep only the k largest values in a min-heap; whenever it grows past k, pop the smallest.",
  inputs: [
    { key: "nums", label: "nums", default: "3, 2, 1, 5, 6, 4", hint: "0–99, up to 10 values", wide: true },
    { key: "k", label: "k", default: "3", numeric: true, hint: "1–6, ≤ len(nums)" },
  ],
  presets: [
    { label: "Example", values: { nums: "3, 2, 1, 5, 6, 4", k: "3" } },
    { label: "Duplicates", values: { nums: "3, 2, 3, 1, 2, 4, 5, 5, 6", k: "4" } },
    { label: "Rising values", values: { nums: "1, 2, 3, 4, 5, 6, 7, 8", k: "5" } },
  ],
  parse(v) {
    const nums = parseNumbers(v.nums, { min: 0, max: 99, maxLen: 10, label: "nums" });
    const k = parseNumber(v.k, { min: 1, max: 6, label: "k" });
    if (k > nums.length) throw new InputError(`k can't be larger than the number of values (${nums.length}).`);
    return { nums, k };
  },
  code: [
    "heap = []  # min-heap",
    "for x in nums:",
    "    heap.append(x)  # new leaf",
    "    sift_up(heap)",
    "    if len(heap) > k:",
    "        heap[0] = heap.pop()",
    "        sift_down(heap)",
    "return heap[0]  # k-th largest",
  ],
  steps({ nums, k }) {
    const s = [];
    const h = [];
    const evicted = [];
    let at = -1;
    const snap = (o) => s.push({ heap: [...h], evicted: [...evicted], at, ...o });
    snap({ line: 0, msg: `Start with an empty min-heap. It will hold the ${k} largest values seen so far.` });
    for (let i = 0; i < nums.length; i++) {
      at = i;
      const x = nums[i];
      h.push(x);
      let m = h.length - 1;
      snap({ line: [1, 2], mov: m, msg: `Push ${x}: it goes into the next free leaf, index ${m}${m ? ` (parent index ${(m - 1) >> 1})` : " — the root"}.` });
      while (m > 0) {
        const p = (m - 1) >> 1;
        if (h[m] < h[p]) {
          snap({ line: 3, mov: m, cmp: p, msg: `${h[m]} < parent ${h[p]}: the min-heap rule is broken, so swap them.` });
          [h[m], h[p]] = [h[p], h[m]];
          m = p;
          snap({ line: 3, mov: m, swapped: true, msg: `Swapped — ${h[m]} moved up to index ${m}.` });
        } else {
          snap({ line: 3, mov: m, cmp: p, ok: true, msg: `${h[m]} ≥ parent ${h[p]}: it's in the right place, stop sifting up.` });
          break;
        }
      }
      if (h.length <= k) {
        snap({ line: 4, msg: `The heap has ${h.length} ≤ ${k} values, so keep them all.` });
        continue;
      }
      const min = h[0];
      snap({ line: 4, root: true, msg: `${h.length} values > k = ${k}: the root ${min} is the smallest, so it can't be among the ${k} largest. Remove it.` });
      const last = h.pop();
      evicted.push(min);
      if (h.length) {
        h[0] = last;
        m = 0;
        snap({ line: 5, mov: 0, fresh: true, msg: `Move the last leaf (${last}) into the root to keep the tree complete.` });
        for (;;) {
          const l = 2 * m + 1, r = l + 1;
          if (l >= h.length) {
            snap({ line: 6, mov: m, ok: true, msg: `${h[m]} is a leaf now — sift-down is done.` });
            break;
          }
          const c = r < h.length && h[r] < h[l] ? r : l;
          if (h[c] < h[m]) {
            snap({ line: 6, mov: m, cmp: c, msg: `${h[m]} > its smaller child ${h[c]}: swap them.` });
            [h[m], h[c]] = [h[c], h[m]];
            m = c;
            snap({ line: 6, mov: m, swapped: true, msg: `Swapped — ${h[m]} moved down to index ${m}.` });
          } else {
            snap({ line: 6, mov: m, cmp: c, ok: true, msg: `${h[m]} ≤ its smaller child ${h[c]}: the heap is valid again.` });
            break;
          }
        }
      }
    }
    at = nums.length;
    snap({ line: 7, done: true, answer: h[0], msg: `The heap holds the ${k} largest values; its root ${h[0]} is the ${k}${ORD(k)} largest. Each push/pop costs O(log k) → O(n log k).` });
    return s;
  },
  render(st, { nums, k }) {
    const h = st.heap;
    const stateOf = (i) => {
      if (st.done) return [i === 0 ? "good" : ""];
      if (st.root && i === 0) return ["bad"];
      if (i === st.mov) return [st.ok ? "good" : "active"];
      if (i === st.cmp) return ["visited"];
      return [];
    };
    const nodes = h.map((v, i) => ({ id: i, ...pos(i), label: v, badge: i, states: stateOf(i) }));
    const edges = [];
    for (let i = 1; i < h.length; i++) {
      const p = (i - 1) >> 1;
      const pair = (st.cmp !== undefined && [i, p].every((x) => x === st.cmp || x === st.mov));
      edges.push({ a: p, b: i, states: [pair ? (st.ok ? "good" : "active") : ""] });
    }
    const height = 7 * 2 + (h.length > 3 ? 2 : h.length > 1 ? 1 : 0) * 17;
    const tree = h.length
      ? `<div class="vz-heap-tree">${graphView(nodes, edges, { height: Math.max(height, 14), r: 6.4 })}</div>`
      : `<div class="vz-heap-tree vz-heap-emptytree">empty heap</div>`;
    const stream = chips("nums (stream)", nums.map((v, i) => ({
      text: v, states: [i === st.at && !st.done ? "active" : i < st.at ? "dim" : ""],
    })));
    const arr = arrayView(h, { label: "heap array · kids of i at 2i+1, 2i+2", states: stateOf });
    const full = h.length === k;
    return stream + tree + arr + `<div class="vz-row">` +
      chips("popped (too small)", st.evicted.map((v, i) => ({ text: v, states: [i === st.evicted.length - 1 && st.fresh ? "bad" : "dim"] })), { empty: "none yet" }) +
      stats([
        ["size / k", `${h.length} / ${k}`],
        [`${k}${ORD(k)} largest`, full || st.done ? h[0] : "—", st.done ? ["good"] : []],
      ]) + `</div>`;
  },
  legend: [["active", "value being sifted"], ["visited", "compared with"], ["good", "in place"], ["bad", "smallest — removed"]],
  css: `
.vz-heap-tree { width: 100%; display: flex; justify-content: center; }
.vz-heap-tree .vz-graph-wrap { max-width: 440px; }
.vz-heap-tree .vz-node text { font-size: 4.6px; }
.vz-heap-tree .vz-node .vz-badge { font-size: 3px; fill: var(--text-3); }
.vz-heap-emptytree { min-height: 90px; align-items: center; color: var(--text-3); font-size: 13px; border: 1.5px dashed var(--line-2); border-radius: var(--r-sm); max-width: 440px; }`,
};
