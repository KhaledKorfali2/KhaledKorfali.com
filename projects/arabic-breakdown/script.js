const inputText = document.getElementById("inputText");
const analyzeBtn = document.getElementById("analyzeBtn");
const outputDiv = document.getElementById("output");
const playAllBtn = document.getElementById("playAllBtn");

let voices = [];
let arabicVoice = null;

function loadVoices() {
  voices = speechSynthesis.getVoices();
  arabicVoice = voices.find(v => v.lang.startsWith("ar"));
}

window.speechSynthesis.onvoiceschanged = loadVoices;

function speak(text, voice = arabicVoice) {
  if (!text) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = voice ? voice.lang : "ar-SA";
  utter.voice = voice || voices.find(v => v.lang.startsWith("ar")) || voices[0];
  console.log("🔊 Speaking:", text);
  speechSynthesis.speak(utter);
}

analyzeBtn.addEventListener("click", () => {
  const text = inputText.value.trim();
  if (!text) return;

  outputDiv.innerHTML = "";

  const words = text.split(/\s+/);

  words.forEach((word) => {
    const wordCard = document.createElement("div");
    wordCard.className = "word-card";

    const wordHeader = document.createElement("div");
    wordHeader.className = "word-header";
    wordHeader.innerHTML = `<span class="word-text">${word}</span> 
      <button class="play-btn" title="Speak word">🔊</button>`;

    const lettersDiv = document.createElement("div");
    lettersDiv.className = "letters";

    for (let char of word) {
      const letter = document.createElement("span");
      letter.className = "letter";
      letter.textContent = char;
      lettersDiv.appendChild(letter);
    }

    wordCard.appendChild(wordHeader);
    wordCard.appendChild(lettersDiv);
    outputDiv.appendChild(wordCard);

    // Attach TTS handler
    wordHeader.querySelector(".play-btn").addEventListener("click", () => {
      speak(word);
    });
  });
});

playAllBtn.addEventListener("click", () => {
  const text = inputText.value.trim();
  if (text) speak(text);
});
