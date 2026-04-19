// ── State ─────────────────────────────────────────────────────────────────────

let surahs = [];

const state = {
  // settings
  challengeType: "recall",
  recallMode: "name-to-number",
  orderCount: 5,
  orderConsecutive: false,
  showArabic: true,
  endless: false,

  // session
  score: 0,
  streak: 0,
  bestStreak: 0,
  totalAnswered: 0,
  totalCorrect: 0,

  // question tracking
  questionPool: [],
  questionIndex: 0,
  currentQuestion: null,

  // recall interaction: "idle" | "selecting" | "locked"
  recallPhase: "idle",
  selectedBtn: null,

  // ordering
  orderingSurahs: [],
  userOrder: [],
};

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  await loadSurahs();
  bindSettingsUI();
  bindActionButtons();
});

async function loadSurahs() {
  try {
    const res = await fetch("./surahs.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    surahs = await res.json();
  } catch (err) {
    console.error("Failed to load surahs.json:", err);
    const btn = document.getElementById("startBtn");
    btn.textContent = "Failed to load data — refresh to retry";
    btn.disabled = true;
    btn.style.opacity = "0.5";
  }
}

// ── Settings UI ───────────────────────────────────────────────────────────────

function bindSettingsUI() {
  document.querySelectorAll(".type-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".type-btn").forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      state.challengeType = btn.dataset.type;
      updateSettingsVisibility();
    });
  });

  bindPillGroup("recallMode",     val => { state.recallMode       = val; },             "data-mode");
  bindPillGroup("orderCount",     val => { state.orderCount       = parseInt(val); },   "data-count");
  bindPillGroup("orderSelection", val => { state.orderConsecutive = val === "true"; },  "data-consecutive");

  document.getElementById("showArabic").addEventListener("change", e => {
    state.showArabic = e.target.checked;
    // Live re-render only if we're mid-question and haven't confirmed yet
    if (
      state.currentQuestion?.type === "recall" &&
      state.recallPhase === "idle" &&
      !document.getElementById("quiz").classList.contains("hidden")
    ) {
      renderRecallQuestion(state.currentQuestion);
    }
  });

  document.getElementById("endlessMode").addEventListener("change", e => {
    state.endless = e.target.checked;
  });
}

function bindPillGroup(containerId, onChange, attr) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll(".pill").forEach(pill => {
    pill.addEventListener("click", () => {
      container.querySelectorAll(".pill").forEach(p => {
        p.classList.remove("active");
        p.setAttribute("aria-pressed", "false");
      });
      pill.classList.add("active");
      pill.setAttribute("aria-pressed", "true");
      onChange(pill.getAttribute(attr));
    });
  });
}

function updateSettingsVisibility() {
  const isOrdering = state.challengeType === "ordering";
  document.getElementById("recallOptions").classList.toggle("hidden", isOrdering);
  document.getElementById("orderingOptions").classList.toggle("hidden", !isOrdering);

  const endlessWrap = document.getElementById("endlessModeToggleWrap");
  endlessWrap.classList.toggle("faded", isOrdering);
  if (isOrdering) {
    document.getElementById("endlessMode").checked = false;
    state.endless = false;
  }
}

function bindActionButtons() {
  document.getElementById("startBtn").addEventListener("click", startQuiz);
  document.getElementById("restartBtn").addEventListener("click", startQuiz);
  document.getElementById("tryAgainBtn").addEventListener("click", startQuiz);
  document.getElementById("changeSettingsBtn").addEventListener("click", showSettings);
  document.getElementById("exitBtn").addEventListener("click", showSettings);
}

// ── Quiz lifecycle ────────────────────────────────────────────────────────────

