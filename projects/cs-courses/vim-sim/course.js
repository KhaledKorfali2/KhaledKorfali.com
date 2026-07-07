/* ============================== vim-sim/course.js ==============================
   Curriculum content, Modules 0-2 (first vertical slice). Modules 3+ follow
   the same shape once this slice is confirmed working end to end.
================================================================================== */
window.VimCourse = (function () {
  const COURSE = [
    { id: "m0", title: "Orientation", checkpoint: null, lessons: [
      { id: "l1", title: "Vim philosophy", view: "editor", subsections: [
        { id: "s1", title: "A language, not a shortcut list", kind: "concept", widget: null,
          body: "Most editors give you a fixed menu of keyboard shortcuts. Vim gives you a small <b>grammar</b> instead — a handful of building blocks (counts, operators, motions, text objects) that combine to produce an enormous number of precise edits. Learning Vim means learning the grammar, not memorizing hundreds of separate commands." },
        { id: "s2", title: "Why modes exist at all", kind: "concept", widget: null,
          body: "In most editors, every key you press either types a character or requires holding a modifier (Ctrl, Alt, Cmd). Vim instead separates <i>time spent moving and commanding</i> from <i>time spent typing</i> into distinct modes, so a single unmodified key like <code>w</code> or <code>d</code> can mean something powerful without ever colliding with actually wanting to type the letter w or d." }
      ]},
      { id: "l2", title: "Meet the editor", view: "editor", subsections: [
        { id: "s1", title: "A live buffer, not a demo", kind: "concept", widget: null,
          body: "Below is a real, working simulated buffer — every key you press genuinely changes it, exactly the way it would in real Vim. Nothing here is scripted or fake." },
        { id: "s2", title: "Practice: just look around", kind: "practice", widget: "editor",
          body: "You're in NORMAL mode by default — the mode pill at the top of the editor confirms it.",
          tryIt: "Click the editor, then just move around a little. Nothing you do here can be \"wrong\" yet." }
      ]}
    ]},

    { id: "m1", title: "Modes", checkpoint: { questions: [
        { text: "Which mode is Vim in by default when you open a file?", options: ["Insert", "Normal", "Visual", "Command"], correct: 1 },
        { text: "What key always returns you to Normal mode from Insert or Visual?", options: ["Enter", "Escape", "Tab", "Backspace"], correct: 1 }
      ]}, lessons: [
      { id: "l1", title: "Normal mode", view: "editor", subsections: [
        { id: "s1", title: "The default: navigation and commands", kind: "concept", widget: null,
          body: "Normal mode is where you spend most of your time. Keys here move the cursor or act on text — nothing you press inserts a character. It's called \"Normal\" because everything else is a deliberate detour from it." },
        { id: "s2", title: "Practice: move around in Normal mode", kind: "practice", widget: "editor",
          body: "Confirm the mode pill reads NORMAL, then try a few of the classic movement keys.",
          tryIt: "Press <code>h</code> <code>j</code> <code>k</code> <code>l</code> a few times and watch the cursor and the Ln/Col readout." }
      ]},
      { id: "l2", title: "Insert mode", view: "editor", subsections: [
        { id: "s1", title: "Six ways in, each slightly different", kind: "concept", widget: null,
          body: "<code>i</code> inserts before the cursor, <code>a</code> after it, <code>I</code> at the start of the line, <code>A</code> at the end, and <code>o</code>/<code>O</code> open a new line below/above and drop you into it. They all land you in the same Insert mode — they just differ in where." },
        { id: "s2", title: "Practice: enter, type, escape", kind: "practice", widget: "editor",
          body: "Try any entry point, type a few characters, then leave.",
          tryIt: "Press <code>i</code>, type a couple of words, then press <code>Escape</code>." },
        { id: "s3", title: "Why Escape matters", kind: "concept", widget: null,
          body: "Insert mode is the one place you can't casually run commands — so Vim makes returning to Normal mode a deliberate, single, memorable action. That round trip (out to insert, back to normal) is baked into how nearly every edit works." }
      ]},
      { id: "l3", title: "Visual mode", view: "editor", subsections: [
        { id: "s1", title: "Select first, then act", kind: "concept", widget: null,
          body: "<code>v</code> selects character by character, <code>V</code> selects whole lines, and <code>Ctrl-v</code> selects a rectangular block. Once something is selected, an operator like <code>d</code> or <code>y</code> acts on exactly that selection." },
        { id: "s2", title: "Practice: select, then delete", kind: "practice", widget: "editor",
          body: "Watch the selection highlight grow as you move.",
          tryIt: "Press <code>v</code>, move with <code>w</code> or <code>l</code> a few times, then press <code>d</code>." }
      ]},
      { id: "l4", title: "Command mode", view: "editor", subsections: [
        { id: "s1", title: "A line of its own", kind: "concept", widget: null,
          body: "Pressing <code>:</code> opens a command line at the bottom of the screen — a genuinely different kind of mode from the other three, since you're typing a whole instruction (<code>:w</code>, <code>:q</code>, <code>:wq</code>, <code>:set ...</code>) rather than moving or inserting text character by character." },
        { id: "s2", title: "Practice: open and close it", kind: "practice", widget: "editor",
          body: "You'll use this mode properly for search-and-replace in Module 6 — for now just get comfortable opening and closing it.",
          tryIt: "Press <code>:</code>, type <code>w</code>, then press Enter. Try <code>Escape</code> instead next time to cancel without running anything." }
      ]}
    ]},

    { id: "m2", title: "Basic Motions", checkpoint: { questions: [
        { text: "Which motion moves to the end of the current or next word?", options: ["w", "b", "e", "gg"], correct: 2 },
        { text: "What does a count like 5 do before a motion, e.g. 5w?", options: ["Repeats the motion 5 times", "Jumps to line 5", "Selects 5 characters", "Nothing special"], correct: 0 },
        { text: "What does % do?", options: ["Scrolls the view 50%", "Jumps to the matching bracket", "Repeats the last search", "Duplicates the current line"], correct: 1 }
      ]}, lessons: [
      { id: "l1", title: "h j k l — character motions", view: "game-cursorRacer", subsections: [
        { id: "s1", title: "Four keys instead of arrow keys", kind: "concept", widget: null,
          body: "<code>h</code> <code>j</code> <code>k</code> <code>l</code> move left/down/up/right one character at a time. They live on the home row specifically so your hands never have to leave it to reach for arrow keys." },
        { id: "s2", title: "Game: Cursor Racer", kind: "practice", widget: "game-cursorRacer",
          body: "Reach the marked square using only these four keys — try to beat your own keystroke count.",
          tryIt: "Fewest keystrokes wins, not just getting there eventually." }
      ]},
      { id: "l2", title: "w b e ge — word motions", view: "game-wordJumper", subsections: [
        { id: "s1", title: "Move by word, not by character", kind: "concept", widget: null,
          body: "<code>w</code> jumps to the start of the next word, <code>b</code> back to the start of the current/previous word, <code>e</code> to the end of the current/next word, and <code>ge</code> to the end of the previous word. These four cover moving through text far faster than stepping character by character." },
        { id: "s2", title: "Game: Word Jumper", kind: "practice", widget: "game-wordJumper",
          body: "Reach the highlighted target word using w, b, e, or ge — whichever gets you there in fewer moves." }
      ]},
      { id: "l3", title: "f F t T ; , — find motions", view: "game-characterSniper", subsections: [
        { id: "s1", title: "Jump straight to a character", kind: "concept", widget: null,
          body: "<code>f{char}</code> jumps forward onto the next occurrence of that character on the line; <code>F{char}</code> does the same backward. <code>t{char}</code>/<code>T{char}</code> stop just <i>before</i> it instead of on it. <code>;</code> repeats the last one, <code>,</code> repeats it in reverse." },
        { id: "s2", title: "Game: Character Sniper", kind: "practice", widget: "game-characterSniper",
          body: "Reach the target column using f, F, t, T, and their repeat keys ; and ,." }
      ]},
      { id: "l4", title: "gg G H M L — file-scale motions", view: "game-scrollSprint", subsections: [
        { id: "s1", title: "Jump across the whole file instantly", kind: "concept", widget: null,
          body: "<code>gg</code> jumps to the first line, <code>G</code> to the last — and a count in front of <code>G</code> (like <code>27G</code>) jumps to that exact line number. <code>H</code>, <code>M</code>, and <code>L</code> jump to the top, middle, and bottom of the visible screen." },
        { id: "s2", title: "Game: Scroll Sprint", kind: "practice", widget: "game-scrollSprint",
          body: "Reach the target line using gg, G, H, M, L — a count before G is usually the fastest route." }
      ]},
      { id: "l5", title: "% — matching", view: "game-bracketHunter", subsections: [
        { id: "s1", title: "Jump to a bracket's partner", kind: "concept", widget: null,
          body: "With the cursor on (or before) a bracket, <code>%</code> jumps straight to its matching partner — invaluable for finding your way around deeply nested code." },
        { id: "s2", title: "Game: Bracket Hunter", kind: "practice", widget: "game-bracketHunter",
          body: "Jump to the matching bracket using %. Try it from different starting brackets in the same snippet." }
      ]}
    ]}
  ];

  return { COURSE };
})();