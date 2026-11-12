// A toy embedding model for the vector course. Real embedding models are neural
// networks producing hundreds or thousands of dimensions; this one is a
// hand-built 16-dimension concept map, which is enough to make semantic search,
// distance metrics and indexes behave realistically, and small enough to read.
// The lessons say so plainly.

export const DIMS = 16;
const AXES = ["shelter", "feet", "climb", "carry", "wear", "cook", "warm", "dry", "light", "water", "safe", "group", "fire", "rest", "sun", "small"];
const A = Object.fromEntries(AXES.map((a, i) => [a, i]));

// word → { axis: weight }
const W = {};
const add = (words, weights) => words.split(" ").forEach((w) => { W[w] = { ...(W[w] || {}), ...weights }; });
add("tent shelter tarp bivy dome footprint canopy", { shelter: 1, rest: 0.4 });
add("sleep sleeping night overnight camp camping basecamp", { shelter: 0.6, rest: 0.8 });
add("boot shoe sandal sock gaiter runner footwear", { feet: 1, wear: 0.3 });
add("feet foot ankle toe heel walk walking hike hiking trail", { feet: 0.8 });
add("climb climbing rope harness carabiner belay chalk rock cliff wall crag", { climb: 1 });
add("fall falling protect protection helmet secure", { safe: 1, climb: 0.3 });
add("safety safe", { safe: 1 });
add("pack backpack daypack bag sack cover", { carry: 1 });
add("carry carrying haul load storage store gear stuff", { carry: 0.8 });
add("jacket shell layer shorts beanie hoodie apparel clothing clothes garment", { wear: 1 });
add("wear wearing dress dressed", { wear: 0.9 });
add("stove pot spork mug press coffee cook cooking kitchen meal food eat dinner breakfast", { cook: 1 });
add("boil boiling hot heat flame fire burner fuel", { fire: 1, cook: 0.4 });
add("warm warmth cold winter freezing snow insulated insulation down fleece merino wool chilly frost", { warm: 1 });
add("waterproof rain rainy wet dry storm weatherproof gtx seam splash drizzle downpour", { dry: 1 });
add("light lightweight ultralight fast minimal gram grams compact packable small", { light: 1 });
add("water drink drinking hydration filter stream river thirsty bottle clean purify", { water: 1 });
add("family group kids children friends people large big roomy spacious six four", { group: 1 });
add("solo alone one single", { light: 0.5, small: 0.4 });
add("comfort comfortable relax relaxing cosy cozy soft lounge", { rest: 1 });
add("sun sunny summer shade uv beach desert hot", { sun: 1 });
add("accessory spare repair clip strap small tiny", { small: 1 });
add("expedition alpine mountain summit glacier", { warm: 0.5, climb: 0.5, safe: 0.3 });
add("return refund exchange warranty broken damaged defect", { safe: 0.2, small: 0.2 });
add("ship shipping delivery deliver order tracking arrive", { carry: 0.5, small: 0.3 });
add("wash washing care clean cleaning maintain", { water: 0.4, wear: 0.5 });
add("size sizing fit fitting measure", { wear: 0.6, feet: 0.4 });

const stem = (w) => (W[w] ? w : W[w.replace(/s$/, "")] ? w.replace(/s$/, "") : W[w.replace(/ing$/, "")] ? w.replace(/ing$/, "") : w);
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Text → unit-length vector of DIMS numbers. Deterministic. */
export function embed(text) {
  const v = new Array(DIMS).fill(0);
  for (const raw of String(text).toLowerCase().match(/[a-z]+/g) || []) {
    const w = stem(raw);
    if (W[w]) for (const [axis, weight] of Object.entries(W[w])) v[A[axis]] += weight;
    else if (raw.length > 3) { const h = hash(raw); v[h % DIMS] += 0.12; v[(h >>> 8) % DIMS] -= 0.06; }   // unknown words: a faint, stable fingerprint
  }
  const len = Math.hypot(...v) || 1;
  return v.map((x) => Math.round((x / len) * 1e4) / 1e4);
}
export const vecLiteral = (v) => `'[${v.join(",")}]'`;

/** Replace embed('some text') in SQL with the vector literal, so the console can offer an embed() "function". */
export function embedInSql(sql) {
  return sql.replace(/\bembed\s*\(\s*'((?:[^']|'')*)'\s*\)/gi, (_, t) => `${vecLiteral(embed(t.replace(/''/g, "'")))}::vector`);
}

