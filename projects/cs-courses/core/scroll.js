/* ============================== core/scroll.js ==============================
   Snapshot/restore scrollTop for a list of CSS selectors around a full
   innerHTML rebuild, so re-rendering never yanks the viewport back to the
   top. Domain-agnostic — works for a file tree, a commit graph, a terminal,
   anything with a scrollable container.
============================================================================== */
window.ScrollPreserve = (function () {
  function snapshot(selectors) {
    return selectors.map((sel) => {
      const el = document.querySelector(sel);
      return { sel, top: el ? el.scrollTop : 0 };
    });
  }

  function restore(snapshots) {
    snapshots.forEach(({ sel, top }) => {
      const el = document.querySelector(sel);
      if (el) el.scrollTop = top;
    });
  }

  function scrollToBottom(selectors) {
    (selectors || []).forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  function focus(selector) {
    if (!selector) return;
    const el = document.querySelector(selector);
    if (el) el.focus();
  }

  return { snapshot, restore, scrollToBottom, focus };
})();