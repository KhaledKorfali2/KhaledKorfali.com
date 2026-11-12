/* ============================== git-sim/commands.js ==============================
   The little git interpreter. Needs a reference to the curriculum Engine
   (set via init) so it can read/write Engine.state.repo.
====================================================================================== */
window.GitCommands = (function () {
  const G = window.GitModel;
  const MAX_HISTORY = 400;
  let ENGINE = null;

  function init(engine) { ENGINE = engine; }
  function repo() { return ENGINE.state.repo; }
  function push(entry) {
    const h = ENGINE.state.consoleHistory;
    h.push(entry);
    if (h.length > MAX_HISTORY) h.splice(0, h.length - MAX_HISTORY);
  }

  function shortLog(c) { return `${c.hash}  ${c.message}${c.rebasedFrom ? " (rebased)" : ""}`; }

  // Quote-aware word splitting so `commit -m "fix the thing"` keeps the
  // message together (and an apostrophe inside double quotes survives).
  function tokenize(line) {
    const out = [];
    let cur = "", inWord = false, quote = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) { if (ch === quote) quote = null; else cur += ch; }
      else if (ch === "'" || ch === '"') { quote = ch; inWord = true; }
      else if (/\s/.test(ch)) { if (inWord) { out.push(cur); cur = ""; inWord = false; } }
      else { cur += ch; inWord = true; }
    }
    if (quote) return null;
    if (inWord) out.push(cur);
    return out;
  }

  // A subset of git check-ref-format: enough to stop names that would break
  // ref parsing (spaces, "..", ~ ^ :, leading "-", "HEAD") from being created.
  function validBranchName(name) {
    return typeof name === "string" && /^[A-Za-z0-9._\/-]+$/.test(name) && name[0] !== "-" && name.indexOf("..") === -1 &&
      !name.endsWith("/") && !name.endsWith(".lock") && !name.endsWith(".") && name !== "HEAD";
  }

  function requireNoConflict(fail) {
    if (repo().conflict) { fail("error: you have unmerged paths — resolve the conflict in the Conflict Simulator (or 'merge --abort') before continuing"); return false; }
    return true;
  }

  function advanceHead(hash) {
    const r = repo();
    if (r.head.type === "branch") r.branches[r.head.name] = hash;
    else r.head = { type: "detached", hash };
  }

  function currentLane(r) {
    const branch = G.currentBranchName(r);
    if (branch !== null) return G.laneFor(r, branch);
    const c = r.commits[G.headHash(r)];
    return c ? c.lane : 0;
  }

  function finishMerge() {
    const r = repo();
    const conflict = r.conflict;
    if (!conflict) return;
    const filesChanged = conflict.files.map((f) => f.name);
    const mc = G.addCommit(r, { message: `Merge branch '${conflict.theirBranch}'`, parents: [conflict.ourHash, conflict.theirHash], lane: currentLane(r), filesChanged });
    advanceHead(mc.hash);
    r.conflict = null;
    // Only a conflicted merge that was actually completed counts for the
    // capstone — 'merge --abort' and 'reset --hard' never reach this point.
    ENGINE.state.conflictResolved = true;
    push({ type: "out", text: `Merge made. [${mc.hash}] Merge branch '${conflict.theirBranch}'` });
  }

  const filesIn = (r, status) => Object.entries(r.workspace).filter(([, v]) => v === status).map(([f]) => f);

  function run(raw) {
    const line = String(raw || "").trim();
    if (!line) return;
    push({ type: "cmd", text: `$ ${line}`, raw: line });
    const fail = (msg) => push({ type: "err", text: msg });
    const out = (msg) => push({ type: "out", text: msg });

    let tokens = tokenize(line);
    if (!tokens) return fail("error: unterminated quote");
    if (tokens[0] === "git") tokens = tokens.slice(1);
    const [cmd, ...args] = tokens;
    const r = repo();

    if (cmd === "help" || !cmd) {
      out("Commands: status  log [--oneline]  branch [-d|-D] [name [start]]  checkout [-b] <name|hash> [start]\n" +
          "          switch [-c] <branch>  add <file...|.>  commit [-a] -m \"message\"\n" +
          "          merge <branch> | merge --abort  rebase <branch>  cherry-pick <ref>\n" +
          "          reset [--soft|--mixed|--hard] [ref]  reset <file>  restore --staged <file>\n" +
          "          stash [push|list|pop|apply|drop]  clear\n" +
          "          edit <file>   (simulates changing a file so it shows up as modified)\n" +
          "Refs: branch names, short hashes, HEAD, HEAD~2, main^");
    } else if (cmd === "clear") {
      ENGINE.state.consoleHistory = [];
    } else if (cmd === "edit") {
      if (!requireNoConflict(fail)) return;
      if (!args[0]) return fail("edit: usage: edit <file>");
      args.forEach((f) => {
        if (!G.WORKSPACE_FILES.includes(f)) return fail(`edit: no such file: ${f} (try: ${G.WORKSPACE_FILES.join(", ")})`);
        r.workspace[f] = "modified";
        out(`modified: ${f}`);
      });
    } else if (cmd === "status") {
      const branch = G.currentBranchName(r);
      out(branch ? `On branch ${branch}` : `HEAD detached at ${G.headHash(r)}`);
      if (r.conflict) out("You have unmerged paths.\n  (fix conflicts in the Conflict Simulator and run \"git commit\")\n  (use \"git merge --abort\" to abort the merge)");
      const staged = filesIn(r, "staged");
      const modified = filesIn(r, "modified");
      if (staged.length) out(`Changes to be committed:\n${staged.map((f) => `        modified:   ${f}`).join("\n")}`);
      if (modified.length) out(`Changes not staged for commit:\n${modified.map((f) => `        modified:   ${f}`).join("\n")}`);
      if (!staged.length && !modified.length) out("nothing to commit, working tree clean");
    } else if (cmd === "log") {
      const oneline = args.includes("--oneline");
      const refArg = args.find((a) => a[0] !== "-");
      const start = refArg ? G.resolveRef(r, refArg) : G.headHash(r);
      if (start === "ambiguous") return fail(`fatal: ambiguous argument '${refArg}'`);
      if (!start) return fail(`fatal: ambiguous argument '${refArg}': unknown revision or path not in the working tree.`);
      const commits = G.logFrom(r, start);
      if (!commits.length) return out("(no commits yet)");
      const decorate = (c) => {
        const names = Object.keys(r.branches).filter((b) => r.branches[b] === c.hash);
        const isHead = G.headHash(r) === c.hash;
        const parts = names.map((b) => (isHead && G.currentBranchName(r) === b ? `HEAD -> ${b}` : b));
        if (isHead && !G.currentBranchName(r)) parts.unshift("HEAD");
        return parts.length ? ` (${parts.join(", ")})` : "";
      };
      out(commits.map((c) => oneline ? `${c.hash}${decorate(c)} ${c.message}${c.rebasedFrom ? " (rebased)" : ""}` : `commit ${c.hash}${decorate(c)}\n${c.parents.length > 1 ? `Merge: ${c.parents.join(" ")}\n` : ""}Author: ${c.author}\nDate:   ${c.date}\n\n    ${c.message}\n`).join("\n"));
    } else if (cmd === "branch") {
      if (args[0] === "-d" || args[0] === "-D") {
        const name = args[1];
        if (!name || !G.hasBranch(r, name)) return fail(`error: branch '${name || ""}' not found`);
        if (G.currentBranchName(r) === name) return fail(`error: cannot delete branch '${name}' used by worktree (you're on it — checkout another branch first)`);
        // -d refuses to throw away commits that aren't merged anywhere you are; -D forces it.
        if (args[0] === "-d" && !G.isAncestor(r, r.branches[name], G.headHash(r))) {
          return fail(`error: the branch '${name}' is not fully merged.\nIf you are sure you want to delete it, run 'git branch -D ${name}'.`);
        }
        const tip = r.branches[name];
        delete r.branches[name];
        out(`Deleted branch ${name} (was ${tip}).`);
      } else if (!args[0] || args[0] === "--list" || args[0] === "-a") {
        const cur = G.currentBranchName(r);
        const lines = Object.keys(r.branches).sort().map((b) => (b === cur ? "* " : "  ") + b);
        if (!cur) lines.unshift(`* (HEAD detached at ${G.headHash(r)})`);
        out(lines.join("\n"));
      } else {
        const name = args[0];
        if (!validBranchName(name)) return fail(`fatal: '${name}' is not a valid branch name`);
        if (G.hasBranch(r, name)) return fail(`fatal: a branch named '${name}' already exists`);
        const start = args[1] ? G.resolveRef(r, args[1]) : G.headHash(r);
        if (!start || start === "ambiguous") return fail(`fatal: not a valid object name: '${args[1]}'`);
        r.branches[name] = start;
        G.laneFor(r, name);
        out(`Created branch ${name} at ${start} (still on ${G.currentBranchName(r) || "detached HEAD"} — use 'checkout ${name}' to switch)`);
      }
    } else if (cmd === "checkout" || cmd === "switch") {
      if (!requireNoConflict(fail)) return;
      if (cmd === "checkout" && args[0] === "--") return fail("checkout -- <file> (discarding edits) isn't simulated — try 'reset --hard' to discard everything");
      const makeNew = (cmd === "checkout" && args[0] === "-b") || (cmd === "switch" && (args[0] === "-c" || args[0] === "-C"));
      const name = makeNew ? args[1] : args[0];
      if (!name) return fail(`${cmd}: usage: ${cmd === "switch" ? "switch [-c] <branch>" : "checkout [-b] <name|hash> [start]"}`);
      if (makeNew) {
        if (!validBranchName(name)) return fail(`fatal: '${name}' is not a valid branch name`);
        if (G.hasBranch(r, name)) return fail(`fatal: a branch named '${name}' already exists`);
        const start = args[2] ? G.resolveRef(r, args[2]) : G.headHash(r);
        if (!start || start === "ambiguous") return fail(`fatal: '${args[2]}' is not a commit and a branch '${name}' cannot be created from it`);
        r.branches[name] = start;
        G.laneFor(r, name);
        r.head = { type: "branch", name };
        out(`Switched to a new branch '${name}'`);
      } else if (G.hasBranch(r, name)) {
        if (G.currentBranchName(r) === name) return out(`Already on '${name}'`);
        r.head = { type: "branch", name };
        out(`Switched to branch '${name}'`);
      } else {
        if (cmd === "switch") return fail(`fatal: invalid reference: ${name}\n(switch only takes branch names — use 'switch --detach <commit>' or 'checkout <hash>' for a commit)`);
        const hash = G.resolveRef(r, name);
        if (hash === "ambiguous") return fail(`error: short object ID ${name} is ambiguous`);
        if (!hash) return fail(`error: pathspec '${name}' did not match any file(s) known to git`);
        r.head = { type: "detached", hash };
        out(`Note: switching to '${name}'.\n\nYou are in 'detached HEAD' state. You can look around and make commits,\nbut they won't belong to any branch unless you create one with 'checkout -b <name>'.\n\nHEAD is now at ${hash} ${r.commits[hash].message}`);
      }
    } else if (cmd === "add") {
      if (!requireNoConflict(fail)) return;
      if (!args[0]) return fail("Nothing specified, nothing added.\n(maybe you wanted to say 'git add .'?)");
      const all = args.includes(".") || args.includes("-A") || args.includes("--all");
      const targets = all ? G.WORKSPACE_FILES.filter((f) => r.workspace[f] === "modified") : args;
      for (const f of targets) {
        if (!G.WORKSPACE_FILES.includes(f)) return fail(`fatal: pathspec '${f}' did not match any files`);
      }
      targets.forEach((f) => { if (r.workspace[f] === "modified") r.workspace[f] = "staged"; });
      // Real git add is silent on success; nudge toward status instead.
    } else if (cmd === "restore") {
      if (!requireNoConflict(fail)) return;
      const staged = args.includes("--staged");
      const files = args.filter((a) => a[0] !== "-");
      if (!staged || !files.length) return fail("restore: this simulator supports 'restore --staged <file>' (unstage)");
      for (const f of files) if (!G.WORKSPACE_FILES.includes(f)) return fail(`error: pathspec '${f}' did not match any file(s) known to git`);
      files.forEach((f) => { if (r.workspace[f] === "staged") r.workspace[f] = "modified"; });
    } else if (cmd === "commit") {
      if (r.conflict) {
        const unresolved = r.conflict.files.filter((f) => !f.resolved);
        if (unresolved.length) return fail(`error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the Conflict Simulator first (unresolved: ${unresolved.map((f) => f.name).join(", ")})`);
        finishMerge();
        return;
      }
      // Accept -m "msg", -m msg words..., -am "msg", and -a -m "msg".
      let message = null, stageAll = false;
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "-a" || a === "--all") stageAll = true;
        else if (a === "-m" || a === "-am" || a === "-ma") {
          if (a !== "-m") stageAll = true;
          message = args.slice(i + 1).join(" ");
          break;
        } else if (a.indexOf("-m") === 0 && a.length > 2) { message = a.slice(2) + (args.length > i + 1 ? " " + args.slice(i + 1).join(" ") : ""); break; }
      }
      if (message === null) return fail('error: this simulator has no text editor — pass a message: commit -m "message"');
      if (!message.trim()) return fail("Aborting commit due to empty commit message.");
      if (stageAll) filesIn(r, "modified").forEach((f) => { r.workspace[f] = "staged"; });
      const staged = filesIn(r, "staged");
      if (!staged.length) return fail(filesIn(r, "modified").length ? "no changes added to commit (use \"git add\" and/or \"git commit -a\")" : "nothing to commit, working tree clean");
      const c = G.addCommit(r, { message, parents: [G.headHash(r)], lane: currentLane(r), filesChanged: staged });
      staged.forEach((f) => { r.workspace[f] = "clean"; });
      advanceHead(c.hash);
      out(`[${G.currentBranchName(r) || "detached HEAD"} ${c.hash}] ${message}\n ${staged.length} file${staged.length === 1 ? "" : "s"} changed`);
    } else if (cmd === "merge") {
      if (args[0] === "--abort") {
        if (!r.conflict) return fail("fatal: There is no merge to abort (MERGE_HEAD missing).");
        r.conflict = null;
        return out("Merge aborted — back to the state before you ran merge.");
      }
      if (!requireNoConflict(fail)) return;
      if (!args[0]) return fail("merge: usage: merge <branch>");
      const theirBranch = args[0];
      const theirHash = G.resolveRef(r, theirBranch);
      if (theirHash === "ambiguous") return fail(`error: short object ID ${theirBranch} is ambiguous`);
      if (!theirHash) return fail(`merge: ${theirBranch} - not something we can merge`);
      const ourHash = G.headHash(r);
      if (ourHash === theirHash) return out("Already up to date.");
      const base = G.commonAncestor(r, ourHash, theirHash);
      if (base === theirHash) return out("Already up to date.");
      if (base === ourHash) { advanceHead(theirHash); out(`Updating ${ourHash}..${theirHash}\nFast-forward`); return; }
      const oursOnly = G.commitsSince(r, base, ourHash);
      const theirsOnly = G.commitsSince(r, base, theirHash);
      const oursFiles = G.filesTouchedBy(oursOnly);
      const theirsFiles = G.filesTouchedBy(theirsOnly);
      const overlap = [...oursFiles].filter((f) => theirsFiles.has(f));
      if (overlap.length) {
        r.conflict = { ourHash, theirHash, theirBranch, files: overlap.map((name) => ({ name, resolved: null })) };
        ENGINE.state.hadConflict = true;
        out(`${overlap.map((f) => `Auto-merging ${f}\nCONFLICT (content): Merge conflict in ${f}`).join("\n")}\nAutomatic merge failed; fix conflicts in the Conflict Simulator and then run 'commit' (or 'merge --abort').`);
        return;
      }
      const union = new Set([...oursFiles, ...theirsFiles]);
      const mc = G.addCommit(r, { message: `Merge branch '${theirBranch}'`, parents: [ourHash, theirHash], lane: currentLane(r), filesChanged: [...union] });
      advanceHead(mc.hash);
      out(`Merge made by the 'ort' strategy. [${mc.hash}] Merge branch '${theirBranch}'`);
    } else if (cmd === "rebase") {
      if (!requireNoConflict(fail)) return;
      if (!args[0]) return fail("rebase: usage: rebase <branch>");
      const branch = G.currentBranchName(r);
      if (!branch) return fail("rebase: not currently on a branch (checkout a branch first)");
      const ontoBranch = args[0];
      const ontoHash = G.resolveRef(r, ontoBranch);
      if (!ontoHash || ontoHash === "ambiguous") return fail(`fatal: invalid upstream '${ontoBranch}'`);
      const ourHash = G.headHash(r);
      const base = G.commonAncestor(r, ourHash, ontoHash);
      if (base === ontoHash) return out(`Current branch ${branch} is up to date.`);
      if (base === ourHash) { r.branches[branch] = ontoHash; return out(`Successfully rebased and updated refs/heads/${branch}.\n(${branch} had no commits of its own, so it simply fast-forwarded to ${ontoBranch})`); }
      // Like git's default rebase, merge commits are dropped: only the
      // ordinary commits are replayed, producing a linear history.
      const toReplay = G.commitsSince(r, base, ourHash).filter((c) => c.parents.length < 2);
      let parent = ontoHash;
      const lane = G.laneFor(r, branch);
      toReplay.forEach((old) => {
        const nc = G.addCommit(r, { message: old.message, parents: [parent], lane, filesChanged: old.filesChanged.slice(), rebasedFrom: old.hash });
        parent = nc.hash;
      });
      r.branches[branch] = parent;
      out(`Successfully rebased ${toReplay.length} commit${toReplay.length === 1 ? "" : "s"} onto ${ontoBranch} (new hashes — the originals are left behind, unreferenced).`);
    } else if (cmd === "cherry-pick") {
      if (!requireNoConflict(fail)) return;
      if (!args[0]) return fail("cherry-pick: usage: cherry-pick <commit>");
      const hash = G.resolveRef(r, args[0]);
      if (hash === "ambiguous") return fail(`error: short object ID ${args[0]} is ambiguous`);
      if (!hash) return fail(`fatal: bad revision '${args[0]}'`);
      const found = r.commits[hash];
      if (found.parents.length > 1) return fail(`error: commit ${found.hash} is a merge but no -m option was given.`);
      if (G.isAncestor(r, found.hash, G.headHash(r))) return fail(`The previous cherry-pick is now empty — ${found.hash} is already part of HEAD's history.`);
      const nc = G.addCommit(r, { message: found.message, parents: [G.headHash(r)], lane: currentLane(r), filesChanged: found.filesChanged.slice(), rebasedFrom: found.hash });
      advanceHead(nc.hash);
      out(`[${G.currentBranchName(r) || "detached HEAD"} ${nc.hash}] ${found.message}\n(cherry picked from commit ${found.hash})`);
    } else if (cmd === "reset") {
      let mode = "mixed";
      let rest = args;
      if (args[0] === "--soft" || args[0] === "--mixed" || args[0] === "--hard") { mode = args[0].slice(2); rest = args.slice(1); }
      // `git reset <file>` (no mode) unstages that file and leaves HEAD alone.
      if (mode === "mixed" && rest.length && rest.every((a) => G.WORKSPACE_FILES.includes(a) || a === "--")) {
        if (!requireNoConflict(fail)) return;
        rest.filter((a) => a !== "--").forEach((f) => { if (r.workspace[f] === "staged") r.workspace[f] = "modified"; });
        return out("Unstaged changes after reset:\n" + filesIn(r, "modified").map((f) => `M\t${f}`).join("\n"));
      }
      // Only --hard is allowed mid-conflict: it's the classic escape hatch.
      if (mode !== "hard" && !requireNoConflict(fail)) return;
      const target = rest[0] || "HEAD";
      const hash = G.resolveRef(r, target);
      if (hash === "ambiguous") return fail(`fatal: ambiguous argument '${target}'`);
      if (!hash) return fail(`fatal: ambiguous argument '${target}': unknown revision or path not in the working tree.`);
      const oldHash = G.headHash(r);
      const affectedFiles = G.filesTouchedBy(G.commitsSince(r, hash, oldHash));
      advanceHead(hash);
      r.conflict = null;
      if (mode === "hard") {
        Object.keys(r.workspace).forEach((f) => { r.workspace[f] = "clean"; });
        out(`HEAD is now at ${hash} ${r.commits[hash].message}`);
      } else if (mode === "soft") {
        // --soft: branch moves, index and working tree are untouched — so the
        // undone commits' changes now show up as staged.
        affectedFiles.forEach((f) => { r.workspace[f] = "staged"; });
        out(`(soft) HEAD is now at ${hash} — changes from the undone commit(s) are staged`);
      } else {
        // --mixed (default): the index is reset too, so EVERYTHING staged —
        // not just the undone commits' files — drops back to "modified".
        Object.keys(r.workspace).forEach((f) => { if (r.workspace[f] === "staged") r.workspace[f] = "modified"; });
        affectedFiles.forEach((f) => { r.workspace[f] = "modified"; });
        const mods = filesIn(r, "modified");
        out(mods.length ? "Unstaged changes after reset:\n" + mods.map((f) => `M\t${f}`).join("\n") : `HEAD is now at ${hash}`);
      }
    } else if (cmd === "stash") {
      if (!requireNoConflict(fail)) return;
      const sub = args[0] || "push";
      if (sub === "pop" || sub === "apply") {
        if (!r.stash.length) return fail("No stash entries found.");
        const entry = r.stash[0];
        entry.staged.forEach((f) => { r.workspace[f] = "staged"; });
        entry.modified.forEach((f) => { r.workspace[f] = "modified"; });
        if (sub === "pop") { r.stash.shift(); ENGINE.state.everPopped = true; out(`Dropped refs/stash@{0} (${entry.label})`); }
        else out(`Applied stash@{0}: ${entry.label} (still kept in the stash list)`);
      } else if (sub === "drop") {
        if (!r.stash.length) return fail("No stash entries found.");
        const entry = r.stash.shift();
        out(`Dropped refs/stash@{0} (${entry.label})`);
      } else if (sub === "list") {
        out(r.stash.length ? r.stash.map((s, i) => `stash@{${i}}: ${s.label}`).join("\n") : "(no stashes)");
      } else if (sub === "push" || sub === "save" || sub === "-m") {
        const staged = filesIn(r, "staged");
        const modified = filesIn(r, "modified");
        if (!staged.length && !modified.length) return out("No local changes to save");
        const head = r.commits[G.headHash(r)];
        r.stash.unshift({ id: Date.now(), staged, modified, label: `WIP on ${G.currentBranchName(r) || "(no branch)"}: ${head ? `${head.hash} ${head.message}` : ""}` });
        [...staged, ...modified].forEach((f) => { r.workspace[f] = "clean"; });
        ENGINE.state.everStashed = true;
        out(`Saved working directory and index state ${r.stash[0].label}`);
      } else {
        fail(`error: unknown subcommand: '${sub}' (try: stash, stash list, stash pop, stash apply, stash drop)`);
      }
    } else {
      fail(`git: '${cmd}' is not a git command (in this simulator). Type 'help' to see what's supported.`);
    }
  }

  return { init, run, finishMerge, tokenize };
})();
