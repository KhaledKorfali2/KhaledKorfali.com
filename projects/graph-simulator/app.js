(function () {
  'use strict';

  /* ── Feature detection ── */
  var IS_TOUCH  = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  var IS_MOBILE = window.matchMedia('(max-width: 700px)').matches;

  /* ── DOM refs ── */
  var canvas       = document.getElementById('vis');
  var ctx          = canvas.getContext('2d');
  var algoBtns     = document.querySelectorAll('.algo-btn');
  var btnPlay      = document.getElementById('btn-play');
  var btnStepFwd   = document.getElementById('btn-step-fwd');
  var btnStepBack  = document.getElementById('btn-step-back');
  var btnReset     = document.getElementById('btn-reset');
  var btnEnd       = document.getElementById('btn-end');
  var btnInfoTool  = document.getElementById('btn-info-tool');
  var slSpeed      = document.getElementById('sl-speed');
  var slSpeedM     = document.getElementById('sl-speed-m');
  var vSpeed       = document.getElementById('v-speed');
  var vSpeedM      = document.getElementById('v-speed-m');
  var stepLog      = document.getElementById('step-log');
  var algoTitle    = document.getElementById('algo-title');
  var algoDesc     = document.getElementById('algo-desc');
  var badgeTime    = document.getElementById('badge-time');
  var badgeSpace   = document.getElementById('badge-space');
  var badgeOpt     = document.getElementById('badge-optimal');
  var stVisited    = document.getElementById('st-visited');
  var stQueued     = document.getElementById('st-queued');
  var stEdges      = document.getElementById('st-edges');
  var stCost       = document.getElementById('st-cost');
  var progressFill = document.getElementById('progress-fill');
  var progressText = document.getElementById('progress-text');
  var statusLabel  = document.getElementById('status-label');
  var chkDirected  = document.getElementById('chk-directed');
  var chkWeighted  = document.getElementById('chk-weighted');
  var infoPanel    = document.getElementById('info-panel');
  var panelHandle  = document.getElementById('panel-handle');

  // Weight picker refs
  var weightPicker    = document.getElementById('weight-picker');
  var weightInput     = document.getElementById('weight-input');
  var weightValDisp   = document.getElementById('weight-val-display');
  var wpConfirm       = document.getElementById('wp-confirm');
  var wpCancel        = document.getElementById('wp-cancel');

  var toolBtns = {
    select: document.getElementById('tool-select'),
    node:   document.getElementById('tool-node'),
    edge:   document.getElementById('tool-edge'),
    delete: document.getElementById('tool-delete')
  };

  /* ── Canvas sizing with devicePixelRatio ── */
  var W, H;
  var resizePending = false;
  function resizeCanvas() {
    var wrap = document.getElementById('vis-wrap');
    var dpr  = window.devicePixelRatio || 1;
    var cw   = wrap.clientWidth;
    var ch   = wrap.clientHeight;
    canvas.width  = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width  = cw + 'px';
    canvas.style.height = ch + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = cw; H = ch;
    draw();
  }
  window.addEventListener('resize', function () {
    if (resizePending) return;
    resizePending = true;
    requestAnimationFrame(function () { resizePending = false; resizeCanvas(); regenerateIfEmpty(); });
  }, { passive: true });

  /* ── Graph state ── */
  var graph = { nodes: [], edges: [], directed: false };
  var nodeIdCounter = 0;
  function makeNodeId() {
    var n = nodeIdCounter++;
    var letter = String.fromCharCode(65 + (n % 26));
    var suffix = n >= 26 ? String(Math.floor(n / 26)) : '';
    return letter + suffix;
  }

  /* ── Algorithm / playback state ── */
  var currentAlgo    = 'bfs';
  var startNodeId    = null;
  var endNodeId      = null;
  var steps          = [];
  var stepIndex      = 0;
  var playing        = false;
  var playTimer      = null;
  var speedLevel     = 5;
  var dispNodeStates = {};
  var dispEdgeStates = {};
  var dispDistances  = null;
  var stats          = { visited: 0, queued: 0, edges: 0, cost: null };
  var panelOpen      = false;

  /* ── Tool state ── */
  var activeTool  = 'select';
  var edgeStart   = null;
  var dragNode    = null;
  var dragOffX    = 0, dragOffY = 0;
  var hoverNode   = null;
  var hoverEdge   = null;

  // Long-press detection for mobile (long-press = set end node)
  var longPressTimer  = null;
  var longPressFired  = false;
  var LONG_PRESS_MS   = 500;

  // Pending edge for weight picker
  var pendingEdgeU = null, pendingEdgeV = null;

  /* ── Speed map ── */
  var SPEED_MAP = [0, 900, 500, 250, 120, 70, 35, 18, 9, 4, 1];

  /* ── Node radius — larger on mobile for touch ── */
  var NODE_R = IS_MOBILE ? 22 : 18;
  // Touch hit radius — even bigger padding for fingers
  var NODE_HIT_R = IS_MOBILE ? NODE_R + 10 : NODE_R + 5;

  /* ══════════════════════════════════════════════════════
     GRAPH GENERATION
  ══════════════════════════════════════════════════════ */
  function clearGraph() {
    graph.nodes = []; graph.edges = [];
    nodeIdCounter = 0; startNodeId = null; endNodeId = null;
    resetTraversal();
  }

  function generateRandom(count) {
    clearGraph();
    count = count || (IS_MOBILE ? 9 : 12);
    var margin = IS_MOBILE ? 55 : 70;
    for (var i = 0; i < count; i++) {
      graph.nodes.push({
        id: makeNodeId(),
        x: margin + Math.random() * (W - margin * 2),
        y: margin + Math.random() * (H - margin * 2)
      });
    }
    // Spanning tree first
    var shuffled = graph.nodes.slice().sort(function () { return Math.random() - 0.5; });
    for (var i = 1; i < shuffled.length; i++) {
      graph.edges.push({ u: shuffled[i-1].id, v: shuffled[i].id, w: rw() });
    }
    // Extra edges
    var extra = Math.floor(count * 0.6);
    for (var i = 0; i < extra; i++) {
      var a = graph.nodes[(Math.random() * graph.nodes.length) | 0];
      var b = graph.nodes[(Math.random() * graph.nodes.length) | 0];
      if (a.id !== b.id && !hasEdge(a.id, b.id)) graph.edges.push({ u: a.id, v: b.id, w: rw() });
    }
    autoSetStartEnd();
    resetTraversal(); draw();
  }

  function generateGrid(cols, rows) {
    clearGraph();
    cols = cols || (IS_MOBILE ? 4 : 6);
    rows = rows || (IS_MOBILE ? 4 : 4);
    var padX = IS_MOBILE ? 50 : 70, padY = IS_MOBILE ? 60 : 65;
    var stepX = (W - padX * 2) / Math.max(cols - 1, 1);
    var stepY = (H - padY * 2) / Math.max(rows - 1, 1);
    var grid = [];
    for (var r = 0; r < rows; r++) {
      grid[r] = [];
      for (var c = 0; c < cols; c++) {
        var id = makeNodeId();
        graph.nodes.push({ id: id, x: padX + c * stepX, y: padY + r * stepY });
        grid[r][c] = id;
      }
    }
    for (var r = 0; r < rows; r++)
      for (var c = 0; c < cols; c++) {
        if (c + 1 < cols) graph.edges.push({ u: grid[r][c], v: grid[r][c+1], w: rw() });
        if (r + 1 < rows) graph.edges.push({ u: grid[r][c], v: grid[r+1][c], w: rw() });
      }
    startNodeId = grid[0][0];
    endNodeId   = grid[rows-1][cols-1];
    resetTraversal(); draw();
  }

  function rw() { return Math.floor(1 + Math.random() * 9); }

  function hasEdge(u, v) {
    return graph.edges.some(function (e) {
      return (e.u === u && e.v === v) || (!graph.directed && e.u === v && e.v === u);
    });
  }

  function autoSetStartEnd() {
    if (!graph.nodes.length) return;
    var sorted = graph.nodes.slice().sort(function (a, b) { return a.x - b.x; });
    startNodeId = sorted[0].id;
    endNodeId   = sorted[sorted.length - 1].id;
  }

  function regenerateIfEmpty() {
    if (graph.nodes.length === 0 && W > 0 && H > 0) generateRandom();
  }

  /* ══════════════════════════════════════════════════════
     STEP ENGINE
  ══════════════════════════════════════════════════════ */
  function buildSteps() {
    if (!graph.nodes.length) return;
    var meta = GraphEngine.meta[currentAlgo];
    var sid  = startNodeId || graph.nodes[0].id;
    var eid  = meta.needsEnd ? (endNodeId || graph.nodes[graph.nodes.length - 1].id) : null;
    var gen  = GraphEngine.generate(currentAlgo, graph, sid, eid);
    steps = [];
    var r;
    while (!(r = gen.next()).done) steps.push(r.value);
  }

  function resetTraversal() {
    stopPlay();
    dispNodeStates = {}; dispEdgeStates = {}; dispDistances = null;
    stepIndex = 0; steps = [];
    stats = { visited: 0, queued: 0, edges: 0, cost: null };
    updateStats(); updateProgress(); clearLog(); draw();
  }

  function initAndReset() {
    resetTraversal();
    buildSteps();
    updateProgress(); updateInfo();
  }

  function cloneObj(o) { if (!o) return {}; var r = {}; for (var k in o) r[k] = o[k]; return r; }

  function applyStepDisplay(s) {
    dispNodeStates = cloneObj(s.nodeStates);
    dispEdgeStates = cloneObj(s.edgeStates);
    if (s.distances) dispDistances = s.distances;
    var v = 0, q = 0, e = 0;
    for (var id in dispNodeStates) {
      var st = dispNodeStates[id];
      if (st === 'visited' || st === 'path' || st === 'current') v++;
      if (st === 'frontier') q++;
    }
    for (var k in dispEdgeStates) {
      var st = dispEdgeStates[k];
      if (st === 'relaxed' || st === 'tree' || st === 'mst') e++;
    }
    stats.visited = v; stats.queued = q; stats.edges = e;
    if (s.type === 'path') {
      var m = s.message.match(/Cost:\s*([\d.∞]+)/);
      if (m) stats.cost = m[1];
    }
    if (s.type === 'done') {
      var m = s.message.match(/cost[= g]+([\d.]+)/i) || s.message.match(/weight[: ]+([\d.]+)/i);
      if (m) stats.cost = m[1];
    }
    updateStats();
  }

  function stepForward() {
    if (steps.length === 0) { buildSteps(); updateProgress(); }
    if (stepIndex >= steps.length) return false;
    var s = steps[stepIndex++];
    applyStepDisplay(s);
    addLog(s);
    updateProgress(); draw();
    return stepIndex < steps.length;
  }

  function stepBack() {
    if (stepIndex <= 0) return;
    replayTo(Math.max(0, stepIndex - 1));
  }

  function replayTo(target) {
    dispNodeStates = {}; dispEdgeStates = {}; dispDistances = null;
    stats = { visited: 0, queued: 0, edges: 0, cost: null };
    clearLog();
    for (var i = 0; i < target; i++) {
      var s = steps[i];
      dispNodeStates = cloneObj(s.nodeStates);
      dispEdgeStates = cloneObj(s.edgeStates);
      if (s.distances) dispDistances = s.distances;
    }
    stepIndex = target;
    if (target > 0) { applyStepDisplay(steps[target - 1]); addLog(steps[target - 1]); }
    updateStats(); updateProgress(); draw();
  }

  function jumpToEnd() {
    if (!steps.length) buildSteps();
    replayTo(steps.length);
  }

  /* ══════════════════════════════════════════════════════
     PLAYBACK
  ══════════════════════════════════════════════════════ */
  function startPlay() {
    if (!steps.length) buildSteps();
    if (stepIndex >= steps.length) replayTo(0);
    playing = true;
    btnPlay.innerHTML = '&#9646;&#9646;';
    scheduleNext();
  }
  function stopPlay() {
    playing = false;
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    btnPlay.innerHTML = '&#9654;';
  }
  function scheduleNext() {
    if (!playing) return;
    var delay = SPEED_MAP[speedLevel] || 35;
    playTimer = setTimeout(function () {
      var more = stepForward();
      if (more) scheduleNext(); else stopPlay();
    }, delay);
  }
  function togglePlay() {
    if (playing) stopPlay(); else startPlay();
  }

  /* ══════════════════════════════════════════════════════
     CANVAS DRAWING — performance optimised
     - No shadowBlur on every frame (major GPU drain on mobile)
     - Glow replaced by thicker stroke on active nodes
     - Draw edges first, then nodes (single passes)
     - No CSS grid overlay (removed — caused repaints)
  ══════════════════════════════════════════════════════ */

  var STATE_FILL = {
    default:  '#1e3a5f', current: '#0c2a4a',
    frontier: '#0e3352', visited: '#2d1b5e', path: '#4a3500'
  };
  var STATE_STROKE = {
    default:  '#2563eb', current: '#38bdf8',
    frontier: '#38bdf8', visited: '#7c3aed', path: '#f59e0b'
  };
  var EDGE_COL = {
    default: '#162030', tree: '#1d4ed8', relaxed: '#6d28d9',
    mst: '#059669', path: '#d97706'
  };

  function getNodeFill(id) {
    if (id === startNodeId) return '#0d3d2a';
    if (id === endNodeId)   return '#3d0d0d';
    return STATE_FILL[dispNodeStates[id]] || STATE_FILL.default;
  }
  function getNodeStroke(id) {
    if (id === startNodeId) return '#34d399';
    if (id === endNodeId)   return '#f87171';
    return STATE_STROKE[dispNodeStates[id]] || STATE_STROKE.default;
  }
  function getEdgeCol(key) { return EDGE_COL[dispEdgeStates[key]] || EDGE_COL.default; }

  function ekey(u, v) {
    if (graph.directed) return u + '->' + v;
    return u < v ? u + '-' + v : v + '-' + u;
  }

  var drawScheduled = false;
  function draw() {
    if (drawScheduled) return;
    drawScheduled = true;
    requestAnimationFrame(function () { drawScheduled = false; _draw(); });
  }

  function _draw() {
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);

    /* ── Subtle dot grid (canvas-drawn, not CSS) ── */
    ctx.fillStyle = '#131d2e';
    var gs = 40;
    for (var gx = gs; gx < W; gx += gs)
      for (var gy = gs; gy < H; gy += gs)
        ctx.fillRect(gx, gy, 1, 1);

    /* ── Edges ── */
    graph.edges.forEach(function (e) {
      var nu = nodeById(e.u), nv = nodeById(e.v);
      if (!nu || !nv) return;
      var k   = ekey(e.u, e.v);
      var col = getEdgeCol(k);
      var active = !!dispEdgeStates[k];
      ctx.strokeStyle = col;
      ctx.lineWidth   = active ? 2.5 : 1.2;
      if (graph.directed) {
        drawArrow(nu.x, nu.y, nv.x, nv.y, col, active);
      } else {
        ctx.beginPath();
        ctx.moveTo(nu.x, nu.y);
        ctx.lineTo(nv.x, nv.y);
        ctx.stroke();
      }
      if (chkWeighted.checked) {
        var mx = (nu.x + nv.x) / 2, my = (nu.y + nv.y) / 2;
        var dx = nv.x - nu.x, dy = nv.y - nu.y;
        var len = Math.sqrt(dx*dx + dy*dy) || 1;
        var ox = -dy / len * 11, oy = dx / len * 11;
        ctx.font = '600 10px JetBrains Mono, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = active ? col : '#2a4060';
        ctx.fillText(e.w, mx + ox, my + oy);
      }
    });

    /* Draft edge while drawing */
    if (activeTool === 'edge' && edgeStart && lastTouchPos) {
      var sn = nodeById(edgeStart);
      if (sn) {
        ctx.beginPath();
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.moveTo(sn.x, sn.y);
        ctx.lineTo(lastTouchPos.x, lastTouchPos.y);
        ctx.stroke(); ctx.setLineDash([]);
      }
    }

    /* ── Nodes ── */
    graph.nodes.forEach(function (n) {
      var fill   = getNodeFill(n.id);
      var stroke = getNodeStroke(n.id);
      var state  = dispNodeStates[n.id];
      var isActive = !!(state || n.id === startNodeId || n.id === endNodeId);
      var isHover  = hoverNode === n.id;
      var r = isHover ? NODE_R + 3 : NODE_R;

      /* Active nodes get a thick outer ring instead of shadowBlur */
      if (isActive) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = stroke + '30'; // 18% opacity
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = isActive ? 2.5 : 1.8;
      ctx.stroke();

      /* Labels */
      var distVal = null;
      if (dispDistances && dispDistances[n.id] !== undefined) {
        var d = dispDistances[n.id];
        distVal = isFinite(d) ? (Number.isInteger(d) ? String(d) : d.toFixed(1)) : '∞';
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#d0e8ff';
      if (distVal !== null) {
        ctx.font = '700 9px JetBrains Mono, monospace';
        ctx.fillText(n.id, n.x, n.y - 5);
        ctx.font = '600 8px JetBrains Mono, monospace';
        ctx.fillStyle = '#fcd34d';
        ctx.fillText(distVal, n.x, n.y + 6);
      } else {
        ctx.font = '700 11px JetBrains Mono, monospace';
        ctx.fillText(n.id, n.x, n.y);
      }

      /* S / E badges */
      if (n.id === startNodeId || n.id === endNodeId) {
        ctx.font = '700 8px JetBrains Mono, monospace';
        ctx.fillStyle = n.id === startNodeId ? '#34d399' : '#f87171';
        ctx.fillText(n.id === startNodeId ? 'S' : 'E', n.x + NODE_R + 7, n.y - 8);
      }
    });
  }

  function drawArrow(x1, y1, x2, y2, color, active) {
    var dx = x2-x1, dy = y2-y1;
    var len = Math.sqrt(dx*dx+dy*dy) || 1;
    var ux = dx/len, uy = dy/len;
    var sx = x1 + ux*(NODE_R+3), sy = y1 + uy*(NODE_R+3);
    var ex = x2 - ux*(NODE_R+5), ey = y2 - uy*(NODE_R+5);
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    var al = 10, aw = 5;
    ctx.beginPath(); ctx.fillStyle = color;
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - ux*al + uy*aw, ey - uy*al - ux*aw);
    ctx.lineTo(ex - ux*al - uy*aw, ey - uy*al + ux*aw);
    ctx.closePath(); ctx.fill();
  }

  function nodeById(id) { return graph.nodes.find(function (n) { return n.id === id; }) || null; }

  /* ══════════════════════════════════════════════════════
     POINTER HANDLING — unified mouse + touch
  ══════════════════════════════════════════════════════ */

  var lastTouchPos = null;

  /* Unified canvas coordinates from mouse or touch event */
  function evXY(e) {
    var rect = canvas.getBoundingClientRect();
    var src  = (e.touches && e.touches.length) ? e.touches[0]
             : (e.changedTouches && e.changedTouches.length) ? e.changedTouches[0]
             : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  function nodeAt(x, y) {
    /* Iterate in reverse so topmost (last-drawn) node wins */
    for (var i = graph.nodes.length - 1; i >= 0; i--) {
      var n = graph.nodes[i];
      var dx = n.x - x, dy = n.y - y;
      if (dx*dx + dy*dy <= NODE_HIT_R * NODE_HIT_R) return n.id;
    }
    return null;
  }

  function edgeAt(x, y) {
    var hit = null, best = IS_TOUCH ? 16 : 8;
    graph.edges.forEach(function (e) {
      var nu = nodeById(e.u), nv = nodeById(e.v);
      if (!nu || !nv) return;
      var d = ptSegDist(x, y, nu.x, nu.y, nv.x, nv.y);
      if (d < best) { best = d; hit = ekey(e.u, e.v); }
    });
    return hit;
  }

  function ptSegDist(px, py, ax, ay, bx, by) {
    var dx = bx-ax, dy = by-ay;
    var t  = ((px-ax)*dx + (py-ay)*dy) / (dx*dx+dy*dy+1e-9);
    t = Math.max(0, Math.min(1, t));
    var cx = ax+t*dx, cy = ay+t*dy;
    return Math.sqrt((px-cx)*(px-cx)+(py-cy)*(py-cy));
  }

  /* ── Core pointer-down logic ── */
  function onPointerDown(pos, isLongPress) {
    var hit = nodeAt(pos.x, pos.y);

    if (activeTool === 'select') {
      if (hit) {
        if (isLongPress) {
          /* Long-press / right-click = set end */
          endNodeId = hit;
          resetTraversal(); draw();
          vibrateShort();
          return;
        }
        dragNode = hit;
        var n = nodeById(hit);
        dragOffX = pos.x - n.x;
        dragOffY = pos.y - n.y;
        /* On touch: short tap = set start, drag = move */
        if (!IS_TOUCH) {
          startNodeId = hit;
          resetTraversal();
        }
      }
    } else if (activeTool === 'node') {
      if (!hit) {
        var id = makeNodeId();
        graph.nodes.push({ id: id, x: pos.x, y: pos.y });
        if (!startNodeId) startNodeId = id;
        else if (!endNodeId) endNodeId = id;
        resetTraversal(); draw();
      }
    } else if (activeTool === 'edge') {
      if (hit) {
        if (!edgeStart) {
          edgeStart = hit;
          setStatus('Tap second node…');
        } else if (hit !== edgeStart && !hasEdge(edgeStart, hit)) {
          pendingEdgeU = edgeStart;
          pendingEdgeV = hit;
          edgeStart = null;
          setStatus('');
          showWeightPicker(pos);
        } else {
          edgeStart = null; setStatus('');
        }
      } else {
        edgeStart = null; setStatus('');
      }
      draw();
    } else if (activeTool === 'delete') {
      if (hit) {
        graph.nodes = graph.nodes.filter(function (n) { return n.id !== hit; });
        graph.edges = graph.edges.filter(function (e) { return e.u !== hit && e.v !== hit; });
        if (startNodeId === hit) startNodeId = graph.nodes.length ? graph.nodes[0].id : null;
        if (endNodeId   === hit) endNodeId   = graph.nodes.length > 1 ? graph.nodes[graph.nodes.length-1].id : null;
        resetTraversal(); draw();
      } else {
        var ek = edgeAt(pos.x, pos.y);
        if (ek) {
          graph.edges = graph.edges.filter(function (e) { return ekey(e.u, e.v) !== ek; });
          resetTraversal(); draw();
        }
      }
    }
  }

  /* ── Mouse events ── */
  canvas.addEventListener('mousemove', function (e) {
    lastTouchPos = evXY(e);
    hoverNode = nodeAt(lastTouchPos.x, lastTouchPos.y);
    hoverEdge = hoverNode ? null : edgeAt(lastTouchPos.x, lastTouchPos.y);
    if (dragNode) {
      var n = nodeById(dragNode);
      if (n) { n.x = lastTouchPos.x - dragOffX; n.y = lastTouchPos.y - dragOffY; }
    }
    canvas.style.cursor = activeTool === 'select'
      ? (hoverNode ? (dragNode ? 'grabbing' : 'grab') : 'default')
      : 'crosshair';
    draw();
  });

  canvas.addEventListener('mouseleave', function () {
    lastTouchPos = null; hoverNode = null; hoverEdge = null; draw();
  });

  canvas.addEventListener('mousedown', function (e) {
    if (e.button === 2) {
      /* Right-click: set end node */
      var pos = evXY(e);
      var hit = nodeAt(pos.x, pos.y);
      if (hit) { endNodeId = hit; resetTraversal(); draw(); }
      return;
    }
    onPointerDown(evXY(e), false);
  });

  canvas.addEventListener('mouseup', function () {
    if (activeTool === 'select' && dragNode) {
      /* Short click without drag = set start */
      var n = nodeById(dragNode);
      if (n) {
        var movedFar = Math.abs(n.x - (lastTouchPos ? lastTouchPos.x - dragOffX : n.x)) < 4 &&
                       Math.abs(n.y - (lastTouchPos ? lastTouchPos.y - dragOffY : n.y)) < 4;
        if (movedFar) { startNodeId = dragNode; resetTraversal(); }
      }
    }
    dragNode = null;
    canvas.style.cursor = 'default';
    draw();
  });

  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ── Touch events — proper implementation ── */
  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    if (panelOpen) { closePanel(); return; }
    var pos = evXY(e);
    lastTouchPos = pos;
    hoverNode = nodeAt(pos.x, pos.y);
    longPressFired = false;

    /* Start long-press timer */
    clearTimeout(longPressTimer);
    if (activeTool === 'select' && hoverNode) {
      longPressTimer = setTimeout(function () {
        longPressFired = true;
        onPointerDown(pos, true);
      }, LONG_PRESS_MS);
    }

    /* Start drag immediately (will be cancelled if we detect long press) */
    if (activeTool === 'select' && hoverNode) {
      dragNode = hoverNode;
      var n = nodeById(hoverNode);
      dragOffX = pos.x - n.x;
      dragOffY = pos.y - n.y;
    }

    draw();
  }, { passive: false });

  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    var pos = evXY(e);
    lastTouchPos = pos;

    /* If we moved significantly, cancel long-press */
    if (longPressTimer && !longPressFired) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    if (dragNode) {
      var n = nodeById(dragNode);
      if (n) { n.x = pos.x - dragOffX; n.y = pos.y - dragOffY; }
    }
    draw();
  }, { passive: false });

  canvas.addEventListener('touchend', function (e) {
    e.preventDefault();
    clearTimeout(longPressTimer);
    var pos = evXY(e);

    if (!longPressFired) {
      /* Determine if this was a tap (no/tiny movement) or a drag */
      var moved = dragNode && lastTouchPos &&
                  (Math.abs(lastTouchPos.x - pos.x) > 6 || Math.abs(lastTouchPos.y - pos.y) > 6);

      if (!moved) {
        /* Tap — run pointer-down action */
        if (activeTool === 'select' && dragNode) {
          startNodeId = dragNode;
          resetTraversal();
        } else {
          onPointerDown(pos, false);
        }
      }
    }

    dragNode = null;
    hoverNode = null;
    draw();
  }, { passive: false });

  canvas.addEventListener('touchcancel', function () {
    clearTimeout(longPressTimer);
    dragNode = null; draw();
  }, { passive: true });

  /* ── Haptic feedback (where available) ── */
  function vibrateShort() {
    if (navigator.vibrate) navigator.vibrate(40);
  }

  /* ══════════════════════════════════════════════════════
     WEIGHT PICKER  (replaces prompt())
  ══════════════════════════════════════════════════════ */
  weightInput.addEventListener('input', function () {
    weightValDisp.textContent = weightInput.value;
  });

  function showWeightPicker(pos) {
    weightInput.value = '5';
    weightValDisp.textContent = '5';
    weightPicker.classList.add('visible');
    /* Position near the midpoint of the edge, or center on mobile */
    if (!IS_MOBILE && pos) {
      var pu = nodeById(pendingEdgeU), pv = nodeById(pendingEdgeV);
      var mx = pu && pv ? (pu.x + pv.x) / 2 : pos.x;
      var my = pu && pv ? (pu.y + pv.y) / 2 : pos.y;
      var pw = 170, ph = 100;
      weightPicker.style.left = Math.min(W - pw - 10, Math.max(10, mx - pw/2)) + 'px';
      weightPicker.style.top  = Math.min(H - ph - 10, Math.max(10, my - ph/2)) + 'px';
      weightPicker.style.position = 'absolute';
      weightPicker.style.transform = 'none';
    }
  }

  function hideWeightPicker() { weightPicker.classList.remove('visible'); }

  wpConfirm.addEventListener('click', function () {
    if (pendingEdgeU && pendingEdgeV) {
      var w = parseInt(weightInput.value) || 5;
      graph.edges.push({ u: pendingEdgeU, v: pendingEdgeV, w: w });
      pendingEdgeU = pendingEdgeV = null;
      resetTraversal(); draw();
    }
    hideWeightPicker();
  });

  wpCancel.addEventListener('click', function () {
    pendingEdgeU = pendingEdgeV = null;
    hideWeightPicker();
  });

  /* ══════════════════════════════════════════════════════
     TOOLBAR WIRING
  ══════════════════════════════════════════════════════ */
  function setTool(name) {
    activeTool = name; edgeStart = null; setStatus('');
    Object.keys(toolBtns).forEach(function (k) {
      toolBtns[k].classList.toggle('active', k === name);
    });
  }

  Object.keys(toolBtns).forEach(function (k) {
    toolBtns[k].addEventListener('click', function () { setTool(k); });
  });

  document.getElementById('tool-gen-random').addEventListener('click', function () {
    generateRandom(IS_MOBILE ? 9 : 12);
  });
  document.getElementById('tool-gen-grid').addEventListener('click', function () {
    generateGrid(IS_MOBILE ? 4 : 6, 4);
  });
  document.getElementById('tool-clear').addEventListener('click', function () { clearGraph(); draw(); });

  chkDirected.addEventListener('change', function () {
    graph.directed = chkDirected.checked;
    resetTraversal(); draw();
  });
  chkWeighted.addEventListener('change', draw);

  /* Info button in toolbar (mobile) */
  if (btnInfoTool) {
    btnInfoTool.addEventListener('click', function () { togglePanel(); });
  }

  /* ══════════════════════════════════════════════════════
     MOBILE INFO PANEL SHEET
  ══════════════════════════════════════════════════════ */
  function openPanel()  { infoPanel.classList.add('open');  panelOpen = true; }
  function closePanel() { infoPanel.classList.remove('open'); panelOpen = false; }
  function togglePanel() { if (panelOpen) closePanel(); else openPanel(); }

  var sheetDragY = null, sheetStartOpen = false;
  panelHandle.addEventListener('touchstart', function (e) {
    sheetDragY    = e.touches[0].clientY;
    sheetStartOpen = panelOpen;
  }, { passive: true });
  panelHandle.addEventListener('touchmove', function (e) {
    if (sheetDragY === null) return;
    var dy = e.touches[0].clientY - sheetDragY;
    if (dy > 40 && sheetStartOpen)   closePanel();
    if (dy < -40 && !sheetStartOpen) openPanel();
  }, { passive: true });
  panelHandle.addEventListener('touchend', function () { sheetDragY = null; }, { passive: true });
  panelHandle.addEventListener('click', togglePanel);

  /* ══════════════════════════════════════════════════════
     ALGO NAV
  ══════════════════════════════════════════════════════ */
  algoBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      algoBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentAlgo = btn.getAttribute('data-algo');
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      if (currentAlgo === 'topo' && !graph.directed) {
        chkDirected.checked = true;
        graph.directed = true;
      }
      initAndReset();
    });
  });

  /* ══════════════════════════════════════════════════════
     TRANSPORT + SPEED
  ══════════════════════════════════════════════════════ */
  btnPlay.addEventListener('click',     togglePlay);
  btnStepFwd.addEventListener('click',  function () { stopPlay(); stepForward(); });
  btnStepBack.addEventListener('click', function () { stopPlay(); stepBack(); });
  btnReset.addEventListener('click',    initAndReset);
  btnEnd.addEventListener('click',      function () { stopPlay(); jumpToEnd(); });

  function syncSpeed(val) {
    speedLevel = parseInt(val);
    slSpeed.value  = speedLevel; vSpeed.textContent  = speedLevel;
    slSpeedM.value = speedLevel; vSpeedM.textContent = speedLevel;
  }
  slSpeed.addEventListener('input',  function () { syncSpeed(slSpeed.value); });
  slSpeedM.addEventListener('input', function () { syncSpeed(slSpeedM.value); });

  /* ── Keyboard ── */
  document.addEventListener('keydown', function (e) {
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    switch (e.code) {
      case 'Space':      e.preventDefault(); togglePlay();              break;
      case 'ArrowRight': e.preventDefault(); stopPlay(); stepForward(); break;
      case 'ArrowLeft':  e.preventDefault(); stopPlay(); stepBack();    break;
      case 'KeyR':       initAndReset();                                break;
      case 'End':        e.preventDefault(); stopPlay(); jumpToEnd();   break;
      case 'KeyS':       setTool('select'); break;
      case 'KeyN':       setTool('node');   break;
      case 'KeyE':       setTool('edge');   break;
      case 'KeyD':       setTool('delete'); break;
    }
  });

  /* ══════════════════════════════════════════════════════
     UI HELPERS
  ══════════════════════════════════════════════════════ */
  function setStatus(msg) { statusLabel.textContent = msg; }

  function updateStats() {
    stVisited.textContent = stats.visited;
    stQueued.textContent  = stats.queued;
    stEdges.textContent   = stats.edges;
    stCost.textContent    = stats.cost !== null ? stats.cost : '—';
  }

  function updateProgress() {
    var total = steps.length;
    progressFill.style.width = total ? (stepIndex / total * 100).toFixed(1) + '%' : '0%';
    progressText.textContent = stepIndex + ' / ' + total;
  }

  function updateInfo() {
    var meta = GraphEngine.meta[currentAlgo];
    algoTitle.textContent = meta.name;
    algoDesc.textContent  = meta.desc;
    badgeTime.textContent  = meta.time;
    badgeSpace.textContent = meta.space;
    badgeOpt.textContent   = meta.optimal;
  }

  var LOG_MAX = 60;
  function clearLog() { stepLog.innerHTML = ''; }
  function addLog(s) {
    var el = document.createElement('div');
    el.className = 'log-entry ' + (s.category || s.type);
    el.textContent = s.message;
    stepLog.appendChild(el);
    while (stepLog.children.length > LOG_MAX) stepLog.removeChild(stepLog.firstChild);
    stepLog.scrollTop = stepLog.scrollHeight;
  }

  /* ══════════════════════════════════════════════════════
     BOOT
  ══════════════════════════════════════════════════════ */
  resizeCanvas();
  updateInfo();
  syncSpeed(5);
  generateRandom();
  buildSteps();
  updateProgress();

})();