// Track 3: Beyond Extrude. Revolve, symmetric extrude, mirror, cross holes.
import { sk, rect, circle, path, ext, rev, mir } from "./parts.js";

const T = ["sketch", "extrude", "revolve", "mirror"];

export default [
  {
    id: "r-shaft",
    title: "Revolve",
    level: 3, time: 15, slug: "revolve_profile",
    tags: ["revolve", "axis", "half profile"],
    tools: T,
    objective: "Build a stepped pin standing on the Top plane, centred on the Z axis: a ⌀30 base 10 mm tall with a ⌀16 shaft above it, 30 mm tall overall.",
    lesson: `Extrude pulls a profile in a straight line. **Revolve** spins a profile around an axis. Anything turned on a lathe or thrown on a potter's wheel is a revolve: shafts, knobs, pulleys, bottles, wheels.

### Draw half, spin it
Slice a round part down the middle and look at the cut face: you see its outline twice, mirrored about the centreline. You sketch **one half**, with one edge lying on the axis, and revolve it 360°.

### This part
Sketch on the **Front** plane, where the horizontal direction is X and the vertical is Z. The Z axis will be the axis of revolution, so the profile sits to the right of it, touching it:

~~~text
(0,0) → (15,0) → (15,10) → (8,10) → (8,30) → (0,30)
~~~
Notice the numbers are **radii**: a ⌀30 base reaches 15 from the axis, and a ⌀16 shaft reaches 8.

Then click **Revolve**. Set **Axis** to *the sketch's Z axis* and leave the angle at 360°.

### Rules for a revolve profile
- It must be **closed**.
- It must stay on **one side** of the axis. A profile that crosses the axis would have to pass through itself, and the kernel will refuse.
- An edge lying exactly on the axis gives a solid part; a gap between profile and axis gives a hole down the middle.`,
    hints: ["Sketch on the Front (XZ) plane and use the Profile tool.", "Corners: (0,0), (15,0), (15,10), (8,10), (8,30), (0,30). The left edge lies on the Z axis.", "Finish the sketch, click Revolve, and choose the sketch's Z axis with an angle of 360."],
    target: [sk("s1", "XZ", 0, path([[0, 0], [15, 0], [15, 10], [8, 10], [8, 30], [0, 30]])), rev("r1", "s1")],
    debrief: `The same pin could be two circles and two extrudes, like the boss in "Stacking Features". For two diameters it's a toss-up. For a part with five diameters, a groove and a taper, the revolve wins easily: **one sketch holds the entire shape**, and it looks like the drawing a machinist would be handed.

Guideline: if the part is **round and its profile is interesting**, revolve it. If it's **flat and its outline is interesting**, extrude it.

Revolves are also the natural way to get shapes extrude can't make at all: cones, spheres (revolve a half circle), domes and O-ring grooves.

**Diameter vs radius, again.** Turned parts are dimensioned by diameter on the drawing, but the half profile you sketch is in radii. Halving the wrong number is the classic revolve mistake; when a revolved part comes out twice as fat as expected, that's why.`,
  },

  {
    id: "r-cup",
    title: "Revolve a Hollow Part",
    level: 3, time: 15, slug: "revolve_hollow",
    tags: ["revolve", "wall thickness"],
    tools: T,
    objective: "Build a cup centred on the Z axis, standing on the Top plane: 40 mm outside diameter, 40 mm tall, with walls and a floor 3 mm thick, open at the top.",
    lesson: `A revolve profile doesn't have to be a solid half. Sketch the **cross-section of the wall** and the revolve produces a hollow part in one step.

### The wall as a profile
Picture the cup cut in half. Each half of the cut face is an L-shaped strip: the floor running out from the centre, then the wall going up. That strip is the profile:

~~~text
(0,0) → (20,0) → (20,40) → (17,40) → (17,3) → (0,3)
~~~
Read it as a walk around the material:
- along the bottom from the axis out to the outside radius, 20;
- up the outside to the rim at 40;
- across the 3 mm rim to the inside radius, 17;
- down the inside to the top of the floor at 3;
- back along the floor to the axis.

The wall thickness is the difference between outside and inside radius (20 − 17 = 3), and the floor thickness is the height of the last point.

### Why this is worth knowing
Bottles, bowls, lampshades, funnels, bushings and bearing races are all sketched this way: draw the section of the material, revolve it. Because the wall is drawn explicitly, you control its thickness **everywhere**, including making the base thicker than the sides.`,
    hints: ["Sketch on the Front (XZ) plane with the Profile tool.", "Six corners: (0,0), (20,0), (20,40), (17,40), (17,3), (0,3).", "Revolve around the sketch's Z axis, 360°."],
    target: [sk("s1", "XZ", 0, path([[0, 0], [20, 0], [20, 40], [17, 40], [17, 3], [0, 3]])), rev("r1", "s1")],
    debrief: `One sketch, one revolve, a hollow part with exactly the walls you asked for.

There are two other ways to make this cup, and you'll meet both:
- Extrude a ⌀40 cylinder, then **cut** a ⌀34 pocket 37 deep from the top.
- Extrude a ⌀40 cylinder, then use the **Shell** feature to hollow it to a 3 mm wall. That's in the next track.

All three give the same solid. The revolve is the one that scales to shapes with curves and varying walls.

**Thinking ahead to printing:** a 3 mm wall is solid and sturdy. Most desktop printers lay down lines about 0.4 mm wide, so 3 mm is seven or eight lines. A wall thinner than about 0.8 mm (two lines) is fragile, and one thinner than a single line may not print at all. Wall thickness gets its own lesson in the 3D-printing track.`,
  },

  {
    id: "r-sym",
    title: "Symmetric Extrude",
    level: 3, time: 12, slug: "symmetric_extrude",
    tags: ["symmetric", "mid-plane"],
    tools: T,
    objective: "Build a U-channel 60 mm long, centred on the origin in both X and Y. Seen from the front it is 40 mm wide (X from -20 to 20) and 25 mm tall, with a 5 mm thick floor and 5 mm thick walls. It runs from Y = -30 to Y = 30.",
    lesson: `Until now every extrude started at the sketch plane and went one way. A **symmetric** extrude grows equally to both sides of the plane, so the sketch plane ends up in the **middle** of the feature.

### Why you want that
Most parts are symmetric about at least one plane. If the sketch plane is that plane of symmetry:
- the part is automatically centred on the origin,
- the base planes stay useful as mirror planes and for later sketches,
- changing the length keeps the part centred.

Designers call this a **mid-plane** extrude and reach for it constantly.

### This part
Sketch the U on the **Front** plane. It's symmetric left to right as well, so centre it on the Z axis:

~~~text
(-20,0) → (20,0) → (20,25) → (15,25) → (15,5) → (-15,5) → (-15,25) → (-20,25)
~~~
Then **Extrude** with a distance of 60 and **Symmetric** ticked. The distance is the **total** length: 30 each side of the Front plane.

Without Symmetric, you'd get the same shape running from Y = 0 to Y = 60: the right size, in the wrong place. The status bar will tell you if that happens.`,
    hints: ["Front plane, Profile tool, eight corners as listed in the lesson.", "Check the Points list: X values are ±20 on the outside and ±15 on the inside; Z values are 0, 5 and 25.", "Extrude with Distance 60 and Symmetric ticked."],
    target: [sk("s1", "XZ", 0, path([[-20, 0], [20, 0], [20, 25], [15, 25], [15, 5], [-15, 5], [-15, 25], [-20, 25]])), ext("e1", "s1", 60, { sym: true })],
    debrief: `The part is centred on the origin in X because of how you sketched it, and in Y because of the symmetric extrude. Both were choices, and both will pay off in the next challenge, where the Right plane becomes a mirror.

**Extrude options you'll find in professional CAD**
| Option | Meaning |
|---|---|
| One side / blind | from the plane, a set distance (what you've used so far) |
| Symmetric / mid-plane | half the distance each way |
| Two sides | a different distance each way |
| To next / to face / through all | until it hits geometry, however far that is |

"Through all" is the right way to express a through hole: it stays through even if the part gets thicker. This workbench only has distances, so you give through cuts a generous one.`,
  },

  {
    id: "r-clevis",
    title: "Mirror and Cross Holes",
    level: 4, time: 20, slug: "mirror_cross_hole",
    tags: ["mirror", "symmetry", "right plane"],
    tools: T,
    objective: "Build a clevis centred on the origin. Base: 60 × 30 × 6 mm (X × Y × Z). Two upright lugs, one at each end in X, each 8 mm thick (X), 30 mm deep (Y) and rising 24 mm above the base, with their outer faces flush with the ends of the base. A ⌀10 hole runs along X through both lugs, centred at Y = 0, Z = 20.",
    lesson: `A clevis holds a pin between two lugs. Its two lugs are mirror images, which makes it a good part for two ideas: **model half, mirror the rest**, and **sketch on the plane that faces the feature**.

### Plan
1. **Base:** rectangle 60 × 30 on the Top plane, extrude 6.
2. **One lug:** sketch on the Top plane at offset 6 (the top of the base). The lug is 8 thick and flush with the +X end, so it spans X = 22 to 30: a rectangle 8 × 30 centred at X = 26, Y = 0. Extrude 24.
3. **Mirror** the body across the **Right** plane (YZ). The plane passes through the middle of the part, so the lug reappears at the −X end.
4. **Cross hole:** the hole runs along X, so its circle is drawn on the plane that faces X, the **Right** plane. In that sketch, horizontal is Y and vertical is Z: put a ⌀10 circle at Y = 0, Z = 20. Extrude it as a **Cut**, **Symmetric**, with a distance of 80 so it passes right through both lugs.

### Mirror
**Mirror** copies the whole body to the other side of a plane and joins the two. It only works cleanly if you built the first half in the right place relative to that plane, which is why the base was centred on the origin.

### One hole, two lugs
A single cut through both lugs guarantees the two holes are perfectly in line, exactly as they would be if you drilled them in one pass. Two separate holes could drift apart if one were edited.`,
    hints: ["Base first: 60 × 30 rectangle at the origin, extrude 6. Then a sketch at Offset along Z = 6 with a rectangle centred at X = 26, Y = 0, width 8, height 30, extruded 24.", "Add a Mirror feature and choose the Right plane (YZ).", "New sketch on the Right (YZ) plane: a ⌀10 circle at Y = 0, Z = 20. Extrude with Distance 80, Symmetric, Operation Cut."],
    target: [sk("s1", "XY", 0, rect(0, 0, 60, 30)), ext("e1", "s1", 6), sk("s2", "XY", 6, rect(26, 0, 8, 30)), ext("e2", "s2", 24), mir("m1", "YZ"), sk("s3", "YZ", 0, circle(0, 20, 10)), ext("e3", "s3", 80, { mode: "cut", sym: true })],
    debrief: `That part used all three base planes: Top for the base and lug, Right as a mirror and again for the cross hole. Being comfortable moving between planes is a milestone; many beginners stay on the Top plane and fight every part.

**Why mirror instead of drawing two rectangles?** Because the design intent is "the lugs are identical and symmetric". With a mirror, widening one lug widens both. With two rectangles, it's two edits and a chance to make them different by mistake.

You could also have built the whole U-shape as one profile on the Front plane, like the channel in the last challenge, and extruded it symmetrically. For this part that's arguably better: fewer features, same result. Knowing several routes and choosing the simplest is the craft.

In professional CAD you'd usually mirror a **feature** (just the lug) and keep the base as a single extrude; this workbench mirrors the whole body, which gives the same solid here because the base is symmetric.`,
  },
];
