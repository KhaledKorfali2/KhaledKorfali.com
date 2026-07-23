/* ============================== vim-sim/buffer.js ==============================
   Pure functions over a `lines` array (array of strings) and `{line,col}`
   positions. Nothing here holds state — every function takes the buffer
   and a position and returns a new position or range. This is the layer
   every motion, text object, and the grammar parser is built on.

   Positions are 0-indexed. A "range" is {start:{line,col}, end:{line,col}}
   and is always inclusive on both ends unless noted otherwise — the
   grammar layer is responsible for exclusive/inclusive operator semantics.
================================================================================== */
window.VimBuffer = (function () {
  const lineAt = (lines, l) => (lines[l] !== undefined ? lines[l] : "");

  function clampLine(lines, l) { return Math.max(0, Math.min(lines.length - 1, l)); }
  function lastCol(lines, l) { return Math.max(0, lineAt(lines, l).length - 1); }
  function clampCol(lines, l, c) { return Math.max(0, Math.min(lastCol(lines, l), c)); }
  function clampPos(lines, pos) { const l = clampLine(lines, pos.line); return { line: l, col: clampCol(lines, l, pos.col) }; }

  function firstNonBlankCol(lineText) {
    const m = lineText.match(/\S/);
    return m ? m.index : 0;
  }

  // The on-screen column a buffer column maps to, once tab characters are
  // expanded to their tabstop-aligned width — used both for rendering a
  // line with real tab characters in it, and for computing how many spaces
  // a Tab keypress should insert when expandtab is on.
  function visualColumn(lineText, col, tabstop) {
    let vcol = 0;
    for (let i = 0; i < col && i < lineText.length; i++) {
      vcol = lineText[i] === "\t" ? (Math.floor(vcol / tabstop) + 1) * tabstop : vcol + 1;
    }
    return vcol;
  }

  /* ---- flatten <-> {line,col} index conversion (makes cross-line motions simple) ---- */
  function flatten(lines) { return lines.join("\n"); }
  function toIndex(lines, pos) {
    let idx = 0;
    for (let i = 0; i < pos.line; i++) idx += lineAt(lines, i).length + 1;
    return idx + pos.col;
  }
  function toPos(lines, idx) {
    let remaining = idx;
    for (let line = 0; line < lines.length; line++) {
      const len = lineAt(lines, line).length;
      if (remaining <= len) return { line, col: remaining };
      remaining -= len + 1;
    }
    const last = lines.length - 1;
    return { line: last, col: lineAt(lines, last).length };
  }

  function charClass(ch) {
    if (ch === undefined || ch === "") return "eol";
    if (/\s/.test(ch)) return "space";
    if (/[A-Za-z0-9_]/.test(ch)) return "word";
    return "punct";
  }

  // WORD motions (W/B/E/gE) collapse word and punct into a single class —
  // real Vim's WORD is "anything that isn't whitespace", full stop, unlike
  // lowercase word motions which stop separately at punctuation.
  function charClassBig(ch) {
    if (ch === undefined || ch === "") return "eol";
    if (/\s/.test(ch)) return "space";
    return "word";
  }

  /* --------------------------------- word motions --------------------------------- */
  function wordForward(lines, pos, big) {
    const classify = big ? charClassBig : charClass;
    const text = flatten(lines);
    const n = text.length;
    let i = toIndex(lines, pos);
    const cls = (k) => (k >= n ? "eol" : classify(text[k]));
    const startCls = cls(i);
    if (startCls !== "space") { while (i < n && cls(i) === startCls) i++; }
    while (i < n && cls(i) === "space") {
      i++;
      const p = toPos(lines, i);
      if (lineAt(lines, p.line).length === 0 && p.col === 0) return p; // blank line is its own stop
    }
    return i >= n ? toPos(lines, n) : toPos(lines, i);
  }

  function wordBackward(lines, pos, big) {
    const classify = big ? charClassBig : charClass;
    const text = flatten(lines);
    let i = toIndex(lines, pos);
    const cls = (k) => (k < 0 ? "eol" : classify(text[k]));
    i--;
    while (i >= 0 && cls(i) === "space") i--;
    if (i < 0) return toPos(lines, 0);
    const c = cls(i);
    while (i - 1 >= 0 && cls(i - 1) === c) i--;
    return toPos(lines, i);
  }

  function wordEnd(lines, pos, big) {
    const classify = big ? charClassBig : charClass;
    const text = flatten(lines);
    const n = text.length;
    let i = toIndex(lines, pos);
    const cls = (k) => (k < 0 || k >= n ? "eol" : classify(text[k]));
    const startCls = cls(i);
    const atEnd = startCls !== "space" && cls(i + 1) !== startCls;
    if (atEnd || startCls === "space") {
      i++;
      while (i < n && cls(i) === "space") i++;
    }
    if (i >= n) return toPos(lines, Math.max(0, n - 1));
    const c = cls(i);
    if (c === "space") return toPos(lines, Math.max(0, n - 1));
    while (i + 1 < n && cls(i + 1) === c) i++;
    return toPos(lines, i);
  }

  function wordEndBackward(lines, pos, big) {
    const classify = big ? charClassBig : charClass;
    const text = flatten(lines);
    const n = text.length;
    let i = toIndex(lines, pos);
    const cls = (k) => (k < 0 || k >= n ? "eol" : classify(text[k]));
    const startCls = cls(i);
    if (startCls !== "space") { while (i - 1 >= 0 && cls(i - 1) === startCls) i--; }
    i--;
    while (i >= 0 && cls(i) === "space") i--;
    return i < 0 ? toPos(lines, 0) : toPos(lines, i);
  }

  /* --------------------------------- find/till motions --------------------------------- */
  function findCharForward(lines, pos, ch, till) {
    const lineText = lineAt(lines, pos.line);
    for (let c = pos.col + 1; c < lineText.length; c++) {
      if (lineText[c] === ch) return { line: pos.line, col: till ? c - 1 : c };
    }
    return null;
  }
  function findCharBackward(lines, pos, ch, till) {
    const lineText = lineAt(lines, pos.line);
    for (let c = pos.col - 1; c >= 0; c--) {
      if (lineText[c] === ch) return { line: pos.line, col: till ? c + 1 : c };
    }
    return null;
  }

  /* --------------------------------- % bracket match --------------------------------- */
  const OPEN_TO_CLOSE = { "(": ")", "[": "]", "{": "}" };
  const CLOSE_TO_OPEN = { ")": "(", "]": "[", "}": "{" };
  function matchPercent(lines, pos) {
    const lineText = lineAt(lines, pos.line);
    let col = pos.col;
    while (col < lineText.length && !"()[]{}".includes(lineText[col])) col++;
    if (col >= lineText.length) return null;
    const ch = lineText[col];
    const text = flatten(lines);
    const i = toIndex(lines, { line: pos.line, col });
    if (OPEN_TO_CLOSE[ch]) {
      const close = OPEN_TO_CLOSE[ch];
      let depth = 0;
      for (let k = i; k < text.length; k++) {
        if (text[k] === ch) depth++;
        else if (text[k] === close) { depth--; if (depth === 0) return toPos(lines, k); }
      }
    } else {
      const open = CLOSE_TO_OPEN[ch];
      let depth = 0;
      for (let k = i; k >= 0; k--) {
        if (text[k] === ch) depth++;
        else if (text[k] === open) { depth--; if (depth === 0) return toPos(lines, k); }
      }
    }
    return null;
  }

  /* --------------------------------- paragraph motions --------------------------------- */
  function paragraphForward(lines, pos) {
    let l = pos.line;
    while (l < lines.length - 1) { l++; if (lineAt(lines, l).trim() === "") return { line: l, col: 0 }; }
    return { line: lines.length - 1, col: lastCol(lines, lines.length - 1) };
  }
  function paragraphBackward(lines, pos) {
    let l = pos.line;
    while (l > 0) { l--; if (lineAt(lines, l).trim() === "") return { line: l, col: 0 }; }
    return { line: 0, col: 0 };
  }

  /* --------------------------------- sentence motions --------------------------------- */
  // Simplified vs. real Vim (which also breaks on blank lines/paragraph
  // boundaries): a sentence here ends at '.', '!', or '?', optionally
  // followed by closing punctuation (')' ']' '"' '''), followed by
  // whitespace or end of text. Good enough to teach the ( ) motions and
  // is/as text object without modeling every real-Vim edge case.
  function sentenceBoundaries(text) {
    const starts = [0];
    const re = /[.!?]+/g;
    let m;
    while ((m = re.exec(text))) {
      let j = m.index + m[0].length;
      while (j < text.length && ")]\"'".includes(text[j])) j++;
      if (j < text.length && !/\s/.test(text[j])) continue; // not actually a sentence end (e.g. "e.g.")
      while (j < text.length && /\s/.test(text[j])) j++;
      if (j < text.length && starts[starts.length - 1] !== j) starts.push(j);
    }
    return starts;
  }
  function sentenceForward(lines, pos) {
    const text = flatten(lines);
    const starts = sentenceBoundaries(text);
    const i = toIndex(lines, pos);
    const next = starts.find((s) => s > i);
    return toPos(lines, next !== undefined ? next : text.length);
  }
  function sentenceBackward(lines, pos) {
    const text = flatten(lines);
    const starts = sentenceBoundaries(text);
    const i = toIndex(lines, pos);
    const before = starts.filter((s) => s < i);
    return toPos(lines, before.length ? before[before.length - 1] : 0);
  }
  function textObjectSentence(lines, pos, around) {
    const text = flatten(lines);
    const starts = sentenceBoundaries(text);
    const i = toIndex(lines, pos);
    const upTo = starts.filter((s) => s <= i);
    const start = upTo.length ? upTo[upTo.length - 1] : 0;
    const after = starts.filter((s) => s > i);
    const nextStart = after.length ? after[0] : text.length;
    if (nextStart <= start) return null;
    if (around) return { start: toPos(lines, start), end: toPos(lines, nextStart - 1), linewise: false };
    let innerEnd = nextStart - 1;
    while (innerEnd > start && /\s/.test(text[innerEnd])) innerEnd--;
    return { start: toPos(lines, start), end: toPos(lines, Math.max(start, innerEnd)), linewise: false };
  }

  /* --------------------------------- text objects --------------------------------- */
  function textObjectWord(lines, pos, around) {
    const text = flatten(lines);
    const n = text.length;
    let i = toIndex(lines, pos);
    if (i >= n) return null;
    const cls = (k) => charClass(text[k]);
    const startCls = cls(i);
    let s = i, e = i;
    while (s > 0 && cls(s - 1) === startCls) s--;
    while (e < n - 1 && cls(e + 1) === startCls) e++;
    if (around) {
      if (e + 1 < n && cls(e + 1) === "space") { while (e + 1 < n && cls(e + 1) === "space") e++; }
      else if (s > 0 && cls(s - 1) === "space") { while (s > 0 && cls(s - 1) === "space") s--; }
    }
    return { start: toPos(lines, s), end: toPos(lines, e), linewise: false };
  }

  function textObjectQuote(lines, pos, quoteChar, around) {
    const lineText = lineAt(lines, pos.line);
    const idxs = [];
    for (let k = 0; k < lineText.length; k++) if (lineText[k] === quoteChar) idxs.push(k);
    for (let m = 0; m + 1 < idxs.length; m += 2) {
      const a = idxs[m], b = idxs[m + 1];
      if (pos.col <= b) {
        if (around) return { start: { line: pos.line, col: a }, end: { line: pos.line, col: b }, linewise: false };
        if (a + 1 > b - 1) return { start: { line: pos.line, col: a + 1 }, end: { line: pos.line, col: a }, linewise: false, empty: true };
        return { start: { line: pos.line, col: a + 1 }, end: { line: pos.line, col: b - 1 }, linewise: false };
      }
    }
    return null;
  }

  function textObjectPair(lines, pos, open, close, around) {
    const text = flatten(lines);
    const i = toIndex(lines, pos);
    let depth = 0, s = -1;
    for (let k = i; k >= 0; k--) {
      if (text[k] === close && k !== i) depth++;
      else if (text[k] === open) { if (depth === 0) { s = k; break; } depth--; }
    }
    if (s === -1) return null;
    let depth2 = 0, e = -1;
    for (let k = s + 1; k < text.length; k++) {
      if (text[k] === open) depth2++;
      else if (text[k] === close) { if (depth2 === 0) { e = k; break; } depth2--; }
    }
    if (e === -1) return null;
    if (around) return { start: toPos(lines, s), end: toPos(lines, e), linewise: false };
    if (s + 1 > e - 1) return { start: toPos(lines, s + 1), end: toPos(lines, s), linewise: false, empty: true };
    return { start: toPos(lines, s + 1), end: toPos(lines, e - 1), linewise: false };
  }

  function textObjectParagraph(lines, pos, around) {
    const isBlank = (l) => lineAt(lines, l).trim() === "";
    const curBlank = isBlank(pos.line);
    let s = pos.line, e = pos.line;
    while (s > 0 && isBlank(s - 1) === curBlank) s--;
    while (e < lines.length - 1 && isBlank(e + 1) === curBlank) e++;
    if (around) {
      if (e < lines.length - 1 && isBlank(e + 1) !== curBlank) {
        let e2 = e + 1;
        while (e2 < lines.length - 1 && isBlank(e2 + 1) !== curBlank) e2++;
        e = e2;
      } else if (s > 0 && isBlank(s - 1) !== curBlank) {
        let s2 = s - 1;
        while (s2 > 0 && isBlank(s2 - 1) !== curBlank) s2--;
        s = s2;
      }
    }
    return { start: { line: s, col: 0 }, end: { line: e, col: lastCol(lines, e) }, linewise: true };
  }

  function textObjectTag(lines, pos) {
    const text = flatten(lines);
    const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^<>]*?(\/?)>/g;
    const tags = [];
    let m;
    while ((m = tagRe.exec(text))) {
      if (m[2] === "/") continue; // skip self-closing tags
      tags.push({ start: m.index, end: m.index + m[0].length - 1, name: m[1], close: m[0][1] === "/" });
    }
    const i = toIndex(lines, pos);
    const stack = [];
    let enclosing = null;
    for (const t of tags) {
      if (!t.close) { stack.push(t); continue; }
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].name === t.name) {
          const open = stack[k];
          stack.splice(k, 1);
          if (open.start <= i && i <= t.end && (!enclosing || open.start >= enclosing.open.start)) enclosing = { open, close: t };
          break;
        }
      }
    }
    if (!enclosing) return null;
    return {
      inner: enclosing.open.end + 1 <= enclosing.close.start - 1
        ? { start: toPos(lines, enclosing.open.end + 1), end: toPos(lines, enclosing.close.start - 1), linewise: false }
        : { start: toPos(lines, enclosing.open.end + 1), end: toPos(lines, enclosing.open.end), linewise: false, empty: true },
      around: { start: toPos(lines, enclosing.open.start), end: toPos(lines, enclosing.close.end), linewise: false }
    };
  }

  /* --------------------------------- range <-> text application --------------------------------- */
  function rangeText(lines, range) {
    if (range.linewise) return lines.slice(range.start.line, range.end.line + 1).join("\n");
    if (range.start.line === range.end.line) return lineAt(lines, range.start.line).slice(range.start.col, range.end.col + 1);
    let out = [lineAt(lines, range.start.line).slice(range.start.col)];
    for (let l = range.start.line + 1; l < range.end.line; l++) out.push(lineAt(lines, l));
    out.push(lineAt(lines, range.end.line).slice(0, range.end.col + 1));
    return out.join("\n");
  }

  function deleteRange(lines, range) {
    const newLines = lines.slice();
    if (range.linewise) {
      newLines.splice(range.start.line, range.end.line - range.start.line + 1);
      if (newLines.length === 0) newLines.push("");
      return newLines;
    }
    if (range.start.line === range.end.line) {
      const l = newLines[range.start.line];
      newLines[range.start.line] = l.slice(0, range.start.col) + l.slice(range.end.col + 1);
      return newLines;
    }
    const head = newLines[range.start.line].slice(0, range.start.col);
    const tail = newLines[range.end.line].slice(range.end.col + 1);
    newLines.splice(range.start.line, range.end.line - range.start.line + 1, head + tail);
    return newLines;
  }

  function insertTextAt(lines, pos, text) {
    const newLines = lines.slice();
    const parts = text.split("\n");
    const line = newLines[pos.line] || "";
    if (parts.length === 1) {
      newLines[pos.line] = line.slice(0, pos.col) + text + line.slice(pos.col);
      return { lines: newLines, end: { line: pos.line, col: pos.col + text.length } };
    }
    const before = line.slice(0, pos.col), after = line.slice(pos.col);
    const inserted = [before + parts[0], ...parts.slice(1, -1), parts[parts.length - 1] + after];
    newLines.splice(pos.line, 1, ...inserted);
    return { lines: newLines, end: { line: pos.line + parts.length - 1, col: parts[parts.length - 1].length } };
  }

  return {
    clampLine, lastCol, clampCol, clampPos, firstNonBlankCol, visualColumn,
    flatten, toIndex, toPos, charClass, charClassBig,
    wordForward, wordBackward, wordEnd, wordEndBackward,
    findCharForward, findCharBackward, matchPercent,
    paragraphForward, paragraphBackward,
    sentenceForward, sentenceBackward, textObjectSentence,
    textObjectWord, textObjectQuote, textObjectPair, textObjectParagraph, textObjectTag,
    rangeText, deleteRange, insertTextAt
  };
})();