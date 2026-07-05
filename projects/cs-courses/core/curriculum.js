/* ============================== core/curriculum.js ==============================
   The reusable "lesson platform" engine. Owns:
     - progress/unlock logic over a generic course shape:
         course = [ { id, title, checkpoint: {questions:[...]} | null, lessons: [
           { id, title, view, subsections: [ { id, title, kind, widget, body, tryIt } ] }
         ] } ]
     - the whole app's state object (curriculum fields + whatever domain
       fields the host project mixes in via createDomainState())
     - persistence (save/load/reset) via core/persistence.js
     - scroll-safe re-rendering via core/scroll.js
     - generic Home / Lessons(sidebar+content) / Sandbox(tab bar) markup

   A host project (fs-sim, git-sim, bash-quiz, ...) supplies:
     - course              : the module/lesson/subsection data (content differs per project)
     - renderWidget(key)   : how to render a named widget/tool (fully domain-specific)
     - sandboxNav          : [{key,label,icon}] tabs for free-roam Sandbox mode
     - createDomainState() : extra state fields the host needs (e.g. a filesystem,
                             a git repo graph, a quiz question bank...)
     - homeStats(state)    : optional extra stat pills for the Home dashboard
     - beforeSave(state)   : optional hook to sync any state kept outside `state`
                             (e.g. a module-level id counter) right before saving
     - scrollPreserveSelectors, brandName/brandTagline/brandIcon, footerNote,
       storageKey, defaultSandboxView, resetExtraWarning, mountId

   None of this file knows what a "file", "commit", or "grep" is — that's the
   whole point. Copy this folder into a new project and only write the
   host-specific pieces above.
=================================================================================== */
window.Curriculum = (function () {
  const icon = window.Icons.icon;
  const esc = window.Utils.esc;

  function createEngine(config) {
    const course = config.course;

    function curriculumDefaults() {
      return {
        mode: "home",
        sandboxView: config.defaultSandboxView || (config.sandboxNav && config.sandboxNav[0] ? config.sandboxNav[0].key : null),
        currentModuleId: course[0].id,
        currentLessonId: course[0].lessons[0].id,
        sidebarOpen: {},
        completed: {},
        quizAnswers: {},
        quizChecked: {},
        checkpointPassed: {},
        _stickToBottomSelectors: null,
        _focusSelector: null,
        _skipWindowScrollRestore: false
      };
    }

    function createInitialState() {
      return { ...curriculumDefaults(), ...(config.createDomainState ? config.createDomainState() : {}) };
    }

    const engine = { course, config, state: createInitialState() };

    /* ---------------------------- progress / unlock ---------------------------- */
    function findModule(id) { return course.find((m) => m.id === id); }
    function isLessonComplete(mod, lesson) {
      return lesson.subsections.every((s) => engine.state.completed[`${mod.id}:${lesson.id}:${s.id}`]);
    }
    function isLessonUnlocked(mod, lessonIdx) {
      return lessonIdx === 0 ? true : isLessonComplete(mod, mod.lessons[lessonIdx - 1]);
    }
    function isModuleComplete(mod) {
      const lessonsDone = mod.lessons.every((l) => isLessonComplete(mod, l));
      if (!lessonsDone) return false;
      if (!mod.checkpoint) return true;
      return !!engine.state.checkpointPassed[mod.id];
    }
    function isModuleUnlockedIdx(mi) {
      return mi === 0 ? true : isModuleComplete(course[mi - 1]);
    }
    function totalUnits() {
      let t = 0;
      course.forEach((m) => { m.lessons.forEach((l) => { t += l.subsections.length; }); if (m.checkpoint) t += 1; });
      return t;
    }
    function completedUnitsCount() {
      let c = Object.values(engine.state.completed).filter(Boolean).length;
      c += Object.values(engine.state.checkpointPassed).filter(Boolean).length;
      return c;
    }
    function flatLessons() {
      const arr = [];
      course.forEach((m) => m.lessons.forEach((l) => arr.push({ modId: m.id, lessonId: l.id })));
      return arr;
    }
    function prevLessonTarget(modId, lessonId) {
      const flat = flatLessons();
      const idx = flat.findIndex((x) => x.modId === modId && x.lessonId === lessonId);
      return idx > 0 ? flat[idx - 1] : null;
    }
    function nextLessonTarget(modId, lessonId) {
      const flat = flatLessons();
      const idx = flat.findIndex((x) => x.modId === modId && x.lessonId === lessonId);
      return idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;
    }
    function canGoNext(mod, lesson) {
      if (!isLessonComplete(mod, lesson)) return false;
      const isLast = mod.lessons[mod.lessons.length - 1].id === lesson.id;
      if (isLast && mod.checkpoint && !engine.state.checkpointPassed[mod.id]) return false;
      return true;
    }
    function continueLearningTarget() {
      for (let mi = 0; mi < course.length; mi++) {
        const mod = course[mi];
        if (!isModuleUnlockedIdx(mi)) continue;
        if (isModuleComplete(mod)) continue;
        for (const l of mod.lessons) { if (!isLessonComplete(mod, l)) return { modId: mod.id, lessonId: l.id }; }
        return { modId: mod.id, lessonId: mod.lessons[mod.lessons.length - 1].id };
      }
      return null;
    }
    function sidebarOpenFor(modId) {
      return engine.state.sidebarOpen[modId] !== undefined ? engine.state.sidebarOpen[modId] : (modId === engine.state.currentModuleId);
    }

    Object.assign(engine, {
      findModule, isLessonComplete, isLessonUnlocked, isModuleComplete, isModuleUnlockedIdx,
      totalUnits, completedUnitsCount, flatLessons, prevLessonTarget, nextLessonTarget,
      canGoNext, continueLearningTarget, sidebarOpenFor
    });

    /* --------------------------------- persistence -------------------------------- */
    const storageKey = config.storageKey || "curriculum-progress-v1";

    function saveProgress() { window.Persistence.save(storageKey, engine.state); }
    function loadProgress() {
      const saved = window.Persistence.load(storageKey);
      if (!saved) return false;
      engine.state = { ...createInitialState(), ...saved };
      return true;
    }
    function resetProgress() {
      window.Persistence.remove(storageKey);
      engine.state = createInitialState();
      render();
    }
    Object.assign(engine, { saveProgress, loadProgress, resetProgress });

    /* ----------------------------------- render ----------------------------------- */
    function renderProgressRing(pct) {
      const r = 27, circ = 2 * Math.PI * r, offset = circ * (1 - pct / 100);
      return `<div class="progress-ring"><svg width="64" height="64"><circle class="track" cx="32" cy="32" r="${r}"/><circle class="fill" cx="32" cy="32" r="${r}" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/></svg><div class="label mono">${pct}%</div></div>`;
    }

    function renderHomeView() {
      const total = totalUnits();
      const done = completedUnitsCount();
      const pct = total ? Math.round((done / total) * 100) : 0;
      const target = continueLearningTarget();
      const extraStats = config.homeStats ? config.homeStats(engine.state) : [];
      const defaultSandbox = config.defaultSandboxView || (config.sandboxNav && config.sandboxNav[0] && config.sandboxNav[0].key) || "";
      return `
        <div class="panel hero">
          <div class="hero-top">
            <div style="display:flex;align-items:center;gap:20px">
              ${renderProgressRing(pct)}
              <div>
                <div class="eyebrow">Your progress</div>
                <div class="lesson-title">${pct}% through the curriculum</div>
                <div class="lesson-pills">
                  <span class="pill accent">${done}/${total} steps done</span>
                  ${extraStats.map((s) => `<span class="pill teal">${esc(s.value)} ${esc(s.label)}</span>`).join("")}
                </div>
              </div>
            </div>
          </div>
          <div class="hero-actions">
            <button class="btn accent" data-continuelearn>${target ? "Continue Learning" : "Review Curriculum"}</button>
            <button class="btn" data-sandboxview="${esc(defaultSandbox)}">Open Sandbox</button>
          </div>
        </div>
        <div class="card-grid">
          ${course.map((mod, mi) => {
            const unlocked = isModuleUnlockedIdx(mi);
            const complete = isModuleComplete(mod);
            return `<div class="panel card" style="${unlocked ? "" : "opacity:.5;cursor:not-allowed"}" ${unlocked ? `data-gotomodule="${mod.id}"` : ""}>
              ${icon(complete ? "check" : unlocked ? "compass" : "lock", 16)}
              <div class="card-title">${mi}. ${esc(mod.title)}</div>
              <div class="card-desc">${complete ? "Completed" : unlocked ? `${mod.lessons.length} lessons` : "Locked — finish the previous module"}</div>
            </div>`;
          }).join("")}
        </div>
      `;
    }

    function renderSidebar() {
      return `<div class="panel lesson-sidebar"><div class="panel-header"><span class="title mono">${icon("compass", 14)} curriculum</span></div>
      <div class="panel-body">
      ${course.map((mod, mi) => {
        const unlocked = isModuleUnlockedIdx(mi);
        const complete = isModuleComplete(mod);
        const open = sidebarOpenFor(mod.id);
        return `<div class="module-block">
          <div class="module-head ${unlocked ? "" : "locked"}" ${unlocked ? `data-togglemodule="${mod.id}"` : ""}>
            <span class="num mono">${mi}</span>
            <span class="m-title">${esc(mod.title)}</span>
            <span class="m-status">${complete ? icon("check", 13) : unlocked ? icon(open ? "chevronDown" : "chevronRight", 12) : icon("lock", 12)}</span>
          </div>
          <div class="module-lessons ${open && unlocked ? "open" : ""}">
            ${mod.lessons.map((l, li) => {
              const lUnlocked = unlocked && isLessonUnlocked(mod, li);
              const lDone = isLessonComplete(mod, l);
              const active = mod.id === engine.state.currentModuleId && l.id === engine.state.currentLessonId;
              return `<div class="lesson-item ${active ? "active" : ""} ${lUnlocked ? "" : "locked"}" ${lUnlocked ? `data-lessonjump="${mod.id}:${l.id}"` : ""}>
                <span class="check ${lDone ? "done" : ""}">${lDone ? icon("check", 9) : ""}</span>
                <span>${esc(l.title)}</span>
              </div>`;
            }).join("")}
            ${mod.checkpoint ? `<div class="checkpoint-item">${icon("trophy", 11)} Checkpoint${engine.state.checkpointPassed[mod.id] ? " — passed" : ""}</div>` : ""}
          </div>
        </div>`;
      }).join("")}
      </div></div>`;
    }

    function renderSubsectionCard(mod, lesson, sub) {
      const key = `${mod.id}:${lesson.id}:${sub.id}`;
      const done = !!engine.state.completed[key];
      return `<div class="subsection-card">
        <div class="subsection-head"><span class="s-title">${esc(sub.title)} <span class="kind-badge ${sub.kind}">${sub.kind}</span></span></div>
        <div class="subsection-body">${sub.body}</div>
        ${sub.tryIt ? `<div class="try-it">Try it: ${sub.tryIt}</div>` : ""}
        ${sub.widget ? `<div class="widget-embed">${config.renderWidget ? config.renderWidget(sub.widget, engine.state, "lesson") : ""}</div>` : ""}
        <div class="mark-complete-row">
          ${done ? `<span class="done-label">${icon("check", 12)} Completed</span><button class="btn" data-marksub="${key}">Unmark</button>` : `<button class="btn accent" data-marksub="${key}">Mark as complete</button>`}
        </div>
      </div>`;
    }

    function renderCheckpoint(mod) {
      if (!mod.checkpoint) return "";
      const lessonsDone = mod.lessons.every((l) => isLessonComplete(mod, l));
      if (!lessonsDone) {
        return `<div class="checkpoint-box"><div class="cp-title">${icon("lock", 14)} Checkpoint locked</div><p class="perm-note" style="margin-top:0">Finish every lesson in this module to unlock the checkpoint quiz.</p></div>`;
      }
      const cp = mod.checkpoint;
      const passed = !!engine.state.checkpointPassed[mod.id];
      const checked = !!engine.state.quizChecked[mod.id];
      return `<div class="checkpoint-box">
        <div class="cp-title">${icon("trophy", 14)} Module checkpoint ${passed ? `<span class="pill teal">passed</span>` : ""}</div>
        ${cp.questions.map((q, qi) => {
          const selKey = `${mod.id}:${qi}`;
          const sel = engine.state.quizAnswers[selKey];
          return `<div class="quiz-q">
            <div class="q-text mono">${qi + 1}. ${esc(q.text)}</div>
            ${q.options.map((opt, oi) => {
              let cls = "quiz-opt";
              if (sel === oi) cls += " selected";
              if (checked) { if (oi === q.correct) cls += " correct"; else if (sel === oi) cls += " incorrect"; }
              return `<div class="${cls}" data-quizopt="${selKey}:${oi}"><span class="radio"></span>${esc(opt)}</div>`;
            }).join("")}
          </div>`;
        }).join("")}
        <button class="btn accent" data-checkquiz="${mod.id}">Check answers</button>
        ${checked ? `<div class="cp-result-banner" style="background:${passed ? "var(--teal-soft)" : "var(--coral-soft)"};color:${passed ? "var(--teal)" : "var(--coral)"}">${icon(passed ? "check" : "x", 13)} ${passed ? "All correct — module complete!" : "Not all correct yet — review and try again."}</div>` : ""}
      </div>`;
    }

    function renderLessonNav(mod, lesson) {
      const prev = prevLessonTarget(mod.id, lesson.id);
      const next = nextLessonTarget(mod.id, lesson.id);
      const nextOk = canGoNext(mod, lesson) && next;
      return `<div class="lesson-nav-row">
        <button class="btn" ${prev ? `data-lessonjump="${prev.modId}:${prev.lessonId}"` : "disabled"}>${icon("chevronLeft", 12)} Back</button>
        <button class="btn accent" ${nextOk ? `data-lessonjump="${next.modId}:${next.lessonId}"` : "disabled"}>${next ? "Next" : "Course complete"} ${next ? icon("chevronRight", 12) : ""}</button>
      </div>`;
    }

    function renderLessonContent(mod, lesson) {
      const isLastLesson = mod.lessons[mod.lessons.length - 1].id === lesson.id;
      return `<div class="panel lesson-content"><div class="panel-body">
        <div class="breadcrumb"><span>${esc(mod.title)}</span><span class="sep">/</span><span class="current">${esc(lesson.title)}</span></div>
        <div class="lesson-title-row"><h2>${esc(lesson.title)}</h2><span class="pill lesson-view-tag mono">${esc(lesson.view || "")}</span></div>
        ${lesson.subsections.map((s) => renderSubsectionCard(mod, lesson, s)).join("")}
        ${isLastLesson ? renderCheckpoint(mod) : ""}
        ${renderLessonNav(mod, lesson)}
      </div></div>`;
    }

    function renderLessonsMode() {
      const mod = findModule(engine.state.currentModuleId);
      let lesson = mod.lessons.find((l) => l.id === engine.state.currentLessonId);
      if (!lesson) { lesson = mod.lessons[0]; engine.state.currentLessonId = lesson.id; }
      return `<div class="lesson-shell">${renderSidebar()}<div>${renderLessonContent(mod, lesson)}</div></div>`;
    }

    function renderSandboxMode() {
      const nav = config.sandboxNav || [];
      const view = engine.state.sandboxView || (nav[0] && nav[0].key);
      const body = config.renderWidget ? config.renderWidget(view, engine.state, "sandbox") : "";
      return `
        <div class="breadcrumb"><span>Sandbox</span><span class="sep">/</span><span class="current">${esc(view || "")}</span></div>
        <nav class="nav" style="margin-bottom:16px">${nav.map((n) => `<button class="nav-btn mono ${view === n.key ? "active" : ""}" data-sandboxview="${n.key}">${icon(n.icon, 12)} ${n.label}</button>`).join("")}</nav>
        ${body}
      `;
    }

    function render() {
      const app = document.getElementById(config.mountId || "app");
      const preserveSelectors = [".lesson-sidebar"].concat(config.scrollPreserveSelectors || []);
      const savedWindowScroll = window.scrollY;
      const snapshots = window.ScrollPreserve.snapshot(preserveSelectors);

      app.innerHTML = `
        <header class="header">
          <div class="brand mono">${icon(config.brandIcon || "hardDrive", 18)}<span>${esc(config.brandName || "app")}</span><span class="accent">::</span><span class="dim">${esc(config.brandTagline || "curriculum")}</span></div>
          <div class="mode-switch">
            <button class="${engine.state.mode === "home" ? "active" : ""}" data-setmode="home">${icon("home", 12)} home</button>
            <button class="${engine.state.mode === "lessons" ? "active" : ""}" data-setmode="lessons">${icon("compass", 12)} lessons</button>
            <button class="${engine.state.mode === "sandbox" ? "active" : ""}" data-setmode="sandbox">${icon("terminal", 12)} sandbox</button>
          </div>
        </header>
        <div id="view-container">${engine.state.mode === "home" ? renderHomeView() : engine.state.mode === "lessons" ? renderLessonsMode() : renderSandboxMode()}</div>
        <footer class="foot">${esc(config.footerNote || "progress saves automatically in this browser")} · <button class="reset-link" data-resetprogress>reset progress</button></footer>
      `;

      window.ScrollPreserve.restore(snapshots);
      if (engine.state._stickToBottomSelectors) {
        window.ScrollPreserve.scrollToBottom(engine.state._stickToBottomSelectors);
        engine.state._stickToBottomSelectors = null;
      }
      if (engine.state._focusSelector) {
        window.ScrollPreserve.focus(engine.state._focusSelector);
        engine.state._focusSelector = null;
      }
      if (engine.state._skipWindowScrollRestore) {
        engine.state._skipWindowScrollRestore = false;
      } else {
        window.scrollTo(0, savedWindowScroll);
      }

      if (config.beforeSave) config.beforeSave(engine.state);
      saveProgress();
    }
    engine.render = render;

    /* ------------------------------ core action wiring ------------------------------ */
    function registerCoreActions() {
      const Actions = window.Actions;

      Actions.register("click", "[data-resetprogress]", () => {
        const extra = config.resetExtraWarning ? ` and ${config.resetExtraWarning}` : "";
        if (window.confirm(`Reset all lesson progress${extra}? This can't be undone.`)) resetProgress();
      });
      Actions.register("click", "[data-setmode]", (el) => { engine.state.mode = el.getAttribute("data-setmode"); render(); });
      Actions.register("click", "[data-gotomodule]", (el) => {
        const modId = el.getAttribute("data-gotomodule");
        const mod = findModule(modId);
        const lesson = mod.lessons.find((l) => !isLessonComplete(mod, l)) || mod.lessons[mod.lessons.length - 1];
        engine.state.currentModuleId = modId; engine.state.currentLessonId = lesson.id; engine.state.sidebarOpen[modId] = true;
        engine.state.mode = "lessons"; render();
      });
      Actions.register("click", "[data-continuelearn]", () => {
        const target = continueLearningTarget();
        if (target) { engine.state.currentModuleId = target.modId; engine.state.currentLessonId = target.lessonId; engine.state.sidebarOpen[target.modId] = true; }
        engine.state.mode = "lessons"; render();
      });
      Actions.register("click", "[data-sandboxview]", (el) => { engine.state.sandboxView = el.getAttribute("data-sandboxview"); engine.state.mode = "sandbox"; render(); });
      Actions.register("click", "[data-togglemodule]", (el) => { const id = el.getAttribute("data-togglemodule"); engine.state.sidebarOpen[id] = !sidebarOpenFor(id); render(); });
      Actions.register("click", "[data-lessonjump]", (el) => {
        const [modId, lessonId] = el.getAttribute("data-lessonjump").split(":");
        engine.state.currentModuleId = modId; engine.state.currentLessonId = lessonId; engine.state.sidebarOpen[modId] = true;
        engine.state._skipWindowScrollRestore = true;
        render();
        const container = document.getElementById("view-container");
        if (container) container.scrollIntoView({ block: "start" });
      });
      Actions.register("click", "[data-marksub]", (el) => { const key = el.getAttribute("data-marksub"); engine.state.completed[key] = !engine.state.completed[key]; render(); });
      Actions.register("click", "[data-quizopt]", (el) => {
        const parts = el.getAttribute("data-quizopt").split(":");
        const modId = parts[0], qi = parseInt(parts[1], 10), oi = parseInt(parts[2], 10);
        engine.state.quizAnswers[`${modId}:${qi}`] = oi;
        engine.state.quizChecked[modId] = false;
        render();
      });
      Actions.register("click", "[data-checkquiz]", (el) => {
        const modId = el.getAttribute("data-checkquiz");
        const cp = findModule(modId).checkpoint;
        const allCorrect = cp.questions.every((q, qi) => engine.state.quizAnswers[`${modId}:${qi}`] === q.correct);
        engine.state.quizChecked[modId] = true;
        engine.state.checkpointPassed[modId] = allCorrect;
        render();
      });
    }
    engine.registerCoreActions = registerCoreActions;

    return engine;
  }

  return { createEngine };
})();