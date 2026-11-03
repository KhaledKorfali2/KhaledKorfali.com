// Persisted user settings with change notifications.
const KEY = "facepaint.v2";

export const DEFAULTS = {
  reach: 2.2,          // how far the cursor travels per degree of head turn (1–4)
  smoothing: 0.5,      // 0 = most responsive, 1 = steadiest
  trigger: "mouth",    // "mouth": open mouth to paint · "hold": hold screen / space bar
  mouthSensitivity: 0.5, // 0 = needs a wide-open mouth, 1 = paints with a small opening
  winks: true,         // wink to change colour
  showPreview: true,   // camera picture-in-picture
  showMesh: true,      // face outline on the preview
  paper: "dark",       // "dark" | "light"
  color: 0,
  size: 8,
  tipsSeen: false,
};

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    const s = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) if (typeof raw[k] === typeof DEFAULTS[k]) s[k] = raw[k];
    return s;
  } catch { return { ...DEFAULTS }; }
}

export const get = (k) => state[k];
export const all = () => ({ ...state });

export function set(k, v) {
  if (state[k] === v) return;
  state[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: keep in memory */ }
  listeners.forEach((fn) => fn(k, v));
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
