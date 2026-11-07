import { describe, expect, it } from 'vitest';
import { V2_PERIOD_START, daysOpen, mockArrivals, receivedAt } from '../src/received-at.js';

describe('receivedAt', () => {
  const ids = Object.keys(mockArrivals);

  it('covers all 14 development cases in arrival order', () => {
    expect(ids).toEqual(Array.from({ length: 14 }, (_, i) => `DEV-${String(i + 1).padStart(3, '0')}`));
    const times = ids.map(id => receivedAt(id, undefined)!.at.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('spans from late July to the start of the v2 period', () => {
    expect(receivedAt('DEV-001', undefined)!.at.toISOString()).toBe('2026-07-22T07:12:00.000Z');
    const last = receivedAt('DEV-014', undefined)!.at;
    expect(last.getTime()).toBeLessThan(new Date(V2_PERIOD_START).getTime());
    expect(receivedAt('DEV-014', undefined)!.simulated).toBe(true);
  });

  it('prefers a real received_at column', () => {
    const real = receivedAt('DEV-001', '2026-11-01T10:00:00Z')!;
    expect(real.simulated).toBe(false);
    expect(real.at.toISOString()).toBe('2026-11-01T10:00:00.000Z');
  });

  it('returns null for cases without any date', () => {
    expect(receivedAt('PRA-001', undefined)).toBeNull();
    expect(receivedAt('PRA-001', 'not a date')).toBeNull();
  });
});

describe('daysOpen', () => {
  it('counts calendar days', () => {
    expect(daysOpen(new Date(2026, 9, 24, 8, 20), new Date(2026, 10, 7, 15, 0))).toBe(14);
    expect(daysOpen(new Date(2026, 10, 7, 8, 0), new Date(2026, 10, 7, 23, 0))).toBe(0);
  });
});
