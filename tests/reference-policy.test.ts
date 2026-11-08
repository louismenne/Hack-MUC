import { describe, expect, it } from 'vitest';
import { parseClaim } from '../src/triage.js';
import { evaluatePolicy, policyV1 } from '../scripts/support/reference-policy.js';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

describe('verification-only reference policy', () => {
  it('allows optional documents without weakening mandatory review triggers', () => {
    const rows = parse(readFileSync('data/labelled_development_cases.csv', 'utf8'), { columns: true }) as Record<
      string,
      string
    >[];
    const row = rows.find((row) => row.case_id === 'DEV-001')!;
    const config = { ...policyV1, requireIncidentReport: false };
    expect(evaluatePolicy(parseClaim({ ...row, incident_report_present: '' }), config, 'v2').recommendation).toBe(
      'routine_processing',
    );
    expect(
      evaluatePolicy(parseClaim({ ...row, incident_report_present: '', injury_reported: 'True' }), config, 'v2')
        .recommendation,
    ).toBe('human_review');
  });
});
