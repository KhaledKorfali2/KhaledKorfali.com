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
    ]},

    { id: "m4", title: "Text Objects", checkpoint: { questions: [
        { text: "What's the fundamental difference between a motion and a text object?", options: ["There is none", "A motion moves relative to the cursor's current position; a text object identifies a structural region (a word, a quoted string, a bracket pair) regardless of exactly where in it the cursor sits", "Text objects only work in Insert mode", "Motions are always linewise, text objects never are"], correct: 1 },
        { text: "Given the cursor anywhere inside (value + 1), what does di( select?", options: ["The entire line", "Just the word under the cursor", "value + 1, without the parentheses", "The parentheses themselves"], correct: 2 },
        { text: "What makes dap different from dip?", options: ["dap deletes the paragraph AND the following blank line separating it from the next paragraph; dip deletes only the paragraph's own lines", "They are exactly identical", "dap only works at the start of a file", "dip deletes every paragraph in the buffer"], correct: 0 },
        { text: "Why is a text object generally more reliable than counting characters or words by hand?", options: ["It isn't, it's just shorter to type", "It finds the real structural boundary (matching quote, matching bracket, blank-line paragraph edge) regardless of how long the content turns out to be", "Text objects can only be used with y, never with d or c", "Text objects ignore where the cursor is entirely"], correct: 1 }
      ]}, lessons: [
      { id: "l1", title: "iw / aw — word objects", view: "textobjects", subsections: [
        { id: "s1", title: "The word you're inside, not the word you'd move to", kind: "concept", widget: null,
          body: "<code>iw</code> selects the word the cursor is currently touching, wherever in it the cursor happens to sit &mdash; unlike <code>w</code>/<code>b</code>/<code>e</code>, which move relative to the cursor's exact position. <code>aw</code> adds the trailing (or leading) whitespace, so deleting it doesn't leave a double space behind." },
        { id: "s2", title: "Explore: watch the highlight as you move", kind: "practice", widget: "textobjects",
          body: "The highlighted region below is computed by the exact same resolver the real editor uses for <code>diw</code>/<code>daw</code> &mdash; it just isn't executing anything yet.",
          tryIt: "With \"word\" selected above, move the cursor letter by letter through a word with <code>l</code> and watch the highlight stay put until you cross into the next word. Then toggle inside/around and watch the trailing space join the selection." }
      ]},
      { id: "l2", title: "Quotes and brackets", view: "textobjects", subsections: [
        { id: "s1", title: "i\" / a\" and i( / a( / i[ / a[ / i{ / a{", kind: "concept", widget: null,
          body: "Inside a pair of quotes or brackets, <code>i\"</code>/<code>i(</code>/<code>i[</code>/<code>i{</code> select only the contents; the <code>a</code> form includes the delimiters themselves. This works no matter where the cursor sits inside the pair &mdash; right after the opening quote or right before the closing one, the result is identical." },
        { id: "s2", title: "Explore: quotes & parens demo", kind: "practice", widget: "textobjects",
          body: "Load the Quotes & Parens demo buffer below, then switch between the quote and bracket kinds.",
          tryIt: "Click \"Quotes & Parens\", select the &quot; kind and watch the string highlight, then switch to ( and move the cursor into the parentheses on the return line." },
        { id: "s3", title: "Why the cursor position inside the pair doesn't matter", kind: "concept", widget: null,
          body: "A word motion depends heavily on exactly where the cursor is. A text object instead searches outward for the enclosing delimiter pair first, then reports the whole region &mdash; that's what makes <code>ci\"</code> reliable no matter which character you happen to be standing on when you trigger it." }
      ]},
      { id: "l3", title: "Paragraphs", view: "textobjects", subsections: [
        { id: "s1", title: "ip / ap — blank lines are the boundary", kind: "concept", widget: null,
          body: "A paragraph, in Vim's terms, is a run of non-blank lines. <code>ip</code> selects just those lines; <code>ap</code> also swallows one adjacent blank line, so repeatedly deleting a paragraph with <code>dap</code> cleanly removes the gap between what used to be its neighbors too." },
        { id: "s2", title: "Explore: the paragraphs demo", kind: "practice", widget: "textobjects",
          body: "Load the Paragraphs demo, select the paragraph kind, and move the cursor between the three paragraphs.",
          tryIt: "Toggle inside/around while sitting inside the second paragraph and watch whether the blank line above or below joins the highlight." }
      ]},
      { id: "l4", title: "Tags", view: "textobjects", subsections: [
        { id: "s1", title: "it / at — structure-aware, not just character-aware", kind: "concept", widget: null,
          body: "In HTML/JSX-like text, <code>it</code> selects the content between a tag's opening and closing pair; <code>at</code> includes the tags themselves. The resolver finds the nearest enclosing tag pair around the cursor, so it works correctly even with nested tags." },
        { id: "s2", title: "Explore: the HTML tag demo", kind: "practice", widget: "textobjects",
          body: "Load the HTML Tag demo and try the tag kind from a few different starting positions.",
          tryIt: "With the cursor inside &lt;b&gt;world&lt;/b&gt;, compare <code>it</code> vs <code>at</code>, then move the cursor out to the surrounding &lt;p&gt; and compare again." }
      ]},
      { id: "l5", title: "Text objects + operators, together", view: "grammar", subsections: [
        { id: "s1", title: "Same grammar, more precise targets", kind: "concept", widget: null,
          body: "Everything from Module 3 still applies &mdash; a text object simply fills the \"motion\" slot in <code>[count][\"register]operator{motion}</code> with something structural instead of something distance-based. <code>ci\"</code>, <code>dap</code>, <code>yit</code>, and <code>d3aw</code> are all the same recipe as <code>dw</code>, just with a sharper target." },
        { id: "s2", title: "Practice: watch the full grammar breakdown", kind: "practice", widget: "grammar",
          body: "This is Module 3's breakdown widget again, now with text objects in the mix &mdash; watch the \"motion / object\" slot specifically.",
          tryIt: "Type <code>ci(</code> one key at a time and read the operator and target slots after each key." },
        { id: "s3", title: "Practice: explore the boundary first, then commit", kind: "practice", widget: "textobjects",
          body: "A good habit while learning: preview the text object's boundary here first, then go execute the real command with confidence.",
          tryIt: "Pick a text-object kind and scope here, confirm the highlighted region is what you expect, then switch to the editor and run the matching d/c/y command for real." }
      ]}
    ]},

    { id: "m5", title: "Registers", checkpoint: { questions: [
        { text: "If you type dw with no register specified, where does the deleted text go?", options: ["Nowhere, it's lost", "Only into register \"1", "Into the unnamed register (and, for a delete, also register \"1)", "Into register \"0"], correct: 2 },
        { text: "What's specifically different about register \"0 compared to \"1-\"9?", options: ["Nothing, they behave identically", "\"0 only ever holds the most recent yank; \"1-\"9 form a ring of recent deletes/changes that shifts down each time", "\"0 is read-only", "\"0 can't be pasted from"], correct: 1 },
        { text: "You run \"add three separate times. What ends up in register \"a?", options: ["All three deleted lines, concatenated", "Only the line from the third \"add — each one overwrites the register", "Nothing, \"a can only be filled once per session", "An error, since \"a was already in use"], correct: 1 },
        { text: "What happens to text deleted with \"_dd?", options: ["It goes to the unnamed register as normal", "It's discarded entirely — the black hole register never stores anything", "It goes to register \"0", "It's appended to register \"1"], correct: 1 }
      ]}, lessons: [
      { id: "l1", title: "The unnamed register", view: "registers", subsections: [
        { id: "s1", title: "Where everything goes by default", kind: "concept", widget: null,
          body: "Every delete, change, or yank that doesn't name a register explicitly still lands somewhere: the unnamed register, written <code>\"\"</code>. It's what <code>p</code> and <code>P</code> read from by default, which is exactly why yanking or deleting something new silently replaces whatever you were about to paste." },
        { id: "s2", title: "Practice: watch the unnamed register update", kind: "practice", widget: "registers",
          body: "The table below is live &mdash; it's reading the exact same register data the editor pastes from, not a separate simulation.",
          tryIt: "Try <code>yy</code>, then <code>dw</code>, then <code>p</code> &mdash; watch the unnamed row change each time, and notice which one <code>p</code> actually pastes." }
      ]},
      { id: "l2", title: "Numbered registers 0\u20139 — the yank slot and the delete ring", view: "registers", subsections: [
        { id: "s1", title: "\"0 remembers your last yank specifically", kind: "concept", widget: null,
          body: "A delete overwrites the unnamed register too, which is the classic trap: yank a line, delete a different one to reposition it, then <code>p</code> pastes the delete instead of your yank. Register <code>\"0</code> is the escape hatch &mdash; it only ever holds the most recent <i>yank</i>, immune to deletes in between." },
        { id: "s2", title: "\"1 through \"9 — a shifting ring of recent deletes", kind: "concept", widget: null,
          body: "Every unnamed delete/change also pushes into <code>\"1</code>, and the previous <code>\"1</code> slides down to <code>\"2</code>, and so on up to <code>\"9</code> falling off the end. That means <code>\"3p</code> can paste something you deleted three operations ago." },
        { id: "s3", title: "Practice: yank, then delete around it, then \"0p", kind: "practice", widget: "registers",
          body: "This is the exact scenario the yank register solves.",
          tryIt: "Yank a line with <code>yy</code>, move elsewhere and delete a different line with <code>dd</code>, then compare plain <code>p</code> against <code>\"0p</code>." },
        { id: "s4", title: "Practice: watch the ring shift", kind: "practice", widget: "registers",
          body: "Delete several different lines in a row and watch \"1 push everything else down.",
          tryIt: "Run <code>dd</code> four or five times on different lines and watch \"1 through \"4 fill in and shift each time." }
      ]},
      { id: "l3", title: "Named registers a\u2013z", view: "registers", subsections: [
        { id: "s1", title: "Deliberate, persistent slots you control", kind: "concept", widget: null,
          body: "Prefixing any operator with <code>\"a</code> through <code>\"z</code> sends that text to a register of your choosing, which nothing else silently overwrites &mdash; unlike the unnamed register, it survives as many other edits as you like until you deliberately reuse that same letter." },
        { id: "s2", title: "Uppercase appends instead of overwriting", kind: "concept", widget: null,
          body: "An uppercase register name (<code>\"A</code> instead of <code>\"a</code>) appends to whatever's already in that register instead of replacing it &mdash; a linewise append inserts a newline between the old and new text automatically, so <code>\"ayy</code> then later <code>\"Ayy</code> on a different line builds up a two-line register a." },
        { id: "s3", title: "Practice: build up a register with appends", kind: "practice", widget: "registers",
          body: "Watch register a's content grow in the table below as you append to it.",
          tryIt: "Try <code>\"ayy</code> on one line, move to a different line, then <code>\"Ayy</code> to append it &mdash; the register a row will show both lines joined together." },
        { id: "s4", title: "Practice: keep several registers going at once", kind: "practice", widget: "registers",
          body: "Different letters are completely independent of each other, so you can stage several pieces of text simultaneously.",
          tryIt: "Try <code>\"ayy</code> on one line and <code>\"bdw</code> on a word elsewhere &mdash; both a and b will show up in the named-registers section at the same time." }
      ]},
      { id: "l4", title: "The black hole register, and the clipboard registers", view: "registers", subsections: [
        { id: "s1", title: "\"_ — delete without disturbing anything", kind: "concept", widget: null,
          body: "Sometimes you want to delete text purely to get rid of it, without clobbering the unnamed register you're about to paste from. <code>\"_dd</code> routes the deletion into the black hole register, which discards it immediately &mdash; nothing is stored, and nothing else changes." },
        { id: "s2", title: "Practice: delete without disturbing a pending paste", kind: "practice", widget: "registers",
          body: "This is the pattern the black hole register exists for.",
          tryIt: "Yank a line with <code>yy</code>, then delete a different line with <code>\"_dd</code> instead of plain <code>dd</code>, then confirm <code>p</code> still pastes your original yank." },
        { id: "s3", title: "\"+ and \"* — the (simulated) system clipboard", kind: "concept", widget: null,
          body: "In a real terminal or GUI Vim, <code>\"+</code> and <code>\"*</code> read and write your operating system's clipboard, letting you copy between Vim and other applications. Since this simulator runs entirely inside the browser tab, it can't reach the real OS clipboard &mdash; here they're practice-only stand-ins that behave like an ordinary named register." }
      ]}
    ]},

    { id: "m6", title: "Search & Substitute", checkpoint: { questions: [
        { text: "What does typing /hello and pressing Enter do?", options: ["Inserts the text 'hello' at the cursor", "Jumps the cursor forward to the next occurrence of 'hello' in the buffer", "Replaces the word under the cursor with 'hello'", "Opens a new file named hello"], correct: 1 },
        { text: "After a forward search, what does N do (as opposed to n)?", options: ["Repeats the search in the same direction", "Repeats the search in the opposite direction", "Starts a brand new search", "Nothing, N is only for backward searches"], correct: 1 },
        { text: "What's the key difference between * and a plain /word search?", options: ["There is none", "* automatically grabs the word under the cursor and matches it as a whole word, so it won't match that word as part of a longer one", "* only searches backward", "* only works on the first line of the buffer"], correct: 1 },
        { text: "In :%s/foo/bar/g, what does the g flag control, and what does % control?", options: ["g means 'global program'; % means 'percent match'", "g replaces every match on a line instead of just the first; % extends the scope from the current line to the whole buffer", "g and % do the same thing, redundantly", "g reverses the search direction; % repeats it"], correct: 1 },
        { text: "What does d/foo<Enter> do?", options: ["Nothing — search motions can't be combined with operators", "Deletes from the cursor up to (but not including) the next occurrence of 'foo'", "Deletes the entire line containing 'foo'", "Searches for 'foo' without deleting anything"], correct: 1 }
      ]}, lessons: [
      { id: "l1", title: "Searching forward and backward", view: "search", subsections: [
        { id: "s1", title: "/ and ? jump the cursor to a match", kind: "concept", widget: null,
          body: "<code>/pattern</code> followed by Enter moves the cursor to the next occurrence of <code>pattern</code> below it; <code>?pattern</code> does the same searching upward instead. Search wraps around the ends of the buffer, just like real Vim, and tells you when it does." },
        { id: "s2", title: "Practice: search forward and backward", kind: "practice", widget: "search",
          body: "The panel below updates live as you type the pattern &mdash; watch the match count change before you even press Enter.",
          tryIt: "Type <code>/</code> then a word that appears in the buffer, and press Enter. Then try <code>?</code> with a different word." }
      ]},
      { id: "l2", title: "Repeating a search with n and N", view: "search", subsections: [
        { id: "s1", title: "Don't retype the pattern every time", kind: "concept", widget: null,
          body: "Once you've searched for something, <code>n</code> jumps to the next occurrence in the same direction you originally searched, and <code>N</code> jumps the opposite way &mdash; useful for stepping through every match one at a time without retyping the pattern." },
        { id: "s2", title: "Practice: step through every match", kind: "practice", widget: "search",
          body: "The \"last search\" line in the panel shows exactly what n/N will repeat.",
          tryIt: "Search for something that appears three or four times, then press <code>n</code> repeatedly to visit each one, and <code>N</code> to go back." }
      ]},
      { id: "l3", title: "* and # — search the word under the cursor", view: "search", subsections: [
        { id: "s1", title: "No typing required", kind: "concept", widget: null,
          body: "<code>*</code> grabs whatever word the cursor is currently on and searches forward for the next whole-word occurrence of it &mdash; no typing needed. <code>#</code> does the same thing searching backward. Because it matches whole words only, searching for <code>cat</code> this way will skip right past <code>category</code>." },
        { id: "s2", title: "Practice: jump between occurrences of a word", kind: "practice", widget: "search",
          body: "Put the cursor on any word that repeats in the buffer.",
          tryIt: "Move the cursor onto a word, press <code>*</code>, and watch it land on the next real occurrence of that exact word &mdash; then try <code>#</code> to go backward." },
        { id: "s3", title: "Search motions work as operator targets too", kind: "concept", widget: null,
          body: "Every search motion in this lesson doubles as a target for an operator: <code>d/foo</code> deletes up to (but not including) the next \"foo\", <code>c?bar</code> changes backward to the previous \"bar\", and <code>dn</code>, <code>d*</code>, <code>y#</code> all combine an operator with whichever search motion follows. They're exclusive motions, exactly like <code>w</code> or <code>e</code> &mdash; the character actually landed on isn't included in what the operator acts on." },
        { id: "s4", title: "Practice: delete or change up to a search match", kind: "practice", widget: "search",
          body: "This combines everything from Module 3 (operators) with what you just learned here.",
          tryIt: "Try <code>d/</code> followed by a word further down the buffer and Enter, then try <code>c*</code> with the cursor on a repeated word." }
      ]},
      { id: "l4", title: "Substituting text with :s and :%s", view: "search", subsections: [
        { id: "s1", title: "Find-and-replace, with a precise scope", kind: "concept", widget: null,
          body: "<code>:s/pattern/replacement/</code> replaces the first match on the current line. Adding <code>%</code> before the <code>s</code> (<code>:%s/.../.../</code>) extends the scope to the entire buffer. Adding <code>g</code> at the end replaces every match on a line instead of stopping at the first." },
        { id: "s2", title: "Practice: watch the breakdown before you commit", kind: "practice", widget: "search",
          body: "The scope/pattern/replacement/flags breakdown below is reading your command line live, using the exact same parsing the real substitution runs on &mdash; so the substitution count shown is exactly what will happen when you press Enter.",
          tryIt: "Type <code>:s/foo/bar/</code> replacing 'foo' with a word that's actually in the buffer, and watch the breakdown fill in before you press Enter. Then try adding <code>%</code> and <code>g</code> and see how the match count changes." }
      ]}
    ]},

    { id: "m7", title: "Macros", checkpoint: { questions: [
        { text: "What does qa do?", options: ["Replays whatever is stored in register a", "Starts recording every keystroke into register a, until q is pressed again", "Quits the editor", "Jumps to mark a"], correct: 1 },
        { text: "Once a macro is recorded into register a, how do you run it?", options: ["ra", "@a", "qa again", "It runs automatically on the next keystroke"], correct: 1 },
        { text: "What does @@ do?", options: ["Replays register @ specifically", "Repeats whichever macro you most recently replayed, no matter which register it was in", "Starts recording a new macro", "Nothing, it's not a valid command"], correct: 1 },
        { text: "What does 5@a do?", options: ["Replays register a's macro once, and the 5 is ignored", "Replays register a's macro five times in a single command", "Jumps to line 5 and then replays register a", "Records over register a five times"], correct: 1 }
      ]}, lessons: [
      { id: "l1", title: "Recording a macro", view: "macros", subsections: [
        { id: "s1", title: "A macro is just your keystrokes, remembered", kind: "concept", widget: null,
          body: "<code>q</code> followed by a register letter (<code>qa</code>) starts recording &mdash; from that point on, every key you press is captured verbatim into that register, until you press <code>q</code> again to stop. There's no special macro language to learn: if you can type it once, you can record it." },
        { id: "s2", title: "Practice: record your first macro", kind: "practice", widget: "macros",
          body: "Watch the keys appear live in the transcript below as you type them &mdash; this is reading the exact same list the interpreter is building internally, not a separate log.",
          tryIt: "Press <code>qa</code> to start recording into register a, type a few motions or edits (like <code>dw</code> or <code>A;</code><code>Escape</code>), then press <code>q</code> to stop." }
      ]},
      { id: "l2", title: "Replaying with @{register} and @@", view: "macros", subsections: [
        { id: "s1", title: "@a runs it back, exactly", kind: "concept", widget: null,
          body: "<code>@a</code> replays every key stored in register a, in order, as if you'd typed them again right now &mdash; including any motions, operators, or mode switches. <code>@@</code> repeats whichever macro you most recently replayed, which is handy for firing the same one several times without remembering its letter." },
        { id: "s2", title: "Practice: replay what you just recorded", kind: "practice", widget: "macros",
          body: "Use the buttons below, or type <code>@a</code> and <code>@@</code> directly in the editor &mdash; both paths run through the exact same replay logic.",
          tryIt: "Click \"replay\" on the macro you recorded, move the cursor to a different line, then try typing <code>@@</code> to repeat it there." }
      ]},
      { id: "l3", title: "Stepping through a macro key by key", view: "macros", subsections: [
        { id: "s1", title: "Why watch it in slow motion", kind: "concept", widget: null,
          body: "A macro that misbehaves usually does so because one specific keystroke landed somewhere unexpected &mdash; maybe a motion overshot, or a text object didn't match on a differently-shaped line. Stepping through one key at a time, watching the editor after each one, is the fastest way to find exactly which keystroke is the problem." },
        { id: "s2", title: "Practice: step through your macro", kind: "practice", widget: "macros",
          body: "\"Step through\" arms one key at a time; \"next key\" runs the real interpreter for just that key, so what you see is exactly what would happen during a full replay &mdash; just paused between keystrokes.",
          tryIt: "Click \"step through\" on a saved macro, then \"next key\" repeatedly and watch both the key highlighting and the editor update after each press." }
      ]},
      { id: "l4", title: "A count before @ — repeating N times in one go", view: "macros", subsections: [
        { id: "s1", title: "3@a replays three times", kind: "concept", widget: null,
          body: "Prefixing a macro replay with a count runs it that many times in a single command, so <code>3@a</code> runs register a's macro three times in a row &mdash; extremely handy for \"do this edit on the next N lines\" without repeating the keystroke yourself." },
        { id: "s2", title: "A count works on @@ too", kind: "concept", widget: null,
          body: "The same count prefix applies to <code>@@</code>: after any replay, <code>3@@</code> repeats that same macro three more times, without needing to remember or retype its register letter." },
        { id: "s3", title: "Practice: repeat a macro across several lines in one command", kind: "practice", widget: "macros",
          body: "Record a macro that edits a line and then moves down, then fire it several times at once instead of pressing @a repeatedly.",
          tryIt: "Record a small macro that edits a line and then moves down with <code>j</code>, then type <code>4@a</code> to march it down the buffer four times in one command." }
      ]}
    ]},

    { id: "m8", title: "Buffers, Windows & Tabs", checkpoint: { questions: [
        { text: "What's the difference between a buffer and a window?", options: ["They're the same thing, just different names", "A buffer is the actual text content in memory; a window is just a viewport showing some buffer — the same buffer can even appear in two windows at once", "A window can only ever show one specific buffer forever", "A buffer is a type of window"], correct: 1 },
        { text: "What does :bn do?", options: ["Creates a brand-new buffer", "Switches to the next buffer in the list", "Splits the window", "Opens a new tab"], correct: 1 },
        { text: "What's the difference between :split and :vsplit?", options: ["There is no difference", ":split stacks windows top and bottom; :vsplit puts them side by side left and right", ":split is for buffers, :vsplit is for tabs", ":vsplit only works with named buffers"], correct: 1 },
        { text: "What's the relationship between a tab and a window in Vim?", options: ["A tab is a single, larger window", "A tab holds its own independent arrangement of one or more windows — think of a tab as a whole workspace layout, not a single view", "Tabs and windows are unrelated features", "You can only have one window per tab"], correct: 1 },
        { text: "Are registers shared across different buffers, or separate per buffer?", options: ["Separate — each buffer has its own registers", "Shared globally — a yank in one buffer is still available after switching to a completely different buffer", "Shared only within the same tab", "Shared only between split windows"], correct: 1 }
      ]}, lessons: [
      { id: "l1", title: "Buffers: more than one file in memory at once", view: "buffers", subsections: [
        { id: "s1", title: "A buffer is just text in memory", kind: "concept", widget: null,
          body: "Every file you open in Vim becomes a buffer &mdash; the in-memory text content, completely independent of whether it's currently visible anywhere. You can have a dozen buffers open with only one actually on screen at a time." },
        { id: "s2", title: "Practice: open a second buffer", kind: "practice", widget: "buffers",
          body: "The panel below is reading the real buffer registry &mdash; switching, editing, and coming back genuinely preserves each buffer's own content.",
          tryIt: "Type <code>:enew</code> to create a fresh empty buffer, type a few characters into it, then switch back with <code>:b1</code> and confirm your original buffer is untouched." },
        { id: "s3", title: "Naming buffers with :e", kind: "concept", widget: null,
          body: "<code>:e somename</code> opens a buffer by that name &mdash; if a buffer with that exact name already exists, you switch straight to it; if not, a fresh empty one is created under that name. There's no real filesystem here, so \"opening\" a name always means an in-memory buffer, not reading an actual file." },
        { id: "s4", title: "Practice: cycle through buffers", kind: "practice", widget: "buffers",
          body: "Once you have a few buffers open, you rarely need to remember their exact numbers.",
          tryIt: "Create two or three buffers with <code>:e name</code>, then use <code>:bn</code> and <code>:bp</code> to cycle through all of them in order." }
      ]},
      { id: "l2", title: "Windows: viewing buffers side by side", view: "buffers", subsections: [
        { id: "s1", title: "A window is a viewport, not a copy", kind: "concept", widget: null,
          body: "Splitting the screen doesn't duplicate anything &mdash; each window is just a view onto some buffer. Two windows can even show the very same buffer at once, which is handy for looking at two different parts of one long file simultaneously." },
        { id: "s2", title: "Horizontal vs. vertical splits", kind: "concept", widget: null,
          body: "<code>Ctrl-w s</code> (or <code>:split</code>) splits horizontally &mdash; windows stacked top and bottom. <code>Ctrl-w v</code> (or <code>:vsplit</code>) splits vertically &mdash; windows side by side. Either can optionally take a buffer name to show something different in the new window instead of duplicating the current one." },
        { id: "s3", title: "Practice: split and move between windows", kind: "practice", widget: "buffers",
          body: "The inactive window's content below is genuinely read from that window's own buffer &mdash; it isn't a placeholder.",
          tryIt: "Press <code>Ctrl-w s</code> to split, then <code>Ctrl-w w</code> to hop between the two windows, then <code>Ctrl-w c</code> to close one." },
        { id: "s4", title: "A scope note on this simulator", kind: "concept", widget: null,
          body: "Real Vim allows arbitrarily nested splits &mdash; a vertical split where one side is further split horizontally, and so on, forming a tree. This simulator keeps things simpler: every window in a given tab shares one split direction at a time. It's enough to genuinely practice the core keys and commands, just not arbitrarily complex layouts." },
        { id: "s5", title: "Practice: :only to simplify", kind: "practice", widget: "buffers",
          body: "When a layout gets cluttered, this is the fastest way back to one window.",
          tryIt: "With two or three windows open, type <code>:only</code> and watch the layout collapse to just the active one." }
      ]},
      { id: "l3", title: "Tabs: whole workspace layouts", view: "buffers", subsections: [
        { id: "s1", title: "A tab holds its own window arrangement", kind: "concept", widget: null,
          body: "A tab isn't a single view &mdash; it's an entire saved arrangement of windows. Switching tabs with <code>gt</code>/<code>gT</code> swaps out the whole layout at once, which is useful for keeping, say, \"editing\" split one way in one tab and \"reference\" split another way in a second tab." },
        { id: "s2", title: "Practice: work across two tabs", kind: "practice", widget: "buffers",
          body: "Each tab keeps its own window layout completely independently.",
          tryIt: "Type <code>:tabnew</code> to open a second tab, edit something there, then press <code>gT</code> to go back to the first tab and confirm nothing there changed." },
        { id: "s3", title: "What's actually shared across all of this", kind: "concept", widget: null,
          body: "Buffers, windows, and tabs all organize how you SEE and navigate text &mdash; but registers and macros stay completely global no matter which buffer, window, or tab is active. Yank something in one buffer, switch to a totally different one, and it's still sitting there ready to paste." }
      ]}
    ]},

    { id: "m9", title: "Marks & the Undo Tree", checkpoint: { questions: [
        { text: "What's the difference between a lowercase mark and an uppercase mark?", options: ["There's no real difference, just a style choice", "Lowercase marks (a-z) are local to the buffer they were set in; uppercase marks (A-Z) are global and can jump you into a different buffer entirely", "Uppercase marks are temporary, lowercase marks are permanent", "Lowercase marks only work with operators"], correct: 1 },
        { text: "What's the difference between 'a and `a?", options: ["They're identical", "'a jumps to the first non-blank character of the mark's line; `a jumps to the mark's exact column", "'a only works with operators, `a only works standalone", "`a is for uppercase marks only"], correct: 1 },
        { text: "After undoing twice and then making a brand-new edit, what happens to the two changes you undid?", options: ["They're permanently lost, exactly like a normal undo stack", "They're preserved as a separate branch in the undo tree — you can still reach them, just not by pressing Ctrl-r from here", "They get merged into the new edit automatically", "Vim asks you to choose which one to keep"], correct: 1 },
        { text: "After undoing and branching, which direction does Ctrl-r (redo) follow?", options: ["Always the oldest branch at that point", "Always the newest branch — whichever child was created most recently", "It asks you to pick", "It's random"], correct: 1 }
      ]}, lessons: [
      { id: "l1", title: "Marks: bookmarking a position", view: "marks", subsections: [
        { id: "s1", title: "m sets, ' and ` jump", kind: "concept", widget: null,
          body: "<code>m</code> followed by a letter drops a bookmark at the cursor. <code>'{letter}</code> jumps to that bookmark's line (landing on the first non-blank character); <code>\\`{letter}</code> jumps to the exact row and column instead." },
        { id: "s2", title: "Practice: set and jump to a mark", kind: "practice", widget: "marks",
          body: "The panel below reads the real marks data &mdash; nothing here is a separate illustration.",
          tryIt: "Move the cursor somewhere, press <code>ma</code>, move elsewhere, then press <code>'a</code> and <code>\\`a</code> and compare where each one lands." },
        { id: "s3", title: "Marks work as operator motions too", kind: "concept", widget: null,
          body: "Just like search motions, marks can be an operator's target: <code>d'a</code> deletes whole lines from here down to (or up to) mark a's line; <code>d\\`a</code> deletes the exact exclusive range between the cursor and mark a." },
        { id: "s4", title: "Practice: delete or yank up to a mark", kind: "practice", widget: "marks",
          body: "This combines directly with everything from Module 3.",
          tryIt: "Set a mark a few lines down with <code>ma</code>, move back to the top, then try <code>d'a</code> and undo, then try <code>y\\`a</code>." }
      ]},
      { id: "l2", title: "Global marks: bookmarks that cross buffers", view: "marks", subsections: [
        { id: "s1", title: "Uppercase marks aren't tied to one buffer", kind: "concept", widget: null,
          body: "A lowercase mark only makes sense inside the buffer it was set in &mdash; switch buffers and it's simply not there anymore. An uppercase mark instead remembers exactly which buffer it belongs to, so jumping to it from anywhere else switches you straight to that buffer and lands on the exact spot." },
        { id: "s2", title: "Practice: bookmark across buffers", kind: "practice", widget: "marks",
          body: "Global marks show which buffer they belong to right in the list below, and are flagged when they're not in the buffer you're currently viewing.",
          tryIt: "Press <code>mA</code> here, open a second buffer with <code>:enew</code>, then press <code>\\`A</code> and watch it jump you back, buffer switch included." }
      ]},
      { id: "l3", title: "Undo as a tree, not a line", view: "undotree", subsections: [
        { id: "s1", title: "Undoing doesn't erase the future — until you overwrite it", kind: "concept", widget: null,
          body: "Most editors treat undo history as a straight line: undo twice, then type something new, and the two changes you undid are gone for good. Vim doesn't do this &mdash; undoing and then editing creates a new <i>branch</i>, leaving the path you stepped back from completely intact, just no longer the one <code>Ctrl-r</code> follows by default." },
        { id: "s2", title: "Practice: watch a branch form", kind: "practice", widget: "undotree",
          body: "This diagram is drawing the real, actual undo tree, not a staged example &mdash; every node is a genuine snapshot of the buffer at that point.",
          tryIt: "Make an edit, undo it, then make a DIFFERENT edit. Watch a second branch appear in the diagram instead of your first edit disappearing." },
        { id: "s3", title: "Ctrl-r always follows the newest branch", kind: "concept", widget: null,
          body: "When a node has more than one child (a branch point), <code>Ctrl-r</code> always replays the most recently created one. The diagram highlights exactly which path that is &mdash; the older branch is still sitting there, just one click away instead of one redo away." },
        { id: "s4", title: "Practice: time-travel to any point directly", kind: "practice", widget: "undotree",
          body: "You're not limited to stepping one undo/redo at a time here &mdash; click any node to jump straight to it.",
          tryIt: "Build up a few branches, then click directly on an old node in the middle of the tree and watch the editor snap straight to that exact historical state." }
      ]}
    ]},

    { id: "m10", title: "Capstone: Vim Golf & Boss Battles", checkpoint: { questions: [
        { text: "In Vim Golf, what determines your score?", options: ["How much time you spend thinking before typing", "The total number of keystrokes used to transform the starting text into the target text", "Whether you use the mouse at all", "The number of lines in the buffer"], correct: 1 },
        { text: "What does 'par' represent?", options: ["The maximum keystrokes allowed before you fail", "A reference keystroke count — beating it earns a better grade, matching or exceeding it still earns a fair one", "The number of lines you need to edit", "A random target with no real meaning"], correct: 1 },
        { text: "What makes a Boss Battle different from a regular golf puzzle here?", options: ["Nothing, they're identical", "A Boss Battle is deliberately designed to require combining several different technique families — registers, text objects, macros, search — rather than just one", "Boss Battles don't use real Vim commands", "Boss Battles can only be solved with the mouse"], correct: 1 },
        { text: "Why does Vim Golf use the full real editor instead of the restricted key sets from the earlier motion-practice games?", options: ["It's a mistake, they should be restricted too", "Because transforming arbitrary text into arbitrary text genuinely needs operators, text objects, registers, and macros — not just motions — so nothing short of the real interpreter would work", "Because golf puzzles don't actually check your work", "Restricted key sets are always better for teaching"], correct: 1 }
      ]}, lessons: [
      { id: "l1", title: "What Vim Golf actually measures", view: "golf", subsections: [
        { id: "s1", title: "Fewest keystrokes wins", kind: "concept", widget: null,
          body: "Every puzzle gives you a starting buffer and an exact target &mdash; your only job is to make them match, in as few keystrokes as possible. There's no restricted command set here: this is the real editor you've been using this whole course, so anything you've learned is fair game." },
        { id: "s2", title: "Par, and the E through SSS grading", kind: "concept", widget: null,
          body: "Each puzzle has a <b>par</b> &mdash; a reference keystroke count. Beat it comfortably and you'll earn SSS or S; take roughly twice as long and you'll land around C; well beyond that and it's a D or E. There's no penalty for a low grade beyond the grade itself &mdash; solving it at all is the real milestone." },
        { id: "s3", title: "Practice: your first three puzzles", kind: "practice", widget: "golf",
          body: "Start with the first three &mdash; each is built around a single technique from earlier in the course.",
          tryIt: "Try \"Delete a word\", \"Change a word\", and \"Empty the quotes\" &mdash; look at the hint if you get stuck, and don't worry about your grade the first time through." }
      ]},
      { id: "l2", title: "More golf: lines, substitution, and macros", view: "golf", subsections: [
        { id: "s1", title: "Reaching for the right tool", kind: "concept", widget: null,
          body: "As puzzles get bigger, the fastest solution usually isn't more keystrokes done faster &mdash; it's a completely different, higher-leverage command. A three-line fix done by hand three times is rarely as fast as recording it once and replaying it twice." },
        { id: "s2", title: "Practice: the remaining golf puzzles", kind: "practice", widget: "golf",
          body: "These three lean on whole-line operations, command-line substitution, and macros respectively.",
          tryIt: "Try \"Duplicate a line\", \"Replace every occurrence\", and \"Fix a whole list\" &mdash; the last one is much faster with a macro than by editing each line individually." }
      ]},
      { id: "l3", title: "Boss Battles", view: "golf", subsections: [
        { id: "s1", title: "Combining everything at once", kind: "concept", widget: null,
          body: "A Boss Battle doesn't introduce anything new &mdash; it just refuses to be solved with only one trick. Expect to reach for registers AND text objects, or search AND macros, in the same puzzle. This is the same kind of editing real code changes actually demand." },
        { id: "s2", title: "Practice: the three Boss Battles", kind: "practice", widget: "golf",
          body: "Scroll down on the puzzle picker to find these &mdash; they have noticeably higher par values, reflecting their difficulty.",
          tryIt: "Attempt \"Word Swap\", \"Strip the Indentation\", and \"Quote and Comma\". If a battle feels impossible, revisit the hint, or the module where that technique was first taught." },
        { id: "s3", title: "You've completed the course", kind: "concept", widget: null,
          body: "Modes, motions, operators, text objects, registers, search, macros, buffers and windows, marks and the undo tree &mdash; every one of those is a real, working piece of this editor, not a simplified stand-in. The muscle memory that gets built solving these puzzles is the same muscle memory that makes real Vim fast. Go build something with it." }
      ]}
    ]}
  ];

  return { COURSE };
})();