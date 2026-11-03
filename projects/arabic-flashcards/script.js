const letters = {
  "Alif":  { isolated: "ا",  start: "ا",   middle: "ـا",  end: "ـا"  },
  "Ba":    { isolated: "ب",  start: "بـ",  middle: "ـبـ", end: "ـب"  },
  "Ta":    { isolated: "ت",  start: "تـ",  middle: "ـتـ", end: "ـت"  },
  "Tha":   { isolated: "ث",  start: "ثـ",  middle: "ـثـ", end: "ـث"  },
  "Jeem":  { isolated: "ج",  start: "جـ",  middle: "ـجـ", end: "ـج"  },
  "Haa":   { isolated: "ح",  start: "حـ",  middle: "ـحـ", end: "ـح"  },
  "Khaa":  { isolated: "خ",  start: "خـ",  middle: "ـخـ", end: "ـخ"  },
  "Dal":   { isolated: "د",  start: "د",   middle: "ـد",  end: "ـد"  },
  "Dhal":  { isolated: "ذ",  start: "ذ",   middle: "ـذ",  end: "ـذ"  },
  "Raa":   { isolated: "ر",  start: "ر",   middle: "ـر",  end: "ـر"  },
  "Zay":   { isolated: "ز",  start: "ز",   middle: "ـز",  end: "ـز"  },
  "Seen":  { isolated: "س",  start: "سـ",  middle: "ـسـ", end: "ـس"  },
  "Sheen": { isolated: "ش",  start: "شـ",  middle: "ـشـ", end: "ـش"  },
  "Saad":  { isolated: "ص",  start: "صـ",  middle: "ـصـ", end: "ـص"  },
  "Daad":  { isolated: "ض",  start: "ضـ",  middle: "ـضـ", end: "ـض"  },
  "Taa":   { isolated: "ط",  start: "طـ",  middle: "ـطـ", end: "ـط"  },
  "Zaa":   { isolated: "ظ",  start: "ظـ",  middle: "ـظـ", end: "ـظ"  },
  "Ain":   { isolated: "ع",  start: "عـ",  middle: "ـعـ", end: "ـع"  },
  "Ghayn": { isolated: "غ",  start: "غـ",  middle: "ـغـ", end: "ـغ"  },
  "Fa":    { isolated: "ف",  start: "فـ",  middle: "ـفـ", end: "ـف"  },
  "Qaf":   { isolated: "ق",  start: "قـ",  middle: "ـقـ", end: "ـق"  },
  "Kaf":   { isolated: "ك",  start: "كـ",  middle: "ـكـ", end: "ـك"  },
  "Lam":   { isolated: "ل",  start: "لـ",  middle: "ـلـ", end: "ـل"  },
  "Meem":  { isolated: "م",  start: "مـ",  middle: "ـمـ", end: "ـم"  },
  "Noon":  { isolated: "ن",  start: "نـ",  middle: "ـنـ", end: "ـن"  },
  // ه — was keyed "Haa2" (shown verbatim on the card back) and used the
  // presentation-form glyph U+FEE9 instead of the real letter U+0647
  "Ha":    { isolated: "ه",  start: "هـ",  middle: "ـهـ", end: "ـه"  },
  "Waw":   { isolated: "و",  start: "و",   middle: "ـو",  end: "ـو"  },
  "Ya":    { isolated: "ي",  start: "يـ",  middle: "ـيـ", end: "ـي"  },
};

const container = document.getElementById("flashcard-container");
const counter   = document.getElementById("cardCounter");

const FORM_LABELS = { isolated: "Isolated", start: "Start", middle: "Middle", end: "End" };

let selectedForms = new Set(["isolated"]);
let deck = [];
let idx  = 0;

// ── Build deck ──────────────────────────────────────────────
function buildDeck() {
  deck = [];
  for (const [name, forms] of Object.entries(letters)) {
    for (const form of selectedForms) {
      if (forms[form] !== undefined) {
        deck.push({ arabic: forms[form], english: name, form });
      }
    }
  }
}

// ── Render card ──────────────────────────────────────────────
function showCard() {
  container.innerHTML = "";

  if (deck.length === 0) {
    container.innerHTML = `<p class="empty-msg">Select at least one form to study.</p>`;
    counter.textContent = "— / —";
    return;
  }

  idx = Math.max(0, Math.min(idx, deck.length - 1));
  counter.textContent = `${idx + 1} / ${deck.length}`;

  const wrapper = document.createElement("div");
  wrapper.className = "flashcard-wrapper";

  const { arabic, english, form } = deck[idx];

  // A real <button> so the card is focusable and Enter/Space flip it
  const card = document.createElement("button");
  card.type = "button";
  card.className = "flashcard";

  const front = document.createElement("span");
  front.className = "front";
  front.lang = "ar";
  front.dir  = "rtl";
  front.textContent = arabic;

  const back = document.createElement("span");
  back.className = "back";
  const backName = document.createElement("span");
  backName.className = "back-name";
  backName.textContent = english;
  const backForm = document.createElement("span");
  backForm.className = "back-form";
  backForm.textContent = FORM_LABELS[form] + " form";
  back.append(backName, backForm);

  card.append(front, back);
  syncCardA11y(card);
  card.addEventListener("click", () => flip(card));

  wrapper.appendChild(card);
  container.appendChild(wrapper);
}

// Keep screen readers from reading the hidden side of the card
function syncCardA11y(card) {
  const flipped = card.classList.contains("flipped");
  card.querySelector(".front").setAttribute("aria-hidden", String(flipped));
  card.querySelector(".back").setAttribute("aria-hidden", String(!flipped));
  card.setAttribute("aria-label", flipped
    ? `${deck[idx].english}, ${FORM_LABELS[deck[idx].form].toLowerCase()} form. Press to flip back.`
    : `Arabic letter ${deck[idx].arabic}. Press to reveal its name.`);
}

function flip(card) {
  card.classList.toggle("flipped");
  syncCardA11y(card);
}

// ── Navigation ───────────────────────────────────────────────
function next() {
  if (!deck.length) return;
  idx = (idx + 1) % deck.length;
  showCard();
}

function prev() {
  if (!deck.length) return;
  idx = (idx - 1 + deck.length) % deck.length;
  showCard();
}

function shuffle() {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  idx = 0;
  showCard();
}

// ── Keyboard shorthand ────────────────────────────────────────
document.addEventListener("keydown", (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === "ArrowRight") next();
  if (e.key === "ArrowLeft")  prev();
  if (e.key === " ") {
    // Let focused controls handle Space natively — otherwise this both
    // blocked the checkboxes/buttons and double-flipped the focused card
    if (e.target.closest("button, input, a, textarea, select")) return;
    e.preventDefault();
    const card = container.querySelector(".flashcard");
    if (card) flip(card);
  }
});

// ── Checkbox listeners ────────────────────────────────────────
document.querySelectorAll(".form-checkbox").forEach(cb => {
  cb.addEventListener("change", () => {
    if (cb.checked) selectedForms.add(cb.value);
    else selectedForms.delete(cb.value);
    const prevIdx = idx;
    buildDeck();
    idx = Math.min(prevIdx, Math.max(0, deck.length - 1));
    showCard();
  });
});

document.getElementById("prevBtn").addEventListener("click", prev);
document.getElementById("nextBtn").addEventListener("click", next);
document.getElementById("shuffleBtn").addEventListener("click", () => {
  buildDeck();
  shuffle();
});

// ── Init ─────────────────────────────────────────────────────
buildDeck();
showCard();