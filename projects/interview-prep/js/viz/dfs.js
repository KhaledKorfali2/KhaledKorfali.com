import { gridView, chips, stats, parseGrid } from "./kit.js";

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ISLAND = ["c0", "c1", "c2", "c3", "c4", "c5"];

// Number of Islands with an explicit stack, so every push/pop is visible.
export default {
  id: "dfs",
  title: "Count islands with depth-first search",
  blurb: "Each unvisited land cell starts a new island; DFS floods everything connected to it.",
  inputs: [
    { key: "grid", label: "grid (1 = land, 0 = water)", default: "11000\n11010\n00100\n00011", multiline: true, rows: 5, hint: "up to 7 rows × 9 columns" },
  ],
  presets: [
    { label: "Four islands", values: { grid: "11000\n11010\n00100\n00011" } },
    { label: "One big island", values: { grid: "11110\n11010\n11000\n00000" } },
    { label: "Checkerboard", values: { grid: "10101\n01010\n10101" } },
  ],
  parse(v) {
    return { grid: parseGrid(v.grid, { allowed: "01", maxRows: 7, maxCols: 9, label: "grid" }) };
  },
  code: [
    "for each cell (r, c):",
    "    if grid[r][c] == 1 and not seen:",
    "        islands += 1; push (r, c); mark seen",
    "        while stack:",
    "            r, c = stack.pop()",
    "            for each neighbour (nr, nc):",
    "                if land and not seen:",
    "                    push (nr, nc); mark seen",
    "return islands",
  ],
  steps({ grid }) {
    const R = grid.length, C = grid[0].length;
    const owner = grid.map((row) => row.map(() => -1)); // island index once popped
    const seen = grid.map((row) => row.map(() => false));
    const stack = [];
    const s = [];
    let islands = 0;
    const snap = (o) => s.push({ owner: owner.map((r) => [...r]), seen: seen.map((r) => [...r]), stack: stack.map((p) => [...p]), islands, ...o });
    snap({ line: 0, msg: "Scan the grid row by row for land that hasn't been visited." });
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      if (grid[r][c] !== "1" || seen[r][c]) continue;
      islands++;
      stack.push([r, c]); seen[r][c] = true;
      snap({ line: 2, cur: [r, c], msg: `(${r},${c}) is new land → island #${islands}. Push it.` });
      while (stack.length) {
        const [cr, cc] = stack.pop();
        owner[cr][cc] = islands - 1;
        snap({ line: 4, cur: [cr, cc], msg: `Pop (${cr},${cc}) and claim it for island #${islands}.` });
        const pushed = [];
        for (const [dr, dc] of DIRS) {
          const nr = cr + dr, nc = cc + dc;
          if (nr < 0 || nc < 0 || nr >= R || nc >= C || grid[nr][nc] !== "1" || seen[nr][nc]) continue;
          seen[nr][nc] = true; stack.push([nr, nc]); pushed.push(`(${nr},${nc})`);
        }
        if (pushed.length) snap({ line: 7, cur: [cr, cc], msg: `Push unvisited land neighbours: ${pushed.join(", ")}.` });
      }
      snap({ line: 1, msg: `Island #${islands} is fully explored. Keep scanning.` });
    }
    snap({ line: 8, done: true, msg: `Done: ${islands} island${islands === 1 ? "" : "s"}. Every cell was visited at most once → O(rows × cols).` });
    return s;
  },
  render(st, { grid }) {
    const inStack = new Set(st.stack.map(([r, c]) => r + "," + c));
    return gridView(grid, (r, c) => {
      const land = grid[r][c] === "1";
      const states = [];
      if (!land) states.push("water");
      else if (st.owner[r][c] >= 0) states.push(ISLAND[st.owner[r][c] % ISLAND.length]);
      else if (inStack.has(r + "," + c)) states.push("frontier");
      if (st.cur && st.cur[0] === r && st.cur[1] === c) states.push("active");
      return { text: land ? "1" : "0", states };
    }) + `<div class="vz-row">` +
      chips("stack (top →)", st.stack.map(([r, c], i) => ({ text: `(${r},${c})`, states: i === st.stack.length - 1 ? ["active"] : [] }))) +
      stats([["islands", st.islands, st.done ? ["good"] : []]]) + `</div>`;
  },
  legend: [["active", "current cell"], ["frontier", "on the stack"], ["c0", "claimed island"], ["water", "water"]],
};
