import type { ReviewEvent } from './review.js';

export type MonitoringEvent = ReviewEvent & { decisionId: string; decisionSource: string; sequence: number };
export interface QualitySignal {
  key: string;
  policyVersion: string;
  ruleId: string;
  reviewed: number;
  overridden: number;
  rejected: number;
  rate: number;
  flagged: boolean;
  events: MonitoringEvent[];
}
export interface Investigation {
  id: string;
  title: string;
  findings: string;
  status: 'open' | 'closed';
  revision: number;
  created_by: string;
  created_at: string;
  evidence: MonitoringEvent[];
}

/** Latest state per saved decision, not number of clicks. A revert removes an override.
 * The window uses the latest review time; rates describe reviewed decisions only.
 */
export function qualitySignals(events: MonitoringEvent[], since: number, until: number, minimum = 5, threshold = 0.3): QualitySignal[] {
  const latest = new Map<string, MonitoringEvent>();
  for (const e of events) {
    if (e.decisionSource !== 'server_engine' || e.datasetId !== 'stored' || !e.decisionId || !Number.isFinite(Date.parse(e.at)) || Date.parse(e.at) > until) continue;
    const previous = latest.get(e.decisionId);
    if (!previous || e.sequence > previous.sequence) latest.set(e.decisionId, e);
  }
  const groups = new Map<string, QualitySignal>();
  for (const e of latest.values()) {
    if (Date.parse(e.at) < since) continue;
    const key = JSON.stringify([e.policyVersion, e.ruleId]);
    const group = groups.get(key) ?? { key, policyVersion: e.policyVersion, ruleId: e.ruleId, reviewed: 0, overridden: 0, rejected: 0, rate: 0, flagged: false, events: [] };
    group.reviewed++;
    if (e.action === 'rejected') group.rejected++;
    else if (e.next !== e.automated) group.overridden++;
    group.events.push(e);
    groups.set(key, group);
  }
  return [...groups.values()].map(g => ({ ...g, rate: g.overridden / g.reviewed, flagged: g.reviewed >= minimum && g.overridden / g.reviewed >= threshold }))
    .sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.rate - a.rate || a.key.localeCompare(b.key));
}
