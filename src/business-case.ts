/**
 * Business case for a mid-sized European motor insurer: annual triage cost, cost of errors and
 * cost of a policy change, today (fully manual triage) vs. with the system.
 *
 * Every input is a stated, editable assumption except the measured error rates, which come from the
 * labelled test cases (see Test cases page). Rationale for the defaults: docs/business-case.md.
 */
export interface BusinessAssumptions {
  /** Motor claims per year: ~0.7 % of the ~9 million motor claims German insurers settled in 2023 (GDV). */
  claimsPerYear: number;
  /** Fully loaded staff cost per hour, EUR (Destatis: average labour cost per hour worked, 2025). */
  hourlyCostEur: number;
  /** Today: minutes to triage one claim by hand. */
  manualMinutes: number;
  /** With the system: minutes of human time per route. Review gets no speed-up. */
  routineMinutes: number;
  infoMinutes: number;
  reviewMinutes: number;
  /** Expected production mix with the system (0–1). Glass alone was ~2 of ~9 million claims in 2023 (GDV). */
  shareRoutine: number;
  shareInfo: number;
  /** Today: share of claims a manual triage waves through that should have been stopped (0–1). */
  manualWrongRoutineRate: number;
  /** With the system: assumed floor for wrong routine decisions. 14 test cases cannot prove zero errors. */
  systemWrongRoutineFloor: number;
  /** Average amount overpaid when a claim slips through (the excess, not the whole claim), EUR. */
  wrongPaymentCostEur: number;
  /** One-off cost to integrate and roll out the system, EUR. */
  oneOffCostEur: number;
  /** Running cost per year (licence, hosting, AI calls, maintenance), EUR. */
  runningCostEur: number;
  /** Policy changes per year (rules, limits, legal updates). */
  policyChangesPerYear: number;
  /** Policy change: reviewers to retrain today, hours each. */
  reviewers: number;
  trainingHours: number;
  /** Open claims in flight when a policy changes (≈ 2–3 weeks of volume). */
  openClaimsAtChange: number;
  /** Today: minutes to re-check one open claim by hand after a change. */
  manualRecheckMinutes: number;
  /** With the system: owner hours to edit, preview and activate a change. */
  ownerHours: number;
}

export const defaultBusinessAssumptions: BusinessAssumptions = {
  claimsPerYear: 60_000,
  hourlyCostEur: 45,
  manualMinutes: 15,
  routineMinutes: 2,
  infoMinutes: 5,
  reviewMinutes: 15,
  shareRoutine: 0.4,
  shareInfo: 0.2,
  manualWrongRoutineRate: 0.005,
  systemWrongRoutineFloor: 0.002,
  wrongPaymentCostEur: 1_000,
  oneOffCostEur: 250_000,
  runningCostEur: 120_000,
  policyChangesPerYear: 3,
  reviewers: 25,
  trainingHours: 2,
  openClaimsAtChange: 3_000,
  manualRecheckMinutes: 10,
  ownerHours: 4,
};

/** Error rates measured on labelled cases for one policy version (shares of all labelled cases). */
export interface MeasuredRates {
  label: string;
  /** Predicted routine although the label says otherwise. */
  wrongRoutineRate: number;
  /** Predicted human review although a lighter step was enough. */
  unnecessaryReviewRate: number;
  cases: number;
}

const hours = (minutes: number) => minutes / 60;

export interface TriageCost { todayEur: number; withSystemEur: number; staffHoursSaved: number }

/** 1 · Annual triage cost: staff time today vs. with the system (running cost included). */
export function triageCost(a: BusinessAssumptions): TriageCost {
  const shareReview = Math.max(0, 1 - a.shareRoutine - a.shareInfo);
  const minutesNow = a.shareRoutine * a.routineMinutes + a.shareInfo * a.infoMinutes + shareReview * a.reviewMinutes;
  const todayHours = a.claimsPerYear * hours(a.manualMinutes);
  const withHours = a.claimsPerYear * hours(minutesNow);
  return {
    todayEur: todayHours * a.hourlyCostEur,
    withSystemEur: withHours * a.hourlyCostEur + a.runningCostEur,
    staffHoursSaved: todayHours - withHours,
  };
}

/** Cost of one unnecessary escalation: a full review that was not needed. */
export const escalationCostEur = (a: BusinessAssumptions) => hours(a.reviewMinutes) * a.hourlyCostEur;

/** 2 · Annual cost of wrong decisions for a set of error rates. */
export function errorCost(a: BusinessAssumptions, rates: Pick<MeasuredRates, 'wrongRoutineRate' | 'unnecessaryReviewRate'>) {
  const wrongRoutine = a.claimsPerYear * rates.wrongRoutineRate * a.wrongPaymentCostEur;
  const unnecessary = a.claimsPerYear * rates.unnecessaryReviewRate * escalationCostEur(a);
  return { wrongRoutineEur: wrongRoutine, unnecessaryReviewEur: unnecessary, totalEur: wrongRoutine + unnecessary };
}

/** Today's error cost: manual triage lets some claims through that it should stop. */
export const manualErrorCost = (a: BusinessAssumptions) =>
  errorCost(a, { wrongRoutineRate: a.manualWrongRoutineRate, unnecessaryReviewRate: 0 });

/** How many unnecessary reviews cost as much as one wrong routine payment: why borderline cases escalate. */
export const escalationsPerWrongPayment = (a: BusinessAssumptions) =>
  escalationCostEur(a) > 0 ? a.wrongPaymentCostEur / escalationCostEur(a) : Infinity;

/** 3 · Cost of one policy change (e.g. the v2 change), today vs. with the system. */
export function policyChangeCost(a: BusinessAssumptions, changedShare: number) {
  const todayEur = (a.reviewers * a.trainingHours + a.openClaimsAtChange * hours(a.manualRecheckMinutes)) * a.hourlyCostEur;
  const withSystemEur = (a.ownerHours + a.openClaimsAtChange * changedShare * hours(a.reviewMinutes)) * a.hourlyCostEur;
  return { todayEur, withSystemEur, claimsToRecheckToday: a.openClaimsAtChange, claimsToRecheckWithSystem: Math.round(a.openClaimsAtChange * changedShare) };
}

/** Rates used for production: measured, but never below the stated floor. */
export const productionRates = (a: BusinessAssumptions, measured: Pick<MeasuredRates, 'wrongRoutineRate' | 'unnecessaryReviewRate'>) => ({
  wrongRoutineRate: Math.max(measured.wrongRoutineRate, a.systemWrongRoutineFloor),
  unnecessaryReviewRate: measured.unnecessaryReviewRate,
});

/** Net benefit per year and payback: triage, errors and the year's policy changes. */
export function summary(a: BusinessAssumptions, systemRates: Pick<MeasuredRates, 'wrongRoutineRate' | 'unnecessaryReviewRate'>, changedShare = 0) {
  const triage = triageCost(a);
  const errorsToday = manualErrorCost(a).totalEur;
  const errorsWith = errorCost(a, systemRates).totalEur;
  const change = policyChangeCost(a, changedShare);
  const policyChangesEur = a.policyChangesPerYear * (change.todayEur - change.withSystemEur);
  const netBenefitEur = triage.todayEur - triage.withSystemEur + (errorsToday - errorsWith) + policyChangesEur;
  return {
    netBenefitEur,
    paybackMonths: netBenefitEur > 0 ? (a.oneOffCostEur / netBenefitEur) * 12 : null,
  };
}
