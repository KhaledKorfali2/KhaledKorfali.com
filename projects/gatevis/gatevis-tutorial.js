/* gatevis-tutorial.js — tutorial steps for GateVis */
(function () {
  'use strict';

  var STEPS = [
    /* 0 — Welcome */
    {
      target: null,
      title: 'Welcome to GateVis',
      body: 'Build and simulate digital logic circuits right in your browser.<br><br>' +
            'This tour covers everything in about <strong>90 seconds</strong> — ' +
            'how to place gates, connect wires, toggle inputs, and read outputs.<br><br>' +
            'Tap <strong>Next</strong> to begin, or <strong>Skip</strong> to jump straight in. ' +
            'A <strong>Half Adder</strong> circuit is already loaded as a starting example.',
      placement: 'auto'
    },

    /* 1 — Canvas overview */
    {
      target: '#canvas-wrap',
      title: 'The Circuit Canvas',
      body: 'This is your <strong>infinite canvas</strong>.<br><br>' +
            '• <strong>Scroll / pinch</strong> to zoom in and out<br>' +
            '• <strong>Click and drag</strong> empty space to pan<br>' +
            '• <strong>Drag gates</strong> to reposition them — wires follow automatically<br><br>' +
            'Signal colours tell you the live state of every wire:<br>' +
            '<span style="color:#4ee04e">■</span> <strong>Bright green</strong> = HIGH (1) &nbsp; ' +
            '<span style="color:#1a5a1a">■</span> <strong>Dark green</strong> = LOW (0)',
      placement: 'top',
      padding: 0
    },

    /* 2 — Palette */
    {
      target: '#palette',
      title: 'Component Palette',
      body: 'Drag any component from here onto the canvas to place it.<br><br>' +
            '• <strong>Inputs</strong> — manual toggle switch or auto-oscillating clock<br>' +
            '• <strong>Gates</strong> — AND, OR, NOT, NAND, NOR, XOR, XNOR, Buffer<br>' +
            '• <strong>Outputs</strong> — pin probe or glowing LED<br>' +
            '• <strong>Presets</strong> — complete circuits (Half Adder, SR Latch…)<br><br>' +
            'On mobile, tap the <strong>+ button</strong> at the bottom of the canvas.',
      placement: 'right',
      padding: 4
    },

    /* 3 — Select tool */
    {
      target: '#ct-select',
      title: 'Select Tool  (V)',
      body: 'The default tool. With it you can:<br><br>' +
            '• <strong>Click</strong> a gate to select it and see its truth table in the panel<br>' +
            '• <strong>Drag</strong> a gate to move it — wires reroute automatically<br>' +
            '• <strong>Click an Input</strong> to toggle it between 0 and 1 — ' +
            'watch the signal ripple through the whole circuit instantly<br>' +
            '• <strong>Right-click / long-press</strong> empty space to pan',
      placement: 'left',
      padding: 8
    },

    /* 4 — Wire tool */
    {
      target: '#ct-wire',
      title: 'Wire Tool  (W)',
      body: 'Connect gates with wires.<br><br>' +
            '<strong>How to draw a wire:</strong><br>' +
            '1. Switch to the Wire tool<br>' +
            '2. Click (or tap) the <strong>output pin</strong> of one gate — ' +
            'the small dot on the right side<br>' +
            '3. Drag to the <strong>input pin</strong> of another gate — ' +
            'the dot on the left side<br>' +
            '4. Release to connect<br><br>' +
            'Wires route themselves in right-angle paths automatically.',
      placement: 'left',
      padding: 8
    },

    /* 5 — Delete tool */
    {
      target: '#ct-delete',
      title: 'Delete Tool  (D)',
      body: 'Remove gates or wires from the canvas.<br><br>' +
            '• Click any <strong>gate</strong> to delete it (and all its connected wires)<br>' +
            '• Click any <strong>wire</strong> to delete just that connection<br><br>' +
            'You can also select a gate with the Select tool and press <code>Delete</code> or <code>Backspace</code>.',
      placement: 'left',
      padding: 8
    },

    /* 6 — Undo/redo */
    {
      target: '#ct-undo',
      title: 'Undo & Redo',
      body: 'Every action — placing a gate, drawing a wire, toggling an input, ' +
            'deleting anything — is fully undoable.<br><br>' +
            '• <strong>↩ Undo</strong> — <code>Ctrl+Z</code><br>' +
            '• <strong>↪ Redo</strong> — <code>Ctrl+Y</code><br><br>' +
            'Up to 40 steps of history are kept.',
      placement: 'left',
      padding: 8
    },

    /* 7 — Presets */
    {
      target: '#palette',
      title: 'Circuit Presets',
      body: 'The bottom of the palette has <strong>5 ready-made circuits</strong> ' +
            'you can load instantly:<br><br>' +
            '• <strong>Half Adder</strong> — adds two 1-bit numbers (Sum + Carry)<br>' +
            '• <strong>Full Adder</strong> — adds two bits plus a carry-in<br>' +
            '• <strong>SR Latch</strong> — the simplest memory element<br>' +
            '• <strong>2:1 MUX</strong> — selects between two inputs using a selector bit<br>' +
            '• <strong>2:4 Decoder</strong> — decodes a 2-bit address into 4 output lines',
      placement: 'right',
      padding: 4
    },

    /* 8 — Info panel */
    {
      target: '#info-panel',
      title: 'Gate Info Panel',
      body: 'When you select a gate, this panel shows:<br><br>' +
            '• The gate\'s <strong>Boolean symbol</strong> and <strong>expression</strong> ' +
            '(e.g. <code>Q = A · B</code> for AND)<br>' +
            '• A plain-English <strong>description</strong> of what it does<br>' +
            '• Its complete <strong>truth table</strong><br><br>' +
            'On mobile, tap any gate to open this panel automatically.',
      placement: 'left',
      padding: 6
    },

    /* 9 — Truth table button */
    {
      target: '#btn-truth-table',
      title: 'Full Circuit Truth Table',
      body: 'The <strong>TT</strong> button generates a truth table for your <em>entire circuit</em> — ' +
            'not just a single gate.<br><br>' +
            'It exhaustively evaluates every combination of your Input values and shows ' +
            'what each Output produces. Add at least one <strong>Input</strong> and one ' +
            '<strong>Output</strong> to your circuit for this to work.',
      placement: 'bottom',
      padding: 8
    },

    /* 10 — Stats */
    {
      target: '#hdr-center',
      title: 'Circuit Statistics',
      body: 'Live counters in the header track the size of your circuit:<br><br>' +
            '• <strong>Gates</strong> — total logic gates placed<br>' +
            '• <strong>Wires</strong> — total connections<br>' +
            '• <strong>Inputs</strong> — switch and clock sources<br>' +
            '• <strong>Outputs</strong> — probes and LEDs',
      placement: 'bottom',
      padding: 6
    },

    /* 11 — Done */
    {
      target: null,
      title: 'Start Building! ⚡',
      body: 'A few experiments to try right away:<br><br>' +
            '• Load the <strong>Half Adder</strong> preset and click the Input switches — ' +
            'watch the Sum and Carry outputs change<br>' +
            '• Build a simple <strong>NOT → LED</strong> chain: place a NOT gate, ' +
            'connect an Input to it, and an LED to its output<br>' +
            '• Load the <strong>SR Latch</strong> and explore how it "remembers" state<br><br>' +
            'Tap the <strong>?</strong> button in the header to replay this tour anytime.',
      placement: 'auto'
    }
  ];

  document.addEventListener('DOMContentLoaded', function () {
    Tutorial.init(STEPS, 'gatevis_tut_done');
  });

})();