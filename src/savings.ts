/**
 * Owner savings estimate: the triage system compared with the fully manual process
 * the insurer ran a year ago (every claim reviewed by a person).
 *
 * All money and time figures are ESTIMATES driven by the assumptions below. They are shown
 * next to the result and can be edited, so the owner sees exactly where a number comes from.
 * Keep the defaults aligned with the team's business case.
 */
export interface SavingsAssumptions {
  /** Share of claims that a fully manual process sends to payment wrongly (0–1). */
  manualErrorRate: number;
  /** Average cost of one wrongly paid claim, in euros. */
  avgWrongPaymentEur: number;
  /** Staff minutes one manual claim review takes. */
  minutesPerReview: number;
  /** Fully loaded staff cost per hour, in euros. */
  hourlyCostEur: number;
}

export const defaultAssumptions: SavingsAssumptions = {
  manualErrorRate: 0.03,
  avgWrongPaymentEur: 2500,
  minutesPerReview: 25,
  hourlyCostEur: 45,
};

export interface SavingsInput {
  /** Claims in the period. */
  claims: number;
  /** Claims the system sent straight to routine processing (no staff review). */
  automated: number;
  /** Claims a person still has to review. */
  humanReview: number;
  /** Measured share of routine recommendations that were wrong (from labelled cases), 0–1. */
  systemWrongRoutineRate: number;
}

export interface Savings {
  manualReviewsBefore: number;
  manualReviewsNow: number;
  /** Reduction of manual reviews vs. the manual process, 0–1. */
  manualReviewReduction: number;
  staffHoursSaved: number;
  staffCostSavedEur: number;
  wrongPaymentsBefore: number;
  wrongPaymentsNow: number;
  wrongPaymentCostSavedEur: number;
  totalSavedEur: number;
}

export function estimateSavings(input: SavingsInput, a: SavingsAssumptions = defaultAssumptions): Savings {
  const { claims, automated, humanReview, systemWrongRoutineRate } = input;
  // A year ago every claim was reviewed by hand. Now only human-review cases are; information
  // requests go out automatically.
  const manualReviewsBefore = claims;
  const manualReviewsNow = humanReview;
  const avoidedReviews = Math.max(0, manualReviewsBefore - manualReviewsNow);
  const staffHoursSaved = (avoidedReviews * a.minutesPerReview) / 60;
  // Manual process: the manual error rate applies to every claim. Now: automated claims carry the
  // measured system error rate, reviewed claims keep the manual error rate.
  const wrongPaymentsBefore = claims * a.manualErrorRate;
  const wrongPaymentsNow = automated * systemWrongRoutineRate + humanReview * a.manualErrorRate;
  const wrongPaymentCostSavedEur = Math.max(0, wrongPaymentsBefore - wrongPaymentsNow) * a.avgWrongPaymentEur;
  const staffCostSavedEur = staffHoursSaved * a.hourlyCostEur;
  return {
    manualReviewsBefore,
    manualReviewsNow,
    manualReviewReduction: manualReviewsBefore ? avoidedReviews / manualReviewsBefore : 0,
    staffHoursSaved,
    staffCostSavedEur,
    wrongPaymentsBefore,
    wrongPaymentsNow,
    wrongPaymentCostSavedEur,
    totalSavedEur: staffCostSavedEur + wrongPaymentCostSavedEur,
  };
}
