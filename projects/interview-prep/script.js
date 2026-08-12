/* =========================================================
   DATA — Word Patterns
   Pattern templates: array of segments.
   A segment starting with "R" + digit references that root
   letter index (0,1,2). Any other string is a fixed letter.
   ========================================================= */

const PATTERNS = {
  faail:   { name: "Active Participle", arabicLabel: "فاعل",   role: "one who does the action",      template: ["R0","ا","R1","R2"] },
  mafuul:  { name: "Passive Participle", arabicLabel: "مفعول",  role: "that which the action is done to", template: ["م","R0","R1","و","R2"] },
  mafal:   { name: "Place / Instrument Noun", arabicLabel: "مَفْعَل", role: "place or means of the action", template: ["م","R0","R1","R2"] },
  mafalah: { name: "Place Noun (feminine)", arabicLabel: "مَفْعَلة", role: "a place associated with the action", template: ["م","R0","R1","R2","ة"] },
  fu3uul:  { name: "Verbal Noun", arabicLabel: "فُعول", role: "the act of doing, as a noun", template: ["R0","R1","و","R2"] },
  faalah:  { name: "Single-Instance Noun", arabicLabel: "فَعْلة", role: "one instance of the action", template: ["R0","R1","R2","ة"] },
  base:    { name: "Core Noun", arabicLabel: "(bare root)", role: "the root's most basic noun form", template: ["R0","R1","R2"] }
};

const ROOTS = [
  { id:"ktb", vowelClass:{past:"a",present:"u"}, letters:["ك","ت","ب"], meaning:"write", words:[
    { arabic:"كاتب", pattern:"faail", gloss:"writer", ex_ar:"الكاتب يكتب رسالة", ex_en:"The writer writes a letter" },
    { arabic:"مكتوب", pattern:"mafuul", gloss:"written / a letter", ex_ar:"هذا مكتوب بخط جميل", ex_en:"This is written in beautiful handwriting" },
    { arabic:"مكتب", pattern:"mafal", gloss:"office / desk", ex_ar:"أذهب إلى المكتب صباحًا", ex_en:"I go to the office in the morning" },
    { arabic:"مكتبة", pattern:"mafalah", gloss:"library", ex_ar:"الكتاب في المكتبة", ex_en:"The book is in the library" }
  ]},
  { id:"tlb", vowelClass:{past:"a",present:"u"}, letters:["ط","ل","ب"], meaning:"request / seek", words:[
    { arabic:"طالب", pattern:"faail", gloss:"student / seeker", ex_ar:"الطالب يطلب العلم", ex_en:"The student seeks knowledge" },
    { arabic:"مطلوب", pattern:"mafuul", gloss:"required / wanted", ex_ar:"هذا الكتاب مطلوب", ex_en:"This book is required" },
    { arabic:"مطلب", pattern:"mafal", gloss:"demand / requirement", ex_ar:"لديه مطلب واحد", ex_en:"He has one requirement" },
    { arabic:"طلب", pattern:"base", gloss:"request (noun)", ex_ar:"قدم طلبًا للوظيفة", ex_en:"He submitted an application for the job" }
  ]},
  { id:"drs", vowelClass:{past:"a",present:"u"}, letters:["د","ر","س"], meaning:"study", words:[
    { arabic:"دارس", pattern:"faail", gloss:"one who studies", ex_ar:"الدارس يدرس كل يوم", ex_en:"The student studies every day" },
    { arabic:"مدروس", pattern:"mafuul", gloss:"studied", ex_ar:"هذا الموضوع مدروس جيدًا", ex_en:"This topic is well studied" },
    { arabic:"مدرسة", pattern:"mafalah", gloss:"school", ex_ar:"الطلاب في المدرسة", ex_en:"The students are at school" },
    { arabic:"درس", pattern:"base", gloss:"lesson", ex_ar:"الدرس اليوم صعب", ex_en:"Today's lesson is difficult" }
  ]},
  { id:"3lm", vowelClass:{past:"i",present:"a"}, letters:["ع","ل","م"], meaning:"know", words:[
    { arabic:"عالم", pattern:"faail", gloss:"scholar", ex_ar:"العالم يعلم كثيرًا", ex_en:"The scholar knows a lot" },
    { arabic:"معلوم", pattern:"mafuul", gloss:"known", ex_ar:"هذا الأمر معلوم للجميع", ex_en:"This matter is known to everyone" },
    { arabic:"معلم", pattern:"mafal", gloss:"landmark", ex_ar:"هذا المبنى معلم مشهور", ex_en:"This building is a famous landmark" },
    { arabic:"علم", pattern:"base", gloss:"knowledge", ex_ar:"طلب العلم واجب", ex_en:"Seeking knowledge is a duty" }
  ]},
  { id:"fhm", vowelClass:{past:"i",present:"a"}, letters:["ف","ه","م"], meaning:"understand", words:[
    { arabic:"فاهم", pattern:"faail", gloss:"one who understands", ex_ar:"هو فاهم الدرس", ex_en:"He understands the lesson" },
    { arabic:"مفهوم", pattern:"mafuul", gloss:"understood / a concept", ex_ar:"هذا المفهوم واضح", ex_en:"This concept is clear" },
    { arabic:"فهم", pattern:"base", gloss:"understanding (noun)", ex_ar:"الفهم أهم من الحفظ", ex_en:"Understanding is more important than memorizing" }
  ]},
  { id:"jls", vowelClass:{past:"a",present:"i"}, letters:["ج","ل","س"], meaning:"sit", words:[
    { arabic:"جالس", pattern:"faail", gloss:"one who sits", ex_ar:"هو جالس على الكرسي", ex_en:"He is sitting on the chair" },
    { arabic:"مجلس", pattern:"mafal", gloss:"council / sitting-place", ex_ar:"المجلس يجتمع اليوم", ex_en:"The council meets today" },
    { arabic:"جلسة", pattern:"faalah", gloss:"a sitting / session", ex_ar:"لدينا جلسة مهمة غدًا", ex_en:"We have an important session tomorrow" }
  ]},
  { id:"khrj", vowelClass:{past:"a",present:"u"}, letters:["خ","ر","ج"], meaning:"exit / leave", words:[
    { arabic:"خارج", pattern:"faail", gloss:"outside / one who exits", ex_ar:"هو خارج المنزل", ex_en:"He is outside the house" },
    { arabic:"مخرج", pattern:"mafal", gloss:"exit / director", ex_ar:"أين المخرج؟", ex_en:"Where is the exit?" },
    { arabic:"خروج", pattern:"fu3uul", gloss:"exiting (noun)", ex_ar:"خروج الطلاب من المدرسة", ex_en:"The students' exit from school" }
  ]},
  { id:"dkhl", vowelClass:{past:"a",present:"u"}, letters:["د","خ","ل"], meaning:"enter", words:[
    { arabic:"داخل", pattern:"faail", gloss:"inside / one who enters", ex_ar:"هو داخل الغرفة", ex_en:"He is inside the room" },
    { arabic:"مدخل", pattern:"mafal", gloss:"entrance", ex_ar:"المدخل الرئيسي هنا", ex_en:"The main entrance is here" },
    { arabic:"دخول", pattern:"fu3uul", gloss:"entering (noun)", ex_ar:"دخول الطلاب إلى الصف", ex_en:"The students' entry into the classroom" }
  ]},
  { id:"3ml", vowelClass:{past:"i",present:"a"}, letters:["ع","م","ل"], meaning:"work / do", words:[
    { arabic:"عامل", pattern:"faail", gloss:"worker / one who does", ex_ar:"العامل يعمل بجد", ex_en:"The worker works hard" },
    { arabic:"معمول", pattern:"mafuul", gloss:"done / made", ex_ar:"هذا معمول من الخشب", ex_en:"This is made of wood" },
    { arabic:"معمل", pattern:"mafal", gloss:"factory / lab", ex_ar:"يعمل في المعمل", ex_en:"He works in the factory" },
    { arabic:"عمل", pattern:"base", gloss:"work (noun)", ex_ar:"العمل مهم", ex_en:"Work is important" }
  ]},
  { id:"skn", vowelClass:{past:"a",present:"u"}, letters:["س","ك","ن"], meaning:"dwell / reside", words:[
    { arabic:"ساكن", pattern:"faail", gloss:"resident / one who dwells", ex_ar:"هو ساكن في هذا الحي", ex_en:"He resides in this neighborhood" },
    { arabic:"مسكون", pattern:"mafuul", gloss:"inhabited / haunted", ex_ar:"هذا البيت مسكون", ex_en:"This house is inhabited" },
    { arabic:"مسكن", pattern:"mafal", gloss:"dwelling / residence", ex_ar:"المسكن قريب من العمل", ex_en:"The residence is near work" },
    { arabic:"سكن", pattern:"base", gloss:"dwelling / tranquility (noun)", ex_ar:"السكن هنا هادئ", ex_en:"The dwelling here is quiet" }
  ]}
];

