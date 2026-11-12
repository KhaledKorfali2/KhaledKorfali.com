// The curriculum: tracks → challenges, in recommended order.
import first from "./first.js";
import sketching from "./sketching.js";
import features from "./features.js";
import finish from "./finish.js";
import printing from "./printing.js";
import real from "./real.js";

export const TRACKS = [
  { id: "first", title: "First Solids", icon: "layers", blurb: "From zero: sketch a profile, extrude it, set exact dimensions, choose a plane, and stack features in a timeline.", list: first },
  { id: "sketching", title: "Cutting & Sketch Craft", icon: "edit", blurb: "Remove material with cut extrudes, and get more from one sketch: hole patterns, slots, rounded corners, polygons, bolt circles.", list: sketching },
  { id: "features", title: "Beyond Extrude", icon: "refresh", blurb: "Revolve profiles into turned parts, extrude symmetrically, mirror, and work across all three base planes.", list: features },
  { id: "finish", title: "Finishing Features", icon: "wave", blurb: "Fillets, chamfers and shells, picking edges and faces, and why the order of features changes the part.", list: finish },
  { id: "printing", title: "Design for 3D Printing", icon: "bolt", blurb: "Make parts that print well and fit: wall thickness, clearances and captive nuts, overhangs, orientation, and STL export.", list: printing },
  { id: "real", title: "Real Parts", icon: "shield", blurb: "Capstones with a brief and a drawing instead of steps: a shelf bracket, a phone stand, a thumb knob, and an electronics enclosure.", list: real },
];

export const UPCOMING = [
  { title: "Sketch Constraints", icon: "link", blurb: "A constraint-solving sketcher: coincident, parallel, tangent, equal and symmetric relationships, driving dimensions, and under- versus over-defined sketches." },
  { title: "Advanced Features", icon: "layers", blurb: "Sweeps along a path, lofts between profiles, draft angles, ribs, feature patterns, and sketching directly on faces." },
  { title: "Reading and Making Drawings", icon: "file", blurb: "Full engineering drawings: section and detail views, dimensioning practice, tolerances and fits, surface finish and title blocks." },
  { title: "Assemblies", icon: "table", blurb: "Several parts together: mates and joints, clearances between parts, lids, snap fits, hinges, and checking for interference." },
  { title: "Code CAD", icon: "code", blurb: "Describing parts as programs in the OpenSCAD and CadQuery style: when a script beats a mouse, and how the two approaches relate." },
];

for (const t of TRACKS) for (const c of t.list) c.track = t.id;
export const ALL = TRACKS.flatMap((t) => t.list);
export const byId = (id) => ALL.find((c) => c.id === id);
export const trackOf = (c) => TRACKS.find((t) => t.id === c.track);

/** Linear within a track: a challenge unlocks once the previous one in its track is solved. */
export function isUnlocked(c, isSolved) {
  const t = trackOf(c);
  const i = t.list.indexOf(c);
  return i === 0 || isSolved(t.list[i - 1].id);
}
