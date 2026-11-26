// The 16-week study plan: phases, weekly topics (primer + build-it-yourself exercise + ordered problems)
// and the two reference tables. Problems are listed by LeetCode slug, easy to medium.
// Primers use a tiny markdown subset: paragraphs, "- " lists, **bold** and `code` (see ui.js md()).

export const PHASES = [
  { id: 0, name: "Foundations", weeks: [1, 2], goal: "Read code for its cost, think recursively, and get fluent with arrays, strings and hash maps." },
  { id: 1, name: "Core patterns", weeks: [3, 10], goal: "Meet each core pattern once, properly: learn its clues, build its data structure, solve a handful." },
  { id: 2, name: "Advanced", weeks: [11, 14], goal: "Go deep on DP, weighted graphs and the specialist structures that show up in harder mediums." },
  { id: 3, name: "Interview", weeks: [15, 16], goal: "Mixed practice with the topic hidden and timed mock interviews, until unseen mediums feel routine." },
];

export const TOPICS = [
  {
    id: "w1-big-o-recursion", phase: 0, week: 1, title: "Big-O and recursion", patterns: [],
    build: "Trace factorial(4) and fib(5) on paper: draw every call, what it returns, and the order the calls finish.",
    slugs: ["plus-one", "happy-number", "powx-n"],
    primer: `**Big-O** describes how the work grows as the input grows. Ignore constants and keep the fastest-growing term: one loop over n items is \`O(n)\`, a loop inside a loop is \`O(n²)\`, and halving the input every step is \`O(log n)\`. Space is counted the same way: how much extra memory you allocate, including the call stack.

You will use Big-O in two directions. Forwards, to cost a solution you already have. Backwards, to read the constraints: if n can be 100,000, an \`O(n²)\` idea is dead before you write it, and you need \`O(n log n)\` or better. The constraint table on the Patterns page turns this into a lookup.

**Recursion** is a function solving a problem by calling itself on a smaller one. Every recursive function needs two things:

- A **base case** that returns without recursing.
- A **recursive case** that moves towards the base case.

Trust the call: assume the smaller call returns the right answer and only write how to combine it. The cost of recursion is (number of calls) × (work per call). \`factorial(n)\` makes n calls, so \`O(n)\`. Naive \`fib(n)\` makes two calls per call, so roughly \`O(2ⁿ)\`, which is exactly the waste that memoization removes in week 10.

Each call sits on the call stack until it returns, so depth costs memory: a recursion n levels deep uses \`O(n)\` space even with no arrays.`,
  },
  {
    id: "w2-arrays-hashing", phase: 0, week: 2, title: "Arrays, strings, hashing basics", patterns: ["hash-map"],
    build: "Implement a hash map with chaining: an array of buckets, a hash function, and put / get / remove.",
    slugs: ["contains-duplicate", "valid-anagram", "two-sum", "valid-sudoku", "longest-consecutive-sequence"],
    primer: `An **array** gives you \`O(1)\` access by index but \`O(n)\` search by value: to find something you have to look at everything. A **string** is an array of characters with the same costs, plus one trap: in most languages strings are immutable, so building one with repeated \`+\` in a loop is \`O(n²)\`. Collect pieces in a list and join once.

A **hash map** fixes the search cost. It runs a hash function over the key to pick a bucket, so insert, lookup and delete are \`O(1)\` on average. A **hash set** is the same structure with keys only.

That one property unlocks a whole family of problems. Whenever a brute force asks "have I seen this value before?" or "how many of each?" inside a loop, the inner loop is a rescan, and a map replaces it:

- **Seen before:** a set of values so far (duplicates, cycles in a sequence).
- **Complement lookup:** store each value, look up \`target - x\` (pair sums).
- **Counting:** a map from value to frequency (anagrams, majority).
- **Grouping:** a map from a computed key to a list.

The price is \`O(n)\` extra memory and losing order: a hash map can't tell you the smallest key or the next one up. When order matters you want sorting, a heap or a tree instead.

Build the chaining map this week. Once you have written the bucket array yourself, "average \`O(1)\`" stops being a fact to memorise.`,
  },
  {
    id: "w3-hashing-prefix", phase: 1, week: 3, title: "Hashing and prefix sums", patterns: ["hash-map", "prefix-sum"],
    build: null,
    slugs: ["group-anagrams", "top-k-frequent-elements", "subarray-sum-equals-k", "product-of-array-except-self", "encode-and-decode-strings"],
    primer: `Last week's maps answered questions about single values. This week the key becomes something you **compute**: a sorted word, a tuple of letter counts, a running total. Two items belong together exactly when their keys match, which turns "compare everything with everything" into one pass.

A **prefix sum** array stores the running total: \`pre[i]\` is the sum of the first i elements. The sum of any range is then one subtraction, \`pre[r] - pre[l]\`, instead of a loop. Build once in \`O(n)\`, answer every range query in \`O(1)\`.

The two ideas combine into one of the most reused tricks in interviews. To count subarrays that sum to k, walk the array keeping the running total, and ask the map: "how many earlier prefixes equal \`total - k\`?" Each such prefix marks the start of a subarray ending here with sum k. Seed the map with \`{0: 1}\` so subarrays starting at index 0 are counted.

Reach for this, and not a sliding window, when values can be **negative**: a window needs the sum to move in one direction as it grows, and negatives break that.

The same shape works for products (prefix and suffix products), XOR, and counts taken modulo k. The clue is always a question about a **contiguous range** whose answer can be written as "total up to here, minus total up to there".`,
  },
  {
    id: "w4-two-pointers-window", phase: 1, week: 4, title: "Two pointers and sliding window", patterns: ["two-pointers", "sliding-window"],
    build: null,
    slugs: ["valid-palindrome", "two-sum-ii-input-array-is-sorted", "3sum", "container-with-most-water", "maximum-average-subarray-i", "best-time-to-buy-and-sell-stock", "longest-substring-without-repeating-characters", "longest-repeating-character-replacement"],
    primer: `Both patterns replace a nested loop with two indices that only ever move forward, so the whole scan is \`O(n)\`.

**Two pointers** usually start at opposite ends of a **sorted** array (or a string you compare from both sides). Look at the pair, then move the one pointer that could improve things: if the sum is too small, only moving the left pointer right can raise it. Sorting is what makes that decision safe, because every pair you skip is provably worse. For triples, fix one element and run two pointers on the rest.

**Sliding window** keeps a contiguous range \`[left, right]\` and some state about it (a sum, a count map, a set). Grow the window by moving \`right\`. While the window breaks the rule, shrink it by moving \`left\`. Record the best window when it is valid.

- **Fixed size:** add the new element, drop the old one.
- **Variable, longest valid:** shrink only while invalid.
- **Variable, shortest valid:** shrink while still valid, recording as you go.

The window only works when growing it can't repair a broken rule, and shrinking can't break a satisfied one. That is why all-positive sums and "at most k distinct" work, and sums with negative numbers don't (use prefix sums there).

The wording clue is **contiguous** plus **longest, shortest or at most**. If the problem says subsequence or lets you pick any elements, it is not a window.`,
  },
  {
    id: "w5-stacks-binary-search", phase: 1, week: 5, title: "Stacks, queues, binary search", patterns: ["stack", "monotonic-stack", "binary-search"],
    build: "Implement a stack and a queue, each on top of an array or a linked list, with O(1) push and pop.",
    slugs: ["valid-parentheses", "min-stack", "evaluate-reverse-polish-notation", "daily-temperatures", "binary-search", "search-a-2d-matrix", "koko-eating-bananas", "find-minimum-in-rotated-sorted-array"],
    primer: `A **stack** is last-in, first-out; a **queue** is first-in, first-out. Both give \`O(1)\` push and pop. Use a stack when the most recent unfinished thing is the one that matters next: matching brackets, undo, evaluating expressions, anything nested.

A **monotonic stack** keeps its contents in sorted order by popping everything the new element beats before pushing it. Each element is pushed and popped at most once, so the pass is \`O(n)\` even though there is a loop inside the loop. It answers "next greater", "next smaller" and "how far until" questions: the element that pops you is your answer.

**Binary search** halves a sorted search space each step, so it costs \`O(log n)\`. Write one template and reuse it, because the bugs are all at the boundaries:

- Keep the invariant "the answer is inside \`[lo, hi]\`".
- Compute \`mid\`, decide which half can't contain the answer, discard it.
- Make sure the range shrinks every iteration.

The idea is bigger than sorted arrays. **Binary search on the answer** applies whenever you can write a yes/no test that flips exactly once as a number grows: "can Koko finish at speed k?" is false, false, true, true. Search the speeds, not the array. The clue is "minimise the maximum", "maximise the minimum", or a huge value range with a cheap feasibility check.

Rotated arrays work too: one half is always still sorted, and that half tells you where to go.`,
  },
  {
    id: "w6-linked-lists", phase: 1, week: 6, title: "Linked lists", patterns: ["linked-list"],
    build: "Implement a singly linked list: insert at head and tail, delete by value, and reverse it in place.",
    slugs: ["reverse-linked-list", "merge-two-sorted-lists", "linked-list-cycle", "remove-nth-node-from-end-of-list", "reorder-list", "add-two-numbers", "find-the-duplicate-number"],
    primer: `A **linked list** is a chain of nodes, each holding a value and a pointer to the next node. There is no index: reaching the k-th node costs \`O(k)\`. In exchange, inserting or removing a node is \`O(1)\` once you are standing next to it, with no shifting.

Linked list problems are rarely about clever ideas. They are about not losing pointers. Three habits cover almost all of them:

- **Dummy head.** Start the result with a throwaway node so that "the list is empty" and "insert at the front" stop being special cases. Return \`dummy.next\`.
- **Save before you overwrite.** When rewiring, store \`next\` in a variable first. Reversal is the canonical drill: \`prev\`, \`cur\`, \`next\`, three assignments, repeat.
- **Draw it.** Three boxes and arrows on paper before writing a line.

The pattern that needs an idea is **fast and slow pointers**. Move one pointer one step and another two steps. If there is a cycle they must meet; if there isn't, the fast one falls off the end. When the fast pointer finishes, the slow one is at the middle. Keeping a fixed gap of n between two pointers finds the n-th node from the end in a single pass.

The clue is a request for \`O(1)\` extra space on a list: cycle detection, the middle node, or anything "from the end". Many harder problems are just these moves in sequence: find the middle, reverse the second half, merge.`,
  },
  {
    id: "w7-trees", phase: 1, week: 7, title: "Trees and BSTs", patterns: ["dfs", "bfs"],
    build: "Implement a binary search tree with insert and search, then print it with an in-order traversal.",
    slugs: ["invert-binary-tree", "maximum-depth-of-binary-tree", "same-tree", "diameter-of-binary-tree", "binary-tree-level-order-traversal", "binary-tree-right-side-view", "validate-binary-search-tree", "kth-smallest-element-in-a-bst"],
    primer: `A **binary tree** node has a value and up to two children. Trees are recursive by definition, a node plus two smaller trees, so most solutions are a few lines of recursion.

**Depth-first search (DFS)** goes all the way down one branch before backing up. The reliable recipe: decide what a call should **return for its subtree**, assume the calls on the children are correct, and combine. Height is \`1 + max(left, right)\`. Sometimes the value you return upwards (a height) differs from the answer you track on the side (a diameter); that split is the trick in many mediums.

**Breadth-first search (BFS)** visits the tree level by level using a queue. Reach for it when the question mentions levels, the view from one side, or the shallowest something. Process one level per loop by reading the queue's length first.

A **binary search tree (BST)** adds an ordering rule: everything in the left subtree is smaller than the node and everything in the right is larger. Two consequences do most of the work:

- An **in-order** traversal visits the values in sorted order.
- At each node you can discard a whole subtree, so search is \`O(height)\`.

Validating a BST means checking each node against a **range** inherited from its ancestors, not only against its parent.

Costs: every traversal is \`O(n)\` time. Space is \`O(h)\` for DFS, the recursion depth, and \`O(width)\` for BFS.`,
  },
  {
    id: "w8-heaps-backtracking", phase: 1, week: 8, title: "Heaps and backtracking", patterns: ["heap", "backtracking"],
    build: "Implement a min-heap on an array with push and pop (sift up, sift down).",
    slugs: ["kth-largest-element-in-a-stream", "last-stone-weight", "kth-largest-element-in-an-array", "k-closest-points-to-origin", "subsets", "combination-sum", "permutations", "word-search"],
    primer: `A **heap** is a tree stored in an array where every parent is smaller than its children (a min-heap). It gives you the smallest element in \`O(1)\` and push or pop in \`O(log n)\`. It is the right tool when you repeatedly need "the best one so far" while the collection keeps changing, and you don't need the rest in order.

The classic use is **top k**. To keep the k largest items, hold a **min**-heap of size k: push each item, and when the heap grows past k, pop the smallest. What survives is the k largest, in \`O(n log k)\`, which beats sorting when k is small. Two heaps facing each other track a running median.

**Backtracking** is exhaustive search done tidily. You build a candidate one choice at a time, and at each step:

- **Choose** an option and add it to the partial answer.
- **Explore** by recursing.
- **Un-choose** it, so the next option starts clean.

Draw the decision tree first: what is one level (a position, an element), and what are the branches? Subsets branch on take or skip. Combinations pass a start index so they never look backwards. Permutations track which elements are used.

**Prune** early: stop a branch the moment it can't lead to a valid answer. The clue is "all", "every" or "generate", with small constraints (n around 10 to 20), because the cost is exponential by nature: \`O(2ⁿ)\` for subsets, \`O(n!)\` for permutations.`,
  },
  {
    id: "w9-graphs", phase: 1, week: 9, title: "Graphs", patterns: ["dfs", "bfs", "topological-sort", "union-find"],
    build: "Implement union-find with path compression and union by size.",
    slugs: ["number-of-islands", "max-area-of-island", "clone-graph", "rotting-oranges", "course-schedule", "course-schedule-ii", "number-of-connected-components-in-an-undirected-graph", "redundant-connection"],
    primer: `A **graph** is nodes joined by edges. Interview graphs usually arrive in disguise: a grid where neighbouring cells are connected, a list of prerequisite pairs, words one letter apart. Step one is always to name the nodes and the edges, then build an adjacency list (or treat the grid as the graph directly).

Unlike a tree, a graph can loop back, so every traversal needs a **visited** set. With it, both traversals cost \`O(V + E)\`.

- **DFS** explores as far as it can, then backs up. Use it to flood-fill a region, count connected groups, or detect cycles.
- **BFS** expands in rings from the start, so the first time it reaches a node is by the **fewest edges**. Use it for shortest paths when every move costs the same. Starting from several sources at once (multi-source BFS) models things that spread.

**Topological sort** orders the nodes of a directed graph so every edge points forward. Kahn's algorithm: count incoming edges, repeatedly take a node with none, and remove its outgoing edges. If you can't take every node, there is a cycle. The clue is prerequisites, dependencies or "a valid order".

**Union-find** tracks which group each node belongs to as edges arrive. \`find\` follows parent pointers to a root; \`union\` joins two roots. With path compression and union by size, both are effectively \`O(1)\`. Use it when the question is only "are these connected?" or "how many groups?", especially when edges are added one at a time.`,
  },
  {
    id: "w10-dp-intro", phase: 1, week: 10, title: "Intro to DP", patterns: ["dynamic-programming"],
    build: "Write naive recursive Fibonacci, add memoization, then rewrite it bottom-up with two variables.",
    slugs: ["climbing-stairs", "min-cost-climbing-stairs", "house-robber", "house-robber-ii", "coin-change", "maximum-subarray", "decode-ways"],
    primer: `**Dynamic programming (DP)** is recursion that refuses to solve the same subproblem twice. It applies when a problem has two properties: the answer can be built from answers to smaller versions of itself, and those smaller versions **overlap**, so a plain recursion recomputes them over and over.

Don't start from a table. Start from the brute-force recursion and follow the same steps every time:

- **State.** What does one subproblem look like? Usually an index: "the best answer using the first i items".
- **Choice.** What are the options at this state? Take this house or skip it; use this coin or not.
- **Recurrence.** Write the state's answer in terms of smaller states.
- **Base case.** The smallest states you can answer directly.

Then **memoize**: cache each state's answer the first time you compute it. That alone turns \`O(2ⁿ)\` into \`O(states × choices)\`. The bottom-up version fills the same states in order with a loop, and often only the last one or two states are needed, so space drops to \`O(1)\`.

The wording clues are **number of ways**, **minimum or maximum cost**, and **can you reach**, in problems where each decision limits later ones. If a simple rule like "always take the biggest" obviously works, that is greedy. If you find yourself wanting to try every option at every step, and the same situation can be reached in several ways, that is DP.`,
  },
  {
    id: "w11-dp-depth", phase: 2, week: 11, weeks: [11, 12], title: "DP in depth", patterns: ["dynamic-programming"],
    build: null,
    slugs: ["longest-increasing-subsequence", "word-break", "partition-equal-subset-sum", "unique-paths", "longest-common-subsequence", "coin-change-ii", "target-sum", "edit-distance"],
    primer: `Week 10's problems had one moving index. These two weeks add a second dimension, and nearly every problem falls into one of a few families. Recognising the family gives you the state for free.

- **Grid paths.** State is the cell \`(r, c)\`; the answer comes from the cell above and the cell to the left.
- **Two sequences.** State is \`(i, j)\`, a prefix of each string. If the last characters match, extend the diagonal; otherwise take the best of dropping one from either side. Longest common subsequence and edit distance are the same table with different rules.
- **Knapsack.** State is (items considered, capacity left). Each item is taken or skipped. "Can a subset reach this sum?" and "how many ways to make this amount?" are both knapsacks.
- **Subsequence ending here.** State is "the best subsequence that ends at index i", built by looking back at every earlier index.

Two details decide whether a knapsack is right. If each item can be used **once**, iterate capacity downwards (or use a fresh row); if **unlimited**, iterate upwards. And when counting combinations rather than orderings, loop over items on the outside.

Cost is the size of the table times the work per cell: usually \`O(n·m)\`. Space often drops to one row, because a cell only reads the current and previous rows.

When you're stuck, go back to the recursion: "what decision do I make about the last element, and what smaller problem does each option leave?"`,
  },
  {
    id: "w13-weighted-graphs", phase: 2, week: 13, title: "Weighted graphs", patterns: ["shortest-path"],
    build: "Implement Dijkstra's algorithm with a min-heap on an adjacency list.",
    slugs: ["network-delay-time", "cheapest-flights-within-k-stops", "path-with-minimum-effort", "min-cost-to-connect-all-points", "swim-in-rising-water"],
    primer: `BFS finds the shortest path only when every edge costs the same. Once edges have **weights**, the path with the fewest edges may not be the cheapest, and you need **Dijkstra's algorithm**.

Dijkstra is BFS with the queue swapped for a min-heap keyed by distance from the start. Pop the closest unsettled node, and for each neighbour, push \`(distance + weight, neighbour)\` if that beats what you knew. The first time a node is popped its distance is final, so skip it if it comes up again. With a heap the cost is \`O(E log V)\`.

Why it works: every edge weight is **non-negative**, so a path can never get cheaper by getting longer. The closest unsettled node can't be improved by a detour through something farther away. That argument fails with negative edges; those need Bellman-Ford, which relaxes every edge V − 1 times.

Variations worth knowing:

- **Extra state.** With a limit on stops or fuel, the node becomes \`(city, stops used)\`. Bellman-Ford limited to k rounds is often the simpler answer here.
- **Minimax paths.** When a path's cost is its **largest** edge rather than the sum, replace \`+\` with \`max\`. The proof still holds.
- **Minimum spanning tree.** Prim's algorithm is the same loop, keyed by the edge weight alone instead of the total distance.

The clue is a shortest, cheapest or fastest route where moves have **different costs**. Grids count: cells are nodes and the weight is whatever a step costs.`,
  },
  {
    id: "w14-tries-intervals-greedy-bits", phase: 2, week: 14, title: "Tries, intervals, greedy, bits", patterns: ["trie", "intervals", "greedy", "bit-manipulation"],
    build: "Implement a trie with insert, search and startsWith.",
    slugs: ["implement-trie-prefix-tree", "design-add-and-search-words-data-structure", "merge-intervals", "insert-interval", "non-overlapping-intervals", "jump-game", "gas-station", "single-number"],
    primer: `Four smaller patterns, each with a very recognisable clue.

A **trie** is a tree where each edge is a character, so every path from the root spells a prefix. Insert and lookup cost \`O(length of the word)\` no matter how many words are stored. Use it when the question is about **prefixes** or searching many words at once; a hash set can only answer whole-word lookups.

**Intervals** problems almost always start by **sorting by start time**. After that, each interval either overlaps the one before it (its start is at or before the previous end) or begins a new group. Merging, inserting and counting rooms are all that one comparison. To keep as many intervals as possible, sort by **end** time and take each one that fits.

**Greedy** means taking the locally best choice and never revisiting it. It is only correct when you can argue that the greedy choice is never worse than any alternative, often by an exchange argument: swap another choice for the greedy one and show the result doesn't get worse. If you can't make that argument, it is probably DP. Typical shapes: track the farthest reach so far, or reset a running total when it goes negative.

**Bit manipulation** rests on a few identities. \`x ^ x = 0\` and \`x ^ 0 = x\`, so XOR-ing everything cancels pairs. \`x & (x - 1)\` clears the lowest set bit. \`1 << k\` builds a mask for bit k. The clue is \`O(1)\` extra space with numbers that appear in pairs, or a request to avoid arithmetic operators.`,
  },
  {
    id: "w15-mixed", phase: 3, week: 15, weeks: [15, 16], title: "Mixed practice and mock interviews", patterns: [],
    build: null,
    slugs: [],
    primer: `Until now you knew the topic before you read the problem. In an interview nobody tells you, and working out **which pattern applies** is most of the difficulty. This phase removes that crutch.

Today now gives you problems with the topic **hidden**. Before you open any hint, commit to a pattern guess and write down the clue that led you there. Whether or not you're right, the reveal is the lesson: compare your clue with the real one and put the difference in your note.

Work the same routine every time, out loud, as if someone were listening:

- Restate the problem and ask about the constraints.
- Give the brute force and its cost before anything clever.
- Name the wasted work, then the idea that removes it.
- Code it, then trace one example by hand before you call it done.

Run a **mock interview** two or three times a week: 45 minutes, one unseen problem, no hints. Treat a timeout as data, not failure.

Keep clearing the re-solve queue first each day. It is the part of the plan that makes earlier weeks stick, and a pattern you can't re-solve cleanly is a pattern you don't have yet.

The Progress page tracks the numbers that matter here: your clean rate on unseen mediums (target 65%), pattern-guess accuracy (70%), and the strength of each pattern. When a pattern falls below the line, go back to its topic, reread the primer and redo two of its problems.`,
  },
];

