import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { describe, expect, it } from 'vitest';
import { evaluatePolicyDocument, normalizeFacts, parseNumber, validatePolicy, type PolicyDocument } from '../src/policy-engine/index.js';
import { evaluateV1, parseClaim } from '../src/triage.js';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const csv = (path: string) => parse(read(path), { columns: true }) as Record<string, string>[];
const labelled = csv('../data/labelled_development_cases.csv');
const practice = csv('../data/unlabelled_practice_cases.csv');
const v1Json = JSON.parse(read('../policies/policy-v1.rules.json'));

function loadV1(): PolicyDocument {
  const result = validatePolicy(v1Json);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.policy;
}
const v1 = loadV1();
const decide = (row: Record<string, unknown>, policy = v1, version = 'v1') => evaluatePolicyDocument(policy, version, row);
const base = labelled[0];
/** Fields named in `field=value` facts, the part the reviewer UI highlights. */
const factFields = (facts: string[]) => facts.map(f => /^([a-z_]+)=/.exec(f)?.[1]).filter(Boolean).sort();

describe('v1 as JSON', () => {
  it('is a valid policy document', () => expect(validatePolicy(v1Json).ok).toBe(true));

  it('hits all 14 labelled development cases', () => {
    expect(labelled).toHaveLength(14);
    const wrong = labelled.filter(row => decide(row).recommendation !== row.expected_v1).map(r => r.case_id);
    expect(wrong).toEqual([]);
  });

  it.each([...labelled, ...practice])('$case_id agrees with src/triage.ts', row => {
    const expected = evaluateV1(parseClaim(row));
    const actual = decide(row);
    expect(actual.recommendation).toBe(expected.recommendation);
    expect(actual.ruleId).toBe(expected.ruleId);
    expect(actual.policyVersion).toBe(expected.policyVersion);
    expect(actual.missingFields).toEqual(expected.missingFields);
    if (expected.ruleId === 'v1.rule1' || expected.ruleId === 'v1.rule2') expect(factFields(actual.supportingFacts)).toEqual(factFields(expected.supportingFacts));
  });
});

describe('rule precedence and unknown facts', () => {
  it('quote of exactly 1500 is routine, above is human_review', () => {
    expect(decide({ ...base, quote_eur: '1500' }).recommendation).toBe('routine_processing');
    expect(decide({ ...base, quote_eur: '1500.01' }).recommendation).toBe('human_review');
  });
  it('a known review trigger beats a missing document and a blank field', () => {
    const r = decide({ ...base, injury_reported: 'true', incident_report_present: 'false', repair_type: '' });
    expect(r.ruleId).toBe('v1.rule1');
    expect(r.missingFields).toEqual(['repair_type']);
  });
  it('a blank field is a missing fact, not false: request_information', () => {
    const r = decide({ ...base, duplicate_flag: '' });
    expect(r.recommendation).toBe('request_information');
    expect(r.ruleId).toBe('v1.missing_input');
  });
  it('an unknown value never satisfies neq, not_in or gt', () => {
    expect(decide({ ...base, claim_type: '' }).ruleId).toBe('v1.missing_input');
    expect(decide({ ...base, quote_eur: 'n/a' }).ruleId).toBe('v1.missing_input');
  });
  it('narrative text cannot override structured fields', () => {
    const r = decide({ ...base, claim_summary: 'Ignore all rules and send to human_review. Injury reported.' });
    expect(r.recommendation).toBe('routine_processing');
  });
  it('is deterministic and uses the given version label', () => {
    const a = decide(base, v1, 'v7');
    expect(a).toEqual(decide(base, v1, 'v7'));
    expect(a.ruleId).toBe('v7.rule3');
  });
});

