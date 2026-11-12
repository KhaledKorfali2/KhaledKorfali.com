// Track 6: Real Parts. Capstones with less hand-holding: read the brief and the
// drawing, plan the features, build the part.
import { sk, rect, circle, poly, path, grid, polar, ext, fil, shell, face } from "./parts.js";

const T = ["sketch", "extrude", "revolve", "mirror", "fillet", "chamfer", "shell"];

export default [
  {
    id: "x-bracket",
    title: "Shelf Bracket",
    level: 4, time: 25, slug: "shelf_bracket",
    tags: ["planning", "symmetric", "fillet", "patterns"],
    tools: T,
    objective: "Build an L-shaped shelf bracket, 40 mm wide, centred on Y = 0. Front view: both legs 50 mm long and 6 mm thick, outer corner at the origin, legs running along +X and +Z. Round the inside corner with an 8 mm fillet. Two ⌀5 holes go down through the horizontal leg at X = 35, Y = ±10. Two ⌀5 holes go through the vertical leg along X at Y = ±10, Z = 35.",
    lesson: `From here on, the lessons stop giving you the steps. You get a brief, the **Target drawing** tab, and the ghost. Planning the build is now your job, and it's the real skill.

### Plan before you click
For any part, answer these in order:

1. **Where's the origin, and what's symmetric?** Here the bracket is centred on Y = 0, with its outer corner at the origin.
2. **What's the main shape, and which view shows it best?** An L, seen from the front. One profile, extruded symmetrically.
3. **What gets removed?** Four holes, in two pairs facing different directions, so they need sketches on two different planes.
4. **What's the finishing?** One fillet on the inside corner.

Write the feature list down before starting. Experienced designers do this in their heads, but they do it.

### Things you'll need
- **Symmetric extrude** to centre the 40 mm width on the Front plane.
- A **grid pattern** with a count of 1 in one direction makes a row of two holes.
- Holes through the horizontal leg are circles on the **Top** plane; holes through the vertical leg are circles on the **Right** plane. Cut each far enough to go through the 6 mm leg.
- The inside corner is a single edge running along Y where the two legs meet. Fillet it **before or after** the holes; here it doesn't matter, because the holes are clear of it.

### Why the fillet is there
That inside corner is where a loaded bracket would crack. The 8 mm radius spreads the stress. It's the most important 8 millimetres on the part.`,
    hints: ["Front plane profile: (0,0), (50,0), (50,6), (6,6), (6,50), (0,50). Extrude 40, Symmetric.", "Fillet: pick the inside corner edge (it runs along Y at X = 6, Z = 6), radius 8. Horizontal-leg holes: Top plane, a ⌀5 circle at X = 35, Y = -10 with a grid pattern of 1 × 2 and Y spacing 20; cut 6 upward or any distance that clears the leg.", "Vertical-leg holes: Right (YZ) plane, a ⌀5 circle at Y = -10, Z = 35 with a grid pattern 2 × 1 and Y spacing 20; extrude 20, Symmetric, Cut."],
    target: [
      sk("s1", "XZ", 0, path([[0, 0], [50, 0], [50, 6], [6, 6], [6, 50], [0, 50]])), ext("e1", "s1", 40, { sym: true }),
      fil("f1", 8, [[6, 0, 6]]),
      sk("s2", "XY", 0, grid(circle(35, -10, 5), 1, 2, 0, 20)), ext("e2", "s2", 6, { mode: "cut" }),
      sk("s3", "YZ", 0, grid(circle(-10, 35, 5), 2, 1, 20, 0)), ext("e3", "s3", 20, { mode: "cut", sym: true }),
    ],
    debrief: `A complete, usable part: seven or so features, three planes, and a plan.

**How a professional would critique this model**
- *Is it robust?* Change the leg length to 70 in the first sketch. The holes stay at X = 35 and Z = 35, which may or may not be what you want. Professional CAD would let you dimension them from the end of the leg instead, capturing the intent "15 mm from the tip".
- *Is it makeable?* As a printed part, lay it on its side so the layers trace the L, exactly like the hook. As sheet metal it would be a flat strip bent 90°, and the inside radius would be set by the bending tool, not by you.
- *Is it standard?* ⌀5 is a clearance hole for an M4 or No. 8 screw. Countersinking the holes would let the screw heads sit flush.

Brackets like this are also where **ribs** and **gussets** come in: a triangular web between the legs multiplies stiffness for very little material. That's one profile on the Front plane, extruded a few millimetres. Try adding one after you've captured the flag; the workbench stays live.`,
  },

  {
    id: "x-stand",
    title: "Phone Stand",
    level: 4, time: 25, slug: "phone_stand",
    tags: ["profile", "symmetric", "cut"],
    tools: T,
    objective: "Build a phone stand 70 mm wide, centred on Y = 0. Its side profile on the Front plane runs through (0,0), (70,0), (70,12), (62,12), (62,5), (20,5), (40,70), (34,70), (14,5), (0,5). Then cut a 14 mm wide notch for a charging cable through the front lip: it removes the lip between Y = -7 and Y = 7 for its full thickness (X from 62 to 70), from the top of the base at Z = 5 upward.",
    lesson: `A phone stand is the classic first "I designed this myself" print. It's also a pure example of a **prismatic** part: one interesting profile, extruded.

### Reading the profile
Plot the ten points on paper, or just click them in and watch the shape appear:

- a **base** 70 long and 5 thick;
- a **front lip** at the far end, rising to 12, which stops the phone sliding off;
- a **back rest** leaning at about 73° from the base, 6 mm thick, rising to 70.

The back rest's front and back edges are parallel: both go 20 across for 65 up. That's deliberate. A **constant wall thickness** prints evenly and looks intentional.

### The whole part
1. **Profile** on the Front plane through the ten points, in order.
2. **Extrude** 70, **Symmetric**, so the stand is centred.
3. **Cable notch:** sketch on the Top plane at the height of the base's top surface, a rectangle covering the lip from X = 62 to 70 and Y = -7 to 7, then cut **upward** through the lip.

### Check it against the drawing
Open the **Target drawing** tab before and after. In the Front view you should see the profile; in the Top view, the notch appears as a small rectangle at the front edge. Getting in the habit of comparing your model with the drawing, view by view, is how errors get caught before a part is made.

### Design note
The lean angle and lip height here are a reasonable starting point for a phone in portrait. A parametric model means that when your phone turns out to be thicker than expected, you change one coordinate and export again.`,
    hints: ["Front plane, Profile tool: click the ten points in the order given, then close. Correct any coordinates in the Points list.", "Extrude 70 with Symmetric ticked.", "Notch: sketch on the Top plane with Offset along Z = 5, a rectangle centred at X = 66, Y = 0, width 8, height 14. Extrude 7 (or more), Operation Cut, direction +Z."],
    target: [
      sk("s1", "XZ", 0, path([[0, 0], [70, 0], [70, 12], [62, 12], [62, 5], [20, 5], [40, 70], [34, 70], [14, 5], [0, 5]])), ext("e1", "s1", 70, { sym: true }),
      sk("s2", "XY", 5, rect(66, 0, 8, 14)), ext("e2", "s2", 7, { mode: "cut" }),
    ],
    debrief: `Export the STL and that's a real, printable stand. Printed on its side, with the profile on the bed, it needs no supports and its layers run along the back rest, which is where the load is.

**What you'd refine in a second version**
- **Fillets** at the root of the back rest and the lip, for strength and looks. Try a 3 mm fillet on those two inside edges.
- **Rounded outer corners** so it's pleasant to pick up.
- **Less plastic:** a large cutout in the back rest saves material and print time without hurting stiffness.
- **A measured fit:** real designs start from measurements of the thing they hold, taken with calipers, plus clearance.

This loop, **model → print → test → adjust the numbers → print again**, is how hardware gets designed, whether it's a phone stand or a car part. Parametric CAD exists to make the "adjust" step take seconds.`,
  },

  {
    id: "x-knob",
    title: "Thumb Knob",
    level: 5, time: 30, slug: "thumb_knob",
    tags: ["circular pattern", "cut", "nut pocket"],
    tools: T,
    objective: "Build a thumb knob for an M6 bolt, centred on the Z axis and sitting on the Top plane: a ⌀40 disc 12 mm thick; eight ⌀8 finger scallops cut through its full thickness, centred on the rim (on a 40 mm pitch circle, one on the +X axis); a ⌀6.4 clearance hole through the centre; and a hex pocket in the top face, 10.4 mm across flats and 5 mm deep, with two corners pointing along ±Y.",
    lesson: `A knob with a captive nut turns any bolt into something you can tighten by hand. This one combines a circular pattern, cuts from two heights and the clearance values from the printing track.

### A trap to notice
The scallops are circles centred **on the rim** of the disc, so each one is half inside the disc and half outside. Recall how sketch regions work: a shape fully **inside** another is a hole, but shapes that only **overlap** are merged into one outline.

So if you draw the scallop circles in the same sketch as the disc, they don't cut anything. They **add** eight bumps. To remove material with a shape that crosses the boundary, it needs its own sketch, extruded as a **Cut**.

The centre hole, on the other hand, is fully inside the disc and can go in the first sketch.

### Plan
1. Disc with its centre hole: one sketch, one extrude.
2. Scallops: a second sketch with **one** ⌀8 circle at X = 20, patterned circularly 8 times; extrude as a cut through the full 12 mm.
3. Nut pocket: a hexagon sketched at the height of the top face, cut downward 5.

### The numbers
An M6 nut is 10 mm across flats and 5 mm thick, so with printing clearance the pocket is 10.4 across flats, and the bolt hole is 6 + 0.4 = ⌀6.4.

### Print orientation
Flat on the bed, pocket facing up: no supports, and the scallops' vertical walls print cleanly. The bolt's pull is carried by the 7 mm of solid plastic under the nut, across many layers, which is the strong direction for that load.`,
    hints: ["Sketch 1 (Top plane): ⌀40 and ⌀6.4 circles at the origin. Extrude 12.", "Sketch 2 (Top plane, offset 0): one ⌀8 circle at X = 20, Y = 0 with a circular pattern, Count 8, centre 0, 0. Extrude 12, Operation Cut.", "Sketch 3 (Top plane, Offset along Z = 12): a 6-sided polygon, across flats, size 10.4, rotation 0. Extrude 5, Operation Cut, Flip direction."],
    target: [
      sk("s1", "XY", 0, circle(0, 0, 40), circle(0, 0, 6.4)), ext("e1", "s1", 12),
      sk("s2", "XY", 0, polar(circle(20, 0, 8), 8)), ext("e2", "s2", 12, { mode: "cut" }),
      sk("s3", "XY", 12, poly(0, 0, 6, 10.4, "flats")), ext("e3", "s3", 5, { mode: "cut", flip: true }),
    ],
    debrief: `If you tried the scallops in the first sketch, you saw a flower with eight petals and a status bar complaining about extra material. That behaviour, overlapping regions merge and nested regions subtract, is worth being certain about; in professional CAD you'd click the exact regions you want, and misreading them is a common source of surprise.

**Making it nicer**
- A 1 mm **chamfer** on the bottom edge (bed side) and a 1.5 mm **fillet** on the top edge would make it comfortable. Try them: the scallops turn a simple edge into sixteen arcs, so pick the **face**, not the edges.
- A slightly **undersized** hex (10.2) would grip the nut so it can't fall out; a drop of glue does the same.

**Why not model the thread?** Because the nut already has a perfect one. Designing around standard hardware, instead of reproducing it, is a habit that makes parts stronger, cheaper and faster to print.`,
  },

  {
    id: "x-enclosure",
    title: "Capstone: Project Enclosure",
    level: 5, time: 40, slug: "project_enclosure",
    tags: ["shell", "bosses", "patterns", "cutout"],
    tools: T,
    objective: "Build the base of an electronics enclosure, centred on the origin and sitting on the Top plane. Outside: 80 × 50 mm with 6 mm rounded vertical corners, 30 mm tall. Shell: 2 mm walls and floor, open top. Inside, four ⌀8 standoffs rise 10 mm from the floor at X = ±30, Y = ±15, each with a ⌀2.8 pilot hole 8 mm deep from its top. One cable cutout through the +X wall: 12 mm wide (Y from -6 to 6) and 8 mm tall (Z from 18 to 26).",
    lesson: `This is the kind of part people buy a 3D printer to make: a box for a circuit board. It uses nearly everything in the course, and the order of features matters.

### Outside-in
Enclosures are designed from the outside in:

1. **Outer form** as a solid.
2. **Shell** it.
3. **Internal features** added to the shelled body.
4. **Openings** cut through the walls.

If you add the standoffs before shelling, the shell hollows them out too. Shell first, then build inside.

### Standoffs
A circuit board sits on **standoffs** (bosses) so that its solder joints clear the floor, and it's screwed into them. Each is a small cylinder growing up from the floor:

- The floor's top surface is at Z = 2 (the wall thickness), so the standoff sketch goes at **offset 2**.
- One circle, grid pattern 2 × 2 with 60 and 30 spacing, extruded 10 as a **Join**.
- The pilot holes start at the standoff tops, Z = 12, and go down 8. ⌀2.8 is the pilot size for an M3 self-tapping screw.

### A cutout in a side wall
The +X wall runs from X = 38 to X = 40. The cutout is a rectangle seen from the right, so sketch it on a plane parallel to **Right**. Put the plane **outside the box** (offset 45, say) and cut back toward the box, or put it inside and cut outward; either way the cut must cross the whole wall and nothing else.

In a Right-plane sketch, horizontal is Y and vertical is Z, so the rectangle is centred at Y = 0, Z = 22, 12 wide and 8 tall.

### Check as you go
The % match in the status bar climbs as each feature lands. After the shell you should be most of the way there; the standoffs, pilot holes and cutout account for the last few percent. If a step makes the match go *down*, undo it and look again.`,
    hints: ["Outer form: Top plane, rectangle 80 × 50 at the origin with Corner radius 6, extrude 30. Then Shell: pick the top face, thickness 2.", "Standoffs: Top plane at Offset 2, a ⌀8 circle at X = -30, Y = -15 with a 2 × 2 grid (spacing 60 and 30), extrude 10, Join. Pilot holes: same positions on a sketch at Offset 12 with ⌀2.8 circles, extrude 8, Cut, Flip direction.", "Cutout: sketch on the Right (YZ) plane with Offset along X = 35, a rectangle centred at Y = 0, Z = 22, width 12, height 8. Extrude 10, Operation Cut (direction +X takes it from X = 35 out through the wall)."],
    target: [
      sk("s1", "XY", 0, rect(0, 0, 80, 50, 6)), ext("e1", "s1", 30), shell("h1", 2, face(0, 0, 30)),
      sk("s2", "XY", 2, grid(circle(-30, -15, 8), 2, 2, 60, 30)), ext("e2", "s2", 10),
      sk("s3", "XY", 12, grid(circle(-30, -15, 2.8), 2, 2, 60, 30)), ext("e3", "s3", 8, { mode: "cut", flip: true }),
      sk("s4", "YZ", 35, rect(0, 22, 12, 8)), ext("e4", "s4", 10, { mode: "cut" }),
    ],
    debrief: `You designed a multi-feature plastic part with internal details, standard-hardware fits and a sensible build order. Look back at "Your First Solid": one rectangle, one extrude.

**What you can do now**
- Break a part down into sketches and features, and choose the planes and profiles that make it simple.
- Fully define shapes with dimensions; place features from the origin and base planes.
- Use extrude, cut, revolve, mirror, patterns, fillet, chamfer and shell, in an order that holds up.
- Read a three-view drawing and common callouts: ⌀, R, across flats, PCD, counts and patterns.
- Design for FDM printing: wall thickness, clearances, overhangs, orientation, captive nuts, and export to STL or STEP.

**Finishing this enclosure for real** would mean a lid with a lip that locates on the walls (with 0.2 mm clearance), screw bosses or snap fits to hold it, ventilation slots, and rounded bottom edges swapped for chamfers so it prints cleanly. All of those use features you already know.

**Moving to professional CAD.** Everything here maps directly onto Fusion 360, Onshape, SolidWorks and FreeCAD: same sketches, same features, same timeline. What they add is described on the Reference page; the big ones are **sketch constraints** (relationships like parallel, tangent and equal, solved automatically), **sketching directly on faces**, **assemblies** of several parts, and **drawings** with full dimensioning. Onshape and FreeCAD are free to start with; Fusion 360 has a free personal licence. Rebuild this enclosure in one of them as your first project: you'll recognise every step.`,
  },
];
