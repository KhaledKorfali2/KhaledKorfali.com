// FacePaint: wires tracking → signals → paint, and runs the UI.
import * as settings from "./settings.js";
import { Paint } from "./paint.js";
import { FaceSignals } from "./signals.js";
import { Preview } from "./preview.js";
import * as tracker from "./tracker.js";

const COLORS = [
  ["White", "#ffffff"], ["Yellow", "#f5e642"], ["Orange", "#f5923e"], ["Red", "#e84040"],
  ["Pink", "#e840a8"], ["Violet", "#9b5cf0"], ["Blue", "#3f7ef0"], ["Cyan", "#40d4e8"],
  ["Green", "#3ecf74"], ["Lime", "#b0e840"], ["Brown", "#a0604a"], ["Black", "#16161a"],
];
const SIZES = [3, 6, 10, 16, 26];

const $ = (id) => document.getElementById(id);
const app = $("app");
const paper = $("paper");
const cursor = $("cursor");
const paint = new Paint(paper);
const signals = new FaceSignals(settings.get);
const preview = new Preview($("pip"));

let mode = "intro";          // intro | face | mouse
let calibrating = false;
let holdDown = false;        // "hold" trigger: screen pressed / Space held
let pen = false;
let noFaceSince = null;

/* ── layout ── */
function layout() { paint.resize(); }
new ResizeObserver(layout).observe(paper);
paint.setPaper(settings.get("paper"));

/* ── status pill ── */
function setStatus(text, tone = "") {
  const s = $("status");
  s.dataset.tone = tone;
  s.querySelector("span").textContent = text;
}

