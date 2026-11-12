// Track 5: Design for 3D Printing. Walls, clearances, overhangs, orientation.
import { sk, rect, circle, poly, path, ext, fil, cham, shell, face } from "./parts.js";

const T = ["sketch", "extrude", "revolve", "mirror", "fillet", "chamfer", "shell"];

export default [
  {
    id: "p-walls",
    title: "Wall Thickness and Export",
    level: 3, time: 15, slug: "printable_walls",
    tags: ["wall thickness", "nozzle", "STL"],
    tools: T,
    objective: "Design a pen cup for a printer with a 0.4 mm nozzle: a cylinder 70 mm in diameter and 90 mm tall, standing on the Top plane and centred on the Z axis, hollowed to a 2.4 mm wall and floor with the top open.",
    lesson: `Everything so far applies to any way of making a part. This track is about one process: **FDM 3D printing**, where a nozzle draws each layer in melted plastic. A design that ignores how the printer works will print badly or not at all.

### The printer draws lines
An FDM printer lays down a line of plastic roughly as wide as its **nozzle**, most often 0.4 mm, in **layers** usually 0.2 mm high. A wall isn't solid material of any thickness you like; it's a whole number of those lines side by side.

| Wall | Lines at 0.4 mm | Result |
|---|---|---|
| 0.4 mm | 1 | prints, very fragile ("vase mode") |
| 0.8 mm | 2 | minimum for a usable wall |
| 1.2 mm | 3 | sturdy for small parts |
| 2.4 mm | 6 | strong, good for containers |
| 1.0 mm | 2.5 | awkward: the slicer must leave a gap or overfill |

**Rule: make walls a multiple of the nozzle width,** and at least two lines thick. 2.4 mm is a strong, clean-printing choice for a cup.

### Build it
Extrude a ⌀70 circle 90 mm, then **Shell** it: pick the top face, thickness 2.4.

### Getting it to the printer
When the part matches, press **STL** in the toolbar. An STL file describes the surface as triangles and is what **slicers** (PrusaSlicer, Cura, Bambu Studio, OrcaSlicer) read. The slicer turns it into layer-by-layer instructions for your printer. **STEP** is the other export: an exact format for passing a design to another CAD program or to a machine shop.`,
    hints: ["Sketch a ⌀70 circle at the origin on the Top plane and extrude it 90.", "Click Shell and pick the flat top face.", "Set Wall thickness to 2.4."],
    target: [sk("s1", "XY", 0, circle(0, 0, 70)), ext("e1", "s1", 90), shell("h1", 2.4, face(0, 0, 90))],
    debrief: `That file would print, in the orientation you modelled it, with no supports: flat base on the bed, walls going straight up.

**STL facts worth knowing**
- STL has **no units**. The numbers are just numbers; slicers assume millimetres. If a part imports 25.4 times too small or too large, somebody mixed inches and millimetres.
- STL is **triangles**, so curves become facets. Export resolution decides how smooth a cylinder looks. Too coarse and you can see flats; too fine and the file is huge for no visible gain.
- You can't sensibly edit an STL in CAD. Keep the real model (here, your timeline) and treat the STL as a printout.
- Newer slicers also accept **3MF** (units and colours included) and often **STEP** directly, which avoids faceting altogether.

**Floor and walls needn't match.** Shell gave the floor the same 2.4 mm. Slicers build floors from solid layers (typically 4 to 5 at 0.2 mm ≈ 1 mm), so a thinner floor would be fine; revolving a wall profile, as in the cup challenge, lets you choose each separately.`,
  },

  {
    id: "p-clearance",
    title: "Clearance: Parts That Fit",
    level: 4, time: 18, slug: "clearance_nut_trap",
    tags: ["tolerance", "clearance", "captive nut"],
    tools: T,
    objective: "Design a captive-nut block for an M5 screw: a 30 × 30 × 8 mm block centred on the origin, with a ⌀5.4 clearance hole through the middle, and a hexagonal nut pocket in the top face measuring 8.4 mm across flats and 4.2 mm deep, with two corners pointing along ±Y.",
    lesson: `A 5 mm peg does not go into a 5 mm hole. Not on a printer, and not on a milling machine. Real parts vary, and anything that has to fit needs a deliberate gap called **clearance**.

### Why printed holes come out small
Melted plastic is squeezed out slightly wider than the nozzle path, and inside curves shrink as they cool. Printed holes are typically **0.1 to 0.3 mm smaller** than drawn, and outside dimensions slightly larger.

### Starting values for a 0.4 mm nozzle
| Fit | Extra on the diameter | Use for |
|---|---|---|
| Press fit | 0 to 0.1 mm | parts hammered together, bearings |
| Close fit | 0.2 mm | locating pins, snug lids |
| Free fit | 0.4 mm | screws passing through, things that must slide |

Every printer is a little different. Professionals print a small **tolerance test** (a row of holes in 0.1 mm steps) once per printer and material, then design from what they measured.

### Screws in printed parts
Plastic threads strip. The robust alternative is a **captive nut**: a hexagonal pocket that stops a standard steel nut from turning, with a clearance hole for the screw.

For M5:
- Screw clearance hole: 5 + 0.4 = **⌀5.4**
- An M5 nut is 8.0 across flats and 4.0 thick (ISO 4032), so the pocket is **8.4 across flats** and **4.2 deep**

### Build it
1. Sketch the 30 × 30 square with the ⌀5.4 circle inside it; extrude 8.
2. Sketch on the Top plane at offset 8: a hexagon, 6 sides, *across flats*, size 8.4.
3. Extrude 4.2 as a **Cut** with **Flip direction** ticked.`,
    hints: ["First sketch: a 30 × 30 rectangle and a ⌀5.4 circle, both at the origin. Extrude 8.", "Second sketch on the Top plane at Offset along Z = 8: a Polygon with Sides 6, Size measured across flats, Size 8.4, Rotation 0.", "Extrude it 4.2, Operation Cut, Flip direction ticked."],
    target: [sk("s1", "XY", 0, rect(0, 0, 30, 30), circle(0, 0, 5.4)), ext("e1", "s1", 8), sk("s2", "XY", 8, poly(0, 0, 6, 8.4, "flats")), ext("e2", "s2", 4.2, { mode: "cut", flip: true })],
    debrief: `Drop an M5 nut in that pocket and you have a metal thread in a plastic part that will survive being tightened hundreds of times.

**Tolerance is a professional topic in its own right.** On engineering drawings every dimension carries an allowed variation, such as 30 ±0.1, and fits between shafts and holes are specified with standard codes (H7/g6 and friends, ISO 286). The idea is the one you just applied: *decide the gap on purpose, based on how the part is made.*

More ways to put threads in printed parts:
- **Heat-set inserts:** brass threaded inserts melted into a slightly undersized hole with a soldering iron. Strong and tidy; the usual choice for enclosures.
- **Self-tapping screws** into a plain hole about 85% of the screw diameter. Fine for a few assembly cycles.
- **Printed threads** work from about M8 upward, with extra clearance.

Orientation matters here too: this pocket opens upward and prints with no supports. Turn the part over and the pocket's ceiling would need to bridge across empty space, the subject of the next challenge.`,
  },

  {
    id: "p-overhang",
    title: "Overhangs: Chamfer the Bottom",
    level: 4, time: 18, slug: "overhang_chamfer",
    tags: ["overhang", "45 degree rule", "chamfer", "fillet"],
    tools: T,
    objective: "Finish a block for printing flat on the bed. Build a 50 × 30 × 12 mm block centred on the origin on the Top plane. Add a 1 mm chamfer to every edge of the bottom face and a 2 mm fillet to every edge of the top face.",
    lesson: `A printer builds upward, and each layer needs something underneath it. Plastic can lean outward a little from the layer below, but not much.

### The 45° rule
A surface that leans out by up to about **45° from vertical** prints fine: each layer overhangs the last by no more than its own height. Steeper than that and the plastic droops, because it's being drawn in mid-air. Slicers solve it with **supports**, throwaway scaffolding you break off afterwards, which costs time and material and scars the surface.

Good printed design avoids supports instead.

### Fillets and chamfers on the bottom
Look at an edge where a vertical wall meets the bed:

- A **fillet** there starts out horizontal. Its first layers overhang at nearly 90°, far beyond the limit, and print as a rough, sagging lip.
- A **chamfer** is 45° all the way. It prints perfectly.

So the rule printer-savvy designers follow: **chamfer edges that touch the bed; fillet edges that face up.** On top, a fillet is no problem at all, because every layer sits fully on the one below.

A small bottom chamfer has a second benefit. The first layer is deliberately squashed onto the bed for grip, which makes it bulge outward slightly (the "elephant's foot"). A 0.5 to 1 mm chamfer hides that.

### Build it
1. The block: 50 × 30 rectangle, extrude 12.
2. **Chamfer**, distance 1: pick the **bottom face** (orbit underneath).
3. **Fillet**, radius 2: pick the **top face**.`,
    hints: ["Start with a 50 × 30 rectangle centred on the origin, extruded 12.", "Chamfer: orbit to see the underside, click the bottom face, distance 1.", "Fillet: click the top face, radius 2. Make sure the chamfer is on the bottom and the fillet on top, not the other way round."],
    target: [sk("s1", "XY", 0, rect(0, 0, 50, 30)), ext("e1", "s1", 12), cham("c1", 1, [face(0, 0, 0)]), fil("f1", 2, [face(0, 0, 12)])],
    debrief: `Swap them, fillet on the bottom and chamfer on top, and the part has exactly the same amount of plastic in different places. The status bar would tell you the volume matches but the shape doesn't, and the printer would give you a ragged bottom edge.

**More support-free design habits**
- **Holes with horizontal axes** have an overhanging top. Small ones (up to about ⌀6) bridge well enough; larger ones are drawn as a **teardrop**, with a 45° point on top.
- **Bridges** span a gap between two supports. Most printers bridge 20 to 40 mm cleanly; beyond that, add a rib or redesign.
- **Flat on the bed** is the strongest way to anchor a part. Give tall, thin parts a wider foot.
- **Split and assemble.** Two easy-to-print pieces glued or screwed together often beat one awkward piece full of supports.

The 45° figure is a rule of thumb. Good cooling and thin layers stretch it to 55° or 60°; some materials manage less.`,
  },

  {
    id: "p-hook",
    title: "Print Orientation and Strength",
    level: 4, time: 22, slug: "orientation_hook",
    tags: ["orientation", "layer lines", "profile"],
    tools: T,
    objective: "Design a wall hook to be printed lying on its side. On the Top plane, draw this profile and round every corner to a 2 mm radius: (0,0), (30,0), (30,18), (24,18), (24,6), (6,6), (6,60), (0,60). Extrude it 20 mm upward. Then add a ⌀4.5 screw hole along X through the tall back plate, centred at Y = 45, Z = 10.",
    lesson: `A printed part is a stack of layers, and the bond **between** layers is its weak point. Pull a print apart along its layer lines and it splits like wood along the grain; load it across them and it's several times stronger. Deciding which way the layers run is a design decision, and you make it in CAD.

### Think about the load
A wall hook carries weight on its arm, which tries to bend the arm away from the back plate. If you print the hook standing up, the layers are horizontal slices through the arm, and the load peels them apart at the root: it snaps.

Print the same hook **lying on its side** and every layer is a complete outline of the hook, back plate and arm in one continuous loop of plastic. The load now runs *along* the strands. Same shape, same plastic, much stronger.

### Model it the way it prints
So sketch the hook's side profile on the **Top** plane, the bed, and extrude upward by its width. The model's Z axis is then the print's Z axis, and you can see what the printer will see.

1. **Profile** on the Top plane through the eight points in the objective. It's a 6 mm thick back plate 60 tall, a 6 mm thick arm reaching out to X = 30, and an upturned tip.
2. Select the profile and set **Corner radius** to 2. The inside corners get the stress-relieving radius; the outside ones become comfortable.
3. **Extrude** 20.
4. The screw goes through the back plate along X. Sketch on the **Right** plane: a ⌀4.5 circle at Y = 45, Z = 10. Extrude it as a **Cut**, **Symmetric**, distance 20, so it passes through the 6 mm plate.

A ⌀4.5 hole is a free fit for a 4 mm wood screw.`,
    hints: ["Top plane, Profile tool, eight points as given. Then set Corner radius to 2 on the profile and extrude 20.", "New sketch on the Right (YZ) plane: a ⌀4.5 circle with Centre Y = 45 and Centre Z = 10.", "Extrude it with Distance 20, Symmetric, Operation Cut."],
    target: [sk("s1", "XY", 0, path([[0, 0], [30, 0], [30, 18], [24, 18], [24, 6], [6, 6], [6, 60], [0, 60]], 2)), ext("e1", "s1", 20), sk("s2", "YZ", 0, circle(45, 10, 4.5)), ext("e2", "s2", 20, { mode: "cut", sym: true })],
    debrief: `That hook would hold a heavy coat. Printed upright, the identical shape would fail at a fraction of the load.

Notice the screw hole now has a **horizontal axis** in the print, so its top is a small overhang. At ⌀4.5 it bridges without trouble. A much larger hole in this orientation would be drawn as a teardrop.

**Orientation is always a trade-off between**
- **strength:** loads along the layers, not across them;
- **supports:** as few overhangs as possible;
- **surface:** the top and bottom faces print smooth, vertical faces show layer lines, and curved tops show stair-steps;
- **accuracy:** dimensions in the bed plane (X, Y) are more precise than heights, and holes print rounder when their axis is vertical.

You rarely get all four. For a functional part, strength wins; for a display piece, surface does. Deciding before you model, rather than after the first print breaks, is what makes someone good at this.

That completes the printing fundamentals: walls, clearances, overhangs and orientation. The last track puts everything together on complete parts.`,
  },
];
