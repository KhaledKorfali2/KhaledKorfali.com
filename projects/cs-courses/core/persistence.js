/* ============================== core/persistence.js ==============================
   Thin, defensive localStorage wrapper. Domain-agnostic: it just stores and
   retrieves JSON blobs under a key. Used by curriculum.js to persist the
   whole app state, but any module can use it directly too.
==================================================================================== */
window.Persistence = (function () {
  function save(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn("Could not save to localStorage:", e);
      return false;
    }
  }

  function load(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn("Could not load from localStorage:", e);
      return null;
    }
  }

  function remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      /* ignore */
    }
  }

  return { save, load, remove };
})();