/* =========================================================
   DATA — Verb Conjugation (Form I, sound roots)

   Rather than hand-typing every inflected form (high error
   risk), this builds them from grammatical RULES:
     - PAST_TEMPLATES / PRESENT_INDICATIVE_TEMPLATES are the
       two "base" tables (13 persons each), hand-verified.
     - Subjunctive / Jussive are DERIVED from the indicative
       table by the actual mood rule (change final vowel, or
       drop the mood-marker نّ for the "five verbs" persons).
     - Imperative is DERIVED from Jussive (drop the subject
       prefix, add the prosthetic alif).
     - Negative Command is DERIVED from Jussive (prepend لا,
       keep the subject prefix).
     - Energetic is DERIVED from the indicative stem for the
       persons it's actually attested for; the rest are
       flagged as not commonly formed rather than guessed.

   Each "unit" is one letter + (optional) diacritic:
     R(idx, dia) -> a root letter. dia is either 'past'/
       'present' (use the root's own vowel class) or a fixed
       diacritic constant.
     F(letter, dia) -> a fixed grammatical letter (prefix,
       suffix, subject marker).
     LIT(text) -> literal text with no diacritic logic (used
       for the لا particle).
   ========================================================= */

const DIA = {
  FATHA: "\u064E", KASRA: "\u0650", DAMMA: "\u064F", SUKUN: "\u0652",
  SHADDA_FATHA: "\u0651\u064E", NONE: ""
};

function R(idx, dia){ return { type:"root", idx, dia }; }
function F(letter, dia){ return { type:"fixed", letter, dia: dia || DIA.NONE }; }
function LIT(text){ return { type:"literal", text }; }

