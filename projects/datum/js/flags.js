// Per-learner flags and seeded randomness. A learner's random seed decides the
// dimensions of some parts and every flag, so answers can't be
// copied from someone else or read out of the source.
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

/** Seeded helpers around one PRNG stream. */
export function helpers(rng) {
  const int = (a, b) => a + Math.floor(rng() * (b - a + 1));
  return {
    rng, int,
    pick: (arr) => arr[Math.floor(rng() * arr.length)],
    shuffle: (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    hex: (n) => Array.from({ length: n }, () => Math.floor(rng() * 16).toString(16)).join(""),
  };
}

/** What a challenge's setup gets. Built fresh on every reset, so setup is repeatable. */
export function makeCtx(seed, ch) {
  const h = helpers(rngFrom(`${seed}|${ch.id}|params`));
  const flagHex = helpers(rngFrom(`${seed}|${ch.id}|flag`)).hex(6);
  return { ...h, id: ch.id, flag: `DATUM{${ch.slug}_${flagHex}}`, decoy: () => `DATUM{${ch.slug}_${h.hex(6)}}` };
}

export function checkFlag(input, ctx) {
  const v = String(input ?? "").trim();
  return v === ctx.flag || v.replace(/^datum\{/i, "DATUM{") === ctx.flag;
}
