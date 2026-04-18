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
  "Haa2":  { isolated: "ﻩ",  start: "هـ",  middle: "ـهـ", end: "ـه"  },
  "Waw":   { isolated: "و",  start: "و",   middle: "ـو",  end: "ـو"  },
  "Ya":    { isolated: "ي",  start: "يـ",  middle: "ـيـ", end: "ـي"  },
};

const container = document.getElementById("flashcard-container");
const counter   = document.getElementById("cardCounter");

let selectedForms = new Set(["isolated"]);
let deck = [];
let idx  = 0;

// ── Build deck ──────────────────────────────────────────────
function buildDeck() {
  deck = [];
  for (const [name, forms] of Object.entries(letters)) {
    for (const form of selectedForms) {
      if (forms[form] !== undefined) {
        deck.push({ arabic: forms[form], english: name });
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

  const card = document.createElement("div");
  card.className = "flashcard";
  card.innerHTML = `
    <div class="front" lang="ar" dir="rtl">${deck[idx].arabic}</div>
    <div class="back">${deck[idx].english}</div>
  `;
  card.addEventListener("click", () => card.classList.toggle("flipped"));

  wrapper.appendChild(card);
  container.appendChild(wrapper);
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
  if (e.key === "ArrowRight") next();
  if (e.key === "ArrowLeft")  prev();
  if (e.key === " ") {
    e.preventDefault();
    container.querySelector(".flashcard")?.classList.toggle("flipped");
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