import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { evaluateV1, parseClaim } from './triage.js';

export const outputColumns = ['case_id', 'policy_version', 'recommendation_v1', 'rule_v1', 'supporting_facts', 'missing_fields', 'explanation', 'v2_status'];

export function triageCsv(input: string): string {
  const rows = parse(input, {
    bom: true, skip_empty_lines: true,
    columns: (headers: string[]) => {
      const normalized = headers.map(header => header.trim());
      if (!normalized.includes('case_id')) throw new Error('CSV must include a case_id column.');
      if (new Set(normalized).size !== normalized.length) throw new Error('CSV contains duplicate column names.');
      return normalized;
    },
  }) as Record<string, string>[];
  if (!rows.length) throw new Error('CSV must contain at least one claim.');
  const ids = new Set<string>();
  const results = rows.map((row, index) => {
    const decision = evaluateV1(parseClaim(row));
    if (!decision.caseId) throw new Error(`Claim row ${index + 1} is missing case_id.`);
    if (ids.has(decision.caseId)) throw new Error(`Duplicate case_id: ${decision.caseId}`);
    ids.add(decision.caseId);
    return {
      case_id: decision.caseId, policy_version: decision.policyVersion,
      recommendation_v1: decision.recommendation, rule_v1: decision.ruleId,
      supporting_facts: JSON.stringify(decision.supportingFacts),
      missing_fields: JSON.stringify(decision.missingFields), explanation: decision.explanation,
      v2_status: 'unavailable',
    };
  });
  return stringify(results, { header: true, columns: outputColumns });
}
