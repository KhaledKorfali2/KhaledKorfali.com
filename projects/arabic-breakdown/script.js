const input = document.getElementById("arabicInput");
const breakButton = document.getElementById("breakButton");
const output = document.getElementById("output");

let arabicVoice = null;
let fallbackVoice = null;
let voicesLoaded = false;

// --- Load available voices and pick Arabic + fallback ---
function loadVoices() {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return; // voices not loaded yet

  voicesLoaded = true;
  arabicVoice = voices.find(v => v.lang && v.lang.startsWith("ar")) || null;
  fallbackVoice = voices.find(v => v.lang && v.lang.startsWith("en")) || null;

  console.log("Available voices:", voices.map(v => `${v.name} (${v.lang})`));

  if (!arabicVoice && !loadVoices.warned) {
    loadVoices.warned = true;
    alert(
      "⚠️ No Arabic voice found for text-to-speech.\n\n" +
      "To enable Arabic speech:\n\n" +
      "🖥️ Windows: Settings → Time & Language → Language & Region → Add Arabic → Speech → Download voice pack.\n" +
      "📱 Android: Settings → Languages → Add Arabic → Restart Chrome.\n" +
      "🍎 iOS/macOS: Settings → Accessibility → Spoken Content → Voices → Add Arabic.\n\n" +
      "Until then, English will be used as a fallback."
    );
  }
}

// --- Ensure voices are loaded ---
if ("speechSynthesis" in window) {
  speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();
} else {
  alert("Speech synthesis not supported in this browser.");
}

// --- Speak text helper ---
async function speakArabic(text) {
  if (!("speechSynthesis" in window)) {
    alert("Sorry, your browser doesn’t support speech synthesis.");
    return;
  }

  // Wait until voices are loaded
  if (!voicesLoaded) {
    console.log("Voices not ready yet — waiting...");
    await new Promise(resolve => setTimeout(resolve, 500));
    loadVoices();
  }

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = arabicVoice ? "ar-SA" : "en-US";
  utter.voice = arabicVoice || fallbackVoice || null;

  // Helpful debugging output
  console.log("🔊 Speaking:", text);
  console.log("Using voice:", utter.voice ? utter.voice.name : "none");

  try {
    speechSynthesis.cancel(); // Stop previous speech
    speechSynthesis.speak(utter);
  } catch (err) {
    console.error("Speech synthesis error:", err);
    alert("⚠️ Speech synthesis failed — see console for details.");
  }
}



// --- Main breakdown logic ---
breakButton.addEventListener("click", () => {
  const text = input.value.trim();
  if (!text) return;

  output.innerHTML = "";
  const words = text.split(/[\s،؟.!]+/).filter(Boolean);

  words.forEach(word => {
    const wordBlock = document.createElement("div");
    wordBlock.className = "word-block";

    // 🔊 Speak entire word
    const speakWordBtn = document.createElement("button");
    speakWordBtn.textContent = "🔊";
    speakWordBtn.className = "speak-btn";
    speakWordBtn.onclick = () => speakArabic(word);
    wordBlock.appendChild(speakWordBtn);

    // 📖 Word text
    const wordBox = document.createElement("span");
    wordBox.className = "word";
    wordBox.textContent = word;
    wordBlock.appendChild(wordBox);

    // Expand/collapse letters when word clicked
    wordBox.addEventListener("click", () => toggleLetters(wordBlock, word));

    output.appendChild(wordBlock);
  });
});

// --- Expand or collapse letters ---
function toggleLetters(wordBlock, word) {
  // If already expanded, revert to single word
  if (wordBlock.dataset.expanded === "true") {
    wordBlock.innerHTML = "";

    const speakWordBtn = document.createElement("button");
    speakWordBtn.textContent = "🔊";
    speakWordBtn.className = "speak-btn";
    speakWordBtn.onclick = () => speakArabic(word);
    wordBlock.appendChild(speakWordBtn);

    const wordSpan = document.createElement("span");
    wordSpan.className = "word";
    wordSpan.textContent = word;
    wordSpan.addEventListener("click", () => toggleLetters(wordBlock, word));
    wordBlock.appendChild(wordSpan);

    wordBlock.dataset.expanded = "false";
    return;
  }

  // Otherwise, show letters with TTS
  wordBlock.innerHTML = "";
  const letters = Array.from(word);

  letters.forEach(ch => {
    const letterWrap = document.createElement("div");
    letterWrap.style.display = "inline-flex";
    letterWrap.style.alignItems = "center";
    letterWrap.style.gap = "4px";

    const letterBox = document.createElement("span");
    letterBox.className = "letter";
    letterBox.textContent = ch;

    const speakLetterBtn = document.createElement("button");
    speakLetterBtn.textContent = "🔊";
    speakLetterBtn.className = "speak-btn";
    speakLetterBtn.onclick = () => speakArabic(ch);

    letterWrap.appendChild(letterBox);
    letterWrap.appendChild(speakLetterBtn);

    wordBlock.appendChild(letterWrap);
  });

  wordBlock.dataset.expanded = "true";
}
