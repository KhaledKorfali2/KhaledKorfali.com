import { arrayView, chips, stats, parseNumbers } from "./kit.js";

// Daily Temperatures: a stack of indices still waiting for a warmer day, kept with
// strictly decreasing temperatures. A warmer day resolves everyone colder on top.
export default {
  id: "monotonic-stack",
  title: "Daily temperatures (days until warmer)",
  blurb: "Days waiting for a warmer one sit on a decreasing stack; a warm day pops and answers them.",
  inputs: [
    { key: "t", label: "temperatures (°)", default: "73, 74, 75, 71, 69, 72, 76, 73", hint: "0–120, up to 10 values", wide: true },
  ],
  presets: [
    { label: "Example", values: { t: "73, 74, 75, 71, 69, 72, 76, 73" } },
    { label: "Cooling down", values: { t: "80, 70, 60, 50" } },
    { label: "Ties", values: { t: "60, 60, 61, 60, 60" } },
  ],
  parse(v) {
    return { t: parseNumbers(v.t, { min: 0, max: 120, maxLen: 10, label: "temperatures" }) };
  },
  code: [
    "ans = [0] * len(t)",
    "st = []  # indices, temps falling",
    "for i in range(len(t)):",
    "    while st and t[i] > t[st[-1]]:",
    "        j = st.pop()",
    "        ans[j] = i - j  # waited",
    "    st.append(i)",
    "return ans",
  ],
  steps({ t }) {
    const s = [];
    const ans = t.map(() => 0), set = t.map(() => false);
    const stack = [];
    const snap = (o) => s.push({ ans: [...ans], set: [...set], stack: [...stack], i: -1, ...o });
    snap({ line: [0, 1], msg: "Every answer starts at 0 (no warmer day yet); the stack is empty." });
    for (let i = 0; i < t.length; i++) {
      snap({ line: 2, i, msg: stack.length
        ? `Day ${i}: ${t[i]}°. Compare it with the coldest waiting day on top (day ${stack[stack.length - 1]}, ${t[stack[stack.length - 1]]}°).`
        : `Day ${i}: ${t[i]}°. Nobody is waiting.` });
      while (stack.length && t[i] > t[stack[stack.length - 1]]) {
        const j = stack.pop();
        ans[j] = i - j; set[j] = true;
        snap({ line: [3, 4, 5], i, j, msg: `${t[i]}° > ${t[j]}°: day ${j} finally gets a warmer day, ${i - j} day${i - j === 1 ? "" : "s"} later. Pop it.` });
      }
      stack.push(i);
      const top = stack.length > 1 ? stack[stack.length - 2] : -1;
      snap({ line: 6, i, pushed: true, msg: top >= 0
        ? `${t[i]}° ≤ ${t[top]}° below it, so stop popping. Push day ${i}; it waits too.`
        : `Push day ${i}; it waits for something warmer.` });
    }
    snap({ line: 7, done: true, answer: [...ans], msg: `Done${stack.length ? `; day${stack.length > 1 ? "s" : ""} ${stack.join(", ")} never warm${stack.length > 1 ? "" : "s"} up, so keep 0` : ""}. Each day is pushed and popped at most once → O(n).` });
    return s;
  },
  render(st, { t }) {
    const onStack = new Set(st.stack);
    const temps = arrayView(t, {
      label: "temperatures (°)",
      states: (i) => {
        if (i === st.j) return ["good"];
        if (i === st.i) return ["active"];
        if (onStack.has(i)) return ["window"];
        if (!st.done && i > st.i) return ["dim"];
        return [];
      },
      pointers: (i) => (i === st.i ? ["i"] : i === st.j ? ["j"] : []),
    });
    const answers = arrayView(st.ans, {
      label: "ans (days to wait)",
      states: (i) => [i === st.j ? "good" : st.set[i] ? "visited" : st.done ? "" : "dim"],
    });
    return `<div class="vz-monotonic-stack-fit">${temps}</div><div class="vz-monotonic-stack-fit">${answers}</div>` + `<div class="vz-row">` +
      chips("stack (bottom → top)", st.stack.map((i, k) => ({ text: `d${i}: ${t[i]}°`, states: [k === st.stack.length - 1 ? "active" : "window"] }))) +
      stats([["waiting", st.stack.length]]) + `</div>`;
  },
  legend: [["active", "today"], ["window", "waiting on the stack"], ["good", "answered now"], ["visited", "answered"]],
  css: `
.vz-monotonic-stack-fit { width: 100%; display: flex; flex-direction: column; align-items: center; }
.vz-monotonic-stack-fit .vz-array { flex-wrap: nowrap; width: 100%; }
.vz-monotonic-stack-fit .vz-col { flex: 0 1 var(--cell); min-width: 0; }
.vz-monotonic-stack-fit .vz-cell { min-width: 0; width: 100%; padding: 0; }
@media (max-width: 600px) { .vz-monotonic-stack-fit .vz-array { gap: 3px; } .vz-monotonic-stack-fit .vz-cell { font-size: 11px; } }`,
};
