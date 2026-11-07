import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { describe, expect, it } from 'vitest';
import { decideClaim, policyHistoryFrom, type PolicyDocument, type VersionLike } from '../src/policy-engine/index.js';
import { triageRows, toOutputRecord } from '../src/claims.js';
import { bundledHistory, policyV1, policyV2 } from './support/policies.js';

/**
 * The expectation in tests/fixtures/expected-decisions.json was frozen from the former hard-coded rules in
 * src/triage.ts BEFORE they were removed. The generic engine plus the policy JSON must reproduce it exactly.
 */
interface Expected {
  caseId: string; status: string; frozen: boolean; needsRecheck: boolean;
  v1: { recommendation: string; rule: string; missingFields: string[]; supportingFactFields: string[] };
  v2: { recommendation: string; rule: string; missingFields: string[]; supportingFactFields: string[] };
  effective: { recommendation: string; rule: string; policyVersion: string };
}
const fixture = JSON.parse(readFileSync(new URL('./fixtures/expected-decisions.json', import.meta.url), 'utf8')) as { cases: Expected[] };
const read = (name: string) => parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'), { columns: true }) as Record<string, string>[];
const rows = [...read('labelled_development_cases.csv'), ...read('unlabelled_practice_cases.csv')];
const rowOf = (id: string) => rows.find(r => r.case_id === id)!;
const rule = (id: string) => id.replace(/^[^.]+\./, '');
const factFields = (facts: string[]) => facts.map(f => /^([a-z_]+)=/.exec(f)?.[1]).filter(Boolean);

const version = (label: string, rules: PolicyDocument, status: VersionLike['status'], at: string): VersionLike => ({ versionLabel: label, rules, status, createdAt: at, activatedAt: at });
/** What Supabase holds now: v1 archived, official-v2 active (different labels than the bundled files). */
const supabaseLike = policyHistoryFrom([
  version('v1', policyV1.rules, 'archived', '2026-11-07T16:40:00Z'),
  version('official-v2', policyV2.rules, 'active', '2026-11-07T18:09:00Z'),
]);

describe('expected decisions for all 26 cases (frozen before the rules left the code)', () => {
  it('covers every participant case', () => {
    expect(fixture.cases).toHaveLength(26);
    expect(fixture.cases.map(c => c.caseId).sort()).toEqual(rows.map(r => r.case_id).sort());
  });

  describe.each([['policies/*.rules.json (CLI, tests)', bundledHistory, ''], ['active version from Supabase (official-v2)', supabaseLike, 'official-']] as const)('%s', (_name, history, prefix) => {
    it.each(fixture.cases)('$caseId', expected => {
      const out = decideClaim(rowOf(expected.caseId), history);
      // v1 = decision before the change, v2 = decision in force (open: v2, closed: frozen v1)
      expect(out.baseline.recommendation).toBe(expected.v1.recommendation);
      expect(rule(out.baseline.ruleId)).toBe(expected.v1.rule);
      expect(out.baseline.missingFields).toEqual(expected.v1.missingFields);
      expect(out.decision.recommendation).toBe(expected.v2.recommendation);
      expect(rule(out.decision.ruleId)).toBe(expected.v2.rule);
      expect(out.decision.missingFields).toEqual(expected.v2.missingFields);
      expect(out.needsRecheck).toBe(expected.needsRecheck);
      expect(out.frozen).toBe(expected.frozen);
      // what the review queue shows
      expect(out.decision.recommendation).toBe(expected.effective.recommendation);
      expect(out.decision.policyVersion).toBe(expected.frozen ? 'v1' : `${prefix}v2`);
      // the facts that fired the rule name the same fields as before (rules 1 and 2)
      if (expected.v2.rule === 'rule1' || expected.v2.rule === 'rule2') expect(factFields(out.decision.supportingFacts).sort()).toEqual([...expected.v2.supportingFactFields].sort());
    });
  });

  it('marks exactly the six changed open cases for recheck and freezes the two closed ones', () => {
    const out = rows.map(r => ({ id: r.case_id, ...decideClaim(r, supabaseLike) }));
    expect(out.filter(o => o.needsRecheck).map(o => o.id)).toEqual(['DEV-010', 'DEV-011', 'PRA-003', 'PRA-004', 'PRA-005', 'PRA-006']);
    expect(out.filter(o => o.frozen).map(o => o.id)).toEqual(['PRA-009', 'PRA-010']);
    expect(out.filter(o => o.frozen).every(o => !o.needsRecheck && o.decision.policyVersion === 'v1')).toBe(true);
  });

  it('the batch result used by the review UI and the CLI agrees (decision = before, current = in force)', () => {
    for (const item of triageRows(rows, supabaseLike)) {
      const expected = fixture.cases.find(c => c.caseId === item.decision.caseId)!;
      expect(item.decision.recommendation).toBe(expected.v1.recommendation);
      expect(item.current.recommendation).toBe(expected.v2.recommendation);
      expect(item.needsRecheck).toBe(expected.needsRecheck);
      expect(item.frozen).toBe(expected.frozen);
    }
  });
});

