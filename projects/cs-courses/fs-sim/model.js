/* ============================== fs-sim/model.js ==============================
   Everything about what a "filesystem" is: node shape, path arithmetic,
   permission bits, and the seed data (fs tree, processes, mounts).
   This is the piece a Git simulator or Bash quiz app would NOT reuse —
   they'd write their own model.js for a commit graph / question bank instead.
================================================================================ */
window.FsModel = (function () {
  let inodeCounter = 10000;
  const nextInode = () => inodeCounter++;
  const getInodeCounter = () => inodeCounter;
  const setInodeCounter = (v) => { inodeCounter = v; };

  function mk(name, opts) {
    opts = opts || {};
    return {
      name,
      type: opts.type || "file",
      perms: opts.perms || "rw-r--r--",
      owner: opts.owner || "khaled",
      group: opts.group || "khaled",
      size: opts.size !== undefined ? opts.size : (opts.type === "dir" ? 4096 : 512),
      mtime: opts.mtime || "Jun 28 09:14",
      inode: opts.inode || nextInode(),
      links: opts.links || 1,
      target: opts.target || null,
      children: opts.type === "dir" ? (opts.children || []) : undefined
    };
  }

  function buildInitialFS() {
    const sharedInode = nextInode();
    return mk("/", {
      type: "dir", perms: "rwxr-xr-x", owner: "root", group: "root",
      children: [
        mk("home", { type: "dir", perms: "rwxr-xr-x", owner: "root", group: "root", children: [
          mk("khaled", { type: "dir", perms: "rwxr-xr-x", owner: "khaled", group: "khaled", children: [
            mk("notes.txt", { perms: "rw-r--r--", size: 2048, inode: sharedInode, links: 2 }),
            mk("backup.txt", { perms: "rw-r--r--", size: 2048, inode: sharedInode, links: 2 }),
            mk("photo.png", { perms: "rw-r--r--", size: 184320, mtime: "Jun 30 18:02" }),
            mk("secret.key", { perms: "rw-------", size: 256, mtime: "Jun 25 07:40" }),
            mk(".bashrc", { perms: "rw-r--r--", size: 3324, mtime: "May 02 11:00" }),
            mk("latest", { type: "symlink", perms: "rwxrwxrwx", size: 9, target: "notes.txt" }),
            mk("docs", { type: "dir", perms: "rwxr-xr-x", children: [
              mk("report.docx", { perms: "rw-r--r--", size: 51200, mtime: "Jun 20 14:30" })
            ]})
          ]})
        ]}),
        mk("etc", { type: "dir", perms: "rwxr-xr-x", owner: "root", group: "root", children: [
          mk("passwd", { perms: "rw-r--r--", owner: "root", group: "root", size: 1820, mtime: "Jan 12 03:11" }),
          mk("shadow", { perms: "rw-------", owner: "root", group: "root", size: 1204, mtime: "Jan 12 03:11" })
        ]}),
        mk("usr", { type: "dir", perms: "rwxr-xr-x", owner: "root", group: "root", children: [
          mk("bin", { type: "dir", perms: "rwxr-xr-x", owner: "root", group: "root", children: [
            mk("ls", { perms: "rwxr-xr-x", owner: "root", group: "root", size: 142000, mtime: "Feb 03 00:00" }),
            mk("chmod", { perms: "rwxr-xr-x", owner: "root", group: "root", size: 68000, mtime: "Feb 03 00:00" })
          ]})
        ]}),
        mk("var", { type: "dir", perms: "rwxr-xr-x", owner: "root", group: "root", children: [
          mk("log", { type: "dir", perms: "rwxr-xr-x", owner: "root", group: "root", children: [
            mk("syslog", { perms: "rw-r-----", owner: "root", group: "adm", size: 998400, mtime: "Jul 02 06:00" })
          ]})
        ]}),
        mk("tmp", { type: "dir", perms: "rwxrwxrwx", owner: "root", group: "root", children: [
          mk("shared.log", { perms: "rw-rw-rw-", owner: "khaled", group: "khaled", size: 4096, mtime: "Jul 01 12:00" })
        ]}),
        mk("proc", { type: "dir", perms: "dr-xr-xr-x", owner: "root", group: "root", children: [
          mk("1", { type: "dir", perms: "dr-xr-xr-x", owner: "root", group: "root", children: [
            mk("cwd", { type: "symlink", perms: "rwxrwxrwx", target: "/" }),
            mk("exe", { type: "symlink", perms: "rwxrwxrwx", target: "/usr/bin/init" })
          ]})
        ]})
      ]
    });
  }

  function buildProcesses() {
    return [
      { pid: 1, name: "init", ppid: null, fds: [{ fd: 0, target: "/dev/null" }, { fd: 1, target: "/dev/null" }, { fd: 2, target: "/dev/null" }] },
      { pid: 42, name: "bash", ppid: 1, fds: [{ fd: 0, target: "/dev/tty1" }, { fd: 1, target: "/dev/tty1" }, { fd: 2, target: "/dev/tty1" }] },
      { pid: 108, name: "cat", ppid: 42, fds: [{ fd: 0, target: "/dev/tty1" }, { fd: 1, target: "/dev/tty1" }, { fd: 2, target: "/dev/tty1" }] },
      { pid: 77, name: "worker", ppid: 999, fds: [{ fd: 0, target: "/dev/null" }, { fd: 1, target: "/var/log/syslog" }, { fd: 2, target: "/dev/null" }] }
    ];
  }

  function buildMounts() {
    const GB = 1024 * 1024 * 1024;
    return [
      { id: "root", label: "System disk", device: "/dev/sda1", fstype: "ext4", total: 20 * GB, used: 8.2 * GB, virtual: false, point: "/" },
      { id: "home", label: "Home partition", device: "/dev/sda2", fstype: "ext4", total: 50 * GB, used: 12.4 * GB, virtual: false, point: "/home" },
      { id: "proc", label: "Process info", device: "proc", fstype: "proc", virtual: true, point: "/proc" },
      { id: "dev", label: "Device files", device: "udev", fstype: "devtmpfs", virtual: true, point: "/dev" },
      { id: "usb", label: "USB Drive", device: "/dev/sdb1", fstype: "ext4", total: 32 * GB, used: 2 * GB, virtual: false, point: null }
    ];
  }

  /* ------------------------------- path helpers ------------------------------ */
  const splitPath = (p) => p.split("/").filter(Boolean);
  const joinPath = (dir, name) => (dir === "/" ? `/${name}` : `${dir}/${name}`);
  const parentPath = (p) => {
    if (p === "/") return null;
    const parts = splitPath(p);
    parts.pop();
    return "/" + parts.join("/");
  };
  const baseName = (p) => (p === "/" ? "/" : splitPath(p).pop());

  function getNode(root, path) {
    if (path === "/") return root;
    let node = root;
    for (const part of splitPath(path)) {
      if (!node || !node.children) return null;
      node = node.children.find((c) => c.name === part);
      if (!node) return null;
    }
    return node;
  }

  function updateAtPath(root, path, updater) {
    if (path === "/") return updater(root);
    const parts = splitPath(path);
    const recurse = (node, idx) => {
      if (idx === parts.length) return updater(node);
      return { ...node, children: node.children.map((c) => c.name === parts[idx] ? recurse(c, idx + 1) : c) };
    };
    return recurse(root, 0);
  }

  function flatten(root, path, acc) {
    path = path || "/"; acc = acc || [];
    acc.push({ path, node: root });
    if (root.children) for (const c of root.children) flatten(c, joinPath(path, c.name), acc);
    return acc;
  }

  function resolveTarget(root, fromPath, target) {
    if (!target) return null;
    const base = target.startsWith("/") ? target : joinPath(parentPath(fromPath) || "/", target);
    return getNode(root, base) ? base : null;
  }

  function computeDirSize(node) {
    if (node.type !== "dir") return node.size;
    let total = node.size;
    (node.children || []).forEach((c) => { total += computeDirSize(c); });
    return total;
  }

  /* ------------------------------ perm helpers -------------------------------- */
  const OCT_MAP = { 0: "---", 1: "--x", 2: "-w-", 3: "-wx", 4: "r--", 5: "r-x", 6: "rw-", 7: "rwx" };
  const octalToPerm = (oct) => oct.split("").map((d) => OCT_MAP[d] || "---").join("");
  const permToOctalDigit = (chunk) => (chunk[0] === "r" ? 4 : 0) + (chunk[1] === "w" ? 2 : 0) + (chunk[2] === "x" ? 1 : 0);
  const permToOctal = (p9) => [p9.slice(0, 3), p9.slice(3, 6), p9.slice(6, 9)].map(permToOctalDigit).join("");
  const typeChar = (node) => (node.type === "dir" ? "d" : node.type === "symlink" ? "l" : "-");
  const fullPermString = (node) => typeChar(node) + node.perms;
  const fmtSize = window.Utils.fmtBytes;

  return {
    mk, nextInode, getInodeCounter, setInodeCounter,
    buildInitialFS, buildProcesses, buildMounts,
    splitPath, joinPath, parentPath, baseName,
    getNode, updateAtPath, flatten, resolveTarget, computeDirSize,
    octalToPerm, permToOctal, typeChar, fullPermString, fmtSize
  };
})();