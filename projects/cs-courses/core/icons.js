/* ============================== core/icons.js ==============================
   Generic SVG icon set. Reusable as-is by any project built on this platform.
============================================================================= */
window.Icons = (function () {
  function icon(name, size) {
    size = size || 14;
    const common = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;
    const paths = {
      folder: `<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"/>`,
      folderOpen: `<path d="M3 8V6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2"/><path d="M3 8h17l-2.2 9.2a2 2 0 0 1-2 1.8H6.2a2 2 0 0 1-2-1.6L3 8z"/>`,
      fileText: `<path d="M6 2h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M14 2v5h5"/><path d="M8.5 13h7M8.5 16.5h7"/>`,
      fileSymlink: `<path d="M6 2h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M14 2v5h5"/><path d="M9 16l3-3-3-3"/><path d="M9 13h4"/>`,
      chevronRight: `<path d="M9 6l6 6-6 6"/>`,
      chevronLeft: `<path d="M15 6l-6 6 6 6"/>`,
      chevronDown: `<path d="M6 9l6 6 6-6"/>`,
      terminal: `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3"/><path d="M12 15h5"/>`,
      home: `<path d="M4 11l8-7 8 7"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9"/>`,
      lock: `<rect x="4.5" y="10.5" width="15" height="9.5" rx="1.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>`,
      link2: `<path d="M9 15L15 9"/><path d="M8 5H6a4 4 0 0 0 0 8h2"/><path d="M16 19h2a4 4 0 0 0 0-8h-2"/>`,
      database: `<ellipse cx="12" cy="5.5" rx="7.5" ry="3"/><path d="M4.5 5.5V18c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V5.5"/><path d="M4.5 11.75c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3"/>`,
      trophy: `<path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 5H4a2 2 0 0 0 0 4l3 1"/><path d="M17 5h3a2 2 0 0 1 0 4l-3 1"/><path d="M12 14v3"/><path d="M9 21h6"/><path d="M10 17h4v4h-4z"/>`,
      hardDrive: `<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M2.5 14.5h19"/><circle cx="7" cy="16.2" r="0.8" fill="currentColor" stroke="none"/>`,
      compass: `<circle cx="12" cy="12" r="9.5"/><path d="M15 9l-2 6-6 2 2-6z"/>`,
      check: `<path d="M4 12l5 5L20 6"/>`,
      x: `<path d="M5 5l14 14M19 5L5 19"/>`,
      alertTriangle: `<path d="M12 3.5L2 20h20L12 3.5z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none"/>`,
      cpu: `<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>`,
      server: `<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><circle cx="7" cy="7" r="0.8" fill="currentColor" stroke="none"/><circle cx="7" cy="17" r="0.8" fill="currentColor" stroke="none"/>`,
      barChart2: `<path d="M6 20V10M12 20V4M18 20v-7"/>`,
      gitBranch: `<circle cx="6" cy="6" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="9" r="2.2"/><path d="M6 8.2V15.8"/><path d="M6 8.2c0 4 3 5 8.2 5.6"/><path d="M18 11.2V13"/>`,
      keyboard: `<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M6 14h8M16 14h2"/>`
    };
    return `<svg ${common}>${paths[name] || ""}</svg>`;
  }
  return { icon };
})();