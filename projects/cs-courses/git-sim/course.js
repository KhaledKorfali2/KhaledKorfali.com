/* ============================== git-sim/course.js ==============================
   The Git curriculum content, following the same module/lesson/subsection
   shape core/curriculum.js consumes.
================================================================================== */
window.GitCourse = (function () {
  const COURSE = [
    { id: "m0", title: "Orientation", checkpoint: null, lessons: [
      { id: "l1", title: "What is version control?", view: "graph", subsections: [
        { id: "s1", title: "Why bother tracking changes", kind: "concept", widget: null,
          body: "Version control keeps a history of every change to a project, who made it, and when — so you can see how something evolved, and go back if something breaks. Git is the most widely used tool for this." },
        { id: "s2", title: "A commit is a saved snapshot", kind: "concept", widget: null,
          body: "A <b>commit</b> captures the state of your project at one point in time, along with a message describing what changed. Commits link to the commit before them, forming a chain — really a graph, since chains can split and rejoin." },
        { id: "s3", title: "Meet the graph", kind: "practice", widget: "graph",
          body: "This is a small existing repository: two branches, <code>main</code> and <code>feature</code>, that diverged after their second commit.",
          tryIt: "Find the commit both branches share, and notice the dashed ring marking HEAD." }
      ]},
      { id: "l2", title: "Reading the graph", view: "graph", subsections: [
        { id: "s1", title: "Nodes and lines", kind: "concept", widget: null,
          body: "Each circle is a commit. A line from one commit to another means the second one's <b>parent</b> is the first — it was made right after it. A commit with two parent lines is a <b>merge commit</b>." },
        { id: "s2", title: "Branch tags and HEAD", kind: "concept", widget: null,
          body: "A colored tag like <code>main</code> is a <b>branch</b> — just a label pointing at one specific commit, not a copy of anything. <b>HEAD</b> marks where you currently are; it's usually attached to a branch, so committing moves that branch's tag forward automatically." },
        { id: "s3", title: "Practice: inspect a commit", kind: "practice", widget: "commit",
          body: "Switch to Sandbox mode's Graph tab and click any commit circle to open it here.",
          tryIt: "Click the commit where feature and main share history — its files-changed list is the first work either branch built on." }
      ]}
    ]},

    { id: "m1", title: "Commits & the Three Trees", checkpoint: { questions: [
        { text: "You edit a file but never run 'add'. Will 'commit' include it?", options: ["No — only staged files get committed", "Yes, always", "Only with a special flag we haven't covered", "Only if the file is small"], correct: 0 },
        { text: "What are the three trees in git's mental model?", options: ["Working tree, staging area, repository", "Local, remote, cloud", "Main, feature, hotfix", "HEAD, ORIG_HEAD, FETCH_HEAD"], correct: 0 }
      ]}, lessons: [
      { id: "l1", title: "The three trees", view: "staging", subsections: [
        { id: "s1", title: "Working tree, staging area, repository", kind: "concept", widget: null,
          body: "Git separates \"what changed\" from \"what's about to be committed\" from \"what's permanently saved.\" Your <b>working tree</b> is the files as they sit right now. The <b>staging area</b> (or index) is a holding zone for changes you've deliberately chosen to include in the next commit. The <b>repository</b> is the permanent history of commits." },
        { id: "s2", title: "Practice: watch a file move through all three", kind: "practice", widget: "staging",
          body: "The columns below show exactly this pipeline for this simulated project.",
          tryIt: "Use \"Simulate an edit\" to dirty a file, then stage it, and notice which column it's in at each step." }
      ]},
      { id: "l2", title: "Making a commit", view: "console", subsections: [
        { id: "s1", title: "edit → add → commit", kind: "concept", widget: null,
          body: "The everyday loop is: change a file, <code>git add</code> it to stage the change, then <code>git commit -m \"message\"</code> to save it permanently. Nothing is part of history until that last step." },
        { id: "s2", title: "Practice: make a real commit", kind: "practice", widget: "console",
          body: "This simulator uses <code>edit &lt;file&gt;</code> to stand in for changing a file's contents.",
          tryIt: "Run <code>edit app.js</code>, then <code>git add app.js</code>, then <code>git commit -m \"Update app.js\"</code>." },
        { id: "s3", title: "Why bother staging at all?", kind: "concept", widget: null,
          body: "Staging lets you build a commit deliberately — you can change three files but only commit the two that belong together, reviewing exactly what's about to be saved with <code>git status</code>." }
      ]}
    ]},

    { id: "m2", title: "Branches", checkpoint: { questions: [
        { text: "What is a git branch, technically?", options: ["A pointer to a commit", "A full copy of the repository", "A separate folder on disk", "A backup system"], correct: 0 },
        { text: "When can git perform a fast-forward merge?", options: ["When your current branch has no commits the target doesn't already have", "Always", "Never", "Only for the main branch"], correct: 0 }
      ]}, lessons: [
      { id: "l1", title: "What a branch really is", view: "graph", subsections: [
        { id: "s1", title: "Just a movable pointer", kind: "concept", widget: null,
          body: "A branch isn't a copy of your files — it's a small label that points at one commit and moves forward automatically every time you commit while it's checked out. Creating a branch is instant precisely because of this: it's just a new pointer, not a copy." },
        { id: "s2", title: "Practice: create and switch", kind: "practice", widget: "console",
          body: "<code>git branch &lt;name&gt;</code> creates a pointer at your current commit without switching to it. <code>git checkout &lt;name&gt;</code> switches. <code>git checkout -b &lt;name&gt;</code> does both at once.",
          tryIt: "Run <code>git checkout -b hotfix</code>, then look at the Graph tab in Sandbox mode." }
      ]},
      { id: "l2", title: "Fast-forward: the easy case", view: "graph", subsections: [
        { id: "s1", title: "Sliding the pointer forward", kind: "concept", widget: null,
          body: "If the branch you're merging <i>into</i> hasn't moved since you branched off, git doesn't need to do anything clever — it just slides that branch's pointer forward to match. This is called a <b>fast-forward</b> merge, and it's why merging feels instant when nothing has diverged." },
        { id: "s2", title: "Practice: watch the lanes", kind: "practice", widget: "graph",
          body: "Each branch gets its own horizontal lane in the graph so you can see divergence and reconvergence at a glance." }
      ]}
    ]},

    { id: "m3", title: "Merging", checkpoint: { questions: [
        { text: "How many parents does a typical merge commit have?", options: ["1", "2", "0", "3"], correct: 1 },
        { text: "What triggers a fast-forward instead of a merge commit?", options: ["The target branch has commits you don't have yet", "Your current branch already contains everything the target has, plus nothing new of its own", "You pass --no-ff", "You're on main"], correct: 1 },
        { text: "True or false: merging rewrites the commits that already existed.", options: ["True — existing commits get rewritten", "False — merging only adds a new commit; existing commits are untouched"], correct: 1 }
      ]}, lessons: [
      { id: "l1", title: "Bringing branches together", view: "console", subsections: [
        { id: "s1", title: "Combining two histories", kind: "concept", widget: null,
          body: "When both branches have moved since they diverged, git can't just slide a pointer — it creates a new <b>merge commit</b> with two parents: the tip of each branch. That one commit represents \"these two histories are now combined.\"" },
        { id: "s2", title: "Practice: merge feature into main", kind: "practice", widget: "console",
          body: "Make sure you're on the branch you want to merge <i>into</i> first.",
          tryIt: "Run <code>git checkout main</code>, then <code>git merge feature</code>." }
      ]},
      { id: "l2", title: "Reading a merge commit", view: "commit", subsections: [
        { id: "s1", title: "Two parents, one commit", kind: "demo", widget: "commit",
          body: "Click on the merge commit you just created in the Commit Explorer — notice it lists two parent hashes instead of one. That's the defining feature of a merge commit." },
        { id: "s2", title: "The diamond shape", kind: "practice", widget: "graph",
          body: "In the graph, a merge shows up as two lines converging into one commit — visually a diamond. That shape is real merge history, not a rendering trick; it's exactly what happened." }
      ]}
    ]},

    { id: "m4", title: "Merge Conflicts", checkpoint: { questions: [
        { text: "A merge conflict happens when...", options: ["Both branches changed the same file since they diverged", "You're using the wrong git version", "A file gets deleted", "Every single merge, without exception"], correct: 0 },
        { text: "After resolving every conflicted file, how do you complete the merge?", options: ["Just wait — git finishes on its own", "Commit (or click Finish merge)", "Delete the branch", "Force push"], correct: 1 }
      ]}, lessons: [
      { id: "l1", title: "Why conflicts happen", view: "conflict", subsections: [
        { id: "s1", title: "Two changes, one spot", kind: "concept", widget: null,
          body: "Git merges automatically most of the time. A <b>conflict</b> only happens when both branches edited the same file in a way git can't reconcile on its own — it has no way to know which change should win, so it pauses and asks you." },
        { id: "s2", title: "Practice: cause one on purpose", kind: "practice", widget: "conflict",
          body: "The Conflict Simulator below stays empty until an actual conflicting merge happens.",
          tryIt: "In the console, edit and commit the same file on two different branches, then try merging them." }
      ]},
      { id: "l2", title: "Resolving a conflict", view: "conflict", subsections: [
        { id: "s1", title: "Choosing a winner per file", kind: "concept", widget: null,
          body: "For each conflicted file you decide: keep your version (\"ours\"), keep theirs, or combine both. Real git leaves conflict markers in the file for you to edit by hand — this simulator represents the same decision as three buttons." },
        { id: "s2", title: "Practice: finish the merge", kind: "practice", widget: "conflict",
          body: "Resolve every listed file, then complete the merge.",
          tryIt: "Once every file shows \"resolved,\" click Finish merge (or run <code>git commit</code> in the console)." }
      ]}
    ]},

    { id: "m5", title: "Rebasing", checkpoint: { questions: [
        { text: "What does 'git rebase' do to your branch's commits?", options: ["Replays them with new hashes on top of another branch", "Deletes them", "Force-merges them into main permanently", "Just relabels the branch, nothing else"], correct: 0 },
        { text: "Why is rebasing already-shared history risky?", options: ["It changes commit hashes others may already have, causing their history to diverge from yours", "It's slower than merging", "It deletes remote branches", "It isn't risky at all"], correct: 0 },
        { text: "After a clean rebase, does the history show a branching diamond or a straight line?", options: ["A straight line", "Still a branching diamond", "Depends on file size"], correct: 0 }
      ]}, lessons: [
      { id: "l1", title: "Rewriting history onto a new base", view: "console", subsections: [
        { id: "s1", title: "Replaying commits elsewhere", kind: "concept", widget: null,
          body: "<code>git rebase &lt;branch&gt;</code> takes the commits unique to your current branch and replays them, one by one, on top of the target branch's tip — as if you'd started your work from there all along. Each replayed commit gets a <i>new</i> hash." },
        { id: "s2", title: "Practice: rebase feature onto main", kind: "practice", widget: "console",
          body: "Make sure you're on the branch being moved, not the target.",
          tryIt: "Run <code>git checkout feature</code>, then <code>git rebase main</code>." }
      ]},
      { id: "l2", title: "Before and after", view: "graph", subsections: [
        { id: "s1", title: "From diamond to straight line", kind: "demo", widget: "graph",
          body: "After a rebase, feature's commits sit in a straight line after main's tip instead of branching off earlier. Replayed commits are tagged \"(rebased)\" here so you can tell them apart from their originals — which, just like in real git, aren't deleted immediately, only left behind." },
        { id: "s2", title: "Merge vs. rebase: know the tradeoff", kind: "concept", widget: null,
          body: "Merging preserves exactly what happened, including the branching. Rebasing produces a cleaner, linear-looking history but rewrites commit identity — which is why the standard advice is: never rebase commits that other people have already pulled." }
      ]}
    ]},

    { id: "m6", title: "Cherry-pick & Reset", checkpoint: { questions: [
        { text: "Which reset mode discards uncommitted changes too?", options: ["--soft", "--mixed", "--hard"], correct: 2 },
        { text: "Safest way to undo your last commit but keep its changes staged?", options: ["git reset --soft HEAD~1", "git reset --hard HEAD~1", "Manually delete the commit object", "git checkout HEAD~1"], correct: 0 },
        { text: "You commit while in detached HEAD, then checkout main. What happens to that commit?", options: ["It's automatically part of main now", "It isn't attached to any branch and can become hard to find again", "It's deleted immediately", "It merges into main"], correct: 1 }
      ]}, lessons: [
      { id: "l1", title: "Cherry-pick: grabbing one commit", view: "console", subsections: [
        { id: "s1", title: "One commit, not the whole branch", kind: "concept", widget: null,
          body: "<code>git cherry-pick &lt;hash&gt;</code> copies just that one commit's changes onto your current branch as a brand-new commit — useful when you want a single fix from a branch without pulling in everything else on it." },
        { id: "s2", title: "Practice: cherry-pick a commit", kind: "practice", widget: "console",
          body: "Grab a commit hash from the graph, then bring just that change over.",
          tryIt: "Run <code>git cherry-pick &lt;hash&gt;</code> using a hash you see in the Graph tab." }
      ]},
      { id: "l2", title: "Reset: moving the pointer backward", view: "console", subsections: [
        { id: "s1", title: "Three modes, three levels of caution", kind: "concept", widget: null,
          body: "<code>git reset</code> moves your current branch pointer to an earlier commit. <code>--soft</code> keeps everything since then staged. <code>--mixed</code> (the default) unstages it but keeps it as modified. <code>--hard</code> throws it away entirely — the most destructive option." },
        { id: "s2", title: "Practice: undo your last commit safely", kind: "practice", widget: "console",
          body: "This is the standard \"I committed too early\" fix.",
          tryIt: "Run <code>git reset --soft HEAD~1</code>, then check <code>git status</code> — your changes are staged again, not gone." },
        { id: "s3", title: "The detached HEAD trap", kind: "demo", widget: "commit",
          body: "Checking out a commit hash directly (not a branch) puts you in detached HEAD. Commit there and that new commit belongs to no branch — switch away without creating one first, and it becomes hard to find again, though it isn't deleted outright." }
      ]}
    ]},

    { id: "m7", title: "Stash", checkpoint: { questions: [
        { text: "What does 'git stash' do to your uncommitted changes?", options: ["Commits them permanently", "Temporarily sets them aside so your working tree is clean", "Deletes them for good", "Pushes them to a remote"], correct: 1 },
        { text: "What happens to a stash entry after you pop it?", options: ["It stays in the list for reuse", "It's removed from the stash list", "It becomes a new branch", "Nothing changes"], correct: 1 }
      ]}, lessons: [
      { id: "l1", title: "Saving work in progress", view: "console", subsections: [
        { id: "s1", title: "A shelf for unfinished changes", kind: "concept", widget: null,
          body: "Sometimes you need a clean working tree right now — to switch branches, say — but you're not ready to commit. <code>git stash</code> sets your staged and modified changes aside without making a commit, leaving your working tree clean." },
        { id: "s2", title: "Practice: stash something", kind: "practice", widget: "console",
          body: "Make a change, then shelve it.",
          tryIt: "Run <code>edit app.js</code>, then <code>git stash</code>, then <code>git status</code> to confirm it's clean." }
      ]},
      { id: "l2", title: "Bringing it back", view: "console", subsections: [
        { id: "s1", title: "stash pop", kind: "concept", widget: null,
          body: "<code>git stash pop</code> reapplies your most recently stashed changes and removes that entry from the stash list — you're back where you were, minus the commit you never made." },
        { id: "s2", title: "Practice: get your work back", kind: "practice", widget: "console",
          body: "Bring the stashed change back onto your working tree.",
          tryIt: "Run <code>git stash pop</code>, then confirm the file shows as modified again." }
      ]}
    ]},

    { id: "m8", title: "Capstone: Everything Together", checkpoint: null, lessons: [
      { id: "l1", title: "Challenges", view: "challenges", subsections: [
        { id: "s1", title: "Five tasks, no hints attached", kind: "practice", widget: "challenges",
          body: "These are graded live against the real repository state — the checklist updates the moment you actually accomplish each one. Use Sandbox mode's console and graph freely; there's no single \"correct\" sequence of commands." }
      ]},
      { id: "l2", title: "Scenario labs", view: "console", subsections: [
        { id: "s1", title: "\"I merged into the wrong branch\"", kind: "concept", widget: null,
          body: "A merge only adds one new commit and moves a pointer — it doesn't destroy anything. If you haven't shared that branch yet, <code>git reset --hard</code> back to the commit right before the merge undoes it cleanly." },
        { id: "s2", title: "\"I need just one fix from a branch I don't want to merge\"", kind: "concept", widget: null,
          body: "This is exactly what cherry-pick is for: grab the one commit you need without pulling in that branch's other, unrelated work." },
        { id: "s3", title: "\"I started working on the wrong branch\"", kind: "concept", widget: null,
          body: "Stash the changes, check out the branch you meant to be on, then stash pop there instead. Your edits move branches even though you never committed them." }
      ]}
    ]}
  ];

  return { COURSE };
})();