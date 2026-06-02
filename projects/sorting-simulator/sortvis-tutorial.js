/* sortvis-tutorial.js — tutorial steps for Sortvis */
(function () {
  'use strict';

  var STEPS = [
    /* 0 — Welcome (no spotlight) */
    {
      target: null,
      title: 'Welcome to Sortvis',
      body: 'This quick tour walks you through everything in about <strong>60 seconds</strong>.<br><br>' +
            'You\'ll learn how to run a sorting algorithm, step through it one operation at a time, ' +
            'and read the live statistics.<br><br>' +
            '<strong>Tap Next</strong> to begin — or <strong>Skip</strong> if you\'d rather explore on your own.',
      placement: 'auto'
    },

    /* 1 — Algorithm nav */
    {
      target: '#algo-nav',
      title: 'Pick an Algorithm',
      body: 'These buttons switch between <strong>12 sorting algorithms</strong> — from classic ones ' +
            'like <code>Bubble</code> and <code>Quick</code> to more exotic ones like <code>Gnome</code> and <code>Comb</code>.<br><br>' +
            'Scroll left/right if some are off-screen. The active algorithm is highlighted in yellow.',
      placement: 'bottom',
      padding: 6
    },

    /* 2 — Canvas */
    {
      target: '#vis-wrap',
      title: 'The Visualizer',
      body: 'Each <strong>vertical bar</strong> represents one element in the array. ' +
            'Taller bars = larger values.<br><br>' +
            'Colour tells you what\'s happening at each step:<br>' +
            '🟡 <strong>Yellow</strong> — being compared<br>' +
            '🔴 <strong>Red</strong> — being swapped<br>' +
            '🟢 <strong>Teal</strong> — in its final sorted position',
      placement: 'top',
      padding: 0
    },

    /* 3 — Play button */
    {
      target: '#btn-play',
      title: 'Play / Pause',
      body: 'Press <strong>Play</strong> to watch the algorithm run automatically.<br><br>' +
            'Press it again to <strong>pause</strong> at any point. ' +
            'You can also use the <code>Space</code> key on a keyboard.',
      placement: 'top',
      padding: 10
    },

    /* 4 — Step controls */
    {
      target: '#ctrl-center',
      title: 'Step-by-Step Controls',
      body: '<strong>◀◀</strong> and <strong>▶▶</strong> move one atomic operation at a time — ' +
            'perfect for understanding exactly what the algorithm does at each comparison or swap.<br><br>' +
            '<strong>↺</strong> generates a fresh random array.<br>' +
            '<strong>▶|</strong> jumps to the end instantly.',
      placement: 'top',
      padding: 10
    },

    /* 5 — Speed slider (desktop only, falls back gracefully on mobile) */
    {
      target: '#ctrl-left',
      title: 'Size & Speed',
      body: '<strong>Size</strong> controls how many bars are in the array (more bars = slower, more detailed).<br><br>' +
            '<strong>Speed</strong> controls how fast the animation plays — ' +
            'turn it down to catch every detail, or crank it up to see the full sort in seconds.',
      placement: 'top',
      padding: 6
    },

    /* 6 — Stats */
    {
      target: '#hdr-stats',
      title: 'Live Statistics',
      body: 'Three counters update in real time as the algorithm runs:<br><br>' +
            '• <strong>Comps</strong> — total comparisons made<br>' +
            '• <strong>Swaps</strong> — elements swapped<br>' +
            '• <strong>Writes</strong> — array positions written<br><br>' +
            'These numbers reveal <em>why</em> some algorithms are more efficient than others.',
      placement: 'bottom',
      padding: 6
    },

    /* 7 — Info panel */
    {
      target: '#info-panel',
      title: 'Algorithm Info Panel',
      body: 'This panel shows:<br><br>' +
            '• <strong>Big-O complexity</strong> badges (best / average / worst / space)<br>' +
            '• A plain-English <strong>description</strong> of how the algorithm works<br>' +
            '• A <strong>live step log</strong> that narrates each operation as it happens<br><br>' +
            'On mobile, tap <strong>ⓘ</strong> in the footer to open it.',
      placement: 'left',
      padding: 6
    },

    /* 8 — Input type (desktop) */
    {
      target: '#ctrl-right',
      title: 'Input Types',
      body: 'Try different starting conditions to see how they affect performance:<br><br>' +
            '• <strong>Random</strong> — typical case<br>' +
            '• <strong>Nearly sorted</strong> — best case for Insertion Sort<br>' +
            '• <strong>Reversed</strong> — worst case for many algorithms<br>' +
            '• <strong>Few unique</strong> — great for seeing duplicate handling',
      placement: 'top',
      padding: 6
    },

    /* 9 — Done */
    {
      target: null,
      title: 'You\'re all set! 🎉',
      body: 'Hit <strong>Play</strong> and watch your first sort.<br><br>' +
            'A few tips to get the most out of Sortvis:<br>' +
            '• Step slowly through <code>Bubble</code> to understand swaps<br>' +
            '• Compare <code>Quick</code> vs <code>Merge</code> on the same input<br>' +
            '• Try <code>Insertion</code> on <em>Nearly Sorted</em> — notice how fast it is!<br><br>' +
            'You can replay this tutorial anytime via the <strong>?</strong> button in the header.',
      placement: 'auto'
    }
  ];

  // Wait for DOM + app to be ready
  document.addEventListener('DOMContentLoaded', function () {
    Tutorial.init(STEPS, 'sortvis_tut_done');
  });

})();