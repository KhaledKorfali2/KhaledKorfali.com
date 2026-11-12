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
const guessAnnouncer   = document.getElementById("guess-announcer");

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
let nextWordTimer = null;

const arabicLetters = [..."ابتثجحخدذرزسشصضطظعغفقكلمنهويءىة"];

// Alif variants a physical/phone keyboard may produce → plain alif, which is
// the only alif on the on-screen keyboard
const LETTER_ALIASES = { "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا" };
// Harakat, Qur'anic marks and tatweel — stripped from words and input
const DIACRITICS_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

function normalizeLetter(ch) {
  return LETTER_ALIASES[ch] || ch;
}

function normalizeWord(word) {
  return [...String(word).replace(DIACRITICS_RE, "").trim()].map(normalizeLetter).join("");
}

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
// Re-open the device keyboard on taps — but not when tapping links or the
// toggles, or it pops up while the user is trying to navigate away
document.addEventListener("touchstart", (e) => {
  if (e.target.closest("a, label, input, header, footer")) return;
  focusNative();
}, { passive: true });

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
  // Real buttons (keyboard/screen-reader operable). preventDefault on
  // mousedown stops them stealing focus, so a following hardware Enter
  // submits the guess instead of re-pressing the last clicked key.
  const makeKey = (label, onPress, extraClass, ariaLabel) => {
    const key = document.createElement("button");
    key.type = "button";
    key.className = "key" + (extraClass ? " " + extraClass : "");
    key.textContent = label;
    if (ariaLabel) key.setAttribute("aria-label", ariaLabel);
    key.addEventListener("mousedown", e => e.preventDefault());
    key.onclick = onPress;
    keyboard.appendChild(key);
    return key;
  };

  arabicLetters.forEach(letter => {
    makeKey(letter, () => { pressVisualFor(letter); handleKey(letter); });
  });

  const spacer = document.createElement("div");
  spacer.style.cssText = "flex-basis:100%; height:4px;";
  spacer.setAttribute("aria-hidden", "true");
  keyboard.appendChild(spacer);

  makeKey("⌫", doBackspace, "key-control", "Delete letter");
  makeKey("⏎", submitGuess, "key-control key-enter", "Submit guess");
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
  if (!row) return;
  row.querySelectorAll(".letter-box").forEach((box, i) => {
    box.textContent = curGuess[i] || "";
    box.classList.toggle("filled", Boolean(curGuess[i]));
  });
}

function doBackspace() {
  if (gameOver) return;
  if (curGuess.length > 0) { curGuess.pop(); updateRow(); }
  if (useNativeKb) focusNative();
}

function submitGuess() {
  if (gameOver) return;
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
  const targetArr  = [...targetWord];
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
  announceRow(row);

  if (isCorrect) {
    targetWordDisplay.textContent  = targetWord;
    targetWordDisplay.style.display = "block";
    if (studyMode) {
      resultMessage.textContent = "✓ Correct — loading next word…";
      // Lock input until the next word loads — previously the solved row
      // stayed editable and Enter could schedule startGame() twice
      gameOver = true;
      clearTimeout(nextWordTimer);
      nextWordTimer = setTimeout(startGame, 700);
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

// Screen-reader summary of a scored row
function announceRow(row) {
  const words = { correct: "correct", present: "wrong place", absent: "not in word" };
  const parts = [...row.children].map(box => {
    const status = ["correct", "present", "absent"].find(c => box.classList.contains(c));
    return `${box.textContent} ${words[status] || ""}`;
  });
  guessAnnouncer.textContent = `Guess ${curAttempt + 1}: ${parts.join(", ")}`;
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
  } else if (!gameOver) {
    // Don't wipe the "The word was:" / win message of a finished game
    resultMessage.textContent = "";
    targetWordDisplay.style.display = "none";
  }
});

// ── Hardware keyboard ─────────────────────────────────────────
document.addEventListener("keydown", (e) => {
  const tag = (e.target?.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  // A focused button keeps Enter/Space for itself; letters and Backspace
  // still reach the game (previously all typing died after clicking
  // "New Word" because focus stayed on that button)
  if (tag === "BUTTON" && (e.key === "Enter" || e.key === " ")) return;
  if (e.key === "Backspace") { doBackspace(); e.preventDefault(); pressVisualFor("⌫"); return; }
  if (e.key === "Enter")     { submitGuess(); e.preventDefault(); pressVisualFor("⏎"); return; }
  const ch = e.key?.length === 1 ? normalizeLetter(e.key) : "";
  if (ch && arabicLetters.includes(ch)) {
    if (!gameOver) { handleKey(ch); pressVisualFor(ch); }
    e.preventDefault();
  }
});

// ── Native mobile input ───────────────────────────────────────
if (nativeInput) {
  nativeInput.addEventListener("beforeinput", (e) => {
    if (!useNativeKb || gameOver) return;
    if (e.inputType === "deleteContentBackward") { doBackspace(); pressVisualFor("⌫"); }
    else if (e.inputType === "insertLineBreak")  { submitGuess(); pressVisualFor("⏎"); }
    else if (e.data) {
      // Some keyboards insert several characters at once (autocomplete)
      [...e.data].map(normalizeLetter).forEach(ch => {
        if (arabicLetters.includes(ch)) { handleKey(ch); pressVisualFor(ch); }
      });
    }
    e.preventDefault();
    nativeInput.value = "";
  });

  nativeInput.addEventListener("input", (e) => {
    if (!useNativeKb || gameOver || !e.target.value) return;
    const ch = normalizeLetter(e.target.value.at(-1));
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
  if (!targetHint) {
    hintText.textContent = "No hint available for this word.";
    hintText.style.display = "block";
    return;
  }
  hintText.textContent = `Hint: "${targetHint}"`;
  hintText.style.display = "block";
});

// ── Start / reset ─────────────────────────────────────────────
function startGame() {
  if (!quranWords.length) return;
  clearTimeout(nextWordTimer);
  nextWordTimer  = null;
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
  guessAnnouncer.textContent      = "";

  // Avoid repeating the word just played when there's a choice
  let chosen = chooseRandomWord();
  if (quranWords.some(w => w.word !== targetWord)) {
    while (chosen.word === targetWord) chosen = chooseRandomWord();
  }
  targetWord    = chosen.word;
  targetHint    = chosen.meaning;
  wordLen       = [...targetWord].length;

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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("word list is not an array");

    // Keep only words the on-screen keyboard can actually spell
    quranWords = data
      .filter(w => w && typeof w.word === "string")
      .map(w => ({
        word: normalizeWord(w.word),
        meaning: typeof w.meaning === "string" ? w.meaning.trim() : "",
      }))
      .filter(w => {
        const letters = [...w.word];
        return letters.length >= 2 && letters.length <= 7 &&
               letters.every(ch => arabicLetters.includes(ch));
      });
    // Drop entries that normalise to a word already in the list
    const seenWords = new Set();
    quranWords = quranWords.filter(w => !seenWords.has(w.word) && seenWords.add(w.word));
    if (!quranWords.length) throw new Error("word list is empty");

    startGame();
  } catch (err) {
    console.error("Failed to load quran_words.json:", err);
    resultMessage.textContent = "⚠ Could not load the word list — refresh to try again.";
  }
}

document.addEventListener("DOMContentLoaded", loadQuranWords);