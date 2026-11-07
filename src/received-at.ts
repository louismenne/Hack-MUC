/**
 * MOCK DATA — the participant CSVs carry no submission timestamps.
 * For the demo every development case gets a fixed, simulated `received_at` (Europe/Berlin),
 * keeping the arrival order of the case IDs (DEV-001 = oldest). Arrivals are deliberately
 * irregular: long quiet stretches early on, some days with two claims at different times.
 *
 * Timeline agreed with the team:
 * - Policy v1 cases (DEV-001 … DEV-014): 22 Jul 2026 → 24 Oct 2026.
 * - From 25 Oct 2026 onwards the timeline is reserved for policy v2 cases.
 *
 * A real `received_at` column in an uploaded CSV always takes precedence over this table.
 */
export const mockArrivals: Record<string, string> = {
  'DEV-001': '2026-07-22T09:12:00+02:00',
  'DEV-002': '2026-08-21T14:47:00+02:00',
  'DEV-003': '2026-09-09T10:05:00+02:00',
  'DEV-004': '2026-09-17T11:31:00+02:00',
  'DEV-005': '2026-09-28T08:54:00+02:00',
  'DEV-006': '2026-09-28T16:22:00+02:00',
  'DEV-007': '2026-10-06T11:40:00+02:00',
  'DEV-008': '2026-10-12T09:03:00+02:00',
  'DEV-009': '2026-10-15T13:18:00+02:00',
  'DEV-010': '2026-10-15T15:51:00+02:00',
  'DEV-011': '2026-10-19T10:07:00+02:00',
  'DEV-012': '2026-10-21T12:36:00+02:00',
  'DEV-013': '2026-10-22T09:45:00+02:00',
  'DEV-014': '2026-10-24T08:20:00+02:00',
};

/** First day of the period reserved for policy v2 cases. */
export const V2_PERIOD_START = '2026-10-25T00:00:00+02:00';

export interface ReceivedAt { at: Date; simulated: boolean }

/** Real timestamp from the CSV if present and valid, otherwise the mock arrival, otherwise unknown. */
export function receivedAt(caseId: string, raw: string | undefined): ReceivedAt | null {
  const real = raw?.trim() ? new Date(raw.trim()) : null;
  if (real && !Number.isNaN(real.getTime())) return { at: real, simulated: false };
  const mock = mockArrivals[caseId];
  return mock ? { at: new Date(mock), simulated: true } : null;
}

/** Whole calendar days between arrival and now, for "open since" labels. */
export function daysOpen(at: Date, now: Date = new Date()): number {
  const start = new Date(at); start.setHours(0, 0, 0, 0);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - start.getTime()) / 86_400_000);
}
