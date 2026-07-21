/* ============================== vim-sim/grammar.js ==============================
   The Vim interpreter: an incremental key-by-key parser for Normal mode
   (count? register? operator? count? motion-or-textobject), plus handlers
   for Insert, Visual, and Command-line mode. Operates on an "editor" state
   object (see createEditorState) that a host project keeps in its own
   Engine.state, e.g. Engine.state.editor.

   Non-printable keys are passed in as lowercase tokens: "Escape", "Enter",
   "Backspace", "ctrl-r", "ctrl-v". Everything else is passed as the literal
   character typed.
===================================================================================== */
window.VimGrammar = (function () {
  const B = window.VimBuffer;

  /* =============================== state factory =============================== */
  function createEditorState(initialLines) {
    const lines = initialLines && initialLines.length ? initialLines.slice() : [""];
    return {
      lines,
      cursor: { line: 0, col: 0 },
      mode: "normal",
      visualAnchor: null,
      pending: "",
      parse: null,
      registers: { unnamed: { text: "", linewise: false } },
      marks: {}, globalMarks: {},
      commandLine: "",
      searchLine: "", searchDirection: "forward", lastSearch: null,
      lastFind: null,
      message: "",
      undo: freshUndo(lines),
      macroRecording: null, macroKeys: [], macros: {}, lastMacroReg: null,
      insertSnapshot: null,
      insertStartLine: 0, insertStartCol: 0,
      lastChangeKeys: null,
      wantCol: 0,
      lastVisual: null,
      jumpList: [], jumpIndex: 0,
      replaceOverwritten: null,
      buffers: { 1: { id: "1", name: "[No Name]" } },
      activeBufferId: "1", nextBufferId: 2,
      tabs: [{ id: "t1", windows: [{ id: "w1", bufferId: "1" }], activeWindowId: "w1", splitDirection: "horizontal" }],
      activeTabId: "t1", nextWindowId: 2, nextTabId: 2
    };
  }

  /* =============================== parse-state helpers =============================== */
  function ensureParse(ed) {
    if (!ed.parse) ed.parse = { count1: "", count2: "", register: null, operator: null, motion: null, findChar: null, textObjectKind: null, textObjectChar: null, awaitingChar: null };
    return ed.parse;
  }
  function resetParse(ed) { ed.parse = null; ed.pending = ""; }
  function totalCount(p) {
    const c1 = p.count1 ? parseInt(p.count1, 10) : 1;
    const c2 = p.count2 ? parseInt(p.count2, 10) : 1;
    return c1 * c2;
  }

  /* =============================== undo tree =============================== */
  function pushUndoNode(engine, label) {
    const ed = engine.state.editor;
    const u = ed.undo;
    const id = u.nextId++;
    const node = { id, parentId: u.currentId, lines: ed.lines.slice(), cursor: { ...ed.cursor }, childIds: [], lastChild: null, label };
    u.nodes[id] = node;
    u.nodes[u.currentId].childIds.push(id);
    u.nodes[u.currentId].lastChild = id;
    u.currentId = id;
  }
  function undo(engine) {
    const ed = engine.state.editor;
    const u = ed.undo;
    const cur = u.nodes[u.currentId];
    if (cur.parentId === null) { ed.message = "Already at oldest change"; return; }
    const parent = u.nodes[cur.parentId];
    u.currentId = parent.id;
    ed.lines = parent.lines.slice();
    ed.cursor = B.clampPos(ed.lines, cur.cursor);
  }
  function redo(engine) {
    const ed = engine.state.editor;
    const u = ed.undo;
    const cur = u.nodes[u.currentId];
    const childId = cur.lastChild;
    if (childId === null || childId === undefined) { ed.message = "Already at newest change"; return; }
    const child = u.nodes[childId];
    u.currentId = child.id;
    ed.lines = child.lines.slice();
    ed.cursor = B.clampPos(ed.lines, child.cursor);
  }
  // Jump directly to any node in the undo tree by id — unlike undo/redo, this
  // isn't restricted to stepping one parent/child at a time, which is exactly
  // what makes the tree genuinely explorable rather than just a linear stack
  // with branches you can only reach by chance.
  function jumpToUndoNode(engine, nodeId) {
    const ed = engine.state.editor;
    const u = ed.undo;
    const node = u.nodes[nodeId];
    if (!node) return false;
    u.currentId = node.id;
    ed.lines = node.lines.slice();
    ed.cursor = B.clampPos(ed.lines, node.cursor);
    return true;
  }

  /* =============================== registers =============================== */
  function setRegister(engine, name, text, linewise, blockwise) {
    const ed = engine.state.editor;
    if (name === "_") return; // black hole register: discard
    if (name && /^[A-Z]$/.test(name)) {
      // Uppercase register name -> append to the corresponding lowercase register,
      // exactly like real Vim's "A / "B / ... convention.
      const lower = name.toLowerCase();
      const existing = ed.registers[lower];
      if (existing && existing.text) {
        const sep = existing.linewise || linewise ? "\n" : "";
        ed.registers[lower] = { text: existing.text + sep + text, linewise: existing.linewise || linewise, blockwise: existing.blockwise || !!blockwise };
      } else {
        ed.registers[lower] = { text, linewise, blockwise: !!blockwise };
      }
      return;
    }
    ed.registers[name || "unnamed"] = { text, linewise, blockwise: !!blockwise };
  }
  function setRegisterAfterDelete(engine, text, linewise, explicitName, blockwise) {
    const ed = engine.state.editor;
    if (explicitName) { setRegister(engine, explicitName, text, linewise, blockwise); return; }
    for (let n = 9; n >= 2; n--) { if (ed.registers[String(n - 1)]) ed.registers[String(n)] = ed.registers[String(n - 1)]; }
    ed.registers["1"] = { text, linewise, blockwise: !!blockwise };
    ed.registers.unnamed = { text, linewise, blockwise: !!blockwise };
  }

  /* =============================== marks =============================== */
  // Real Vim marks are anchored to the text they were set on, not to a raw
  // line number — inserting or deleting lines above a mark shifts it so it
  // keeps pointing at the same content. shiftMarksForSplice mirrors that:
  // called with the same (start, oldCount, newCount) triple as whatever
  // splice actually changed the buffer, it moves every mark that comes
  // after the edit by the resulting line-count delta, and clamps any mark
  // that was sitting inside a deleted/replaced region to the edit point
  // rather than leaving it pointing at content that no longer exists there.
  function shiftOneMark(m, spliceStart, spliceEnd, delta, newCount) {
    if (!m) return;
    if (m.line >= spliceEnd) m.line += delta;
    else if (m.line >= spliceStart) m.line = Math.max(0, Math.min(spliceStart + Math.max(newCount - 1, 0), m.line));
  }
  function shiftMarksForSplice(ed, spliceStart, oldCount, newCount) {
    const delta = newCount - oldCount;
    if (delta === 0) return;
    const spliceEnd = spliceStart + oldCount;
    Object.keys(ed.marks).forEach((k) => shiftOneMark(ed.marks[k], spliceStart, spliceEnd, delta, newCount));
    Object.keys(ed.globalMarks).forEach((k) => {
      const gm = ed.globalMarks[k];
      if (gm.bufferId === ed.activeBufferId) shiftOneMark(gm, spliceStart, spliceEnd, delta, newCount);
    });
  }
  // Real Vim automatically drops a "'" mark at your position before any big
  // jump (G, gg, search, %, jumping to another mark, ...), which is what
  // makes "''" work as an instant "jump back to where I was" — without
  // this, '' would have to be set manually every time to be useful at all.
  function recordJumpMark(engine) {
    const ed = engine.state.editor;
    ed.marks["'"] = { ...ed.cursor };
    ed.marks["`"] = { ...ed.cursor };
    // Truncate any "forward" history past where we currently are (a fresh
    // jump invalidates the old future, same as browser back/forward), then
    // record where we're jumping FROM so Ctrl-o has somewhere to return to.
    ed.jumpList = ed.jumpList.slice(0, ed.jumpIndex);
    ed.jumpList.push({ ...ed.cursor });
    ed.jumpIndex = ed.jumpList.length;
  }
  // Ctrl-o / Ctrl-i: a simplified linear jump list (real Vim's is per-window
  // and survives more edge cases around edits) — walks backward/forward
  // through positions recorded by recordJumpMark (G, gg, search, %, marks).
  function jumpBack(engine) {
    const ed = engine.state.editor;
    if (!ed.jumpList.length || ed.jumpIndex <= 0) { ed.message = "at start of jump list"; return; }
    if (ed.jumpIndex === ed.jumpList.length) ed.jumpList.push({ ...ed.cursor });
    ed.jumpIndex--;
    ed.cursor = B.clampPos(ed.lines, ed.jumpList[ed.jumpIndex]);
  }
  function jumpForward(engine) {
    const ed = engine.state.editor;
    if (!ed.jumpList.length || ed.jumpIndex >= ed.jumpList.length - 1) { ed.message = "at end of jump list"; return; }
    ed.jumpIndex++;
    ed.cursor = B.clampPos(ed.lines, ed.jumpList[ed.jumpIndex]);
  }

  function setMark(engine, letter) {
    const ed = engine.state.editor;
    if (/^[A-Z]$/.test(letter)) {
      ed.globalMarks[letter] = { bufferId: ed.activeBufferId, line: ed.cursor.line, col: ed.cursor.col };
      return;
    }
    ed.marks[letter] = { ...ed.cursor };
  }
  function jumpToMark(engine, letter, exact) {
    const ed = engine.state.editor;
    if (/^[A-Z]$/.test(letter)) {
      const gm = ed.globalMarks[letter];
      if (!gm) { ed.message = `mark '${letter}' not set`; return; }
      if (gm.bufferId !== ed.activeBufferId && !switchToBuffer(engine, gm.bufferId)) { ed.message = `mark '${letter}' not set`; return; }
      const targetEd = engine.state.editor;
      const gmLine = Math.max(0, Math.min(targetEd.lines.length - 1, gm.line));
      recordJumpMark(engine);
      targetEd.cursor = exact ? B.clampPos(targetEd.lines, { line: gmLine, col: gm.col }) : { line: gmLine, col: B.firstNonBlankCol(targetEd.lines[gmLine] || "") };
      return;
    }
    const m = ed.marks[letter];
    if (!m) { ed.message = `mark '${letter}' not set`; return; }
    const mLine = Math.max(0, Math.min(ed.lines.length - 1, m.line));
    recordJumpMark(engine);
    ed.cursor = exact ? B.clampPos(ed.lines, { line: mLine, col: m.col }) : { line: mLine, col: B.firstNonBlankCol(ed.lines[mLine] || "") };
  }
  // Read-only lookup for the widget/resolveMotion — returns {line,col} in the
  // CURRENT buffer's coordinate space, or null if unset or in another buffer.
  function resolveMarkPosition(ed, letter) {
    if (/^[A-Z]$/.test(letter)) {
      const gm = ed.globalMarks[letter];
      if (!gm || gm.bufferId !== ed.activeBufferId) return null;
      return { line: gm.line, col: gm.col };
    }
    return ed.marks[letter] || null;
  }

  /* =============================== range ordering =============================== */
  function orderRange(a, b, inclusive, linewise, lines) {
    let start = a, end = b;
    if (B.toIndex(lines, b) < B.toIndex(lines, a)) { start = b; end = a; }
    if (linewise) return { start: { line: start.line, col: 0 }, end: { line: end.line, col: B.lastCol(lines, end.line) }, linewise: true };
    if (!inclusive) {
      const endIdx = B.toIndex(lines, end) - 1;
      if (endIdx < B.toIndex(lines, start)) return { start, end: start, linewise: false, empty: true };
      end = B.toPos(lines, endIdx);
    }
    return { start, end, linewise: false };
  }

  /* =============================== motion / text-object resolution =============================== */
  /* --------------------------------- virtual column memory (for j/k) --------------------------------- */
  // Real Vim remembers the column you were "aiming for" across consecutive
  // j/k presses, so moving down through a short line and back onto a longer
  // one returns you to the original column instead of getting stuck wherever
  // the short line clamped you to. ed.wantCol holds that column, or the
  // string "eol" (set by $) meaning "always the last column of whatever
  // line I land on". Any motion other than j/k updates it to match where the
  // cursor actually ends up; j/k themselves leave it untouched so it
  // survives a whole chain of vertical moves.
  function wantColFor(ed) {
    if (ed.wantCol === "eol") return Infinity; // clampPos below pulls this back to each line's real last column
    return ed.wantCol !== undefined && ed.wantCol !== null ? ed.wantCol : ed.cursor.col;
  }
  function updateWantCol(ed, motion) {
    if (motion === "j" || motion === "k") return; // preserve across vertical chains
    ed.wantCol = motion === "$" ? "eol" : ed.cursor.col;
  }

  function resolveMotion(engine, p) {
    const ed = engine.state.editor;
    const count = totalCount(p);
    const cur = ed.cursor;

    if (p.textObjectKind) {
      const around = p.textObjectKind === "a";
      const ch = p.textObjectChar;
      let r = null;
      if (ch === "w") r = B.textObjectWord(ed.lines, cur, around);
      else if (ch === '"' || ch === "'") r = B.textObjectQuote(ed.lines, cur, ch, around);
      else if ("([{)]}".includes(ch)) {
        const pairMap = { "(": ["(", ")"], ")": ["(", ")"], "[": ["[", "]"], "]": ["[", "]"], "{": ["{", "}"], "}": ["{", "}"] };
        const [o, c] = pairMap[ch];
        r = B.textObjectPair(ed.lines, cur, o, c, around);
      } else if (ch === "p") r = B.textObjectParagraph(ed.lines, cur, around);
      else if (ch === "s") r = B.textObjectSentence(ed.lines, cur, around);
      else if (ch === "t") { const t = B.textObjectTag(ed.lines, cur); r = t ? (around ? t.around : t.inner) : null; }
      if (!r) return null;
      return { range: r, newCursor: r.start };
    }

    const m = p.motion;
    if (m === "LINEWISE_SELF") {
      const endLine = Math.min(ed.lines.length - 1, cur.line + count - 1);
      return { range: { start: { line: cur.line, col: 0 }, end: { line: endLine, col: B.lastCol(ed.lines, endLine) }, linewise: true }, newCursor: { line: cur.line, col: 0 } };
    }
    if (m === "search" && typeof p.searchTargetIdx === "number") {
      // Search motions are exclusive: the range runs up to, but not including,
      // the character the search landed on.
      const curIdx = B.toIndex(ed.lines, cur);
      const lo = Math.min(curIdx, p.searchTargetIdx);
      const hi = Math.max(curIdx, p.searchTargetIdx);
      const endIdx = Math.max(lo, hi - 1);
      return {
        range: { start: B.toPos(ed.lines, lo), end: B.toPos(ed.lines, endIdx), linewise: false },
        newCursor: B.toPos(ed.lines, p.searchTargetIdx)
      };
    }
    if ((m === "mark-line" || m === "mark-exact") && p.markLetter) {
      const mark = resolveMarkPosition(ed, p.markLetter);
      if (!mark) return null;
      if (m === "mark-line") {
        // ' motions are always linewise, spanning from the current line to the mark's line.
        const lo = Math.min(cur.line, mark.line), hi = Math.max(cur.line, mark.line);
        return { range: { start: { line: lo, col: 0 }, end: { line: hi, col: B.lastCol(ed.lines, hi) }, linewise: true }, newCursor: { line: mark.line, col: B.firstNonBlankCol(ed.lines[mark.line] || "") } };
      }
      // ` motions are always exclusive charwise, same rule as search: exclude the character at the higher index.
      const curIdx = B.toIndex(ed.lines, cur);
      const markIdx = B.toIndex(ed.lines, mark);
      const lo = Math.min(curIdx, markIdx), hi = Math.max(curIdx, markIdx);
      const endIdx = Math.max(lo, hi - 1);
      return { range: { start: B.toPos(ed.lines, lo), end: B.toPos(ed.lines, endIdx), linewise: false }, newCursor: B.toPos(ed.lines, markIdx) };
    }

    let target = null, inclusive = false, linewise = false;
    if (m === "h") target = { line: cur.line, col: Math.max(0, cur.col - count) };
    else if (m === "l") target = { line: cur.line, col: Math.min(B.lastCol(ed.lines, cur.line), cur.col + count) };
    else if (m === "j") { linewise = true; target = { line: Math.min(ed.lines.length - 1, cur.line + count), col: wantColFor(ed) }; }
    else if (m === "k") { linewise = true; target = { line: Math.max(0, cur.line - count), col: wantColFor(ed) }; }
    else if (m === "0") target = { line: cur.line, col: 0 };
    else if (m === "^") target = { line: cur.line, col: B.firstNonBlankCol(ed.lines[cur.line]) };
    else if (m === "$") { inclusive = true; const l = Math.min(ed.lines.length - 1, cur.line + count - 1); target = { line: l, col: B.lastCol(ed.lines, l) }; }
    else if (m === "w") {
      // Real Vim special case (:help cw): when the operator is "c" and the
      // cursor is on a non-blank character, "cw"/"cW" behaves like "ce" —
      // it changes to the end of the word, not up to the start of the next
      // one — so it doesn't swallow the trailing whitespace after the word.
      // If the cursor is on whitespace (or at end of line), "cw" behaves
      // like a normal "w" motion, same as any other operator.
      const atCursor = (ed.lines[cur.line] || "")[cur.col];
      const onWordChar = atCursor !== undefined && B.charClass(atCursor) !== "space";
      if (p.operator === "c" && onWordChar) {
        inclusive = true;
        let t = cur; for (let i = 0; i < count; i++) t = B.wordEnd(ed.lines, t);
        target = t;
      } else {
        let t = cur; for (let i = 0; i < count; i++) t = B.wordForward(ed.lines, t);
        target = t;
      }
    }
    else if (m === "b") { let t = cur; for (let i = 0; i < count; i++) t = B.wordBackward(ed.lines, t); target = t; }
    else if (m === "e") { inclusive = true; let t = cur; for (let i = 0; i < count; i++) t = B.wordEnd(ed.lines, t); target = t; }
    else if (m === "ge") { inclusive = true; let t = cur; for (let i = 0; i < count; i++) t = B.wordEndBackward(ed.lines, t); target = t; }
    else if (m === "W") {
      // Same cw/cW special case as "w" above, just against WORD boundaries.
      const atCursor = (ed.lines[cur.line] || "")[cur.col];
      const onWordChar = atCursor !== undefined && B.charClassBig(atCursor) !== "space";
      if (p.operator === "c" && onWordChar) {
        inclusive = true;
        let t = cur; for (let i = 0; i < count; i++) t = B.wordEnd(ed.lines, t, true);
        target = t;
      } else {
        let t = cur; for (let i = 0; i < count; i++) t = B.wordForward(ed.lines, t, true);
        target = t;
      }
    }
    else if (m === "B") { let t = cur; for (let i = 0; i < count; i++) t = B.wordBackward(ed.lines, t, true); target = t; }
    else if (m === "E") { inclusive = true; let t = cur; for (let i = 0; i < count; i++) t = B.wordEnd(ed.lines, t, true); target = t; }
    else if (m === "gE") { inclusive = true; let t = cur; for (let i = 0; i < count; i++) t = B.wordEndBackward(ed.lines, t, true); target = t; }
    else if (m === "(") { let t = cur; for (let i = 0; i < count; i++) t = B.sentenceBackward(ed.lines, t); target = t; }
    else if (m === ")") { let t = cur; for (let i = 0; i < count; i++) t = B.sentenceForward(ed.lines, t); target = t; }
    else if (m === "gg") { linewise = true; const l = (p.count1 || p.count2) ? Math.min(ed.lines.length - 1, count - 1) : 0; target = { line: l, col: B.firstNonBlankCol(ed.lines[l]) }; }
    else if (m === "G") { linewise = true; const l = (p.count1 || p.count2) ? Math.min(ed.lines.length - 1, count - 1) : ed.lines.length - 1; target = { line: l, col: B.firstNonBlankCol(ed.lines[l]) }; }
    else if (m === "H") { linewise = true; target = { line: 0, col: B.firstNonBlankCol(ed.lines[0]) }; }
    else if (m === "M") { linewise = true; const l = Math.floor((ed.lines.length - 1) / 2); target = { line: l, col: B.firstNonBlankCol(ed.lines[l]) }; }
    else if (m === "L") { linewise = true; const l = ed.lines.length - 1; target = { line: l, col: B.firstNonBlankCol(ed.lines[l]) }; }
    else if (m === "%") { inclusive = true; target = B.matchPercent(ed.lines, cur); if (!target) return null; }
    else if (m === "{") target = B.paragraphBackward(ed.lines, cur);
    else if (m === "}") target = B.paragraphForward(ed.lines, cur);
    else if (m === "f" || m === "t") { inclusive = true; target = B.findCharForward(ed.lines, cur, p.findChar, m === "t"); if (!target) return null; ed.lastFind = { type: m, char: p.findChar }; }
    else if (m === "F" || m === "T") { target = B.findCharBackward(ed.lines, cur, p.findChar, m === "T"); if (!target) return null; ed.lastFind = { type: m, char: p.findChar }; }
    else if (m === ";") {
      if (!ed.lastFind) return null;
      const lf = ed.lastFind; inclusive = lf.type === "f" || lf.type === "t";
      target = inclusive ? B.findCharForward(ed.lines, cur, lf.char, lf.type === "t") : B.findCharBackward(ed.lines, cur, lf.char, lf.type === "T");
      if (!target) return null;
    } else if (m === ",") {
      if (!ed.lastFind) return null;
      const inv = { f: "F", F: "f", t: "T", T: "t" }[ed.lastFind.type];
      inclusive = inv === "f" || inv === "t";
      target = inclusive ? B.findCharForward(ed.lines, cur, ed.lastFind.char, inv === "t") : B.findCharBackward(ed.lines, cur, ed.lastFind.char, inv === "T");
      if (!target) return null;
    } else return null;

    if (!target) return null;
    target = B.clampPos(ed.lines, target);
    const range = orderRange(cur, target, inclusive, linewise, ed.lines);
    return { range, newCursor: target };
  }

  /* =============================== operator application =============================== */
  function commitEdit(engine, newLines, newCursor, label) {
    const ed = engine.state.editor;
    ed.lines = newLines;
    ed.cursor = B.clampPos(newLines, newCursor);
    pushUndoNode(engine, label);
  }

  function applyOperator(engine, op, range, registerName) {
    const ed = engine.state.editor;
    if (range.empty) { if (op === "c") enterInsertAt(engine, range.start); return; }
    const text = B.rangeText(ed.lines, range);
    if (op === "d" || op === "c") {
      setRegisterAfterDelete(engine, text, range.linewise, registerName);
      if (op === "c" && range.linewise) {
        // Real Vim's linewise change ("cc", "cip" on whole lines, etc.)
        // replaces the affected lines with a single blank line to type into,
        // preserving line count and position — it does not remove the lines
        // outright the way "dd" does. Using the same deleteRange as "d"
        // here (as this used to) left nothing behind to type into, so the
        // typed text silently merged into whatever line happened to follow.
        const newLines = ed.lines.slice();
        const spliceOldCount = range.end.line - range.start.line + 1;
        newLines.splice(range.start.line, spliceOldCount, "");
        shiftMarksForSplice(ed, range.start.line, spliceOldCount, 1);
        ed.lines = newLines;
        pushUndoNode(engine, "change");
        enterInsertAt(engine, { line: range.start.line, col: 0 });
        return;
      }
      const oldLineCount = ed.lines.length;
      const newLines = B.deleteRange(ed.lines, range);
      {
        const spliceOldCount = range.end.line - range.start.line + 1;
        const spliceNewCount = spliceOldCount - (oldLineCount - newLines.length);
        shiftMarksForSplice(ed, range.start.line, spliceOldCount, spliceNewCount);
      }
      if (op === "c") {
        // The post-delete insert position can legitimately sit one column
        // past the new line's last character (the "append" position) — e.g.
        // deleting the last word on a line via cw/ce/ciw/C. commitEdit's
        // cursor clamp uses Normal-mode semantics (max index = length-1,
        // since Normal mode always sits ON a character), which would pull
        // this one column too far left, landing the typed text on top of
        // the previous character instead of after it. Compute the correct
        // insert-mode position directly rather than reading it back through
        // that clamp.
        ed.lines = newLines;
        pushUndoNode(engine, "change");
        const line = newLines[range.start.line] || "";
        enterInsertAt(engine, { line: range.start.line, col: Math.max(0, Math.min(line.length, range.start.col)) });
      } else {
        commitEdit(engine, newLines, range.start, "delete");
      }
    } else if (op === "y") {
      const target = registerName || "0";
      setRegister(engine, target, text, range.linewise);
      if (target !== "unnamed") ed.registers.unnamed = { text, linewise: range.linewise };
      ed.cursor = B.clampPos(ed.lines, range.start);
    } else if (op === ">" || op === "<") {
      const newLines = ed.lines.slice();
      for (let l = range.start.line; l <= range.end.line; l++) newLines[l] = op === ">" ? "    " + newLines[l] : newLines[l].replace(/^ {1,4}/, "");
      commitEdit(engine, newLines, { line: range.start.line, col: 0 }, "indent");
    } else if (op === "g~" || op === "gu" || op === "gU") {
      const applyCase = (s) => (op === "gu" ? s.toLowerCase() : op === "gU" ? s.toUpperCase() : s.split("").map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(""));
      const newLines = ed.lines.slice();
      if (range.linewise) { for (let l = range.start.line; l <= range.end.line; l++) newLines[l] = applyCase(ed.lines[l]); }
      else if (range.start.line === range.end.line) {
        const l = ed.lines[range.start.line];
        newLines[range.start.line] = l.slice(0, range.start.col) + applyCase(l.slice(range.start.col, range.end.col + 1)) + l.slice(range.end.col + 1);
      } else {
        newLines[range.start.line] = ed.lines[range.start.line].slice(0, range.start.col) + applyCase(ed.lines[range.start.line].slice(range.start.col));
        for (let l = range.start.line + 1; l < range.end.line; l++) newLines[l] = applyCase(ed.lines[l]);
        newLines[range.end.line] = applyCase(ed.lines[range.end.line].slice(0, range.end.col + 1)) + ed.lines[range.end.line].slice(range.end.col + 1);
      }
      commitEdit(engine, newLines, range.start, "case");
    }
  }

  /* =============================== insert mode =============================== */
  function enterInsert(engine, kind) {
    const ed = engine.state.editor;
    ed.insertSnapshot = ed.lines.slice();
    if (kind === "a") ed.cursor = { line: ed.cursor.line, col: Math.min(ed.lines[ed.cursor.line].length, ed.cursor.col + 1) };
    else if (kind === "I") ed.cursor = { line: ed.cursor.line, col: B.firstNonBlankCol(ed.lines[ed.cursor.line]) };
    else if (kind === "A") ed.cursor = { line: ed.cursor.line, col: ed.lines[ed.cursor.line].length };
    else if (kind === "o") { const nl = ed.lines.slice(); nl.splice(ed.cursor.line + 1, 0, ""); shiftMarksForSplice(ed, ed.cursor.line + 1, 0, 1); ed.lines = nl; ed.cursor = { line: ed.cursor.line + 1, col: 0 }; }
    else if (kind === "O") { const nl = ed.lines.slice(); nl.splice(ed.cursor.line, 0, ""); shiftMarksForSplice(ed, ed.cursor.line, 0, 1); ed.lines = nl; ed.cursor = { line: ed.cursor.line, col: 0 }; }
    ed.mode = "insert";
    ed.insertStartLine = ed.cursor.line; ed.insertStartCol = ed.cursor.col;
    resetParse(ed);
  }
  function enterInsertAt(engine, pos) {
    const ed = engine.state.editor;
    ed.insertSnapshot = ed.lines.slice();
    ed.cursor = pos;
    ed.insertStartLine = pos.line; ed.insertStartCol = pos.col;
    ed.mode = "insert";
  }
  function feedInsertKey(engine, key) {
    const ed = engine.state.editor;
    if (key === "Escape") {
      const bi = ed._blockInsert;
      ed._blockInsert = null;
      if (bi && ed.cursor.line === bi.top) {
        // Whatever got typed on the top line, from the block's column to
        // wherever the cursor ended up, gets replayed at the same column on
        // every other line in the block — this is what makes "I"/"A"/block-c
        // feel like editing several lines at once instead of just one.
        const topStartCol = bi.col === "eol" ? bi.topStartCol : bi.col;
        const insertedText = (ed.lines[bi.top] || "").slice(topStartCol, ed.cursor.col);
        if (insertedText) {
          const newLines = ed.lines.slice();
          for (let l = bi.top + 1; l <= bi.bottom; l++) {
            let line = newLines[l];
            if (line === undefined) continue;
            const targetCol = bi.col === "eol" ? line.length : bi.col;
            if (line.length < targetCol) {
              if (!bi.pad) continue; // "I" and block-"c" skip lines that don't reach the block; "A" pads them
              line = line + " ".repeat(targetCol - line.length);
            }
            newLines[l] = line.slice(0, targetCol) + insertedText + line.slice(targetCol);
          }
          ed.lines = newLines;
        }
      }
      ed.mode = "normal";
      ed.cursor = { line: ed.cursor.line, col: Math.max(0, ed.cursor.col - 1) };
      ed.wantCol = ed.cursor.col;
      if (JSON.stringify(ed.lines) !== JSON.stringify(ed.insertSnapshot)) pushUndoNode(engine, "insert");
      ed.insertSnapshot = null;
      return;
    }
    if (key === "Backspace") {
      if (ed.cursor.col > 0) {
        const l = ed.lines[ed.cursor.line];
        ed.lines = ed.lines.slice();
        ed.lines[ed.cursor.line] = l.slice(0, ed.cursor.col - 1) + l.slice(ed.cursor.col);
        ed.cursor = { line: ed.cursor.line, col: ed.cursor.col - 1 };
      } else if (ed.cursor.line > 0) {
        const prevLen = ed.lines[ed.cursor.line - 1].length;
        const nl = ed.lines.slice();
        nl[ed.cursor.line - 1] = nl[ed.cursor.line - 1] + nl[ed.cursor.line];
        nl.splice(ed.cursor.line, 1);
        shiftMarksForSplice(ed, ed.cursor.line - 1, 2, 1);
        ed.lines = nl; ed.cursor = { line: ed.cursor.line - 1, col: prevLen };
      }
      return;
    }
    if (key === "Enter") { const r = B.insertTextAt(ed.lines, ed.cursor, "\n"); shiftMarksForSplice(ed, ed.cursor.line, 1, 2); ed.lines = r.lines; ed.cursor = r.end; return; }
    if (key === "ctrl-w") {
      const target = B.wordBackward(ed.lines, ed.cursor);
      if (target.line === ed.cursor.line && target.col < ed.cursor.col) {
        const l = ed.lines[ed.cursor.line];
        const newLines = ed.lines.slice();
        newLines[ed.cursor.line] = l.slice(0, target.col) + l.slice(ed.cursor.col);
        ed.lines = newLines;
        ed.cursor = { line: ed.cursor.line, col: target.col };
      }
      return;
    }
    if (key === "ctrl-u") {
      const boundary = (ed.insertStartLine === ed.cursor.line) ? Math.min(ed.insertStartCol, ed.cursor.col) : 0;
      if (boundary < ed.cursor.col) {
        const l = ed.lines[ed.cursor.line];
        const newLines = ed.lines.slice();
        newLines[ed.cursor.line] = l.slice(0, boundary) + l.slice(ed.cursor.col);
        ed.lines = newLines;
        ed.cursor = { line: ed.cursor.line, col: boundary };
      }
      return;
    }
    const r = B.insertTextAt(ed.lines, ed.cursor, key);
    ed.lines = r.lines; ed.cursor = r.end;
  }

  /* =============================== visual mode =============================== */
  // gv support: snapshot the mode/anchor/cursor right before any transition
  // OUT of a visual mode, so "gv" from Normal mode can restore exactly that
  // selection later.
  function recordLastVisual(ed) {
    if (!ed.visualAnchor) return;
    ed.lastVisual = { mode: ed.mode, anchor: { ...ed.visualAnchor }, cursor: { ...ed.cursor } };
  }
  function enterVisual(engine, kind) {
    const ed = engine.state.editor;
    ed.mode = kind;
    ed.visualAnchor = { ...ed.cursor };
    ed.wantCol = ed.cursor.col;
    resetParse(ed);
  }
  function applyVisualMotion(engine, p) {
    const ed = engine.state.editor;
    const resolved = resolveMotion(engine, p);
    if (resolved) { ed.cursor = B.clampPos(ed.lines, resolved.newCursor || ed.cursor); updateWantCol(ed, p.motion); }
    resetParse(ed);
  }
  function applyVisualTextObject(engine, p) {
    const ed = engine.state.editor;
    const resolved = resolveMotion(engine, p);
    if (resolved) { ed.visualAnchor = { ...resolved.range.start }; ed.cursor = { ...resolved.range.end }; }
    resetParse(ed);
  }

  /* --------------------------------- visual-block: rectangular column range --------------------------------- */
  // Unlike charwise/linewise visual mode, a block selection isn't a single
  // contiguous range of the buffer — it's the same [left, right] column
  // range repeated on every line from the anchor's line to the cursor's
  // line. Every block operator below works from these four numbers rather
  // than from resolveMotion's single {start,end} range shape.
  function blockBounds(ed) {
    const a = ed.visualAnchor, c = ed.cursor;
    return {
      top: Math.min(a.line, c.line), bottom: Math.max(a.line, c.line),
      left: Math.min(a.col, c.col), right: Math.max(a.col, c.col),
      // If $ was used to extend the selection, real Vim's block operates on
      // each line's own actual end rather than a shared column — this is
      // what lets "A" append at the true end of every line in a paragraph
      // regardless of how long each one is, instead of a fixed column that
      // would cut some lines short or pad others unnecessarily.
      ragged: ed.wantCol === "eol"
    };
  }
  function applyBlockOperator(engine, op) {
    const ed = engine.state.editor;
    const { top, bottom, left, right, ragged } = blockBounds(ed);
    recordLastVisual(ed);
    ed.mode = "normal";
    ed.visualAnchor = null;
    resetParse(ed);

    if (op === "y" || op === "d" || op === "c") {
      const texts = [];
      const newLines = ed.lines.slice();
      for (let l = top; l <= bottom; l++) {
        const line = newLines[l] || "";
        const lineRight = ragged ? B.lastCol(newLines, l) : right;
        texts.push(line.slice(left, lineRight + 1));
        if (op !== "y") newLines[l] = line.slice(0, left) + line.slice(lineRight + 1);
      }
      setRegisterAfterDelete(engine, texts.join("\n"), false, null, true);
      if (op === "y") { ed.cursor = { line: top, col: Math.min(left, B.lastCol(ed.lines, top)) }; return; }
      ed.lines = newLines;
      pushUndoNode(engine, op === "c" ? "change" : "delete");
      if (op === "c") {
        // Real Vim propagates whatever gets typed here to the same column on
        // every other line in the block once Escape is pressed (feedInsertKey
        // handles the actual propagation) — lines shorter than the block's
        // left column are left alone, matching "c" (not padded, unlike "A").
        ed._blockInsert = { top, bottom, col: left, pad: false };
        enterInsertAt(engine, { line: top, col: left });
      } else {
        ed.cursor = { line: top, col: Math.min(left, B.lastCol(ed.lines, top)) };
      }
      return;
    }

    if (op === "g~" || op === "gu" || op === "gU") {
      const newLines = ed.lines.slice();
      for (let l = top; l <= bottom; l++) {
        const line = newLines[l] || "";
        if (line.length <= left) continue;
        const lineRight = ragged ? B.lastCol(newLines, l) : right;
        const seg = line.slice(left, lineRight + 1);
        const transformed = op === "gu" ? seg.toLowerCase() : op === "gU" ? seg.toUpperCase()
          : seg.replace(/[a-zA-Z]/g, (ch) => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()));
        newLines[l] = line.slice(0, left) + transformed + line.slice(lineRight + 1);
      }
      ed.lines = newLines;
      pushUndoNode(engine, "case");
      ed.cursor = { line: top, col: left };
      return;
    }

    if (op === ">" || op === "<") {
      // Real Vim indents/dedents the whole affected lines in block mode too,
      // regardless of the block's column range — same as linewise visual.
      const newLines = ed.lines.slice();
      for (let l = top; l <= bottom; l++) newLines[l] = op === ">" ? "    " + newLines[l] : newLines[l].replace(/^ {1,4}/, "");
      ed.lines = newLines;
      pushUndoNode(engine, "indent");
      ed.cursor = { line: top, col: 0 };
      return;
    }
  }
  function startBlockInsert(engine, isAppend) {
    const ed = engine.state.editor;
    const { top, bottom, left, right, ragged } = blockBounds(ed);
    recordLastVisual(ed);
    ed.mode = "normal";
    ed.visualAnchor = null;
    resetParse(ed);
    if (isAppend && ragged) {
      // Ragged block-append: each line gets typed text at its OWN actual
      // end, not a shared column — col: "eol" tells the Escape-time
      // propagation logic (below) to recompute the target column per line.
      const topStartCol = (ed.lines[top] || "").length;
      ed._blockInsert = { top, bottom, col: "eol", pad: false, topStartCol };
      enterInsertAt(engine, { line: top, col: topStartCol });
      return;
    }
    const col = isAppend ? right + 1 : left;
    // Real Vim's block-append ("A") pads lines shorter than the block with
    // spaces so the appended text lines up in a column on every line; block-
    // insert ("I") does not pad — it simply skips lines that don't reach it.
    ed._blockInsert = { top, bottom, col, pad: isAppend };
    const line = ed.lines[top] || "";
    const startCol = isAppend && line.length < col
      ? (() => { ed.lines = ed.lines.slice(); ed.lines[top] = line + " ".repeat(col - line.length); return col; })()
      : Math.min(col, line.length);
    enterInsertAt(engine, { line: top, col: startCol });
  }

  function applyVisualOperator(engine, op) {
    const ed = engine.state.editor;
    if (ed.mode === "visual-block") return applyBlockOperator(engine, op);
    const linewise = ed.mode === "visual-line";
    const range = orderRange(ed.visualAnchor, ed.cursor, true, linewise, ed.lines);
    recordLastVisual(ed);
    ed.mode = "normal";
    ed.visualAnchor = null;
    resetParse(ed);
    applyOperator(engine, op, range, null);
  }
  // Pressing v / V / ctrl-v while ALREADY in a visual mode doesn't start a
  // new selection (the anchor is already set) — real Vim instead treats it
  // as a mode toggle: pressing the SAME key you're already in exits back to
  // Normal (mirrors Escape), and pressing a DIFFERENT one of the three
  // switches to that submode in place, keeping the same anchor and cursor
  // so the selection's span doesn't change, only how it's interpreted.
  const VISUAL_MODE_KEY = { v: "visual", V: "visual-line", "ctrl-v": "visual-block" };
  function toggleVisualMode(engine, targetMode) {
    const ed = engine.state.editor;
    if (ed.mode === targetMode) { recordLastVisual(ed); ed.mode = "normal"; ed.visualAnchor = null; resetParse(ed); return; }
    ed.mode = targetMode;
    resetParse(ed);
  }
  function feedVisualKey(engine, key) {
    const ed = engine.state.editor;
    if (key === "Escape") { recordLastVisual(ed); ed.mode = "normal"; ed.visualAnchor = null; resetParse(ed); return; }
    if (VISUAL_MODE_KEY[key]) return toggleVisualMode(engine, VISUAL_MODE_KEY[key]);
    if (ed.mode === "visual-block" && (key === "I" || key === "A")) return startBlockInsert(engine, key === "A");
    const p = ensureParse(ed);
    if (p.awaitingChar === "textobject") { p.textObjectChar = key; return applyVisualTextObject(engine, p); }
    if (p.awaitingChar === "find") { p.findChar = key; return applyVisualMotion(engine, p); }
    if (!p.textObjectKind && (key === "i" || key === "a")) { p.textObjectKind = key; p.awaitingChar = "textobject"; return; }
    if ("fFtT".includes(key)) { p.motion = key; p.awaitingChar = "find"; return; }
    if (key === "g") { p.awaitingChar = "g-motion"; return; }
    if (p.awaitingChar === "g-motion") { p.motion = key === "g" ? "gg" : key === "e" ? "ge" : key === "E" ? "gE" : null; if (!p.motion) { resetParse(ed); return; } return applyVisualMotion(engine, p); }
    if ("hjklwbe0^$%HML{}()".includes(key) || "WBEG".includes(key)) { p.motion = key; return applyVisualMotion(engine, p); }
    if (key === "o") { const a = ed.visualAnchor; ed.visualAnchor = ed.cursor; ed.cursor = a; resetParse(ed); return; }
    if (key === "p" || key === "P") return applyVisualPaste(engine);
    if (key === "d" || key === "x") return applyVisualOperator(engine, "d");
    if (key === "c") return applyVisualOperator(engine, "c");
    if (key === "y") return applyVisualOperator(engine, "y");
    if (key === ">" || key === "<") return applyVisualOperator(engine, key);
    if (key === "~") return applyVisualOperator(engine, "g~");
    if (key === "u") return applyVisualOperator(engine, "gu");
    if (key === "U") return applyVisualOperator(engine, "gU");
    resetParse(ed);
  }

  // Visual p/P: replace the selection with the (unnamed) register's
  // contents; the replaced text becomes the new unnamed/"1 register,
  // same swap real Vim does. Simplified vs. real Vim: doesn't support a
  // register prefix on the paste itself, and pasting into a Visual Block
  // selection isn't modeled (exits to Normal unchanged) since a rectangle
  // has no single well-defined "replace with linear text" behavior.
  function applyVisualPaste(engine) {
    const ed = engine.state.editor;
    if (ed.mode === "visual-block") { recordLastVisual(ed); ed.mode = "normal"; ed.visualAnchor = null; resetParse(ed); return; }
    const linewise = ed.mode === "visual-line";
    const range = orderRange(ed.visualAnchor, ed.cursor, true, linewise, ed.lines);
    recordLastVisual(ed);
    ed.mode = "normal"; ed.visualAnchor = null; resetParse(ed);
    const reg = ed.registers.unnamed;
    if (!reg || !reg.text) return;
    const pasteText = reg.text, pasteLinewise = reg.linewise;
    const deletedText = B.rangeText(ed.lines, range);
    const deletedLinewise = range.linewise;
    if (range.linewise) {
      const insertLines = pasteLinewise ? pasteText.split("\n") : [pasteText];
      const newLines = ed.lines.slice();
      newLines.splice(range.start.line, range.end.line - range.start.line + 1, ...insertLines);
      shiftMarksForSplice(ed, range.start.line, range.end.line - range.start.line + 1, insertLines.length);
      commitEdit(engine, newLines, { line: range.start.line, col: B.firstNonBlankCol(insertLines[0]) }, "visual-paste");
    } else {
      const deletedLines = B.deleteRange(ed.lines, range);
      const insertText = pasteLinewise ? "\n" + pasteText : pasteText;
      const r = B.insertTextAt(deletedLines, range.start, insertText);
      commitEdit(engine, r.lines, { line: r.end.line, col: Math.max(0, r.end.col - 1) }, "visual-paste");
    }
    setRegisterAfterDelete(engine, deletedText, deletedLinewise, null);
  }

  /* =============================== command-line mode =============================== */
  function enterCommand(engine) { const ed = engine.state.editor; ed.mode = "command"; ed.commandLine = ""; resetParse(ed); }
  function executeCommandLine(engine) {
    const ed = engine.state.editor;
    const cmd = ed.commandLine;
    ed.mode = "normal"; ed.commandLine = ""; resetParse(ed);
    const subMatch = cmd.match(/^(%?)s\/(.*?)\/(.*?)\/([a-z]*)$/);
    if (subMatch) {
      const [, scope, pattern, replacement, flags] = subMatch;
      const global = flags.includes("g");
      let re;
      try { re = new RegExp(pattern, global ? "g" : ""); } catch (e) { ed.message = "E486: Pattern not found: " + pattern; return; }
      const newLines = ed.lines.slice();
      const targetLines = scope === "%" ? newLines.map((_, i) => i) : [ed.cursor.line];
      let count = 0;
      targetLines.forEach((i) => { newLines[i] = newLines[i].replace(re, () => { count++; return replacement; }); });
      ed.lines = newLines;
      pushUndoNode(engine, "substitute");
      ed.message = `${count} substitution${count === 1 ? "" : "s"} made`;
      return;
    }
    // :g/pattern/cmd runs cmd on every line matching pattern; :v (or :g!) is
    // the inverse — every line NOT matching. Only "d" (delete) and a
    // trailing "s/from/to/[g]" (substitute) are supported as the command,
    // which covers the overwhelming majority of real-world :g usage without
    // building out a full Ex-command interpreter for its right-hand side.
    const gMatch = cmd.match(/^(g!?|v)\/(.*?)\/(.*)$/);
    if (gMatch) {
      const [, gtype, pattern, rest] = gMatch;
      const invert = gtype !== "g";
      let re;
      try { re = new RegExp(pattern); } catch (e) { ed.message = "E486: Pattern not found: " + pattern; return; }
      const matchingIdx = [];
      ed.lines.forEach((l, i) => { if (re.test(l) !== invert) matchingIdx.push(i); });
      if (rest === "d" || rest === "delete") {
        if (!matchingIdx.length) { ed.message = "Pattern not found: " + pattern; return; }
        const newLines = ed.lines.filter((_, i) => !matchingIdx.includes(i));
        ed.lines = newLines.length ? newLines : [""];
        ed.cursor = B.clampPos(ed.lines, ed.cursor);
        pushUndoNode(engine, "global-delete");
        ed.message = `${matchingIdx.length} fewer line${matchingIdx.length === 1 ? "" : "s"}`;
        return;
      }
      const subOnMatches = rest.match(/^s\/(.*?)\/(.*?)\/([a-z]*)$/);
      if (subOnMatches) {
        const [, subPattern, subReplacement, subFlags] = subOnMatches;
        const subGlobal = subFlags.includes("g");
        let subRe;
        try { subRe = new RegExp(subPattern, subGlobal ? "g" : ""); } catch (e) { ed.message = "E486: Pattern not found: " + subPattern; return; }
        const newLines = ed.lines.slice();
        let count = 0;
        matchingIdx.forEach((i) => { newLines[i] = newLines[i].replace(subRe, () => { count++; return subReplacement; }); });
        ed.lines = newLines;
        pushUndoNode(engine, "global-substitute");
        ed.message = `${count} substitution${count === 1 ? "" : "s"} on ${matchingIdx.length} line${matchingIdx.length === 1 ? "" : "s"}`;
        return;
      }
      ed.message = `E492: Not an editor command: ${cmd}`;
      return;
    }
    if (cmd === "w") { ed.message = '"buffer" written'; return; }
    if (cmd === "q") {
      if (activeTab(ed).windows.length > 1) { closeWindow(engine); return; }
      ed.message = "cannot close the only sandbox buffer"; return;
    }
    if (cmd === "wq") { ed.message = '"buffer" written'; return; }

    if (cmd === "enew") { switchToBuffer(engine, createBuffer(engine)); ed.message = ""; return; }
    const eMatch = cmd.match(/^e\s+(\S+)$/);
    if (eMatch) { switchToBuffer(engine, findBufferByName(ed, eMatch[1]) || createBuffer(engine, eMatch[1])); return; }
    if (cmd === "bn" || cmd === "bnext") {
      const ids = Object.keys(ed.buffers);
      const idx = ids.indexOf(ed.activeBufferId);
      switchToBuffer(engine, ids[(idx + 1) % ids.length]);
      return;
    }
    if (cmd === "bp" || cmd === "bprev" || cmd === "bprevious") {
      const ids = Object.keys(ed.buffers);
      const idx = ids.indexOf(ed.activeBufferId);
      switchToBuffer(engine, ids[(idx - 1 + ids.length) % ids.length]);
      return;
    }
    const bMatch = cmd.match(/^b(\d+)$/);
    if (bMatch) {
      if (!switchToBuffer(engine, bMatch[1])) ed.message = "E86: Buffer " + bMatch[1] + " does not exist";
      return;
    }
    if (cmd === "bd" || cmd === "bdelete") { deleteBuffer(engine, ed.activeBufferId); return; }
    const bdMatch = cmd.match(/^bd(?:elete)?\s+(\S+)$/);
    if (bdMatch) { deleteBuffer(engine, findBufferByName(ed, bdMatch[1]) || bdMatch[1]); return; }

    if (cmd === "sp" || cmd === "split") { splitWindow(engine, "horizontal", null); return; }
    if (cmd === "vsp" || cmd === "vsplit") { splitWindow(engine, "vertical", null); return; }
    const spMatch = cmd.match(/^(sp|split|vsp|vsplit)\s+(\S+)$/);
    if (spMatch) { splitWindow(engine, spMatch[1].startsWith("v") ? "vertical" : "horizontal", spMatch[2]); return; }
    if (cmd === "only" || cmd === "on") { onlyWindow(engine); return; }
    if (cmd === "close") { closeWindow(engine); return; }

    if (cmd === "tabnew") { newTab(engine, null); return; }
    const tabMatch = cmd.match(/^tabnew\s+(\S+)$/);
    if (tabMatch) { newTab(engine, tabMatch[1]); return; }
    if (cmd === "tabclose") { closeTab(engine); return; }

    ed.message = `E492: Not an editor command: ${cmd}`;
  }
  function feedCommandKey(engine, key) {
    const ed = engine.state.editor;
    if (key === "Escape") { ed.mode = "normal"; ed.commandLine = ""; return; }
    if (key === "Enter") return executeCommandLine(engine);
    if (key === "Backspace") { ed.commandLine = ed.commandLine.slice(0, -1); return; }
    ed.commandLine += key;
  }

  /* =============================== search =============================== */
  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  // Shared by performSearch and the widget-facing preview helpers below, so
  // there's exactly one place that turns a pattern into match positions.
  function findAllMatchIndices(lines, pattern) {
    let re;
    try { re = new RegExp(pattern, "g"); } catch (e) { return null; }
    const text = B.flatten(lines);
    const matches = [];
    let m;
    while ((m = re.exec(text))) {
      matches.push(m.index);
      if (m[0].length === 0) re.lastIndex++; // guard against infinite loop on a zero-width match
    }
    return matches;
  }

  function findSearchTargetIdx(lines, cursor, pattern, direction) {
    const matches = findAllMatchIndices(lines, pattern);
    if (matches === null || matches.length === 0) return null;
    const curIdx = B.toIndex(lines, cursor);
    let idx, wrapped = false;
    if (direction === "forward") {
      idx = matches.find((i) => i > curIdx);
      if (idx === undefined) { idx = matches[0]; wrapped = true; }
    } else {
      const before = matches.filter((i) => i < curIdx);
      idx = before.length ? before[before.length - 1] : matches[matches.length - 1];
      wrapped = !before.length;
    }
    return { idx, wrapped };
  }

  // Shared by /, ?, n, N, *, # once a pattern+direction is already known: if an
  // operator is pending, the search becomes that operator's motion (e.g.
  // d/foo, cn, y*) via the exact same resolveMotion/executeParsed pipeline
  // every other motion uses. Otherwise it's a plain cursor jump.
  function applySearchAsMotionOrJump(engine, p, pattern, direction) {
    const ed = engine.state.editor;
    if (!pattern) { ed.message = "E35: No previous regular expression"; resetParse(ed); return; }
    const found = findSearchTargetIdx(ed.lines, ed.cursor, pattern, direction);
    if (!found) { ed.message = "E486: Pattern not found: " + pattern; resetParse(ed); return; }
    if (p.operator) {
      p.motion = "search";
      p.searchTargetIdx = found.idx;
      return executeParsed(engine, p);
    }
    recordJumpMark(engine);
    ed.cursor = B.clampPos(ed.lines, B.toPos(ed.lines, found.idx));
    ed.message = found.wrapped ? (direction === "forward" ? "search hit BOTTOM, continuing at TOP" : "search hit TOP, continuing at BOTTOM") : "";
    resetParse(ed);
  }

  function enterSearch(engine, direction, operatorContext) {
    const ed = engine.state.editor;
    ed.mode = "search"; ed.searchDirection = direction; ed.searchLine = "";
    ed.searchOperatorContext = operatorContext || null;
    if (!operatorContext) resetParse(ed);
  }

  function executeSearchLine(engine) {
    const ed = engine.state.editor;
    const pattern = ed.searchLine;
    const direction = ed.searchDirection;
    const operatorContext = ed.searchOperatorContext;
    ed.mode = "normal"; ed.searchLine = ""; ed.searchOperatorContext = null;
    if (pattern) ed.lastSearch = { pattern, direction };
    if (operatorContext) {
      const p = ensureParse(ed);
      p.operator = operatorContext.operator;
      p.register = operatorContext.register;
      p.count1 = operatorContext.count1;
      p.count2 = operatorContext.count2;
      applySearchAsMotionOrJump(engine, p, pattern, direction);
      return;
    }
    applySearchAsMotionOrJump(engine, ensureParse(ed), pattern, direction);
  }

  function feedSearchKey(engine, key) {
    const ed = engine.state.editor;
    if (key === "Escape") { ed.mode = "normal"; ed.searchLine = ""; ed.searchOperatorContext = null; resetParse(ed); return; }
    if (key === "Enter") return executeSearchLine(engine);
    if (key === "Backspace") { ed.searchLine = ed.searchLine.slice(0, -1); return; }
    ed.searchLine += key;
  }

  function repeatSearch(engine, p, reverse) {
    const ed = engine.state.editor;
    if (!ed.lastSearch) { ed.message = "E35: No previous regular expression"; resetParse(ed); return; }
    const dir = reverse ? (ed.lastSearch.direction === "forward" ? "backward" : "forward") : ed.lastSearch.direction;
    applySearchAsMotionOrJump(engine, p, ed.lastSearch.pattern, dir);
  }

  function searchWordUnderCursor(engine, p, direction) {
    const ed = engine.state.editor;
    const wordRange = B.textObjectWord(ed.lines, ed.cursor, false);
    if (!wordRange) { ed.message = "E348: No string under cursor"; resetParse(ed); return; }
    const word = B.rangeText(ed.lines, wordRange);
    const pattern = "\\b" + escapeRegExp(word) + "\\b";
    ed.lastSearch = { pattern, direction };
    applySearchAsMotionOrJump(engine, p, pattern, direction);
  }

  // Read-only preview helpers for the Module 6 widget — no engine state is
  // ever mutated here, they just report what would happen.
  function previewSearchMatches(engine, pattern) {
    const ed = engine.state.editor;
    if (!pattern) return { count: 0, valid: true };
    const matches = findAllMatchIndices(ed.lines, pattern);
    if (matches === null) return { count: 0, valid: false };
    return { count: matches.length, valid: true };
  }

  function previewSubstitute(engine, commandLine) {
    const ed = engine.state.editor;
    const m = commandLine.match(/^(%?)s\/(.*?)\/(.*?)\/([a-z]*)$/);
    if (!m) return { valid: false };
    const [, scopeFlag, pattern, replacement, flags] = m;
    const global = flags.includes("g");
    let re;
    try { re = new RegExp(pattern, "g"); } catch (e) { return { valid: false, error: "bad pattern" }; }
    const targetLines = scopeFlag === "%" ? ed.lines : [ed.lines[ed.cursor.line]];
    let matchCount = 0, lineCount = 0;
    targetLines.forEach((lineText) => {
      const found = lineText.match(re);
      if (found) { lineCount++; matchCount += global ? found.length : 1; }
    });
    return { valid: true, scope: scopeFlag === "%" ? "whole buffer" : "current line only", pattern, replacement, flags, global, matchCount, lineCount };
  }

  // Live preview for :g/:v — mirrors previewSubstitute, but for the global
  // command instead. Understands the same two right-hand-side forms
  // executeCommandLine does (d, and s/from/to/[g]) so the panel can show
  // exactly what will happen before Enter is pressed.
  function previewGlobal(engine, commandLine) {
    const ed = engine.state.editor;
    const m = commandLine.match(/^(g!?|v)\/(.*?)\/(.*)$/);
    if (!m) return { valid: false };
    const [, gtype, pattern, rest] = m;
    const invert = gtype !== "g";
    let re;
    try { re = new RegExp(pattern); } catch (e) { return { valid: false, error: "bad pattern" }; }
    const matchingIdx = [];
    ed.lines.forEach((l, i) => { if (re.test(l) !== invert) matchingIdx.push(i); });
    const base = { valid: true, invert, pattern, matchingCount: matchingIdx.length, totalLines: ed.lines.length };
    if (rest === "" ) return { ...base, cmdKind: "incomplete" };
    if (rest === "d" || rest === "delete") return { ...base, cmdKind: "delete" };
    const subMatch = rest.match(/^s\/(.*?)\/(.*?)\/([a-z]*)$/);
    if (subMatch) {
      const [, subPattern, subReplacement, subFlags] = subMatch;
      const subGlobal = subFlags.includes("g");
      let subRe, subMatchCount = 0;
      try { subRe = new RegExp(subPattern, "g"); } catch (e) { return { ...base, cmdKind: "substitute", cmdValid: false }; }
      matchingIdx.forEach((i) => { const found = ed.lines[i].match(subRe); if (found) subMatchCount += subGlobal ? found.length : 1; });
      return { ...base, cmdKind: "substitute", cmdValid: true, subPattern, subReplacement, subGlobal, subMatchCount };
    }
    return { ...base, cmdKind: "unknown" };
  }

  /* =============================== simple normal-mode commands =============================== */
  function doPaste(engine, p, after) {
    const ed = engine.state.editor;
    const reg = ed.registers[p.register || "unnamed"];
    resetParse(ed);
    if (!reg || !reg.text) { ed.message = "nothing to paste"; return; }
    if (reg.blockwise) {
      // Each stored line goes at the same column on consecutive buffer
      // lines (padding short lines with spaces so the block still lines up),
      // rather than as one contiguous run of text — that's what makes block
      // yank/paste round-trip a rectangle instead of scrambling it into a
      // single-line insert.
      const blockLines = reg.text.split("\n");
      const col = after ? ed.cursor.col + 1 : ed.cursor.col;
      const newLines = ed.lines.slice();
      for (let i = 0; i < blockLines.length; i++) {
        const l = ed.cursor.line + i;
        if (newLines[l] === undefined) newLines.push("");
        let line = newLines[l];
        if (line.length < col) line = line + " ".repeat(col - line.length);
        newLines[l] = line.slice(0, col) + blockLines[i] + line.slice(col);
      }
      commitEdit(engine, newLines, { line: ed.cursor.line, col }, "paste");
      ed.wantCol = ed.cursor.col;
      return;
    }
    if (reg.linewise) {
      const linesToInsert = reg.text.split("\n");
      const insertAt = after ? ed.cursor.line + 1 : ed.cursor.line;
      const nl = ed.lines.slice();
      nl.splice(insertAt, 0, ...linesToInsert);
      shiftMarksForSplice(ed, insertAt, 0, linesToInsert.length);
      commitEdit(engine, nl, { line: insertAt, col: B.firstNonBlankCol(linesToInsert[0]) }, "paste");
    } else {
      const insertCol = after ? Math.min(ed.lines[ed.cursor.line].length, ed.cursor.col + 1) : ed.cursor.col;
      const oldLineCount = ed.lines.length;
      const r = B.insertTextAt(ed.lines, { line: ed.cursor.line, col: insertCol }, reg.text);
      shiftMarksForSplice(ed, ed.cursor.line, 1, 1 + (r.lines.length - oldLineCount));
      commitEdit(engine, r.lines, { line: r.end.line, col: Math.max(0, r.end.col - 1) }, "paste");
    }
    ed.wantCol = ed.cursor.col;
  }
  function doDeleteChar(engine, p, forward) {
    const ed = engine.state.editor;
    const count = totalCount(p);
    resetParse(ed);
    const lineText = ed.lines[ed.cursor.line];
    if (forward) {
      const end = Math.min(lineText.length - 1, ed.cursor.col + count - 1);
      if (end < ed.cursor.col || lineText.length === 0) return;
      const range = { start: { line: ed.cursor.line, col: ed.cursor.col }, end: { line: ed.cursor.line, col: end }, linewise: false };
      setRegisterAfterDelete(engine, B.rangeText(ed.lines, range), false, null);
      commitEdit(engine, B.deleteRange(ed.lines, range), ed.cursor, "delete-char");
    } else {
      const start = Math.max(0, ed.cursor.col - count);
      if (start >= ed.cursor.col) return;
      const range = { start: { line: ed.cursor.line, col: start }, end: { line: ed.cursor.line, col: ed.cursor.col - 1 }, linewise: false };
      setRegisterAfterDelete(engine, B.rangeText(ed.lines, range), false, null);
      commitEdit(engine, B.deleteRange(ed.lines, range), { line: ed.cursor.line, col: start }, "delete-char");
    }
    ed.wantCol = ed.cursor.col;
  }
  function doToEndOfLine(engine, p, op) {
    const ed = engine.state.editor;
    resetParse(ed);
    const range = { start: { ...ed.cursor }, end: { line: ed.cursor.line, col: B.lastCol(ed.lines, ed.cursor.line) }, linewise: false };
    applyOperator(engine, op, range, p.register);
  }
  function doToggleCaseUnderCursor(engine, p) {
    const ed = engine.state.editor;
    const count = totalCount(p);
    resetParse(ed);
    const lineText = ed.lines[ed.cursor.line];
    if (!lineText.length) return;
    const endCol = Math.min(lineText.length - 1, ed.cursor.col + count - 1);
    const chars = lineText.split("");
    for (let c = ed.cursor.col; c <= endCol; c++) chars[c] = chars[c] === chars[c].toUpperCase() ? chars[c].toLowerCase() : chars[c].toUpperCase();
    const nl = ed.lines.slice();
    nl[ed.cursor.line] = chars.join("");
    commitEdit(engine, nl, { line: ed.cursor.line, col: Math.min(nl[ed.cursor.line].length - 1, endCol + 1) }, "tilde");
    ed.wantCol = ed.cursor.col;
  }

  // J: join the current line with the next `count-1` lines (so plain "J"
  // joins 2 lines total, "3J" joins 3). Matches real Vim's simplified rule:
  // the joined line's leading whitespace is stripped and replaced with a
  // single space, except when the following text is empty or starts with
  // ")" (no space inserted then), or the line above already ends in
  // whitespace (no extra space added). Doesn't model every real-Vim
  // exception (e.g. never inserting two spaces after a '.'), just the
  // common case.
  function doJoinLines(engine, p) {
    const ed = engine.state.editor;
    const count = totalCount(p);
    resetParse(ed);
    const joins = Math.max(1, count - 1);
    let joinCol = null;
    for (let i = 0; i < joins; i++) {
      if (ed.cursor.line >= ed.lines.length - 1) break;
      const newLines = ed.lines.slice();
      const top = newLines[ed.cursor.line];
      const bottomTrimmed = newLines[ed.cursor.line + 1].replace(/^[ \t]+/, "");
      const sep = (bottomTrimmed.length === 0 || top.length === 0 || /\s$/.test(top) || bottomTrimmed[0] === ")") ? "" : " ";
      joinCol = top.length;
      newLines.splice(ed.cursor.line, 2, top + sep + bottomTrimmed);
      shiftMarksForSplice(ed, ed.cursor.line, 2, 1);
      ed.lines = newLines;
    }
    if (joinCol !== null) {
      pushUndoNode(engine, "join");
      ed.cursor = { line: ed.cursor.line, col: Math.min(joinCol, B.lastCol(ed.lines, ed.cursor.line)) };
      ed.wantCol = ed.cursor.col;
    }
  }

  // r{char}: replace `count` characters starting at the cursor with the
  // typed character, without entering Insert mode. Cursor lands on the
  // last replaced character (matching real Vim). Refuses (does nothing) if
  // there aren't enough characters left on the line, same as real Vim
  // beeping rather than replacing past the end of the line. Escape cancels
  // with no change.
  function doReplaceChar(engine, p, ch) {
    const ed = engine.state.editor;
    const count = totalCount(p);
    resetParse(ed);
    if (ch === "Escape") return;
    if (ch === "Enter" || ch === "Backspace" || ch === "Tab") return; // out of scope for this sim's r — no-op rather than corrupt the buffer
    const lineText = ed.lines[ed.cursor.line];
    if (count > lineText.length - ed.cursor.col) return;
    const newLines = ed.lines.slice();
    newLines[ed.cursor.line] = lineText.slice(0, ed.cursor.col) + ch.repeat(count) + lineText.slice(ed.cursor.col + count);
    commitEdit(engine, newLines, { line: ed.cursor.line, col: ed.cursor.col + count - 1 }, "replace-char");
    ed.wantCol = ed.cursor.col;
  }

  // R: Replace mode. Typing overwrites existing characters instead of
  // inserting; Backspace restores whatever character used to be there
  // (only back to where R was pressed — matches real Vim, which won't
  // "un-replace" past the start of the session). Typing past the end of
  // the line simply extends it, same as Insert mode.
  function enterReplace(engine) {
    const ed = engine.state.editor;
    ed.insertSnapshot = ed.lines.slice();
    ed.replaceOverwritten = [];
    ed.mode = "replace";
    resetParse(ed);
  }
  function feedReplaceKey(engine, key) {
    const ed = engine.state.editor;
    if (key === "Escape") {
      ed.mode = "normal";
      ed.cursor = { line: ed.cursor.line, col: Math.max(0, ed.cursor.col - 1) };
      ed.wantCol = ed.cursor.col;
      if (JSON.stringify(ed.lines) !== JSON.stringify(ed.insertSnapshot)) pushUndoNode(engine, "replace");
      ed.insertSnapshot = null; ed.replaceOverwritten = null;
      return;
    }
    if (key === "Backspace") {
      if (!ed.replaceOverwritten.length) {
        if (ed.cursor.col > 0) ed.cursor = { line: ed.cursor.line, col: ed.cursor.col - 1 };
        return;
      }
      const last = ed.replaceOverwritten.pop();
      const line = ed.lines[last.line];
      const newLines = ed.lines.slice();
      newLines[last.line] = last.ch === null ? line.slice(0, last.col) + line.slice(last.col + 1) : line.slice(0, last.col) + last.ch + line.slice(last.col + 1);
      ed.lines = newLines;
      ed.cursor = { line: last.line, col: last.col };
      return;
    }
    if (key === "Enter") {
      const r = B.insertTextAt(ed.lines, ed.cursor, "\n");
      shiftMarksForSplice(ed, ed.cursor.line, 1, 2);
      ed.lines = r.lines; ed.cursor = r.end;
      return;
    }
    const line = ed.lines[ed.cursor.line];
    const newLines = ed.lines.slice();
    if (ed.cursor.col < line.length) {
      ed.replaceOverwritten.push({ line: ed.cursor.line, col: ed.cursor.col, ch: line[ed.cursor.col] });
      newLines[ed.cursor.line] = line.slice(0, ed.cursor.col) + key + line.slice(ed.cursor.col + 1);
    } else {
      ed.replaceOverwritten.push({ line: ed.cursor.line, col: ed.cursor.col, ch: null });
      newLines[ed.cursor.line] = line + key;
    }
    ed.lines = newLines;
    ed.cursor = { line: ed.cursor.line, col: ed.cursor.col + 1 };
  }

  // Ctrl-a / Ctrl-x: find the first number on the current line that ends at
  // or after the cursor, and add/subtract `count` from it. Preserves a
  // leading-zero field width (e.g. "007" -> "008") and a leading "-" sign.
  function doIncrementNumber(engine, p, sign) {
    const ed = engine.state.editor;
    const delta = totalCount(p) * sign;
    resetParse(ed);
    const lineText = ed.lines[ed.cursor.line];
    const re = /-?\d+/g;
    let m, found = null;
    while ((m = re.exec(lineText))) {
      if (m.index + m[0].length - 1 >= ed.cursor.col) { found = m; break; }
    }
    if (!found) return;
    const numStr = found[0];
    const start = found.index;
    const digits = numStr[0] === "-" ? numStr.slice(1) : numStr;
    const width = digits.length;
    const hasLeadingZero = width > 1 && digits[0] === "0";
    const val = parseInt(numStr, 10) + delta;
    let newStr = String(Math.abs(val));
    if (hasLeadingZero) newStr = newStr.padStart(width, "0");
    newStr = (val < 0 ? "-" : "") + newStr;
    const newLines = ed.lines.slice();
    newLines[ed.cursor.line] = lineText.slice(0, start) + newStr + lineText.slice(start + numStr.length);
    commitEdit(engine, newLines, { line: ed.cursor.line, col: start + newStr.length - 1 }, "increment");
    ed.wantCol = ed.cursor.col;
  }

  /* =============================== macros =============================== */
  // A macro that replays itself, directly or through another macro, recurses
  // through feedKey with no natural base case. A pure self-loop (@a inside a)
  // is caught by a depth cap alone, but a *branching* mutual recursion (a
  // calls b twice, b calls a twice, ...) can stay within any reasonable depth
  // cap while still doing exponentially more total work at each level, which
  // hangs the tab instead of erroring. So this guards both dimensions: max
  // nesting depth AND a total step budget shared across the whole call tree,
  // matching the spirit of real Vim's E169 guard against runaway recursion.
  const MAX_MACRO_DEPTH = 50;
  const MAX_MACRO_STEPS = 20000;
  function startMacroRecording(engine, reg) { const ed = engine.state.editor; ed.macroRecording = reg; ed.macroKeys = []; }
  function stopMacroRecording(engine) { const ed = engine.state.editor; if (ed.macroRecording) { ed.macros[ed.macroRecording] = ed.macroKeys.slice(); ed.macroRecording = null; } }
  function replayMacro(engine, reg, times) {
    const ed = engine.state.editor;
    const target = reg === "@" ? ed.lastMacroReg : reg;
    const keys = target ? ed.macros[target] : null;
    if (!keys) { ed.message = "macro not set"; return; }
    ed.lastMacroReg = target;

    const isTopLevel = !ed._macroDepth;
    if (isTopLevel) { ed._macroDepth = 0; ed._macroSteps = 0; ed._macroAborted = false; }
    ed._macroDepth++;
    if (ed._macroDepth > MAX_MACRO_DEPTH) ed._macroAborted = true;

    if (!ed._macroAborted) {
      const n = times && times > 0 ? times : 1;
      outer:
      for (let i = 0; i < n; i++) {
        for (const k of keys) {
          if (ed._macroAborted) break outer;
          ed._macroSteps++;
          if (ed._macroSteps > MAX_MACRO_STEPS) { ed._macroAborted = true; break outer; }
          feedKey(engine, k);
        }
      }
    }

    ed._macroDepth--;
    if (isTopLevel) {
      if (ed._macroAborted) ed.message = "E169: Command too recursive";
      ed._macroDepth = 0;
      ed._macroSteps = 0;
      ed._macroAborted = false;
    }
  }

  /* =============================== buffers, windows, tabs =============================== */
  // Design: ed.lines/ed.cursor/ed.undo/ed.marks always hold the CURRENTLY
  // ACTIVE buffer's live state — every existing motion/operator/undo function
  // keeps working exactly as before, completely unaware buffers even exist.
  // ed.buffers[id] holds metadata for every buffer; for buffers OTHER than
  // the active one, it also holds a saved snapshot of lines/cursor/undo/marks.
  // Switching buffers is just "save active snapshot into the registry, load
  // the target's snapshot into the live fields."
  function freshUndo(lines) {
    return { nodes: { 0: { id: 0, parentId: null, lines: lines.slice(), cursor: { line: 0, col: 0 }, childIds: [], lastChild: null, label: "initial" } }, currentId: 0, nextId: 1 };
  }

  function createBuffer(engine, name) {
    const ed = engine.state.editor;
    const id = String(ed.nextBufferId++);
    ed.buffers[id] = { id, name: name || `[No Name ${id}]`, lines: [""], cursor: { line: 0, col: 0 }, undo: freshUndo([""]), marks: {} };
    return id;
  }

  function findBufferByName(ed, name) {
    return Object.keys(ed.buffers).find((k) => ed.buffers[k].name === name) || null;
  }

  function switchToBuffer(engine, targetId) {
    const ed = engine.state.editor;
    if (!ed.buffers[targetId]) return false;
    if (targetId !== ed.activeBufferId) {
      if (ed.buffers[ed.activeBufferId]) {
        ed.buffers[ed.activeBufferId].lines = ed.lines;
        ed.buffers[ed.activeBufferId].cursor = ed.cursor;
        ed.buffers[ed.activeBufferId].undo = ed.undo;
        ed.buffers[ed.activeBufferId].marks = ed.marks;
      }
      const target = ed.buffers[targetId];
      ed.lines = target.lines ? target.lines : [""];
      ed.cursor = target.cursor ? target.cursor : { line: 0, col: 0 };
      ed.undo = target.undo ? target.undo : freshUndo(ed.lines);
      ed.marks = target.marks ? target.marks : {};
      ed.activeBufferId = targetId;
      // Keep the current window's bufferId in sync with whatever buffer is
      // now actually active. Without this, a direct switchToBuffer call
      // (e.g. the buffer explorer's "switch" button, rather than switching
      // via a window) leaves activeBufferId pointing at a buffer no window
      // claims to show — which fools deleteBuffer's "is this buffer open in
      // a window" safety check into allowing the truly-active buffer to be
      // deleted out from under the editor.
      const t = activeTab(ed);
      if (t) {
        const w = t.windows.find((x) => x.id === t.activeWindowId);
        if (w) w.bufferId = targetId;
      }
    }
    ed.mode = "normal";
    resetParse(ed);
    return true;
  }

  function deleteBuffer(engine, targetId) {
    const ed = engine.state.editor;
    if (!ed.buffers[targetId]) { ed.message = "E94: No matching buffer"; return; }
    if (Object.keys(ed.buffers).length < 2) { ed.message = "E90: Cannot unload last buffer"; return; }
    const openElsewhere = ed.tabs.some((t) => t.windows.some((w) => w.bufferId === targetId));
    if (openElsewhere) { ed.message = "E89: buffer is open in a window (close that window first)"; return; }
    delete ed.buffers[targetId];
    Object.keys(ed.globalMarks).forEach((letter) => { if (ed.globalMarks[letter].bufferId === targetId) delete ed.globalMarks[letter]; });
    ed.message = "buffer deleted";
  }

  function activeTab(ed) { return ed.tabs.find((t) => t.id === ed.activeTabId); }

  function switchToWindow(engine, windowId) {
    const ed = engine.state.editor;
    const t = activeTab(ed);
    const w = t.windows.find((x) => x.id === windowId);
    if (!w) return;
    t.activeWindowId = windowId;
    switchToBuffer(engine, w.bufferId);
  }

  function cycleWindow(engine) {
    const ed = engine.state.editor;
    const t = activeTab(ed);
    if (t.windows.length < 2) { ed.message = "only one window"; return; }
    const idx = t.windows.findIndex((w) => w.id === t.activeWindowId);
    switchToWindow(engine, t.windows[(idx + 1) % t.windows.length].id);
  }

  function splitWindow(engine, direction, bufferName) {
    const ed = engine.state.editor;
    const t = activeTab(ed);
    const bufferId = bufferName ? (findBufferByName(ed, bufferName) || createBuffer(engine, bufferName)) : ed.activeBufferId;
    const id = "w" + ed.nextWindowId++;
    const activeIdx = t.windows.findIndex((w) => w.id === t.activeWindowId);
    t.windows.splice(activeIdx + 1, 0, { id, bufferId });
    t.splitDirection = direction;
    switchToWindow(engine, id);
  }

  function closeWindow(engine) {
    const ed = engine.state.editor;
    const t = activeTab(ed);
    if (t.windows.length < 2) { ed.message = "cannot close the only window in this tab"; return false; }
    const idx = t.windows.findIndex((w) => w.id === t.activeWindowId);
    t.windows.splice(idx, 1);
    switchToWindow(engine, t.windows[Math.min(idx, t.windows.length - 1)].id);
    return true;
  }

  function onlyWindow(engine) {
    const ed = engine.state.editor;
    const t = activeTab(ed);
    t.windows = [{ id: t.activeWindowId, bufferId: ed.activeBufferId }];
  }

  function switchToTab(engine, tabId) {
    const ed = engine.state.editor;
    const t = ed.tabs.find((x) => x.id === tabId);
    if (!t) return;
    ed.activeTabId = tabId;
    switchToWindow(engine, t.activeWindowId);
  }

  function newTab(engine, bufferName) {
    const ed = engine.state.editor;
    const bufferId = bufferName ? (findBufferByName(ed, bufferName) || createBuffer(engine, bufferName)) : createBuffer(engine);
    const winId = "w" + ed.nextWindowId++;
    const tabId = "t" + ed.nextTabId++;
    ed.tabs.push({ id: tabId, windows: [{ id: winId, bufferId }], activeWindowId: winId, splitDirection: "horizontal" });
    switchToTab(engine, tabId);
  }

  function cycleTab(engine, reverse) {
    const ed = engine.state.editor;
    const idx = ed.tabs.findIndex((t) => t.id === ed.activeTabId);
    const next = ed.tabs[(idx + (reverse ? -1 : 1) + ed.tabs.length) % ed.tabs.length];
    switchToTab(engine, next.id);
  }

  function closeTab(engine) {
    const ed = engine.state.editor;
    if (ed.tabs.length < 2) { ed.message = "cannot close the only tab"; return; }
    const idx = ed.tabs.findIndex((t) => t.id === ed.activeTabId);
    ed.tabs.splice(idx, 1);
    switchToTab(engine, ed.tabs[Math.min(idx, ed.tabs.length - 1)].id);
  }

  /* =============================== normal mode dispatch =============================== */
  function feedNormalKey(engine, key) {
    const ed = engine.state.editor;
    const p = ensureParse(ed);
    ed.message = "";

    if (p.awaitingChar) {
      const kind = p.awaitingChar; p.awaitingChar = null;
      if (kind === "register") { p.register = key; ed.pending = "pending"; return; }
      if (kind === "find") { p.findChar = key; return executeParsed(engine, p); }
      if (kind === "textobject") { p.textObjectChar = key; return executeParsed(engine, p); }
      if (kind === "mark-set") { setMark(engine, key); resetParse(ed); return; }
      if (kind === "mark-jump-line") {
        if (p.operator) {
          if (!resolveMarkPosition(ed, key)) { ed.message = `mark '${key}' not set`; resetParse(ed); return; }
          p.motion = "mark-line"; p.markLetter = key; return executeParsed(engine, p);
        }
        jumpToMark(engine, key, false); resetParse(ed); return;
      }
      if (kind === "mark-jump-exact") {
        if (p.operator) {
          if (!resolveMarkPosition(ed, key)) { ed.message = `mark '${key}' not set`; resetParse(ed); return; }
          p.motion = "mark-exact"; p.markLetter = key; return executeParsed(engine, p);
        }
        jumpToMark(engine, key, true); resetParse(ed); return;
      }
      if (kind === "macro-record") { startMacroRecording(engine, key); resetParse(ed); return; }
      if (kind === "replace-char") { doReplaceChar(engine, p, key); return; }
      if (kind === "macro-replay") {
        const times = totalCount(p);
        resetParse(ed); // clear BEFORE replay so leftover count/operator state can't leak into the macro's own first keystroke
        replayMacro(engine, key, times);
        return;
      }
      if (kind === "g-prefix") {
        if (key === "g") { p.motion = "gg"; return executeParsed(engine, p); }
        if (key === "e") { p.motion = "ge"; return executeParsed(engine, p); }
        if (key === "E") { p.motion = "gE"; return executeParsed(engine, p); }
        if (key === "v" && !p.operator) {
          if (ed.lastVisual) {
            ed.mode = ed.lastVisual.mode;
            ed.visualAnchor = B.clampPos(ed.lines, ed.lastVisual.anchor);
            ed.cursor = B.clampPos(ed.lines, ed.lastVisual.cursor);
            ed.wantCol = ed.cursor.col;
          } else { ed.message = "no previous visual selection"; }
          resetParse(ed); return;
        }
        if (key === "t") { cycleTab(engine, false); resetParse(ed); return; }
        if (key === "T") { cycleTab(engine, true); resetParse(ed); return; }
        if ((key === "~" || key === "u" || key === "U") && !p.operator) { p.operator = "g" + key; ed.pending = "pending"; return; }
        resetParse(ed); return;
      }
      if (kind === "ctrl-w-prefix") {
        if (key === "w") cycleWindow(engine);
        else if (key === "s") splitWindow(engine, "horizontal", null);
        else if (key === "v") splitWindow(engine, "vertical", null);
        else if (key === "c") closeWindow(engine);
        else if (key === "o") onlyWindow(engine);
        resetParse(ed); return;
      }
      resetParse(ed); return;
    }

    if (/[1-9]/.test(key) || (key === "0" && (p.operator ? p.count2 : p.count1) !== "")) {
      if (p.operator) p.count2 += key; else p.count1 += key;
      ed.pending = "pending"; return;
    }
    if (key === '"' && !p.operator) { p.awaitingChar = "register"; ed.pending = "pending"; return; }
    if (key === "g" && !p.operator) { p.awaitingChar = "g-prefix"; ed.pending = "pending"; return; }
    if (key === "ctrl-w" && !p.operator) { p.awaitingChar = "ctrl-w-prefix"; return; }
    if (key === "m" && !p.operator) { p.awaitingChar = "mark-set"; return; }
    if (key === "'") { p.awaitingChar = "mark-jump-line"; return; }
    if (key === "`") { p.awaitingChar = "mark-jump-exact"; return; }
    if (key === "q" && !p.operator) {
      if (ed.macroRecording) { stopMacroRecording(engine); resetParse(ed); return; }
      p.awaitingChar = "macro-record"; return;
    }
    if (key === "@" && !p.operator) { p.awaitingChar = "macro-replay"; return; }
    if (key === "r" && !p.operator) { p.awaitingChar = "replace-char"; return; }

    if (!p.operator && "dcy".includes(key)) { p.operator = key; ed.pending = "pending"; return; }
    if (!p.operator && (key === ">" || key === "<")) { p.operator = key; ed.pending = "pending"; return; }
    if (p.operator && key === p.operator) { p.motion = "LINEWISE_SELF"; return executeParsed(engine, p); }
    if (p.operator && (key === "i" || key === "a")) { p.textObjectKind = key; p.awaitingChar = "textobject"; ed.pending = "pending"; return; }
    if ("fFtT".includes(key)) { p.motion = key; p.awaitingChar = "find"; ed.pending = "pending"; return; }

    if ("hjklwbe0^$%;,{}()".includes(key) || "WBEG".includes(key) || key === "H" || key === "M" || key === "L") { p.motion = key; return executeParsed(engine, p); }

    if (!p.operator) {
      if (key === "x") return doDeleteChar(engine, p, true);
      if (key === "X") return doDeleteChar(engine, p, false);
      if (key === "D") return doToEndOfLine(engine, p, "d");
      if (key === "C") return doToEndOfLine(engine, p, "c");
      if (key === "Y") return doToEndOfLine(engine, p, "y");
      if (key === "p") return doPaste(engine, p, true);
      if (key === "P") return doPaste(engine, p, false);
      if (key === "u") { undo(engine); resetParse(ed); return; }
      if (key === "ctrl-r") { redo(engine); resetParse(ed); return; }
      if (key === "~") return doToggleCaseUnderCursor(engine, p);
      if (key === "i") return enterInsert(engine, "i");
      if (key === "a") return enterInsert(engine, "a");
      if (key === "I") return enterInsert(engine, "I");
      if (key === "A") return enterInsert(engine, "A");
      if (key === "o") return enterInsert(engine, "o");
      if (key === "O") return enterInsert(engine, "O");
      if (key === "v") return enterVisual(engine, "visual");
      if (key === "V") return enterVisual(engine, "visual-line");
      if (key === "ctrl-v") return enterVisual(engine, "visual-block");
      if (key === ":") return enterCommand(engine);
      if (key === "J") return doJoinLines(engine, p);
      if (key === "R") return enterReplace(engine);
      if (key === "ctrl-a") return doIncrementNumber(engine, p, 1);
      if (key === "ctrl-x") return doIncrementNumber(engine, p, -1);
      if (key === "ctrl-o") { jumpBack(engine); resetParse(ed); return; }
      if (key === "ctrl-i") { jumpForward(engine); resetParse(ed); return; }
    }

    // Search motions work as bare cursor jumps OR, with an operator already
    // pending, as that operator's motion (d/foo, cn, y*, ...) — both paths
    // share applySearchAsMotionOrJump above.
    if (key === "/") return enterSearch(engine, "forward", p.operator ? { operator: p.operator, register: p.register, count1: p.count1, count2: p.count2 } : null);
    if (key === "?") return enterSearch(engine, "backward", p.operator ? { operator: p.operator, register: p.register, count1: p.count1, count2: p.count2 } : null);
    if (key === "n") return repeatSearch(engine, p, false);
    if (key === "N") return repeatSearch(engine, p, true);
    if (key === "*") return searchWordUnderCursor(engine, p, "forward");
    if (key === "#") return searchWordUnderCursor(engine, p, "backward");

    resetParse(ed);
  }

  function executeParsed(engine, p) {
    const ed = engine.state.editor;
    const resolved = resolveMotion(engine, p);
    if (!resolved) { resetParse(ed); ed.message = "no match"; return; }
    if (!p.operator) {
      if (p.motion === "G" || p.motion === "gg" || p.motion === "%") recordJumpMark(engine);
      ed.cursor = B.clampPos(ed.lines, resolved.newCursor || resolved.range.start);
      updateWantCol(ed, p.motion);
      resetParse(ed);
      return;
    }
    applyOperator(engine, p.operator, resolved.range, p.register);
    resetParse(ed);
  }

  /* =============================== dot-repeat (".") =============================== */
  // Real Vim's "." replays "the last change" — the most recent buffer-modifying
  // command, whatever grammar produced it (operator+motion, operator+text
  // object, an insert session's typed text, x/D/C/p/~, a visual-mode
  // operator...). Rather than modeling every command type as its own
  // structured record (brittle — every new command would need its own dot-
  // repeat case), this records the *raw keystrokes* of the last command that
  // actually changed the buffer, the same way macro recording already works,
  // and replays them through feedKey itself. That gets motions/text objects/
  // counts/registers re-resolved fresh against the current cursor for free
  // (so "dw." deletes the *next* word, not a fixed range), and it composes
  // naturally with macros (a macro invocation that changes the buffer is
  // itself a repeatable "change").
  //
  // Known, deliberate scope limits (documented rather than silently wrong):
  //  - A count typed before "." (e.g. "3.") overrides a *leading* count on
  //    the recorded command (matches "3x", "3dd", ...). If the original
  //    command's count lived elsewhere (rare — e.g. typed literally as
  //    "d3w"), the new count is prepended instead of substituted, so it
  //    multiplies rather than replaces. Still valid Vim grammar, just not a
  //    true override in that one case.
  //  - Visual-mode operators are repeated by literally replaying the motion
  //    keys that built the selection (e.g. "vjjd") from the new cursor
  //    position, which reproduces real Vim's "same shape, new location"
  //    behavior for relative motions, but not for absolute jumps used to
  //    build the original selection.
  //  - "." after a macro replay (e.g. "@a.") repeats the whole "@a" that was
  //    just run, not only the last atomic change inside the macro the way
  //    real Vim's separate change-vs-command tracking does. Simpler and
  //    still predictable, at the cost of not being byte-for-byte Vim.
  function repeatLastChange(engine) {
    const ed = engine.state.editor;
    const p = ed.parse;
    const overrideCount = p && p.count1 ? p.count1 : null;
    resetParse(ed);
    if (!ed.lastChangeKeys || !ed.lastChangeKeys.length) { ed.message = "nothing to repeat"; return; }
    let keys = ed.lastChangeKeys;
    if (overrideCount) {
      let i = 0;
      while (i < keys.length && /[0-9]/.test(keys[i]) && !(i === 0 && keys[i] === "0")) i++;
      keys = overrideCount.split("").concat(keys.slice(i));
    }
    keys.forEach((k) => feedKey(engine, k));
  }

  /* =============================== top-level entry point =============================== */
  function dispatchByMode(engine, key) {
    const ed = engine.state.editor;
    if (ed.mode === "normal") return feedNormalKey(engine, key);
    if (ed.mode === "insert") return feedInsertKey(engine, key);
    if (ed.mode === "replace") return feedReplaceKey(engine, key);
    if (ed.mode === "visual" || ed.mode === "visual-line" || ed.mode === "visual-block") return feedVisualKey(engine, key);
    if (ed.mode === "command") return feedCommandKey(engine, key);
    if (ed.mode === "search") return feedSearchKey(engine, key);
  }

  function feedKey(engine, key) {
    const ed = engine.state.editor;
    const isNestedCall = !!ed._feedDepth;

    // Macro recording captures only genuinely top-level keystrokes, not the
    // expanded keys of a nested replay (a macro invoking another macro via
    // "@b", or a dot-repeat replay). Recording used to push from inside
    // feedNormalKey/feedInsertKey/feedVisualKey directly, which didn't
    // distinguish a real keystroke from a replayed one — so recording macro
    // 'a' as "@b" would also capture every key macro 'b' expanded into,
    // double-applying it on every future replay of 'a'. Centralizing it here
    // with the same depth guard as the change-tracking below fixes that: the
    // literal "@","b" get recorded, and the replay that actually performs
    // b's edit (needed so 'a' itself does something while being recorded)
    // does NOT also add its own keys to 'a's definition.
    if (!isNestedCall && ed.macroRecording) {
      const p = ed.parse; // read-only: must NOT lazily materialize ed.parse here, or it corrupts the fresh-boundary check below
      const isStopRecording = ed.mode === "normal" && key === "q" && (!p || (!p.operator && !p.awaitingChar && p.count1 === ""));
      if (!isStopRecording) ed.macroKeys.push(key);
    }

    // "." bypasses the change-tracking bookkeeping below entirely, at every
    // level of nesting — not just when typed directly. If it were tracked
    // like a normal key, a top-level "." could end up recorded as the new
    // lastChangeKeys (= ["."]), and the *next* "." would then replay that,
    // calling repeatLastChange from inside itself forever. Bypassing it
    // unconditionally means lastChangeKeys can never contain "." at all, so
    // that can't happen.
    if (key === "." && ed.mode === "normal") {
      const p = ensureParse(ed);
      if (!p.operator && !p.awaitingChar) {
        ed._feedDepth = (ed._feedDepth || 0) + 1;
        try { repeatLastChange(engine); } finally { ed._feedDepth--; }
        return;
      }
    }

    // Only a genuinely fresh top-level call (not one nested inside a macro
    // replay or a dot-repeat replay) tracks change keys — otherwise the
    // outer keystroke that triggered a nested replay would overwrite the
    // correctly-recorded inner change once control returns to it.
    if (!isNestedCall) {
      if (ed.mode === "normal" && !ed.parse) { ed._changeKeys = []; ed._cmdStartLines = ed.lines; }
      if (!ed._changeKeys) ed._changeKeys = [];
      ed._changeKeys.push(key);
    }
    ed._feedDepth = (ed._feedDepth || 0) + 1;
    try {
      dispatchByMode(engine, key);
    } finally {
      ed._feedDepth--;
    }
    if (!isNestedCall && ed.mode === "normal" && !ed.parse) {
      if (ed.lines !== ed._cmdStartLines) ed.lastChangeKeys = ed._changeKeys.slice();
      ed._changeKeys = [];
    }
  }

  return {
    createEditorState, feedKey,
    undo, redo, totalCount, resolveMotion, orderRange,
    previewSearchMatches, previewSubstitute, previewGlobal,
    switchToBuffer, createBuffer, deleteBuffer, findBufferByName,
    activeTab, switchToWindow, cycleWindow, splitWindow, closeWindow, onlyWindow,
    switchToTab, newTab, cycleTab, closeTab,
    setMark, jumpToMark, resolveMarkPosition, jumpToUndoNode
  };
})();