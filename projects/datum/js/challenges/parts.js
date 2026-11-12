// Small builders for writing models (targets and starters) compactly.
export const sk = (id, plane, offset, ...items) => ({ t: "sketch", id, plane, offset, items });
export const rect = (x, y, w, h, r = 0, rot = 0) => ({ k: "rect", x, y, w, h, r, rot });
export const circle = (x, y, d) => ({ k: "circle", x, y, d });
export const poly = (x, y, n, d, mode = "corners", rot = 0) => ({ k: "poly", x, y, n, d, mode, rot });
export const slot = (x, y, len, w, rot = 0) => ({ k: "slot", x, y, len, w, rot });
export const path = (pts, r = 0) => ({ k: "path", pts, r });
export const grid = (item, nx, ny, dx, dy) => ({ ...item, pattern: { type: "grid", nx, ny, dx, dy } });
export const polar = (item, n, cx = 0, cy = 0) => ({ ...item, pattern: { type: "polar", n, cx, cy } });
export const ext = (id, sketch, dist, o = {}) => ({ t: "extrude", id, sketch, dist, mode: "join", sym: false, flip: false, ...o });
export const rev = (id, sketch, o = {}) => ({ t: "revolve", id, sketch, axis: "y", angle: 360, mode: "join", ...o });
const picks = (list) => list.map((p) => (Array.isArray(p) ? { kind: "edge", p } : p));
export const face = (...p) => ({ kind: "face", p });
export const fil = (id, r, list) => ({ t: "fillet", id, r, all: list === "all", picks: list === "all" ? [] : picks(list) });
export const cham = (id, d, list) => ({ t: "chamfer", id, d, all: list === "all", picks: list === "all" ? [] : picks(list) });
export const shell = (id, thickness, ...faces) => ({ t: "shell", id, thickness, picks: faces });
export const mir = (id, plane) => ({ t: "mirror", id, plane });
