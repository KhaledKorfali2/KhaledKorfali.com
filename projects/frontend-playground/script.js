// ================================================================
//  SCRIPT.JS  —  CSS Playground engine  (v3)
//
//  SECURITY MODEL
//  ══════════════
//  All preview output is written via iframe.srcdoc into an iframe
//  with sandbox="allow-scripts" and NO allow-same-origin.
//  This gives the iframe a null origin — it cannot access:
//    • parent / window.top / window.opener
//    • document.cookie  •  localStorage  •  sessionStorage
//    • any DOM outside itself
//
//  The srcdoc also includes a strict Content-Security-Policy meta
//  tag that blocks ALL external resource loads.
//
//  For editor-mode lessons, user-typed CSS and HTML pass through
//  sanitiseCSS() and sanitiseHTML() before reaching the iframe.
//  Those functions are purely regex-based — no eval, no parsing.
//
//  Nothing in this file calls:
//    eval()  •  new Function()  •  innerHTML on the host page
//    with dynamic user content  •  document.write()
//
//  The only innerHTML writes are:
//    1. The syntax-highlighted read-only code display — values
//       are escaped via esc() before any HTML token wrapping.
//    2. lesson.callout — lesson-author controlled static strings,
//       not user input. These are hardcoded in lessons.js.
// ================================================================

'use strict';

// ── State ─────────────────────────────────────────────────────
let allLessons      = [];
let currentIndex    = 0;
let completed       = new Set();
let knobValues      = {};
let activeTab       = 'css';
let activeEditorTab = 'css';

