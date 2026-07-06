/* ============================== git-sim/commands.js ==============================
   The little git interpreter. Needs a reference to the curriculum Engine
   (set via init) so it can read/write Engine.state.repo.
====================================================================================== */
window.GitCommands = (function () {
  const G = window.GitModel;
  let ENGINE = null;

  function init(engine) { ENGINE = engine; }
  function repo() { return ENGINE.state.repo; }
  function push(entry) { ENGINE.state.consoleHistory.push(entry); }

  function shortLog(c) { return `${c.hash}  ${c.message}${c.rebasedFrom ? " (rebased)" : ""}`; }

  function requireNoConflict(fail) {
    if (repo().conflict) { fail("error: you have unmerged paths — resolve the conflict in the Conflict Simulator before continuing"); return false; }
    return true;
  }

  function advanceHead(hash) {
    const r = repo();
    if (r.head.type === "branch") r.branches[r.head.name] = hash;
    else r.head = { type: "detached", hash };
  }

  function finishMerge() {
    const r = repo();
    const conflict = r.conflict;
    const lane = G.currentBranchName(r) !== null ? G.laneFor(r, G.currentBranchName(r)) : r.commits[conflict.ourHash].lane;
    const filesChanged = conflict.files.map((f) => f.name);
    const mc = G.addCommit(r, { message: `Merge branch '${conflict.theirBranch}'`, parents: [conflict.ourHash, conflict.theirHash], lane, filesChanged });
    advanceHead(mc.hash);
    r.conflict = null;
    push({ type: "out", text: `Merge made. [${mc.hash}] Merge branch '${conflict.theirBranch}'` });
  }

  function run(raw) {
    const line = raw.trim();
    if (!line) return;
    push({ type: "cmd", text: `$ ${line}` });
    const fail = (msg) => push({ type: "err", text: msg });
    const out = (msg) => push({ type: "out", text: msg });

    let tokens = line.split(/\s+/);
    if (tokens[0] === "git") tokens = tokens.slice(1);
    const [cmd, ...args] = tokens;
    const r = repo();

    if (cmd === "help" || !cmd) {
      out("Commands: status  log [--oneline]  branch [name] [-d name]  checkout [-b] <name|hash>\n" +
          "          add <file|.>  commit -m \"message\"  merge <branch>  rebase <branch>\n" +
          "          cherry-pick <hash>  reset [--soft|--mixed|--hard] <ref>  stash  stash pop\n" +
          "          edit <file>   (simulates changing a file so it shows up as modified)");
    } else if (cmd === "edit") {
      if (!requireNoConflict(fail)) return;
      if (!args[0]) return fail("edit: usage: edit <file>");
      if (!G.WORKSPACE_FILES.includes(args[0])) return fail(`edit: no such file: ${args[0]}`);
      r.workspace[args[0]] = "modified";
      out(`modified: ${args[0]}`);
    } else if (cmd === "status") {
      const branch = G.currentBranchName(r);
      out(branch ? `On branch ${branch}` : `HEAD detached at ${G.headHash(r)}`);
      if (r.conflict) out("You have unmerged paths — resolve conflicts in the Conflict Simulator, then commit.");
      const staged = Object.entries(r.workspace).filter(([, v]) => v === "staged").map(([f]) => f);
      const modified = Object.entries(r.workspace).filter(([, v]) => v === "modified").map(([f]) => f);
      out(staged.length ? `Staged: ${staged.join(", ")}` : "Staged: (none)");
      out(modified.length ? `Modified (not staged): ${modified.join(", ")}` : "Modified: (none)");
      if (!staged.length && !modified.length) out("nothing to commit, working tree clean");
    } else if (cmd === "log") {
      const oneline = args.includes("--oneline");
      const commits = G.logFrom(r, G.headHash(r));
      if (!commits.length) return out("(no commits yet)");
      out(commits.map((c) => oneline ? shortLog(c) : `commit ${c.hash}\nAuthor: ${c.author}\nDate:   ${c.date}\n\n    ${c.message}\n`).join("\n"));
    } else if (cmd === "branch") {
      if (args[0] === "-d" || args[0] === "-D") {
        const name = args[1];
        if (!name || !r.branches[name]) return fail(`branch: '${name}' not found`);
        if (G.currentBranchName(r) === name) return fail(`error: cannot delete the branch '${name}' you are currently on`);
        delete r.branches[name];
        out(`Deleted branch ${name}`);
      } else if (!args[0]) {
        const cur = G.currentBranchName(r);
        out(Object.keys(r.branches).map((b) => (b === cur ? "* " : "  ") + b).join("\n"));
      } else {
        const name = args[0];
        if (r.branches[name]) return fail(`fatal: a branch named '${name}' already exists`);
        r.branches[name] = G.headHash(r);
        G.laneFor(r, name);
        out(`Created branch ${name} at ${G.headHash(r)}`);
      }
    } else if (cmd === "checkout") {
      if (!requireNoConflict(fail)) return;
      const makeNew = args[0] === "-b";
      const name = makeNew ? args[1] : args[0];
      if (!name) return fail("checkout: usage: checkout [-b] <name|hash>");
      if (makeNew) {
        if (r.branches[name]) return fail(`fatal: a branch named '${name}' already exists`);
        r.branches[name] = G.headHash(r);
        G.laneFor(r, name);
        r.head = { type: "branch", name };
        out(`Switched to a new branch '${name}'`);
      } else if (r.branches[name]) {
        r.head = { type: "branch", name };
        out(`Switched to branch '${name}'`);
      } else {
        const found = G.findByPrefix(r, name);
        if (found === "ambiguous") return fail(`fatal: short hash '${name}' is ambiguous`);
        if (!found) return fail(`error: pathspec '${name}' did not match any branch or commit`);
        r.head = { type: "detached", hash: found.hash };
        out(`Note: checking out '${found.hash}'.\nYou are in 'detached HEAD' state.`);
      }
    } else if (cmd === "add") {
      if (!requireNoConflict(fail)) return;
      if (!args[0]) return fail("add: usage: add <file|.>");
      const targets = args[0] === "." ? G.WORKSPACE_FILES.filter((f) => r.workspace[f] === "modified") : args;
      let staged = 0;
      targets.forEach((f) => {
        if (!G.WORKSPACE_FILES.includes(f)) { fail(`fatal: pathspec '${f}' did not match any files`); return; }
        if (r.workspace[f] === "modified") { r.workspace[f] = "staged"; staged++; }
      });
      if (staged) out(`staged ${staged} file${staged === 1 ? "" : "s"}`);
    } else if (cmd === "commit") {
      if (r.conflict) {
        const unresolved = r.conflict.files.filter((f) => !f.resolved);
        if (unresolved.length) return fail(`error: fix conflicts first (unresolved: ${unresolved.map((f) => f.name).join(", ")})`);
        finishMerge();
        return;
      }
      const mIdx = args.indexOf("-m");
      const message = mIdx >= 0 ? args.slice(mIdx + 1).join(" ").replace(/^["']|["']$/g, "") : null;
      if (!message) return fail('commit: usage: commit -m "message"');
      const staged = Object.entries(r.workspace).filter(([, v]) => v === "staged").map(([f]) => f);
      if (!staged.length) return fail("nothing to commit (use \"add\" to stage files)");
      const lane = G.currentBranchName(r) !== null ? G.laneFor(r, G.currentBranchName(r)) : r.commits[G.headHash(r)].lane;
      const c = G.addCommit(r, { message, parents: [G.headHash(r)], lane, filesChanged: staged });
      staged.forEach((f) => { r.workspace[f] = "clean"; });
      advanceHead(c.hash);
      out(`[${G.currentBranchName(r) || "detached HEAD"} ${c.hash}] ${message}`);
    } else if (cmd === "merge") {
      if (!requireNoConflict(fail)) return;
      if (!args[0]) return fail("merge: usage: merge <branch>");
      const theirBranch = args[0];
      const theirHash = r.branches[theirBranch];
      if (!theirHash) return fail(`merge: branch '${theirBranch}' not found`);
      const ourHash = G.headHash(r);
      if (ourHash === theirHash) return out("Already up to date.");
      const base = G.commonAncestor(r, ourHash, theirHash);
      if (base === ourHash) { advanceHead(theirHash); out(`Fast-forward merge: now at ${theirHash}`); return; }
      if (base === theirHash) return out(`Already up to date (${theirBranch} is behind).`);
      const oursOnly = G.commitsSince(r, base, ourHash);
      const theirsOnly = G.commitsSince(r, base, theirHash);
      const oursFiles = G.filesTouchedBy(oursOnly);
      const theirsFiles = G.filesTouchedBy(theirsOnly);
      const overlap = [...oursFiles].filter((f) => theirsFiles.has(f));
      if (overlap.length) {
        r.conflict = { ourHash, theirHash, theirBranch, files: overlap.map((name) => ({ name, resolved: null })) };
        ENGINE.state.hadConflict = true;
        out(`Auto-merging ${overlap.join(", ")}\nCONFLICT (content): Merge conflict in ${overlap.join(", ")}\nFix conflicts in the Conflict Simulator, then run 'commit' to finish.`);
        return;
      }
      const union = new Set([...oursFiles, ...theirsFiles]);
      const lane = G.currentBranchName(r) !== null ? G.laneFor(r, G.currentBranchName(r)) : r.commits[ourHash].lane;
      const mc = G.addCommit(r, { message: `Merge branch '${theirBranch}'`, parents: [ourHash, theirHash], lane, filesChanged: [...union] });
      advanceHead(mc.hash);
      out(`Merge made automatically. [${mc.hash}] Merge branch '${theirBranch}'`);
    } else if (cmd === "rebase") {
      if (!requireNoConflict(fail)) return;
      if (!args[0]) return fail("rebase: usage: rebase <branch>");
      const branch = G.currentBranchName(r);
      if (!branch) return fail("rebase: not currently on a branch (checkout a branch first)");
      const ontoBranch = args[0];
      const ontoHash = r.branches[ontoBranch];
      if (!ontoHash) return fail(`rebase: branch '${ontoBranch}' not found`);
      const ourHash = G.headHash(r);
      const base = G.commonAncestor(r, ourHash, ontoHash);
      if (base === ontoHash) return out(`Current branch ${branch} is already based on ${ontoBranch}.`);
      const toReplay = G.commitsSince(r, base, ourHash);
      let parent = ontoHash;
      const lane = G.laneFor(r, branch);
      toReplay.forEach((old) => {
        const nc = G.addCommit(r, { message: old.message, parents: [parent], lane, filesChanged: old.filesChanged.slice(), rebasedFrom: old.hash });
        parent = nc.hash;
      });
      r.branches[branch] = parent;
      out(`Successfully rebased ${toReplay.length} commit${toReplay.length === 1 ? "" : "s"} onto ${ontoBranch}.`);
    } else if (cmd === "cherry-pick") {
      if (!requireNoConflict(fail)) return;
      if (!args[0]) return fail("cherry-pick: usage: cherry-pick <hash>");
      const found = G.findByPrefix(r, args[0]);
      if (found === "ambiguous") return fail(`fatal: short hash '${args[0]}' is ambiguous`);
      if (!found) return fail(`fatal: bad revision '${args[0]}'`);
      const lane = G.currentBranchName(r) !== null ? G.laneFor(r, G.currentBranchName(r)) : r.commits[G.headHash(r)].lane;
      const nc = G.addCommit(r, { message: found.message, parents: [G.headHash(r)], lane, filesChanged: found.filesChanged.slice(), rebasedFrom: found.hash });
      advanceHead(nc.hash);
      out(`[${G.currentBranchName(r) || "detached HEAD"} ${nc.hash}] ${found.message} (cherry picked from ${found.hash})`);
    } else if (cmd === "reset") {
      if (!requireNoConflict(fail)) return;
      let mode = "mixed";
      let rest = args;
      if (args[0] === "--soft" || args[0] === "--mixed" || args[0] === "--hard") { mode = args[0].slice(2); rest = args.slice(1); }
      const target = rest[0] || "HEAD";
      const hash = G.resolveRef(r, target);
      if (hash === "ambiguous") return fail(`fatal: short hash '${target}' is ambiguous`);
      if (!hash) return fail(`fatal: ambiguous argument '${target}': unknown revision`);
      const oldHash = G.headHash(r);
      const undone = G.commitsSince(r, hash, oldHash);
      const affectedFiles = G.filesTouchedBy(undone);
      advanceHead(hash);
      if (mode === "hard") {
        Object.keys(r.workspace).forEach((f) => { r.workspace[f] = "clean"; });
      } else if (mode === "soft") {
        affectedFiles.forEach((f) => { r.workspace[f] = "staged"; });
      } else {
        affectedFiles.forEach((f) => { r.workspace[f] = "modified"; });
      }
      out(`${mode} reset to ${hash}`);
    } else if (cmd === "stash") {
      if (!requireNoConflict(fail)) return;
      if (args[0] === "pop") {
        if (!r.stash.length) return fail("No stash entries found.");
        const entry = r.stash.shift();
        entry.staged.forEach((f) => { r.workspace[f] = "staged"; });
        entry.modified.forEach((f) => { r.workspace[f] = "modified"; });
        out(`Dropped stash@{0}: ${entry.label}`);
      } else if (args[0] === "list") {
        out(r.stash.length ? r.stash.map((s, i) => `stash@{${i}}: ${s.label}`).join("\n") : "(no stashes)");
      } else {
        const staged = Object.entries(r.workspace).filter(([, v]) => v === "staged").map(([f]) => f);
        const modified = Object.entries(r.workspace).filter(([, v]) => v === "modified").map(([f]) => f);
        if (!staged.length && !modified.length) return out("No local changes to save");
        r.stash.unshift({ id: Date.now(), staged, modified, label: `WIP on ${G.currentBranchName(r) || "detached HEAD"}` });
        [...staged, ...modified].forEach((f) => { r.workspace[f] = "clean"; });
        ENGINE.state.everStashed = true;
        out("Saved working directory and index state WIP");
      }
    } else if (cmd === "clear") {
      ENGINE.state.consoleHistory = [];
    } else {
      fail(`git: '${cmd}' is not a recognized command. Type 'help' to see what's supported.`);
    }
  }

  return { init, run, finishMerge };
})();