// One line of catalogue copy per product (names match data/shop.js).
export const PRODUCT_COPY = {
  "Ridgeline 2P Tent": "Two person tent for backpacking trips, a light shelter that sleeps two.",
  "Basecamp 4P Tent": "Roomy four person tent for family camping, a comfortable shelter for a group.",
  "Solo Bivy Shelter": "Minimal solo bivy shelter for one person sleeping out, ultralight and compact.",
  "Ultralight Tarp": "Ultralight tarp shelter that keeps rain off your camp, packable and fast to pitch.",
  "Family Dome 6P": "Large dome tent that sleeps six people, spacious shelter for family and friends.",
  "Tent Footprint": "Footprint that goes under a tent to keep the floor dry, a small accessory.",
  "Trail Runner GTX": "Waterproof trail running shoe that keeps feet dry on wet trails, light and fast.",
  "Alpine Boot": "Insulated alpine boot for cold mountain hiking, warm protection for feet in snow.",
  "Camp Sandal": "Comfortable sandal to wear around camp in summer, relax your feet after a hike.",
  "Approach Shoe": "Approach shoe for the walk to the crag, a hiking shoe that can climb rock.",
  "Wool Hiking Sock": "Merino wool hiking sock, warm and soft for feet on a long trail.",
  "Gaiter Pair": "Waterproof gaiters that keep snow and rain out of your boot.",
  "Locking Carabiner": "Locking carabiner to secure a climbing rope, small and safe.",
  "Dynamic Rope 60m": "Dynamic climbing rope that protects a falling climber on rock.",
  "Climbing Harness": "Comfortable climbing harness for rock and wall climbing.",
  "Chalk Bag": "Chalk bag for climbing, a small accessory for dry hands on rock.",
  "Belay Device": "Belay device to secure your partner on a climbing rope, safety gear.",
  "Climbing Helmet": "Climbing helmet for protection from falling rock, light safety gear.",
  "Daypack 22L": "Light daypack to carry gear for a day hike.",
  "Trek Pack 55L": "Backpack to carry your load on overnight hiking trips.",
  "Expedition Pack 80L": "Big expedition backpack to haul a large load into the mountain.",
  "Hip Pack": "Small hip pack to carry a few things on a fast walk.",
  "Dry Bag 20L": "Waterproof dry bag that keeps gear dry in rain or on the river.",
  "Pack Rain Cover": "Rain cover that keeps your backpack dry in a storm, a compact accessory.",
  "Down Jacket": "Warm down jacket for cold winter days, insulated and packable.",
  "Rain Shell": "Waterproof rain shell jacket to wear in a storm, light and packable.",
  "Merino Base Layer": "Merino wool base layer to wear next to skin, warm in the cold.",
  "Trail Shorts": "Light shorts to wear hiking in summer sun.",
  "Fleece Beanie": "Soft fleece beanie that keeps your head warm on a cold night.",
  "Sun Hoodie": "Light hoodie to wear for sun protection on hot summer days.",
  "Canister Stove": "Compact stove with a fast burner to boil water and cook a meal.",
  "Titanium Pot": "Ultralight titanium pot for cooking dinner and boiling water at camp.",
  "Spork Set": "Small spork set to eat a meal at camp, light kitchen accessory.",
  "Water Filter": "Water filter to make clean drinking water from a stream or river.",
  "Insulated Mug": "Insulated mug that keeps coffee hot and warm at a cold camp.",
  "Camp Coffee Press": "Coffee press for a hot breakfast drink in the camp kitchen.",
};

// Help-centre passages, for the retrieval lesson.
export const ARTICLES = [
  ["Returns", "You can return unused gear within 30 days for a full refund.", "returns"],
  ["Returns", "Damaged or broken items are covered by a two year warranty and can be exchanged.", "returns"],
  ["Shipping", "Standard shipping delivers your order in three to five days with tracking.", "shipping"],
  ["Shipping", "Large items such as a family tent ship separately and may arrive later.", "shipping"],
  ["Boot care", "Clean wet boots with water and let them dry away from heat or fire.", "care"],
  ["Boot sizing", "For hiking boots, measure your feet in the afternoon and fit with a hiking sock.", "sizing"],
  ["Tent care", "Dry your tent fully after rain before you store it, or the shelter will mildew.", "care"],
  ["Tent pitching", "Pitch a tarp or tent with its back to the storm to stay dry at camp.", "howto"],
  ["Down care", "Wash a down jacket gently and tumble dry so the insulation stays warm.", "care"],
  ["Layering", "In cold winter weather wear a merino base layer under an insulated jacket.", "howto"],
  ["Rope care", "Inspect your climbing rope before each climb and retire it after a hard fall.", "care"],
  ["Climbing safety", "Always wear a helmet and check your harness and belay device before you climb.", "howto"],
  ["Stove safety", "Never cook with a stove inside a tent; the flame and fuel are a fire risk.", "howto"],
  ["Water", "Filter water from a stream or river before drinking, even if it looks clean.", "howto"],
  ["Pack fitting", "Fit a backpack so the load sits on your hips, and measure your back for size.", "sizing"],
  ["Sun", "On hot summer days wear a sun hoodie and drink water often.", "howto"],
  ["Gift cards", "Gift cards are sent by email and never expire.", "orders"],
  ["Order changes", "You can change or cancel an order until it ships; after that, use a return.", "orders"],
];
