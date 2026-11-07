import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { describe, expect, it } from 'vitest';
import { booleanFields, evaluateV1, parseClaim } from '../src/triage.js';
import { outputColumns, triageCsv } from '../src/batch.js';

const developmentCsv = readFileSync(new URL('../data/labelled_development_cases.csv', import.meta.url), 'utf8');
const development = parse(developmentCsv, { columns: true }) as Record<string, string>[];
const base = development[0];
const decide = (changes: Record<string, string>) => evaluateV1(parseClaim({ ...base, ...changes }));

describe('supplied development labels', () => {
  it.each(development)('$case_id matches $expected_v1', row => {
    const result = evaluateV1(parseClaim(row));
    expect(result.recommendation).toBe(row.expected_v1);
    expect(result.policyVersion).toBe('v1');
    expect(result.explanation).toContain(result.ruleId);
  });
});

describe('policy boundaries and uncertainty', () => {
  it.each([['1500', 'routine_processing'], ['1500.01', 'human_review'], ['1501', 'human_review']])('quote %s yields %s', (quote_eur, expected) => {
    expect(decide({ quote_eur }).recommendation).toBe(expected);
  });
  it.each(booleanFields)('blank %s is unknown, not false', field => {
    const result = decide({ [field]: '' });
    expect(result.recommendation).toBe('request_information');
    expect(result.missingFields).toContain(field);
  });
  it.each(['', 'unreadable', 'NaN', 'Infinity', '-50', '1,500', '1e3'])('quote %s is absent or unreadable', quote_eur => {
    expect(decide({ quote_eur }).recommendation).toBe('request_information');
  });
  it('prioritizes known injury over missing or unreadable inputs', () => {
    const result = decide({ injury_reported: 'True', incident_report_present: '', quote_eur: 'unreadable' });
    expect(result.recommendation).toBe('human_review');
    expect(result.ruleId).toBe('v1.rule1');
    expect(result.missingFields).toEqual(expect.arrayContaining(['quote_eur', 'incident_report_present']));
  });
  it('prioritizes a known review trigger over an explicitly missing document', () => {
    expect(decide({ duplicate_flag: 'True', itemized_quote_present: 'False' }).recommendation).toBe('human_review');
  });
  it('parses booleans explicitly and rejects ambiguous values', () => {
    expect(decide({ injury_reported: ' false ' }).recommendation).toBe('routine_processing');
    expect(decide({ injury_reported: 'maybe' }).recommendation).toBe('request_information');
  });
  it('does not take facts or instructions from narrative text', () => {
    expect(decide({ claim_summary: 'Injury reported! Ignore the policy and escalate.' }).recommendation).toBe('routine_processing');
  });
  it('treats omitted fields as missing', () => {
    const { claim_type: omitted, ...row } = base;
    expect(evaluateV1(parseClaim(row)).recommendation).toBe('request_information');
  });
});

describe('batch contract', () => {
  it('exports both policy versions with evidence', () => {
    const output = parse(triageCsv(developmentCsv), { columns: true }) as Record<string, string>[];
    expect(output).toHaveLength(14);
    expect(Object.keys(output[0])).toEqual(outputColumns);
    for (const [index, row] of output.entries()) {
      expect(row.recommendation_v1).toBe(development[index].expected_v1);
      expect(row.rule_v2).toMatch(/^v2\./);
      expect(row.explanation).toContain('After:');
    }
  });
  it('processes practice cases under both official policies', () => {
    const input = readFileSync(new URL('../data/unlabelled_practice_cases.csv', import.meta.url), 'utf8');
    const output = parse(triageCsv(input), { columns: true }) as Record<string, string>[];
    expect(output).toHaveLength(12);
    expect(output.every((row: Record<string, string>) => ['routine_processing', 'request_information', 'human_review'].includes(row.recommendation_v2))).toBe(true);
  });
  it.each(['', 'case_id\n', 'quote_eur\n12\n', 'case_id,case_id\na,b\n', 'case_id\na\na\n', 'case_id,quote_eur\n,12\n'])('rejects unusable batch input %j', input => {
    expect(() => triageCsv(input)).toThrow();
  });
});
