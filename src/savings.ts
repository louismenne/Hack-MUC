/**
 * Staff time the triage system saves compared with a fully manual process, for the claims
 * received in the selected period.
 *
 * Deliberately conservative and countable:
 * - The claim counts per route are facts (what the system decided for each claim in the period).
 * - Minutes per route and the hourly cost are stated assumptions, editable in the UI.
 * - Human-review claims are assumed to take as long as today (no speed-up claimed), and
 *   automated routes still cost a few minutes of human checking.
 * - No money is claimed for avoided wrong payments: that would need an invented error rate for
 *   the manual process. Error rates are measured separately on the labelled cases.
 * Rationale and sources: docs/savings-model.md.
 */
export interface SavingsAssumptions {
  /** Manual process: minutes a handler needs to triage one claim (read pack, check policy, decide next step). */
  manualMinutesPerClaim: number;
  /** With the system: minutes to spot-check a claim sent to routine processing. */
  routineCheckMinutes: number;
  /** With the system: minutes to check and send an automatically drafted information request. */
  infoRequestMinutes: number;
  /** With the system: minutes for a human review. Defaults to the manual time (no speed-up claimed). */
  reviewMinutes: number;
  /** Fully loaded staff cost per hour, in euros. */
  hourlyCostEur: number;
}

export const defaultAssumptions: SavingsAssumptions = {
  manualMinutesPerClaim: 15,
  routineCheckMinutes: 2,
  infoRequestMinutes: 5,
  reviewMinutes: 15,
  hourlyCostEur: 40,
};

export interface SavingsInput {
  routine: number;
  requestInfo: number;
  humanReview: number;
}

export interface Savings {
  claims: number;
  /** Claims a person had to triage fully before (all of them) and now (human review only). */
  fullReviewsBefore: number;
  fullReviewsNow: number;
  minutesBefore: number;
  minutesNow: number;
  /** Share of staff triage time saved, 0–1. */
  timeReduction: number;
  hoursSaved: number;
  /** Average minutes saved per claim in the period. */
  minutesSavedPerClaim: number;
  staffCostSavedEur: number;
}

export function estimateSavings(input: SavingsInput, a: SavingsAssumptions = defaultAssumptions): Savings {
  const { routine, requestInfo, humanReview } = input;
  const claims = routine + requestInfo + humanReview;
  const minutesBefore = claims * a.manualMinutesPerClaim;
  const minutesNow = routine * a.routineCheckMinutes + requestInfo * a.infoRequestMinutes + humanReview * a.reviewMinutes;
  const savedMinutes = Math.max(0, minutesBefore - minutesNow);
  return {
    claims,
    fullReviewsBefore: claims,
    fullReviewsNow: humanReview,
    minutesBefore,
    minutesNow,
    timeReduction: minutesBefore ? savedMinutes / minutesBefore : 0,
    hoursSaved: savedMinutes / 60,
    minutesSavedPerClaim: claims ? savedMinutes / claims : 0,
    staffCostSavedEur: (savedMinutes / 60) * a.hourlyCostEur,
  };
}
