(function () {
  'use strict';

  /* ── Feature detection ── */
  var IS_MOBILE = window.matchMedia('(max-width: 700px)').matches ||
                  ('ontouchstart' in window && window.innerWidth <= 700);

  /* ── DOM refs ── */
  var canvas      = document.getElementById('vis');
  var ctx         = canvas.getContext('2d');
  var algoBtns    = document.querySelectorAll('.algo-btn');
  var btnPlay     = document.getElementById('btn-play');
  var btnStepFwd  = document.getElementById('btn-step-fwd');
  var btnStepBack = document.getElementById('btn-step-back');
  var btnReset    = document.getElementById('btn-reset');
  var btnEnd      = document.getElementById('btn-end');
  var btnInfo     = document.getElementById('btn-info');
  // Desktop sliders
  var slSize      = document.getElementById('sl-size');
  var vSize       = document.getElementById('v-size');
  var slSpeed     = document.getElementById('sl-speed');
  var vSpeed      = document.getElementById('v-speed');
  // Mobile sliders
  var slSizeM     = document.getElementById('sl-size-m');
  var vSizeM      = document.getElementById('v-size-m');
  var slSpeedM    = document.getElementById('sl-speed-m');
  var vSpeedM     = document.getElementById('v-speed-m');

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
  var infoPanel   = document.getElementById('info-panel');
  var panelHandle = document.getElementById('panel-handle');

  /* ── State ── */
  var currentAlgo = 'bubble';
  var arraySize   = IS_MOBILE ? 30 : 40;
  var speedLevel  = 5;
  var sourceArray = [];
  var steps       = [];
  var stepIndex   = 0;
  var highlights  = {};
  var sortedSet   = new Set();
  var playing     = false;
  var playTimer   = null;
  var stats       = { comps: 0, swaps: 0, writes: 0 };
  var displayArr  = [];
  var panelOpen   = false;

  /* Limit array size on mobile to keep perf smooth */
  var MAX_SIZE_MOBILE = 50;
  var MAX_SIZE_DESK   = 120;

  /* Sync slider max attribute */
  slSize.max  = MAX_SIZE_DESK;
  slSizeM.max = MAX_SIZE_MOBILE;

  /* ── Speed table: ms per step ── */
  var SPEED_MAP = [0, 800, 400, 200, 100, 60, 30, 15, 8, 4, 1];

  /* ── Canvas sizing ── */
  var W, H;
  var resizeScheduled = false;
  function resizeCanvas() {
    var wrap = document.getElementById('vis-wrap');
    W = canvas.width  = wrap.clientWidth  * (window.devicePixelRatio || 1);
    H = canvas.height = wrap.clientHeight * (window.devicePixelRatio || 1);
    canvas.style.width  = wrap.clientWidth  + 'px';
    canvas.style.height = wrap.clientHeight + 'px';
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    W = wrap.clientWidth;
    H = wrap.clientHeight;
    draw();
  }
  window.addEventListener('resize', function () {
    if (resizeScheduled) return;
    resizeScheduled = true;
    requestAnimationFrame(function () { resizeScheduled = false; resizeCanvas(); });
  }, { passive: true });

  /* ── Array generation ── */
  function makeArray(size, kind) {
    var arr = [];
    for (var i = 0; i < size; i++) arr.push(Math.round(5 + (i / (size - 1)) * 95));
    if (kind === 'reversed') {
      arr.reverse();
    } else if (kind === 'nearly') {
      for (var i = 0; i < Math.max(1, Math.floor(size * 0.08)); i++) {
        var a = (Math.random() * size) | 0;
        var b = (Math.random() * size) | 0;
        var t = arr[a]; arr[a] = arr[b]; arr[b] = t;
      }
    } else if (kind === 'few') {
      var vals = [15, 35, 55, 75, 95];
      for (var i = 0; i < size; i++) arr[i] = vals[(Math.random() * vals.length) | 0];
    } else {
      for (var i = size - 1; i > 0; i--) {
        var j = (Math.random() * (i + 1)) | 0;
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
    }
    return arr;
  }

  /* ── Pre-generate steps (chunked so we don't block the UI thread) ── */
  function buildSteps(algoKey, arr, callback) {
    var gen = SortEngine.generate(algoKey, arr);
    var all = [];
    var CHUNK = 500; // process 500 steps per animation frame
    function chunk() {
      var i = 0;
      var result;
      while (i++ < CHUNK && !(result = gen.next()).done) all.push(result.value);
      if (!result || !result.done) {
        requestAnimationFrame(chunk);
      } else {
        callback(all);
      }
    }
    requestAnimationFrame(chunk);
  }

  /* ── Initialise / reset ── */
  function init() {
    stopPlay();
    arraySize   = parseInt(IS_MOBILE ? slSizeM.value : slSize.value);
    sourceArray = makeArray(arraySize, selInput.value);
    displayArr  = sourceArray.slice();
    steps       = [];
    stepIndex   = 0;
    highlights  = {};
    sortedSet   = new Set();
    stats       = { comps: 0, swaps: 0, writes: 0 };
    updateStats();
    doneBanner.classList.add('hidden');
    clearLog();
    updateInfo();
    updateProgress();
    draw();
    buildSteps(currentAlgo, sourceArray, function (s) {
      steps = s;
      updateProgress();
    });
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
        break;
      case 'sorted':
        s.indices.forEach(function (i) { sortedSet.add(i); });
        break;
    }
    highlights = {};
    s.indices.forEach(function (i) { highlights[i] = s.type; });
    updateStats();
  }

  function stepForward() {
    if (steps.length === 0) return false;
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

  function stepBack() {
    if (stepIndex <= 0) return;
    replayTo(Math.max(0, stepIndex - 1));
  }

  function replayTo(target) {
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

  function jumpToEnd() {
    replayTo(steps.length);
    onDone();
  }

  function onDone() {
    stopPlay();
    highlights = {};
    for (var i = 0; i < displayArr.length; i++) sortedSet.add(i);
    doneBanner.classList.remove('hidden');
    draw();
    addLog({ type: 'sorted', indices: [], message: '✓ Sorted in ' + steps.length + ' steps!', category: 'sorted' });
  }

  /* ── Playback ── */
  function startPlay() {
    if (steps.length === 0) return; // still building
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
    // Batch multiple steps per frame at high speeds to avoid setTimeout overhead
    var batchSize = delay === 1 ? 8 : delay <= 8 ? 3 : 1;
    playTimer = setTimeout(function () {
      var more = true;
      for (var i = 0; i < batchSize && more; i++) {
        more = stepForward();
      }
      if (more) scheduleNext();
      else stopPlay();
    }, delay);
  }

  function togglePlay() {
    if (stepIndex >= steps.length && steps.length > 0) { init(); setTimeout(startPlay, 50); return; }
    if (playing) stopPlay();
    else startPlay();
  }

  /* ── Canvas draw — optimised ── */
  var COLORS = {
    default:  '#2a2a2a',
    compare:  '#e8c547',
    swap:     '#f44747',
    write:    '#569cd6',
    sorted:   '#4ec9b0',
    pivot:    '#c586c0',
    info:     '#569cd6'
  };

  // Pre-compute lightened colors to avoid hex math every frame
  var COLORS_LIGHT = {};
  (function () {
    for (var k in COLORS) {
      var hex = COLORS[k];
      var r = Math.min(255, parseInt(hex.slice(1,3), 16) + 60);
      var g = Math.min(255, parseInt(hex.slice(3,5), 16) + 60);
      var b = Math.min(255, parseInt(hex.slice(5,7), 16) + 60);
      COLORS_LIGHT[k] = '#' + r.toString(16).padStart(2,'0') +
                               g.toString(16).padStart(2,'0') +
                               b.toString(16).padStart(2,'0');
    }
  })();

  var drawScheduled = false;
  function draw() {
    if (drawScheduled) return;
    drawScheduled = true;
    requestAnimationFrame(function () {
      drawScheduled = false;
      _draw();
    });
  }

  function _draw() {
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);

    var n = displayArr.length;
    if (n === 0) return;

    var pad   = 2;
    var totalW = W - pad * 2;
    var barW  = Math.max(1, Math.floor((totalW - (n - 1)) / n));
    var step  = barW + 1;

    // Grid lines — only draw if not too cramped
    if (H > 100) {
      ctx.strokeStyle = '#191919';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      for (var g = 1; g <= 3; g++) {
        var y = Math.round(H - (g / 4) * (H - 4)) - 1;
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();
    }

    // Batch draws: group bars by color to minimise fillStyle changes
    // Use 4 buckets: default, sorted, compare-type highlight, swap-type highlight
    var defaultBars = [], sortedBars = [], activeBars = [];

    for (var i = 0; i < n; i++) {
      var x   = pad + i * step;
      var pct = displayArr[i] / 100;
      var bh  = Math.max(2, Math.round(pct * (H - 4)));
      var y   = H - bh;

      if (highlights[i]) {
        activeBars.push({ i: i, x: x, y: y, bh: bh, type: highlights[i] });
      } else if (sortedSet.has(i)) {
        sortedBars.push({ x: x, y: y, bh: bh });
      } else {
        defaultBars.push({ x: x, y: y, bh: bh });
      }
    }

    // Draw default
    if (defaultBars.length) {
      ctx.fillStyle = COLORS.default;
      for (var i = 0; i < defaultBars.length; i++) {
        var b = defaultBars[i];
        ctx.fillRect(b.x, b.y, barW, b.bh);
      }
    }

    // Draw sorted
    if (sortedBars.length) {
      ctx.fillStyle = COLORS.sorted;
      for (var i = 0; i < sortedBars.length; i++) {
        var b = sortedBars[i];
        ctx.fillRect(b.x, b.y, barW, b.bh);
      }
      ctx.fillStyle = COLORS_LIGHT.sorted;
      for (var i = 0; i < sortedBars.length; i++) {
        var b = sortedBars[i];
        ctx.fillRect(b.x, b.y, barW, Math.min(2, b.bh));
      }
    }

    // Draw highlighted (small number, individual)
    for (var i = 0; i < activeBars.length; i++) {
      var b   = activeBars[i];
      var col = COLORS[b.type] || COLORS.compare;
      ctx.fillStyle = col;
      ctx.fillRect(b.x, b.y, barW, b.bh);
      ctx.fillStyle = COLORS_LIGHT[b.type] || col;
      ctx.fillRect(b.x, b.y, barW, Math.min(2, b.bh));
    }
  }

  /* ── Log ── */
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

  /* ── Stats ── */
  function updateStats() {
    stComps.textContent  = stats.comps > 9999  ? (stats.comps/1000).toFixed(1)+'k'  : stats.comps;
    stSwaps.textContent  = stats.swaps > 9999  ? (stats.swaps/1000).toFixed(1)+'k'  : stats.swaps;
    stWrites.textContent = stats.writes > 9999 ? (stats.writes/1000).toFixed(1)+'k' : stats.writes;
  }

  function updateProgress() {
    var total = steps.length;
    var pct   = total ? stepIndex / total * 100 : 0;
    progressFill.style.width = pct.toFixed(1) + '%';
    progressText.textContent = stepIndex + ' / ' + total;
  }

  /* ── Info panel ── */
  function updateInfo() {
    var meta = SortEngine.meta[currentAlgo];
    algoTitle.textContent  = meta.name;
    algoDesc.textContent   = meta.desc;
    badgeBest.textContent  = meta.best;
    badgeAvg.textContent   = meta.avg;
    badgeWorst.textContent = meta.worst;
    badgeSpace.textContent = meta.space;
  }

  /* ── Mobile info panel sheet ── */
  function openPanel()  { infoPanel.classList.add('open');  panelOpen = true;  }
  function closePanel() { infoPanel.classList.remove('open'); panelOpen = false; }
  function togglePanel() { if (panelOpen) closePanel(); else openPanel(); }

  if (btnInfo) {
    btnInfo.addEventListener('click', function () { togglePanel(); });
  }

  // Handle drag on panel handle
  var panelDragStartY = null;
  var panelStartOpen  = false;
  panelHandle.addEventListener('touchstart', function (e) {
    panelDragStartY = e.touches[0].clientY;
    panelStartOpen  = panelOpen;
  }, { passive: true });
  panelHandle.addEventListener('touchmove', function (e) {
    if (panelDragStartY === null) return;
    var dy = e.touches[0].clientY - panelDragStartY;
    if (dy > 40 && panelStartOpen)  closePanel();
    if (dy < -40 && !panelStartOpen) openPanel();
  }, { passive: true });
  panelHandle.addEventListener('touchend', function () { panelDragStartY = null; }, { passive: true });
  panelHandle.addEventListener('click', togglePanel);

  // Close panel when tapping the canvas on mobile
  canvas.addEventListener('touchstart', function () {
    if (panelOpen) closePanel();
  }, { passive: true });

  /* ── Slider sync: keep desktop and mobile sliders in sync ── */
  function syncSize(val) {
    arraySize = parseInt(val);
    slSize.value  = arraySize;
    slSizeM.value = Math.min(arraySize, MAX_SIZE_MOBILE);
    vSize.textContent  = arraySize;
    vSizeM.textContent = Math.min(arraySize, MAX_SIZE_MOBILE);
  }
  function syncSpeed(val) {
    speedLevel = parseInt(val);
    slSpeed.value  = speedLevel;
    slSpeedM.value = speedLevel;
    vSpeed.textContent  = speedLevel;
    vSpeedM.textContent = speedLevel;
  }

  slSize.addEventListener('input', function () { syncSize(slSize.value); init(); });
  slSizeM.addEventListener('input', function () { syncSize(slSizeM.value); init(); });
  slSpeed.addEventListener('input', function () { syncSpeed(slSpeed.value); });
  slSpeedM.addEventListener('input', function () { syncSpeed(slSpeedM.value); });

  /* ── Event wiring ── */
  algoBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      algoBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentAlgo = btn.getAttribute('data-algo');
      // Scroll active button into view in the nav
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      init();
    });
  });

  btnPlay.addEventListener('click', togglePlay);
  btnStepFwd.addEventListener('click',  function () { stopPlay(); stepForward(); });
  btnStepBack.addEventListener('click', function () { stopPlay(); stepBack(); });
  btnReset.addEventListener('click', init);
  btnEnd.addEventListener('click',   function () { stopPlay(); jumpToEnd(); });
  selInput.addEventListener('change', init);

  /* Keyboard shortcuts */
  document.addEventListener('keydown', function (e) {
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;
    switch (e.code) {
      case 'Space':      e.preventDefault(); togglePlay();           break;
      case 'ArrowRight': e.preventDefault(); stopPlay(); stepForward(); break;
      case 'ArrowLeft':  e.preventDefault(); stopPlay(); stepBack();    break;
      case 'KeyR':       init();             break;
      case 'End':        e.preventDefault(); stopPlay(); jumpToEnd();   break;
    }
  });

  /* ── Boot ── */
  resizeCanvas();
  syncSize(arraySize);
  syncSpeed(speedLevel);
  init();

})();