// ── Lesson list ───────────────────────────────────────────────
function buildLessonList() {
  allLessons = [];
  for (const chapter of CHAPTERS) {
    for (const lesson of chapter.lessons) {
      allLessons.push({ ...lesson, chapterLabel: chapter.label, chapterId: chapter.id });
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  SECURITY: SANITISERS
// ══════════════════════════════════════════════════════════════

/**
 * Sanitise CSS before injecting into the iframe.
 * Removes constructs that could load external resources or run JS.
 */
function sanitiseCSS(css) {
  return String(css)
    // Block external resource loads
    .replace(/url\s*\([^)]*\)/gi, 'url(about:blank)')
    // Block @import
    .replace(/@import\b[^;;\n]*/gi, '/* @import blocked */')
    // Block javascript: pseudo-protocol
    .replace(/javascript\s*:/gi, 'blocked:')
    // Block IE expression()
    .replace(/expression\s*\(/gi, 'blocked(')
    // Block -moz-binding
    .replace(/-moz-binding\s*:/gi, 'blocked:')
    // Block behavior:
    .replace(/behavior\s*:/gi, 'blocked:')
    // Block -o-link, -o-link-source (old Opera injection vectors)
    .replace(/-o-link\s*:/gi, 'blocked:')
    .replace(/-o-link-source\s*:/gi, 'blocked:');
}

/**
 * Sanitise HTML before injecting into the iframe.
 * Allowlist approach for dangerous patterns.
 */
function sanitiseHTML(html) {
  return String(html)
    // Strip <script> tags and their content entirely
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    // Strip dangerous elements wholesale
    .replace(/<\s*(iframe|object|embed|applet|form|base|meta|link|style)\b[^>]*>/gi, '<!-- blocked -->')
    // Strip closing tags for the above
    .replace(/<\/\s*(iframe|object|embed|applet|form|base|meta|link|style)\s*>/gi, '')
    // Strip ALL on* event handler attributes
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    // Strip javascript: / vbscript: / data: from href, src, action, etc.
    .replace(/(href|src|action|formaction|data|poster|background)\s*=\s*["']?\s*(?:javascript|vbscript|data)\s*:/gi, '$1="blocked:"')
    // Strip srcdoc attribute (could nest another document)
    .replace(/\bsrcdoc\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    // Strip XLink href (SVG-based injection vector)
    .replace(/xlink:href\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    // Strip SVG handler attributes not caught by the on* rule
    .replace(/\s+(?:href)\s*=\s*["']?\s*(?:javascript|vbscript)\s*:/gi, '');
}

/**
 * Validate a knob value against its declared type.
 * Returns a safe value that can be directly interpolated into CSS.
 */
function sanitiseKnobValue(knob, raw) {
  switch (knob.type) {
    case 'range': {
      const n = parseFloat(raw);
      if (isNaN(n)) return knob.default;
      return Math.min(knob.max, Math.max(knob.min, n));
    }
    case 'color': {
      const s = String(raw).trim();
      if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return s;
      if (/^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/.test(s)) return s;
      if (/^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*\)$/.test(s)) return s;
      if (/^hsl\(\s*[\d.]+\s*,\s*[\d.%]+\s*,\s*[\d.%]+\s*\)$/.test(s)) return s;
      if (/^hsla\(\s*[\d.]+\s*,\s*[\d.%]+\s*,\s*[\d.%]+\s*,\s*[\d.]+\s*\)$/.test(s)) return s;
      return knob.default;
    }
    case 'select': {
      const allowed = (knob.options || []).map(o => o.value);
      return allowed.includes(String(raw)) ? String(raw) : knob.default;
    }
    case 'toggle':
      return raw === true || raw === 'true' || raw === 1;
    case 'text': {
      // CSS value text: strip anything that could be an injection vector
      const s = String(raw).trim().slice(0, 120);
      return s
        .replace(/url\s*\(/gi, '')
        .replace(/javascript\s*:/gi, '')
        .replace(/<[^>]*>/g, '')      // no HTML tags
        .replace(/['"]/g, '');         // no quotes (would break CSS context)
    }
    default:
      return knob.default;
  }
}

// ══════════════════════════════════════════════════════════════
//  IFRAME RENDERER
// ══════════════════════════════════════════════════════════════
const frame = document.getElementById('preview-frame');

function buildIframeSrcdoc(css, html) {
  const safeCss  = sanitiseCSS(css);
  const safeHtml = sanitiseHTML(html);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:;">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: transparent;
  font-family: sans-serif;
  padding: 24px;
}
${safeCss}
</style>
</head>
<body>
${safeHtml}
</body>
</html>`;
}

function updatePreview() {
  const lesson = allLessons[currentIndex];
  if (!lesson) return;

  let css, html;

  if (lesson.type === 'editor') {
    // Editor mode: read directly from textareas
    // Locked tabs fall back to the lesson's own starter content
    css  = lesson.lockedCSS  ? (lesson.starterCSS  || '') : editorCssEl.value;
    html = lesson.lockedHTML ? (lesson.starterHTML || '') : editorHtmlEl.value;
  } else {
    // Knobs mode: interpolate from validated knob values
    const vals = getValidatedValues(lesson);
    const result = lesson.template(vals);
    css  = result.css;
    html = result.html;
  }

  frame.srcdoc = buildIframeSrcdoc(css, html);
  renderCode(css, html);
}

function getValidatedValues(lesson) {
  const vals = {};
  for (const knob of (lesson.knobs || [])) {
    const raw = knobValues[knob.id] !== undefined ? knobValues[knob.id] : knob.default;
    vals[knob.id] = sanitiseKnobValue(knob, raw);
  }
  return vals;
}

// ══════════════════════════════════════════════════════════════
//  SYNTAX HIGHLIGHTING (read-only code display)
// ══════════════════════════════════════════════════════════════

/** HTML-escape a string before inserting into innerHTML. */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function highlightCSS(css) {
  return css.split('\n').map(line => {
    let l = esc(line);

    // Comments
    l = l.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tok-comment">$1</span>');

    // @-rules
    if (/^\s*@/.test(l)) {
      l = l.replace(/^(\s*)(@[\w-]+)(.*)$/, '$1<span class="tok-kw">$2</span>$3');
      return l;
    }

    // Selector line (ends with {)
    if (/\{$/.test(l.trim())) {
      l = l.replace(/^(\s*)(.+?)(\{)/, '$1<span class="tok-sel">$2</span><span class="tok-brace">$3</span>');
      return l;
    }

    // Closing brace
    if (/^\s*\}/.test(l.trim())) {
      return l.replace(/(\})/, '<span class="tok-brace">$1</span>');
    }

    // property: value;
    l = l.replace(
      /^(\s*)([\w-]+)(\s*:\s*)(.*?)(;?\s*)$/,
      (_, ws, prop, colon, val, semi) =>
        `${ws}<span class="tok-prop">${esc(prop)}</span>${esc(colon)}${colourValue(val)}${esc(semi)}`
    );

    return l;
  }).join('\n');
}

function colourValue(val) {
  const v = String(val).trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v) || /^(rgb|hsl|rgba|hsla)\(/.test(v))
    return `<span class="tok-color">${esc(val)}</span>`;
  return esc(val).replace(/(-?[\d.]+)(px|em|rem|%|deg|s|ms|fr|vw|vh|ch|ex)?/g, (m, n, u) =>
    `<span class="tok-num">${esc(n)}</span>${u ? `<span class="tok-unit">${esc(u)}</span>` : ''}`
  );
}

function highlightHTML(html) {
  return html.split('\n').map(line => {
    let l = esc(line);
    l = l.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tok-comment">$1</span>');
    l = l.replace(/(&lt;\/?)([\w-]+)([^&]*)(&gt;)/g, (_, open, tag, attrs, close) => {
      const coloredAttrs = attrs.replace(/([\w:-]+)(=)(&quot;[^&]*&quot;|'[^']*'|\S+)/g,
        (m, attr, eq, val) => `<span class="tok-attr">${esc(attr)}</span>${eq}<span class="tok-str">${val}</span>`
      );
      return `${open}<span class="tok-tag">${esc(tag)}</span>${coloredAttrs}${close}`;
    });
    return l;
  }).join('\n');
}

function renderCode(css, html) {
  document.getElementById('code-css') .innerHTML = highlightCSS(css);
  document.getElementById('code-html').innerHTML = highlightHTML(html);
}

// ══════════════════════════════════════════════════════════════
//  KNOB BUILDER
// ══════════════════════════════════════════════════════════════
function buildKnobs(lesson, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  for (const knob of (lesson.knobs || [])) {
    const group = document.createElement('div');
    group.className = 'knob-group';

    if (knob.type === 'range') {
      const val = knobValues[knob.id] ?? knob.default;
      const labelRow = el('div', 'knob-label');
      const nameEl   = el('span', 'knob-name'); nameEl.textContent = knob.label;
      const valEl    = el('span', 'knob-value'); valEl.textContent = fmtVal(val, knob);
      labelRow.append(nameEl, valEl);

      const input = document.createElement('input');
      input.type = 'range'; input.min = knob.min; input.max = knob.max;
      input.step = knob.step; input.value = val;
      input.addEventListener('input', () => {
        knobValues[knob.id] = parseFloat(input.value);
        valEl.textContent = fmtVal(knobValues[knob.id], knob);
        updatePreview();
      });
      group.append(labelRow, input);

    } else if (knob.type === 'color') {
      const val = knobValues[knob.id] ?? knob.default;
      const labelRow = el('div', 'knob-label');
      const nameEl = el('span', 'knob-name'); nameEl.textContent = knob.label;
      labelRow.append(nameEl);
      const wrap = el('div', 'knob-color-wrap');
      const input = document.createElement('input'); input.type = 'color'; input.value = val;
      const valEl = el('span', 'knob-value'); valEl.textContent = val; valEl.style.fontSize = '10px';
      input.addEventListener('input', () => {
        knobValues[knob.id] = input.value; valEl.textContent = input.value; updatePreview();
      });
      wrap.append(input, valEl);
      group.append(labelRow, wrap);

    } else if (knob.type === 'select') {
      const val = knobValues[knob.id] ?? knob.default;
      const labelRow = el('div', 'knob-label');
      const nameEl = el('span', 'knob-name'); nameEl.textContent = knob.label;
      labelRow.append(nameEl);
      const select = document.createElement('select'); select.className = 'knob-select';
      for (const opt of knob.options) {
        const o = document.createElement('option');
        o.value = opt.value; o.textContent = opt.label;
        if (opt.value === val) o.selected = true;
        select.appendChild(o);
      }
      select.addEventListener('change', () => { knobValues[knob.id] = select.value; updatePreview(); });
      group.append(labelRow, select);

    } else if (knob.type === 'toggle') {
      const val = knobValues[knob.id] ?? knob.default;
      const label = document.createElement('label'); label.className = 'knob-toggle-wrap';
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = val;
      const track = el('span', 'toggle-track');
      const thumb = el('span', 'toggle-thumb'); track.appendChild(thumb);
      const nameEl = el('span', 'knob-name'); nameEl.textContent = knob.label;
      input.addEventListener('change', () => { knobValues[knob.id] = input.checked; updatePreview(); });
      label.append(input, track, nameEl);
      group.appendChild(label);

    } else if (knob.type === 'text') {
      const val = knobValues[knob.id] ?? knob.default;
      const labelRow = el('div', 'knob-label');
      const nameEl = el('span', 'knob-name'); nameEl.textContent = knob.label;
      labelRow.append(nameEl);
      const input = document.createElement('input');
      input.type = 'text'; input.className = 'knob-text';
      input.value = val; input.maxLength = 120; input.spellcheck = false;
      input.addEventListener('input', () => { knobValues[knob.id] = input.value; updatePreview(); });
      group.append(labelRow, input);
    }

    container.appendChild(group);
  }
}

function el(tag, cls) { const e = document.createElement(tag); e.className = cls; return e; }

function fmtVal(val, knob) {
  const n = parseFloat(val);
  const r = Number.isInteger(knob.step) ? Math.round(n) : parseFloat(n.toFixed(2));
  return `${r}${knob.unit || ''}`;
}

// ══════════════════════════════════════════════════════════════
//  EDITOR MODE
// ══════════════════════════════════════════════════════════════
const editorCssEl  = document.getElementById('editor-css');
const editorHtmlEl = document.getElementById('editor-html');
const editorArea   = document.getElementById('editor-area');
const codeScroll   = document.getElementById('code-scroll');
const applyBtn     = document.getElementById('applyBtn');
const editorError  = document.getElementById('editor-error');
const editorHint   = document.getElementById('editor-hint');

function showEditorMode(lesson) {
  codeScroll.style.display = 'none';
  editorArea.style.display = 'flex';

  editorCssEl.value  = lesson.starterCSS  || '';
  editorHtmlEl.value = lesson.starterHTML || '';

  const cssTab  = document.querySelector('.editor-tab[data-etab="css"]');
  const htmlTab = document.querySelector('.editor-tab[data-etab="html"]');

  if (lesson.lockedHTML) {
    htmlTab.style.opacity       = '0.35';
    htmlTab.style.pointerEvents = 'none';
    htmlTab.title = 'HTML is locked for this lesson';
  } else {
    htmlTab.style.opacity       = '';
    htmlTab.style.pointerEvents = '';
    htmlTab.title = '';
  }

  if (lesson.lockedCSS) {
    cssTab.style.opacity       = '0.35';
    cssTab.style.pointerEvents = 'none';
    cssTab.title = 'CSS is locked for this lesson';
  } else {
    cssTab.style.opacity       = '';
    cssTab.style.pointerEvents = '';
    cssTab.title = '';
  }

  if (lesson.editorHint) {
    // editorHint is lesson-author content; use innerHTML intentionally (same trust level as callout)
    editorHint.innerHTML = lesson.editorHint;
    editorHint.style.display = 'block';
  } else {
    editorHint.style.display = 'none';
  }

  editorError.textContent = '';
  switchEditorTab('css');
  updatePreview();
}

function hideEditorMode() {
  codeScroll.style.display = '';
  editorArea.style.display = 'none';
}

function switchEditorTab(tab) {
  activeEditorTab = tab;
  document.querySelectorAll('.editor-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.etab === tab));
  editorCssEl .style.display = tab === 'css'  ? 'block' : 'none';
  editorHtmlEl.style.display = tab === 'html' ? 'block' : 'none';
}

document.querySelectorAll('.editor-tab').forEach(btn =>
  btn.addEventListener('click', () => switchEditorTab(btn.dataset.etab)));

applyBtn?.addEventListener('click', () => {
  editorError.textContent = '';
  updatePreview();
});

[editorCssEl, editorHtmlEl].forEach(ta => {
  ta?.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = ta.selectionStart, end = ta.selectionEnd;
      ta.value = ta.value.slice(0, start) + '  ' + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = start + 2;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      editorError.textContent = '';
      updatePreview();
    }
  });

  let liveTimer = null;
  ta?.addEventListener('input', () => {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(updatePreview, 400);
  });
});

function addHintButton(lesson) {
  document.getElementById('hintBtn')?.remove();
  if (!lesson.solutionCSS && !lesson.solutionHTML) return;

  const btn = document.createElement('button');
  btn.id = 'hintBtn';
  btn.className = 'small-btn';
  btn.textContent = 'Show hint';
  btn.dataset.tip = 'Replace your code with a working solution';
  btn.addEventListener('click', () => {
    if (lesson.solutionCSS  && !lesson.lockedCSS)  editorCssEl.value  = lesson.solutionCSS;
    if (lesson.solutionHTML && !lesson.lockedHTML) editorHtmlEl.value = lesson.solutionHTML;
    updatePreview();
  });
  document.getElementById('preview-actions')?.appendChild(btn);
}

// ══════════════════════════════════════════════════════════════
//  LOAD LESSON
// ══════════════════════════════════════════════════════════════
function loadLesson(index) {
  if (index < 0 || index >= allLessons.length) return;
  currentIndex = index;
  const lesson = allLessons[index];

  // Reset knob values to defaults
  knobValues = {};
  for (const k of (lesson.knobs || [])) knobValues[k.id] = k.default;

  // Header — use textContent for all user-visible fields to prevent XSS
  document.getElementById('lesson-chapter').textContent = lesson.chapterLabel;
  document.getElementById('lesson-title').textContent   = lesson.title;
  document.getElementById('lesson-desc').textContent    = lesson.description;

  // Badge
  const badge = document.getElementById('lesson-type-badge');
  badge.className = 'lesson-badge';
  if (lesson.type === 'editor') {
    badge.textContent = 'Editor';
    badge.classList.add('badge-editor');
  } else {
    badge.textContent = 'Interactive';
    badge.classList.add('badge-knobs');
  }

  // Concept tags — textContent only, never innerHTML
  const tagsEl = document.getElementById('concept-tags');
  tagsEl.innerHTML = '';
  for (const c of (lesson.concepts || [])) {
    const t = document.createElement('span');
    t.className = 'concept-tag';
    t.textContent = c;  // safe: textContent, not innerHTML
    tagsEl.appendChild(t);
  }

  // Callout — lesson-author static content, innerHTML is intentional here.
  // This is NOT user input; it is hardcoded in lessons.js.
  const calloutEl = document.getElementById('lesson-callout');
  if (lesson.callout) {
    calloutEl.innerHTML = lesson.callout;
    calloutEl.classList.add('visible');
  } else {
    calloutEl.innerHTML = '';
    calloutEl.classList.remove('visible');
  }

  // Build knobs
  buildKnobs(lesson, 'knobs-area');
  buildKnobs(lesson, 'mobile-knobs-inner');

  // Code pane mode
  if (lesson.type === 'editor') {
    showEditorMode(lesson);
    addHintButton(lesson);
  } else {
    hideEditorMode();
    document.getElementById('hintBtn')?.remove();
  }

  // Nav buttons
  document.getElementById('prevBtn').disabled = index === 0;
  document.getElementById('nextBtn').disabled = index === allLessons.length - 1;

  updateProgress();
  updatePreview();
  switchTab('css');
  document.getElementById('code-scroll').scrollTop = 0;
}

// ══════════════════════════════════════════════════════════════
//  SIDEBAR
// ══════════════════════════════════════════════════════════════
function buildSidebar() {
  const listEl = document.getElementById('chapter-list');
  listEl.innerHTML = '';
  for (const chapter of CHAPTERS) {
    const group = document.createElement('div');
    group.className = 'chapter-group';

    const heading = document.createElement('div');
    heading.className = 'chapter-heading';
    heading.textContent = chapter.label;  // textContent, not innerHTML
    group.appendChild(heading);

    for (const lesson of chapter.lessons) {
      const flatIndex = allLessons.findIndex(l => l.id === lesson.id);
      const btn = document.createElement('button');
      btn.className = 'lesson-item';
      btn.dataset.idx = flatIndex;

      const dot = document.createElement('span'); dot.className = 'lesson-dot';
      btn.appendChild(dot);
      btn.appendChild(document.createTextNode(lesson.title));

      if (lesson.type === 'editor') {
        const edDot = document.createElement('span');
        edDot.className = 'lesson-type-dot';
        edDot.title = 'Editor lesson';
        btn.appendChild(edDot);
      }

      btn.addEventListener('click', () => { markCurrentComplete(); loadLesson(flatIndex); });
      group.appendChild(btn);
    }
    listEl.appendChild(group);
  }
}

function markCurrentComplete() {
  completed.add(allLessons[currentIndex].id);
  updateProgress();
}

function updateProgress() {
  document.querySelectorAll('.lesson-item').forEach((el, i) => {
    const id  = allLessons[i]?.id;
    const dot = el.querySelector('.lesson-dot');
    if (!dot) return;
    el.classList.toggle('done',   completed.has(id));
    el.classList.toggle('active', i === currentIndex);
  });
  const pct = allLessons.length ? completed.size / allLessons.length * 100 : 0;
  document.getElementById('progress-bar-fill').style.width = pct + '%';
  document.getElementById('progress-label').textContent =
    `${completed.size} / ${allLessons.length} complete`;
}

// ══════════════════════════════════════════════════════════════
//  PANE COLLAPSE / EXPAND
// ══════════════════════════════════════════════════════════════

// Sidebar
document.getElementById('sidebarCollapseBtn')?.addEventListener('click', () => {
  document.body.classList.add('sidebar-collapsed');
});
document.getElementById('sidebarExpandTab')?.addEventListener('click', () => {
  document.body.classList.remove('sidebar-collapsed');
});

// Controls pane
document.getElementById('controlsCollapseBtn')?.addEventListener('click', () => {
  document.body.classList.add('controls-collapsed');
});
document.getElementById('controls-open-btn')?.addEventListener('click', () => {
  document.body.classList.remove('controls-collapsed');
});

// Code pane
document.getElementById('codeCollapseBtn')?.addEventListener('click', () => {
  document.body.classList.add('code-collapsed');
});
document.getElementById('code-open-btn')?.addEventListener('click', () => {
  document.body.classList.remove('code-collapsed');
});

// ══════════════════════════════════════════════════════════════
//  RESIZE: SIDEBAR
// ══════════════════════════════════════════════════════════════
(function initSidebarResize() {
  const handle  = document.getElementById('sidebar-resize-handle');
  const sidebar = document.getElementById('sidebar');
  const main    = document.getElementById('main');
  if (!handle || !sidebar) return;

  let startX, startW;

  handle.addEventListener('mousedown', e => {
    if (document.body.classList.contains('sidebar-collapsed')) return;
    e.preventDefault();
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    handle.classList.add('dragging');
    document.body.classList.add('resizing-sidebar');

    function onMove(e) {
      const delta = e.clientX - startX;
      const newW  = Math.min(360, Math.max(160, startW + delta));
      sidebar.style.width = newW + 'px';
      main.style.marginLeft = newW + 'px';
    }

    function onUp() {
      handle.classList.remove('dragging');
      document.body.classList.remove('resizing-sidebar');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
})();

// ══════════════════════════════════════════════════════════════
//  RESIZE: CONTROLS ↔ PREVIEW ↔ CODE
// ══════════════════════════════════════════════════════════════
(function initColResize() {
  /**
   * Make a column resize handle work.
   * @param {string} handleId     — the drag handle element id
   * @param {string} leftPaneId   — the pane to the left of the handle
   * @param {string} rightPaneId  — the pane to the right (or null if it's the flex filler)
   * @param {'left'|'right'} side — which pane's width we set explicitly
   */
  function makeHandle(handleId, leftPaneId, rightPaneId, side) {
    const handle    = document.getElementById(handleId);
    const leftPane  = document.getElementById(leftPaneId);
    const rightPane = rightPaneId ? document.getElementById(rightPaneId) : null;
    if (!handle || !leftPane) return;

    let startX, startLeftW, startRightW;

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      startX      = e.clientX;
      startLeftW  = leftPane.offsetWidth;
      startRightW = rightPane ? rightPane.offsetWidth : 0;
      handle.classList.add('dragging');
      document.body.classList.add('resizing-col');

      function onMove(e) {
        const delta = e.clientX - startX;

        if (side === 'left') {
          // Dragging the controls ↔ preview handle: adjust controls width
          const newW = Math.min(480, Math.max(180, startLeftW + delta));
          leftPane.style.width = newW + 'px';
          // Sync CSS variable so collapse logic still works cleanly
          document.documentElement.style.setProperty('--controls-w', newW + 'px');
        } else {
          // Dragging the preview ↔ code handle: adjust code width
          if (!rightPane) return;
          const newW = Math.min(600, Math.max(180, startRightW - delta));
          rightPane.style.width = newW + 'px';
          document.documentElement.style.setProperty('--code-w', newW + 'px');
        }
      }

      function onUp() {
        handle.classList.remove('dragging');
        document.body.classList.remove('resizing-col');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  makeHandle('resize-handle-controls', 'controls-pane', 'code-pane', 'left');
  makeHandle('resize-handle-code',     'preview-pane',  'code-pane', 'right');
})();

// ══════════════════════════════════════════════════════════════
//  NAV BUTTONS & RESET
// ══════════════════════════════════════════════════════════════
document.getElementById('prevBtn')?.addEventListener('click', () => {
  if (currentIndex > 0) { markCurrentComplete(); loadLesson(currentIndex - 1); }
});
document.getElementById('nextBtn')?.addEventListener('click', () => {
  if (currentIndex < allLessons.length - 1) { markCurrentComplete(); loadLesson(currentIndex + 1); }
});
document.getElementById('resetBtn')?.addEventListener('click', () => {
  const lesson = allLessons[currentIndex];
  if (!lesson) return;
  if (lesson.type === 'editor') {
    editorCssEl.value  = lesson.starterCSS  || '';
    editorHtmlEl.value = lesson.starterHTML || '';
  } else {
    for (const k of (lesson.knobs || [])) knobValues[k.id] = k.default;
    buildKnobs(lesson, 'knobs-area');
    buildKnobs(lesson, 'mobile-knobs-inner');
  }
  updatePreview();
});

// ══════════════════════════════════════════════════════════════
//  CODE TABS (read-only view)
// ══════════════════════════════════════════════════════════════
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.code-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('code-css') .classList.toggle('active', tab === 'css');
  document.getElementById('code-html').classList.toggle('active', tab === 'html');
}
document.querySelectorAll('.code-tab').forEach(btn =>
  btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

// ══════════════════════════════════════════════════════════════
//  MOBILE SHEET
// ══════════════════════════════════════════════════════════════
const mobileBtn      = document.getElementById('mobile-knobs-btn');
const mobileSheet    = document.getElementById('mobile-knobs-sheet');
const mobileBackdrop = document.getElementById('mobile-sheet-backdrop');

function openMobileSheet()  { mobileSheet.classList.add('open');    mobileBackdrop.classList.add('visible'); }
function closeMobileSheet() { mobileSheet.classList.remove('open'); mobileBackdrop.classList.remove('visible'); }

mobileBtn     ?.addEventListener('click', openMobileSheet);
mobileBackdrop?.addEventListener('click', closeMobileSheet);

let mobileSwipeY = 0;
document.getElementById('mobile-sheet-handle')?.addEventListener('touchstart',
  e => { mobileSwipeY = e.touches[0].clientY; }, { passive: true });
document.getElementById('mobile-sheet-handle')?.addEventListener('touchend',
  e => { if (e.changedTouches[0].clientY - mobileSwipeY > 40) closeMobileSheet(); }, { passive: true });

// ══════════════════════════════════════════════════════════════
//  TOOLTIP
// ══════════════════════════════════════════════════════════════
const tooltip = document.getElementById('tooltip');
let tipTimer  = null;

function showTip(text, rect) {
  clearTimeout(tipTimer);
  tooltip.textContent = text;  // textContent — never innerHTML for tooltip
  tooltip.classList.remove('visible');
  tooltip.style.left    = '-9999px';
  tooltip.style.display = 'block';
  const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
  const vw = window.innerWidth;
  tooltip.style.display = '';
  const MARGIN = 8, GAP = 6;
  let top  = rect.top - th - GAP;
  if (top < MARGIN) top = rect.bottom + GAP;
  let left = rect.left + rect.width / 2 - tw / 2;
  left = Math.max(MARGIN, Math.min(left, vw - tw - MARGIN));
  tooltip.style.left = left + 'px';
  tooltip.style.top  = top  + 'px';
  void tooltip.offsetWidth;
  tooltip.classList.add('visible');
}

function hideTip() { clearTimeout(tipTimer); tooltip.classList.remove('visible'); }

function findTipEl(target) {
  let node = target;
  while (node && node !== document.body) {
    if (node.dataset?.tip) return node;
    node = node.parentElement;
  }
  return null;
}

document.addEventListener('mouseover', e => {
  const t = findTipEl(e.target);
  if (!t) { hideTip(); return; }
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => showTip(t.dataset.tip, t.getBoundingClientRect()), 320);
});
document.addEventListener('mouseout', e => {
  const t = findTipEl(e.target);
  if (t && !t.contains(e.relatedTarget)) { clearTimeout(tipTimer); hideTip(); }
});

// ══════════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ══════════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName;
  // Don't intercept when user is typing in inputs/textareas
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    if (currentIndex < allLessons.length - 1) { markCurrentComplete(); loadLesson(currentIndex + 1); }
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (currentIndex > 0) { markCurrentComplete(); loadLesson(currentIndex - 1); }
  }
  // Escape to close mobile sheet
  if (e.key === 'Escape') closeMobileSheet();
});

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
buildLessonList();
buildSidebar();
loadLesson(0);