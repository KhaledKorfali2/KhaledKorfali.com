// 2D sketch geometry with no kernel dependency: item outlines (for drawing and
// hit-testing), pattern expansion, nesting depth, and sketch-plane mapping.
// Units are millimetres; angles are degrees; Z is up.

/** Sketch planes. u, v: sketch x and y in world space; n: the direction offsets and extrusions go. */
export const PLANES = {
  XY: { label: "Top", u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1], axes: ["X", "Y"], normal: "Z" },
  XZ: { label: "Front", u: [1, 0, 0], v: [0, 0, 1], n: [0, 1, 0], axes: ["X", "Z"], normal: "Y" },
  YZ: { label: "Right", u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0], axes: ["Y", "Z"], normal: "X" },
};
export const toWorld = (plane, off, [x, y]) => { const P = PLANES[plane]; return [0, 1, 2].map((i) => P.u[i] * x + P.v[i] * y + P.n[i] * off); };
export const toSketch = (plane, p) => (plane === "XY" ? [p[0], p[1]] : plane === "XZ" ? [p[0], p[2]] : [p[1], p[2]]);

const RAD = Math.PI / 180;
export const rot2 = ([x, y], deg, [cx, cy] = [0, 0]) => {
  const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD), dx = x - cx, dy = y - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
};
export const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
export const round = (v, p = 3) => Math.round(v * 10 ** p) / 10 ** p;

/** Circumscribed radius of a regular polygon item (size given across corners or across flats). */
export const polyRadius = (it) => (it.mode === "flats" ? it.d / 2 / Math.cos(Math.PI / it.n) : it.d / 2);

/** Round every corner of a closed polygon with radius r (clamped so arcs never overlap). */
export function roundPolygon(pts, r, steps = 8) {
  if (!(r > 0) || pts.length < 3) return pts.slice();
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const v1 = [a[0] - p[0], a[1] - p[1]], v2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    if (l1 < 1e-9 || l2 < 1e-9) { out.push(p); continue; }
    const u1 = [v1[0] / l1, v1[1] / l1], u2 = [v2[0] / l2, v2[1] / l2];
    const ang = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
    if (ang < 1e-3 || Math.PI - ang < 1e-3) { out.push(p); continue; }
    const t = Math.min(r / Math.tan(ang / 2), l1 / 2, l2 / 2), rr = t * Math.tan(ang / 2);
    const s = [p[0] + u1[0] * t, p[1] + u1[1] * t], e = [p[0] + u2[0] * t, p[1] + u2[1] * t];
    const bis = [u1[0] + u2[0], u1[1] + u2[1]], bl = Math.hypot(...bis), dist = rr / Math.sin(ang / 2);
    const c = [p[0] + (bis[0] / bl) * dist, p[1] + (bis[1] / bl) * dist];
    let a0 = Math.atan2(s[1] - c[1], s[0] - c[0]), a1 = Math.atan2(e[1] - c[1], e[0] - c[0]);
    let d = a1 - a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    for (let k = 0; k <= steps; k++) out.push([c[0] + rr * Math.cos(a0 + (d * k) / steps), c[1] + rr * Math.sin(a0 + (d * k) / steps)]);
  }
  return out;
}

/** Closed outline of one sketch item as a polygon in sketch coordinates. */
export function outline(it, seg = 48) {
  const place = (pts) => pts.map((p) => { const q = rot2(p, it.rot || 0); return [q[0] + it.x, q[1] + it.y]; });
  switch (it.k) {
    case "rect": return place(roundPolygon([[-it.w / 2, -it.h / 2], [it.w / 2, -it.h / 2], [it.w / 2, it.h / 2], [-it.w / 2, it.h / 2]], it.r || 0));
    case "slot": return place(roundPolygon([[-it.len / 2, -it.w / 2], [it.len / 2, -it.w / 2], [it.len / 2, it.w / 2], [-it.len / 2, it.w / 2]], it.w / 2, 12));
    case "circle": return Array.from({ length: seg }, (_, i) => [it.x + (it.d / 2) * Math.cos((2 * Math.PI * i) / seg), it.y + (it.d / 2) * Math.sin((2 * Math.PI * i) / seg)]);
    case "poly": { const R = polyRadius(it); return place(Array.from({ length: it.n }, (_, i) => [R * Math.cos(Math.PI / 2 + (2 * Math.PI * i) / it.n), R * Math.sin(Math.PI / 2 + (2 * Math.PI * i) / it.n)])); }
    case "path": return roundPolygon(it.pts, it.r || 0);
  }
  return [];
}

export function moved(it, dx, dy) {
  return it.k === "path" ? { ...it, pts: it.pts.map(([x, y]) => [x + dx, y + dy]) } : { ...it, x: it.x + dx, y: it.y + dy };
}
function turned(it, deg, c) {
  if (it.k === "path") return { ...it, pts: it.pts.map((p) => rot2(p, deg, c)) };
  const [x, y] = rot2([it.x, it.y], deg, c);
  return { ...it, x, y, rot: (it.rot || 0) + deg };
}

/** Apply an item's pattern → the concrete items it stands for. */
export function expand(it) {
  const p = it.pattern;
  const base = { ...it, pattern: undefined };
  if (!p || p.type === "none") return [base];
  const out = [];
  if (p.type === "grid") {
    for (let i = 0; i < Math.max(1, Math.round(p.nx)); i++) for (let j = 0; j < Math.max(1, Math.round(p.ny)); j++) out.push(moved(base, i * p.dx, j * p.dy));
  } else if (p.type === "polar") {
    const n = Math.max(1, Math.round(p.n));
    for (let k = 0; k < n; k++) out.push(turned(base, (360 * k) / n, [p.cx || 0, p.cy || 0]));
  }
  return out;
}

export function inPolygon([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Nesting depth of each outline: how many other outlines fully contain it.
 * Like real CAD sketch profiles, even depths are material and odd depths are holes.
 */
export function depths(outlines) {
  return outlines.map((o, i) => outlines.reduce((d, other, j) => d + (j !== i && o.every((p) => inPolygon(p, other)) ? 1 : 0), 0));
}

/** Problems that would stop an item from making a valid profile (null if fine). */
export function itemProblem(it) {
  const pos = (v) => Number.isFinite(v) && v > 0;
  switch (it.k) {
    case "rect": return !pos(it.w) || !pos(it.h) ? "width and height must be greater than 0" : it.r < 0 || it.r > Math.min(it.w, it.h) / 2 ? "corner radius must be between 0 and half the shorter side" : null;
    case "circle": return pos(it.d) ? null : "diameter must be greater than 0";
    case "poly": return !pos(it.d) ? "size must be greater than 0" : !(it.n >= 3 && it.n <= 60) ? "sides must be between 3 and 60" : null;
    case "slot": return !pos(it.w) || !pos(it.len) ? "length and width must be greater than 0" : it.len <= it.w ? "a slot's overall length must be greater than its width" : null;
    case "path": return it.pts.length < 3 ? "a profile needs at least 3 points" : null;
  }
  return "unknown shape";
}
