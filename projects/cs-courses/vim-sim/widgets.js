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
  function renderCharGrid(lines, cursor, selRange, targetPos, cursorClass, selClass) {
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
        if (selected && !isCursor) cls.push(selClass || "ved-selected");
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
          ${ed.mode === "search" ? ` &middot; ${ed.searchDirection === "forward" ? "/" : "?"}${esc(ed.searchLine)}` : ""}
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

    const lastChange = ed.lastChangeKeys && ed.lastChangeKeys.length
      ? `<div class="grammar-lastchange mono"><span class="dim">last change (repeat with</span> <code>.</code><span class="dim">):</span> <code>${ed.lastChangeKeys.map((k) => (k === "Escape" ? "&lt;Esc&gt;" : k === "Enter" ? "&lt;CR&gt;" : k === "Backspace" ? "&lt;BS&gt;" : esc(k))).join("")}</code></div>`
      : `<div class="grammar-lastchange mono dim">last change: none yet &mdash; make an edit, then press <code>.</code> to repeat it</div>`;

    return `${editorHtml}<div class="panel grammar-panel">
      <div class="panel-header"><span class="title mono">${icon("keyboard", 15)} grammar breakdown</span><span class="pill">count? register? operator? {motion|object}</span></div>
      <div class="panel-body">
        ${body}
        ${lastChange}
        ${legend}
      </div>
    </div>`;
  }

  /* --------------------------------- text-object demo buffers (Module 4) --------------------------------- */
  const TEXTOBJECT_DEMOS = {
    quotesParens: {
      label: "Quotes & Parens",
      lines: [
        'const greeting = "Hello, world!";',
        'function wrap(value) {',
        '  return (value + 1);',
        '}'
      ],
      cursor: { line: 0, col: 21 } // inside "Hello, world!"
    },
    paragraphs: {
      label: "Paragraphs",
      lines: [
        'This is the first paragraph.',
        'It spans two lines.',
        '',
        'Here is a second paragraph,',
        'also spanning two lines.',
        '',
        'A short third one.'
      ],
      cursor: { line: 0, col: 5 }
    },
    htmlTag: {
      label: "HTML Tag",
      lines: [
        '<div class="card">',
        '  <p>Hello <b>world</b>!</p>',
        '</div>'
      ],
      cursor: { line: 1, col: 12 } // inside <b>world</b>
    }
  };

  function loadTextObjectDemo(engine, demoKey) {
    const demo = TEXTOBJECT_DEMOS[demoKey];
    if (!demo) return;
    const ed = window.VimGrammar.createEditorState(demo.lines);
    ed.cursor = { ...demo.cursor };
    engine.state.editor = ed;
  }

  /* --------------------------------- text-object explorer widget (Module 4) --------------------------------- */
  const TOBJ_KINDS = [
    { key: "w", label: "word" },
    { key: '"', label: "quote \u201c \u201d" },
    { key: "'", label: "quote ' '" },
    { key: "(", label: "( )" },
    { key: "[", label: "[ ]" },
    { key: "{", label: "{ }" },
    { key: "p", label: "paragraph" },
    { key: "t", label: "tag" }
  ];

  function renderTextObjectExplorer() {
    const ed = ENGINE.state.editor;
    const preview = ENGINE.state.textObjectPreview || { kind: "w", around: false };

    // Reuses the real, exported VimGrammar.resolveMotion — the exact same
    // resolution function d/c/y use internally — as a pure read-only lookup.
    // Nothing here re-derives text-object boundary logic.
    const p = { textObjectKind: preview.around ? "a" : "i", textObjectChar: preview.kind };
    const resolved = window.VimGrammar.resolveMotion(ENGINE, p);
    const range = resolved ? resolved.range : null;

    const cursorClass = ed.mode === "insert" ? "ved-cursor-ibeam" : "ved-cursor-block";
    const grid = renderCharGrid(ed.lines, ed.cursor, range, null, cursorClass, "ved-tobj-preview");

    let desc;
    if (range) {
      const B = window.VimBuffer;
      const text = B.rangeText(ed.lines, range);
      const shown = text.length > 28 ? text.slice(0, 28) + "\u2026" : text;
      const scopeLabel = preview.around ? "around" : "inside";
      const kindLabel = (TOBJ_KINDS.find((k) => k.key === preview.kind) || {}).label || preview.kind;
      desc = `<div class="tobj-desc mono">${scopeLabel} ${esc(kindLabel)} &rarr; <span class="tobj-desc-text">"${esc(shown)}"</span></div>`;
    } else {
      desc = `<div class="tobj-desc mono tobj-desc-empty">no match at the cursor for this text object &mdash; move the cursor onto or inside a matching structure</div>`;
    }

    const scopeRow = `<div class="tobj-row">
      <button class="tobj-btn ${!preview.around ? "active" : ""}" data-tobjscope="i">inside (i)</button>
      <button class="tobj-btn ${preview.around ? "active" : ""}" data-tobjscope="a">around (a)</button>
    </div>`;
    const kindRow = `<div class="tobj-row">
      ${TOBJ_KINDS.map((k) => `<button class="tobj-btn mono ${preview.kind === k.key ? "active" : ""}" data-tobjkind="${esc(k.key)}">${esc(k.label)}</button>`).join("")}
    </div>`;
    const demoRow = `<div class="tobj-row tobj-demo-row">
      <span class="tobj-demo-label mono">load a demo buffer:</span>
      ${Object.keys(TEXTOBJECT_DEMOS).map((id) => `<button class="tobj-btn" data-tobjdemo="${id}">${esc(TEXTOBJECT_DEMOS[id].label)}</button>`).join("")}
    </div>`;

    return `${renderVimEditor()}<div class="panel tobj-panel">
      <div class="panel-header"><span class="title mono">${icon("keyboard", 15)} text-object explorer</span><span class="pill">${preview.around ? "a" : "i"}${esc(preview.kind)}</span></div>
      <div class="panel-body">
        <div class="ved-wrap tobj-preview-wrap">${grid}</div>
        ${scopeRow}
        ${kindRow}
        ${desc}
        ${demoRow}
        <div class="ved-hint mono" style="margin-top:12px">move the cursor in the editor above with real motions (h j k l w b e 0 $ gg G) &mdash; the highlighted region here updates live as you move, before you ever press an operator</div>
      </div>
    </div>`;
  }

  /* --------------------------------- register explorer widget (Module 5) --------------------------------- */
  const NUMBERED_REG_DESC = {
    "0": "most recent yank",
    "1": "most recent delete/change",
    "2": "2nd most recent delete/change", "3": "3rd most recent delete/change",
    "4": "4th most recent delete/change", "5": "5th most recent delete/change",
    "6": "6th most recent delete/change", "7": "7th most recent delete/change",
    "8": "8th most recent delete/change", "9": "9th most recent delete/change"
  };
  const CORE_REG_ORDER = ["unnamed", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  let prevRegistersSnapshot = null;

  function regPreview(entry) {
    if (!entry) return null;
    const text = entry.text || "";
    const flat = text.replace(/\n/g, "\u23ce");
    return flat.length > 26 ? flat.slice(0, 26) + "\u2026" : flat;
  }

  function regRow(name, label, entry, changed) {
    const preview = regPreview(entry);
    const hasContent = entry && entry.text;
    return `<div class="reg-row${hasContent ? "" : " empty"}${changed ? " reg-changed" : ""}">
      <span class="reg-name mono">${esc(name)}</span>
      <span class="reg-label">${esc(label)}</span>
      <span class="reg-content mono">${hasContent ? `"${esc(preview)}"` : "&mdash;"}</span>
      ${entry && entry.linewise ? '<span class="reg-badge mono">lines</span>' : ""}
    </div>`;
  }

  function renderRegisterExplorer() {
    const ed = ENGINE.state.editor;
    const regs = ed.registers;

    // Lightweight, display-only diff across renders (no engine state touched)
    // so a register that was JUST written to visibly pulses for a moment.
    const snapshot = JSON.stringify(regs);
    const changedKeys = new Set();
    if (prevRegistersSnapshot && prevRegistersSnapshot !== snapshot) {
      const prev = JSON.parse(prevRegistersSnapshot);
      Object.keys(regs).forEach((k) => { if (JSON.stringify(regs[k]) !== JSON.stringify(prev[k])) changedKeys.add(k); });
    }
    prevRegistersSnapshot = snapshot;

    const coreRows = CORE_REG_ORDER.map((key) => {
      const label = key === "unnamed" ? "default target" : NUMBERED_REG_DESC[key];
      const name = key === "unnamed" ? '""' : `"${key}`;
      return regRow(name, label, regs[key], changedKeys.has(key));
    }).join("");

    const namedKeys = Object.keys(regs).filter((k) => /^[a-zA-Z+*]$/.test(k)).sort();
    const namedRows = namedKeys.length
      ? namedKeys.map((k) => regRow(`"${k}`, /[+*]/.test(k) ? "simulated clipboard register" : "named register", regs[k], changedKeys.has(k))).join("")
      : `<div class="reg-row empty"><span class="reg-content mono" style="grid-column:1/-1">none yet &mdash; try <code>"ayy</code> or <code>"bdw</code></span></div>`;

    return `${renderVimEditor()}<div class="panel reg-panel">
      <div class="panel-header"><span class="title mono">${icon("keyboard", 15)} register explorer</span><span class="pill">live &mdash; updates every keystroke</span></div>
      <div class="panel-body">
        <div class="reg-section-title mono">unnamed &amp; numbered</div>
        <div class="reg-table">${coreRows}</div>
        <div class="reg-section-title mono" style="margin-top:16px">named (a&ndash;z, +, *)</div>
        <div class="reg-table">${namedRows}</div>
        <div class="reg-note mono">
          <code>"_</code> is the black hole register &mdash; anything sent there (e.g. <code>"_dd</code>) is discarded, not stored, so it never appears above.<br>
          In real Vim, <code>"+</code> and <code>"*</code> read/write your OS clipboard. This simulator can't reach outside the browser, so here they behave like an ordinary named register &mdash; useful for practicing the keystrokes, just not for round-tripping with other apps.
        </div>
      </div>
    </div>`;
  }

  /* --------------------------------- macro visualizer widget (Module 7) --------------------------------- */
  const MACRO_KEY_LABELS = { Escape: "Esc", Enter: "\u23ce", Backspace: "\u232b", Tab: "\u21e5", " ": "\u2423" };
  function formatMacroKey(k) {
    if (MACRO_KEY_LABELS[k] !== undefined) return MACRO_KEY_LABELS[k];
    if (k.indexOf("ctrl-") === 0) return "^" + k.slice(5).toUpperCase();
    return k;
  }

  function renderMacroVisualizer() {
    const ed = ENGINE.state.editor;
    const stepper = ENGINE.state.macroStepper || { reg: null, index: 0 };

    const recordingBanner = ed.macroRecording
      ? `<div class="macro-recording mono">&#9679; recording into register "${esc(ed.macroRecording)}" &mdash; press <code>q</code> to stop</div>
         <div class="macro-keys">${ed.macroKeys.length
            ? ed.macroKeys.map((k) => `<span class="macro-key">${esc(formatMacroKey(k))}</span>`).join("")
            : '<span class="macro-keys-empty mono">no keys typed yet</span>'}</div>`
      : `<div class="macro-hint mono">press <code>q</code> followed by a register letter (e.g. <code>qa</code>) to start recording, then <code>q</code> again to stop.</div>`;

    const macroRegs = Object.keys(ed.macros).sort();
    const macroList = macroRegs.length
      ? macroRegs.map((reg) => {
          const keys = ed.macros[reg];
          const isStepping = stepper.reg === reg;
          const keyChips = keys.map((k, i) => {
            const cls = ["macro-key"];
            if (isStepping && i < stepper.index) cls.push("macro-key-done");
            if (isStepping && i === stepper.index) cls.push("macro-key-current");
            return `<span class="${cls.join(" ")}">${esc(formatMacroKey(k))}</span>`;
          }).join("");
          const controls = isStepping
            ? (stepper.index >= keys.length
                ? `<div class="macro-row-controls"><span class="macro-done mono">done replaying</span><button class="btn" data-macrocancel="${esc(reg)}">close</button></div>`
                : `<div class="macro-row-controls"><button class="btn accent" data-macronext="${esc(reg)}">next key &#9654;</button><button class="btn" data-macrofinish="${esc(reg)}">finish rest</button><button class="btn" data-macrocancel="${esc(reg)}">cancel</button></div>`)
            : `<div class="macro-row-controls"><button class="btn accent" data-macroreplay="${esc(reg)}">replay</button><button class="btn" data-macrostep="${esc(reg)}">step through</button></div>`;
          return `<div class="panel macro-row-panel">
            <div class="macro-row-header mono">"${esc(reg)} <span class="macro-count">${keys.length} key${keys.length === 1 ? "" : "s"}</span></div>
            <div class="macro-keys">${keyChips}</div>
            ${controls}
          </div>`;
        }).join("")
      : `<div class="macro-empty mono">no macros recorded yet</div>`;

    return `${renderVimEditor()}<div class="panel macro-panel">
      <div class="panel-header"><span class="title mono">${icon("keyboard", 15)} macro visualizer</span></div>
      <div class="panel-body">
        ${recordingBanner}
        <div class="macro-section-title mono" style="margin-top:16px">saved macros</div>
        ${macroList}
      </div>
    </div>`;
  }

  /* --------------------------------- search & substitute widget (Module 6) --------------------------------- */
  function subSlot(label, value) {
    return `<div class="sub-slot"><div class="sub-slot-label mono">${esc(label)}</div><div class="sub-slot-value mono">${value}</div></div>`;
  }

  function renderSearchVisualizer() {
    const ed = ENGINE.state.editor;
    const G = window.VimGrammar;
    let body;

    if (ed.mode === "search") {
      const dirSymbol = ed.searchDirection === "forward" ? "/" : "?";
      const preview = G.previewSearchMatches(ENGINE, ed.searchLine);
      const matchLine = !ed.searchLine
        ? `<div class="search-hint mono">type a pattern, then press Enter to jump &mdash; Escape cancels</div>`
        : preview.valid
          ? `<div class="search-matchcount mono">${preview.count} match${preview.count === 1 ? "" : "es"} in the buffer</div>`
          : `<div class="search-matchcount mono search-invalid">invalid pattern</div>`;
      body = `<div class="search-live-row mono"><span class="search-dir">${dirSymbol}</span><span class="search-pattern">${esc(ed.searchLine)}</span><span class="search-caret">&#9608;</span></div>${matchLine}`;
    } else if (ed.mode === "command" && /^%?s\//.test(ed.commandLine)) {
      const preview = G.previewSubstitute(ENGINE, ed.commandLine);
      const liveRow = `<div class="search-live-row mono"><span class="search-dir">:</span><span class="search-pattern">${esc(ed.commandLine)}</span><span class="search-caret">&#9608;</span></div>`;
      if (!preview.valid) {
        body = `${liveRow}<div class="search-hint mono">keep typing &mdash; needs a closing <code>/</code> after the replacement to parse, e.g. <code>%s/pattern/replacement/g</code></div>`;
      } else {
        const patternDisplay = preview.pattern.length ? esc(preview.pattern) : '<span class="sub-flag-note">(empty)</span>';
        const replDisplay = preview.replacement.length ? esc(preview.replacement) : '<span class="sub-flag-note">(empty &mdash; deletes the match)</span>';
        const flagsDisplay = preview.flags ? `${esc(preview.flags)}${preview.global ? ' <span class="sub-flag-note">(g = every match per line)</span>' : ""}` : '<span class="sub-flag-note">(none &mdash; first match per line only)</span>';
        body = `${liveRow}<div class="sub-slots">
          ${subSlot("scope", esc(preview.scope))}
          ${subSlot("pattern", patternDisplay)}
          ${subSlot("replacement", replDisplay)}
          ${subSlot("flags", flagsDisplay)}
        </div>
        <div class="search-matchcount mono">${preview.matchCount} substitution${preview.matchCount === 1 ? "" : "s"} would be made across ${preview.lineCount} line${preview.lineCount === 1 ? "" : "s"}</div>`;
      }
    } else {
      const lastSearchInfo = ed.lastSearch
        ? `<div class="search-lastinfo mono">last search: <span class="search-pattern">${esc(ed.lastSearch.pattern)}</span> (${esc(ed.lastSearch.direction)}) &mdash; <code>n</code>/<code>N</code> repeat it</div>`
        : `<div class="search-hint mono">no search yet this session</div>`;
      body = `${lastSearchInfo}
        <div class="search-section-title mono" style="margin-top:14px">search motions</div>
        <div class="search-ref-row mono"><span>/pattern</span><span>search forward</span></div>
        <div class="search-ref-row mono"><span>?pattern</span><span>search backward</span></div>
        <div class="search-ref-row mono"><span>n</span><span>repeat last search, same direction</span></div>
        <div class="search-ref-row mono"><span>N</span><span>repeat last search, opposite direction</span></div>
        <div class="search-ref-row mono"><span>*</span><span>search forward for the word under the cursor</span></div>
        <div class="search-ref-row mono"><span>#</span><span>search backward for the word under the cursor</span></div>
        <div class="search-section-title mono" style="margin-top:16px">substitute syntax</div>
        <div class="search-ref-row mono"><span>:s/pat/rep/</span><span>replace first match, current line</span></div>
        <div class="search-ref-row mono"><span>:s/pat/rep/g</span><span>replace every match, current line</span></div>
        <div class="search-ref-row mono"><span>:%s/pat/rep/g</span><span>replace every match, whole buffer</span></div>
        <div class="search-hint mono" style="margin-top:10px">try typing <code>/</code> or <code>:%s/.../.../</code> in the editor above &mdash; this panel updates live as you type, before you press Enter.</div>`;
    }

    return `${renderVimEditor()}<div class="panel search-panel">
      <div class="panel-header"><span class="title mono">${icon("keyboard", 15)} search &amp; substitute</span></div>
      <div class="panel-body">${body}</div>
    </div>`;
  }

  /* --------------------------------- buffers / windows / tabs widget (Module 8) --------------------------------- */
  function renderWindowPane(ed, win, isActive) {
    const buf = ed.buffers[win.bufferId];
    const name = buf ? buf.name : "?";
    if (isActive) {
      return `<div class="bw-pane bw-pane-active">
        <div class="bw-pane-header mono">${icon("keyboard", 12)} ${esc(name)} <span class="pill accent" style="margin-left:6px">active</span></div>
        ${renderVimEditor()}
      </div>`;
    }
    const lines = win.bufferId === ed.activeBufferId ? ed.lines : (buf && buf.lines ? buf.lines : [""]);
    const cursor = win.bufferId === ed.activeBufferId ? ed.cursor : (buf && buf.cursor ? buf.cursor : { line: 0, col: 0 });
    const grid = renderCharGrid(lines, cursor, null, null, "ved-cursor-block");
    return `<div class="bw-pane">
      <div class="bw-pane-header mono">${icon("keyboard", 12)} ${esc(name)}</div>
      <div class="ved-wrap bw-pane-preview">${grid}</div>
      <button class="btn" data-bwswitchwindow="${esc(win.id)}">switch to this window</button>
    </div>`;
  }

  function renderBufferWindowExplorer() {
    const ed = ENGINE.state.editor;
    const G = window.VimGrammar;
    const tab = G.activeTab(ed);

    const tabBar = `<div class="bw-tabbar">
      ${ed.tabs.map((t) => {
        const bufName = ed.buffers[t.windows.find((w) => w.id === t.activeWindowId).bufferId];
        const label = bufName ? bufName.name : "?";
        const isActive = t.id === ed.activeTabId;
        return `<button class="bw-tab${isActive ? " active" : ""}" data-bwswitchtab="${esc(t.id)}">${esc(label)}${ed.tabs.length > 1 ? `<span class="bw-tab-close" data-bwclosetab="${esc(t.id)}">&times;</span>` : ""}</button>`;
      }).join("")}
      <button class="bw-tab bw-tab-new" data-bwnewtab>+ new tab</button>
    </div>`;

    const windowsHtml = `<div class="bw-windows dir-${tab.splitDirection}">
      ${tab.windows.map((w) => renderWindowPane(ed, w, w.id === tab.activeWindowId)).join("")}
    </div>`;

    const bufferRows = Object.keys(ed.buffers).map((id) => {
      const b = ed.buffers[id];
      const isActive = id === ed.activeBufferId;
      const openCount = ed.tabs.reduce((n, t) => n + t.windows.filter((w) => w.bufferId === id).length, 0);
      return `<div class="bw-buf-row${isActive ? " active" : ""}">
        <span class="bw-buf-id mono">${esc(id)}</span>
        <span class="bw-buf-name mono">${esc(b.name)}</span>
        ${isActive ? '<span class="pill accent">active</span>' : `<button class="btn" data-bwswitchbuffer="${esc(id)}">switch</button>`}
        ${openCount === 0 ? `<button class="btn" data-bwdeletebuffer="${esc(id)}">delete</button>` : `<span class="bw-buf-openhint mono">open in ${openCount} window${openCount === 1 ? "" : "s"}</span>`}
      </div>`;
    }).join("");

    return `${tabBar}${windowsHtml}<div class="panel bw-panel">
      <div class="panel-header"><span class="title mono">${icon("keyboard", 15)} buffers</span><span class="pill">${Object.keys(ed.buffers).length} open</span></div>
      <div class="panel-body">
        <div class="bw-buf-list">${bufferRows}</div>
        <div class="mark-complete-row" style="justify-content:flex-start;margin-top:12px">
          <button class="btn accent" data-bwnewbuffer>+ new empty buffer</button>
          <button class="btn" data-bwsplit="horizontal">split window (Ctrl-w s)</button>
          <button class="btn" data-bwsplit="vertical">vsplit window (Ctrl-w v)</button>
        </div>
        <div class="search-section-title mono" style="margin-top:16px">key reference</div>
        <div class="search-ref-row mono"><span>:e name</span><span>open/create a named buffer</span></div>
        <div class="search-ref-row mono"><span>:bn / :bp</span><span>next / previous buffer</span></div>
        <div class="search-ref-row mono"><span>:bd</span><span>delete the current buffer</span></div>
        <div class="search-ref-row mono"><span>Ctrl-w s / v</span><span>split window horizontally / vertically</span></div>
        <div class="search-ref-row mono"><span>Ctrl-w w</span><span>cycle to the next window</span></div>
        <div class="search-ref-row mono"><span>Ctrl-w c / o</span><span>close window / keep only this one</span></div>
        <div class="search-ref-row mono"><span>gt / gT</span><span>next / previous tab</span></div>
        <div class="search-ref-row mono"><span>:tabnew</span><span>open a new tab</span></div>
      </div>
    </div>`;
  }

  /* --------------------------------- mark explorer widget (Module 9) --------------------------------- */
  function markRow(letter, posLine, posCol, previewText, isOtherBuffer, bufferLabel) {
    const preview = previewText.length > 30 ? previewText.slice(0, 30) + "\u2026" : previewText;
    return `<div class="mark-row">
      <span class="mark-letter mono">${esc(letter)}</span>
      <span class="mark-pos mono">${isOtherBuffer ? `${esc(bufferLabel)} &middot; ` : ""}Ln ${posLine + 1}, Col ${posCol + 1}</span>
      <span class="mark-preview mono">${esc(preview)}</span>
      <button class="btn" data-markjump="${esc(letter)}" data-markexact="0">'${esc(letter)}</button>
      <button class="btn" data-markjump="${esc(letter)}" data-markexact="1">\`${esc(letter)}</button>
    </div>`;
  }

  function renderMarksExplorer() {
    const ed = ENGINE.state.editor;
    const localEntries = Object.keys(ed.marks).sort().map((letter) => {
      const m = ed.marks[letter];
      return markRow(letter, m.line, m.col, ed.lines[m.line] || "", false, "");
    }).join("") || `<div class="mark-empty mono">no local marks set yet &mdash; try <code>ma</code></div>`;

    const globalEntries = Object.keys(ed.globalMarks).sort().map((letter) => {
      const gm = ed.globalMarks[letter];
      const isOther = gm.bufferId !== ed.activeBufferId;
      const buf = ed.buffers[gm.bufferId];
      const bufLabel = buf ? buf.name : "?";
      const lineText = isOther ? ((buf && buf.lines && buf.lines[gm.line]) || "") : (ed.lines[gm.line] || "");
      return markRow(letter, gm.line, gm.col, lineText, isOther, bufLabel);
    }).join("") || `<div class="mark-empty mono">no global marks set yet &mdash; try <code>mA</code></div>`;

    return `${renderVimEditor()}<div class="panel marks-panel">
      <div class="panel-header"><span class="title mono">${icon("keyboard", 15)} mark explorer</span></div>
      <div class="panel-body">
        <div class="search-section-title mono">local marks &mdash; this buffer only</div>
        <div class="mark-list">${localEntries}</div>
        <div class="search-section-title mono" style="margin-top:16px">global marks (A&ndash;Z) &mdash; jump across buffers</div>
        <div class="mark-list">${globalEntries}</div>
        <div class="search-section-title mono" style="margin-top:16px">reference</div>
        <div class="search-ref-row mono"><span>m{letter}</span><span>set a mark at the cursor (a&ndash;z)</span></div>
        <div class="search-ref-row mono"><span>'{letter}</span><span>jump to the mark's line (first non-blank)</span></div>
        <div class="search-ref-row mono"><span>\`{letter}</span><span>jump to the mark's exact position</span></div>
        <div class="search-ref-row mono"><span>d'a / d\`a</span><span>marks work as operator motions too</span></div>
        <div class="search-ref-row mono"><span>''</span><span>jump back to before your last big jump (G, gg, search, %, or another mark) &mdash; set automatically</span></div>
      </div>
    </div>`;
  }

  /* --------------------------------- undo tree visualizer widget (Module 9) --------------------------------- */
  function computeUndoTreeLayout(nodes, rootId) {
    const positions = {};
    const depths = {};
    let leafCounter = 0;
    // Post-order traversal done iteratively with an explicit stack rather
    // than recursion: a linear (unbranched) undo history — entirely
    // plausible once macros and dot-repeat make generating thousands of
    // small edits trivial — is exactly the pathological case that blows the
    // call stack in a naive recursive version, since its "tree" is really
    // just one long chain as deep as the whole edit history. Depth is
    // computed in this same forward pass (each child = parent's depth + 1)
    // rather than by walking back up to the root for every node, which
    // would turn a long chain into an O(n^2) hang instead of a crash.
    const order = [];
    const visitStack = [rootId];
    depths[rootId] = 0;
    while (visitStack.length) {
      const id = visitStack.pop();
      order.push(id);
      nodes[id].childIds.forEach((cid) => { depths[cid] = depths[id] + 1; visitStack.push(cid); });
    }
    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i];
      const n = nodes[id];
      if (!n.childIds.length) { positions[id] = { x: leafCounter++, y: depths[id] }; continue; }
      const xs = n.childIds.map((cid) => positions[cid].x);
      positions[id] = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: depths[id] };
    }
    return positions;
  }

  function renderUndoTreeVisualizer() {
    const ed = ENGINE.state.editor;
    const u = ed.undo;
    const nodeCount = Object.keys(u.nodes).length;
    const MAX_VISUALIZED_NODES = 1500;
    if (nodeCount > MAX_VISUALIZED_NODES) {
      // A history this long — thousands of edits, easily reached now that
      // macros and dot-repeat make generating many small changes trivial —
      // wouldn't render into a diagram a person could actually read even if
      // the browser handled the memory fine. Undo (u) and redo (Ctrl-r)
      // keep working normally either way; only this visualization backs off.
      return `${renderVimEditor()}<div class="panel undotree-panel">
        <div class="panel-header"><span class="title mono">${icon("keyboard", 15)} undo tree &mdash; time traveler</span></div>
        <div class="panel-body">
          <div class="ved-hint mono">This history has grown to ${nodeCount.toLocaleString()} changes &mdash; too many to draw as a readable diagram, so the visualization is paused here. <code>u</code> and <code>Ctrl-r</code> still work exactly as normal.</div>
        </div>
      </div>`;
    }
    const positions = computeUndoTreeLayout(u.nodes, 0);
    const COL_W = 64, ROW_H = 56, PAD = 30, NODE_R = 16;
    let maxX = 0, maxY = 0;
    Object.keys(positions).forEach((id) => { maxX = Math.max(maxX, positions[id].x); maxY = Math.max(maxY, positions[id].y); });
    const svgW = (maxX + 1) * COL_W + PAD * 2;
    const svgH = (maxY + 1) * ROW_H + PAD * 2;
    const px = (gx) => gx * COL_W + PAD;
    const py = (gy) => gy * ROW_H + PAD;

    // Which nodes lie on the path redo (Ctrl-r) would follow from here, via lastChild chaining.
    const redoPath = new Set();
    let walk = u.nodes[u.currentId];
    while (walk && walk.lastChild !== null && walk.lastChild !== undefined) { redoPath.add(walk.lastChild); walk = u.nodes[walk.lastChild]; }

    const edges = [];
    Object.keys(u.nodes).forEach((id) => {
      u.nodes[id].childIds.forEach((cid) => {
        const isRedo = redoPath.has(cid);
        edges.push(`<line x1="${px(positions[id].x)}" y1="${py(positions[id].y)}" x2="${px(positions[cid].x)}" y2="${py(positions[cid].y)}" class="undo-edge${isRedo ? " undo-edge-redo" : ""}" />`);
      });
    });
    const circles = Object.keys(u.nodes).map((id) => {
      const isCurrent = Number(id) === u.currentId;
      const isRedo = redoPath.has(Number(id));
      const cls = ["undo-node"];
      if (isCurrent) cls.push("undo-node-current"); else if (isRedo) cls.push("undo-node-redo");
      return `<g class="${cls.join(" ")}" data-undojump="${id}"><circle cx="${px(positions[id].x)}" cy="${py(positions[id].y)}" r="${NODE_R}" /><text x="${px(positions[id].x)}" y="${py(positions[id].y) + 4}" text-anchor="middle" class="undo-node-label">${esc(id)}</text></g>`;
    }).join("");

    const captionRows = Object.keys(u.nodes).sort((a, b) => Number(a) - Number(b)).map((id) => {
      const n = u.nodes[id];
      const isCurrent = Number(id) === u.currentId;
      return `<div class="undo-caption-row mono${isCurrent ? " current" : ""}">
        <span class="undo-caption-id">#${esc(id)}</span>
        <span class="undo-caption-label">${esc(n.label || (id === "0" ? "initial" : ""))}</span>
        ${isCurrent ? '<span class="pill accent">here</span>' : `<button class="btn" data-undojumpbtn="${esc(id)}">jump here</button>`}
      </div>`;
    }).join("");

    return `${renderVimEditor()}<div class="panel undotree-panel">
      <div class="panel-header"><span class="title mono">${icon("keyboard", 15)} undo tree &mdash; time traveler</span></div>
      <div class="panel-body">
        <div class="undotree-svg-wrap"><svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">${edges.join("")}${circles}</svg></div>
        <div class="undo-legend mono">
          <span><span class="undo-swatch undo-swatch-current"></span> current</span>
          <span><span class="undo-swatch undo-swatch-redo"></span> what Ctrl-r replays next</span>
          <span><span class="undo-swatch undo-swatch-other"></span> other branch (preserved, not lost)</span>
        </div>
        <div class="undo-caption-list">${captionRows}</div>
        <div class="ved-hint mono" style="margin-top:10px">click any node (in the diagram or the list) to jump straight to that point in history</div>
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

  /* --------------------------------- vim golf & boss battles widget (Module 10) --------------------------------- */
  const GOLF_GRADE_COLOR = { SSS: "var(--accent)", S: "var(--accent)", A: "var(--teal)", B: "var(--teal)", C: "var(--text-muted)", D: "var(--coral)", E: "var(--coral)" };

  function golfPuzzleCard(def) {
    const best = ENGINE.state.golfBestScores["vim_" + def.id];
    return `<div class="panel challenge-card">
      <div class="challenge-title">${icon("trophy", 14)} ${esc(def.title)}</div>
      <div class="challenge-hint mono">par: ${def.par} keystrokes</div>
      ${best ? `<div class="challenge-result mono" style="background:var(--teal-soft);color:var(--teal)">best: ${best.keystrokes} keys &middot; grade ${esc(best.grade)}</div>` : ""}
      <button class="btn accent" data-playgolf="${esc(def.id)}">Play</button>
    </div>`;
  }

  function renderGolfPicker() {
    const VG = window.VimGolf;
    return `<div class="panel">
      <div class="panel-header"><span class="title mono">${icon("trophy", 15)} vim golf</span></div>
      <div class="panel-body">
        <p class="perm-note" style="margin-top:0">Transform the starting text into the target text using as few keystrokes as possible. Anything goes here &mdash; operators, text objects, registers, macros, search, the command line &mdash; this is the real editor, not a restricted practice mode.</p>
        <div class="challenge-grid">${VG.GOLF_PUZZLES.map(golfPuzzleCard).join("")}</div>
      </div>
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="panel-header"><span class="title mono">${icon("trophy", 15)} boss battles</span></div>
      <div class="panel-body">
        <p class="perm-note" style="margin-top:0">Bigger challenges that combine several techniques from across the whole course in a single puzzle.</p>
        <div class="challenge-grid">${VG.BOSS_BATTLES.map(golfPuzzleCard).join("")}</div>
      </div>
    </div>`;
  }

  function renderGolfPlay(puzzleId) {
    const VG = window.VimGolf;
    const def = VG.findPuzzle(puzzleId);
    if (!def) { ENGINE.state.golfActivePuzzle = null; return renderGolfPicker(); }
    let g = ENGINE.state.golfGame;
    if (!g || g.id !== puzzleId) { VG.startGolfGame(ENGINE, puzzleId); g = ENGINE.state.golfGame; }
    const grid = renderCharGrid(g.editor.lines, g.editor.cursor, null, null, g.editor.mode === "insert" ? "ved-cursor-ibeam" : "ved-cursor-block");
    const targetPreview = def.targetLines.map((l) => esc(l) || "&nbsp;").join("<br>");
    const elapsed = g.finished ? g.resultMs : Date.now() - g.startedAt;
    const gradeColor = GOLF_GRADE_COLOR[g.grade] || "var(--text-muted)";

    return `<div style="margin-bottom:10px"><button class="btn" data-backtogolf>&larr; all puzzles</button></div>
    <div class="panel">
      <div class="panel-header"><span class="title mono">${icon("trophy", 15)} ${esc(def.title)}</span><span class="pill accent mono">par ${def.par}</span></div>
      <div class="panel-body">
        <div class="golf-layout">
          <div class="golf-editor-col">
            <div class="ved-wrap game-wrap" tabindex="0" data-vedinput="golf">${grid}</div>
            <div class="ved-status mono">${esc(g.editor.mode.toUpperCase())} &middot; keystrokes: ${g.keystrokes} &middot; time: ${(elapsed / 1000).toFixed(1)}s</div>
          </div>
          <div class="golf-target-col">
            <div class="golf-target-label mono">target</div>
            <div class="golf-target-preview mono">${targetPreview}</div>
            <details class="golf-hint-details"><summary class="mono">hint</summary><div class="mono golf-hint-text">${esc(def.hint)}</div></details>
          </div>
        </div>
        ${g.finished ? `
          <div class="golf-result" style="border-color:${gradeColor}">
            <div class="golf-grade mono" style="color:${gradeColor}">${esc(g.grade)}</div>
            <div class="golf-result-text mono">solved in ${g.keystrokes} keystroke${g.keystrokes === 1 ? "" : "s"} (par ${def.par})</div>
          </div>
          <div class="golf-section-title mono">your solution</div>
          <div class="golf-keylog">${g.keyLog.map((k) => `<span class="macro-key">${esc(formatMacroKey(k))}</span>`).join("")}</div>
        ` : ""}
        <div class="mark-complete-row" style="justify-content:flex-start;margin-top:12px">
          <button class="btn" data-golfrestart="${esc(puzzleId)}">Restart</button>
        </div>
      </div>
    </div>`;
  }

  function renderGolfWidget() {
    const activeId = ENGINE.state.golfActivePuzzle;
    return activeId ? renderGolfPlay(activeId) : renderGolfPicker();
  }

  /* --------------------------------- widget dispatcher --------------------------------- */
  function renderLessonWidget(key) {
    if (key === "editor") return renderVimEditor();
    if (key === "grammar") return renderGrammarBreakdown();
    if (key === "textobjects") return renderTextObjectExplorer();
    if (key === "registers") return renderRegisterExplorer();
    if (key === "macros") return renderMacroVisualizer();
    if (key === "search") return renderSearchVisualizer();
    if (key === "buffers") return renderBufferWindowExplorer();
    if (key === "marks") return renderMarksExplorer();
    if (key === "undotree") return renderUndoTreeVisualizer();
    if (key === "golf") return renderGolfWidget();
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
      else if (target === "golf") window.VimGolf.feedGolfKey(ENGINE, token);
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

    Actions.register("click", "[data-tobjscope]", (el) => {
      if (!ENGINE.state.textObjectPreview) ENGINE.state.textObjectPreview = { kind: "w", around: false };
      ENGINE.state.textObjectPreview.around = el.getAttribute("data-tobjscope") === "a";
      ENGINE.render();
    });
    Actions.register("click", "[data-tobjkind]", (el) => {
      if (!ENGINE.state.textObjectPreview) ENGINE.state.textObjectPreview = { kind: "w", around: false };
      ENGINE.state.textObjectPreview.kind = el.getAttribute("data-tobjkind");
      ENGINE.render();
    });
    Actions.register("click", "[data-tobjdemo]", (el) => {
      loadTextObjectDemo(ENGINE, el.getAttribute("data-tobjdemo"));
      ENGINE.state._focusSelector = '[data-vedinput="main"]';
      ENGINE.render();
    });

    Actions.register("click", "[data-macroreplay]", (el) => {
      const reg = el.getAttribute("data-macroreplay");
      const keys = ENGINE.state.editor.macros[reg];
      if (keys) {
        keys.forEach((k) => window.VimGrammar.feedKey(ENGINE, k));
        ENGINE.state.editor.lastMacroReg = reg;
      }
      ENGINE.state._focusSelector = '[data-vedinput="main"]';
      ENGINE.render();
    });
    Actions.register("click", "[data-macrostep]", (el) => {
      ENGINE.state.macroStepper = { reg: el.getAttribute("data-macrostep"), index: 0 };
      ENGINE.render();
    });
    Actions.register("click", "[data-macronext]", (el) => {
      const reg = el.getAttribute("data-macronext");
      const stepper = ENGINE.state.macroStepper;
      if (!stepper || stepper.reg !== reg) return;
      const keys = ENGINE.state.editor.macros[reg] || [];
      if (stepper.index < keys.length) {
        window.VimGrammar.feedKey(ENGINE, keys[stepper.index]);
        stepper.index++;
        if (stepper.index >= keys.length) ENGINE.state.editor.lastMacroReg = reg;
      }
      ENGINE.state._focusSelector = '[data-vedinput="main"]';
      ENGINE.render();
    });
    Actions.register("click", "[data-macrofinish]", (el) => {
      const reg = el.getAttribute("data-macrofinish");
      const stepper = ENGINE.state.macroStepper;
      if (!stepper || stepper.reg !== reg) return;
      const keys = ENGINE.state.editor.macros[reg] || [];
      for (let i = stepper.index; i < keys.length; i++) window.VimGrammar.feedKey(ENGINE, keys[i]);
      stepper.index = keys.length;
      ENGINE.state.editor.lastMacroReg = reg;
      ENGINE.state._focusSelector = '[data-vedinput="main"]';
      ENGINE.render();
    });
    Actions.register("click", "[data-macrocancel]", () => {
      ENGINE.state.macroStepper = { reg: null, index: 0 };
      ENGINE.state._focusSelector = '[data-vedinput="main"]';
      ENGINE.render();
    });

    Actions.register("click", "[data-bwclosetab]", (el) => {
      window.VimGrammar.switchToTab(ENGINE, el.getAttribute("data-bwclosetab"));
      window.VimGrammar.closeTab(ENGINE);
      ENGINE.state._focusSelector = '[data-vedinput="main"]';
      ENGINE.render();
    });
    Actions.register("click", "[data-bwswitchtab]", (el) => {
      window.VimGrammar.switchToTab(ENGINE, el.getAttribute("data-bwswitchtab"));
      ENGINE.state._focusSelector = '[data-vedinput="main"]';
      ENGINE.render();
    });
    Actions.register("click", "[data-bwnewtab]", () => {
      window.VimGrammar.newTab(ENGINE, null);
      ENGINE.state._focusSelector = '[data-vedinput="main"]';
      ENGINE.render();
    });
    Actions.register("click", "[data-bwswitchwindow]", (el) => {
      window.VimGrammar.switchToWindow(ENGINE, el.getAttribute("data-bwswitchwindow"));
      ENGINE.state._focusSelector = '[data-vedinput="main"]';
      ENGINE.render();
    });
    Actions.register("click", "[data-bwswitchbuffer]", (el) => {
      window.VimGrammar.switchToBuffer(ENGINE, el.getAttribute("data-bwswitchbuffer"));
      ENGINE.state._focusSelector = '[data-vedinput="main"]';
      ENGINE.render();
    });
    Actions.register("click", "[data-bwdeletebuffer]", (el) => {
      window.VimGrammar.deleteBuffer(ENGINE, el.getAttribute("data-bwdeletebuffer"));
      ENGINE.state._focusSelector = '[data-vedinput="main"]';
      ENGINE.render();
    });
    Actions.register("click", "[data-bwnewbuffer]", () => {
      window.VimGrammar.switchToBuffer(ENGINE, window.VimGrammar.createBuffer(ENGINE));
      ENGINE.state._focusSelector = '[data-vedinput="main"]';
      ENGINE.render();
    });
    Actions.register("click", "[data-bwsplit]", (el) => {
      window.VimGrammar.splitWindow(ENGINE, el.getAttribute("data-bwsplit"), null);
      ENGINE.state._focusSelector = '[data-vedinput="main"]';
      ENGINE.render();
    });

    Actions.register("click", "[data-markjump]", (el) => {
      window.VimGrammar.jumpToMark(ENGINE, el.getAttribute("data-markjump"), el.getAttribute("data-markexact") === "1");
      ENGINE.state._focusSelector = '[data-vedinput="main"]';
      ENGINE.render();
    });
    Actions.register("click", "[data-undojump]", (el) => {
      window.VimGrammar.jumpToUndoNode(ENGINE, parseInt(el.getAttribute("data-undojump"), 10));
      ENGINE.state._focusSelector = '[data-vedinput="main"]';
      ENGINE.render();
    });
    Actions.register("click", "[data-undojumpbtn]", (el) => {
      window.VimGrammar.jumpToUndoNode(ENGINE, parseInt(el.getAttribute("data-undojumpbtn"), 10));
      ENGINE.state._focusSelector = '[data-vedinput="main"]';
      ENGINE.render();
    });

    Actions.register("click", "[data-playgolf]", (el) => {
      ENGINE.state.golfActivePuzzle = el.getAttribute("data-playgolf");
      window.VimGolf.startGolfGame(ENGINE, ENGINE.state.golfActivePuzzle);
      ENGINE.state._focusSelector = '[data-vedinput="golf"]';
      ENGINE.render();
    });
    Actions.register("click", "[data-backtogolf]", () => {
      ENGINE.state.golfActivePuzzle = null;
      ENGINE.render();
    });
    Actions.register("click", "[data-golfrestart]", (el) => {
      window.VimGolf.startGolfGame(ENGINE, el.getAttribute("data-golfrestart"));
      ENGINE.state._focusSelector = '[data-vedinput="golf"]';
      ENGINE.render();
    });
  }

  return { registerActions, renderLessonWidget, renderSandboxWidget };
})();