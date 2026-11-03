import { esc, arrayView, chips, stats, parseNumbers, parseNumber, InputError } from "./kit.js";

const INF = Infinity;
const fmt = (x) => (x === INF ? "∞" : String(x));

// Coin Change (fewest coins) — bottom-up 1-D table.
export default {
  id: "dynamic-programming",
  title: "Coin Change — fewest coins that make an amount",
  blurb: "dp[a] = fewest coins for amount a; fill it left to right, trying each coin as the last one: dp[a] = min(dp[a − c] + 1).",
  inputs: [
    { key: "coins", label: "coins", default: "1, 3, 4", hint: "1–4 distinct values, 1–20" },
    { key: "amount", label: "amount", default: "6", numeric: true, hint: "0–15" },
  ],
  presets: [
    { label: "Greedy fails", values: { coins: "1, 3, 4", amount: "6" } },
    { label: "Classic", values: { coins: "1, 2, 5", amount: "11" } },
    { label: "No solution", values: { coins: "4, 6", amount: "9" } },
  ],
  parse(v) {
    const coins = parseNumbers(v.coins, { min: 1, max: 20, maxLen: 4, label: "coins" });
    if (new Set(coins).size !== coins.length) throw new InputError("coins: list each value once.");
    const amount = parseNumber(v.amount, { min: 0, max: 15, label: "amount" });
    return { coins: [...coins].sort((a, b) => a - b), amount };
  },
  code: [
    "dp = [0] + [inf] * amount",
    "for a in range(1, amount + 1):",
    "    for c in coins:",
    "        if c > a: continue",
    "        if dp[a - c] + 1 < dp[a]:",
    "            dp[a] = dp[a - c] + 1",
    "            last[a] = c",
    "if dp[amount] == inf: return -1",
    "return dp[amount]",
  ],
  steps({ coins, amount }) {
    const dp = [0, ...Array(amount).fill(INF)];
    const last = Array(amount + 1).fill(0);
    const s = [];
    const snap = (o) => s.push({ dp: [...dp], last: [...last], ...o });
    snap({ line: 0, msg: `dp[0] = 0: zero coins make amount 0. Every other amount starts unknown (∞).` });
    for (let a = 1; a <= amount; a++) {
      for (const c of coins) {
        if (c > a) {
          snap({ a, c, line: [2, 3], msg: `a = ${a}, coin ${c}: too big (${c} > ${a}), skip it.` });
          continue;
        }
        const cand = dp[a - c] + 1;
        const before = dp[a];
        if (cand < dp[a]) {
          dp[a] = cand; last[a] = c;
          snap({ a, c, read: a - c, cand, before, better: true, line: [4, 5, 6], msg:
            `a = ${a}, coin ${c}: dp[${a - c}] + 1 = ${cand} beats ${fmt(before)} → dp[${a}] = ${cand}.` });
        } else {
          snap({ a, c, read: a - c, cand, before, line: 4, msg: dp[a - c] === INF
            ? `a = ${a}, coin ${c}: dp[${a - c}] is ∞ (${a - c} can't be made), so this coin can't finish ${a}.`
            : `a = ${a}, coin ${c}: dp[${a - c}] + 1 = ${cand} is not better than ${fmt(before)}; keep it.` });
        }
      }
    }
    const answer = dp[amount] === INF ? -1 : dp[amount];
    const used = [], trail = [];
    if (answer !== -1) for (let x = amount; x > 0; x -= last[x]) { trail.push(x); used.push(last[x]); }
    trail.push(0);
    snap({ line: answer === -1 ? 7 : 8, done: true, answer, used, trail: answer === -1 ? [] : trail, msg: amount === 0
      ? "Done: amount 0 needs 0 coins — dp[0] is the base case."
      : answer === -1
      ? `Done: dp[${amount}] is still ∞ — no mix of ${coins.join(", ")} sums to ${amount}, so return -1.`
      : `Done: ${answer} coin${answer === 1 ? "" : "s"} (${used.join(" + ")} = ${amount}). Each of ${amount} amounts tries ${coins.length} coins → O(amount × coins).` });
    return s;
  },
  render(st, { coins, amount }) {
    const trail = new Set(st.trail || []);
    const table = arrayView(st.dp.map(fmt), {
      label: "dp[a] — fewest coins for amount a",
      states: (i) => {
        if (st.done) return [trail.has(i) ? "path" : st.dp[i] === INF ? "dim" : ""];
        if (i === st.a) return ["active", st.better ? "good" : ""];
        if (i === st.read) return ["window"];
        if (st.a !== undefined && i > st.a) return ["dim"];
        return [];
      },
      sub: (i) => (st.last[i] ? `+${st.last[i]}` : ""),
      pointers: (i) => (st.done ? [] : [i === st.a ? "a" : "", i === st.read ? `a−${st.c}` : ""].filter(Boolean)),
    });
    let formula = "";
    if (st.done) {
      formula = st.answer === -1
        ? `dp[${amount}] = ∞ → <b class="vz-dynamic-programming-bad">-1</b>`
        : `${esc(st.trail.join(" → "))} &nbsp;(follow the +coin captions back to 0)`;
    } else if (st.read !== undefined) {
      formula = `dp[${st.a}] = min(${fmt(st.before)}, dp[${st.read}] + 1 = ${fmt(st.dp[st.read])} + 1) = <b class="${st.better ? "vz-dynamic-programming-good" : ""}">${fmt(st.dp[st.a])}</b>`;
    } else if (st.a !== undefined) {
      formula = `coin ${st.c} &gt; ${st.a}: can't be the last coin`;
    } else formula = "dp[0] = 0";
    return `<div class="vz-dynamic-programming-table">${table}</div>` +
      `<div class="vz-dynamic-programming-formula">${formula}</div>` +
      `<div class="vz-row">` +
      chips(st.done ? "coins used" : "coins", st.done
        ? (st.used || []).map((c) => ({ text: String(c), states: ["good"] }))
        : coins.map((c) => ({ text: String(c), states: [c === st.c ? (st.read === undefined ? "dim" : "active") : ""] })), { empty: st.done ? "none fit" : "empty" }) +
      stats([["amount", amount], ["answer", st.done ? st.answer : "…", st.done ? [st.answer === -1 ? "bad" : "good"] : []]]) +
      `</div>`;
  },
  legend: [["active", "dp[a] being filled"], ["window", "dp[a − c] read"], ["good", "improved"], ["path", "coins of the answer"], ["dim", "not filled yet / ∞"]],
  css: `
.vz-dynamic-programming-table { width: 100%; display: flex; flex-direction: column; align-items: center; }
.vz-dynamic-programming-table .vz-array { gap: 5px 4px; }
.vz-dynamic-programming-table .vz-cell { min-width: calc(var(--cell) * .85); height: calc(var(--cell) * .95); }
.vz-dynamic-programming-formula { font: 500 13.5px/1.4 var(--mono); color: var(--text-2); text-align: center; padding: 8px 12px; border: 1px dashed var(--line-2); border-radius: var(--r-sm); background: var(--panel); max-width: 100%; overflow-wrap: anywhere; }
.vz-dynamic-programming-formula b { color: var(--text); }
.vz-dynamic-programming-formula b.vz-dynamic-programming-good { color: var(--good); }
.vz-dynamic-programming-formula b.vz-dynamic-programming-bad { color: var(--bad); }
`,
};
