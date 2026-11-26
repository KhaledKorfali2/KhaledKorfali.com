// Readiness metrics. Pure. "Ready" is measured on unseen problems, not on problem count.

export const TARGETS = {
  unseen: 0.65,        // clean rate on hidden-topic Medium first attempts, within 30 minutes
  guess: 0.7,          // pattern-guess accuracy
  medianCleanSec: 25 * 60,
  strength: 0.5,       // every pattern
  reviewHealth: 0.8,
};
export const UNSEEN_WINDOW = 20;
export const UNSEEN_LIMIT_SEC = 30 * 60;
export const SCORE = { clean: 1, hinted: 0.5, solution: 0.2, failed: 0 };
const WEIGHTS = [5, 4, 3, 2, 1];

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Recency-weighted mean of the last five scores (newest weighs 5, oldest 1).
export function strengthOf(outcomesOldestFirst) {
  const last = outcomesOldestFirst.slice(-5).reverse();
  if (!last.length) return null;
  let sum = 0, w = 0;
  last.forEach((o, i) => { sum += SCORE[o] * WEIGHTS[i]; w += WEIGHTS[i]; });
  return sum / w;
}

// solves:   [{ p, day, dur, mode, hidden, first, outcome, guess, dueWas }] oldest first
// problems: Map id -> { pattern, difficulty, alsoAccept? }
// patterns: [patternId] every pattern that should reach the strength target
export function computeMetrics({ solves, problems, patterns, today }) {
  const known = solves.filter((s) => problems.has(s.p));
  const diff = (s) => problems.get(s.p).difficulty;

  // 1. Unseen-medium clean rate
  const unseenAll = known.filter((s) => s.first && s.hidden && diff(s) === "Medium").slice(-UNSEEN_WINDOW);
  const unseenHits = unseenAll.filter((s) => s.outcome === "clean" && s.dur <= UNSEEN_LIMIT_SEC).length;
  const unseen = { n: unseenAll.length, hits: unseenHits, rate: unseenAll.length ? unseenHits / unseenAll.length : null };

  // 2. Pattern-guess accuracy
  const guessed = known.filter((s) => s.guess);
  const guessHits = guessed.filter((s) => {
    const pr = problems.get(s.p);
    return s.guess === pr.pattern || (pr.alsoAccept || []).includes(s.guess);
  }).length;
  const guess = { n: guessed.length, hits: guessHits, rate: guessed.length ? guessHits / guessed.length : null };

  // 3. Median clean time on Mediums, last 30 days
  const cleanMed = known.filter((s) => s.outcome === "clean" && diff(s) === "Medium" && today - s.day < 30);
  const medianClean = { n: cleanMed.length, sec: median(cleanMed.map((s) => s.dur)) };

  // 4. Pattern strength
  const byPattern = new Map(patterns.map((id) => [id, []]));
  for (const s of known) byPattern.get(problems.get(s.p).pattern)?.push(s.outcome);
  const strength = patterns.map((id) => ({ id, n: byPattern.get(id).length, value: strengthOf(byPattern.get(id)) }));
  const strengthMet = strength.length > 0 && strength.every((s) => s.value != null && s.value >= TARGETS.strength);

  // 5. Review health: re-solves done on or before their due date, last 14 days
  const revs = known.filter((s) => !s.first && s.dueWas != null && today - s.day < 14);
  const onTime = revs.filter((s) => s.day <= s.dueWas).length;
  const reviewHealth = { n: revs.length, hits: onTime, rate: revs.length ? onTime / revs.length : null };

  const met = {
    unseen: unseen.n >= UNSEEN_WINDOW && unseen.rate >= TARGETS.unseen,
    guess: guess.rate != null && guess.rate >= TARGETS.guess,
    medianClean: medianClean.sec != null && medianClean.sec <= TARGETS.medianCleanSec,
    strength: strengthMet,
    reviewHealth: reviewHealth.rate != null && reviewHealth.rate >= TARGETS.reviewHealth,
  };

  // Weakest pattern: the lowest strength among practised patterns; if they all clear the bar,
  // the first pattern not practised at all.
  const practised = strength.filter((s) => s.value != null).sort((a, b) => a.value - b.value || a.n - b.n);
  const untouched = strength.find((s) => s.value == null);
  const weakest = practised.length && practised[0].value < TARGETS.strength ? practised[0]
    : untouched || practised[0] || null;

  return { unseen, guess, medianClean, strength, reviewHealth, met, ready: met.unseen && met.guess && met.strength, weakest };
}
