/* graphvis-tutorial.js — tutorial steps for Graphvis */
(function () {
  'use strict';

  var STEPS = [
    /* 0 — Welcome */
    {
      target: null,
      title: 'Welcome to Graphvis',
      body: 'This tour takes about <strong>90 seconds</strong> and covers everything — ' +
            'how to build a graph, pick an algorithm, and read the results.<br><br>' +
            'Tap <strong>Next</strong> to begin, or <strong>Skip</strong> to dive straight in.',
      placement: 'auto'
    },

    /* 1 — Canvas */
    {
      target: '#vis-wrap',
      title: 'The Graph Canvas',
      body: 'This is your <strong>interactive graph</strong>. Each circle is a <strong>node</strong>, ' +
            'each line is an <strong>edge</strong>.<br><br>' +
            'Numbers on edges are <strong>weights</strong> — the cost of traversing that edge. ' +
            'They matter for algorithms like Dijkstra\'s and A*.',
      placement: 'top',
      padding: 0
    },

    /* 2 — Graph toolbar */
    {
      target: '#graph-toolbar',
      title: 'Graph Editor Tools',
      body: 'Build your own graph with these tools:<br><br>' +
            '• <strong>▶ Select</strong> — tap a node to set it as the <em>start</em> node (S). ' +
            'Long-press / right-click to set the <em>end</em> node (E). Drag to reposition.<br>' +
            '• <strong>⬤ Add Node</strong> — tap empty space to place a new node<br>' +
            '• <strong>─ Add Edge</strong> — tap one node then another to connect them<br>' +
            '• <strong>✕ Delete</strong> — tap any node or edge to remove it',
      placement: 'right',
      padding: 4
    },

    /* 3 — Generate buttons */
    {
      target: '#graph-toolbar',
      title: 'Generate Graphs Instantly',
      body: 'Don\'t want to build from scratch? Use the generator buttons:<br><br>' +
            '• <strong>☠ Random</strong> — generates a random connected graph<br>' +
            '• <strong>⊞ Grid</strong> — generates a clean grid — great for pathfinding algorithms<br>' +
            '• <strong>□ Clear</strong> — wipes the canvas so you can start fresh',
      placement: 'right',
      padding: 4
    },

    /* 4 — Directed / Weighted toggles */
    {
      target: '#graph-toolbar',
      title: 'Directed & Weighted Modes',
      body: '• <strong>DIR</strong> — toggle directed edges (arrows show direction). ' +
            'Required for Topological Sort.<br><br>' +
            '• <strong>WGT</strong> — show or hide edge weight labels on the canvas.<br><br>' +
            '<em>Tip: enable DIR and use Topo Sort to visualise dependency ordering!</em>',
      placement: 'right',
      padding: 4
    },

    /* 5 — Start / End nodes */
    {
      target: '#role-hint',
      title: 'Start & End Nodes',
      body: 'Most algorithms need to know <strong>where to begin</strong> (S) and sometimes ' +
            '<strong>where to go</strong> (E).<br><br>' +
            '• <strong>Tap</strong> a node in Select mode → sets it as Start (green)<br>' +
            '• <strong>Long-press</strong> (or right-click) a node → sets it as End (red)<br><br>' +
            'MST algorithms (Prim\'s, Kruskal\'s) and Floyd-Warshall ignore the end node.',
      placement: 'top',
      padding: 6
    },

    /* 6 — Algo nav */
    {
      target: '#algo-nav',
      title: 'Choose an Algorithm',
      body: 'Ten algorithms are available — scroll the bar to see all of them:<br><br>' +
            '• <strong>BFS / DFS</strong> — unweighted traversal & shortest hop-count paths<br>' +
            '• <strong>Dijkstra / A* / Bellman-Ford</strong> — weighted shortest paths<br>' +
            '• <strong>Bi-BFS</strong> — bidirectional search (meets in the middle)<br>' +
            '• <strong>Prim / Kruskal</strong> — minimum spanning trees<br>' +
            '• <strong>Topo Sort</strong> — ordering for DAGs<br>' +
            '• <strong>Floyd-Warshall</strong> — all-pairs shortest paths',
      placement: 'bottom',
      padding: 6
    },

    /* 7 — Play / transport */
    {
      target: '#ctrl-center',
      title: 'Playback Controls',
      body: '• <strong>▶ Play</strong> — run the algorithm automatically (<code>Space</code>)<br>' +
            '• <strong>◀◀ / ▶▶</strong> — step backward or forward one operation (<code>← →</code>)<br>' +
            '• <strong>↺</strong> — reset the traversal but keep your graph intact<br>' +
            '• <strong>▶|</strong> — jump to the finished state instantly<br><br>' +
            'Stepping manually is the best way to truly understand each algorithm.',
      placement: 'top',
      padding: 10
    },

    /* 8 — Stats */
    {
      target: '#hdr-stats',
      title: 'Live Statistics',
      body: 'Four counters update as the algorithm runs:<br><br>' +
            '• <strong>Visited</strong> — nodes fully processed<br>' +
            '• <strong>Queued</strong> — nodes in the frontier / priority queue<br>' +
            '• <strong>Relaxed</strong> — edges examined so far<br>' +
            '• <strong>Cost</strong> — total path cost once a path is found<br><br>' +
            'Compare these numbers across algorithms on the same graph!',
      placement: 'bottom',
      padding: 6
    },

    /* 9 — Info panel */
    {
      target: '#info-panel',
      title: 'Algorithm Info Panel',
      body: 'The right panel (or slide-up sheet on mobile) shows:<br><br>' +
            '• <strong>Time & space complexity</strong> badges<br>' +
            '• Whether the algorithm is <strong>optimal</strong><br>' +
            '• A plain-English <strong>explanation</strong> of how it works<br>' +
            '• A <strong>live step log</strong> narrating every decision<br><br>' +
            'On mobile tap <strong>ⓘ</strong> in the toolbar to open it.',
      placement: 'left',
      padding: 6
    },

    /* 10 — Done */
    {
      target: null,
      title: 'Ready to Explore! 🚀',
      body: 'A few things to try right away:<br><br>' +
            '• Generate a <strong>Grid graph</strong> and run <strong>BFS vs A*</strong> — ' +
            'watch how A* heads straight for the goal<br>' +
            '• Enable <strong>DIR</strong> and run <strong>Topo Sort</strong> on a custom DAG<br>' +
            '• Run <strong>Prim\'s</strong> and <strong>Kruskal\'s</strong> on the same graph — ' +
            'do they produce the same tree?<br><br>' +
            'Tap the <strong>?</strong> button anytime to replay this tour.',
      placement: 'auto'
    }
  ];

  document.addEventListener('DOMContentLoaded', function () {
    Tutorial.init(STEPS, 'graphvis_tut_done');
  });

})();