function startQuiz() {
  if (!surahs.length) return;

  state.score         = 0;
  state.streak        = 0;
  state.bestStreak    = 0;
  state.totalAnswered = 0;
  state.totalCorrect  = 0;
  state.questionIndex = 0;
  state.currentQuestion = null;
  state.recallPhase   = "idle";
  state.selectedBtn   = null;
  state.userOrder     = [];

  if (state.challengeType === "ordering") {
    state.questionPool = Array.from({ length: 5 }, buildOrderingQuestion);
  } else {
    state.questionPool = buildRecallPool();
    shuffleArray(state.questionPool);
  }

  hide("settingsCard");
  hide("endScreen");
  show("statsBar");
  show("quiz");

  const showProgress = state.challengeType === "ordering" || !state.endless;
  document.getElementById("progressContainer").classList.toggle("hidden", !showProgress);

  updateScoreUI();
  nextQuestion();
}

function showSettings() {
  hide("endScreen");
  hide("statsBar");
  hide("quiz");
  hide("progressContainer");
  hide("confirmBar");
  show("settingsCard");
  state.recallPhase = "idle";
  state.selectedBtn = null;
}

function endQuiz() {
  hide("quiz");
  hide("progressContainer");
  hide("confirmBar");
  show("endScreen");

  const modeLabel = state.challengeType === "ordering"
    ? "Ordering"
    : ({ "name-to-number": "Name → Number", "number-to-name": "Number → Name", "revelation": "Meccan / Medinan", "mixed": "Mixed" })[state.recallMode];
  document.getElementById("endModeLabel").textContent = modeLabel;

  const accuracy = state.totalAnswered > 0
    ? ((state.totalCorrect / state.totalAnswered) * 100).toFixed(1)
    : "0.0";

  document.getElementById("finalScore").textContent    = `${state.totalCorrect} / ${state.totalAnswered}`;
  document.getElementById("finalAccuracy").textContent = `${accuracy}%`;
  document.getElementById("finalBest").textContent     = state.bestStreak;
}

// ── Pool builders ─────────────────────────────────────────────────────────────

// All directions cycled in mixed. revelation has only 2 answer options so it
// sits naturally alongside the 4-option modes — no special weighting needed.
const MIXED_DIRECTIONS = ["name-to-number", "number-to-name", "revelation"];

function buildRecallPool() {
  const pool = [];
  surahs.forEach(surah => {
    if (state.recallMode === "mixed") {
      MIXED_DIRECTIONS.forEach(dir => {
        pool.push({ type: "recall", surah, direction: dir });
      });
    } else {
      pool.push({ type: "recall", surah, direction: state.recallMode });
    }
  });
  return pool;
}

function buildOrderingQuestion() {
  let selected;
  if (state.orderConsecutive) {
    const maxStart = Math.max(0, surahs.length - state.orderCount);
    const start    = Math.floor(Math.random() * (maxStart + 1));
    selected = surahs.slice(start, start + state.orderCount);
  } else {
    const shuffled = [...surahs];
    shuffleArray(shuffled);
    selected = shuffled.slice(0, state.orderCount);
  }
  return { type: "ordering", surahs: selected };
}

// ── Question flow ─────────────────────────────────────────────────────────────

function nextQuestion() {
  state.recallPhase = "idle";
  state.selectedBtn = null;
  hide("confirmBar");

  if (state.challengeType === "ordering") {
    if (state.questionIndex >= state.questionPool.length) { endQuiz(); return; }
    const q = state.questionPool[state.questionIndex];
    state.currentQuestion = q;
    renderOrderingQuestion(q);
    return;
  }

  if (!state.endless && state.questionIndex >= state.questionPool.length) {
    endQuiz();
    return;
  }

  let q;
  if (state.endless) {
    const surah     = surahs[Math.floor(Math.random() * surahs.length)];
    const direction = state.recallMode === "mixed"
      ? MIXED_DIRECTIONS[Math.floor(Math.random() * MIXED_DIRECTIONS.length)]
      : state.recallMode;
    q = { type: "recall", surah, direction };
  } else {
    q = state.questionPool[state.questionIndex];
  }

  state.currentQuestion = q;
  renderRecallQuestion(q);
}

