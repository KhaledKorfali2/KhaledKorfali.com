let surahs = [];
let currentMode = "name-to-number";
let currentAnswer = null;
let score = 0;
let streak = 0;
let bestStreak = 0;

let questionPool = [];
let currentQuestionIndex = 0;
let currentQuestionData = null;

let endlessMode = false;
let showArabic = true;

// Load JSON on page load
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch("./surahs.json");
    surahs = await response.json();
  } catch (err) {
    console.error("Failed to load surahs:", err);
  }
});

function startQuiz() {
  if (surahs.length === 0) {
    alert("Data still loading, please try again.");
    return;
  }

  currentMode   = document.getElementById("mode").value;
  showArabic    = document.getElementById("showArabic").checked;
  endlessMode   = document.getElementById("endlessMode").checked;

  score = 0;
  streak = 0;
  bestStreak = 0;
  updateScoreUI();

  // Build + shuffle question pool
  questionPool = buildQuestionPool();
  shuffleArray(questionPool);
  currentQuestionIndex = 0;

  // Show / hide UI sections
  document.getElementById("settingsCard").style.display = "none";
  document.getElementById("statsBar").style.display = "flex";
  document.getElementById("quiz").style.display = "block";
  document.getElementById("endScreen").style.display = "none";

  const progressContainer = document.getElementById("progressContainer");
  progressContainer.style.display = endlessMode ? "none" : "flex";

  generateQuestion();
}

function buildQuestionPool() {
  const pool = [];
  surahs.forEach(surah => {
    if (currentMode === "mixed") {
      pool.push({ surah, mode: "name-to-number" });
      pool.push({ surah, mode: "number-to-name" });
    } else {
      pool.push({ surah, mode: currentMode });
    }
  });
  return pool;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function updateScoreUI() {
  document.getElementById("score").textContent      = score;
  document.getElementById("streak").textContent     = streak;
  document.getElementById("bestStreak").textContent = bestStreak;
}

function endQuiz() {
  document.getElementById("quiz").style.display     = "none";
  document.getElementById("endScreen").style.display = "block";
  document.getElementById("progressContainer").style.display = "none";

  const total    = questionPool.length;
  const accuracy = total > 0 ? ((score / total) * 100).toFixed(1) : "0.0";

  document.getElementById("finalScore").textContent    = `${score} / ${total}`;
  document.getElementById("finalAccuracy").textContent = `${accuracy}%`;
  document.getElementById("finalBest").textContent     = bestStreak;
}

function generateQuestion() {
  if (!endlessMode && currentQuestionIndex >= questionPool.length) {
    endQuiz();
    return;
  }

  updateProgressBar();

  let q;
  if (endlessMode) {
    const randomSurah = surahs[Math.floor(Math.random() * surahs.length)];
    const mode = currentMode === "mixed"
      ? (Math.random() < 0.5 ? "name-to-number" : "number-to-name")
      : currentMode;
    q = { surah: randomSurah, mode };
  } else {
    q = questionPool[currentQuestionIndex];
  }

  currentQuestionData = q;
  renderQuestion(q);
}

function renderQuestion(q) {
  const { surah, mode } = q;

  // Question number label
  if (!endlessMode) {
    document.getElementById("questionNum").textContent =
      `Question ${currentQuestionIndex + 1} of ${questionPool.length}`;
  } else {
    document.getElementById("questionNum").textContent = "Endless Mode";
  }

  let questionText, correctAnswer;

  if (mode === "name-to-number") {
    questionText  = `What is the number of "${formatName(surah)}"?`;
    correctAnswer = surah.number;
  } else {
    questionText  = `What surah is #${surah.number}?`;
    correctAnswer = formatName(surah);
  }

  currentAnswer = correctAnswer;
  document.getElementById("question").textContent = questionText;
  renderAnswers(surah, correctAnswer, mode);
}

function formatName(surah) {
  return showArabic
    ? `${surah.name.english} (${surah.name.arabic})`
    : surah.name.english;
}

function renderAnswers(correctSurah, correctAnswer, mode) {
  const answersDiv = document.getElementById("answers");
  answersDiv.innerHTML = "";

  const options = [correctAnswer];
  while (options.length < 4) {
    const rand  = surahs[Math.floor(Math.random() * surahs.length)];
    const value = mode === "name-to-number" ? rand.number : formatName(rand);
    if (!options.includes(value)) options.push(value);
  }
  shuffleArray(options);

  options.forEach(option => {
    const btn = document.createElement("button");
    btn.className   = "answer-btn";
    btn.textContent = option;
    btn.onclick     = () => handleAnswer(btn, option === currentAnswer);
    answersDiv.appendChild(btn);
  });
}

function handleAnswer(selectedBtn, isCorrect) {
  // Disable all buttons immediately
  document.querySelectorAll(".answer-btn").forEach(b => b.disabled = true);

  if (isCorrect) {
    selectedBtn.classList.add("correct");
    score++;
    streak++;
    bestStreak = Math.max(bestStreak, streak);
  } else {
    selectedBtn.classList.add("wrong");
    streak = 0;
    // Reveal correct answer
    document.querySelectorAll(".answer-btn").forEach(b => {
      if (String(b.textContent) === String(currentAnswer)) {
        b.classList.add("correct");
      }
    });
  }

  updateScoreUI();
  if (!endlessMode) currentQuestionIndex++;

  setTimeout(generateQuestion, 900);
}

function updateProgressBar() {
  if (endlessMode) return;
  const pct = (currentQuestionIndex / questionPool.length) * 100;
  document.getElementById("progressBar").style.width = pct + "%";
  document.getElementById("progressLabel").textContent =
    `${currentQuestionIndex} / ${questionPool.length}`;
}

// Re-render current question if Arabic toggle changes mid-quiz
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("showArabic").addEventListener("change", () => {
    showArabic = document.getElementById("showArabic").checked;
    if (currentQuestionData) renderQuestion(currentQuestionData);
  });
});