// The modeller: turns a feature list (the "timeline") into a solid using the
// OpenCascade kernel through replicad, and compares a learner's solid with a
// target. No DOM in here, so the same code runs under Node for tests.
//
// A model is an ordered array of features:
//   { t: "sketch",  id, plane: "XY"|"XZ"|"YZ", offset, items: [...] }
//   { t: "extrude", id, sketch, dist, mode: "join"|"cut"|"intersect", sym, flip }
//   { t: "revolve", id, sketch, axis: "x"|"y", angle, mode }
//   { t: "fillet",  id, r, all, picks: [{ kind: "edge"|"face", p: [x,y,z] }] }
//   { t: "chamfer", id, d, all, picks }
//   { t: "shell",   id, thickness, picks }          (picks = faces to remove)
//   { t: "mirror",  id, plane }
// Sketch items: rect, circle, poly, slot, path (see geom.js), each with an optional pattern.
import { PLANES, toWorld, outline, expand, depths, itemProblem, polyRadius } from "./geom.js";

export const FEATURE_NAMES = { sketch: "Sketch", extrude: "Extrude", revolve: "Revolve", fillet: "Fillet", chamfer: "Chamfer", shell: "Shell", mirror: "Mirror" };
const PICK_TOL = 0.02;

const friendly = (e, what) => {
  const m = e && typeof e.message === "string" ? e.message : "";
  if (m && !/^\d+$/.test(m) && !/wrapped|undefined|null|not a function/i.test(m)) return m;
  return what;
};

