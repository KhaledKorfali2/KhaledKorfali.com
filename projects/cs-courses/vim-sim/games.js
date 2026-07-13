/* ============================== vim-sim/games.js ==============================
   A small, generic scaffold for motion-practice mini-games. Each game gets
   its own isolated mini-editor (separate from the main lesson editor) and a
   restricted key vocabulary, computed directly against the already-tested
   vim-sim/buffer.js primitives rather than routing through the full grammar
   parser — the point of a game is to force practice of ONE specific motion
   family, so re-deriving grammar restrictions would just add risk for no
   benefit here.
================================================================================== */
window.VimGames = (function () {
  const B = window.VimBuffer;

  function seededInt(seed, mod) {
    let s = (seed * 2654435761) % 2147483647;
    if (s < 0) s += 2147483647;
    return s % mod;
  }

  const GAMES = {
    cursorRacer: {
      title: "Cursor Racer",
      keys: "h j k l",
      instructions: "Reach the marked square using only h, j, k, l.",
      build(seed) {
        const size = 6;
        const lines = Array.from({ length: size }, () => ".".repeat(size));
        const tl = seededInt(seed + 1, size);
        const tc = seededInt(seed + 7, size);
        const target = { line: tl, col: tc };
        const cursor = { line: (tl + 3) % size, col: (tc + 3) % size };
        return { lines, cursor, target };
      }
    },
    wordJumper: {
      title: "Word Jumper",
      keys: "w b e ge",
      instructions: "Reach the target word using w, b, e, or ge.",
      build(seed) {
        const words = ["the", "quick", "brown", "fox", "jumps", "over", "lazy", "dog", "again", "today"];
        const line = words.join(" ");
        const targetIdx = 2 + seededInt(seed, words.length - 3);
        const targetCol = words.slice(0, targetIdx).join(" ").length + 1;
        return { lines: [line], cursor: { line: 0, col: 0 }, target: { line: 0, col: targetCol } };
      }
    },
    characterSniper: {
      title: "Character Sniper",
      keys: "f F t T ; ,",
      instructions: "Reach the target column using f, F, t, T, ;, and ,.",
      build(seed) {
        const alphabet = "abcdefghijklmnopqrstuvwxyz";
        const len = 16;
        let line = "";
        for (let i = 0; i < len; i++) line += alphabet[seededInt(seed + i * 13, alphabet.length)];
        const targetCol = 4 + seededInt(seed + 99, len - 5);
        return { lines: [line], cursor: { line: 0, col: 0 }, target: { line: 0, col: targetCol } };
      }
    },
    scrollSprint: {
      title: "Scroll Sprint",
      keys: "gg G H M L (with a count)",
      instructions: "Reach the target line using gg, G, H, M, L — try a count before G.",
      build(seed) {
        const total = 40;
        const lines = Array.from({ length: total }, (_, i) => `line ${i + 1}`);
        const targetLine = 3 + seededInt(seed, total - 6);
        return { lines, cursor: { line: 0, col: 0 }, target: { line: targetLine, col: 0 } };
      }
    },
    bracketHunter: {
      title: "Bracket Hunter",
      keys: "%",
      instructions: "Jump to the matching bracket using %.",
      build(seed) {
        const templates = [
          ["if (x) {", "  while (y) {", "    hello();", "  }", "}"],
          ["function f(a, b) {", "  return (a + b);", "}"],
          ["const arr = [1, 2, [3, 4], 5];"]
        ];
        const t = templates[seededInt(seed, templates.length)];
        return { lines: t.slice(), cursor: { line: 0, col: 0 }, target: null }; // success = landing on ANY matching bracket, checked dynamically
      }
    }
  };

  function startGame(engine, gameId, seed) {
    const def = GAMES[gameId];
    if (!def) return;
    const built = def.build(seed !== undefined ? seed : Date.now() % 100000);
    engine.state.game = {
      id: gameId, lines: built.lines, cursor: built.cursor, target: built.target,
      keystrokes: 0, startedAt: Date.now(), finished: false, resultMs: null,
      awaitingChar: null, pendingG: false, lastFind: null, countBuf: ""
    };
  }

  function checkSuccess(engine) {
    const g = engine.state.game;
    if (!g || g.finished) return;
    let success = false;
    if (g.id === "bracketHunter") {
      success = g._jumped === true;
    } else if (g.target) {
      success = g.cursor.line === g.target.line && g.cursor.col === g.target.col;
    }
    if (success) {
      g.finished = true;
      g.resultMs = Date.now() - g.startedAt;
      const key = "vim_" + g.id;
      const best = engine.state.gameBestScores[key];
      if (!best || g.keystrokes < best.keystrokes || (g.keystrokes === best.keystrokes && g.resultMs < best.timeMs)) {
        engine.state.gameBestScores[key] = { keystrokes: g.keystrokes, timeMs: g.resultMs };
      }
    }
  }

  function feedGameKey(engine, key) {
    const g = engine.state.game;
    if (!g || g.finished) return;
    const before = g.keystrokes;
    g.keystrokes++;

    if (g.id === "cursorRacer") {
      if (key === "h") g.cursor = { line: g.cursor.line, col: Math.max(0, g.cursor.col - 1) };
      else if (key === "l") g.cursor = { line: g.cursor.line, col: Math.min(g.lines[0].length - 1, g.cursor.col + 1) };
      else if (key === "j") g.cursor = { line: Math.min(g.lines.length - 1, g.cursor.line + 1), col: g.cursor.col };
      else if (key === "k") g.cursor = { line: Math.max(0, g.cursor.line - 1), col: g.cursor.col };
      else { g.keystrokes = before; return; }
    } else if (g.id === "wordJumper") {
      if (g.pendingG) {
        g.pendingG = false;
        if (key === "e") g.cursor = B.wordEndBackward(g.lines, g.cursor);
        else { g.keystrokes = before; return; }
      } else if (key === "g") { g.pendingG = true; return; }
      else if (key === "w") g.cursor = B.wordForward(g.lines, g.cursor);
      else if (key === "b") g.cursor = B.wordBackward(g.lines, g.cursor);
      else if (key === "e") g.cursor = B.wordEnd(g.lines, g.cursor);
      else { g.keystrokes = before; return; }
    } else if (g.id === "characterSniper") {
      if (g.awaitingChar) {
        const kind = g.awaitingChar; g.awaitingChar = null;
        let t = null;
        if (kind === "f") t = B.findCharForward(g.lines, g.cursor, key, false);
        else if (kind === "F") t = B.findCharBackward(g.lines, g.cursor, key, false);
        else if (kind === "t") t = B.findCharForward(g.lines, g.cursor, key, true);
        else if (kind === "T") t = B.findCharBackward(g.lines, g.cursor, key, true);
        if (t) { g.cursor = t; g.lastFind = { type: kind, char: key }; } else { g.keystrokes = before; return; }
      } else if ("fFtT".includes(key)) { g.awaitingChar = key; return; }
      else if (key === ";" && g.lastFind) {
        const lf = g.lastFind;
        const t = (lf.type === "f" || lf.type === "t") ? B.findCharForward(g.lines, g.cursor, lf.char, lf.type === "t") : B.findCharBackward(g.lines, g.cursor, lf.char, lf.type === "T");
        if (t) g.cursor = t; else { g.keystrokes = before; return; }
      } else if (key === "," && g.lastFind) {
        const inv = { f: "F", F: "f", t: "T", T: "t" }[g.lastFind.type];
        const t = (inv === "f" || inv === "t") ? B.findCharForward(g.lines, g.cursor, g.lastFind.char, inv === "t") : B.findCharBackward(g.lines, g.cursor, g.lastFind.char, inv === "T");
        if (t) g.cursor = t; else { g.keystrokes = before; return; }
      } else { g.keystrokes = before; return; }
    } else if (g.id === "scrollSprint") {
      if (/[0-9]/.test(key)) { g.countBuf += key; return; }
      const count = g.countBuf ? parseInt(g.countBuf, 10) : null;
      g.countBuf = "";
      if (g.pendingG) {
        g.pendingG = false;
        if (key === "g") g.cursor = { line: count ? Math.min(g.lines.length - 1, count - 1) : 0, col: 0 };
        else { g.keystrokes = before; return; }
      } else if (key === "g") { g.pendingG = true; return; }
      else if (key === "G") g.cursor = { line: count ? Math.min(g.lines.length - 1, count - 1) : g.lines.length - 1, col: 0 };
      else if (key === "H") g.cursor = { line: 0, col: 0 };
      else if (key === "M") g.cursor = { line: Math.floor((g.lines.length - 1) / 2), col: 0 };
      else if (key === "L") g.cursor = { line: g.lines.length - 1, col: 0 };
      else { g.keystrokes = before; return; }
    } else if (g.id === "bracketHunter") {
      if (key === "%") {
        const t = B.matchPercent(g.lines, g.cursor);
        if (t) { g.cursor = t; g._jumped = true; } else { g.keystrokes = before; return; }
      } else { g.keystrokes = before; return; }
    }
    checkSuccess(engine);
  }

  return { GAMES, startGame, feedGameKey };
})();

