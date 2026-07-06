/* ============================== git-sim/widgets.js ==============================
   Every renderable "tool": the repository graph, command console, commit
   explorer, staging area visualizer, conflict simulator, and challenges.
   registerActions(engine) must be called once, before Engine.render().
==================================================================================== */
window.GitWidgets = (function () {
  const G = window.GitModel;
  const icon = window.Icons.icon;
  const esc = window.Utils.esc;
  let ENGINE = null;

  const PALETTE = ["#4FB8A6", "#E8A33D", "#D1616B", "#7B9EE8", "#C792E8", "#E8D34F"];
  const laneColor = (lane) => PALETTE[lane % PALETTE.length];

  /* --------------------------------- Repository graph --------------------------------- */
  function renderGraph() {
    const r = ENGINE.state.repo;
    const commits = Object.values(r.commits).sort((a, b) => a.order - b.order);
    const spacingX = 74, spacingY = 56, marginX = 46, marginY = 34;
    const maxOrder = commits.reduce((m, c) => Math.max(m, c.order), 0);
    const maxLane = Math.max(0, ...commits.map((c) => c.lane), ...Object.values(r.branchLanes));
    const width = marginX * 2 + maxOrder * spacingX + 60;
    const height = marginY * 2 + maxLane * spacingY + 20;
    const posOf = (c) => ({ x: marginX + c.order * spacingX, y: marginY + c.lane * spacingY });
    const headHash = G.headHash(r);
    const selected = ENGINE.state.selectedCommit;

    let edges = "";
    commits.forEach((c) => {
      const p1 = posOf(c);
      c.parents.forEach((ph) => {
        const parent = r.commits[ph];
        if (!parent) return;
        const p0 = posOf(parent);
        if (p0.y === p1.y) {
          edges += `<line x1="${p0.x}" y1="${p0.y}" x2="${p1.x}" y2="${p1.y}" stroke="${laneColor(c.lane)}" stroke-width="2" opacity="0.55"/>`;
        } else {
          const midX = (p0.x + p1.x) / 2;
          edges += `<path d="M ${p0.x} ${p0.y} C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}" fill="none" stroke="${laneColor(c.lane)}" stroke-width="2" opacity="0.55"/>`;
        }
      });
    });

    let nodes = "";
    commits.forEach((c) => {
      const p = posOf(c);
      const isHead = c.hash === headHash;
      const isMerge = c.parents.length > 1;
      const isSel = selected === c.hash;
      nodes += `<g data-selectcommit="${c.hash}" style="cursor:pointer">
        ${isHead ? `<circle cx="${p.x}" cy="${p.y}" r="13" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="3,2"/>` : ""}
        <circle cx="${p.x}" cy="${p.y}" r="${isMerge ? 9 : 7}" fill="${laneColor(c.lane)}" stroke="${isSel ? "#fff" : "none"}" stroke-width="2"/>
        <text x="${p.x}" y="${p.y - 18}" font-size="10" fill="var(--text-dim)" text-anchor="middle" font-family="monospace">${c.hash}</text>
      </g>`;
    });

    let labels = "";
    Object.entries(r.branches).forEach(([name, hash]) => {
      const c = r.commits[hash];
      if (!c) return;
      const p = posOf(c);
      const w = name.length * 7 + 16;
      labels += `<g data-checkoutbranch="${esc(name)}" style="cursor:pointer">
        <rect x="${p.x + 14}" y="${p.y - 10}" width="${w}" height="20" rx="5" fill="${laneColor(c.lane)}" fill-opacity="0.18" stroke="${laneColor(c.lane)}" stroke-opacity="0.5"/>
        <text x="${p.x + 22}" y="${p.y + 4}" font-size="11" fill="${laneColor(c.lane)}" font-family="monospace">${esc(name)}</text>
      </g>`;
    });

    let headLabel = "";
    if (r.head.type === "branch") {
      const hc = r.commits[r.branches[r.head.name]];
      if (hc) { const p = posOf(hc); headLabel = `<text x="${p.x}" y="${p.y - 30}" font-size="9" fill="var(--accent)" text-anchor="middle" font-family="monospace">HEAD</text>`; }
    } else {
      const hc = r.commits[r.head.hash];
      if (hc) { const p = posOf(hc); headLabel = `<text x="${p.x}" y="${p.y - 30}" font-size="9" fill="var(--coral)" text-anchor="middle" font-family="monospace">HEAD (detached)</text>`; }
    }

    return `<div class="panel">
      <div class="panel-header">
        <span class="title mono">${icon("gitBranch", 15)} repository graph</span>
        <span class="mono" style="font-size:11px;color:var(--text-dim)">click a commit to inspect it &middot; click a branch tag to check it out</span>
      </div>
      <div class="graph-scroll">
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${edges}${nodes}${labels}${headLabel}</svg>
      </div>
    </div>`;
  }

  /* --------------------------------- Commit explorer --------------------------------- */
  function renderCommitExplorer() {
    const r = ENGINE.state.repo;
    const hash = ENGINE.state.selectedCommit && r.commits[ENGINE.state.selectedCommit] ? ENGINE.state.selectedCommit : G.headHash(r);
    const c = r.commits[hash];
    if (!c) return `<div class="panel"><div class="empty-hint">no commits yet</div></div>`;
    const isHeadHere = hash === G.headHash(r);
    const pointingBranches = Object.entries(r.branches).filter(([, h]) => h === hash).map(([n]) => n);
    return `<div class="panel">
      <div class="panel-header">
        <span class="title mono">${icon("database", 15)} commit ${c.hash}</span>
        ${isHeadHere ? `<span class="pill accent">HEAD</span>` : ""}
      </div>
      <div class="panel-body">
        <div class="permline">${esc(c.message)}${c.rebasedFrom ? ` <span style="color:var(--text-dim)">(replayed from ${c.rebasedFrom})</span>` : ""}</div>
        <div class="info-grid">
          <div><span class="k">author</span><span class="v">${esc(c.author)}</span></div>
          <div><span class="k">date</span><span class="v">${esc(c.date)}</span></div>
          <div><span class="k">parents</span><span class="v">${c.parents.length ? c.parents.join(", ") : "(root commit)"}</span></div>
          <div><span class="k">on branch(es)</span><span class="v">${pointingBranches.length ? pointingBranches.join(", ") : "(no branch tip here)"}</span></div>
          <div><span class="k">files changed</span><span class="v">${c.filesChanged.length ? c.filesChanged.join(", ") : "(none)"}</span></div>
          <div><span class="k">type</span><span class="v">${c.parents.length > 1 ? "merge commit" : c.parents.length === 0 ? "root commit" : "commit"}</span></div>
        </div>
        <div class="mark-complete-row" style="justify-content:flex-start;gap:8px">
          <button class="btn" data-checkoutcommit="${c.hash}">Checkout this commit</button>
          <button class="btn" data-branchhere="${c.hash}">Create branch here</button>
        </div>
        <p class="perm-note">Checking out a commit hash directly (instead of a branch name) puts you in <b>detached HEAD</b>: you can look around, or build on top of it, but nothing points here until you make a branch.</p>
      </div>
    </div>`;
  }

  function renderCommitExplorerEmbed() { return renderCommitExplorer(); }

  /* --------------------------------- Console --------------------------------- */
  function renderConsole() {
    const state = ENGINE.state;
    const quick = ["git status", "git log --oneline", "git branch", "edit app.js"];
    return `<div class="panel">
      <div class="panel-header"><span class="title mono">${icon("terminal", 15)} command console</span><span class="pill accent mono">${G.currentBranchName(state.repo) || "detached"}</span></div>
      <div id="git-console-history" class="terminal-body">
        ${state.consoleHistory.map((h) => `<div class="term-line ${h.type} mono">${esc(h.text)}</div>`).join("")}
        <div class="term-prompt-row">
          <span class="prompt mono">$</span>
          <input id="git-console-input" type="text" autocomplete="off" spellcheck="false" placeholder="git ..." />
          <span class="blink mono" style="color:var(--accent)">&#9608;</span>
        </div>
      </div>
      <div class="term-quick">${quick.map((q) => `<button data-gitquickcmd="${esc(q)}">${esc(q)}</button>`).join("")}</div>
    </div>`;
  }

  function renderConsoleAndExplorer() {
    return `<div class="explorer-grid"><div>${renderConsole()}</div><div>${renderCommitExplorer()}</div></div>`;
  }

  /* --------------------------------- Staging area --------------------------------- */
  function renderStagingArea() {
    const r = ENGINE.state.repo;
    const modified = Object.entries(r.workspace).filter(([, v]) => v === "modified").map(([f]) => f);
    const staged = Object.entries(r.workspace).filter(([, v]) => v === "staged").map(([f]) => f);
    const headCommit = r.commits[G.headHash(r)];
    const col = (title, files, action) => `
      <div class="stage-col">
        <div class="stage-col-title mono">${title}</div>
        ${files.length ? files.map((f) => `<div class="stage-file mono">${esc(f)}${action ? `<button data-${action.attr}="${esc(f)}">${action.label}</button>` : ""}</div>`).join("") : `<div class="stage-empty mono">empty</div>`}
      </div>`;
    return `<div class="panel">
      <div class="panel-header"><span class="title mono">${icon("fileText", 15)} staging area visualizer</span></div>
      <div class="panel-body">
        <div class="stage-flow">
          ${col("Working tree (modified)", modified, { attr: "stagefile", label: "stage &rarr;" })}
          <div class="stage-arrow">${icon("chevronRight", 16)}</div>
          ${col("Staging area (index)", staged, null)}
          <div class="stage-arrow">${icon("chevronRight", 16)}</div>
          ${col("Repository (last commit)", headCommit ? headCommit.filesChanged : [], null)}
        </div>
        <div class="fd-controls" style="margin-top:14px">
          <select data-editfileselect>${G.WORKSPACE_FILES.filter((f) => r.workspace[f] === "clean").map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join("") || `<option value="">(everything already modified)</option>`}</select>
          <button class="btn" data-editfilebtn>Simulate an edit</button>
        </div>
        <p class="perm-note">A file moves working tree &rarr; staging area with <span class="mono">git add</span>, then staging area &rarr; repository with <span class="mono">git commit</span>. Nothing is permanent until it's committed.</p>
      </div>
    </div>`;
  }

  /* --------------------------------- Conflict simulator --------------------------------- */
  function renderConflictSimulator() {
    const r = ENGINE.state.repo;
    if (!r.conflict) {
      return `<div class="panel"><div class="panel-header"><span class="title mono">${icon("alertTriangle", 15)} conflict simulator</span></div><div class="panel-body"><p class="perm-note" style="margin:0">No merge conflict right now. Trigger one by merging two branches that touched the same file — try merging <span class="mono">feature</span> into <span class="mono">main</span> in the console.</p></div></div>`;
    }
    const allResolved = r.conflict.files.every((f) => f.resolved);
    return `<div class="panel">
      <div class="panel-header"><span class="title mono">${icon("alertTriangle", 15)} conflict simulator</span><span class="pill coral">merge paused</span></div>
      <div class="panel-body">
        <p class="perm-note" style="margin-top:0">Merging <span class="mono">${esc(r.conflict.theirBranch)}</span> touched the same file(s) you changed on this branch. Pick how to resolve each one.</p>
        ${r.conflict.files.map((f) => `
          <div class="conflict-file">
            <div class="conflict-file-name mono">${esc(f.name)} ${f.resolved ? `<span class="pill teal">resolved: ${f.resolved}</span>` : `<span class="pill coral">unresolved</span>`}</div>
            <div class="conflict-options">
              <button class="btn ${f.resolved === "ours" ? "accent" : ""}" data-resolveconflict="${esc(f.name)}:ours">Keep ours</button>
              <button class="btn ${f.resolved === "theirs" ? "accent" : ""}" data-resolveconflict="${esc(f.name)}:theirs">Keep theirs</button>
              <button class="btn ${f.resolved === "combined" ? "accent" : ""}" data-resolveconflict="${esc(f.name)}:combined">Combine both</button>
            </div>
          </div>`).join("")}
        <div class="mark-complete-row" style="justify-content:flex-start;margin-top:16px">
          <button class="btn accent" data-finishmerge ${allResolved ? "" : "disabled"}>Finish merge</button>
        </div>
      </div>
    </div>`;
  }

  /* --------------------------------- Challenges --------------------------------- */
  function challengeStatus() {
    const s = ENGINE.state;
    const r = s.repo;
    return [
      { title: "Create a branch named 'hotfix'", done: !!r.branches.hotfix },
      { title: "Merge 'feature' fully into 'main'", done: !!r.branches.feature && !!r.branches.main && G.isAncestor(r, r.branches.feature, r.branches.main) },
      { title: "Rebase 'feature' onto 'main' (linear history)", done: !!r.branches.feature && !!r.branches.main && G.commonAncestor(r, r.branches.feature, r.branches.main) === r.branches.main },
      { title: "Trigger a merge conflict and resolve it", done: !!s.hadConflict && !r.conflict },
      { title: "Stash changes, then bring them back with stash pop", done: !!s.everStashed && r.stash.length === 0 }
    ];
  }

  function renderChallengesLab() {
    const items = challengeStatus();
    return `<div class="panel">
      <div class="panel-header"><span class="title mono">${icon("trophy", 15)} challenges</span></div>
      <div class="panel-body"><div class="challenge-grid">
        ${items.map((it) => `<div class="panel challenge-card">
          <div class="challenge-title">${icon(it.done ? "check" : "trophy", 14)} ${esc(it.title)}</div>
          <div class="challenge-result mono" style="background:${it.done ? "var(--teal-soft)" : "var(--bg-raised)"};color:${it.done ? "var(--teal)" : "var(--text-dim)"}">${it.done ? "Done!" : "Not yet — try it in the console."}</div>
        </div>`).join("")}
      </div></div>
    </div>`;
  }

  /* --------------------------------- widget dispatcher --------------------------------- */
  function renderLessonWidget(key) {
    switch (key) {
      case "graph": return renderGraph();
      case "console": return renderConsole();
      case "commit": return renderCommitExplorerEmbed();
      case "staging": return renderStagingArea();
      case "conflict": return renderConflictSimulator();
      case "challenges": return renderChallengesLab();
      default: return "";
    }
  }
  function renderSandboxWidget(key) {
    if (key === "console") return renderConsoleAndExplorer();
    if (key === "graph") return `${renderGraph()}<div style="height:14px"></div>${renderCommitExplorer()}`;
    return renderLessonWidget(key);
  }

  /* --------------------------------- action wiring --------------------------------- */
  function registerActions(engine) {
    ENGINE = engine;
    window.GitCommands.init(engine);
    const Actions = window.Actions;
    const state = () => ENGINE.state;

    function runAndRefresh(cmd) {
      window.GitCommands.run(cmd);
      state()._stickToBottomSelectors = ["#git-console-history"];
      state()._focusSelector = "#git-console-input";
      ENGINE.render();
    }

    Actions.register("click", "[data-gitquickcmd]", (el) => runAndRefresh(el.getAttribute("data-gitquickcmd")));
    Actions.register("keydown", (target, e) => (target.id === "git-console-input" && e.key === "Enter" ? target : null), (el) => {
      runAndRefresh(el.value);
      el.value = "";
    });
    Actions.register("click", "#git-console-history", () => {
      const inp = document.getElementById("git-console-input");
      if (inp) inp.focus();
    });

    Actions.register("click", "[data-selectcommit]", (el) => { state().selectedCommit = el.getAttribute("data-selectcommit"); ENGINE.render(); });
    Actions.register("click", "[data-checkoutbranch]", (el) => { runAndRefresh(`checkout ${el.getAttribute("data-checkoutbranch")}`); });
    Actions.register("click", "[data-checkoutcommit]", (el) => { runAndRefresh(`checkout ${el.getAttribute("data-checkoutcommit")}`); });
    Actions.register("click", "[data-branchhere]", (el) => {
      const hash = el.getAttribute("data-branchhere");
      runAndRefresh(`checkout ${hash}`);
      const name = window.prompt ? window.prompt("New branch name?") : null;
      if (name) runAndRefresh(`checkout -b ${name}`);
    });

    Actions.register("click", "[data-stagefile]", (el) => runAndRefresh(`add ${el.getAttribute("data-stagefile")}`));
    Actions.register("click", "[data-editfilebtn]", () => {
      const sel = document.querySelector("[data-editfileselect]");
      if (sel && sel.value) runAndRefresh(`edit ${sel.value}`);
    });

    Actions.register("click", "[data-resolveconflict]", (el) => {
      const [file, choice] = el.getAttribute("data-resolveconflict").split(":");
      const r = state().repo;
      if (r.conflict) { const f = r.conflict.files.find((x) => x.name === file); if (f) f.resolved = choice; }
      ENGINE.render();
    });
    Actions.register("click", "[data-finishmerge]", () => {
      const r = state().repo;
      if (r.conflict && r.conflict.files.every((f) => f.resolved)) window.GitCommands.finishMerge();
      ENGINE.render();
    });
  }

  return { registerActions, renderLessonWidget, renderSandboxWidget };
})();