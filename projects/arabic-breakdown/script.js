// ── Letter name lookup (base codepoint → name) ───────────────
const LETTER_NAMES = {
  "\u0627": "Alif",   "\u0628": "Ba",    "\u062A": "Ta",
  "\u062B": "Tha",    "\u062C": "Jeem",  "\u062D": "Haa",
  "\u062E": "Khaa",   "\u062F": "Dal",   "\u0630": "Dhal",
  "\u0631": "Raa",    "\u0632": "Zay",   "\u0633": "Seen",
  "\u0634": "Sheen",  "\u0635": "Saad",  "\u0636": "Daad",
  "\u0637": "Taa",    "\u0638": "Zaa",   "\u0639": "Ain",
  "\u063A": "Ghayn",  "\u0641": "Fa",    "\u0642": "Qaf",
  "\u0643": "Kaf",    "\u0644": "Lam",   "\u0645": "Meem",
  "\u0646": "Noon",   "\u0647": "Haa",   "\u0648": "Waw",
  "\u064A": "Ya",     "\u0649": "Alif Maqsura",
  "\u0629": "Ta Marbuta", "\u0621": "Hamza",
  "\u0623": "Alif Hamza", "\u0625": "Alif Hamza Below",
  "\u0626": "Ya Hamza",   "\u0624": "Waw Hamza",
  "\u0622": "Alif Madda", "\u0644\u0627": "Lam-Alif",
};

// Unicode ranges for Arabic diacritics (harakat) and tatweel
const DIACRITIC_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/;
const TATWEEL      = "\u0640"; // ـ

// ── Group a word string into base-letter + diacritic clusters ─
function graphemeClusters(word) {
  const clusters = [];
  for (const ch of word) {                 // iterates Unicode code points
    if (ch === TATWEEL) continue;          // skip kashida/tatweel
    if (DIACRITIC_RE.test(ch) && clusters.length > 0) {
      // attach diacritic to the previous cluster
      clusters[clusters.length - 1].diacritics += ch;
    } else {
      clusters.push({ base: ch, diacritics: "" });
    }
  }
  return clusters;
}

// ── TTS ───────────────────────────────────────────────────────
const ttsStatus = document.getElementById("ttsStatus");

function getArabicVoice() {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find(v => v.lang === "ar-SA") ||
    voices.find(v => v.lang.startsWith("ar")) ||
    null
  );
}

function speak(text) {
  if (!text || !text.trim()) return;
  speechSynthesis.cancel();
  const utter  = new SpeechSynthesisUtterance(text);
  const voice  = getArabicVoice();
  utter.lang   = voice ? voice.lang : "ar-SA";
  if (voice) utter.voice = voice;
  utter.rate   = 0.85;

  utter.onstart = () => { ttsStatus.textContent = "Playing…"; };
  utter.onend   = () => { ttsStatus.textContent = ""; };
  utter.onerror = () => { ttsStatus.textContent = ""; };

  speechSynthesis.speak(utter);
}

// Voices load async on Chrome — prime them early
if (typeof speechSynthesis !== "undefined") {
  speechSynthesis.getVoices();
  speechSynthesis.addEventListener("voiceschanged", () => speechSynthesis.getVoices());
}

// ── Status message helper ─────────────────────────────────────
const statusMsg = document.getElementById("statusMsg");

function setStatus(msg, type = "") {
  if (!msg) { statusMsg.style.display = "none"; return; }
  statusMsg.style.display = "flex";
  statusMsg.className     = "status-msg" + (type ? ` ${type}` : "");
  statusMsg.textContent   = msg;
}

// ── Build word card ───────────────────────────────────────────
function buildWordCard(word, index) {
  const clusters = graphemeClusters(word);
  if (clusters.length === 0) return null;

  const card = document.createElement("div");
  card.className  = "word-card";
  card.style.animationDelay = `${index * 0.05}s`;

  // Header: word + play button
  const header = document.createElement("div");
  header.className = "word-header";

  const wordSpan = document.createElement("span");
  wordSpan.className   = "word-text";
  wordSpan.dir         = "rtl";
  wordSpan.textContent = word;

  const playBtn = document.createElement("button");
  playBtn.className = "word-play-btn";
  playBtn.title     = "Speak word";
  playBtn.innerHTML = `<svg width="10" height="11" viewBox="0 0 10 11" fill="none"><path d="M1.5 1.5l7 4-7 4V1.5z" fill="currentColor"/></svg>`;
  playBtn.addEventListener("click", () => speak(word));

  header.appendChild(playBtn);   // play btn on left (RTL so visually right)
  header.appendChild(wordSpan);

  // Letter chips
  const lettersDiv = document.createElement("div");
  lettersDiv.className = "letters";

  clusters.forEach(({ base, diacritics }) => {
    const chip = document.createElement("div");
    chip.className = "letter-chip";

    const isDiac = DIACRITIC_RE.test(base);
    if (isDiac) chip.classList.add("is-diacritic");

    const glyphEl = document.createElement("div");
    glyphEl.className   = "letter-glyph";
    glyphEl.dir         = "rtl";
    glyphEl.textContent = base + diacritics;

    const nameEl = document.createElement("div");
    nameEl.className   = "letter-name";
    nameEl.textContent = isDiac ? "diacritic" : (LETTER_NAMES[base] || "—");

    chip.appendChild(glyphEl);
    chip.appendChild(nameEl);
    lettersDiv.appendChild(chip);
  });

  card.appendChild(header);
  card.appendChild(lettersDiv);
  return card;
}