/* ============================== vim-sim/games.js (VimGolf) ==============================
   Vim Golf & Boss Battles — deliberately different from the motion-practice games above:
   those intentionally restrict input to a tiny key vocabulary handled by hand. Golf
   puzzles need the OPPOSITE — full operators, text objects, registers, macros, and
   command-line commands, exactly like real Vim golf. So each puzzle gets its own genuine,
   isolated VimGrammar.createEditorState() instance, and every keystroke is fed through
   the real window.VimGrammar.feedKey — nothing here re-derives editing behavior.
============================================================================================ */
window.VimGolf = (function () {
  const GOLF_PUZZLES = [
    { id: "golf1", title: "Delete a word", tier: "golf",
      startLines: ["quick brown fox"], targetLines: ["brown fox"], par: 3,
      hint: "One operator, one motion." },
    { id: "golf2", title: "Change a word", tier: "golf",
      startLines: ["The cat sat"], targetLines: ["The dog sat"], par: 9,
      hint: "Move to the word, then change what's inside it." },
    { id: "golf3", title: "Empty the quotes", tier: "golf",
      startLines: ['say "hello world" now'], targetLines: ['say "" now'], par: 4,
      hint: "A text object gets you there without even moving the cursor first." },
    { id: "golf4", title: "Duplicate a line", tier: "golf",
      startLines: ["keep me"], targetLines: ["keep me", "keep me"], par: 4,
      hint: "Yank the whole line, then put it back." },
    { id: "golf5", title: "Replace every occurrence", tier: "golf",
      startLines: ["foo foo foo"], targetLines: ["bar bar bar"], par: 14,
      hint: "One command-line command handles all three at once." },
    { id: "golf6", title: "Fix a whole list", tier: "golf",
      startLines: ["- item one", "- item two", "- item three"], targetLines: ["* item one", "* item two", "* item three"], par: 15,
      hint: "Record the fix once, then replay it on the rest." }
  ];

  const BOSS_BATTLES = [
    { id: "bossA", title: "Word Swap", tier: "boss",
      startLines: ["one two three"], targetLines: ["three two one"], par: 28,
      hint: "You'll need two separate named registers to juggle both words at once." },
    { id: "bossB", title: "Strip the Indentation", tier: "boss",
      startLines: ["  let x = 1;", "  let y = 2;", "  let z = 3;"], targetLines: ["let x = 1;", "let y = 2;", "let z = 3;"], par: 12,
      hint: "A search pattern anchored to the start of the line, applied to the whole buffer." },
    { id: "bossC", title: "Quote and Comma", tier: "boss",
      startLines: ["apple", "banana", "cherry"], targetLines: ['"apple",', '"banana",', '"cherry",'], par: 18,
      hint: "Insert at the start, append at the end, then repeat it." }
  ];

  function findPuzzle(id) { return GOLF_PUZZLES.find((p) => p.id === id) || BOSS_BATTLES.find((p) => p.id === id); }

  function computeGrade(keystrokes, par) {
    const ratio = keystrokes / par;
    if (ratio <= 0.8) return "SSS";
    if (ratio <= 1.0) return "S";
    if (ratio <= 1.3) return "A";
    if (ratio <= 1.6) return "B";
    if (ratio <= 2.0) return "C";
    if (ratio <= 2.5) return "D";
    return "E";
  }

  function startGolfGame(engine, puzzleId) {
    const def = findPuzzle(puzzleId);
    if (!def) return;
    engine.state.golfGame = {
      id: puzzleId,
      editor: window.VimGrammar.createEditorState(def.startLines),
      keystrokes: 0, keyLog: [],
      startedAt: Date.now(), finished: false, resultMs: null, grade: null
    };
  }

  function feedGolfKey(engine, key) {
    const g = engine.state.golfGame;
    if (!g || g.finished) return;
    const def = findPuzzle(g.id);
    if (!def) return;
    window.VimGrammar.feedKey({ state: { editor: g.editor } }, key);
    g.keystrokes++;
    g.keyLog.push(key);
    if (JSON.stringify(g.editor.lines) === JSON.stringify(def.targetLines)) {
      g.finished = true;
      g.resultMs = Date.now() - g.startedAt;
      g.grade = computeGrade(g.keystrokes, def.par);
      const scoreKey = "vim_" + g.id;
      const best = engine.state.golfBestScores[scoreKey];
      if (!best || g.keystrokes < best.keystrokes) {
        engine.state.golfBestScores[scoreKey] = { keystrokes: g.keystrokes, grade: g.grade, timeMs: g.resultMs };
      }
    }
  }

  return { GOLF_PUZZLES, BOSS_BATTLES, findPuzzle, computeGrade, startGolfGame, feedGolfKey };
})();