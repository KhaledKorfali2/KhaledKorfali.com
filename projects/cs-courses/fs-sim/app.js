/* ============================== fs-sim/app.js ==============================
   Glue code. This is the only file that knows about BOTH the generic
   Curriculum engine (core/) and the filesystem domain (fs-sim/). A new
   project (git-sim, bash-quiz) would write its own version of this file
   pointing at its own model/widgets/course modules.
================================================================================ */
(function () {
  const M = window.FsModel;

  const SANDBOX_NAV = [
    { key: "explorer", label: "explorer", icon: "compass" },
    { key: "terminal", label: "terminal", icon: "terminal" },
    { key: "permissions", label: "permissions", icon: "lock" },
    { key: "inode", label: "inode", icon: "database" },
    { key: "links", label: "links", icon: "link2" },
    { key: "fd", label: "processes", icon: "cpu" },
    { key: "mounts", label: "mounts", icon: "server" },
    { key: "storage", label: "storage", icon: "barChart2" },
    { key: "challenges", label: "challenges", icon: "trophy" }
  ];

  function createDomainState() {
    return {
      fs: M.buildInitialFS(),
      processes: M.buildProcesses(),
      mounts: M.buildMounts(),
      selectedPath: "/home/khaled/notes.txt",
      cwd: "/home/khaled",
      selectedProcess: 42,
      storageDefrag: false,
      expanded: { "/": true, "/home": true, "/home/khaled": true },
      termHistory: [{ type: "sys", text: "khaled-sim v1.0 — type 'help' to list commands" }],
      permDraft: null,
      links: { target: "", dir: "/home/khaled", name: "mylink", mode: "symbolic", msg: null },
      challengeAnswers: {},
      challengeResult: {},
      inodeCounter: M.getInodeCounter()
    };
  }

  // Both the Sandbox tab body and an embedded lesson widget go through this
  // one hook. `state.mode` reliably tells us which context we're in:
  // "sandbox" wants the full two-column explorer/terminal layout, lesson
  // subsections want the compact embedded version.
  function renderWidget(key, state) {
    return state.mode === "sandbox"
      ? window.FsWidgets.renderSandboxWidget(key)
      : window.FsWidgets.renderLessonWidget(key);
  }

  const Engine = window.Curriculum.createEngine({
    course: window.FsCourse.COURSE,
    storageKey: "fs-simulator-progress-v1",
    mountId: "app",
    brandName: "fs",
    brandTagline: "simulator",
    brandIcon: "hardDrive",
    footerNote: "educational prototype — progress saves automatically in this browser",
    resetExtraWarning: "restore the default filesystem",
    createDomainState,
    sandboxNav: SANDBOX_NAV,
    defaultSandboxView: "explorer",
    scrollPreserveSelectors: [".tree-scroll", "#term-history"],
    renderWidget,
    homeStats: (state) => [{ label: "dirs explored", value: M.flatten(state.fs).filter((f) => f.node.type === "dir").length }],
    beforeSave: (state) => { state.inodeCounter = M.getInodeCounter(); }
  });

  window.Engine = Engine;

  window.FsWidgets.registerActions(Engine);

  const hadSave = Engine.loadProgress();
  if (hadSave && typeof Engine.state.inodeCounter === "number") {
    M.setInodeCounter(Engine.state.inodeCounter);
  } else {
    Engine.state.inodeCounter = M.getInodeCounter();
  }

  Engine.registerCoreActions();
  Engine.render();
})();