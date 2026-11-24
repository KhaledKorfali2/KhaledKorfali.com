/* Course Kit: turns a folder of plain-text lessons into an interactive course.

   A course is a folder holding
     index.html      three lines that load this file and call Kit.start("course.json")
     course.json     title, description and the order of units and lessons
     lessons/*.md    one file per lesson: prose, a word list, questions, flashcards

   Nothing is compiled. Edit a lesson file, refresh the page, and it's live.
   The authoring guide is in /kit/README.md and /kit/check.html checks a whole
   course for mistakes.

   This file has four parts: text formatting, the lesson-file parser, loading
   and progress, and the screens. */
(function () {
  "use strict";

  const Kit = window.Kit = {};

  /* ════════════════════════════════════════════════════════════════════
     1. Text formatting (a small, safe subset of Markdown)
     ════════════════════════════════════════════════════════════════════ */
  const ARABIC = "\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF";
  const ARABIC_RUN = new RegExp("[" + ARABIC + "]+(?:[ \\u00A0]+[" + ARABIC + "]+)*", "g");
  const HAS_ARABIC = new RegExp("[" + ARABIC + "]");

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Inline formatting: `code`, **bold**, *italic*, [links](url). Runs of Arabic
  // script are wrapped so they get the right font, size and direction.
  function inline(text) {
    const codes = [];
    let s = esc(text).replace(/`([^`]+)`/g, function (m, c) { codes.push(c); return "\u0001" + (codes.length - 1) + "\u0001"; });
    s = s.replace(ARABIC_RUN, function (m) { return '<span class="ar" lang="ar" dir="rtl">' + m + "</span>"; });
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, "$1<em>$2</em>");
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, url) {
      // Only ordinary web and same-site links; anything else is left as text.
      if (!/^(https?:\/\/|\/|\.\.?\/|#)/.test(url)) return m;
      const out = /^https?:/.test(url) ? ' target="_blank" rel="noopener"' : "";
      return '<a href="' + url + '"' + out + ">" + label + "</a>";
    });
    return s.replace(/\u0001(\d+)\u0001/g, function (m, i) { return "<code>" + codes[+i] + "</code>"; });
  }

  function cells(line) {
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) { return c.trim(); });
  }
  const isRule = function (line) { return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.indexOf("-") >= 0; };

  // Block formatting: headings, paragraphs, lists, quotes, tables, code fences.
  function blocks(lines) {
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (/^```/.test(line)) {
        const code = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
        i++;
        out.push("<pre><code>" + esc(code.join("\n")) + "</code></pre>");
      } else if (/^#{2,4}\s/.test(line)) {
        const level = line.match(/^#+/)[0].length;
        out.push("<h" + level + ">" + inline(line.replace(/^#+\s*/, "")) + "</h" + level + ">");
        i++;
      } else if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
        out.push("<hr>"); i++;
      } else if (/^>/.test(line)) {
        const quote = [];
        while (i < lines.length && /^>/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ""));
        out.push("<blockquote>" + quote.map(function (q) { return "<p>" + inline(q) + "</p>"; }).join("") + "</blockquote>");
      } else if (/^\s*\|/.test(line)) {
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
        const head = rows.length > 1 && isRule(rows[1]) ? rows.shift() : null;
        if (head) rows.shift();
        let html = '<div class="table-wrap"><table>';
        if (head) html += "<thead><tr>" + cells(head).map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("") + "</tr></thead>";
        html += "<tbody>" + rows.map(function (r) {
          return "<tr>" + cells(r).map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>";
        out.push(html);
      } else if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
        const ordered = /^\s*\d+\./.test(line), items = [];
        while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
          let item = lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, "");
          // A following indented line continues the same item.
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) item += " " + lines[i++].trim();
          items.push("<li>" + inline(item) + "</li>");
        }
        out.push((ordered ? "<ol>" : "<ul>") + items.join("") + (ordered ? "</ol>" : "</ul>"));
      } else {
        const para = [];
        while (i < lines.length && lines[i].trim() && !/^(```|#{2,4}\s|>|\s*\||\s*([-*]|\d+\.)\s+)/.test(lines[i])) para.push(lines[i++].trim());
        out.push("<p>" + inline(para.join(" ")) + "</p>");
      }
    }
    return out.join("\n");
  }

  /* ════════════════════════════════════════════════════════════════════
     2. The lesson-file parser
     ════════════════════════════════════════════════════════════════════ */
  const TYPES = { "": "choice", choice: "choice", type: "type", order: "order", match: "match", sort: "sort" };

  // Splits "a, b, c" or "a | b | c" into trimmed, non-empty parts.
  function list(text) {
    return text.split(text.indexOf("|") >= 0 ? "|" : /[,،]/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function parseQuestion(q, problem) {
    const ex = { type: q.type, prompt: q.prompt, context: [], why: [], line: q.line };
    const body = q.lines.filter(function (l) { return l.text.trim(); });
    const rest = [];
    body.forEach(function (l) {
      const t = l.text.trim();
      if (t[0] === "!") ex.why.push(t.slice(1).trim());
      else if (t[0] === ">") ex.context.push(t.slice(1).trim());
      else rest.push({ text: t, line: l.line });
    });
    ex.why = ex.why.join(" ");

    if (ex.type === "choice") {
      ex.options = [];
      ex.fixed = false;
      rest.forEach(function (l) {
        if (l.text === "@fixed") ex.fixed = true;
        else if (/^[-+]\s+/.test(l.text)) ex.options.push({ text: l.text.slice(1).trim(), right: l.text[0] === "+" });
        else problem(l.line, "In a choice question every line should start with - (wrong) or + (right).");
      });
      const right = ex.options.filter(function (o) { return o.right; }).length;
      if (ex.options.length < 2) problem(q.line, "A choice question needs at least two options.");
      if (!right) problem(q.line, "No option is marked right. Start the right one with +.");
      ex.multi = right > 1;
    } else if (ex.type === "type") {
      ex.accept = [];
      rest.forEach(function (l) {
        if (l.text[0] === "=") ex.accept.push(l.text.slice(1).trim());
        else problem(l.line, "In a typed question every answer line should start with =.");
      });
      if (!ex.accept.length) problem(q.line, "A typed question needs at least one accepted answer (a line starting with =).");
    } else if (ex.type === "order") {
      ex.tiles = []; ex.extra = [];
      rest.forEach(function (l) {
        if (/^x\s+/.test(l.text)) ex.extra = ex.extra.concat(list(l.text.slice(1)));
        else if (!ex.tiles.length) ex.tiles = l.text.split("|").map(function (s) { return s.trim(); }).filter(Boolean);
        else problem(l.line, "An ordering question has one line of tiles separated by | (plus an optional x line of decoys).");
      });
      if (ex.tiles.length < 2) problem(q.line, "An ordering question needs at least two tiles separated by |.");
    } else if (ex.type === "match") {
      ex.pairs = [];
      rest.forEach(function (l) {
        const at = l.text.indexOf(" = ");
        if (at < 0) problem(l.line, "Each line of a matching question should look like: left = right");
        else ex.pairs.push([l.text.slice(0, at).trim(), l.text.slice(at + 3).trim()]);
      });
      if (ex.pairs.length < 2) problem(q.line, "A matching question needs at least two pairs.");
    } else if (ex.type === "sort") {
      ex.groups = [];
      rest.forEach(function (l) {
        const at = l.text.indexOf(":");
        if (at < 0) problem(l.line, "Each line of a sorting question should look like: Group name: item, item");
        else ex.groups.push({ name: l.text.slice(0, at).trim(), items: list(l.text.slice(at + 1)) });
      });
      if (ex.groups.length < 2) problem(q.line, "A sorting question needs at least two groups.");
      if (ex.groups.some(function (g) { return !g.items.length; })) problem(q.line, "Every group needs at least one item.");
    }
    return ex;
  }

  // Turns the text of one lesson file into { title, html, words, exercises, cards, problems }.
  Kit.parseLesson = function (source, id) {
    const lines = String(source).replace(/\r\n?/g, "\n").split("\n");
    const lesson = { id: id, title: id, html: "", words: [], exercises: [], cards: [], problems: [] };
    const problem = function (line, message) { lesson.problems.push({ line: line, message: message }); };

    // Split into the prose and the three special sections.
    const parts = { body: [], words: [], practice: [], cards: [] };
    let where = "body", titled = false, fenced = false;
    lines.forEach(function (text, n) {
      if (/^```/.test(text)) fenced = !fenced;
      if (!fenced) {
        if (!titled && /^#\s+/.test(text)) { lesson.title = text.replace(/^#\s+/, "").trim(); titled = true; return; }
        const m = text.match(/^##\s+(words|practice|cards)\s*$/i);
        if (m) { where = m[1].toLowerCase(); return; }
      }
      parts[where].push({ text: text, line: n + 1 });
    });
    if (!titled) problem(1, "The file should start with a title line: # Lesson title");

    lesson.html = blocks(parts.body.map(function (l) { return l.text; }));

    // Words: a table of term | meaning, or term | how to say it | meaning | note.
    parts.words.forEach(function (l, i) {
      const t = l.text.trim();
      if (!t || isRule(t)) return;
      if (t[0] !== "|") { problem(l.line, "Lines under ## Words should be table rows that start with |."); return; }
      const next = parts.words[i + 1];
      if (next && isRule(next.text.trim())) return;       // a header row
      const c = cells(t);
      if (c.length < 2 || !c[0] || !c[c.length > 2 ? 2 : 1]) { problem(l.line, "A word row needs a term and a meaning."); return; }
      lesson.words.push(c.length === 2 ? { term: c[0], say: "", meaning: c[1], note: "" }
                                       : { term: c[0], say: c[1], meaning: c[2], note: c[3] || "" });
    });

    // Practice: each question starts on a line beginning with ?
    let current = null;
    parts.practice.forEach(function (l) {
      const m = l.text.match(/^\?(\w*)\s+(.*)$/);
      if (m) {
        if (!(m[1].toLowerCase() in TYPES)) {
          problem(l.line, "Unknown question type ?" + m[1] + ". Use ?, ?type, ?order, ?match or ?sort.");
          current = null;
          return;
        }
        current = { type: TYPES[m[1].toLowerCase()], prompt: m[2].trim(), lines: [], line: l.line };
        lesson.exercises.push(current);
      } else if (l.text.trim()) {
        if (current) current.lines.push(l);
        else problem(l.line, "This line isn't part of a question. Questions start with ?");
      }
    });
    lesson.exercises = lesson.exercises.map(function (q) { return parseQuestion(q, problem); });

    // Cards: Q: / A: pairs.
    let card = null;
    parts.cards.forEach(function (l) {
      const t = l.text.trim();
      if (!t) return;
      if (/^Q:/i.test(t)) { card = { front: t.slice(2).trim(), back: "", line: l.line }; lesson.cards.push(card); }
      else if (/^A:/i.test(t) && card && !card.back) card.back = t.slice(2).trim();
      else if (card && card.back) card.back += " " + t;
      else problem(l.line, "Cards are written as a Q: line followed by an A: line.");
    });
    lesson.cards.forEach(function (c) { if (!c.back) problem(c.line, "This card has a Q: but no A:."); });
    lesson.cards = lesson.cards.filter(function (c) { return c.front && c.back; });
    return lesson;
  };

  /* ════════════════════════════════════════════════════════════════════
     3. Loading a course, vocabulary drills, progress
     ════════════════════════════════════════════════════════════════════ */
  function getText(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(url + " could not be loaded (" + r.status + ")");
      return r.text();
    });
  }

  // Loads course.json and every lesson it lists. Problems are collected rather
  // than thrown, so one broken lesson doesn't take the course down.
  Kit.load = function (courseUrl) {
    const base = new URL(courseUrl, location.href);
    return getText(base.href).then(function (text) {
      let course;
      try { course = JSON.parse(text); }
      catch (err) { throw new Error("course.json isn't valid JSON: " + err.message); }
      course.problems = [];
      course.units = course.units || [];
      if (!course.id) course.problems.push('course.json needs an "id" (a short name with no spaces).');
      if (!course.title) course.problems.push('course.json needs a "title".');
      const seen = {}, jobs = [];
      course.lessons = [];
      course.units.forEach(function (unit, u) {
        unit.items = [];
        (unit.lessons || []).forEach(function (id) {
          if (seen[id]) { course.problems.push('Lesson "' + id + '" is listed twice.'); return; }
          seen[id] = true;
          const slot = { id: id, unit: u, title: id, html: "", words: [], exercises: [], cards: [], problems: [] };
          unit.items.push(slot);
          course.lessons.push(slot);
          jobs.push(getText(new URL("lessons/" + id + ".md", base).href).then(function (src) {
            Object.assign(slot, Kit.parseLesson(src, id), { unit: u });
          }, function (err) {
            slot.problems.push({ line: 0, message: err.message });
          }));
        });
      });
      return Promise.all(jobs).then(function () {
        course.base = base;
        return course;
      });
    });
  };

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // One automatic question per word, alternating direction. Wrong options are
  // other words from the course, nearest lessons first, so they are plausible.
  function drills(course, lesson) {
    if (course.drills === false) return [];
    const index = course.lessons.indexOf(lesson);
    const pool = [];
    course.lessons.forEach(function (l, i) {
      l.words.forEach(function (w) { pool.push({ w: w, far: Math.abs(i - index) }); });
    });
    return lesson.words.map(function (word, n) {
      const reverse = n % 2 === 1, pick = function (w) { return reverse ? w.term : w.meaning; };
      const used = {};
      used[pick(word)] = true;
      const others = shuffle(pool.filter(function (p) { return p.w !== word; }))
        .sort(function (a, b) { return a.far - b.far; });
      const wrong = [];
      for (let i = 0; i < others.length && wrong.length < 3; i++) {
        const text = pick(others[i].w);
        // Skip look-alikes: the same answer text, or the same question text.
        if (used[text] || others[i].w.term === word.term || others[i].w.meaning === word.meaning) continue;
        used[text] = true;
        wrong.push(text);
      }
      if (wrong.length < 2) return null;
      return {
        type: "choice", auto: true, multi: false, fixed: false, context: [],
        prompt: reverse ? "Which word means **" + word.meaning + "**?" : "What does " + word.term + " mean?",
        options: [{ text: pick(word), right: true }].concat(wrong.map(function (t) { return { text: t, right: false }; })),
        why: word.term + (word.say ? " (" + word.say + ")" : "") + " means " + word.meaning + "." + (word.note ? " " + word.note : "")
      };
    }).filter(Boolean);
  }
  Kit.drills = drills;

  function hash(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  // The flashcards a lesson contributes to the site-wide review queue.
  function cardsFor(course, lesson) {
    const out = [], prefix = course.id + ":" + lesson.id + ":";
    lesson.words.forEach(function (w) {
      out.push({
        id: prefix + "w:" + hash(w.term), front: w.term,
        back: w.meaning + (w.say ? "\n" + w.say : ""), note: w.note || ""
      });
    });
    lesson.cards.forEach(function (c) { out.push({ id: prefix + "c:" + hash(c.front), front: c.front, back: c.back }); });
    return out;
  }
  Kit.cardsFor = cardsFor;

  function progressKey(course) { return "kit." + course.id; }
  function readProgress(course) {
    try {
      const p = JSON.parse(localStorage.getItem(progressKey(course)) || "null");
      return p && p.done ? p : { done: {} };
    } catch (err) { return { done: {} }; }
  }
  function writeProgress(course, p) {
    try { localStorage.setItem(progressKey(course), JSON.stringify(p)); } catch (err) { /* storage unavailable */ }
  }

  /* ════════════════════════════════════════════════════════════════════
     4. Screens
     ════════════════════════════════════════════════════════════════════ */
  let course = null, root = null, progress = null, session = null;

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
  const ICON = {
    back: '<svg aria-hidden="true" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg>',
    tick: '<svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>',
    sound: '<svg aria-hidden="true" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.2v3.6h2.3L8 12.5v-9L4.800 6.200z"/><path d="M10.500 5.800a3 3 0 0 1 0 4.400M12.300 4a5.500 5.500 0 0 1 0 8"/></svg>'
  };

  function show(nodes, focusTop) {
    root.textContent = "";
    [].concat(nodes).forEach(function (n) { if (n) root.appendChild(n); });
    if (focusTop !== false) window.scrollTo(0, 0);
  }
  function go(path) { location.hash = "#/" + path; }

  function lessonNumber(lesson) { return course.lessons.indexOf(lesson) + 1; }
  function nextLesson(after) {
    const start = after ? course.lessons.indexOf(after) + 1 : 0;
    for (let i = start; i < course.lessons.length; i++) if (!progress.done[course.lessons[i].id]) return course.lessons[i];
    for (let i = 0; i < start; i++) if (!progress.done[course.lessons[i].id]) return course.lessons[i];
    return null;
  }

  /* ── Speech: read a word aloud if the device has a voice for the language ── */
  function speak(text) {
    const synth = window.speechSynthesis;
    if (!synth || !course.speak) return;
    const lang = course.speak.toLowerCase().split("-")[0];
    const voice = synth.getVoices().filter(function (v) { return v.lang.toLowerCase().indexOf(lang) === 0; })[0];
    if (!voice) { toast("This device has no voice installed for this language."); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice; u.lang = voice.lang; u.rate = 0.8;
    synth.cancel();
    synth.speak(u);
  }
  let toastTimer = 0;
  function toast(message) {
    let el = document.getElementById("kit-toast");
    if (!el) { el = h("div", { id: "kit-toast", role: "status" }); document.body.appendChild(el); }
    el.textContent = message;
    el.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("on"); }, 3200);
  }

  /* ── Course home ── */
  function viewHome() {
    session = null;
    const total = course.lessons.length;
    const done = course.lessons.filter(function (l) { return progress.done[l.id]; }).length;
    const next = nextLesson(null);
    const ready = window.Review ? Review.ready(course.id) : 0;

    const head = h("header", { class: "kit-hero" }, [
      h("a", { class: "kit-back", href: course.back || "/projects.html", html: ICON.back + "<span>Projects</span>" }),
      h("h1", { html: inline(course.title || "Untitled course") }),
      course.description ? h("p", { class: "kit-lede", html: inline(course.description) }) : null,
      h("div", { class: "kit-meter", role: "img", "aria-label": done + " of " + total + " lessons finished" }, [
        h("div", { class: "kit-meter-bar" }, h("span", { style: "width:" + (total ? done / total * 100 : 0) + "%" })),
        h("span", { class: "kit-meter-text", text: done + " of " + total + " lessons" })
      ]),
      h("div", { class: "kit-actions" }, [
        next ? h("a", { class: "kit-btn primary", href: "#/l/" + next.id, text: done ? "Continue: " + next.title : "Start the first lesson" })
             : h("span", { class: "kit-finished", html: ICON.tick + " Course finished" }),
        window.Review ? h("a", { class: "kit-btn", href: "/projects/review/?source=" + encodeURIComponent(course.id),
          text: ready ? ready + (ready === 1 ? " card" : " cards") + " to review" : "Review cards" }) : null
      ])
    ]);

    const problems = course.problems.length + course.lessons.reduce(function (n, l) { return n + l.problems.length; }, 0);
    const warn = problems ? h("p", { class: "kit-warning" }, [
      problems + (problems === 1 ? " problem" : " problems") + " found in this course's files. ",
      h("a", { href: "/kit/check.html?course=" + encodeURIComponent(course.base.pathname), text: "Open the checker" })
    ]) : null;

    const units = course.units.map(function (unit, u) {
      return h("section", { class: "kit-unit" }, [
        h("div", { class: "kit-unit-head" }, [
          h("span", { class: "kit-unit-n", text: "Unit " + (u + 1) }),
          h("h2", { html: inline(unit.title || "") }),
          unit.summary ? h("p", { html: inline(unit.summary) }) : null
        ]),
        h("ol", { class: "kit-lessons" }, unit.items.map(function (l) {
          const state = progress.done[l.id];
          const bits = [];
          if (l.words.length) bits.push(l.words.length + " words");
          const q = l.exercises.length + drills(course, l).length;
          if (q) bits.push(q + " questions");
          return h("li", {}, h("a", { href: "#/l/" + l.id, class: state ? "done" : "" }, [
            h("span", { class: "kit-dot", html: state ? ICON.tick : String(lessonNumber(l)) }),
            h("span", { class: "kit-lesson-title", html: inline(l.title) }),
            h("span", { class: "kit-lesson-meta", text: state && state.best != null ? Math.round(state.best * 100) + "%" : bits.join(" · ") })
          ]));
        }))
      ]);
    });
    show([head, warn].concat(units));
    document.title = course.title;
  }

  /* ── Reading a lesson ── */
  function wordsTable(lesson) {
    if (!lesson.words.length) return null;
    const canSpeak = course.speak && window.speechSynthesis;
    return h("section", { class: "kit-words" }, [
      h("h2", { text: course.wordsHeading || "Words in this lesson" }),
      h("ul", {}, lesson.words.map(function (w) {
        return h("li", {}, [
          h("span", { class: "kit-term", html: inline(w.term) }),
          h("span", { class: "kit-gloss" }, [
            h("span", { class: "kit-meaning", html: inline(w.meaning) }),
            w.say ? h("span", { class: "kit-say", text: w.say }) : null,
            w.note ? h("span", { class: "kit-note", html: inline(w.note) }) : null
          ]),
          canSpeak ? h("button", { type: "button", class: "kit-speak", "aria-label": "Hear " + w.term, html: ICON.sound,
            onclick: function () { speak(w.term); } }) : null
        ]);
      }))
    ]);
  }

  function viewLesson(lesson) {
    session = null;
    const all = lesson.exercises.length + drills(course, lesson).length;
    const unit = course.units[lesson.unit];
    const issues = lesson.problems.length ? h("div", { class: "kit-warning" }, [
      h("strong", { text: "This lesson file has problems:" }),
      h("ul", {}, lesson.problems.map(function (p) { return h("li", { text: (p.line ? "Line " + p.line + ": " : "") + p.message }); }))
    ]) : null;

    const finish = function () { complete(lesson, null); };
    const bar = h("div", { class: "kit-bar" }, all
      ? h("a", { class: "kit-btn primary", href: "#/l/" + lesson.id + "/practice", text: "Practise · " + all + (all === 1 ? " question" : " questions") })
      : h("button", { type: "button", class: "kit-btn primary", text: "Mark as read", onclick: finish }));

    show([
      h("nav", { class: "kit-crumb" }, h("a", { href: "#/", html: ICON.back + "<span>" + esc(course.title) + "</span>" })),
      h("article", { class: "kit-lesson" }, [
        h("p", { class: "kit-eyebrow", text: "Unit " + (lesson.unit + 1) + (unit && unit.title ? " · " + unit.title : "") + " · Lesson " + lessonNumber(lesson) }),
        h("h1", { html: inline(lesson.title) }),
        issues,
        h("div", { class: "kit-prose", html: lesson.html }),
        wordsTable(lesson)
      ]),
      bar
    ]);
    document.title = lesson.title + " · " + course.title;
  }

  /* ── Practice ── */
  function startPractice(lesson) {
    const items = lesson.exercises.concat(shuffle(drills(course, lesson)));
    if (!items.length) { go("l/" + lesson.id); return; }
    session = { lesson: lesson, queue: items.slice(), total: items.length, cleared: 0, firstTry: 0, missed: new Set() };
    ask();
  }

  // Loose comparison for typed answers: case, punctuation, extra spaces and
  // Arabic vowel marks don't count.
  function normal(text) {
    return String(text).toLowerCase().normalize("NFKD")
      .replace(/[\u064B-\u065F\u0670\u0640\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  }
  Kit.normal = normal;

  function ask() {
    const s = session, ex = s.queue[0];
    const body = h("div", { class: "kit-q-body" });
    const check = h("button", { type: "button", class: "kit-btn primary", text: "Check", disabled: "" });
    const foot = h("div", { class: "kit-bar" }, check);
    let answered = false;

    const settle = function (correct, shownAnswer) {
      if (answered) return;
      answered = true;
      s.queue.shift();
      if (correct) {
        s.cleared++;
        if (!s.missed.has(ex)) s.firstTry++;
      } else {
        s.missed.add(ex);
        s.queue.push(ex);                 // comes round again at the end
      }
      body.classList.add("locked");
      const panel = h("div", { class: "kit-feedback " + (correct ? "right" : "wrong"), role: "status" }, [
        h("strong", { text: correct ? pickFrom(["Correct.", "That's right.", "Yes."]) : "Not quite." }),
        !correct && shownAnswer ? h("p", { class: "kit-answer", html: "Answer: " + shownAnswer }) : null,
        ex.why ? h("p", { html: inline(ex.why) }) : null
      ]);
      const last = !s.queue.length;
      const cont = h("button", { type: "button", class: "kit-btn primary", text: last ? "Finish" : "Continue",
        onclick: function () { if (last) complete(s.lesson, s); else ask(); } });
      foot.textContent = "";
      foot.hidden = false;
      foot.appendChild(panel);
      foot.appendChild(cont);
      foot.classList.add(correct ? "right" : "wrong");
      cont.focus({ preventScroll: true });
    };

    const widget = WIDGETS[ex.type](ex, {
      body: body,
      ready: function (on) { if (on) check.removeAttribute("disabled"); else check.setAttribute("disabled", ""); },
      settle: settle
    });
    check.addEventListener("click", function () { if (widget && widget.check) widget.check(); });
    if (widget && widget.instant) foot.hidden = true;     // nothing to press until an answer is given

    show([
      h("div", { class: "kit-practice-top" }, [
        h("a", { class: "kit-close", href: "#/l/" + s.lesson.id, "aria-label": "Leave practice", html: ICON.back }),
        h("div", { class: "kit-meter-bar", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": s.total, "aria-valuenow": s.cleared },
          h("span", { style: "width:" + (s.cleared / s.total * 100) + "%" })),
        h("span", { class: "kit-count", text: s.cleared + " / " + s.total })
      ]),
      h("section", { class: "kit-question" }, [
        s.missed.has(ex) ? h("p", { class: "kit-again", text: "Once more" }) : null,
        h("h1", { html: inline(ex.prompt) }),
        ex.context.length ? h("blockquote", { class: "kit-context" }, ex.context.map(function (c) { return h("p", { html: inline(c) }); })) : null,
        body
      ]),
      foot
    ]);
    document.title = "Practice · " + s.lesson.title;
  }
  function pickFrom(list) { return list[Math.floor(Math.random() * list.length)]; }

  const rtl = function (text) { return HAS_ARABIC.test(text); };

  const WIDGETS = {
    // Tap an answer. With one right answer the tap is the answer; with several, tick them and check.
    choice: function (ex, ui) {
      const options = ex.fixed ? ex.options.slice() : shuffle(ex.options);
      const picked = new Set();
      const buttons = options.map(function (o, i) {
        return h("button", { type: "button", class: "kit-option", "aria-pressed": "false", html:
          '<span class="kit-key">' + (i + 1) + "</span><span>" + inline(o.text) + "</span>",
          onclick: function () { choose(i); } });
      });
      const mark = function () {
        options.forEach(function (o, i) {
          if (o.right) buttons[i].classList.add("right");
          else if (picked.has(i)) buttons[i].classList.add("wrong");
        });
      };
      const answerText = function () {
        return options.filter(function (o) { return o.right; }).map(function (o) { return inline(o.text); }).join(", ");
      };
      function choose(i) {
        if (ui.body.classList.contains("locked")) return;
        if (!ex.multi) {
          picked.add(i); mark();
          ui.settle(options[i].right, answerText());
          return;
        }
        if (picked.has(i)) picked.delete(i); else picked.add(i);
        buttons[i].setAttribute("aria-pressed", picked.has(i));
        ui.ready(picked.size > 0);
      }
      ui.body.appendChild(h("div", { class: "kit-options" }, buttons));
      if (ex.multi) ui.body.insertBefore(h("p", { class: "kit-tip", text: "Choose every answer that fits." }), ui.body.firstChild);
      ui.body.kitKey = function (n) { if (buttons[n]) choose(n); };
      return {
        instant: !ex.multi,
        check: function () {
          mark();
          const ok = options.every(function (o, i) { return o.right === picked.has(i); });
          ui.settle(ok, answerText());
        }
      };
    },

    type: function (ex, ui) {
      const input = h("input", { type: "text", class: "kit-input", autocomplete: "off", autocapitalize: "off",
        spellcheck: "false", "aria-label": "Your answer", enterkeyhint: "done" });
      input.addEventListener("input", function () { ui.ready(input.value.trim().length > 0); });
      ui.body.appendChild(input);
      setTimeout(function () { input.focus({ preventScroll: true }); }, 50);
      return {
        check: function () {
          const got = normal(input.value);
          const ok = ex.accept.some(function (a) { return normal(a) === got; });
          input.setAttribute("readonly", "");
          input.classList.add(ok ? "right" : "wrong");
          ui.settle(ok, inline(ex.accept[0]));
        }
      };
    },

    // Tap tiles into the right order. Tap a placed tile to take it back.
    order: function (ex, ui) {
      const dir = rtl(ex.tiles.join(" ")) ? "rtl" : "ltr";
      const tiles = shuffle(ex.tiles.concat(ex.extra).map(function (t, i) { return { text: t, id: i }; }));
      const placed = [];
      const answer = h("div", { class: "kit-slots", dir: dir, "aria-label": "Your answer" });
      const bank = h("div", { class: "kit-bank", dir: dir });
      const draw = function () {
        answer.textContent = ""; bank.textContent = "";
        placed.forEach(function (t) {
          answer.appendChild(h("button", { type: "button", class: "kit-tile", html: inline(t.text),
            onclick: function () { placed.splice(placed.indexOf(t), 1); draw(); } }));
        });
        tiles.forEach(function (t) {
          const used = placed.indexOf(t) >= 0;
          bank.appendChild(h("button", { type: "button", class: "kit-tile" + (used ? " used" : ""), html: inline(t.text),
            disabled: used ? "" : null, onclick: function () { placed.push(t); draw(); } }));
        });
        ui.ready(placed.length === ex.tiles.length);
      };
      ui.body.appendChild(answer);
      ui.body.appendChild(bank);
      draw();
      return {
        check: function () {
          const ok = placed.length === ex.tiles.length && placed.every(function (t, i) { return t.text === ex.tiles[i]; });
          answer.classList.add(ok ? "right" : "wrong");
          ui.settle(ok, '<span dir="' + dir + '">' + ex.tiles.map(inline).join(" ") + "</span>");
        }
      };
    },

    // Tap one on the left, then its partner on the right.
    match: function (ex, ui) {
      const left = shuffle(ex.pairs.map(function (p, i) { return { text: p[0], pair: i }; }));
      const right = shuffle(ex.pairs.map(function (p, i) { return { text: p[1], pair: i }; }));
      let chosen = null, solved = 0, slips = 0;
      const make = function (item, side) {
        const b = h("button", { type: "button", class: "kit-option kit-pair", html: "<span>" + inline(item.text) + "</span>" });
        b.addEventListener("click", function () {
          if (b.classList.contains("right")) return;
          if (side === "l") {
            if (chosen) chosen.b.setAttribute("aria-pressed", "false");
            chosen = { item: item, b: b };
            b.setAttribute("aria-pressed", "true");
            return;
          }
          if (!chosen) return;
          if (chosen.item.pair === item.pair) {
            chosen.b.classList.add("right"); b.classList.add("right");
            chosen.b.setAttribute("aria-pressed", "false");
            chosen = null;
            if (++solved === ex.pairs.length) ui.settle(slips === 0, "");
          } else {
            slips++;
            const a = chosen.b;
            [a, b].forEach(function (el) { el.classList.add("shake"); });
            setTimeout(function () { [a, b].forEach(function (el) { el.classList.remove("shake"); }); }, 400);
          }
        });
        return b;
      };
      ui.body.appendChild(h("div", { class: "kit-match" }, [
        h("div", {}, left.map(function (i) { return make(i, "l"); })),
        h("div", {}, right.map(function (i) { return make(i, "r"); }))
      ]));
      // Matching always ends with every pair found; a slip along the way sends it round again.
      return { instant: true };
    },

    // Tap an item, then the group it belongs to.
    sort: function (ex, ui) {
      const items = shuffle([].concat.apply([], ex.groups.map(function (g, gi) {
        return g.items.map(function (text) { return { text: text, group: gi, at: -1 }; });
      })));
      let held = null;
      const bank = h("div", { class: "kit-bank" });
      const bins = ex.groups.map(function (g, gi) {
        const box = h("div", { class: "kit-bin-items" });
        const bin = h("div", { class: "kit-bin", role: "button", tabindex: "0" }, [h("h3", { html: inline(g.name) }), box]);
        const drop = function () {
          if (!held || ui.body.classList.contains("locked")) return;
          held.at = gi; held = null; draw();
        };
        bin.addEventListener("click", drop);
        bin.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); drop(); } });
        return { bin: bin, box: box };
      });
      const chip = function (item) {
        return h("button", { type: "button", class: "kit-tile" + (held === item ? " held" : ""), html: inline(item.text),
          onclick: function (e) {
            e.stopPropagation();
            if (ui.body.classList.contains("locked")) return;
            if (item.at >= 0) { item.at = -1; held = null; }
            else held = held === item ? null : item;
            draw();
          } });
      };
      function draw() {
        bank.textContent = "";
        bins.forEach(function (b) { b.box.textContent = ""; b.bin.classList.toggle("ready", !!held); });
        items.forEach(function (item) {
          const el = chip(item);
          item.el = el;
          (item.at < 0 ? bank : bins[item.at].box).appendChild(el);
        });
        ui.ready(items.every(function (i) { return i.at >= 0; }));
      }
      ui.body.appendChild(h("p", { class: "kit-tip", text: "Tap an item, then tap the group it belongs to." }));
      ui.body.appendChild(bank);
      ui.body.appendChild(h("div", { class: "kit-bins" }, bins.map(function (b) { return b.bin; })));
      draw();
      return {
        check: function () {
          let ok = true;
          items.forEach(function (i) {
            const good = i.at === i.group;
            if (!good) ok = false;
            i.el.classList.add(good ? "right" : "wrong");
          });
          ui.settle(ok, ex.groups.map(function (g) {
            return "<strong>" + inline(g.name) + ":</strong> " + g.items.map(inline).join(", ");
          }).join(" &nbsp; "));
        }
      };
    }
  };

  /* ── Finishing a lesson ── */
  function complete(lesson, s) {
    const score = s ? s.firstTry / s.total : null;
    const before = progress.done[lesson.id];
    progress.done[lesson.id] = {
      best: score == null ? (before ? before.best : null) : Math.max(score, before && before.best != null ? before.best : 0),
      n: (before ? before.n : 0) + 1,
      at: Date.now()
    };
    writeProgress(course, progress);

    let added = 0;
    const cards = cardsFor(course, lesson);
    if (window.Review && cards.length) {
      added = Review.add(cards, { id: course.id, title: course.title, url: course.base.pathname.replace(/[^/]*$/, "") });
    }
    session = null;

    const next = nextLesson(lesson);
    const firstTry = s ? s.firstTry + " of " + s.total + " right first time" : "";
    show([
      h("section", { class: "kit-done" }, [
        h("div", { class: "kit-done-mark", html: ICON.tick }),
        h("h1", { text: s ? (score === 1 ? "Perfect." : score >= 0.8 ? "Lesson finished." : "Finished. Worth another pass.") : "Marked as read." }),
        firstTry ? h("p", { class: "kit-lede", text: firstTry }) : null,
        added ? h("p", { class: "kit-lede" }, [
          added + (added === 1 ? " card" : " cards") + " added to your review queue. ",
          h("a", { href: "/projects/review/?source=" + encodeURIComponent(course.id), text: "Review now" })
        ]) : null,
        h("div", { class: "kit-actions" }, [
          next ? h("a", { class: "kit-btn primary", href: "#/l/" + next.id, text: "Next: " + next.title }) : null,
          h("a", { class: "kit-btn" + (next ? "" : " primary"), href: "#/", text: "Back to the course" }),
          s ? h("a", { class: "kit-btn", href: "#/l/" + lesson.id + "/practice", text: "Practise again",
            onclick: function (e) { e.preventDefault(); startPractice(lesson); } }) : null
        ])
      ])
    ]);
    history.replaceState(null, "", "#/l/" + lesson.id + "/done");
  }

  /* ── Routing and keyboard ── */
  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/");
    if (parts[0] === "l" && parts[1]) {
      const lesson = course.lessons.filter(function (l) { return l.id === decodeURIComponent(parts[1]); })[0];
      if (lesson) {
        if (parts[2] === "practice") startPractice(lesson);
        else viewLesson(lesson);
        return;
      }
    }
    viewHome();
  }

  document.addEventListener("keydown", function (e) {
    if (!session || e.ctrlKey || e.metaKey || e.altKey) return;
    const body = root.querySelector(".kit-q-body");
    if (!body) return;
    if (e.target.tagName === "INPUT") {
      if (e.key === "Enter") { const b = root.querySelector(".kit-bar .kit-btn.primary:not([disabled])"); if (b) { e.preventDefault(); b.click(); } }
      return;
    }
    if (/^[1-9]$/.test(e.key) && body.kitKey && !body.classList.contains("locked")) body.kitKey(+e.key - 1);
    if (e.key === "Enter" && e.target.tagName !== "BUTTON" && e.target.tagName !== "A") {
      const b = root.querySelector(".kit-bar .kit-btn.primary:not([disabled]):not([hidden])");
      if (b) { e.preventDefault(); b.click(); }
    }
  });

  // Entry point: Kit.start("course.json") from a course's index.html.
  Kit.start = function (courseUrl, mount) {
    root = mount || document.getElementById("app");
    if (!root) { root = h("main", { id: "app" }); document.body.appendChild(root); }
    root.classList.add("kit");
    show(h("p", { class: "kit-loading", text: "Loading…" }));
    Kit.load(courseUrl).then(function (c) {
      course = c;
      progress = readProgress(course);
      if (course.accent) document.documentElement.style.setProperty("--accent-light", course.accent);
      if (course.accentDark) document.documentElement.style.setProperty("--accent-dark", course.accentDark);
      window.addEventListener("hashchange", route);
      route();
    }).catch(function (err) {
      show(h("div", { class: "kit-warning" }, [
        h("strong", { text: "This course couldn't be loaded." }),
        h("p", { text: err.message }),
        h("p", { text: "Courses have to be opened through a web server (for example: python3 -m http.server), not as a file." })
      ]));
    });
  };

  Kit.inline = inline;
  Kit.blocks = blocks;
})();
