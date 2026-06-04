/* engine.js — Logic gate definitions, circuit model, signal propagation */
(function (global) {
  'use strict';

  /* ── Gate type definitions ── */
  var GATE_DEFS = {
    AND:    { label: 'AND',    inputs: 2, symbol: '&',   color: '#4ee04e', expr: 'Q = A · B',   desc: 'Output is HIGH only when ALL inputs are HIGH. Used in address decoding and enable circuits.',          truthTable: [[0,0,0],[0,1,0],[1,0,0],[1,1,1]] },
    OR:     { label: 'OR',     inputs: 2, symbol: '≥1',  color: '#a0e840', expr: 'Q = A + B',   desc: 'Output is HIGH when ANY input is HIGH. Used in flag combiners and fallback logic.',                    truthTable: [[0,0,0],[0,1,1],[1,0,1],[1,1,1]] },
    NOT:    { label: 'NOT',    inputs: 1, symbol: '1',   color: '#e8c547', expr: 'Q = Ā',       desc: 'Inverts the input signal. The fundamental building block — every logic family needs it.',            truthTable: [[0,1],[1,0]] },
    NAND:   { label: 'NAND',   inputs: 2, symbol: '&̄',  color: '#e07840', expr: 'Q = A · B̄',  desc: 'NOT-AND. Universal gate — any Boolean function can be built from NANDs alone. Cheap to fabricate.',    truthTable: [[0,0,1],[0,1,1],[1,0,1],[1,1,0]] },
    NOR:    { label: 'NOR',    inputs: 2, symbol: '≥1̄', color: '#e04040', expr: 'Q = A + B̄',  desc: 'NOT-OR. Also a universal gate. Used in set-reset latches (the SR NOR latch).',                         truthTable: [[0,0,1],[0,1,0],[1,0,0],[1,1,0]] },
    XOR:    { label: 'XOR',    inputs: 2, symbol: '=1',  color: '#40c8e0', expr: 'Q = A ⊕ B',   desc: 'Output is HIGH when inputs DIFFER. Core of adder circuits and parity generators.',                     truthTable: [[0,0,0],[0,1,1],[1,0,1],[1,1,0]] },
    XNOR:   { label: 'XNOR',   inputs: 2, symbol: '=',   color: '#c040e0', expr: 'Q = A ⊕ B̄',  desc: 'Output is HIGH when inputs are EQUAL. Used in equality comparators.',                                  truthTable: [[0,0,1],[0,1,0],[1,0,0],[1,1,1]] },
    BUFFER: { label: 'BUFFER', inputs: 1, symbol: '1',   color: '#4ee04e', expr: 'Q = A',       desc: 'Passes signal through unchanged. Used for signal buffering, fan-out driving, and timing delay.',       truthTable: [[0,0],[1,1]] },
    INPUT:  { label: 'INPUT',  inputs: 0, symbol: 'SW',  color: '#4ee04e', expr: '—',           desc: 'Manual toggle switch. Click to flip between 0 and 1.',                                                   truthTable: null },
    CLOCK:  { label: 'CLOCK',  inputs: 0, symbol: 'CLK', color: '#40c8e0', expr: '—',           desc: 'Oscillating input that automatically toggles between 0 and 1 at a set frequency.',                      truthTable: null },
    OUTPUT: { label: 'OUTPUT', inputs: 1, symbol: 'Q',   color: '#e04040', expr: '—',           desc: 'Displays the signal value at this point in the circuit.',                                                truthTable: null },
    LED:    { label: 'LED',    inputs: 1, symbol: '💡',  color: '#e8c547', expr: '—',           desc: 'LED indicator — glows when input is HIGH.',                                                              truthTable: null }
  };

  /* ── Evaluate a single gate ── */
  function evaluate(type, inputs) {
    var a = inputs[0], b = inputs[1];
    var ha = a === 1, hb = b === 1;
    switch (type) {
      case 'AND':    return (ha && hb) ? 1 : 0;
      case 'OR':     return (ha || hb) ? 1 : 0;
      case 'NOT':    return ha ? 0 : 1;
      case 'NAND':   return (ha && hb) ? 0 : 1;
      case 'NOR':    return (ha || hb) ? 0 : 1;
      case 'XOR':    return (ha !== hb) ? 1 : 0;
      case 'XNOR':   return (ha === hb) ? 1 : 0;
      case 'BUFFER': return ha ? 1 : 0;
      case 'INPUT':  return a !== undefined ? a : 0;
      case 'CLOCK':  return a !== undefined ? a : 0;
      case 'OUTPUT': return ha ? 1 : 0;
      case 'LED':    return ha ? 1 : 0;
      default:       return 0;
    }
  }

  /* ── Circuit model ── */
  function Circuit() {
    this.gates = [];    // { id, type, x, y, label, state, inputPins, outputPins, extraData }
    this.wires = [];    // { id, fromGate, fromPin, toGate, toPin, signal }
    this._nextId = 1;
    this._clockIntervals = {};
  }

  Circuit.prototype.addGate = function (type, x, y) {
    var def = GATE_DEFS[type];
    if (!def) return null;
    var id = 'g' + (this._nextId++);
    var gate = {
      id: id, type: type, x: x, y: y,
      label: def.label,
      state: 0,
      inputPins:  [],  // filled by layout in app.js (canvas coords)
      outputPins: [],
      extraData: { clockHz: 1, clockState: 0 }
    };
    if (type === 'INPUT' || type === 'CLOCK') gate.state = 0;
    this.gates.push(gate);
    return gate;
  };

  Circuit.prototype.removeGate = function (id) {
    this.gates = this.gates.filter(function (g) { return g.id !== id; });
    this.wires = this.wires.filter(function (w) { return w.fromGate !== id && w.toGate !== id; });
    if (this._clockIntervals[id]) {
      clearInterval(this._clockIntervals[id]);
      delete this._clockIntervals[id];
    }
  };

  Circuit.prototype.addWire = function (fromGate, fromPin, toGate, toPin) {
    // Remove any existing wire going into that input pin
    this.wires = this.wires.filter(function (w) {
      return !(w.toGate === toGate && w.toPin === toPin);
    });
    var id = 'w' + (this._nextId++);
    var wire = { id: id, fromGate: fromGate, fromPin: fromPin, toGate: toGate, toPin: toPin, signal: 0 };
    this.wires.push(wire);
    this.propagate();
    return wire;
  };

  Circuit.prototype.removeWire = function (id) {
    this.wires = this.wires.filter(function (w) { return w.id !== id; });
    this.propagate();
  };

  Circuit.prototype.toggleInput = function (id) {
    var gate = this.gateById(id);
    if (!gate) return;
    if (gate.type === 'INPUT') {
      gate.state = gate.state === 1 ? 0 : 1;
      this.propagate();
    }
  };

  Circuit.prototype.startClock = function (id, onChange) {
    var self = this;
    var gate  = this.gateById(id);
    if (!gate || gate.type !== 'CLOCK') return;
    if (this._clockIntervals[id]) clearInterval(this._clockIntervals[id]);
    var hz = gate.extraData.clockHz || 1;
    this._clockIntervals[id] = setInterval(function () {
      var g = self.gateById(id);
      if (!g) { clearInterval(self._clockIntervals[id]); return; }
      g.state = g.state === 1 ? 0 : 1;
      self.propagate();
      if (onChange) onChange();
    }, Math.round(500 / hz));
  };

  Circuit.prototype.stopAllClocks = function () {
    for (var id in this._clockIntervals) clearInterval(this._clockIntervals[id]);
    this._clockIntervals = {};
  };

  Circuit.prototype.gateById = function (id) {
    return this.gates.find(function (g) { return g.id === id; }) || null;
  };

  Circuit.prototype.wireById = function (id) {
    return this.wires.find(function (w) { return w.id === id; }) || null;
  };

  /* Topological propagation — resolves signal through entire circuit */
  Circuit.prototype.propagate = function () {
    var self    = this;
    var MAX_ITER = 100;  // guard against combinational loops

    // Build adjacency: for each gate, which wires feed its inputs?
    // We iterate in multiple passes (handles fan-out & cycles gracefully)
    for (var iter = 0; iter < MAX_ITER; iter++) {
      var changed = false;

      self.gates.forEach(function (gate) {
        if (gate.type === 'INPUT' || gate.type === 'CLOCK') {
          // Propagate to outgoing wires
          self.wires.forEach(function (w) {
            if (w.fromGate === gate.id) {
              if (w.signal !== gate.state) { w.signal = gate.state; changed = true; }
            }
          });
          return;
        }

        // Gather input signals for this gate
        var def      = GATE_DEFS[gate.type];
        var numInputs = def ? def.inputs : 0;
        var inputVals = [];
        for (var p = 0; p < numInputs; p++) {
          var wire = self.wires.find(function (w) { return w.toGate === gate.id && w.toPin === p; });
          inputVals[p] = wire ? wire.signal : 0;
        }

        var newState = evaluate(gate.type, inputVals);
        if (newState !== gate.state) { gate.state = newState; changed = true; }

        // Propagate to outgoing wires
        self.wires.forEach(function (w) {
          if (w.fromGate === gate.id) {
            if (w.signal !== gate.state) { w.signal = gate.state; changed = true; }
          }
        });
      });

      if (!changed) break;
    }
  };

  /* ── Truth table generator for whole circuit ── */
  Circuit.prototype.buildTruthTable = function () {
    var inputs  = this.gates.filter(function (g) { return g.type === 'INPUT'; });
    var outputs = this.gates.filter(function (g) { return g.type === 'OUTPUT' || g.type === 'LED'; });
    if (!inputs.length || !outputs.length) return null;

    var rows   = [];
    var n      = inputs.length;
    var combos = 1 << n;

    // Save current state
    var savedStates = inputs.map(function (g) { return g.state; });

    for (var mask = 0; mask < combos; mask++) {
      for (var i = 0; i < n; i++) {
        inputs[i].state = (mask >> (n - 1 - i)) & 1;
      }
      this.propagate();
      var row = { inputs: inputs.map(function (g) { return g.state; }),
                  outputs: outputs.map(function (g) { return g.state; }) };
      rows.push(row);
    }

    // Restore
    inputs.forEach(function (g, i) { g.state = savedStates[i]; });
    this.propagate();

    return {
      inputLabels:  inputs.map(function (g, i)  { return g.label || ('I' + i); }),
      outputLabels: outputs.map(function (g, i) { return g.label || ('Q' + i); }),
      rows: rows
    };
  };

  /* ── Serialise / deserialise ── */
  Circuit.prototype.serialize = function () {
    return JSON.stringify({
      gates: this.gates.map(function (g) {
        return { id: g.id, type: g.type, x: g.x, y: g.y, state: g.state,
                 extraData: g.extraData };
      }),
      wires: this.wires.map(function (w) {
        return { id: w.id, fromGate: w.fromGate, fromPin: w.fromPin,
                 toGate: w.toGate, toPin: w.toPin };
      }),
      nextId: this._nextId
    });
  };

  Circuit.prototype.load = function (json) {
    try {
      var data = typeof json === 'string' ? JSON.parse(json) : json;
      this.gates      = data.gates.map(function (g) {
        return { id: g.id, type: g.type, x: g.x, y: g.y,
                 label: GATE_DEFS[g.type] ? GATE_DEFS[g.type].label : g.type,
                 state: g.state || 0, inputPins: [], outputPins: [],
                 extraData: g.extraData || { clockHz: 1 } };
      });
      this.wires      = data.wires.map(function (w) {
        return { id: w.id, fromGate: w.fromGate, fromPin: w.fromPin,
                 toGate: w.toGate, toPin: w.toPin, signal: 0 };
      });
      this._nextId    = data.nextId || (this.gates.length + this.wires.length + 1);
      this.propagate();
    } catch (e) { console.error('Circuit load error', e); }
  };

  /* ── Preset circuits ── */
  var PRESETS = {
    'half-adder': {
      gates: [
        { id:'g1', type:'INPUT',  x:80,  y:130, state:0 },
        { id:'g2', type:'INPUT',  x:80,  y:230, state:0 },
        { id:'g3', type:'XOR',    x:260, y:160, state:0 },
        { id:'g4', type:'AND',    x:260, y:260, state:0 },
        { id:'g5', type:'OUTPUT', x:440, y:160, state:0 },
        { id:'g6', type:'OUTPUT', x:440, y:260, state:0 }
      ],
      wires: [
        { id:'w1', fromGate:'g1', fromPin:0, toGate:'g3', toPin:0 },
        { id:'w2', fromGate:'g2', fromPin:0, toGate:'g3', toPin:1 },
        { id:'w3', fromGate:'g1', fromPin:0, toGate:'g4', toPin:0 },
        { id:'w4', fromGate:'g2', fromPin:0, toGate:'g4', toPin:1 },
        { id:'w5', fromGate:'g3', fromPin:0, toGate:'g5', toPin:0 },
        { id:'w6', fromGate:'g4', fromPin:0, toGate:'g6', toPin:0 }
      ],
      nextId: 10
    },

    'full-adder': {
      gates: [
        { id:'g1', type:'INPUT',  x:60,  y:100, state:0 },
        { id:'g2', type:'INPUT',  x:60,  y:200, state:0 },
        { id:'g3', type:'INPUT',  x:60,  y:300, state:0 },
        { id:'g4', type:'XOR',    x:220, y:140, state:0 },
        { id:'g5', type:'XOR',    x:380, y:140, state:0 },
        { id:'g6', type:'AND',    x:220, y:260, state:0 },
        { id:'g7', type:'AND',    x:380, y:260, state:0 },
        { id:'g8', type:'OR',     x:520, y:260, state:0 },
        { id:'g9', type:'OUTPUT', x:540, y:140, state:0 },
        { id:'g10',type:'OUTPUT', x:660, y:260, state:0 }
      ],
      wires: [
        { id:'w1', fromGate:'g1', fromPin:0, toGate:'g4', toPin:0 },
        { id:'w2', fromGate:'g2', fromPin:0, toGate:'g4', toPin:1 },
        { id:'w3', fromGate:'g4', fromPin:0, toGate:'g5', toPin:0 },
        { id:'w4', fromGate:'g3', fromPin:0, toGate:'g5', toPin:1 },
        { id:'w5', fromGate:'g1', fromPin:0, toGate:'g6', toPin:0 },
        { id:'w6', fromGate:'g2', fromPin:0, toGate:'g6', toPin:1 },
        { id:'w7', fromGate:'g4', fromPin:0, toGate:'g7', toPin:0 },
        { id:'w8', fromGate:'g3', fromPin:0, toGate:'g7', toPin:1 },
        { id:'w9', fromGate:'g6', fromPin:0, toGate:'g8', toPin:0 },
        { id:'w10',fromGate:'g7', fromPin:0, toGate:'g8', toPin:1 },
        { id:'w11',fromGate:'g5', fromPin:0, toGate:'g9', toPin:0 },
        { id:'w12',fromGate:'g8', fromPin:0, toGate:'g10',toPin:0 }
      ],
      nextId: 20
    },

    'sr-latch': {
      gates: [
        { id:'g1', type:'INPUT',  x:80,  y:120, state:0 },
        { id:'g2', type:'INPUT',  x:80,  y:260, state:0 },
        { id:'g3', type:'NOR',    x:260, y:120, state:0 },
        { id:'g4', type:'NOR',    x:260, y:260, state:0 },
        { id:'g5', type:'OUTPUT', x:440, y:120, state:0 },
        { id:'g6', type:'OUTPUT', x:440, y:260, state:0 }
      ],
      wires: [
        { id:'w1', fromGate:'g1', fromPin:0, toGate:'g3', toPin:0 },
        { id:'w2', fromGate:'g4', fromPin:0, toGate:'g3', toPin:1 },
        { id:'w3', fromGate:'g2', fromPin:0, toGate:'g4', toPin:1 },
        { id:'w4', fromGate:'g3', fromPin:0, toGate:'g4', toPin:0 },
        { id:'w5', fromGate:'g3', fromPin:0, toGate:'g5', toPin:0 },
        { id:'w6', fromGate:'g4', fromPin:0, toGate:'g6', toPin:0 }
      ],
      nextId: 10
    },

    'mux': {
      gates: [
        { id:'g1', type:'INPUT',  x:60,  y:80,  state:0 },
        { id:'g2', type:'INPUT',  x:60,  y:180, state:0 },
        { id:'g3', type:'INPUT',  x:60,  y:300, state:0 },
        { id:'g4', type:'NOT',    x:200, y:300, state:0 },
        { id:'g5', type:'AND',    x:320, y:110, state:0 },
        { id:'g6', type:'AND',    x:320, y:230, state:0 },
        { id:'g7', type:'OR',     x:460, y:160, state:0 },
        { id:'g8', type:'OUTPUT', x:590, y:160, state:0 }
      ],
      wires: [
        { id:'w1', fromGate:'g3', fromPin:0, toGate:'g4', toPin:0 },
        { id:'w2', fromGate:'g4', fromPin:0, toGate:'g5', toPin:1 },
        { id:'w3', fromGate:'g3', fromPin:0, toGate:'g6', toPin:1 },
        { id:'w4', fromGate:'g1', fromPin:0, toGate:'g5', toPin:0 },
        { id:'w5', fromGate:'g2', fromPin:0, toGate:'g6', toPin:0 },
        { id:'w6', fromGate:'g5', fromPin:0, toGate:'g7', toPin:0 },
        { id:'w7', fromGate:'g6', fromPin:0, toGate:'g7', toPin:1 },
        { id:'w8', fromGate:'g7', fromPin:0, toGate:'g8', toPin:0 }
      ],
      nextId: 12
    },

    'decoder': {
      gates: [
        { id:'g1',  type:'INPUT',  x:60,  y:140, state:0 },
        { id:'g2',  type:'INPUT',  x:60,  y:260, state:0 },
        { id:'g3',  type:'NOT',    x:190, y:140, state:0 },
        { id:'g4',  type:'NOT',    x:190, y:260, state:0 },
        { id:'g5',  type:'AND',    x:340, y:80,  state:0 },
        { id:'g6',  type:'AND',    x:340, y:180, state:0 },
        { id:'g7',  type:'AND',    x:340, y:280, state:0 },
        { id:'g8',  type:'AND',    x:340, y:370, state:0 },
        { id:'g9',  type:'OUTPUT', x:490, y:80,  state:0 },
        { id:'g10', type:'OUTPUT', x:490, y:180, state:0 },
        { id:'g11', type:'OUTPUT', x:490, y:280, state:0 },
        { id:'g12', type:'OUTPUT', x:490, y:370, state:0 }
      ],
      wires: [
        { id:'w1',  fromGate:'g1',  fromPin:0, toGate:'g3',  toPin:0 },
        { id:'w2',  fromGate:'g2',  fromPin:0, toGate:'g4',  toPin:0 },
        { id:'w3',  fromGate:'g3',  fromPin:0, toGate:'g5',  toPin:0 },
        { id:'w4',  fromGate:'g4',  fromPin:0, toGate:'g5',  toPin:1 },
        { id:'w5',  fromGate:'g1',  fromPin:0, toGate:'g6',  toPin:0 },
        { id:'w6',  fromGate:'g4',  fromPin:0, toGate:'g6',  toPin:1 },
        { id:'w7',  fromGate:'g3',  fromPin:0, toGate:'g7',  toPin:0 },
        { id:'w8',  fromGate:'g2',  fromPin:0, toGate:'g7',  toPin:1 },
        { id:'w9',  fromGate:'g1',  fromPin:0, toGate:'g8',  toPin:0 },
        { id:'w10', fromGate:'g2',  fromPin:0, toGate:'g8',  toPin:1 },
        { id:'w11', fromGate:'g5',  fromPin:0, toGate:'g9',  toPin:0 },
        { id:'w12', fromGate:'g6',  fromPin:0, toGate:'g10', toPin:0 },
        { id:'w13', fromGate:'g7',  fromPin:0, toGate:'g11', toPin:0 },
        { id:'w14', fromGate:'g8',  fromPin:0, toGate:'g12', toPin:0 }
      ],
      nextId: 20
    }
  };

  global.GateEngine = {
    GATE_DEFS: GATE_DEFS,
    Circuit:   Circuit,
    PRESETS:   PRESETS,
    evaluate:  evaluate
  };

})(window);