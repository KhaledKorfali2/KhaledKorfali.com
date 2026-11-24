/* Lamha (لَمْحَة, "a glance"): drills for reading Arabic in chunks.

   The idea: a word is shown briefly, then hidden, and you pick what it said.
   Because it disappears, you can't work through it letter by letter. As you
   get answers right the flash gets shorter, which pushes you from decoding
   towards recognising.

   Most drills are generated from letters and marks, so they never run out.
   The fixed lists (dagger alif, word parts, English words) are in data.js. */
(function () {
  "use strict";

  const app = document.getElementById("app");
  const DATA = window.LAMHA_DATA;
  const KEY = "lamha.v1";
  const ROUND = 20;
  const FLASH = { start: 1600, min: 250, max: 2600 };

  /* ════════════ Letters and marks ════════════ */
  const FATHA = "َ", DAMMA = "ُ", KASRA = "ِ", SUKUN = "ْ", SHADDA = "ّ";
  const TANWIN = { an: "ً", un: "ٌ", in: "ٍ" };
  const SHORT = { a: FATHA, i: KASRA, u: DAMMA };
  const LONG = { a: "ا", i: "ي", u: "و" };
  const LONG_SAY = { a: "ā", i: "ī", u: "ū" };

  // [letter, how it is written in Latin letters, a hint for the key]
  const LETTERS = [
    ["ب", "b", ""], ["ت", "t", ""], ["ث", "th", "as in think"], ["ج", "j", ""], ["ح", "ḥ", "a breathy h from the throat"],
    ["خ", "kh", "as in Scottish loch"], ["د", "d", ""], ["ذ", "dh", "as in this"], ["ر", "r", "rolled"], ["ز", "z", ""],
    ["س", "s", ""], ["ش", "sh", ""], ["ص", "ṣ", "a heavy s"], ["ض", "ḍ", "a heavy d"], ["ط", "ṭ", "a heavy t"],
    ["ظ", "ẓ", "a heavy dh"], ["ع", "ʿ", "a squeeze in the throat"], ["غ", "gh", "a gargled r"], ["ف", "f", ""], ["ق", "q", "a k from far back"],
    ["ك", "k", ""], ["ل", "l", ""], ["م", "m", ""], ["ن", "n", ""], ["ه", "h", ""], ["و", "w", ""], ["ي", "y", ""]
  ];
  const SAY = {};
  LETTERS.forEach(function (l) { SAY[l[0]] = l[1]; });
  const ALL = LETTERS.map(function (l) { return l[0]; });
  const PLAIN = ALL.filter(function (c) { return c !== "و" && c !== "ي"; });   // consonants that can't be mistaken for vowels
  const SIMPLE = PLAIN.filter(function (c) { return SAY[c].length === 1; });    // one Latin letter each, so doubling reads cleanly
  const SUN = "تثدذرزسشصضطظلن";

  // Letters that share a shape and differ only in dots, and letters that sound close.
  const ALIKE = [
    "بتثني", "جحخ", "دذ", "رز", "سش", "صض", "طظ", "عغ", "فق", "كل",
    "سص", "تط", "دض", "ذظز", "هح", "كق"
  ];
  function lookalikes(c) {
    const out = [];
    ALIKE.forEach(function (g) { if (g.indexOf(c) >= 0) g.split("").forEach(function (x) { if (x !== c && out.indexOf(x) < 0) out.push(x); }); });
    return out;
  }

  const rand = function (n) { return Math.floor(Math.random() * n); };
  const pick = function (list) { return list[rand(list.length)]; };
  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* A chunk is a list of segments. Each segment is one consonant plus what sits on it:
       { c, v }               a short vowel            بَ  ba
       { c, v, long: true }   a long vowel             بَا bā
       { c }                  sukūn, no vowel          بْ  b
       { c, v, double: true } shaddah, a doubled letter بَّ bba
       { c, tan }             tanwīn                   بٌ  bun
     Building both the Arabic and the Latin reading from the same segments
     guarantees the two always agree. */
  function arabic(segs) {
    return segs.map(function (s) {
      if (s.raw) return s.raw;
      let out = s.c;
      if (s.double) out += SHADDA;
      if (s.tan) return out + TANWIN[s.tan] + (s.tan === "an" ? "ا" : "");
      if (!s.v) return out + SUKUN;
      out += SHORT[s.v];
      if (s.long) out += LONG[s.v];
      return out;
    }).join("");
  }
  function reading(segs) {
    return segs.map(function (s) {
      if (s.raw) return s.say;
      let out = SAY[s.c];
      if (s.double) out += out;
      if (s.tan) return out + s.tan;
      if (!s.v) return out;
      return out + (s.long ? LONG_SAY[s.v] : s.v);
    }).join("");
  }

  // A long ī can't sit on ي, nor a long ū on و: those would be different sounds.
  function okLong(c, v) { return !(c === "ي" && v === "i") && !(c === "و" && v === "u"); }

  /* Wrong answers are made by changing one thing about the right one. `kinds`
     says which changes are allowed, so each level tests what it teaches. */
  function variants(segs, kinds) {
    const out = [];
    const push = function (copy) { out.push(copy); };
    segs.forEach(function (s, i) {
      if (s.raw) return;
      const swap = function (patch) { const copy = segs.map(function (x) { return Object.assign({}, x); }); Object.assign(copy[i], patch); push(copy); };
      if (kinds.vowel && s.v) ["a", "i", "u"].forEach(function (v) { if (v !== s.v && (!s.long || okLong(s.c, v))) swap({ v: v }); });
      if (kinds.length && s.v && !s.double && okLong(s.c, s.v)) swap({ long: !s.long });
      if (kinds.letter) lookalikes(s.c).forEach(function (c) { if (!s.long || okLong(c, s.v)) swap({ c: c }); });
      if (kinds.double && s.v && i > 0) swap({ double: !s.double });
      if (kinds.tan && s.tan) ["un", "an", "in"].forEach(function (t) { if (t !== s.tan) swap({ tan: t }); });
      if (kinds.sukun && !s.v && !s.tan) ["a", "i", "u"].forEach(function (v) { swap({ v: v }); });
    });
    return out;
  }

  function generated(segs, kinds, gloss) {
    const answer = reading(segs), seen = {};
    seen[answer] = true;
    const wrong = [];
    shuffle(variants(segs, kinds)).forEach(function (v) {
      const r = reading(v);
      if (wrong.length < 3 && !seen[r]) { seen[r] = true; wrong.push(r); }
    });
    // Letters with no look-alike can leave fewer than three; fill with any other letter.
    for (let guard = 0; wrong.length < 3 && guard < 40; guard++) {
      const copy = segs.map(function (x) { return Object.assign({}, x); });
      const i = rand(copy.length);
      if (copy[i].raw) continue;
      const c = pick(PLAIN);
      if (copy[i].long && !okLong(c, copy[i].v)) continue;
      copy[i].c = c;
      const r = reading(copy);
      if (!seen[r]) { seen[r] = true; wrong.push(r); }
    }
    return { ar: arabic(segs), answer: answer, wrong: wrong, gloss: gloss || "" };
  }

  const V = function () { return pick(["a", "i", "u"]); };
  const cv = function (c) { return { c: c || pick(ALL), v: V() }; };
  function cvLong() {
    for (;;) { const c = pick(ALL), v = V(); if (okLong(c, v)) return { c: c, v: v, long: true }; }
  }

  /* Real three-letter roots, so the word-shape drill produces real-looking words. */
  const ROOTS = ["كتب", "علم", "خلق", "نصر", "ذكر", "عمل", "سجد", "صدق", "ظلم", "حمد", "شكر", "رحم",
    "غفر", "فتح", "جعل", "قتل", "حفظ", "سمع", "نزل", "رزق", "كفر", "صبر", "حكم", "قدر", "دخل", "خرج", "شهد", "ملك"];
  const SHAPES = [
    { name: "he did it", make: function (r) { return [{ c: r[0], v: "a" }, { c: r[1], v: "a" }, { c: r[2], v: "a" }]; } },
    { name: "he did it", make: function (r) { return [{ c: r[0], v: "a" }, { c: r[1], v: "i" }, { c: r[2], v: "a" }]; } },
    { name: "the doer", make: function (r) { return [{ c: r[0], v: "a", long: true }, { c: r[1], v: "i" }, { c: r[2] }]; } },
    { name: "a lasting quality", make: function (r) { return [{ c: r[0], v: "a" }, { c: r[1], v: "i", long: true }, { c: r[2] }]; } },
    { name: "the done-to", make: function (r) { return [{ c: "م", v: "a" }, { c: r[0] }, { c: r[1], v: "u", long: true }, { c: r[2] }]; } },
    { name: "he does it", make: function (r) { return [{ c: "ي", v: "a" }, { c: r[0] }, { c: r[1], v: "a" }, { c: r[2], v: "u" }]; } },
    { name: "does it constantly", make: function (r) { return [{ c: r[0], v: "a" }, { c: r[1], v: "a", long: true, double: true }, { c: r[2] }]; } },
    { name: "a plural shape", make: function (r) { return [{ c: r[0], v: "u" }, { c: r[1], v: "u", long: true }, { c: r[2] }]; } }
  ];

  /* ════════════ Levels ════════════ */
  function fromList(list, kind) {
    return function (state) {
      // Entries you have missed before come up more often.
      const miss = state.miss || {};
      const bag = [];
      list.forEach(function (e) { const n = 1 + Math.min(4, miss[e[0]] || 0) * 2; for (let i = 0; i < n; i++) bag.push(e); });
      const e = pick(bag);
      const others = shuffle(list.filter(function (x) { return x[1] !== e[1]; }));
      // Prefer wrong answers that start the same way, so the first letter alone isn't enough.
      others.sort(function (a, b) { return (b[1][0] === e[1][0]) - (a[1][0] === e[1][0]); });
      const wrong = [];
      others.forEach(function (x) { if (wrong.length < 3 && wrong.indexOf(x[1]) < 0) wrong.push(x[1]); });
      return { ar: e[0], answer: e[1], wrong: wrong, gloss: kind === "english" ? "" : (e[2] || ""), track: e[0] };
    };
  }

  let courseWords = null;       // filled from Arabic Foundations the first time it's needed

  const GROUPS = [
    { title: "The marks", lede: "One drill for each mark a letter can carry. Start here: every later drill depends on reading these without thinking.", levels: [
      { id: "short", title: "Short vowels", sample: "بَ بِ بُ", blurb: "fatḥah, kasrah, ḍammah",
        intro: "Three small marks give a consonant its vowel.\n\n| Mark | Name | Sound | Example |\n|---|---|---|---|\n| a stroke **above** | fatḥah | a | بَ ba |\n| a stroke **below** | kasrah | i | بِ bi |\n| a small loop **above** | ḍammah | u | بُ bu |\n\nThe answers in this drill differ only in the vowel, so watch where the mark sits.",
        make: function () { return generated([cv()], { vowel: true, letter: true }); } },
      { id: "sukun", title: "Sukūn: no vowel", sample: "مِنْ", blurb: "the small circle that closes a syllable",
        intro: "A small circle above a letter is a **sukūn**. It means the letter has no vowel, so it closes the syllable before it.\n\n> مِنْ    قُلْ    بَلْ\n> min, qul, bal\n\nRead the two letters as one beat, not two.",
        make: function () { return generated([cv(pick(ALL)), { c: pick(PLAIN) }], { vowel: true, letter: true, sukun: true }); } },
      { id: "long", title: "Long vowels", sample: "بَا بِي بُو", blurb: "a short vowel stretched by ا ي و",
        intro: "A short vowel followed by its matching letter is held about twice as long.\n\n| Short | Long | Sound |\n|---|---|---|\n| بَ | بَا | bā |\n| بِ | بِي | bī |\n| بُ | بُو | bū |\n\nThe difference between short and long changes meaning in Arabic, so the wrong answers here are mostly the same syllable at the other length.",
        make: function () { return generated([Math.random() < 0.7 ? cvLong() : cv()], { length: true, vowel: true }); } },
      { id: "shadda", title: "Shaddah: doubling", sample: "رَبَّ", blurb: "the small w that doubles a letter",
        intro: "A mark like a small **w** above a letter is a **shaddah**. The letter is said twice: once to close the syllable before it, and once to open the next.\n\n> رَبَّ    إِنَّ    كُلُّ\n> rab-ba, in-na, kul-lu\n\nThe vowel of the doubled letter sits on top of the shaddah, or just under it for kasrah.",
        make: function () { return generated([cv(pick(PLAIN)), { c: pick(SIMPLE), v: V(), double: true }], { double: true, vowel: true }); } },
      { id: "tanwin", title: "Tanwīn: the n ending", sample: "بٌ بًا بٍ", blurb: "a doubled vowel mark adds -n",
        intro: "A vowel mark written **twice** at the end of a word adds an n sound. It is how Arabic says \"a\" or \"an\".\n\n| Mark | Sound | Example |\n|---|---|---|\n| ـٌ | -un | كِتَابٌ kitābun |\n| ـً | -an | كِتَابًا kitāban |\n| ـٍ | -in | كِتَابٍ kitābin |\n\nThe -an form usually has an alif written after it. That alif is not a long vowel.",
        make: function () { return generated([cv(pick(PLAIN)), { c: pick(PLAIN), tan: pick(["un", "an", "in"]) }], { tan: true, vowel: true }); } },
      { id: "madd", title: "Maddah and dagger alif", sample: "آ  ـٰ", blurb: "a long ā with no full alif",
        intro: "Two marks write a long **ā** without a normal alif.\n\n- **Maddah**, the wavy line on آ, is a hamzah followed by a long ā: آمَنَ is āmana.\n- The **dagger alif**, a small upright stroke above a letter, is a long ā that is pronounced but not written as a full letter: هَٰذَا is hādhā.\n\nThe dagger alif appears in a short list of very common words, so they are worth knowing by sight.",
        make: fromList(DATA.madd) },
      { id: "special", title: "ة  ى  ء", sample: "ة ى ء", blurb: "letters that don't sound the way they look",
        intro: "Three shapes to recognise on sight.\n\n- **ة** (tāʾ marbūṭah) ends feminine words. Stopping on it you say **h**: جَنَّة is jannah.\n- **ى** (alif maqṣūrah) looks like ي without dots but is a long **ā** at the end of a word: عَلَى is ʿalā.\n- **ء** (hamzah) is a catch in the throat, written ʾ. It can sit on أ, إ, ؤ or ئ, or on the line. The seat is only spelling: you always say the hamzah itself.",
        make: fromList(DATA.special) }
    ] },
    { title: "Letter groups", lede: "Now read more than one beat at a time. These are where letter-by-letter reading turns into chunks.", levels: [
      { id: "dots", title: "Same shape, different dots", sample: "بـ تـ ثـ نـ يـ", blurb: "tell look-alike letters apart at speed",
        intro: "Many letters share one shape and differ only in their dots: ب ت ث ن ي, then ج ح خ, د ذ, ر ز, س ش, ص ض, ط ظ, ع غ and ف ق.\n\nWhen a word flashes past, the dots are what you have to catch. Every wrong answer in this drill is a look-alike of the right one.",
        make: function () {
          const c1 = pick(PLAIN.filter(function (c) { return lookalikes(c).length; }));
          return generated([cv(c1), Math.random() < 0.5 ? cv(pick(PLAIN)) : { c: pick(PLAIN) }], { letter: true });
        } },
      { id: "glide", title: "aw and ay", sample: "يَوْم  بَيْت", blurb: "a then و or ي with sukūn",
        intro: "A fatḥah followed by و or ي with a sukūn makes a glide, not a long vowel.\n\n> يَوْم    بَيْت\n> yawm, bayt\n\nCompare بَيْ (bay) with بِي (bī): the same letters, different marks, different sound.",
        make: function () {
          // Half the time a real glide (bayt), half the time the long vowel it is confused with (bīt).
          const c1 = pick(PLAIN), c2 = pick(PLAIN), y = Math.random() < 0.5, isGlide = Math.random() < 0.6;
          const glideSegs = [{ c: c1, v: "a" }, { c: y ? "ي" : "و" }, { c: c2 }];
          const longSegs = [{ c: c1, v: y ? "i" : "u", long: true }, { c: c2 }];
          const item = generated(isGlide ? glideSegs : longSegs, { letter: true });
          const trap = reading(isGlide ? longSegs : glideSegs);
          item.wrong = [trap].concat(item.wrong.filter(function (r) { return r !== trap; })).slice(0, 3);
          return item;
        } },
      { id: "two", title: "Two beats", sample: "كِتَا  مَسْجِ", blurb: "two syllables in one look",
        intro: "Two syllables, shown together. Try to take both in with one look, the way you read \"ta-ble\" in English without sounding out five letters.",
        make: function () {
          const first = pick([function () { return [cv(pick(PLAIN))]; }, function () { return [cvLong()]; }, function () { return [cv(pick(PLAIN)), { c: pick(PLAIN) }]; }])();
          return generated(first.concat([Math.random() < 0.5 ? cvLong() : cv(pick(PLAIN))]), { vowel: true, length: true, letter: true });
        } },
      { id: "shapes", title: "Word shapes", sample: "فَاعِل", blurb: "real roots in the commonest patterns",
        intro: "Arabic words are a three-letter **root** poured into a **pattern** of vowels. Once your eye knows the patterns, most of a word is read before you look at it.\n\n| Shape | Example | Idea |\n|---|---|---|\n| ـَ ـَ ـَ | كَتَبَ | he did it |\n| ـَا ـِ ـ | كَاتِب | the doer |\n| ـَ ـِي ـ | عَلِيم | a lasting quality |\n| مَـ ـْ ـُو ـ | مَكْتُوب | the done-to |\n\nThe wrong answers are the same root in other shapes.",
        make: function () {
          const root = pick(ROOTS).split(""), shape = pick(SHAPES);
          const item = generated(shape.make(root), { vowel: true, length: true, double: true }, shape.name);
          // Add the same root in other shapes as tempting wrong answers.
          const extra = shuffle(SHAPES).map(function (s) { return reading(s.make(root)); }).filter(function (r) { return r !== item.answer; });
          item.wrong = shuffle(extra.slice(0, 2).concat(item.wrong)).filter(function (r, i, a) { return a.indexOf(r) === i; }).slice(0, 3);
          return item;
        } },
      { id: "al", title: "The word \"the\"", sample: "الْـ  الشَّـ", blurb: "sun and moon letters",
        intro: "الـ is \"the\". Before a **moon letter** the ل is heard and carries a sukūn: الْقَمَر is al-qamar. Before a **sun letter** the ل is silent and the next letter is doubled: الشَّمْس is ash-shams.\n\nYou don't need the list. A shaddah right after الـ means the ل has merged.",
        make: function () {
          const c = pick(PLAIN), v = V(), tail = cv(pick(PLAIN));
          const sun = SUN.indexOf(c) >= 0;
          // How "the" + this letter + vowel is read, with the ل either merged or heard.
          const read = function (letter, vowel, merged) {
            return (merged ? "a" + SAY[letter] + "-" : "al-") + SAY[letter] + vowel + reading([tail]);
          };
          const answer = read(c, v, sun);
          const trap = read(c, v, !sun);              // the tempting mistake comes first
          const wrong = trap === answer ? [] : [trap];  // (for ل itself the two readings are the same)
          const others = [];
          ["a", "i", "u"].forEach(function (x) { if (x !== v) others.push(read(c, x, sun)); });
          lookalikes(c).forEach(function (x) { others.push(read(x, v, SUN.indexOf(x) >= 0)); });
          shuffle(others).forEach(function (r) { if (wrong.length < 3 && r !== answer && wrong.indexOf(r) < 0) wrong.push(r); });
          const ar = (sun ? "ال" + c + SHADDA : "الْ" + c) + SHORT[v] + arabic([tail]);
          return { ar: ar, answer: answer, wrong: wrong, gloss: sun ? "sun letter: the ل is silent" : "moon letter: the ل is heard" };
        } },
      { id: "parts", title: "Beginnings and endings", sample: "ـُونَ  وَالْـ", blurb: "the pieces that recur on thousands of words",
        intro: "A few beginnings and endings appear again and again: plural endings, attached pronouns, and little words joined to \"the\". Knowing them as single units means a long word becomes a short root with familiar pieces on each side.\n\nA dash shows where the rest of the word joins on.",
        make: fromList(DATA.parts) }
    ] },
    { title: "Whole words", lede: "The goal: see it, know it.", levels: [
      { id: "words", title: "Words from Arabic Foundations", sample: "كِتَابٌ", blurb: "the course's 190 words, by sight",
        intro: "The words taught in the Arabic Foundations course, flashed one at a time. You pick how each is read, and its meaning is shown afterwards.\n\nThese are words you will meet constantly, so they are the ones most worth recognising whole.",
        needs: "course",
        make: function (state) { return fromList(courseWords)(state); } },
      { id: "english", title: "English in Arabic letters", sample: "بِيتْزَا", blurb: "words you already know, spelled by sound",
        intro: "English words written out by sound in Arabic letters. You already know what they mean, so all your attention goes on reading.\n\nArabic has no p, v, hard g or \"ch\", so they are written ب, ف, غ and تْش, and English vowels are squeezed into a, i and u. Expect \"pizza\" to look like \"bītzā\". Many of these are also how Arabic really spells the borrowed word.",
        kind: "english",
        make: fromList(DATA.english, "english") }
    ] }
  ];
  const LEVELS = {};
  GROUPS.forEach(function (g) { g.levels.forEach(function (l) { LEVELS[l.id] = l; }); });

  /* ════════════ Saved progress ════════════ */
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s && s.levels) return Object.assign({ levels: {}, miss: {}, flash: true, auto: false }, s);
    } catch (err) { /* fall through */ }
    return { levels: {}, miss: {}, flash: true, auto: false };
  }
  let store = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (err) { /* storage unavailable */ } }
  function levelState(id) {
    if (!store.levels[id]) store.levels[id] = { rounds: 0, best: 0, flash: FLASH.start };
    return store.levels[id];
  }

  /* ════════════ Small helpers ════════════ */
  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "html") el.innerHTML = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k]);
    });
    [].concat(children || []).forEach(function (c) { if (c) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  const BACK = '<svg aria-hidden="true" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg>';
  const SOUND = '<svg aria-hidden="true" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.2v3.6h2.300L8 12.500v-9L4.800 6.200z"/><path d="M10.500 5.800a3 3 0 0 1 0 4.400M12.300 4a5.500 5.500 0 0 1 0 8"/></svg>';
  function show(nodes) {
    app.textContent = "";
    [].concat(nodes).forEach(function (n) { if (n) app.appendChild(n); });
    window.scrollTo(0, 0);
  }
  const seconds = function (ms) { return (ms / 1000).toFixed(ms < 1000 ? 2 : 1) + "s"; };

  function arabicVoice() {
    const synth = window.speechSynthesis;
    if (!synth) return null;
    return synth.getVoices().filter(function (v) { return v.lang.toLowerCase().indexOf("ar") === 0; })[0] || null;
  }
  if (window.speechSynthesis) window.speechSynthesis.getVoices();     // voices load lazily; ask early
  function speak(text) {
    const voice = arabicVoice();
    if (!voice) return;
    const u = new SpeechSynthesisUtterance(text.replace(/ـ/g, ""));
    u.voice = voice; u.lang = voice.lang; u.rate = 0.75;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  /* ════════════ Home ════════════ */
  let run = null;       // the drill in progress
  let timers = [];
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function home() {
    clearTimers(); run = null;
    const groups = GROUPS.map(function (g) {
      return h("section", { class: "lm-group" }, [
        h("h2", { text: g.title }),
        h("p", { text: g.lede }),
        h("ul", { class: "lm-levels" }, g.levels.map(function (l) {
          const s = store.levels[l.id];
          return h("li", {}, h("a", { href: "#/" + l.id }, [
            h("span", { class: "lm-sample", lang: "ar", dir: "rtl", text: l.sample }),
            h("span", { class: "lm-name" }, [h("b", { text: l.title }), h("span", { text: l.blurb })]),
            s && s.rounds ? h("span", { class: "lm-score" }, [h("b", { text: Math.round(s.best * 100) + "%" }), h("span", { text: "flash " + seconds(s.flash) })]) : null
          ]));
        }))
      ]);
    });
    show([
      h("header", { class: "kit-hero" }, [
        h("a", { class: "kit-back", href: "/projects.html", html: BACK + "<span>Projects</span>" }),
        h("h1", { text: "Lamha" }),
        h("p", { class: "kit-lede", html: Kit.inline("لَمْحَة means \"a glance\". These drills train you to read Arabic in chunks, the way you read English, instead of one letter at a time.") }),
        h("p", { class: "lm-tip", html: "<strong>How it works.</strong> A word flashes and disappears, then you pick what it said. Because it vanishes, you can't spell it out. The word then comes back with its reading, and you press Next when you're ready. Every right answer makes the flash a little shorter. A few minutes a day does more than one long session." })
      ])
    ].concat(groups, [
      h("details", { class: "lm-key" }, [
        h("summary", { text: "How the letters are written in the answers" }),
        h("div", { class: "lm-key-grid" }, LETTERS.map(function (l) {
          return h("div", { title: l[2] }, [h("span", { class: "ar", lang: "ar", text: l[0] }), h("span", { text: l[1] })]);
        })),
        h("p", { class: "lm-key-note", text: "A line over a vowel (ā ī ū) means it is long. A dot under a letter (ḥ ṣ ḍ ṭ ẓ) marks the heavier of two similar sounds. ʿ is the letter ع and ʾ is a hamzah. Doubled letters are written twice." })
      ])
    ]));
    document.title = "Lamha — Read Arabic at a Glance";
  }

  /* ════════════ Level intro ════════════ */
  function intro(level) {
    clearTimers(); run = null;
    const s = levelState(level.id);
    const flashBox = h("input", { type: "checkbox", id: "lmFlash" });
    flashBox.checked = store.flash !== false;
    flashBox.addEventListener("change", function () { store.flash = flashBox.checked; save(); });
    const autoBox = h("input", { type: "checkbox", id: "lmAuto" });
    autoBox.checked = store.auto === true;
    autoBox.addEventListener("change", function () { store.auto = autoBox.checked; save(); });
    const start = h("button", { type: "button", class: "kit-btn primary", text: "Start · " + ROUND + " words" });
    start.addEventListener("click", function () { begin(level); });

    const body = [
      h("nav", { class: "kit-crumb" }, h("a", { href: "#/", html: BACK + "<span>Lamha</span>" })),
      h("article", { class: "kit-lesson lm-intro" }, [
        h("p", { class: "kit-eyebrow", text: s.rounds ? s.rounds + (s.rounds === 1 ? " round" : " rounds") + " · best " + Math.round(s.best * 100) + "% · flash " + seconds(s.flash) : "New" }),
        h("h1", { html: Kit.inline(level.title) }),
        h("div", { class: "kit-prose", html: Kit.blocks(level.intro.split("\n")) }),
        h("label", { class: "lm-switch", for: "lmFlash" }, [flashBox, "Flash the word, then hide it"]),
        h("p", { class: "kit-say", text: "Turn this off to keep each word on screen while you are first learning a mark." }),
        h("label", { class: "lm-switch", for: "lmAuto" }, [autoBox, "Move on automatically after a right answer"]),
        h("p", { class: "kit-say", text: "Off by default: you press Next (or Enter) when you are ready." })
      ]),
      h("div", { class: "kit-bar" }, start)
    ];
    show(body);
    document.title = level.title + " · Lamha";

    if (level.needs === "course" && !courseWords) {
      start.setAttribute("disabled", "");
      start.textContent = "Loading words…";
      Kit.load("/projects/arabic-foundations/course.json").then(function (course) {
        const seen = {};
        courseWords = [];
        course.lessons.forEach(function (l) {
          l.words.forEach(function (w) {
            // Skip fragments (they contain a joining dash) and repeats.
            if (!w.say || w.term.indexOf("ـ") >= 0 || seen[w.say]) return;
            seen[w.say] = true;
            courseWords.push([w.term, w.say, w.meaning]);
          });
        });
        start.removeAttribute("disabled");
        start.textContent = "Start · " + ROUND + " words";
      }).catch(function () { start.textContent = "Couldn't load the course words"; });
    }
  }

  /* ════════════ The drill ════════════ */
  let cameFromIntro = false;    // true when the page before this drill in the browser's history is its intro
  // A running drill has its own address (#/<drill>/go), so the browser's Back
  // button and the arrow in the corner both lead back to the drill's intro page.
  function begin(level) {
    const target = "#/" + level.id + "/go";
    if (location.hash === target) startDrill(level);     // "Another round": already there
    else { cameFromIntro = true; location.hash = target; }
  }
  function startDrill(level) {
    const s = levelState(level.id);
    run = { level: level, state: s, n: 0, right: 0, times: [], missed: [], last: "" };
    if (!store.miss[level.id]) store.miss[level.id] = {};
    next();
  }

  function next() {
    clearTimers();
    const r = run;
    if (r.n >= ROUND) { finish(); return; }
    const state = { miss: store.miss[r.level.id] };
    let item;
    for (let tries = 0; tries < 12; tries++) {
      item = r.level.make(state);
      if (item.wrong.length >= 2 && item.ar !== r.last) break;     // avoid repeats and thin questions
    }
    r.last = item.ar;
    r.n++;

    const flashing = store.flash !== false;
    const word = h("div", { class: "lm-word" + (item.ar.length > 14 ? " long" : ""), lang: "ar", dir: "rtl", text: item.ar });
    const readingEl = h("div", { class: "lm-reading" });
    const gloss = h("div", { class: "lm-gloss" });
    const prompt = h("p", { class: "lm-prompt", text: flashing ? "Look…" : (r.level.kind === "english" ? "Which English word is this?" : "How is this read?") });
    const after = h("div", { class: "lm-after" });
    const options = shuffle([item.answer].concat(item.wrong));
    let shownAt = 0, done = false;

    const buttons = options.map(function (text, i) {
      return h("button", { type: "button", class: "kit-option", html: '<span class="kit-key">' + (i + 1) + "</span><span>" + Kit.inline(text) + "</span>",
        onclick: function () { choose(i); } });
    });
    const grid = h("div", { class: "lm-options" + (flashing ? " waiting" : "") }, buttons);

    function reveal() {
      grid.classList.remove("waiting");
      if (flashing) prompt.textContent = r.level.kind === "english" ? "Which English word was it?" : "What did it say?";
      shownAt = performance.now();
    }
    function choose(i) {
      if (done || grid.classList.contains("waiting")) return;
      done = true;
      clearTimers();
      const ok = options[i] === item.answer;
      const took = performance.now() - shownAt;
      buttons.forEach(function (b, j) {
        b.setAttribute("disabled", "");
        if (options[j] === item.answer) b.classList.add("right");
        else if (j === i) b.classList.add("wrong");
      });
      word.classList.remove("hidden");
      readingEl.textContent = item.answer;
      gloss.textContent = item.gloss;
      prompt.textContent = ok ? "Yes." : "Not quite. Look again.";

      const s = r.state;
      if (ok) {
        r.right++; r.times.push(took);
        if (flashing) s.flash = Math.max(FLASH.min, Math.round(s.flash * 0.94));
      } else {
        r.missed.push(item);
        if (flashing) s.flash = Math.min(FLASH.max, Math.round(s.flash * 1.25));
        if (item.track) store.miss[r.level.id][item.track] = (store.miss[r.level.id][item.track] || 0) + 1;
      }
      if (ok && item.track && store.miss[r.level.id][item.track]) store.miss[r.level.id][item.track]--;
      save();

      if (arabicVoice()) after.appendChild(h("button", { type: "button", class: "kit-btn", "aria-label": "Hear it", html: SOUND + "<span>Hear it</span>", onclick: function () { speak(item.ar); } }));
      const go = h("button", { type: "button", class: "kit-btn primary", text: r.n >= ROUND ? "Finish" : "Next", onclick: next });
      after.appendChild(go);
      run.advance = next;
      // By default nothing moves until you press Next, so you can look at the word
      // for as long as you like. With auto-advance on, right answers move on by themselves.
      if (ok && store.auto === true) timers.push(setTimeout(next, 900));
      else go.focus({ preventScroll: true });
    }
    run.choose = choose;
    run.advance = null;

    show([
      h("div", { class: "kit-practice-top" }, [
        h("a", { class: "kit-close", href: "#/" + r.level.id, "aria-label": "Stop and go back", html: BACK,
          // Step back in history when the intro is the previous page, so the browser's own
          // Back button doesn't then return to the drill that was just left.
          onclick: function (e) { if (cameFromIntro) { e.preventDefault(); cameFromIntro = false; history.back(); } } }),
        h("div", { class: "kit-meter-bar", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": ROUND, "aria-valuenow": r.n - 1 }, h("span", { style: "width:" + ((r.n - 1) / ROUND * 100) + "%" })),
        h("span", { class: "lm-speed", text: flashing ? "flash " + seconds(r.state.flash) : r.n + " / " + ROUND })
      ]),
      h("section", { class: "lm-stage", "aria-live": "polite" }, [word, readingEl, gloss]),
      prompt, grid, after
    ]);

    if (flashing) {
      timers.push(setTimeout(function () { word.classList.add("hidden"); reveal(); }, r.state.flash));
    } else reveal();
  }

  function finish() {
    clearTimers();
    const r = run, s = r.state;
    const acc = r.right / ROUND;
    s.rounds++; s.best = Math.max(s.best, acc);
    save();
    const sorted = r.times.slice().sort(function (a, b) { return a - b; });
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    const level = r.level;
    run = null;

    show([
      h("section", { class: "kit-done" }, [
        h("h1", { text: acc === 1 ? "Clean round." : acc >= 0.8 ? "Good round." : "Keep at it." }),
        h("p", { class: "kit-lede", text: acc >= 0.9 ? "When this feels easy at a short flash, move on to the next drill." : "Accuracy first. Speed follows on its own." }),
        h("div", { class: "lm-results" }, [
          h("div", {}, [h("b", { text: r.right + "/" + ROUND }), h("span", { text: "right" })]),
          h("div", {}, [h("b", { text: median ? seconds(median) : "–" }), h("span", { text: "typical answer time" })]),
          h("div", {}, [h("b", { text: store.flash !== false ? seconds(s.flash) : "off" }), h("span", { text: "flash length now" })])
        ]),
        r.missed.length ? h("p", { class: "lm-missed-head", text: "Worth another look" }) : null,
        r.missed.length ? h("ul", { class: "lm-missed" }, r.missed.map(function (m) {
          return h("li", {}, [h("span", { class: "ar", lang: "ar", dir: "rtl", text: m.ar }), h("span", { text: m.answer + (m.gloss ? " · " + m.gloss : "") })]);
        })) : null,
        h("div", { class: "kit-actions" }, [
          h("button", { type: "button", class: "kit-btn primary", text: "Another round", onclick: function () { begin(level); } }),
          h("a", { class: "kit-btn", href: "#/", text: "All drills" })
        ])
      ])
    ]);
  }

  /* ════════════ Routing and keys ════════════ */
  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/");
    const level = LEVELS[parts[0]];
    if (!level) { home(); return; }
    // Opening a drill's address directly (a reload, say) when its words aren't loaded yet shows the intro instead.
    if (parts[1] === "go" && !(level.needs === "course" && !courseWords)) startDrill(level);
    else intro(level);
  }
  window.addEventListener("hashchange", route);
  document.addEventListener("keydown", function (e) {
    if (!run || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[1-4]$/.test(e.key)) { run.choose(+e.key - 1); return; }
    if ((e.key === "Enter" || e.key === " ") && run.advance && e.target.tagName !== "BUTTON") { e.preventDefault(); run.advance(); }
  });
  route();

  // For the site's tests: build items without touching the page.
  window.Lamha = { GROUPS: GROUPS, LEVELS: LEVELS, arabic: arabic, reading: reading };
})();
