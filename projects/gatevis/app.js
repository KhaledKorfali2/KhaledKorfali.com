(function () {
  'use strict';

  /* ── Feature detection ── */
  var IS_TOUCH  = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  var IS_MOBILE = window.matchMedia('(max-width: 700px)').matches;

  /* ── DOM refs ── */
  var canvas     = document.getElementById('cv');
  var ctx        = canvas.getContext('2d');
  var stGates    = document.getElementById('st-gates');
  var stWires    = document.getElementById('st-wires');
  var stInputs   = document.getElementById('st-inputs');
  var stOutputs  = document.getElementById('st-outputs');
  var modeLabel  = document.getElementById('mode-label');
  var selTitle   = document.getElementById('sel-title');
  var selBody    = document.getElementById('sel-body');
  var gateDetail = document.getElementById('gate-detail');
  var selectedInfo = document.getElementById('selected-info');
  var gdName     = document.getElementById('gd-name');
  var gdSymbol   = document.getElementById('gd-symbol');
  var gdExpr     = document.getElementById('gd-expr');
  var gdDesc     = document.getElementById('gd-desc');
  var gdTable    = document.getElementById('gd-table');
  var ttPanel    = document.getElementById('truth-table-panel');
  var ttContent  = document.getElementById('tt-content');
  var ttClose    = document.getElementById('tt-close');
  var btnTT      = document.getElementById('btn-truth-table');
  var btnClear   = document.getElementById('btn-clear-all');
  var infoPanel  = document.getElementById('info-panel');
  var panelHandle = document.getElementById('panel-handle');
  var btnAddMobile = document.getElementById('btn-add-mobile');
  var mobilePalette  = document.getElementById('mobile-palette-sheet');
  var mobileBackdrop = document.getElementById('mobile-palette-backdrop');
  var mpsGrid        = document.getElementById('mps-grid');

  /* Toolbar buttons */
  var ctSelect  = document.getElementById('ct-select');
  var ctWire    = document.getElementById('ct-wire');
  var ctDelete  = document.getElementById('ct-delete');
  var ctZoomIn  = document.getElementById('ct-zoom-in');
  var ctZoomOut = document.getElementById('ct-zoom-out');
  var ctZoomFit = document.getElementById('ct-zoom-fit');
  var ctUndo    = document.getElementById('ct-undo');
  var ctRedo    = document.getElementById('ct-redo');

  /* ── Canvas sizing ── */
  var W, H;
  function resizeCanvas() {
    var wrap = document.getElementById('canvas-wrap');
    var dpr  = window.devicePixelRatio || 1;
    W = wrap.clientWidth; H = wrap.clientHeight;
    canvas.width  = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    requestDraw();
  }
  window.addEventListener('resize', function () {
    clearTimeout(resizeCanvas._t);
    resizeCanvas._t = setTimeout(resizeCanvas, 80);
  }, { passive: true });

  /* ── Circuit ── */
  var circuit = new GateEngine.Circuit();

  /* ── Viewport transform ── */
  var vp = { x: 0, y: 0, scale: 1 };
  var MIN_SCALE = 0.25, MAX_SCALE = 3;

  function worldToScreen(wx, wy) {
    return { x: wx * vp.scale + vp.x, y: wy * vp.scale + vp.y };
  }
  function screenToWorld(sx, sy) {
    return { x: (sx - vp.x) / vp.scale, y: (sy - vp.y) / vp.scale };
  }

  /* ── Interaction state ── */
  var activeTool    = 'select';  // 'select' | 'wire' | 'delete'
  var selectedGateId = null;
  var dragGate      = null;      // { gateId, offX, offY }
  var wireDrag      = null;      // { fromGate, fromPin, isOutput, curX, curY }
  var panDrag       = null;      // { startSX, startSY, startVX, startVY }
  var hoveredGateId = null;
  var hoveredWireId = null;
  var longPressTimer = null;
  var pinchStart    = null;      // { dist, scale }

  /* ── Undo / redo stack ── */
  var undoStack = [], redoStack = [];
  var MAX_UNDO  = 40;

  function saveSnapshot() {
    var snap = circuit.serialize();
    undoStack.push(snap);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(circuit.serialize());
    circuit.stopAllClocks();
    circuit.load(undoStack.pop());
    restartClocks();
    updateStats(); requestDraw();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(circuit.serialize());
    circuit.stopAllClocks();
    circuit.load(redoStack.pop());
    restartClocks();
    updateStats(); requestDraw();
  }

  /* ── Gate layout constants ── */
  var GW = 72, GH = 44;   // gate width / height
  var PIN_R = 5;           // pin hit radius
  var INPUT_W = 52, INPUT_H = 36;
  var OUTPUT_W = 52, OUTPUT_H = 36;

  /* Gate colours by type */
  var GATE_COLORS = {
    AND:    { fill:'#061a06', stroke:'#2db82d', label:'#4ee04e' },
    OR:     { fill:'#091a04', stroke:'#7ab820', label:'#a0e840' },
    NOT:    { fill:'#1a1504', stroke:'#b89020', label:'#e8c547' },
    NAND:   { fill:'#1a0e04', stroke:'#b06030', label:'#e07840' },
    NOR:    { fill:'#1a0404', stroke:'#b02020', label:'#e04040' },
    XOR:    { fill:'#041a1a', stroke:'#2098b0', label:'#40c8e0' },
    XNOR:   { fill:'#100418', stroke:'#8020b0', label:'#c040e0' },
    BUFFER: { fill:'#061a06', stroke:'#2db82d', label:'#4ee04e' },
    INPUT:  { fill:'#061806', stroke:'#2db82d', label:'#4ee04e' },
    CLOCK:  { fill:'#04121a', stroke:'#2098b0', label:'#40c8e0' },
    OUTPUT: { fill:'#1a0606', stroke:'#b02020', label:'#e04040' },
    LED:    { fill:'#1a1404', stroke:'#b08820', label:'#e8c547' }
  };

  /* ── Pin layout helpers ── */
  function getGateRect(gate) {
    var isSrc = gate.type === 'INPUT' || gate.type === 'CLOCK';
    var isDst = gate.type === 'OUTPUT' || gate.type === 'LED';
    var w = isSrc ? INPUT_W : isDst ? OUTPUT_W : GW;
    var h = isSrc ? INPUT_H : isDst ? OUTPUT_H : GH;
    return { x: gate.x, y: gate.y, w: w, h: h };
  }

  function getInputPins(gate) {
    var def   = GateEngine.GATE_DEFS[gate.type];
    var n     = def ? def.inputs : 0;
    var r     = getGateRect(gate);
    var pins  = [];
    for (var i = 0; i < n; i++) {
      var frac = (i + 1) / (n + 1);
      pins.push({ x: r.x, y: r.y + frac * r.h, pin: i });
    }
    return pins;
  }

  function getOutputPin(gate) {
    var r = getGateRect(gate);
    return { x: r.x + r.w, y: r.y + r.h / 2, pin: 0 };
  }

  /* ── Hit testing ── */
  function gateAtScreen(sx, sy) {
    var w = screenToWorld(sx, sy);
    // Iterate in reverse (top-drawn last)
    for (var i = circuit.gates.length - 1; i >= 0; i--) {
      var g = circuit.gates[i];
      var r = getGateRect(g);
      if (w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.h) return g.id;
    }
    return null;
  }

  function pinAtScreen(sx, sy) {
    var w   = screenToWorld(sx, sy);
    var rad = (IS_TOUCH ? PIN_R * 2.5 : PIN_R * 1.8) / vp.scale;
    for (var i = 0; i < circuit.gates.length; i++) {
      var g = circuit.gates[i];
      // Output pin
      var op = getOutputPin(g);
      if (dist(w.x, w.y, op.x, op.y) <= rad) return { gateId: g.id, pin: 0, isOutput: true };
      // Input pins
      var ips = getInputPins(g);
      for (var j = 0; j < ips.length; j++) {
        if (dist(w.x, w.y, ips[j].x, ips[j].y) <= rad) return { gateId: g.id, pin: j, isOutput: false };
      }
    }
    return null;
  }

  function wireAtScreen(sx, sy) {
    var w   = screenToWorld(sx, sy);
    var tol = (IS_TOUCH ? 12 : 7) / vp.scale;
    for (var i = 0; i < circuit.wires.length; i++) {
      var wire = circuit.wires[i];
      var from = getOutputPin(circuit.gateById(wire.fromGate));
      var to   = getInputPins(circuit.gateById(wire.toGate))[wire.toPin];
      if (!from || !to) continue;
      var pts  = wirePoints(from, to);
      for (var j = 0; j < pts.length - 1; j++) {
        if (ptSegDist(w.x, w.y, pts[j].x, pts[j].y, pts[j+1].x, pts[j+1].y) <= tol) return wire.id;
      }
    }
    return null;
  }

  function dist(x1, y1, x2, y2) {
    return Math.sqrt((x2-x1)*(x2-x1) + (y2-y1)*(y2-y1));
  }
  function ptSegDist(px, py, ax, ay, bx, by) {
    var dx = bx-ax, dy = by-ay, t = ((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy+1e-9);
    t = Math.max(0, Math.min(1, t));
    return dist(px, py, ax+t*dx, ay+t*dy);
  }

  /* ── Wire routing (orthogonal S-curve) ── */
  function wirePoints(from, to) {
    var mx = (from.x + to.x) / 2;
    return [
      { x: from.x, y: from.y },
      { x: mx,     y: from.y },
      { x: mx,     y: to.y   },
      { x: to.x,   y: to.y   }
    ];
  }

  /* ── Zoom helpers ── */
  function zoomAt(sx, sy, factor) {
    var newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, vp.scale * factor));
    var ratio    = newScale / vp.scale;
    vp.x = sx - ratio * (sx - vp.x);
    vp.y = sy - ratio * (sy - vp.y);
    vp.scale = newScale;
    requestDraw();
  }

  function fitToScreen() {
    if (!circuit.gates.length) { vp = { x: 0, y: 0, scale: 1 }; requestDraw(); return; }
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    circuit.gates.forEach(function (g) {
      var r = getGateRect(g);
      minX = Math.min(minX, r.x);         minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);   maxY = Math.max(maxY, r.y + r.h);
    });
    var pad = 60;
    var scaleX = (W - pad*2) / (maxX - minX || 1);
    var scaleY = (H - pad*2) / (maxY - minY || 1);
    vp.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(scaleX, scaleY)));
    vp.x = W/2 - ((minX + maxX)/2) * vp.scale;
    vp.y = H/2 - ((minY + maxY)/2) * vp.scale;
    requestDraw();
  }

  /* ── Drawing ── */
  var drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; draw(); });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    /* Grid */
    drawGrid();

    ctx.save();
    ctx.translate(vp.x, vp.y);
    ctx.scale(vp.scale, vp.scale);

    /* Wires */
    circuit.wires.forEach(function (wire) {
      drawWire(wire);
    });

    /* Draft wire */
    if (wireDrag) {
      var fromGate = circuit.gateById(wireDrag.fromGate);
      if (fromGate) {
        var fromPt = wireDrag.isOutput
          ? getOutputPin(fromGate)
          : getInputPins(fromGate)[wireDrag.fromPin];
        if (fromPt) {
          var toPt = screenToWorld(wireDrag.curX, wireDrag.curY);
          var pts  = wirePoints(
            wireDrag.isOutput ? fromPt : toPt,
            wireDrag.isOutput ? toPt   : fromPt
          );
          ctx.save();
          ctx.strokeStyle = '#2db82d';
          ctx.lineWidth   = 2 / vp.scale;
          ctx.setLineDash([6 / vp.scale, 4 / vp.scale]);
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      }
    }

    /* Gates */
    circuit.gates.forEach(function (gate) {
      drawGate(gate);
    });

    ctx.restore();
  }

  /* ── Grid ── */
  function drawGrid() {
    var gridSize = 20 * vp.scale;
    if (gridSize < 6) return;
    var offX = ((vp.x % gridSize) + gridSize) % gridSize;
    var offY = ((vp.y % gridSize) + gridSize) % gridSize;
    ctx.fillStyle = '#0d1a0d';
    for (var gx = offX; gx < W; gx += gridSize) {
      for (var gy = offY; gy < H; gy += gridSize) {
        ctx.fillRect(gx, gy, 1, 1);
      }
    }
  }

  /* ── Draw a gate ── */
  function drawGate(gate) {
    var r    = getGateRect(gate);
    var cols = GATE_COLORS[gate.type] || GATE_COLORS.AND;
    var isSelected = selectedGateId === gate.id;
    var isHovered  = hoveredGateId  === gate.id;
    var isHigh     = gate.state === 1;
    var lw = 1.5 / vp.scale;

    /* Outer glow for selected or high-state output */
    if (isSelected || (isHigh && (gate.type === 'OUTPUT' || gate.type === 'LED'))) {
      ctx.save();
      ctx.shadowColor = isSelected ? '#4ee04e' : cols.stroke;
      ctx.shadowBlur  = 14 / vp.scale;
      ctx.strokeStyle = isSelected ? '#4ee04e' : cols.stroke;
      ctx.lineWidth   = 2 / vp.scale;
      ctx.strokeRect(r.x - 2/vp.scale, r.y - 2/vp.scale, r.w + 4/vp.scale, r.h + 4/vp.scale);
      ctx.restore();
    }

    /* Body */
    ctx.fillStyle   = cols.fill;
    ctx.strokeStyle = isSelected ? '#4ee04e' : isHovered ? '#3acc3a' : cols.stroke;
    ctx.lineWidth   = lw;
    roundRect(ctx, r.x, r.y, r.w, r.h, 4 / vp.scale);
    ctx.fill();
    ctx.stroke();

    /* Gate label */
    var fs = Math.max(8, Math.min(13, 13 / vp.scale));
    ctx.font      = 'bold ' + fs + 'px Share Tech Mono, monospace';
    ctx.fillStyle = isHigh ? cols.label : cols.stroke;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(gate.type === 'BUFFER' ? 'BUF' : gate.label, r.x + r.w/2, r.y + r.h/2);

    /* INPUT toggle state */
    if (gate.type === 'INPUT' || gate.type === 'CLOCK') {
      var stateFs = Math.max(6, 9 / vp.scale);
      ctx.font      = 'bold ' + stateFs + 'px Share Tech Mono, monospace';
      ctx.fillStyle = isHigh ? '#4ee04e' : '#1a6b1a';
      ctx.fillText(String(gate.state), r.x + r.w/2, r.y + r.h * 0.78);

      /* Clock wave indicator */
      if (gate.type === 'CLOCK') {
        ctx.strokeStyle = '#40c8e0'; ctx.lineWidth = 1 / vp.scale;
        var wx = r.x + 4/vp.scale, wy = r.y + r.h * 0.25, ww = r.w - 8/vp.scale, wh = r.h * 0.25;
        ctx.beginPath();
        ctx.moveTo(wx, wy + wh);
        ctx.lineTo(wx + ww*0.25, wy + wh);
        ctx.lineTo(wx + ww*0.25, wy);
        ctx.lineTo(wx + ww*0.5,  wy);
        ctx.lineTo(wx + ww*0.5,  wy + wh);
        ctx.lineTo(wx + ww*0.75, wy + wh);
        ctx.lineTo(wx + ww*0.75, wy);
        ctx.lineTo(wx + ww,      wy);
        ctx.stroke();
      }
    }

    /* LED bulb */
    if (gate.type === 'LED') {
      ctx.beginPath();
      ctx.arc(r.x + r.w/2, r.y + r.h * 0.3, 5 / vp.scale, 0, Math.PI * 2);
      ctx.fillStyle = isHigh ? '#e8c547' : '#3a2a04';
      if (isHigh) { ctx.shadowColor = '#e8c547'; ctx.shadowBlur = 10/vp.scale; }
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    /* Input pins */
    getInputPins(gate).forEach(function (pin) {
      var wire = circuit.wires.find(function (w) { return w.toGate === gate.id && w.toPin === pin.pin; });
      var sig  = wire ? wire.signal : 0;
      drawPin(pin.x, pin.y, sig, false);
      /* Short stub line */
      ctx.strokeStyle = sig ? '#2db82d' : '#1a4a1a';
      ctx.lineWidth   = 1.5 / vp.scale;
      ctx.beginPath(); ctx.moveTo(pin.x, pin.y); ctx.lineTo(pin.x + 8/vp.scale, pin.y); ctx.stroke();
    });

    /* Output pin */
    if (gate.type !== 'OUTPUT' && gate.type !== 'LED') {
      var op = getOutputPin(gate);
      drawPin(op.x, op.y, gate.state, true);
      ctx.strokeStyle = gate.state ? '#2db82d' : '#1a4a1a';
      ctx.lineWidth   = 1.5 / vp.scale;
      ctx.beginPath(); ctx.moveTo(op.x - 8/vp.scale, op.y); ctx.lineTo(op.x, op.y); ctx.stroke();
    }
  }

  function drawPin(x, y, signal, isOutput) {
    var r = PIN_R / vp.scale;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle   = signal ? '#2db82d' : '#0a2a0a';
    ctx.strokeStyle = signal ? '#4ee04e' : '#1a5a1a';
    ctx.lineWidth   = 1 / vp.scale;
    ctx.fill(); ctx.stroke();
  }

  /* ── Draw a wire ── */
  function drawWire(wire) {
    var fromGate = circuit.gateById(wire.fromGate);
    var toGate   = circuit.gateById(wire.toGate);
    if (!fromGate || !toGate) return;
    var from = getOutputPin(fromGate);
    var to   = getInputPins(toGate)[wire.toPin];
    if (!from || !to) return;

    var isHigh    = wire.signal === 1;
    var isHovered = hoveredWireId === wire.id;
    var pts       = wirePoints(from, to);

    ctx.save();
    if (isHigh) { ctx.shadowColor = '#2db82d'; ctx.shadowBlur = 6 / vp.scale; }
    ctx.strokeStyle = isHovered ? '#7dd87d' : isHigh ? '#4ee04e' : '#1a5a1a';
    ctx.lineWidth   = (isHovered ? 2.5 : isHigh ? 2 : 1.5) / vp.scale;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();
  }

  /* ── Rounded rect helper ── */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);     ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x + r, y + h);     ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y + r);         ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
  }

  /* ── Place gate ── */
  function placeGate(type, worldX, worldY) {
    saveSnapshot();
    var gate = circuit.addGate(type, worldX, worldY);
    if (!gate) return;
    if (gate.type === 'CLOCK') {
      circuit.startClock(gate.id, function () { requestDraw(); });
    }
    circuit.propagate();
    updateStats(); requestDraw();
    return gate;
  }

  /* ── Restart clocks after load ── */
  function restartClocks() {
    circuit.gates.forEach(function (g) {
      if (g.type === 'CLOCK') circuit.startClock(g.id, function () { requestDraw(); });
    });
  }

  /* ── Stats ── */
  function updateStats() {
    var gates   = circuit.gates.filter(function (g) { return g.type !== 'INPUT' && g.type !== 'OUTPUT' && g.type !== 'CLOCK' && g.type !== 'LED'; });
    var inputs  = circuit.gates.filter(function (g) { return g.type === 'INPUT' || g.type === 'CLOCK'; });
    var outputs = circuit.gates.filter(function (g) { return g.type === 'OUTPUT' || g.type === 'LED'; });
    stGates.textContent   = gates.length;
    stWires.textContent   = circuit.wires.length;
    stInputs.textContent  = inputs.length;
    stOutputs.textContent = outputs.length;
  }

  /* ── Select gate ── */
  function selectGate(id) {
    selectedGateId = id;
    if (!id) {
      selectedInfo.classList.remove('hidden');
      gateDetail.classList.add('hidden');
      return;
    }
    var gate = circuit.gateById(id);
    if (!gate) return;
    var def  = GateEngine.GATE_DEFS[gate.type];
    if (!def) return;
    selectedInfo.classList.add('hidden');
    gateDetail.classList.remove('hidden');
    gdName.textContent   = def.label + ' Gate';
    gdSymbol.textContent = def.symbol;
    gdExpr.textContent   = def.expr;
    gdDesc.textContent   = def.desc;
    /* Build truth table */
    gdTable.innerHTML = '';
    if (def.truthTable) {
      var n = def.inputs;
      var hdRow = document.createElement('tr');
      for (var i = 0; i < n; i++) {
        var th = document.createElement('th');
        th.textContent = String.fromCharCode(65 + i);
        hdRow.appendChild(th);
      }
      var thQ = document.createElement('th'); thQ.textContent = 'Q'; hdRow.appendChild(thQ);
      gdTable.appendChild(hdRow);
      def.truthTable.forEach(function (row) {
        var tr = document.createElement('tr');
        for (var i = 0; i < n; i++) {
          var td = document.createElement('td');
          td.textContent = row[i]; td.className = row[i] ? 'v1' : 'v0';
          tr.appendChild(td);
        }
        var tdQ = document.createElement('td');
        tdQ.textContent = row[n]; tdQ.className = row[n] ? 'v1' : 'v0';
        tr.appendChild(tdQ);
        gdTable.appendChild(tr);
      });
    }
    if (IS_MOBILE) openInfoPanel();
    requestDraw();
  }

  /* ── Tool switching ── */
  function setTool(tool) {
    activeTool = tool;
    wireDrag   = null;
    [ctSelect, ctWire, ctDelete].forEach(function (b) { b && b.classList.remove('active'); });
    var map = { select: ctSelect, wire: ctWire, delete: ctDelete };
    if (map[tool]) map[tool].classList.add('active');
    modeLabel.textContent = tool.toUpperCase();
    canvas.style.cursor = tool === 'delete' ? 'crosshair' : tool === 'wire' ? 'crosshair' : 'default';
  }

  /* ── Pointer event unification ── */
  function evPos(e) {
    var rect = canvas.getBoundingClientRect();
    var src  = e.touches ? e.touches[0] : e.changedTouches ? e.changedTouches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }
  function evPosEnd(e) {
    var rect = canvas.getBoundingClientRect();
    var src  = e.changedTouches ? e.changedTouches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  /* ── Pointer down ── */
  function pointerDown(pos, isLong) {
    var pinHit  = activeTool !== 'delete' ? pinAtScreen(pos.x, pos.y) : null;
    var gateHit = gateAtScreen(pos.x, pos.y);
    var wireHit = (!gateHit && !pinHit) ? wireAtScreen(pos.x, pos.y) : null;

    if (activeTool === 'delete') {
      if (gateHit) {
        saveSnapshot();
        circuit.removeGate(gateHit);
        if (selectedGateId === gateHit) selectGate(null);
        updateStats(); requestDraw();
      } else if (wireHit) {
        saveSnapshot();
        circuit.removeWire(wireHit);
        updateStats(); requestDraw();
      }
      return;
    }

    if (activeTool === 'wire') {
      if (pinHit) {
        wireDrag = { fromGate: pinHit.gateId, fromPin: pinHit.pin, isOutput: pinHit.isOutput, curX: pos.x, curY: pos.y };
      }
      return;
    }

    /* Select mode */
    if (gateHit) {
      /* Long-press on INPUT = set label (skip for now, just select) */
      if (isLong && circuit.gateById(gateHit).type === 'INPUT') {
        /* Toggle on long press as well */
        saveSnapshot();
        circuit.toggleInput(gateHit);
        circuit.propagate();
        requestDraw(); return;
      }
      selectGate(gateHit);
      var g = circuit.gateById(gateHit);
      var w = screenToWorld(pos.x, pos.y);
      dragGate = { gateId: gateHit, offX: w.x - g.x, offY: w.y - g.y, moved: false };
    } else if (wireHit) {
      hoveredWireId = wireHit;
      requestDraw();
    } else {
      /* Pan */
      selectGate(null);
      panDrag = { startSX: pos.x, startSY: pos.y, startVX: vp.x, startVY: vp.y };
      hoveredWireId = null;
    }
  }

  /* ── Pointer move ── */
  function pointerMove(pos) {
    if (wireDrag) {
      wireDrag.curX = pos.x; wireDrag.curY = pos.y;
      requestDraw(); return;
    }
    if (dragGate) {
      var w = screenToWorld(pos.x, pos.y);
      var g = circuit.gateById(dragGate.gateId);
      if (g) {
        g.x = Math.round((w.x - dragGate.offX) / 10) * 10;
        g.y = Math.round((w.y - dragGate.offY) / 10) * 10;
        dragGate.moved = true;
        circuit.propagate(); requestDraw();
      }
      return;
    }
    if (panDrag) {
      vp.x = panDrag.startVX + (pos.x - panDrag.startSX);
      vp.y = panDrag.startVY + (pos.y - panDrag.startSY);
      requestDraw(); return;
    }
    /* Hover */
    var newGHover = gateAtScreen(pos.x, pos.y);
    var newWHover = newGHover ? null : wireAtScreen(pos.x, pos.y);
    if (newGHover !== hoveredGateId || newWHover !== hoveredWireId) {
      hoveredGateId = newGHover; hoveredWireId = newWHover;
      canvas.style.cursor = newGHover
        ? (activeTool === 'delete' ? 'crosshair' : activeTool === 'wire' ? 'crosshair' : 'grab')
        : newWHover
          ? (activeTool === 'delete' ? 'crosshair' : 'pointer')
          : 'default';
      requestDraw();
    }
  }

  /* ── Pointer up ── */
  function pointerUp(pos) {
    if (wireDrag) {
      var endPin = pinAtScreen(pos.x, pos.y);
      if (endPin && endPin.gateId !== wireDrag.fromGate) {
        var from = wireDrag.isOutput ? wireDrag : endPin;
        var to   = wireDrag.isOutput ? endPin   : wireDrag;
        if (from.isOutput && !to.isOutput) {
          saveSnapshot();
          circuit.addWire(from.fromGate || from.gateId, from.fromPin || from.pin,
                          to.gateId,    to.pin);
          updateStats();
        } else if (!from.isOutput && to.isOutput) {
          saveSnapshot();
          circuit.addWire(to.gateId, to.pin, from.fromGate || from.gateId, from.fromPin || from.pin);
          updateStats();
        }
      }
      wireDrag = null; requestDraw(); return;
    }

    if (dragGate) {
      if (!dragGate.moved) {
        /* Tap on gate without moving = toggle INPUT or select */
        var g = circuit.gateById(dragGate.gateId);
        if (g && g.type === 'INPUT') {
          saveSnapshot();
          circuit.toggleInput(dragGate.gateId);
          circuit.propagate(); requestDraw();
        }
      } else {
        saveSnapshot();
      }
      dragGate = null; return;
    }

    panDrag = null;
  }

  /* ── Mouse events ── */
  canvas.addEventListener('mousemove', function (e) { pointerMove(evPos(e)); });
  canvas.addEventListener('mousedown', function (e) {
    if (e.button === 1) { e.preventDefault(); return; } // middle click = pan already handled
    pointerDown(evPos(e), false);
  });
  canvas.addEventListener('mouseup',   function (e) { pointerUp(evPosEnd(e)); });
  canvas.addEventListener('mouseleave',function ()  { hoveredGateId = null; hoveredWireId = null; dragGate = null; panDrag = null; requestDraw(); });

  /* Scroll to zoom */
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    var pos = evPos(e);
    zoomAt(pos.x, pos.y, factor);
  }, { passive: false });

  /* Double-click to toggle input quickly */
  canvas.addEventListener('dblclick', function (e) {
    var hit = gateAtScreen(evPos(e).x, evPos(e).y);
    if (hit && circuit.gateById(hit).type === 'INPUT') {
      saveSnapshot();
      circuit.toggleInput(hit);
      circuit.propagate(); requestDraw();
    }
  });

  /* ── Touch events ── */
  var touchStartPos = null, touchMoved = false, touchStartTime = 0;

  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    if (e.touches.length === 2) {
      // Pinch-to-zoom
      panDrag = null; dragGate = null; wireDrag = null;
      var d = touchDist(e.touches[0], e.touches[1]);
      pinchStart = { dist: d, scale: vp.scale,
                     cx: (e.touches[0].clientX + e.touches[1].clientX) / 2 - canvas.getBoundingClientRect().left,
                     cy: (e.touches[0].clientY + e.touches[1].clientY) / 2 - canvas.getBoundingClientRect().top };
      return;
    }
    if (e.touches.length > 1) return;
    pinchStart = null;
    touchStartPos  = evPos(e);
    touchMoved     = false;
    touchStartTime = Date.now();

    longPressTimer = setTimeout(function () {
      if (!touchMoved) {
        pointerDown(touchStartPos, true);
        if (navigator.vibrate) navigator.vibrate(40);
      }
    }, 500);

    pointerDown(touchStartPos, false);
  }, { passive: false });

  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    if (e.touches.length === 2 && pinchStart) {
      var d      = touchDist(e.touches[0], e.touches[1]);
      var factor = d / pinchStart.dist;
      var newS   = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchStart.scale * factor));
      vp.x = pinchStart.cx - (pinchStart.cx - vp.x) * newS / vp.scale;
      vp.y = pinchStart.cy - (pinchStart.cy - vp.y) * newS / vp.scale;
      vp.scale = newS;
      requestDraw(); return;
    }
    if (e.touches.length > 1) return;
    var pos = evPos(e);
    if (touchStartPos && dist(pos.x, pos.y, touchStartPos.x, touchStartPos.y) > 5) {
      touchMoved = true;
      clearTimeout(longPressTimer);
    }
    pointerMove(pos);
  }, { passive: false });

  canvas.addEventListener('touchend', function (e) {
    e.preventDefault();
    clearTimeout(longPressTimer);
    pinchStart = null;
    var pos = evPosEnd(e);
    pointerUp(pos);
    touchStartPos = null;
  }, { passive: false });

  canvas.addEventListener('touchcancel', function () {
    clearTimeout(longPressTimer);
    dragGate = null; wireDrag = null; panDrag = null; pinchStart = null;
    requestDraw();
  }, { passive: true });

  function touchDist(t1, t2) {
    return Math.sqrt(Math.pow(t1.clientX - t2.clientX, 2) + Math.pow(t1.clientY - t2.clientY, 2));
  }

  /* ── Drag-from-palette (desktop) ── */
  document.querySelectorAll('.palette-item').forEach(function (item) {
    item.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('gateType', item.getAttribute('data-type'));
    });
  });

  canvas.addEventListener('dragover', function (e) { e.preventDefault(); });
  canvas.addEventListener('drop', function (e) {
    e.preventDefault();
    var type = e.dataTransfer.getData('gateType');
    if (!type) return;
    var pos  = evPos(e);
    var w    = screenToWorld(pos.x, pos.y);
    placeGate(type, w.x - GW/2, w.y - GH/2);
  });

  /* ── Mobile palette ── */
  function buildMobilePalette() {
    mpsGrid.innerHTML = '';
    var types = ['INPUT','CLOCK','AND','OR','NOT','NAND','NOR','XOR','XNOR','BUFFER','OUTPUT','LED'];
    types.forEach(function (type) {
      var def  = GateEngine.GATE_DEFS[type];
      var item = document.createElement('div');
      item.className = 'mps-item';
      item.innerHTML = '<span class="mps-icon">' + (def ? def.label : type) + '</span>' +
                       '<span class="mps-label">' + (def ? def.label : type) + '</span>';
      item.addEventListener('click', function () {
        closeMobilePalette();
        var cx = W / 2, cy = H / 2;
        var w  = screenToWorld(cx, cy);
        placeGate(type, w.x - GW/2 + (Math.random()-0.5)*60, w.y - GH/2 + (Math.random()-0.5)*60);
      });
      mpsGrid.appendChild(item);
    });
  }

  function openMobilePalette() {
    mobilePalette.classList.remove('hidden');
    mobileBackdrop.classList.remove('hidden');
    requestAnimationFrame(function () { mobilePalette.classList.add('open'); });
  }
  function closeMobilePalette() {
    mobilePalette.classList.remove('open');
    setTimeout(function () {
      mobilePalette.classList.add('hidden');
      mobileBackdrop.classList.add('hidden');
    }, 300);
  }

  if (btnAddMobile) btnAddMobile.addEventListener('click', openMobilePalette);
  if (mobileBackdrop) mobileBackdrop.addEventListener('click', closeMobilePalette);

  /* Preset buttons */
  document.querySelectorAll('.preset-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-preset');
      var preset = GateEngine.PRESETS[key];
      if (!preset) return;
      saveSnapshot();
      circuit.stopAllClocks();
      circuit.load(JSON.parse(JSON.stringify(preset)));
      restartClocks();
      selectGate(null);
      updateStats();
      setTimeout(fitToScreen, 50);
    });
  });

  /* ── Toolbar button wiring ── */
  ctSelect && ctSelect.addEventListener('click', function () { setTool('select'); });
  ctWire   && ctWire.addEventListener(  'click', function () { setTool('wire');   });
  ctDelete && ctDelete.addEventListener('click', function () { setTool('delete'); });
  ctZoomIn  && ctZoomIn.addEventListener( 'click', function () { zoomAt(W/2, H/2, 1.25); });
  ctZoomOut && ctZoomOut.addEventListener('click', function () { zoomAt(W/2, H/2, 0.8);  });
  ctZoomFit && ctZoomFit.addEventListener('click', fitToScreen);
  ctUndo    && ctUndo.addEventListener(  'click', undo);
  ctRedo    && ctRedo.addEventListener(  'click', redo);

  btnTT && btnTT.addEventListener('click', function () {
    var tt = circuit.buildTruthTable();
    ttContent.innerHTML = '';
    if (!tt) {
      ttContent.innerHTML = '<p style="color:#5a8a5a;font-family:var(--mono);font-size:0.72rem;padding:8px">Add at least one <strong style="color:#4ee04e">Input</strong> and one <strong style="color:#e04040">Output</strong> to generate a truth table.</p>';
    } else {
      var table = document.createElement('table');
      var hdRow = document.createElement('tr');
      tt.inputLabels.forEach(function (l) { var th = document.createElement('th'); th.textContent = l; hdRow.appendChild(th); });
      tt.outputLabels.forEach(function (l) { var th = document.createElement('th'); th.textContent = l; hdRow.appendChild(th); });
      table.appendChild(hdRow);
      tt.rows.forEach(function (row) {
        var tr = document.createElement('tr');
        row.inputs.forEach(function (v)  { var td = document.createElement('td'); td.textContent = v; td.className = v ? 'val-1':'val-0'; tr.appendChild(td); });
        row.outputs.forEach(function (v) { var td = document.createElement('td'); td.textContent = v; td.className = v ? 'val-1':'val-0'; tr.appendChild(td); });
        table.appendChild(tr);
      });
      ttContent.appendChild(table);
    }
    ttPanel.classList.remove('hidden');
  });

  ttClose && ttClose.addEventListener('click', function () { ttPanel.classList.add('hidden'); });
  btnClear && btnClear.addEventListener('click', function () {
    if (confirm('Clear the entire circuit?')) {
      saveSnapshot();
      circuit.stopAllClocks();
      circuit.gates = []; circuit.wires = [];
      selectGate(null); updateStats(); requestDraw();
    }
  });

  /* ── Info panel (mobile sheet) ── */
  var panelOpen = false;
  function openInfoPanel()  { infoPanel.classList.add('open'); panelOpen = true; }
  function closeInfoPanel() { infoPanel.classList.remove('open'); panelOpen = false; }

  var sheetDY = null, sheetWasOpen = false;
  if (panelHandle) {
    panelHandle.addEventListener('touchstart', function (e) {
      sheetDY = e.touches[0].clientY; sheetWasOpen = panelOpen;
    }, { passive: true });
    panelHandle.addEventListener('touchmove', function (e) {
      if (sheetDY === null) return;
      var dy = e.touches[0].clientY - sheetDY;
      if (dy > 40 && sheetWasOpen)   closeInfoPanel();
      if (dy < -40 && !sheetWasOpen) openInfoPanel();
    }, { passive: true });
    panelHandle.addEventListener('touchend', function () { sheetDY = null; }, { passive: true });
    panelHandle.addEventListener('click', function () { if (panelOpen) closeInfoPanel(); else openInfoPanel(); });
  }

  /* ── Keyboard shortcuts ── */
  document.addEventListener('keydown', function (e) {
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); undo(); return; }
      if (e.key === 'y') { e.preventDefault(); redo(); return; }
    }
    switch (e.key) {
      case 'v': case 'V': setTool('select'); break;
      case 'w': case 'W': setTool('wire');   break;
      case 'd': case 'D': setTool('delete'); break;
      case 'Delete': case 'Backspace':
        if (selectedGateId) {
          saveSnapshot();
          circuit.removeGate(selectedGateId);
          selectGate(null); updateStats(); requestDraw();
        }
        break;
      case '+': case '=': zoomAt(W/2, H/2, 1.2); break;
      case '-': zoomAt(W/2, H/2, 0.83); break;
      case 'f': case 'F': fitToScreen(); break;
      case 'Escape': wireDrag = null; dragGate = null; requestDraw(); break;
    }
  });

  /* ── Boot ── */
  buildMobilePalette();
  resizeCanvas();
  setTool('select');
  updateStats();

  /* Load the half-adder preset on first open as a demo */
  if (!localStorage.getItem('gatevis_circuit')) {
    circuit.stopAllClocks();
    circuit.load(JSON.parse(JSON.stringify(GateEngine.PRESETS['half-adder'])));
    restartClocks();
    updateStats();
    setTimeout(function () { fitToScreen(); requestDraw(); }, 100);
  }

})();