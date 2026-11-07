import { describe, expect, it } from 'vitest';
import { bucketFor, countSeries, delta, inWindow, isoWeek, previousWindow, receivedSeries, windowFor } from '../src/timeline.js';

const now = new Date(2026, 10, 7, 15, 0); // Sat 7 Nov 2026, 15:00 local
const DAY = 86_400_000;

describe('windowFor', () => {
  it('starts "today" at midnight with hourly buckets', () => {
    const w = windowFor('1d', now, null);
    expect(w.start).toEqual(new Date(2026, 10, 7));
    expect(w.bucket).toBe('hour');
  });

  it('counts back whole days, including today', () => {
    const w = windowFor('7d', now, null);
    expect(w.start).toEqual(new Date(2026, 10, 1));
    expect(w.bucket).toBe('day');
    expect(windowFor('90d', now, null).bucket).toBe('week');
    expect(windowFor('1y', now, null).bucket).toBe('month');
  });

  it('starts "all time" at the earliest arrival', () => {
    const w = windowFor('all', now, new Date(2026, 6, 22, 9, 12));
    expect(w.start).toEqual(new Date(2026, 6, 22));
    expect(w.bucket).toBe('week');
  });
});

describe('previousWindow', () => {
  it('is the equally long span right before', () => {
    const w = windowFor('7d', now, null);
    const p = previousWindow(w);
    expect(p.end).toEqual(w.start);
    expect(w.start.getTime() - p.start.getTime()).toBe(w.end.getTime() - w.start.getTime());
    expect(inWindow(w.start, p)).toBe(false);
    expect(inWindow(w.start, w)).toBe(true);
  });
});

describe('receivedSeries', () => {
  it('buckets claims by day and keeps empty days', () => {
    const w = windowFor('7d', now, null);
    const series = receivedSeries([
      { at: new Date(2026, 10, 2, 9), recommendation: 'human_review' },
      { at: new Date(2026, 10, 2, 16), recommendation: 'routine_processing' },
      { at: new Date(2026, 9, 20), recommendation: 'routine_processing' }, // outside
    ], w);
    expect(series).toHaveLength(7);
    expect(series[1]).toMatchObject({ total: 2, counts: { human_review: 1, routine_processing: 1, request_information: 0 } });
    expect(series.reduce((sum, p) => sum + p.total, 0)).toBe(2);
  });
});

describe('isoWeek', () => {
  it('numbers calendar weeks the ISO way', () => {
    expect(isoWeek(new Date(2026, 9, 12))).toBe(42); // Mon 12 Oct 2026
    expect(isoWeek(new Date(2026, 9, 18))).toBe(42); // Sun 18 Oct 2026
    expect(isoWeek(new Date(2026, 9, 19))).toBe(43);
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53); // Fri 1 Jan 2027 belongs to 2026-W53
  });
});

describe('bucketFor and delta', () => {
  it('picks readable buckets', () => {
    expect(bucketFor(DAY)).toBe('hour');
    expect(bucketFor(30 * DAY)).toBe('day');
  });

  it('reports rate changes in percentage points', () => {
    expect(delta(0.5, 0.25, 'pp')).toEqual({ value: 25, kind: 'pp' });
    expect(delta(3, 5, 'count')).toEqual({ value: -2, kind: 'count' });
    expect(delta(3, null, 'count')).toBeNull();
  });
});

describe('countSeries', () => {
  it('counts timestamps per bucket and ignores those outside', () => {
    const w = windowFor('7d', now, null);
    const series = countSeries([new Date(2026, 10, 3, 9), new Date(2026, 10, 3, 18), new Date(2026, 9, 1)], w);
    expect(series).toHaveLength(7);
    expect(series[2].count).toBe(2);
    expect(series.reduce((n, p) => n + p.count, 0)).toBe(2);
  });
});