// Constraints → the complexity you can afford → what that usually means.
export const CONSTRAINT_TABLE = [
  { size: "n ≤ 12", time: "O(n!)", approach: "Permutations, backtracking" },
  { size: "n ≤ 25", time: "O(2ⁿ)", approach: "Subsets, bitmask DP" },
  { size: "n ≤ 500", time: "O(n³)", approach: "Triple loops, interval DP" },
  { size: "n ≤ 10⁴", time: "O(n²)", approach: "Nested loops, 2D DP" },
  { size: "n ≤ 10⁶", time: "O(n log n) or O(n)", approach: "Sorting, heap, two pointers, hashing" },
  { size: "values up to 10⁹ or more", time: "O(log n)", approach: "Binary search on the answer, math" },
];

// Wording in a problem statement → the pattern(s) it points to.
export const CLUE_TABLE = [
  { clue: "Sorted input; find a pair or triple", patterns: ["two-pointers", "binary-search"] },
  { clue: "Longest or shortest contiguous subarray or substring", patterns: ["sliding-window"] },
  { clue: "Subarray sum equals k; range sums", patterns: ["prefix-sum", "hash-map"] },
  { clue: "Top k, kth largest, k closest", patterns: ["heap"] },
  { clue: "Next greater element; days until warmer", patterns: ["monotonic-stack"] },
  { clue: "All combinations, permutations or subsets", patterns: ["backtracking"] },
  { clue: "Fewest steps with equal-cost moves", patterns: ["bfs"] },
  { clue: "Shortest path with weighted edges", patterns: ["shortest-path"] },
  { clue: "Number of ways, minimum cost, can you reach (overlapping choices)", patterns: ["dynamic-programming"] },
  { clue: "Prerequisites, dependencies, an order to follow", patterns: ["topological-sort"] },
  { clue: "Connected groups, islands, merging groups", patterns: ["dfs", "union-find"] },
  { clue: "Minimize the maximum or maximize the minimum", patterns: ["binary-search"] },
  { clue: "Cycle or middle of a linked list, O(1) extra space", patterns: ["linked-list"] },
  { clue: "Prefixes, autocomplete, many words", patterns: ["trie"] },
  { clue: "Meetings or overlapping ranges", patterns: ["intervals"] },
];
