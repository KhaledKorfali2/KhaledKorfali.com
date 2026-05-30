/* engine.js — Sorting step generators
   Each generator yields Step objects describing one atomic action.
   Step: { type, indices, values, message, category }
     type:     'compare' | 'swap' | 'write' | 'sorted' | 'info' | 'pivot'
     indices:  array of bar indices involved
     values:   optional new values (for radix/counting writes)
     message:  human-readable description
     category: log colour class
*/

(function (global) {
  'use strict';

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function step(type, indices, message, category, values) {
    return { type: type, indices: indices, message: message,
             category: category || type, values: values || null };
  }

  function cmp(i, j, arr)  { return step('compare', [i, j],
    'Compare arr[' + i + ']=' + arr[i] + ' vs arr[' + j + ']=' + arr[j],
    'compare'); }

  function swp(i, j, arr) {
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    return step('swap', [i, j],
      'Swap arr[' + i + ']=' + arr[i] + ' ↔ arr[' + j + ']=' + arr[j],
      'swap');
  }

  function mark(i, arr) { return step('sorted', [i],
    'Position ' + i + ' is in its final sorted place (value ' + arr[i] + ')', 'sorted'); }

  function info(msg, indices) { return step('info', indices || [],
    msg, 'info'); }

  // ─── BUBBLE SORT ───────────────────────────────────────────────────────────
  function* bubbleSort(arr) {
    var n = arr.length;
    yield info('Starting Bubble Sort. Repeatedly compare adjacent elements and swap if out of order.');
    for (var i = 0; i < n - 1; i++) {
      var swapped = false;
      yield info('Pass ' + (i + 1) + ': bubbling the largest unsorted element to position ' + (n - 1 - i));
      for (var j = 0; j < n - 1 - i; j++) {
        yield cmp(j, j + 1, arr);
        if (arr[j] > arr[j + 1]) {
          yield swp(j, j + 1, arr);
          swapped = true;
        }
      }
      yield mark(n - 1 - i, arr);
      if (!swapped) {
        yield info('No swaps in this pass — array is already sorted. Early exit!');
        for (var k = 0; k < n - 1 - i; k++) yield mark(k, arr);
        return;
      }
    }
    yield mark(0, arr);
  }

  // ─── SELECTION SORT ────────────────────────────────────────────────────────
  function* selectionSort(arr) {
    var n = arr.length;
    yield info('Starting Selection Sort. Find the minimum of the unsorted portion and place it at the front.');
    for (var i = 0; i < n - 1; i++) {
      var minIdx = i;
      yield info('Round ' + (i + 1) + ': searching for the minimum in positions ' + i + '–' + (n - 1));
      for (var j = i + 1; j < n; j++) {
        yield cmp(minIdx, j, arr);
        if (arr[j] < arr[minIdx]) {
          minIdx = j;
          yield info('New minimum found: arr[' + j + ']=' + arr[j], [j]);
        }
      }
      if (minIdx !== i) {
        yield swp(i, minIdx, arr);
      } else {
        yield info('Minimum is already in place at position ' + i);
      }
      yield mark(i, arr);
    }
    yield mark(n - 1, arr);
  }

  // ─── INSERTION SORT ────────────────────────────────────────────────────────
  function* insertionSort(arr) {
    var n = arr.length;
    yield info('Starting Insertion Sort. Build a sorted prefix one element at a time.');
    yield mark(0, arr);
    for (var i = 1; i < n; i++) {
      var key = arr[i];
      yield info('Pick up arr[' + i + ']=' + key + ' and insert it into the sorted prefix.', [i]);
      var j = i - 1;
      while (j >= 0) {
        yield cmp(j, j + 1, arr);
        if (arr[j] > key) {
          arr[j + 1] = arr[j];
          yield step('write', [j + 1], 'Shift arr[' + j + ']=' + arr[j + 1] + ' right to position ' + (j + 1), 'swap');
          j--;
        } else {
          break;
        }
      }
      arr[j + 1] = key;
      yield step('write', [j + 1], 'Place ' + key + ' into position ' + (j + 1), 'info');
      for (var k = 0; k <= i; k++) yield mark(k, arr);
    }
  }

  // ─── SHELL SORT ────────────────────────────────────────────────────────────
  function* shellSort(arr) {
    var n = arr.length;
    // Ciura gap sequence
    var gaps = [701, 301, 132, 57, 23, 10, 4, 1].filter(function (g) { return g < n; });
    yield info('Starting Shell Sort. Like insertion sort but with large gaps first, shrinking to 1.');
    for (var g = 0; g < gaps.length; g++) {
      var gap = gaps[g];
      yield info('Gap = ' + gap + ': perform insertion sort on every ' + gap + 'th element.');
      for (var i = gap; i < n; i++) {
        var temp = arr[i];
        var j = i;
        while (j >= gap) {
          yield cmp(j - gap, j, arr);
          if (arr[j - gap] > temp) {
            arr[j] = arr[j - gap];
            yield step('write', [j], 'Shift arr[' + (j - gap) + ']=' + arr[j] + ' to position ' + j, 'swap');
            j -= gap;
          } else {
            break;
          }
        }
        arr[j] = temp;
        yield step('write', [j], 'Place ' + temp + ' at position ' + j, 'info');
      }
    }
    for (var i = 0; i < n; i++) yield mark(i, arr);
  }

  // ─── MERGE SORT ────────────────────────────────────────────────────────────
  function* mergeSort(arr) {
    yield info('Starting Merge Sort. Divide the array in half recursively, then merge sorted halves.');
    yield* mergeSortHelper(arr, 0, arr.length - 1);
    for (var i = 0; i < arr.length; i++) yield mark(i, arr);
  }

  function* mergeSortHelper(arr, left, right) {
    if (left >= right) return;
    var mid = (left + right) >> 1;
    yield info('Divide: split [' + left + '..' + right + '] into [' + left + '..' + mid + '] and [' + (mid + 1) + '..' + right + ']');
    yield* mergeSortHelper(arr, left, mid);
    yield* mergeSortHelper(arr, mid + 1, right);
    yield* merge(arr, left, mid, right);
  }

  function* merge(arr, left, mid, right) {
    yield info('Merge [' + left + '..' + mid + '] with [' + (mid + 1) + '..' + right + ']');
    var tmp = arr.slice(left, right + 1);
    var i = 0, j = mid - left + 1, k = left;
    while (i <= mid - left && j < tmp.length) {
      yield cmp(left + i, left + j, tmp);  // visual only
      if (tmp[i] <= tmp[j]) {
        arr[k] = tmp[i++];
      } else {
        arr[k] = tmp[j++];
      }
      yield step('write', [k], 'Write ' + arr[k] + ' to position ' + k, 'info');
      k++;
    }
    while (i <= mid - left) { arr[k] = tmp[i++]; yield step('write', [k], 'Copy ' + arr[k] + ' to position ' + k, 'info'); k++; }
    while (j < tmp.length)  { arr[k] = tmp[j++]; yield step('write', [k], 'Copy ' + arr[k] + ' to position ' + k, 'info'); k++; }
  }

  // ─── QUICK SORT ────────────────────────────────────────────────────────────
  function* quickSort(arr) {
    yield info('Starting Quick Sort. Pick a pivot, partition around it, recurse on each side.');
    yield* quickSortHelper(arr, 0, arr.length - 1);
    for (var i = 0; i < arr.length; i++) yield mark(i, arr);
  }

  function* quickSortHelper(arr, low, high) {
    if (low < high) {
      var pivotIdx = yield* partition(arr, low, high);
      yield mark(pivotIdx, arr);
      yield* quickSortHelper(arr, low, pivotIdx - 1);
      yield* quickSortHelper(arr, pivotIdx + 1, high);
    } else if (low === high) {
      yield mark(low, arr);
    }
  }

  function* partition(arr, low, high) {
    var pivot = arr[high];
    yield step('pivot', [high], 'Pivot chosen: arr[' + high + ']=' + pivot + '. Partition [' + low + '..' + high + '] around it.', 'pivot');
    var i = low - 1;
    for (var j = low; j < high; j++) {
      yield cmp(j, high, arr);
      if (arr[j] <= pivot) {
        i++;
        if (i !== j) yield swp(i, j, arr);
      }
    }
    if (i + 1 !== high) yield swp(i + 1, high, arr);
    return i + 1;
  }

  // ─── HEAP SORT ─────────────────────────────────────────────────────────────
  function* heapSort(arr) {
    var n = arr.length;
    yield info('Starting Heap Sort. Build a max-heap, then repeatedly extract the maximum.');
    // Build max-heap
    yield info('Phase 1: Build max-heap by sifting down from the last non-leaf.');
    for (var i = Math.floor(n / 2) - 1; i >= 0; i--) {
      yield* siftDown(arr, i, n);
    }
    yield info('Max-heap built! The largest element is now at the root (index 0).');
    // Extract elements
    yield info('Phase 2: Extract max, place at end, re-heapify.');
    for (var i = n - 1; i > 0; i--) {
      yield swp(0, i, arr);
      yield mark(i, arr);
      yield info('Extracted max=' + arr[i] + ' to position ' + i + '. Re-heapifying remaining ' + i + ' elements.');
      yield* siftDown(arr, 0, i);
    }
    yield mark(0, arr);
  }

  function* siftDown(arr, root, end) {
    while (true) {
      var largest = root;
      var left  = 2 * root + 1;
      var right = 2 * root + 2;
      if (left < end) {
        yield cmp(largest, left, arr);
        if (arr[left] > arr[largest]) largest = left;
      }
      if (right < end) {
        yield cmp(largest, right, arr);
        if (arr[right] > arr[largest]) largest = right;
      }
      if (largest !== root) {
        yield swp(root, largest, arr);
        root = largest;
      } else {
        break;
      }
    }
  }

  // ─── RADIX SORT (LSD, base 10) ─────────────────────────────────────────────
  function* radixSort(arr) {
    var n   = arr.length;
    var max = Math.max.apply(null, arr);
    yield info('Starting Radix Sort (LSD). Sort digit-by-digit from least significant to most significant.');
    var exp = 1;
    var pass = 0;
    while (Math.floor(max / exp) > 0) {
      pass++;
      yield info('Pass ' + pass + ': sorting by the ' + getDigitPlace(exp) + ' digit (divisor=' + exp + ')');
      var output = new Array(n);
      var count  = new Array(10).fill(0);
      for (var i = 0; i < n; i++) {
        var d = Math.floor(arr[i] / exp) % 10;
        count[d]++;
        yield step('compare', [i], 'Read ' + getDigitPlace(exp) + ' digit of arr[' + i + ']=' + arr[i] + ' → digit ' + d, 'compare');
      }
      for (var i = 1; i < 10; i++) count[i] += count[i - 1];
      for (var i = n - 1; i >= 0; i--) {
        var d = Math.floor(arr[i] / exp) % 10;
        output[--count[d]] = arr[i];
      }
      for (var i = 0; i < n; i++) {
        arr[i] = output[i];
        yield step('write', [i], 'Write ' + arr[i] + ' to position ' + i + ' (digit bucket sort)', 'info', output.slice());
      }
      exp *= 10;
    }
    for (var i = 0; i < n; i++) yield mark(i, arr);
  }

  function getDigitPlace(exp) {
    if (exp === 1)    return 'ones';
    if (exp === 10)   return 'tens';
    if (exp === 100)  return 'hundreds';
    if (exp === 1000) return 'thousands';
    return exp + 's';
  }

  // ─── COUNTING SORT ─────────────────────────────────────────────────────────
  function* countingSort(arr) {
    var n   = arr.length;
    var max = Math.max.apply(null, arr);
    var min = Math.min.apply(null, arr);
    yield info('Starting Counting Sort. Count occurrences of each value, then reconstruct in order.');
    yield info('Value range: ' + min + ' to ' + max + '. Allocating count array of size ' + (max - min + 1) + '.');
    var count = new Array(max - min + 1).fill(0);
    for (var i = 0; i < n; i++) {
      count[arr[i] - min]++;
      yield step('compare', [i], 'Tally arr[' + i + ']=' + arr[i] + ' → count[' + (arr[i] - min) + ']=' + count[arr[i] - min], 'compare');
    }
    yield info('All values counted. Reconstructing sorted array from counts.');
    var idx = 0;
    for (var v = 0; v < count.length; v++) {
      while (count[v]-- > 0) {
        arr[idx] = v + min;
        yield step('write', [idx], 'Place value ' + (v + min) + ' at position ' + idx, 'info');
        idx++;
      }
    }
    for (var i = 0; i < n; i++) yield mark(i, arr);
  }

  // ─── COCKTAIL SHAKER SORT ──────────────────────────────────────────────────
  function* cocktailSort(arr) {
    var n = arr.length;
    var lo = 0, hi = n - 1;
    yield info('Starting Cocktail Shaker Sort. Like bubble sort but alternates direction each pass — eliminates "turtles" (small values at the end).');
    while (lo < hi) {
      var swapped = false;
      yield info('Forward pass: bubbling right from position ' + lo + ' to ' + hi);
      for (var i = lo; i < hi; i++) {
        yield cmp(i, i + 1, arr);
        if (arr[i] > arr[i + 1]) { yield swp(i, i + 1, arr); swapped = true; }
      }
      yield mark(hi, arr);
      hi--;
      if (!swapped) break;
      swapped = false;
      yield info('Backward pass: bubbling left from position ' + hi + ' to ' + lo);
      for (var i = hi; i > lo; i--) {
        yield cmp(i - 1, i, arr);
        if (arr[i - 1] > arr[i]) { yield swp(i - 1, i, arr); swapped = true; }
      }
      yield mark(lo, arr);
      lo++;
      if (!swapped) break;
    }
    for (var i = lo; i <= hi; i++) yield mark(i, arr);
  }

  // ─── GNOME SORT ────────────────────────────────────────────────────────────
  function* gnomeSort(arr) {
    var n = arr.length;
    var i = 0;
    yield info('Starting Gnome Sort. Move forward until you find an out-of-order pair, swap it, then step back — like a garden gnome moving flower pots.');
    while (i < n) {
      if (i === 0) {
        yield info('At the start — step forward.', [i]);
        i++;
      } else {
        yield cmp(i - 1, i, arr);
        if (arr[i - 1] <= arr[i]) {
          yield info('arr[' + (i - 1) + '] ≤ arr[' + i + '], step forward.', [i]);
          i++;
        } else {
          yield swp(i - 1, i, arr);
          i--;
        }
      }
    }
    for (var k = 0; k < n; k++) yield mark(k, arr);
  }

  // ─── COMB SORT ─────────────────────────────────────────────────────────────
  function* combSort(arr) {
    var n    = arr.length;
    var gap  = n;
    var shrink = 1.3;
    var sorted = false;
    yield info('Starting Comb Sort. Like bubble sort but compares elements far apart first, shrinking the gap by factor 1.3 each pass — eliminates turtles efficiently.');
    while (!sorted) {
      gap = Math.floor(gap / shrink);
      if (gap <= 1) { gap = 1; sorted = true; }
      yield info('Gap = ' + gap + ': compare and swap elements ' + gap + ' apart.');
      for (var i = 0; i + gap < n; i++) {
        yield cmp(i, i + gap, arr);
        if (arr[i] > arr[i + gap]) {
          yield swp(i, i + gap, arr);
          sorted = false;
        }
      }
    }
    for (var i = 0; i < n; i++) yield mark(i, arr);
  }

  // ─── Metadata ──────────────────────────────────────────────────────────────
  var ALGO_META = {
    bubble: {
      name:    'Bubble Sort',
      best:    'O(n)', avg: 'O(n²)', worst: 'O(n²)', space: 'O(1)',
      desc:    'Bubble Sort repeatedly steps through the list, compares adjacent elements, and swaps them if out of order. Larger elements "bubble up" to the end each pass. Simple but inefficient for large datasets. The classic teaching algorithm — its inefficiency makes each step obvious and educational.',
      gen:     bubbleSort
    },
    selection: {
      name:    'Selection Sort',
      best:    'O(n²)', avg: 'O(n²)', worst: 'O(n²)', space: 'O(1)',
      desc:    'Selection Sort finds the minimum element in the unsorted portion and places it at the front, extending the sorted prefix. Unlike bubble sort it always makes exactly n−1 swaps. Good when write operations are expensive, but does no better than O(n²) regardless of input order.',
      gen:     selectionSort
    },
    insertion: {
      name:    'Insertion Sort',
      best:    'O(n)', avg: 'O(n²)', worst: 'O(n²)', space: 'O(1)',
      desc:    'Insertion Sort builds a sorted prefix one element at a time, shifting larger elements right to make room. Excellent for small or nearly-sorted arrays (adaptive: O(n) best case). Used as a base case in hybrid algorithms like Timsort and Introsort.',
      gen:     insertionSort
    },
    shell: {
      name:    'Shell Sort',
      best:    'O(n log n)', avg: 'O(n log² n)', worst: 'O(n log² n)', space: 'O(1)',
      desc:    'Shell Sort generalizes insertion sort by first sorting elements far apart, then reducing the gap. This moves elements toward their final positions quickly. Using the Ciura gap sequence (1, 4, 10, 23, 57…) gives excellent practical performance. A key insight: a sequence already h-sorted remains h-sorted after a smaller-gap pass.',
      gen:     shellSort
    },
    merge: {
      name:    'Merge Sort',
      best:    'O(n log n)', avg: 'O(n log n)', worst: 'O(n log n)', space: 'O(n)',
      desc:    'Merge Sort divides the array in half, recursively sorts each half, then merges them back in sorted order. Guaranteed O(n log n) in all cases. Stable sort (equal elements preserve original order). Used in Java\'s Arrays.sort for objects and Python\'s Timsort. Trade-off: requires O(n) extra memory.',
      gen:     mergeSort
    },
    quick: {
      name:    'Quick Sort',
      best:    'O(n log n)', avg: 'O(n log n)', worst: 'O(n²)', space: 'O(log n)',
      desc:    'Quick Sort picks a pivot, partitions the array so all elements ≤ pivot come before it and all > pivot after, then recurses on both sides. Extremely fast in practice (excellent cache behavior, low constant factor). Worst case O(n²) with bad pivot choice — mitigated in production by randomized or median-of-three pivot selection.',
      gen:     quickSort
    },
    heap: {
      name:    'Heap Sort',
      best:    'O(n log n)', avg: 'O(n log n)', worst: 'O(n log n)', space: 'O(1)',
      desc:    'Heap Sort builds a max-heap from the array (Phase 1), then repeatedly extracts the maximum element and places it at the end (Phase 2). Guaranteed O(n log n) with O(1) space. Not stable, and less cache-friendly than Quick Sort due to non-sequential memory access patterns. The go-to when both time and space guarantees matter.',
      gen:     heapSort
    },
    radix: {
      name:    'Radix Sort',
      best:    'O(nk)', avg: 'O(nk)', worst: 'O(nk)', space: 'O(n+k)',
      desc:    'Radix Sort (LSD) sorts integers digit-by-digit from least to most significant using a stable counting sort at each pass. Achieves O(nk) where k is the number of digits — linear time for fixed-width integers! Not comparison-based, so it bypasses the O(n log n) lower bound. Used in specialized integer-sorting contexts.',
      gen:     radixSort
    },
    counting: {
      name:    'Counting Sort',
      best:    'O(n+k)', avg: 'O(n+k)', worst: 'O(n+k)', space: 'O(k)',
      desc:    'Counting Sort tallies how many times each value appears, then reconstructs the sorted array from those counts. Linear time O(n+k) where k is the value range. Only practical when k is not much larger than n. A building block for Radix Sort. Not comparison-based — exploits the integer nature of keys directly.',
      gen:     countingSort
    },
    cocktail: {
      name:    'Cocktail Shaker Sort',
      best:    'O(n)', avg: 'O(n²)', worst: 'O(n²)', space: 'O(1)',
      desc:    'Cocktail Shaker Sort (bidirectional bubble sort) alternates forward and backward passes. Each forward pass pushes the largest unsorted element right; each backward pass pushes the smallest unsorted element left. This eliminates "turtles" (small elements near the end) that slow pure bubble sort down significantly.',
      gen:     cocktailSort
    },
    gnome: {
      name:    'Gnome Sort',
      best:    'O(n)', avg: 'O(n²)', worst: 'O(n²)', space: 'O(1)',
      desc:    'Gnome Sort (also called Stupid Sort) works like a gnome sorting flower pots: step forward, and whenever you find two pots out of order, swap them and step back. If you\'re at the start, step forward. Conceptually the simplest sorting algorithm. Each swap simultaneously fixes an inversion and the backward walk is like insertion sort\'s shift phase.',
      gen:     gnomeSort
    },
    comb: {
      name:    'Comb Sort',
      best:    'O(n log n)', avg: 'O(n²/2^p)', worst: 'O(n²)', space: 'O(1)',
      desc:    'Comb Sort improves on bubble sort by comparing elements with a large gap (initially ≈ n), shrinking by a factor of 1.3 each pass until gap = 1 (pure bubble sort). The gap > 1 passes eliminate turtles — small values near the end that drag down bubble sort. Simple and surprisingly effective in practice.',
      gen:     combSort
    }
  };

  global.SortEngine = {
    meta:     ALGO_META,
    generate: function (algoKey, arr) {
      var copy = arr.slice();
      return ALGO_META[algoKey].gen(copy);
    }
  };

})(window);