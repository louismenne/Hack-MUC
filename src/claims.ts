import { bundledHistory } from './policy-engine/bundled.js';
import { decideClaim, type PolicyHistory } from './policy-engine/history.js';
import type { PolicyDecision } from './policy-engine/engine.js';
import { parseClaim, type Claim, type Decision, type Field } from './triage.js';

export const outputColumns = ['case_id', 'recommendation_v1', 'recommendation_v2', 'needs_recheck', 'rule_v1', 'rule_v2', 'explanation'];

export interface TriagedCase {
  row: Record<string, string>;
  /** The structured facts as read for display. Decisions are made by the policy engine, not from this object. */
  claim: Claim;
  /** The decision before the latest policy change (for closed claims: the original decision). */
  decision: Decision & { caseId: string };
  /** The decision in force: the active policy for open claims, the frozen original decision for closed claims. */
  current: Decision & { caseId: string };
  /** Open claim whose recommendation differs between the previous and the active policy version. */
  needsRecheck: boolean;
  /** Closed claim: keeps its original decision and is never rechecked. */
  frozen: boolean;
}

/** Blank inputs are reported through `missingFields`; their `field=(missing)` facts would only repeat that. */
const asDecision = (d: PolicyDecision): Decision => ({
  ...d, missingFields: d.missingFields as Field[], supportingFacts: d.supportingFacts.filter(fact => !fact.endsWith('=(missing)')),
});

/** Header callback for csv-parse: trims names and rejects files that cannot be attributed per case. */
export function normalizeHeaders(headers: string[]): string[] {
  const normalized = headers.map(header => header.trim());
  if (!normalized.includes('case_id')) throw new Error('CSV must include a case_id column.');
  if (new Set(normalized).size !== normalized.length) throw new Error('CSV contains duplicate column names.');
  return normalized;
}

/**
 * Pure batch evaluation shared by the CLI and the review UI. The rules come from the policy JSON in `history`
 * (the active version from the database in the app; policies/*.rules.json when none is given).
 */
export function triageRows(rows: Record<string, string>[], history: PolicyHistory = bundledHistory): TriagedCase[] {
  if (!rows.length) throw new Error('CSV must contain at least one claim.');
  const ids = new Set<string>();
  return rows.map((row, index) => {
    const outcome = decideClaim(row, history);
    const baseline = asDecision(outcome.baseline);
    const current = asDecision(outcome.decision);
    if (!baseline.caseId) throw new Error(`Claim row ${index + 1} is missing case_id.`);
    if (ids.has(baseline.caseId)) throw new Error(`Duplicate case_id: ${baseline.caseId}`);
    ids.add(baseline.caseId);
    return {
      row, claim: parseClaim(row), decision: { ...baseline, caseId: baseline.caseId }, current: { ...current, caseId: baseline.caseId },
      needsRecheck: outcome.needsRecheck, frozen: outcome.frozen,
    };
  });
}

export function toOutputRecord(item: TriagedCase): Record<string, string> {
  const { decision: v1, current: v2, needsRecheck, frozen: retained } = item;
  return {
    case_id: v1.caseId,
    recommendation_v1: v1.recommendation, recommendation_v2: v2.recommendation,
    needs_recheck: needsRecheck ? 'True' : 'False', rule_v1: v1.ruleId, rule_v2: v2.ruleId,
    explanation: retained ? `Closed claim: historical ${v1.policyVersion} decision retained. ${v1.explanation}` : `Before: ${v1.explanation} After: ${v2.explanation}`,
  };
}
