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
      everStashed: false,
      everPopped: false
    };
  }

  // Patch saves from older versions (or hand-edited ones) back into a shape
  // every widget can render, instead of dropping into the recovery screen.
  function migrateState(state, fresh) {
    const r = state.repo;
    const ok = r && r.commits && typeof r.commits === "object" && r.branches && typeof r.branches === "object" && r.head && r.workspace;
    if (!ok) { state.repo = fresh.repo; return state; }
    ["stash"].forEach((k) => { if (!Array.isArray(r[k])) r[k] = []; });
    if (!r.branchLanes || typeof r.branchLanes !== "object") r.branchLanes = {};
    if (typeof r.orderCounter !== "number") r.orderCounter = Object.keys(r.commits).length;
    G.WORKSPACE_FILES.forEach((f) => { if (!r.workspace[f]) r.workspace[f] = "clean"; });
    if (!G.headHash(r) || !r.commits[G.headHash(r)]) state.repo = fresh.repo;
    if (!Array.isArray(state.consoleHistory)) state.consoleHistory = fresh.consoleHistory;
    return state;
  }

  const Engine = window.Curriculum.createEngine({
    course: window.GitCourse.COURSE,
    storageKey: "git-simulator-progress-v1",
    brandName: "git", brandTagline: "simulator", brandIcon: "gitBranch",
    footerNote: "educational prototype — progress saves automatically in this browser",
    resetExtraWarning: "restore the default repository",
    createDomainState,
    migrateState,
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