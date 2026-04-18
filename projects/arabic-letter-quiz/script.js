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

// ── State ────────────────────────────────────────────────────
let selectedForms = new Set(["isolated"]);
let questions     = [];
let qIdx          = 0;
let score         = 0;
let streak        = 0;

// ── DOM refs ─────────────────────────────────────────────────
const questionEl    = document.getElementById("question");
const answersEl     = document.getElementById("answers");
const scoreEl       = document.getElementById("score");
const streakEl      = document.getElementById("streak");
const nextBtn       = document.getElementById("nextBtn");
const progressBar   = document.getElementById("progress-bar");
const progressLabel = document.getElementById("progress-label");
const completeBanner = document.getElementById("completeBanner");
const completeText  = document.getElementById("completeText");
const restartBtn    = document.getElementById("restartBtn");

// ── Helpers ──────────────────────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Build question pool ───────────────────────────────────────
function buildQuestions() {
  questions = [];
  for (const [name, forms] of Object.entries(letters)) {
    for (const form of selectedForms) {
      if (forms[form]) questions.push({ name, display: forms[form] });
    }
  }
  shuffle(questions);
}

// ── Update score UI ───────────────────────────────────────────
function updateStats() {
  scoreEl.textContent  = `${score} / ${questions.length}`;
  streakEl.textContent = streak;

  const pct = questions.length > 0
    ? Math.round((qIdx / questions.length) * 100)
    : 0;
  progressBar.style.width = pct + "%";
  progressLabel.textContent = pct + "%";
}

// ── Load a question ───────────────────────────────────────────
function loadQuestion() {
  completeBanner.style.display = "none";

  if (qIdx >= questions.length) {
    showComplete();
    return;
  }

  const q = questions[qIdx];
  questionEl.textContent = q.display;

  // Build 4 options
  const opts = [q.name];
  const pool  = shuffle(Object.keys(letters).filter(n => n !== q.name));
  opts.push(...pool.slice(0, 3));
  shuffle(opts);

  answersEl.innerHTML = "";
  opts.forEach(opt => {
    const btn = document.createElement("button");
    btn.className   = "answer-btn";
    btn.textContent = opt;
    btn.addEventListener("click", () => handleAnswer(btn, opt === q.name));
    answersEl.appendChild(btn);
  });

  nextBtn.disabled = true;
  updateStats();
}

// ── Handle answer selection ───────────────────────────────────
function handleAnswer(btn, correct) {
  answersEl.querySelectorAll(".answer-btn").forEach(b => b.disabled = true);

  if (correct) {
    btn.classList.add("correct");
    score++;
    streak++;
  } else {
    btn.classList.add("wrong");
    streak = 0;
    // Reveal correct
    answersEl.querySelectorAll(".answer-btn").forEach(b => {
      if (b.textContent === questions[qIdx].name) b.classList.add("correct");
    });
  }

  updateStats();
  nextBtn.disabled = false;
}

// ── Completion ────────────────────────────────────────────────
function showComplete() {
  nextBtn.disabled = true;
  completeBanner.style.display = "flex";
  const pct = questions.length > 0
    ? ((score / questions.length) * 100).toFixed(0)
    : 0;
  completeText.textContent = `Done! ${score} / ${questions.length} correct (${pct}%)`;
  progressBar.style.width   = "100%";
  progressLabel.textContent = "100%";
}

function restart() {
  score  = 0;
  streak = 0;
  qIdx   = 0;
  buildQuestions();
  loadQuestion();
}

// ── Event listeners ───────────────────────────────────────────
nextBtn.addEventListener("click", () => { qIdx++; loadQuestion(); });
restartBtn.addEventListener("click", restart);

document.querySelectorAll(".form-checkbox").forEach(cb => {
  cb.addEventListener("change", () => {
    if (cb.checked) selectedForms.add(cb.value);
    else selectedForms.delete(cb.value);
    restart();
  });
});

// ── Init ─────────────────────────────────────────────────────
buildQuestions();
loadQuestion();