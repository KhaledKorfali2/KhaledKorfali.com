import { parseNumbers, esc } from "./kit.js";

// Reverse a singly linked list in place with three pointers. Nodes never move —
// only their `next` arrows flip, one per iteration.
// Positions: -1 = the "None" left of node 0, 0..n-1 = nodes, n = the "None" after the tail.
export default {
  id: "linked-list",
  title: "Reverse a linked list",
  blurb: "Walk the list once, flipping each node's next arrow to point back at the previous node.",
  inputs: [
    { key: "vals", label: "node values (head first)", default: "1, 2, 3, 4, 5", hint: "0–99, 1 to 6 nodes", wide: true },
  ],
  presets: [
    { label: "Five nodes", values: { vals: "1, 2, 3, 4, 5" } },
    { label: "Two nodes", values: { vals: "7, 9" } },
    { label: "Single node", values: { vals: "42" } },
  ],
  parse(v) {
    return { vals: parseNumbers(v.vals, { min: 0, max: 99, maxLen: 6, label: "node values" }) };
  },
  code: [
    "prev = None",
    "curr = head",
    "while curr:",
    "    nxt = curr.next  # save rest",
    "    curr.next = prev  # flip",
    "    prev = curr",
    "    curr = nxt",
    "return prev  # new head",
  ],
  steps({ vals }) {
    const n = vals.length;
    const next = vals.map((_, i) => i + 1); // n = None
    let prev = -1, curr = 0, nxt = null;
    const s = [];
    const name = (p) => (p < 0 || p >= n ? "None" : `node ${vals[p]}`);
    const snap = (o) => s.push({ next: [...next], prev, curr, nxt, ...o });
    snap({ line: [0, 1], msg: `prev starts at None (nothing is reversed yet) and curr at the head, ${name(0)}.` });
    while (curr < n) {
      nxt = next[curr];
      snap({ line: [2, 3], read: curr, msg: `Save nxt = curr.next (${name(nxt)}) — once we flip curr's arrow, this is our only way to the rest of the list.` });
      next[curr] = curr - 1;
      snap({ line: 4, flip: curr, msg: `Point ${name(curr)} back at ${prev < 0 ? "None" : name(prev)}. The link to ${name(nxt)} is gone, but nxt still holds it.` });
      prev = curr; curr = nxt;
      snap({ line: [5, 6], msg: curr < n
        ? `Move on: prev = ${name(prev)}, curr = ${name(curr)}. Everything left of curr is reversed.`
        : `Move on: prev = ${name(prev)}, curr = None.` });
    }
    const out = [];
    for (let p = prev; p >= 0 && p < n; p = next[p]) out.push(vals[p]);
    snap({ line: [2, 7], done: true, answer: out, msg: `curr is None, so stop and return prev = ${name(prev)}: ${out.join(" → ")} → None. One pass, O(1) extra space.` });
    return s;
  },
  render(st, { vals }) {
    const n = vals.length;
    const cols = `minmax(0,24fr) repeat(${n}, minmax(0,22fr) minmax(0,40fr)) minmax(0,22fr) minmax(0,24fr)`;
    const maxW = Math.round((48 + 62 * n + 22) * 1.45);
    const colOf = (p) => (p < 0 ? 1 : p >= n ? 2 * n + 3 : 2 * p + 3); // grid column of a position
    let h = `<div class="vz-linked-list" style="grid-template-columns:${cols};max-width:${maxW}px">`;
    // row 1: head markers
    const headAt = st.done ? st.prev : 0;
    h += `<div class="vz-linked-list-head" style="grid-column:${colOf(headAt)}">${st.done ? "new head" : "head"}</div>`;
    // row 2: None, arrows and nodes
    h += `<div class="vz-linked-list-none" style="grid-column:1">∅</div>`;
    for (let k = 0; k <= n; k++) {
      // arrow slot between position k-1 and k
      let dir = "", state = "";
      if (k - 1 >= 0 && st.next[k - 1] === k) {
        dir = "fwd";
        if (st.read === k - 1) state = "is-read";
        else if (st.done) state = "";
      } else if (k < n && st.next[k] === k - 1) {
        dir = "rev";
        state = st.flip === k ? "is-flip" : "is-rev";
      }
      const cut = !dir && st.flip === k - 1;
      h += `<div class="vz-linked-list-slot" style="grid-column:${2 * k + 2}"><div class="vz-linked-list-arr ${dir ? "is-" + dir : "is-none"} ${state} ${cut ? "is-cut" : ""}"></div></div>`;
      if (k < n) {
        const states = [];
        if (st.done) states.push("good");
        else if (k === st.curr) states.push("active");
        else if (k === st.nxt && k !== st.curr) states.push("visited");
        else if (k < st.curr) states.push("good");
        h += `<div class="vz-cell vz-linked-list-node ${states.map((x) => "is-" + x).join(" ")}" style="grid-column:${2 * k + 3}">${esc(vals[k])}</div>`;
      }
    }
    h += `<div class="vz-linked-list-none" style="grid-column:${2 * n + 3}">∅</div>`;
    // row 3: pointer labels
    const labels = new Map();
    const add = (p, t) => { const c = colOf(p); labels.set(c, [...(labels.get(c) || []), t]); };
    add(st.prev, "prev");
    add(st.curr, "curr");
    if (st.nxt !== null && !st.done) add(st.nxt, "nxt");
    for (const [c, ts] of labels) {
      h += `<div class="vz-linked-list-ptrs" style="grid-column:${c}">${ts.map((t) => `<span class="vz-linked-list-p-${t}">${t}</span>`).join("")}</div>`;
    }
    h += `</div>`;
    // readouts: the two separate lists that exist mid-reversal
    const walk = (p) => { const o = []; for (; p >= 0 && p < n; p = st.next[p]) o.push(vals[p]); return o; };
    const flipped = st.flip !== undefined;
    const rev = walk(flipped ? st.curr : st.prev);
    const rest = st.done ? [] : walk(flipped ? st.nxt : st.curr);
    const chain = (label, arr, state) => `<div class="vz-panel"><div class="vz-panel-head"><span class="vz-label">${label}</span></div><div class="vz-linked-list-chain">${
      [...arr.map((v) => `<span class="vz-chip ${state}">${esc(v)}</span>`), `<span class="vz-chip">None</span>`].join(`<span class="vz-linked-list-to">→</span>`)}</div></div>`;
    return h + `<div class="vz-row">` + chain("reversed so far", rev, "is-good") + chain("still to do", rest, "") + `</div>`;
  },
  legend: [["active", "curr"], ["visited", "nxt (saved next node)"], ["good", "already reversed"]],
  css: `
.vz-linked-list { display: grid; width: 100%; row-gap: 6px; align-items: center; margin: 0 auto; }
.vz-linked-list-head { grid-row: 1; justify-self: center; font: 600 10px/1 var(--mono); letter-spacing: .06em; text-transform: uppercase; color: var(--text-2); white-space: nowrap; }
.vz-linked-list-head::after { content: "↓"; display: block; text-align: center; margin-top: 2px; color: var(--text-3); }
.vz-linked-list-node, .vz-linked-list-none, .vz-linked-list-slot { grid-row: 2; }
.vz .vz-linked-list-node { min-width: 0; width: 100%; padding: 0; height: 44px; font-size: 16px; }
.vz-linked-list-none { height: 30px; display: grid; place-items: center; font: 600 13px/1 var(--mono); color: var(--text-3); border: 1.5px dashed var(--line-2); border-radius: 7px; }
.vz-linked-list-slot { height: 44px; display: flex; align-items: center; padding: 0 3px; }
.vz-linked-list-arr { position: relative; width: 100%; height: 2px; color: var(--text-3); background: currentColor; border-radius: 2px; }
.vz-linked-list-arr::after { content: ""; position: absolute; top: -5px; border: 6px solid transparent; }
.vz-linked-list-arr.is-fwd::after { right: -3px; border-left: 8px solid currentColor; border-right: 0; }
.vz-linked-list-arr.is-rev::after { left: -3px; border-right: 8px solid currentColor; border-left: 0; }
.vz-linked-list-arr.is-rev { color: var(--good); }
.vz-linked-list-arr.is-flip { color: var(--accent); height: 3px; }
.vz-linked-list-arr.is-read { color: var(--violet); height: 3px; }
.vz-linked-list-arr.is-none { background: none; border-top: 2px dotted var(--line-2); height: 0; }
.vz-linked-list-arr.is-cut { border-top-color: var(--bad); }
.vz-linked-list-arr.is-cut::before { content: "✕"; position: absolute; left: 50%; top: -9px; transform: translateX(-50%); font: 700 11px/1 var(--mono); color: var(--bad); }
.vz-linked-list-ptrs { grid-row: 3; justify-self: center; display: flex; flex-direction: column; align-items: center; gap: 3px; }
.vz-linked-list-ptrs span { font: 700 10.5px/1 var(--mono); padding: 3px 5px; border-radius: 4px; white-space: nowrap; }
.vz-linked-list-p-curr { color: var(--accent); background: var(--accent-soft); }
.vz-linked-list-p-prev { color: var(--good); background: var(--good-soft); }
.vz-linked-list-p-nxt { color: var(--violet); background: var(--violet-soft); }
.vz-linked-list-chain { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.vz-linked-list-to { color: var(--text-3); font: 600 12px/1 var(--mono); }
@media (max-width: 600px) {
  .vz .vz-linked-list-node { height: 36px; font-size: 14px; border-radius: 7px; }
  .vz-linked-list-slot { height: 36px; padding: 0 1px; }
  .vz-linked-list-none { height: 26px; font-size: 12px; }
  .vz-linked-list-ptrs span { font-size: 9.5px; padding: 2px 3px; }
}`,
};
