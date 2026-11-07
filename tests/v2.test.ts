import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { describe, expect, it } from 'vitest';
import { compareOfficialPolicies, evaluateV2, parseClaim } from '../src/triage.js';
import { triageCsv } from '../src/batch.js';
import { PolicyStore } from '../src/server/store.js';
const read = (name: string) => parse(readFileSync(`data/${name}`, 'utf8'), { columns: true }) as Record<string,string>[];
const dev = read('labelled_development_cases.csv');
const expectations = read('development_v2_expectations.csv');
const base = dev[0];
describe('official v2 notice', () => {
  it.each(expectations)('$case_id matches independently recorded v2 expectation', expected => {
    const row = dev.find(r => r.case_id === expected.case_id)!;
    expect(evaluateV2(parseClaim(row)).recommendation).toBe(expected.expected_v2);
  });
  it.each([['1200', 'routine_processing'], ['1200.01', 'human_review'], ['1201', 'human_review']])('strict quote boundary %s', (quote_eur, recommendation) => {
    expect(evaluateV2(parseClaim({ ...base, quote_eur })).recommendation).toBe(recommendation);
  });
  it.each(['False', '', 'unreadable'])('battery review precedes missing document %s', itemized_quote_present => {
    const result = evaluateV2(parseClaim({ ...base, repair_type: 'ev_high_voltage_battery', quote_eur: '', itemized_quote_present }));
    expect(result.recommendation).toBe('human_review');
    expect(result.supportingFacts).toContain('repair_type=ev_high_voltage_battery');
  });
  it('all open claims use v2; only changed open outcomes need recheck', () => {
    for (const row of dev) {
      const result = compareOfficialPolicies(parseClaim(row));
      expect(result.v2.policyVersion).toBe('v2');
      expect(result.needsRecheck).toBe(['DEV-010', 'DEV-011'].includes(row.case_id));
    }
  });
  it('retains an explicitly supplied historical decision for closed claims', () => {
    const claim = parseClaim({ ...base, case_status: 'closed', repair_type: 'ev_high_voltage_battery' });
    const baseline = compareOfficialPolicies(claim).v1;
    const result = compareOfficialPolicies(claim, baseline);
    expect(result.v2).toBe(baseline); expect(result.needsRecheck).toBe(false);
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
  it('migrates existing experimental versions without overwriting their history', () => {
    const s = new PolicyStore(':memory:', read('unlabelled_practice_cases.csv'));
    try {
      const original = s.claims().filter(c => c.facts.case_status === 'closed');
      s.installOfficialV2(); s.installOfficialV2();
      expect(s.active().id).toBe('official-v2'); expect(s.history()).toHaveLength(1);
      expect(s.claims().filter(c => c.facts.case_status === 'closed')).toEqual(original);
      expect(s.claims().find(c => c.caseId === 'PRA-006')?.current.recommendation).toBe('human_review');
    } finally { s.close(); }
  });
});

describe('Supabase JSON policy alignment', () => {
  it('validates official JSON and matches the typed engine on all participant cases', async () => {
    const { validatePolicy, evaluatePolicyDocument } = await import('../src/policy-engine/index.js');
    const parsed = validatePolicy(JSON.parse(readFileSync('policies/policy-v2.rules.json', 'utf8')));
    expect(parsed.ok).toBe(true); if (!parsed.ok) return;
    for (const row of [...dev, ...read('unlabelled_practice_cases.csv')]) {
      expect(evaluatePolicyDocument(parsed.policy, 'v2', row).recommendation).toBe(evaluateV2(parseClaim(row)).recommendation);
    }
    const sql = readFileSync('supabase/migrations/20261107183000_official_policy_v2.sql', 'utf8');
    const seed = sql.split('$official_v2$')[1];
    expect(JSON.parse(seed)).toEqual(parsed.policy);
  });
  it('Supabase impact retains closed v1 decisions even when the active policy is already v2', async () => {
    const { computeImpact } = await import('../src/policy-api/impact.js');
    const rules = JSON.parse(readFileSync('policies/policy-v2.rules.json', 'utf8'));
    const version = { id: 'base', versionLabel: 'v2', rules, status: 'active' as const, changeSummary: null, source: 'seed' as const, parentVersionId: null, createdBy: 'Organizer', createdAt: '', activatedAt: '' };
    const impact = computeImpact(version, { ...version, id: 'draft', versionLabel: 'v3', status: 'draft' }, read('unlabelled_practice_cases.csv'));
    for (const id of ['PRA-009', 'PRA-010']) {
      const r = impact.rows.find(r => r.caseId === id)!;
      expect(r.before).toEqual({ recommendation: 'routine_processing', ruleId: 'v1.rule3' });
      expect(r.after).toEqual(r.before); expect(r.needsRecheck).toBe(false);
    }
  });
});