export function createModeler(R) {
  /** One concrete sketch item → a replicad Drawing. */
  function drawingOf(it) {
    let d;
    if (it.k === "rect") d = R.drawRoundedRectangle(it.w, it.h, it.r || 0);
    else if (it.k === "circle") d = R.drawCircle(it.d / 2);
    else if (it.k === "poly") d = R.drawPolysides(polyRadius(it), Math.round(it.n));
    else if (it.k === "slot") d = R.drawRoundedRectangle(it.len, it.w, it.w / 2);
    else if (it.k === "path") {
      let pen = R.draw(it.pts[0]);
      for (const p of it.pts.slice(1)) pen = pen.lineTo(p);
      d = pen.close();
      return it.r > 0 ? d.fillet(it.r) : d;
    }
    if (it.rot) d = d.rotate(it.rot);
    return d.translate(it.x, it.y);
  }

  /** A sketch's closed profile: nested shapes alternate material / hole, like real CAD regions. */
  function profile(sk) {
    const items = sk.items.flatMap(expand);
    if (!items.length) throw new Error("this sketch is empty: draw a closed shape in it first");
    for (const it of items) { const p = itemProblem(it); if (p) throw new Error(`a ${it.k === "poly" ? "polygon" : it.k} in the sketch is invalid: ${p}`); }
    const depth = depths(items.map((it) => outline(it, 24)));
    const order = items.map((it, i) => i).sort((a, b) => depth[a] - depth[b]);
    let acc = null;
    for (const i of order) {
      const d = drawingOf(items[i]);
      acc = !acc ? d : depth[i] % 2 ? acc.cut(d) : acc.fuse(d);
    }
    return acc;
  }

  // Front (XZ) is built on replicad's XZ plane, whose normal is -Y; flip so +offset and +distance mean +Y.
  const sign = (plane) => (plane === "XZ" ? -1 : 1);
  const placed = (sk, extra = 0) => profile(sk).sketchOnPlane(sk.plane, sign(sk.plane) * ((sk.offset || 0) + extra));

  function combine(body, tool, mode) {
    if (mode === "cut") { if (!body) throw new Error("there is no body to cut from yet: the first feature has to add material"); return body.cut(tool); }
    if (mode === "intersect") { if (!body) throw new Error("there is no body to intersect with yet"); return body.intersect(tool); }
    return body ? body.fuse(tool) : tool;
  }
  const finder = (picks, body) => (f) => f.either(picks.map((pk) => (g) => g.withinDistance(PICK_TOL, pk.p)));
  function edgeFilter(body, picks) {
    // A picked face means "all the edges around that face", as in most CAD tools.
    const edgePicks = picks.filter((p) => p.kind !== "face");
    const faceEdges = picks.filter((p) => p.kind === "face").flatMap((pk) => body.findFaces((f) => f.withinDistance(PICK_TOL, pk.p)).flatMap((face) => face.edges));
    const parts = [];
    if (edgePicks.length) parts.push((g) => g.either(edgePicks.map((pk) => (h) => h.withinDistance(PICK_TOL, pk.p))));
    if (faceEdges.length) parts.push((g) => g.inList(faceEdges));
    return (e) => e.either(parts);
  }

  function apply(body, f, sketches) {
    const sk = () => { const s = sketches.get(f.sketch); if (!s) throw new Error("choose a sketch for this feature"); return s; };
    switch (f.t) {
      case "extrude": {
        if (!Number.isFinite(f.dist) || f.dist === 0) throw new Error("the distance can't be 0");
        const s = sk(), d = (f.flip ? -1 : 1) * Math.abs(f.dist) * Math.sign(f.dist);
        const tool = placed(s, f.sym ? -d / 2 : 0).extrude(sign(s.plane) * d);
        return combine(body, tool, f.mode);
      }
      case "revolve": {
        const s = sk(), P = PLANES[s.plane];
        if (!(f.angle > 0 && f.angle <= 360)) throw new Error("the angle must be between 0 and 360 degrees");
        const tool = placed(s).revolve(f.axis === "x" ? P.u : P.v, { origin: toWorld(s.plane, s.offset || 0, [0, 0]), angle: f.angle });
        return combine(body, tool, f.mode);
      }
      case "fillet":
      case "chamfer": {
        if (!body) throw new Error("there is no body yet");
        const size = f.t === "fillet" ? f.r : f.d;
        if (!(size > 0)) throw new Error(`the ${f.t === "fillet" ? "radius" : "distance"} must be greater than 0`);
        if (!f.all && !(f.picks || []).length) throw new Error("pick at least one edge (or a face, to take all its edges)");
        try { return f.all ? body[f.t](size) : body[f.t](size, edgeFilter(body, f.picks)); }
        catch (e) { throw new Error(friendly(e, `the kernel couldn't build this ${f.t}: the size is probably too large for the edges picked, or a picked edge no longer exists`)); }
      }
      case "shell": {
        if (!body) throw new Error("there is no body yet");
        if (!(f.thickness > 0)) throw new Error("the wall thickness must be greater than 0");
        if (!(f.picks || []).length) throw new Error("pick the face to remove (the opening)");
        try { return body.shell(f.thickness, finder(f.picks)); }
        catch (e) { throw new Error(friendly(e, "the kernel couldn't shell this body: the wall is probably thicker than the part allows")); }
      }
      case "mirror": {
        if (!body) throw new Error("there is no body yet");
        return body.fuse(body.clone().mirror(f.plane, [0, 0, 0]));
      }
    }
    throw new Error(`unknown feature type ${f.t}`);
  }

  /**
   * Run the timeline. upTo: build only the first n features (used to "roll back"
   * while a later feature is being edited).
   * → { body, errors: { featureId: message }, sketches: Map }
   */
  function rebuild(features, upTo = features.length) {
    let body = null;
    const errors = {}, sketches = new Map();
    features.slice(0, upTo).forEach((f) => {
      if (f.t === "sketch") { sketches.set(f.id, f); return; }
      if (f.off) return;
      try {
        const next = apply(body, f, sketches);
        if (next && volume(next) < 1e-6 && f.t !== "sketch") throw new Error("this would leave nothing: the result has no volume");
        body = next;
      } catch (e) { errors[f.id] = friendly(e, "the kernel couldn't build this feature with these values"); }
    });
    return { body, errors, sketches };
  }

  const volume = (s) => { try { return R.measureVolume(s); } catch { return 0; } };
  function measure(body) {
    if (!body) return null;
    const [min, max] = body.boundingBox.bounds;
    return { volume: volume(body), min, max, size: [0, 1, 2].map((i) => max[i] - min[i]) };
  }

  /**
   * Is `body` the same solid as `target`, in the same place?
   * Compared by volume of the overlap, so how it was modelled doesn't matter.
   */
  function compare(body, target, tol = 0.001) {
    const t = measure(target);
    if (!body) return { ok: false, msg: "Nothing built yet. Add a sketch, then a feature that turns it into a solid." };
    const b = measure(body);
    const f = (v) => String(Math.round(v * 100) / 100);
    const dims = (m) => `${f(m.size[0])} × ${f(m.size[1])} × ${f(m.size[2])} mm (X × Y × Z)`;
    let overlap = 0;
    try { overlap = volume(body.clone().intersect(target.clone())); } catch { overlap = 0; }
    const diff = b.volume + t.volume - 2 * overlap;         // volume of the mismatch
    const score = Math.max(0, 1 - diff / t.volume);
    if (diff / t.volume <= tol) return { ok: true, score: 1, msg: "Your part matches the target." };
    const sizeOff = b.size.some((s, i) => Math.abs(s - t.size[i]) > 0.01);
    const placeOff = b.min.some((s, i) => Math.abs(s - t.min[i]) > 0.01);
    let msg;
    if (sizeOff) msg = `Overall size is ${dims(b)}; the target is ${dims(t)}.`;
    else if (placeOff) msg = `Right overall size, wrong place: your part starts at (${b.min.map(f).join(", ")}) but the target starts at (${t.min.map(f).join(", ")}).`;
    else {
      const dv = b.volume - t.volume, pct = Math.abs((dv / t.volume) * 100);
      msg = Math.abs(dv) / t.volume < tol / 2
        ? "Same overall size and the same amount of material, but it's in different places: check positions and which edges or faces you picked."
        : `Overall size matches, but your part has ${pct < 0.1 ? "slightly" : f(pct) + "%"} ${dv > 0 ? "more" : "less"} material than the target. ${dv > 0 ? "A cut, hole, fillet or chamfer is missing or too small." : "Something is cut too deep, too wide, or rounded too much."}`;
    }
    return { ok: false, score, msg };
  }

  /** Triangles and edges for display. */
  function meshes(body, quality = 1) {
    const opt = { tolerance: 0.06 / quality, angularTolerance: 0.25 / quality };
    return { faces: body.mesh(opt), edges: body.meshEdges(opt) };
  }

  /** Third-angle drawing views with hidden lines: SVG path data per view. */
  function views(body) {
    const flat = (d) => { try { return d.toSVGPaths().flat(Infinity); } catch { return []; } };
    const out = {};
    // replicad's "top"/"right" names follow a Y-up convention and come out mirrored for a
    // Z-up part, so name the planes directly: front looks along +Y, top looks down, right from +X.
    for (const [v, cam] of [["front", "XZ"], ["top", "XY"], ["right", "YZ"]]) {
      const p = R.drawProjection(body, cam);
      let box = null;
      try { const bb = p.visible.boundingBox.bounds; box = [bb[0][0], -bb[1][1], bb[1][0], -bb[0][1]]; } catch { /* empty view */ }
      out[v] = { visible: flat(p.visible), hidden: flat(p.hidden), box };
    }
    return out;
  }

  return { rebuild, compare, measure, meshes, views, profile, exportSTL: (b) => b.blobSTL({ binary: true, tolerance: 0.01, angularTolerance: 0.1 }), exportSTEP: (b) => b.blobSTEP() };
}

/* ── small helpers for authoring models (used by challenges and the UI) ── */
let uid = 0;
export const newId = (t) => `${t[0]}${Date.now().toString(36)}${(uid++).toString(36)}`;
export const DEFAULTS = {
  sketch: () => ({ t: "sketch", plane: "XY", offset: 0, items: [] }),
  extrude: () => ({ t: "extrude", sketch: null, dist: 10, mode: "join", sym: false, flip: false }),
  revolve: () => ({ t: "revolve", sketch: null, axis: "y", angle: 360, mode: "join" }),
  fillet: () => ({ t: "fillet", r: 2, all: false, picks: [] }),
  chamfer: () => ({ t: "chamfer", d: 1, all: false, picks: [] }),
  shell: () => ({ t: "shell", thickness: 2, picks: [] }),
  mirror: () => ({ t: "mirror", plane: "YZ" }),
};
