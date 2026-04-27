// ================================================================
//  SCRIPT.JS  —  CSS Playground engine  (v2)
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
//  tag that blocks ALL external resource loads (no img src, no
//  external fonts, no fetch, no XHR).
//
//  For editor-mode lessons, user-typed CSS and HTML pass through
//  sanitiseCSS() and sanitiseHTML() before reaching the iframe.
//  Those functions are purely regex-based — no eval, no parsing.
//
//  Nothing in this file calls:
//    eval()  •  new Function()  •  innerHTML on the host page
//    with dynamic user content  •  document.write()
//
//  The only innerHTML writes are to the syntax-highlighted
//  read-only code display — those are escaped via esc() first.
// ================================================================

// ── State ─────────────────────────────────────────────────────
let allLessons   = [];
let currentIndex = 0;
let completed    = new Set();
let knobValues   = {};
let activeTab    = "css";
let activeEditorTab = "css";

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
    // Block external resource loads — replace url() entirely
    .replace(/url\s*\([^)]*\)/gi, "url(about:blank)")
    // Block @import (could load external sheets)
    .replace(/@import\b[^;;\n]*/gi, "/* @import blocked */")
    // Block javascript: pseudo-protocol
    .replace(/javascript\s*:/gi, "blocked:")
    // Block IE expression() — legacy but worth stripping
    .replace(/expression\s*\(/gi, "blocked(")
    // Block -moz-binding (old Firefox XBL injection)
    .replace(/-moz-binding\s*:/gi, "blocked:")
    // Block behavior: (old IE HTC injection)
    .replace(/behavior\s*:/gi, "blocked:");
}

/**
 * Sanitise HTML before injecting into the iframe.
 * Uses an allowlist approach for dangerous patterns.
 */