function resolveUnits(units, root, showDiacritics){
  const cls = root.vowelClass;
  return units.map(u => {
    if(u.type === "literal") return u.text;
    if(u.type === "fixed") return u.letter + (showDiacritics ? u.dia : "");
    const dia = u.dia === "past" ? (cls.past === "a" ? DIA.FATHA : DIA.KASRA)
              : u.dia === "present" ? (cls.present === "a" ? DIA.FATHA : cls.present === "i" ? DIA.KASRA : DIA.DAMMA)
              : u.dia;
    return root.letters[u.idx] + (showDiacritics ? dia : "");
  }).join("");
}

/* 13-person paradigm. endingClass drives how subjunctive/jussive/energetic
   are derived from the indicative form. */
const PERSONS_FULL = [
  { id:"ana",     ar:"أنا",   en:"I",                endingClass:"plain" },
  { id:"nahnu",   ar:"نحن",   en:"we",               endingClass:"plain" },
  { id:"anta",    ar:"أنتَ",  en:"you (m.)",         endingClass:"plain" },
  { id:"anti",    ar:"أنتِ",  en:"you (f.)",         endingClass:"nundrop_i" },
  { id:"antuma",  ar:"أنتما", en:"you (two)",        endingClass:"nundrop_dual" },
  { id:"antum",   ar:"أنتم",  en:"you (pl. m.)",     endingClass:"nundrop_u" },
  { id:"antunna", ar:"أنتن",  en:"you (pl. f.)",     endingClass:"invariant" },
  { id:"huwa",    ar:"هو",    en:"he",               endingClass:"plain" },
  { id:"hiya",    ar:"هي",    en:"she",              endingClass:"plain" },
  { id:"humaM",   ar:"هما",   en:"they (two, m.)",   endingClass:"nundrop_dual" },
  { id:"humaF",   ar:"هما",   en:"they (two, f.)",   endingClass:"nundrop_dual" },
  { id:"hum",     ar:"هم",    en:"they (m.)",        endingClass:"nundrop_u" },
  { id:"hunna",   ar:"هن",    en:"they (f.)",        endingClass:"invariant" }
];
const PERSON_2ND = ["anta","anti","antuma","antum","antunna"]; // command / negative-command persons

const PAST_TEMPLATES = {
  ana:     [R(0,DIA.FATHA), R(1,"past"), R(2,DIA.SUKUN), F("ت",DIA.DAMMA)],
  anta:    [R(0,DIA.FATHA), R(1,"past"), R(2,DIA.SUKUN), F("ت",DIA.FATHA)],
  anti:    [R(0,DIA.FATHA), R(1,"past"), R(2,DIA.SUKUN), F("ت",DIA.KASRA)],
  huwa:    [R(0,DIA.FATHA), R(1,"past"), R(2,DIA.FATHA)],
  hiya:    [R(0,DIA.FATHA), R(1,"past"), R(2,DIA.FATHA), F("ت",DIA.SUKUN)],
  nahnu:   [R(0,DIA.FATHA), R(1,"past"), R(2,DIA.SUKUN), F("ن",DIA.FATHA), F("ا",DIA.NONE)],
  antuma:  [R(0,DIA.FATHA), R(1,"past"), R(2,DIA.SUKUN), F("ت",DIA.DAMMA), F("م",DIA.FATHA), F("ا",DIA.NONE)],
  antum:   [R(0,DIA.FATHA), R(1,"past"), R(2,DIA.SUKUN), F("ت",DIA.DAMMA), F("م",DIA.SUKUN)],
  antunna: [R(0,DIA.FATHA), R(1,"past"), R(2,DIA.SUKUN), F("ت",DIA.DAMMA), F("ن",DIA.SHADDA_FATHA)],
  humaM:   [R(0,DIA.FATHA), R(1,"past"), R(2,DIA.FATHA), F("ا",DIA.NONE)],
  humaF:   [R(0,DIA.FATHA), R(1,"past"), R(2,DIA.FATHA), F("ت",DIA.FATHA), F("ا",DIA.NONE)],
  hum:     [R(0,DIA.FATHA), R(1,"past"), R(2,DIA.DAMMA), F("و",DIA.NONE), F("ا",DIA.NONE)],
  hunna:   [R(0,DIA.FATHA), R(1,"past"), R(2,DIA.SUKUN), F("ن",DIA.FATHA)]
};