/* ── toast ── */
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
  settings.set("color", n);
  syncTools();
  if (announce) toast(color()[0]);
}
function setSize(px) { settings.set("size", px); syncTools(); }
function syncTools() {
  const [name, hex] = color();
  $("swatch").style.background = hex;
  $("colorBtn").setAttribute("aria-label", `Colour: ${name}`);
  const d = $("sizeDot"), size = settings.get("size");
  d.style.width = d.style.height = Math.max(7, Math.min(22, size)) + "px";
  d.style.background = hex;
  cursor.style.setProperty("--c", hex);
  cursor.style.setProperty("--s", Math.max(8, size) + "px");
  document.querySelectorAll("#colors button").forEach((b, i) => b.setAttribute("aria-pressed", String(i === settings.get("color"))));
  document.querySelectorAll("#sizes button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.size === size)));
  $("undoBtn").disabled = !paint.canUndo;
  $("redoBtn").disabled = !paint.canRedo;
  $("clearBtn").disabled = paint.isEmpty;
}
$("colors").innerHTML = COLORS.map(([n, h], i) => `<button type="button" style="--c:${h}" data-color="${i}" aria-label="${n}" title="${n}"></button>`).join("");
$("sizes").innerHTML = SIZES.map((s, i) => `<button type="button" data-size="${s}" aria-label="Size ${i + 1}" title="Size ${i + 1}"><i style="width:${Math.min(s, 24)}px;height:${Math.min(s, 24)}px"></i></button>`).join("");
paint.onChange(syncTools);
syncTools();

/* ── popovers ── */
function togglePop(which, open) {
  for (const [pop, btn] of [["colorPop", "colorBtn"], ["sizePop", "sizeBtn"]]) {
    const show = pop === which && (open ?? $(pop).hidden);
    $(pop).hidden = !show;
    $(btn).setAttribute("aria-expanded", String(show));
  }
}
$("colorBtn").onclick = () => togglePop("colorPop");
$("sizeBtn").onclick = () => togglePop("sizePop");
$("colors").onclick = (e) => { const b = e.target.closest("[data-color]"); if (b) { setColor(+b.dataset.color); togglePop(null); } };
$("sizes").onclick = (e) => { const b = e.target.closest("[data-size]"); if (b) { setSize(+b.dataset.size); togglePop(null); } };
document.addEventListener("pointerdown", (e) => {
  if (!(e.target instanceof Element) || !e.target.closest(".pop, #colorBtn, #sizeBtn")) togglePop(null);
});

/* ── history & export ── */
const doUndo = () => { endStroke(); if (!paint.undo()) toast("Nothing to undo"); };
const doRedo = () => { if (!paint.redo()) toast("Nothing to redo"); };
function doClear() {
  endStroke();
  if (paint.clear()) toast("Canvas cleared", { label: "Undo", run: () => paint.undo() });
}
async function doSave() {
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
$("undoBtn").onclick = doUndo;
$("redoBtn").onclick = doRedo;
$("clearBtn").onclick = doClear;
$("saveBtn").onclick = doSave;

/* ── drawing ── */
function startStroke(pt) { paint.begin(color()[1], settings.get("size"), pt); }
function endStroke() { if (paint.drawing) paint.end(); }
function placeCursor(docPt, visible = true, drawing = false) {
  if (!visible) { cursor.classList.add("is-hidden"); return; }
  const [x, y] = paint.toCss(docPt[0], docPt[1]);
  cursor.style.transform = `translate(${x}px, ${y}px)`;
  cursor.classList.remove("is-hidden");
  cursor.classList.toggle("is-drawing", drawing);
}

/* ── face mode ── */
function onFrame(frame) {
  if (frame.ended) {
    endStroke();
    toast("Camera disconnected");
    setStatus("Camera off", "bad");
    return;
  }
  const sig = signals.update(frame);

  if (sig.events.includes("calibrated")) finishCalibration();
  if (calibrating) {
    $("calibProg").style.strokeDashoffset = String(327 * (1 - signals.calibrationProgress));
    $("calibTitle").textContent = sig.face ? "Look here" : "Looking for your face…";
    // No face for a while (lighting, wrong camera…): don't trap people behind the overlay.
    if (sig.face) noFaceSince = null; else noFaceSince ??= frame.t;
    $("calibSkip").hidden = !(noFaceSince !== null && frame.t - noFaceSince > 6);
    $("calibSub").textContent = sig.face ? "Keep your face relaxed for a moment." : "Make sure your face is in view and well lit.";
  }
  for (const e of sig.events) {
    if (e === "wink-screen-left") setColor(settings.get("color") - 1, true);
    if (e === "wink-screen-right") setColor(settings.get("color") + 1, true);
  }

  const trigger = settings.get("trigger");
  const wantPen = sig.face && !calibrating && (trigger === "mouth" ? sig.pen : holdDown);
  if (sig.face && !calibrating) {
    const pt = paint.fromUnit(sig.x, sig.y);
    if (wantPen && !pen) startStroke(pt);
    else if (wantPen) paint.extend(pt);
    placeCursor(pt, true, wantPen);
  } else {
    placeCursor(null, false);
  }
  if (!wantPen && pen) endStroke();
  pen = wantPen;

  if (!calibrating) {
    if (!sig.face) setStatus("Face not found", "bad");
    else if (pen) setStatus("Painting", "on");
    else setStatus(trigger === "mouth" ? "Open mouth to paint" : "Hold to paint", "ready");
  }
  preview.setMessage(sig.face ? "" : "Move into view");
  if (settings.get("showPreview")) preview.render(frame, sig, pen);
}

function beginCalibration(full = true) {
  endStroke();
  calibrating = true;
  app.classList.add("is-calibrating");
  $("calib").hidden = false;
  $("calibProg").style.strokeDashoffset = "327";
  setStatus("Calibrating", "");
  signals.calibrate(full ? 1600 : 800, full);
}
function finishCalibration() {
  calibrating = false;
  app.classList.remove("is-calibrating");
  $("calib").hidden = true;
  if (!settings.get("tipsSeen")) $("hint").hidden = false;
}

async function startFace() {
  $("startBtn").hidden = true;
  $("mouseBtn").hidden = true;
  $("introError").hidden = true;
  $("introLoading").hidden = false;
  try {
    await tracker.start(onFrame, (s) => { $("introStatus").textContent = s; });
    enterMode("face");
    beginCalibration(true);
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

function enterMode(m) {
  mode = m;
  app.dataset.mode = m;
  $("intro").hidden = true;
  if (m === "mouse") setStatus("Drawing with pointer", "ready");
  applySettings();
  layout();
}

/* ── pointer input: mouse mode draws directly; face + "hold" uses presses as the pen ── */
paper.addEventListener("pointerdown", (e) => {
  togglePop(null);
  if (mode === "mouse") {
    paper.setPointerCapture(e.pointerId);
    const r = paper.getBoundingClientRect();
    startStroke(paint.toDoc(e.clientX - r.left, e.clientY - r.top));
    pen = true;
    placeCursor(paint.toDoc(e.clientX - r.left, e.clientY - r.top), e.pointerType === "mouse", true);
  } else if (mode === "face" && settings.get("trigger") === "hold") {
    paper.setPointerCapture(e.pointerId); // keep the press even if the finger slides off the canvas
    holdDown = true;
  }
});
paper.addEventListener("pointermove", (e) => {
  if (mode !== "mouse") return;
  const r = paper.getBoundingClientRect();
  const pt = paint.toDoc(e.clientX - r.left, e.clientY - r.top);
  // Coalesced events give every sample between frames (smoother fast strokes); fall back to the event itself.
  const batch = e.getCoalescedEvents?.();
  for (const ce of batch && batch.length ? batch : [e]) {
    if (pen) paint.extend(paint.toDoc(ce.clientX - r.left, ce.clientY - r.top));
  }
  placeCursor(pt, e.pointerType === "mouse", pen);
});
const release = () => {
  holdDown = false;
  if (mode === "mouse" && pen) { endStroke(); pen = false; }
};
paper.addEventListener("pointerup", release);
paper.addEventListener("pointercancel", release);
paper.addEventListener("pointerleave", (e) => { if (mode === "mouse" && e.pointerType === "mouse") cursor.classList.add("is-hidden"); });

/* ── keyboard ── */
document.addEventListener("keydown", (e) => {
  const t = e.target instanceof Element ? e.target : null;
  if (t?.closest("input, textarea, select, dialog") || e.altKey) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && k === "s") { e.preventDefault(); return doSave(); }
  if (mod && k === "z") { e.preventDefault(); return e.shiftKey ? doRedo() : doUndo(); }
  if (mod && k === "y") { e.preventDefault(); return doRedo(); }
  if (mod) return;
  if (k === " " && mode === "face" && settings.get("trigger") === "hold") { holdDown = true; e.preventDefault(); return; }
  if (k === "z") return e.shiftKey ? doRedo() : doUndo();
  if (k === "y") return doRedo();
  if (k === "[" ) return setColor(settings.get("color") - 1, true);
  if (k === "]") return setColor(settings.get("color") + 1, true);
  if (k >= "1" && k <= "5") return setSize(SIZES[+k - 1]);
  if (k === "c" && mode === "face") return beginCalibration(false);
  if (k === "escape") return togglePop(null);
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
    else if (el.type === "radio") el.checked = el.value === v;
    else el.value = v;
  }
  form.querySelector("[data-mouth-only]").hidden = settings.get("trigger") !== "mouth";
}
form.addEventListener("input", (e) => {
  const el = e.target;
  if (!el.name || !(el.name in settings.DEFAULTS)) return;
  settings.set(el.name, el.type === "checkbox" ? el.checked : el.type === "range" ? +el.value : el.value);
});
$("settingsBtn").onclick = () => { fillForm(); sheet.showModal(); };
sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });
$("recalBtn").onclick = () => { sheet.close(); beginCalibration(true); };
$("recenterBtn").onclick = () => beginCalibration(false);

function applySettings() {
  app.classList.toggle("no-preview", mode !== "face" || !settings.get("showPreview"));
  preview.showMesh = settings.get("showMesh");
  paint.setPaper(settings.get("paper"));
  app.dataset.paper = settings.get("paper");
  app.dataset.trigger = settings.get("trigger");
  document.querySelector("[data-paint-hint]").textContent =
    settings.get("trigger") === "mouth" ? "Open your mouth to paint" : "Hold the screen or Space to paint";
  signals.applySmoothing();
}
settings.onChange((k) => {
  applySettings();
  if (k === "trigger") form.querySelector("[data-mouth-only]").hidden = settings.get("trigger") !== "mouth";
});

/* ── first-run hint ── */
$("hintOk").onclick = () => { $("hint").hidden = true; settings.set("tipsSeen", true); };

/* ── start ── */
$("startBtn").onclick = startFace;
function useMouse() {
  tracker.stop();
  calibrating = false;
  app.classList.remove("is-calibrating");
  $("calib").hidden = true;
  enterMode("mouse");
  toast("Drag to draw");
}
$("mouseBtn").onclick = useMouse;
$("calibSkip").onclick = useMouse;
applySettings();
