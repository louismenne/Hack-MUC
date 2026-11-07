import { describe, expect, it } from 'vitest';
import { parse } from 'csv-parse/sync';
import { bundledHistory, bundledV1, bundledV2 } from '../../../src/policy-engine/bundled';
import { reviewQuoteLimit, samePolicy } from '../../../src/policy-engine/reporting';
import { buildBuiltinDatasets, exportResultsCsv, officialComparison } from './datasets';
import { computeInsights } from '../../../src/insights';

const custom = structuredClone(bundledV2.rules);
custom.rules[0].when = { field: 'quote_eur', op: 'gt', value: 5000 };
const history = { original: bundledV1, previous: bundledV2, active: { label: 'experimental-v3', rules: custom } };

describe('policy reporting remains tied to the right versions', () => {
  it('uses actual rules, not a version name or JSON key order, to select labels', () => {
    const reordered = Object.fromEntries(Object.entries(bundledV2.rules).reverse()) as typeof custom;
    expect(samePolicy(reordered, bundledV2.rules)).toBe(true);
    expect(samePolicy(custom, bundledV2.rules)).toBe(false);
    const original = buildBuiltinDatasets({ ...bundledHistory, active: bundledV1 })[0];
    expect(original.cases.every(c => c.label === c.labelV1)).toBe(true);
    const experimental = buildBuiltinDatasets(history)[0];
    expect(experimental.cases.filter(c => !c.frozen).every(c => c.label === null)).toBe(true);
  });

  it('exports the official pair even with a custom active policy and v2 baseline', () => {
    const official = buildBuiltinDatasets(bundledHistory);
    const experimental = buildBuiltinDatasets(history);
    for (let i = 0; i < official.length; i++) {
      expect(exportResultsCsv(experimental[i])).toBe(exportResultsCsv(official[i]));
      expect(officialComparison(experimental[i])).toEqual(officialComparison(official[i]));
    }
    const rows = parse(exportResultsCsv(experimental[0]), { columns: true }) as Record<string, string>[];
    expect(rows.find(r => r.case_id === 'DEV-010')).toMatchObject({ recommendation_v1: 'routine_processing', recommendation_v2: 'human_review', needs_recheck: 'True' });
  });

  it('retains closed decisions across later activations', () => {
    const datasets = buildBuiltinDatasets(history);
    const closed = datasets.flatMap(d => d.cases).filter(c => c.frozen);
    expect(closed.length).toBeGreaterThan(0);
    for (const c of closed) {
      expect(c.needsRecheck).toBe(false);
      expect(c.decision).toEqual(c.baseline);
      expect(c.decision.ruleId).toMatch(/^v1\./);
    }
  });

  it('extracts an unconditional threshold and declines to invent one for complex policies', () => {
    expect(reviewQuoteLimit(bundledV1.rules)).toBe(1500);
    expect(reviewQuoteLimit(bundledV2.rules)).toBe(1200);
    expect(reviewQuoteLimit(custom)).toBe(5000);
    const complex = structuredClone(custom);
    complex.rules[0].when = { all: [custom.rules[0].when, { field: 'injury_reported', op: 'eq', value: true }] };
    expect(reviewQuoteLimit(complex)).toBeNull();
    complex.rules[0].when = { field: 'quote_eur', op: 'gte', value: 1200 };
    expect(reviewQuoteLimit(complex)).toBeNull();
  });

  it('uses the active threshold boundary and attributes EV battery review', () => {
    const items = buildBuiltinDatasets(bundledHistory).flatMap(d => d.cases).filter(c => !c.frozen);
    const input = items.map(c => ({ decision: c.decision, quote: c.claim.quote_eur as number | null, effective: c.decision.recommendation, reviewStatus: 'pending' as const }));
    const report = computeInsights(input, 1200);
    expect(report.limit).toBe(1200);
    expect(report.reviewTriggers.find(t => t.key === 'repair_type')?.count).toBeGreaterThan(0);
    const boundary = computeInsights([{ ...input[0], quote: 1200 }, { ...input[0], quote: 1200.01 }], 1200);
    expect(boundary.quoteBands.filter(b => !b.aboveLimit).reduce((n, b) => n + b.count, 0)).toBe(1);
    expect(boundary.quoteBands.filter(b => b.aboveLimit).reduce((n, b) => n + b.count, 0)).toBe(1);
    const unknown = computeInsights(input, null);
    expect(unknown.quoteBands.every(b => !b.aboveLimit)).toBe(true);
    expect(unknown.nearLimitBelow + unknown.nearLimitAbove).toBe(0);
  });
});