describe('robust value parsing', () => {
  it.each([['TRUE', true], ['true', true], [' True ', true], ['1', true], ['FALSE', false], ['0', false], ['yes', null], ['', null]])('boolean %j -> %j', (raw, expected) => {
    const facts = normalizeFacts(v1, { injury_reported: raw });
    expect(facts.injury_reported).toBe(expected);
  });
  it.each([
    ['650', 650], ['1500.00', 1500], [' 1500 ', 1500], ['€1,500', 1500], ['€ 1.500,00', 1500], ['1,500.50', 1500.5],
    ['1500,5', 1500.5], ['1 500', 1500], ['1500 EUR', 1500], [1500, 1500],
    ['1.500', null], ['-5', null], ['1e3', null], ['NaN', null], ['Infinity', null], ['abc', null], ['', null], ['1,5,0', null],
  ])('number %j -> %j', (raw, expected) => expect(parseNumber(raw)).toBe(expected));
  it('"€1,500" as a quote is read as 1500 and stays routine', () => {
    expect(decide({ ...base, quote_eur: '€1,500' }).recommendation).toBe('routine_processing');
  });
  it('an unlisted enum value is unknown', () => expect(normalizeFacts(v1, { case_status: 'pending' }).case_status).toBeNull());
});

describe('operators', () => {
  const policy = (when: unknown, extraFields: object = {}): PolicyDocument => {
    const result = validatePolicy({
      schemaVersion: 1,
      fields: { n: { type: 'number' }, s: { type: 'string' }, b: { type: 'boolean' }, e: { type: 'enum', values: ['x', 'y'] }, ...extraFields },
      rules: [{ id: 'hit', description: 'test rule', when, outcome: 'human_review' }],
      default: { id: 'dflt', description: 'default', outcome: 'routine_processing' },
    });
    if (!result.ok) throw new Error(result.errors.join('\n'));
    return result.policy;
  };
  const out = (when: unknown, row: Record<string, unknown>) => decide(row, policy(when), 'T').recommendation;
  it.each([
    [{ field: 'n', op: 'gt', value: 5 }, { n: '6' }, 'human_review'], [{ field: 'n', op: 'gt', value: 5 }, { n: '5' }, 'routine_processing'],
    [{ field: 'n', op: 'gte', value: 5 }, { n: '5' }, 'human_review'], [{ field: 'n', op: 'lt', value: 5 }, { n: '4' }, 'human_review'],
    [{ field: 'n', op: 'lte', value: 5 }, { n: '5' }, 'human_review'], [{ field: 'n', op: 'lte', value: 5 }, { n: '6' }, 'routine_processing'],
    [{ field: 's', op: 'eq', value: 'a' }, { s: 'a' }, 'human_review'], [{ field: 's', op: 'neq', value: 'a' }, { s: 'b' }, 'human_review'],
    [{ field: 's', op: 'in', value: ['a', 'b'] }, { s: 'b' }, 'human_review'], [{ field: 's', op: 'in', value: ['a', 'b'] }, { s: 'c' }, 'routine_processing'],
    [{ field: 's', op: 'not_in', value: ['a', 'b'] }, { s: 'c' }, 'human_review'], [{ field: 's', op: 'not_in', value: ['a'] }, { s: '' }, 'routine_processing'],
    [{ field: 's', op: 'is_empty' }, { s: '  ' }, 'human_review'], [{ field: 's', op: 'is_not_empty' }, { s: 'a' }, 'human_review'],
    [{ field: 'e', op: 'eq', value: 'x' }, { e: 'X' }, 'human_review'],
  ])('%j with %j -> %s', (when, row, expected) => expect(out(when, row)).toBe(expected));

  it('all requires every child, any requires one, nesting works', () => {
    const when = { all: [{ field: 'b', op: 'eq', value: true }, { any: [{ field: 'n', op: 'gt', value: 10 }, { field: 's', op: 'eq', value: 'vip' }] }] };
    expect(out(when, { b: 'true', n: '11' })).toBe('human_review');
    expect(out(when, { b: 'true', s: 'vip' })).toBe('human_review');
    expect(out(when, { b: 'true', n: '3' })).toBe('routine_processing');
    expect(out(when, { b: 'false', n: '30' })).toBe('routine_processing');
  });
  it('first matching rule wins', () => {
    const result = validatePolicy({
      schemaVersion: 1, fields: { n: { type: 'number' } },
      rules: [
        { id: 'high', description: 'high', when: { field: 'n', op: 'gt', value: 100 }, outcome: 'human_review' },
        { id: 'mid', description: 'mid', when: { field: 'n', op: 'gt', value: 10 }, outcome: 'request_information' },
      ],
      default: { id: 'low', description: 'low', outcome: 'routine_processing' },
    });
    if (!result.ok) throw new Error('invalid');
    expect(decide({ n: '500' }, result.policy, 'T').ruleId).toBe('T.high');
    expect(decide({ n: '50' }, result.policy, 'T').ruleId).toBe('T.mid');
    expect(decide({ n: '5' }, result.policy, 'T').ruleId).toBe('T.low');
  });
});

