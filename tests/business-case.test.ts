import { describe, expect, it } from 'vitest';
import {
  defaultBusinessAssumptions as a, errorCost, escalationCostEur, escalationsPerWrongPayment, manualErrorCost,
  policyChangeCost, productionRates, summary, triageCost,
} from '../src/business-case.js';

describe('business case', () => {
  it('prices annual triage today vs. with the system', () => {
    const t = triageCost(a);
    expect(t.todayEur).toBe(60_000 * 0.25 * a.hourlyCostEur);
    const minutesNow = a.shareRoutine * 2 + a.shareInfo * 5 + (1 - a.shareRoutine - a.shareInfo) * 15;
    expect(t.withSystemEur).toBeCloseTo(60_000 * (minutesNow / 60) * a.hourlyCostEur + a.runningCostEur);
    expect(t.staffHoursSaved).toBeCloseTo(60_000 * (15 - minutesNow) / 60);
  });

  it('weighs a wrong routine payment far above an unnecessary escalation', () => {
    expect(escalationCostEur(a)).toBeCloseTo(0.25 * a.hourlyCostEur);
    expect(escalationsPerWrongPayment(a)).toBeCloseTo(a.wrongPaymentCostEur / (0.25 * a.hourlyCostEur));
    expect(manualErrorCost(a).totalEur).toBeCloseTo(60_000 * a.manualWrongRoutineRate * a.wrongPaymentCostEur);
    expect(errorCost(a, { wrongRoutineRate: 0, unnecessaryReviewRate: 0.1 }).totalEur).toBeCloseTo(60_000 * 0.1 * 0.25 * a.hourlyCostEur);
  });

  it('never assumes zero production errors from a small test set', () => {
    expect(productionRates(a, { wrongRoutineRate: 0, unnecessaryReviewRate: 0 }).wrongRoutineRate).toBe(a.systemWrongRoutineFloor);
    expect(productionRates(a, { wrongRoutineRate: 0.14, unnecessaryReviewRate: 0 }).wrongRoutineRate).toBe(0.14);
  });

  it('prices a policy change and computes payback', () => {
    const p = policyChangeCost(a, 0.18);
    expect(p.todayEur).toBeCloseTo((25 * 2 + 3_000 * (10 / 60)) * a.hourlyCostEur);
    expect(p.claimsToRecheckWithSystem).toBe(540);
    const s = summary(a, productionRates(a, { wrongRoutineRate: 0, unnecessaryReviewRate: 0 }));
    expect(s.netBenefitEur).toBeGreaterThan(0);
    expect(s.paybackMonths).toBeCloseTo((a.oneOffCostEur / s.netBenefitEur) * 12);
    const zero = productionRates(a, { wrongRoutineRate: 0, unnecessaryReviewRate: 0 });
    const withChanges = summary(a, zero, 0.18);
    const noChanges = summary({ ...a, policyChangesPerYear: 0 }, zero, 0.18);
    expect(withChanges.netBenefitEur - noChanges.netBenefitEur).toBeCloseTo(a.policyChangesPerYear * (p.todayEur - p.withSystemEur));
    expect(summary({ ...a, runningCostEur: 10_000_000 }, { wrongRoutineRate: 0, unnecessaryReviewRate: 0 }).paybackMonths).toBeNull();
  });
});
