// Pattern Trace v2 — pattern reference data.
// Each pattern: recognition signals, the question to ask yourself, typical complexity,
// minimal Python / JavaScript templates, variants, pitfalls and how to tell it apart from neighbours.

export const CATEGORIES = [
    "Arrays & Strings",
    "Linear Structures",
    "Ordering & Greedy",
    "Trees & Graphs",
    "Recursion & DP",
    "Math & Bits",
];

export const PATTERNS = [
    // ───────────────────────────── Arrays & Strings ─────────────────────────────
    {
        id: "hash-map",
        name: "Hash Map / Set",
        category: "Arrays & Strings",
        short: "Remember what you've seen so every later lookup is O(1) instead of a rescan.",
        description:
            "Store values (or counts, or indices) in a hash map / set as you scan, so the question \"have I seen X?\" or \"how many X so far?\" costs O(1). It turns the classic nested-loop pair search from O(n²) into a single O(n) pass by trading memory for time.",
        signals: [
            "pair sums to target",
            "seen before / duplicate",
            "count frequency",
            "group by key",
            "anagram",
            "unsorted input",
            "O(n) required",
        ],
        question: "Am I repeatedly asking \"have I seen this value (or its complement) before?\" or \"how many of each?\"",
        dataStructures: ["Hash Map", "Hash Set"],
        complexity: { time: "O(n)", space: "O(n)" },
        templates: [
            {
                id: "hm-lookup",
                name: "Complement / seen-before lookup",
                python: `def two_sum(nums, target):
    seen = {}  # value -> index
    for i, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i  # store AFTER checking so x can't pair with itself
    return []`,
                javascript: `function twoSum(nums, target) {
    const seen = new Map(); // value -> index
    for (let i = 0; i < nums.length; i++) {
        const need = target - nums[i];
        if (seen.has(need)) return [seen.get(need), i];
        seen.set(nums[i], i); // store AFTER checking so x can't pair with itself
    }
    return [];
}`,
            },
            {
                id: "hm-count",
                name: "Frequency count / group by key",
                python: `from collections import Counter, defaultdict

def group_anagrams(strs):
    groups = defaultdict(list)
    for s in strs:
        groups[tuple(sorted(s))].append(s)  # canonical key
    return list(groups.values())

def is_anagram(a, b):
    return Counter(a) == Counter(b)`,
                javascript: `function groupAnagrams(strs) {
    const groups = new Map();
    for (const s of strs) {
        const key = [...s].sort().join(""); // canonical key
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(s);
    }
    return [...groups.values()];
}

function countFreq(arr) {
    const freq = new Map();
    for (const x of arr) freq.set(x, (freq.get(x) ?? 0) + 1);
    return freq;
}`,
            },
        ],
        variants: [
            "Complement lookup (two sum)",
            "Seen-set for duplicates / cycle detection",
            "Frequency counter",
            "Group by canonical key (sorted string, count tuple)",
            "Value → index / last position map",
        ],
        pitfalls: [
            "Inserting before checking lets an element pair with itself (two sum with target = 2x).",
            "Mutable keys: Python lists can't be keys (use a tuple); JS objects/arrays hash by reference, so join them into a string.",
            "If the input is already sorted, two pointers gives O(1) space instead of O(n).",
        ],
        related: [
            { id: "two-pointers", how: "Sorted input → two pointers in O(1) space; unsorted and you can't sort (need original indices) → hash map." },
            { id: "prefix-sum", how: "If the thing you look up is a running total (\"subarray sums to k\"), it's prefix sum + hash map, not plain value lookup." },
            { id: "sliding-window", how: "A map that counts chars inside a moving contiguous range is a sliding window; a map over the whole input is plain hashing." },
        ],
    },
    {
        id: "prefix-sum",
        name: "Prefix Sum",
        category: "Arrays & Strings",
        short: "Precompute running totals so any range sum is one subtraction.",
        description:
            "prefix[i] holds the sum of the first i elements, so sum(l..r) = prefix[r+1] − prefix[l] in O(1). Pairing the running sum with a hash map of earlier prefix sums counts subarrays with a given sum in one pass — and unlike sliding window it works with negative numbers.",
        signals: [
            "range sum query",
            "subarray sum equals k",
            "many range queries",
            "negative numbers allowed",
            "running total",
            "product except self",
            "divisible by k",
        ],
        question: "Can the answer for a range be written as (total up to r) − (total up to l−1)?",
        dataStructures: ["Array", "Hash Map"],
        complexity: { time: "O(n)", space: "O(n)" },
        templates: [
            {
                id: "ps-array",
                name: "Range-sum queries",
                python: `def build_prefix(nums):
    prefix = [0] * (len(nums) + 1)  # prefix[i] = sum(nums[:i])
    for i, x in enumerate(nums):
        prefix[i + 1] = prefix[i] + x
    return prefix

def range_sum(prefix, l, r):  # inclusive [l, r]
    return prefix[r + 1] - prefix[l]`,
                javascript: `function buildPrefix(nums) {
    const prefix = new Array(nums.length + 1).fill(0); // prefix[i] = sum of first i
    for (let i = 0; i < nums.length; i++) prefix[i + 1] = prefix[i] + nums[i];
    return prefix;
}

function rangeSum(prefix, l, r) { // inclusive [l, r]
    return prefix[r + 1] - prefix[l];
}`,
            },
            {
                id: "ps-hashmap",
                name: "Prefix sum + hash map counting",
                python: `from collections import defaultdict

def subarray_sum(nums, k):
    count = defaultdict(int)
    count[0] = 1  # the empty prefix
    total = res = 0
    for x in nums:
        total += x
        res += count[total - k]  # earlier prefixes that leave exactly k
        count[total] += 1
    return res`,
                javascript: `function subarraySum(nums, k) {
    const count = new Map([[0, 1]]); // the empty prefix
    let total = 0, res = 0;
    for (const x of nums) {
        total += x;
        res += count.get(total - k) ?? 0; // earlier prefixes that leave exactly k
        count.set(total, (count.get(total) ?? 0) + 1);
    }
    return res;
}`,
            },
        ],
        variants: [
            "1D prefix array for range queries",
            "Prefix sum + hash map (count / longest subarray with sum k)",
            "Prefix modulo k (divisible subarrays)",
            "Prefix and suffix products (product except self)",
            "2D prefix sums for submatrix queries",
        ],
        pitfalls: [
            "Forgetting to seed the map with {0: 1} misses subarrays that start at index 0.",
            "Off-by-one: use a length n+1 array so prefix[0] = 0 and the range formula has no special case.",
            "For 'longest subarray with sum k', store the FIRST index of each prefix sum, not the latest.",
        ],
        related: [
            { id: "sliding-window", how: "All values non-negative → window can shrink monotonically; negatives break that, so use prefix sum + hash map." },
            { id: "hash-map", how: "Prefix sum is the idea (range = difference of totals); the hash map is just how you look up earlier totals fast." },
        ],
    },
    {
        id: "two-pointers",
        name: "Two Pointers",
        category: "Arrays & Strings",
        short: "Two indices moving through the array replace a nested loop.",
        description:
            "Two indices walk the input — converging from both ends of a sorted array, or moving in the same direction as read/write or fast/slow pointers. Each step permanently discards candidates, so a pair search that would be O(n²) becomes O(n) with O(1) extra space.",
        signals: [
            "sorted array",
            "pair / triplet with sum",
            "palindrome",
            "in place",
            "remove duplicates",
            "container / water between lines",
            "O(1) extra space",
        ],
        question: "Does comparing the two ends (or a read and a write position) tell me which pointer can safely move?",
        dataStructures: ["Array", "String"],
        complexity: { time: "O(n)", space: "O(1)" },
        templates: [
            {
                id: "tp-converge",
                name: "Converge from both ends",
                python: `def pair_sum_sorted(nums, target):
    l, r = 0, len(nums) - 1
    while l < r:
        s = nums[l] + nums[r]
        if s == target:
            return [l, r]
        if s < target:
            l += 1  # need bigger: only moving l can help
        else:
            r -= 1  # need smaller: only moving r can help
    return []`,
                javascript: `function pairSumSorted(nums, target) {
    let l = 0, r = nums.length - 1;
    while (l < r) {
        const s = nums[l] + nums[r];
        if (s === target) return [l, r];
        if (s < target) l++; // need bigger: only moving l can help
        else r--;            // need smaller: only moving r can help
    }
    return [];
}`,
            },
            {
                id: "tp-same-direction",
                name: "Read / write (same direction)",
                python: `def remove_duplicates(nums):  # sorted, modify in place
    if not nums:
        return 0
    write = 1  # nums[:write] is the kept prefix
    for read in range(1, len(nums)):
        if nums[read] != nums[write - 1]:
            nums[write] = nums[read]
            write += 1
    return write`,
                javascript: `function removeDuplicates(nums) { // sorted, modify in place
    if (nums.length === 0) return 0;
    let write = 1; // nums[0..write) is the kept prefix
    for (let read = 1; read < nums.length; read++) {
        if (nums[read] !== nums[write - 1]) {
            nums[write] = nums[read];
            write++;
        }
    }
    return write;
}`,
            },
        ],
        variants: [
            "Converging pair search (two sum II, container with most water)",
            "Sort + fix one + converge (3Sum, 4Sum)",
            "Palindrome check from both ends",
            "Read/write compaction (remove element, move zeroes)",
            "Two arrays merged from the back",
        ],
        pitfalls: [
            "Unsorted input: converging only works if you may sort first (O(n log n)) — and sorting loses original indices.",
            "Skipping duplicates in 3Sum: advance past equal values after recording a triplet, or you emit repeats.",
            "Use l < r (not <=) when an element can't pair with itself.",
        ],
        related: [
            { id: "sliding-window", how: "Sliding window's two pointers bound a contiguous range you aggregate over; two pointers compare the values AT the pointers." },
            { id: "binary-search", how: "Both exploit sortedness; for each element you could binary-search its partner (O(n log n)), converging pointers do it in O(n)." },
            { id: "linked-list", how: "Fast/slow pointers on a linked list (cycle, middle) are the same idea on nodes instead of indices." },
        ],
    },
    {
        id: "sliding-window",
        name: "Sliding Window",
        category: "Arrays & Strings",
        short: "Grow the right edge, shrink the left — each element enters and leaves once.",
        description:
            "Maintain a contiguous window [left, right] plus a summary of it (sum, counts, distinct chars). Expand right each step and shrink left only while the window is invalid, so every element is added and removed at most once — O(n) instead of checking all O(n²) subarrays.",
        signals: [
            "contiguous subarray",
            "substring",
            "longest / shortest",
            "at most k distinct",
            "window of size k",
            "without repeating characters",
            "minimum window",
        ],
        question: "Is the answer a contiguous range whose validity changes monotonically as it grows or shrinks?",
        dataStructures: ["Array", "String", "Hash Map", "Hash Set", "Deque"],
        complexity: { time: "O(n)", space: "O(k)" },
        templates: [
            {
                id: "sw-variable",
                name: "Variable window",
                python: `def longest_unique_substring(s):
    count = {}
    left = best = 0
    for right, c in enumerate(s):
        count[c] = count.get(c, 0) + 1
        while count[c] > 1:  # window invalid -> shrink from the left
            count[s[left]] -= 1
            left += 1
        best = max(best, right - left + 1)  # window [left, right] is valid
    return best`,
                javascript: `function longestUniqueSubstring(s) {
    const count = new Map();
    let left = 0, best = 0;
    for (let right = 0; right < s.length; right++) {
        const c = s[right];
        count.set(c, (count.get(c) ?? 0) + 1);
        while (count.get(c) > 1) { // window invalid -> shrink from the left
            count.set(s[left], count.get(s[left]) - 1);
            left++;
        }
        best = Math.max(best, right - left + 1); // window [left, right] is valid
    }
    return best;
}`,
            },
            {
                id: "sw-fixed",
                name: "Fixed-size window",
                python: `def max_sum_window(nums, k):
    window = sum(nums[:k])
    best = window
    for i in range(k, len(nums)):
        window += nums[i] - nums[i - k]  # add new right, drop old left
        best = max(best, window)
    return best`,
                javascript: `function maxSumWindow(nums, k) {
    let window = 0;
    for (let i = 0; i < k; i++) window += nums[i];
    let best = window;
    for (let i = k; i < nums.length; i++) {
        window += nums[i] - nums[i - k]; // add new right, drop old left
        best = Math.max(best, window);
    }
    return best;
}`,
            },
        ],
        variants: [
            "Fixed-size window (size k averages, anagram in string)",
            "Variable window: longest valid (shrink while invalid)",
            "Variable window: shortest valid (shrink while valid)",
            "Window with hash map of counts",
            "Monotonic deque window (sliding window maximum)",
        ],
        pitfalls: [
            "Needs monotonic validity: with negative numbers a 'sum ≥ k' window can't be shrunk greedily — use prefix sums.",
            "'Exactly k' is easiest as atMost(k) − atMost(k − 1).",
            "Update the answer at the right moment: after shrinking for 'longest', inside the shrink loop for 'shortest'.",
        ],
        related: [
            { id: "two-pointers", how: "Window problems ask about everything BETWEEN the pointers (a contiguous range); two-pointer problems ask about the two elements themselves." },
            { id: "prefix-sum", how: "Prefix sums handle range sums with negatives or arbitrary query ranges; windows need a monotonic grow/shrink condition." },
            { id: "monotonic-stack", how: "Sliding window maximum keeps a monotonic deque — that's a window whose summary is a monotonic structure." },
        ],
    },
    {
        id: "binary-search",
        name: "Binary Search",
        category: "Arrays & Strings",
        short: "Halve a sorted or monotonic search space each step.",
        description:
            "If a yes/no predicate over a range flips exactly once (F…F T…T), testing the middle tells you which half to discard, giving O(log n). The range can be array indices, or the space of possible answers (\"minimum speed\", \"smallest capacity\") when feasibility is monotonic.",
        signals: [
            "sorted array",
            "O(log n) required",
            "rotated sorted array",
            "first / last position",
            "minimum capacity / speed",
            "minimize the maximum",
            "find peak",
        ],
        question: "Is there a monotonic yes/no condition so that checking the middle rules out half the candidates?",
        dataStructures: ["Array"],
        complexity: { time: "O(log n)", space: "O(1)" },
        templates: [
            {
                id: "bs-exact",
                name: "Exact match",
                python: `def search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1`,
                javascript: `function search(nums, target) {
    let lo = 0, hi = nums.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (nums[mid] === target) return mid;
        if (nums[mid] < target) lo = mid + 1;
        else hi = mid - 1;
    }
    return -1;
}`,
            },
            {
                id: "bs-boundary",
                name: "First true / lower bound",
                python: `def lower_bound(nums, target):
    # first index i with nums[i] >= target (len(nums) if none)
    lo, hi = 0, len(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] >= target:
            hi = mid  # mid might be the answer: keep it
        else:
            lo = mid + 1
    return lo`,
                javascript: `function lowerBound(nums, target) {
    // first index i with nums[i] >= target (nums.length if none)
    let lo = 0, hi = nums.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (nums[mid] >= target) hi = mid; // mid might be the answer: keep it
        else lo = mid + 1;
    }
    return lo;
}`,
            },
            {
                id: "bs-answer",
                name: "Binary search on the answer",
                python: `def min_feasible(lo, hi, feasible):
    # smallest x in [lo, hi] with feasible(x) True; feasible goes F..F T..T
    while lo < hi:
        mid = (lo + hi) // 2
        if feasible(mid):
            hi = mid
        else:
            lo = mid + 1
    return lo

# Koko eating bananas:
# min_feasible(1, max(piles), lambda k: sum((p + k - 1) // k for p in piles) <= h)`,
                javascript: `function minFeasible(lo, hi, feasible) {
    // smallest x in [lo, hi] with feasible(x) true; feasible goes F..F T..T
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (feasible(mid)) hi = mid;
        else lo = mid + 1;
    }
    return lo;
}

// Koko eating bananas:
// minFeasible(1, Math.max(...piles), k => piles.reduce((t, p) => t + Math.ceil(p / k), 0) <= h)`,
            },
        ],
        variants: [
            "Exact match",
            "Lower / upper bound (first ≥, first >)",
            "Rotated sorted array (decide which half is sorted)",
            "Binary search on the answer (capacity, speed, max-min)",
            "Peak finding on a non-sorted but locally monotonic array",
        ],
        pitfalls: [
            "Mixing conventions: lo <= hi with hi = mid − 1, OR lo < hi with hi = mid — never lo <= hi with hi = mid (infinite loop).",
            "For 'last true' searches use mid = (lo + hi + 1) // 2 so the loop makes progress.",
            "On the answer: get the bounds right (lo = smallest possible, hi = a value surely feasible).",
        ],
        related: [
            { id: "two-pointers", how: "Two pointers walk a sorted array linearly comparing pairs; binary search jumps to a single target or boundary." },
            { id: "greedy", how: "Binary search on the answer usually wraps a greedy feasibility check (\"can we finish with capacity c?\")." },
            { id: "heap", how: "\"k-th smallest\" in sorted structures can be binary search on the value range or a heap; heap is O(k log n), value search is O(n log range)." },
        ],
    },

    // ───────────────────────────── Linear Structures ─────────────────────────────
    {
        id: "stack",
        name: "Stack",
        category: "Linear Structures",
        short: "Last in, first out: the most recent open item is resolved first.",
        description:
            "Push items as they open and pop when they close, so the innermost / most recent item is always on top. Perfect for nested structure (brackets, paths, tags) and for evaluating expressions or simulating undo, each in a single O(n) pass.",
        signals: [
            "valid parentheses",
            "nested / balanced",
            "matching pairs",
            "evaluate expression",
            "reverse Polish notation",
            "undo / backspace",
            "simplify path",
            "min stack",
        ],
        question: "Must the most recently opened / pushed item be the first one matched or resolved?",
        dataStructures: ["Stack", "String"],
        complexity: { time: "O(n)", space: "O(n)" },
        templates: [
            {
                id: "st-matching",
                name: "Bracket matching",
                python: `def is_valid(s):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for c in s:
        if c in pairs:  # closer: must match the latest opener
            if not stack or stack.pop() != pairs[c]:
                return False
        else:
            stack.append(c)
    return not stack  # leftovers = unclosed openers`,
                javascript: `function isValid(s) {
    const pairs = { ")": "(", "]": "[", "}": "{" };
    const stack = [];
    for (const c of s) {
        if (c in pairs) { // closer: must match the latest opener
            if (stack.length === 0 || stack.pop() !== pairs[c]) return false;
        } else {
            stack.push(c);
        }
    }
    return stack.length === 0; // leftovers = unclosed openers
}`,
            },
            {
                id: "st-eval",
                name: "Expression evaluation / simulation",
                python: `def eval_rpn(tokens):
    ops = {
        "+": lambda a, b: a + b,
        "-": lambda a, b: a - b,
        "*": lambda a, b: a * b,
        "/": lambda a, b: int(a / b),  # truncate toward zero
    }
    stack = []
    for t in tokens:
        if t in ops:
            b, a = stack.pop(), stack.pop()  # right operand pops first
            stack.append(ops[t](a, b))
        else:
            stack.append(int(t))
    return stack[-1]`,
                javascript: `function evalRPN(tokens) {
    const ops = {
        "+": (a, b) => a + b,
        "-": (a, b) => a - b,
        "*": (a, b) => a * b,
        "/": (a, b) => Math.trunc(a / b), // truncate toward zero
    };
    const stack = [];
    for (const t of tokens) {
        if (t in ops) {
            const b = stack.pop(), a = stack.pop(); // right operand pops first
            stack.push(ops[t](a, b));
        } else {
            stack.push(Number(t));
        }
    }
    return stack[stack.length - 1];
}`,
            },
        ],
        variants: [
            "Bracket / tag matching",
            "Postfix (RPN) and infix calculators",
            "Path / string simplification (backspace, '..')",
            "Min stack (pair each value with the running min)",
            "Decode nested strings (k[abc]) with a stack of contexts",
        ],
        pitfalls: [
            "Popping from an empty stack — always check before popping on a closer.",
            "Operand order: the first pop is the RIGHT operand (a − b, a / b).",
            "Python's // floors toward −∞; problems usually want truncation toward 0 (int(a / b)).",
        ],
        related: [
            { id: "monotonic-stack", how: "A monotonic stack pops by comparing VALUES (next greater/smaller); a plain stack pops by structure (matching closer, operator)." },
            { id: "dfs", how: "Iterative DFS is a stack of nodes; if the problem is about a tree or graph, think DFS, not stack." },
        ],
    },
    {
        id: "monotonic-stack",
        name: "Monotonic Stack",
        category: "Linear Structures",
        short: "Keep a stack sorted so each element finds its next greater/smaller in O(1) amortized.",
        description:
            "Keep indices on a stack whose values stay increasing (or decreasing). When a new element breaks the order, every popped index has just found its \"next greater/smaller\" element. Each index is pushed and popped once, so all answers come out in O(n) instead of O(n²).",
        signals: [
            "next greater element",
            "next smaller element",
            "days until warmer",
            "largest rectangle in histogram",
            "stock span",
            "previous smaller",
            "remove k digits",
        ],
        question: "For every element, do I need the nearest element to the left/right that is bigger or smaller?",
        dataStructures: ["Stack", "Array"],
        complexity: { time: "O(n)", space: "O(n)" },
        templates: [
            {
                id: "ms-next-greater",
                name: "Next greater element",
                python: `def next_greater(nums):
    res = [-1] * len(nums)
    stack = []  # indices; their values are decreasing
    for i, x in enumerate(nums):
        while stack and nums[stack[-1]] < x:
            res[stack.pop()] = x  # x is the next greater for the popped index
        stack.append(i)
    return res  # indices left on the stack have no greater element

# daily temperatures: res[j] = i - j instead of x`,
                javascript: `function nextGreater(nums) {
    const res = new Array(nums.length).fill(-1);
    const stack = []; // indices; their values are decreasing
    for (let i = 0; i < nums.length; i++) {
        while (stack.length && nums[stack[stack.length - 1]] < nums[i]) {
            res[stack.pop()] = nums[i]; // nums[i] is the next greater for the popped index
        }
        stack.push(i);
    }
    return res; // indices left on the stack have no greater element
}

// daily temperatures: res[j] = i - j instead of nums[i]`,
            },
        ],
        variants: [
            "Next greater (decreasing stack)",
            "Next smaller (increasing stack)",
            "Previous greater/smaller (read the top before pushing)",
            "Histogram areas (pop gives height, new top and i give width)",
            "Circular array (iterate 2n with i % n)",
            "Monotonic deque for sliding window max/min",
        ],
        pitfalls: [
            "Store indices, not values — you usually need distances or widths.",
            "Strict vs non-strict comparison changes how duplicates are handled; pick deliberately.",
            "Largest rectangle: push a sentinel height 0 at the end to flush the stack.",
        ],
        related: [
            { id: "stack", how: "Plain stacks match structure (brackets); monotonic stacks pop based on value comparisons to find nearest bigger/smaller." },
            { id: "two-pointers", how: "Trapping rain water can be done with either: two pointers in O(1) space, or a monotonic stack that fills basins layer by layer." },
            { id: "heap", how: "A heap gives the global max of a changing set; a monotonic stack gives each element its NEAREST bigger/smaller neighbour." },
        ],
    },
    {
        id: "linked-list",
        name: "Linked List Pointers",
        category: "Linear Structures",
        short: "Rewire next pointers in place, or race fast/slow pointers.",
        description:
            "Linked list problems are pointer bookkeeping: reverse by redirecting next pointers, find middles/cycles with a slow and a fast pointer, and splice lists together behind a dummy head. All run in O(n) with O(1) extra space because nodes are relinked rather than copied.",
        signals: [
            "linked list",
            "reverse in place",
            "detect cycle",
            "middle node",
            "n-th from the end",
            "merge sorted lists",
            "reorder list",
            "O(1) extra memory",
        ],
        question: "Can I solve this by rewiring next pointers, or by two pointers at different speeds/offsets?",
        dataStructures: ["Linked List"],
        complexity: { time: "O(n)", space: "O(1)" },
        templates: [
            {
                id: "ll-reverse",
                name: "Reverse in place",
                python: `def reverse_list(head):
    prev, cur = None, head
    while cur:
        nxt = cur.next  # save before overwriting
        cur.next = prev
        prev, cur = cur, nxt
    return prev  # new head`,
                javascript: `function reverseList(head) {
    let prev = null, cur = head;
    while (cur) {
        const nxt = cur.next; // save before overwriting
        cur.next = prev;
        prev = cur;
        cur = nxt;
    }
    return prev; // new head
}`,
            },
            {
                id: "ll-fast-slow",
                name: "Fast / slow pointers",
                python: `def has_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
        if slow is fast:
            return True
    return False

def middle(head):
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
    return slow  # second middle when length is even`,
                javascript: `function hasCycle(head) {
    let slow = head, fast = head;
    while (fast && fast.next) {
        slow = slow.next;
        fast = fast.next.next;
        if (slow === fast) return true;
    }
    return false;
}

function middle(head) {
    let slow = head, fast = head;
    while (fast && fast.next) {
        slow = slow.next;
        fast = fast.next.next;
    }
    return slow; // second middle when length is even
}`,
            },
            {
                id: "ll-dummy-merge",
                name: "Dummy head + merge",
                python: `def merge_two_lists(l1, l2):
    dummy = tail = ListNode()  # dummy avoids special-casing the head
    while l1 and l2:
        if l1.val <= l2.val:
            tail.next, l1 = l1, l1.next
        else:
            tail.next, l2 = l2, l2.next
        tail = tail.next
    tail.next = l1 or l2  # attach the leftover
    return dummy.next`,
                javascript: `function mergeTwoLists(l1, l2) {
    const dummy = new ListNode(); // dummy avoids special-casing the head
    let tail = dummy;
    while (l1 && l2) {
        if (l1.val <= l2.val) { tail.next = l1; l1 = l1.next; }
        else { tail.next = l2; l2 = l2.next; }
        tail = tail.next;
    }
    tail.next = l1 ?? l2; // attach the leftover
    return dummy.next;
}`,
            },
        ],
        variants: [
            "Full / partial / k-group reversal",
            "Floyd cycle detection (+ find cycle start)",
            "Middle node, then reverse second half (palindrome, reorder)",
            "Gap pointers: remove n-th from end",
            "Dummy head for merges and deletions",
        ],
        pitfalls: [
            "Losing the rest of the list: save cur.next before reassigning it.",
            "Null checks: fast-pointer loops need `fast and fast.next`.",
            "Removing the head is a special case unless you start from a dummy node.",
        ],
        related: [
            { id: "two-pointers", how: "Fast/slow and gap pointers are two pointers on nodes; on arrays you'd use indices and random access instead." },
            { id: "heap", how: "Merging TWO lists is a dummy-head merge; merging K lists adds a min-heap of current heads (k-way merge)." },
            { id: "hash-map", how: "A visited set also detects cycles but costs O(n) space; fast/slow does it in O(1)." },
        ],
    },
    {
        id: "heap",
        name: "Heap / Priority Queue",
        category: "Linear Structures",
        short: "Always pull the current smallest/largest in O(log n).",
        description:
            "A binary heap gives O(1) access to the min (or max) and O(log n) push/pop. Keeping a heap of size k answers top-k / k-th largest in O(n log k); a heap of list heads merges k sorted lists; two heaps split a stream around its median.",
        signals: [
            "k-th largest / smallest",
            "top k frequent",
            "k closest",
            "merge k sorted",
            "median of a stream",
            "always process the smallest next",
            "schedule by priority",
        ],
        question: "Do I only ever need the current best item (or best k) out of a set that keeps changing?",
        dataStructures: ["Heap", "Hash Map"],
        complexity: { time: "O(n log k)", space: "O(k)" },
        templates: [
            {
                id: "hp-top-k",
                name: "Top k with a size-k heap",
                python: `import heapq

def kth_largest(nums, k):
    heap = []  # min-heap holding the k largest seen so far
    for x in nums:
        heapq.heappush(heap, x)
        if len(heap) > k:
            heapq.heappop(heap)  # evict the smallest of the k + 1
    return heap[0]  # smallest of the top k = k-th largest

# max-heap in Python: push -x (or tuples like (-count, item))`,
                javascript: `// JS has no built-in heap. LeetCode provides PriorityQueue
// (@datastructures-js/priority-queue v6): enqueue / dequeue / front / size().
function kthLargest(nums, k) {
    const heap = new PriorityQueue((a, b) => a - b); // min-heap of the k largest
    for (const x of nums) {
        heap.enqueue(x);
        if (heap.size() > k) heap.dequeue(); // evict the smallest of the k + 1
    }
    return heap.front(); // smallest of the top k = k-th largest
}`,
            },
            {
                id: "hp-k-way-merge",
                name: "K-way merge",
                python: `import heapq

def merge_k_sorted(lists):
    heap = [(lst[0], i, 0) for i, lst in enumerate(lists) if lst]
    heapq.heapify(heap)  # (value, list index, element index)
    out = []
    while heap:
        val, i, j = heapq.heappop(heap)
        out.append(val)
        if j + 1 < len(lists[i]):
            heapq.heappush(heap, (lists[i][j + 1], i, j + 1))
    return out`,
                javascript: `// LeetCode runtime: PriorityQueue (@datastructures-js/priority-queue v6)
function mergeKSorted(lists) {
    const heap = new PriorityQueue((a, b) => a[0] - b[0]); // [value, listIdx, elemIdx]
    lists.forEach((lst, i) => { if (lst.length) heap.enqueue([lst[0], i, 0]); });
    const out = [];
    while (heap.size() > 0) {
        const [val, i, j] = heap.dequeue();
        out.push(val);
        if (j + 1 < lists[i].length) heap.enqueue([lists[i][j + 1], i, j + 1]);
    }
    return out;
}`,
            },
            {
                id: "hp-two-heaps",
                name: "Two heaps (running median)",
                python: `import heapq

class MedianFinder:
    def __init__(self):
        self.lo = []  # max-heap via negatives: smaller half
        self.hi = []  # min-heap: larger half

    def add_num(self, num):
        heapq.heappush(self.lo, -num)
        heapq.heappush(self.hi, -heapq.heappop(self.lo))  # move lo's max to hi
        if len(self.hi) > len(self.lo):  # keep len(lo) >= len(hi)
            heapq.heappush(self.lo, -heapq.heappop(self.hi))

    def find_median(self):
        if len(self.lo) > len(self.hi):
            return -self.lo[0]
        return (-self.lo[0] + self.hi[0]) / 2`,
                javascript: `// LeetCode runtime: PriorityQueue (@datastructures-js/priority-queue v6)
class MedianFinder {
    constructor() {
        this.lo = new PriorityQueue((a, b) => b - a); // max-heap: smaller half
        this.hi = new PriorityQueue((a, b) => a - b); // min-heap: larger half
    }
    addNum(num) {
        this.lo.enqueue(num);
        this.hi.enqueue(this.lo.dequeue()); // move lo's max to hi
        if (this.hi.size() > this.lo.size()) this.lo.enqueue(this.hi.dequeue());
    }
    findMedian() {
        if (this.lo.size() > this.hi.size()) return this.lo.front();
        return (this.lo.front() + this.hi.front()) / 2;
    }
}`,
            },
        ],
        variants: [
            "Size-k min-heap for top k largest (max-heap for k smallest)",
            "Frequency map + heap (top k frequent)",
            "K-way merge of sorted lists / matrix rows",
            "Two heaps for median / balancing halves",
            "Greedy scheduling (task scheduler, IPO)",
        ],
        pitfalls: [
            "Python's heapq is a MIN-heap only — negate values (or keys) for a max-heap.",
            "Tuples compare element-wise: add a tie-breaker (index) before uncomparable objects like ListNode.",
            "Heapifying all n then popping k is O(n + k log n); a size-k heap is O(n log k) — know which you're claiming.",
        ],
        related: [
            { id: "binary-search", how: "Sorted input with random access → binary search; a stream or unsorted data where you repeatedly need the extreme → heap." },
            { id: "intervals", how: "Meeting-rooms style problems keep a min-heap of END times; the heap is the tool, intervals is the pattern." },
            { id: "shortest-path", how: "Dijkstra is a heap keyed by distance; if edges are weighted and you need the cheapest path, it's shortest-path." },
        ],
    },

    // ───────────────────────────── Ordering & Greedy ─────────────────────────────
    {
        id: "intervals",
        name: "Intervals",
        category: "Ordering & Greedy",
        short: "Sort by start (or end), then sweep once, comparing each interval to the last.",
        description:
            "Interval problems become linear after sorting: by start to merge or insert, by end to keep the most non-overlapping ones, or as separate start/end event lists to count how many overlap at once. Sorting dominates, so the total is O(n log n).",
        signals: [
            "intervals [start, end]",
            "merge overlapping",
            "meeting rooms",
            "insert interval",
            "non-overlapping",
            "minimum arrows / rooms",
            "schedule / calendar",
        ],
        question: "Is the input a list of [start, end] ranges where sorting lets me compare each one only to its neighbour?",
        dataStructures: ["Array", "Heap"],
        complexity: { time: "O(n log n)", space: "O(n)" },
        templates: [
            {
                id: "iv-merge",
                name: "Merge overlapping",
                python: `def merge(intervals):
    intervals.sort(key=lambda iv: iv[0])
    merged = []
    for start, end in intervals:
        if merged and start <= merged[-1][1]:  # overlaps the last kept interval
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged`,
                javascript: `function merge(intervals) {
    intervals.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [start, end] of intervals) {
        const last = merged[merged.length - 1];
        if (last && start <= last[1]) last[1] = Math.max(last[1], end); // overlap
        else merged.push([start, end]);
    }
    return merged;
}`,
            },
            {
                id: "iv-sweep",
                name: "Sweep starts and ends (max overlap)",
                python: `def min_meeting_rooms(intervals):
    starts = sorted(s for s, _ in intervals)
    ends = sorted(e for _, e in intervals)
    rooms = j = 0
    for s in starts:
        if s >= ends[j]:
            j += 1      # a meeting has ended: reuse its room
        else:
            rooms += 1  # every room busy: open another
    return rooms

# heap form: sort by start, keep a min-heap of end times;
# pop when heap[0] <= start, push end; answer = len(heap)`,
                javascript: `function minMeetingRooms(intervals) {
    const starts = intervals.map(iv => iv[0]).sort((a, b) => a - b);
    const ends = intervals.map(iv => iv[1]).sort((a, b) => a - b);
    let rooms = 0, j = 0;
    for (const s of starts) {
        if (s >= ends[j]) j++; // a meeting has ended: reuse its room
        else rooms++;          // every room busy: open another
    }
    return rooms;
}

// heap form: sort by start, keep a min-heap of end times;
// pop when the earliest end <= start, push end; answer = heap size`,
            },
        ],
        variants: [
            "Merge overlapping (sort by start)",
            "Insert into sorted intervals (before / overlap / after)",
            "Max non-overlapping / min removals (sort by END, greedy)",
            "Max simultaneous overlap (sweep or min-heap of ends)",
            "Interval intersection of two sorted lists (two pointers)",
        ],
        pitfalls: [
            "Touching endpoints: decide whether [1,2] and [2,3] overlap (merge: yes with <=; meetings: no).",
            "Sort by END for 'keep the most non-overlapping' — sorting by start only works if, on each overlap, you keep the interval with the smaller end.",
            "Don't mutate input intervals you still need (merged[-1][1] = … aliases the original list).",
        ],
        related: [
            { id: "greedy", how: "Interval scheduling is greedy underneath; it's 'intervals' when the input is literally [start, end] pairs and sorting by an endpoint is the move." },
            { id: "heap", how: "The heap only appears when you must track which ongoing intervals end first (rooms, CPU tasks); merging needs no heap." },
            { id: "prefix-sum", how: "With small integer coordinates, a difference array (+1 at start, −1 at end, then prefix sum) counts overlaps without sorting." },
        ],
    },
    {
        id: "greedy",
        name: "Greedy",
        category: "Ordering & Greedy",
        short: "Make the locally best choice each step and never look back.",
        description:
            "Commit to the choice that looks best right now — farthest reach, cheapest so far, smallest that fits — and never revisit it. It works when an exchange argument shows some optimal solution makes the same choice, giving O(n) or O(n log n) where DP would be heavier.",
        signals: [
            "minimum number of jumps",
            "can you reach the end",
            "maximize profit",
            "assign / match greedily",
            "best so far",
            "gas station",
            "partition into fewest groups",
        ],
        question: "Is there a choice I can lock in now that never needs to be undone, no matter what comes later?",
        dataStructures: ["Array"],
        complexity: { time: "O(n log n)", space: "O(1)" },
        templates: [
            {
                id: "gr-reach",
                name: "Track farthest / best-so-far",
                python: `def can_jump(nums):
    farthest = 0
    for i, step in enumerate(nums):
        if i > farthest:
            return False  # i is unreachable
        farthest = max(farthest, i + step)
    return True

def max_profit(prices):  # one buy, one sell
    best, lowest = 0, float("inf")
    for p in prices:
        lowest = min(lowest, p)
        best = max(best, p - lowest)
    return best`,
                javascript: `function canJump(nums) {
    let farthest = 0;
    for (let i = 0; i < nums.length; i++) {
        if (i > farthest) return false; // i is unreachable
        farthest = Math.max(farthest, i + nums[i]);
    }
    return true;
}

function maxProfit(prices) { // one buy, one sell
    let best = 0, lowest = Infinity;
    for (const p of prices) {
        lowest = Math.min(lowest, p);
        best = Math.max(best, p - lowest);
    }
    return best;
}`,
            },
            {
                id: "gr-sort",
                name: "Sort, then choose",
                python: `def find_content_children(greed, cookies):
    greed.sort()
    cookies.sort()
    child = 0
    for c in cookies:  # smallest cookie first
        if child < len(greed) and c >= greed[child]:
            child += 1  # least greedy child takes the smallest cookie that fits
    return child`,
                javascript: `function findContentChildren(greed, cookies) {
    greed.sort((a, b) => a - b);
    cookies.sort((a, b) => a - b);
    let child = 0;
    for (const c of cookies) { // smallest cookie first
        if (child < greed.length && c >= greed[child]) child++; // smallest that fits
    }
    return child;
}`,
            },
        ],
        variants: [
            "Farthest reach (jump game I / II)",
            "Running best-so-far (stock buy/sell, Kadane-style)",
            "Sort then pair / assign (cookies, boats)",
            "Balance / surplus tracking (gas station, valid parenthesis string)",
            "Last occurrence partitioning (partition labels)",
        ],
        pitfalls: [
            "Greedy without a proof often fails (coin change with arbitrary coins needs DP) — test a counter-example.",
            "JS sort is lexicographic by default: always pass (a, b) => a - b.",
            "Jump game II counts BFS-like layers: increment jumps when i reaches the current layer's end.",
        ],
        related: [
            { id: "dynamic-programming", how: "If a locally best choice can be wrong later (you'd need to compare several futures), it's DP; greedy commits without comparing." },
            { id: "intervals", how: "If the input is [start, end] pairs, reach for the intervals playbook (sort by start/end) first." },
            { id: "heap", how: "Greedy that repeatedly needs the current best among changing options uses a heap (task scheduler, IPO)." },
        ],
    },

    // ───────────────────────────── Trees & Graphs ─────────────────────────────
    {
        id: "dfs",
        name: "DFS (Depth-First Search)",
        category: "Trees & Graphs",
        short: "Go as deep as possible, then backtrack — recursion on trees, grids and graphs.",
        description:
            "Recursively (or with an explicit stack) follow one branch to the end before trying the next. On trees, combine children's answers on the way back up; on grids and graphs, mark nodes visited to flood-fill components or detect cycles. Each node and edge is processed once: O(V + E), O(n) for trees.",
        signals: [
            "binary tree",
            "root-to-leaf path",
            "depth / height / diameter",
            "validate BST",
            "number of islands",
            "connected components",
            "clone graph",
        ],
        question: "Can the answer for a node be built from its children's answers, or do I need to visit everything reachable?",
        dataStructures: ["Tree", "Graph", "Matrix", "Hash Set", "Stack"],
        complexity: { time: "O(V + E)", space: "O(V)" },
        templates: [
            {
                id: "dfs-tree",
                name: "Tree recursion (post-order combine)",
                python: `def max_depth(root):
    if not root:
        return 0  # base case: empty subtree
    left = max_depth(root.left)
    right = max_depth(root.right)
    return 1 + max(left, right)  # combine children on the way up

# global answer (diameter, max path sum): keep a nonlocal best,
# update it with left + right, but RETURN only one branch upward.`,
                javascript: `function maxDepth(root) {
    if (!root) return 0; // base case: empty subtree
    const left = maxDepth(root.left);
    const right = maxDepth(root.right);
    return 1 + Math.max(left, right); // combine children on the way up
}

// global answer (diameter, max path sum): keep an outer best,
// update it with left + right, but RETURN only one branch upward.`,
            },
            {
                id: "dfs-grid",
                name: "Grid flood fill",
                python: `def num_islands(grid):
    rows, cols = len(grid), len(grid[0])

    def dfs(r, c):
        if r < 0 or c < 0 or r >= rows or c >= cols or grid[r][c] != "1":
            return
        grid[r][c] = "#"  # mark visited
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            dfs(r + dr, c + dc)

    count = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == "1":
                dfs(r, c)
                count += 1
    return count`,
                javascript: `function numIslands(grid) {
    const rows = grid.length, cols = grid[0].length;
    const dfs = (r, c) => {
        if (r < 0 || c < 0 || r >= rows || c >= cols || grid[r][c] !== "1") return;
        grid[r][c] = "#"; // mark visited
        dfs(r + 1, c); dfs(r - 1, c); dfs(r, c + 1); dfs(r, c - 1);
    };
    let count = 0;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] === "1") { dfs(r, c); count++; }
        }
    }
    return count;
}`,
            },
            {
                id: "dfs-graph",
                name: "Graph DFS with visited set",
                python: `from collections import defaultdict

def count_components(n, edges):
    graph = defaultdict(list)
    for a, b in edges:
        graph[a].append(b)
        graph[b].append(a)
    seen = set()

    def dfs(u):
        seen.add(u)
        for v in graph[u]:
            if v not in seen:
                dfs(v)

    components = 0
    for u in range(n):
        if u not in seen:
            dfs(u)
            components += 1
    return components`,
                javascript: `function countComponents(n, edges) {
    const graph = Array.from({ length: n }, () => []);
    for (const [a, b] of edges) { graph[a].push(b); graph[b].push(a); }
    const seen = new Set();
    const dfs = (u) => {
        seen.add(u);
        for (const v of graph[u]) if (!seen.has(v)) dfs(v);
    };
    let components = 0;
    for (let u = 0; u < n; u++) {
        if (!seen.has(u)) { dfs(u); components++; }
    }
    return components;
}`,
            },
        ],
        variants: [
            "Post-order combine (height, balanced, diameter)",
            "Pre-order with state passed down (path sum, validate BST bounds)",
            "In-order on a BST (sorted order, k-th smallest)",
            "Grid flood fill / count islands / border-connected regions",
            "Graph traversal, cloning, cycle detection (3-color)",
        ],
        pitfalls: [
            "Mark visited BEFORE recursing into neighbours, or cycles recurse forever.",
            "Deep recursion: Python's default limit is ~1000 — use sys.setrecursionlimit or an explicit stack on big grids.",
            "Global-best problems: the value you return upward is not the value you record (single branch vs both branches).",
        ],
        related: [
            { id: "bfs", how: "Need the SHORTEST number of steps or per-level output → BFS; just need to visit/aggregate everything → DFS is simpler." },
            { id: "backtracking", how: "Backtracking is DFS over a tree of CHOICES that undoes state on return; plain DFS visits each node once and never un-marks." },
            { id: "union-find", how: "Static connectivity → DFS; edges arriving one by one with repeated 'connected?' queries → union-find." },
        ],
    },
    {
        id: "bfs",
        name: "BFS (Breadth-First Search)",
        category: "Trees & Graphs",
        short: "Explore layer by layer with a queue — the first time you reach a node is the shortest.",
        description:
            "A queue processes nodes in order of distance from the start, so in an unweighted graph the first visit to a node is via a shortest path. Processing one queue-length at a time gives level-by-level output; seeding the queue with many starts computes distance to the nearest source in one pass.",
        signals: [
            "minimum number of steps",
            "shortest path (unweighted)",
            "level order",
            "nearest / closest",
            "spreads each minute",
            "word ladder",
            "right side view",
        ],
        question: "Am I asked for the fewest moves / nearest something, or for output grouped by level?",
        dataStructures: ["Queue", "Tree", "Graph", "Matrix", "Hash Set"],
        complexity: { time: "O(V + E)", space: "O(V)" },
        templates: [
            {
                id: "bfs-level",
                name: "Level-order traversal",
                python: `from collections import deque

def level_order(root):
    if not root:
        return []
    res, q = [], deque([root])
    while q:
        level = []
        for _ in range(len(q)):  # exactly the nodes of this level
            node = q.popleft()
            level.append(node.val)
            if node.left:
                q.append(node.left)
            if node.right:
                q.append(node.right)
        res.append(level)
    return res`,
                javascript: `function levelOrder(root) {
    if (!root) return [];
    const res = [];
    let level = [root]; // swap arrays per level: no O(n) shift()
    while (level.length) {
        res.push(level.map(node => node.val));
        const next = [];
        for (const node of level) {
            if (node.left) next.push(node.left);
            if (node.right) next.push(node.right);
        }
        level = next;
    }
    return res;
}`,
            },
            {
                id: "bfs-grid",
                name: "Multi-source grid BFS",
                python: `from collections import deque

def oranges_rotting(grid):
    rows, cols = len(grid), len(grid[0])
    q, fresh = deque(), 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 2:
                q.append((r, c))  # every source starts at distance 0
            elif grid[r][c] == 1:
                fresh += 1
    minutes = 0
    while q and fresh:
        for _ in range(len(q)):
            r, c = q.popleft()
            for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 1:
                    grid[nr][nc] = 2  # mark when ENQUEUED
                    fresh -= 1
                    q.append((nr, nc))
        minutes += 1
    return minutes if fresh == 0 else -1`,
                javascript: `function orangesRotting(grid) {
    const rows = grid.length, cols = grid[0].length;
    let frontier = [], fresh = 0;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] === 2) frontier.push([r, c]); // every source at distance 0
            else if (grid[r][c] === 1) fresh++;
        }
    }
    let minutes = 0;
    while (frontier.length && fresh) {
        const next = [];
        for (const [r, c] of frontier) {
            for (const [nr, nc] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
                if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || grid[nr][nc] !== 1) continue;
                grid[nr][nc] = 2; // mark when ENQUEUED
                fresh--;
                next.push([nr, nc]);
            }
        }
        frontier = next;
        minutes++;
    }
    return fresh === 0 ? minutes : -1;
}`,
            },
        ],
        variants: [
            "Tree level order (zigzag, right side view, level averages)",
            "Shortest path in an unweighted graph / grid",
            "Multi-source BFS (rotting oranges, walls and gates, 01 matrix)",
            "Implicit graph of states (word ladder, open the lock)",
            "0-1 BFS with a deque for 0/1 edge weights",
        ],
        pitfalls: [
            "Mark visited when you ENQUEUE, not when you dequeue, or nodes get queued many times.",
            "JS array.shift() is O(n): use an index pointer or swap level arrays.",
            "Weighted edges break BFS's shortest-path guarantee — switch to Dijkstra.",
        ],
        related: [
            { id: "dfs", how: "DFS also visits everything but its first visit isn't the shortest; use BFS whenever 'minimum steps' or 'by level' appears." },
            { id: "shortest-path", how: "All edges cost the same → BFS; different non-negative weights → Dijkstra." },
            { id: "topological-sort", how: "Kahn's algorithm is BFS over in-degree-zero nodes; if there are dependencies/prerequisites, it's topological sort." },
        ],
    },
    {
        id: "union-find",
        name: "Union-Find",
        category: "Trees & Graphs",
        short: "Merge groups and ask 'same group?' in near-constant time.",
        description:
            "A disjoint-set forest stores each element's parent; find walks to the group's root and union links two roots. With path compression and union by size, both are effectively O(1) amortized (inverse Ackermann), ideal when edges arrive incrementally and you keep asking about connectivity.",
        signals: [
            "connected components",
            "are x and y connected",
            "redundant connection",
            "union / merge groups",
            "accounts merge",
            "graph valid tree",
            "number of provinces",
        ],
        question: "Am I repeatedly merging groups and asking whether two items already share a group?",
        dataStructures: ["Union-Find", "Array", "Hash Map"],
        complexity: { time: "O(n·α(n))", space: "O(n)" },
        templates: [
            {
                id: "uf-basic",
                name: "DSU with path compression + union by size",
                python: `class DSU:
    def __init__(self, n):
        self.parent = list(range(n))
        self.size = [1] * n

    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]  # path halving
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False  # already connected: this edge closes a cycle
        if self.size[ra] < self.size[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra  # attach smaller tree under larger
        self.size[ra] += self.size[rb]
        return True`,
                javascript: `class DSU {
    constructor(n) {
        this.parent = Array.from({ length: n }, (_, i) => i);
        this.size = new Array(n).fill(1);
    }
    find(x) {
        while (this.parent[x] !== x) {
            this.parent[x] = this.parent[this.parent[x]]; // path halving
            x = this.parent[x];
        }
        return x;
    }
    union(a, b) {
        let ra = this.find(a), rb = this.find(b);
        if (ra === rb) return false; // already connected: this edge closes a cycle
        if (this.size[ra] < this.size[rb]) [ra, rb] = [rb, ra];
        this.parent[rb] = ra; // attach smaller tree under larger
        this.size[ra] += this.size[rb];
        return true;
    }
}`,
            },
        ],
        variants: [
            "Count components (n minus successful unions)",
            "Cycle / redundant edge detection in an undirected graph",
            "Union by key with a hash map (accounts merge, strings)",
            "Kruskal's minimum spanning tree",
            "Grid cells as r * cols + c",
        ],
        pitfalls: [
            "Comparing elements instead of roots: always union/compare find(a) and find(b).",
            "Union-find can't detect cycles in DIRECTED graphs — use DFS colors or topological sort.",
            "Without compression or union by size, chains degrade to O(n) per find.",
        ],
        related: [
            { id: "dfs", how: "One-shot component count on a fixed graph → DFS is just as good; dynamic merging or online 'connected?' queries → union-find." },
            { id: "topological-sort", how: "Directed dependencies and ordering → topo sort; undirected grouping → union-find." },
        ],
    },
    {
        id: "topological-sort",
        name: "Topological Sort",
        category: "Trees & Graphs",
        short: "Order tasks so every prerequisite comes first; leftovers mean a cycle.",
        description:
            "In a directed graph, repeatedly take a node with no remaining incoming edges (in-degree 0), output it, and decrement its neighbours (Kahn's algorithm). If every node gets output you have a valid order; if some never reach in-degree 0 the graph has a cycle. Each node and edge is touched once: O(V + E).",
        signals: [
            "prerequisites",
            "course schedule",
            "dependencies / build order",
            "must come before",
            "detect cycle in directed graph",
            "alien dictionary",
            "valid ordering",
        ],
        question: "Are there 'A must happen before B' constraints, and do I need an order or to know one exists?",
        dataStructures: ["Graph", "Queue", "Hash Map", "Array"],
        complexity: { time: "O(V + E)", space: "O(V + E)" },
        templates: [
            {
                id: "topo-kahn",
                name: "Kahn's algorithm (BFS on in-degrees)",
                python: `from collections import deque

def find_order(n, prerequisites):  # pairs [course, before]
    graph = [[] for _ in range(n)]
    indegree = [0] * n
    for course, before in prerequisites:
        graph[before].append(course)  # edge before -> course
        indegree[course] += 1
    q = deque(i for i in range(n) if indegree[i] == 0)
    order = []
    while q:
        u = q.popleft()
        order.append(u)
        for v in graph[u]:
            indegree[v] -= 1
            if indegree[v] == 0:  # all of v's prerequisites done
                q.append(v)
    return order if len(order) == n else []  # short = cycle`,
                javascript: `function findOrder(n, prerequisites) { // pairs [course, before]
    const graph = Array.from({ length: n }, () => []);
    const indegree = new Array(n).fill(0);
    for (const [course, before] of prerequisites) {
        graph[before].push(course); // edge before -> course
        indegree[course]++;
    }
    const queue = [];
    for (let i = 0; i < n; i++) if (indegree[i] === 0) queue.push(i);
    for (let head = 0; head < queue.length; head++) { // queue doubles as the order
        for (const v of graph[queue[head]]) {
            if (--indegree[v] === 0) queue.push(v); // all of v's prerequisites done
        }
    }
    return queue.length === n ? queue : []; // short = cycle
}`,
            },
        ],
        variants: [
            "Kahn's BFS (order + cycle check)",
            "DFS post-order with 3 colours (reverse finishing order)",
            "Build the graph from comparisons first (alien dictionary)",
            "Longest path / parallel semesters in a DAG (process level by level)",
        ],
        pitfalls: [
            "Edge direction: [a, b] meaning 'b before a' is an edge b → a — getting it backwards reverses the order.",
            "Nodes with no edges still belong in the output; seed the queue from all n nodes.",
            "Cycle check is len(order) == n, not 'queue became empty'.",
        ],
        related: [
            { id: "bfs", how: "Kahn's is BFS, but driven by in-degree counts on a DIRECTED graph; plain BFS ignores dependencies and measures distance." },
            { id: "dfs", how: "DFS with visiting/visited colours also detects directed cycles; Kahn's gives the order directly and is easier to get right." },
            { id: "union-find", how: "Union-find handles undirected grouping only; any 'before/after' constraint means topological sort." },
        ],
    },
    {
        id: "shortest-path",
        name: "Shortest Path (Dijkstra)",
        category: "Trees & Graphs",
        short: "Weighted edges: always expand the closest unsettled node from a min-heap.",
        description:
            "Dijkstra keeps a min-heap of (distance, node) and always settles the nearest unsettled node; with non-negative weights that distance is final. Relaxing every edge through the heap costs O(E log V). Use it whenever edges have different costs and you need minimum total cost, time or effort.",
        signals: [
            "weighted graph",
            "minimum cost to reach",
            "network delay",
            "cheapest path",
            "minimum effort path",
            "non-negative weights",
            "at most k stops",
        ],
        question: "Do edges have different non-negative costs, and do I need the cheapest total from a source?",
        dataStructures: ["Graph", "Heap", "Hash Map", "Matrix"],
        complexity: { time: "O(E log V)", space: "O(V + E)" },
        templates: [
            {
                id: "sp-dijkstra",
                name: "Dijkstra with a min-heap",
                python: `import heapq

def dijkstra(n, edges, src):  # edges: (u, v, w) with w >= 0
    graph = [[] for _ in range(n)]
    for u, v, w in edges:
        graph[u].append((v, w))
    dist = [float("inf")] * n
    dist[src] = 0
    heap = [(0, src)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:
            continue  # stale entry: u was already settled cheaper
        for v, w in graph[u]:
            if d + w < dist[v]:
                dist[v] = d + w
                heapq.heappush(heap, (dist[v], v))
    return dist`,
                javascript: `// LeetCode runtime: PriorityQueue (@datastructures-js/priority-queue v6)
function dijkstra(n, edges, src) { // edges: [u, v, w] with w >= 0
    const graph = Array.from({ length: n }, () => []);
    for (const [u, v, w] of edges) graph[u].push([v, w]);
    const dist = new Array(n).fill(Infinity);
    dist[src] = 0;
    const heap = new PriorityQueue((a, b) => a[0] - b[0]); // [distance, node]
    heap.enqueue([0, src]);
    while (heap.size() > 0) {
        const [d, u] = heap.dequeue();
        if (d > dist[u]) continue; // stale entry: u was already settled cheaper
        for (const [v, w] of graph[u]) {
            if (d + w < dist[v]) {
                dist[v] = d + w;
                heap.enqueue([dist[v], v]);
            }
        }
    }
    return dist;
}`,
            },
        ],
        variants: [
            "Single-source distances (network delay time)",
            "Grid Dijkstra with cost = max edge on path (minimum effort, swim in water)",
            "Bellman-Ford / BFS by rounds for 'at most k edges' (cheapest flights)",
            "Prim's MST (same heap loop, edge weight instead of path length)",
        ],
        pitfalls: [
            "Negative edge weights break Dijkstra — use Bellman-Ford.",
            "Skip stale heap entries (d > dist[u]) or the run degrades badly.",
            "A hop limit (k stops) changes the state: plain Dijkstra on distance alone is wrong.",
        ],
        related: [
            { id: "bfs", how: "Unweighted (or all weights equal) → BFS in O(V + E); varying weights → Dijkstra." },
            { id: "heap", how: "Dijkstra is the heap pattern applied to graph distances; if there's no graph, it's just a heap problem." },
            { id: "dynamic-programming", how: "On a DAG or a grid that only moves right/down, shortest path is plain DP — no heap needed." },
        ],
    },
    {
        id: "trie",
        name: "Trie",
        category: "Trees & Graphs",
        short: "A tree of characters so shared prefixes are stored and searched once.",
        description:
            "Each node maps a character to a child, and a flag marks where a word ends. Insert and lookup cost O(L) for a word of length L regardless of how many words are stored, and many words can be matched simultaneously by walking the trie alongside the input (e.g. a DFS over a board).",
        signals: [
            "prefix",
            "starts with",
            "autocomplete",
            "dictionary of words",
            "word search II",
            "wildcard '.' matching",
            "longest common prefix",
        ],
        question: "Will many lookups share prefixes, so walking a character tree beats rescanning a word list?",
        dataStructures: ["Trie", "Hash Map", "String"],
        complexity: { time: "O(L) per word", space: "O(total characters)" },
        templates: [
            {
                id: "trie-basic",
                name: "Insert / search / startsWith",
                python: `class Trie:
    def __init__(self):
        self.root = {}

    def insert(self, word):
        node = self.root
        for c in word:
            node = node.setdefault(c, {})
        node["$"] = True  # end-of-word marker

    def _walk(self, s):
        node = self.root
        for c in s:
            if c not in node:
                return None
            node = node[c]
        return node

    def search(self, word):
        node = self._walk(word)
        return node is not None and "$" in node

    def starts_with(self, prefix):
        return self._walk(prefix) is not None`,
                javascript: `class Trie {
    constructor() {
        this.root = { children: new Map(), end: false };
    }
    insert(word) {
        let node = this.root;
        for (const c of word) {
            if (!node.children.has(c)) node.children.set(c, { children: new Map(), end: false });
            node = node.children.get(c);
        }
        node.end = true;
    }
    walk(s) {
        let node = this.root;
        for (const c of s) {
            node = node.children.get(c);
            if (!node) return null;
        }
        return node;
    }
    search(word) { return this.walk(word)?.end === true; }
    startsWith(prefix) { return this.walk(prefix) !== null; }
}`,
            },
        ],
        variants: [
            "Prefix tree with insert / search / startsWith",
            "Wildcard search via DFS over children ('.')",
            "Trie + grid backtracking (word search II)",
            "Store counts or the word at the end node (autocomplete, replace words)",
            "Binary trie for maximum XOR pairs",
        ],
        pitfalls: [
            "Forgetting the end-of-word flag: 'app' would wrongly match after inserting only 'apple'.",
            "search vs startsWith differ only in that flag check.",
            "In word search II, prune found words / empty branches or it times out.",
        ],
        related: [
            { id: "hash-map", how: "Exact whole-word lookups → hash set; prefix queries or many words matched together → trie." },
            { id: "backtracking", how: "Word search I (one word) is grid backtracking; many words at once adds a trie to prune all of them in one DFS." },
        ],
    },

    // ───────────────────────────── Recursion & DP ─────────────────────────────
    {
        id: "backtracking",
        name: "Backtracking",
        category: "Recursion & DP",
        short: "Choose, explore, un-choose — enumerate every valid configuration.",
        description:
            "Build a candidate one choice at a time, recurse, then undo the choice before trying the next. It explores the full decision tree (pruning dead branches early), so it is exponential — O(2ⁿ) for subsets, O(n!) for permutations — and is the right tool when the problem asks for ALL solutions.",
        signals: [
            "all combinations",
            "all permutations",
            "all subsets",
            "generate all",
            "N-Queens / sudoku",
            "word exists in grid",
            "partition into palindromes",
            "small n (≤ 20)",
        ],
        question: "Do I need to list every valid configuration, building it one choice at a time?",
        dataStructures: ["Array", "Hash Set", "Matrix"],
        complexity: { time: "O(2ⁿ)", space: "O(n)" },
        templates: [
            {
                id: "bt-subsets",
                name: "Subsets / combinations (start index)",
                python: `def subsets(nums):
    res, path = [], []

    def backtrack(start):
        res.append(path[:])  # every node of the tree is a subset (copy!)
        for i in range(start, len(nums)):
            path.append(nums[i])  # choose
            backtrack(i + 1)      # explore (pass i instead to allow reuse)
            path.pop()            # un-choose

    backtrack(0)
    return res`,
                javascript: `function subsets(nums) {
    const res = [], path = [];
    const backtrack = (start) => {
        res.push([...path]); // every node of the tree is a subset (copy!)
        for (let i = start; i < nums.length; i++) {
            path.push(nums[i]); // choose
            backtrack(i + 1);   // explore (pass i instead to allow reuse)
            path.pop();         // un-choose
        }
    };
    backtrack(0);
    return res;
}`,
            },
            {
                id: "bt-permutations",
                name: "Permutations (used flags)",
                python: `def permute(nums):
    res, path = [], []
    used = [False] * len(nums)

    def backtrack():
        if len(path) == len(nums):
            res.append(path[:])
            return
        for i, x in enumerate(nums):
            if used[i]:
                continue
            used[i] = True
            path.append(x)
            backtrack()
            path.pop()
            used[i] = False

    backtrack()
    return res`,
                javascript: `function permute(nums) {
    const res = [], path = [];
    const used = new Array(nums.length).fill(false);
    const backtrack = () => {
        if (path.length === nums.length) { res.push([...path]); return; }
        for (let i = 0; i < nums.length; i++) {
            if (used[i]) continue;
            used[i] = true;
            path.push(nums[i]);
            backtrack();
            path.pop();
            used[i] = false;
        }
    };
    backtrack();
    return res;
}`,
            },
            {
                id: "bt-grid-search",
                name: "Grid path search (word search)",
                python: `def exist(board, word):
    rows, cols = len(board), len(board[0])

    def dfs(r, c, i):
        if i == len(word):
            return True
        if r < 0 or c < 0 or r >= rows or c >= cols or board[r][c] != word[i]:
            return False
        board[r][c] = "#"  # mark as on the current path
        found = (dfs(r + 1, c, i + 1) or dfs(r - 1, c, i + 1) or
                 dfs(r, c + 1, i + 1) or dfs(r, c - 1, i + 1))
        board[r][c] = word[i]  # restore on the way back
        return found

    return any(dfs(r, c, 0) for r in range(rows) for c in range(cols))`,
                javascript: `function exist(board, word) {
    const rows = board.length, cols = board[0].length;
    const dfs = (r, c, i) => {
        if (i === word.length) return true;
        if (r < 0 || c < 0 || r >= rows || c >= cols || board[r][c] !== word[i]) return false;
        board[r][c] = "#"; // mark as on the current path
        const found = dfs(r + 1, c, i + 1) || dfs(r - 1, c, i + 1) ||
                      dfs(r, c + 1, i + 1) || dfs(r, c - 1, i + 1);
        board[r][c] = word[i]; // restore on the way back
        return found;
    };
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) if (dfs(r, c, 0)) return true;
    }
    return false;
}`,
            },
        ],
        variants: [
            "Subsets / combinations with a start index",
            "Combination sum (reuse: recurse with i; no reuse: i + 1)",
            "Permutations with a used[] array",
            "Duplicates in input: sort, skip nums[i] == nums[i-1] at the same depth",
            "Constraint placement (N-Queens, sudoku) with column/diagonal sets",
            "Grid path search with mark / unmark",
        ],
        pitfalls: [
            "Appending `path` itself instead of a copy — every result ends up empty.",
            "Forgetting to undo the choice (pop / unmark) before the next iteration.",
            "If only a COUNT or the best value is needed and subproblems repeat, it's DP, not backtracking.",
        ],
        related: [
            { id: "dynamic-programming", how: "'How many ways' / 'min cost' with overlapping subproblems → DP; 'list all the ways' → backtracking." },
            { id: "dfs", how: "Grid DFS marks cells visited forever (counting islands); grid backtracking un-marks them because another path may reuse the cell." },
            { id: "bit-manipulation", how: "Subsets of small n can also be enumerated as bitmasks 0..2ⁿ−1 instead of recursion." },
        ],
    },
    {
        id: "dynamic-programming",
        name: "Dynamic Programming",
        category: "Recursion & DP",
        short: "Define a state, write the recurrence, compute each subproblem once.",
        description:
            "When the best answer for a problem is built from best answers to smaller overlapping subproblems, store each subproblem's answer (memoization or a table) so it is computed once. Cost becomes (number of states) × (work per state): O(n) for a 1D state, O(n·m) for two strings or amount × coins.",
        signals: [
            "number of ways",
            "minimum / maximum cost",
            "longest increasing / common subsequence",
            "make up the amount",
            "choose or skip each item",
            "edit distance",
            "adjacent can't both be picked",
        ],
        question: "Can the answer for size n be written from answers to smaller versions, and do those smaller versions repeat?",
        dataStructures: ["Array", "Matrix", "Hash Map"],
        complexity: { time: "O(n·m)", space: "O(n)" },
        templates: [
            {
                id: "dp-1d",
                name: "1D DP (rolling variables)",
                python: `def rob(nums):
    # dp[i] = max(dp[i-1], dp[i-2] + nums[i]); only the last two are needed
    prev2 = prev1 = 0
    for x in nums:
        prev2, prev1 = prev1, max(prev1, prev2 + x)
    return prev1

def climb_stairs(n):  # dp[i] = dp[i-1] + dp[i-2]
    a, b = 1, 1
    for _ in range(n - 1):
        a, b = b, a + b
    return b`,
                javascript: `function rob(nums) {
    // dp[i] = max(dp[i-1], dp[i-2] + nums[i]); only the last two are needed
    let prev2 = 0, prev1 = 0;
    for (const x of nums) {
        [prev2, prev1] = [prev1, Math.max(prev1, prev2 + x)];
    }
    return prev1;
}

function climbStairs(n) { // dp[i] = dp[i-1] + dp[i-2]
    let a = 1, b = 1;
    for (let i = 1; i < n; i++) [a, b] = [b, a + b];
    return b;
}`,
            },
            {
                id: "dp-2d",
                name: "2D DP (two sequences / grid)",
                python: `def longest_common_subsequence(a, b):
    m, n = len(a), len(b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]  # dp[i][j]: LCS of a[:i], b[:j]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    return dp[m][n]`,
                javascript: `function longestCommonSubsequence(a, b) {
    const m = a.length, n = b.length;
    // dp[i][j]: LCS of a[0..i) and b[0..j)
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1] + 1
                : Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }
    return dp[m][n];
}`,
            },
            {
                id: "dp-knapsack",
                name: "Knapsack (unbounded vs 0/1)",
                python: `def coin_change(coins, amount):  # unbounded: each coin reusable
    INF = float("inf")
    dp = [0] + [INF] * amount  # dp[a]: fewest coins summing to a
    for coin in coins:
        for a in range(coin, amount + 1):  # ascending = item can repeat
            dp[a] = min(dp[a], dp[a - coin] + 1)
    return dp[amount] if dp[amount] != INF else -1

def can_reach_sum(nums, target):  # 0/1: each item at most once
    dp = [True] + [False] * target
    for x in nums:
        for t in range(target, x - 1, -1):  # descending = item used once
            dp[t] = dp[t] or dp[t - x]
    return dp[target]`,
                javascript: `function coinChange(coins, amount) { // unbounded: each coin reusable
    const dp = new Array(amount + 1).fill(Infinity); // dp[a]: fewest coins summing to a
    dp[0] = 0;
    for (const coin of coins) {
        for (let a = coin; a <= amount; a++) { // ascending = item can repeat
            dp[a] = Math.min(dp[a], dp[a - coin] + 1);
        }
    }
    return dp[amount] === Infinity ? -1 : dp[amount];
}

function canReachSum(nums, target) { // 0/1: each item at most once
    const dp = new Array(target + 1).fill(false);
    dp[0] = true;
    for (const x of nums) {
        for (let t = target; t >= x; t--) dp[t] = dp[t] || dp[t - x]; // descending
    }
    return dp[target];
}`,
            },
        ],
        variants: [
            "1D linear (climbing stairs, house robber, decode ways)",
            "Kadane / max subarray ending here",
            "LIS (O(n²) DP or O(n log n) with patience sorting)",
            "Two sequences (LCS, edit distance, interleaving)",
            "Grid paths (unique paths, min path sum)",
            "Knapsack: 0/1 (partition) vs unbounded (coin change)",
            "Interval / range DP (burst balloons, palindromic substrings)",
        ],
        pitfalls: [
            "Define the state in words first (\"dp[i] = best answer using the first i items\") — most bugs are a fuzzy state.",
            "Base cases and the n+1 sized table: dp[0] is the empty prefix.",
            "Loop direction in knapsack: ascending reuses items, descending uses each once.",
        ],
        related: [
            { id: "greedy", how: "If one local choice is provably always safe, greedy is simpler; if you must compare outcomes of several choices, it's DP." },
            { id: "backtracking", how: "Same decision tree, but DP caches repeated states and returns a count/optimum instead of listing every solution." },
            { id: "dfs", how: "Top-down DP is DFS + memo; on a tree, 'DP on trees' is a post-order DFS returning several values per node." },
        ],
    },

    // ───────────────────────────── Math & Bits ─────────────────────────────
    {
        id: "bit-manipulation",
        name: "Bit Manipulation",
        category: "Math & Bits",
        short: "XOR, AND and shifts answer value questions in O(1) extra space.",
        description:
            "Operate on the binary representation directly: x ^ x = 0 cancels pairs, n & (n − 1) clears the lowest set bit, and shifts read or build bits one at a time. These identities find the odd one out, count bits or add without + in O(n) or O(32) time and O(1) space.",
        signals: [
            "appears exactly once",
            "every other appears twice",
            "missing number",
            "count set bits",
            "without + or -",
            "power of two",
            "reverse bits",
            "O(1) extra space",
        ],
        question: "Would XOR cancellation or looking at individual bits remove the need for extra memory or arithmetic?",
        dataStructures: ["Array"],
        complexity: { time: "O(n)", space: "O(1)" },
        templates: [
            {
                id: "bit-xor",
                name: "XOR cancellation",
                python: `def single_number(nums):
    res = 0
    for x in nums:
        res ^= x  # pairs cancel: a ^ a = 0, a ^ 0 = a
    return res

def missing_number(nums):  # values 0..n with one missing
    res = len(nums)
    for i, x in enumerate(nums):
        res ^= i ^ x
    return res`,
                javascript: `function singleNumber(nums) {
    let res = 0;
    for (const x of nums) res ^= x; // pairs cancel: a ^ a = 0, a ^ 0 = a
    return res;
}

function missingNumber(nums) { // values 0..n with one missing
    let res = nums.length;
    for (let i = 0; i < nums.length; i++) res ^= i ^ nums[i];
    return res;
}`,
            },
            {
                id: "bit-count",
                name: "Counting / reading bits",
                python: `def hamming_weight(n):
    count = 0
    while n:
        n &= n - 1  # drop the lowest set bit
        count += 1
    return count

def count_bits(n):  # popcount of every i in 0..n
    dp = [0] * (n + 1)
    for i in range(1, n + 1):
        dp[i] = dp[i >> 1] + (i & 1)  # i without its last bit, plus that bit
    return dp`,
                javascript: `function hammingWeight(n) {
    let count = 0;
    while (n !== 0) {
        n &= n - 1; // drop the lowest set bit (works on 32-bit ints)
        count++;
    }
    return count;
}

function countBits(n) { // popcount of every i in 0..n
    const dp = new Array(n + 1).fill(0);
    for (let i = 1; i <= n; i++) dp[i] = dp[i >> 1] + (i & 1);
    return dp;
}`,
            },
        ],
        variants: [
            "XOR to cancel pairs (single number, missing number)",
            "n & (n − 1): clear lowest bit, power-of-two test",
            "Bit-by-bit loops (reverse bits, single number II with counts mod 3)",
            "Add without + (XOR for sum, AND << 1 for carry)",
            "Bitmask subsets / visited states",
        ],
        pitfalls: [
            "Python ints are unbounded: negative numbers need masking with 0xFFFFFFFF for 32-bit behaviour.",
            "JS bitwise ops work on signed 32-bit ints; use >>> 0 to read a result as unsigned.",
            "Operator precedence: write (x & 1) == 0, not x & 1 == 0.",
        ],
        related: [
            { id: "hash-map", how: "A hash set finds the unique element too, but O(n) space; 'constant extra space' is the hint to XOR." },
            { id: "math-sim", how: "Digit-by-digit base-10 work (reverse integer, add strings) is math; base-2 tricks with &, ^, << are bit manipulation." },
        ],
    },
    {
        id: "math-sim",
        name: "Math & Simulation",
        category: "Math & Bits",
        short: "Do exactly what the problem says, carefully — indices, digits, boundaries.",
        description:
            "No clever data structure: simulate the process directly (walk a spiral, rotate a matrix in place, add digits with a carry) or use a small math identity. The difficulty is boundary bookkeeping, and the cost is just touching each cell or digit once — O(rows·cols) or O(number of digits).",
        signals: [
            "rotate matrix in place",
            "spiral order",
            "set matrix zeroes",
            "reverse integer",
            "add / multiply strings",
            "plus one",
            "happy number / digit sum",
            "overflow",
        ],
        question: "Is there no hidden structure — just a process to simulate precisely with careful bounds?",
        dataStructures: ["Matrix", "Array", "String"],
        complexity: { time: "O(n·m)", space: "O(1)" },
        templates: [
            {
                id: "sim-matrix",
                name: "In-place matrix / spiral traversal",
                python: `def spiral_order(matrix):
    res = []
    top, bottom, left, right = 0, len(matrix) - 1, 0, len(matrix[0]) - 1
    while top <= bottom and left <= right:
        res += [matrix[top][c] for c in range(left, right + 1)]
        top += 1
        res += [matrix[r][right] for r in range(top, bottom + 1)]
        right -= 1
        if top <= bottom:  # a row is left to walk back
            res += [matrix[bottom][c] for c in range(right, left - 1, -1)]
            bottom -= 1
        if left <= right:  # a column is left to walk up
            res += [matrix[r][left] for r in range(bottom, top - 1, -1)]
            left += 1
    return res

def rotate(matrix):  # 90 degrees clockwise = transpose, then reverse rows
    n = len(matrix)
    for i in range(n):
        for j in range(i + 1, n):
            matrix[i][j], matrix[j][i] = matrix[j][i], matrix[i][j]
    for row in matrix:
        row.reverse()`,
                javascript: `function spiralOrder(matrix) {
    const res = [];
    let top = 0, bottom = matrix.length - 1, left = 0, right = matrix[0].length - 1;
    while (top <= bottom && left <= right) {
        for (let c = left; c <= right; c++) res.push(matrix[top][c]);
        top++;
        for (let r = top; r <= bottom; r++) res.push(matrix[r][right]);
        right--;
        if (top <= bottom) { // a row is left to walk back
            for (let c = right; c >= left; c--) res.push(matrix[bottom][c]);
            bottom--;
        }
        if (left <= right) { // a column is left to walk up
            for (let r = bottom; r >= top; r--) res.push(matrix[r][left]);
            left++;
        }
    }
    return res;
}

function rotate(matrix) { // 90 degrees clockwise = transpose, then reverse rows
    const n = matrix.length;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) [matrix[i][j], matrix[j][i]] = [matrix[j][i], matrix[i][j]];
    }
    for (const row of matrix) row.reverse();
}`,
            },
            {
                id: "sim-digits",
                name: "Digit / number arithmetic",
                python: `def reverse_digits(x):
    sign = -1 if x < 0 else 1
    x, res = abs(x), 0
    while x:
        x, d = divmod(x, 10)  # peel off the last digit
        res = res * 10 + d
    return sign * res  # add a 32-bit range check if the problem demands it

def add_strings(a, b):  # grade-school addition with a carry
    i, j, carry, out = len(a) - 1, len(b) - 1, 0, []
    while i >= 0 or j >= 0 or carry:
        carry += (int(a[i]) if i >= 0 else 0) + (int(b[j]) if j >= 0 else 0)
        out.append(str(carry % 10))
        carry //= 10
        i, j = i - 1, j - 1
    return "".join(reversed(out))`,
                javascript: `function reverseDigits(x) {
    let res = 0;
    while (x !== 0) {
        res = res * 10 + (x % 10); // % keeps the sign in JS
        x = Math.trunc(x / 10);    // peel off the last digit
    }
    return res; // add a 32-bit range check if the problem demands it
}

function addStrings(a, b) { // grade-school addition with a carry
    let i = a.length - 1, j = b.length - 1, carry = 0;
    const out = [];
    while (i >= 0 || j >= 0 || carry) {
        carry += (i >= 0 ? +a[i--] : 0) + (j >= 0 ? +b[j--] : 0);
        out.push(carry % 10);
        carry = Math.floor(carry / 10);
    }
    return out.reverse().join("");
}`,
            },
        ],
        variants: [
            "Layer / boundary simulation (spiral, rotate by layers)",
            "Transpose + reflect for rotations",
            "Use first row/column as markers for O(1) space (set matrix zeroes)",
            "Digit extraction with % 10 and // 10",
            "String arithmetic with carry (add, multiply strings, plus one)",
            "Cycle detection on a number sequence (happy number)",
        ],
        pitfalls: [
            "Spiral: re-check top <= bottom / left <= right before the return legs, or single rows/columns repeat.",
            "Python % and // floor toward −∞ for negatives; JS % keeps the sign — handle sign separately.",
            "Overflow: 32-bit limits matter when the problem says so, even though Python ints don't overflow.",
        ],
        related: [
            { id: "bit-manipulation", how: "Base-2 identities (XOR, shifts) → bits; base-10 digits, carries and matrices → math & simulation." },
            { id: "two-pointers", how: "Reversing rows or swapping symmetric cells uses two pointers inside a simulation; the problem itself is still simulation." },
            { id: "hash-map", how: "Happy number can use a seen-set for cycle detection (or fast/slow pointers); the digit-sum step is the simulation." },
        ],
    },
];
