// Reference page content (markdown-lite; ~code~ and ~~~ fences, see ui.js).

export const REFERENCE = `### The workflow
1. **Plan:** where is the origin, what is symmetric, which view shows the main shape?
2. **Sketch** a closed profile on a plane and fully define it.
3. **Feature:** extrude or revolve it to add material, or cut with it.
4. Repeat for each detail, then **finish** with fillets, chamfers and shells.
5. **Check** against the drawing, then export.

### Vocabulary
| Term | Meaning |
|---|---|
| Sketch | a 2D drawing on a plane |
| Profile | a closed outline in a sketch that a feature can use |
| Feature | one operation in the model: extrude, revolve, fillet… |
| Body / solid | the 3D result |
| Timeline / feature tree | the ordered list of features; edit any step and later ones rebuild |
| Parametric | driven by numbers you can change later |
| Datum | a fixed reference: the origin, an axis, a base plane |
| Design intent | how the model should behave when a dimension changes |
| Fully defined | nothing in the sketch can still move |

### Planes and axes
| Plane | Sketch axes | Extrudes along |
|---|---|---|
| Top (XY) | X, Y | Z |
| Front (XZ) | X, Z | Y |
| Right (YZ) | Y, Z | X |

### Features in this workbench
| Feature | Does | Key settings |
|---|---|---|
| Extrude | pulls a profile straight out | distance, flip, symmetric, join / cut / intersect |
| Revolve | spins a profile around a sketch axis | axis, angle |
| Mirror | copies the body across a base plane and joins it | plane |
| Fillet | rounds edges | radius, picked edges or faces |
| Chamfer | bevels edges at 45° | distance, picked edges or faces |
| Shell | hollows the body to a uniform wall | thickness, faces to open |

### Sketch rules
- Shapes fully **inside** another shape are holes; shapes that only **overlap** merge.
- A revolve profile must stay on one side of the axis.
- Sizes are diameters (⌀) for circles; revolve profiles are drawn in radii.
- Patterns repeat one shape: **grid** (rows and columns) or **circular** (around a point).

### Drawing callouts
| Callout | Meaning |
|---|---|
| ⌀12 | diameter 12 |
| R6 | radius 6 |
| 4 × ⌀6 | four holes of diameter 6 |
| 6 × ⌀8 EQ SP ON 60 PCD | six holes equally spaced on a 60 mm pitch circle |
| 17 AF | 17 across flats (spanner size) |
| 2 × 45° or C2 | 2 mm chamfer at 45° |
| THRU | goes all the way through |
| ±0.1 | allowed variation (tolerance) |

### A sensible feature order
Main shape → functional cuts and holes → large fillets → shell → internal details → small fillets and chamfers.`;

export const PRINTING = `These are starting values for a typical FDM printer with a 0.4 mm nozzle and 0.2 mm layers. Print a tolerance test on your own machine and adjust.

| Topic | Rule of thumb |
|---|---|
| Wall thickness | a multiple of the nozzle width; at least 0.8 mm, 1.2 to 2.4 mm for sturdy parts |
| Screw clearance hole | screw diameter + 0.4 mm |
| Close sliding fit | 0.2 mm on the diameter |
| Press fit | 0 to 0.1 mm |
| Captive nut pocket | across flats + 0.4 mm, depth = nut thickness + 0.2 mm |
| Overhangs | up to about 45° from vertical without supports |
| Bridges | about 20 to 40 mm without support |
| Edges on the bed | chamfer them (0.5 to 1 mm); don't fillet them |
| Edges facing up | fillets are fine |
| Horizontal holes | fine up to about ⌀6; larger ones as a teardrop |
| Strength | run the layers along the load, not across it |
| Smallest reliable detail | about 2 nozzle widths (0.8 mm) |

### Common fastener sizes (metric)
| Thread | Clearance hole (printed) | Nut across flats | Nut thickness | Self-tap pilot |
|---|---|---|---|---|
| M3 | 3.4 | 5.5 | 2.4 | 2.5 to 2.8 |
| M4 | 4.4 | 7 | 3.2 | 3.4 |
| M5 | 5.4 | 8 | 4 | 4.3 |
| M6 | 6.4 | 10 | 5 | 5.2 |
| M8 | 8.4 | 13 | 6.5 | 7 |

### Files
- **STL:** triangles, no units (assumed mm). What slicers read. Not editable in CAD.
- **3MF:** a modern replacement for STL with units and colour.
- **STEP:** exact geometry for exchanging designs between CAD systems and for machine shops.`;

export const SANDBOX = `Datum's workbench runs on **OpenCascade**, the open-source geometry kernel that FreeCAD is built on, compiled to WebAssembly and driven through the replicad library. The solids are exact (not triangle meshes), fillets, chamfers and shells are the real operations, and the STL and STEP files it exports are genuine.

What it leaves out is interface, not geometry. A professional package adds a great deal on top, and you should know what you'll meet when you move to one:

| Topic | In this workbench | In Fusion 360, Onshape, SolidWorks, FreeCAD |
|---|---|---|
| Defining a sketch | you type each shape's size and position | **constraints** (coincident, parallel, tangent, equal…) plus **dimensions**; a solver positions everything, and sketches can be under- or over-defined |
| Sketch entities | rectangle, circle, polygon, slot, straight-line profile | also arcs, splines, ellipses, construction lines, trim, offset, projected edges |
| Sketch planes | the three base planes, with an offset | any planar **face** of the part, plus angled and tangent construction planes |
| Regions | nested shapes subtract, overlapping shapes merge | you click exactly which regions to use |
| Extrude extent | a distance | also to a face, to the next surface, through all, with taper |
| Mirror and pattern | mirror the whole body; patterns inside sketches | mirror and pattern individual features or bodies, in 3D |
| Other features | not available | sweep, loft, draft, rib, thread, hole wizard, boundary surfaces |
| Edge picks | remembered by position; a pick can be lost if the body changes underneath it | similar problem ("topological naming"), handled with more sophistication |
| Bodies | one body per part | multiple bodies, **assemblies** with joints, interference checks |
| Drawings | automatic three views of the target, overall sizes only | full 2D drawings with dimensions, tolerances, sections and title blocks |
| Checking | the target is known, so your part is compared with it by volume | nobody tells you the part is right; you check it against requirements |

The thinking transfers completely: planes, profiles, features, order, design intent and design for manufacture are the same everywhere. Expect a few days of learning where the buttons are, and budget real time for constraints, which are the one substantial skill this workbench doesn't exercise.

### Where to go next
- **Onshape** (free for public/hobby use, runs in a browser) and **FreeCAD** (free, open source) cost nothing to start.
- **Fusion 360** has a free personal-use licence and is very common among makers.
- **SolidWorks** and **Inventor** are widespread in industry.

Rebuild the capstone enclosure in one of them as your first project.

### Credits
OpenCascade Technology (LGPL-2.1), replicad (MIT) and three.js (MIT). Licence texts are in the project's vendor folder.`;