const PRESENT_INDICATIVE_TEMPLATES = {
  ana:     [F("أ",DIA.FATHA), R(0,DIA.SUKUN), R(1,"present"), R(2,DIA.DAMMA)],
  anta:    [F("ت",DIA.FATHA), R(0,DIA.SUKUN), R(1,"present"), R(2,DIA.DAMMA)],
  anti:    [F("ت",DIA.FATHA), R(0,DIA.SUKUN), R(1,"present"), R(2,DIA.KASRA), F("ي",DIA.NONE), F("ن",DIA.FATHA)],
  huwa:    [F("ي",DIA.FATHA), R(0,DIA.SUKUN), R(1,"present"), R(2,DIA.DAMMA)],
  hiya:    [F("ت",DIA.FATHA), R(0,DIA.SUKUN), R(1,"present"), R(2,DIA.DAMMA)],
  nahnu:   [F("ن",DIA.FATHA), R(0,DIA.SUKUN), R(1,"present"), R(2,DIA.DAMMA)],
  antuma:  [F("ت",DIA.FATHA), R(0,DIA.SUKUN), R(1,"present"), R(2,DIA.FATHA), F("ا",DIA.NONE), F("ن",DIA.KASRA)],
  antum:   [F("ت",DIA.FATHA), R(0,DIA.SUKUN), R(1,"present"), R(2,DIA.DAMMA), F("و",DIA.NONE), F("ن",DIA.FATHA)],
  antunna: [F("ت",DIA.FATHA), R(0,DIA.SUKUN), R(1,"present"), R(2,DIA.SUKUN), F("ن",DIA.FATHA)],
  humaM:   [F("ي",DIA.FATHA), R(0,DIA.SUKUN), R(1,"present"), R(2,DIA.FATHA), F("ا",DIA.NONE), F("ن",DIA.KASRA)],
  humaF:   [F("ت",DIA.FATHA), R(0,DIA.SUKUN), R(1,"present"), R(2,DIA.FATHA), F("ا",DIA.NONE), F("ن",DIA.KASRA)],
  hum:     [F("ي",DIA.FATHA), R(0,DIA.SUKUN), R(1,"present"), R(2,DIA.DAMMA), F("و",DIA.NONE), F("ن",DIA.FATHA)],
  hunna:   [F("ي",DIA.FATHA), R(0,DIA.SUKUN), R(1,"present"), R(2,DIA.SUKUN), F("ن",DIA.FATHA)]
};

function cloneUnits(units){ return units.map(u => ({...u})); }

function lastRootUnitIndex(units){
  for(let i=units.length-1;i>=0;i--) if(units[i].type==="root") return i;
  return -1;
}

/* indicative -> subjunctive/jussive, per the actual mood rule */
function presentMoodUnits(personId, mood){
  const base = PRESENT_INDICATIVE_TEMPLATES[personId];
  if(mood === "indicative") return base;
  const person = PERSONS_FULL.find(p => p.id === personId);
  if(person.endingClass === "plain"){
    const clone = cloneUnits(base);
    const i = lastRootUnitIndex(clone);
    clone[i] = { ...clone[i], dia: mood === "subjunctive" ? DIA.FATHA : DIA.SUKUN };
    return clone;
  }
  if(person.endingClass === "nundrop_u"){
    // dropping the ن still needs the orthographic "alif of differentiation"
    // after the واو — تَكْتُبُونَ -> تَكْتُبُوا, not تَكْتُبُو
    const trimmed = base.slice(0, -1);
    return [...trimmed, F("ا", DIA.NONE)];
  }
  if(person.endingClass.startsWith("nundrop")){
    // anti (ي-ending) and the dual (already ends in ا) just drop the trailing ن
    return base.slice(0, -1);
  }
  return base; // invariant (antunna / hunna) — same in every mood
}

/* Energetic mood — only built where it's actually attested;
   dual & feminine-plural energetic is a genuine grammatical
   gap in regular usage, so those are flagged, not fabricated. */
function energeticUnits(personId){
  const person = PERSONS_FULL.find(p => p.id === personId);
  const base = PRESENT_INDICATIVE_TEMPLATES[personId];
  if(person.endingClass === "plain"){
    const clone = cloneUnits(base);
    const i = lastRootUnitIndex(clone);
    clone[i] = { ...clone[i], dia: DIA.FATHA };
    return [...clone, F("ن", DIA.SHADDA_FATHA)];
  }
  if(person.endingClass === "nundrop_i"){ // anti: drop ي + ن, kasra stays
    const clone = cloneUnits(base.slice(0, -2));
    const i = lastRootUnitIndex(clone);
    clone[i] = { ...clone[i], dia: DIA.KASRA };
    return [...clone, F("ن", DIA.SHADDA_FATHA)];
  }
  if(person.endingClass === "nundrop_u"){ // antum / hum: drop و + ن, damma stays
    const clone = cloneUnits(base.slice(0, -2));
    const i = lastRootUnitIndex(clone);
    clone[i] = { ...clone[i], dia: DIA.DAMMA };
    return [...clone, F("ن", DIA.SHADDA_FATHA)];
  }
  return null; // dual & fem-plural: not commonly formed
}

/* Imperative — drop jussive's subject prefix, add prosthetic alif.
   Alif vowel follows the root's present-tense vowel class. */
function imperativeUnits(root, personId){
  const cls = root.vowelClass;
  const alifVowel = cls.present === "u" ? DIA.DAMMA : DIA.KASRA;
  const juss = presentMoodUnits(personId, "jussive").slice(1); // drop prefix unit
  return [F("ا", alifVowel), ...juss];
}

/* Negative command — لا + jussive (prefix retained) */
function negativeCommandUnits(personId){
  return [LIT("لا "), ...presentMoodUnits(personId, "jussive")];
}

/* Base ("dictionary") verb meaning per root, for display context */
const VERB_MEANING = {
  ktb:"to write", tlb:"to request / seek", drs:"to study", "3lm":"to know",
  fhm:"to understand", jls:"to sit", khrj:"to exit / leave", dkhl:"to enter",
  "3ml":"to work / do", skn:"to dwell / reside"
};

/* =========================================================
   HELPERS
   ========================================================= */

function isRootSeg(seg){ return seg[0]==="R" && seg.length===2 && !isNaN(Number(seg[1])); }

