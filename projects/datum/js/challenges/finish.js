// Track 4: Finishing Features. Fillet, chamfer, shell, and feature order.
import { sk, rect, circle, ext, fil, cham, shell, face } from "./parts.js";

const T = ["sketch", "extrude", "revolve", "mirror", "fillet", "chamfer", "shell"];
const block = [sk("s1", "XY", 0, rect(0, 0, 50, 30)), ext("e1", "s1", 20)];
const drilled = [sk("s1", "XY", 0, rect(0, 0, 40, 40), circle(0, 0, 12)), ext("e1", "s1", 15)];
const tray = [sk("s1", "XY", 0, rect(0, 0, 80, 50)), ext("e1", "s1", 20)];
const VERT = (x, y, z) => [[x, y, z], [-x, y, z], [x, -y, z], [-x, -y, z]];

export default [
  {
    id: "f-fillet",
    title: "Fillets",
    level: 3, time: 12, slug: "fillet_edges",
    tags: ["fillet", "edge selection"],
    tools: T,
    objective: "A 50 × 30 × 20 mm block is already modelled. Round its four vertical edges with a 6 mm radius. The top and bottom edges stay sharp.",
    lesson: `The timeline already holds a block. Your job is to finish it.

A **fillet** rounds an edge. On an outside edge it removes the sharp corner; on an inside corner it adds a smooth blend of material. Fillets are applied to **edges of the solid**, after the main shape exists.

### Applying a fillet
1. Click **Fillet**. The view switches to pick mode.
2. Click the edges to round. Each picked edge turns yellow; click it again to unpick.
3. Set the **Radius** in the properties panel.
4. Click **Done**.

Orbit the view to reach edges on the far side. Hovering highlights what a click would select.

### Why parts have fillets
- **Strength.** A sharp inside corner concentrates stress and is where cracks start. Even a small radius there makes a part noticeably tougher. This is the most important reason, and it applies to *inside* corners.
- **Handling.** Outside corners are rounded so the part is comfortable and safe to hold.
- **Manufacturing.** Milling cutters are round, so milled inside corners *must* have a radius; moulded parts need radii so plastic flows and the part releases.

### Radius limits
A fillet can't be bigger than the geometry allows. Two 6 mm fillets on a face 10 mm wide would overlap, and the kernel will report that the feature failed. When a fillet fails, try a smaller radius first.`,
    hints: ["Click Fillet, then click each of the four vertical edges. Orbit to reach the two at the back.", "Set Radius to 6. The timeline entry should say 4 picked.", "If you picked a wrong edge, click it again to remove it, or use Clear picks. Then click Done."],
    starter: block,
    target: [...block, fil("f1", 6, VERT(25, 15, 10))],
    debrief: `The fillet sits in the timeline after the extrude, as its own step. You can change its radius, or delete it, without touching the block.

**An alternative that gives the identical solid:** edit the sketch and give the rectangle a corner radius of 6, as you did for the adjustment plate. So which is right?

- A fillet **feature** is easy to find, suppress and change, and it can round edges no sketch could (edges created by other features meeting).
- A radius **in the sketch** keeps the timeline short and suits radii that are part of the profile's function.

A common professional rule: **put fillets last.** They're slow to compute, they depend on edges that earlier changes can destroy, and they clutter the model while you're still working out the main shape.

When you edit a model and a later fillet turns red, it's usually because the edge it referred to no longer exists. That's the famous *topological naming problem*; every CAD system has it to some degree, and picking again is the fix.`,
  },

  {
    id: "f-chamfer",
    title: "Chamfers",
    level: 3, time: 12, slug: "chamfer_face",
    tags: ["chamfer", "face selection"],
    tools: T,
    objective: "A 40 × 40 × 15 mm block with a ⌀12 through hole is already modelled. Add a 2 mm chamfer to every edge of its top face, including the rim of the hole.",
    lesson: `A **chamfer** is a fillet's flat cousin: it cuts an edge off at an angle instead of rounding it. A "2 mm chamfer" removes 2 mm along each face, leaving a 45° bevel.

### Where chamfers are used
- **Lead-ins.** A chamfer on a hole or the end of a pin guides parts together during assembly. Almost every hole that receives a screw or a shaft has one.
- **Deburring.** Machined edges are razor sharp; a small chamfer (0.5 mm is typical) makes them safe. Drawings often just say "break all sharp edges".
- **3D printing.** A chamfer prints cleanly where a fillet may not. More on that in the next track.

### Picking a whole face
The top face here has five edges: four straight ones and the circular rim of the hole. Rather than clicking each, **click the face itself**. Picking a face selects every edge around it, including the edges of any holes in it.

1. Click **Chamfer**.
2. Click the **top face** (it tints yellow).
3. Set **Distance** to 2 and click **Done**.

The hole's rim becomes a countersink-like cone, which is exactly the lead-in a screw wants.

### Fillet or chamfer?
| | Fillet | Chamfer |
|---|---|---|
| Shape | round | flat bevel |
| Best for | stress relief, comfort, moulded parts | lead-ins, deburring, printed overhangs |
| Machined with | a ball or radius cutter | a simple chamfer tool (cheaper) |`,
    hints: ["Click Chamfer, then click the top face of the block rather than individual edges.", "Set Distance to 2.", "The properties panel should say 1 picked. If you accidentally picked an edge or a side face, click it again to unpick."],
    starter: drilled,
    target: [...drilled, cham("c1", 2, [face(15, 15, 15)])],
    debrief: `One pick, five edges. Selecting by face is also more robust than selecting edges one at a time: if the block's outline changed to an octagon, a face pick would still catch every edge.

Look at the hole from the Front view: the top 2 mm is now a cone opening from ⌀12 to ⌀16. That's a **countersink**. With different numbers it would seat a flat-head screw flush with the surface.

**Chamfers on drawings** are written "2 × 45°" (distance and angle) or "C2". Unequal chamfers (2 × 4) and angles other than 45° exist for special cases; 45° is the default everywhere.

Fillets and chamfers are sometimes called **dress-up features**: they don't define the part's function, they finish it. That's one more reason they come last in the timeline.`,
  },

  {
    id: "f-shell",
    title: "Shell",
    level: 3, time: 15, slug: "shell_body",
    tags: ["shell", "wall thickness", "enclosure"],
    tools: T,
    objective: "Build an open-topped box, centred on the origin and sitting on the Top plane: 60 × 40 mm outside with 5 mm rounded vertical corners, 30 mm tall, with walls and a floor 2 mm thick.",
    lesson: `Most plastic products are thin walls around empty space: enclosures, bins, bottles, phone cases. **Shell** turns a solid into exactly that. You choose a wall thickness and which face to remove, and the feature hollows the body, leaving a uniform wall everywhere else.

### Using it
1. Model the **outside** shape as a solid: here a rounded rectangle 60 × 40 with corner radius 5, extruded 30.
2. Click **Shell**.
3. Click the **top face**: that's the opening.
4. Set **Wall thickness** to 2.

The walls grow **inward** from the outside surface, so the outside dimensions don't change. The inside becomes 56 × 36, with a floor 2 thick.

### Why not just cut a pocket?
You could sketch a 56 × 36 rounded rectangle and cut it 28 deep. That works for a simple box. Shell wins when the shape gets more complicated:
- the inside automatically follows the outside, corners and all;
- the wall is uniform by construction;
- changing the outside shape changes the inside to match.

Notice the inside corners here come out with a radius of 3: the outside 5 minus the wall 2. That's what "uniform wall" means, and it's what an injection-moulded or printed part wants.

### Uniform walls matter
In moulding, thick sections cool slowly and sink or warp. In printing, uneven walls waste time and material. "Keep the wall thickness constant" is one of the first rules of plastic part design, and Shell is the tool that enforces it.`,
    hints: ["Sketch a rectangle 60 × 40 at the origin with Corner radius 5, and extrude it 30.", "Click Shell, then click the top face of the block.", "Set Wall thickness to 2 and click Done."],
    target: [sk("s1", "XY", 0, rect(0, 0, 60, 40, 5)), ext("e1", "s1", 30), shell("h1", 2, face(0, 0, 30))],
    debrief: `Three features and you have the lower half of a project box.

You can remove more than one face. Pick the top **and** one side and you'd get a scoop; pick two opposite faces and you'd get a tube.

**When Shell fails,** it's nearly always because the wall is thicker than some feature of the part can take: a 3 mm wall can't follow an outside fillet of radius 2, because the inside radius would have to be negative. Reduce the wall or increase the radius.

Shelling is also why enclosures are designed **outside-in**: decide the outer form, shell it, then add the internal details (bosses, ribs, cutouts) afterwards. You'll do exactly that in the final capstone.`,
  },

  {
    id: "f-order",
    title: "Order Matters",
    level: 4, time: 20, slug: "fillet_then_shell",
    tags: ["feature order", "fillet", "shell"],
    tools: T,
    objective: "An 80 × 50 × 20 mm block is already modelled. Turn it into a smooth tray: round the four vertical edges with an 8 mm radius, then round all the edges of the bottom face with a 4 mm radius, then shell it to a 2 mm wall with the top open. The inside must follow the rounded outside.",
    lesson: `The same three features in a different order make a different part. This challenge is about choosing the order on purpose.

### Fillet first, then shell
If you **fillet and then shell**, the shell follows the rounded outside. The inside gets matching, smaller radii and the wall is 2 mm everywhere, around every curve. That's a proper tray.

If you **shell and then fillet**, the fillet only rounds the outside. The inside stays sharp, so the wall is thin at the corners and thick elsewhere, and the fillet may fail outright if its radius is bigger than the wall. That's almost never what you want.

### The sequence
1. **Fillet 1:** the four vertical edges, radius 8.
2. **Fillet 2:** the bottom edges, radius 4. After step 1 the bottom outline is eight edges (four straight, four curved), so click the **bottom face** to take them all at once. Orbit underneath to reach it, or use the Front view and tilt.
3. **Shell:** click the top face, wall thickness 2.

### Big radii before small ones
Doing the 8 mm vertical fillets before the 4 mm bottom fillet lets the bottom fillet run smoothly around the already rounded corners. The other way round, the kernel has to blend a large radius across a small one at each corner, which gives an awkward result or fails. As a rule: **larger fillets first, smaller ones after.**

### Rolling back
While you're editing a fillet or shell, the view shows the body **as it was just before that feature**, so you can pick its edges and faces. That's "rolling back the timeline", and every history-based CAD system does it.`,
    hints: ["Fillet the four vertical edges with radius 8 and click Done.", "Add a second Fillet: orbit to see the underside, click the bottom face, set radius 4.", "Add a Shell: click the top face, wall thickness 2. If your match is close but not exact, check the order in the timeline: both fillets must come before the shell."],
    starter: tray,
    target: [...tray, fil("f1", 8, VERT(40, 25, 10)), fil("f2", 4, [face(0, 0, 0)]), shell("h1", 2, face(0, 0, 20))],
    debrief: `Try it the wrong way to see the difference: delete the shell, add it again *before* the fillets (delete and re-add the fillets after it), and look inside. Sharp inside corners, uneven walls, and the status bar reports extra material.

**A sensible default order for most parts**
1. Main shape: the big extrudes and revolves.
2. Cuts, pockets and holes that define function.
3. Large fillets that are part of the form.
4. Shell.
5. Internal details added to the shelled body: bosses, ribs, cutouts.
6. Small cosmetic fillets and chamfers, last.

It isn't a law, but when a model misbehaves, comparing its timeline to that list often finds the cause.

You now have the complete basic toolkit of a parametric modeller. The next track applies it to parts that have to come out of a 3D printer working.`,
  },
];