describe('freezing closed claims holds for future versions', () => {
  // v3 (experiment): lower the limit to 500 and require nothing else to change
  const v3Rules = structuredClone(policyV2.rules) as PolicyDocument;
  (v3Rules.rules[0].when as { any: { field: string; value?: unknown }[] }).any.find(l => l.field === 'quote_eur')!.value = 500;
  const withV3 = policyHistoryFrom([
    version('v1', policyV1.rules, 'archived', '2026-11-07T16:00:00Z'),
    version('official-v2', policyV2.rules, 'archived', '2026-11-07T18:00:00Z'),
    version('v3', v3Rules, 'active', '2026-11-07T19:00:00Z'),
  ]);

  it('closed claims keep the ORIGINAL decision, with no recheck, whatever version is active', () => {
    expect(withV3.original.label).toBe('v1');
    expect(withV3.previous.label).toBe('official-v2');
    expect(withV3.active.label).toBe('v3');
    for (const id of ['PRA-009', 'PRA-010']) {
      const out = decideClaim(rowOf(id), withV3);
      expect(out.frozen).toBe(true);
      expect(out.needsRecheck).toBe(false);
      expect(out.decision.policyVersion).toBe('v1');
      expect(out.decision.recommendation).toBe('routine_processing');
    }
  });
  it('open claims follow v3 and are rechecked against the previous version (v2)', () => {
    const out = decideClaim(rowOf('DEV-001'), withV3); // 650 EUR: routine under v1/v2, above the new 500 limit
    expect(out.decision.policyVersion).toBe('v3');
    expect(out.baseline.policyVersion).toBe('official-v2');
    expect(out.decision.recommendation).toBe('human_review');
    expect(out.needsRecheck).toBe(true);
  });
  it('drafts never take part, and a missing active version is an error', () => {
    const draftOnly = [version('v1', policyV1.rules, 'archived', '2026-11-07T16:00:00Z'), { ...version('x', v3Rules, 'draft', '2026-11-07T20:00:00Z'), activatedAt: null }];
    expect(() => policyHistoryFrom(draftOnly)).toThrow(/no active/i);
    const withDraft = policyHistoryFrom([...withV3 ? [version('v1', policyV1.rules, 'archived', '2026-11-07T16:00:00Z'), version('official-v2', policyV2.rules, 'active', '2026-11-07T18:00:00Z')] : [], { ...version('d', v3Rules, 'draft', '2026-11-07T20:00:00Z'), activatedAt: null }]);
    expect(withDraft.active.label).toBe('official-v2');
  });
  it('with only one version nothing needs a recheck', () => {
    const only = policyHistoryFrom([version('v1', policyV1.rules, 'active', '2026-11-07T16:00:00Z')]);
    expect(rows.some(r => decideClaim(r, only).needsRecheck)).toBe(false);
  });
});

describe('CLI output is unchanged by the refactor (no database, policies/*.rules.json)', () => {
  const cli = (file: string) => parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'), { columns: true }) as Record<string, string>[];
  it.each([['cli-before-labelled.csv', 'labelled_development_cases.csv'], ['cli-before-practice.csv', 'unlabelled_practice_cases.csv']])('%s', (fixtureFile, data) => {
    const before = cli(fixtureFile);
    const after = triageRows(read(data)).map(toOutputRecord);
    expect(after.map(r => Object.keys(r))).toEqual(before.map(r => Object.keys(r)));
    for (const [i, row] of after.entries()) {
      // everything the judges' script reads is identical; only the free-text explanation is worded by the engine now
      for (const key of ['case_id', 'recommendation_v1', 'recommendation_v2', 'needs_recheck', 'rule_v1', 'rule_v2']) expect(row[key], `${row.case_id} ${key}`).toBe(before[i][key]);
      expect(row.explanation.startsWith('Closed claim') === before[i].explanation.startsWith('Closed claim')).toBe(true);
    }
  });
});
