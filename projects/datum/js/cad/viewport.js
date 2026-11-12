// 3D viewport (three.js): shows the learner's body, the target as a ghost and
// sketch outlines; orbit / pan / zoom; and edge / face picking for fillets,
// chamfers and shells. Z is up, units are millimetres.
import * as THREE from "../../vendor/three.module.min.js";
import { toWorld } from "./geom.js";

const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const VIEWS = { iso: [-55, 28], front: [-90, 0], back: [90, 0], right: [0, 0], left: [180, 0], top: [-90, 89.99], bottom: [-90, -89.99] };

/** Distance from point p to segment ab (all [x,y,z]). */
function segDist(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const t = l2 ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / l2)) : 0;
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
}

export function createViewport(host) {
  const accent = css("--accent", "#ff9f5a");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  host.append(renderer.domElement);
  renderer.domElement.className = "vp-canvas";

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
  camera.up.set(0, 0, 1);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  scene.add(sun);

  const grid = new THREE.GridHelper(400, 40, 0x2a3846, 0x18212b);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -0.01;
  scene.add(grid);
  const axis = (to, color) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(...to)]), new THREE.LineBasicMaterial({ color }));
  scene.add(axis([40, 0, 0], 0xff6b6b), axis([0, 40, 0], 0x3ddc97), axis([0, 0, 40], 0x5cc8ff));

  const groups = { body: new THREE.Group(), ghost: new THREE.Group(), sketches: new THREE.Group(), marks: new THREE.Group(), hover: new THREE.Group() };
  Object.values(groups).forEach((g) => scene.add(g));

  const mats = {
    body: new THREE.MeshStandardMaterial({ color: 0xa9bccf, metalness: 0.08, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: THREE.DoubleSide }),
    edge: new THREE.LineBasicMaterial({ color: 0x0c131b }),
    ghost: new THREE.MeshBasicMaterial({ color: new THREE.Color(accent), transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
    ghostEdge: new THREE.LineBasicMaterial({ color: new THREE.Color(accent), transparent: true, opacity: 0.75 }),
    sketch: new THREE.LineBasicMaterial({ color: 0xe6edf3 }),
    sketchDim: new THREE.LineBasicMaterial({ color: 0x62707f }),
    mark: new THREE.LineBasicMaterial({ color: 0xffe14d, depthTest: false }),
    markFace: new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.5, depthTest: false, side: THREE.DoubleSide }),
    hover: new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }),
    hoverFace: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthTest: false, side: THREE.DoubleSide }),
  };

  const view = { target: new THREE.Vector3(0, 0, 10), az: VIEWS.iso[0], el: VIEWS.iso[1], zoom: 60 };
  let dirty = true, raf = 0, disposed = false;
  let bodyData = null, pick = null, bodyMesh = null, bodyEdges = null;

  function clear(group) {
    for (const o of [...group.children]) { group.remove(o); o.geometry?.dispose(); }
  }
  function faceGeometry(m) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(m.vertices, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(m.normals, 3));
    g.setIndex(m.triangles);
    return g;
  }
  const lineGeometry = (pts) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); return g; };

  function place() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1, a = w / h;
    camera.left = -view.zoom * a; camera.right = view.zoom * a; camera.top = view.zoom; camera.bottom = -view.zoom;
    const az = (view.az * Math.PI) / 180, el = (view.el * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el));
    camera.position.copy(view.target).addScaledVector(dir, 1000);
    camera.lookAt(view.target);
    camera.updateProjectionMatrix();
    sun.position.copy(camera.position).add(new THREE.Vector3(0, 0, 400));
  }
  function frame() {
    raf = 0;
    if (disposed || !dirty) return;
    dirty = false;
    place();
    renderer.render(scene, camera);
  }
  const invalidate = () => { dirty = true; if (!raf) raf = requestAnimationFrame(frame); };
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    invalidate();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  /* ── content ── */
  function setBody(m) {
    clear(groups.body); clear(groups.hover);
    bodyData = m; bodyMesh = bodyEdges = null;
    if (m) {
      bodyMesh = new THREE.Mesh(faceGeometry(m.faces), mats.body);
      bodyEdges = new THREE.LineSegments(lineGeometry(m.edges.lines), mats.edge);
      groups.body.add(bodyMesh, bodyEdges);
    }
    invalidate();
  }
  function setGhost(m) {
    clear(groups.ghost);
    if (m) groups.ghost.add(new THREE.Mesh(faceGeometry(m.faces), mats.ghost), new THREE.LineSegments(lineGeometry(m.edges.lines), mats.ghostEdge));
    invalidate();
  }
  /** list: [{ plane, offset, outlines: [[[x,y],…],…], dim }] */
  function setSketches(list) {
    clear(groups.sketches);
    for (const s of list) for (const o of s.outlines) {
      const pts = o.flatMap((p) => toWorld(s.plane, s.offset, p));
      groups.sketches.add(new THREE.LineLoop(lineGeometry(pts), s.dim ? mats.sketchDim : mats.sketch));
    }
    invalidate();
  }

  /* ── picking: map a stored point back to the edge or face it lies on ── */
  const groupPts = (g) => { const L = bodyData.edges.lines; const out = []; for (let i = g.start; i < g.start + g.count; i++) out.push([L[i * 3], L[i * 3 + 1], L[i * 3 + 2]]); return out; };
  function edgeNear(p, tol) {
    if (!bodyData) return null;
    let best = null, bd = tol;
    for (const g of bodyData.edges.edgeGroups) {
      const pts = groupPts(g);
      for (let i = 0; i + 1 < pts.length; i += 2) { const d = segDist(p, pts[i], pts[i + 1]); if (d < bd) { bd = d; best = g; } }
    }
    return best;
  }
  function faceNear(p, tol) {
    if (!bodyData) return null;
    const V = bodyData.faces.vertices, T = bodyData.faces.triangles;
    const v = (i) => new THREE.Vector3(V[i * 3], V[i * 3 + 1], V[i * 3 + 2]);
    const P = new THREE.Vector3(...p), tri = new THREE.Triangle(), q = new THREE.Vector3();
    let best = null, bd = tol;
    for (const g of bodyData.faces.faceGroups) for (let i = g.start; i < g.start + g.count; i += 3) {
      tri.set(v(T[i]), v(T[i + 1]), v(T[i + 2]));
      const d = tri.closestPointToPoint(P, q).distanceTo(P);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }
  /** A point guaranteed to lie on the edge (a mid vertex for curves, the midpoint for straight edges). */
  function edgePoint(g) {
    const pts = groupPts(g);
    if (pts.length > 2) return pts[Math.floor(pts.length / 4) * 2 + 1] || pts[1];
    return [0, 1, 2].map((i) => (pts[0][i] + pts[1][i]) / 2);
  }
  const edgeObject = (g, mat) => { const L = bodyData.edges.lines; return new THREE.LineSegments(lineGeometry(L.slice(g.start * 3, (g.start + g.count) * 3)), mat); };
  function faceObject(g, mat) {
    const geo = faceGeometry(bodyData.faces);
    geo.setIndex(bodyData.faces.triangles.slice(g.start, g.start + g.count));
    return new THREE.Mesh(geo, mat);
  }
  /** Highlight stored picks; returns how many could not be found on the current body. */
  function setMarks(picks) {
    clear(groups.marks);
    let missing = 0;
    for (const pk of picks || []) {
      const g = pk.kind === "face" ? faceNear(pk.p, 0.05) : edgeNear(pk.p, 0.05);
      if (!g) { missing++; continue; }
      const o = pk.kind === "face" ? faceObject(g, mats.markFace) : edgeObject(g, mats.mark);
      o.renderOrder = 5;
      groups.marks.add(o);
    }
    invalidate();
    return missing;
  }
  /** kinds: null | ["edge"] | ["face"] | ["edge","face"]; onPick({ kind, p }) */
  function setPick(kinds, onPick) { pick = kinds ? { kinds, onPick } : null; clear(groups.hover); renderer.domElement.style.cursor = kinds ? "crosshair" : ""; invalidate(); }

  const ray = new THREE.Raycaster();
  function hit(ev) {
    if (!pick || !bodyData) return null;
    const r = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    place();
    ray.setFromCamera(ndc, camera);
    const perPx = (2 * view.zoom) / r.height;
    if (pick.kinds.includes("edge")) {
      ray.params.Line.threshold = perPx * 7;
      const hits = ray.intersectObject(bodyEdges);
      if (hits.length) {
        const best = hits.reduce((a, b) => (b.distanceToRay ?? 1e9) < (a.distanceToRay ?? 1e9) ? b : a);
        const g = bodyData.edges.edgeGroups.find((e) => best.index >= e.start && best.index < e.start + e.count);
        if (g) return { kind: "edge", g, p: edgePoint(g) };
      }
    }
    if (pick.kinds.includes("face")) {
      const hits = ray.intersectObject(bodyMesh);
      if (hits.length) {
        const i = hits[0].faceIndex * 3;
        const g = bodyData.faces.faceGroups.find((f) => i >= f.start && i < f.start + f.count);
        if (g) return { kind: "face", g, p: hits[0].point.toArray() };
      }
    }
    return null;
  }

  /* ── orbit / pan / zoom ── */
  const el = renderer.domElement;
  let dragState = null;
  el.addEventListener("contextmenu", (e) => e.preventDefault());
  el.addEventListener("pointerdown", (e) => {
    try { el.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    dragState = { x: e.clientX, y: e.clientY, moved: 0, pan: e.button !== 0 || e.shiftKey };
  });
  el.addEventListener("pointermove", (e) => {
    if (!dragState) {
      if (pick) { clear(groups.hover); const h = hit(e); if (h) { const o = h.kind === "edge" ? edgeObject(h.g, mats.hover) : faceObject(h.g, mats.hoverFace); o.renderOrder = 6; groups.hover.add(o); } invalidate(); }
      return;
    }
    const dx = e.clientX - dragState.x, dy = e.clientY - dragState.y;
    dragState.x = e.clientX; dragState.y = e.clientY; dragState.moved += Math.abs(dx) + Math.abs(dy);
    if (dragState.pan) {
      const perPx = (2 * view.zoom) / (el.clientHeight || 1);
      place();
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      view.target.addScaledVector(right, -dx * perPx).addScaledVector(up, dy * perPx);
    } else {
      view.az -= dx * 0.4;
      view.el = Math.max(-89.99, Math.min(89.99, view.el + dy * 0.4));
    }
    invalidate();
  });
  const release = (e) => {
    const d = dragState; dragState = null;
    if (d && d.moved < 4 && pick && e.type === "pointerup") { const h = hit(e); if (h) pick.onPick({ kind: h.kind, p: h.p.map((v) => Math.round(v * 1e4) / 1e4) }); }
  };
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  el.addEventListener("wheel", (e) => { e.preventDefault(); view.zoom = Math.max(2, Math.min(2000, view.zoom * Math.exp(e.deltaY * 0.0012))); invalidate(); }, { passive: false });

  function fit() {
    const box = new THREE.Box3();
    for (const g of [groups.body, groups.ghost, groups.sketches]) if (g.children.length) box.expandByObject(g);
    if (box.isEmpty()) { view.target.set(0, 0, 10); view.zoom = 60; }
    else {
      const s = box.getBoundingSphere(new THREE.Sphere());
      view.target.copy(s.center);
      view.zoom = Math.max(8, s.radius * 1.25);
    }
    invalidate();
  }
  function setView(name) { const v = VIEWS[name]; if (v) { [view.az, view.el] = v; invalidate(); } }

  resize();
  return {
    setBody, setGhost, setSketches, setMarks, setPick, fit, setView, resize,
    /** Do two stored picks refer to the same edge / face of the current body? */
    sameEntity(a, b) { const f = a.kind === "face" ? faceNear : edgeNear; const ga = f(a.p, 0.05); return !!ga && ga === f(b.p, 0.05); },
    /** For tests: where a world point lands on screen (client px). */
    project(p) { place(); const v = new THREE.Vector3(...p).project(camera); const r = el.getBoundingClientRect(); return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height]; },
    /** Edges of the current body as flat [x,y,z,…] pairs (for the sketch underlay). */
    bodyLines: () => (bodyData ? bodyData.edges.lines : []),
    dispose() {
      disposed = true; cancelAnimationFrame(raf); ro.disconnect();
      Object.values(groups).forEach(clear);
      Object.values(mats).forEach((m) => m.dispose());
      renderer.dispose(); renderer.forceContextLoss(); el.remove();
    },
  };
}
