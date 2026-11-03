import { graphView, layoutTree, chips, stats, parseWords, InputError } from "./kit.js";

const WORD = /^[a-z]{1,6}$/;

// Implement Trie: insert(), search() and startsWith(). Node ids are the
// prefix they spell ("" is the root), so the drawing stays stable.
export default {
  id: "trie",
  title: "Implement a Trie — insert, search and startsWith",
  blurb: "Words that share a prefix share a path; a lookup costs one step per letter, no matter how many words are stored.",
  inputs: [
    { key: "words", label: "insert words", default: "car, cat, cart, dog, do", wide: true, hint: "up to 6 words, a–z, ≤ 6 letters" },
    { key: "search", label: "search(word)", default: "car" },
    { key: "prefix", label: "startsWith(prefix)", default: "ca" },
  ],
  presets: [
    { label: "Shared prefixes", values: { words: "car, cat, cart, dog, do", search: "car", prefix: "ca" } },
    { label: "Prefix ≠ word", values: { words: "apple, app, apply, ape", search: "appl", prefix: "appl" } },
    { label: "Not found", values: { words: "tea, ten, to, inn", search: "tent", prefix: "z" } },
  ],
  parse(v) {
    const words = parseWords(v.words, { maxLen: 6, maxWordLen: 6, label: "words" });
    const search = String(v.search).trim().toLowerCase();
    const prefix = String(v.prefix).trim().toLowerCase();
    if (!WORD.test(search)) throw new InputError("search: one word of 1–6 letters a–z.");
    if (!WORD.test(prefix)) throw new InputError("startsWith: a prefix of 1–6 letters a–z.");
    const prefixes = new Set();
    words.forEach((w) => { for (let i = 1; i <= w.length; i++) prefixes.add(w.slice(0, i)); });
    if (prefixes.size > 20) throw new InputError(`Those words need ${prefixes.size} trie nodes; keep it to 20 so the tree fits.`);
    return { words, search, prefix };
  },
  code: [
    "def insert(word):",
    "    node = root",
    "    for ch in word:",
    "        if ch not in node.kids:",
    "            node.kids[ch] = Node()",
    "        node = node.kids[ch]",
    "    node.is_end = True",
    "def walk(s, node=root):",
    "    for ch in s:",
    "        node = node.kids.get(ch)",
    "        if not node: return None",
    "    return node",
    "search: walk(w) and walk(w).is_end",
    "startsWith: walk(p) is not None",
  ],
  steps({ words, search, prefix }) {
    const nodes = new Set([""]), ends = new Set();
    const s = [];
    const snap = (o) => s.push({ nodes: new Set(nodes), ends: new Set(ends), ...o });
    snap({ line: [0, 1], msg: `Start with an empty root. Insert ${words.length} word${words.length === 1 ? "" : "s"}, letter by letter.` });
    words.forEach((w, wi) => {
      for (let i = 1; i <= w.length; i++) {
        const p = w.slice(0, i), ch = w[i - 1];
        const isNew = !nodes.has(p);
        nodes.add(p);
        snap({ phase: "insert", wi, cur: p, path: w.slice(0, i), created: isNew ? p : null, line: isNew ? [2, 3, 4, 5] : [2, 5], msg: isNew
          ? `"${w}": no child '${ch}' under "${p.slice(0, -1) || "root"}", so create it and step down.`
          : `"${w}": '${ch}' already exists (shared prefix "${p}") — just step down.` });
      }
      const dup = ends.has(w);
      ends.add(w);
      snap({ phase: "insert", wi, cur: w, path: w, line: 6, msg: dup
        ? `"${w}" was already marked as a word; nothing changes.`
        : `Mark the node for "${w}" as end-of-word.` });
    });
    const walk = (str, kind) => {
      snap({ phase: kind, cur: "", path: "", line: kind === "search" ? [12, 7] : [13, 7], msg: `${kind === "search" ? `search("${str}")` : `startsWith("${str}")`}: start at the root.` });
      for (let i = 1; i <= str.length; i++) {
        const p = str.slice(0, i), ch = str[i - 1];
        if (!nodes.has(p)) {
          snap({ phase: kind, cur: p.slice(0, -1), path: p.slice(0, -1), miss: ch, line: [9, 10], msg: `No child '${ch}' under "${p.slice(0, -1) || "root"}" → walk returns None, so ${kind === "search" ? "the word isn't stored" : `no word starts with "${str}"`}.` });
          return null;
        }
        snap({ phase: kind, cur: p, path: p, line: 9, msg: `Follow '${ch}' → "${p}".` });
      }
      return str;
    };
    const ws = walk(search, "search");
    const found = ws !== null && ends.has(ws);
    if (ws !== null) snap({ phase: "search", cur: ws, path: ws, line: 12, result: found, msg: found
      ? `Reached "${search}" and it's marked end-of-word → search returns True.`
      : `Reached "${search}", but it isn't marked end-of-word (only a prefix) → search returns False.` });
    const wp = walk(prefix, "prefix");
    const pre = wp !== null;
    if (pre) snap({ phase: "prefix", cur: wp, path: wp, line: 13, result: true, msg: `The path "${prefix}" exists → startsWith returns True.` });
    const answer = { search: found, prefix: pre };
    snap({ line: [12, 13], done: true, answer, msg: `Done: search("${search}") = ${found ? "True" : "False"}, startsWith("${prefix}") = ${pre ? "True" : "False"}. Each costs O(length of the query), independent of how many words are stored.` });
    return s;
  },
  render(st, { words, search, prefix }) {
    const build = (p) => {
      const kids = [...st.nodes].filter((q) => q.length === p.length + 1 && q.startsWith(p)).sort();
      return { id: p, label: p === "" ? "·" : p[p.length - 1], children: kids.map(build) };
    };
    const R = 5.6;
    const t = layoutTree(build(""), { levelGap: 13.5, top: 6.5 });
    const path = st.path ?? null;
    const onPath = (id) => path !== null && path.startsWith(id);
    const nodes = t.nodes.map((nd) => {
      let states = [];
      if (nd.id === st.cur && st.miss) states = ["bad"];
      else if (nd.id === st.cur && !st.done) states = [st.result === false ? "bad" : st.result ? "good" : "active"];
      else if (!st.done && onPath(nd.id)) states = ["path"];
      else if (nd.id === st.created) states = ["frontier"];
      return { id: nd.id, x: nd.x, y: nd.y, label: nd.label, states };
    });
    const tEdges = t.edges.map((e) => ({ ...e, states: !st.done && onPath(e.b) ? ["path"] : [] }));
    const q = st.phase === "search" ? search : st.phase === "prefix" ? prefix : null;
    const verdict = (k) => (st.answer ? (st.answer[k] ? "True" : "False") : "?");
    let svg = graphView(nodes, tEdges, { height: t.height, r: R, label: "trie (double ring = end of a word)" });
    // end-of-word marker: an inner ring drawn inside the node's own <g>
    for (const nd of nodes) if (st.ends.has(nd.id)) {
      const c = `<circle cx="${nd.x}" cy="${nd.y}" r="${R}"/>`;
      svg = svg.replace(c, c + `<circle class="vz-trie-end" cx="${nd.x}" cy="${nd.y}" r="${R - 1.3}"/>`);
    }
    return `<div class="vz-trie-g">${svg}</div>` +
      `<div class="vz-row">` +
      chips(q ? (st.phase === "search" ? "search" : "startsWith") : "insert", q
        ? q.split("").map((ch, i) => ({ text: ch, states: [i < (st.path || "").length ? "path" : i === (st.path || "").length && st.miss ? "bad" : ""] }))
        : words.map((w, i) => ({ text: w, states: [st.done || i < (st.wi ?? -1) ? "good" : i === st.wi ? "active" : ""] }))) +
      stats([
        [`search("${search}")`, verdict("search"), st.answer ? [st.answer.search ? "good" : "bad"] : []],
        [`startsWith("${prefix}")`, verdict("prefix"), st.answer ? [st.answer.prefix ? "good" : "bad"] : []],
      ]) + `</div>`;
  },
  legend: [["path", "walk so far"], ["active", "current node"], ["frontier", "just created"], ["good", "end of a word (inner ring)"], ["bad", "missing letter"]],
  css: `
.vz-trie-g { width: 100%; display: flex; flex-direction: column; align-items: center; }
.vz-trie-g .vz-graph-wrap { max-width: 440px; }
.vz-trie-g .vz-node text { font-size: 4.7px; }
.vz-trie-g .vz-node .vz-badge { font-size: 3.8px; }
.vz-trie-g .vz-elabel { font-size: 4.3px; stroke-width: 1.5px; }
.vz-trie-g .vz-node circle.vz-trie-end { fill: none; stroke: var(--good); stroke-width: .7; }
`,
};
