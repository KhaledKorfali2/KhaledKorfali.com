// The practice database: "Tidewater Outfitters", a small outdoor-gear shop.
// Generated from the learner's seed, so every learner has different rows (and
// therefore different answers) but the same shape. Written as MySQL statements
// and loaded through the same dialect layer the learner types into.
import { helpers, rngFrom } from "../flags.js";

const FIRST = ["Ava", "Ben", "Chloe", "Dev", "Elif", "Farid", "Grace", "Hugo", "Ines", "Jonas", "Kira", "Liam", "Maya", "Noor", "Omar", "Priya", "Quinn", "Rosa", "Sami", "Tess", "Uma", "Viktor", "Wren", "Yusuf", "Zoe", "Aiko", "Bruno", "Carla", "Dmitri", "Esme", "Felix", "Greta", "Hana", "Ivan", "Jade", "Kofi", "Lena", "Mateo", "Nia", "Oscar"];
const LAST = ["Adams", "Baker", "Castro", "Dubois", "Evans", "Fischer", "Garcia", "Hoffman", "Ito", "Jensen", "Kim", "Lopez", "Meyer", "Nakamura", "Oliveira", "Patel", "Quinn", "Rossi", "Santos", "Tanaka", "Ueda", "Vargas", "Weber", "Xu", "Young", "Zimmer", "Almeida", "Brooks", "Chen", "Diaz", "Ellis", "Ferreira", "Gray", "Hayes", "Ivanov", "Jones", "Keller", "Lima", "Moreau", "Novak"];
// Exact customer counts per country, so HAVING thresholds behave the same for everyone.
const PLACES = [
  ["United States", 26, ["Seattle", "Denver", "Portland"]],
  ["Canada", 18, ["Vancouver", "Calgary"]],
  ["Germany", 14, ["Munich", "Hamburg"]],
  ["Japan", 10, ["Sapporo", "Nagano"]],
  ["Brazil", 7, ["Curitiba"]],
  ["Portugal", 5, ["Porto", "Lisbon"]],
];
const DOMAINS = ["example.com", "example.com", "example.com", "example.com", "example.com", "mail.test", "mail.test", "mail.test", "corp.test", "inbox.test"];
export const CATEGORIES = ["Tents", "Footwear", "Climbing", "Packs", "Apparel", "Cooking"];
const PRODUCTS = [
  [["Ridgeline 2P Tent", "Basecamp 4P Tent", "Solo Bivy Shelter", "Ultralight Tarp", "Family Dome 6P", "Tent Footprint"], 49, 649],
  [["Trail Runner GTX", "Alpine Boot", "Camp Sandal", "Approach Shoe", "Wool Hiking Sock", "Gaiter Pair"], 14, 289],
  [["Locking Carabiner", "Dynamic Rope 60m", "Climbing Harness", "Chalk Bag", "Belay Device", "Climbing Helmet"], 9, 239],
  [["Daypack 22L", "Trek Pack 55L", "Expedition Pack 80L", "Hip Pack", "Dry Bag 20L", "Pack Rain Cover"], 19, 349],
  [["Down Jacket", "Rain Shell", "Merino Base Layer", "Trail Shorts", "Fleece Beanie", "Sun Hoodie"], 16, 329],
  [["Canister Stove", "Titanium Pot", "Spork Set", "Water Filter", "Insulated Mug", "Camp Coffee Press"], 7, 129],
];
const STAFF = [
  ["Chief Executive", "Executive", null, 185000],
  ["Head of Sales", "Sales", 1, 124000], ["Head of Support", "Support", 1, 98000], ["Head of Engineering", "Engineering", 1, 152000],
  ["Account Manager", "Sales", 2, 71000], ["Account Manager", "Sales", 2, 68000], ["Sales Associate", "Sales", 2, 52000],
  ["Support Specialist", "Support", 3, 49000], ["Support Specialist", "Support", 3, 51000], ["Returns Coordinator", "Support", 3, 47000],
  ["Backend Engineer", "Engineering", 4, 118000], ["Data Analyst", "Engineering", 4, 94000], ["Frontend Engineer", "Engineering", 4, 109000], ["Site Reliability Engineer", "Engineering", 4, 126000],
];

