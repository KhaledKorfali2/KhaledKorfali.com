// Per-learner flags and seeded randomness.
// Each learner has a random seed; a challenge's flag and any randomised puzzle
// parameters derive from (seed, challenge id). Flags therefore differ between
// learners and aren't sitting in the source code.

// cyrb128: string → four 32-bit hashes
function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

// sfc32 PRNG → [0, 1)
function sfc32(a, b, c, d) {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export const rngFrom = (s) => sfc32(...cyrb128(s));

const WORDS = ["amber", "falcon", "harbor", "lantern", "marble", "nimbus", "orchid", "pepper", "quartz", "raven",
  "saffron", "timber", "umbra", "velvet", "willow", "zephyr", "copper", "delta", "ember", "frost", "glacier", "hazel",
  "indigo", "juniper", "kestrel", "lotus", "meadow", "nectar", "onyx", "prairie", "rocket", "summit", "tundra", "violet"];

/** Everything a challenge's setup/check gets: its flag plus seeded helpers. */
export function makeCtx(seed, ch) {
  const rng = rngFrom(`${seed}|${ch.id}|params`);
  const flagRng = rngFrom(`${seed}|${ch.id}|flag`);
  const hexFrom = (r, n) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join("");
  const int = (a, b) => a + Math.floor(rng() * (b - a + 1));
  return {
    id: ch.id,
    flag: `BREACH{${ch.slug}_${hexFrom(flagRng, 6)}}`,
    rng,
    int,
    pick: (arr) => arr[Math.floor(rng() * arr.length)],
    shuffle: (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    hex: (n) => hexFrom(rng, n),
    ip: (prefix = "10.0.0.") => prefix + int(2, 250),
    word: () => WORDS[Math.floor(rng() * WORDS.length)],
  };
}

/** Answer normalisers for value-answer challenges. */
export const norm = {
  text: (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " "),
  ip: (s) => String(s ?? "").trim().replace(/^\[|\]$/g, ""),
  num: (s) => Number(String(s ?? "").replace(/[\s,$£€]/g, "")),
};

/** Default check: exact flag (tolerating surrounding whitespace and a lowercase prefix). */
export function defaultCheck(input, ctx) {
  const v = String(input ?? "").trim();
  return v === ctx.flag || v.replace(/^breach\{/i, "BREACH{") === ctx.flag;
}
