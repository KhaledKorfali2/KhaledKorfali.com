/* ============================== git-sim/app.js ==============================
   Wires everything together: builds domain state, creates the Curriculum
   engine, registers domain actions, and boots. Mirrors fs-sim/app.js almost
   line for line — that symmetry is the point of the core/ split.
================================================================================= */
(function () {
  const G = window.GitModel;

  const SANDBOX_NAV = [
    { key: "graph", label: "graph", icon: "gitBranch" },
    { key: "console", label: "console", icon: "terminal" },
    { key: "commit", label: "commit", icon: "database" },
    { key: "staging", label: "staging", icon: "fileText" },
    { key: "conflict", label: "conflict", icon: "alertTriangle" },
    { key: "challenges", label: "challenges", icon: "trophy" }
  ];

  function createDomainState() {
    return {
      repo: G.buildInitialRepo(),
      consoleHistory: [{ type: "sys", text: "git-sim v1.0 — type 'help' to list commands" }],
      selectedCommit: null,
      hadConflict: false,
      everStashed: false
    };
  }

  const Engine = window.Curriculum.createEngine({
    course: window.GitCourse.COURSE,
    storageKey: "git-simulator-progress-v1",
    brandName: "git", brandTagline: "simulator", brandIcon: "gitBranch",
    footerNote: "educational prototype — progress saves automatically in this browser",
    resetExtraWarning: "restore the default repository",
    createDomainState,
    sandboxNav: SANDBOX_NAV,
    defaultSandboxView: "graph",
    scrollPreserveSelectors: [".graph-scroll", "#git-console-history"],
    renderWidget: (key, state, context) => (context === "sandbox" ? window.GitWidgets.renderSandboxWidget(key) : window.GitWidgets.renderLessonWidget(key)),
    homeStats: (state) => [
      { label: "commits made", value: Object.keys(state.repo.commits).length },
      { label: "branches", value: Object.keys(state.repo.branches).length }
    ]
  });

  window.Engine = Engine;
  window.GitWidgets.registerActions(Engine);
  Engine.loadProgress();
  Engine.registerCoreActions();
  Engine.render();
})();