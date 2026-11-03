// Small helpers shared by every screen.

export function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Content HTML is authored in-repo; allow only a tiny safe subset anyway.
export function safeHtml(html) {
  return esc(html).replace(/&lt;(\/?)(strong|em|code|br)&gt;/g, "<$1$2>");
}

export function fmtMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms >= 10000) return (ms / 1000).toFixed(1) + " s";
  if (ms >= 1000) return (ms / 1000).toFixed(2) + " s";
  return (ms < 10 ? ms.toFixed(1) : Math.round(ms)) + " ms";
}
export const fmtBytes = (b) => b >= 1024 * 1024 ? (b / 1048576).toFixed(1) + " MB" : b >= 1024 ? (b / 1024).toFixed(1) + " KB" : b + " B";

const svg = (body, vb = "0 0 20 20") => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const st = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
export const ICON = {
  learn: svg(`<path d="M2.5 7.5L10 4l7.5 3.5L10 11z" ${st}/><path d="M5.5 9v4c1.2 1.2 2.7 1.8 4.5 1.8s3.3-.6 4.5-1.8V9" ${st}/>`),
  lab: svg(`<path d="M8 3v5L4 15.5a1.2 1.2 0 001 1.5h10a1.2 1.2 0 001-1.5L12 8V3M7 3h6" ${st}/><path d="M6 12.5h8" ${st}/>`),
  protocols: svg(`<rect x="3" y="3" width="14" height="3.6" rx="1" ${st}/><rect x="3" y="8.2" width="14" height="3.6" rx="1" ${st}/><rect x="3" y="13.4" width="14" height="3.6" rx="1" ${st}/>`),
  quiz: svg(`<circle cx="10" cy="10" r="7" ${st}/><path d="M8 8a2 2 0 113 1.7c-.7.4-1 .8-1 1.6M10 14h.01" ${st}/>`),
  check: svg(`<path d="M4.5 10.5l3.5 3.5 7.5-8" ${st} stroke-width="2.4"/>`),
  x: svg(`<path d="M5.5 5.5l9 9M14.5 5.5l-9 9" ${st} stroke-width="2.4"/>`),
  close: svg(`<path d="M5.5 5.5l9 9M14.5 5.5l-9 9" ${st}/>`),
  back: svg(`<path d="M12 4.5L6.5 10l5.5 5.5" ${st}/>`),
  arrow: svg(`<path d="M4 10h12M11 5l5 5-5 5" ${st}/>`),
  play: svg(`<path d="M6 4.5v11l9-5.5z" fill="currentColor"/>`),
  pause: svg(`<path d="M5.5 4h3v12h-3zM11.5 4h3v12h-3z" fill="currentColor"/>`),
  replay: svg(`<path d="M4 10a6 6 0 106-6H7" ${st}/><path d="M9 1.5L6.5 4 9 6.5" ${st}/>`),
  external: svg(`<path d="M8 4H5a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1v-3M11 4h5v5M16 4l-7 7" ${st}/>`),
  gear: svg(`<path d="M10 12.8a2.8 2.8 0 100-5.6 2.8 2.8 0 000 5.6z" ${st}/><path d="M16.2 12.4l1.3 1-1.6 2.8-1.6-.6a6.5 6.5 0 01-1.7 1l-.3 1.7H9.1l-.3-1.7a6.5 6.5 0 01-1.7-1l-1.6.6-1.6-2.8 1.3-1a6.6 6.6 0 010-2l-1.3-1 1.6-2.8 1.6.6a6.5 6.5 0 011.7-1l.3-1.7h3.2l.3 1.7a6.5 6.5 0 011.7 1l1.6-.6 1.6 2.8-1.3 1a6.6 6.6 0 010 2z" ${st}/>`),
  sun: svg(`<circle cx="10" cy="10" r="3.5" ${st}/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" ${st}/>`),
  moon: svg(`<path d="M16 12.5A6.5 6.5 0 017.5 4a6.5 6.5 0 108.5 8.5z" ${st}/>`),
  bolt: svg(`<path d="M11 2L4 11h5l-1 7 7-9h-5z" ${st}/>`),
  race: svg(`<path d="M3 6h9M3 10h13M3 14h6" ${st}/><circle cx="14.5" cy="6" r="1.5" fill="currentColor"/><circle cx="11.5" cy="14" r="1.5" fill="currentColor"/>`),
  lock: svg(`<rect x="4.5" y="9" width="11" height="8" rx="1.5" ${st}/><path d="M7 9V6.5a3 3 0 016 0V9" ${st}/>`),
};

let toastTimer;
export function toast(text) {
  const el = document.querySelector(".toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
