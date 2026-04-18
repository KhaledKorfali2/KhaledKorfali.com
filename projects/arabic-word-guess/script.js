const guessGrid        = document.getElementById("guess-grid");
const keyboard         = document.getElementById("keyboard");
const hintText         = document.getElementById("hint-txt");
const toggleHintBtn    = document.getElementById("toggle-hint-btn");
const resultMessage    = document.getElementById("result-message");
const targetWordDisplay = document.getElementById("target-word");
const resetBtn         = document.getElementById("reset-btn");
const studyToggle      = document.getElementById("study-toggle");
const nativeInput      = document.getElementById("native-input");
const useNativeKbToggle = document.getElementById("use-native-keyboard");

let quranWords   = [];
let targetWord   = "";
let targetHint   = "";
let curGuess     = [];
let curAttempt   = 0;
let wordLen      = 0;
let maxAttempts  = 5;
let gameOver     = false;
let studyMode    = false;
let useNativeKb  = useNativeKbToggle.checked;

const arabicLetters = [..."ابتثجحخدذرزسشصضطظعغفقكلمنهويءىة"];

// ── Native keyboard toggle ────────────────────────────────────
function applyKbMode() {
  if (useNativeKb) {
    nativeInput.style.display = "block";
    keyboard.style.pointerEvents = "none";
    keyboard.style.opacity = "0.5";
    focusNative();
  } else {
    nativeInput.style.display = "none";
    keyboard.style.pointerEvents = "auto";
    keyboard.style.opacity = "1";
  }
}

useNativeKbToggle.addEventListener("change", () => {
  useNativeKb = useNativeKbToggle.checked;
  applyKbMode();
});

function focusNative() {
  if (useNativeKb && nativeInput) nativeInput.focus({ preventScroll: true });
}

["guess-grid", "keyboard", "result-message"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", focusNative);
});
document.addEventListener("touchstart", focusNative, { passive: true });

// ── Word choice ───────────────────────────────────────────────
function chooseRandomWord() {
  return quranWords[Math.floor(Math.random() * quranWords.length)];
}

// ── Draw one guess row ────────────────────────────────────────
function drawRow(attempt) {
  const row = document.createElement("div");
  row.className = "guess-row";
  row.id = `row-${attempt}`;
  for (let i = 0; i < wordLen; i++) {
    const box = document.createElement("div");
    box.className = "letter-box";
    row.appendChild(box);
  }
  guessGrid.appendChild(row);
}

// ── Build on-screen keyboard ──────────────────────────────────
function createKeyboard() {
  arabicLetters.forEach(letter => {
    const key = document.createElement("div");
    key.className = "key";
    key.textContent = letter;
    key.onclick = () => { pressVisualFor(letter); handleKey(letter); };
    keyboard.appendChild(key);
  });

  const spacer = document.createElement("div");
  spacer.style.cssText = "flex-basis:100%; height:4px;";
  keyboard.appendChild(spacer);

  const backKey = document.createElement("div");
  backKey.className = "key key-control";
  backKey.textContent = "⌫";
  backKey.onclick = doBackspace;
  keyboard.appendChild(backKey);

  const enterKey = document.createElement("div");
  enterKey.className = "key key-control";
  enterKey.textContent = "⏎";
  enterKey.onclick = submitGuess;
  keyboard.appendChild(enterKey);
}

// ── Input handling ────────────────────────────────────────────
function handleKey(letter) {
  if (gameOver) return;
  const row = document.getElementById(`row-${curAttempt}`);
  if (curGuess.length >= wordLen) {
    if (row) { row.classList.remove("shake"); void row.offsetWidth; row.classList.add("shake"); }
    if (navigator.vibrate) navigator.vibrate(30);
    return;
  }
  curGuess.push(letter);
  updateRow();
}

function updateRow() {
  const row = document.getElementById(`row-${curAttempt}`);
  row.querySelectorAll(".letter-box").forEach((box, i) => {
    box.textContent = curGuess[i] || "";
  });
}

function doBackspace() {
  if (gameOver && !studyMode) return;
  if (curGuess.length > 0) { curGuess.pop(); updateRow(); }
  if (useNativeKb) focusNative();
}

function submitGuess() {
  if (gameOver && !studyMode) return;
  if (curGuess.length === wordLen) {
    checkGuess();
  } else {
    const row = document.getElementById(`row-${curAttempt}`);
    if (row) {
      row.classList.remove("shake");
      void row.offsetWidth;
      row.classList.add("shake");
      if (navigator.vibrate) navigator.vibrate(50);
      row.addEventListener("animationend", () => row.classList.remove("shake"), { once: true });
    }
  }
  if (useNativeKb) focusNative();
}

// ── Visual key press ──────────────────────────────────────────
function pressVisualFor(letter) {
  const key = [...keyboard.children].find(k => k.textContent === letter);
  if (!key) return;
  key.classList.add("pressed");
  setTimeout(() => key.classList.remove("pressed"), 120);
}

