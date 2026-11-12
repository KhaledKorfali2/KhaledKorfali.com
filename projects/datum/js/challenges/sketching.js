// Track 2: Cutting & Sketch Craft. Cut extrudes, patterns, slots, polygons.
import { sk, rect, circle, poly, slot, grid, polar, ext } from "./parts.js";

const T = ["sketch", "extrude"];

export default [
  {
    id: "k-pocket",
    title: "Cut Extrude",
    level: 2, time: 12, slug: "cut_extrude",
    tags: ["cut", "pocket", "direction"],
    tools: T, sketchTools: ["rect", "circle", "path"],
    objective: "Build a plate 80 × 50 × 10 mm centred on the origin, with a rectangular pocket 40 × 20 mm in the middle of its top face, 6 mm deep.",
    lesson: `Extrude doesn't only add material. Set its operation to **Cut** and the profile is pushed through the body like a cookie cutter, removing whatever it passes through. Milling a pocket, drilling a hole and sawing a notch are all cut extrudes in CAD.

### Where the cut starts, and which way it goes
A pocket in the top face starts **at the top face** and goes **down**:

1. Sketch on the Top plane with **Offset along Z = 10** (the height of the plate).
2. Draw the pocket outline.
3. Extrude with **Operation: Cut** and **Distance 6**.
4. The default direction is +Z, away from the plate, where there's nothing to cut. Tick **Flip direction** so it goes down into the body.

If a cut doesn't seem to do anything, the direction is the first thing to check.

### Blind and through
- A **blind** cut stops at a set depth: this pocket, 6 mm into a 10 mm plate.
- A **through** cut goes all the way out the other side. Give it a distance comfortably larger than the part.

### Reading the status bar
When your part has the right overall size but the wrong amount of material, the status bar says whether you have too much (a cut is missing or too small) or too little (a cut is too deep or too wide). The **% match** figure is how much of the target, by volume, you've got right.`,
    hints: ["Start with the plate: an 80 × 50 rectangle centred on the origin, extruded 10.", "New sketch on the Top plane with Offset along Z = 10: a 40 × 20 rectangle centred on the origin.", "Extrude it with Distance 6, Operation Cut, and Flip direction ticked."],
    target: [sk("s1", "XY", 0, rect(0, 0, 80, 50)), ext("e1", "s1", 10), sk("s2", "XY", 10, rect(0, 0, 40, 20)), ext("e2", "s2", 6, { mode: "cut", flip: true })],
    debrief: `Add material, remove material: with those two operations you can already describe an enormous range of parts.

You could also have sketched the pocket on the plane at Z = 4 (the pocket floor) and cut **upward** 6. Same solid. The top-face version states the intent better: "a pocket 6 deep from the top". If the plate later becomes 12 thick, a real CAD model built that way keeps a 6 mm pocket; one built from the floor up would silently become 8 deep.

**In the workshop,** this pocket would be cut by an end mill, which is round, so the inside corners can't be perfectly sharp: they'd have a radius equal to the cutter's. Designing with the manufacturing process in mind has a name, **DFM** (design for manufacturability), and you'll practise it for 3D printing in a later track.`,
  },

  {
    id: "k-holes",
    title: "Hole Patterns",
    level: 2, time: 12, slug: "grid_pattern",
    tags: ["pattern", "through hole"],
    tools: T, sketchTools: ["rect", "circle", "path"],
    objective: "Build a mounting plate 80 × 50 × 6 mm centred on the origin, with four ⌀6 through holes. The hole centres form a 60 × 30 mm rectangle centred on the origin (so they are at X = ±30, Y = ±15).",
    lesson: `Four identical holes could be four circles, each typed in by hand. Then someone asks for ⌀6.5 and you edit four circles, and miss one. A **pattern** defines the hole once and repeats it.

### Patterns in a sketch
1. Draw **one** circle and set its diameter and position: the bottom-left hole, at X = -30, Y = -15.
2. With it selected, set **Repeat** to **grid**.
3. Count along X = 2, spacing 60. Count along Y = 2, spacing 30.

The copies are drawn dashed. Change the original's diameter and all four follow. That is the point: **one number, one place.**

### Spacing is centre to centre
Hole positions are always given **centre to centre**, never edge to edge. "Holes on a 60 × 30 pattern" means the centres are 60 apart one way and 30 the other. Drawings are dimensioned that way because that's how the part is measured and how the machine is programmed.

### Holes in the first sketch
All four circles sit inside the plate's rectangle, so they're holes straight away, and a single extrude gives you the finished plate.`,
    hints: ["One sketch: the 80 × 50 rectangle, plus one ⌀6 circle at X = -30, Y = -15.", "Select the circle, set Repeat to grid: Count along X 2, Spacing 60; Count along Y 2, Spacing 30.", "Finish the sketch and extrude 6."],
    target: [sk("s1", "XY", 0, rect(0, 0, 80, 50), grid(circle(-30, -15, 6), 2, 2, 60, 30)), ext("e1", "s1", 6)],
    debrief: `Patterns are about more than saving clicks. They record that the holes are **the same hole**, which is true of the real part: one drill, one fastener size, one tolerance.

Professional CAD offers patterns at two levels:
- **Sketch patterns**, like this one, repeat 2D shapes inside a sketch.
- **Feature patterns** repeat a finished 3D feature (a hole with its counterbore and chamfer, a rib, a whole boss). They're usually the better choice for complex repeats because the pattern stays visible in the timeline.

A related design habit: **use standard sizes.** A ⌀6 hole would normally be a clearance hole for an M5 or a close fit for an M6 screw. Real hole sizes come from a table, not from whatever looked right. You'll use the clearance tables in the 3D-printing track.`,
  },

  {
    id: "k-slot",
    title: "Slots and Rounded Corners",
    level: 2, time: 12, slug: "slot_rounded_rect",
    tags: ["slot", "corner radius"],
    tools: T, sketchTools: ["rect", "circle", "path", "slot"],
    objective: "Build an adjustment plate centred on the origin: 90 × 30 mm with all four corners rounded to an 8 mm radius, 5 mm thick, with a slot 40 mm long overall and 8 mm wide along X through its centre.",
    lesson: `Two shapes show up on almost every sheet-metal and plastic part: the **rounded rectangle** and the **slot**.

### Rounded corners
Select a rectangle and set its **Corner radius**. Sharp outside corners are uncomfortable to hold, catch on things, and concentrate stress; a radius fixes all three, so plates are rarely left square.

### The slot
A slot is a rectangle with fully rounded ends, the shape a round cutter leaves when it moves in a straight line. It lets a bolt slide for adjustment, which is why you see slots on brackets, motor mounts and anything that needs aligning during assembly.

Pick **Slot** and drag from the centre of one end to the centre of the other, then set the numbers:

| Field | Meaning |
|---|---|
| Overall length | end to end, including both rounded ends |
| Width | across the slot; the end radius is half of this |
| Rotation | the angle of the slot's long axis |

Be careful which length a drawing means. A slot can be specified by its **overall length** (used here) or by the **centre-to-centre** distance of its two end arcs; they differ by exactly one slot width. Here: 40 overall, 8 wide, so the end centres are 32 apart.`,
    hints: ["Rectangle 90 × 30 centred on the origin with Corner radius 8.", "Add a Slot, then set Centre 0, 0, Overall length 40, Width 8, Rotation 0.", "The slot is inside the rectangle, so it's a hole. Finish and extrude 5."],
    target: [sk("s1", "XY", 0, rect(0, 0, 90, 30, 8), slot(0, 0, 40, 8)), ext("e1", "s1", 5)],
    debrief: `That's a recognisable real part: an adjustment plate you could bolt through and slide.

**Round in the sketch, or round the solid later?** You rounded the corners in the sketch. The alternative is to extrude a sharp rectangle and add a **Fillet** feature to the four vertical edges afterwards, which you'll do in the Finishing track. Many experienced designers prefer the fillet feature: sketches stay simple, and cosmetic rounding can be switched off or changed without touching the profile. Others round in the sketch when the radius is part of the function, as with a slot. Both are legitimate; be consistent.

Notice what the slot's width implies: an 8 mm slot is cut with an 8 mm tool in one pass, or accepts an M8 bolt with zero clearance (too tight; a real M8 slot would be 9 mm). Sizes in CAD always mean something physical.`,
  },

  {
    id: "k-hex",
    title: "Polygons",
    level: 3, time: 12, slug: "polygon_across_flats",
    tags: ["polygon", "across flats"],
    tools: T, sketchTools: ["rect", "circle", "path", "slot", "poly"],
    objective: "Build a blank for an M10 hex nut centred on the origin: a regular hexagon measuring 17 mm across flats, 8 mm thick, with a ⌀10 hole through the middle. Two of its corners point along ±Y.",
    lesson: `Hexagons are everywhere in mechanical design because of one tool: the spanner. A **regular polygon** has equal sides and equal angles, and CAD draws one from a centre, a number of sides, and a size.

### Two ways to size a hexagon
| Measure | Meaning | Used for |
|---|---|---|
| **Across flats** (AF) | distance between two opposite flat sides | spanner and socket sizes, nuts and bolt heads |
| **Across corners** (AC) | distance between two opposite corners | clearance: the hole a hex must fit or turn in |

They're different numbers. For a hexagon, AC = AF ÷ cos 30° ≈ AF × 1.155. A "17 mm" nut is 17 across flats and about 19.6 across corners. Mixing the two up is one of the most common mistakes in beginner drawings, and it produces a nut that no spanner fits.

### Drawing it
Pick **Polygon**, drag from the centre outward, then in the panel set **Sides** to 6, **Size measured** to *across flats*, and **Size** to 17.

At rotation 0 the polygon has a corner pointing straight up (+Y in this sketch), which is what the objective asks for. The **Rotation** field turns it; 30° would put a flat on top instead.`,
    hints: ["One sketch on the Top plane: a polygon at 0, 0 with Sides 6.", "Set Size measured to across flats and Size to 17. Add a ⌀10 circle at the centre.", "Leave Rotation at 0, finish the sketch and extrude 8."],
    target: [sk("s1", "XY", 0, poly(0, 0, 6, 17, "flats"), circle(0, 0, 10)), ext("e1", "s1", 8)],
    debrief: `If you'd left the size on *across corners*, the status bar would have reported an overall size about 15% too small: a nut for a 14.7 mm spanner that doesn't exist.

Things a real nut has that this blank doesn't:
- **Threads.** CAD models usually show threads as a plain hole plus a note ("M10 × 1.5"), because modelling the helix is slow and adds nothing for machining. For 3D printing, small threads are better cut with a tap or replaced by a captive nut, which you'll design a pocket for later.
- **Chamfers** on the corners of both faces. Those are finishing features, two tracks away.

**Standard parts are rarely modelled from scratch.** Fastener dimensions come from standards (ISO 4032 for this nut), and CAD systems ship libraries of them. Knowing how to read "across flats" off the table is the part that's on you.`,
  },

  {
    id: "k-flange",
    title: "Circular Patterns",
    level: 3, time: 15, slug: "polar_pattern",
    tags: ["circular pattern", "bolt circle"],
    tools: T, sketchTools: ["rect", "circle", "path", "slot", "poly"],
    objective: "Build a pipe flange centred on the origin: an 80 mm diameter disc, 8 mm thick, with a ⌀30 bore through the centre and six ⌀8 bolt holes equally spaced on a 60 mm bolt circle. One bolt hole lies on the +X axis.",
    lesson: `Anything that bolts on around a shaft or a pipe has its holes arranged in a circle: wheels, flanges, motor faces, lids. That arrangement is a **circular pattern** (also called a polar pattern).

### The bolt circle
The holes' centres lie on an imaginary circle called the **bolt circle** or **pitch circle**. Its diameter is the **PCD** (pitch circle diameter), sometimes written BCD. "6 × ⌀8 on a 60 PCD" means: six holes, each 8 in diameter, centres on a circle of diameter 60, so each centre is **30** from the middle.

### Setting it up
1. Draw the ⌀80 disc and the ⌀30 bore at the origin.
2. Draw **one** bolt hole: ⌀8, centred at X = 30, Y = 0. That's the one on the +X axis.
3. Select it and set **Repeat** to **circular**: Count 6, centre 0, 0.

The pattern spaces the copies evenly around the centre: 360° ÷ 6 = 60° apart.

### Why position of the first hole matters
The pattern is defined by its first hole. Put that hole at 30, 0 and one hole sits on the X axis. Put it at 0, 30 and the whole pattern is turned by 90°, which for six holes is a different part: its holes won't line up with the mating flange. Drawings always say where the pattern starts.`,
    hints: ["Three shapes to start: a ⌀80 circle and a ⌀30 circle at the origin, and a ⌀8 circle at X = 30, Y = 0.", "Select the ⌀8 circle and set Repeat to circular, Count 6, centre 0, 0.", "All the holes are inside the big circle, so one extrude of 8 finishes the part."],
    target: [sk("s1", "XY", 0, circle(0, 0, 80), circle(0, 0, 30), polar(circle(30, 0, 8), 6)), ext("e1", "s1", 8)],
    debrief: `A flange in one sketch and one extrude, with just three circles actually drawn.

Try changing the count to 4 or 8 and watch the status bar: the overall size still matches but the amount of material changes, and the % match drops. Put it back to 6.

**Reading "6 × ⌀8 EQ SP ON 60 PCD"** off a drawing and turning it into a first hole plus a pattern is a daily task for a mechanical designer. The same notation covers lug nuts on a wheel, the screws on a pressure-cooker lid and the mounting face of every electric motor.

You've now used every sketch tool in this workbench: rectangle, circle, profile, slot and polygon, plus grid and circular patterns. Next: features beyond extrude.`,
  },
];
