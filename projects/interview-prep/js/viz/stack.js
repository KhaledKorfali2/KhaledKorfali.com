import { arrayView, stats, esc, InputError } from "./kit.js";

// Valid Parentheses: the most recent unmatched opener must be closed first —
// exactly last-in, first-out.
const OPEN = "([{", CLOSE = ")]}";
const PAIR = { ")": "(", "]": "[", "}": "{" };

export default {
  id: "stack",
  title: "Valid parentheses",
  blurb: "Push every opener; each closer must match the opener on top of the stack.",
  inputs: [
    { key: "s", label: "s (brackets only)", default: "{[()()]}", hint: "()[]{} only, up to 16 characters", wide: true },
  ],
  presets: [
    { label: "Valid", values: { s: "{[()()]}" } },
    { label: "Mismatch", values: { s: "([)]" } },
    { label: "Leftover", values: { s: "(()[]" } },
  ],
  parse(v) {
    const s = String(v.s).replace(/\s+/g, "");
    const bad = [...s].find((c) => !(OPEN + CLOSE).includes(c));
    if (bad !== undefined) throw new InputError(`s may only contain ( ) [ ] { } — found "${bad}".`);
    if (s.length > 16) throw new InputError("s can have at most 16 characters.");
    return { s: [...s] };
  },
  code: [
    "pairs = {')':'(',']':'[','}':'{'}",
    "stack = []",
    "for ch in s:",
    "    if ch in '([{':",
    "        stack.append(ch)",
    "    elif not stack:",
    "        return False  # none open",
    "    elif stack.pop() != pairs[ch]:",
    "        return False  # mismatch",
    "return not stack",
  ],
  steps({ s }) {
    const out = [];
    const stack = []; // indices into s
    const matched = []; // indices matched so far
    const snap = (o) => out.push({ stack: [...stack], matched: [...matched], i: -1, ...o });
    snap({ line: [0, 1], msg: s.length ? "Start with an empty stack of unmatched openers." : "The string is empty — nothing to match." });
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (OPEN.includes(ch)) {
        stack.push(i);
        snap({ line: [3, 4], i, msg: `'${ch}' opens a group: push it. It must be closed before anything below it.` });
      } else if (!stack.length) {
        snap({ line: [5, 6], i, bad: "empty", done: true, answer: false, msg: `'${ch}' has nothing to close — the stack is empty. Invalid.` });
        return out;
      } else {
        const top = stack.pop();
        if (s[top] !== PAIR[ch]) {
          snap({ line: [7, 8], i, bad: "mismatch", top, done: true, answer: false, msg: `'${ch}' needs '${PAIR[ch]}' but the top is '${s[top]}' (index ${top}). Invalid.` });
          return out;
        }
        matched.push(top, i);
        snap({ line: 7, i, top, msg: `'${ch}' matches the '${s[top]}' on top (index ${top}): pop it.` });
      }
    }
    const ok = stack.length === 0;
    snap({ line: 9, done: true, answer: ok, msg: ok
      ? `Every opener was closed in the right order → valid. One pass, O(n).`
      : `Reached the end with ${stack.length} unclosed opener${stack.length === 1 ? "" : "s"} (${stack.map((j) => `'${s[j]}'`).join(" ")}) → invalid.` });
    return out;
  },
  render(st, { s }) {
    const onStack = new Set(st.stack), done = new Set(st.matched);
    const arr = arrayView(s, {
      states: (i) => {
        if (i === st.i) return [st.bad ? "bad" : st.top !== undefined ? "good" : "active"];
        if (st.bad === "mismatch" && i === st.top) return ["bad"];
        if (st.top === i) return ["good"];
        if (onStack.has(i)) return [st.done && st.answer === false && !st.bad ? "bad" : "window"];
        if (st.done && st.answer) return ["good"];
        if (done.has(i)) return ["visited"];
        return i > st.i ? ["dim"] : [];
      },
      pointers: (i) => (i === st.i ? ["ch"] : []),
    });
    const items = st.stack.map((j, k) => {
      const top = k === st.stack.length - 1;
      return `<div class="vz-stack-item${top ? " is-top" : ""}"><span class="vz-chip ${top ? "is-active" : ""}">${esc(s[j])}</span><span class="vz-stack-ix">${j}</span></div>`;
    }).join("");
    // a "ghost" of what was just popped/compared sits above the top
    const ghost = st.top !== undefined
      ? `<div class="vz-stack-item vz-stack-ghost"><span class="vz-chip ${st.bad ? "is-bad" : "is-good"}">${esc(s[st.top])}</span><span class="vz-stack-ix">${st.bad ? "≠" : "popped"}</span></div>`
      : "";
    const stackHtml = `<div class="vz-panel vz-stack-panel"><div class="vz-panel-head"><span class="vz-label">stack (bottom → top)</span></div>
      <div class="vz-stack-row">${items || (ghost ? "" : `<span class="vz-chip is-empty">empty</span>`)}${ghost}</div></div>`;
    return `<div class="vz-stack-fit">${arr}</div>` + `<div class="vz-row">${stackHtml}` + stats([
      ["depth", st.stack.length],
      ...(st.done ? [["valid?", st.answer ? "True" : "False", st.answer ? ["good"] : ["bad"]]] : []),
    ]) + `</div>`;
  },
  legend: [["active", "current char"], ["window", "waiting on the stack"], ["good", "matched pair"], ["visited", "already matched"], ["bad", "mismatch / unclosed"]],
  css: `
.vz-stack-fit { width: 100%; display: flex; flex-direction: column; align-items: center; }
.vz-stack-fit .vz-array { flex-wrap: nowrap; width: 100%; }
.vz-stack-fit .vz-col { flex: 0 1 var(--cell); min-width: 0; }
.vz-stack-fit .vz-cell { min-width: 0; width: 100%; padding: 0; }
@media (max-width: 600px) { .vz-stack-fit .vz-array { gap: 2px; } .vz-stack-fit .vz-cell { font-size: 13px; } }
.vz-stack-row { display: flex; flex-wrap: wrap; gap: 5px; align-items: flex-start; }
.vz-stack-item { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.vz-stack-item .vz-chip { font-size: 15px; font-weight: 700; padding: 7px 10px; }
.vz-stack-ix { font: 500 9.5px/1 var(--mono); color: var(--text-3); }
.vz-stack-ghost { margin-left: 6px; padding-left: 10px; border-left: 1.5px dashed var(--line-2); }`,
};
