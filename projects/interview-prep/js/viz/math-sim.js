import { gridView, chips, stats, InputError } from "./kit.js";

const ARROW = { right: "→", down: "↓", left: "←", up: "↑" };

// Spiral Matrix: walk the outer ring, then shrink the four boundaries.
export default {
  id: "math-sim",
  title: "Spiral Matrix — read an m × n matrix in spiral order",
  blurb: "Walk right, down, left, up along four boundaries, pulling each boundary inward once its edge is read.",
  inputs: [
    { key: "matrix", label: "matrix (one row per line)", default: "1 2 3 4\n5 6 7 8\n9 10 11 12", multiline: true, rows: 5, hint: "up to 6 × 6, values −99..99" },
  ],
  presets: [
    { label: "3 × 4", values: { matrix: "1 2 3 4\n5 6 7 8\n9 10 11 12" } },
    { label: "4 × 4", values: { matrix: "1 2 3 4\n12 13 14 5\n11 16 15 6\n10 9 8 7" } },
    { label: "Single column", values: { matrix: "1\n2\n3\n4" } },
  ],
  parse(v) {
    const rows = String(v.matrix).replace(/\r/g, "").split("\n").map((r) => r.trim()).filter(Boolean);
    if (!rows.length) throw new InputError("matrix is empty.");
    if (rows.length > 6) throw new InputError("matrix: at most 6 rows.");
    const M = rows.map((r, i) => r.split(/[\s,]+/).filter(Boolean).map((x) => {
      if (!/^-?\d+$/.test(x)) throw new InputError(`matrix row ${i}: "${x}" isn't a whole number.`);
      const n = parseInt(x, 10);
      if (n < -99 || n > 99) throw new InputError("matrix: values must be between −99 and 99.");
      return n;
    }));
    if (M[0].length > 6) throw new InputError("matrix: at most 6 columns.");
    if (M.some((r) => r.length !== M[0].length)) throw new InputError("matrix: every row needs the same number of values.");
    return { M };
  },
  code: [
    "top, bot = 0, m - 1",
    "L, R = 0, n - 1  # left/right col",
    "while top <= bot and L <= R:",
    "    out += row top, L → R",
    "    top += 1",
    "    out += col R, top ↓ bot",
    "    R -= 1",
    "    if top <= bot:",
    "        out += row bot, R ← L",
    "        bot -= 1",
    "    if L <= R:",
    "        out += col L, bot ↑ top",
    "        L += 1",
    "return out",
  ],
  steps({ M }) {
    const m = M.length, n = M[0].length;
    let top = 0, bottom = m - 1, left = 0, right = n - 1;
    const out = [], seen = [];
    const s = [];
    const snap = (o) => s.push({ top, bottom, left, right, out: [...out], seen: seen.map((p) => [...p]), ...o });
    const take = (r, c, dir, line) => {
      out.push(M[r][c]); seen.push([r, c]);
      snap({ cur: [r, c], dir, line, msg: `Going ${dir} ${ARROW[dir]}: append M[${r}][${c}] = ${M[r][c]}.` });
    };
    snap({ line: [0, 1], msg: `Boundaries start at the edges of the ${m} × ${n} matrix: rows ${top}..${bottom}, columns ${left}..${right}.` });
    while (top <= bottom && left <= right) {
      for (let c = left; c <= right; c++) take(top, c, "right", 3);
      top++;
      snap({ line: 4, moved: "top", msg: `Top row done → top = ${top}.` });
      for (let r = top; r <= bottom; r++) take(r, right, "down", 5);
      right--;
      snap({ line: 6, moved: "right", msg: `Right column done → R = ${right}.` });
      if (top <= bottom) {
        for (let c = right; c >= left; c--) take(bottom, c, "left", 8);
        bottom--;
        snap({ line: 9, moved: "bottom", msg: `Bottom row done → bot = ${bottom}.` });
      } else snap({ line: 7, msg: `top (${top}) > bot (${bottom}): no row left to walk back along, skip ←.` });
      if (left <= right) {
        for (let r = bottom; r >= top; r--) take(r, left, "up", 11);
        left++;
        snap({ line: 12, moved: "left", msg: `Left column done → L = ${left}.` });
      } else snap({ line: 10, msg: `L (${left}) > R (${right}): no column left to climb, skip ↑.` });
    }
    snap({ line: 13, done: true, answer: [...out], msg: `Done: boundaries crossed, all ${m * n} values read once → O(m × n) time, O(1) extra space.` });
    return s;
  },
  render(st, { M }) {
    const idx = new Map(st.seen.map((p, i) => [p[0] + "," + p[1], i]));
    const inside = (r, c) => r >= st.top && r <= st.bottom && c >= st.left && c <= st.right;
    const grid = gridView(M, (r, c) => {
      const k = r + "," + c;
      let states;
      if (st.cur && st.cur[0] === r && st.cur[1] === c) states = ["active", "path"];
      else if (idx.has(k)) states = [st.done ? "good" : "visited"];
      else if (!st.done && inside(r, c)) states = ["window"];
      else states = [];
      return { text: String(M[r][c]), states };
    }, { label: "matrix" });
    const b = (k) => [{ bottom: "bot", left: "L", right: "R" }[k] || k, st[k], st.moved === k ? ["good"] : []];
    return grid +
      stats([["dir", st.done ? "✓" : st.dir ? ARROW[st.dir] : "→"], b("top"), b("bottom"), b("left"), b("right")]) +
      chips("output", st.out.map((x, i) => ({ text: String(x), states: [i === st.out.length - 1 && !st.done ? "active" : "good"] })), { note: `${st.out.length}/${M.length * M[0].length}` });
  },
  legend: [["active", "current cell"], ["window", "inside the boundaries"], ["visited", "already read"], ["good", "boundary just moved"]],
};