const two = (n) => String(n).padStart(2, "0");
const DAY = 864e5;
const iso = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`; };
const T = (y, m, d) => Date.UTC(y, m - 1, d);
const q = (v) => (v == null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const insert = (table, cols, rows, size = 60) => {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(`INSERT INTO ${table} (${cols}) VALUES\n${rows.slice(i, i + size).map((r) => `(${r.map(q).join(", ")})`).join(",\n")}`);
  return out;
};

export const SCHEMA = [
  `CREATE TABLE customers (
  customer_id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  phone VARCHAR(20),
  city VARCHAR(60) NOT NULL,
  country VARCHAR(40) NOT NULL,
  signup_date DATE NOT NULL
)`,
  `CREATE TABLE categories (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(40) NOT NULL UNIQUE
)`,
  `CREATE TABLE products (
  product_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  category_id INT NOT NULL,
  price DECIMAL(8,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  discontinued TINYINT NOT NULL DEFAULT 0,
  FOREIGN KEY (category_id) REFERENCES categories (category_id)
)`,
  `CREATE TABLE employees (
  employee_id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  title VARCHAR(60) NOT NULL,
  department VARCHAR(40) NOT NULL,
  manager_id INT,
  salary DECIMAL(10,2) NOT NULL,
  hire_date DATE NOT NULL,
  FOREIGN KEY (manager_id) REFERENCES employees (employee_id)
)`,
  `CREATE TABLE orders (
  order_id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  order_date DATE NOT NULL,
  status ENUM('pending','paid','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending',
  shipped_date DATE,
  FOREIGN KEY (customer_id) REFERENCES customers (customer_id)
)`,
  `CREATE TABLE order_items (
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(8,2) NOT NULL,
  PRIMARY KEY (order_id, product_id),
  FOREIGN KEY (order_id) REFERENCES orders (order_id),
  FOREIGN KEY (product_id) REFERENCES products (product_id)
)`,
];

/** → array of MySQL statements that build and fill the shop database. */
export function buildShop(seed) {
  const h = helpers(rngFrom(`${seed}|shop`));
  const { rng, int, pick, shuffle } = h;

  // customers 1..80; ids 73..80 never order; 61..80 are recent sign-ups
  const places = shuffle(PLACES.flatMap(([country, n, cities]) => Array.from({ length: n }, () => [country, pick(cities)])));
  const customers = [];
  for (let id = 1; id <= 80; id++) {
    const first = pick(FIRST), last = pick(LAST);
    let domain = pick(DOMAINS), phone = rng() < 0.28 ? null : `+${int(1, 81)} ${int(200, 989)} ${int(100, 999)} ${int(1000, 9999)}`;
    if (id === 5 || id === 17 || id === 44) { domain = "corp.test"; phone = null; }
    if (id === 9) { domain = "corp.test"; phone = phone || "+1 206 555 0142"; }
    const signup = id <= 60 ? T(2023, 1, 1) + int(0, 360) * DAY : id < 70 ? T(2024, 6, 1) + int(0, 200) * DAY : T(2025, 1, 2) + int(0, 140) * DAY;
    customers.push([first, last, `${first}.${last}${id}@${domain}`.toLowerCase(), phone, places[id - 1][1], places[id - 1][0], iso(signup), signup]);
  }

  // products: 6 per category, globally unique prices; the last two are never ordered
  const used = new Set();
  const products = [];
  PRODUCTS.forEach(([names, lo, hi], ci) => names.forEach((name, k) => {
    let price;
    do { price = Math.round(lo + ((hi - lo) * (k + rng())) / names.length) + pick([0.99, 0.49, 0.95, 0.5]); if (k === 5) price = Math.round(lo + rng() * 12) + pick([0.99, 0.49, 0.95]); } while (used.has(price));
    used.add(price);
    products.push([name, ci + 1, price, rng() < 0.12 ? 0 : int(3, 140), 0]);
  }));
  shuffle([2, 9, 15, 20, 27, 31]).slice(0, 4).forEach((i) => { products[i][4] = 1; });
  const orderable = products.map((_, i) => i + 1).filter((id) => id !== 12 && id !== 30);

  const employees = STAFF.map(([title, dept, mgr, base], i) => [pick(FIRST), pick(LAST), title, dept, mgr, base + int(-4, 4) * 500, iso(T(2016, 1, 1) + (i ? int(400, 3200) : 0) * DAY)]);

  // orders: every month from 2024-01 to 2025-06 is populated; a few customers order a lot
  const START = T(2024, 1, 5), END = T(2025, 6, 28);
  const orders = [], items = [];
  const STATUS = ["delivered", "delivered", "delivered", "delivered", "delivered", "delivered", "delivered", "delivered", "delivered", "delivered", "delivered", "shipped", "shipped", "paid", "paid", "pending", "pending", "cancelled", "cancelled", "cancelled"];
  for (let i = 0; i < 264; i++) {
    const cust = i < 72 ? i + 1 : 1 + Math.floor(72 * rng() ** 2.2);
    const lo = Math.max(START, customers[cust - 1][7]);
    let date = i < 18 ? T(2024 + Math.floor(i / 12), (i % 12) + 1, int(6, 26)) : lo + Math.floor(rng() * ((END - lo) / DAY)) * DAY;
    if (date < lo) date = lo + int(1, 20) * DAY;
    let status = pick(STATUS);
    if (i >= 20 && i < 26) { status = "cancelled"; date = T(2024, int(1, 6), int(6, 26)); if (date < lo) date = lo; }
    if (date > T(2025, 6, 1) && status === "delivered" && rng() < 0.6) status = pick(["pending", "paid", "shipped"]);
    if (date < T(2025, 3, 1) && (status === "pending" || status === "paid") && rng() < 0.8) status = "delivered";
    const shipped = status === "shipped" || status === "delivered" ? iso(date + int(1, 6) * DAY) : null;
    orders.push([cust, iso(date), status, shipped, date]);
  }
  orders.sort((a, b) => a[4] - b[4]);
  orders.forEach((o, i) => {
    shuffle(orderable).slice(0, pick([1, 1, 2, 2, 2, 3, 3, 4])).forEach((pid) => items.push([i + 1, pid, pick([1, 1, 1, 1, 2, 2, 3, 5]), products[pid - 1][2]]));
  });

  return [
    ...SCHEMA,
    ...insert("categories", "name", CATEGORIES.map((c) => [c])),
    ...insert("customers", "first_name, last_name, email, phone, city, country, signup_date", customers.map((c) => c.slice(0, 7))),
    ...insert("products", "name, category_id, price, stock, discontinued", products),
    ...insert("employees", "first_name, last_name, title, department, manager_id, salary, hire_date", employees),
    ...insert("orders", "customer_id, order_date, status, shipped_date", orders.map((o) => o.slice(0, 4))),
    ...insert("order_items", "order_id, product_id, quantity, unit_price", items),
  ];
}
