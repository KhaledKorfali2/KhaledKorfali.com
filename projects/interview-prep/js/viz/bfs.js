import { gridView, chips, stats, parseGrid, InputError } from "./kit.js";

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// Rotting Oranges: multi-source BFS. Every rotten orange starts in the queue;
// each BFS level is one minute, so the level count is the answer.
export default {
  id: "bfs",
  title: "Rotting Oranges — minutes until every orange rots",
  blurb: "Start BFS from every rotten orange at once; each level of the queue is one minute.",
  inputs: [
    { key: "grid", label: "grid (0 = empty, 1 = fresh, 2 = rotten)", default: "2110\n1100\n0111\n0011", multiline: true, rows: 5, hint: "up to 6 rows × 7 columns" },
  ],
  presets: [
    { label: "Example", values: { grid: "2110\n1100\n0111\n0011" } },
    { label: "Two sources", values: { grid: "21100\n11011\n00112" } },
    { label: "Unreachable (−1)", values: { grid: "2110\n0110\n1001" } },
  ],
  parse(v) {
    const grid = parseGrid(v.grid, { allowed: "012", maxRows: 6, maxCols: 7, label: "grid" }).map((r) => r.map(Number));
    return { grid };
  },
  code: [
    "q = deque(all rotten cells)",
    "fresh = count of 1s; minutes = 0",
    "while q and fresh > 0:",
    "    minutes += 1",
    "    for _ in range(len(q)):",
    "        r, c = q.popleft()",
    "        for nr, nc in nbrs(r, c):",
    "            if grid[nr][nc] == 1:",
    "                grid[nr][nc] = 2",
    "                fresh -= 1",
    "                q.append((nr, nc))",
    "return -1 if fresh else minutes",
  ],
  steps({ grid: g0 }) {
    const R = g0.length, C = g0[0].length;
    const grid = g0.map((r) => [...r]);
    const time = g0.map((r) => r.map((x) => (x === 2 ? 0 : -1))); // minute each orange rotted
    let queue = [];
    let fresh = 0;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      if (grid[r][c] === 2) queue.push([r, c]);
      else if (grid[r][c] === 1) fresh++;
    }
    let minutes = 0;
    let level = []; // cells of the level being processed (not yet popped)
    const s = [];
    const snap = (o) => s.push({
      grid: grid.map((r) => [...r]), time: time.map((r) => [...r]),
      level: level.map((p) => [...p]), next: queue.map((p) => [...p]), minutes, fresh, ...o,
    });
    snap({ line: [0, 1], msg: `${queue.length} rotten orange${queue.length === 1 ? "" : "s"} go into the queue together; ${fresh} fresh orange${fresh === 1 ? "" : "s"} to reach.` });
    while (queue.length && fresh > 0) {
      minutes++;
      level = queue; queue = [];
      snap({ line: [3, 4], msg: `Minute ${minutes}: the ${level.length} cell${level.length === 1 ? "" : "s"} in the queue spread rot to their neighbours.` });
      while (level.length) {
        const [r, c] = level.shift();
        const rotted = [];
        for (const [dr, dc] of DIRS) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= R || nc >= C || grid[nr][nc] !== 1) continue;
          grid[nr][nc] = 2; time[nr][nc] = minutes; fresh--;
          queue.push([nr, nc]); rotted.push(`(${nr},${nc})`);
        }
        snap({ cur: [r, c], line: rotted.length ? [5, 8, 9, 10] : [5, 6, 7], msg: rotted.length
          ? `Pop (${r},${c}): it rots ${rotted.join(", ")} — they join the queue for minute ${minutes + 1}.`
          : `Pop (${r},${c}): no fresh neighbours, nothing to rot.` });
      }
    }
    level = [];
    const answer = fresh === 0 ? minutes : -1;
    snap({ line: 11, done: true, answer, msg: answer === -1
      ? `Done: ${fresh} fresh orange${fresh === 1 ? " is" : "s are"} walled off from all rot → return -1.`
      : `Done: every orange rots after ${minutes} minute${minutes === 1 ? "" : "s"}. Each cell entered the queue at most once → O(rows × cols).` });
    return s;
  },
  render(st) {
    const key = (p) => p[0] + "," + p[1];
    const lvl = new Set(st.level.map(key)), nxt = new Set(st.next.map(key));
    const grid = gridView(st.grid, (r, c) => {
      const v = st.grid[r][c];
      const states = [];
      let text = "";
      if (v === 0) states.push("water");
      else if (v === 1) { states.push("good"); if (st.done) states.push("active"); }
      else {
        text = String(st.time[r][c]);
        if (!st.done && nxt.has(r + "," + c)) states.push("frontier");
        else if (!st.done && lvl.has(r + "," + c)) states.push("window");
        else states.push("bad");
      }
      if (st.cur && st.cur[0] === r && st.cur[1] === c) states.push("active");
      return { text, states };
    });
    const q = [
      ...st.level.map((p) => ({ text: `(${p[0]},${p[1]})`, states: ["window"] })),
      ...st.next.map((p) => ({ text: `(${p[0]},${p[1]})`, states: ["frontier"] })),
    ];
    return grid + `<div class="vz-row">` +
      chips("queue (front →)", st.done ? [] : q, { note: st.done ? "" : `minute ${st.minutes} · next` }) +
      stats([
        ["minute", st.minutes],
        ["fresh left", st.fresh, st.done && st.fresh ? ["bad"] : []],
        ...(st.done ? [["answer", st.answer, [st.answer === -1 ? "bad" : "good"]]] : []),
      ]) + `</div>`;
  },
  legend: [["good", "fresh"], ["bad", "rotten (minute it rotted)"], ["window", "this minute's queue"], ["frontier", "queued for next minute"], ["active", "current"]],
};
