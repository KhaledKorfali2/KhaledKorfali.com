/* ============================== vim-sim/app.js ==============================
   Wires everything together, mirroring fs-sim/app.js and git-sim/app.js.
================================================================================= */
(function () {
  const SEED_LINES = [
    'function greet(name) {',
    '  return "Hello, " + name + "!";',
    '}',
    '',
    'const items = [1, 2, 3];',
    '// TODO: refactor this later'
  ];

  const SANDBOX_NAV = [
    { key: "editor", label: "editor", icon: "keyboard" },
    { key: "grammar", label: "grammar lab", icon: "keyboard" },
    { key: "textobjects", label: "text objects", icon: "keyboard" },
    { key: "registers", label: "registers", icon: "keyboard" },
    { key: "macros", label: "macros", icon: "keyboard" },
    { key: "search", label: "search", icon: "keyboard" },
    { key: "buffers", label: "buffers", icon: "keyboard" },
    { key: "marks", label: "marks", icon: "keyboard" },
    { key: "undotree", label: "undo tree", icon: "keyboard" },
    { key: "vimconfig", label: "settings & config", icon: "settingsGear" },
    { key: "golf", label: "vim golf", icon: "trophy" },
    { key: "games-menu", label: "games", icon: "trophy" }
  ];

  function createDomainState() {
    return {
      editor: window.VimGrammar.createEditorState(SEED_LINES),
      game: null,
      gameBestScores: {},
      sandboxActiveGame: null,
      textObjectPreview: { kind: "w", around: false },
      macroStepper: { reg: null, index: 0 },
      golfGame: null, golfBestScores: {}, golfActivePuzzle: null
    };
  }

  // Fields the editor state has grown over time (buffers/windows/tabs, marks,
  // global marks...). A save made before one of these existed is missing the
  // field entirely rather than having it empty, so we backfill from a fresh
  // editor rather than trusting the merge in curriculum.js to have handled it.
  const EDITOR_DEFAULT_KEYS = [
    "marks", "globalMarks",
    "buffers", "activeBufferId", "nextBufferId",
    "tabs", "activeTabId", "nextWindowId", "nextTabId",
    "lastChangeKeys",
    "wantCol",
    "lastVisual",
    "jumpList", "jumpIndex",
    "insertStartLine", "insertStartCol",
    "replaceOverwritten",
    "settings", "hlsearchSuppressed"
  ];

  function migrateState(state) {
    const fresh = window.VimGrammar.createEditorState(SEED_LINES);
    if (!state.editor) { state.editor = fresh; return state; }
    EDITOR_DEFAULT_KEYS.forEach((key) => {
      if (state.editor[key] === undefined) state.editor[key] = fresh[key];
    });
    // Buffers/tabs reference each other by id; if buffers exists but the
    // active ids or tab/window structure don't, the ids won't line up, so
    // reset those pieces together rather than mixing old+new partial shapes.
    if (!state.editor.buffers || !state.editor.buffers[state.editor.activeBufferId]) {
      state.editor.buffers = fresh.buffers;
      state.editor.activeBufferId = fresh.activeBufferId;
      state.editor.nextBufferId = fresh.nextBufferId;
    }
    if (!state.editor.tabs || !state.editor.tabs.length) {
      state.editor.tabs = fresh.tabs;
      state.editor.activeTabId = fresh.activeTabId;
      state.editor.nextWindowId = fresh.nextWindowId;
      state.editor.nextTabId = fresh.nextTabId;
    }
    // Settings is a growing object of individual toggles/numbers — backfill
    // any key missing from an older save rather than replacing the whole
    // object, so a save made before a NEW setting existed still gets a
    // sensible default for just that one setting.
    Object.keys(fresh.settings).forEach((key) => {
      if (state.editor.settings[key] === undefined) state.editor.settings[key] = fresh.settings[key];
    });
    return state;
  }

  const Engine = window.Curriculum.createEngine({
    course: window.VimCourse.COURSE,
    storageKey: "vim-simulator-progress-v1",
    brandName: "vim", brandTagline: "simulator", brandIcon: "keyboard",
    footerNote: "educational prototype — progress saves automatically in this browser",
    resetExtraWarning: "restore the default buffer and game scores",
    createDomainState,
    migrateState,
    sandboxNav: SANDBOX_NAV,
    defaultSandboxView: "editor",
    scrollPreserveSelectors: [".ved-lines"],
    renderWidget: (key, state, context) => (context === "sandbox" ? window.VimWidgets.renderSandboxWidget(key) : window.VimWidgets.renderLessonWidget(key)),
    homeStats: (state) => [
      { label: "games won", value: Object.keys(state.gameBestScores).length }
    ]
  });

  window.Engine = Engine;
  window.VimWidgets.registerActions(Engine);
  Engine.loadProgress();
  Engine.registerCoreActions();
  Engine.render();
})();