function resolveTemplate(letters, template){
  return template.map(seg => isRootSeg(seg) ? letters[Number(seg[1])] : seg);
}

function buildWord(letters, patternId){
  return resolveTemplate(letters, PATTERNS[patternId].template).join("");
}

function stripDiacritics(s){
  return s.replace(/[\u064B-\u0652\u0670]/g, "");
}

function speak(arabicText, statusEl){
  const clean = stripDiacritics(arabicText);
  if(!("speechSynthesis" in window)){
    if(statusEl) statusEl.textContent = "Audio isn't supported in this browser.";
    return;
  }
  const voices = speechSynthesis.getVoices();
  const hasArabic = voices.some(v => v.lang && v.lang.toLowerCase().startsWith("ar"));
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = "ar-SA";
  utter.rate = 0.85;
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
  if(statusEl){
    statusEl.textContent = hasArabic ? "" : "Playing with your system's default voice (no Arabic voice detected).";
  }
}

/* =========================================================
   LIGHTWEIGHT PERSISTENCE
   Uses window.storage when available (Claude artifact
   environment); otherwise falls back to in-memory state only,
   so the app still works standalone with no errors.
   ========================================================= */

let mastery = {};   // key: "rootId_pattern" -> box 0|1|2
let masteryReady = false;

function wordKey(rootId, pattern){ return rootId + "_" + pattern; }

async function loadMastery(){
  try{
    if(window.storage){
      const res = await window.storage.get("mastery-v1", false);
      if(res && res.value) mastery = JSON.parse(res.value);
    }
  }catch(e){ /* no saved data yet, or storage unavailable — start fresh */ }
  masteryReady = true;
}

async function saveMastery(){
  try{
    if(window.storage){
      await window.storage.set("mastery-v1", JSON.stringify(mastery), false);
    }
  }catch(e){ /* storage unavailable outside the Claude environment — session-only progress */ }
}

function getBox(rootId, pattern){ return mastery[wordKey(rootId, pattern)] || 0; }

function setBox(rootId, pattern, box){
  mastery[wordKey(rootId, pattern)] = Math.max(0, Math.min(2, box));
  saveMastery();
}

/* =========================================================
   MODES + SHARED ROOT CONTEXT
   ========================================================= */

let currentMode = "learn";
let currentRootIndex = 0;

function setMode(mode){
  currentMode = mode;
  ["learn","practice","conjugate"].forEach(m => {
    document.getElementById("view-"+m).classList.toggle("active", m===mode);
    document.getElementById("mode-"+m).classList.toggle("active", m===mode);
  });
  if(mode === "practice") renderProgress();
  if(mode === "conjugate") renderConjugate();
  if(mode === "learn") renderLearnView();
  window.scrollTo(0, 0);
}

function stepRoot(delta){
  selectRoot((currentRootIndex + delta + ROOTS.length) % ROOTS.length);
}

function selectRoot(idx){
  currentRootIndex = idx;
  if(currentMode === "learn") renderLearnView();
  if(currentMode === "conjugate") renderConjugate();
}

function renderRootDots(){
  const dots = document.getElementById("root-dots");
  dots.innerHTML = "";
  ROOTS.forEach((root, i) => {
    const dot = document.createElement("button");
    dot.className = "root-dot" + (i===currentRootIndex ? " active" : "");
    dot.setAttribute("aria-label", "Go to root " + root.letters.join(" "));
    dot.onclick = () => selectRoot(i);
    dots.appendChild(dot);
  });
}

/* =========================================================
   LEARN — animated root/branch tree

   Branches are drawn (not just faded in) using the classic
   stroke-dasharray trick: set dasharray/dashoffset to the
   path's own length, then transition dashoffset to 0. Word
   nodes pop in staggered, right after their branch finishes.
   ========================================================= */

let expandedWordIndex = null;

function renderLearnView(){
  expandedWordIndex = null;
  const root = ROOTS[currentRootIndex];

  document.getElementById("medallion-letters").textContent = root.letters.join(" ");
  document.getElementById("medallion-meaning").textContent = root.meaning;

  const medallion = document.getElementById("medallion");
  medallion.classList.remove("regrow");
  void medallion.offsetWidth; // restart animation
  medallion.classList.add("regrow");

  document.getElementById("word-detail").classList.remove("show");
  renderRootDots();
  growTree(root);
}

function branchGeometry(root){
  const n = root.words.length;
  const startX = 200, startY = 118;
  const spread = n === 1 ? 0 : 130;
  const length = 210;
  return root.words.map((word, i) => {
    const angle = n === 1 ? 0 : (-spread/2 + i * (spread/(n-1)));
    const rad = angle * Math.PI/180;
    const dist = length + (i % 2 === 0 ? 0 : 26);
    const x = startX + dist * Math.sin(rad);
    const y = startY + dist * Math.cos(rad);
    const midX = (startX + x)/2, midY = (startY + y)/2;
    const dx = x - startX, dy = y - startY;
    const norm = Math.hypot(dx,dy) || 1;
    const perpX = -dy/norm, perpY = dx/norm;
    const curveDir = i % 2 === 0 ? 1 : -1;
    const curveAmt = 26 + (i * 11 % 22);
    const ctrlX = midX + perpX * curveAmt * curveDir;
    const ctrlY = midY + perpY * curveAmt * curveDir;
    return { word, x, y, ctrlX, ctrlY, startX, startY };
  });
}

