const guessGrid = document.getElementById("guess-grid");
const keyboard = document.getElementById("keyboard");
const hintText = document.getElementById("hint-txt");
const toggleHintBtn = document.getElementById("toggle-hint-btn");
const resultMessage = document.getElementById("result-message");
const targetWordDisplay = document.getElementById("target-word");
const resetBtn = document.getElementById("reset-btn");
const studyToggle = document.getElementById("study-toggle");
const nativeInput = document.getElementById("native-input");




let quranWords = [];    // Loaded from quran_words.json
let targetWord = "";
let targetHint = "";
let curGuess = [];
let curAttempt = 0;
let wordLen = 0;
let maxAttempts = 5;
let gameOver = false;
let studyMode = false;

const arabicLetters = [..."ابتثجحخدذرزسشصضطظعغفقكلمنهويءىة"];

function chooseRandomWord() {
    return quranWords[Math.floor(Math.random() * quranWords.length)];
}

function drawRow(attempt) {
    const row = document.createElement("div");
    row.classList.add("guess-row");
    row.id = `row-${attempt}`;

    for (let i = 0; i < wordLen; i++) {
        const box = document.createElement("div");
        box.className = "letter-box";
        row.appendChild(box);
    }

    guessGrid.appendChild(row);
}

function createKeyboard() {
  // existing letters
   arabicLetters.forEach(letter => {
    const key = document.createElement("div");
    key.className = "key";
    key.textContent = letter;
    key.onclick = () => { pressVisualFor(letter); handlekey(letter); };
    keyboard.appendChild(key);
  });

  // spacer (optional)
  const spacer = document.createElement("div");
  spacer.style.flexBasis = "100%";
  spacer.style.height = "6px";
  keyboard.appendChild(spacer);

  // Backspace
  const backKey = document.createElement("div");
  backKey.className = "key key-control key-backspace";
  backKey.textContent = "⌫";                // icon keeps RTL nice
  backKey.title = "Backspace";
  backKey.onclick = doBackspace;
  keyboard.appendChild(backKey);

  // Enter
  const enterKey = document.createElement("div");
  enterKey.className = "key key-control key-enter";
  enterKey.textContent = "⏎";               // icon keeps RTL nice
  enterKey.title = "Enter";
  enterKey.onclick = submitGuess;
  keyboard.appendChild(enterKey);
}


function focusNativeInput() {
  // On iOS/Safari the focus call must be within a user gesture
  nativeInput && nativeInput.focus();
}

// Focus when user taps/clicks anywhere relevant
["guess-grid", "keyboard", "result-message"].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("click", focusNativeInput);
  }
});
document.addEventListener("touchstart", focusNativeInput, { passive: true });


function handlekey(letter) {
    if (gameOver || curGuess.length >= wordLen) return;
    curGuess.push(letter);
    updateRow();
}

function updateRow() {
    const row = document.getElementById(`row-${curAttempt}`);
    row.querySelectorAll(".letter-box").forEach((box, i) => {
        box.textContent = curGuess[i] || "";
    });

    //if (curGuess.length === wordLen) checkGuess();
}

function pressVisualFor(letter) {
  const key = [...keyboard.children].find(k => k.textContent === letter);
  if (!key) return;
  key.classList.add("pressed");
  setTimeout(() => key.classList.remove("pressed"), 120);
}

function checkGuess() {
  const row = document.getElementById(`row-${curAttempt}`);
  const targetArr = targetWord.split("");
  const guessArr = [...curGuess];

  const remainingLetters = [...targetArr];

  // Pass 1: exact matches (green)
  guessArr.forEach((letter, i) => {
    const box = row.children[i];
    if (letter === targetArr[i]) {
      box.classList.add("correct");
      markKeyboard(letter, "correct");
      remainingLetters[i] = null;
    }
  });

  // Pass 2: present (yellow) / absent (gray)
  guessArr.forEach((letter, i) => {
    const box = row.children[i];
    if (!box.classList.contains("correct")) {
      const idx = remainingLetters.indexOf(letter);
      if (idx !== -1) {
        box.classList.add("present");
        markKeyboard(letter, "present");
        remainingLetters[idx] = null;
      } else {
        box.classList.add("absent");
        markKeyboard(letter, "absent");
      }
    }
  });

  const isCorrect = curGuess.join("") === targetWord;

  if (isCorrect) {
    targetWordDisplay.textContent = `The word was: ${targetWord}`;
    targetWordDisplay.style.display = "block";

    if (studyMode) {
      resultMessage.textContent = "✅ Correct! Loading next word…";
      setTimeout(() => {
        startGame();        // start a fresh word, keep studyMode as-is
        resultMessage.textContent = "🧠 Study Mode: unlimited tries, no win/lose.";
      }, 700);
      return;
    } else {
      resultMessage.textContent = "🎉 🎉 🎉 You Win 🎉 🎉 🎉";
      gameOver = true;
      return;
    }
  }

  // If not correct:
  curAttempt++;

  if (studyMode) {
    // Unlimited attempts: just add another row and continue
    curGuess = [];
    drawRow(curAttempt);
    return;
  }

  // Normal mode: enforce attempt limit
  if (curAttempt < maxAttempts) {
    curGuess = [];
    drawRow(curAttempt);
  } else {
    resultMessage.textContent = "❌ You Lose ❌";
    targetWordDisplay.textContent = `The word was: ${targetWord}`;
    targetWordDisplay.style.display = "block";
    gameOver = true;
  }
}


