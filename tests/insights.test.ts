import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { describe, expect, it } from 'vitest';
import { triageRows } from '../src/claims.js';
import { computeInsights, quoteBandIndex, suggestedActions, type InsightCase } from '../src/insights.js';
import { policyV1 } from '../src/triage.js';

const load = (name: string): InsightCase[] => {
  const rows = parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'), { columns: true }) as Record<string, string>[];
  return triageRows(rows).map(({ decision, claim }) => ({
    decision,
    quote: typeof claim.quote_eur === 'number' ? claim.quote_eur : null,
    quoteLimit: policyV1.routineQuoteLimitEur,
    effective: decision.recommendation,
    reviewStatus: 'pending',
  }));
};

const development = load('labelled_development_cases.csv');
const practice = load('unlabelled_practice_cases.csv');

describe('computeInsights on development cases', () => {
  const insights = computeInsights(development);

  it('counts the recommendation mix', () => {
    expect(insights.total).toBe(14);
    expect(insights.mix).toEqual({ routine_processing: 3, request_information: 3, human_review: 8 });
    expect(insights.rates.human_review).toBeCloseTo(8 / 14);
  });

  it('attributes each human review to its policy trigger', () => {
    const byKey = Object.fromEntries(insights.reviewTriggers.map(({ key, count }) => [key, count]));
    expect(byKey).toEqual({
      quote_above_limit: 1, policy_inactive: 1, injury: 2, liability_disputed: 1,
      duplicate: 1, evidence_conflict: 1, not_motor_own_damage: 1,
    });
  });

  it('lists what was missing when information was requested', () => {
    const byKey = Object.fromEntries(insights.infoGaps.map(({ key, count }) => [key, count]));
    expect(byKey).toEqual({ 'incident_report_present:absent': 1, 'itemized_quote_present:absent': 1, 'quote_eur:blank': 1 });
    expect(insights.casesWithBlankFields).toBe(2);
  });

  it('puts a quote of exactly the limit below it', () => {
    const band = insights.quoteBands.find(b => b.label === 'Just below')!;
    expect(band.count).toBe(1);
    expect(band.aboveLimit).toBe(false);
    expect(insights.quoteBands.find(b => b.label === 'Just above')!.count).toBe(1);
    expect(insights.unknownQuotes).toBe(1);
    expect(insights.quoteBands.reduce((sum, b) => sum + b.count, 0) + insights.unknownQuotes).toBe(14);
  });

  it('counts the open review queue and overrides', () => {
    expect(insights.workload).toEqual({ reviewQueue: 8, reviewed: 0, overridden: 0, overrideRate: null });
    const withOverride = computeInsights(development.map((item, i) => i === 0 ? { ...item, effective: 'human_review', reviewStatus: 'overridden' } : item));
    expect(withOverride.workload.overridden).toBe(1);
    expect(withOverride.overridesByRule).toEqual([{ key: 'v1.rule3', count: 1 }]);
  });
});

describe('quoteBandIndex', () => {
  it('measures each quote against its own policy limit', () => {
    expect(quoteBandIndex(1500, 1500)).toBe(2);
    expect(quoteBandIndex(1501, 1500)).toBe(3);
    expect(quoteBandIndex(1500, 2000)).toBe(1); // a higher v2 limit moves the same quote down
    expect(quoteBandIndex(3000, 2000)).toBe(4);
    expect(quoteBandIndex(100, 1500)).toBe(0);
  });
});

describe('suggestedActions', () => {
  it('flags incorrect routine processing as critical first', () => {
    const actions = suggestedActions(computeInsights(development), { labelled: 14, incorrectRoutine: 1 });
    expect(actions[0]).toMatchObject({ id: 'incorrect-routine', severity: 'critical' });
  });

  it('suggests upload guidance when many claims need information', () => {
    const actions = suggestedActions(computeInsights(practice));
    expect(actions.map(a => a.id)).toContain('info-gaps');
    expect(actions.map(a => a.id)).toContain('near-limit');
  });

  it('returns nothing for an empty dataset', () => {
    expect(suggestedActions(computeInsights([]))).toEqual([]);
  });
});