function growTree(root){
  const svg = document.getElementById("tree-svg");
  const wrap = document.getElementById("tree-wrap");

  // clear previous nodes (keep the svg element, rebuild its contents)
  wrap.querySelectorAll(".word-node").forEach(n => n.remove());
  svg.innerHTML = `
    <defs>
      <linearGradient id="branchGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#B3862A" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#2E6B63" stop-opacity="0.55"/>
      </linearGradient>
    </defs>
  `;

  const geo = branchGeometry(root);
  const svgNS = "http://www.w3.org/2000/svg";

  geo.forEach((g, i) => {
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("class", "branch-path");
    path.setAttribute("d", `M ${g.startX} ${g.startY} Q ${g.ctrlX} ${g.ctrlY} ${g.x} ${g.y}`);
    svg.appendChild(path);

    const len = path.getTotalLength();
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;

    const node = document.createElement("button");
    node.className = "word-node arabic";
    node.style.left = `${(g.x/400)*100}%`;
    node.style.top = `${(g.y/440)*100}%`;
    node.textContent = g.word.arabic;
    node.onclick = () => selectWord(i, g.word, root);
    wrap.appendChild(node);

    const delay = i * 160;
    setTimeout(() => {
      path.style.transition = "stroke-dashoffset 0.55s ease-out";
      path.style.strokeDashoffset = "0";
    }, delay);
    setTimeout(() => node.classList.add("ready"), delay + 300);
  });
}

let activeWordIndex = null;

function selectWord(i, word, root){
  activeWordIndex = (activeWordIndex === i) ? null : i;

  document.querySelectorAll(".word-node").forEach((el, idx) => {
    el.classList.toggle("active", idx === activeWordIndex);
    el.classList.toggle("dim", activeWordIndex !== null && idx !== activeWordIndex);
  });
  document.querySelectorAll(".branch-path").forEach((el, idx) => {
    el.classList.toggle("active", idx === activeWordIndex);
    el.classList.toggle("dim", activeWordIndex !== null && idx !== activeWordIndex);
  });

  const panel = document.getElementById("word-detail");
  if(activeWordIndex === null){
    panel.classList.remove("show");
    return;
  }

  const pattern = PATTERNS[word.pattern];
  panel.innerHTML = `
    <div class="headline">
      <div class="headline-text">
        <span class="arabic">${word.arabic}</span>
        <span class="gloss">${word.gloss}</span>
      </div>
      <button class="audio-btn" onclick="speak('${word.arabic}', document.getElementById('audio-status-explorer'))" aria-label="Hear this word">
        <svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor"/><path d="M16 8a5 5 0 010 8M18.5 5.5a9 9 0 010 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="pattern-chip">${pattern.arabicLabel} — ${pattern.name}</div>
    <div class="lineage" style="margin-top:12px;">Derived from the root <strong class="arabic">${root.letters.join(" ")}</strong> (${root.meaning}). ${pattern.role}.</div>
    <div class="example">
      <span class="arabic">${word.ex_ar}</span>
      <span class="en">${word.ex_en}</span>
    </div>
    <div class="word-actions">
      <div class="audio-status" id="audio-status-explorer"></div>
      <button class="practice-this-link" onclick="practiceThisWord('${root.id}','${word.pattern}')">Practice this word →</button>
    </div>
  `;
  panel.classList.add("show");
}

/* swipe left/right on the tree to change root */
(function setupSwipe(){
  let startX = null, startY = null;
  document.addEventListener("DOMContentLoaded", () => {
    const wrap = document.getElementById("tree-wrap");
    if(!wrap) return;
    wrap.addEventListener("touchstart", e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });
    wrap.addEventListener("touchend", e => {
      if(startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if(Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5){
        stepRoot(dx < 0 ? 1 : -1);
      }
      startX = null; startY = null;
    }, { passive: true });
  });
})();

/* =========================================================
   PRACTICE — quiz-style morphology builder with mastery tracking
   ========================================================= */

const WORD_POOL = [];
ROOTS.forEach(root => root.words.forEach(word => {
  WORD_POOL.push({ rootId: root.id, root, word, pattern: word.pattern });
}));

let forcedNextWord = null;

function practiceThisWord(rootId, pattern){
  forcedNextWord = WORD_POOL.find(w => w.rootId===rootId && w.pattern===pattern) || null;
  setMode("practice");
  startPractice();
}

let currentQuestion = null;
let filledSlots = [];     // letters placed so far, in order
let bankState = [];       // [{char, used}]
let questionLocked = false;

function renderProgress(){
  const el = document.getElementById("practice-progress");
  let known=0, learning=0, fresh=0;
  WORD_POOL.forEach(item => {
    const box = getBox(item.rootId, item.pattern);
    if(box===2) known++; else if(box===1) learning++; else fresh++;
  });
  const total = WORD_POOL.length;

  if(el){
    el.innerHTML = `
      <div class="progress-track">
        <div class="progress-segment known" style="flex:${known}"></div>
        <div class="progress-segment learning" style="flex:${learning}"></div>
        <div class="progress-segment fresh" style="flex:${fresh}"></div>
      </div>
      <div class="progress-legend">
        <span><span class="legend-dot known"></span>${known} known</span>
        <span><span class="legend-dot learning"></span>${learning} learning</span>
        <span><span class="legend-dot fresh"></span>${fresh} new</span>
      </div>
    `;
  }

  const badge = document.getElementById("practice-badge");
  if(badge){
    const due = learning + fresh;
    badge.textContent = due > 0 ? due : "";
  }
}

