// js/colors.js
// Color palette definition and color-selection logic

export const COLORS = [
  { name: "White",     hex: "#ffffff" },
  { name: "Yellow",    hex: "#f5e642" },
  { name: "Orange",    hex: "#f5923e" },
  { name: "Red",       hex: "#e84040" },
  { name: "Pink",      hex: "#e840a8" },
  { name: "Violet",    hex: "#9b40e8" },
  { name: "Blue",      hex: "#4080e8" },
  { name: "Cyan",      hex: "#40d4e8" },
  { name: "Green",     hex: "#40e87a" },
  { name: "Lime",      hex: "#b0e840" },
  { name: "Brown",     hex: "#a0604a" },
  { name: "Black",     hex: "#111111" },
  { name: "Gold",      hex: "#e8c547" },
  { name: "Sky",       hex: "#47b8e8" },
  { name: "Coral",     hex: "#e8836f" },
];

let _colorIdx = 0;
let _onChangeCallbacks = [];

export function currentColor() {
  return COLORS[_colorIdx];
}

export function currentColorIdx() {
  return _colorIdx;
}

/**
 * Set the active color by index.
 * idx is wrapped around the palette length automatically.
 */
export function setColorIdx(idx) {
  _colorIdx = ((idx % COLORS.length) + COLORS.length) % COLORS.length;
  _onChangeCallbacks.forEach(cb => cb(_colorIdx, COLORS[_colorIdx]));
}

export function nextColor() {
  setColorIdx(_colorIdx + 1);
}

export function prevColor() {
  setColorIdx(_colorIdx - 1);
}

/**
 * Register a callback invoked whenever the active color changes.
 * Callback receives (idx, colorObj).
 */
export function onColorChange(cb) {
  _onChangeCallbacks.push(cb);
}