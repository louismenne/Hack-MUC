import type { Recommendation } from './triage.js';

/** Time ranges offered on the owner dashboard. */
export const timeRanges = ['1d', '7d', '30d', '90d', '1y', '2y', 'all'] as const;
export type TimeRange = typeof timeRanges[number];

export const rangeLabels: Record<TimeRange, string> = {
  '1d': 'Today', '7d': '7 days', '30d': '30 days', '90d': '90 days', '1y': '1 year', '2y': '2 years', all: 'All time',
};

const DAY = 86_400_000;
const rangeDays: Record<Exclude<TimeRange, 'all'>, number> = { '1d': 1, '7d': 7, '30d': 30, '90d': 90, '1y': 365, '2y': 730 };

export type Bucket = 'hour' | 'day' | 'week' | 'month';

export interface Window { start: Date; end: Date; bucket: Bucket }

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** Pick a bucket size that gives a readable number of bars for the span. */
export function bucketFor(spanMs: number): Bucket {
  if (spanMs <= 2 * DAY) return 'hour';
  if (spanMs <= 45 * DAY) return 'day';
  if (spanMs <= 200 * DAY) return 'week';
  return 'month';
}

/**
 * The window for a range ending now. "Today" starts at midnight; the others count back whole days.
 * "All time" starts at the earliest arrival, so the chart is not mostly empty.
 */
export function windowFor(range: TimeRange, now: Date, earliest: Date | null): Window {
  const end = now;
  let start: Date;
  if (range === '1d') start = startOfDay(now);
  else if (range === 'all') start = startOfDay(earliest ?? now);
  else start = startOfDay(new Date(now.getTime() - (rangeDays[range] - 1) * DAY));
  return { start, end, bucket: bucketFor(end.getTime() - start.getTime()) };
}

/** The equally long window directly before, for "vs previous period" comparisons. */
export function previousWindow(window: Window): Window {
  const span = window.end.getTime() - window.start.getTime();
  return { start: new Date(window.start.getTime() - span), end: new Date(window.start), bucket: window.bucket };
}

export const inWindow = (at: Date, window: Window) => at >= window.start && at < window.end;

function floorTo(date: Date, bucket: Bucket): Date {
  const d = new Date(date);
  if (bucket === 'hour') { d.setMinutes(0, 0, 0); return d; }
  d.setHours(0, 0, 0, 0);
  if (bucket === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  if (bucket === 'month') d.setDate(1);
  return d;
}

function step(date: Date, bucket: Bucket): Date {
  const d = new Date(date);
  if (bucket === 'hour') d.setHours(d.getHours() + 1);
  else if (bucket === 'day') d.setDate(d.getDate() + 1);
  else if (bucket === 'week') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

/** ISO 8601 calendar week (weeks start Monday; week 1 contains the first Thursday). */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / DAY + 1) / 7);
}

/** Last moment of a bucket that starts at `start`, for labels like "12–18 Oct". */
export function bucketEnd(start: Date, bucket: Bucket): Date {
  return new Date(step(start, bucket).getTime() - 1);
}

export interface SeriesPoint { start: Date; counts: Record<Recommendation, number>; total: number }

/** Claims received per bucket, split by recommendation. Empty buckets are kept so gaps stay visible. */
export function receivedSeries(items: { at: Date; recommendation: Recommendation }[], window: Window): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (let t = floorTo(window.start, window.bucket); t < window.end; t = step(t, window.bucket)) {
    points.push({ start: t, counts: { routine_processing: 0, request_information: 0, human_review: 0 }, total: 0 });
  }
  for (const item of items) {
    if (!inWindow(item.at, window)) continue;
    const key = floorTo(item.at, window.bucket).getTime();
    const point = points.find(p => p.start.getTime() === key);
    if (!point) continue;
    point.counts[item.recommendation] += 1;
    point.total += 1;
  }
  return points;
}

/** Change between two values; rates are compared in percentage points. */
export interface Delta { value: number; kind: 'count' | 'pp' }

export function delta(current: number, previous: number | null, kind: Delta['kind']): Delta | null {
  if (previous === null) return null;
  return { value: kind === 'pp' ? Math.round((current - previous) * 100) : current - previous, kind };
}

/** Number of timestamps per bucket in the window, empty buckets included. */
export function countSeries(dates: Date[], window: Window): { start: Date; count: number }[] {
  const points: { start: Date; count: number }[] = [];
  for (let t = floorTo(window.start, window.bucket); t < window.end; t = step(t, window.bucket)) points.push({ start: t, count: 0 });
  for (const at of dates) {
    if (!inWindow(at, window)) continue;
    const point = points.find(p => p.start.getTime() === floorTo(at, window.bucket).getTime());
    if (point) point.count += 1;
  }
  return points;
}
