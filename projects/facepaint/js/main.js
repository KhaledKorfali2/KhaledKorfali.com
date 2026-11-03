// FacePaint: wires tracking → signals → paint, and runs the UI.
import * as settings from "./settings.js";
import { Paint } from "./paint.js";
import { FaceSignals } from "./signals.js";
import { HandSignals } from "./hands.js";
import { Preview } from "./preview.js";
import * as tracker from "./tracker.js";

const COLORS = [
  ["White", "#ffffff"], ["Yellow", "#f5e642"], ["Orange", "#f5923e"], ["Red", "#e84040"],
  ["Pink", "#e840a8"], ["Violet", "#9b5cf0"], ["Blue", "#3f7ef0"], ["Cyan", "#40d4e8"],
  ["Green", "#3ecf74"], ["Lime", "#b0e840"], ["Brown", "#a0604a"], ["Black", "#16161a"],
];
const SIZES = [3, 6, 10, 16, 26];
const MIN_SIZE = 2, MAX_SIZE = 48;
const LIGHT_FX = ["glow", "bloom", "neon", "depth", "sparkle", "fade"];
const BRUSH_FX = ["rainbow", "taper", "dots"];
const SCOPE_NOTE = { all: "Light effects change the whole drawing.", new: "Light effects apply to strokes you draw from now on." };

const $ = (id) => document.getElementById(id);
const app = $("app");
const paper = $("paper");
const cursor = $("cursor");
const paint = new Paint(paper, $("bloom"), $("sparks"));
const face = new FaceSignals(settings.get);
const hands = new HandSignals(settings.get);
const preview = new Preview($("pip"));

let mode = "intro";          // intro | camera | mouse
let calibrating = false;
let holdDown = false;        // face "hold" trigger: screen pressed / Space held
let pen = false;
let noFaceSince = null;
let sizeGesture = null;      // { start } while the off hand is resizing
let switching = false;
let hue = Math.random() * 360; // rainbow ink carries on from stroke to stroke

const control = () => settings.get("control");
const hueAt = (st) => (st.hue0 + st.dist[st.dist.length - 1] * 0.45) % 360; // matches paint.js

/* ── layout ── */
new ResizeObserver(() => paint.resize()).observe(paper);

/* ── status & toast ── */
function setStatus(text, tone = "") {
  const s = $("status");
  s.dataset.tone = tone;
  s.querySelector("span").textContent = text;
}
let toastTimer;
function toast(text, action) {
  const t = $("toast"), btn = $("toastAction");
  $("toastText").textContent = text;
  btn.hidden = !action;
  if (action) { btn.textContent = action.label; btn.onclick = () => { action.run(); t.classList.remove("show"); }; }
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), action ? 4500 : 1800);
}

