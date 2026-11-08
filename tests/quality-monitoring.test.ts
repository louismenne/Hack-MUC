import { describe, expect, it } from 'vitest';
import { qualitySignals, type MonitoringEvent } from '../src/quality-monitoring.js';
const now = Date.parse('2026-11-08T12:00:00Z');
const event = (patch: Partial<MonitoringEvent> = {}): MonitoringEvent => ({
  id: 'event', decisionId: 'decision', decisionSource: 'server_engine', sequence: 1, at: '2026-11-08T10:00:00Z',
  datasetId: 'stored', caseId: 'case', action: 'overridden', reviewer: 'reviewer', reason: 'Evidence checked',
  policyVersion: 'v1', ruleId: 'v1.rule1', automated: 'human_review', previous: 'human_review', next: 'routine_processing', ...patch,
});
describe('quality monitoring signals', () => {
  it('counts decisions, not clicks, and removes reverted overrides regardless of input order', () => {
    const result = qualitySignals([event({ sequence: 3, action: 'reverted', next: 'human_review' }), event(), event({ sequence: 2 })], 0, now, 1, .3);
    expect(result[0]).toMatchObject({ reviewed: 1, overridden: 0, flagged: false });
  });
  it('requires minimum evidence and exact threshold; policies remain separate', () => {
    const events = Array.from({ length: 5 }, (_, i) => event({ decisionId: String(i), next: i < 2 ? 'routine_processing' : 'human_review' }));
    expect(qualitySignals(events, 0, now, 5, .4)[0]).toMatchObject({ reviewed: 5, overridden: 2, rate: .4, flagged: true });
    expect(qualitySignals(events, 0, now, 6, .4)[0].flagged).toBe(false);
    expect(qualitySignals([...events, event({ decisionId: 'new', policyVersion: 'v2' })], 0, now)).toHaveLength(2);
  });
  it('excludes legacy, missing-ID, out-of-window and future events', () => {
    expect(qualitySignals([event({ decisionSource: 'client_snapshot' }), event({ decisionId: '' }), event({ datasetId: 'development' }), event({ at: '2026-10-01T10:00:00Z' }), event({ at: '2026-11-09T10:00:00Z' })], now - 86400000, now)).toEqual([]);
  });
  it('keeps rejections separate from recommendation corrections', () => {
    expect(qualitySignals([event({ action: 'rejected' })], 0, now, 1)[0]).toMatchObject({ reviewed: 1, overridden: 0, rejected: 1, flagged: false });
  });
});
