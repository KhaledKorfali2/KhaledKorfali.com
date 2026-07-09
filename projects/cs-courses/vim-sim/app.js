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
    { key: "games-menu", label: "games", icon: "trophy" }
  ];

  function createDomainState() {
    return {
      editor: window.VimGrammar.createEditorState(SEED_LINES),
      game: null,
      gameBestScores: {},
      sandboxActiveGame: null
    };
  }

  const Engine = window.Curriculum.createEngine({
    course: window.VimCourse.COURSE,
    storageKey: "vim-simulator-progress-v1",
    brandName: "vim", brandTagline: "simulator", brandIcon: "keyboard",
    footerNote: "educational prototype — progress saves automatically in this browser",
    resetExtraWarning: "restore the default buffer and game scores",
    createDomainState,
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