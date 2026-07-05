/* ============================== fs-sim/course.js ==============================
   The curriculum content itself. This is what a Git simulator or Bash quiz
   app would NOT reuse — they'd write their own course.js with their own
   modules/lessons, but in the exact same shape core/curriculum.js expects:
     { id, title, checkpoint: {questions:[...]} | null, lessons: [
         { id, title, view, subsections: [ {id,title,kind,widget,body,tryIt} ] }
     ] }
================================================================================== */
window.FsCourse = (function () {
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

  return { COURSE };
})();