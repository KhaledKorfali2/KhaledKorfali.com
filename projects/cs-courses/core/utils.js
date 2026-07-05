/* ============================== core/utils.js ==============================
   Tiny generic helpers with no domain knowledge. Reusable as-is.
============================================================================= */
window.Utils = (function () {
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Byte formatter (B/K/M/G). Handy for any project tracking storage-like sizes.
  function fmtBytes(b) {
    if (b < 1024) return `${Math.round(b)}B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}K`;
    if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)}M`;
    return `${(b / 1024 / 1024 / 1024).toFixed(1)}G`;
  }

  // Deterministic pseudo-random integer sequence, seeded — handy for any
  // "stable random" visual (scattered blocks, shuffled layouts, etc).
  function seededShuffle(n, seed) {
    const arr = [...Array(n).keys()];
    let s = seed;
    for (let i = n - 1; i > 0; i--) {
      s = (s * 1103515245 + 12345) % 2147483648;
      const j = s % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  return { esc, fmtBytes, seededShuffle };
})();