// ── Recall ────────────────────────────────────────────────────────────────────

function renderRecallQuestion(q) {
  const { surah, direction } = q;

  document.getElementById("questionNum").textContent = state.endless
    ? "Endless Mode"
    : `Question ${state.questionIndex + 1} of ${state.questionPool.length}`;

  // Set progress before rendering so bar is correct on Q1
  updateRecallProgress();

  if (direction === "revelation") {
    // Pick a sub-direction once per question and cache it on the question
    // object so re-renders (showArabic toggle) stay consistent.
    if (!q.revelationDir) {
      q.revelationDir = Math.random() < 0.5 ? "name-to-type" : "type-to-name";
    }
    renderRevelationQuestion(q);
    return;
  }

  document.getElementById("question").textContent = direction === "name-to-number"
    ? `What is the number of "${formatSurahName(surah)}"?`
    : `What surah is #${surah.number}?`;

  const correctAnswer = direction === "name-to-number" ? surah.number : formatSurahName(surah);
  renderRecallAnswers(correctAnswer, direction, surah);
}

// ── Revelation sub-mode ───────────────────────────────────────────────────────

function renderRevelationQuestion(q) {
  const { surah } = q;
  const answersDiv = document.getElementById("answers");
  answersDiv.innerHTML = "";

  if (q.revelationDir === "name-to-type") {
    // "Is [surah name] Meccan or Medinan?" — 2-button layout
    document.getElementById("question").textContent =
      `Is "${formatSurahName(surah)}" Meccan or Medinan?`;

    answersDiv.className = "answers-grid answers-grid--two";

    const correctType = surah.revelation; // "Meccan" | "Medinan"
    ["Meccan", "Medinan"].forEach((type, i) => {
      const btn = document.createElement("button");
      btn.className = "answer-btn";
      btn.style.animationDelay = `${i * 0.05}s`;
      btn.textContent = type;
      btn.addEventListener("click", () => handleRecallSelect(btn, type === correctType));
      answersDiv.appendChild(btn);
    });

  } else {
    // "Which of these surahs is [Meccan/Medinan]?" — 4-button layout
    // correctSurah is the question's surah; distractors are from the OPPOSITE type
    const targetType    = surah.revelation;                   // e.g. "Meccan"
    const oppositeType  = targetType === "Meccan" ? "Medinan" : "Meccan";
    const oppositePool  = surahs.filter(s => s.revelation === oppositeType && s.number !== surah.number);

    document.getElementById("question").textContent =
      `Which of these surahs is ${targetType}?`;

    answersDiv.className = "answers-grid";

    // Build 3 distractors from the opposite revelation type
    shuffleArray(oppositePool);
    const distractors = oppositePool.slice(0, 3);
    const options     = [surah, ...distractors];
    shuffleArray(options);

    options.forEach((s, i) => {
      const btn = document.createElement("button");
      btn.className = "answer-btn";
      btn.style.animationDelay = `${i * 0.05}s`;
      btn.textContent = formatSurahName(s);
      btn.addEventListener("click", () => handleRecallSelect(btn, s.number === surah.number));
      answersDiv.appendChild(btn);
    });
  }
}

// ── Standard recall answers ───────────────────────────────────────────────────

function renderRecallAnswers(correctAnswer, direction, correctSurah) {
  const answersDiv = document.getElementById("answers");
  answersDiv.innerHTML = "";
  answersDiv.className = "answers-grid";

  const seen    = new Set([String(direction === "name-to-number" ? correctSurah.number : formatSurahName(correctSurah))]);
  const options = [correctAnswer];

  let attempts = 0;
  while (options.length < 4 && attempts < 200) {
    attempts++;
    const rand  = surahs[Math.floor(Math.random() * surahs.length)];
    const value = direction === "name-to-number" ? rand.number : formatSurahName(rand);
    const key   = String(value);
    if (!seen.has(key)) { seen.add(key); options.push(value); }
  }

  shuffleArray(options);

  options.forEach((option, i) => {
    const btn       = document.createElement("button");
    btn.className   = "answer-btn";
    btn.style.animationDelay = `${i * 0.05}s`;
    btn.textContent = option;
    btn.addEventListener("click", () => handleRecallSelect(btn, option === correctAnswer));
    answersDiv.appendChild(btn);
  });
}

