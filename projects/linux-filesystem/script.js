/* ============================== Icons ============================== */
function icon(name, size) {
  size = size || 14;
  const common = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;
  const paths = {
    folder: `<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"/>`,
    folderOpen: `<path d="M3 8V6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2"/><path d="M3 8h17l-2.2 9.2a2 2 0 0 1-2 1.8H6.2a2 2 0 0 1-2-1.6L3 8z"/>`,
    fileText: `<path d="M6 2h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M14 2v5h5"/><path d="M8.5 13h7M8.5 16.5h7"/>`,
    fileSymlink: `<path d="M6 2h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M14 2v5h5"/><path d="M9 16l3-3-3-3"/><path d="M9 13h4"/>`,
    chevronRight: `<path d="M9 6l6 6-6 6"/>`,
    chevronLeft: `<path d="M15 6l-6 6 6 6"/>`,
    chevronDown: `<path d="M6 9l6 6 6-6"/>`,
    terminal: `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3"/><path d="M12 15h5"/>`,
    home: `<path d="M4 11l8-7 8 7"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9"/>`,
    lock: `<rect x="4.5" y="10.5" width="15" height="9.5" rx="1.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>`,
    link2: `<path d="M9 15L15 9"/><path d="M8 5H6a4 4 0 0 0 0 8h2"/><path d="M16 19h2a4 4 0 0 0 0-8h-2"/>`,
    database: `<ellipse cx="12" cy="5.5" rx="7.5" ry="3"/><path d="M4.5 5.5V18c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V5.5"/><path d="M4.5 11.75c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3"/>`,
    trophy: `<path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 5H4a2 2 0 0 0 0 4l3 1"/><path d="M17 5h3a2 2 0 0 1 0 4l-3 1"/><path d="M12 14v3"/><path d="M9 21h6"/><path d="M10 17h4v4h-4z"/>`,
    hardDrive: `<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M2.5 14.5h19"/><circle cx="7" cy="16.2" r="0.8" fill="currentColor" stroke="none"/>`,
    compass: `<circle cx="12" cy="12" r="9.5"/><path d="M15 9l-2 6-6 2 2-6z"/>`,
    check: `<path d="M4 12l5 5L20 6"/>`,
    x: `<path d="M5 5l14 14M19 5L5 19"/>`,
    alertTriangle: `<path d="M12 3.5L2 20h20L12 3.5z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none"/>`,
    cpu: `<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>`,
    server: `<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><circle cx="7" cy="7" r="0.8" fill="currentColor" stroke="none"/><circle cx="7" cy="17" r="0.8" fill="currentColor" stroke="none"/>`,
    barChart2: `<path d="M6 20V10M12 20V4M18 20v-7"/>`
  };
  return `<svg ${common}>${paths[name] || ""}</svg>`;
}

/* ============================ FS data model ============================ */
let inodeCounter = 10000;
const nextInode = () => inodeCounter++;

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

/* ------------------------------- Path helpers ------------------------------ */
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

