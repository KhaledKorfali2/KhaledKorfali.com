/* ============================== fs-sim/terminal.js ==============================
   The little shell interpreter. Needs a reference to the curriculum Engine
   (set via init) so it can read/write Engine.state.fs / Engine.state.cwd.
==================================================================================== */
window.FsTerminal = (function () {
  const M = window.FsModel;
  let ENGINE = null;

  function init(engine) { ENGINE = engine; }

  function resolveTermPath(arg) {
    const state = ENGINE.state;
    if (!arg) return state.cwd;
    if (arg === "~") return "/home/khaled";
    if (arg.startsWith("/")) return arg.replace(/\/+$/, "") || "/";
    if (arg === "..") return M.parentPath(state.cwd) || "/";
    if (arg === ".") return state.cwd;
    return M.joinPath(state.cwd, arg).replace(/\/+$/, "");
  }

  function termPush(entry) { ENGINE.state.termHistory.push(entry); }

  function runCommand(raw) {
    const state = ENGINE.state;
    const line = raw.trim();
    if (!line) return;
    termPush({ type: "cmd", text: `khaled@sim:${state.cwd}$ ${line}` });
    const [cmd, ...args] = line.split(/\s+/);
    const fail = (msg) => termPush({ type: "err", text: msg });

    if (cmd === "help") {
      termPush({ type: "out", text:
        "Commands: ls [-l] [path]  cd <path>  pwd  cat <file>  mv <src> <dst>  cp <src> <dst>\n" +
        "          chmod <octal> <path>  ln -s <target> <name>  ln <target> <name>\n" +
        "          mkdir <name>  touch <name>  rm <name>  clear" });
    } else if (cmd === "clear") {
      state.termHistory = [];
    } else if (cmd === "pwd") {
      termPush({ type: "out", text: state.cwd });
    } else if (cmd === "cd") {
      const target = args[0] ? resolveTermPath(args[0]) : "/home/khaled";
      const node = M.getNode(state.fs, target);
      if (!node) fail(`cd: no such file or directory: ${args[0]}`);
      else if (node.type !== "dir") fail(`cd: not a directory: ${args[0]}`);
      else state.cwd = target;
    } else if (cmd === "ls") {
      const longFlag = args.includes("-l");
      const pathArg = args.find((a) => a !== "-l");
      const target = resolveTermPath(pathArg);
      const node = M.getNode(state.fs, target);
      if (!node) { fail(`ls: cannot access '${pathArg}': No such file or directory`); }
      else {
        const items = node.type === "dir" ? node.children : [node];
        if (longFlag) {
          termPush({ type: "out", text: items.map((c) =>
            `${M.fullPermString(c)}  ${String(c.links).padStart(2)} ${c.owner.padEnd(7)} ${c.group.padEnd(7)} ${M.fmtSize(c.size).padStart(6)}  ${c.mtime}  ${c.name}${c.type === "symlink" ? " -> " + c.target : ""}`
          ).join("\n") });
        } else {
          termPush({ type: "out", text: items.map((c) => c.name).join("  ") || "(empty)" });
        }
      }
    } else if (cmd === "cat") {
      const target = resolveTermPath(args[0]);
      const node = M.getNode(state.fs, target);
      if (!node) fail(`cat: ${args[0]}: No such file or directory`);
      else if (node.type === "dir") fail(`cat: ${args[0]}: Is a directory`);
      else termPush({ type: "out", text: `[simulated content of ${node.name} — ${M.fmtSize(node.size)}]` });
    } else if (cmd === "mv" || cmd === "cp") {
      if (args.length < 2) { fail(`${cmd}: missing file operand`); }
      else {
        const srcPath = resolveTermPath(args[0]);
        const srcNode = M.getNode(state.fs, srcPath);
        if (!srcNode) { fail(`${cmd}: cannot stat '${args[0]}': No such file or directory`); }
        else {
          const dstArg = resolveTermPath(args[1]);
          const dstNode = M.getNode(state.fs, dstArg);
          const destDir = dstNode && dstNode.type === "dir" ? dstArg : M.parentPath(dstArg);
          const destName = dstNode && dstNode.type === "dir" ? srcNode.name : M.baseName(dstArg);
          if (!M.getNode(state.fs, destDir)) { fail(`${cmd}: target directory does not exist`); }
          else {
            let newFs = state.fs;
            if (cmd === "mv") newFs = M.updateAtPath(newFs, M.parentPath(srcPath), (p) => ({ ...p, children: p.children.filter((c) => c.name !== srcNode.name) }));
            const placed = { ...srcNode, name: destName, inode: cmd === "cp" ? M.nextInode() : srcNode.inode };
            newFs = M.updateAtPath(newFs, destDir, (p) => ({ ...p, children: [...p.children.filter((c) => c.name !== destName), placed] }));
            state.fs = newFs;
            termPush({ type: "out", text: `${cmd === "mv" ? "moved" : "copied"} '${srcNode.name}' -> '${M.joinPath(destDir, destName)}'` });
          }
        }
      }
    } else if (cmd === "chmod") {
      if (args.length < 2 || !/^[0-7]{3}$/.test(args[0])) { fail("chmod: usage: chmod <octal e.g. 755> <path>"); }
      else {
        const target = resolveTermPath(args[1]);
        const node = M.getNode(state.fs, target);
        if (!node) { fail(`chmod: cannot access '${args[1]}': No such file or directory`); }
        else {
          const newPerm = M.octalToPerm(args[0]);
          state.fs = M.updateAtPath(state.fs, target, (n) => ({ ...n, perms: newPerm }));
          termPush({ type: "out", text: `mode of '${node.name}' changed to ${args[0]} (${newPerm})` });
        }
      }
    } else if (cmd === "ln") {
      const symbolic = args[0] === "-s";
      const rest = symbolic ? args.slice(1) : args;
      if (rest.length < 2) { fail("ln: usage: ln [-s] <target> <name>"); }
      else {
        const [tgt, name] = rest;
        const destPath = M.joinPath(state.cwd, name);
        if (M.getNode(state.fs, destPath)) { fail(`ln: failed to create '${name}': File exists`); }
        else if (symbolic) {
          const linkNode = M.mk(name, { type: "symlink", perms: "rwxrwxrwx", size: tgt.length, target: tgt });
          state.fs = M.updateAtPath(state.fs, state.cwd, (p) => ({ ...p, children: [...p.children, linkNode] }));
          termPush({ type: "out", text: `symlink '${name}' -> '${tgt}' created` });
        } else {
          const targetPath = resolveTermPath(tgt);
          const targetNode = M.getNode(state.fs, targetPath);
          if (!targetNode) { fail(`ln: failed to access '${tgt}': No such file or directory`); }
          else if (targetNode.type === "dir") { fail(`ln: '${tgt}': hard link not allowed for directory`); }
          else {
            let nf = M.updateAtPath(state.fs, targetPath, (n) => ({ ...n, links: n.links + 1 }));
            const linkNode = { ...targetNode, name, links: targetNode.links + 1 };
            nf = M.updateAtPath(nf, state.cwd, (p) => ({ ...p, children: [...p.children, linkNode] }));
            state.fs = nf;
            termPush({ type: "out", text: `hard link '${name}' -> inode ${targetNode.inode} created` });
          }
        }
      }
    } else if (cmd === "mkdir") {
      if (!args[0]) { fail("mkdir: missing operand"); }
      else {
        const node = M.mk(args[0], { type: "dir", perms: "rwxr-xr-x", children: [] });
        state.fs = M.updateAtPath(state.fs, state.cwd, (p) => ({ ...p, children: [...p.children, node] }));
        termPush({ type: "out", text: `directory '${args[0]}' created` });
      }
    } else if (cmd === "touch") {
      if (!args[0]) { fail("touch: missing operand"); }
      else {
        const node = M.mk(args[0], { perms: "rw-r--r--", size: 0 });
        state.fs = M.updateAtPath(state.fs, state.cwd, (p) => ({ ...p, children: [...p.children, node] }));
        termPush({ type: "out", text: `'${args[0]}' created` });
      }
    } else if (cmd === "rm") {
      if (!args[0]) { fail("rm: missing operand"); }
      else {
        state.fs = M.updateAtPath(state.fs, state.cwd, (p) => ({ ...p, children: p.children.filter((c) => c.name !== args[0]) }));
        termPush({ type: "out", text: `removed '${args[0]}'` });
      }
    } else {
      fail(`command not found: ${cmd}`);
    }
  }

  return { init, runCommand, resolveTermPath };
})();