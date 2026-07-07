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
      marks: {},
      commandLine: "",
      lastFind: null,
      message: "",
      undo: {
        nodes: { 0: { id: 0, parentId: null, lines: lines.slice(), cursor: { line: 0, col: 0 }, childIds: [], lastChild: null, label: "initial" } },
        currentId: 0, nextId: 1
      },
      macroRecording: null, macroKeys: [], macros: {}, lastMacroReg: null,
      insertSnapshot: null
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

  /* =============================== registers =============================== */
  function setRegister(engine, name, text, linewise) {
    const ed = engine.state.editor;
    if (name === "_") return; // black hole register: discard
    ed.registers[name || "unnamed"] = { text, linewise };
  }
  function setRegisterAfterDelete(engine, text, linewise, explicitName) {
    const ed = engine.state.editor;
    if (explicitName) { setRegister(engine, explicitName, text, linewise); return; }
    for (let n = 9; n >= 2; n--) { if (ed.registers[String(n - 1)]) ed.registers[String(n)] = ed.registers[String(n - 1)]; }
    ed.registers["1"] = { text, linewise };
    ed.registers.unnamed = { text, linewise };
  }

  /* =============================== marks =============================== */
  function setMark(engine, letter) { engine.state.editor.marks[letter] = { ...engine.state.editor.cursor }; }
  function jumpToMark(engine, letter, exact) {
    const ed = engine.state.editor;
    const m = ed.marks[letter];
    if (!m) { ed.message = `mark '${letter}' not set`; return; }
    ed.cursor = exact ? B.clampPos(ed.lines, m) : { line: m.line, col: B.firstNonBlankCol(ed.lines[m.line] || "") };
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
      else if (ch === "t") { const t = B.textObjectTag(ed.lines, cur); r = t ? (around ? t.around : t.inner) : null; }
      if (!r) return null;
      return { range: r, newCursor: r.start };
    }

    const m = p.motion;
    if (m === "LINEWISE_SELF") {
      const endLine = Math.min(ed.lines.length - 1, cur.line + count - 1);
      return { range: { start: { line: cur.line, col: 0 }, end: { line: endLine, col: B.lastCol(ed.lines, endLine) }, linewise: true }, newCursor: { line: cur.line, col: 0 } };
    }

    let target = null, inclusive = false, linewise = false;
    if (m === "h") target = { line: cur.line, col: Math.max(0, cur.col - count) };
    else if (m === "l") target = { line: cur.line, col: Math.min(B.lastCol(ed.lines, cur.line), cur.col + count) };
    else if (m === "j") { linewise = true; target = { line: Math.min(ed.lines.length - 1, cur.line + count), col: cur.col }; }
    else if (m === "k") { linewise = true; target = { line: Math.max(0, cur.line - count), col: cur.col }; }
    else if (m === "0") target = { line: cur.line, col: 0 };
    else if (m === "^") target = { line: cur.line, col: B.firstNonBlankCol(ed.lines[cur.line]) };
    else if (m === "$") { inclusive = true; const l = Math.min(ed.lines.length - 1, cur.line + count - 1); target = { line: l, col: B.lastCol(ed.lines, l) }; }
    else if (m === "w") { let t = cur; for (let i = 0; i < count; i++) t = B.wordForward(ed.lines, t); target = t; }
    else if (m === "b") { let t = cur; for (let i = 0; i < count; i++) t = B.wordBackward(ed.lines, t); target = t; }
    else if (m === "e") { inclusive = true; let t = cur; for (let i = 0; i < count; i++) t = B.wordEnd(ed.lines, t); target = t; }
    else if (m === "ge") { inclusive = true; let t = cur; for (let i = 0; i < count; i++) t = B.wordEndBackward(ed.lines, t); target = t; }
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
      const newLines = B.deleteRange(ed.lines, range);
      commitEdit(engine, newLines, range.start, op === "c" ? "change" : "delete");
      if (op === "c") enterInsertAt(engine, ed.cursor);
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
    else if (kind === "o") { const nl = ed.lines.slice(); nl.splice(ed.cursor.line + 1, 0, ""); ed.lines = nl; ed.cursor = { line: ed.cursor.line + 1, col: 0 }; }
    else if (kind === "O") { const nl = ed.lines.slice(); nl.splice(ed.cursor.line, 0, ""); ed.lines = nl; ed.cursor = { line: ed.cursor.line, col: 0 }; }
    ed.mode = "insert";
    resetParse(ed);
  }
  function enterInsertAt(engine, pos) {
    const ed = engine.state.editor;
    ed.insertSnapshot = ed.lines.slice();
    ed.cursor = pos;
    ed.mode = "insert";
  }
  function feedInsertKey(engine, key) {
    const ed = engine.state.editor;
    if (ed.macroRecording) ed.macroKeys.push(key);
    if (key === "Escape") {
      ed.mode = "normal";
      ed.cursor = { line: ed.cursor.line, col: Math.max(0, ed.cursor.col - 1) };
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
        ed.lines = nl; ed.cursor = { line: ed.cursor.line - 1, col: prevLen };
      }
      return;
    }
    if (key === "Enter") { const r = B.insertTextAt(ed.lines, ed.cursor, "\n"); ed.lines = r.lines; ed.cursor = r.end; return; }
    const r = B.insertTextAt(ed.lines, ed.cursor, key);
    ed.lines = r.lines; ed.cursor = r.end;
  }

  /* =============================== visual mode =============================== */
  function enterVisual(engine, kind) {
    const ed = engine.state.editor;
    ed.mode = kind;
    ed.visualAnchor = { ...ed.cursor };
    resetParse(ed);
  }
  function applyVisualMotion(engine, p) {
    const ed = engine.state.editor;
    const resolved = resolveMotion(engine, p);
    if (resolved) ed.cursor = B.clampPos(ed.lines, resolved.newCursor || ed.cursor);
    resetParse(ed);
  }
  function applyVisualTextObject(engine, p) {
    const ed = engine.state.editor;
    const resolved = resolveMotion(engine, p);
    if (resolved) { ed.visualAnchor = { ...resolved.range.start }; ed.cursor = { ...resolved.range.end }; }
    resetParse(ed);
  }
  function applyVisualOperator(engine, op) {
    const ed = engine.state.editor;
    const linewise = ed.mode === "visual-line";
    const range = orderRange(ed.visualAnchor, ed.cursor, true, linewise, ed.lines);
    ed.mode = "normal";
    ed.visualAnchor = null;
    resetParse(ed);
    applyOperator(engine, op, range, null);
  }
  function feedVisualKey(engine, key) {
    const ed = engine.state.editor;
    if (ed.macroRecording) ed.macroKeys.push(key);
    if (key === "Escape") { ed.mode = "normal"; ed.visualAnchor = null; resetParse(ed); return; }
    const p = ensureParse(ed);
    if (p.awaitingChar === "textobject") { p.textObjectChar = key; return applyVisualTextObject(engine, p); }
    if (p.awaitingChar === "find") { p.findChar = key; return applyVisualMotion(engine, p); }
    if (!p.textObjectKind && (key === "i" || key === "a")) { p.textObjectKind = key; p.awaitingChar = "textobject"; return; }
    if ("fFtT".includes(key)) { p.motion = key; p.awaitingChar = "find"; return; }
    if (key === "g") { p.awaitingChar = "g-motion"; return; }
    if (p.awaitingChar === "g-motion") { p.motion = key === "g" ? "gg" : key === "e" ? "ge" : null; if (!p.motion) { resetParse(ed); return; } return applyVisualMotion(engine, p); }
    if ("hjklwbe0^$%HML{}".includes(key) || key === "G") { p.motion = key; return applyVisualMotion(engine, p); }
    if (key === "d" || key === "x") return applyVisualOperator(engine, "d");
    if (key === "c") return applyVisualOperator(engine, "c");
    if (key === "y") return applyVisualOperator(engine, "y");
    if (key === ">" || key === "<") return applyVisualOperator(engine, key);
    if (key === "~") return applyVisualOperator(engine, "g~");
    if (key === "u") return applyVisualOperator(engine, "gu");
    if (key === "U") return applyVisualOperator(engine, "gU");
    resetParse(ed);
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
    if (cmd === "w") { ed.message = '"buffer" written'; return; }
    if (cmd === "q") { ed.message = "cannot close the only sandbox buffer"; return; }
    if (cmd === "wq") { ed.message = '"buffer" written'; return; }
    ed.message = `E492: Not an editor command: ${cmd}`;
  }
  function feedCommandKey(engine, key) {
    const ed = engine.state.editor;
    if (key === "Escape") { ed.mode = "normal"; ed.commandLine = ""; return; }
    if (key === "Enter") return executeCommandLine(engine);
    if (key === "Backspace") { ed.commandLine = ed.commandLine.slice(0, -1); return; }
    ed.commandLine += key;
  }

  /* =============================== simple normal-mode commands =============================== */
  function doPaste(engine, p, after) {
    const ed = engine.state.editor;
    const reg = ed.registers[p.register || "unnamed"];
    resetParse(ed);
    if (!reg || !reg.text) { ed.message = "nothing to paste"; return; }
    if (reg.linewise) {
      const linesToInsert = reg.text.split("\n");
      const insertAt = after ? ed.cursor.line + 1 : ed.cursor.line;
      const nl = ed.lines.slice();
      nl.splice(insertAt, 0, ...linesToInsert);
      commitEdit(engine, nl, { line: insertAt, col: B.firstNonBlankCol(linesToInsert[0]) }, "paste");
    } else {
      const insertCol = after ? Math.min(ed.lines[ed.cursor.line].length, ed.cursor.col + 1) : ed.cursor.col;
      const r = B.insertTextAt(ed.lines, { line: ed.cursor.line, col: insertCol }, reg.text);
      commitEdit(engine, r.lines, { line: r.end.line, col: Math.max(0, r.end.col - 1) }, "paste");
    }
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
  }

  /* =============================== macros =============================== */
  function startMacroRecording(engine, reg) { const ed = engine.state.editor; ed.macroRecording = reg; ed.macroKeys = []; }
  function stopMacroRecording(engine) { const ed = engine.state.editor; if (ed.macroRecording) { ed.macros[ed.macroRecording] = ed.macroKeys.slice(); ed.macroRecording = null; } }
  function replayMacro(engine, reg) {
    const ed = engine.state.editor;
    const target = reg === "@" ? ed.lastMacroReg : reg;
    const keys = target ? ed.macros[target] : null;
    if (!keys) { ed.message = "macro not set"; return; }
    ed.lastMacroReg = target;
    keys.forEach((k) => feedKey(engine, k));
  }

  /* =============================== normal mode dispatch =============================== */
  function feedNormalKey(engine, key) {
    const ed = engine.state.editor;
    const p = ensureParse(ed);

    const isStopRecording = key === "q" && ed.macroRecording && !p.operator && !p.awaitingChar && p.count1 === "";
    if (ed.macroRecording && !isStopRecording) ed.macroKeys.push(key);
    ed.message = "";

    if (p.awaitingChar) {
      const kind = p.awaitingChar; p.awaitingChar = null;
      if (kind === "register") { p.register = key; ed.pending = "pending"; return; }
      if (kind === "find") { p.findChar = key; return executeParsed(engine, p); }
      if (kind === "textobject") { p.textObjectChar = key; return executeParsed(engine, p); }
      if (kind === "mark-set") { setMark(engine, key); resetParse(ed); return; }
      if (kind === "mark-jump-line") { jumpToMark(engine, key, false); resetParse(ed); return; }
      if (kind === "mark-jump-exact") { jumpToMark(engine, key, true); resetParse(ed); return; }
      if (kind === "macro-record") { startMacroRecording(engine, key); resetParse(ed); return; }
      if (kind === "macro-replay") { replayMacro(engine, key); resetParse(ed); return; }
      if (kind === "g-prefix") {
        if (key === "g") { p.motion = "gg"; return executeParsed(engine, p); }
        if (key === "e") { p.motion = "ge"; return executeParsed(engine, p); }
        if ((key === "~" || key === "u" || key === "U") && !p.operator) { p.operator = "g" + key; ed.pending = "pending"; return; }
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
    if (key === "m" && !p.operator) { p.awaitingChar = "mark-set"; return; }
    if (key === "'" && !p.operator) { p.awaitingChar = "mark-jump-line"; return; }
    if (key === "`" && !p.operator) { p.awaitingChar = "mark-jump-exact"; return; }
    if (key === "q" && !p.operator) {
      if (ed.macroRecording) { stopMacroRecording(engine); resetParse(ed); return; }
      p.awaitingChar = "macro-record"; return;
    }
    if (key === "@" && !p.operator) { p.awaitingChar = "macro-replay"; return; }

    if (!p.operator && "dcy".includes(key)) { p.operator = key; ed.pending = "pending"; return; }
    if (!p.operator && (key === ">" || key === "<" || key === "=")) { p.operator = key; ed.pending = "pending"; return; }
    if (p.operator && key === p.operator) { p.motion = "LINEWISE_SELF"; return executeParsed(engine, p); }
    if (p.operator && (key === "i" || key === "a")) { p.textObjectKind = key; p.awaitingChar = "textobject"; ed.pending = "pending"; return; }
    if ("fFtT".includes(key)) { p.motion = key; p.awaitingChar = "find"; ed.pending = "pending"; return; }

    if ("hjklwbe0^$%;,{}".includes(key) || key === "G" || key === "H" || key === "M" || key === "L") { p.motion = key; return executeParsed(engine, p); }

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
    }
    resetParse(ed);
  }

  function executeParsed(engine, p) {
    const ed = engine.state.editor;
    const resolved = resolveMotion(engine, p);
    if (!resolved) { resetParse(ed); ed.message = "no match"; return; }
    if (!p.operator) { ed.cursor = B.clampPos(ed.lines, resolved.newCursor || resolved.range.start); resetParse(ed); return; }
    applyOperator(engine, p.operator, resolved.range, p.register);
    resetParse(ed);
  }

  /* =============================== top-level entry point =============================== */
  function feedKey(engine, key) {
    const ed = engine.state.editor;
    if (ed.mode === "normal") return feedNormalKey(engine, key);
    if (ed.mode === "insert") return feedInsertKey(engine, key);
    if (ed.mode === "visual" || ed.mode === "visual-line" || ed.mode === "visual-block") return feedVisualKey(engine, key);
    if (ed.mode === "command") return feedCommandKey(engine, key);
  }

  return {
    createEditorState, feedKey,
    undo, redo, totalCount, resolveMotion, orderRange
  };
})();