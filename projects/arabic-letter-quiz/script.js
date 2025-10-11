// Arabic letters + forms (same as your flashcard data)
const letters = {
  "Alif": { isolated: "ا", start: "ا", middle: "ـا", end: "ـا" },
  "Ba": { isolated: "ب", start: "بـ", middle: "ـبـ", end: "ـب" },
  "Ta": { isolated: "ت", start: "تـ", middle: "ـتـ", end: "ـت" },
  "Tha": { isolated: "ث", start: "ثـ", middle: "ـثـ", end: "ـث" },
  "Jeem": { isolated: "ج", start: "جـ", middle: "ـجـ", end: "ـج" },
  "Haa": { isolated: "ح", start: "حـ", middle: "ـحـ", end: "ـح" },
  "Khaa": { isolated: "خ", start: "خـ", middle: "ـخـ", end: "ـخ" },
  "Dal": { isolated: "د", start: "د", middle: "ـد", end: "ـد" },
  "Dhal": { isolated: "ذ", start: "ذ", middle: "ـذ", end: "ـذ" },
  "Raa": { isolated: "ر", start: "ر", middle: "ـر", end: "ـر" },
  "Zay": { isolated: "ز", start: "ز", middle: "ـز", end: "ـز" },
  "Seen": { isolated: "س", start: "سـ", middle: "ـسـ", end: "ـس" },
  "Sheen": { isolated: "ش", start: "شـ", middle: "ـشـ", end: "ـش" },
  "Saad": { isolated: "ص", start: "صـ", middle: "ـصـ", end: "ـص" },
  "Daad": { isolated: "ض", start: "ضـ", middle: "ـضـ", end: "ـض" },
  "Taa": { isolated: "ط", start: "طـ", middle: "ـطـ", end: "ـط" },
  "Zaa": { isolated: "ظ", start: "ظـ", middle: "ـظـ", end: "ـظ" },
  "Ain": { isolated: "ع", start: "عـ", middle: "ـعـ", end: "ـع" },
  "Ghayn": { isolated: "غ", start: "غـ", middle: "ـغـ", end: "ـغ" },
  "Fa": { isolated: "ف", start: "فـ", middle: "ـفـ", end: "ـف" },
  "Qaf": { isolated: "ق", start: "قـ", middle: "ـقـ", end: "ـق" },
  "Kaf": { isolated: "ك", start: "كـ", middle: "ـكـ", end: "ـك" },
  "Lam": { isolated: "ل", start: "لـ", middle: "ـلـ", end: "ـل" },
  "Meem": { isolated: "م", start: "مـ", middle: "ـمـ", end: "ـم" },
  "Noon": { isolated: "ن", start: "نـ", middle: "ـنـ", end: "ـن" },
  "Haa2": { isolated: "ﻩ", start: "هـ", middle: "ـهـ", end: "ـه" },
  "Waw": { isolated: "و", start: "و", middle: "ـو", end: "ـو" },
  "Ya": { isolated: "ي", start: "يـ", middle: "ـيـ", end: "ـي" }
};

const selectedForms = new Set(["isolated"]);
const questionEl = document.getElementById("question");
const answersEl = document.getElementById("answers");
const nextBtn = document.getElementById("nextBtn");

let currentQuestion = null;

// Load selected forms
document.querySelectorAll(".form-checkbox").forEach(cb => {
  cb.addEventListener("change", () => {
    if (cb.checked) selectedForms.add(cb.value);
    else selectedForms.delete(cb.value);
    generateQuestion();
  });
});

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

function generateQuestion() {
  const formOptions = Array.from(selectedForms);
  if (formOptions.length === 0) {
    questionEl.textContent = "Please select at least one form.";
    answersEl.innerHTML = "";
    return;
  }

  const allLetters = Object.entries(letters);
  const [english, forms] = getRandomItem(allLetters);
  const randomForm = getRandomItem(formOptions);
  const arabicLetter = forms[randomForm];

  currentQuestion = { english, arabicLetter };

  // Generate wrong answers
  const wrongs = allLetters
    .filter(([e]) => e !== english)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map(([e]) => e);

  // Mix them up
  const options = shuffleArray([english, ...wrongs]);

  // Render
  questionEl.textContent = arabicLetter;
  questionEl.setAttribute("lang", "ar");
  questionEl.setAttribute("dir", "rtl");

  answersEl.innerHTML = "";
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "answer-btn";
    btn.textContent = opt;
    btn.onclick = () => handleAnswer(opt, btn);
    answersEl.appendChild(btn);
  });
}

function handleAnswer(choice, btn) {
  const correct = choice === currentQuestion.english;
  btn.classList.add(correct ? "correct" : "incorrect");

  // Disable all buttons
  document.querySelectorAll(".answer-btn").forEach(b => (b.disabled = true));
}

nextBtn.addEventListener("click", generateQuestion);

// Initialize
generateQuestion();