function pickNextQuestion(){
  if(forcedNextWord){
    const w = forcedNextWord;
    forcedNextWord = null;
    return w;
  }
  const weights = WORD_POOL.map(item => {
    const box = getBox(item.rootId, item.pattern);
    return box===0 ? 5 : box===1 ? 2 : 1;
  });
  const total = weights.reduce((a,b)=>a+b,0);
  let r = Math.random() * total;
  for(let i=0;i<WORD_POOL.length;i++){
    r -= weights[i];
    if(r<=0) return WORD_POOL[i];
  }
  return WORD_POOL[WORD_POOL.length-1];
}

function startPractice(){
  currentQuestion = pickNextQuestion();
  filledSlots = [];
  questionLocked = false;

  const { root, pattern, word } = currentQuestion;
  const patternInfo = PATTERNS[pattern];
  const tpl = patternInfo.template;

  document.getElementById("practice-prompt").innerHTML = `
    Build the word for <strong>${word.gloss}</strong>
    from the root <span class="arabic">${root.letters.join(" ")}</span> (${root.meaning})
    using the pattern <span class="pattern-chip">${patternInfo.arabicLabel} — ${patternInfo.name}</span>
  `;

  const slotRow = document.getElementById("practice-slots");
  slotRow.innerHTML = "";
  tpl.forEach(() => {
    const slot = document.createElement("div");
    slot.className = "slot arabic";
    slotRow.appendChild(slot);
  });

  const bankLetters = tpl.map(seg => isRootSeg(seg) ? root.letters[Number(seg[1])] : seg);
  bankState = bankLetters
    .map(ch => ({ char: ch }))
    .sort(() => Math.random() - 0.5);

  renderBank();
  document.getElementById("practice-result").innerHTML = "";
  document.getElementById("practice-check").style.display = "none";
  document.getElementById("practice-next").style.display = "none";
}

function renderBank(){
  const bankRow = document.getElementById("practice-bank");
  bankRow.innerHTML = "";
  bankState.forEach((tile, i) => {
    const btn = document.createElement("button");
    btn.className = "letter-tile arabic" + (tile.used ? " used" : "");
    btn.textContent = tile.char;
    btn.disabled = tile.used || questionLocked;
    btn.onclick = () => placeLetter(i);
    bankRow.appendChild(btn);
  });
  renderSlotDisplay();
}

function placeLetter(bankIndex){
  if(questionLocked) return;
  const tpl = PATTERNS[currentQuestion.pattern].template;
  if(filledSlots.length >= tpl.length) return;
  bankState[bankIndex].used = true;
  filledSlots.push({ char: bankState[bankIndex].char, bankIndex });
  renderBank();
  if(filledSlots.length === tpl.length){
    document.getElementById("practice-check").style.display = "inline-flex";
  }
}

function removeSlot(slotIndex){
  if(questionLocked) return;
  if(slotIndex >= filledSlots.length) return;
  const removed = filledSlots.splice(slotIndex);
  removed.forEach(r => { bankState[r.bankIndex].used = false; });
  document.getElementById("practice-check").style.display = "none";
  renderBank();
}

function renderSlotDisplay(){
  const slots = document.querySelectorAll("#practice-slots .slot");
  slots.forEach((slot, i) => {
    if(i < filledSlots.length){
      slot.textContent = filledSlots[i].char;
      slot.classList.add("filled");
      slot.onclick = () => removeSlot(i);
    } else {
      slot.textContent = "";
      slot.classList.remove("filled");
      slot.onclick = null;
    }
  });
}

function checkAnswer(){
  questionLocked = true;
  const { root, pattern, word, rootId } = currentQuestion;
  const attempt = filledSlots.map(s => s.char).join("");
  const correct = attempt === word.arabic;
  const box = getBox(rootId, pattern);
  setBox(rootId, pattern, correct ? box+1 : 0);

  const resultEl = document.getElementById("practice-result");
  resultEl.innerHTML = correct
    ? `<div class="result-correct">Correct! <span class="arabic">${word.arabic}</span> — ${word.gloss}</div>`
    : `<div class="result-wrong">Not quite. The correct word is <span class="arabic">${word.arabic}</span> — ${word.gloss}</div>`;
  resultEl.innerHTML += `
    <div class="example">
      <span class="arabic">${word.ex_ar}</span>
      <span class="en">${word.ex_en}</span>
    </div>
    <button class="audio-btn" onclick="speak('${word.arabic}', document.getElementById('audio-status-practice'))" aria-label="Hear this word">
      <svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor"/><path d="M16 8a5 5 0 010 8M18.5 5.5a9 9 0 010 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
    </button>
    <div class="audio-status" id="audio-status-practice"></div>
  `;

  document.getElementById("practice-check").style.display = "none";
  document.getElementById("practice-next").style.display = "inline-flex";
  renderBank();
  renderProgress();
}

/* =========================================================
   CONJUGATE — verb conjugation lab
   ========================================================= */

