import { describe, expect, it } from 'vitest';
import { defaultAssumptions, estimateSavings } from '../src/savings.js';

describe('estimateSavings', () => {
  const a = { manualMinutesPerClaim: 15, routineCheckMinutes: 2, infoRequestMinutes: 5, reviewMinutes: 15, hourlyCostEur: 40 };

  it('compares staff minutes per route with triaging every claim by hand', () => {
    const s = estimateSavings({ routine: 6, requestInfo: 2, humanReview: 2 }, a);
    expect(s.claims).toBe(10);
    expect(s.minutesBefore).toBe(150);
    expect(s.minutesNow).toBe(6 * 2 + 2 * 5 + 2 * 15);
    expect(s.hoursSaved).toBeCloseTo((150 - 52) / 60);
    expect(s.timeReduction).toBeCloseTo(98 / 150);
    expect(s.minutesSavedPerClaim).toBeCloseTo(9.8);
    expect(s.staffCostSavedEur).toBeCloseTo((98 / 60) * 40);
    expect(s.fullReviewsNow).toBe(2);
  });

  it('claims no saving on human-review claims by default', () => {
    const s = estimateSavings({ routine: 0, requestInfo: 0, humanReview: 4 });
    expect(s.hoursSaved).toBe(0);
    expect(defaultAssumptions.reviewMinutes).toBe(defaultAssumptions.manualMinutesPerClaim);
  });

  it('never reports negative savings and handles an empty period', () => {
    const slower = estimateSavings({ routine: 1, requestInfo: 0, humanReview: 1 }, { ...a, reviewMinutes: 60 });
    expect(slower.hoursSaved).toBe(0);
    expect(estimateSavings({ routine: 0, requestInfo: 0, humanReview: 0 })).toMatchObject({ claims: 0, timeReduction: 0, minutesSavedPerClaim: 0 });
  });
});
