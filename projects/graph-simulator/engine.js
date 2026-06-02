/* engine.js — Graph algorithm step generators
   Each generator yields Step objects:
   {
     type:      'visit' | 'enqueue' | 'dequeue' | 'relax' | 'path' | 'mst' | 'info' | 'done',
     nodeId:    primary node involved (or null),
     edgeKey:   'u-v' string (or null),
     nodeStates: { id -> 'visited'|'frontier'|'path'|'current' },
     edgeStates: { key -> 'tree'|'relaxed'|'mst'|'path' },
     distances:  { id -> number|Infinity },
     message:   string,
     category:  string (log colour class)
   }
*/

(function (global) {
  'use strict';

  var INF = Infinity;

  /* ── Helpers ── */

  function step(type, nodeId, edgeKey, nodeStates, edgeStates, distances, message, category) {
    return {
      type: type,
      nodeId: nodeId,
      edgeKey: edgeKey,
      nodeStates: nodeStates  || {},
      edgeStates: edgeStates  || {},
      distances:  distances   || null,
      message: message,
      category: category || type
    };
  }

  function ekey(u, v, directed) {
    return directed ? (u + '->' + v) : (u < v ? u + '-' + v : v + '-' + u);
  }

  function cloneObj(o) {
    var r = {};
    for (var k in o) r[k] = o[k];
    return r;
  }

  function cloneNS(ns) { return cloneObj(ns); }
  function cloneES(es) { return cloneObj(es); }

  // Build adjacency list from graph {nodes:[{id}], edges:[{u,v,w}], directed}
  function buildAdj(graph) {
    var adj = {};
    graph.nodes.forEach(function (n) { adj[n.id] = []; });
    graph.edges.forEach(function (e) {
      adj[e.u].push({ to: e.v, w: e.w, u: e.u, v: e.v });
      if (!graph.directed) adj[e.v].push({ to: e.u, w: e.w, u: e.u, v: e.v });
    });
    return adj;
  }

  // ── BFS ───────────────────────────────────────────────────────────────────
  function* bfs(graph, startId, endId) {
    var adj = buildAdj(graph);
    var visited = {}, parent = {}, ns = {}, es = {};
    ns[startId] = 'frontier';
    yield step('info', startId, null, cloneNS(ns), cloneES(es), null,
      'BFS: Enqueue start node ' + startId + '. Uses a FIFO queue — explores all neighbours at distance k before distance k+1.', 'info');

    var queue = [startId];
    visited[startId] = true;
    parent[startId] = null;
    var visitCount = 0, enqCount = 1;

    while (queue.length) {
      var u = queue.shift();
      ns[u] = 'current';
      yield step('visit', u, null, cloneNS(ns), cloneES(es), null,
        'Dequeue ' + u + '. Examining its neighbours.', 'visit');
      visitCount++;

      if (u === endId) {
        ns[u] = 'visited';
        yield step('done', u, null, cloneNS(ns), cloneES(es), null,
          'Reached target ' + endId + '! Reconstructing shortest path (by hops).', 'done');
        yield* reconstructPath(parent, startId, endId, ns, es, graph.directed);
        return;
      }

      var nbrs = adj[u] || [];
      for (var i = 0; i < nbrs.length; i++) {
        var e = nbrs[i];
        var v = e.to;
        var k = ekey(e.u, e.v, graph.directed);
        if (!visited[v]) {
          visited[v] = true;
          parent[v] = u;
          ns[v] = 'frontier';
          es[k] = 'tree';
          enqCount++;
          yield step('enqueue', v, k, cloneNS(ns), cloneES(es), null,
            'Enqueue ' + v + ' (discovered from ' + u + '). Queue length: ' + queue.length + 1, 'enqueue');
          queue.push(v);
        }
      }
      ns[u] = 'visited';
    }
    yield step('done', null, null, cloneNS(ns), cloneES(es), null,
      'BFS complete. All reachable nodes visited (' + visitCount + '). ' + (endId ? 'Target not reachable.' : ''), 'done');
  }

  // ── DFS ───────────────────────────────────────────────────────────────────
  function* dfs(graph, startId, endId) {
    var adj = buildAdj(graph);
    var visited = {}, parent = {}, ns = {}, es = {};
    yield step('info', startId, null, cloneNS(ns), cloneES(es), null,
      'DFS: Push start node ' + startId + '. Uses a LIFO stack — dives deep along one path before backtracking.', 'info');

    var stack = [startId];
    parent[startId] = null;

    while (stack.length) {
      var u = stack.pop();
      if (visited[u]) continue;
      visited[u] = true;
      ns[u] = 'current';
      yield step('visit', u, null, cloneNS(ns), cloneES(es), null,
        'Pop and visit ' + u + '. Stack depth: ' + stack.length, 'visit');

      if (u === endId) {
        yield step('done', u, null, cloneNS(ns), cloneES(es), null,
          'Reached target ' + endId + '! Reconstructing path.', 'done');
        yield* reconstructPath(parent, startId, endId, ns, es, graph.directed);
        return;
      }

      var nbrs = (adj[u] || []).slice().reverse(); // reverse so left-to-right exploration order
      for (var i = 0; i < nbrs.length; i++) {
        var e = nbrs[i];
        var v = e.to;
        var k = ekey(e.u, e.v, graph.directed);
        if (!visited[v]) {
          if (!parent.hasOwnProperty(v)) parent[v] = u;
          ns[v] = 'frontier';
          es[k] = 'tree';
          yield step('enqueue', v, k, cloneNS(ns), cloneES(es), null,
            'Push ' + v + ' onto stack (from ' + u + ').', 'enqueue');
          stack.push(v);
        }
      }
      ns[u] = 'visited';
    }
    yield step('done', null, null, cloneNS(ns), cloneES(es), null,
      'DFS complete. All reachable nodes explored.', 'done');
  }

  // ── DIJKSTRA ──────────────────────────────────────────────────────────────
  function* dijkstra(graph, startId, endId) {
    var adj = buildAdj(graph);
    var dist = {}, prev = {}, ns = {}, es = {};
    graph.nodes.forEach(function (n) { dist[n.id] = INF; });
    dist[startId] = 0;
    ns[startId] = 'frontier';

    // Simple priority queue via sorted array (fine for small graphs)
    var pq = [{ id: startId, d: 0 }];
    var visited = {};

    yield step('info', startId, null, cloneNS(ns), cloneES(es), cloneObj(dist),
      'Dijkstra: Set dist[' + startId + ']=0, all others ∞. Uses a min-heap to always expand the closest unvisited node. Only works with non-negative weights.', 'info');

    while (pq.length) {
      pq.sort(function (a, b) { return a.d - b.d; });
      var top = pq.shift();
      var u = top.id;
      if (visited[u]) continue;
      visited[u] = true;
      ns[u] = 'current';
      yield step('visit', u, null, cloneNS(ns), cloneES(es), cloneObj(dist),
        'Extract min: node ' + u + ' with dist=' + dist[u] + '. Relax its edges.', 'visit');

      if (u === endId) {
        yield step('done', u, null, cloneNS(ns), cloneES(es), cloneObj(dist),
          'Reached target ' + endId + '! Shortest path cost = ' + dist[endId], 'done');
        yield* reconstructPath(prev, startId, endId, ns, es, graph.directed, dist);
        return;
      }

      var nbrs = adj[u] || [];
      for (var i = 0; i < nbrs.length; i++) {
        var e = nbrs[i];
        var v = e.to, w = e.w;
        var k = ekey(e.u, e.v, graph.directed);
        if (!visited[v]) {
          var nd = dist[u] + w;
          es[k] = 'relaxed';
          if (nd < dist[v]) {
            dist[v] = nd;
            prev[v] = u;
            ns[v] = 'frontier';
            pq.push({ id: v, d: nd });
            yield step('relax', v, k, cloneNS(ns), cloneES(es), cloneObj(dist),
              'Relax edge ' + u + '→' + v + ' (w=' + w + '). New dist[' + v + ']=' + nd, 'relax');
          } else {
            yield step('relax', v, k, cloneNS(ns), cloneES(es), cloneObj(dist),
              'Edge ' + u + '→' + v + ': dist ' + nd + ' ≥ current best ' + dist[v] + '. No update.', 'relax');
          }
        }
      }
      ns[u] = 'visited';
    }
    yield step('done', null, null, cloneNS(ns), cloneES(es), cloneObj(dist),
      'Dijkstra complete. ' + (endId && dist[endId] === INF ? 'Target unreachable.' : 'All reachable nodes finalized.'), 'done');
  }

  // ── A* ────────────────────────────────────────────────────────────────────
  function* astar(graph, startId, endId) {
    var adj = buildAdj(graph);
    // Heuristic: Euclidean distance to end node
    var endNode = graph.nodes.find(function (n) { return n.id === endId; });
    function h(id) {
      if (!endNode) return 0;
      var n = graph.nodes.find(function (n) { return n.id === id; });
      if (!n) return 0;
      var dx = n.x - endNode.x, dy = n.y - endNode.y;
      return Math.sqrt(dx * dx + dy * dy) / 80; // scale to typical weight range
    }

    var g = {}, f = {}, prev = {}, ns = {}, es = {};
    graph.nodes.forEach(function (n) { g[n.id] = INF; f[n.id] = INF; });
    g[startId] = 0;
    f[startId] = h(startId);
    var open = [{ id: startId, f: f[startId] }];
    var closed = {};

    yield step('info', startId, null, cloneNS(ns), cloneES(es), cloneObj(g),
      'A*: Like Dijkstra but guides search with a heuristic h(n) = Euclidean distance to target. f(n) = g(n) + h(n). The heuristic makes A* focus on promising directions first.', 'info');

    while (open.length) {
      open.sort(function (a, b) { return a.f - b.f; });
      var top = open.shift();
      var u = top.id;
      if (closed[u]) continue;
      closed[u] = true;
      ns[u] = 'current';
      yield step('visit', u, null, cloneNS(ns), cloneES(es), cloneObj(g),
        'Expand ' + u + ': g=' + g[u].toFixed(2) + ', h=' + h(u).toFixed(2) + ', f=' + f[u].toFixed(2), 'visit');

      if (u === endId) {
        yield step('done', u, null, cloneNS(ns), cloneES(es), cloneObj(g),
          'Target ' + endId + ' reached! Path cost g=' + g[endId].toFixed(2), 'done');
        yield* reconstructPath(prev, startId, endId, ns, es, graph.directed, g);
        return;
      }

      var nbrs = adj[u] || [];
      for (var i = 0; i < nbrs.length; i++) {
        var e = nbrs[i];
        var v = e.to, w = e.w;
        var k = ekey(e.u, e.v, graph.directed);
        if (closed[v]) continue;
        var ng = g[u] + w;
        var nf = ng + h(v);
        es[k] = 'relaxed';
        if (ng < g[v]) {
          g[v] = ng; f[v] = nf;
          prev[v] = u;
          ns[v] = 'frontier';
          open.push({ id: v, f: nf });
          yield step('relax', v, k, cloneNS(ns), cloneES(es), cloneObj(g),
            'Update ' + v + ': g=' + ng.toFixed(2) + ', h=' + h(v).toFixed(2) + ', f=' + nf.toFixed(2), 'relax');
        }
      }
      ns[u] = 'visited';
    }
    yield step('done', null, null, cloneNS(ns), cloneES(es), cloneObj(g),
      'A* complete. Target unreachable.', 'done');
  }

  // ── BELLMAN-FORD ──────────────────────────────────────────────────────────
  function* bellmanFord(graph, startId, endId) {
    var n = graph.nodes.length;
    var dist = {}, prev = {}, ns = {}, es = {};
    graph.nodes.forEach(function (nd) { dist[nd.id] = INF; });
    dist[startId] = 0;
    ns[startId] = 'frontier';

    yield step('info', startId, null, cloneNS(ns), cloneES(es), cloneObj(dist),
      'Bellman-Ford: Relax ALL edges n−1 times. Handles negative-weight edges (unlike Dijkstra). A final pass detects negative cycles.', 'info');

    for (var iter = 1; iter <= n - 1; iter++) {
      var anyUpdate = false;
      yield step('info', null, null, cloneNS(ns), cloneES(es), cloneObj(dist),
        'Iteration ' + iter + ' of ' + (n - 1) + ': relaxing all ' + graph.edges.length + ' edges.', 'info');
      for (var i = 0; i < graph.edges.length; i++) {
        var e = graph.edges[i];
        var u = e.u, v = e.v, w = e.w;
        var k = ekey(u, v, graph.directed);
        var edgesToRelax = graph.directed ? [[u, v]] : [[u, v], [v, u]];
        for (var d = 0; d < edgesToRelax.length; d++) {
          var su = edgesToRelax[d][0], sv = edgesToRelax[d][1];
          if (dist[su] !== INF) {
            es[k] = 'relaxed';
            var nd = dist[su] + w;
            if (nd < dist[sv]) {
              dist[sv] = nd;
              prev[sv] = su;
              ns[sv] = 'frontier';
              anyUpdate = true;
              yield step('relax', sv, k, cloneNS(ns), cloneES(es), cloneObj(dist),
                'Relax ' + su + '→' + sv + ' (w=' + w + '): dist[' + sv + '] updated to ' + nd.toFixed(2), 'relax');
            }
          }
        }
      }
      if (!anyUpdate) {
        yield step('info', null, null, cloneNS(ns), cloneES(es), cloneObj(dist),
          'No updates in iteration ' + iter + ' — early exit! Graph already converged.', 'info');
        break;
      }
    }
    // Negative cycle check
    var negCycle = false;
    for (var i = 0; i < graph.edges.length; i++) {
      var e = graph.edges[i];
      if (dist[e.u] !== INF && dist[e.u] + e.w < dist[e.v]) { negCycle = true; break; }
      if (!graph.directed && dist[e.v] !== INF && dist[e.v] + e.w < dist[e.u]) { negCycle = true; break; }
    }
    if (negCycle) {
      yield step('done', null, null, cloneNS(ns), cloneES(es), cloneObj(dist),
        '⚠ Negative cycle detected! Shortest paths are undefined.', 'done');
      return;
    }
    if (endId) yield* reconstructPath(prev, startId, endId, ns, es, graph.directed, dist);
    yield step('done', null, null, cloneNS(ns), cloneES(es), cloneObj(dist),
      'Bellman-Ford complete. Shortest distances from ' + startId + ' finalized.', 'done');
  }

  // ── BIDIRECTIONAL BFS ─────────────────────────────────────────────────────
  function* bidirBFS(graph, startId, endId) {
    var adj = buildAdj(graph);
    var ns = {}, es = {};
    if (startId === endId) {
      yield step('done', startId, null, ns, es, null, 'Start = End.', 'done');
      return;
    }
    var visitedF = {}, visitedB = {}, parentF = {}, parentB = {};
    visitedF[startId] = true; parentF[startId] = null;
    visitedB[endId]   = true; parentB[endId]   = null;
    var qF = [startId], qB = [endId];
    ns[startId] = 'frontier'; ns[endId] = 'frontier';

    yield step('info', null, null, cloneNS(ns), cloneES(es), null,
      'Bidirectional BFS: Expand from both start (' + startId + ') and end (' + endId + ') simultaneously. Meets in the middle — cuts search space roughly in half.', 'info');

    while (qF.length || qB.length) {
      var meeting = expandLayer(qF, visitedF, parentF, visitedB, 'F', adj, graph, ns, es);
      if (meeting) { yield* bidirFinish(meeting, parentF, parentB, startId, endId, ns, es); return; }
      yield step('info', null, null, cloneNS(ns), cloneES(es), null,
        'Forward frontier expanded. Size: ' + qF.length, 'enqueue');

      var meeting2 = expandLayer(qB, visitedB, parentB, visitedF, 'B', adj, graph, ns, es);
      if (meeting2) { yield* bidirFinish(meeting2, parentF, parentB, startId, endId, ns, es); return; }
      yield step('info', null, null, cloneNS(ns), cloneES(es), null,
        'Backward frontier expanded. Size: ' + qB.length, 'enqueue');
    }
    yield step('done', null, null, cloneNS(ns), cloneES(es), null,
      'Bidirectional BFS complete. Target unreachable.', 'done');
  }

  function expandLayer(queue, myVisited, myParent, theirVisited, dir, adj, graph, ns, es) {
    if (!queue.length) return null;
    var next = [];
    while (queue.length) {
      var u = queue.shift();
      ns[u] = dir === 'F' ? 'current' : 'visited';
      var nbrs = adj[u] || [];
      for (var i = 0; i < nbrs.length; i++) {
        var e = nbrs[i], v = e.to;
        var k = ekey(e.u, e.v, graph.directed);
        if (!myVisited[v]) {
          myVisited[v] = true;
          myParent[v] = u;
          ns[v] = dir === 'F' ? 'frontier' : 'visited';
          es[k] = 'tree';
          next.push(v);
          if (theirVisited[v]) return v; // meeting point
        }
      }
      ns[u] = 'visited';
    }
    while (next.length) queue.push(next.shift());
    return null;
  }

  function* bidirFinish(meeting, parentF, parentB, startId, endId, ns, es) {
    yield step('done', meeting, null, cloneNS(ns), cloneES(es), null,
      'Frontiers met at node ' + meeting + '! Stitching forward and backward paths.', 'done');
    // Build forward path
    var pathF = [], cur = meeting;
    while (cur !== null) { pathF.unshift(cur); cur = parentF[cur]; }
    // Build backward path
    var pathB = [], cur2 = parentB[meeting];
    while (cur2 !== null) { pathB.push(cur2); cur2 = parentB[cur2]; }
    var full = pathF.concat(pathB);
    for (var i = 0; i < full.length; i++) ns[full[i]] = 'path';
    for (var i = 0; i < full.length - 1; i++) {
      var k = ekey(full[i], full[i+1], false);
      es[k] = 'path';
    }
    yield step('path', null, null, cloneNS(ns), cloneES(es), null,
      'Path: ' + full.join(' → ') + ' (' + (full.length - 1) + ' hops)', 'path');
  }

  // ── PRIM'S MST ────────────────────────────────────────────────────────────
  function* prim(graph, startId) {
    var adj = buildAdj(graph);
    var inMST = {}, key = {}, parent = {}, ns = {}, es = {};
    graph.nodes.forEach(function (n) { key[n.id] = INF; });
    key[startId] = 0; parent[startId] = null;
    var pq = graph.nodes.map(function (n) { return { id: n.id, k: key[n.id] }; });
    var totalCost = 0, mstEdges = [];

    yield step('info', startId, null, cloneNS(ns), cloneES(es), null,
      'Prim\'s MST: Start from node ' + startId + '. Greedily add the minimum-weight edge that connects a new node to the growing spanning tree. Runs until all nodes are included.', 'info');

    while (pq.length) {
      pq.sort(function (a, b) { return a.k - b.k; });
      var top = pq.shift();
      var u = top.id;
      if (inMST[u]) continue;
      inMST[u] = true;
      ns[u] = 'visited';
      if (parent[u] !== null && parent[u] !== undefined) {
        var k = ekey(parent[u], u, false);
        es[k] = 'mst';
        totalCost += key[u];
        mstEdges.push(parent[u] + '-' + u);
        yield step('mst', u, k, cloneNS(ns), cloneES(es), null,
          'Add edge ' + parent[u] + '—' + u + ' (w=' + key[u] + ') to MST. Total cost so far: ' + totalCost, 'mst');
      } else {
        yield step('visit', u, null, cloneNS(ns), cloneES(es), null,
          'Start node ' + u + ' added to MST.', 'visit');
      }

      var nbrs = adj[u] || [];
      for (var i = 0; i < nbrs.length; i++) {
        var e = nbrs[i], v = e.to, w = e.w;
        var k = ekey(e.u, e.v, false);
        if (!inMST[v] && w < key[v]) {
          key[v] = w;
          parent[v] = u;
          ns[v] = 'frontier';
          var idx = pq.findIndex(function (x) { return x.id === v; });
          if (idx >= 0) pq[idx].k = w;
          yield step('relax', v, k, cloneNS(ns), cloneES(es), null,
            'Update key[' + v + ']=' + w + ' via edge ' + u + '—' + v, 'relax');
        }
      }
    }
    yield step('done', null, null, cloneNS(ns), cloneES(es), null,
      'Prim\'s MST complete. Total weight: ' + totalCost + '. Edges: ' + mstEdges.join(', '), 'done');
  }

  // ── KRUSKAL'S MST ─────────────────────────────────────────────────────────
  function* kruskal(graph) {
    var ns = {}, es = {};
    // Union-Find
    var parent = {}, rank = {};
    graph.nodes.forEach(function (n) { parent[n.id] = n.id; rank[n.id] = 0; });
    function find(x) { if (parent[x] !== x) parent[x] = find(parent[x]); return parent[x]; }
    function union(x, y) {
      var rx = find(x), ry = find(y);
      if (rx === ry) return false;
      if (rank[rx] < rank[ry]) { parent[rx] = ry; }
      else if (rank[rx] > rank[ry]) { parent[ry] = rx; }
      else { parent[ry] = rx; rank[rx]++; }
      return true;
    }

    var sorted = graph.edges.slice().sort(function (a, b) { return a.w - b.w; });
    var totalCost = 0, mstCount = 0;

    yield step('info', null, null, cloneNS(ns), cloneES(es), null,
      'Kruskal\'s MST: Sort all edges by weight, then greedily add each edge if it connects two different components (using Union-Find). Stops once n−1 edges are in the MST.', 'info');

    for (var i = 0; i < sorted.length; i++) {
      var e = sorted[i];
      var k = ekey(e.u, e.v, false);
      es[k] = 'relaxed';
      yield step('relax', null, k, cloneNS(ns), cloneES(es), null,
        'Consider edge ' + e.u + '—' + e.v + ' (w=' + e.w + '). Components: find(' + e.u + ')=' + find(e.u) + ', find(' + e.v + ')=' + find(e.v), 'relax');

      if (union(e.u, e.v)) {
        es[k] = 'mst';
        ns[e.u] = 'visited'; ns[e.v] = 'visited';
        totalCost += e.w;
        mstCount++;
        yield step('mst', null, k, cloneNS(ns), cloneES(es), null,
          '✓ Add ' + e.u + '—' + e.v + ' to MST (w=' + e.w + '). MST edges: ' + mstCount + ', cost: ' + totalCost, 'mst');
        if (mstCount === graph.nodes.length - 1) break;
      } else {
        yield step('info', null, k, cloneNS(ns), cloneES(es), null,
          '✗ Skip ' + e.u + '—' + e.v + ': would create a cycle (same component).', 'info');
      }
    }
    yield step('done', null, null, cloneNS(ns), cloneES(es), null,
      'Kruskal\'s MST complete. Total weight: ' + totalCost + '.', 'done');
  }

  // ── TOPOLOGICAL SORT (Kahn's algorithm) ───────────────────────────────────
  function* topoSort(graph) {
    var adj = {}, inDeg = {}, ns = {}, es = {};
    graph.nodes.forEach(function (n) { adj[n.id] = []; inDeg[n.id] = 0; });
    graph.edges.forEach(function (e) {
      adj[e.u].push(e.v);
      inDeg[e.v]++;
    });

    yield step('info', null, null, cloneNS(ns), cloneES(es), null,
      'Topological Sort (Kahn\'s): Add all nodes with in-degree 0 to a queue. Repeatedly remove a node, emit it, and reduce the in-degree of its neighbours. Works only on DAGs (directed acyclic graphs).', 'info');

    var queue = [], result = [];
    for (var id in inDeg) {
      if (inDeg[id] === 0) { queue.push(id); ns[id] = 'frontier'; }
    }
    yield step('info', null, null, cloneNS(ns), cloneES(es), null,
      'Initial zero-in-degree nodes: [' + queue.join(', ') + ']', 'info');

    while (queue.length) {
      var u = queue.shift();
      result.push(u);
      ns[u] = 'current';
      yield step('visit', u, null, cloneNS(ns), cloneES(es), null,
        'Emit ' + u + '. Topo order so far: [' + result.join(', ') + ']', 'visit');

      var nbrs = adj[u] || [];
      for (var i = 0; i < nbrs.length; i++) {
        var v = nbrs[i];
        var k = ekey(u, v, true);
        es[k] = 'tree';
        inDeg[v]--;
        if (inDeg[v] === 0) {
          ns[v] = 'frontier';
          queue.push(v);
          yield step('enqueue', v, k, cloneNS(ns), cloneES(es), null,
            'in-degree[' + v + '] → 0. Enqueue ' + v + '.', 'enqueue');
        } else {
          yield step('relax', v, k, cloneNS(ns), cloneES(es), null,
            'Reduce in-degree[' + v + '] to ' + inDeg[v] + '.', 'relax');
        }
      }
      ns[u] = 'visited';
    }
    if (result.length < graph.nodes.length) {
      yield step('done', null, null, cloneNS(ns), cloneES(es), null,
        '⚠ Cycle detected! Not a DAG — topological sort is not possible.', 'done');
    } else {
      yield step('done', null, null, cloneNS(ns), cloneES(es), null,
        'Topological order: [' + result.join(' → ') + ']', 'done');
    }
  }

  // ── FLOYD-WARSHALL ────────────────────────────────────────────────────────
  function* floydWarshall(graph) {
    var ids = graph.nodes.map(function (n) { return n.id; });
    var n = ids.length;
    var dist = {}, ns = {}, es = {};
    // Init dist matrix
    ids.forEach(function (i) {
      dist[i] = {};
      ids.forEach(function (j) { dist[i][j] = (i === j) ? 0 : INF; });
    });
    graph.edges.forEach(function (e) {
      dist[e.u][e.v] = Math.min(dist[e.u][e.v], e.w);
      if (!graph.directed) dist[e.v][e.u] = Math.min(dist[e.v][e.u], e.w);
    });

    yield step('info', null, null, ns, es, null,
      'Floyd-Warshall: Computes ALL-PAIRS shortest paths. For each intermediate node k, check if going through k improves the path from every i to every j. O(V³) time — only feasible for small graphs.', 'info');

    for (var ki = 0; ki < n; ki++) {
      var k = ids[ki];
      ns[k] = 'current';
      yield step('visit', k, null, cloneNS(ns), cloneES(es), null,
        'Intermediate node k=' + k + ' (' + (ki+1) + '/' + n + '). Checking all pairs (i,j) if path through ' + k + ' is shorter.', 'visit');
      for (var ii = 0; ii < n; ii++) {
        var i = ids[ii];
        for (var ji = 0; ji < n; ji++) {
          var j = ids[ji];
          if (dist[i][k] !== INF && dist[k][j] !== INF) {
            var nd = dist[i][k] + dist[k][j];
            if (nd < dist[i][j]) {
              dist[i][j] = nd;
              var ek = ekey(i, j, graph.directed);
              es[ek] = 'relaxed';
              yield step('relax', j, ek, cloneNS(ns), cloneES(es), null,
                'dist[' + i + '][' + j + '] updated: ' + i + '→' + k + '→' + j + ' = ' + nd.toFixed(2), 'relax');
            }
          }
        }
      }
      ns[k] = 'visited';
    }
    // Check negative cycles
    var negCycle = ids.some(function (i) { return dist[i][i] < 0; });
    yield step('done', null, null, cloneNS(ns), cloneES(es), null,
      negCycle
        ? '⚠ Negative cycle detected!'
        : 'Floyd-Warshall complete. All-pairs shortest paths computed for ' + n + ' nodes (' + (n*n) + ' pairs).', 'done');
  }

  // ── Path reconstruction helper ─────────────────────────────────────────────
  function* reconstructPath(parent, startId, endId, ns, es, directed, dist) {
    var path = [], cur = endId;
    while (cur !== null && cur !== undefined) {
      path.unshift(cur);
      cur = parent[cur];
      if (path.length > 1000) break; // safety
    }
    if (path[0] !== startId) {
      yield step('path', null, null, cloneNS(ns), cloneES(es), null,
        'Could not reconstruct full path to ' + endId + '.', 'path');
      return;
    }
    for (var i = 0; i < path.length; i++) ns[path[i]] = 'path';
    for (var i = 0; i < path.length - 1; i++) {
      var k = ekey(path[i], path[i+1], directed);
      es[k] = 'path';
    }
    var cost = dist ? dist[endId] : path.length - 1;
    yield step('path', null, null, cloneNS(ns), cloneES(es), null,
      'Shortest path: ' + path.join(' → ') + ' | Cost: ' + (typeof cost === 'number' && isFinite(cost) ? cost.toFixed(2) : '∞'), 'path');
  }

  // ── Metadata ──────────────────────────────────────────────────────────────
  var ALGO_META = {
    bfs: {
      name: 'BFS — Breadth-First Search',
      time: 'O(V + E)', space: 'O(V)', optimal: 'Optimal (unweighted)',
      needsEnd: true, needsWeight: false,
      desc: 'Explores the graph level by level using a FIFO queue. Visits all neighbours at distance k before moving to distance k+1. Guarantees the shortest path in terms of hop count on unweighted graphs. Foundation for many network algorithms.',
      gen: bfs
    },
    dfs: {
      name: 'DFS — Depth-First Search',
      time: 'O(V + E)', space: 'O(V)', optimal: 'Not optimal',
      needsEnd: true, needsWeight: false,
      desc: 'Explores as far as possible along each branch before backtracking, using a LIFO stack (or recursion). Not guaranteed to find shortest paths, but excellent for connectivity, cycle detection, topological ordering, and maze generation. The backbone of many graph algorithms.',
      gen: dfs
    },
    dijkstra: {
      name: "Dijkstra's Algorithm",
      time: 'O((V+E) log V)', space: 'O(V)', optimal: 'Optimal (non-negative weights)',
      needsEnd: true, needsWeight: true,
      desc: "Finds shortest paths from a source node to all others in a weighted graph with non-negative edge weights. Greedily expands the closest unvisited node using a min-priority queue. The go-to for GPS navigation, network routing, and any shortest-path problem without negative weights.",
      gen: dijkstra
    },
    astar: {
      name: 'A* Search',
      time: 'O(E)', space: 'O(V)', optimal: 'Optimal (admissible heuristic)',
      needsEnd: true, needsWeight: true,
      desc: "A* improves on Dijkstra's by using a heuristic h(n) — here, Euclidean distance to the goal — to guide expansion toward the target first. f(n) = g(n) + h(n) where g is actual cost and h is estimated remaining cost. With an admissible heuristic (never overestimates), A* is both complete and optimal.",
      gen: astar
    },
    bellman: {
      name: 'Bellman-Ford',
      time: 'O(V · E)', space: 'O(V)', optimal: 'Optimal (handles negatives)',
      needsEnd: true, needsWeight: true,
      desc: "Computes single-source shortest paths by relaxing all edges V−1 times. Unlike Dijkstra's, handles negative-weight edges correctly. A V-th pass detects negative cycles. Slower than Dijkstra's but more general — used in distance-vector routing protocols like RIP.",
      gen: bellmanFord
    },
    bidir: {
      name: 'Bidirectional BFS',
      time: 'O(b^(d/2))', space: 'O(b^(d/2))', optimal: 'Optimal (unweighted)',
      needsEnd: true, needsWeight: false,
      desc: 'Runs two simultaneous BFS searches — one forward from the source, one backward from the target — stopping when they meet in the middle. Dramatically reduces the search space: instead of searching a sphere of radius d, it searches two spheres of radius d/2, which is exponentially smaller.',
      gen: bidirBFS
    },
    prim: {
      name: "Prim's MST",
      time: 'O((V+E) log V)', space: 'O(V)', optimal: 'Minimum spanning tree',
      needsEnd: false, needsWeight: true,
      desc: "Builds a Minimum Spanning Tree by starting from one node and greedily adding the cheapest edge that connects a new node to the growing tree. Similar in structure to Dijkstra's. Efficient on dense graphs. The MST connects all nodes with the minimum total edge weight.",
      gen: prim
    },
    kruskal: {
      name: "Kruskal's MST",
      time: 'O(E log E)', space: 'O(V)', optimal: 'Minimum spanning tree',
      needsEnd: false, needsWeight: true,
      desc: 'Builds a Minimum Spanning Tree by sorting all edges by weight and greedily adding each edge if it does not form a cycle, using a Union-Find data structure to track connected components. More efficient than Prim\'s on sparse graphs. Edge-centric rather than node-centric.',
      gen: kruskal
    },
    topo: {
      name: 'Topological Sort (Kahn\'s)',
      time: 'O(V + E)', space: 'O(V)', optimal: 'Valid ordering (DAG only)',
      needsEnd: false, needsWeight: false,
      desc: "Orders nodes in a DAG (directed acyclic graph) such that for every directed edge u→v, node u comes before v. Uses Kahn's BFS-based algorithm: repeatedly emit nodes with in-degree 0 and reduce neighbours' in-degrees. Applications: build systems, task scheduling, dependency resolution.",
      gen: topoSort
    },
    floyd: {
      name: 'Floyd-Warshall',
      time: 'O(V³)', space: 'O(V²)', optimal: 'All-pairs shortest paths',
      needsEnd: false, needsWeight: true,
      desc: 'Computes shortest paths between ALL pairs of nodes using dynamic programming. For each intermediate node k, it asks: "is the path from i to j shorter if we go through k?" Simple to implement but O(V³) — only practical for small graphs (V ≤ ~200). Detects negative cycles. Used in network routing tables.',
      gen: floydWarshall
    }
  };

  global.GraphEngine = {
    meta: ALGO_META,
    generate: function (algoKey, graph, startId, endId) {
      var meta = ALGO_META[algoKey];
      if (algoKey === 'kruskal' || algoKey === 'topo' || algoKey === 'floyd') {
        return meta.gen(graph, startId);
      } else if (algoKey === 'prim') {
        return meta.gen(graph, startId);
      } else {
        return meta.gen(graph, startId, endId);
      }
    }
  };

})(window);