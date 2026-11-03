/* ============================== fs-sim/terminal.js ==============================
   The little shell interpreter. Needs a reference to the curriculum Engine
   (set via init) so it can read/write Engine.state.fs / Engine.state.cwd.

   Behaves like bash + GNU coreutils for everything it supports: "." / ".."
   / "~" in paths, symlinks followed where the real tools follow them,
   permission checks against the simulated user, and the same error wording
   — so nothing learned here has to be unlearned on a real machine.
==================================================================================== */
window.FsTerminal = (function () {
  const M = window.FsModel;
  const USER = "khaled", GROUPS = ["khaled"], HOME = "/home/khaled";
  const MAX_HISTORY = 400;
  let ENGINE = null;

  function init(engine) { ENGINE = engine; }

  function resolveTermPath(arg) {
    const state = ENGINE.state;
    if (!arg) return state.cwd;
    if (arg === "~" || arg.startsWith("~/")) arg = HOME + arg.slice(1);
    return M.normalizePath(arg.startsWith("/") ? arg : M.joinPath(state.cwd, arg));
  }

  // Splits a command line into words, honouring '...' and "..." quoting and
  // backslash escapes, so `touch "my file.txt"` makes one file, not two.
  function tokenize(line) {
    const out = [];
    let cur = "", inWord = false, quote = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) {
        if (ch === quote) quote = null;
        else if (ch === "\\" && quote === '"' && i + 1 < line.length) cur += line[++i];
        else cur += ch;
      } else if (ch === "'" || ch === '"') { quote = ch; inWord = true; }
      else if (ch === "\\" && i + 1 < line.length) { cur += line[++i]; inWord = true; }
      else if ("|&;<>".indexOf(ch) !== -1) return "OPERATOR";
      else if (/\s/.test(ch)) { if (inWord) { out.push(cur); cur = ""; inWord = false; } }
      else { cur += ch; inWord = true; }
    }
    if (quote) return null;
    if (inWord) out.push(cur);
    return out;
  }

  // Splits "-la" style clusters into a flag set; "--" ends option parsing.
  function parseArgs(args) {
    const flags = new Set(), operands = [];
    let doneFlags = false;
    args.forEach((a) => {
      if (!doneFlags && a === "--") { doneFlags = true; return; }
      if (!doneFlags && a.length > 1 && a[0] === "-") a.slice(1).split("").forEach((f) => flags.add(f));
      else operands.push(a);
    });
    return { flags, operands };
  }

  // Classic Unix check: exactly one of the owner / group / other triplets
  // applies (owner wins outright, even if it grants less than "other").
  function can(node, bit) {
    const idx = { r: 0, w: 1, x: 2 }[bit];
    const off = node.owner === USER ? 0 : GROUPS.indexOf(node.group) !== -1 ? 3 : 6;
    return node.perms[off + idx] === bit;
  }

  function termPush(entry) {
    const h = ENGINE.state.termHistory;
    h.push(entry);
    if (h.length > MAX_HISTORY) h.splice(0, h.length - MAX_HISTORY);
  }

  const ERRTEXT = { ENOENT: "No such file or directory", ENOTDIR: "Not a directory", ELOOP: "Too many levels of symbolic links" };

  function runCommand(raw) {
    const state = ENGINE.state;
    const line = String(raw || "").trim();
    if (!line) return;
    termPush({ type: "cmd", text: `${USER}@sim:${state.cwd}$ ${line}`, raw: line });
    const fail = (msg) => termPush({ type: "err", text: msg });
    const out = (msg) => termPush({ type: "out", text: msg });
    const tokens = tokenize(line);
    if (!tokens) return fail("bash: unexpected EOF while looking for matching quote");
    if (tokens === "OPERATOR") return fail("this simulator runs one command at a time — pipes (|), redirection (> <) and chaining (&& ;) aren't supported here");
    if (!tokens.length) return;
    const [cmd, ...args] = tokens;

    const lookup = (arg, followLast) => M.resolvePath(state.fs, resolveTermPath(arg), followLast);
    const parentDirOf = (path) => M.getNode(state.fs, M.parentPath(path) || "/");
    // Creating or removing a directory entry needs write+search on the parent.
    const writableParent = (path) => { const d = parentDirOf(path); return d && can(d, "w") && can(d, "x"); };
    // Removing a hard link drops the link count on every remaining name.
    const dropLinks = (fs, removed) => {
      const files = M.flatten(removed).filter((f) => f.node.type === "file");
      files.forEach((f) => { fs = M.updateByInode(fs, f.node.inode, (n) => ({ ...n, links: Math.max(1, n.links - 1) })); });
      return fs;
    };
    const removeEntry = (fs, path) => M.updateAtPath(fs, M.parentPath(path), (p) => ({ ...p, children: p.children.filter((c) => c.name !== M.baseName(path)) }));
    const addEntry = (fs, dirPath, node) => M.updateAtPath(fs, dirPath, (p) => ({ ...p, children: [...p.children.filter((c) => c.name !== node.name), node] }));
    // Deep copy with fresh inodes (cp makes brand-new files, never links).
    const cloneTree = (node, name) => ({ ...node, name, inode: M.nextInode(), links: 1, mtime: M.nowStamp(), children: node.children ? node.children.map((c) => cloneTree(c, c.name)) : undefined });

    if (cmd === "help") {
      out("Commands: ls [-la] [path...]  cd [path|-]  pwd  cat <file...>  echo <text>  whoami\n" +
          "          mkdir [-p] <dir...>  touch <file...>  rm [-rf] <path...>  mv <src...> <dst>\n" +
          "          cp [-r] <src...> <dst>  chmod <mode> <path...>  ln [-s] <target> <name>\n" +
          "          clear   (quote names with spaces: touch \"my file\")");
    } else if (cmd === "clear") {
      state.termHistory = [];
    } else if (cmd === "pwd") {
      out(state.cwd);
    } else if (cmd === "whoami") {
      out(USER);
    } else if (cmd === "echo") {
      out(args.join(" "));
    } else if (cmd === "cd") {
      if (args.length > 1) return fail("bash: cd: too many arguments");
      let arg = args[0];
      if (arg === "-") {
        if (!state.oldCwd) return fail("bash: cd: OLDPWD not set");
        arg = state.oldCwd;
      }
      const r = lookup(arg || HOME, true);
      const shown = arg || "~";
      if (!r.node) return fail(`bash: cd: ${shown}: ${ERRTEXT[r.error] || ERRTEXT.ENOENT}`);
      if (r.node.type !== "dir") return fail(`bash: cd: ${shown}: Not a directory`);
      if (!can(r.node, "x")) return fail(`bash: cd: ${shown}: Permission denied`);
      state.oldCwd = state.cwd;
      state.cwd = r.path;
      if (args[0] === "-") out(r.path);
    } else if (cmd === "ls") {
      const { flags, operands } = parseArgs(args);
      const bad = [...flags].find((f) => "laA1".indexOf(f) === -1);
      if (bad) return fail(`ls: invalid option -- '${bad}'\n(this simulator supports -l, -a, -A)`);
      const long = flags.has("l"), all = flags.has("a"), almostAll = flags.has("A");
      const fmt = (c, name) => long
        ? `${M.fullPermString(c)} ${String(c.links).padStart(2)} ${c.owner.padEnd(6)} ${c.group.padEnd(6)} ${M.fmtSize(c.size).padStart(6)} ${c.mtime} ${name}${c.type === "symlink" ? " -> " + c.target : ""}`
        : name;
      const targets = operands.length ? operands : ["."];
      targets.forEach((t, ti) => {
        // Like GNU ls: a symlink named on the command line is followed for a
        // plain listing, but shown as the link itself with -l.
        let r = lookup(t, false);
        if (r.node && r.node.type === "symlink" && !long) { const f = lookup(t, true); if (f.node) r = f; }
        if (!r.node) return fail(`ls: cannot access '${t}': ${ERRTEXT[r.error] || ERRTEXT.ENOENT}`);
        if (r.node.type !== "dir") return out(fmt(r.node, t));
        if (!can(r.node, "r")) return fail(`ls: cannot open directory '${t}': Permission denied`);
        let entries = r.node.children.slice().sort((a, b) => a.name.localeCompare(b.name));
        if (!all && !almostAll) entries = entries.filter((c) => !c.name.startsWith("."));
        const rows = entries.map((c) => fmt(c, c.name));
        if (all) rows.unshift(fmt(r.node, "."), fmt(parentDirOf(r.path === "/" ? "/x" : r.path) || r.node, ".."));
        const header = targets.length > 1 ? `${ti ? "\n" : ""}${t}:\n` : "";
        const body = long ? rows.join("\n") : rows.join("  ");
        if (header || body) out(header + body);
      });
    } else if (cmd === "cat") {
      if (!args.length) return fail("cat: missing file operand (this simulator has no stdin)");
      args.forEach((a) => {
        const r = lookup(a, true);
        if (!r.node) return fail(`cat: ${a}: ${ERRTEXT[r.error] || ERRTEXT.ENOENT}`);
        if (r.node.type === "dir") return fail(`cat: ${a}: Is a directory`);
        if (!can(r.node, "r")) return fail(`cat: ${a}: Permission denied`);
        if (r.node.size === 0) return;
        out(`[simulated content of ${r.node.name} — ${M.fmtSize(r.node.size)}]`);
      });
    } else if (cmd === "mv" || cmd === "cp") {
      const { flags, operands } = parseArgs(args);
      const recursive = flags.has("r") || flags.has("R") || flags.has("a");
      if (operands.length < 2) return fail(operands.length ? `${cmd}: missing destination file operand after '${operands[0]}'` : `${cmd}: missing file operand`);
      const dstArg = operands[operands.length - 1];
      const sources = operands.slice(0, -1);
      const dst = lookup(dstArg, true);
      const dstIsDir = !!(dst.node && dst.node.type === "dir");
      if (sources.length > 1 && !dstIsDir) return fail(`${cmd}: target '${dstArg}' is not a directory`);
      sources.forEach((srcArg) => {
        // mv moves a symlink itself; cp copies what it points to.
        const src = lookup(srcArg, cmd === "cp");
        if (!src.node) return fail(`${cmd}: cannot stat '${srcArg}': ${ERRTEXT[src.error] || ERRTEXT.ENOENT}`);
        if (src.path === "/") return fail(`${cmd}: cannot ${cmd === "mv" ? "move" : "copy"} '/': Device or resource busy`);
        const destDir = dstIsDir ? dst.path : M.parentPath(dst.path || "/");
        const destName = dstIsDir ? src.node.name : M.baseName(dst.path || "/");
        if (!dst.path && !dstIsDir) return fail(`${cmd}: cannot create '${dstArg}': ${ERRTEXT[dst.error] || ERRTEXT.ENOENT}`);
        const destPath = M.joinPath(destDir, destName);
        const destDirNode = M.getNode(state.fs, destDir);
        if (!destDirNode || destDirNode.type !== "dir") return fail(`${cmd}: cannot ${cmd === "mv" ? "move" : "create regular file"} '${dstArg}': No such file or directory`);
        if (destPath === src.path) return fail(`${cmd}: '${srcArg}' and '${dstArg}' are the same file`);
        if (src.node.type === "dir" && (destPath + "/").startsWith(src.path + "/")) return fail(`${cmd}: cannot ${cmd === "mv" ? "move" : "copy"} '${srcArg}' to a subdirectory of itself, '${destPath}'`);
        if (cmd === "cp" && src.node.type === "dir" && !recursive) return fail(`cp: -r not specified; omitting directory '${srcArg}'`);
        if (cmd === "cp" && !can(src.node, "r")) return fail(`cp: cannot open '${srcArg}' for reading: Permission denied`);
        if (cmd === "mv" && !writableParent(src.path)) return fail(`mv: cannot move '${srcArg}': Permission denied`);
        if (!can(destDirNode, "w") || !can(destDirNode, "x")) return fail(`${cmd}: cannot create '${destPath}': Permission denied`);
        const existing = M.getNode(state.fs, destPath);
        if (existing && existing.type === "dir" && src.node.type !== "dir") return fail(`${cmd}: cannot overwrite directory '${destPath}' with non-directory`);
        if (existing && existing.type !== "dir" && src.node.type === "dir") return fail(`${cmd}: cannot overwrite non-directory '${destPath}' with directory '${srcArg}'`);
        if (existing && existing.type === "dir" && existing.children.length) return fail(`${cmd}: cannot move '${srcArg}' to '${destPath}': Directory not empty`);
        let fs = state.fs;
        if (existing) fs = dropLinks(removeEntry(fs, destPath), existing);
        if (cmd === "mv") {
          fs = removeEntry(fs, src.path);
          fs = addEntry(fs, destDir, { ...src.node, name: destName });
        } else {
          fs = addEntry(fs, destDir, cloneTree(src.node, destName));
        }
        state.fs = fs;
        if (cmd === "mv" && (state.cwd + "/").startsWith(src.path + "/")) state.cwd = M.normalizePath(destPath + state.cwd.slice(src.path.length));
      });
    } else if (cmd === "chmod") {
      if (args.length < 2) return fail(args.length ? `chmod: missing operand after '${args[0]}'` : "chmod: missing operand");
      const mode = args[0];
      const targets = args.slice(1);
      const applyMode = (perms) => {
        if (/^[0-7]{3,4}$/.test(mode)) return M.octalToPerm(mode.slice(-3));
        // Symbolic modes: [ugoa]*[+-=][rwx]*, comma-separated (u+x, go-w, a=r).
        const arr = perms.split("");
        for (const clause of mode.split(",")) {
          const m = clause.match(/^([ugoa]*)([+\-=])([rwx]*)$/);
          if (!m) return null;
          const who = m[1] && m[1] !== "a" ? m[1] : "ugo";
          ["u", "g", "o"].forEach((w, wi) => {
            if (who.indexOf(w) === -1) return;
            ["r", "w", "x"].forEach((b, bi) => {
              const i = wi * 3 + bi;
              if (m[2] === "=") arr[i] = m[3].indexOf(b) !== -1 ? b : "-";
              else if (m[3].indexOf(b) !== -1) arr[i] = m[2] === "+" ? b : "-";
            });
          });
        }
        return arr.join("");
      };
      if (applyMode("---------") === null) return fail(`chmod: invalid mode: '${mode}'`);
      targets.forEach((t) => {
        const r = lookup(t, true); // chmod follows symlinks to the real file
        if (!r.node) return fail(`chmod: cannot access '${t}': ${ERRTEXT[r.error] || ERRTEXT.ENOENT}`);
        if (r.node.owner !== USER) return fail(`chmod: changing permissions of '${t}': Operation not permitted`);
        const newPerm = applyMode(r.node.perms);
        // Mode lives on the inode, so every hard link to it changes too.
        state.fs = r.node.type === "dir"
          ? M.updateAtPath(state.fs, r.path, (n) => ({ ...n, perms: newPerm }))
          : M.updateByInode(state.fs, r.node.inode, (n) => ({ ...n, perms: newPerm }));
      });
    } else if (cmd === "ln") {
      const { flags, operands } = parseArgs(args);
      const symbolic = flags.has("s");
      if (operands.length < 2) return fail(operands.length ? "ln: missing destination (this simulator needs: ln [-s] <target> <name>)" : "ln: missing file operand");
      const [tgt, nameArg] = operands;
      let dest = lookup(nameArg, true);
      if (dest.node && dest.node.type === "dir") dest = { path: M.joinPath(dest.path, M.baseName(M.normalizePath("/" + tgt))), node: null };
      else dest = lookup(nameArg, false);
      if (!dest.path) return fail(`ln: failed to create link '${nameArg}': ${ERRTEXT[dest.error] || ERRTEXT.ENOENT}`);
      if (M.getNode(state.fs, dest.path)) return fail(`ln: failed to create ${symbolic ? "symbolic" : "hard"} link '${nameArg}': File exists`);
      if (!writableParent(dest.path)) return fail(`ln: failed to create ${symbolic ? "symbolic" : "hard"} link '${nameArg}': Permission denied`);
      const destName = M.baseName(dest.path);
      const destDir = M.parentPath(dest.path);
      if (symbolic) {
        // A symlink stores the target string verbatim — it isn't checked, so
        // dangling links are perfectly legal (exactly like the real ln -s).
        const linkNode = M.mk(destName, { type: "symlink", perms: "rwxrwxrwx", size: tgt.length, target: tgt, mtime: M.nowStamp() });
        state.fs = addEntry(state.fs, destDir, linkNode);
      } else {
        const t = lookup(tgt, false);
        if (!t.node) return fail(`ln: failed to access '${tgt}': ${ERRTEXT[t.error] || ERRTEXT.ENOENT}`);
        if (t.node.type === "dir") return fail(`ln: ${tgt}: hard link not allowed for directory`);
        let fs = M.updateByInode(state.fs, t.node.inode, (n) => ({ ...n, links: n.links + 1 }));
        fs = addEntry(fs, destDir, { ...t.node, name: destName, links: t.node.links + 1 });
        state.fs = fs;
      }
    } else if (cmd === "mkdir") {
      const { flags, operands } = parseArgs(args);
      if (!operands.length) return fail("mkdir: missing operand");
      const parents = flags.has("p");
      operands.forEach((a) => {
        const full = resolveTermPath(a);
        const chain = parents ? M.splitPath(full).map((_, i, arr) => "/" + arr.slice(0, i + 1).join("/")) : [full];
        for (const p of chain) {
          const r = M.resolvePath(state.fs, p, true);
          if (r.node) {
            if (parents && r.node.type === "dir") continue;
            return fail(`mkdir: cannot create directory '${a}': File exists`);
          }
          if (!r.path) return fail(`mkdir: cannot create directory '${a}': ${ERRTEXT[r.error] || ERRTEXT.ENOENT}`);
          if (!writableParent(r.path)) return fail(`mkdir: cannot create directory '${a}': Permission denied`);
          state.fs = addEntry(state.fs, M.parentPath(r.path), M.mk(M.baseName(r.path), { type: "dir", perms: "rwxr-xr-x", owner: USER, group: GROUPS[0], children: [], mtime: M.nowStamp() }));
        }
      });
    } else if (cmd === "touch") {
      if (!args.length) return fail("touch: missing file operand");
      args.forEach((a) => {
        const r = lookup(a, true);
        if (r.node) {
          // An existing file just gets its timestamp bumped.
          if (r.node.owner !== USER && !can(r.node, "w")) return fail(`touch: cannot touch '${a}': Permission denied`);
          state.fs = M.updateAtPath(state.fs, r.path, (n) => ({ ...n, mtime: M.nowStamp() }));
          return;
        }
        if (!r.path) return fail(`touch: cannot touch '${a}': ${ERRTEXT[r.error] || ERRTEXT.ENOENT}`);
        if (!writableParent(r.path)) return fail(`touch: cannot touch '${a}': Permission denied`);
        state.fs = addEntry(state.fs, M.parentPath(r.path), M.mk(M.baseName(r.path), { perms: "rw-r--r--", owner: USER, group: GROUPS[0], size: 0, mtime: M.nowStamp() }));
      });
    } else if (cmd === "rm" || cmd === "rmdir") {
      const { flags, operands } = parseArgs(args);
      const recursive = cmd === "rm" && (flags.has("r") || flags.has("R"));
      const force = flags.has("f");
      if (!operands.length) return force ? undefined : fail(`${cmd}: missing operand`);
      operands.forEach((a) => {
        const r = lookup(a, false); // rm removes a symlink itself, never its target
        if (!r.node) return force && cmd === "rm" ? undefined : fail(`${cmd}: ${cmd === "rm" ? "cannot remove" : "failed to remove"} '${a}': ${ERRTEXT[r.error] || ERRTEXT.ENOENT}`);
        if (r.path === "/") return fail(`${cmd}: it is dangerous to operate recursively on '/'`);
        if (cmd === "rmdir" && r.node.type !== "dir") return fail(`rmdir: failed to remove '${a}': Not a directory`);
        if (cmd === "rmdir" && r.node.children.length) return fail(`rmdir: failed to remove '${a}': Directory not empty`);
        if (cmd === "rm" && r.node.type === "dir" && !recursive) return fail(`rm: cannot remove '${a}': Is a directory`);
        if (!writableParent(r.path)) return fail(`${cmd}: cannot remove '${a}': Permission denied`);
        state.fs = dropLinks(removeEntry(state.fs, r.path), r.node);
        if ((state.cwd + "/").startsWith(r.path + "/")) state.cwd = M.parentPath(r.path) || "/";
      });
    } else {
      fail(`${cmd}: command not found`);
    }
  }

  return { init, runCommand, resolveTermPath, tokenize };
})();
