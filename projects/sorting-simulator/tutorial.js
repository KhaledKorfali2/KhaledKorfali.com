/* tutorial.js — shared spotlight tutorial engine
   Used by both Sortvis and Graphvis.

   Usage:
     Tutorial.init(steps, storageKey)   — call once after DOM ready
     Tutorial.start()                   — show from step 0
     Tutorial.reopen()                  — show from step 0 (same as start)

   Each step object:
   {
     target:    CSS selector of element to spotlight (null = centered welcome card)
     title:     string
     body:      HTML string (supports <strong> and <code>)
     placement: 'top'|'bottom'|'left'|'right'|'auto' (default 'auto')
     padding:   extra px around spotlight rect (default 8)
     onEnter:   optional function() called when step becomes active
     onLeave:   optional function() called when leaving step
   }
*/

(function (global) {
  'use strict';

  /* ── Build DOM ── */
  var backdrop, ring, card, arrow;
  var stepBadge, titleEl, bodyEl, dotsEl, skipBtn, navEl;
  var reopenBtn;

  function buildDOM() {
    /* Backdrop */
    backdrop = el('div', 'tut-backdrop tut-hidden', { id: 'tut-backdrop' });
    /* Spotlight ring */
    ring = el('div', 'tut-ring', { id: 'tut-ring' });
    /* Arrow */
    arrow = el('div', '', { id: 'tut-arrow' });
    /* Card */
    card = el('div', 'tut-card tut-hidden', { id: 'tut-card' });
    stepBadge = el('div', '', { id: 'tut-step-badge' });
    titleEl   = el('div', '', { id: 'tut-title' });
    bodyEl    = el('div', '', { id: 'tut-body' });
    dotsEl    = el('div', '', { id: 'tut-dots' });
    var ctrlRow = el('div', '', { id: 'tut-controls' });
    skipBtn = el('button', '', { id: 'tut-skip' });
    skipBtn.textContent = 'Skip tutorial';
    navEl = el('div', '', { id: 'tut-nav' });
    ctrlRow.appendChild(skipBtn);
    ctrlRow.appendChild(navEl);
    card.appendChild(stepBadge);
    card.appendChild(titleEl);
    card.appendChild(bodyEl);
    card.appendChild(dotsEl);
    card.appendChild(ctrlRow);

    document.body.appendChild(backdrop);
    document.body.appendChild(ring);
    document.body.appendChild(arrow);
    document.body.appendChild(card);

    /* Re-open button — injected into header */
    reopenBtn = el('button', '', { id: 'tut-reopen-btn', title: 'Show tutorial' });
    reopenBtn.textContent = '?';
    reopenBtn.setAttribute('aria-label', 'Reopen tutorial');
    var hdrLeft = document.getElementById('hdr-left');
    if (hdrLeft) hdrLeft.appendChild(reopenBtn);

    /* Events */
    backdrop.addEventListener('click', onBackdropClick);
    skipBtn.addEventListener('click', finish);
    reopenBtn.addEventListener('click', function () { start(); });

    /* Keyboard */
    document.addEventListener('keydown', onKey);
  }

  function el(tag, cls, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* ── State ── */
  var steps      = [];
  var current    = 0;
  var active     = false;
  var storageKey = 'tut_done';

  /* ── Public API ── */
  function init(stepsArr, key) {
    steps      = stepsArr;
    storageKey = key || 'tut_done';
    buildDOM();
    // Auto-start if user hasn't seen it
    if (!localStorage.getItem(storageKey)) {
      // Small delay so the app fully renders before we overlay it
      setTimeout(start, 600);
    }
  }

  function start() {
    active  = true;
    current = 0;
    backdrop.classList.remove('tut-hidden');
    card.classList.remove('tut-hidden');
    showStep(current);
  }

  function finish() {
    active = false;
    backdrop.classList.add('tut-hidden');
    card.classList.add('tut-hidden');
    ring.classList.remove('visible');
    arrow.classList.remove('visible');
    clearSpotlight();
    localStorage.setItem(storageKey, '1');
    // Run onLeave for current step
    var s = steps[current];
    if (s && s.onLeave) s.onLeave();
  }

  /* ── Step rendering ── */
  function showStep(idx) {
    var s = steps[idx];
    if (!s) { finish(); return; }

    // onLeave previous
    if (idx > 0 && steps[idx - 1] && steps[idx - 1].onLeave) steps[idx - 1].onLeave();
    // onEnter
    if (s.onEnter) s.onEnter();

    stepBadge.textContent = 'Step ' + (idx + 1) + ' of ' + steps.length;
    titleEl.textContent   = s.title;
    bodyEl.innerHTML      = s.body;

    // Dots
    dotsEl.innerHTML = '';
    for (var i = 0; i < steps.length; i++) {
      var d = el('div', 'tut-dot' + (i < idx ? ' done' : i === idx ? ' active' : ''));
      dotsEl.appendChild(d);
    }

    // Nav buttons
    navEl.innerHTML = '';
    if (idx > 0) {
      var prev = el('button', 'tut-nav-btn tut-prev');
      prev.textContent = '← Back';
      prev.addEventListener('click', function () { showStep(current - 1); current--; });
      // Fix: capture correct idx
      (function (i) {
        prev.addEventListener('click', function () { current = i - 1; showStep(current); });
      })(idx);
      prev.addEventListener('click', function () {}); // placeholder removed below
      navEl.appendChild(prev);
    }
    var next = el('button', idx === steps.length - 1 ? 'tut-nav-btn tut-finish' : 'tut-nav-btn tut-next');
    next.textContent = idx === steps.length - 1 ? '✓ Done' : 'Next →';
    next.addEventListener('click', function () {
      if (current < steps.length - 1) { current++; showStep(current); }
      else finish();
    });
    navEl.appendChild(next);

    // Welcome vs spotlight
    if (!s.target) {
      card.classList.add('tut-welcome');
      clearSpotlight();
      ring.classList.remove('visible');
      arrow.classList.remove('visible');
      positionCardCentered();
    } else {
      card.classList.remove('tut-welcome');
      var targetEl = document.querySelector(s.target);
      if (targetEl) {
        spotlightElement(targetEl, s.padding || 8);
        positionCard(targetEl, s.placement || 'auto');
      } else {
        clearSpotlight();
        positionCardCentered();
      }
    }
  }

  /* Re-wire prev button properly */
  function showStep(idx) {
    var s = steps[idx];
    if (!s) { finish(); return; }

    if (steps[current] && steps[current].onLeave) steps[current].onLeave();
    current = idx;
    if (s.onEnter) s.onEnter();

    stepBadge.textContent = 'Step ' + (idx + 1) + ' of ' + steps.length;
    titleEl.textContent   = s.title;
    bodyEl.innerHTML      = s.body;

    dotsEl.innerHTML = '';
    for (var i = 0; i < steps.length; i++) {
      var d = document.createElement('div');
      d.className = 'tut-dot' + (i < idx ? ' done' : i === idx ? ' active' : '');
      dotsEl.appendChild(d);
    }

    navEl.innerHTML = '';
    if (idx > 0) {
      var prev = document.createElement('button');
      prev.className   = 'tut-nav-btn tut-prev';
      prev.textContent = '← Back';
      prev.addEventListener('click', function () { showStep(idx - 1); });
      navEl.appendChild(prev);
    }
    var isLast = idx === steps.length - 1;
    var next = document.createElement('button');
    next.className   = 'tut-nav-btn ' + (isLast ? 'tut-finish' : 'tut-next');
    next.textContent = isLast ? '✓ Done' : 'Next →';
    next.addEventListener('click', function () {
      if (!isLast) showStep(idx + 1);
      else finish();
    });
    navEl.appendChild(next);

    if (!s.target) {
      card.classList.add('tut-welcome');
      clearSpotlight();
      ring.classList.remove('visible');
      arrow.classList.remove('visible');
      positionCardCentered();
    } else {
      card.classList.remove('tut-welcome');
      var targetEl = document.querySelector(s.target);
      if (targetEl) {
        // Scroll element into view if needed (especially algo-nav buttons)
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        setTimeout(function () {
          spotlightElement(targetEl, s.padding !== undefined ? s.padding : 8);
          positionCard(targetEl, s.placement || 'auto');
        }, 80);
      } else {
        clearSpotlight();
        positionCardCentered();
      }
    }
  }

  /* ── Spotlight ── */
  function spotlightElement(el, pad) {
    var r   = el.getBoundingClientRect();
    var vw  = window.innerWidth, vh = window.innerHeight;
    var x1  = Math.max(0, r.left   - pad);
    var y1  = Math.max(0, r.top    - pad);
    var x2  = Math.min(vw, r.right  + pad);
    var y2  = Math.min(vh, r.bottom + pad);
    var br  = 8; // border-radius

    // Clip-path polygon with a rectangular hole
    // We draw the outer rect, then the inner rect (hole) in reverse winding
    var cp = [
      '0 0', vw + 'px 0', vw + 'px ' + vh + 'px', '0 ' + vh + 'px', '0 0',
      x1 + 'px ' + y1 + 'px',
      x1 + 'px ' + y2 + 'px',
      x2 + 'px ' + y2 + 'px',
      x2 + 'px ' + y1 + 'px',
      x1 + 'px ' + y1 + 'px'
    ].join(', ');
    backdrop.style.clipPath = 'polygon(' + cp + ')';

    // Ring
    ring.style.left   = x1 + 'px';
    ring.style.top    = y1 + 'px';
    ring.style.width  = (x2 - x1) + 'px';
    ring.style.height = (y2 - y1) + 'px';
    ring.classList.add('visible');
  }

  function clearSpotlight() {
    backdrop.style.clipPath = 'none';
    ring.style.opacity = '0';
  }

  /* ── Card positioning ── */
  var CARD_GAP = 14; // px gap between spotlight and card

  function positionCardCentered() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var cw = card.offsetWidth  || 320;
    var ch = card.offsetHeight || 220;
    card.style.left      = Math.round((vw - cw) / 2) + 'px';
    card.style.top       = Math.round((vh - ch) / 2) + 'px';
    card.style.transform = 'none';
  }

  function positionCard(targetEl, placement) {
    var r   = targetEl.getBoundingClientRect();
    var vw  = window.innerWidth, vh = window.innerHeight;
    var cw  = card.offsetWidth  || 320;
    var ch  = card.offsetHeight || 200;
    var pad = 12; // screen edge padding

    // Auto-detect best placement
    if (placement === 'auto') {
      var spaceBelow = vh - r.bottom;
      var spaceAbove = r.top;
      var spaceRight = vw - r.right;
      var spaceLeft  = r.left;
      if (spaceBelow >= ch + CARD_GAP + pad)      placement = 'bottom';
      else if (spaceAbove >= ch + CARD_GAP + pad) placement = 'top';
      else if (spaceRight >= cw + CARD_GAP + pad) placement = 'right';
      else if (spaceLeft  >= cw + CARD_GAP + pad) placement = 'left';
      else placement = 'bottom'; // fallback: overlap if nothing fits
    }

    var cx, cy;
    // Horizontal center on target for top/bottom
    var targetCX = r.left + r.width  / 2;
    var targetCY = r.top  + r.height / 2;

    if (placement === 'bottom') {
      cx = clamp(targetCX - cw / 2, pad, vw - cw - pad);
      cy = r.bottom + CARD_GAP;
      if (cy + ch > vh - pad) cy = r.top - ch - CARD_GAP; // flip if no room
    } else if (placement === 'top') {
      cx = clamp(targetCX - cw / 2, pad, vw - cw - pad);
      cy = r.top - ch - CARD_GAP;
      if (cy < pad) cy = r.bottom + CARD_GAP;
    } else if (placement === 'right') {
      cx = r.right + CARD_GAP;
      cy = clamp(targetCY - ch / 2, pad, vh - ch - pad);
      if (cx + cw > vw - pad) cx = r.left - cw - CARD_GAP;
    } else { // left
      cx = r.left - cw - CARD_GAP;
      cy = clamp(targetCY - ch / 2, pad, vh - ch - pad);
      if (cx < pad) cx = r.right + CARD_GAP;
    }

    // Final clamp to viewport
    cx = clamp(cx, pad, vw - cw - pad);
    cy = clamp(cy, pad, vh - ch - pad);

    card.style.left      = Math.round(cx) + 'px';
    card.style.top       = Math.round(cy) + 'px';
    card.style.transform = 'none';
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ── Event handlers ── */
  function onBackdropClick(e) {
    // Only close if clicking outside the card
    if (!card.contains(e.target)) {
      // Advance step on backdrop click (helpful on mobile)
      if (active) {
        if (current < steps.length - 1) showStep(current + 1);
        else finish();
      }
    }
  }

  function onKey(e) {
    if (!active) return;
    if (e.key === 'ArrowRight' || e.key === 'Enter') {
      e.preventDefault();
      if (current < steps.length - 1) showStep(current + 1);
      else finish();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (current > 0) showStep(current - 1);
    } else if (e.key === 'Escape') {
      finish();
    }
  }

  /* ── Reposition on resize ── */
  window.addEventListener('resize', function () {
    if (!active) return;
    var s = steps[current];
    if (!s) return;
    if (!s.target) { positionCardCentered(); return; }
    var targetEl = document.querySelector(s.target);
    if (targetEl) {
      spotlightElement(targetEl, s.padding !== undefined ? s.padding : 8);
      positionCard(targetEl, s.placement || 'auto');
    }
  }, { passive: true });

  global.Tutorial = { init: init, start: start, reopen: start };

})(window);