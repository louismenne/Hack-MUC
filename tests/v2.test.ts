import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { describe, expect, it } from 'vitest';
import { decideClaim } from '../src/policy-engine/index.js';
import { bundledHistory, decideV2 } from './support/policies.js';
import { triageCsv } from '../src/batch.js';
const read = (name: string) => parse(readFileSync(`data/${name}`, 'utf8'), { columns: true }) as Record<string,string>[];
const dev = read('labelled_development_cases.csv');
const expectations = read('development_v2_expectations.csv');
const base = dev[0];
describe('official v2 notice', () => {
  it.each(expectations)('$case_id matches independently recorded v2 expectation', expected => {
    const row = dev.find(r => r.case_id === expected.case_id)!;
    expect(decideV2(row).recommendation).toBe(expected.expected_v2);
  });
  it.each([['1200', 'routine_processing'], ['1200.01', 'human_review'], ['1201', 'human_review']])('strict quote boundary %s', (quote_eur, recommendation) => {
    expect(decideV2({ ...base, quote_eur }).recommendation).toBe(recommendation);
  });
  it.each(['False', '', 'unreadable'])('battery review precedes missing document %s', itemized_quote_present => {
    const result = decideV2({ ...base, repair_type: 'ev_high_voltage_battery', quote_eur: '', itemized_quote_present });
    expect(result.recommendation).toBe('human_review');
    expect(result.supportingFacts).toContain('repair_type=ev_high_voltage_battery');
  });
  it('all open claims use v2; only changed open outcomes need recheck', () => {
    for (const row of dev) {
      const result = decideClaim(row, bundledHistory);
      expect(result.decision.policyVersion).toBe('v2');
      expect(result.needsRecheck).toBe(['DEV-010', 'DEV-011'].includes(row.case_id));
    }
  });
  it('a closed claim keeps its original (v1) decision and is never rechecked', () => {
    const result = decideClaim({ ...base, case_status: 'closed', repair_type: 'ev_high_voltage_battery' }, bundledHistory);
    expect(result.frozen).toBe(true);
    expect(result.decision.policyVersion).toBe('v1');
    expect(result.decision).toEqual(result.baseline);
    expect(result.decision.recommendation).toBe('routine_processing'); // v2 would send EV battery work to human review
    expect(result.needsRecheck).toBe(false);
  });
  it('exports exactly the seven required columns and both closed cases retain v1', () => {
    const rows = parse(triageCsv(readFileSync('data/unlabelled_practice_cases.csv', 'utf8')), { columns: true }) as Record<string,string>[];
    expect(Object.keys(rows[0])).toEqual(['case_id', 'recommendation_v1', 'recommendation_v2', 'needs_recheck', 'rule_v1', 'rule_v2', 'explanation']);
    for (const id of ['PRA-009', 'PRA-010']) {
      const r = rows.find(r => r.case_id === id)!;
      expect(r.recommendation_v2).toBe(r.recommendation_v1); expect(r.rule_v2).toBe(r.rule_v1); expect(r.needs_recheck).toBe('False');
    }
    expect(rows.filter(r => r.needs_recheck === 'True').map(r => r.case_id)).toEqual(['PRA-003', 'PRA-004', 'PRA-005', 'PRA-006']);
  });

});

describe('Supabase JSON policy alignment', () => {
  it('validates official JSON and matches the typed engine on all participant cases', async () => {
    const { validatePolicy, evaluatePolicyDocument } = await import('../src/policy-engine/index.js');
    const parsed = validatePolicy(JSON.parse(readFileSync('policies/policy-v2.rules.json', 'utf8')));
    expect(parsed.ok).toBe(true); if (!parsed.ok) return;
    for (const row of [...dev, ...read('unlabelled_practice_cases.csv')]) {
      expect(evaluatePolicyDocument(parsed.policy, 'v2', row).recommendation).toBe(decideV2(row).recommendation);
    }
    const sql = readFileSync('supabase/migrations/20261107183000_official_policy_v2.sql', 'utf8');
    const seed = sql.split('$official_v2$')[1];
    expect(JSON.parse(seed)).toEqual(parsed.policy);
  });
  it('Supabase impact retains closed v1 decisions even when the active policy is already v2', async () => {
    const { computeImpact } = await import('../src/policy-api/impact.js');
    const rules = JSON.parse(readFileSync('policies/policy-v2.rules.json', 'utf8'));
    const version = { revision: 0, id: 'base', versionLabel: 'v2', rules, status: 'active' as const, changeSummary: null, source: 'seed' as const, parentVersionId: null, createdBy: 'Organizer', createdAt: '', activatedAt: '' };
    const original = { ...version, id: 'orig', versionLabel: 'v1', rules: JSON.parse(readFileSync('policies/policy-v1.rules.json', 'utf8')), status: 'archived' as const };
    const impact = computeImpact(version, { ...version, id: 'draft', versionLabel: 'v3', status: 'draft' }, read('unlabelled_practice_cases.csv'), original);
    for (const id of ['PRA-009', 'PRA-010']) {
      const r = impact.rows.find(r => r.caseId === id)!;
      expect(r.before).toEqual({ recommendation: 'routine_processing', ruleId: 'v1.rule3' });
      expect(r.after).toEqual(r.before); expect(r.needsRecheck).toBe(false);
    }
  });
});
