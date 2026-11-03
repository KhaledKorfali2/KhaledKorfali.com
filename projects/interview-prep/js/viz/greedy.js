import { stats, parseNumbers, esc } from "./kit.js";

// Jump Game: track the farthest index reachable so far. If we ever stand on an
// index beyond that, nothing can get us there — otherwise we reach the end.
export default {
  id: "greedy",
  title: "Jump game: can you reach the last index?",
  blurb: "Never pick a path — just keep the farthest reachable index and check you never fall behind it.",
  inputs: [
    { key: "nums", label: "nums (max jump from each index)", default: "2, 3, 1, 1, 0, 2, 1", hint: "0–9, up to 10 values", wide: true },
  ],
  presets: [
    { label: "Reachable", values: { nums: "2, 3, 1, 1, 0, 2, 1" } },
    { label: "Stuck on a 0", values: { nums: "3, 2, 1, 0, 4" } },
    { label: "Single index", values: { nums: "0" } },
  ],
  parse(v) {
    return { nums: parseNumbers(v.nums, { min: 0, max: 9, maxLen: 10, label: "nums" }) };
  },
  code: [
    "reach = 0  # farthest reachable",
    "for i, jump in enumerate(nums):",
    "    if i > reach:",
    "        return False  # stuck",
    "    reach = max(reach, i + jump)",
    "return True",
  ],
  steps({ nums }) {
    const s = [];
    const last = nums.length - 1;
    let reach = 0;
    const snap = (o) => s.push({ reach, i: -1, ...o });
    snap({ line: 0, msg: `We stand on index 0, so reach = 0. Goal: index ${last}.` });
    for (let i = 0; i < nums.length; i++) {
      if (i > reach) {
        snap({ line: [2, 3], i, stuck: true, done: true, answer: false, msg: `Index ${i} is beyond reach = ${reach}: no earlier jump gets here, so the end (${last}) is unreachable.` });
        return s;
      }
      const cand = i + nums[i];
      snap({ line: 2, i, cand, msg: `Index ${i} ≤ reach ${reach}, so we can stand here. From it we can jump to ${i} + ${nums[i]} = ${cand}.` });
      const old = reach;
      reach = Math.max(reach, cand);
      snap({ line: 4, i, cand, grew: reach > old, msg: reach > old
        ? `${cand} > ${old}: reach grows to ${reach}${reach >= last ? ` — already covers the last index` : ""}.`
        : `${cand} ≤ ${old}: reach stays ${reach}.` });
    }
    snap({ line: 5, done: true, answer: true, msg: `Every index up to ${last} was within reach → True. One pass, O(n), no backtracking needed.` });
    return s;
  },
  render(st, { nums }) {
    const n = nums.length;
    const reachEnd = Math.min(st.reach, n - 1);
    let h = `<div class="vz-greedy" style="--n:${n}">`;
    for (let i = 0; i < n; i++) {
      let state;
      if (i === st.i) state = st.stuck ? "bad" : "active";
      else if (st.done && st.answer) state = "good";
      else state = i <= st.reach ? "window" : "dim";
      h += `<div class="vz-cell is-${state}" style="grid-column:${i + 1};grid-row:1">${esc(nums[i])}</div>`;
      h += `<div class="vz-greedy-ix${i === n - 1 ? " is-goal" : ""}" style="grid-column:${i + 1};grid-row:2">${i === n - 1 ? `${i}·end` : i}</div>`;
    }
    // jump bar: from i to i + nums[i]
    if (st.cand !== undefined && !st.done) {
      const a = st.i, b = Math.min(st.cand, n - 1);
      h += `<div class="vz-greedy-bar is-jump" style="grid-column:${a + 1} / ${b + 2};grid-row:3"><span>i + ${nums[st.i]} = ${st.cand}${st.cand > n - 1 ? " (past end)" : ""}</span></div>`;
    }
    // reach bar: 0..reach
    h += `<div class="vz-greedy-bar is-reach ${st.done ? (st.answer ? "is-ok" : "is-fail") : ""}" style="grid-column:1 / ${reachEnd + 2};grid-row:4"><span>reach ${st.reach}${st.reach > n - 1 ? " ≥ end" : ""}</span></div>`;
    h += `</div>`;
    return h + stats([
      ["i", st.i < 0 ? "—" : st.i, st.stuck ? ["bad"] : []],
      ["reach", st.reach, st.grew ? ["good"] : []],
      ["last index", n - 1],
      ...(st.done ? [["reachable?", st.answer ? "True" : "False", st.answer ? ["good"] : ["bad"]]] : []),
    ]);
  },
  legend: [["active", "current index"], ["window", "within reach"], ["dim", "not reachable (yet)"], ["bad", "stuck"]],
  css: `
.vz-greedy { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 50px)); grid-template-rows: auto auto 22px 22px; gap: 5px 4px; width: 100%; justify-content: center; }
.vz-greedy .vz-cell { min-width: 0; padding: 0; }
.vz-greedy-ix { font: 500 10px/1 var(--mono); color: var(--text-3); text-align: center; }
.vz-greedy-ix.is-goal { color: var(--accent); font-weight: 700; white-space: nowrap; }
.vz-greedy-bar { height: 20px; border-radius: 5px; display: flex; align-items: center; min-width: 0; position: relative; }
.vz-greedy-bar span { font: 600 10.5px/1 var(--mono); white-space: nowrap; padding: 0 6px; }
.vz-greedy-bar.is-jump { background: var(--accent-soft); border: 1.5px solid var(--accent); }
.vz-greedy-bar.is-jump span { color: var(--accent); }
.vz-greedy-bar.is-reach { background: var(--info-soft); border: 1.5px solid var(--info); }
.vz-greedy-bar.is-reach span { color: var(--info); }
.vz-greedy-bar.is-ok { background: var(--good-soft); border-color: var(--good); }
.vz-greedy-bar.is-ok span { color: var(--good); }
.vz-greedy-bar.is-fail { background: var(--bad-soft); border-color: var(--bad); }
.vz-greedy-bar.is-fail span { color: var(--bad); }
@media (max-width: 600px) { .vz-greedy-bar span { font-size: 9.5px; padding: 0 4px; } }`,
};
