const guessGrid = document.getElementById("guess-grid");
const keyboard = document.getElementById("keyboard");
const hintText = document.getElementById("hint-txt");
const toggleHintBtn = document.getElementById("toggle-hint-btn");
const resultMessage = document.getElementById("result-message");
const targetWordDisplay = document.getElementById("target-word");
const resetBtn = document.getElementById("reset-btn");


let quranWords = [];    // Loaded from quran_words.json
let targetWord = "";
let targetHint = "";
let curGuess = [];
let curAttempt = 0;
let wordLen = 0;
let maxAttempts = 5;
let gameOver = false;

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
    arabicLetters.forEach(letter => {
        const key = document.createElement("div");
        key.className = "key";
        key.textContent = letter;
        key.onclick = () => handlekey(letter);
        keyboard.appendChild(key);
    });
}

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

    if (curGuess.length === wordLen) checkGuess();
}

function checkGuess() {
    const row = document.getElementById(`row-${curAttempt}`);

    curGuess.forEach((letter, i) => {
        const box = row.children[i];
        if (letter === targetWord[i]) box.classList.add("correct");
    });

    if (curGuess.join("") === targetWord) {
        resultMessage.textContent = "🎉 🎉 🎉 You Win 🎉 🎉 🎉 ";
        targetWordDisplay.textContent = `The word was: ${targetWord}`;
        targetWordDisplay.style.display = "block";
        gameOver = true;
        return;
    }

    curAttempt++;
    if (curAttempt < maxAttempts) {
        curGuess = [];
        drawRow(curAttempt);
    } else {
        resultMessage.textContent = "❌❌ ❌  You Lose ❌ ❌ ❌";
        targetWordDisplay.textContent = `The word was: ${targetWord}`;
        targetWordDisplay.style.display = "block";
        gameOver = true;
    }
}

resetBtn.addEventListener("click", startGame);

toggleHintBtn.addEventListener("click", () => {
    if (gameOver || !targetHint) return;
    hintText.textContent = `${targetWord} (Hint: It means "${targetHint}")`;
    hintText.style.display = "block";
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
