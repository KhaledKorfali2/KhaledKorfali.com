/* Slingshot levels. Every level is laid out on a 1000 × 600 field.

   start, target : [x, y]
   bodies        : { x, y, m, r }            a planet: m is its pull, r its radius
                   { ..., hole: true }       a black hole: r is the edge that swallows the probe
                   { m, r, orbit: { cx, cy, r, period, phase } }   a moon circling a point
   walls         : [x1, y1, x2, y2] barriers the probe can't cross (optional)
   stars         : three [x, y] points along a known winning path
   tip           : optional hint shown when the level opens

   As a guide, m = 3e6 is a small planet and 1e7 a very heavy one.

   Apart from the first, these layouts were found by a search that kept only
   levels where: no near-straight shot reaches the ring; switching off any one
   body breaks most of the winning shots; every wall changes the outcome; and
   the winning window is at least 4 degrees of aim wide across three or more
   power settings. After changing a level, run Slingshot.check(index) in the
   browser console to see how it measures up. */
window.SLINGSHOT_LEVELS = [
  { name: "First light", tip: "Drag to aim, then press Launch.",
    start: [150, 300], target: [850, 300], bodies: [], walls: [], stars: [[330, 300], [500, 300], [670, 300]] },
  { name: "Swing by", tip: "The planet is in the way. Aim to one side and let it curve you round.",
    start: [140, 300], target: [850, 300],
    bodies: [{ x: 553, y: 300, m: 5.5e6, r: 43 }],
    walls: [],
    stars: [[306, 358], [474, 403], [664, 398]] },
  { name: "Hidden", tip: "A black hole pulls much harder than a planet. Skim past it; don't visit.",
    start: [130, 300], target: [750, 300],
    bodies: [{ x: 582, y: 296, m: 8.6e6, r: 20, hole: true }],
    walls: [],
    stars: [[259, 361], [399, 412], [575, 431]] },
  { name: "The well",
    start: [130, 300], target: [870, 300],
    bodies: [{ x: 554, y: 290, m: 6.7e6, r: 20, hole: true }],
    walls: [],
    stars: [[296, 242], [469, 194], [668, 203]] },
  { name: "Moon", tip: "The moon starts moving the moment you launch.",
    start: [130, 300], target: [860, 300],
    bodies: [{ x: 559, y: 318, m: 3.0e6, r: 38 },
      { m: 4.6e6, r: 18, orbit: { cx: 559, cy: 318, r: 101, period: 4.5, phase: 4.06 } }],
    walls: [],
    stars: [[278, 251], [437, 206], [652, 193]] },
  { name: "Bend", tip: "The red barrier blocks the straight path. Dip under it and let the planet pull you back up.",
    start: [150, 230], target: [850, 230],
    bodies: [{ x: 606, y: 368, m: 15.4e6, r: 57 }],
    walls: [[500, -30, 500, 300]],
    stars: [[281, 330], [438, 425], [679, 438]] },
  { name: "Needle",
    start: [120, 300], target: [880, 184],
    bodies: [{ x: 541, y: 180, m: 4.3e6, r: 41 },
      { x: 462, y: 428, m: 5.4e6, r: 43 }],
    walls: [[380, -30, 380, 140], [380, 460, 380, 630]],
    stars: [[294, 278], [475, 267], [668, 234]] },
  { name: "Keyhole",
    start: [130, 130], target: [880, 470],
    bodies: [{ x: 513, y: 373, m: 3.3e6, r: 38 },
      { x: 813, y: 330, m: 5.5e6, r: 43 }],
    walls: [[620, -30, 620, 240], [620, 360, 620, 630]],
    stars: [[300, 183], [470, 241], [648, 336]] },
  { name: "Binary",
    start: [120, 480], target: [880, 120],
    bodies: [{ x: 473, y: 284, m: 5.2e6, r: 20, hole: true },
      { x: 536, y: 357, m: 7.1e6, r: 20, hole: true }],
    walls: [[500, -30, 500, 150], [500, 450, 500, 630]],
    stars: [[269, 417], [434, 347], [684, 209]] },
  { name: "Double swing",
    start: [120, 300], target: [880, 300],
    bodies: [{ x: 386, y: 315, m: 5.7e6, r: 43 },
      { x: 620, y: 288, m: 5.4e6, r: 43 }],
    walls: [],
    stars: [[291, 222], [477, 185], [670, 199]] },
  { name: "Clockwork",
    start: [130, 300], target: [870, 300],
    bodies: [{ x: 492, y: 303, m: 4.9e6, r: 42 },
      { m: 3.2e6, r: 17, orbit: { cx: 492, cy: 303, r: 129, period: 3.6, phase: 2.33 } },
      { m: 5.3e6, r: 20, orbit: { cx: 492, cy: 303, r: 200, period: 9.8, phase: 0.53 } }],
    walls: [],
    stars: [[209, 168], [327, 107], [711, 171]] },
  { name: "Three bodies",
    start: [120, 470], target: [880, 130],
    bodies: [{ x: 379, y: 332, m: 3.3e6, r: 38 },
      { x: 560, y: 285, m: 5.4e6, r: 20, hole: true },
      { x: 691, y: 300, m: 6.1e6, r: 44 }],
    walls: [],
    stars: [[255, 319], [424, 194], [627, 123]] }
];