/* ── colour & size ── */
const color = () => COLORS[settings.get("color")] || COLORS[0];
function setColor(i, announce = false) {
  const n = ((i % COLORS.length) + COLORS.length) % COLORS.length;
  if (settings.get("rainbow")) settings.set("rainbow", false); // picking a colour means you want that colour
  settings.set("color", n);
  if (announce) toast(COLORS[n][0]);
  syncTools();
}
function setSize(px) { settings.set("size", Math.round(Math.max(MIN_SIZE, Math.min(MAX_SIZE, px)))); }
// Size icon: the squiggle's thickness follows the brush (2–48px → 1.4–7.5 in a 24px icon).
const iconWidth = (px) => (1.4 + (Math.min(px, 48) - 2) / 46 * 6.1).toFixed(2);
function syncTools() {
  const [name, hex] = color();
  const rainbow = settings.get("rainbow"), size = settings.get("size"), i = settings.get("color");
  // Palette: big blob = current colour; small dots = the next colours (what a wink or ] reaches).
  const dots = rainbow ? ["#f44", "#4e8", "#4cf"] : [1, 2, 3].map((d) => COLORS[(i + d) % COLORS.length][1]);
  $("colorBtn").querySelector(".pal-main").style.fill = rainbow ? "#fd4" : hex;
  $("colorBtn").querySelectorAll(".pal-dot").forEach((c, k) => { c.style.fill = dots[k]; });
  $("colorBtn").setAttribute("aria-label", rainbow ? "Colour: rainbow" : `Colour: ${name}`);
  $("sizeLine").style.strokeWidth = iconWidth(size);
  $("sizeBtn").setAttribute("aria-label", `Brush size: ${size}`);
  cursor.style.setProperty("--c", rainbow ? `hsl(${hue} 92% 62%)` : hex);
  cursor.style.setProperty("--s", Math.max(8, size) + "px");
  document.querySelectorAll("#colors button").forEach((b, k) => b.setAttribute("aria-pressed", String(!rainbow && k === i)));
  document.querySelectorAll("#sizes button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.size === size)));
  $("undoBtn").disabled = !paint.canUndo;
  $("redoBtn").disabled = !paint.canRedo;
  $("clearBtn").disabled = paint.isEmpty;
  const anyFx = [...LIGHT_FX, ...BRUSH_FX].some((k) => settings.get(k)) || settings.get("sym") > 1;
  $("fxBtn").classList.toggle("is-on", anyFx);
}
$("colors").innerHTML = COLORS.map(([n, h], i) => `<button type="button" style="--c:${h}" data-color="${i}" aria-label="${n}" title="${n}"></button>`).join("");
$("sizes").innerHTML = SIZES.map((s, i) => `<button type="button" data-size="${s}" aria-label="Size ${i + 1}" title="Size ${i + 1}"><svg viewBox="0 0 24 24"><path d="M5 15c3-5 5-5 7-2s4 3 7-2" style="stroke-width:${iconWidth(s)}"/></svg></button>`).join("");
paint.onChange(syncTools);

/* ── popovers ── */
const POPS = [["colorPop", "colorBtn"], ["sizePop", "sizeBtn"], ["fxPop", "fxBtn"], ["savePop", "saveBtn"]];
function togglePop(which, open) {
  if (which === "fxPop") fillFx();
  for (const [pop, btn] of POPS) {
    const show = pop === which && (open ?? $(pop).hidden);
    $(pop).hidden = !show;
    $(btn).setAttribute("aria-expanded", String(show));
  }
}
for (const [pop, btn] of POPS) $(btn).onclick = () => togglePop(pop);
$("colors").onclick = (e) => { const b = e.target.closest("[data-color]"); if (b) { setColor(+b.dataset.color); togglePop(null); } };
$("sizes").onclick = (e) => { const b = e.target.closest("[data-size]"); if (b) { setSize(+b.dataset.size); togglePop(null); } };
document.addEventListener("pointerdown", (e) => {
  if (!(e.target instanceof Element) || !e.target.closest(".pop, .dock")) togglePop(null);
});

/* ── effects ── */
function fillFx() {
  document.querySelectorAll("[data-fx]").forEach((c) => { c.checked = settings.get(c.dataset.fx); });
  document.querySelectorAll('input[name="fxSym"]').forEach((r) => { r.checked = +r.value === settings.get("sym"); });
  document.querySelectorAll('input[name="fxScope"]').forEach((r) => { r.checked = r.value === settings.get("fxScope"); });
  $("fxNote").textContent = SCOPE_NOTE[settings.get("fxScope")];
}
$("fxPop").addEventListener("change", (e) => {
  const c = e.target;
  if (c.dataset.fx) {
    settings.set(c.dataset.fx, c.checked);
    // One line explains the effect just toggled (chips stay short; touch has no hover tooltips).
    $("fxNote").textContent = c.checked ? c.closest("[data-tip]").dataset.tip : "";
  }
  if (c.name === "fxSym") settings.set("sym", +c.value);
  if (c.name === "fxScope") { settings.set("fxScope", c.value); $("fxNote").textContent = SCOPE_NOTE[c.value]; }
});
function applyEffects() {
  paint.setScope(settings.get("fxScope"));
  paint.setEffects(Object.fromEntries(LIGHT_FX.map((k) => [k, settings.get(k)])));
  syncTools();
}

/* ── history, export, replay ── */
const doUndo = () => { endStroke(); if (!paint.undo()) toast("Nothing to undo"); };
const doRedo = () => { if (!paint.redo()) toast("Nothing to redo"); };
function doClear() {
  endStroke();
  if (paint.clear()) toast("Canvas cleared", { label: "Undo", run: () => paint.undo() });
}
async function doSave() {
  togglePop(null);
  if (paint.isEmpty) return toast("Draw something first");
  const blob = await paint.toBlob();
  const name = `facepaint-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
  const file = new File([blob], name, { type: "image/png" });
  // Phones: the share sheet lets people save to Photos or send it on.
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "FacePaint drawing" }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Saved");
}
async function doReplay() {
  togglePop(null);
  endStroke(); pen = false;
  if (paint.replaying) return paint.stopReplay();
  if (paint.isEmpty) return toast("Draw something first");
  app.classList.add("is-replaying");
  toast("Replaying", { label: "Stop", run: () => paint.stopReplay() });
  await paint.replay();
  app.classList.remove("is-replaying");
  $("toast").classList.remove("show");
}
$("undoBtn").onclick = doUndo;
$("redoBtn").onclick = doRedo;
$("clearBtn").onclick = doClear;
$("saveImg").onclick = doSave;
$("replayBtn").onclick = doReplay;

/* ── drawing ── */
// The brush is read at every point, so size and colour changes mid-stroke show up in the line.
const brush = () => ({
  color: color()[1], size: settings.get("size"), rainbow: settings.get("rainbow"),
  sym: settings.get("sym"), taper: settings.get("taper"), dots: settings.get("dots"), hue0: hue,
});
function startStroke(pt) {
  if (paint.replaying) paint.stopReplay();
  paint.begin(pt, brush());
}
function endStroke() {
  const c = paint.current;
  if (!c) return;
  if (c.c[c.c.length - 1] === null) hue = hueAt(c); // rainbow: the next stroke picks up where this one left off
  paint.end();
}
function placeCursor(docPt, drawing = false) {
  if (!docPt) { cursor.classList.add("is-hidden"); return; }
  const [x, y] = paint.toCss(docPt[0], docPt[1]);
  cursor.style.transform = `translate(${x}px, ${y}px)`;
  cursor.classList.remove("is-hidden");
  cursor.classList.toggle("is-drawing", drawing);
  if (settings.get("rainbow")) cursor.style.setProperty("--c", `hsl(${paint.current ? hueAt(paint.current) : hue} 92% 62%)`);
}
function penTo(want, pt) {
  if (want && !pen) startStroke(pt);
  else if (want) paint.extend(pt, brush());
  if (!want && pen) endStroke();
  pen = want;
}

/* ── camera frames ── */
function onFrame(frame) {
  if (frame.ended) {
    penTo(false);
    toast("Camera disconnected");
    setStatus("Camera off", "bad");
    return;
  }
  if (switching || paint.replaying) return;
  if (frame.kind === "hands") onHands(frame); else onFace(frame);
}

function onFace(frame) {
  const sig = face.update(frame);
  if (sig.events.includes("calibrated")) finishCalibration();
  if (calibrating) {
    $("calibProg").style.strokeDashoffset = String(327 * (1 - face.calibrationProgress));
    $("calibTitle").textContent = sig.face ? "Look here" : "Looking for your face…";
    $("calibSub").textContent = sig.face ? "Keep your face relaxed for a moment." : "Make sure your face is in view and well lit.";
    // No face for a while (lighting, wrong camera…): don't trap people behind the overlay.
    if (sig.face) noFaceSince = null; else noFaceSince ??= frame.t;
    $("calibSkip").hidden = !(noFaceSince !== null && frame.t - noFaceSince > 6);
  }
  if (settings.get("winks")) for (const e of sig.events) {
    if (e === "wink-screen-left") setColor(settings.get("color") - 1, true);
    if (e === "wink-screen-right") setColor(settings.get("color") + 1, true);
  }
  const trigger = settings.get("trigger");
  if (sig.face && !calibrating) {
    const pt = paint.fromUnit(sig.x, sig.y);
    penTo(trigger === "mouth" ? sig.pen : holdDown, pt);
    placeCursor(pt, pen);
  } else { penTo(false); placeCursor(null); }

  if (!calibrating) {
    if (!sig.face) setStatus("Face not found", "bad");
    else if (pen) setStatus("Painting", "on");
    else setStatus(trigger === "mouth" ? "Open mouth to paint" : "Hold to paint", "ready");
  }
  preview.setMessage(sig.face ? "" : "Move into view");
  if (settings.get("showPreview")) preview.render(frame, sig, pen);
}

function onHands(frame) {
  const sig = hands.update(frame);
  // Off hand: pinch + vertical drag resizes, relative to the size when the pinch began.
  if (sig.events.includes("size-start")) sizeGesture = { start: settings.get("size") };
  if (sizeGesture && sig.sizeDelta !== undefined) {
    setSize(sizeGesture.start + sig.sizeDelta * (MAX_SIZE - MIN_SIZE) / 2);
    showSizeHud();
  }
  if (sig.events.includes("size-end")) { sizeGesture = null; hideSizeHud(); }

  if (sig.found) {
    const pt = paint.fromUnit(sig.x, sig.y);
    penTo(sig.pen, pt);
    placeCursor(pt, pen);
  } else { penTo(false); placeCursor(null); }

  const drawHand = settings.get("dominantHand") === "left" ? "left" : "right";
  if (!sig.found) setStatus(`Show your ${drawHand} hand`, "bad");
  else if (sizeGesture) setStatus(`Size ${settings.get("size")}`, "ready");
  else if (pen) setStatus("Painting", "on");
  else setStatus("Pinch to paint", "ready");
  preview.setMessage(sig.found ? "" : "Raise your hand");
  if (settings.get("showPreview")) preview.renderHands(frame, sig, sig.roles, pen);
}

let hudTimer;
function showSizeHud() {
  const h = $("sizeHud"), dot = h.querySelector("i"), s = settings.get("size");
  clearTimeout(hudTimer);
  h.hidden = false;
  dot.style.width = dot.style.height = s + "px";
  dot.style.background = settings.get("rainbow") ? `hsl(${hue} 92% 62%)` : color()[1];
  h.querySelector("span").textContent = s;
}
function hideSizeHud() { clearTimeout(hudTimer); hudTimer = setTimeout(() => { $("sizeHud").hidden = true; }, 600); }

/* ── calibration (face only) ── */
function beginCalibration(full = true) {
  penTo(false);
  calibrating = true;
  noFaceSince = null;
  app.classList.add("is-calibrating");
  $("calib").hidden = false;
  $("calibSkip").hidden = true;
  $("calibProg").style.strokeDashoffset = "327";
  setStatus("Calibrating", "");
  face.calibrate(full ? 1600 : 800, full);
}
function finishCalibration() {
  calibrating = false;
  app.classList.remove("is-calibrating");
  $("calib").hidden = true;
  maybeHint();
}
function cancelCalibration() {
  calibrating = false;
  app.classList.remove("is-calibrating");
  $("calib").hidden = true;
}
function maybeHint() { if (!settings.get("tipsSeen")) $("hint").hidden = false; }

/* ── start / switching ── */
async function startCamera() {
  const chosen = document.querySelector('input[name="introControl"]:checked')?.value;
  if (chosen) settings.set("control", chosen);
  $("startBtn").hidden = true;
  $("mouseBtn").hidden = true;
  $("introError").hidden = true;
  $("introLoading").hidden = false;
  try {
    await tracker.start(onFrame, (s) => { $("introStatus").textContent = s; }, control());
    enterMode("camera");
    if (control() === "face") beginCalibration(true); else maybeHint();
  } catch (err) {
    console.error(err);
    $("introLoading").hidden = true;
    $("startBtn").hidden = false;
    $("startBtn").textContent = "Try again";
    $("mouseBtn").hidden = false;
    $("introError").textContent = err instanceof tracker.TrackerError ? err.message : "Something went wrong starting the camera.";
    $("introError").hidden = false;
  }
}

async function switchControl(next) {
  if (mode !== "camera" || switching || tracker.currentKind() === next) return;
  switching = true;
  penTo(false);
  cancelCalibration();
  placeCursor(null);
  preview.clear();
  setStatus(next === "hands" ? "Loading hand tracker…" : "Loading face tracker…", "");
  try {
    await tracker.setKind(next);
    switching = false;
    applySettings();
    toast(next === "hands" ? "Hand control: pinch to paint" : "Face control");
    if (next === "face") beginCalibration(!face.calibrated);
  } catch (e) {
    console.error(e);
    switching = false;
    toast("Couldn't load that tracker. Check your connection.");
    settings.set("control", tracker.currentKind());
  }
}
const toggleControl = () => settings.set("control", control() === "face" ? "hands" : "face");

function enterMode(m) {
  mode = m;
  app.dataset.mode = m;
  $("intro").hidden = true;
  if (m === "mouse") setStatus("Drawing with pointer", "ready");
  applySettings();
  paint.resize();
}

function useMouse() {
  tracker.stop();
  cancelCalibration();
  enterMode("mouse");
  toast("Drag to draw");
}

/* ── pointer input: mouse mode draws directly; face + "hold" uses presses as the pen ── */
const holdMode = () => mode === "camera" && app.dataset.control === "face" && settings.get("trigger") === "hold";
paper.addEventListener("pointerdown", (e) => {
  togglePop(null);
  if (paint.replaying) return paint.stopReplay();
  if (mode === "mouse") {
    paper.setPointerCapture(e.pointerId);
    const r = paper.getBoundingClientRect();
    const pt = paint.toDoc(e.clientX - r.left, e.clientY - r.top);
    startStroke(pt);
    pen = true;
    if (e.pointerType === "mouse") placeCursor(pt, true);
  } else if (holdMode()) {
    paper.setPointerCapture(e.pointerId); // keep the press even if the finger slides off the canvas
    holdDown = true;
  }
});
paper.addEventListener("pointermove", (e) => {
  if (mode !== "mouse") return;
  const r = paper.getBoundingClientRect();
  // Coalesced events give every sample between frames (smoother fast strokes); fall back to the event itself.
  const batch = e.getCoalescedEvents?.();
  if (pen) { const b = brush(); for (const ce of batch && batch.length ? batch : [e]) paint.extend(paint.toDoc(ce.clientX - r.left, ce.clientY - r.top), b); }
  if (e.pointerType === "mouse") placeCursor(paint.toDoc(e.clientX - r.left, e.clientY - r.top), pen);
});
const release = () => {
  holdDown = false;
  if (mode === "mouse" && pen) { endStroke(); pen = false; }
};
paper.addEventListener("pointerup", release);
paper.addEventListener("pointercancel", release);
paper.addEventListener("pointerleave", (e) => { if (mode === "mouse" && e.pointerType === "mouse") placeCursor(null); });

/* ── keyboard ── */
document.addEventListener("keydown", (e) => {
  const t = e.target instanceof Element ? e.target : null;
  if (t?.closest("input, textarea, select, dialog") || e.altKey) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && k === "s") { e.preventDefault(); return doSave(); }
  if (mod && k === "z") { e.preventDefault(); return e.shiftKey ? doRedo() : doUndo(); }
  if (mod && k === "y") { e.preventDefault(); return doRedo(); }
  if (mod || mode === "intro") return;
  if (k === " " && holdMode()) { holdDown = true; e.preventDefault(); return; }
  if (k === "z") return e.shiftKey ? doRedo() : doUndo();
  if (k === "y") return doRedo();
  if (k === "[") return setColor(settings.get("color") - 1, true);
  if (k === "]") return setColor(settings.get("color") + 1, true);
  if (k >= "1" && k <= "5") return setSize(SIZES[+k - 1]);
  if (k === "e") return togglePop("fxPop");
  if (k === "r") return doReplay();
  if (k === "h" && mode === "camera") return toggleControl();
  if (k === "c" && mode === "camera" && app.dataset.control === "face") return beginCalibration(false);
  if (k === "escape") { if (paint.replaying) paint.stopReplay(); return togglePop(null); }
});
document.addEventListener("keyup", (e) => { if (e.key === " ") holdDown = false; });
window.addEventListener("blur", () => { holdDown = false; });

/* ── settings sheet ── */
const sheet = $("settings");
const form = sheet.querySelector("form");
function fillForm() {
  for (const el of form.elements) {
    if (!el.name || !(el.name in settings.DEFAULTS)) continue;
    const v = settings.get(el.name);
    if (el.type === "checkbox") el.checked = v;
    else if (el.type === "radio") el.checked = el.value === String(v);
    else el.value = v;
  }
}
form.addEventListener("input", (e) => {
  const el = e.target;
  if (!el.name || !(el.name in settings.DEFAULTS)) return;
  settings.set(el.name, el.type === "checkbox" ? el.checked : el.type === "range" ? +el.value : el.value);
});
$("settingsBtn").onclick = () => { togglePop(null); fillForm(); sheet.showModal(); };
sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });
$("recalBtn").onclick = () => { sheet.close(); beginCalibration(true); };
$("recenterBtn").onclick = () => beginCalibration(false);
$("inputBtn").onclick = toggleControl;

function applySettings() {
  app.classList.toggle("no-preview", mode !== "camera" || !settings.get("showPreview"));
  // While a tracker loads, the UI keeps showing the one that's running.
  app.dataset.control = mode === "camera" ? tracker.currentKind() : control();
  app.dataset.trigger = settings.get("trigger");
  app.dataset.paper = settings.get("paper");
  preview.showMesh = settings.get("showMesh");
  paint.setPaper(settings.get("paper"));
  form.querySelector("[data-mouth-only]").hidden = settings.get("trigger") !== "mouth";

  const handsNow = app.dataset.control === "hands";
  $("inputBtn").setAttribute("aria-label", handsNow ? "Switch to face control" : "Switch to hand control");
  $("inputBtn").title = handsNow ? "Switch to face (H)" : "Switch to hands (H)";
  document.querySelector("[data-paint-hint]").textContent =
    settings.get("trigger") === "mouth" ? "Open your mouth to paint" : "Hold the screen or Space to paint";
  const lefty = settings.get("dominantHand") === "left";
  const draw = lefty ? "left" : "right", other = lefty ? "right" : "left";
  document.querySelector("[data-aim-hand]").textContent = `Move your ${draw} hand to aim`;
  document.querySelector("[data-size-hand]").textContent = `Pinch your ${other} hand, move up/down for size`;
  document.querySelector("[data-intro-aim]").textContent = `Raise your ${draw} hand and move it around.`;
  document.querySelector("[data-intro-size]").textContent = `Pinch with your ${other} hand and move it up or down.`;
  face.applySmoothing();
  hands.applySmoothing();
  applyEffects();
}
settings.onChange((k) => {
  if (k === "control") { if (sheet.open) fillForm(); return switchControl(control()); }
  // Brush changes happen every frame during a hand resize: keep them cheap (no full redraw).
  if (k === "size" || k === "color" || k === "tipsSeen" || BRUSH_FX.includes(k) || k === "sym") return syncTools();
  if (LIGHT_FX.includes(k) || k === "fxScope") return applyEffects();
  applySettings();
});

/* ── intro: face or hands ── */
function syncIntro() {
  const c = document.querySelector('input[name="introControl"]:checked')?.value || control();
  document.querySelectorAll("[data-steps]").forEach((ol) => { ol.hidden = ol.dataset.steps !== c; });
  app.dataset.control = c;
}
document.querySelectorAll('input[name="introControl"]').forEach((r) => {
  r.checked = r.value === control();
  r.addEventListener("change", syncIntro);
});

/* ── first-run hint ── */
$("hintOk").onclick = () => { $("hint").hidden = true; settings.set("tipsSeen", true); };

$("startBtn").onclick = startCamera;
$("mouseBtn").onclick = useMouse;
$("calibSkip").onclick = useMouse;
applySettings();
syncIntro();
