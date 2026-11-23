/* Babel: every 1,000-character page over a 29-symbol alphabet, addressed by a
   reversible mapping between "where it is" and "what it says". Nothing is
   stored: an address is turned into a page (and a page into its address) with
   modular arithmetic on integers of about 4,860 bits. */
(function () {
  "use strict";

  if (typeof BigInt !== "function") {
    document.getElementById("found").textContent = "This browser is too old to do the arithmetic the library needs.";
    return;
  }

  const ALPHABET = "abcdefghijklmnopqrstuvwxyz ,.";
  const BASE = 29n, COLS = 40, ROWS = 25, LEN = COLS * ROWS;
  const M = BASE ** BigInt(LEN);                 // number of pages in the library
  const PAGES = 410n, BOOKS = 32n, SHELVES = 5n, WALLS = 4n;

  /* ── Digits ── */
  // BigInt → LEN base-29 digits, most significant first. toString(29) happens to
  // use 0-9 then a-s as its digit characters.
  function toDigits(n) {
    const s = n.toString(29).padStart(LEN, "0"), d = new Uint8Array(LEN);
    for (let i = 0; i < LEN; i++) { const c = s.charCodeAt(i); d[i] = c < 58 ? c - 48 : c - 87; }
    return d;
  }
  function fromDigits(d) {
    // Build in 8-digit chunks so most of the work stays in ordinary numbers.
    let n = 0n;
    const chunk = BASE ** 8n;
    for (let i = 0; i < LEN; i += 8) {
      let part = 0;
      for (let j = 0; j < 8; j++) part = part * 29 + d[i + j];
      n = n * chunk + BigInt(part);
    }
    return n;
  }

  /* ── The reversible scramble ── */
  // Two fixed multipliers, written out as base-29 digits by a tiny generator.
  // Any number not divisible by 29 has an inverse modulo 29^LEN.
  function constant(seed) {
    const d = new Uint8Array(LEN);
    let x = seed >>> 0;
    for (let i = 0; i < LEN; i++) {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      d[i] = (x >>> 8) % 29;
    }
    if (d[0] === 0) d[0] = 7;
    if (d[LEN - 1] === 0) d[LEN - 1] = 11;
    return fromDigits(d);
  }
  function inverse(a, m) {
    let r0 = m, r1 = a, t0 = 0n, t1 = 1n;
    while (r1 !== 0n) {
      const q = r0 / r1;
      [r0, r1] = [r1, r0 - q * r1];
      [t0, t1] = [t1, t0 - q * t1];
    }
    return ((t0 % m) + m) % m;
  }
  const C1 = constant(0xB0B3), C2 = constant(0x1941), C3 = constant(0xBAB31);
  const C1inv = inverse(C1, M), C2inv = inverse(C2, M);

  // address → page: multiply, write the digits backwards, multiply again.
  // The reversal makes every digit of the address affect every character.
  function pageAt(address) {
    const mixed = fromDigits(toDigits(address * C1 % M).reverse());
    return toDigits((mixed * C2 + C3) % M);
  }
  // page → address: the same three steps, undone in reverse order.
  function addressOf(digits) {
    const mixed = ((fromDigits(digits) - C3) % M + M) % M * C2inv % M;
    return fromDigits(toDigits(mixed).reverse()) * C1inv % M;
  }

  /* ── Text ── */
  function normalise(text) {
    return text.toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[!?;:]/g, ".")
      .replace(/[^a-z ,.]+/g, " ")
      .replace(/ +/g, " ").trim();
  }
  function randomDigit() { return Math.floor(Math.random() * 29); }

  // Lay text out on a page. Returns the digits and which cells hold the text.
  function compose(text, mode) {
    const d = new Uint8Array(LEN), marks = new Uint8Array(LEN);
    if (mode === "buried") {
      for (let i = 0; i < LEN; i++) d[i] = randomDigit();
      const start = Math.floor(Math.random() * (LEN - text.length + 1));
      for (let i = 0; i < text.length; i++) { d[start + i] = ALPHABET.indexOf(text[i]); marks[start + i] = 1; }
      return { digits: d, marks: marks };
    }
    // Alone: word-wrap onto an otherwise blank page.
    d.fill(26);
    const lines = [];
    let cur = "";
    for (let w of text.split(" ")) {
      while (w.length > COLS) {
        if (cur) { lines.push(cur); cur = ""; }
        lines.push(w.slice(0, COLS)); w = w.slice(COLS);
      }
      if (cur && cur.length + 1 + w.length > COLS) { lines.push(cur); cur = w; }
      else cur = cur ? cur + " " + w : w;
    }
    if (cur) lines.push(cur);
    lines.length = Math.min(lines.length, ROWS);
    const top = Math.max(0, Math.min(3, Math.floor((ROWS - lines.length) / 2)));
    lines.forEach(function (line, r) {
      for (let c = 0; c < line.length; c++) {
        const i = (top + r) * COLS + c;
        d[i] = ALPHABET.indexOf(line[c]); marks[i] = 1;
      }
    });
    return { digits: d, marks: marks };
  }

  /* ── View ── */
  const $ = function (id) { return document.getElementById(id); };
  const pageEl = $("page"), roomEl = $("room"), roomToggle = $("roomToggle");
  let current = 0n, roomText = "", roomOpen = false;
  let lastFound = null;     // { address, marks } of the latest search, so its highlight survives browsing

  function renderPage(digits, marks) {
    let html = "";
    for (let r = 0; r < ROWS; r++) {
      let open = false;
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c, m = marks && marks[i];
        if (m && !open) { html += "<mark>"; open = true; }
        if (!m && open) { html += "</mark>"; open = false; }
        html += ALPHABET[digits[i]];
      }
      if (open) html += "</mark>";
      if (r < ROWS - 1) html += "\n";
    }
    pageEl.innerHTML = html;
  }

  function renderRoom() {
    const n = roomText.length;
    if (roomOpen || n <= 28) roomEl.textContent = roomText;
    else roomEl.textContent = roomText.slice(0, 14) + " … " + roomText.slice(-8);
    roomEl.classList.toggle("open", roomOpen);
    roomToggle.hidden = n <= 28;
    roomToggle.textContent = roomOpen ? "Show less" : "Show all " + n.toLocaleString() + " characters";
    roomToggle.setAttribute("aria-expanded", roomOpen);
  }

  function encodeAddress(n) {
    let hex = n.toString(16);
    if (hex.length % 2) hex = "0" + hex;
    let bin = "";
    for (let i = 0; i < hex.length; i += 2) bin += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeAddress(code) {
    try {
      const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
      let hex = "";
      for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
      const n = BigInt("0x" + (hex || "0"));
      return n < M ? n : null;
    } catch (err) { return null; }
  }

  function show(address, digits, marks, headline, detail) {
    current = address;
    let rest = address;
    const page = rest % PAGES; rest /= PAGES;
    const book = rest % BOOKS; rest /= BOOKS;
    const shelf = rest % SHELVES; rest /= SHELVES;
    const wall = rest % WALLS; rest /= WALLS;
    roomText = rest.toString(36);
    $("wall").textContent = wall + 1n;
    $("shelf").textContent = shelf + 1n;
    $("book").textContent = book + 1n;
    $("pageNo").textContent = (page + 1n) + " of " + PAGES;
    renderRoom();
    renderPage(digits, marks);
    const found = $("found");
    found.textContent = headline;
    if (detail) { const s = document.createElement("small"); s.textContent = detail; found.appendChild(s); }
    $("copied").textContent = "";
    history.replaceState(null, "", "#" + encodeAddress(address));
  }

  function turnTo(address, headline, detail) {
    address = ((address % M) + M) % M;
    pageEl.classList.add("turning");
    setTimeout(function () {
      if (lastFound && lastFound.address === address) {
        show(address, pageAt(address), lastFound.marks, "Your page again.", "Still here, and it will be every time you come back.");
      } else show(address, pageAt(address), null, headline, detail);
      pageEl.classList.remove("turning");
    }, 120);
  }

  function randomAddress() {
    const bytes = new Uint8Array(640);
    crypto.getRandomValues(bytes);
    let hex = "";
    bytes.forEach(function (b) { hex += b.toString(16).padStart(2, "0"); });
    return BigInt("0x" + hex) % M;
  }

  /* ── Search ── */
  let mode = "alone";
  const query = $("query"), note = $("queryNote");

  function search() {
    const raw = query.value;
    const text = normalise(raw || query.placeholder).slice(0, 600).trim();
    if (!text) { note.hidden = false; note.textContent = "Type some letters first. The library only has a to z, spaces, commas and full stops."; return; }
    const changed = raw && text !== raw.trim();
    note.hidden = !changed;
    if (changed) note.textContent = "The library has no capitals, digits or other punctuation, so it looked for: “" + text + "”";

    const made = compose(text, mode);
    const address = addressOf(made.digits);
    // Check the round trip: the address must lead straight back to this page.
    const back = pageAt(address);
    for (let i = 0; i < LEN; i++) if (back[i] !== made.digits[i]) throw new Error("mapping is not reversible");

    // How many pages contain this exact text: roughly positions × 29^(free cells).
    const power = Math.floor((LEN - text.length) * Math.log10(29) + Math.log10(LEN - text.length + 1));
    lastFound = { address: address, marks: made.marks };
    show(address, made.digits, made.marks, "It was already here.",
      "Nothing was saved just now. This page has always been at this address, and about 10^" +
      power.toLocaleString() + " other pages contain your exact words too.");
    document.querySelector(".result").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("search").addEventListener("submit", function (e) { e.preventDefault(); query.blur(); search(); });
  query.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); query.blur(); search(); }
  });
  document.querySelectorAll("[data-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      mode = b.getAttribute("data-mode");
      document.querySelectorAll("[data-mode]").forEach(function (o) { o.classList.toggle("active", o === b); });
    });
  });

  $("prev").addEventListener("click", function () { turnTo(current - 1n, "One page back.", "Almost every page in the library looks like this."); });
  $("next").addEventListener("click", function () { turnTo(current + 1n, "One page on.", "Almost every page in the library looks like this."); });
  $("random").addEventListener("click", function () {
    turnTo(randomAddress(), "A page picked at random.", "Somewhere among pages like this one is everything ever written.");
  });
  roomToggle.addEventListener("click", function () { roomOpen = !roomOpen; renderRoom(); });
  $("copy").addEventListener("click", function () {
    const done = function (msg) { $("copied").textContent = msg; };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(location.href).then(
        function () { done("Copied."); }, function () { done("Copy it from the address bar."); });
    } else done("Copy it from the address bar.");
  });

  /* ── Start: a shared address, or a first page worth reading ── */
  const linked = location.hash.length > 1 ? decodeAddress(location.hash.slice(1)) : null;
  if (linked !== null) {
    show(linked, pageAt(linked), null, "The page at this address.", "The link holds only an address. The words were worked out from it just now.");
  } else {
    const made = compose("every sentence you will ever say is already written here. so is the next thing you type.", "alone");
    show(addressOf(made.digits), made.digits, made.marks, "One page out of 29^1000.", "Type something above to find where it has always been.");
    history.replaceState(null, "", location.pathname);
  }
})();
