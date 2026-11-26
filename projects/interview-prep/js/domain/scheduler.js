// Re-solve scheduler. Pure: no storage, no DOM. Days are integer day numbers (see store.today()).
//
// A problem climbs one rung of the ladder each time it is re-solved cleanly and
// drops when it isn't. Past the last rung it is mastered and stops being scheduled.

export const LADDER = [3, 7, 14, 30, 60];
export const LEECH_LAPSES = 3;
export const OUTCOMES = ["clean", "hinted", "solution", "failed"];

export const OUTCOME_LABEL = {
  clean: "Clean",
  hinted: "Hinted",
  solution: "Read the solution",
  failed: "Failed",
};
export const OUTCOME_HELP = {
  clean: "Solved with no hints.",
  hinted: "Solved after a pattern or insight hint.",
  solution: "Read an outside solution, then wrote the code yourself.",
  failed: "Gave up, or the code didn't pass.",
};

// The best outcome an attempt can claim given the hints it revealed.
export function outcomeFloor(hintLevel) {
  return hintLevel >= 3 ? "solution" : hintLevel >= 1 ? "hinted" : "clean";
}
export const outcomeAllowed = (outcome, hintLevel) =>
  OUTCOMES.indexOf(outcome) >= OUTCOMES.indexOf(outcomeFloor(hintLevel));

// prev: the problem's ReviewState, or null for a first attempt.
// Returns the new ReviewState: { stage, due, lapses, last, mastered }.
export function schedule(prev, outcome, day) {
  if (!OUTCOMES.includes(outcome)) throw new Error("Unknown outcome: " + outcome);
  if (!prev) {
    const stage = outcome === "clean" ? 1 : 0;
    return { stage, due: day + LADDER[stage], lapses: 0, last: outcome, mastered: false };
  }
  const lapses = prev.lapses || 0;
  if (outcome === "clean") {
    const stage = prev.stage + 1;
    if (prev.mastered || stage >= LADDER.length) {
      return { stage: LADDER.length - 1, due: null, lapses, last: outcome, mastered: true };
    }
    return { stage, due: day + LADDER[stage], lapses, last: outcome, mastered: false };
  }
  if (outcome === "hinted") {
    const stage = Math.max(prev.stage - 1, 0);
    return { stage, due: day + LADDER[stage], lapses, last: outcome, mastered: false };
  }
  // solution or failed: back to the bottom, and see it again tomorrow.
  return { stage: 0, due: day + 1, lapses: lapses + 1, last: outcome, mastered: false };
}

export const isLeech = (review) => !!review && !review.mastered && (review.lapses || 0) >= LEECH_LAPSES;
export const isDue = (review, day) => !!review && !review.mastered && review.due != null && review.due <= day;
