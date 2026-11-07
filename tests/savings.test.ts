import { describe, expect, it } from 'vitest';
import { defaultAssumptions, estimateSavings } from '../src/savings.js';

describe('estimateSavings', () => {
  const a = { manualErrorRate: 0.04, avgWrongPaymentEur: 2000, minutesPerReview: 30, hourlyCostEur: 40 };

  it('counts manual reviews avoided and staff cost saved', () => {
    const s = estimateSavings({ claims: 100, automated: 60, humanReview: 30, systemWrongRoutineRate: 0 }, a);
    expect(s.manualReviewsBefore).toBe(100);
    expect(s.manualReviewsNow).toBe(30);
    expect(s.manualReviewReduction).toBeCloseTo(0.7);
    expect(s.staffHoursSaved).toBe(35);
    expect(s.staffCostSavedEur).toBe(1400);
  });

  it('values fewer wrong payments with the measured system error rate', () => {
    const s = estimateSavings({ claims: 100, automated: 60, humanReview: 30, systemWrongRoutineRate: 0.01 }, a);
    expect(s.wrongPaymentsBefore).toBe(4);
    expect(s.wrongPaymentsNow).toBeCloseTo(0.6 + 1.2);
    expect(s.wrongPaymentCostSavedEur).toBeCloseTo((4 - 1.8) * 2000);
    expect(s.totalSavedEur).toBeCloseTo(s.staffCostSavedEur + s.wrongPaymentCostSavedEur);
  });

  it('never reports negative savings and handles an empty period', () => {
    const worse = estimateSavings({ claims: 10, automated: 10, humanReview: 0, systemWrongRoutineRate: 0.5 }, a);
    expect(worse.wrongPaymentCostSavedEur).toBe(0);
    const empty = estimateSavings({ claims: 0, automated: 0, humanReview: 0, systemWrongRoutineRate: 0 });
    expect(empty).toMatchObject({ manualReviewReduction: 0, totalSavedEur: 0 });
    expect(defaultAssumptions.manualErrorRate).toBeGreaterThan(0);
  });
});