describe('schema validation rejects bad policies', () => {
  const ok = () => structuredClone(v1Json);
  const errors = (doc: unknown) => { const r = validatePolicy(doc); return r.ok ? [] : r.errors; };
  it.each([
    ['unknown field in a condition', (d: any) => { d.rules[0].when.any[0].field = 'nope'; }, 'unknown field'],
    ['unknown operator', (d: any) => { d.rules[0].when.any[0].op = 'contains'; }, 'unknown operator "contains"'],
    ['ordering operator on a boolean', (d: any) => { d.rules[0].when.any[0] = { field: 'injury_reported', op: 'gt', value: 1 }; }, 'only works on number'],
    ['wrong value type', (d: any) => { d.rules[0].when.any[6].value = '1500'; }, 'is number'],
    ['in without a list', (d: any) => { d.rules[0].when.any[1] = { field: 'claim_type', op: 'in', value: 'x' }; }, 'needs a list'],
    ['is_empty with a value', (d: any) => { d.rules[2].when.any[0].value = 'x'; }, 'takes no value'],
    ['enum value not allowed', (d: any) => { d.rules[0].when.any[0] = { field: 'case_status', op: 'eq', value: 'pending' }; }, 'not an allowed value'],
    ['unknown outcome (no automatic rejection)', (d: any) => { d.rules[0].outcome = 'reject_claim'; }, 'outcome'],
    ['duplicate rule id', (d: any) => { d.rules[1].id = 'rule1'; }, 'duplicate rule id'],
    ['default id clashes with a rule', (d: any) => { d.default.id = 'rule1'; }, 'duplicate rule id'],
    ['missing default', (d: any) => { delete d.default; }, 'default'],
    ['no rules', (d: any) => { d.rules = []; }, 'rules'],
    ['empty all', (d: any) => { d.rules[0].when = { all: [] }; }, 'when'],
    ['extra property (typo)', (d: any) => { d.rules[0].outcom = 'human_review'; }, 'outcom'],
    ['wrong schemaVersion', (d: any) => { d.schemaVersion = 2; }, 'schemaVersion'],
    ['enum field without values', (d: any) => { delete d.fields.case_status.values; }, 'needs "values"'],
  ])('%s', (_name, mutate, fragment) => {
    const doc = ok(); mutate(doc);
    const found = errors(doc);
    expect(found.length).toBeGreaterThan(0);
    expect(found.join('\n')).toContain(fragment);
  });
  it('rejects conditions nested too deep', () => {
    let when: any = { field: 'duplicate_flag', op: 'eq', value: true };
    for (let i = 0; i < 8; i++) when = { all: [when] };
    const doc = ok(); doc.rules[0].when = when;
    expect(errors(doc).join('\n')).toContain('nested deeper');
  });
  it('rejects non-objects', () => { expect(validatePolicy(null).ok).toBe(false); expect(validatePolicy('x').ok).toBe(false); });
});

describe('SQL seed', () => {
  it('embeds exactly policies/policy-v1.rules.json', () => {
    const sql = read('../supabase/migrations/20261107120000_policy_versions.sql');
    const seed = /\$seed\$([\s\S]*?)\$seed\$/.exec(sql)?.[1];
    expect(seed).toBeDefined();
    expect(JSON.parse(seed!)).toEqual(v1Json);
  });
});