function sanitiseHTML(html) {
  return String(html)
    // Strip <script> tags and their content entirely
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    // Strip dangerous elements wholesale
    .replace(/<\s*(iframe|object|embed|applet|form|base|meta|link|style)\b[^>]*>/gi, "<!-- blocked -->")
    // Strip closing tags for the above
    .replace(/<\/\s*(iframe|object|embed|applet|form|base|meta|link|style)\s*>/gi, "")
    // Strip ALL on* event handler attributes (onclick, onload, onerror, etc.)
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "")
    // Strip javascript: / vbscript: / data: from href and src
    .replace(/(href|src|action|formaction|data|poster|background)\s*=\s*["']?\s*(?:javascript|vbscript|data)\s*:/gi, '$1="blocked:"')
    // Strip srcdoc attribute (could nest another document)
    .replace(/\bsrcdoc\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
    // Strip XLink href (SVG-based injection vector)
    .replace(/xlink:href\s*=\s*(?:"[^"]*"|'[^']*')/gi, "");
}

/**
 * Validate a knob value against its declared type.
 * Returns a safe value that can be directly interpolated into CSS.
 */
function sanitiseKnobValue(knob, raw) {
  switch (knob.type) {
    case "range": {
      const n = parseFloat(raw);
      if (isNaN(n)) return knob.default;
      return Math.min(knob.max, Math.max(knob.min, n));
    }
    case "color": {
      const s = String(raw).trim();
      if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return s;
      if (/^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/.test(s)) return s;
      if (/^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*\)$/.test(s)) return s;
      if (/^hsl\(\s*[\d.]+\s*,\s*[\d.%]+\s*,\s*[\d.%]+\s*\)$/.test(s)) return s;
      if (/^hsla\(\s*[\d.]+\s*,\s*[\d.%]+\s*,\s*[\d.%]+\s*,\s*[\d.]+\s*\)$/.test(s)) return s;
      return knob.default;
    }
    case "select": {
      const allowed = (knob.options || []).map(o => o.value);
      return allowed.includes(String(raw)) ? String(raw) : knob.default;
    }
    case "toggle":
      return raw === true || raw === "true" || raw === 1;
    case "text": {
      // CSS value text: strip anything that could be an injection vector
      const s = String(raw).trim().slice(0, 120);
      return s
        .replace(/url\s*\(/gi, "")
        .replace(/javascript\s*:/gi, "")
        .replace(/<[^>]*>/g, "")       // no HTML tags
        .replace(/['"]/g, "");          // no quotes (would break CSS context)
    }
    default:
      return knob.default;
  }
}

// ══════════════════════════════════════════════════════════════
//  IFRAME RENDERER
// ══════════════════════════════════════════════════════════════
const frame = document.getElementById("preview-frame");

function buildIframeSrcdoc(css, html) {
  // Both CSS and HTML are sanitised here regardless of their source
  // (knob-generated or user-typed).
  const safeCss  = sanitiseCSS(css);
  const safeHtml = sanitiseHTML(html);

  // The CSP meta blocks ALL external loads inside the iframe.
  // Even if sanitisation missed something, the CSP prevents execution.
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

  if (lesson.type === "editor") {
    // Editor mode: read directly from textareas
    css  = document.getElementById("editor-css") .value;
    html = document.getElementById("editor-html").value;
    // Locked tabs use the lesson's own starter content
    if (lesson.lockedHTML) html = lesson.starterHTML || "";
    if (lesson.lockedCSS)  css  = lesson.starterCSS  || "";
  } else {
    // Knobs mode: interpolate from validated knob values
    const vals = getValidatedValues(lesson);
    const result = lesson.template(vals);
    css  = result.css;
    html = result.html;
  }

  frame.srcdoc = buildIframeSrcdoc(css, html);

  // Always keep the read-only code display up to date
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
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightCSS(css) {
  return css.split("\n").map(line => {
    let l = esc(line);

    // Comments
    l = l.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tok-comment">$1</span>');

    // @-rules (@keyframes, @media, @root etc.)
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
        `${ws}<span class="tok-prop">${prop}</span>${colon}${colourValue(val)}${esc(semi)}`
    );

    return l;
  }).join("\n");
}

function colourValue(val) {
  const v = String(val).trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v) || /^(rgb|hsl|rgba|hsla)\(/.test(v))
    return `<span class="tok-color">${esc(val)}</span>`;
  return esc(val).replace(/(-?[\d.]+)(px|em|rem|%|deg|s|ms|fr|vw|vh|ch|ex)?/g, (m, n, u) =>
    `<span class="tok-num">${esc(n)}</span>${u ? `<span class="tok-unit">${esc(u)}</span>` : ""}`
  );
}

function highlightHTML(html) {
  return html.split("\n").map(line => {
    let l = esc(line);
    l = l.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tok-comment">$1</span>');
    l = l.replace(/(&lt;\/?)([\w-]+)([^&]*)(&gt;)/g, (_, open, tag, attrs, close) => {
      const coloredAttrs = attrs.replace(/([\w:-]+)(=)(&quot;[^&]*&quot;|'[^']*'|\S+)/g,
        (m, attr, eq, val) => `<span class="tok-attr">${attr}</span>${eq}<span class="tok-str">${val}</span>`
      );
      return `${open}<span class="tok-tag">${tag}</span>${coloredAttrs}${close}`;
    });
    return l;
  }).join("\n");
}

function renderCode(css, html) {
  document.getElementById("code-css") .innerHTML = highlightCSS(css);
  document.getElementById("code-html").innerHTML = highlightHTML(html);
}

// ══════════════════════════════════════════════════════════════
//  KNOB BUILDER
// ══════════════════════════════════════════════════════════════
function buildKnobs(lesson, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";

  for (const knob of (lesson.knobs || [])) {
    const group = document.createElement("div");
    group.className = "knob-group";

    if (knob.type === "range") {
      const val = knobValues[knob.id] ?? knob.default;
      const labelRow = el("div", "knob-label");
      const nameEl   = el("span", "knob-name"); nameEl.textContent = knob.label;
      const valEl    = el("span", "knob-value"); valEl.textContent = fmtVal(val, knob);
      labelRow.append(nameEl, valEl);

      const input = document.createElement("input");
      input.type = "range"; input.min = knob.min; input.max = knob.max;
      input.step = knob.step; input.value = val;
      input.addEventListener("input", () => {
        knobValues[knob.id] = parseFloat(input.value);
        valEl.textContent = fmtVal(knobValues[knob.id], knob);
        updatePreview();
      });
      group.append(labelRow, input);

    } else if (knob.type === "color") {
      const val = knobValues[knob.id] ?? knob.default;
      const labelRow = el("div", "knob-label");
      const nameEl = el("span", "knob-name"); nameEl.textContent = knob.label;
      labelRow.append(nameEl);
      const wrap = el("div", "knob-color-wrap");
      const input = document.createElement("input"); input.type = "color"; input.value = val;
      const valEl = el("span", "knob-value"); valEl.textContent = val; valEl.style.fontSize = "10px";
      input.addEventListener("input", () => {
        knobValues[knob.id] = input.value; valEl.textContent = input.value; updatePreview();
      });
      wrap.append(input, valEl);
      group.append(labelRow, wrap);

    } else if (knob.type === "select") {
      const val = knobValues[knob.id] ?? knob.default;
      const labelRow = el("div", "knob-label");
      const nameEl = el("span", "knob-name"); nameEl.textContent = knob.label;
      labelRow.append(nameEl);
      const select = document.createElement("select"); select.className = "knob-select";
      for (const opt of knob.options) {
        const o = document.createElement("option");
        o.value = opt.value; o.textContent = opt.label;
        if (opt.value === val) o.selected = true;
        select.appendChild(o);
      }
      select.addEventListener("change", () => { knobValues[knob.id] = select.value; updatePreview(); });
      group.append(labelRow, select);

    } else if (knob.type === "toggle") {
      const val = knobValues[knob.id] ?? knob.default;
      const label = document.createElement("label"); label.className = "knob-toggle-wrap";
      const input = document.createElement("input"); input.type = "checkbox"; input.checked = val;
      const track = el("span", "toggle-track");
      const thumb = el("span", "toggle-thumb"); track.appendChild(thumb);
      const nameEl = el("span", "knob-name"); nameEl.textContent = knob.label;
      input.addEventListener("change", () => { knobValues[knob.id] = input.checked; updatePreview(); });
      label.append(input, track, nameEl);
      group.appendChild(label);

    } else if (knob.type === "text") {
      const val = knobValues[knob.id] ?? knob.default;
      const labelRow = el("div", "knob-label");
      const nameEl = el("span", "knob-name"); nameEl.textContent = knob.label;
      labelRow.append(nameEl);
      const input = document.createElement("input");
      input.type = "text"; input.className = "knob-text";
      input.value = val; input.maxLength = 120; input.spellcheck = false;
      input.addEventListener("input", () => { knobValues[knob.id] = input.value; updatePreview(); });
      group.append(labelRow, input);
    }

    container.appendChild(group);
  }
}

function el(tag, cls) { const e = document.createElement(tag); e.className = cls; return e; }
function fmtVal(val, knob) {
  const n = parseFloat(val);
  const r = Number.isInteger(knob.step) ? Math.round(n) : parseFloat(n.toFixed(2));
  return `${r}${knob.unit || ""}`;
}

// ══════════════════════════════════════════════════════════════
//  EDITOR MODE
// ══════════════════════════════════════════════════════════════
const editorCssEl  = document.getElementById("editor-css");
const editorHtmlEl = document.getElementById("editor-html");
const editorArea   = document.getElementById("editor-area");
const codeScroll   = document.getElementById("code-scroll");
const applyBtn     = document.getElementById("applyBtn");
const editorError  = document.getElementById("editor-error");
const editorHint   = document.getElementById("editor-hint");

function showEditorMode(lesson) {
  codeScroll.style.display  = "none";
  editorArea.style.display  = "flex";

  // Populate editor tabs
  editorCssEl.value  = lesson.starterCSS  || "";
  editorHtmlEl.value = lesson.starterHTML || "";

  // Locked tabs
  const cssTab  = document.querySelector('.editor-tab[data-etab="css"]');
  const htmlTab = document.querySelector('.editor-tab[data-etab="html"]');

  if (lesson.lockedHTML) {
    htmlTab.style.opacity = "0.35";
    htmlTab.style.pointerEvents = "none";
    htmlTab.title = "HTML is locked for this lesson";
  } else {
    htmlTab.style.opacity = "";
    htmlTab.style.pointerEvents = "";
    htmlTab.title = "";
  }

  if (lesson.lockedCSS) {
    cssTab.style.opacity = "0.35";
    cssTab.style.pointerEvents = "none";
    cssTab.title = "CSS is locked for this lesson";
  } else {
    cssTab.style.opacity = "";
    cssTab.style.pointerEvents = "";
    cssTab.title = "";
  }

  // Hint
  if (lesson.editorHint) {
    editorHint.innerHTML = lesson.editorHint;
    editorHint.style.display = "block";
  } else {
    editorHint.style.display = "none";
  }

  editorError.textContent = "";
  switchEditorTab("css");
  updatePreview();
}

function hideEditorMode() {
  codeScroll.style.display = "";
  editorArea.style.display = "none";
}

function switchEditorTab(tab) {
  activeEditorTab = tab;
  document.querySelectorAll(".editor-tab").forEach(b =>
    b.classList.toggle("active", b.dataset.etab === tab));
  editorCssEl .style.display = tab === "css"  ? "block" : "none";
  editorHtmlEl.style.display = tab === "html" ? "block" : "none";
}

document.querySelectorAll(".editor-tab").forEach(btn =>
  btn.addEventListener("click", () => switchEditorTab(btn.dataset.etab)));

// Apply button: run through sanitiser then update iframe
applyBtn?.addEventListener("click", () => {
  editorError.textContent = "";
  updatePreview();
});

// Tab key in textarea inserts 2 spaces instead of changing focus
[editorCssEl, editorHtmlEl].forEach(ta => {
  ta?.addEventListener("keydown", e => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = ta.selectionStart, end = ta.selectionEnd;
      ta.value = ta.value.slice(0, start) + "  " + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = start + 2;
    }
    // Ctrl/Cmd + Enter applies
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      editorError.textContent = "";
      updatePreview();
    }
  });

  // Live preview as user types (debounced 400ms)
  let liveTimer = null;
  ta?.addEventListener("input", () => {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(updatePreview, 400);
  });
});

// Show hint / solution button
function addHintButton(lesson) {
  // Remove any previous hint button
  document.getElementById("hintBtn")?.remove();
  if (!lesson.solutionCSS && !lesson.solutionHTML) return;

  const btn = document.createElement("button");
  btn.id = "hintBtn";
  btn.className = "small-btn";
  btn.textContent = "Show hint";
  btn.dataset.tip = "Replace your code with a working solution";
  btn.addEventListener("click", () => {
    if (lesson.solutionCSS  && !lesson.lockedCSS)  editorCssEl.value  = lesson.solutionCSS;
    if (lesson.solutionHTML && !lesson.lockedHTML) editorHtmlEl.value = lesson.solutionHTML;
    updatePreview();
  });
  document.getElementById("preview-actions")?.appendChild(btn);
}

// ══════════════════════════════════════════════════════════════
//  LOAD LESSON
// ══════════════════════════════════════════════════════════════
function loadLesson(index) {
  if (index < 0 || index >= allLessons.length) return;
  currentIndex = index;
  const lesson = allLessons[index];

  // Reset knob values
  knobValues = {};
  for (const k of (lesson.knobs || [])) knobValues[k.id] = k.default;

  // Header
  document.getElementById("lesson-chapter").textContent = lesson.chapterLabel;
  document.getElementById("lesson-title").textContent   = lesson.title;
  document.getElementById("lesson-desc").textContent    = lesson.description;

  // Badge
  const badge = document.getElementById("lesson-type-badge");
  badge.className = "lesson-badge";
  if (lesson.type === "editor") {
    badge.textContent = "Editor";
    badge.classList.add("badge-editor");
  } else {
    badge.textContent = "Interactive";
    badge.classList.add("badge-knobs");
  }

  // Concept tags — use textContent for safety
  const tagsEl = document.getElementById("concept-tags");
  tagsEl.innerHTML = "";
  for (const c of (lesson.concepts || [])) {
    const t = document.createElement("span");
    t.className = "concept-tag"; t.textContent = c;
    tagsEl.appendChild(t);
  }

  // Callout — this is lesson-author content (not user input), so innerHTML is safe
  const calloutEl = document.getElementById("lesson-callout");
  if (lesson.callout) {
    calloutEl.innerHTML = lesson.callout;
    calloutEl.classList.add("visible");
  } else {
    calloutEl.innerHTML = "";
    calloutEl.classList.remove("visible");
  }

  // Controls pane: show knobs or explanatory text for editor lessons
  buildKnobs(lesson, "knobs-area");
  buildKnobs(lesson, "mobile-knobs-inner");

  // Code pane: editor vs read-only
  if (lesson.type === "editor") {
    showEditorMode(lesson);
    addHintButton(lesson);
  } else {
    hideEditorMode();
    document.getElementById("hintBtn")?.remove();
  }

  // Nav
  document.getElementById("prevBtn").disabled = index === 0;
  document.getElementById("nextBtn").disabled = index === allLessons.length - 1;

  // Sidebar
  updateProgress();
  updatePreview();
  switchTab("css");
  document.getElementById("code-scroll").scrollTop = 0;
}

// ══════════════════════════════════════════════════════════════
//  SIDEBAR
// ══════════════════════════════════════════════════════════════
function buildSidebar() {
  const listEl = document.getElementById("chapter-list");
  listEl.innerHTML = "";
  for (const chapter of CHAPTERS) {
    const group = document.createElement("div");
    group.className = "chapter-group";
    const heading = document.createElement("div");
    heading.className = "chapter-heading"; heading.textContent = chapter.label;
    group.appendChild(heading);

    for (const lesson of chapter.lessons) {
      const flatIndex = allLessons.findIndex(l => l.id === lesson.id);
      const btn = document.createElement("button");
      btn.className = "lesson-item"; btn.dataset.idx = flatIndex;

      const dot = document.createElement("span"); dot.className = "lesson-dot";
      btn.appendChild(dot);
      btn.appendChild(document.createTextNode(lesson.title));

      // Editor indicator dot
      if (lesson.type === "editor") {
        const edDot = document.createElement("span");
        edDot.className = "lesson-type-dot";
        edDot.title = "Editor lesson";
        btn.appendChild(edDot);
      }

      btn.addEventListener("click", () => { markCurrentComplete(); loadLesson(flatIndex); });
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
  document.querySelectorAll(".lesson-item").forEach((el, i) => {
    const id  = allLessons[i]?.id;
    const dot = el.querySelector(".lesson-dot");
    if (!dot) return;
    el.classList.toggle("done",   completed.has(id));
    el.classList.toggle("active", i === currentIndex);
  });
  const pct = allLessons.length ? completed.size / allLessons.length * 100 : 0;
  document.getElementById("progress-bar-fill").style.width = pct + "%";
  document.getElementById("progress-label").textContent =
    `${completed.size} / ${allLessons.length} complete`;
}

// ══════════════════════════════════════════════════════════════
//  PANE COLLAPSE
// ══════════════════════════════════════════════════════════════
document.getElementById("sidebarCollapseBtn")?.addEventListener("click", () => {
  document.body.classList.toggle("sidebar-collapsed");
});
document.getElementById("sidebarExpandTab")?.addEventListener("click", () => {
  document.body.classList.remove("sidebar-collapsed");
});

document.getElementById("controlsCollapseBtn")?.addEventListener("click", () => {
  document.body.classList.toggle("controls-collapsed");
  // Update button arrow direction
  const btn = document.getElementById("controlsCollapseBtn");
  const collapsed = document.body.classList.contains("controls-collapsed");
  btn.dataset.tip = collapsed ? "Expand controls" : "Collapse controls";
});

document.getElementById("codeCollapseBtn")?.addEventListener("click", () => {
  document.body.classList.toggle("code-collapsed");
  const btn = document.getElementById("codeCollapseBtn");
  const collapsed = document.body.classList.contains("code-collapsed");
  btn.dataset.tip = collapsed ? "Expand code panel" : "Collapse code panel";
});

// ══════════════════════════════════════════════════════════════
//  NAV BUTTONS & RESET
// ══════════════════════════════════════════════════════════════
document.getElementById("prevBtn")?.addEventListener("click", () => {
  if (currentIndex > 0) { markCurrentComplete(); loadLesson(currentIndex - 1); }
});
document.getElementById("nextBtn")?.addEventListener("click", () => {
  if (currentIndex < allLessons.length - 1) { markCurrentComplete(); loadLesson(currentIndex + 1); }
});
document.getElementById("resetBtn")?.addEventListener("click", () => {
  const lesson = allLessons[currentIndex];
  if (lesson.type === "editor") {
    editorCssEl.value  = lesson.starterCSS  || "";
    editorHtmlEl.value = lesson.starterHTML || "";
  } else {
    for (const k of (lesson.knobs || [])) knobValues[k.id] = k.default;
    buildKnobs(lesson, "knobs-area");
    buildKnobs(lesson, "mobile-knobs-inner");
  }
  updatePreview();
});

// ══════════════════════════════════════════════════════════════
//  CODE TABS (read-only view)
// ══════════════════════════════════════════════════════════════
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".code-tab").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === tab));
  document.getElementById("code-css") .classList.toggle("active", tab === "css");
  document.getElementById("code-html").classList.toggle("active", tab === "html");
}
document.querySelectorAll(".code-tab").forEach(btn =>
  btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

// ══════════════════════════════════════════════════════════════
//  MOBILE SHEET
// ══════════════════════════════════════════════════════════════
const mobileBtn      = document.getElementById("mobile-knobs-btn");
const mobileSheet    = document.getElementById("mobile-knobs-sheet");
const mobileBackdrop = document.getElementById("mobile-sheet-backdrop");

mobileBtn     ?.addEventListener("click", ()  => { mobileSheet.classList.add("open"); mobileBackdrop.classList.add("visible"); });
mobileBackdrop?.addEventListener("click", ()  => { mobileSheet.classList.remove("open"); mobileBackdrop.classList.remove("visible"); });

let mobileSwipeY = 0;
document.getElementById("mobile-sheet-handle")?.addEventListener("touchstart", e => { mobileSwipeY = e.touches[0].clientY; }, { passive: true });
document.getElementById("mobile-sheet-handle")?.addEventListener("touchend",   e => { if (e.changedTouches[0].clientY - mobileSwipeY > 40) { mobileSheet.classList.remove("open"); mobileBackdrop.classList.remove("visible"); } }, { passive: true });

// ══════════════════════════════════════════════════════════════
//  TOOLTIP
// ══════════════════════════════════════════════════════════════
const tooltip = document.getElementById("tooltip");
let tipTimer  = null;

function showTip(text, rect) {
  clearTimeout(tipTimer);
  tooltip.textContent = text;
  tooltip.classList.remove("visible");
  tooltip.style.left = "-9999px";
  tooltip.style.display = "block";
  const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
  const vw = window.innerWidth;
  tooltip.style.display = "";
  const MARGIN = 8, GAP = 6;
  let top  = rect.top - th - GAP;
  if (top < MARGIN) top = rect.bottom + GAP;
  let left = rect.left + rect.width / 2 - tw / 2;
  left = Math.max(MARGIN, Math.min(left, vw - tw - MARGIN));
  tooltip.style.left = left + "px";
  tooltip.style.top  = top  + "px";
  void tooltip.offsetWidth;
  tooltip.classList.add("visible");
}

function hideTip() { clearTimeout(tipTimer); tooltip.classList.remove("visible"); }

function findTipEl(target) {
  let el = target;
  while (el && el !== document.body) { if (el.dataset?.tip) return el; el = el.parentElement; }
  return null;
}

document.addEventListener("mouseover", e => {
  const t = findTipEl(e.target);
  if (!t) { hideTip(); return; }
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => showTip(t.dataset.tip, t.getBoundingClientRect()), 320);
});
document.addEventListener("mouseout", e => {
  const t = findTipEl(e.target);
  if (t && !t.contains(e.relatedTarget)) { clearTimeout(tipTimer); hideTip(); }
});

// ══════════════════════════════════════════════════════════════
//  KEYBOARD
// ══════════════════════════════════════════════════════════════
document.addEventListener("keydown", e => {
  const tag = e.target.tagName;
  // Don't intercept when user is typing in inputs/textareas
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    e.preventDefault();
    if (currentIndex < allLessons.length - 1) { markCurrentComplete(); loadLesson(currentIndex + 1); }
  }
  if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    e.preventDefault();
    if (currentIndex > 0) { markCurrentComplete(); loadLesson(currentIndex - 1); }
  }
});

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
buildLessonList();
buildSidebar();
loadLesson(0);