function markKeyboard(letter, status) {
    const key = [...keyboard.children].find(k => k.textContent === letter);
    if (!key) return;
    if (status === "correct") {
        key.className = "key correct";
    } else if (status === "present" && !key.classList.contains("correct")) {
        key.className = "key present";
    } else if (status === "absent" && !key.classList.contains("correct") && !key.classList.contains("present")) {
        key.className = "key absent";
    }
}


studyToggle.addEventListener("change", (e) => {
  studyMode = e.target.checked;

  if (studyMode) {
    resultMessage.textContent = "🧠 Study Mode: word shown; unlimited tries.";
    // reveal the Arabic word while practicing
    targetWordDisplay.textContent = targetWord;
    targetWordDisplay.style.display = "block";
  } else {
    resultMessage.textContent = "";
    // hide the word again in normal mode (unless already revealed by win/lose)
    if (!gameOver) {
        targetWordDisplay.style.display = "none";
    }
  }
});



// Accept desktop hardware keyboard
// Desktop hardware keyboard visual press:
document.addEventListener("keydown", (e) => {
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;

  if (e.key === "Backspace") { doBackspace(); e.preventDefault(); pressVisualFor("⌫"); return; }
  if (e.key === "Enter")     { submitGuess(); e.preventDefault(); pressVisualFor("⏎"); return; }

  if (e.key && e.key.length === 1 && arabicLetters.includes(e.key)) {
    if (!gameOver || studyMode) { handlekey(e.key); pressVisualFor(e.key); }
    e.preventDefault();
  }
});

// Capture characters from the hidden input (mobile software keyboard)
if (nativeInput) {
  nativeInput.addEventListener("input", (e) => {
    const v = e.target.value;
    if (!v) return;

    const ch = v[v.length - 1];
    e.target.value = "";

    if (arabicLetters.includes(ch)) {
      if (!gameOver || studyMode) handlekey(ch);
    }
  });
}


// Keep focus after actions so mobile KB stays open
["reset-btn", "toggle-hint-btn"].forEach(id => {
  const btn = document.getElementById(id);
  if (btn) btn.addEventListener("click", () => {
    setTimeout(focusNativeInput, 0);
  });
});


function doBackspace() {
  if (gameOver && !studyMode) return;
  if (curGuess.length > 0) {
    curGuess.pop();
    updateRow();
  }
}

function submitGuess() {
  if (gameOver && !studyMode) return;

  if (curGuess.length === wordLen) {
    checkGuess();
  } else {
    const row = document.getElementById(`row-${curAttempt}`);
    if (row) {
      row.classList.remove("shake");       // reset if still on element
      void row.offsetWidth;                // reflow to restart animation
      row.classList.add("shake");

      // light haptic on supported mobiles (optional)
      if (navigator.vibrate) navigator.vibrate(50);

      // remove class after animation ends (cleanup)
      row.addEventListener("animationend", () => {
        row.classList.remove("shake");
      }, { once: true });
    }
  }
}



resetBtn.addEventListener("click", startGame);

toggleHintBtn.addEventListener("click", () => {
    if (gameOver || !targetHint) return;
    hintText.textContent = `Hint: It means "${targetHint}"`;
    hintText.style.display = "block";
    hintText.setAttribute("dir", "ltr");
});

function startGame() {
    gameOver = false;
    curAttempt = 0;
    curGuess = [];
    resultMessage.textContent = "";
    targetWordDisplay.textContent = "";
    targetWordDisplay.style.display = "none";
    hintText.style.display = "none";
    guessGrid.innerHTML = "";
    keyboard.innerHTML = "";

    const chosenWord = chooseRandomWord();
    targetWord = chosenWord.word;
    targetHint = chosenWord.meaning;
    wordLen = targetWord.length;

    drawRow(curAttempt);
    createKeyboard();
    focusNativeInput();


    if (studyMode) {
        targetWordDisplay.textContent = targetWord;   // show Arabic word
        targetWordDisplay.style.display = "block";
    } else {
        targetWordDisplay.style.display = "none";
    }
}

async function loadQuranWords() {
    try {
        const res = await fetch("quran_words.json");
        quranWords = await res.json();
        startGame();
    } catch (error) {
        console.error("Failed to load quran_words.json:", error);
        resultMessage.textContent = "⚠️ Could not load word list.";
    }
}

document.addEventListener("DOMContentLoaded", loadQuranWords);
