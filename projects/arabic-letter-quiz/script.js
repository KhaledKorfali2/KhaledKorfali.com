const letters = {
  "Alif": { "isolated": "ا", "start": "ا", "middle": "ـا", "end": "ـا"},
  "Ba": { "isolated": "ب", "start": "بـ", "middle": "ـبـ", "end": "ـب"},
  "Ta": { "isolated": "ت", "start": "تـ", "middle": "ـتـ", "end": "ـت"},
  "Tha": { "isolated": "ث", "start": "ثـ", "middle": "ـثـ", "end": "ـث"},
  "Jeem": { "isolated": "ج", "start": "جـ", "middle": "ـجـ", "end": "ـج"},
  "Haa": { "isolated": "ح", "start": "حـ", "middle": "ـحـ", "end": "ـح"},
  "Khaa": { "isolated": "خ", "start": "خـ", "middle": "ـخـ", "end": "ـخ"},
  "Dal": { "isolated": "د", "start": "د", "middle": "ـد", "end": "ـد"},
  "Dhal": { "isolated": "ذ", "start": "ذ", "middle": "ـذ", "end": "ـذ"},
  "Raa": { "isolated": "ر", "start": "ر", "middle": "ـر", "end": "ـر"},
  "Zay": { "isolated": "ز", "start": "ز", "middle": "ـز", "end": "ـز"},
  "Seen": { "isolated": "س", "start": "سـ", "middle": "ـسـ", "end": "ـس"},
  "Sheen": { "isolated": "ش", "start": "شـ", "middle": "ـشـ", "end": "ـش"},
  "Saad": { "isolated": "ص", "start": "صـ", "middle": "ـصـ", "end": "ـص"},
  "Daad": { "isolated": "ض", "start": "ضـ", "middle": "ـضـ", "end": "ـض"},
  "Taa": { "isolated": "ط", "start": "طـ", "middle": "ـطـ", "end": "ـط"},
  "Zaa": { "isolated": "ظ", "start": "ظـ", "middle": "ـظـ", "end": "ـظ"},
  "Ain": { "isolated": "ع", "start": "عـ", "middle": "ـعـ", "end": "ـع"},
  "Ghayn": { "isolated": "غ", "start": "غـ", "middle": "ـغـ", "end": "ـغ"},
  "Fa": { "isolated": "ف", "start": "فـ", "middle": "ـفـ", "end": "ـف"},
  "Qaf": { "isolated": "ق", "start":"قـ", "middle": "ـقـ", "end": "ـق"},
  "Kaf": { "isolated": "ك", "start": "كـ", "middle": "ـكـ", "end": "ـك"},
  "Lam": { "isolated": "ل", "start": "لـ", "middle": "ـلـ", "end": "ـل"},
  "Meem": { "isolated": "م", "start": "مـ", "middle": "ـمـ", "end": "ـم"},
  "Noon": { "isolated": "ن", "start": "نـ", "middle": "ـنـ", "end": "ـن"},
  "Haa2": { "isolated": "ﻩ", "start": "هـ", "middle": "ـهـ", "end": "ـه"},
  "Waw": { "isolated": "و", "start": "و", "middle": "ـو", "end": "ـو"},
  "Ya": { "isolated": "ي", "start": "يـ", "middle": "ـيـ", "end": "ـي"}
};

const questionEl = document.getElementById("question");
const answersEl = document.getElementById("answers");
const scoreEl = document.getElementById("score");
const nextBtn = document.getElementById("nextBtn");
const progressBar = document.getElementById("progress-bar");

let selectedForms = new Set(["isolated"]);
let questions = [];
let currentQuestionIndex = 0;
let score = 0;

// Build all questions based on selected forms
function generateQuestions() {
  questions = [];
  for (const [name, forms] of Object.entries(letters)) {
    selectedForms.forEach(form => {
      if (forms[form]) {
        questions.push({ name, display: forms[form] });
      }
    });
  }
  shuffle(questions);
}

// Utility: shuffle array
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function loadQuestion() {
  if (currentQuestionIndex >= questions.length) {
    questionEl.innerHTML = "🎉 Quiz Complete!";
    answersEl.innerHTML = "";
    nextBtn.disabled = true;
    return;
  }

  const q = questions[currentQuestionIndex];
  questionEl.innerHTML = q.display;

  const correctAnswer = q.name;
  const options = [correctAnswer];

  // Generate 3 random other options
  const allNames = Object.keys(letters).filter(n => n !== correctAnswer);
  shuffle(allNames);
  options.push(...allNames.slice(0, 3));
  shuffle(options);

  answersEl.innerHTML = "";
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "answer-btn";
    btn.textContent = opt;
    btn.onclick = () => selectAnswer(btn, opt === correctAnswer);
    answersEl.appendChild(btn);
  });

  nextBtn.disabled = true;
  updateProgress();
}

function selectAnswer(button, isCorrect) {
  const allBtns = answersEl.querySelectorAll(".answer-btn");
  allBtns.forEach(b => b.disabled = true);
  if (isCorrect) {
    button.classList.add("correct");
    score++;
  } else {
    button.classList.add("wrong");
  }

  scoreEl.textContent = `Score: ${score} / ${questions.length}`;
  nextBtn.disabled = false;
}

function nextQuestion() {
  currentQuestionIndex++;
  loadQuestion();
}

function updateProgress() {
  const progress = ((currentQuestionIndex) / questions.length) * 100;
  progressBar.style.width = `${progress}%`;
}

document.querySelectorAll(".form-checkbox").forEach(cb => {
  cb.addEventListener("change", () => {
    selectedForms = new Set(
      Array.from(document.querySelectorAll(".form-checkbox:checked")).map(c => c.value)
    );
    score = 0;
    currentQuestionIndex = 0;
    generateQuestions();
    loadQuestion();
  });
});

nextBtn.addEventListener("click", nextQuestion);

// Initialize
generateQuestions();
loadQuestion();