// ── Analyze ───────────────────────────────────────────────────
const inputText  = document.getElementById("inputText");
const analyzeBtn = document.getElementById("analyzeBtn");
const outputDiv  = document.getElementById("output");
const audioControls = document.getElementById("audioControls");

analyzeBtn.addEventListener("click", () => {
  const raw = inputText.value.trim();
  if (!raw) return;

  outputDiv.innerHTML = "";
  setStatus("");

  // Split on whitespace, filter empty tokens
  const words = raw.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    outputDiv.innerHTML = `<div class="empty-state">No words found.</div>`;
    audioControls.style.display = "none";
    return;
  }

  const fragment = document.createDocumentFragment();
  words.forEach((word, i) => {
    const card = buildWordCard(word, i);
    if (card) fragment.appendChild(card);
  });
  outputDiv.appendChild(fragment);
  audioControls.style.display = "flex";
});

// ── Clear ─────────────────────────────────────────────────────
document.getElementById("clearBtn").addEventListener("click", () => {
  inputText.value     = "";
  outputDiv.innerHTML = "";
  audioControls.style.display = "none";
  setStatus("");
  inputText.focus();
});

// ── Play all / Stop ───────────────────────────────────────────
document.getElementById("playAllBtn").addEventListener("click", () => {
  speak(inputText.value.trim());
});
document.getElementById("stopBtn").addEventListener("click", () => {
  speechSynthesis.cancel();
  ttsStatus.textContent = "";
});

// ── Camera / OCR ─────────────────────────────────────────────
const scanBtn       = document.getElementById("scanBtn");
const cameraModal   = document.getElementById("cameraModal");
const cameraEl      = document.getElementById("camera");
const captureBtn    = document.getElementById("captureBtn");
const closeCameraBtn = document.getElementById("closeCameraBtn");
const snapshotCanvas = document.getElementById("snapshotCanvas");
const ocrStatus     = document.getElementById("ocrStatus");

let mediaStream = null;

async function openCamera() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
    });
    const track    = mediaStream.getVideoTracks()[0];
    const settings = track.getSettings();
    cameraEl.srcObject = stream;
    cameraEl.style.transform = settings.facingMode === "user" ? "scaleX(-1)" : "scaleX(1)";
    cameraEl.srcObject = mediaStream;
    cameraModal.classList.add("open");
    ocrStatus.style.display = "none";
  } catch (err) {
    setStatus("Camera access denied or unavailable. Check browser permissions.", "error");
  }
}

function closeCamera() {
  mediaStream?.getTracks().forEach(t => t.stop());
  mediaStream    = null;
  cameraEl.srcObject = null;
  cameraModal.classList.remove("open");
}

async function captureAndOCR() {
  const ctx = snapshotCanvas.getContext("2d");
  snapshotCanvas.width  = cameraEl.videoWidth;
  snapshotCanvas.height = cameraEl.videoHeight;
  ctx.drawImage(cameraEl, 0, 0);

  captureBtn.disabled   = true;
  ocrStatus.style.display = "block";
  ocrStatus.textContent = "Recognising text…";

  try {
    const { data: { text } } = await Tesseract.recognize(snapshotCanvas, "ara+eng", {
      logger: ({ status, progress }) => {
        if (status === "recognizing text") {
          ocrStatus.textContent = `Recognising… ${Math.round(progress * 100)}%`;
        }
      },
    });

    // Extract only Arabic script characters
    const arabicOnly = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\s]+/g) || [])
      .join(" ")
      .trim();

    closeCamera();

    if (arabicOnly) {
      inputText.value = arabicOnly;
      setStatus("Text recognised — click Analyze to break it down.", "success");
    } else {
      setStatus("No Arabic text detected in the image. Try again with better lighting.", "error");
    }
  } catch (err) {
    closeCamera();
    setStatus("OCR failed: " + err.message, "error");
  } finally {
    captureBtn.disabled = false;
  }
}

scanBtn.addEventListener("click",       openCamera);
captureBtn.addEventListener("click",    captureAndOCR);
closeCameraBtn.addEventListener("click", closeCamera);

// Close modal on backdrop click
cameraModal.addEventListener("click", e => {
  if (e.target === cameraModal) closeCamera();
});