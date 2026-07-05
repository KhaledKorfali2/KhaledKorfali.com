/* ============================== core/actions.js ==============================
   A tiny delegated-event dispatcher. Both the curriculum engine and any
   domain module (fs-sim, git-sim, bash-quiz, ...) register handlers here
   instead of each writing its own giant if/else chain on document clicks.

   register(eventType, selector, handler)
     - eventType: "click" | "change" | "input" | "keydown"
     - selector : a CSS selector string, OR a function (target, event) => matchedElement|null
     - handler  : (matchedElement, event) => void

   Handlers are tried in registration order; the first match wins and no
   further handlers run for that event (mirrors "if (x) { ...; return; }").
============================================================================== */
window.Actions = (function () {
  const registries = { click: [], change: [], input: [], keydown: [] };

  function register(eventType, selector, handler) {
    registries[eventType].push({ selector, handler });
  }

  function match(selector, target, e) {
    if (typeof selector === "function") return selector(target, e);
    return target.closest ? target.closest(selector) : null;
  }

  function dispatch(eventType, e) {
    for (const { selector, handler } of registries[eventType]) {
      const el = match(selector, e.target, e);
      if (el) { handler(el, e); return; }
    }
  }

  document.addEventListener("click", (e) => dispatch("click", e));
  document.addEventListener("change", (e) => dispatch("change", e));
  document.addEventListener("input", (e) => dispatch("input", e));
  document.addEventListener("keydown", (e) => dispatch("keydown", e));

  return { register };
})();