// ── Check guess ───────────────────────────────────────────────
function checkGuess() {
  const row        = document.getElementById(`row-${curAttempt}`);
  const targetArr  = targetWord.split("");
  const guessArr   = [...curGuess];
  const remaining  = [...targetArr];

  // Pass 1: exact
  guessArr.forEach((letter, i) => {
    if (letter === targetArr[i]) {
      row.children[i].classList.add("correct");
      markKey(letter, "correct");
      remaining[i] = null;
    }
  });

  // Pass 2: present / absent
  guessArr.forEach((letter, i) => {
    const box = row.children[i];
    if (!box.classList.contains("correct")) {
      const idx = remaining.indexOf(letter);
      if (idx !== -1) {
        box.classList.add("present");
        markKey(letter, "present");
        remaining[idx] = null;
      } else {
        box.classList.add("absent");
        markKey(letter, "absent");
      }
    }
  });

  const isCorrect = curGuess.join("") === targetWord;

  if (isCorrect) {
    targetWordDisplay.textContent  = targetWord;
    targetWordDisplay.style.display = "block";
    if (studyMode) {
      resultMessage.textContent = "✓ Correct — loading next word…";
      setTimeout(startGame, 700);
    } else {
      resultMessage.textContent = "🎉 You got it!";
      gameOver = true;
    }
    return;
  }

  curAttempt++;
  if (studyMode) {
    curGuess = [];
    drawRow(curAttempt);
    return;
  }

  if (curAttempt < maxAttempts) {
    curGuess = [];
    drawRow(curAttempt);
  } else {
    resultMessage.textContent  = "The word was:";
    targetWordDisplay.textContent  = targetWord;
    targetWordDisplay.style.display = "block";
    gameOver = true;
  }
}

// ── Mark keyboard key ─────────────────────────────────────────
function markKey(letter, status) {
  const key = [...keyboard.children].find(k => k.textContent === letter);
  if (!key) return;
  if (status === "correct") {
    key.classList.remove("present", "absent");
    key.classList.add("correct");
  } else if (status === "present" && !key.classList.contains("correct")) {
    key.classList.remove("absent");
    key.classList.add("present");
  } else if (status === "absent" && !key.classList.contains("correct") && !key.classList.contains("present")) {
    key.classList.add("absent");
  }
}

// ── Study mode toggle ─────────────────────────────────────────
studyToggle.addEventListener("change", (e) => {
  studyMode = e.target.checked;
  if (studyMode) {
    resultMessage.textContent      = "Study mode: word shown, unlimited tries.";
    targetWordDisplay.textContent  = targetWord;
    targetWordDisplay.style.display = "block";
  } else {
    resultMessage.textContent = "";
    if (!gameOver) targetWordDisplay.style.display = "none";
  }
});

// ── Hardware keyboard ─────────────────────────────────────────
document.addEventListener("keydown", (e) => {
  const tag = (e.target?.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
  if (e.key === "Backspace") { doBackspace(); e.preventDefault(); pressVisualFor("⌫"); return; }
  if (e.key === "Enter")     { submitGuess(); e.preventDefault(); pressVisualFor("⏎"); return; }
  if (e.key?.length === 1 && arabicLetters.includes(e.key)) {
    if (!gameOver || studyMode) { handleKey(e.key); pressVisualFor(e.key); }
    e.preventDefault();
  }
});

// ── Native mobile input ───────────────────────────────────────
if (nativeInput) {
  nativeInput.addEventListener("beforeinput", (e) => {
    if (!useNativeKb || (gameOver && !studyMode)) return;
    if (e.inputType === "deleteContentBackward") { doBackspace(); pressVisualFor("⌫"); }
    else if (e.inputType === "insertLineBreak")  { submitGuess(); pressVisualFor("⏎"); }
    else if (e.data && arabicLetters.includes(e.data)) { handleKey(e.data); pressVisualFor(e.data); }
    e.preventDefault();
    nativeInput.value = "";
  });

  nativeInput.addEventListener("input", (e) => {
    if (!useNativeKb || (gameOver && !studyMode) || !e.target.value) return;
    const ch = e.target.value.at(-1);
    e.target.value = "";
    if (ch === "\n") { submitGuess(); pressVisualFor("⏎"); }
    else if (arabicLetters.includes(ch)) { handleKey(ch); pressVisualFor(ch); }
  });
}

["reset-btn", "toggle-hint-btn"].forEach(id => {
  document.getElementById(id)?.addEventListener("click", () => setTimeout(focusNative, 0));
});

// ── Hint ──────────────────────────────────────────────────────
toggleHintBtn.addEventListener("click", () => {
  if (gameOver || !targetHint) return;
  hintText.textContent = `Hint: "${targetHint}"`;
  hintText.style.display = "block";
});

// ── Start / reset ─────────────────────────────────────────────
function startGame() {
  gameOver       = false;
  curAttempt     = 0;
  curGuess       = [];
  resultMessage.textContent      = "";
  targetWordDisplay.textContent  = "";
  targetWordDisplay.style.display = "none";
  hintText.style.display          = "none";
  guessGrid.innerHTML             = "";
  keyboard.innerHTML              = "";
  nativeInput.value               = "";

  const chosen  = chooseRandomWord();
  targetWord    = chosen.word;
  targetHint    = chosen.meaning;
  wordLen       = targetWord.length;

  drawRow(0);
  createKeyboard();
  applyKbMode();
  focusNative();

  if (studyMode) {
    targetWordDisplay.textContent  = targetWord;
    targetWordDisplay.style.display = "block";
  }
}

resetBtn.addEventListener("click", startGame);

// ── Load words and go ─────────────────────────────────────────
async function loadQuranWords() {
  try {
    const res  = await fetch("quran_words.json");
    quranWords = await res.json();
    startGame();
  } catch (err) {
    console.error("Failed to load quran_words.json:", err);
    resultMessage.textContent = "⚠ Could not load word list.";
  }
}

document.addEventListener("DOMContentLoaded", loadQuranWords);