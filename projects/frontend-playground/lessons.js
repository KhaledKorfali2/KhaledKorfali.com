// ================================================================
//  LESSONS.JS
//
//  Lesson types:
//    "knobs"   — all interaction via sliders/pickers (safe, no user code)
//    "editor"  — user edits CSS/HTML directly in a textarea; output
//                goes through sanitiseCSS / sanitiseHTML before the
//                sandboxed iframe ever sees it. No eval, no Function().
//
//  Editor lessons include:
//    starterCSS  / starterHTML  — pre-filled starting code
//    solutionCSS / solutionHTML — shown if user clicks "Show hint"
//    editorHint  — short guidance string shown below the editor
//    lockedHTML  — if true, HTML tab is read-only (user only edits CSS)
//    lockedCSS   — if true, CSS tab is read-only (user only edits HTML)
// ================================================================

const CHAPTERS = [

  // ──────────────────────────────────────────────────────────────
  //  CHAPTER 1 — BOX MODEL
  // ──────────────────────────────────────────────────────────────
  {
    id: "box-model",
    label: "Box Model",
    lessons: [
      {
        id: "bm-1", type: "knobs",
        title: "Width & Height",
        description: "Every HTML element is a rectangular box. The most basic properties you can set are its width and height. Try dragging the sliders to see the box change size.",
        callout: "The browser default <code>width</code> for block elements is <code>100%</code> of the parent. Setting an explicit value overrides this.",
        concepts: ["width", "height", "px", "block element"],
        knobs: [
          { id: "w",  label: "width",            type: "range", min: 40,  max: 320, step: 4,    unit: "px", default: 160 },
          { id: "h",  label: "height",            type: "range", min: 40,  max: 280, step: 4,    unit: "px", default: 100 },
          { id: "bg", label: "background-color",  type: "color",                                             default: "#c84b2f" },
        ],
        template: v => ({
          css:  `.box {\n  width: ${v.w}px;\n  height: ${v.h}px;\n  background-color: ${v.bg};\n}`,
          html: `<div class="box"></div>`,
        }),
      },
      {
        id: "bm-2", type: "knobs",
        title: "Padding",
        description: "Padding is the space between an element's content and its border. It pushes the content inward. With box-sizing: content-box the total size grows as you add padding.",
        callout: "Switch to <code>box-sizing: border-box</code> and padding is absorbed inside the declared size instead of expanding it.",
        concepts: ["padding", "box-sizing", "content-box", "border-box"],
        knobs: [
          { id: "pt", label: "padding-top",    type: "range", min: 0, max: 60, step: 2, unit: "px", default: 16 },
          { id: "pr", label: "padding-right",  type: "range", min: 0, max: 60, step: 2, unit: "px", default: 16 },
          { id: "pb", label: "padding-bottom", type: "range", min: 0, max: 60, step: 2, unit: "px", default: 16 },
          { id: "pl", label: "padding-left",   type: "range", min: 0, max: 60, step: 2, unit: "px", default: 16 },
          { id: "bs", label: "box-sizing", type: "select",
            options: [{ label: "content-box", value: "content-box" }, { label: "border-box", value: "border-box" }],
            default: "content-box" },
        ],
        template: v => ({
          css:  `.box {\n  width: 160px;\n  box-sizing: ${v.bs};\n  padding: ${v.pt}px ${v.pr}px ${v.pb}px ${v.pl}px;\n  background-color: #c84b2f;\n  color: white;\n  font-family: sans-serif;\n}`,
          html: `<div class="box">Content lives here</div>`,
        }),
      },
      {
        id: "bm-3", type: "knobs",
        title: "Border",
        description: "The border wraps around the padding and content. It has three sub-properties: width, style, and color. A border with style 'none' is invisible regardless of the other values.",
        callout: "The shorthand <code>border: 2px solid black</code> sets all three in one line. Individual sides can be overridden with <code>border-top</code>, <code>border-right</code>, etc.",
        concepts: ["border-width", "border-style", "border-color", "border-radius"],
        knobs: [
          { id: "bw", label: "border-width", type: "range", min: 0, max: 16, step: 1, unit: "px", default: 3 },
          { id: "bs", label: "border-style", type: "select",
            options: [
              { label: "solid", value: "solid" }, { label: "dashed", value: "dashed" },
              { label: "dotted", value: "dotted" }, { label: "double", value: "double" },
              { label: "none", value: "none" },
            ], default: "solid" },
          { id: "bc", label: "border-color",  type: "color", default: "#1e1b16" },
          { id: "br", label: "border-radius", type: "range", min: 0, max: 80, step: 2, unit: "px", default: 0 },
        ],
        template: v => ({
          css:  `.box {\n  width: 160px;\n  height: 100px;\n  background-color: #c84b2f;\n  border-width: ${v.bw}px;\n  border-style: ${v.bs};\n  border-color: ${v.bc};\n  border-radius: ${v.br}px;\n}`,
          html: `<div class="box"></div>`,
        }),
      },
      {
        id: "bm-4", type: "knobs",
        title: "Margin",
        description: "Margin is the transparent space outside the border. It pushes neighbouring elements away. Unlike padding, it doesn't take on the element's background.",
        callout: "When two vertical margins meet, browsers collapse them into a single margin equal to the larger of the two — this is called <code>margin collapse</code>.",
        concepts: ["margin", "margin collapse", "auto"],
        knobs: [
          { id: "mt", label: "margin-top",    type: "range", min: 0, max: 60, step: 2, unit: "px", default: 0 },
          { id: "mr", label: "margin-right",  type: "range", min: 0, max: 60, step: 2, unit: "px", default: 0 },
          { id: "mb", label: "margin-bottom", type: "range", min: 0, max: 60, step: 2, unit: "px", default: 0 },
          { id: "ml", label: "margin-left",   type: "range", min: 0, max: 60, step: 2, unit: "px", default: 0 },
        ],
        template: v => ({
          css:  `.wrapper {\n  background: #e8dece;\n  padding: 4px;\n  display: inline-block;\n}\n.box {\n  width: 120px;\n  height: 80px;\n  background-color: #c84b2f;\n  margin: ${v.mt}px ${v.mr}px ${v.mb}px ${v.ml}px;\n}`,
          html: `<div class="wrapper"><div class="box"></div></div>`,
        }),
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────
  //  CHAPTER 2 — TYPOGRAPHY
  // ──────────────────────────────────────────────────────────────
  {
    id: "typography",
    label: "Typography",
    lessons: [
      {
        id: "ty-1", type: "knobs",
        title: "Font Size & Weight",
        description: "font-size controls how large text appears. font-weight controls boldness. Most fonts only support specific weight values — 400 is normal, 700 is bold.",
        callout: "Using <code>rem</code> units instead of <code>px</code> makes type scale with the user's browser settings — better for accessibility.",
        concepts: ["font-size", "font-weight", "rem", "px"],
        knobs: [
          { id: "fs", label: "font-size",   type: "range", min: 10, max: 72, step: 1, unit: "px", default: 24 },
          { id: "fw", label: "font-weight", type: "range", min: 100, max: 900, step: 100, unit: "", default: 400 },
          { id: "fc", label: "color",       type: "color", default: "#1e1b16" },
        ],
        template: v => ({
          css:  `.text {\n  font-size: ${v.fs}px;\n  font-weight: ${v.fw};\n  color: ${v.fc};\n  font-family: Georgia, serif;\n  line-height: 1.4;\n}`,
          html: `<p class="text">The quick brown fox jumps over the lazy dog.</p>`,
        }),
      },
      {
        id: "ty-2", type: "knobs",
        title: "Line Height & Letter Spacing",
        description: "line-height controls vertical space between lines — crucial for readability. letter-spacing adjusts horizontal space between characters.",
        callout: "A line-height between <code>1.4</code> and <code>1.6</code> is ideal for body text. Headings often look better tighter, around <code>1.1</code>.",
        concepts: ["line-height", "letter-spacing", "em", "readability"],
        knobs: [
          { id: "lh", label: "line-height",    type: "range", min: 0.8, max: 3.0, step: 0.05, unit: "",   default: 1.5 },
          { id: "ls", label: "letter-spacing", type: "range", min: -2,  max: 10,  step: 0.25, unit: "px", default: 0 },
          { id: "fs", label: "font-size",      type: "range", min: 12,  max: 28,  step: 1,    unit: "px", default: 16 },
        ],
        template: v => ({
          css:  `.text {\n  font-size: ${v.fs}px;\n  line-height: ${v.lh};\n  letter-spacing: ${v.ls}px;\n  font-family: Georgia, serif;\n  color: #1e1b16;\n  max-width: 420px;\n}`,
          html: `<p class="text">Typography is the art of arranging type to make written language legible, readable, and appealing. Good line-height and spacing dramatically affect how comfortable text is to read.</p>`,
        }),
      },
      {
        id: "ty-3", type: "knobs",
        title: "Text Alignment & Decoration",
        description: "text-align controls horizontal alignment. text-decoration adds visual treatments like underlines. text-transform changes capitalisation.",
        callout: "<code>text-align: justify</code> stretches each line to fill the full width — common in newspapers but can create awkward spacing in narrow columns.",
        concepts: ["text-align", "text-decoration", "text-transform"],
        knobs: [
          { id: "ta", label: "text-align", type: "select",
            options: [{ label: "left", value: "left" }, { label: "center", value: "center" }, { label: "right", value: "right" }, { label: "justify", value: "justify" }],
            default: "left" },
          { id: "td", label: "text-decoration", type: "select",
            options: [{ label: "none", value: "none" }, { label: "underline", value: "underline" }, { label: "line-through", value: "line-through" }, { label: "overline", value: "overline" }],
            default: "none" },
          { id: "tt", label: "text-transform", type: "select",
            options: [{ label: "none", value: "none" }, { label: "uppercase", value: "uppercase" }, { label: "lowercase", value: "lowercase" }, { label: "capitalize", value: "capitalize" }],
            default: "none" },
        ],
        template: v => ({
          css:  `.text {\n  text-align: ${v.ta};\n  text-decoration: ${v.td};\n  text-transform: ${v.tt};\n  font-size: 17px;\n  line-height: 1.6;\n  font-family: Georgia, serif;\n  color: #1e1b16;\n  max-width: 380px;\n}`,
          html: `<p class="text">Typography shapes how readers experience written content. These simple properties have a profound effect on tone and legibility.</p>`,
        }),
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────
  //  CHAPTER 3 — COLORS
  // ──────────────────────────────────────────────────────────────
  {
    id: "colors",
    label: "Colors",
    lessons: [
      {
        id: "col-1", type: "knobs",
        title: "Color Formats & HSL",
        description: "CSS supports hex, rgb(), hsl(), and named colors. HSL is often the most intuitive: Hue is a 0–360° wheel angle, Saturation is vividity, Lightness is brightness.",
        callout: "HSL makes it easy to create color families — keep the hue fixed, vary the lightness to get tints and shades of the same color.",
        concepts: ["color", "hex", "rgb()", "hsl()", "opacity"],
        knobs: [
          { id: "h", label: "hue (0–360)",  type: "range", min: 0,   max: 360, step: 1,    unit: "°",  default: 12 },
          { id: "s", label: "saturation",   type: "range", min: 0,   max: 100, step: 1,    unit: "%",  default: 70 },
          { id: "l", label: "lightness",    type: "range", min: 0,   max: 100, step: 1,    unit: "%",  default: 50 },
          { id: "a", label: "opacity",      type: "range", min: 0,   max: 1,   step: 0.01, unit: "",   default: 1  },
        ],
        template: v => ({
          css:  `.swatch {\n  width: 180px;\n  height: 180px;\n  border-radius: 8px;\n  background-color: hsl(${v.h}, ${v.s}%, ${v.l}%);\n  opacity: ${v.a};\n}\n.label {\n  margin-top: 12px;\n  font-family: monospace;\n  font-size: 13px;\n  color: #3d3830;\n}`,
          html: `<div class="swatch"></div>\n<p class="label">hsl(${v.h}, ${v.s}%, ${v.l}%) / opacity: ${v.a}</p>`,
        }),
      },
      {
        id: "col-2", type: "knobs",
        title: "Gradients",
        description: "CSS gradients blend between two or more colors. linear-gradient goes in a straight line; radial-gradient radiates outward from a center point.",
        callout: "Gradients are <code>background-image</code> values, not <code>background-color</code>. You can stack them: <code>background: linear-gradient(...), linear-gradient(...)</code>.",
        concepts: ["linear-gradient", "radial-gradient", "background-image"],
        knobs: [
          { id: "c1",   label: "color 1", type: "color", default: "#c84b2f" },
          { id: "c2",   label: "color 2", type: "color", default: "#2f6fc8" },
          { id: "ang",  label: "angle",   type: "range", min: 0, max: 360, step: 5, unit: "deg", default: 135 },
          { id: "type", label: "type", type: "select",
            options: [{ label: "linear", value: "linear" }, { label: "radial", value: "radial" }],
            default: "linear" },
        ],
        template: v => ({
          css:  `.box {\n  width: 220px;\n  height: 220px;\n  border-radius: 8px;\n  background: ${v.type === "linear" ? `linear-gradient(${v.ang}deg, ${v.c1}, ${v.c2})` : `radial-gradient(circle, ${v.c1}, ${v.c2})`};\n}`,
          html: `<div class="box"></div>`,
        }),
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────
  //  CHAPTER 4 — FLEXBOX
  // ──────────────────────────────────────────────────────────────
  {
    id: "flexbox",
    label: "Flexbox",
    lessons: [
      {
        id: "fx-1", type: "knobs",
        title: "Flex Direction & Wrap",
        description: "Flexbox arranges children in a row or column. flex-direction sets the main axis. flex-wrap controls whether items spill onto multiple lines.",
        callout: "The element with <code>display: flex</code> is the flex container. Only its direct children are flex items — not deeper descendants.",
        concepts: ["display: flex", "flex-direction", "flex-wrap"],
        knobs: [
          { id: "fd", label: "flex-direction", type: "select",
            options: [{ label: "row", value: "row" }, { label: "row-reverse", value: "row-reverse" }, { label: "column", value: "column" }, { label: "column-reverse", value: "column-reverse" }],
            default: "row" },
          { id: "fw", label: "flex-wrap", type: "select",
            options: [{ label: "nowrap", value: "nowrap" }, { label: "wrap", value: "wrap" }, { label: "wrap-reverse", value: "wrap-reverse" }],
            default: "nowrap" },
          { id: "gap", label: "gap", type: "range", min: 0, max: 32, step: 2, unit: "px", default: 8 },
        ],
        template: v => ({
          css:  `.container {\n  display: flex;\n  flex-direction: ${v.fd};\n  flex-wrap: ${v.fw};\n  gap: ${v.gap}px;\n  background: #e8dece;\n  padding: 12px;\n  min-height: 160px;\n  border-radius: 6px;\n}\n.item {\n  width: 60px;\n  height: 60px;\n  background: #c84b2f;\n  border-radius: 4px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  color: white;\n  font-family: monospace;\n  font-size: 14px;\n  font-weight: bold;\n  flex-shrink: 0;\n}`,
          html: `<div class="container">\n  <div class="item">1</div>\n  <div class="item">2</div>\n  <div class="item">3</div>\n  <div class="item">4</div>\n  <div class="item">5</div>\n</div>`,
        }),
      },
      {
        id: "fx-2", type: "knobs",
        title: "Justify & Align",
        description: "justify-content distributes items along the main axis. align-items aligns them on the cross axis. Together they control how items are positioned inside the container.",
        callout: "<code>justify-content: space-between</code> puts the first item at the start and last at the end with equal space between — great for navigation bars.",
        concepts: ["justify-content", "align-items", "main axis", "cross axis"],
        knobs: [
          { id: "jc", label: "justify-content", type: "select",
            options: [{ label: "flex-start", value: "flex-start" }, { label: "flex-end", value: "flex-end" }, { label: "center", value: "center" }, { label: "space-between", value: "space-between" }, { label: "space-around", value: "space-around" }, { label: "space-evenly", value: "space-evenly" }],
            default: "flex-start" },
          { id: "ai", label: "align-items", type: "select",
            options: [{ label: "flex-start", value: "flex-start" }, { label: "flex-end", value: "flex-end" }, { label: "center", value: "center" }, { label: "stretch", value: "stretch" }, { label: "baseline", value: "baseline" }],
            default: "stretch" },
        ],
        template: v => ({
          css:  `.container {\n  display: flex;\n  justify-content: ${v.jc};\n  align-items: ${v.ai};\n  gap: 8px;\n  background: #e8dece;\n  padding: 16px;\n  height: 180px;\n  border-radius: 6px;\n}\n.item {\n  background: #c84b2f;\n  border-radius: 4px;\n  color: white;\n  font-family: monospace;\n  font-size: 13px;\n  font-weight: bold;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  min-width: 50px;\n  padding: 8px;\n}\n.item:nth-child(2) { height: 40px; }\n.item:nth-child(3) { height: 70px; }`,
          html: `<div class="container">\n  <div class="item">A</div>\n  <div class="item">B</div>\n  <div class="item">C</div>\n</div>`,
        }),
      },
      {
        id: "fx-3", type: "knobs",
        title: "Flex Grow & Shrink",
        description: "flex-grow controls how much extra space an item claims relative to its siblings. flex-shrink controls how much it gives up when space is tight.",
        callout: "The shorthand <code>flex: 1</code> sets grow: 1, shrink: 1, basis: 0 — making the item fill space equally with siblings.",
        concepts: ["flex-grow", "flex-shrink", "flex-basis", "flex"],
        knobs: [
          { id: "fg1", label: "item 1 flex-grow", type: "range", min: 0, max: 5, step: 1, unit: "", default: 1 },
          { id: "fg2", label: "item 2 flex-grow", type: "range", min: 0, max: 5, step: 1, unit: "", default: 1 },
          { id: "fg3", label: "item 3 flex-grow", type: "range", min: 0, max: 5, step: 1, unit: "", default: 1 },
        ],
        template: v => ({
          css:  `.container {\n  display: flex;\n  gap: 8px;\n  background: #e8dece;\n  padding: 12px;\n  border-radius: 6px;\n}\n.item {\n  height: 64px;\n  border-radius: 4px;\n  color: white;\n  font-family: monospace;\n  font-size: 12px;\n  font-weight: bold;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n.item-1 { background: #c84b2f; flex-grow: ${v.fg1}; }\n.item-2 { background: #2f6fc8; flex-grow: ${v.fg2}; }\n.item-3 { background: #2e7d50; flex-grow: ${v.fg3}; }`,
          html: `<div class="container">\n  <div class="item item-1">grow: ${v.fg1}</div>\n  <div class="item item-2">grow: ${v.fg2}</div>\n  <div class="item item-3">grow: ${v.fg3}</div>\n</div>`,
        }),
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────
  //  CHAPTER 5 — CSS GRID
  // ──────────────────────────────────────────────────────────────
  {
    id: "grid",
    label: "CSS Grid",
    lessons: [
      {
        id: "gr-1", type: "knobs",
        title: "Grid Template",
        description: "CSS Grid divides a container into columns and rows. grid-template-columns defines the number and size of columns. The fr unit means 'fraction of remaining space'.",
        callout: "<code>repeat(3, 1fr)</code> is shorthand for <code>1fr 1fr 1fr</code>. You can mix units: <code>200px 1fr 1fr</code> gives a fixed sidebar with two flexible columns.",
        concepts: ["display: grid", "grid-template-columns", "fr", "repeat()"],
        knobs: [
          { id: "cols", label: "columns", type: "range", min: 1, max: 5, step: 1, unit: "", default: 3 },
          { id: "rows", label: "rows",    type: "range", min: 1, max: 4, step: 1, unit: "", default: 2 },
          { id: "gap",  label: "gap",     type: "range", min: 0, max: 24, step: 2, unit: "px", default: 8 },
        ],
        template: v => {
          const items = Array.from({ length: v.cols * v.rows }, (_, i) => `  <div class="item">${i + 1}</div>`).join("\n");
          return {
            css:  `.container {\n  display: grid;\n  grid-template-columns: repeat(${v.cols}, 1fr);\n  grid-template-rows: repeat(${v.rows}, 60px);\n  gap: ${v.gap}px;\n  background: #e8dece;\n  padding: 12px;\n  border-radius: 6px;\n}\n.item {\n  background: #c84b2f;\n  border-radius: 4px;\n  color: white;\n  font-family: monospace;\n  font-size: 13px;\n  font-weight: bold;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}`,
            html: `<div class="container">\n${items}\n</div>`,
          };
        },
      },
      {
        id: "gr-2", type: "knobs",
        title: "Grid Placement",
        description: "Items can span specific grid cells using grid-column and grid-row. Span lets an item take up multiple tracks — the foundation of magazine-style layouts.",
        callout: "<code>grid-column: 1 / 3</code> means start at line 1, end at line 3, spanning 2 columns. <code>span 2</code> is equivalent shorthand.",
        concepts: ["grid-column", "grid-row", "span", "grid lines"],
        knobs: [
          { id: "cs", label: "item 1 col-start", type: "range", min: 1, max: 3, step: 1, unit: "", default: 1 },
          { id: "ce", label: "item 1 col-span",  type: "range", min: 1, max: 3, step: 1, unit: "", default: 2 },
          { id: "rs", label: "item 1 row-span",  type: "range", min: 1, max: 2, step: 1, unit: "", default: 1 },
        ],
        template: v => ({
          css:  `.container {\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  grid-template-rows: repeat(2, 80px);\n  gap: 8px;\n  background: #e8dece;\n  padding: 12px;\n  border-radius: 6px;\n}\n.item {\n  background: rgba(200,75,47,0.2);\n  border: 2px solid #c84b2f;\n  border-radius: 4px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-family: monospace;\n  font-size: 12px;\n  color: #c84b2f;\n  font-weight: bold;\n}\n.item-1 {\n  background: #c84b2f;\n  color: white;\n  grid-column: ${v.cs} / span ${v.ce};\n  grid-row: span ${v.rs};\n}`,
          html: `<div class="container">\n  <div class="item item-1">★</div>\n  <div class="item">2</div>\n  <div class="item">3</div>\n  <div class="item">4</div>\n  <div class="item">5</div>\n  <div class="item">6</div>\n</div>`,
        }),
      },
      {
        id: "gr-3", type: "editor",
        title: "Grid Template Areas",
        description: "grid-template-areas lets you draw your layout visually using named regions. Each string is a row; each word is a cell name. This is one of the most powerful layout tools in CSS.",
        callout: "Every row must have the same number of cells. A dot <code>.</code> creates an empty cell. Named areas must be rectangular — no L-shapes.",
        concepts: ["grid-template-areas", "grid-area", "named regions"],
        editorHint: "Try renaming the areas or rearranging the layout rows to create a different page structure.",
        lockedHTML: true,
        starterCSS: `.layout {\n  display: grid;\n  grid-template-columns: 180px 1fr;\n  grid-template-rows: 56px 1fr 40px;\n  grid-template-areas:\n    "header header"\n    "sidebar main"\n    "footer footer";\n  gap: 8px;\n  height: 260px;\n  font-family: monospace;\n  font-size: 12px;\n  font-weight: bold;\n  color: white;\n}\n.header  { grid-area: header;  background: #2f6fc8; border-radius: 4px; display: flex; align-items: center; justify-content: center; }\n.sidebar { grid-area: sidebar; background: #c84b2f; border-radius: 4px; display: flex; align-items: center; justify-content: center; }\n.main    { grid-area: main;   background: #2e7d50; border-radius: 4px; display: flex; align-items: center; justify-content: center; }\n.footer  { grid-area: footer; background: #6b6356; border-radius: 4px; display: flex; align-items: center; justify-content: center; }`,
        starterHTML: `<div class="layout">\n  <div class="header">header</div>\n  <div class="sidebar">sidebar</div>\n  <div class="main">main</div>\n  <div class="footer">footer</div>\n</div>`,
        solutionCSS: `.layout {\n  display: grid;\n  grid-template-columns: 1fr 1fr 1fr;\n  grid-template-rows: 56px 1fr 40px;\n  grid-template-areas:\n    "header header header"\n    "sidebar main main"\n    "footer footer footer";\n  gap: 8px;\n  height: 260px;\n  font-family: monospace;\n  font-size: 12px;\n  font-weight: bold;\n  color: white;\n}\n.header  { grid-area: header;  background: #2f6fc8; border-radius: 4px; display: flex; align-items: center; justify-content: center; }\n.sidebar { grid-area: sidebar; background: #c84b2f; border-radius: 4px; display: flex; align-items: center; justify-content: center; }\n.main    { grid-area: main;   background: #2e7d50; border-radius: 4px; display: flex; align-items: center; justify-content: center; }\n.footer  { grid-area: footer; background: #6b6356; border-radius: 4px; display: flex; align-items: center; justify-content: center; }`,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────
  //  CHAPTER 6 — TRANSITIONS & ANIMATION
  // ──────────────────────────────────────────────────────────────
  {
    id: "transitions",
    label: "Transitions & Animation",
    lessons: [
      {
        id: "tr-1", type: "knobs",
        title: "CSS Transitions",
        description: "Transitions smoothly animate a property when it changes — such as on :hover. You define which property, the duration, and an easing curve.",
        callout: "<code>ease-in-out</code> ramps up then decelerates — it feels the most natural for UI animations because it mimics how physical objects move.",
        concepts: ["transition", "transition-duration", "transition-timing-function", ":hover"],
        knobs: [
          { id: "dur",   label: "duration",         type: "range", min: 0.05, max: 2,    step: 0.05, unit: "s", default: 0.3 },
          { id: "ease",  label: "timing-function",  type: "select",
            options: [{ label: "ease", value: "ease" }, { label: "linear", value: "linear" }, { label: "ease-in", value: "ease-in" }, { label: "ease-out", value: "ease-out" }, { label: "ease-in-out", value: "ease-in-out" }],
            default: "ease" },
          { id: "scale", label: "hover scale",      type: "range", min: 0.5,  max: 2.0,  step: 0.05, unit: "×", default: 1.15 },
          { id: "hc",    label: "hover color",      type: "color", default: "#2f6fc8" },
        ],
        template: v => ({
          css:  `.box {\n  width: 120px;\n  height: 120px;\n  background-color: #c84b2f;\n  border-radius: 8px;\n  cursor: pointer;\n  transition: transform ${v.dur}s ${v.ease},\n              background-color ${v.dur}s ${v.ease};\n}\n.box:hover {\n  transform: scale(${v.scale});\n  background-color: ${v.hc};\n}`,
          html: `<div class="box"></div>\n<!-- Hover over the box! -->`,
        }),
      },
      {
        id: "tr-2", type: "knobs",
        title: "CSS Animations",
        description: "@keyframes animations run continuously or on demand. You define what the element looks like at each stage (0%, 50%, 100%) and the browser interpolates between them.",
        callout: "<code>animation-direction: alternate</code> reverses on every other cycle — great for pulsing or breathing effects without a jarring jump back to start.",
        concepts: ["@keyframes", "animation-name", "animation-duration", "animation-iteration-count"],
        knobs: [
          { id: "dur",  label: "duration",       type: "range", min: 0.2, max: 4, step: 0.1, unit: "s", default: 1 },
          { id: "ease", label: "timing-function", type: "select",
            options: [{ label: "ease", value: "ease" }, { label: "linear", value: "linear" }, { label: "ease-in-out", value: "ease-in-out" }],
            default: "ease-in-out" },
          { id: "dir",  label: "direction", type: "select",
            options: [{ label: "normal", value: "normal" }, { label: "alternate", value: "alternate" }, { label: "reverse", value: "reverse" }],
            default: "alternate" },
          { id: "c1", label: "color from", type: "color", default: "#c84b2f" },
          { id: "c2", label: "color to",   type: "color", default: "#2f6fc8" },
        ],
        template: v => ({
          css:  `@keyframes pulse {\n  0%   { transform: scale(1);    background-color: ${v.c1}; }\n  50%  { transform: scale(1.25); background-color: ${v.c2}; }\n  100% { transform: scale(1);    background-color: ${v.c1}; }\n}\n\n.box {\n  width: 100px;\n  height: 100px;\n  border-radius: 50%;\n  animation: pulse ${v.dur}s ${v.ease} infinite ${v.dir};\n}`,
          html: `<div class="box"></div>`,
        }),
      },
      {
        id: "tr-3", type: "editor",
        title: "Write Your Own Keyframes",
        description: "Now it's your turn. The animation below runs but does very little. Edit the @keyframes to make the card do something interesting — spin, bounce, change color, grow, whatever you like.",
        callout: "You can animate almost any numeric CSS property inside @keyframes — transform, opacity, background-color, border-radius, and more.",
        concepts: ["@keyframes", "transform", "animation"],
        editorHint: "Try adding <strong>rotate()</strong>, <strong>translateY()</strong>, or a color change at the 50% keyframe.",
        lockedHTML: true,
        starterCSS: `@keyframes myAnim {\n  0%   { transform: scale(1); opacity: 1; }\n  100% { transform: scale(1); opacity: 1; }\n}\n\n.card {\n  width: 120px;\n  height: 120px;\n  background: #c84b2f;\n  border-radius: 12px;\n  animation: myAnim 1.2s ease-in-out infinite alternate;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  color: white;\n  font-family: monospace;\n  font-size: 28px;\n}`,
        starterHTML: `<div class="card">✦</div>`,
        solutionCSS: `@keyframes myAnim {\n  0%   { transform: scale(1) rotate(0deg);   background: #c84b2f; }\n  50%  { transform: scale(1.2) rotate(180deg); background: #2f6fc8; }\n  100% { transform: scale(1) rotate(360deg); background: #2e7d50; }\n}\n\n.card {\n  width: 120px;\n  height: 120px;\n  background: #c84b2f;\n  border-radius: 12px;\n  animation: myAnim 1.8s ease-in-out infinite;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  color: white;\n  font-family: monospace;\n  font-size: 28px;\n}`,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────
  //  CHAPTER 7 — POSITIONING
  // ──────────────────────────────────────────────────────────────
  {
    id: "positioning",
    label: "Positioning",
    lessons: [
      {
        id: "pos-1", type: "knobs",
        title: "Position Property",
        description: "The position property takes an element out of the normal flow. 'relative' offsets from its natural spot. 'absolute' positions relative to the nearest positioned ancestor.",
        callout: "An element is 'positioned' if its position is anything other than <code>static</code>. Absolute children look for the nearest positioned ancestor — if none, they use the page.",
        concepts: ["position", "top", "left", "relative", "absolute", "fixed"],
        knobs: [
          { id: "pos",  label: "position", type: "select",
            options: [{ label: "static", value: "static" }, { label: "relative", value: "relative" }, { label: "absolute", value: "absolute" }],
            default: "static" },
          { id: "top",  label: "top",  type: "range", min: -60, max: 80, step: 2, unit: "px", default: 0 },
          { id: "left", label: "left", type: "range", min: -60, max: 80, step: 2, unit: "px", default: 0 },
        ],
        template: v => ({
          css:  `.parent {\n  position: relative;\n  width: 260px;\n  height: 160px;\n  background: #e8dece;\n  border: 2px dashed #9c9288;\n  border-radius: 6px;\n  font-family: sans-serif;\n  font-size: 12px;\n  color: #6b6356;\n  padding: 8px;\n}\n.box {\n  width: 80px;\n  height: 80px;\n  background: #c84b2f;\n  color: white;\n  border-radius: 4px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-family: monospace;\n  font-size: 11px;\n  font-weight: bold;\n  position: ${v.pos};\n  top: ${v.top}px;\n  left: ${v.left}px;\n}`,
          html: `<div class="parent">\n  parent\n  <div class="box">${v.pos}</div>\n</div>`,
        }),
      },
      {
        id: "pos-2", type: "knobs",
        title: "Z-Index & Stacking",
        description: "When elements overlap, z-index controls which one appears on top. Higher values sit above lower ones. z-index only works on positioned elements.",
        callout: "z-index creates a stacking context — a child can never appear above an element outside its parent's stacking context, no matter how high its z-index is.",
        concepts: ["z-index", "stacking context", "overlap"],
        knobs: [
          { id: "z1", label: "red box z-index",  type: "range", min: -5, max: 10, step: 1, unit: "", default: 2 },
          { id: "z2", label: "blue box z-index", type: "range", min: -5, max: 10, step: 1, unit: "", default: 1 },
        ],
        template: v => ({
          css:  `.container {\n  position: relative;\n  width: 240px;\n  height: 180px;\n}\n.box {\n  width: 120px;\n  height: 120px;\n  border-radius: 6px;\n  position: absolute;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-family: monospace;\n  font-weight: bold;\n  color: white;\n  font-size: 12px;\n}\n.box-1 { background: #c84b2f; top: 20px; left: 20px; z-index: ${v.z1}; }\n.box-2 { background: #2f6fc8; top: 60px; left: 80px; z-index: ${v.z2}; }`,
          html: `<div class="container">\n  <div class="box box-1">z: ${v.z1}</div>\n  <div class="box box-2">z: ${v.z2}</div>\n</div>`,
        }),
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────
  //  CHAPTER 8 — CSS CUSTOM PROPERTIES
  // ──────────────────────────────────────────────────────────────
  {
    id: "custom-props",
    label: "Custom Properties",
    lessons: [
      {
        id: "cp-1", type: "knobs",
        title: "CSS Variables",
        description: "CSS custom properties (variables) let you store values in one place and reuse them throughout your stylesheet. They cascade and can be overridden by child elements.",
        callout: "Variables are defined with a double-dash prefix: <code>--my-color: red</code>. They're read with <code>var(--my-color)</code>. Unlike preprocessor variables, they update live in the browser.",
        concepts: ["--custom-property", "var()", ":root", "cascade"],
        knobs: [
          { id: "primary",   label: "--primary",   type: "color", default: "#c84b2f" },
          { id: "secondary", label: "--secondary", type: "color", default: "#2f6fc8" },
          { id: "radius",    label: "--radius",    type: "range", min: 0, max: 32, step: 2, unit: "px", default: 8 },
          { id: "spacing",   label: "--spacing",   type: "range", min: 4, max: 32, step: 2, unit: "px", default: 12 },
        ],
        template: v => ({
          css:  `:root {\n  --primary:   ${v.primary};\n  --secondary: ${v.secondary};\n  --radius:    ${v.radius}px;\n  --spacing:   ${v.spacing}px;\n}\n\n.card {\n  background: var(--primary);\n  border-radius: var(--radius);\n  padding: var(--spacing);\n  display: inline-flex;\n  flex-direction: column;\n  gap: var(--spacing);\n}\n\n.badge {\n  background: var(--secondary);\n  color: white;\n  border-radius: calc(var(--radius) / 2);\n  padding: 4px 10px;\n  font-family: monospace;\n  font-size: 12px;\n}`,
          html: `<div class="card">\n  <div class="badge">--primary box</div>\n  <div class="badge">--secondary badge</div>\n  <div class="badge">shared --radius</div>\n</div>`,
        }),
      },
      {
        id: "cp-2", type: "editor",
        title: "Build a Theme with Variables",
        description: "Edit the CSS variables in :root to retheme the entire card component. Notice how changing one variable updates every element that uses it.",
        callout: "This is the power of design tokens — change the source variable and everything that references it updates automatically, no search-and-replace needed.",
        concepts: ["design tokens", "theming", "var()", "calc()"],
        editorHint: "Try switching to a dark theme by changing <strong>--bg</strong> to a dark color and <strong>--text</strong> to white.",
        lockedHTML: true,
        starterCSS: `:root {\n  --bg:      #f5f0e8;\n  --surface: #ffffff;\n  --text:    #1e1b16;\n  --muted:   #6b6356;\n  --accent:  #c84b2f;\n  --radius:  8px;\n  --gap:     12px;\n}\n\nbody { background: var(--bg); margin: 0; padding: 20px; font-family: sans-serif; }\n\n.card {\n  background: var(--surface);\n  border-radius: var(--radius);\n  padding: var(--gap);\n  max-width: 240px;\n  border: 1px solid rgba(0,0,0,0.1);\n}\n\n.card-title {\n  font-size: 16px;\n  font-weight: 600;\n  color: var(--text);\n  margin-bottom: 4px;\n}\n\n.card-body {\n  font-size: 13px;\n  color: var(--muted);\n  margin-bottom: var(--gap);\n  line-height: 1.5;\n}\n\n.card-btn {\n  background: var(--accent);\n  color: white;\n  border: none;\n  border-radius: calc(var(--radius) / 2);\n  padding: 6px 14px;\n  font-size: 13px;\n  cursor: pointer;\n}`,
        starterHTML: `<div class="card">\n  <div class="card-title">Card Title</div>\n  <div class="card-body">This card is entirely driven by CSS custom properties. Change the variables to retheme it.</div>\n  <button class="card-btn">Action</button>\n</div>`,
        solutionCSS: `:root {\n  --bg:      #1a1714;\n  --surface: #2a2420;\n  --text:    #f0ebe0;\n  --muted:   #a09080;\n  --accent:  #e8a030;\n  --radius:  12px;\n  --gap:     16px;\n}\n\nbody { background: var(--bg); margin: 0; padding: 20px; font-family: sans-serif; }\n\n.card {\n  background: var(--surface);\n  border-radius: var(--radius);\n  padding: var(--gap);\n  max-width: 240px;\n  border: 1px solid rgba(255,255,255,0.07);\n}\n\n.card-title {\n  font-size: 16px;\n  font-weight: 600;\n  color: var(--text);\n  margin-bottom: 4px;\n}\n\n.card-body {\n  font-size: 13px;\n  color: var(--muted);\n  margin-bottom: var(--gap);\n  line-height: 1.5;\n}\n\n.card-btn {\n  background: var(--accent);\n  color: #1a1714;\n  border: none;\n  border-radius: calc(var(--radius) / 2);\n  padding: 6px 14px;\n  font-size: 13px;\n  cursor: pointer;\n  font-weight: 600;\n}`,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────
  //  CHAPTER 9 — PSEUDO-CLASSES & PSEUDO-ELEMENTS
  // ──────────────────────────────────────────────────────────────
  {
    id: "pseudo",
    label: "Pseudo Selectors",
    lessons: [
      {
        id: "ps-1", type: "knobs",
        title: "Pseudo-classes",
        description: "Pseudo-classes select elements based on their state or position — :hover, :focus, :nth-child(), :first-child, :last-child, :not(). They never require extra HTML classes.",
        callout: "<code>:nth-child(2n)</code> selects every even child. <code>:nth-child(3n+1)</code> selects every 3rd starting from 1. These are incredibly powerful for styling lists and tables.",
        concepts: [":hover", ":nth-child()", ":first-child", ":not()"],
        knobs: [
          { id: "hbg",  label: "hover bg",       type: "color", default: "#2f6fc8" },
          { id: "ebg",  label: "even-child bg",  type: "color", default: "#e8dece" },
          { id: "fbg",  label: "first-child bg", type: "color", default: "#2e7d50" },
        ],
        template: v => ({
          css:  `.list {\n  list-style: none;\n  width: 200px;\n  border: 1px solid #ccc;\n  border-radius: 6px;\n  overflow: hidden;\n  font-family: sans-serif;\n  font-size: 13px;\n}\n\n.list li {\n  padding: 10px 14px;\n  background: white;\n  border-bottom: 1px solid #eee;\n  transition: background 0.15s;\n}\n\n.list li:hover { background: ${v.hbg}; color: white; }\n\n.list li:nth-child(even) { background: ${v.ebg}; }\n\n.list li:first-child { background: ${v.fbg}; color: white; font-weight: bold; }\n\n.list li:last-child { border-bottom: none; }`,
          html: `<ul class="list">\n  <li>First (special)</li>\n  <li>Second</li>\n  <li>Third</li>\n  <li>Fourth</li>\n  <li>Last</li>\n</ul>`,
        }),
      },
      {
        id: "ps-2", type: "knobs",
        title: "Pseudo-elements",
        description: "Pseudo-elements create virtual sub-elements without adding HTML. ::before and ::after inject content before or after an element's content. ::first-line and ::first-letter target text.",
        callout: "The <code>content</code> property is required for ::before and ::after — even if it's empty: <code>content: ''</code>. Without it the pseudo-element won't render.",
        concepts: ["::before", "::after", "content", "::first-letter"],
        knobs: [
          { id: "bc",   label: "::before color",   type: "color", default: "#c84b2f" },
          { id: "ac",   label: "::after color",    type: "color", default: "#2f6fc8" },
          { id: "sz",   label: "dot size",          type: "range", min: 4, max: 24, step: 2, unit: "px", default: 10 },
          { id: "flsz", label: "::first-letter size", type: "range", min: 1, max: 5, step: 0.25, unit: "em", default: 2.5 },
        ],
        template: v => ({
          css:  `.item {\n  position: relative;\n  padding: 8px 14px 8px 28px;\n  font-family: sans-serif;\n  font-size: 14px;\n  color: #1e1b16;\n}\n\n.item::before {\n  content: '';\n  position: absolute;\n  left: 8px;\n  top: 50%;\n  transform: translateY(-50%);\n  width: ${v.sz}px;\n  height: ${v.sz}px;\n  border-radius: 50%;\n  background: ${v.bc};\n}\n\n.item::after {\n  content: ' →';\n  color: ${v.ac};\n  font-weight: bold;\n}\n\n.drop-cap::first-letter {\n  font-size: ${v.flsz}em;\n  font-weight: bold;\n  color: ${v.bc};\n  float: left;\n  line-height: 0.8;\n  margin-right: 4px;\n}`,
          html: `<div class="item">List item with ::before dot and ::after arrow</div>\n<div class="item">Another item</div>\n<p class="drop-cap">Drop cap paragraph — the first letter is enlarged using ::first-letter pseudo-element.</p>`,
        }),
      },
      {
        id: "ps-3", type: "editor",
        title: "Style a Navigation with Pseudo-classes",
        description: "Use pseudo-classes to style this nav bar. The active link should look different from the rest, and hovering should give visual feedback. Try :hover, :nth-child(), and the .active class.",
        callout: "You can chain pseudo-classes: <code>a:not(.active):hover</code> targets links that are hovered but not already active.",
        concepts: [":hover", ":not()", ".active", "transition"],
        editorHint: "Give <strong>.nav a:hover</strong> and <strong>.nav a.active</strong> different styles. Try adding an underline, background, or color change.",
        lockedHTML: true,
        starterCSS: `.nav {\n  display: flex;\n  gap: 4px;\n  background: #1e1b16;\n  padding: 8px;\n  border-radius: 8px;\n}\n\n.nav a {\n  color: rgba(255,255,255,0.5);\n  text-decoration: none;\n  padding: 6px 14px;\n  border-radius: 4px;\n  font-family: sans-serif;\n  font-size: 14px;\n  transition: all 0.15s;\n}\n\n/* Add :hover and .active styles below */`,
        starterHTML: `<nav class="nav">\n  <a href="#">Home</a>\n  <a href="#" class="active">About</a>\n  <a href="#">Projects</a>\n  <a href="#">Contact</a>\n</nav>`,
        solutionCSS: `.nav {\n  display: flex;\n  gap: 4px;\n  background: #1e1b16;\n  padding: 8px;\n  border-radius: 8px;\n}\n\n.nav a {\n  color: rgba(255,255,255,0.5);\n  text-decoration: none;\n  padding: 6px 14px;\n  border-radius: 4px;\n  font-family: sans-serif;\n  font-size: 14px;\n  transition: all 0.15s;\n}\n\n.nav a:hover {\n  background: rgba(255,255,255,0.08);\n  color: white;\n}\n\n.nav a.active {\n  background: #c84b2f;\n  color: white;\n}`,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────
  //  CHAPTER 10 — OVERFLOW & SCROLL
  // ──────────────────────────────────────────────────────────────
  {
    id: "overflow",
    label: "Overflow & Scroll",
    lessons: [
      {
        id: "ov-1", type: "knobs",
        title: "Overflow",
        description: "When content is larger than its container, overflow determines what happens. 'hidden' clips content. 'scroll' always shows scrollbars. 'auto' only shows them when needed.",
        callout: "<code>overflow: hidden</code> on a parent also clips absolutely positioned children — a common gotcha. It also creates a new block formatting context, which prevents margin collapse.",
        concepts: ["overflow", "overflow-x", "overflow-y", "clip"],
        knobs: [
          { id: "ov", label: "overflow", type: "select",
            options: [{ label: "visible", value: "visible" }, { label: "hidden", value: "hidden" }, { label: "scroll", value: "scroll" }, { label: "auto", value: "auto" }],
            default: "visible" },
          { id: "h",  label: "container height", type: "range", min: 60, max: 200, step: 10, unit: "px", default: 100 },
        ],
        template: v => ({
          css:  `.box {\n  width: 220px;\n  height: ${v.h}px;\n  overflow: ${v.ov};\n  background: #e8dece;\n  border: 2px solid #9c9288;\n  border-radius: 6px;\n  padding: 12px;\n  font-family: sans-serif;\n  font-size: 13px;\n  line-height: 1.6;\n  color: #1e1b16;\n}`,
          html: `<div class="box">This container has a fixed height. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.</div>`,
        }),
      },
      {
        id: "ov-2", type: "knobs",
        title: "Text Overflow & Clamp",
        description: "text-overflow controls what happens when text overflows its line. white-space: nowrap prevents wrapping. Together they enable the classic truncated text pattern with an ellipsis.",
        callout: "The modern <code>-webkit-line-clamp</code> trick lets you clamp to a specific number of lines. It requires <code>display: -webkit-box</code> and <code>-webkit-box-orient: vertical</code>.",
        concepts: ["text-overflow", "white-space", "overflow", "line-clamp"],
        knobs: [
          { id: "to",    label: "text-overflow",  type: "select",
            options: [{ label: "clip", value: "clip" }, { label: "ellipsis", value: "ellipsis" }],
            default: "ellipsis" },
          { id: "lines", label: "max lines (clamp)", type: "range", min: 1, max: 5, step: 1, unit: "", default: 2 },
          { id: "w",     label: "container width",  type: "range", min: 100, max: 320, step: 10, unit: "px", default: 200 },
        ],
        template: v => ({
          css:  `.single-line {\n  width: ${v.w}px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ${v.to};\n  font-family: sans-serif;\n  font-size: 14px;\n  background: #e8dece;\n  padding: 8px 12px;\n  border-radius: 4px;\n  margin-bottom: 16px;\n}\n\n.multi-line {\n  width: ${v.w}px;\n  display: -webkit-box;\n  -webkit-line-clamp: ${v.lines};\n  -webkit-box-orient: vertical;\n  overflow: hidden;\n  font-family: sans-serif;\n  font-size: 14px;\n  line-height: 1.5;\n  background: #e8dece;\n  padding: 8px 12px;\n  border-radius: 4px;\n}\n\n.label { font-family: monospace; font-size: 11px; color: #6b6356; margin-bottom: 4px; }`,
          html: `<p class="label">single line + text-overflow: ${v.to}</p>\n<div class="single-line">The quick brown fox jumps over the lazy dog and keeps on running.</div>\n<p class="label">multi-line clamp to ${v.lines} line(s)</p>\n<div class="multi-line">The quick brown fox jumps over the lazy dog. This paragraph has multiple sentences to demonstrate multi-line clamping in CSS.</div>`,
        }),
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────
  //  CHAPTER 11 — FILTERS & VISUAL EFFECTS
  // ──────────────────────────────────────────────────────────────
  {
    id: "filters",
    label: "Filters & Effects",
    lessons: [
      {
        id: "fi-1", type: "knobs",
        title: "CSS Filters",
        description: "The filter property applies graphical effects directly to an element — blur, brightness, contrast, grayscale, hue rotation, and more. Multiple filters can be chained in a single declaration.",
        callout: "Filters apply to the entire element including its children. Use <code>backdrop-filter</code> instead if you want to filter only what's behind an element (like a frosted glass effect).",
        concepts: ["filter", "blur()", "brightness()", "grayscale()", "hue-rotate()"],
        knobs: [
          { id: "blur",   label: "blur",       type: "range", min: 0, max: 20, step: 0.5, unit: "px", default: 0 },
          { id: "brt",    label: "brightness",  type: "range", min: 0, max: 3,  step: 0.05, unit: "",  default: 1 },
          { id: "sat",    label: "saturate",    type: "range", min: 0, max: 4,  step: 0.1,  unit: "",  default: 1 },
          { id: "gray",   label: "grayscale",   type: "range", min: 0, max: 1,  step: 0.05, unit: "",  default: 0 },
          { id: "hue",    label: "hue-rotate",  type: "range", min: 0, max: 360, step: 5,  unit: "deg", default: 0 },
        ],
        template: v => ({
          css:  `.img {\n  width: 220px;\n  height: 160px;\n  border-radius: 8px;\n  background: linear-gradient(135deg, #c84b2f, #2f6fc8, #2e7d50);\n  filter:\n    blur(${v.blur}px)\n    brightness(${v.brt})\n    saturate(${v.sat})\n    grayscale(${v.gray})\n    hue-rotate(${v.hue}deg);\n  transition: filter 0.1s;\n}`,
          html: `<div class="img"></div>`,
        }),
      },
      {
        id: "fi-2", type: "knobs",
        title: "Backdrop Filter",
        description: "backdrop-filter applies filter effects to everything behind an element, not the element itself. This creates the frosted glass effect used in modern UIs.",
        callout: "For backdrop-filter to work, the element must have a semi-transparent background — otherwise there's nothing to 'see through'. The element needs <code>position</code> set too.",
        concepts: ["backdrop-filter", "blur()", "rgba()", "glassmorphism"],
        knobs: [
          { id: "blur", label: "backdrop blur",  type: "range", min: 0,   max: 24, step: 1,    unit: "px", default: 10 },
          { id: "bga",  label: "bg alpha",        type: "range", min: 0,   max: 1,  step: 0.02, unit: "",   default: 0.2 },
          { id: "brt",  label: "backdrop brightness", type: "range", min: 0.5, max: 1.5, step: 0.05, unit: "", default: 1 },
        ],
        template: v => ({
          css:  `.scene {\n  width: 280px;\n  height: 200px;\n  background: linear-gradient(135deg, #c84b2f 0%, #2f6fc8 50%, #2e7d50 100%);\n  border-radius: 8px;\n  position: relative;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n\n.glass {\n  backdrop-filter: blur(${v.blur}px) brightness(${v.brt});\n  -webkit-backdrop-filter: blur(${v.blur}px) brightness(${v.brt});\n  background: rgba(255, 255, 255, ${v.bga});\n  border: 1px solid rgba(255,255,255,0.3);\n  border-radius: 8px;\n  padding: 16px 24px;\n  color: white;\n  font-family: sans-serif;\n  font-size: 14px;\n  font-weight: 500;\n  text-shadow: 0 1px 2px rgba(0,0,0,0.3);\n}`,
          html: `<div class="scene">\n  <div class="glass">Frosted glass ✦</div>\n</div>`,
        }),
      },
      {
        id: "fi-3", type: "knobs",
        title: "Clip-Path",
        description: "clip-path hides parts of an element outside a defined shape. You can use basic shapes like circle() and polygon(), or complex SVG paths.",
        callout: "clip-path works with transitions and animations — you can morph between shapes. The polygon() function takes x y pairs: <code>polygon(0 0, 100% 0, 100% 80%, 50% 100%, 0 80%)</code>.",
        concepts: ["clip-path", "polygon()", "circle()", "ellipse()"],
        knobs: [
          { id: "shape", label: "shape", type: "select",
            options: [
              { label: "none",     value: "none" },
              { label: "circle",   value: "circle(40%)" },
              { label: "ellipse",  value: "ellipse(50% 35% at 50% 50%)" },
              { label: "pentagon", value: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)" },
              { label: "arrow",    value: "polygon(0 20%, 60% 20%, 60% 0%, 100% 50%, 60% 100%, 60% 80%, 0 80%)" },
              { label: "chevron",  value: "polygon(0 0, 85% 0, 100% 50%, 85% 100%, 0 100%, 15% 50%)" },
            ],
            default: "circle(40%)" },
          { id: "bg", label: "color", type: "color", default: "#c84b2f" },
        ],
        template: v => ({
          css:  `.shape {\n  width: 180px;\n  height: 180px;\n  background: ${v.bg};\n  clip-path: ${v.shape};\n  transition: clip-path 0.4s ease;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  color: white;\n  font-family: monospace;\n  font-size: 28px;\n}`,
          html: `<div class="shape">✦</div>`,
        }),
      },
      {
        id: "fi-4", type: "knobs",
        title: "Box Shadow & Drop Shadow",
        description: "box-shadow adds shadows around an element's box. Multiple shadows can be layered with commas. drop-shadow() filter follows the element's shape including transparency.",
        callout: "A negative spread value shrinks the shadow — useful for creating a shadow only on one side. Inset shadows appear inside the element rather than outside.",
        concepts: ["box-shadow", "inset", "drop-shadow()", "filter"],
        knobs: [
          { id: "ox",   label: "offset-x",   type: "range", min: -20, max: 20, step: 1, unit: "px", default: 4 },
          { id: "oy",   label: "offset-y",   type: "range", min: -20, max: 20, step: 1, unit: "px", default: 8 },
          { id: "blur", label: "blur",        type: "range", min: 0,   max: 40, step: 1, unit: "px", default: 16 },
          { id: "sprd", label: "spread",      type: "range", min: -10, max: 20, step: 1, unit: "px", default: 0 },
          { id: "col",  label: "shadow color", type: "color", default: "#1e1b16" },
          { id: "inset", label: "inset",      type: "toggle", default: false },
        ],
        template: v => ({
          css:  `.box {\n  width: 160px;\n  height: 100px;\n  background: #f5f0e8;\n  border-radius: 8px;\n  box-shadow: ${v.inset ? "inset " : ""}${v.ox}px ${v.oy}px ${v.blur}px ${v.sprd}px ${v.col};\n  transition: box-shadow 0.15s;\n}`,
          html: `<div class="box"></div>`,
        }),
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────
  //  CHAPTER 12 — ADVANCED LAYOUT
  // ──────────────────────────────────────────────────────────────
  {
    id: "advanced-layout",
    label: "Advanced Layout",
    lessons: [
      {
        id: "al-1", type: "knobs",
        title: "CSS Aspect Ratio",
        description: "aspect-ratio maintains a proportional relationship between width and height. Set it once and the browser calculates the other dimension automatically, even as the container resizes.",
        callout: "<code>aspect-ratio: 16/9</code> creates a widescreen box. <code>aspect-ratio: 1</code> makes a perfect square. This replaces the old 'padding-top hack' for responsive embeds.",
        concepts: ["aspect-ratio", "responsive", "intrinsic sizing"],
        knobs: [
          { id: "w",  label: "container width", type: "range", min: 100, max: 320, step: 10, unit: "px", default: 240 },
          { id: "ar", label: "aspect-ratio",    type: "select",
            options: [{ label: "1/1", value: "1/1" }, { label: "4/3", value: "4/3" }, { label: "16/9", value: "16/9" }, { label: "21/9", value: "21/9" }, { label: "3/4", value: "3/4" }],
            default: "16/9" },
          { id: "bg", label: "color", type: "color", default: "#c84b2f" },
        ],
        template: v => ({
          css:  `.container {\n  width: ${v.w}px;\n}\n.box {\n  width: 100%;\n  aspect-ratio: ${v.ar};\n  background: ${v.bg};\n  border-radius: 6px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  color: white;\n  font-family: monospace;\n  font-size: 13px;\n}`,
          html: `<div class="container">\n  <div class="box">aspect-ratio: ${v.ar}</div>\n</div>`,
        }),
      },
      {
        id: "al-2", type: "knobs",
        title: "Logical Properties",
        description: "Logical properties use start/end/inline/block instead of left/right/top/bottom. They adapt automatically to different writing modes and text directions, making internationalisation much easier.",
        callout: "In a left-to-right horizontal writing mode, <code>margin-inline-start</code> equals <code>margin-left</code>. In a right-to-left mode, it becomes <code>margin-right</code> automatically.",
        concepts: ["margin-inline", "padding-block", "inset-inline", "writing-mode"],
        knobs: [
          { id: "ms",  label: "margin-inline-start", type: "range", min: 0, max: 60, step: 4, unit: "px", default: 0 },
          { id: "me",  label: "margin-inline-end",   type: "range", min: 0, max: 60, step: 4, unit: "px", default: 0 },
          { id: "wm",  label: "writing-mode", type: "select",
            options: [{ label: "horizontal-tb", value: "horizontal-tb" }, { label: "vertical-rl", value: "vertical-rl" }, { label: "vertical-lr", value: "vertical-lr" }],
            default: "horizontal-tb" },
        ],
        template: v => ({
          css:  `.wrapper {\n  writing-mode: ${v.wm};\n  background: #e8dece;\n  padding: 16px;\n  border-radius: 6px;\n  display: inline-block;\n}\n\n.box {\n  background: #c84b2f;\n  color: white;\n  font-family: sans-serif;\n  font-size: 13px;\n  padding: 10px 16px;\n  border-radius: 4px;\n  margin-inline-start: ${v.ms}px;\n  margin-inline-end: ${v.me}px;\n}`,
          html: `<div class="wrapper">\n  <div class="box">Logical properties</div>\n</div>`,
        }),
      },
      {
        id: "al-3", type: "editor",
        title: "Build a Card Layout",
        description: "Use what you've learned to build a polished card component from scratch. The HTML is locked — write CSS only. Aim for good spacing, a clear visual hierarchy, and a hover state.",
        callout: "There's no single correct answer here. Focus on: consistent spacing with a variable or consistent values, readable typography, and a smooth transition on hover.",
        concepts: ["composition", "box-shadow", "transition", ":hover", "flexbox"],
        editorHint: "Try adding a colored top border with <strong>border-top</strong>, and using <strong>box-shadow</strong> to lift the card on hover.",
        lockedHTML: true,
        starterCSS: `/* Style the card from scratch */\n\n.card {\n  \n}\n\n.card-img {\n  \n}\n\n.card-body {\n  \n}\n\n.card-title {\n  \n}\n\n.card-text {\n  \n}\n\n.card-tag {\n  \n}\n\n.card:hover {\n  \n}`,
        starterHTML: `<div class="card">\n  <div class="card-img"></div>\n  <div class="card-body">\n    <span class="card-tag">Design</span>\n    <h2 class="card-title">Card Title</h2>\n    <p class="card-text">A short description of the card content goes here.</p>\n  </div>\n</div>`,
        solutionCSS: `.card {\n  width: 240px;\n  border-radius: 10px;\n  overflow: hidden;\n  background: white;\n  box-shadow: 0 2px 12px rgba(30,27,22,0.1);\n  transition: transform 0.2s ease, box-shadow 0.2s ease;\n  font-family: sans-serif;\n}\n\n.card-img {\n  width: 100%;\n  height: 120px;\n  background: linear-gradient(135deg, #c84b2f, #2f6fc8);\n}\n\n.card-body {\n  padding: 16px;\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n}\n\n.card-tag {\n  font-size: 10px;\n  text-transform: uppercase;\n  letter-spacing: 0.1em;\n  color: #c84b2f;\n  font-weight: 600;\n}\n\n.card-title {\n  font-size: 16px;\n  font-weight: 700;\n  color: #1e1b16;\n  line-height: 1.2;\n}\n\n.card-text {\n  font-size: 13px;\n  color: #6b6356;\n  line-height: 1.55;\n}\n\n.card:hover {\n  transform: translateY(-4px);\n  box-shadow: 0 8px 24px rgba(30,27,22,0.15);\n}`,
      },
    ],
  },

];