let conjugateTable = "past";       // past | present | commands
let commandType = "imperative";    // imperative | negative (only when table === "commands")
let conjugateMood = "indicative";  // only used when conjugateTable === "present"
let advancedMoodsOpen = false;
let showDiacritics = true;

function setTable(table){
  conjugateTable = table;
  if(table !== "present") advancedMoodsOpen = false;
  renderConjugate();
}

function setCommandType(type){
  commandType = type;
  renderConjugate();
}

function setMood(mood){
  conjugateMood = mood;
  renderConjugate();
}

function toggleAdvancedMoods(){
  advancedMoodsOpen = !advancedMoodsOpen;
  renderConjugate();
}

function toggleDiacritics(){
  showDiacritics = !showDiacritics;
  renderConjugate();
}

/* Returns { units, person } pairs for the currently selected table+mood */
function currentConjugationRows(root){
  if(conjugateTable === "past"){
    return PERSONS_FULL.map(p => ({ person:p, units: PAST_TEMPLATES[p.id], note:null }));
  }
  if(conjugateTable === "present"){
    if(conjugateMood === "energetic"){
      return PERSONS_FULL.map(p => {
        const units = energeticUnits(p.id);
        return { person:p, units, note: units ? null : "rarely formed for this person" };
      });
    }
    return PERSONS_FULL.map(p => ({ person:p, units: presentMoodUnits(p.id, conjugateMood), note:null }));
  }
  if(conjugateTable === "commands"){
    const buildFn = commandType === "imperative"
      ? (id) => imperativeUnits(root, id)
      : (id) => negativeCommandUnits(id);
    return PERSON_2ND.map(id => ({
      person: PERSONS_FULL.find(p => p.id === id),
      units: buildFn(id),
      note: null
    }));
  }
  return [];
}

function renderConjugate(){
  const root = ROOTS[currentRootIndex];

  document.getElementById("conj-header-letters").textContent = root.letters.join(" ");
  document.getElementById("conj-header-meaning").textContent = root.meaning;

  document.querySelectorAll("#tense-segmented button").forEach(btn =>
    btn.classList.toggle("selected", btn.dataset.table === conjugateTable)
  );

  document.getElementById("commands-subtoggle").hidden = conjugateTable !== "commands";
  document.querySelectorAll("#commands-subtoggle button").forEach(btn =>
    btn.classList.toggle("selected", btn.dataset.cmd === commandType)
  );

  const advancedToggle = document.getElementById("advanced-toggle");
  advancedToggle.hidden = conjugateTable !== "present";
  advancedToggle.classList.toggle("expanded", advancedMoodsOpen);
  document.getElementById("advanced-toggle-label").textContent =
    conjugateMood === "indicative" ? "More forms (Subjunctive, Jussive, Energetic)" : "Mood: " + conjugateMood[0].toUpperCase() + conjugateMood.slice(1);

  const moodRow = document.getElementById("mood-row");
  moodRow.hidden = !(conjugateTable === "present" && advancedMoodsOpen);
  ["indicative","subjunctive","jussive","energetic"].forEach(m => {
    const el = document.getElementById("mood-"+m);
    if(el) el.classList.toggle("selected", conjugateMood===m);
  });

  document.getElementById("diacritics-btn").classList.toggle("active", showDiacritics);

  const rows = currentConjugationRows(root);
  const grid = document.getElementById("conj-grid");
  grid.innerHTML = "";

  rows.forEach(({ person, units, note }) => {
    const row = document.createElement("div");
    row.className = "conj-row";

    const personCell = document.createElement("div");
    personCell.className = "conj-person";
    personCell.innerHTML = `<span class="arabic">${person.ar}</span><span class="conj-person-en">${person.en}</span>`;
    row.appendChild(personCell);

    const wordCell = document.createElement("div");
    wordCell.className = "conj-word arabic";

    if(!units){
      wordCell.innerHTML = `<span class="conj-note">— ${note} —</span>`;
      row.appendChild(wordCell);
      grid.appendChild(row);
      return;
    }

    units.forEach(u => {
      const span = document.createElement("span");
      if(u.type === "literal"){
        span.textContent = u.text;
        span.className = "conj-literal";
      } else if(u.type === "fixed"){
        span.textContent = u.letter + (showDiacritics ? u.dia : "");
        span.className = "conj-affix";
      } else {
        const cls = root.vowelClass;
        const dia = u.dia === "past" ? (cls.past==="a"?DIA.FATHA:DIA.KASRA)
                  : u.dia === "present" ? (cls.present==="a"?DIA.FATHA:cls.present==="i"?DIA.KASRA:DIA.DAMMA)
                  : u.dia;
        span.textContent = root.letters[u.idx] + (showDiacritics ? dia : "");
        span.className = "conj-root-letter";
      }
      wordCell.appendChild(span);
    });
    row.appendChild(wordCell);

    const btn = document.createElement("button");
    btn.className = "audio-btn small";
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor"/><path d="M16 8a5 5 0 010 8M18.5 5.5a9 9 0 010 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    btn.onclick = () => speak(resolveUnits(units, root, false));
    row.appendChild(btn);

    grid.appendChild(row);
  });
}

/* =========================================================
   INIT
   ========================================================= */

async function init(){
  await loadMastery();
  renderLearnView();
  startPractice();
  renderProgress();
  renderConjugate();
  setMode("learn");
}

init();

if("speechSynthesis" in window){
  speechSynthesis.onvoiceschanged = () => {};
}