// Step 1 — select or deselect
function handleRecallSelect(clickedBtn, isCorrect) {
  if (state.recallPhase === "locked") return;

  // Clicking the already-selected button deselects it
  if (state.selectedBtn === clickedBtn) {
    clickedBtn.classList.remove("selected");
    state.selectedBtn = null;
    state.recallPhase = "idle";
    hide("confirmBar");
    return;
  }

  // Swap selection
  if (state.selectedBtn) state.selectedBtn.classList.remove("selected");
  clickedBtn.classList.add("selected");
  state.selectedBtn = clickedBtn;
  state.recallPhase = "selecting";

  showConfirmBar(isCorrect);
}

// Step 2 — confirm
function commitRecallAnswer(isCorrect) {
  if (state.recallPhase !== "selecting" || !state.selectedBtn) return;
  state.recallPhase = "locked";

  const confirmedBtn = state.selectedBtn;
  document.querySelectorAll(".answer-btn").forEach(b => b.disabled = true);
  hide("confirmBar");

  state.totalAnswered++;

  if (isCorrect) {
    confirmedBtn.classList.remove("selected");
    confirmedBtn.classList.add("correct");
    state.score++;
    state.totalCorrect++;
    state.streak++;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
  } else {
    confirmedBtn.classList.remove("selected");
    confirmedBtn.classList.add("wrong");
    triggerShake(confirmedBtn);
    state.streak = 0;

    // Reveal the correct answer button
    const q = state.currentQuestion;
    let correctText;
    if (q.direction === "revelation") {
      if (q.revelationDir === "name-to-type") {
        correctText = q.surah.revelation; // "Meccan" or "Medinan"
      } else {
        correctText = formatSurahName(q.surah); // the correct surah name
      }
    } else {
      correctText = String(
        q.direction === "name-to-number" ? q.surah.number : formatSurahName(q.surah)
      );
    }
    document.querySelectorAll(".answer-btn").forEach(b => {
      if (b.textContent === correctText) b.classList.add("correct");
    });
  }

  updateScoreUI();
  if (!state.endless) state.questionIndex++;
  setTimeout(nextQuestion, 1300);
}

function showConfirmBar(isCorrect) {
  const bar = document.getElementById("confirmBar");
  bar.classList.remove("hidden");

  // Clone to drop any previous listener
  const old = document.getElementById("confirmBtn");
  const fresh = old.cloneNode(true);
  old.parentNode.replaceChild(fresh, old);
  fresh.addEventListener("click", () => commitRecallAnswer(isCorrect));
}

// ── Ordering ──────────────────────────────────────────────────────────────────

function renderOrderingQuestion(q) {
  state.orderingSurahs = q.surahs;
  state.userOrder      = [];

  document.getElementById("questionNum").textContent =
    `Round ${state.questionIndex + 1} of ${state.questionPool.length}`;
  document.getElementById("question").textContent =
    `Select all ${state.orderingSurahs.length} surahs from first to last`;

  const answersDiv  = document.getElementById("answers");
  answersDiv.innerHTML = "";
  answersDiv.className = "answers-grid ordering-grid";

  show("progressContainer");
  updateOrderingProgress();

  const shuffled = [...state.orderingSurahs];
  shuffleArray(shuffled);

  shuffled.forEach((surah, i) => {
    const btn = document.createElement("button");
    btn.className = "answer-btn";
    btn.style.animationDelay = `${i * 0.05}s`;
    btn.dataset.number = surah.number;
    btn.dataset.label  = formatSurahName(surah);  // cache for deselect restore
    btn.textContent    = formatSurahName(surah);
    btn.addEventListener("click", () => handleOrderingClick(btn, surah));
    answersDiv.appendChild(btn);
  });
}

