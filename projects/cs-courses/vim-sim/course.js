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
    ]},

    { id: "m3", title: "Operators & the Grammar Engine", checkpoint: { questions: [
        { text: "What does the operator c do differently from d?", options: ["Nothing, they're identical", "c deletes and drops you into Insert mode; d just deletes", "c only works on whole lines", "c copies instead of deleting"], correct: 1 },
        { text: "In the command 2d3w, how many words are actually deleted?", options: ["2", "3", "5", "6"], correct: 3 },
        { text: "What does di\" do with the cursor inside \"hello world\"?", options: ["Deletes the whole line", "Deletes hello world but keeps the quotes", "Deletes the quotes but keeps the text", "Does nothing outside Visual mode"], correct: 1 },
        { text: "What's the real difference between an operator and a motion?", options: ["There is none, they're the same thing", "A motion alone just moves the cursor; combined with an operator first, it defines a range for that operator to act on", "Operators only work in Visual mode", "Motions can only be used with counts"], correct: 1 }
      ]}, lessons: [
      { id: "l1", title: "The grammar shape", view: "grammar", subsections: [
        { id: "s1", title: "One recipe for almost everything", kind: "concept", widget: null,
          body: "Nearly every Normal-mode edit follows the same shape: <code>[count] [\"register] [count] operator {motion-or-text-object}</code>. Learn the operators and the motions/text-objects separately, and you get every combination almost for free &mdash; <code>dw</code>, <code>d$</code>, <code>3dw</code>, <code>\"ade</code>, <code>di\"</code> are all the exact same recipe with different ingredients." },
        { id: "s2", title: "Watch the recipe fill in live", kind: "practice", widget: "grammar",
          body: "The panel below shows exactly what the parser has understood so far, updating with every keystroke &mdash; this is genuinely the same in-progress state the interpreter uses internally, not a separate illustration.",
          tryIt: "Type just <code>3</code> and watch the count slot fill in. Then add <code>d</code> and watch the operator slot fill in. Don't finish the command yet &mdash; just watch it build." },
        { id: "s3", title: "A motion alone is just a move", kind: "concept", widget: null,
          body: "If you type a motion with no operator first &mdash; just <code>w</code>, or <code>3j</code> &mdash; there's nothing to combine it with, so it simply moves the cursor. The exact same motion becomes something completely different the moment an operator precedes it." }
      ]},
      { id: "l2", title: "d, c, y — the core operators", view: "grammar", subsections: [
        { id: "s1", title: "Delete, change, and yank", kind: "concept", widget: null,
          body: "<code>d</code> deletes whatever the following motion covers. <code>c</code> does the same but then drops you straight into Insert mode at that spot &mdash; \"change\" really means \"delete, then let me type the replacement.\" <code>y</code> \"yanks\" (copies) the text into a register without deleting anything." },
        { id: "s2", title: "Practice: dw, d$, ce, y$", kind: "practice", widget: "grammar",
          body: "Try each of these on the seed buffer and watch both the buffer change and the grammar breakdown.",
          tryIt: "Try <code>dw</code> to delete a word, <code>d$</code> to delete to end of line, <code>ce</code> to change to the end of a word, and <code>y$</code> to yank to end of line." },
        { id: "s3", title: "Doubling an operator = whole line", kind: "concept", widget: null,
          body: "Pressing the same operator key twice &mdash; <code>dd</code>, <code>cc</code>, <code>yy</code> &mdash; is shorthand for \"apply this operator to the whole current line,\" since there's no separate motion needed when the operator already tells you the target." },
        { id: "s4", title: "Practice: dd and yy", kind: "practice", widget: "grammar",
          body: "These are two of the most-used commands in all of Vim.",
          tryIt: "Try <code>dd</code> to delete an entire line, then <code>u</code> to undo it, then <code>yy</code> followed by <code>p</code> to duplicate a line." }
      ]},
      { id: "l3", title: "Counts stack multiplicatively", view: "grammar", subsections: [
        { id: "s1", title: "A count before the operator AND before the motion", kind: "concept", widget: null,
          body: "Both <code>2d3w</code> and <code>6dw</code> delete exactly six words &mdash; a count typed before the operator and a count typed before the motion multiply together. This is why the grammar breakdown shows a count &times; count = total line whenever both are present." },
        { id: "s2", title: "Practice: build 2d3w one key at a time", kind: "practice", widget: "grammar",
          body: "Watch the count slot carefully as you type each character.",
          tryIt: "Type <code>2</code>, then <code>d</code>, then <code>3</code>, then <code>w</code> &mdash; one key at a time &mdash; and read the breakdown after each one." }
      ]},
      { id: "l4", title: "Text objects: acting on structure, not distance", view: "grammar", subsections: [
        { id: "s1", title: "i and a — inside vs. around", kind: "concept", widget: null,
          body: "A text object isn't a motion at all &mdash; it's a structural region. <code>i</code> means \"inside\" (the contents only), <code>a</code> means \"around\" (the contents plus its delimiters). <code>di\"</code> deletes the words inside a pair of quotes; <code>da\"</code> deletes the quotes too." },
        { id: "s2", title: "Practice: di\" vs da\", di( vs da(", kind: "practice", widget: "grammar",
          body: "The seed buffer's <code>\"Hello, \" + name</code> line is a good place to try this.",
          tryIt: "Put the cursor inside the quoted string and try <code>di\"</code>, undo, then try <code>da\"</code> and compare what's left." },
        { id: "s3", title: "Why this beats counting characters", kind: "concept", widget: null,
          body: "Without text objects you'd have to count exactly how many characters to delete by hand. With <code>ci(</code> or <code>dip</code>, Vim finds the boundary for you &mdash; it works no matter how long the word, string, or paragraph turns out to be." }
      ]},
      { id: "l5", title: "Registers, and the case/indent operators", view: "grammar", subsections: [
        { id: "s1", title: "Naming where deleted or yanked text goes", kind: "concept", widget: null,
          body: "Prefixing a command with <code>\"a</code> (or any letter a&ndash;z) sends the deleted/yanked text to that named register instead of the default unnamed one, so it survives later deletes. <code>\"ayy</code> yanks a line into register a; <code>\"ap</code> pastes it back later." },
        { id: "s2", title: "Practice: yank into a named register", kind: "practice", widget: "grammar",
          body: "Watch the register slot in the breakdown fill in as soon as you type the register letter &mdash; before you've even chosen an operator yet.",
          tryIt: "Try <code>\"ayy</code> to yank a line into register a, move elsewhere, then <code>\"ap</code> to paste it back." },
        { id: "s3", title: "Indent and case operators", kind: "concept", widget: null,
          body: "<code>&gt;&gt;</code> and <code>&lt;&lt;</code> indent/unindent the current line. <code>g~</code>, <code>gu</code>, and <code>gU</code> toggle, lowercase, or uppercase whatever the following motion covers &mdash; e.g. <code>gU$</code> uppercases to the end of the line." },
        { id: "s4", title: "Practice: gU$ and g~~", kind: "practice", widget: "grammar",
          body: "Case operators follow the exact same operator+motion grammar as d/c/y.",
          tryIt: "Try <code>gU$</code> to uppercase to end of line, then <code>g~~</code> (or <code>g~g~</code>) to toggle the case of the whole line back." }
      ]}
    ]}
  ];

  return { COURSE };
})();