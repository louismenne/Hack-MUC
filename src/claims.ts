import { compareOfficialPolicies, evaluateV1, parseClaim, type Claim, type Decision } from './triage.js';

export const outputColumns = ['case_id', 'recommendation_v1', 'recommendation_v2', 'needs_recheck', 'rule_v1', 'rule_v2', 'explanation'];

export interface TriagedCase {
  row: Record<string, string>;
  claim: Claim;
  decision: Decision & { caseId: string };
}

/** Header callback for csv-parse: trims names and rejects files that cannot be attributed per case. */
export function normalizeHeaders(headers: string[]): string[] {
  const normalized = headers.map(header => header.trim());
  if (!normalized.includes('case_id')) throw new Error('CSV must include a case_id column.');
  if (new Set(normalized).size !== normalized.length) throw new Error('CSV contains duplicate column names.');
  return normalized;
}

/** Pure batch evaluation shared by the CLI and the review UI. */
export function triageRows(rows: Record<string, string>[]): TriagedCase[] {
  if (!rows.length) throw new Error('CSV must contain at least one claim.');
  const ids = new Set<string>();
  return rows.map((row, index) => {
    const claim = parseClaim(row);
    const decision = evaluateV1(claim);
    if (!decision.caseId) throw new Error(`Claim row ${index + 1} is missing case_id.`);
    if (ids.has(decision.caseId)) throw new Error(`Duplicate case_id: ${decision.caseId}`);
    ids.add(decision.caseId);
    return { row, claim, decision: { ...decision, caseId: decision.caseId } };
  });
}

export function toOutputRecord(item: TriagedCase): Record<string, string> {
  const { v1, v2, needsRecheck, retained } = compareOfficialPolicies(item.claim, item.decision);
  return {
    case_id: item.decision.caseId,
    recommendation_v1: v1.recommendation, recommendation_v2: v2.recommendation,
    needs_recheck: needsRecheck ? 'True' : 'False', rule_v1: v1.ruleId, rule_v2: v2.ruleId,
    explanation: retained ? `Closed claim: historical v1 decision retained. ${v1.explanation}` : `Before: ${v1.explanation} After: ${v2.explanation}`,
  };
}