function handleOrderingClick(btn, surah) {
  const alreadyIdx = state.userOrder.findIndex(s => s.number === surah.number);

  // Deselect last-picked only
  if (alreadyIdx !== -1) {
    if (alreadyIdx === state.userOrder.length - 1) {
      state.userOrder.pop();
      btn.classList.remove("selected");
      btn.textContent = btn.dataset.label;   // restore clean label
      updateOrderingProgress();
    }
    // Non-last taps are silently ignored
    return;
  }

  state.userOrder.push(surah);
  const pos = state.userOrder.length;

  btn.classList.add("selected");
  btn.dataset.order = pos;

  // Rebuild button content: badge + label
  btn.innerHTML = "";
  const badge       = document.createElement("span");
  badge.className   = "order-badge";
  badge.textContent = pos;
  const label       = document.createElement("span");
  label.textContent = btn.dataset.label;
  btn.appendChild(badge);
  btn.appendChild(label);

  updateOrderingProgress();

  if (state.userOrder.length === state.orderingSurahs.length) {
    // Brief pause so user sees the final selection before evaluation
    document.querySelectorAll(".answer-btn").forEach(b => b.disabled = true);
    setTimeout(evaluateOrderingAnswer, 500);
  }
}

function evaluateOrderingAnswer() {
  const correct = [...state.orderingSurahs].sort((a, b) => a.number - b.number);

  let correctCount = 0;
  state.userOrder.forEach((s, i) => {
    if (s.number === correct[i].number) correctCount++;
  });

  const perfectRound = correctCount === state.orderingSurahs.length;

  document.querySelectorAll(".answer-btn").forEach(btn => {
    const number     = parseInt(btn.dataset.number);
    const userIdx    = state.userOrder.findIndex(s => s.number === number);
    const correctIdx = correct.findIndex(s => s.number === number);

    btn.classList.remove("selected");

    if (userIdx === correctIdx) {
      btn.classList.add("correct");
    } else {
      btn.classList.add("wrong");
      triggerShake(btn);
      // Hint: what position this surah should have been
      const hint       = document.createElement("span");
      hint.className   = "order-hint";
      hint.textContent = `→ position ${correctIdx + 1}`;
      btn.appendChild(hint);
    }
  });

  state.totalAnswered += state.orderingSurahs.length;
  state.totalCorrect  += correctCount;
  state.score         += correctCount;

  if (perfectRound) {
    state.streak++;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
  } else {
    state.streak = 0;
  }

  updateScoreUI();
  state.questionIndex++;
  setTimeout(nextQuestion, 2200);
}

// ── Progress ──────────────────────────────────────────────────────────────────

function updateOrderingProgress() {
  setProgress(state.userOrder.length, state.orderingSurahs.length);
}

function updateRecallProgress() {
  if (state.endless) return;
  setProgress(state.questionIndex, state.questionPool.length);
}

function setProgress(current, total) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  document.getElementById("progressBar").style.width   = `${pct}%`;
  document.getElementById("progressLabel").textContent = `${current} / ${total}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSurahName(surah) {
  return state.showArabic
    ? `${surah.name.english} (${surah.name.arabic})`
    : surah.name.english;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function updateScoreUI() {
  document.getElementById("score").textContent      = state.score;
  document.getElementById("streak").textContent     = state.streak;
  document.getElementById("bestStreak").textContent = state.bestStreak;
}

function triggerShake(el) {
  el.classList.remove("shake");
  // Force reflow so re-adding the class restarts the animation
  void el.offsetWidth;
  el.classList.add("shake");
}

function show(id) { document.getElementById(id).classList.remove("hidden"); }
function hide(id) { document.getElementById(id).classList.add("hidden"); }