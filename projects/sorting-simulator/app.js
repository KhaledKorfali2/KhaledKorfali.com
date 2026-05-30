(function () {
  'use strict';

  /* ── DOM refs ── */
  var canvas      = document.getElementById('vis');
  var ctx         = canvas.getContext('2d');
  var algoBtns    = document.querySelectorAll('.algo-btn');
  var btnPlay     = document.getElementById('btn-play');
  var btnStepFwd  = document.getElementById('btn-step-fwd');
  var btnStepBack = document.getElementById('btn-step-back');
  var btnReset    = document.getElementById('btn-reset');
  var btnEnd      = document.getElementById('btn-end');
  var slSize      = document.getElementById('sl-size');
  var vSize       = document.getElementById('v-size');
  var slSpeed     = document.getElementById('sl-speed');
  var vSpeed      = document.getElementById('v-speed');
  var selInput    = document.getElementById('sel-input');
  var stepLog     = document.getElementById('step-log');
  var algoTitle   = document.getElementById('algo-title');
  var algoDesc    = document.getElementById('algo-desc');
  var badgeBest   = document.getElementById('badge-best');
  var badgeAvg    = document.getElementById('badge-avg');
  var badgeWorst  = document.getElementById('badge-worst');
  var badgeSpace  = document.getElementById('badge-space');
  var stComps     = document.getElementById('st-comps');
  var stSwaps     = document.getElementById('st-swaps');
  var stWrites    = document.getElementById('st-writes');
  var doneBanner  = document.getElementById('done-banner');
  var progressFill = document.getElementById('progress-fill');
  var progressText = document.getElementById('progress-text');

  /* ── State ── */
  var currentAlgo  = 'bubble';
  var arraySize    = 40;
  var speedLevel   = 5;
  var sourceArray  = [];   // original unsorted array for display/reset
  var steps        = [];   // all pre-generated steps
  var stepIndex    = 0;    // current position in steps
  var highlights   = {};   // index → color class
  var sortedSet    = new Set();
  var playing      = false;
  var playTimer    = null;
  var stats        = { comps: 0, swaps: 0, writes: 0 };

  /* Display array: mutated as we replay steps */
  var displayArr   = [];

  /* ── Speed table: ms per step ── */
  var SPEED_MAP = [0, 800, 400, 200, 100, 60, 30, 15, 8, 4, 1];

  /* ── Canvas sizing ── */
  var W, H;
  function resizeCanvas() {
    var wrap = document.getElementById('vis-wrap');
    W = canvas.width  = wrap.clientWidth;
    H = canvas.height = wrap.clientHeight;
    draw();
  }
  window.addEventListener('resize', resizeCanvas);

  /* ── Array generation ── */
  function makeArray(size, kind) {
    var arr = [];
    for (var i = 0; i < size; i++) arr.push(Math.round(5 + (i / (size - 1)) * 95));
    if (kind === 'reversed') {
      arr.reverse();
    } else if (kind === 'nearly') {
      for (var i = 0; i < Math.max(1, Math.floor(size * 0.08)); i++) {
        var a = Math.floor(Math.random() * size);
        var b = Math.floor(Math.random() * size);
        var t = arr[a]; arr[a] = arr[b]; arr[b] = t;
      }
    } else if (kind === 'few') {
      var vals = [15, 35, 55, 75, 95];
      for (var i = 0; i < size; i++) arr[i] = vals[Math.floor(Math.random() * vals.length)];
    } else {
      // random shuffle
      for (var i = size - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
    }
    return arr;
  }

  /* ── Pre-generate all steps ── */
  function buildSteps(algoKey, arr) {
    var gen = SortEngine.generate(algoKey, arr);
    var all = [];
    var result;
    while (!(result = gen.next()).done) all.push(result.value);
    return all;
  }

  /* ── Initialise / reset ── */
  function init() {
    stopPlay();
    arraySize   = parseInt(slSize.value);
    sourceArray = makeArray(arraySize, selInput.value);
    displayArr  = sourceArray.slice();
    steps       = buildSteps(currentAlgo, sourceArray);
    stepIndex   = 0;
    highlights  = {};
    sortedSet   = new Set();
    stats       = { comps: 0, swaps: 0, writes: 0 };
    updateStats();
    updateProgress();
    doneBanner.classList.add('hidden');
    clearLog();
    updateInfo();
    draw();
  }

  /* ── Apply one step forward ── */
  function applyStep(s) {
    switch (s.type) {
      case 'compare': stats.comps++;  break;
      case 'swap':
        stats.swaps++;
        stats.writes += 2;
        var i = s.indices[0], j = s.indices[1];
        var t = displayArr[i]; displayArr[i] = displayArr[j]; displayArr[j] = t;
        break;
      case 'write':
        stats.writes++;
        // For merge/radix/counting, actual values supplied by generator via arr mutation
        // We just need to resync displayArr from the step's recorded values if provided
        break;
      case 'sorted':
        s.indices.forEach(function (i) { sortedSet.add(i); });
        break;
    }
    // Highlight
    highlights = {};
    s.indices.forEach(function (i) { highlights[i] = s.type; });
    updateStats();
  }

  /* ── Step forward ── */
  function stepForward() {
    if (stepIndex >= steps.length) return false;
    var s = steps[stepIndex];
    stepIndex++;
    applyStep(s);
    addLog(s);
    updateProgress();
    draw();
    if (stepIndex >= steps.length) onDone();
    return stepIndex < steps.length;
  }

  /* ── Step back (rebuild state from scratch) ── */
  function stepBack() {
    if (stepIndex <= 0) return;
    var target = Math.max(0, stepIndex - 1);
    replayTo(target);
  }

  /* ── Replay state up to (but not including) target index ── */
  function replayTo(target) {
    // Rebuild display state from scratch
    displayArr = sourceArray.slice();
    sortedSet  = new Set();
    highlights = {};
    stats      = { comps: 0, swaps: 0, writes: 0 };
    clearLog();
    for (var i = 0; i < target; i++) {
      var s = steps[i];
      switch (s.type) {
        case 'compare': stats.comps++;  break;
        case 'swap':
          stats.swaps++; stats.writes += 2;
          var a = s.indices[0], b = s.indices[1];
          var t = displayArr[a]; displayArr[a] = displayArr[b]; displayArr[b] = t;
          break;
        case 'write': stats.writes++; break;
        case 'sorted': s.indices.forEach(function (i) { sortedSet.add(i); }); break;
      }
    }
    stepIndex = target;
    if (target > 0) {
      var last = steps[target - 1];
      highlights = {};
      last.indices.forEach(function (i) { highlights[i] = last.type; });
      addLog(last);
    }
    updateStats();
    updateProgress();
    doneBanner.classList.add('hidden');
    draw();
  }

  /* ── Jump to end ── */
  function jumpToEnd() {
    replayTo(steps.length);
    onDone();
  }

  /* ── Done ── */
  function onDone() {
    stopPlay();
    highlights = {};
    // Mark everything sorted
    for (var i = 0; i < displayArr.length; i++) sortedSet.add(i);
    doneBanner.classList.remove('hidden');
    draw();
    addLog({ type: 'sorted', indices: [], message: '✓ Array fully sorted in ' + steps.length + ' steps!', category: 'sorted' });
  }

  /* ── Playback ── */
  function startPlay() {
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
    var delay = SPEED_MAP[speedLevel] || 30;
    playTimer = setTimeout(function () {
      var more = stepForward();
      if (more) scheduleNext();
      else stopPlay();
    }, delay);
  }

  function togglePlay() {
    if (stepIndex >= steps.length) { init(); startPlay(); return; }
    if (playing) stopPlay();
    else startPlay();
  }

  /* ── Canvas draw ── */
  var COLORS = {
    default:  '#2a2a2a',
    compare:  '#e8c547',
    swap:     '#f44747',
    write:    '#569cd6',
    sorted:   '#4ec9b0',
    pivot:    '#c586c0',
    info:     '#569cd6'
  };

  function draw() {
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);

    var n    = displayArr.length;
    if (n === 0) return;
    var pad  = 2;
    var totalW = W - pad * 2;
    var barW = Math.max(1, (totalW / n) - 1);
    var gap  = (totalW - barW * n) / (n - 1 || 1);

    // Background grid lines
    ctx.strokeStyle = '#191919';
    ctx.lineWidth   = 1;
    for (var g = 0; g <= 4; g++) {
      var y = H - Math.round((g / 4) * (H - 4)) - 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    for (var i = 0; i < n; i++) {
      var x   = pad + i * (barW + gap);
      var pct = displayArr[i] / 100;
      var bh  = Math.max(2, Math.round(pct * (H - 4)));
      var y   = H - bh;

      // Determine color
      var col;
      if (highlights[i]) {
        col = COLORS[highlights[i]] || COLORS.compare;
      } else if (sortedSet.has(i)) {
        col = COLORS.sorted;
      } else {
        col = COLORS.default;
      }

      ctx.fillStyle = col;
      ctx.fillRect(x, y, barW, bh);

      // Top accent line for visibility
      if (highlights[i] || sortedSet.has(i)) {
        ctx.fillStyle = lighten(col);
        ctx.fillRect(x, y, barW, Math.min(2, bh));
      }
    }
  }

  function lighten(hex) {
    // Quick brighten: mix with white
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    r = Math.min(255, r + 60);
    g = Math.min(255, g + 60);
    b = Math.min(255, b + 60);
    return '#' + r.toString(16).padStart(2,'0') + g.toString(16).padStart(2,'0') + b.toString(16).padStart(2,'0');
  }

  /* ── Log ── */
  var LOG_MAX = 80;

  function clearLog() { stepLog.innerHTML = ''; }

  function addLog(s) {
    var el = document.createElement('div');
    el.className = 'log-entry ' + (s.category || s.type);
    el.textContent = s.message;
    stepLog.appendChild(el);
    // Trim old entries
    while (stepLog.children.length > LOG_MAX) stepLog.removeChild(stepLog.firstChild);
    stepLog.scrollTop = stepLog.scrollHeight;
  }

  /* ── Stats ── */
  function updateStats() {
    stComps.textContent  = stats.comps.toLocaleString();
    stSwaps.textContent  = stats.swaps.toLocaleString();
    stWrites.textContent = stats.writes.toLocaleString();
  }

  function updateProgress() {
    var pct = steps.length ? stepIndex / steps.length * 100 : 0;
    progressFill.style.width = pct.toFixed(1) + '%';
    progressText.textContent = stepIndex + ' / ' + steps.length;
  }

  /* ── Info panel ── */
  function updateInfo() {
    var meta = SortEngine.meta[currentAlgo];
    algoTitle.textContent = meta.name;
    algoDesc.textContent  = meta.desc;
    badgeBest.textContent  = meta.best;
    badgeAvg.textContent   = meta.avg;
    badgeWorst.textContent = meta.worst;
    badgeSpace.textContent = meta.space;
  }

  /* ── Event wiring ── */
  algoBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      algoBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentAlgo = btn.getAttribute('data-algo');
      init();
    });
  });

  btnPlay.addEventListener('click', togglePlay);
  btnStepFwd.addEventListener('click', function () { stopPlay(); stepForward(); });
  btnStepBack.addEventListener('click', function () { stopPlay(); stepBack(); });
  btnReset.addEventListener('click', init);
  btnEnd.addEventListener('click', function () { stopPlay(); jumpToEnd(); });

  slSize.addEventListener('input', function () {
    arraySize = parseInt(slSize.value);
    vSize.textContent = arraySize;
    init();
  });

  slSpeed.addEventListener('input', function () {
    speedLevel = parseInt(slSpeed.value);
    vSpeed.textContent = speedLevel;
  });

  selInput.addEventListener('change', init);

  /* Keyboard shortcuts */
  document.addEventListener('keydown', function (e) {
    switch (e.code) {
      case 'Space':       e.preventDefault(); togglePlay();    break;
      case 'ArrowRight':  e.preventDefault(); stopPlay(); stepForward();  break;
      case 'ArrowLeft':   e.preventDefault(); stopPlay(); stepBack();     break;
      case 'KeyR':        init();             break;
      case 'End':         e.preventDefault(); stopPlay(); jumpToEnd();    break;
    }
  });

  /* ── Boot ── */
  resizeCanvas();
  init();

})();