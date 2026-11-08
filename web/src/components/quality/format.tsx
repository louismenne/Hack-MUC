import { bucketEnd, isoWeek, type Bucket, type Window } from '../../../../src/timeline';

const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export function formatWindow(window: Window): string {
  return `${dayFmt.format(window.start)} – ${dayFmt.format(window.end)} ${window.end.getFullYear()}`;
}

/** Short axis label: "14:00", "12 Oct", "CW 42", "Oct 26". */
export function bucketLabel(start: Date, bucket: Bucket): string {
  if (bucket === 'hour') return hourFmt.format(start);
  if (bucket === 'week') return `CW ${isoWeek(start)}`;
  if (bucket === 'month') return monthFmt.format(start);
  return dayFmt.format(start);
}

/** Full label for the tooltip: "CW 42 · 12–18 Oct 2026". */
export function bucketTitle(start: Date, bucket: Bucket): string {
  if (bucket === 'hour')
    return `${dayFmt.format(start)}, ${hourFmt.format(start)}–${hourFmt.format(new Date(start.getTime() + 3_600_000))}`;
  if (bucket === 'week')
    return `CW ${isoWeek(start)} · ${dayFmt.format(start)} – ${dayFmt.format(bucketEnd(start, bucket))} ${start.getFullYear()}`;
  if (bucket === 'month') return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(start);
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(
    start,
  );
}

export const bucketNames: Record<Bucket, string> = { hour: 'hour', day: 'day', week: 'calendar week', month: 'month' };

/** Whole-number y-axis ticks: 0, a middle tick when it is a whole number, and the top. */
export function axisTicks(max: number): number[] {
  const top = Math.max(1, max);
  const mid = top / 2;
  return top >= 2 && Number.isInteger(mid) ? [0, mid, top] : [0, top];
}

export const pct = (value: number) => `${Math.round(value * 100)}%`;
