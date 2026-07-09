/* ============================== vim-sim/widgets.js ==============================
   Renders the editor pane (reused for the main lesson/sandbox editor and for
   each mini-game's isolated buffer), the games picker, and wires real
   keyboard capture through to VimGrammar.feedKey / VimGames.feedGameKey.
==================================================================================== */
window.VimWidgets = (function () {
  const icon = window.Icons.icon;
  const esc = window.Utils.esc;
  let ENGINE = null;

  function hashSeed(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  /* --------------------------------- grammar breakdown labels (Module 3) --------------------------------- */
  const OPERATOR_LABELS = {
    d: "delete", c: "change", y: "yank (copy)",
    ">": "indent", "<": "unindent",
    "g~": "toggle case", gu: "lowercase", gU: "uppercase"
  };
  const MOTION_LABELS = {
    h: "one character left", l: "one character right", j: "one line down", k: "one line up",
    w: "start of next word", b: "start of previous word", e: "end of word", ge: "end of previous word",
    0: "start of line", "^": "first non-blank character", "$": "end of line",
    gg: "first line of the file", G: "last line of the file",
    H: "top of the screen", M: "middle of the screen", L: "bottom of the screen",
    "%": "matching bracket", "{": "previous paragraph", "}": "next paragraph",
    f: "next occurrence of a character", F: "previous occurrence of a character",
    t: "just before the next occurrence", T: "just before the previous occurrence",
    ";": "repeat the last f/F/t/T", ",": "repeat the last f/F/t/T, reversed",
    LINEWISE_SELF: "the whole current line"
  };
  const TEXTOBJ_LABELS = {
    w: "word", '"': "double-quoted text", "'": "single-quoted text",
    "(": "the parentheses", ")": "the parentheses", "[": "the brackets", "]": "the brackets",
    "{": "the braces", "}": "the braces", p: "paragraph", t: "the surrounding tag"
  };
  const AWAITING_LABELS = {
    register: "a register letter (a\u2013z)",
    find: "the character to find",
    textobject: "a text-object key (w, \", ', (, [, {, p, t)",
    "mark-set": "a letter to name this mark",
    "mark-jump-line": "a mark letter to jump to",
    "mark-jump-exact": "a mark letter to jump to (exact position)",
    "macro-record": "a register letter to record into",
    "macro-replay": "a register letter to replay",
    "g-prefix": "the key after g (g, e, ~, u, or U)"
  };

  function describeCount(p) {
    const c1 = p.count1 ? parseInt(p.count1, 10) : null;
    const c2 = p.count2 ? parseInt(p.count2, 10) : null;
    if (!c1 && !c2) return null;
    if (c1 && c2) return `${c1} \u00d7 ${c2} = ${c1 * c2}`;
    return String(c1 || c2);
  }
  function describeTarget(p) {
    if (p.textObjectKind) {
      const scope = p.textObjectKind === "i" ? "inside" : "around";
      const what = p.textObjectChar ? (TEXTOBJ_LABELS[p.textObjectChar] || p.textObjectChar) : null;
      return what ? `${scope} ${what}` : null;
    }
    if (p.motion) return MOTION_LABELS[p.motion] || p.motion;
    return null;
  }

  /* --------------------------------- shared char-grid renderer --------------------------------- */
  function renderCharGrid(lines, cursor, selRange, targetPos, cursorClass) {
    const B = window.VimBuffer;
    const rows = lines.map((lineText, li) => {
      const chars = lineText.length ? lineText.split("") : [" "];
      const cells = chars.map((ch, ci) => {
        const isCursor = li === cursor.line && ci === cursor.col;
        const isTarget = targetPos && li === targetPos.line && ci === targetPos.col;
        let selected = false;
        if (selRange) {
          if (selRange.linewise) selected = li >= selRange.start.line && li <= selRange.end.line;
          else {
            const idx = B.toIndex(lines, { line: li, col: ci });
            const s = B.toIndex(lines, selRange.start), e = B.toIndex(lines, selRange.end);
            selected = idx >= s && idx <= e;
          }
        }
        const cls = ["ved-char"];
        if (isTarget && !isCursor) cls.push("ved-target");
        if (selected && !isCursor) cls.push("ved-selected");
        if (isCursor) cls.push(cursorClass || "ved-cursor-block");
        return `<span class="${cls.join(" ")}">${esc(ch)}</span>`;
      });
      return `<div class="ved-line">${cells.join("")}</div>`;
    }).join("");
    return `<div class="ved-lines">${rows}</div>`;
  }

  /* --------------------------------- main vim editor --------------------------------- */
  function renderVimEditor() {
    const ed = ENGINE.state.editor;
    let selRange = null;
    if (ed.mode === "visual" || ed.mode === "visual-line" || ed.mode === "visual-block") {
      selRange = window.VimGrammar.orderRange(ed.visualAnchor, ed.cursor, true, ed.mode === "visual-line", ed.lines);
    }
    const grid = renderCharGrid(ed.lines, ed.cursor, selRange, null, ed.mode === "insert" ? "ved-cursor-ibeam" : "ved-cursor-block");
    const regsUsed = Object.entries(ed.registers).filter(([, v]) => v.text).slice(0, 5);
    const marksUsed = Object.keys(ed.marks);
    return `<div class="panel">
      <div class="panel-header"><span class="title mono">${icon("keyboard", 15)} vim editor</span><span class="pill accent ved-mode-${ed.mode}">${ed.mode.toUpperCase()}</span></div>
      <div class="panel-body">
        <div class="ved-wrap" tabindex="0" data-vedinput="main">${grid}</div>
        <div class="ved-status mono">
          Ln ${ed.cursor.line + 1}, Col ${ed.cursor.col + 1}
          ${ed.mode === "command" ? ` &middot; :${esc(ed.commandLine)}` : ""}
          ${ed.macroRecording ? ` &middot; recording @${ed.macroRecording}` : ""}
          ${ed.message ? ` &middot; ${esc(ed.message)}` : ""}
        </div>
        <div class="ved-meta mono">
          ${regsUsed.length ? `registers: ${regsUsed.map(([k, v]) => `"${k}=${esc(v.text.length > 10 ? v.text.slice(0, 10) + "…" : v.text)}`).join("  ")}` : "registers: (empty)"}
          ${marksUsed.length ? ` &middot; marks: ${marksUsed.join(", ")}` : ""}
        </div>
        <div class="ved-hint mono">click the editor, then type — Escape returns to Normal mode</div>
      </div>
    </div>`;
  }

  /* --------------------------------- grammar breakdown widget (Module 3) --------------------------------- */
  function slot(label, value, filled) {
    return `<div class="grammar-slot${filled ? " filled" : ""}">
      <div class="grammar-slot-label mono">${esc(label)}</div>
      <div class="grammar-slot-value mono">${value ? esc(value) : "&mdash;"}</div>
    </div>`;
  }

  function renderGrammarBreakdown() {
    const ed = ENGINE.state.editor;
    const p = ed.parse;
    const editorHtml = renderVimEditor();

    let body;
    if (ed.mode !== "normal") {
      const modeNote = {
        insert: "You're in INSERT mode &mdash; every key just types a character. Grammar composition (counts, operators, motions, text objects) only happens in Normal mode. Press <code>Escape</code> to go back.",
        visual: "You're in VISUAL mode &mdash; you've already selected a range with a motion or text object. The next operator key (d, c, y, &gt;, &lt;, ~, u, U) will act on exactly what's highlighted.",
        "visual-line": "You're in VISUAL LINE mode &mdash; whole lines are selected. The next operator key will act on all of them.",
        "visual-block": "You're in VISUAL BLOCK mode &mdash; a rectangular block is selected.",
        command: "You're in COMMAND-LINE mode &mdash; you're typing a whole <code>:</code> instruction rather than composing a Normal-mode grammar sequence."
      }[ed.mode] || "";
      body = `<div class="grammar-modenote mono">${modeNote}</div>`;
    } else {
      const count = p ? describeCount(p) : null;
      const register = p && p.register ? p.register : null;
      const operator = p && p.operator ? (OPERATOR_LABELS[p.operator] || p.operator) : null;
      const target = p ? describeTarget(p) : null;

      const slots = `<div class="grammar-slots">
        ${slot("count", count, !!count)}
        ${slot("register", register ? `"${register}` : null, !!register)}
        ${slot("operator", operator, !!operator)}
        ${slot("motion / object", target, !!target)}
      </div>`;

      let sentence;
      if (!p) {
        sentence = "Nothing composing yet &mdash; press a key to start building a command.";
      } else if (operator && target) {
        sentence = `This will <b>${esc(operator)}</b> ${esc(target)}${count ? `, count ${esc(count)}` : ""}.`;
      } else if (!operator && target) {
        sentence = `This will move the cursor to ${esc(target)}${count ? ` (count ${esc(count)})` : ""} &mdash; no operator yet, so it's just a move.`;
      } else if (operator && !target) {
        sentence = `Operator <b>${esc(operator)}</b> is waiting for a motion or text object to act on.`;
      } else {
        sentence = "Building a command&hellip;";
      }

      const awaiting = p && p.awaitingChar
        ? `<div class="grammar-awaiting mono">&rarr; waiting for: ${esc(AWAITING_LABELS[p.awaitingChar] || p.awaitingChar)}</div>`
        : "";

      body = `${slots}<div class="grammar-sentence">${sentence}</div>${awaiting}`;
    }

    const legend = `<div class="grammar-legend">
      <div class="grammar-legend-col">
        <div class="grammar-legend-title mono">operators</div>
        <div class="grammar-legend-row mono"><span>d</span><span>delete</span></div>
        <div class="grammar-legend-row mono"><span>c</span><span>change</span></div>
        <div class="grammar-legend-row mono"><span>y</span><span>yank</span></div>
        <div class="grammar-legend-row mono"><span>&gt; / &lt;</span><span>indent / unindent</span></div>
        <div class="grammar-legend-row mono"><span>g~ / gu / gU</span><span>toggle / lower / upper case</span></div>
      </div>
      <div class="grammar-legend-col">
        <div class="grammar-legend-title mono">text objects</div>
        <div class="grammar-legend-row mono"><span>iw / aw</span><span>inside / around word</span></div>
        <div class="grammar-legend-row mono"><span>i&quot; / a&quot;</span><span>inside / around quotes</span></div>
        <div class="grammar-legend-row mono"><span>i( / a(</span><span>inside / around parens</span></div>
        <div class="grammar-legend-row mono"><span>ip / ap</span><span>inside / around paragraph</span></div>
        <div class="grammar-legend-row mono"><span>it / at</span><span>inside / around tag</span></div>
      </div>
    </div>`;

    return `${editorHtml}<div class="panel grammar-panel">
      <div class="panel-header"><span class="title mono">${icon("keyboard", 15)} grammar breakdown</span><span class="pill">count? register? operator? {motion|object}</span></div>
      <div class="panel-body">
        ${body}
        ${legend}
      </div>
    </div>`;
  }

  /* --------------------------------- game widget --------------------------------- */
  function renderGameWidget(gameId) {
    const Games = window.VimGames;
    const def = Games.GAMES[gameId];
    if (!def) return "";
    let g = ENGINE.state.game;
    if (!g || g.id !== gameId) { Games.startGame(ENGINE, gameId, hashSeed(gameId)); g = ENGINE.state.game; }
    const grid = renderCharGrid(g.lines, g.cursor, null, g.target, "ved-cursor-block");
    const best = ENGINE.state.gameBestScores["vim_" + gameId];
    const elapsed = g.finished ? g.resultMs : Date.now() - g.startedAt;
    return `<div class="panel">
      <div class="panel-header"><span class="title mono">${icon("keyboard", 15)} ${esc(def.title)}</span><span class="pill accent mono">${esc(def.keys)}</span></div>
      <div class="panel-body">
        <p class="perm-note" style="margin-top:0">${esc(def.instructions)}</p>
        <div class="ved-wrap game-wrap" tabindex="0" data-vedinput="game">${grid}</div>
        <div class="ved-status mono">
          keystrokes: ${g.keystrokes} &middot; time: ${(elapsed / 1000).toFixed(1)}s
          ${best ? ` &middot; best: ${best.keystrokes} keys / ${(best.timeMs / 1000).toFixed(1)}s` : ""}
        </div>
        ${g.finished ? `<div class="challenge-result mono" style="background:var(--teal-soft);color:var(--teal);margin-top:10px">${icon("check", 12)} Reached it in ${g.keystrokes} keystrokes (${(g.resultMs / 1000).toFixed(1)}s)!</div>` : ""}
        <div class="mark-complete-row" style="justify-content:flex-start;margin-top:12px">
          <button class="btn" data-gamerestart="${gameId}">Restart</button>
        </div>
      </div>
    </div>`;
  }

  function renderGamesMenu() {
    const active = ENGINE.state.sandboxActiveGame;
    if (active) return `<div style="margin-bottom:10px"><button class="btn" data-backtogames>&larr; all games</button></div>${renderGameWidget(active)}`;
    const games = window.VimGames.GAMES;
    return `<div class="panel">
      <div class="panel-header"><span class="title mono">${icon("keyboard", 15)} motion practice games</span></div>
      <div class="panel-body"><div class="challenge-grid">
        ${Object.keys(games).map((id) => {
          const def = games[id];
          const best = ENGINE.state.gameBestScores["vim_" + id];
          return `<div class="panel challenge-card">
            <div class="challenge-title">${icon("trophy", 14)} ${esc(def.title)}</div>
            <div class="challenge-hint">${esc(def.instructions)}</div>
            <div class="challenge-hint mono">keys: ${esc(def.keys)}</div>
            ${best ? `<div class="challenge-result mono" style="background:var(--teal-soft);color:var(--teal)">best: ${best.keystrokes} keys / ${(best.timeMs / 1000).toFixed(1)}s</div>` : ""}
            <button class="btn accent" data-playgame="${id}">Play</button>
          </div>`;
        }).join("")}
      </div></div>
    </div>`;
  }

  /* --------------------------------- widget dispatcher --------------------------------- */
  function renderLessonWidget(key) {
    if (key === "editor") return renderVimEditor();
    if (key === "grammar") return renderGrammarBreakdown();
    if (key === "games-menu") return renderGamesMenu();
    if (key.indexOf("game-") === 0) return renderGameWidget(key.slice(5));
    return "";
  }
  function renderSandboxWidget(key) { return renderLessonWidget(key); }

  /* --------------------------------- action wiring --------------------------------- */
  function translateKey(e) {
    if (e.ctrlKey && e.key.length === 1) return "ctrl-" + e.key.toLowerCase();
    if (["Escape", "Enter", "Backspace", "Tab"].indexOf(e.key) !== -1) return e.key;
    if (e.key.length === 1) return e.key;
    return null;
  }

  function registerActions(engine) {
    ENGINE = engine;
    const Actions = window.Actions;

    Actions.register("keydown", "[data-vedinput]", (el, e) => {
      const token = translateKey(e);
      if (token === null) return;
      e.preventDefault();
      const target = el.getAttribute("data-vedinput");
      if (target === "main") window.VimGrammar.feedKey(ENGINE, token);
      else if (target === "game") window.VimGames.feedGameKey(ENGINE, token);
      // Every render() rebuilds #app.innerHTML from scratch, which destroys and
      // recreates this element — without this, focus is silently dropped after
      // every single keystroke. Opt-in via _focusSelector, per the established
      // core/curriculum.js pattern (see fs-sim's terminal / git-sim's console).
      ENGINE.state._focusSelector = `[data-vedinput="${target}"]`;
      ENGINE.render();
    });
    Actions.register("click", "[data-vedinput]", (el) => { el.focus(); });

    Actions.register("click", "[data-gamerestart]", (el) => {
      window.VimGames.startGame(ENGINE, el.getAttribute("data-gamerestart"), Date.now() % 100000);
      ENGINE.state._focusSelector = '[data-vedinput="game"]';
      ENGINE.render();
    });
    Actions.register("click", "[data-playgame]", (el) => {
      const id = el.getAttribute("data-playgame");
      ENGINE.state.sandboxActiveGame = id;
      window.VimGames.startGame(ENGINE, id, Date.now() % 100000);
      ENGINE.state._focusSelector = '[data-vedinput="game"]';
      ENGINE.render();
    });
    Actions.register("click", "[data-backtogames]", () => { ENGINE.state.sandboxActiveGame = null; ENGINE.render(); });
  }

  return { registerActions, renderLessonWidget, renderSandboxWidget };
})();