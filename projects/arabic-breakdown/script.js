const inputText = document.getElementById("inputText");
const analyzeBtn = document.getElementById("analyzeBtn");
const outputDiv = document.getElementById("output");
const playAllBtn = document.getElementById("playAllBtn");

// ---- TTS ----
let voices = [];
let arabicVoice = null;

function loadVoices() {
  voices = speechSynthesis.getVoices();
  arabicVoice = voices.find(v => v.lang.startsWith("ar"));
}
if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = loadVoices;
}
loadVoices();

function speak(text, voice = arabicVoice) {
  if (!text) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = voice ? voice.lang : "ar-SA";
  utter.voice = voice || voices.find(v => v.lang.startsWith("ar")) || voices[0];
  console.log("🔊 Speaking:", text);
  speechSynthesis.speak(utter);
}

// ---- Word Analysis ----
analyzeBtn.addEventListener("click", () => {
  const text = inputText.value.trim();
  if (!text) return;

  outputDiv.innerHTML = "";
  const words = text.split(/\s+/);

  words.forEach(word => {
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

    wordHeader.querySelector(".play-btn").addEventListener("click", () => {
      speak(word);
    });
  });
});

playAllBtn.addEventListener("click", () => {
  const text = inputText.value.trim();
  if (text) speak(text);
});

// ---- Camera & OCR ----
const scanBtn = document.getElementById("scanBtn");
const cameraModal = document.getElementById("cameraModal");
const camera = document.getElementById("camera");
const captureBtn = document.getElementById("captureBtn");
const closeCameraBtn = document.getElementById("closeCameraBtn");
const snapshotCanvas = document.getElementById("snapshotCanvas");

let stream = null;

async function openCameraModal() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
    camera.srcObject = stream;
    cameraModal.style.display = "flex";
  } catch (err) {
    alert("Camera access denied or unavailable.");
    console.error(err);
  }
}

function closeCameraModal() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  cameraModal.style.display = "none";
}

async function captureAndRecognize() {
  const ctx = snapshotCanvas.getContext("2d");
  snapshotCanvas.width = camera.videoWidth;
  snapshotCanvas.height = camera.videoHeight;
  ctx.drawImage(camera, 0, 0);

  closeCameraModal();

  const processingNotice = document.createElement("div");
  processingNotice.textContent = "⏳ Processing Arabic text...";
  processingNotice.style.padding = "10px";
  processingNotice.style.background = "#eef";
  processingNotice.style.borderRadius = "8px";
  processingNotice.style.marginTop = "10px";
  outputDiv.appendChild(processingNotice);

  try {
    const { data: { text } } = await Tesseract.recognize(snapshotCanvas, "ara", {
      logger: info => console.log(info)
    });

    processingNotice.remove();

    if (text.trim()) {
      inputText.value += (inputText.value ? " " : "") + text.trim();
      alert("✅ Arabic text recognized and added to input!");
    } else {
      alert("❌ No Arabic text detected. Try again.");
    }
  } catch (err) {
    processingNotice.remove();
    alert("Error during recognition: " + err.message);
  }
}

scanBtn.addEventListener("click", openCameraModal);
captureBtn.addEventListener("click", captureAndRecognize);
closeCameraBtn.addEventListener("click", closeCameraModal);