/* ------------------------------ Perm helpers -------------------------------- */
const OCT_MAP = { 0: "---", 1: "--x", 2: "-w-", 3: "-wx", 4: "r--", 5: "r-x", 6: "rw-", 7: "rwx" };
const octalToPerm = (oct) => oct.split("").map((d) => OCT_MAP[d] || "---").join("");
const permToOctalDigit = (chunk) => (chunk[0] === "r" ? 4 : 0) + (chunk[1] === "w" ? 2 : 0) + (chunk[2] === "x" ? 1 : 0);
const permToOctal = (p9) => [p9.slice(0, 3), p9.slice(3, 6), p9.slice(6, 9)].map(permToOctalDigit).join("");
const typeChar = (node) => (node.type === "dir" ? "d" : node.type === "symlink" ? "l" : "-");
const fullPermString = (node) => typeChar(node) + node.perms;
const fmtSize = (b) => (b < 1024 ? `${Math.round(b)}B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)}K` : b < 1024 * 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}M` : `${(b / 1024 / 1024 / 1024).toFixed(1)}G`);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* =============================== Curriculum data =============================== */
const COURSE = [
  { id: "m0", title: "Orientation", checkpoint: null, lessons: [
    { id: "l1", title: "What is a shell?", view: "terminal", subsections: [
      { id: "s1", title: "Not the computer itself", kind: "concept", widget: null,
        body: "A <b>shell</b> is just a program. It reads text you type, figures out what you meant, and asks the operating system to do it. The black window people call \"the terminal\" is really two things stacked together: a <i>terminal emulator</i> (the window) running a <i>shell</i> (the program inside it, usually called bash or zsh)." },
      { id: "s2", title: "Reading a prompt", kind: "practice", widget: "terminal",
        body: "Look at the line below the terminal's history: <code>khaled@sim:/home/khaled$</code>. That's <b>user</b>@<b>host</b>:<b>current directory</b>, followed by a <code>$</code> which just means \"I'm ready for a command.\"",
        tryIt: "Type <code>help</code> and press Enter to see every command this simulator understands." },
      { id: "s3", title: "GUI vs CLI", kind: "demo", widget: "explorer",
        body: "The Explorer view and the Terminal are two windows onto the exact same filesystem. Anything you do in one shows up in the other — they're not separate copies, just two ways of looking at one thing." }
    ]},
    { id: "l2", title: "What is a filesystem?", view: "explorer", subsections: [
      { id: "s1", title: "Everything starts at /", kind: "concept", widget: null,
        body: "Unix-like systems don't have \"drive letters\" like C:\\. There's a single tree, and its root is written <code>/</code>. Every file and folder on the entire system, no matter what physical disk it's actually stored on, has an address somewhere under that one root." },
      { id: "s2", title: "Files vs. directories", kind: "concept", widget: null,
        body: "A <b>file</b> holds data. A <b>directory</b> (folder) holds a list of names, each pointing at another file or directory. That's it — a directory doesn't contain files so much as it contains <i>pointers to</i> files. That distinction matters a lot later, when we get to inodes and links." },
      { id: "s3", title: "A tour of the top level", kind: "practice", widget: "explorer",
        body: "Five folders sit right under <code>/</code> in this simulator: <code>home</code> (personal files for each user), <code>etc</code> (system configuration), <code>usr</code> (installed programs), <code>var</code> (data that changes often, like logs), and <code>proc</code> (a live window into running processes — more on that in Module 6).",
        tryIt: "Expand every top-level folder in the tree on the left at least once." }
    ]}
  ]},

  { id: "m1", title: "Finding Your Way Around", checkpoint: { questions: [
      { text: "You run cd docs then cd .. Assuming you started in /home/khaled, where are you now?", options: ["/home/khaled", "/home", "/home/khaled/docs", "/"], correct: 0 },
      { text: "Which command prints your current working directory?", options: ["ls", "pwd", "cd", "cat"], correct: 1 }
    ]}, lessons: [
    { id: "l1", title: "Where am I?", view: "terminal", subsections: [
      { id: "s1", title: "pwd — print working directory", kind: "concept", widget: null,
        body: "Every terminal session has a <b>current working directory</b> — the folder you're \"standing in.\" <code>pwd</code> just prints it. It's the single most useful command to run when you're lost." },
      { id: "s2", title: "Absolute vs. relative paths", kind: "concept", widget: null,
        body: "An <b>absolute path</b> starts with <code>/</code> and always means the same place, no matter where you're standing (<code>/home/khaled/notes.txt</code>). A <b>relative path</b> is interpreted from wherever you currently are (<code>docs</code>, <code>../notes.txt</code>). <code>.</code> means \"here\" and <code>..</code> means \"one level up.\"" },
      { id: "s3", title: "Practice: get there using only relative paths", kind: "practice", widget: "terminal",
        body: "Starting from <code>/home/khaled</code>, reach <code>/home/khaled/docs</code> without typing a path that starts with <code>/</code>.",
        tryIt: "Try <code>cd docs</code>, then check with <code>pwd</code>." }
    ]},
    { id: "l2", title: "Looking around", view: "terminal", subsections: [
      { id: "s1", title: "ls — list contents", kind: "practice", widget: "terminal",
        body: "<code>ls</code> lists whatever is in the current directory (or a directory you name).",
        tryIt: "Run <code>ls</code>, then <code>ls /etc</code>." },
      { id: "s2", title: "ls -l — the long format", kind: "concept", widget: "terminal",
        body: "Add <code>-l</code> and you get a row per item: permissions, link count, owner, group, size, modified date, name. We'll decode every column in Module 3 — for now just notice it's there.",
        tryIt: "Run <code>ls -l</code> and compare it to the plain <code>ls</code> output." },
      { id: "s3", title: "Hidden files", kind: "concept", widget: null,
        body: "Files whose name starts with a dot, like <code>.bashrc</code>, are conventionally \"hidden\" — a plain <code>ls</code> on a real system skips them and you'd need <code>ls -a</code> to see them. This simulator always shows every file to keep things simple, but the dot convention is real and you'll see it constantly." }
    ]},
    { id: "l3", title: "Moving around", view: "terminal", subsections: [
      { id: "s1", title: "cd — change directory", kind: "concept", widget: "terminal",
        body: "<code>cd &lt;path&gt;</code> moves you there. <code>cd ..</code> goes up one level. <code>cd ~</code> or bare <code>cd</code> jumps straight home.",
        tryIt: "Try <code>cd /etc</code>, then <code>cd ~</code>." },
      { id: "s2", title: "Reading errors", kind: "concept", widget: null,
        body: "\"No such file or directory\" means the path doesn't exist — usually a typo. \"Not a directory\" means the path exists but points at a file, and you can't <code>cd</code> into a file. Errors here are trying to help you, not just complaining." },
      { id: "s3", title: "Practice: three stops", kind: "practice", widget: "terminal",
        body: "Navigate to <code>/etc</code>, then to <code>/usr/bin</code>, then back to <code>/home/khaled/docs</code>, using <code>cd</code> each time.",
        tryIt: "Use <code>pwd</code> after each move to confirm you landed where you meant to." }
    ]}
  ]},

  { id: "m2", title: "Working with Files & Directories", checkpoint: { questions: [
      { text: "You run mv report.docx final.docx in the same directory. What actually happened?", options: ["The file was renamed — no data was copied", "A full copy of the file was made", "The file was deleted", "Nothing; mv only works across directories"], correct: 0 },
      { text: "What's true about rm?", options: ["It moves the file to a Trash folder", "It permanently removes the directory entry — there's no built-in undo", "It only works on empty files", "It renames the file to start with a dot"], correct: 1 }
    ]}, lessons: [
    { id: "l1", title: "Making things", view: "terminal", subsections: [
      { id: "s1", title: "touch — create an empty file", kind: "practice", widget: "terminal",
        body: "<code>touch &lt;name&gt;</code> creates an empty file (or, on a real system, just updates its timestamp if it already exists).",
        tryIt: "Run <code>touch todo.txt</code>." },
      { id: "s2", title: "mkdir — create a directory", kind: "practice", widget: "terminal",
        body: "<code>mkdir &lt;name&gt;</code> creates a new, empty directory.",
        tryIt: "Run <code>mkdir projects</code>." },
      { id: "s3", title: "Naming conventions", kind: "concept", widget: null,
        body: "Spaces in filenames aren't forbidden, but they make command-line life annoying because the shell treats a space as a separator between arguments. Most people stick to letters, numbers, dashes, underscores, and dots." }
    ]},
    { id: "l2", title: "Moving, copying, removing", view: "terminal", subsections: [
      { id: "s1", title: "mv — move (and rename)", kind: "practice", widget: "terminal",
        body: "There's no separate \"rename\" command — renaming <i>is</i> moving, just to a new name in the same directory instead of a different directory.",
        tryIt: "Run <code>mv notes.txt docs/</code>, then check the Explorer widget below." },
      { id: "s2", title: "cp — copy", kind: "concept", widget: "terminal",
        body: "<code>cp &lt;src&gt; &lt;dst&gt;</code> duplicates a file. The copy is a completely independent file from the moment it's created — more on exactly what that means in Module 4.",
        tryIt: "Run <code>cp docs/report.docx docs/report-copy.docx</code>." },
      { id: "s3", title: "rm — remove", kind: "concept", widget: "terminal",
        body: "<code>rm &lt;name&gt;</code> deletes a file immediately. There's no Trash or Recycle Bin at the command line — treat it as permanent." },
      { id: "s4", title: "Drag-and-drop does the same thing", kind: "demo", widget: "explorer",
        body: "In the Explorer, dragging a file onto a folder performs the exact same move that <code>mv</code> does in the terminal — same underlying operation, different interface." }
    ]},
    { id: "l3", title: "Reading files", view: "terminal", subsections: [
      { id: "s1", title: "cat — dump contents", kind: "practice", widget: "terminal",
        body: "<code>cat &lt;file&gt;</code> prints a file's contents straight to the terminal.",
        tryIt: "Run <code>cat notes.txt</code>." },
      { id: "s2", title: "Size vs. content", kind: "concept", widget: null,
        body: "The size shown in <code>ls -l</code> is exactly how much data <code>cat</code> would print — they're two views of the same number." }
    ]}
  ]},

  { id: "m3", title: "Permissions & Ownership", checkpoint: { questions: [
      { text: "What does rw-r--r-- mean for the owner?", options: ["Read and write, no execute", "Read only", "Execute only", "Read, write, and execute"], correct: 0 },
      { text: "Which octal mode gives the owner full access and everyone else nothing?", options: ["644", "700", "777", "400"], correct: 1 },
      { text: "A directory has its execute bit removed for others. What does that mean for them?", options: ["They can't see its name in a listing at all", "They can see it exists but can't cd into it or reach files inside", "They can't read files even if they know the exact name, but can still cd into it", "No effect on directories"], correct: 1 }
    ]}, lessons: [
    { id: "l1", title: "Who can do what", view: "permissions", subsections: [
      { id: "s1", title: "Three actors", kind: "concept", widget: null,
        body: "Every file has exactly three groups of people it distinguishes between: the <b>owner</b> (usually whoever created it), the <b>group</b> (a set of users), and <b>others</b> (everyone else)." },
      { id: "s2", title: "Three actions", kind: "concept", widget: null,
        body: "For each of those three actors, a file tracks <b>read</b>, <b>write</b>, and <b>execute</b>. For a file, execute means \"can be run as a program.\" For a <i>directory</i>, execute means something different — it means \"can be entered with cd and can have files inside it accessed,\" independent of whether you can list its contents." },
      { id: "s3", title: "Reading a permission string", kind: "practice", widget: "perm",
        body: "A string like <code>-rwxr-xr--</code> reads left to right: file type, then owner (rwx), group (r-x), others (r--). Pick a file below and see it broken apart bit by bit.",
        tryIt: "Select <code>secret.key</code> — notice group and others have nothing checked at all." }
    ]},
    { id: "l2", title: "Changing permissions", view: "permissions", subsections: [
      { id: "s1", title: "From bits to octal", kind: "concept", widget: null,
        body: "Read = 4, write = 2, execute = 1. Add up whichever apply for one actor and you get a single digit 0–7. Do that three times (owner, group, others) and you get a three-digit octal mode like <code>755</code> — full for the owner, read+execute for everyone else." },
      { id: "s2", title: "chmod in the terminal", kind: "practice", widget: "terminal",
        body: "<code>chmod &lt;octal&gt; &lt;path&gt;</code> sets a file's mode directly.",
        tryIt: "Run <code>chmod 600 secret.key</code>, then <code>ls -l secret.key</code> to confirm." },
      { id: "s3", title: "The Permissions Lab", kind: "practice", widget: "perm",
        body: "Toggling a checkbox below is exactly equivalent to running <code>chmod</code> with the resulting octal number — the string and the octal mode update live as you click.",
        tryIt: "Pick <code>report.docx</code> and try turning off group and other read access." }
    ]},
    { id: "l3", title: "Ownership", view: "permissions", subsections: [
      { id: "s1", title: "Owner and group in ls -l", kind: "concept", widget: null,
        body: "Two of the columns in <code>ls -l</code> — right after the permission string and link count — are the owner and group. On real systems, most files are owned by the user who created them; system files are typically owned by <code>root</code>." },
      { id: "s2", title: "A concrete example: secret.key", kind: "demo", widget: "perm",
        body: "<code>secret.key</code> has mode <code>rw-------</code>: only its owner can even read it. This is exactly how private keys, credentials, and similar sensitive files are protected in practice." },
      { id: "s3", title: "Practice: the world-writable file", kind: "practice", widget: "explorer",
        body: "Somewhere in <code>/tmp</code> there's a file anyone on the system can write to — not just its owner or group, but literally everyone. That's usually a mistake, and a real security concern.",
        tryIt: "Find <code>/tmp/shared.log</code> in the Explorer and check its permission string in the detail panel." }
    ]}
  ]},

  { id: "m4", title: "Inodes & How Storage Really Works", checkpoint: { questions: [
      { text: "You copy a file with cp. Does the copy share the original's inode number?", options: ["Yes, always", "No — it gets a new inode", "Only if it's in the same directory", "Only for directories"], correct: 1 },
      { text: "You rename a file with mv within the same filesystem. Does its inode number change?", options: ["Yes", "No — only the directory entry changes"], correct: 1 }
    ]}, lessons: [
    { id: "l1", title: "The filename is not the file", view: "inode", subsections: [
      { id: "s1", title: "A directory entry is just a pointer", kind: "concept", widget: null,
        body: "When a directory lists <code>notes.txt</code>, it isn't storing the file — it's storing a name paired with a number called an <b>inode number</b>. The real file lives at that inode." },
      { id: "s2", title: "What actually lives in an inode", kind: "concept", widget: null,
        body: "Permissions, owner, group, size, timestamps, and pointers to the actual data blocks on disk — everything except the filename itself. The name lives in the directory, not the inode." },
      { id: "s3", title: "Practice: the Inode Explorer", kind: "practice", widget: "inode",
        body: "Pick any file and look at its inode card. Notice the inode number has nothing to do with the filename.",
        tryIt: "Compare <code>notes.txt</code> and <code>backup.txt</code> — same inode number, because they're hard-linked (Module 5)." }
    ]},
    { id: "l2", title: "Data blocks", view: "inode", subsections: [
      { id: "s1", title: "Files live in fixed-size blocks", kind: "concept", widget: null,
        body: "A filesystem doesn't store a file as one continuous blob — it splits storage into fixed-size chunks called blocks (4096 bytes in this simulator) and hands a file however many blocks it needs." },
      { id: "s2", title: "Why a tiny file still costs a whole block", kind: "demo", widget: "inode",
        body: "A 256-byte file like <code>secret.key</code> still occupies one entire 4096-byte block — the leftover space in that block can't be given to another file. This is why lots of tiny files can waste more space than their total size suggests." },
      { id: "s3", title: "Practice: compare block counts", kind: "practice", widget: "inode",
        body: "Compare the block diagram for <code>photo.png</code> against <code>secret.key</code>.",
        tryIt: "Notice photo.png needs many more blocks — its diagram will look visibly denser." }
    ]},
    { id: "l3", title: "Consequence: why mv is instant but cp isn't", view: "terminal", subsections: [
      { id: "s1", title: "Moving = rewriting a name", kind: "concept", widget: null,
        body: "Moving a file within the same filesystem doesn't touch its data at all — it just deletes one directory entry and adds another pointing at the same inode. That's why it's instant even for huge files." },
      { id: "s2", title: "Copying = new inode, new data", kind: "concept", widget: null,
        body: "Copying allocates a brand-new inode and duplicates every block. That's real work, proportional to the file's size — which is why copying a large file takes noticeably longer than moving it." },
      { id: "s3", title: "Practice: watch the inode number", kind: "practice", widget: "terminal",
        body: "Rename a file, then copy a file, and check each one's inode number in the Inode Explorer (Sandbox mode) afterward.",
        tryIt: "Run <code>mv docs/report.docx docs/final.docx</code> — same inode. Then <code>cp docs/final.docx docs/final2.docx</code> — different inode." }
    ]}
  ]},

  { id: "m5", title: "Links", checkpoint: { questions: [
      { text: "You delete the target of a symbolic link. What happens to the symlink?", options: ["It's automatically deleted too", "It becomes a broken (dangling) link", "It turns into a regular file", "Nothing changes"], correct: 1 },
      { text: "Two hard links point at the same inode. You delete one of them. What happens to the data?", options: ["It's gone immediately", "It survives, because the link count is still above zero", "It's corrupted", "Both links are deleted"], correct: 1 },
      { text: "Which type of link can safely point across two different physical disks?", options: ["A hard link", "A symbolic link", "Neither", "Both equally"], correct: 1 }
    ]}, lessons: [
    { id: "l1", title: "Symbolic links", view: "links", subsections: [
      { id: "s1", title: "A symlink is a path in disguise", kind: "concept", widget: null,
        body: "A symbolic link is a small, special file whose only content is a path string pointing somewhere else. Opening it just follows that path — it's a pointer to a location, not to data." },
      { id: "s2", title: "Creating one", kind: "practice", widget: "terminal",
        body: "<code>ln -s &lt;target&gt; &lt;name&gt;</code> creates a symlink named <code>&lt;name&gt;</code> that points at <code>&lt;target&gt;</code>.",
        tryIt: "Run <code>ln -s docs/report.docx shortcut</code>, then look at it in the Explorer." },
      { id: "s3", title: "Broken links", kind: "demo", widget: "explorer",
        body: "Because a symlink only stores a path, deleting or moving the target leaves it dangling. This simulator ships with exactly that: <code>/proc/1/exe</code> points at <code>/usr/bin/init</code>, which doesn't exist here.",
        tryIt: "Select <code>/proc/1/exe</code> in the Explorer and check the detail panel's broken-link badge." }
    ]},
    { id: "l2", title: "Hard links", view: "links", subsections: [
      { id: "s1", title: "A second name for the same inode", kind: "concept", widget: null,
        body: "A hard link isn't a pointer to a path — it's a second directory entry pointing at the exact same inode as another name. Both names are equally \"real\"; neither is the original and neither is the copy." },
      { id: "s2", title: "Creating one", kind: "practice", widget: "terminal",
        body: "<code>ln &lt;target&gt; &lt;name&gt;</code> (no <code>-s</code>) creates a hard link. Watch the link count column in <code>ls -l</code> go up by one.",
        tryIt: "Run <code>ln docs/report.docx docs/report-hardlink</code>." },
      { id: "s3", title: "Rules", kind: "concept", widget: null,
        body: "Hard links can't point at directories, and they can't cross between two different filesystems — because both of those require the link and target to share literally the same inode table, which only exists within one filesystem." }
    ]},
    { id: "l3", title: "Telling them apart", view: "links", subsections: [
      { id: "s1", title: "Side-by-side comparison", kind: "practice", widget: "links",
        body: "Build one of each below and compare the diagrams: a symlink stores a path (breakable), a hard link shares an inode (survives until every link is gone)." },
      { id: "s2", title: "What survives deletion", kind: "concept", widget: null,
        body: "Delete one hard link and the data is untouched as long as at least one other link to that inode still exists — the filesystem only frees the blocks when the link count hits zero. Delete a symlink's target, and the symlink itself is still sitting there, just pointing at nothing." },
      { id: "s3", title: "Already in your filesystem", kind: "demo", widget: "explorer",
        body: "<code>notes.txt</code> and <code>backup.txt</code> in <code>/home/khaled</code> are already hard-linked to each other — same inode number, link count of 2. Confirm it in the Explorer's detail panel." }
    ]}
  ]},

  { id: "m6", title: "Processes & File Descriptors", checkpoint: { questions: [
      { text: "By convention, which file descriptor number is standard error?", options: ["0", "1", "2", "3"], correct: 2 },
      { text: "What does it mean for a process to be \"orphaned\"?", options: ["It has no open file descriptors", "Its parent process no longer exists", "It has no PID", "It was never started"], correct: 1 }
    ]}, lessons: [
    { id: "l1", title: "What is a process?", view: "fd", subsections: [
      { id: "s1", title: "A running program, not a file", kind: "concept", widget: null,
        body: "A process is a program <i>while it's running</i> — with its own memory, its own state, and (relevant to us) its own table of open files. The file on disk that launched it is a completely separate thing." },
      { id: "s2", title: "/proc: a window into running processes", kind: "demo", widget: "explorer",
        body: "Remember <code>/proc</code> from the Module 0 tour? It's not real disk data — each numbered folder in there represents one currently-running process, generated on the fly by the kernel." },
      { id: "s3", title: "PID and parent process", kind: "practice", widget: "fd",
        body: "Every process has a PID (process ID) and, except for the very first one, a parent PID pointing at whichever process started it. Browse the process list below.",
        tryIt: "Notice pid 108 (\"cat\") has ppid 42 (\"bash\") — bash started it." }
    ]},
    { id: "l2", title: "File descriptors", view: "fd", subsections: [
      { id: "s1", title: "A small number for an open file", kind: "concept", widget: null,
        body: "Whenever a process opens a file, the operating system hands it back a small integer — a <b>file descriptor</b> — instead of a path. From then on, the process refers to that open file by number." },
      { id: "s2", title: "The standard three", kind: "concept", widget: null,
        body: "Every process starts with three descriptors already open by convention: <b>0</b> is standard input, <b>1</b> is standard output, <b>2</b> is standard error. That's true whether or not the process ever opens anything else." },
      { id: "s3", title: "Practice: open a file", kind: "practice", widget: "fd",
        body: "Select a process below, pick a file, and open it — watch a new descriptor appear in its table.",
        tryIt: "Select \"bash\" (pid 42), open <code>/home/khaled/notes.txt</code>, and see fd 3 appear." }
    ]},
    { id: "l3", title: "Descriptor lifecycle", view: "fd", subsections: [
      { id: "s1", title: "Opening", kind: "concept", widget: null,
        body: "Each open assigns the next free descriptor number for that process — descriptor numbers are per-process, not global, so two different processes can both have an fd 3 pointing at completely different files." },
      { id: "s2", title: "Duplicating and closing", kind: "practice", widget: "fd",
        body: "Duplicating a descriptor creates a new number that refers to the same open file. Closing removes a descriptor — the process can no longer use that number.",
        tryIt: "Duplicate an existing fd, then close the original — the duplicate keeps working." },
      { id: "s3", title: "Practice: predict the table", kind: "practice", widget: "fd",
        body: "Pick the \"worker\" process. Open two files, duplicate one descriptor, then close one of the originals. Before checking the table, predict how many descriptors will remain." }
    ]}
  ]},

  { id: "m7", title: "Mounts, Devices & Special Filesystems", checkpoint: { questions: [
      { text: "What is a mount point?", options: ["A directory that a filesystem is attached to", "A file that stores passwords", "A type of hard link", "A CPU scheduling algorithm"], correct: 0 },
      { text: "Which of these is a virtual filesystem, generated on the fly rather than stored on disk?", options: ["/home", "/proc", "/etc", "/var"], correct: 1 }
    ]}, lessons: [
    { id: "l1", title: "Mount points", view: "mounts", subsections: [
      { id: "s1", title: "Grafting a filesystem onto a directory", kind: "concept", widget: null,
        body: "A \"mount\" attaches a filesystem — which might live on a completely different physical disk — onto an existing directory. Once mounted, that directory acts as a portal into the other filesystem; you can't tell just by looking at a path where the actual bytes live." },
      { id: "s2", title: "Why / is special", kind: "concept", widget: null,
        body: "<code>/</code> is the <b>root filesystem</b> — the one everything else gets mounted onto. A second disk mounted at, say, <code>/home</code>, behaves identically from the outside, but it's a genuinely separate filesystem underneath (which is exactly why hard links can't cross that boundary, back in Module 5)." },
      { id: "s3", title: "Practice: mount a device", kind: "practice", widget: "mounts",
        body: "Below, an unmounted USB drive is waiting. Give it a mount point and attach it.",
        tryIt: "Mount the USB Drive at <code>/mnt/usb</code>." }
    ]},
    { id: "l2", title: "Virtual filesystems", view: "mounts", subsections: [
      { id: "s1", title: "Not stored on disk at all", kind: "concept", widget: null,
        body: "<code>/proc</code> and <code>/dev</code> look like ordinary directories but aren't backed by disk blocks — the kernel generates their contents live, on demand, when something reads them." },
      { id: "s2", title: "Processes appear and vanish", kind: "demo", widget: "fd",
        body: "This is why a folder like <code>/proc/1</code> exists only while process 1 is actually running — the moment that process ends, its folder disappears, because there was never anything on disk to begin with." },
      { id: "s3", title: "Practice: real vs. virtual", kind: "practice", widget: "mounts",
        body: "Look at the mounted list below and separate the two kinds: which entries have a real used/total size on a physical device, and which are labeled virtual?" }
    ]}
  ]},

  { id: "m8", title: "Storage at Scale", checkpoint: { questions: [
      { text: "A file is 1 byte but still uses a full 4096-byte block on disk. Why?", options: ["Disks can only allocate space in fixed-size blocks", "The filesystem made a mistake", "The file is corrupted", "This never actually happens"], correct: 0 },
      { text: "What's the difference between a file's apparent size and its size on disk?", options: ["There is no difference, ever", "Size on disk rounds up to the nearest block, so it's usually a bit larger", "Apparent size is always larger", "They only differ for directories"], correct: 1 }
    ]}, lessons: [
    { id: "l1", title: "Usage and space", view: "storage", subsections: [
      { id: "s1", title: "Where did all the space go?", kind: "practice", widget: "storage",
        body: "The heatmap below sizes each top-level directory by how much space it actually uses, recursively. Wider tiles mean more data." },
      { id: "s2", title: "Apparent size vs. size on disk", kind: "concept", widget: null,
        body: "A file's \"apparent size\" is what <code>ls -l</code> reports — the exact byte count. Its actual footprint on disk rounds up to a whole number of blocks (Module 4), so it's usually a little larger, and for lots of small files that gap adds up." },
      { id: "s3", title: "Practice: find the top consumers", kind: "practice", widget: "storage",
        body: "Check the \"largest files\" list below.",
        tryIt: "Identify the single largest file in the whole tree." }
    ]},
    { id: "l2", title: "Fragmentation & free space", view: "storage", subsections: [
      { id: "s1", title: "Scattered vs. contiguous blocks", kind: "practice", widget: "storage",
        body: "Over time, as files are created and deleted, a filesystem's free blocks can end up scattered instead of contiguous — that's fragmentation. Try the Defragment button below and watch the block grid reorganize.",
        tryIt: "Click Defragment, then Scatter blocks, and compare the two layouts." },
      { id: "s2", title: "Why it matters less on SSDs", kind: "concept", widget: null,
        body: "On a spinning hard disk, scattered blocks mean the read head has to physically jump around, which is slow. On an SSD there's no read head — any block is about as fast to reach as any other — so fragmentation is a much smaller concern than it used to be." },
      { id: "s3", title: "Practice: read the usage bar", kind: "practice", widget: "storage",
        body: "The usage bar shows used space out of this simulated disk's total capacity.",
        tryIt: "Note the percentage used, then imagine deleting the largest file — would you cross back under 50%?" }
    ]}
  ]},

  { id: "m9", title: "Capstone: Everything Together", checkpoint: null, lessons: [
    { id: "l1", title: "Investigation challenges", view: "challenges", subsections: [
      { id: "s1", title: "Five things to track down", kind: "practice", widget: "challenges",
        body: "Time to use everything you've learned, with no more hints attached to each one. Switch to Sandbox mode if you want to dig around with the Explorer, Terminal, Inode Explorer, or Process Lab before answering." }
    ]},
    { id: "l2", title: "Scenario labs", view: "terminal", subsections: [
      { id: "s1", title: "\"My script broke after I moved it\"", kind: "concept", widget: null,
        body: "A teammate moved a script with <code>mv</code> and now it fails. Since you know <code>mv</code> only rewrites a directory entry — same inode, same permissions, same content — the data itself can't be the problem. The likely culprits are things that depend on <i>location</i>: a relative path inside the script that assumed its old folder, or a permission/ownership mismatch in the new directory." },
      { id: "s2", title: "\"The symlink used to work\"", kind: "concept", widget: null,
        body: "A symlink that worked yesterday is broken today. Since a symlink only stores a path string, the two possibilities are: the target was deleted, or the target was moved (which changes its path without the symlink knowing). The fix is either restoring the target at its old location or recreating the symlink pointing at the new one." },
      { id: "s3", title: "\"The disk is full\"", kind: "concept", widget: null,
        body: "Start with the Storage view's heatmap and largest-files list rather than guessing — a handful of oversized log files (like <code>/var/log/syslog</code> in this simulator) is a far more common cause than fragmentation, which mostly affects speed, not capacity." }
    ]}
  ]}
];

/* =============================== Global state =============================== */
const STORAGE_KEY = "fs-simulator-progress-v1";

function createInitialState() {
  return {
    fs: buildInitialFS(),
    processes: buildProcesses(),
    mounts: buildMounts(),
    mode: "home",
    sandboxView: "explorer",
    currentModuleId: "m0",
    currentLessonId: "l1",
    sidebarOpen: {},
    selectedPath: "/home/khaled/notes.txt",
    cwd: "/home/khaled",
    selectedProcess: 42,
    storageDefrag: false,
    expanded: { "/": true, "/home": true, "/home/khaled": true },
    termHistory: [{ type: "sys", text: "khaled-sim v1.0 — type 'help' to list commands" }],
    permDraft: null,
    links: { target: "", dir: "/home/khaled", name: "mylink", mode: "symbolic", msg: null },
    completed: {},
    quizAnswers: {},
    quizChecked: {},
    checkpointPassed: {},
    challengeAnswers: {},
    challengeResult: {},
    terminalScrollToBottom: false,
    focusTerminal: false,
    skipScrollRestore: false
  };
}

let state = createInitialState();

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, inodeCounter }));
  } catch (e) {
    console.warn("Could not save progress:", e);
  }
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved || !saved.state) return false;
    state = { ...createInitialState(), ...saved.state };
    if (typeof saved.inodeCounter === "number") inodeCounter = saved.inodeCounter;
    return true;
  } catch (e) {
    console.warn("Could not load saved progress:", e);
    return false;
  }
}

function resetProgress() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  inodeCounter = 10000;
  state = createInitialState();
  render();
}

function findModule(id) { return COURSE.find((m) => m.id === id); }

/* ============================ Progress / unlock engine ============================ */
function isLessonComplete(mod, lesson) {
  return lesson.subsections.every((s) => state.completed[`${mod.id}:${lesson.id}:${s.id}`]);
}
function isLessonUnlocked(mod, lessonIdx) {
  if (lessonIdx === 0) return true;
  return isLessonComplete(mod, mod.lessons[lessonIdx - 1]);
}
function isModuleComplete(mod) {
  const lessonsDone = mod.lessons.every((l) => isLessonComplete(mod, l));
  if (!lessonsDone) return false;
  if (!mod.checkpoint) return true;
  return !!state.checkpointPassed[mod.id];
}
function isModuleUnlockedIdx(mi) {
  if (mi === 0) return true;
  return isModuleComplete(COURSE[mi - 1]);
}
function totalUnits() {
  let t = 0;
  COURSE.forEach((m) => { m.lessons.forEach((l) => { t += l.subsections.length; }); if (m.checkpoint) t += 1; });
  return t;
}
function completedUnitsCount() {
  let c = Object.values(state.completed).filter(Boolean).length;
  c += Object.values(state.checkpointPassed).filter(Boolean).length;
  return c;
}
function flatLessons() {
  const arr = [];
  COURSE.forEach((m) => m.lessons.forEach((l) => arr.push({ modId: m.id, lessonId: l.id })));
  return arr;
}
function prevLessonTarget(modId, lessonId) {
  const flat = flatLessons();
  const idx = flat.findIndex((x) => x.modId === modId && x.lessonId === lessonId);
  return idx > 0 ? flat[idx - 1] : null;
}
function nextLessonTarget(modId, lessonId) {
  const flat = flatLessons();
  const idx = flat.findIndex((x) => x.modId === modId && x.lessonId === lessonId);
  return idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;
}
function canGoNext(mod, lesson) {
  if (!isLessonComplete(mod, lesson)) return false;
  const isLast = mod.lessons[mod.lessons.length - 1].id === lesson.id;
  if (isLast && mod.checkpoint && !state.checkpointPassed[mod.id]) return false;
  return true;
}
function continueLearningTarget() {
  for (let mi = 0; mi < COURSE.length; mi++) {
    const mod = COURSE[mi];
    if (!isModuleUnlockedIdx(mi)) continue;
    if (isModuleComplete(mod)) continue;
    for (const l of mod.lessons) {
      if (!isLessonComplete(mod, l)) return { modId: mod.id, lessonId: l.id };
    }
    return { modId: mod.id, lessonId: mod.lessons[mod.lessons.length - 1].id };
  }
  return null;
}
function sidebarOpen(modId) {
  return state.sidebarOpen[modId] !== undefined ? state.sidebarOpen[modId] : (modId === state.currentModuleId);
}

/* =================================== Render =================================== */
function render() {
  const app = document.getElementById("app");

  // --- snapshot scroll state so a re-render never yanks the viewport around ---
  const savedWindowScroll = window.scrollY;
  const prevTree = document.querySelector(".tree-scroll");
  const savedTreeScroll = prevTree ? prevTree.scrollTop : 0;
  const prevSidebar = document.querySelector(".lesson-sidebar");
  const savedSidebarScroll = prevSidebar ? prevSidebar.scrollTop : 0;
  const prevTermHist = document.getElementById("term-history");
  const savedTermScroll = prevTermHist ? prevTermHist.scrollTop : 0;

  app.innerHTML = `
    <header class="header">
      <div class="brand mono">${icon("hardDrive", 18)}<span>fs</span><span class="accent">::</span><span class="dim">simulator</span></div>
      <div class="mode-switch">
        <button class="${state.mode === "home" ? "active" : ""}" data-setmode="home">${icon("home", 12)} home</button>
        <button class="${state.mode === "lessons" ? "active" : ""}" data-setmode="lessons">${icon("compass", 12)} lessons</button>
        <button class="${state.mode === "sandbox" ? "active" : ""}" data-setmode="sandbox">${icon("terminal", 12)} sandbox</button>
      </div>
    </header>
    <div id="view-container">${state.mode === "home" ? renderHomeView() : state.mode === "lessons" ? renderLessonsMode() : renderSandboxMode()}</div>
    <footer class="foot">educational prototype — progress saves automatically in this browser · <button class="reset-link" data-resetprogress>reset progress</button></footer>
  `;

  // --- restore scroll state on the freshly-built DOM ---
  const newTree = document.querySelector(".tree-scroll");
  if (newTree) newTree.scrollTop = savedTreeScroll;
  const newSidebar = document.querySelector(".lesson-sidebar");
  if (newSidebar) newSidebar.scrollTop = savedSidebarScroll;
  const newTermHist = document.getElementById("term-history");
  if (newTermHist) {
    if (state.terminalScrollToBottom) {
      newTermHist.scrollTop = newTermHist.scrollHeight;
      state.terminalScrollToBottom = false;
    } else {
      newTermHist.scrollTop = savedTermScroll;
    }
  }
  if (state.focusTerminal) {
    const inp = document.getElementById("term-input");
    if (inp) inp.focus();
    state.focusTerminal = false;
  }
  if (state.skipScrollRestore) {
    state.skipScrollRestore = false;
  } else {
    window.scrollTo(0, savedWindowScroll);
  }

  saveProgress();
}

/* --------------------------------- Home view --------------------------------- */
function renderProgressRing(pct) {
  const r = 27, circ = 2 * Math.PI * r, offset = circ * (1 - pct / 100);
  return `<div class="progress-ring"><svg width="64" height="64"><circle class="track" cx="32" cy="32" r="${r}"/><circle class="fill" cx="32" cy="32" r="${r}" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/></svg><div class="label mono">${pct}%</div></div>`;
}

function renderHomeView() {
  const total = totalUnits();
  const done = completedUnitsCount();
  const pct = total ? Math.round((done / total) * 100) : 0;
  const target = continueLearningTarget();
  const dirCount = flatten(state.fs).filter((f) => f.node.type === "dir").length;

  return `
    <div class="panel hero">
      <div class="hero-top">
        <div style="display:flex;align-items:center;gap:20px">
          ${renderProgressRing(pct)}
          <div>
            <div class="eyebrow">Your progress</div>
            <div class="lesson-title">${pct}% through the curriculum</div>
            <div class="lesson-pills">
              <span class="pill accent">${done}/${total} steps done</span>
              <span class="pill teal">${dirCount} dirs explored</span>
            </div>
          </div>
        </div>
      </div>
      <div class="hero-actions">
        <button class="btn accent" data-continuelearn>${target ? "Continue Learning" : "Review Curriculum"}</button>
        <button class="btn" data-sandboxview="explorer">Open Sandbox</button>
      </div>
    </div>
    <div class="card-grid">
      ${COURSE.map((mod, mi) => {
        const unlocked = isModuleUnlockedIdx(mi);
        const complete = isModuleComplete(mod);
        return `<div class="panel card" style="${unlocked ? "" : "opacity:.5;cursor:not-allowed"}" ${unlocked ? `data-gotomodule="${mod.id}"` : ""}>
          ${icon(complete ? "check" : unlocked ? "compass" : "lock", 16)}
          <div class="card-title">${mi}. ${esc(mod.title)}</div>
          <div class="card-desc">${complete ? "Completed" : unlocked ? `${mod.lessons.length} lessons` : "Locked — finish the previous module"}</div>
        </div>`;
      }).join("")}
    </div>
  `;
}

/* -------------------------------- Sidebar / lesson nav -------------------------------- */
function renderSidebar() {
  return `<div class="panel lesson-sidebar"><div class="panel-header"><span class="title mono">${icon("compass", 14)} curriculum</span></div>
  <div class="panel-body">
  ${COURSE.map((mod, mi) => {
    const unlocked = isModuleUnlockedIdx(mi);
    const complete = isModuleComplete(mod);
    const open = sidebarOpen(mod.id);
    return `<div class="module-block">
      <div class="module-head ${unlocked ? "" : "locked"}" ${unlocked ? `data-togglemodule="${mod.id}"` : ""}>
        <span class="num mono">${mi}</span>
        <span class="m-title">${esc(mod.title)}</span>
        <span class="m-status">${complete ? icon("check", 13) : unlocked ? icon(open ? "chevronDown" : "chevronRight", 12) : icon("lock", 12)}</span>
      </div>
      <div class="module-lessons ${open && unlocked ? "open" : ""}">
        ${mod.lessons.map((l, li) => {
          const lUnlocked = unlocked && isLessonUnlocked(mod, li);
          const lDone = isLessonComplete(mod, l);
          const active = mod.id === state.currentModuleId && l.id === state.currentLessonId;
          return `<div class="lesson-item ${active ? "active" : ""} ${lUnlocked ? "" : "locked"}" ${lUnlocked ? `data-lessonjump="${mod.id}:${l.id}"` : ""}>
            <span class="check ${lDone ? "done" : ""}">${lDone ? icon("check", 9) : ""}</span>
            <span>${esc(l.title)}</span>
          </div>`;
        }).join("")}
        ${mod.checkpoint ? `<div class="checkpoint-item">${icon("trophy", 11)} Checkpoint${state.checkpointPassed[mod.id] ? " — passed" : ""}</div>` : ""}
      </div>
    </div>`;
  }).join("")}
  </div></div>`;
}

function renderLessonsMode() {
  let mod = findModule(state.currentModuleId);
  let lesson = mod.lessons.find((l) => l.id === state.currentLessonId);
  if (!lesson) { lesson = mod.lessons[0]; state.currentLessonId = lesson.id; }
  return `<div class="lesson-shell">${renderSidebar()}<div>${renderLessonContent(mod, lesson)}</div></div>`;
}

function renderSubsectionCard(mod, lesson, sub) {
  const key = `${mod.id}:${lesson.id}:${sub.id}`;
  const done = !!state.completed[key];
  return `<div class="subsection-card">
    <div class="subsection-head"><span class="s-title">${esc(sub.title)} <span class="kind-badge ${sub.kind}">${sub.kind}</span></span></div>
    <div class="subsection-body">${sub.body}</div>
    ${sub.tryIt ? `<div class="try-it">Try it: ${sub.tryIt}</div>` : ""}
    ${sub.widget ? `<div class="widget-embed">${renderWidget(sub.widget)}</div>` : ""}
    <div class="mark-complete-row">
      ${done ? `<span class="done-label">${icon("check", 12)} Completed</span><button class="btn" data-marksub="${key}">Unmark</button>` : `<button class="btn accent" data-marksub="${key}">Mark as complete</button>`}
    </div>
  </div>`;
}

function renderCheckpoint(mod) {
  if (!mod.checkpoint) return "";
  const lessonsDone = mod.lessons.every((l) => isLessonComplete(mod, l));
  if (!lessonsDone) {
    return `<div class="checkpoint-box"><div class="cp-title">${icon("lock", 14)} Checkpoint locked</div><p class="perm-note" style="margin-top:0">Finish every lesson in this module to unlock the checkpoint quiz.</p></div>`;
  }
  const cp = mod.checkpoint;
  const passed = !!state.checkpointPassed[mod.id];
  const checked = !!state.quizChecked[mod.id];
  return `<div class="checkpoint-box">
    <div class="cp-title">${icon("trophy", 14)} Module checkpoint ${passed ? `<span class="pill teal">passed</span>` : ""}</div>
    ${cp.questions.map((q, qi) => {
      const selKey = `${mod.id}:${qi}`;
      const sel = state.quizAnswers[selKey];
      return `<div class="quiz-q">
        <div class="q-text mono">${qi + 1}. ${esc(q.text)}</div>
        ${q.options.map((opt, oi) => {
          let cls = "quiz-opt";
          if (sel === oi) cls += " selected";
          if (checked) { if (oi === q.correct) cls += " correct"; else if (sel === oi) cls += " incorrect"; }
          return `<div class="${cls}" data-quizopt="${selKey}:${oi}"><span class="radio"></span>${esc(opt)}</div>`;
        }).join("")}
      </div>`;
    }).join("")}
    <button class="btn accent" data-checkquiz="${mod.id}">Check answers</button>
    ${checked ? `<div class="cp-result-banner" style="background:${passed ? "var(--teal-soft)" : "var(--coral-soft)"};color:${passed ? "var(--teal)" : "var(--coral)"}">${icon(passed ? "check" : "x", 13)} ${passed ? "All correct — module complete!" : "Not all correct yet — review and try again."}</div>` : ""}
  </div>`;
}

function renderLessonNav(mod, lesson) {
  const prev = prevLessonTarget(mod.id, lesson.id);
  const next = nextLessonTarget(mod.id, lesson.id);
  const nextOk = canGoNext(mod, lesson) && next;
  return `<div class="lesson-nav-row">
    <button class="btn" ${prev ? `data-lessonjump="${prev.modId}:${prev.lessonId}"` : "disabled"}>${icon("chevronLeft", 12)} Back</button>
    <button class="btn accent" ${nextOk ? `data-lessonjump="${next.modId}:${next.lessonId}"` : "disabled"}>${next ? "Next" : "Course complete"} ${next ? icon("chevronRight", 12) : ""}</button>
  </div>`;
}

function renderLessonContent(mod, lesson) {
  const isLastLesson = mod.lessons[mod.lessons.length - 1].id === lesson.id;
  return `<div class="panel lesson-content"><div class="panel-body">
    <div class="breadcrumb"><span>${esc(mod.title)}</span><span class="sep">/</span><span class="current">${esc(lesson.title)}</span></div>
    <div class="lesson-title-row"><h2>${esc(lesson.title)}</h2><span class="pill lesson-view-tag mono">${esc(lesson.view)}</span></div>
    ${lesson.subsections.map((s) => renderSubsectionCard(mod, lesson, s)).join("")}
    ${isLastLesson ? renderCheckpoint(mod) : ""}
    ${renderLessonNav(mod, lesson)}
  </div></div>`;
}

/* --------------------------------- Widget dispatcher --------------------------------- */
function renderWidget(key) {
  switch (key) {
    case "terminal": return renderTerminal();
    case "explorer": return renderExplorerEmbed();
    case "perm": return renderPermissionsLab();
    case "inode": return renderInodeExplorer();
    case "links": return renderLinksLab();
    case "fd": return renderProcessLab();
    case "mounts": return renderMountsLab();
    case "storage": return renderStorageLab();
    case "challenges": return renderChallengesLab();
    default: return "";
  }
}

/* --------------------------------- Sandbox mode --------------------------------- */
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

function renderSandboxMode() {
  const view = state.sandboxView || "explorer";
  let body = "";
  if (view === "explorer") body = renderExplorerFull();
  else if (view === "terminal") body = renderTerminalAndDetail();
  else if (view === "permissions") body = renderPermissionsLab();
  else if (view === "inode") body = renderInodeExplorer();
  else if (view === "links") body = renderLinksLab();
  else if (view === "fd") body = renderProcessLab();
  else if (view === "mounts") body = renderMountsLab();
  else if (view === "storage") body = renderStorageLab();
  else if (view === "challenges") body = renderChallengesLab();
  return `
    <div class="breadcrumb"><span>Sandbox</span><span class="sep">/</span><span class="current">${esc(view)}</span></div>
    <nav class="nav" style="margin-bottom:16px">${SANDBOX_NAV.map((n) => `<button class="nav-btn mono ${view === n.key ? "active" : ""}" data-sandboxview="${n.key}">${icon(n.icon, 12)} ${n.label}</button>`).join("")}</nav>
    ${body}
  `;
}

/* --------------------------------- Explorer (tree + detail) --------------------------------- */
function renderTreeRow(node, path, connector) {
  const isDir = node.type === "dir";
  const isOpen = !!state.expanded[path];
  const selected = state.selectedPath === path;
  const iconName = isDir ? (isOpen ? "folderOpen" : "folder") : node.type === "symlink" ? "fileSymlink" : "fileText";
  const iconClass = isDir ? "dir" : node.type === "symlink" ? "sym" : "file";
  return `<div class="tree-row ${selected ? "selected" : ""}" data-select="${esc(path)}" draggable="true" data-drag-path="${esc(path)}" ${isDir ? `data-dropzone="${esc(path)}"` : ""}>
    <span class="connector mono">${connector}</span>
    ${isDir ? `<span class="caret" data-toggle="${esc(path)}">${icon(isOpen ? "chevronDown" : "chevronRight", 12)}</span>` : `<span class="caret spacer"></span>`}
    <span class="${iconClass}">${icon(iconName, 14)}</span>
    <span class="name mono ${node.name.startsWith(".") ? "hidden-file" : ""}">${esc(node.name || "/")}</span>
    ${node.type === "symlink" ? `<span class="arrow-target mono">&rarr; ${esc(node.target)}</span>` : ""}
    ${node.links > 1 ? `<span class="pill teal">hardlink &times;${node.links}</span>` : ""}
  </div>`;
}

function renderTree(root) {
  let html = renderTreeRow(root, "/", "");
  const walk = (node, path, ancestorsLast) => {
    if (!node.children || !state.expanded[path]) return "";
    let out = "";
    node.children.forEach((child, i) => {
      const last = i === node.children.length - 1;
      const childPath = joinPath(path, child.name);
      const connector = ancestorsLast.map((l) => (l ? "   " : "\u2502  ")).join("") + (last ? "\u2514\u2500\u2500 " : "\u251c\u2500\u2500 ");
      out += renderTreeRow(child, childPath, connector);
      out += walk(child, childPath, ancestorsLast.concat(last));
    });
    return out;
  };
  html += walk(root, "/", []);
  return html;
}

function renderDetailPanel(path) {
  const node = getNode(state.fs, path);
  if (!node) return `<div class="panel"><div class="empty-hint">select a node to inspect</div></div>`;
  const brokenLink = node.type === "symlink" && !resolveTarget(state.fs, path, node.target);
  return `<div class="panel">
    <div class="panel-header">
      <span class="title mono">${icon(node.type === "dir" ? "folder" : node.type === "symlink" ? "fileSymlink" : "fileText", 15)} ${esc(path)}</span>
      ${node.type === "symlink" ? (brokenLink ? `<span class="pill coral">broken link</span>` : `<span class="pill teal">resolves ok</span>`) : ""}
    </div>
    <div class="panel-body">
      <div class="permline">${esc(fullPermString(node))} ${node.links} ${esc(node.owner)} ${esc(node.group)} ${fmtSize(node.size)} ${esc(node.mtime)} ${esc(node.name)}</div>
      <div class="info-grid">
        <div><span class="k">owner</span><span class="v">${esc(node.owner)}</span></div>
        <div><span class="k">group</span><span class="v">${esc(node.group)}</span></div>
        <div><span class="k">inode</span><span class="v">${node.inode}</span></div>
        <div><span class="k">hard links</span><span class="v">${node.links}</span></div>
        <div><span class="k">size</span><span class="v">${fmtSize(node.size)}</span></div>
        <div><span class="k">modified</span><span class="v">${esc(node.mtime)}</span></div>
      </div>
      ${node.type === "symlink" ? `<div class="symlink-row mono" style="background:${brokenLink ? "var(--coral-soft)" : "var(--teal-soft)"};color:${brokenLink ? "var(--coral)" : "var(--teal)"}">${icon(brokenLink ? "alertTriangle" : "link2", 13)} &rarr; ${esc(node.target)} ${brokenLink ? "(target not found)" : ""}</div>` : ""}
    </div>
  </div>`;
}

function renderExplorerFull() {
  return `<div class="explorer-grid">
    <div class="panel">
      <div class="panel-header"><span class="title mono">${icon("compass", 15)} / — visual filesystem explorer</span><span class="mono" style="font-size:11px;color:var(--text-dim)">drag a node onto a folder to move it</span></div>
      <div class="tree-scroll">${renderTree(state.fs)}</div>
    </div>
    <div>${renderDetailPanel(state.selectedPath)}</div>
  </div>`;
}

function renderExplorerEmbed() {
  return `<div class="panel"><div class="panel-header"><span class="title mono">${icon("compass", 15)} filesystem tree</span></div><div class="tree-scroll" style="max-height:260px">${renderTree(state.fs)}</div></div><div style="margin-top:10px">${renderDetailPanel(state.selectedPath)}</div>`;
}

/* --------------------------------- Terminal --------------------------------- */
function resolveTermPath(arg) {
  if (!arg) return state.cwd;
  if (arg === "~") return "/home/khaled";
  if (arg.startsWith("/")) return arg.replace(/\/+$/, "") || "/";
  if (arg === "..") return parentPath(state.cwd) || "/";
  if (arg === ".") return state.cwd;
  return joinPath(state.cwd, arg).replace(/\/+$/, "");
}
function termPush(entry) { state.termHistory.push(entry); }

function runCommand(raw) {
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
    const node = getNode(state.fs, target);
    if (!node) fail(`cd: no such file or directory: ${args[0]}`);
    else if (node.type !== "dir") fail(`cd: not a directory: ${args[0]}`);
    else state.cwd = target;
  } else if (cmd === "ls") {
    const longFlag = args.includes("-l");
    const pathArg = args.find((a) => a !== "-l");
    const target = resolveTermPath(pathArg);
    const node = getNode(state.fs, target);
    if (!node) { fail(`ls: cannot access '${pathArg}': No such file or directory`); }
    else {
      const items = node.type === "dir" ? node.children : [node];
      if (longFlag) {
        termPush({ type: "out", text: items.map((c) =>
          `${fullPermString(c)}  ${String(c.links).padStart(2)} ${c.owner.padEnd(7)} ${c.group.padEnd(7)} ${fmtSize(c.size).padStart(6)}  ${c.mtime}  ${c.name}${c.type === "symlink" ? " -> " + c.target : ""}`
        ).join("\n") });
      } else {
        termPush({ type: "out", text: items.map((c) => c.name).join("  ") || "(empty)" });
      }
    }
  } else if (cmd === "cat") {
    const target = resolveTermPath(args[0]);
    const node = getNode(state.fs, target);
    if (!node) fail(`cat: ${args[0]}: No such file or directory`);
    else if (node.type === "dir") fail(`cat: ${args[0]}: Is a directory`);
    else termPush({ type: "out", text: `[simulated content of ${node.name} — ${fmtSize(node.size)}]` });
  } else if (cmd === "mv" || cmd === "cp") {
    if (args.length < 2) { fail(`${cmd}: missing file operand`); }
    else {
      const srcPath = resolveTermPath(args[0]);
      const srcNode = getNode(state.fs, srcPath);
      if (!srcNode) { fail(`${cmd}: cannot stat '${args[0]}': No such file or directory`); }
      else {
        const dstArg = resolveTermPath(args[1]);
        const dstNode = getNode(state.fs, dstArg);
        const destDir = dstNode && dstNode.type === "dir" ? dstArg : parentPath(dstArg);
        const destName = dstNode && dstNode.type === "dir" ? srcNode.name : baseName(dstArg);
        if (!getNode(state.fs, destDir)) { fail(`${cmd}: target directory does not exist`); }
        else {
          let newFs = state.fs;
          if (cmd === "mv") newFs = updateAtPath(newFs, parentPath(srcPath), (p) => ({ ...p, children: p.children.filter((c) => c.name !== srcNode.name) }));
          const placed = { ...srcNode, name: destName, inode: cmd === "cp" ? nextInode() : srcNode.inode };
          newFs = updateAtPath(newFs, destDir, (p) => ({ ...p, children: [...p.children.filter((c) => c.name !== destName), placed] }));
          state.fs = newFs;
          termPush({ type: "out", text: `${cmd === "mv" ? "moved" : "copied"} '${srcNode.name}' -> '${joinPath(destDir, destName)}'` });
        }
      }
    }
  } else if (cmd === "chmod") {
    if (args.length < 2 || !/^[0-7]{3}$/.test(args[0])) { fail("chmod: usage: chmod <octal e.g. 755> <path>"); }
    else {
      const target = resolveTermPath(args[1]);
      const node = getNode(state.fs, target);
      if (!node) { fail(`chmod: cannot access '${args[1]}': No such file or directory`); }
      else {
        const newPerm = octalToPerm(args[0]);
        state.fs = updateAtPath(state.fs, target, (n) => ({ ...n, perms: newPerm }));
        termPush({ type: "out", text: `mode of '${node.name}' changed to ${args[0]} (${newPerm})` });
      }
    }
  } else if (cmd === "ln") {
    const symbolic = args[0] === "-s";
    const rest = symbolic ? args.slice(1) : args;
    if (rest.length < 2) { fail("ln: usage: ln [-s] <target> <name>"); }
    else {
      const [tgt, name] = rest;
      const destPath = joinPath(state.cwd, name);
      if (getNode(state.fs, destPath)) { fail(`ln: failed to create '${name}': File exists`); }
      else if (symbolic) {
        const linkNode = mk(name, { type: "symlink", perms: "rwxrwxrwx", size: tgt.length, target: tgt });
        state.fs = updateAtPath(state.fs, state.cwd, (p) => ({ ...p, children: [...p.children, linkNode] }));
        termPush({ type: "out", text: `symlink '${name}' -> '${tgt}' created` });
      } else {
        const targetPath = resolveTermPath(tgt);
        const targetNode = getNode(state.fs, targetPath);
        if (!targetNode) { fail(`ln: failed to access '${tgt}': No such file or directory`); }
        else if (targetNode.type === "dir") { fail(`ln: '${tgt}': hard link not allowed for directory`); }
        else {
          let nf = updateAtPath(state.fs, targetPath, (n) => ({ ...n, links: n.links + 1 }));
          const linkNode = { ...targetNode, name, links: targetNode.links + 1 };
          nf = updateAtPath(nf, state.cwd, (p) => ({ ...p, children: [...p.children, linkNode] }));
          state.fs = nf;
          termPush({ type: "out", text: `hard link '${name}' -> inode ${targetNode.inode} created` });
        }
      }
    }
  } else if (cmd === "mkdir") {
    if (!args[0]) { fail("mkdir: missing operand"); }
    else {
      const node = mk(args[0], { type: "dir", perms: "rwxr-xr-x", children: [] });
      state.fs = updateAtPath(state.fs, state.cwd, (p) => ({ ...p, children: [...p.children, node] }));
      termPush({ type: "out", text: `directory '${args[0]}' created` });
    }
  } else if (cmd === "touch") {
    if (!args[0]) { fail("touch: missing operand"); }
    else {
      const node = mk(args[0], { perms: "rw-r--r--", size: 0 });
      state.fs = updateAtPath(state.fs, state.cwd, (p) => ({ ...p, children: [...p.children, node] }));
      termPush({ type: "out", text: `'${args[0]}' created` });
    }
  } else if (cmd === "rm") {
    if (!args[0]) { fail("rm: missing operand"); }
    else {
      state.fs = updateAtPath(state.fs, state.cwd, (p) => ({ ...p, children: p.children.filter((c) => c.name !== args[0]) }));
      termPush({ type: "out", text: `removed '${args[0]}'` });
    }
  } else {
    fail(`command not found: ${cmd}`);
  }
}

function renderTerminalAndDetail() {
  return `<div class="explorer-grid"><div>${renderTerminal()}</div><div>${renderDetailPanel(state.selectedPath)}</div></div>`;
}

function renderTerminal() {
  const quick = ["ls -l", "mv notes.txt docs/", "chmod 700 secret.key", "ln -s notes.txt shortcut"];
  return `<div class="panel">
    <div class="panel-header"><span class="title mono">${icon("terminal", 15)} terminal</span><span class="pill accent mono">${esc(state.cwd)}</span></div>
    <div id="term-history" class="terminal-body">
      ${state.termHistory.map((h) => `<div class="term-line ${h.type} mono">${esc(h.text)}</div>`).join("")}
      <div class="term-prompt-row">
        <span class="prompt mono">khaled@sim:${esc(state.cwd)}$</span>
        <input id="term-input" type="text" autocomplete="off" spellcheck="false" />
        <span class="blink mono" style="color:var(--accent)">&#9608;</span>
      </div>
    </div>
    <div class="term-quick">${quick.map((q) => `<button data-quickcmd="${esc(q)}">${esc(q)}</button>`).join("")}</div>
  </div>`;
}

/* ----------------------------- Permissions lab ----------------------------- */
function renderPermBits(perm9, editable) {
  const groups = [{ label: "Owner", off: 0 }, { label: "Group", off: 3 }, { label: "Others", off: 6 }];
  const bits = ["r", "w", "x"];
  const bitLabel = { r: "Read", w: "Write", x: "Execute" };
  return `<div class="perm-groups">${groups.map((g) => `
    <div class="perm-group"><div class="glabel">${g.label}</div>
      ${bits.map((b, bi) => {
        const idx = g.off + bi;
        const on = perm9[idx] !== "-";
        return `<div class="perm-bit" ${editable ? `data-permtoggle="${idx}"` : ""}>
          <span class="box ${on ? "on" : ""}">${on ? icon("check", 11) : ""}</span>
          <span style="color:${on ? "var(--text-primary)" : "var(--text-dim)"}">${bitLabel[b]}</span>
        </div>`;
      }).join("")}
    </div>`).join("")}</div>`;
}

function renderPermissionsLab() {
  const files = flatten(state.fs).filter((f) => f.path !== "/");
  const path = (state.permDraft && getNode(state.fs, state.permDraft.path)) ? state.permDraft.path
    : (state.selectedPath && getNode(state.fs, state.selectedPath) ? state.selectedPath : files[0].path);
  const node = getNode(state.fs, path);
  if (!state.permDraft || state.permDraft.path !== path) state.permDraft = { path, perm: node.perms };
  const draft = state.permDraft.perm;
  const dirty = draft !== node.perms;
  return `<div class="panel">
    <div class="panel-header"><span class="title mono">${icon("lock", 15)} permissions visualizer</span></div>
    <div class="panel-body">
      <select data-permpath>${files.map((f) => `<option value="${esc(f.path)}" ${f.path === path ? "selected" : ""}>${esc(f.path)}</option>`).join("")}</select>
      <div style="height:14px"></div>
      ${renderPermBits(draft, true)}
      <div class="perm-apply-row">
        <div class="permline" style="margin:0">${typeChar(node)}${draft} <span style="color:var(--text-dim)">(${permToOctal(draft)})</span></div>
        <button class="btn accent" data-apply-chmod ${dirty ? "" : "disabled"}>Apply chmod ${permToOctal(draft)}</button>
      </div>
      <p class="perm-note">Toggle a bit to see the permission string and octal mode update live, exactly like editing the mode with <span class="mono">chmod</span>.</p>
    </div>
  </div>`;
}

/* ------------------------------- Inode explorer ------------------------------- */
function computeAllocatedBlocks(node) {
  const blockSize = 4096, totalBlocks = 24;
  const usedBlocks = node.type === "dir" ? 1 : Math.max(1, Math.min(totalBlocks - 2, Math.ceil(node.size / blockSize)));
  const allocated = new Set();
  let s = node.inode;
  while (allocated.size < usedBlocks) {
    s = (s * 1103515245 + 12345) % 2147483648;
    allocated.add(s % totalBlocks);
  }
  return { allocated, totalBlocks, usedBlocks, blockSize };
}
function renderInodeDiagram(node) {
  const { allocated, totalBlocks, usedBlocks, blockSize } = computeAllocatedBlocks(node);
  let blocks = "";
  for (let i = 0; i < totalBlocks; i++) {
    const on = allocated.has(i);
    blocks += `<div class="block" title="${on ? "allocated block" : "free block"}" style="background:${on ? "var(--teal)" : "var(--bg-raised)"};border:1px solid ${on ? "var(--teal)" : "var(--border)"};opacity:${on ? 0.9 : 0.5}"></div>`;
  }
  return `<div class="inode-diagram">
    <div class="inode-badge mono">inode ${node.inode}</div>
    <div style="width:1px;height:20px;background:var(--border)"></div>
    <div class="inode-blocks">${blocks}</div>
    <div class="inode-caption">${usedBlocks} block${usedBlocks !== 1 ? "s" : ""} &times; ${blockSize}B on disk</div>
  </div>`;
}
function renderInodeExplorer() {
  const files = flatten(state.fs).filter((f) => f.path !== "/");
  const path = state.selectedPath && getNode(state.fs, state.selectedPath) ? state.selectedPath : files[0].path;
  const node = getNode(state.fs, path);
  return `<div class="panel">
    <div class="panel-header"><span class="title mono">${icon("database", 15)} inode explorer</span></div>
    <div class="panel-body inode-grid">
      <div>
        <select data-inodepath>${files.map((f) => `<option value="${esc(f.path)}" ${f.path === path ? "selected" : ""}>${esc(f.path)}</option>`).join("")}</select>
        <div class="info-grid" style="margin-top:14px">
          <div><span class="k">inode number</span><span class="v">${node.inode}</span></div>
          <div><span class="k">hard links</span><span class="v">${node.links}</span></div>
          <div><span class="k">permissions</span><span class="v">${esc(fullPermString(node))}</span></div>
          <div><span class="k">owner:group</span><span class="v">${esc(node.owner)}:${esc(node.group)}</span></div>
          <div><span class="k">size</span><span class="v">${fmtSize(node.size)}</span></div>
          <div><span class="k">modified</span><span class="v">${esc(node.mtime)}</span></div>
        </div>
        <p class="perm-note">The filename <span class="mono">${esc(node.name)}</span> is just a directory entry pointing at inode ${node.inode}. The inode holds the real metadata and pointers to the data blocks on disk.</p>
      </div>
      <div class="inode-diagram-box">${renderInodeDiagram(node)}</div>
    </div>
  </div>`;
}

/* --------------------------------- Links lab --------------------------------- */
function renderLinksLab() {
  const files = flatten(state.fs).filter((f) => f.path !== "/");
  const dirs = flatten(state.fs).filter((f) => f.node.type === "dir");
  if (!state.links.target) state.links.target = files[0].path;
  const { target, dir, name, mode, msg } = state.links;
  const targetNode = getNode(state.fs, target);
  const visual = mode === "symbolic" ? `
    <div class="link-flow">
      <div class="link-box mono" style="border-color:var(--accent);color:var(--accent)">${esc(name || "shortcut")}</div>
      <div class="caption mono">points to path ${icon("chevronDown", 16)}</div>
      <div class="link-box mono" style="border-color:var(--teal);color:var(--teal)">${esc(target || "target")}</div>
      <div class="desc">A symlink stores a path string. Delete the target and the link breaks.</div>
    </div>` : `
    <div class="link-flow">
      <div class="hardlink-pair">
        <div class="link-box mono" style="border-color:var(--teal);color:var(--teal)">${esc(targetNode ? targetNode.name : "")}</div>
        <div class="link-box mono" style="border-color:var(--teal);color:var(--teal)">${esc(name || "link")}</div>
      </div>
      ${icon("chevronDown", 16)}
      <div class="inode-badge mono">inode ${targetNode ? targetNode.inode : "?"}</div>
      <div class="desc">Two directory entries, one inode. Data is only freed once every hard link is removed.</div>
    </div>`;
  return `<div class="links-grid">
    <div class="panel">
      <div class="panel-header"><span class="title mono">${icon("link2", 15)} links lab — create a link</span></div>
      <div class="panel-body">
        <div class="mode-toggle">
          <button data-linkmode="symbolic" class="${mode === "symbolic" ? "active" : ""}">Symbolic link</button>
          <button data-linkmode="hard" class="${mode === "hard" ? "active" : ""}">Hard link</button>
        </div>
        <label class="field-label mono">target</label>
        <select data-linktarget>${files.map((f) => `<option value="${esc(f.path)}" ${f.path === target ? "selected" : ""}>${esc(f.path)}</option>`).join("")}</select>
        <label class="field-label mono">create in directory</label>
        <select data-linkdir>${dirs.map((f) => `<option value="${esc(f.path)}" ${f.path === dir ? "selected" : ""}>${esc(f.path)}</option>`).join("")}</select>
        <label class="field-label mono">link name</label>
        <input type="text" id="link-name-input" value="${esc(name)}" />
        <div style="height:14px"></div>
        <button class="btn accent block" data-createlink>Create ${mode} link</button>
        ${msg ? `<div class="links-msg mono" style="background:${msg.ok ? "var(--teal-soft)" : "var(--coral-soft)"};color:${msg.ok ? "var(--teal)" : "var(--coral)"}">${esc(msg.text)}</div>` : ""}
      </div>
    </div>
    <div class="panel"><div class="links-visual">${visual}</div></div>
  </div>`;
}

/* --------------------------------- Process / FD lab --------------------------------- */
function renderProcessLab() {
  const files = flatten(state.fs).filter((f) => f.node.type !== "dir");
  const selPid = state.selectedProcess || state.processes[0].pid;
  const proc = state.processes.find((p) => p.pid === selPid) || state.processes[0];
  const orphanSet = new Set(state.processes.filter((p) => p.ppid !== null && !state.processes.some((q) => q.pid === p.ppid)).map((p) => p.pid));
  return `<div class="panel">
    <div class="panel-header"><span class="title mono">${icon("cpu", 15)} process &amp; file descriptor lab</span></div>
    <div class="panel-body fd-grid">
      <div class="proc-list">
        ${state.processes.map((p) => `<div class="proc-card ${p.pid === selPid ? "selected" : ""} ${orphanSet.has(p.pid) ? "orphan" : ""}" data-selectproc="${p.pid}">
          <div><span class="pid">pid ${p.pid}</span></div>
          <div>${esc(p.name)}</div>
          <div style="color:var(--text-dim)">ppid: ${p.ppid === null ? "—" : p.ppid}${orphanSet.has(p.pid) ? " ⚠" : ""}</div>
        </div>`).join("")}
      </div>
      <div>
        <table class="fd-table">
          <thead><tr><th>fd</th><th>points to</th><th></th></tr></thead>
          <tbody>
            ${proc.fds.length ? proc.fds.map((f) => `<tr><td>${f.fd}</td><td>${esc(f.target)}</td><td><button data-dupfd="${f.fd}">duplicate</button><button data-closefd="${f.fd}">close</button></td></tr>`).join("") : `<tr><td colspan="3" style="color:var(--text-dim)">no open descriptors</td></tr>`}
          </tbody>
        </table>
        <div class="fd-controls">
          <select data-fdopenpath>${files.map((f) => `<option value="${esc(f.path)}">${esc(f.path)}</option>`).join("")}</select>
          <button class="btn accent" data-openfd>Open file &rarr; new fd</button>
        </div>
        <p class="perm-note">Every open file gets a small integer handle (a file descriptor) that belongs to this process. fd 0, 1, and 2 are reserved by convention for input, output, and errors.</p>
      </div>
    </div>
  </div>`;
}

/* --------------------------------- Mounts lab --------------------------------- */
function renderMountsLab() {
  const mounted = state.mounts.filter((d) => d.point);
  const unmounted = state.mounts.filter((d) => !d.point);
  return `<div class="panel">
    <div class="panel-header"><span class="title mono">${icon("server", 15)} mounts lab</span></div>
    <div class="panel-body">
      <div class="mount-list">
        ${mounted.map((m) => `<div class="mount-card">
          <div class="mount-card-top">
            <span class="point">${esc(m.point)}</span>
            <span class="mono" style="color:var(--text-dim)">${esc(m.device)} &middot; ${esc(m.fstype)}${m.virtual ? " &middot; virtual" : ""}</span>
            ${(!m.virtual && m.point !== "/") ? `<button class="btn" data-unmount="${esc(m.point)}">unmount</button>` : ""}
          </div>
          ${!m.virtual ? `<div class="mount-usage-bar"><div style="width:${Math.round((m.used / m.total) * 100)}%"></div></div>
            <div class="mono" style="font-size:11px;color:var(--text-dim);margin-top:4px">${fmtSize(m.used)} used of ${fmtSize(m.total)}</div>`
            : `<div class="mono" style="font-size:11px;color:var(--text-dim)">generated by the kernel, not stored on disk</div>`}
        </div>`).join("")}
      </div>
      <div style="height:16px"></div>
      <div class="panel-header" style="border:none;padding:0 0 10px"><span class="title mono">${icon("hardDrive", 13)} available devices</span></div>
      ${unmounted.length ? unmounted.map((d) => `<div class="device-card">
        <span>${esc(d.label)} — ${esc(d.device)} (${esc(d.fstype)}, ${fmtSize(d.total)})</span>
        <span style="display:flex;gap:6px;align-items:center">
          <input type="text" id="mount-point-${esc(d.id)}" placeholder="/mnt/usb" style="width:140px" />
          <button class="btn accent" data-mountdevice="${esc(d.id)}">mount</button>
        </span>
      </div>`).join("") : `<p class="perm-note">No unmounted devices right now — unmount one above to make it available again.</p>`}
      <p class="perm-note">Mounting attaches a filesystem to a directory. Until then, that device isn't reachable through the tree at all.</p>
    </div>
  </div>`;
}

/* --------------------------------- Storage lab --------------------------------- */
function scatterOrder(n, seed) {
  const arr = [...Array(n).keys()];
  let s = seed;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function renderStorageLab() {
  const root = state.fs;
  const topDirs = root.children.filter((c) => c.type === "dir").map((c) => ({ name: c.name, size: computeDirSize(c) }));
  const totalUsed = topDirs.reduce((a, b) => a + b.size, 0);
  const files = flatten(state.fs).filter((f) => f.node.type === "file").sort((a, b) => b.node.size - a.node.size).slice(0, 5);
  const palette = ["#E8A33D", "#4FB8A6", "#D1616B", "#7B9EE8", "#C792E8", "#E8D34F"];
  const heat = topDirs.map((d, i) => `<div class="heatmap-tile" style="flex:${Math.max(d.size, 1)};background:${palette[i % palette.length]}" title="${esc(d.name)} — ${fmtSize(d.size)}">${esc(d.name)}<br>${fmtSize(d.size)}</div>`).join("");
  const totalDisk = 200 * 1024 * 1024;
  const usedPct = Math.min(100, Math.round((totalUsed / totalDisk) * 100));
  const totalTiles = 48;
  const usedTiles = Math.round((usedPct / 100) * totalTiles);
  const order = state.storageDefrag ? [...Array(totalTiles).keys()] : scatterOrder(totalTiles, 4242);
  const usedSet = new Set(order.slice(0, usedTiles));
  const frag = Array.from({ length: totalTiles }, (_, i) => `<div class="frag-block" style="background:${usedSet.has(i) ? "var(--teal)" : "var(--bg-raised-2)"};border:1px solid ${usedSet.has(i) ? "var(--teal)" : "var(--border)"}"></div>`).join("");
  return `<div class="panel">
    <div class="panel-header"><span class="title mono">${icon("barChart2", 15)} storage visualization</span></div>
    <div class="panel-body">
      <div class="glabel mono" style="color:var(--text-dim);font-size:11px;margin-bottom:6px">usage by top-level directory</div>
      <div class="heatmap">${heat}</div>
      <div style="height:18px"></div>
      <div class="glabel mono" style="color:var(--text-dim);font-size:11px">disk usage</div>
      <div class="usage-bar-lg"><div style="width:${usedPct}%"></div></div>
      <div class="mono" style="font-size:11px;color:var(--text-dim)">${fmtSize(totalUsed)} used of ${fmtSize(totalDisk)} (${usedPct}%)</div>
      <div style="height:18px"></div>
      <div class="glabel mono" style="color:var(--text-dim);font-size:11px;margin-bottom:6px">largest files</div>
      <div class="largest-list">${files.map((f) => `<div class="largest-row"><span>${esc(f.path)}</span><span style="color:var(--accent)">${fmtSize(f.node.size)}</span></div>`).join("")}</div>
      <div style="height:18px"></div>
      <div class="glabel mono" style="color:var(--text-dim);font-size:11px;margin-bottom:6px">block fragmentation (simulated)</div>
      <div class="frag-blocks">${frag}</div>
      <div style="margin-top:10px"><button class="btn" data-defrag>${state.storageDefrag ? "Scatter blocks" : "Defragment"}</button></div>
    </div>
  </div>`;
}

/* --------------------------------- Challenges lab --------------------------------- */
function challengeItems() {
  const files = flatten(state.fs).filter((f) => f.path !== "/");
  const largest = files.reduce((a, b) => (b.node.size > a.node.size ? b : a), files[0]);
  const broken = files.find((f) => f.node.type === "symlink" && !resolveTarget(state.fs, f.path, f.node.target));
  const hidden = files.find((f) => f.node.name.startsWith("."));
  const worldWritable = files.find((f) => f.node.type === "file" && f.node.perms[7] === "w");
  const orphan = state.processes.find((p) => p.ppid !== null && !state.processes.some((q) => q.pid === p.ppid));
  return [
    { key: "largest", title: "Find the largest file", hint: "Compare sizes across every directory.", answer: largest ? largest.path : null, type: "path" },
    { key: "broken", title: "Find the broken symbolic link", hint: "A symlink whose target no longer resolves.", answer: broken ? broken.path : null, type: "path" },
    { key: "hidden", title: "Find the hidden file", hint: "Dotfiles don't show up in a plain ls.", answer: hidden ? hidden.path : null, type: "path" },
    { key: "worldwritable", title: "Find the world-writable file", hint: "Anyone — not just the owner or group — can write to it.", answer: worldWritable ? worldWritable.path : null, type: "path" },
    { key: "orphan", title: "Find the orphaned process", hint: "Its parent process no longer exists.", answer: orphan ? String(orphan.pid) : null, type: "process" }
  ];
}
function renderChallengesLab() {
  const items = challengeItems();
  const files = flatten(state.fs).filter((f) => f.path !== "/");
  return `<div class="panel">
    <div class="panel-header"><span class="title mono">${icon("trophy", 15)} challenges</span></div>
    <div class="panel-body"><div class="challenge-grid">
      ${items.map((item) => {
        const currentAns = state.challengeAnswers[item.key] || "";
        const result = state.challengeResult[item.key];
        const options = item.type === "path"
          ? files.map((f) => `<option value="${esc(f.path)}" ${f.path === currentAns ? "selected" : ""}>${esc(f.path)}</option>`).join("")
          : state.processes.map((p) => `<option value="${p.pid}" ${String(p.pid) === currentAns ? "selected" : ""}>pid ${p.pid} — ${esc(p.name)}</option>`).join("");
        return `<div class="panel challenge-card">
          <div class="challenge-title">${icon("trophy", 14)} ${esc(item.title)}</div>
          <div class="challenge-hint">${esc(item.hint)}</div>
          <select data-challengesel="${item.key}"><option value="">choose…</option>${options}</select>
          <button class="btn" data-challengecheck="${item.key}">Check answer</button>
          ${result !== undefined ? `<div class="challenge-result mono" style="background:${result ? "var(--teal-soft)" : "var(--coral-soft)"};color:${result ? "var(--teal)" : "var(--coral)"}">${icon(result ? "check" : "x", 12)} ${result ? "Correct." : "Not quite — try again."}</div>` : ""}
        </div>`;
      }).join("")}
    </div></div>
  </div>`;
}

/* ================================ Event wiring ================================ */
document.addEventListener("click", (e) => {
  const resetBtn = e.target.closest("[data-resetprogress]");
  if (resetBtn) {
    if (window.confirm("Reset all lesson progress and restore the default filesystem? This can't be undone.")) {
      resetProgress();
    }
    return;
  }

  const setMode = e.target.closest("[data-setmode]");
  if (setMode) { state.mode = setMode.getAttribute("data-setmode"); render(); return; }

  const gotoModule = e.target.closest("[data-gotomodule]");
  if (gotoModule) {
    const modId = gotoModule.getAttribute("data-gotomodule");
    const mod = findModule(modId);
    let lesson = mod.lessons.find((l) => !isLessonComplete(mod, l)) || mod.lessons[mod.lessons.length - 1];
    state.currentModuleId = modId; state.currentLessonId = lesson.id; state.sidebarOpen[modId] = true;
    state.mode = "lessons"; render(); return;
  }

  const continueLearn = e.target.closest("[data-continuelearn]");
  if (continueLearn) {
    const target = continueLearningTarget();
    if (target) { state.currentModuleId = target.modId; state.currentLessonId = target.lessonId; state.sidebarOpen[target.modId] = true; }
    state.mode = "lessons"; render(); return;
  }

  const sandboxView = e.target.closest("[data-sandboxview]");
  if (sandboxView) { state.sandboxView = sandboxView.getAttribute("data-sandboxview"); state.mode = "sandbox"; render(); return; }

  const toggleModule = e.target.closest("[data-togglemodule]");
  if (toggleModule) { const id = toggleModule.getAttribute("data-togglemodule"); state.sidebarOpen[id] = !sidebarOpen(id); render(); return; }

  const lessonJump = e.target.closest("[data-lessonjump]");
  if (lessonJump) {
    const [modId, lessonId] = lessonJump.getAttribute("data-lessonjump").split(":");
    state.currentModuleId = modId; state.currentLessonId = lessonId; state.sidebarOpen[modId] = true;
    state.skipScrollRestore = true;
    render();
    const container = document.getElementById("view-container");
    if (container) container.scrollIntoView({ block: "start" });
    return;
  }

  const markSub = e.target.closest("[data-marksub]");
  if (markSub) { const key = markSub.getAttribute("data-marksub"); state.completed[key] = !state.completed[key]; render(); return; }

  const quizOpt = e.target.closest("[data-quizopt]");
  if (quizOpt) {
    const parts = quizOpt.getAttribute("data-quizopt").split(":");
    const modId = parts[0], qi = parseInt(parts[1], 10), oi = parseInt(parts[2], 10);
    state.quizAnswers[`${modId}:${qi}`] = oi;
    state.quizChecked[modId] = false;
    render(); return;
  }
  const checkQuiz = e.target.closest("[data-checkquiz]");
  if (checkQuiz) {
    const modId = checkQuiz.getAttribute("data-checkquiz");
    const cp = findModule(modId).checkpoint;
    const allCorrect = cp.questions.every((q, qi) => state.quizAnswers[`${modId}:${qi}`] === q.correct);
    state.quizChecked[modId] = true;
    state.checkpointPassed[modId] = allCorrect;
    render(); return;
  }

  const toggle = e.target.closest("[data-toggle]");
  if (toggle) { const p = toggle.getAttribute("data-toggle"); state.expanded[p] = !state.expanded[p]; render(); return; }
  const select = e.target.closest("[data-select]");
  if (select) { state.selectedPath = select.getAttribute("data-select"); render(); return; }
  const quick = e.target.closest("[data-quickcmd]");
  if (quick) {
    runCommand(quick.getAttribute("data-quickcmd"));
    state.terminalScrollToBottom = true;
    state.focusTerminal = true;
    render();
    return;
  }

  const termHistArea = e.target.closest("#term-history");
  if (termHistArea) {
    const inp = document.getElementById("term-input");
    if (inp) inp.focus();
    return;
  }

  const permToggle = e.target.closest("[data-permtoggle]");
  if (permToggle) {
    const idx = parseInt(permToggle.getAttribute("data-permtoggle"), 10);
    const bits = ["r", "w", "x"];
    const arr = state.permDraft.perm.split("");
    arr[idx] = arr[idx] === "-" ? bits[idx % 3] : "-";
    state.permDraft.perm = arr.join("");
    render(); return;
  }
  const applyChmod = e.target.closest("[data-apply-chmod]");
  if (applyChmod) { state.fs = updateAtPath(state.fs, state.permDraft.path, (n) => ({ ...n, perms: state.permDraft.perm })); render(); return; }

  const linkMode = e.target.closest("[data-linkmode]");
  if (linkMode) { state.links.mode = linkMode.getAttribute("data-linkmode"); state.links.msg = null; render(); return; }
  const createLink = e.target.closest("[data-createlink]");
  if (createLink) {
    const { target, dir, name, mode } = state.links;
    const targetNode = getNode(state.fs, target);
    const destPath = joinPath(dir, name);
    if (!name) { state.links.msg = { ok: false, text: "Give the link a name." }; render(); return; }
    if (getNode(state.fs, destPath)) { state.links.msg = { ok: false, text: `'${name}' already exists there.` }; render(); return; }
    if (mode === "symbolic") {
      const linkNode = mk(name, { type: "symlink", perms: "rwxrwxrwx", size: target.length, target });
      state.fs = updateAtPath(state.fs, dir, (p) => ({ ...p, children: [...p.children, linkNode] }));
      state.links.msg = { ok: true, text: `Created symlink ${destPath} → ${target}` };
    } else {
      if (targetNode.type === "dir") { state.links.msg = { ok: false, text: "Hard links can't point at directories." }; render(); return; }
      let nf = updateAtPath(state.fs, target, (n) => ({ ...n, links: n.links + 1 }));
      const linkNode = { ...targetNode, name, links: targetNode.links + 1 };
      nf = updateAtPath(nf, dir, (p) => ({ ...p, children: [...p.children, linkNode] }));
      state.fs = nf;
      state.links.msg = { ok: true, text: `Created hard link ${destPath}, sharing inode ${targetNode.inode}` };
    }
    render(); return;
  }

  const selectProc = e.target.closest("[data-selectproc]");
  if (selectProc) { state.selectedProcess = parseInt(selectProc.getAttribute("data-selectproc"), 10); render(); return; }
  const openFd = e.target.closest("[data-openfd]");
  if (openFd) {
    const sel = document.querySelector("[data-fdopenpath]");
    const proc = state.processes.find((p) => p.pid === (state.selectedProcess || state.processes[0].pid));
    if (sel && proc) { const maxFd = proc.fds.length ? Math.max(...proc.fds.map((f) => f.fd)) : -1; proc.fds.push({ fd: maxFd + 1, target: sel.value }); }
    render(); return;
  }
  const dupFd = e.target.closest("[data-dupfd]");
  if (dupFd) {
    const fd = parseInt(dupFd.getAttribute("data-dupfd"), 10);
    const proc = state.processes.find((p) => p.pid === (state.selectedProcess || state.processes[0].pid));
    const entry = proc.fds.find((f) => f.fd === fd);
    if (entry) { const maxFd = Math.max(...proc.fds.map((f) => f.fd)); proc.fds.push({ fd: maxFd + 1, target: entry.target }); }
    render(); return;
  }
  const closeFd = e.target.closest("[data-closefd]");
  if (closeFd) {
    const fd = parseInt(closeFd.getAttribute("data-closefd"), 10);
    const proc = state.processes.find((p) => p.pid === (state.selectedProcess || state.processes[0].pid));
    proc.fds = proc.fds.filter((f) => f.fd !== fd);
    render(); return;
  }

  const mountDevice = e.target.closest("[data-mountdevice]");
  if (mountDevice) {
    const id = mountDevice.getAttribute("data-mountdevice");
    const input = document.getElementById(`mount-point-${id}`);
    const val = input ? input.value.trim() : "";
    if (!val || !val.startsWith("/")) { return; }
    if (state.mounts.some((d) => d.point === val)) { return; }
    const dev = state.mounts.find((d) => d.id === id);
    if (dev) dev.point = val;
    render(); return;
  }
  const unmount = e.target.closest("[data-unmount]");
  if (unmount) {
    const point = unmount.getAttribute("data-unmount");
    const dev = state.mounts.find((d) => d.point === point);
    if (dev && !dev.virtual && dev.point !== "/") dev.point = null;
    render(); return;
  }

  const defrag = e.target.closest("[data-defrag]");
  if (defrag) { state.storageDefrag = !state.storageDefrag; render(); return; }

  const challengeCheck = e.target.closest("[data-challengecheck]");
  if (challengeCheck) {
    const key = challengeCheck.getAttribute("data-challengecheck");
    const item = challengeItems().find((i) => i.key === key);
    const ans = state.challengeAnswers[key];
    state.challengeResult[key] = ans !== undefined && ans !== "" && ans === item.answer;
    render(); return;
  }
});

document.addEventListener("change", (e) => {
  if (e.target.matches("[data-permpath]")) { state.permDraft = null; state.selectedPath = e.target.value; render(); return; }
  if (e.target.matches("[data-inodepath]")) { state.selectedPath = e.target.value; render(); return; }
  if (e.target.matches("[data-linktarget]")) { state.links.target = e.target.value; render(); return; }
  if (e.target.matches("[data-linkdir]")) { state.links.dir = e.target.value; render(); return; }
  const challengeSel = e.target.closest("[data-challengesel]");
  if (challengeSel) { state.challengeAnswers[challengeSel.getAttribute("data-challengesel")] = e.target.value; return; }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "link-name-input") { state.links.name = e.target.value; }
});

document.addEventListener("keydown", (e) => {
  if (e.target.id === "term-input" && e.key === "Enter") {
    runCommand(e.target.value);
    e.target.value = "";
    state.terminalScrollToBottom = true;
    state.focusTerminal = true;
    render();
  }
});

let dragSrcPath = null;
document.addEventListener("dragstart", (e) => {
  const row = e.target.closest("[data-drag-path]");
  if (row) { dragSrcPath = row.getAttribute("data-drag-path"); e.dataTransfer.setData("text/plain", dragSrcPath); }
});
document.addEventListener("dragover", (e) => {
  const zone = e.target.closest("[data-dropzone]");
  if (zone) { e.preventDefault(); zone.classList.add("dragover"); }
});
document.addEventListener("dragleave", (e) => {
  const zone = e.target.closest("[data-dropzone]");
  if (zone) zone.classList.remove("dragover");
});
document.addEventListener("drop", (e) => {
  const zone = e.target.closest("[data-dropzone]");
  if (!zone) return;
  e.preventDefault();
  zone.classList.remove("dragover");
  const destDir = zone.getAttribute("data-dropzone");
  const srcPath = dragSrcPath || e.dataTransfer.getData("text/plain");
  if (!srcPath || srcPath === "/" || destDir.startsWith(srcPath + "/") || destDir === srcPath) return;
  const srcNode = getNode(state.fs, srcPath);
  if (!srcNode) return;
  const oldParent = parentPath(srcPath);
  if (oldParent === destDir) return;
  let nf = updateAtPath(state.fs, oldParent, (p) => ({ ...p, children: p.children.filter((c) => c.name !== srcNode.name) }));
  nf = updateAtPath(nf, destDir, (p) => ({ ...p, children: [...p.children.filter((c) => c.name !== srcNode.name), srcNode] }));
  state.fs = nf;
  state.expanded[destDir] = true;
  state.selectedPath = joinPath(destDir, srcNode.name);
  render();
});

/* ================================== Boot ================================== */
loadProgress();
render();