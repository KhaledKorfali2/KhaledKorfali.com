// Track 1: First Solids. Zero assumed knowledge: the sketch → feature workflow,
// exact dimensions, nested profiles, sketch planes, stacking features.
// Lessons use ~code~ spans and ~~~ fences (see ui.js).
import { sk, rect, circle, path, ext } from "./parts.js";

const T1 = ["sketch", "extrude"];

export default [
  {
    id: "c-plate",
    title: "Your First Solid",
    level: 1, time: 8, slug: "first_extrude",
    tags: ["sketch", "extrude"],
    tools: T1, sketchTools: ["rect"],
    objective: "Build a plate 60 mm wide (X), 40 mm deep (Y) and 10 mm thick (Z), centred on the origin and sitting on the Top plane.",
    lesson: `**CAD** (computer-aided design) is how physical things get designed before they're made: brackets, phone cases, engine parts, furniture. Almost all mechanical CAD works the same way, and you're about to do the whole loop once.

### The idea: sketch, then feature
1. Draw a flat 2D shape, called a **sketch**, on a plane.
2. Turn it into 3D with a **feature**. The most common one is **Extrude**: pull the shape straight out to give it thickness.

A part is a list of such steps, kept in order in the **timeline** on the left. Change a number in an early step and everything after it updates. That's what *parametric* modelling means, and it's why engineers can tweak a design without redrawing it.

### Your workbench
- The **orange ghost** in the 3D view is the target. Your job is to build a solid that fills it exactly.
- The **Target drawing** tab shows the target as an engineering drawing with its overall size.
- Drag in the 3D view to orbit, right-drag (or Shift-drag) to pan, scroll to zoom. **Iso / Front / Top / Right** jump to standard views.
- Everything is in **millimetres**. The red line is the X axis, green is Y, blue is Z (up).

### Build it
1. Click **Sketch**. You're now looking straight down at the Top plane.
2. Choose **Rectangle** and drag out any rectangle.
3. With it selected, type its exact numbers in the panel on the left: centre 0, 0, width 60, height 40.
4. Click **Finish sketch**, then **Extrude**, and set the distance to 10.

When your solid matches the ghost, the status bar gives you a **flag** that looks like ~DATUM{something_1a2b3c}~. Submit it below to complete the challenge.`,
    hints: ["Click Sketch, pick the Rectangle tool, and drag anywhere. Don't worry about the size while dragging.", "Select the rectangle and set Centre X = 0, Centre Y = 0, Width = 60, Height = 40 in the properties panel. Then Finish sketch.", "Click Extrude. It picks your sketch automatically; set Distance to 10 and leave the operation on Join."],
    target: [sk("s1", "XY", 0, rect(0, 0, 60, 40)), ext("e1", "s1", 10)],
    debrief: `Sketch, then extrude: a large share of all real parts are mostly that, repeated.

Look at the timeline: **Sketch 1**, then **Extrude 1**. Click the extrude and change 10 to 25. The part updates and the status bar tells you exactly how it now differs from the target. Put it back to 10. That edit-and-rebuild loop is the heart of parametric CAD.

Words you'll meet in every CAD program:
- **Sketch**: a 2D drawing on a plane. Its closed outline is a **profile**.
- **Feature**: an operation that creates or changes 3D geometry.
- **Body** (or solid): the 3D result.
- **Timeline** / **feature tree** / **history**: the ordered list of features. Fusion 360 draws it along the bottom; SolidWorks, Onshape and FreeCAD show it as a tree on the left.`,
  },

  {
    id: "c-exact",
    title: "Position Matters",
    level: 1, time: 8, slug: "exact_position",
    tags: ["dimensions", "origin"],
    tools: T1, sketchTools: ["rect"],
    objective: "Build a block 50 × 30 × 20 mm (X × Y × Z) with one bottom corner exactly at the origin, extending into +X, +Y and +Z.",
    lesson: `In the last challenge the plate was centred on the origin. This block is the same kind of shape, but it sits with a **corner** at the origin, so the size alone isn't enough: *where* the sketch is matters too.

### The origin and the three planes
Every CAD model has an **origin** (0, 0, 0) and three base planes through it:

| Plane | Contains | You look at it from |
|---|---|---|
| **Top** (XY) | X and Y | above |
| **Front** (XZ) | X and Z | the front |
| **Right** (YZ) | Y and Z | the right-hand side |

These are your **datums**: the fixed references everything else is measured from. Choosing where the part sits relative to them is a real design decision, and it's the first thing an experienced designer thinks about.

### Fully defined
A sketch shape is **fully defined** when nothing about it is left to chance: its size *and* its position are pinned down. In this workbench you do that by typing numbers; a rectangle needs four (centre X, centre Y, width, height).

A rectangle 50 wide with its left edge at X = 0 has its centre at X = 25. Work out the Y the same way.

### Read the feedback
If your block is the right size but in the wrong place, the status bar says so and tells you where your part starts versus where the target starts. Use it.`,
    hints: ["The rectangle's centre is half its size away from the corner at the origin.", "Centre X = 25, Centre Y = 15, Width = 50, Height = 30.", "Finish the sketch and extrude 20. The default direction is +Z, which is what you want."],
    target: [sk("s1", "XY", 0, rect(25, 15, 50, 30)), ext("e1", "s1", 20)],
    debrief: `Same amount of plastic as a centred block, but a different part as far as anything that connects to it is concerned.

**Where should the origin go?** Professionals pick it on purpose:
- On an **axis of symmetry** when the part is symmetric. Mirroring and centring then come for free.
- At a **mounting face or corner** when that's what gets measured on the shop floor.
- Where the part **meets its neighbours** in an assembly.

In professional CAD you'd pin the rectangle with **dimensions** (the 50 and the 30) and **constraints** (this corner is *coincident* with the origin). The idea is identical to typing the centre here; the software works out the numbers from the relationships. Under-defined sketches, which can still be dragged around, are a classic source of parts that change shape when someone edits them later.`,
  },

  {
    id: "c-washer",
    title: "Circles and Holes",
    level: 1, time: 8, slug: "nested_profiles",
    tags: ["circle", "profile", "hole"],
    tools: T1, sketchTools: ["rect", "circle"],
    objective: "Build a washer centred on the origin: 40 mm outside diameter, 20 mm hole, 4 mm thick.",
    lesson: `A sketch can contain several shapes. How they overlap decides what the profile is.

### Shapes inside shapes are holes
Draw a circle, then a smaller circle **inside** it. The region between them is the profile; the inner circle is a hole. Extrude it and you get a ring.

This is how nearly every hole in every part starts: a closed shape inside another closed shape. In the sketch editor, holes are shown dark so you can see what will and won't become material.

### Diameter, not radius
Circles in CAD are dimensioned by **diameter**, written ⌀. That's because diameter is what you can measure with calipers and what drill bits are sold by. A "20 mm hole" always means ⌀20.

### Drawing a circle
Pick **Circle** and drag from the centre outward. Then set the exact diameter and centre in the panel. Both circles here share the same centre, the origin, which makes them **concentric**.

Tip: the faint orange dashed lines in the sketch are the target's edges seen from this plane. They're a guide, not a substitute for typing the right numbers.`,
    hints: ["One sketch, two circles, both centred at 0, 0.", "Diameters 40 and 20. The smaller one turns dark: it's a hole.", "Finish the sketch and extrude 4."],
    target: [sk("s1", "XY", 0, circle(0, 0, 40), circle(0, 0, 20)), ext("e1", "s1", 4)],
    debrief: `One sketch, one extrude, and a hole came for free.

There's a second way to make that hole: extrude a solid disc first, then sketch the small circle and extrude it as a **cut**. You'll do that soon. Both give the same solid, and the checker here compares solids, not methods, so either would pass. Which is better is a question of **design intent**:

- If the hole is part of the basic shape (a washer *is* a ring), put it in the first sketch.
- If the hole is a detail added to a part (a mounting hole in a bracket), a separate feature is easier to find, change or remove later.

Real CAD programs also have a dedicated **Hole** feature that knows about drill sizes, counterbores and threads. It's a convenience on top of exactly what you just did.`,
  },

  {
    id: "c-front",
    title: "Sketch on Another Plane",
    level: 2, time: 12, slug: "front_plane_profile",
    tags: ["planes", "profile", "extrude"],
    tools: T1, sketchTools: ["rect", "circle", "path"],
    objective: "Build an L-shaped bracket. Seen from the front it is an L: 40 mm wide (X) and 40 mm tall (Z), with both legs 8 mm thick and the inside corner pointing toward +X and +Z. Its outer corner is at the origin, and it runs 30 mm deep, from Y = 0 to Y = 30.",
    lesson: `Not every part is easiest to draw from above. The fastest way to model something is usually to sketch its most **characteristic outline**, the view that says the most about its shape, and extrude that. For an L-bracket, that's the side view.

### Choosing a sketch plane
After clicking **Sketch**, set **Plane** to **Front (XZ)** in the properties panel. Now you're drawing in X and Z, looking at the part from the front. When you extrude, the shape is pulled along **Y**, the direction that plane faces.

### The Profile tool
Rectangles and circles won't make an L. **Profile** draws any closed outline from straight lines:
1. Click each corner in turn.
2. Click the first point again (or press Enter) to close it.

Then select the profile and check the **Points** list in the panel. Every corner's coordinates are there, and you can type exact values.

### Plan the corners first
Going anticlockwise from the origin, an L that is 40 wide, 40 tall and 8 thick has six corners:

~~~text
(0,0) → (40,0) → (40,8) → (8,8) → (8,40) → (0,40)
~~~
Sketch it on paper if that helps. Working out the corner coordinates before you click is a habit that saves a lot of dragging.`,
    hints: ["Click Sketch, then change Plane to Front (XZ) before drawing.", "Use the Profile tool and click the six corners: (0,0), (40,0), (40,8), (8,8), (8,40), (0,40), then click the first point again to close. Fix any that are off in the Points list.", "Finish the sketch and extrude 30. On the Front plane the default direction is +Y."],
    target: [sk("s1", "XZ", 0, path([[0, 0], [40, 0], [40, 8], [8, 8], [8, 40], [0, 40]])), ext("e1", "s1", 30)],
    debrief: `You modelled an L-bracket with one sketch and one extrude. From the Top plane the same part would have needed two rectangles at different heights. **Picking the right plane and the right profile is most of the skill in CAD.**

A good question to ask of any part: *if I sliced it like a loaf of bread, in which direction would every slice look the same?* That direction is your extrude direction, and the slice is your profile. Parts with a constant cross-section are called **prismatic**; extruded aluminium, brackets cut from angle stock and most laser-cut pieces are examples.

In professional CAD the Profile tool is a chain of **Line** segments, with **horizontal** and **vertical** constraints keeping edges square and dimensions setting the lengths. The six coordinates you typed carry the same information.`,
  },

  {
    id: "c-stack",
    title: "Stacking Features",
    level: 2, time: 12, slug: "offset_plane_join",
    tags: ["offset plane", "join", "timeline"],
    tools: T1, sketchTools: ["rect", "circle", "path"],
    objective: "Build a base plate 60 × 60 × 8 mm centred on the origin, with a round boss 30 mm in diameter standing 20 mm tall on top of it, also centred. Total height: 28 mm.",
    lesson: `Real parts are built up from several features. Each new feature starts from a sketch, and that sketch has to be drawn **where the feature begins**.

### Offset planes
The boss sits on top of the plate, 8 mm above the Top plane. So its sketch goes on a plane **parallel to Top, offset by 8**:

1. Click **Sketch**.
2. Leave Plane on Top (XY) and set **Offset along Z** to 8.
3. Draw the circle and finish.

In the sketch you'll see the plate's edges in grey underneath, so you can tell where you are.

### Join
Extrude the circle 20 mm. The operation **Join** adds the new material to the existing body, so plate and boss become one solid. The first extrude of any part is always a join, because there's nothing to cut from yet.

### The timeline is a recipe
Your timeline will read:

~~~text
Sketch 1 → Extrude 1 → Sketch 2 → Extrude 2
~~~
Order matters. Sketch 2 lives at height 8 because Extrude 1 is 8 thick. Change the plate to 12 and, in this workbench, the boss stays at 8 and ends up partly buried: you'd update the offset too. Professional CAD lets you sketch **directly on a face** of the body, so the sketch follows the face when the plate changes. That link between features is powerful, and it's also what breaks when a face the sketch depended on disappears.`,
    hints: ["First the plate: a 60 × 60 rectangle centred on the origin, extruded 8.", "Second sketch: Top plane with Offset along Z = 8, containing a ⌀30 circle at 0, 0.", "Extrude that sketch 20 with the operation left on Join."],
    target: [sk("s1", "XY", 0, rect(0, 0, 60, 60)), ext("e1", "s1", 8), sk("s2", "XY", 8, circle(0, 0, 30)), ext("e2", "s2", 20)],
    debrief: `Four timeline steps, one body. You've now used everything in the basic loop: choose a plane, sketch, extrude, repeat.

**There's always more than one way.** You could also have:
- sketched the circle on the Top plane at offset 0 and extruded it 28 (it overlaps the plate; Join merges them), or
- drawn the whole silhouette as a profile on the Front plane and **revolved** only the boss… which you'll learn in the third track.

All of those produce the identical solid and pass the check. What differs is how the model behaves when someone changes it later. Asking "what is likely to change, and what should follow?" before you start is called capturing **design intent**, and it's what separates a robust model from one that falls apart on the first edit.

Next track: removing material, and getting more out of a single sketch.`,
  },
];
