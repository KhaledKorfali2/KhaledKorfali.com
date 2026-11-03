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

  // pending auto-advance timer — cleared on restart/exit so a stale
  // callback can't advance (or evaluate) a freshly started quiz
  timer: null,
};

function schedule(fn, ms) {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => { state.timer = null; fn(); }, ms);
}

function cancelScheduled() {
  clearTimeout(state.timer);
  state.timer = null;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  await loadSurahs();
  bindSettingsUI();
  bindActionButtons();
  bindKeyboard();
});

async function loadSurahs() {
  try {
    const res = await fetch("./surahs.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length < 4) throw new Error("unexpected surahs.json format");
    surahs = data;
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

  const endlessWrap  = document.getElementById("endlessModeToggleWrap");
  const endlessInput = document.getElementById("endlessMode");
  endlessWrap.classList.toggle("faded", isOrdering);
  // .faded only blocks the mouse — disable so it's skipped by Tab too
  endlessInput.disabled = isOrdering;
  if (isOrdering) {
    endlessInput.checked = false;
    state.endless = false;
  }
}

function bindActionButtons() {
  document.getElementById("startBtn").addEventListener("click", startQuiz);
  document.getElementById("restartBtn").addEventListener("click", startQuiz);
  document.getElementById("tryAgainBtn").addEventListener("click", startQuiz);
  document.getElementById("changeSettingsBtn").addEventListener("click", showSettings);
  document.getElementById("exitBtn").addEventListener("click", () => {
    // Endless mode has no natural end — show the summary instead of
    // silently discarding the session
    if (state.endless && state.totalAnswered > 0) endQuiz();
    else showSettings();
  });
}

// Number keys choose an answer; Enter confirms the selected one
function bindKeyboard() {
  document.addEventListener("keydown", e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (document.getElementById("quiz").classList.contains("hidden")) return;
    if (e.target.closest("input, textarea, select")) return;

    if (/^[1-9]$/.test(e.key)) {
      const btn = document.querySelectorAll("#answers .answer-btn")[Number(e.key) - 1];
      if (btn && !btn.disabled) { btn.click(); btn.focus({ preventScroll: true }); }
      return;
    }

    if (e.key === "Enter" && state.recallPhase === "selecting" &&
        e.target.id !== "confirmBtn") {
      e.preventDefault(); // don't also "click" (deselect) the focused answer
      document.getElementById("confirmBtn").click();
    }
  });
}

// ── Quiz lifecycle ────────────────────────────────────────────────────────────

function startQuiz() {
  if (!surahs.length) return;
  cancelScheduled();

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
  announce("");
  nextQuestion();
  focusQuestion();
}

function showSettings() {
  cancelScheduled();
  hide("endScreen");
  hide("statsBar");
  hide("quiz");
  hide("progressContainer");
  hide("confirmBar");
  document.getElementById("disputedNote")?.remove();
  show("settingsCard");
  state.recallPhase = "idle";
  state.selectedBtn = null;
  document.getElementById("startBtn").focus({ preventScroll: true });
}

function endQuiz() {
  cancelScheduled();
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
  document.getElementById("endTitle").focus({ preventScroll: true });
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
  document.getElementById("disputedNote")?.remove();

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

// Move keyboard/screen-reader focus to the new question, but only if focus
// was already in the quiz (don't yank it from elsewhere on the page)
function focusQuestion() {
  const active = document.activeElement;
  const quiz   = document.getElementById("quiz");
  if (!active || active === document.body || quiz.contains(active) ||
      active.closest?.("#confirmBar, #statsBar, #endScreen, #settingsCard")) {
    document.getElementById("question").focus({ preventScroll: true });
  }
}

function announce(msg) {
  document.getElementById("liveRegion").textContent = msg;
}

function setKbdHint(text) {
  document.getElementById("kbdHint").textContent = text;
}

// ── Recall ────────────────────────────────────────────────────────────────────

function renderRecallQuestion(q) {
  const { surah, direction } = q;

  document.getElementById("questionNum").textContent = state.endless
    ? "Endless Mode"
    : `Question ${state.questionIndex + 1} of ${state.questionPool.length}`;

  // Set progress before rendering so bar is correct on Q1
  updateRecallProgress();
  setKbdHint("Keys 1–4 select · Enter confirms");

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
      btn.type = "button";
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
      btn.type = "button";
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
    btn.type        = "button";
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
    clickedBtn.setAttribute("aria-pressed", "false");
    state.selectedBtn = null;
    state.recallPhase = "idle";
    hide("confirmBar");
    return;
  }

  // Swap selection
  if (state.selectedBtn) {
    state.selectedBtn.classList.remove("selected");
    state.selectedBtn.setAttribute("aria-pressed", "false");
  }
  clickedBtn.classList.add("selected");
  clickedBtn.setAttribute("aria-pressed", "true");
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
    announce("Correct!");
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
    announce(`Incorrect. The answer was ${correctText}.`);
  }

  updateScoreUI();
  if (!state.endless) state.questionIndex++;

  // Show scholarly disagreement note if this was a revelation question
  // on a surah with documented classification dispute
  if (state.currentQuestion.direction === "revelation" &&
      state.currentQuestion.surah.revelationDisputed) {
    showDisputedNote(state.currentQuestion.surah);
  }

  // Disputed notes need more reading time
  schedule(() => { nextQuestion(); focusQuestion(); },
    document.getElementById("disputedNote") ? 3500 : 1300);
}

function showDisputedNote(surah) {
  // Remove any existing note first
  document.getElementById("disputedNote")?.remove();

  // Built with DOM nodes rather than innerHTML so data from the JSON file
  // is never parsed as markup
  const note = document.createElement("div");
  note.id = "disputedNote";
  note.className = "disputed-note";
  note.setAttribute("role", "note");

  const icon = document.createElement("span");
  icon.className = "disputed-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "⚠";

  const name = document.createElement("strong");
  name.textContent = surah.name.english;
  const type = document.createElement("strong");
  type.textContent = surah.revelation;

  const text = document.createElement("span");
  text.append(
    "Scholars disagree on whether ", name,
    " is Meccan or Medinan. The majority view (Wikipedia, Tanzil) classifies it as ", type,
    ", but a minority scholarly opinion differs."
  );

  note.append(icon, text);

  // Insert after the quiz card
  const quiz = document.getElementById("quiz");
  quiz.insertAdjacentElement("afterend", note);
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
  setKbdHint(state.orderingSurahs.length <= 9
    ? `Keys 1–${state.orderingSurahs.length} pick · tap the last pick again to undo`
    : "Tap the last pick again to undo");

  const shuffled = [...state.orderingSurahs];
  shuffleArray(shuffled);

  shuffled.forEach((surah, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
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
      btn.removeAttribute("aria-label");
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
  btn.setAttribute("aria-label", `${btn.dataset.label}, picked ${pos}`);

  updateOrderingProgress();

  if (state.userOrder.length === state.orderingSurahs.length) {
    // Brief pause so user sees the final selection before evaluation
    document.querySelectorAll(".answer-btn").forEach(b => b.disabled = true);
    schedule(evaluateOrderingAnswer, 500);
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
    btn.removeAttribute("aria-label");
  });

  announce(perfectRound
    ? "Perfect order!"
    : `${correctCount} of ${state.orderingSurahs.length} in the right position. Correct order: ${correct.map(s => s.name.english).join(", ")}.`);

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
  schedule(() => { nextQuestion(); focusQuestion(); }, perfectRound ? 1600 : 3000);
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
  document.getElementById("progressTrack").setAttribute("aria-valuenow", Math.round(pct));
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