import { evaluateV1, parseClaim } from '../triage.js';
import { evaluatePolicyDocument } from '../policy-engine/engine.js';
import type { ImpactReport, ImpactRow, PolicyVersionRecord } from './types.js';

const statusOf = (row: Record<string, string>): ImpactRow['caseStatus'] => {
  const s = row.case_status?.trim().toLowerCase();
  return s === 'open' || s === 'closed' ? s : 'unknown';
};

/**
 * Re-evaluates every case with the active version and with the draft.
 * Open (and unknown-status) cases whose recommendation changes need a recheck. Only explicitly
 * closed cases are frozen: they keep the recorded result, even if the draft would decide differently.
 */
export function computeImpact(base: PolicyVersionRecord, draft: PolicyVersionRecord, cases: Record<string, string>[]): ImpactReport {
  const rows: ImpactRow[] = cases.map(row => {
    // The exercise fixes all closed claims to their historical v1 outcome, even
    // when the currently active policy is already v2 or a later experiment.
    const before = statusOf(row) === 'closed'
      ? evaluateV1(parseClaim(row))
      : evaluatePolicyDocument(base.rules, base.versionLabel, row);
    const proposed = evaluatePolicyDocument(draft.rules, draft.versionLabel, row);
    const caseStatus = statusOf(row);
    const frozen = caseStatus === 'closed';
    const differs = proposed.recommendation !== before.recommendation;
    const kept = { recommendation: before.recommendation, ruleId: before.ruleId };
    return {
      caseId: row.case_id?.trim() || '(ohne ID)',
      caseStatus,
      summary: row.claim_summary?.trim() ?? '',
      before: kept,
      after: frozen ? kept : { recommendation: proposed.recommendation, ruleId: proposed.ruleId },
      changed: !frozen && differs,
      frozen,
      frozenWouldChange: frozen && differs,
      needsRecheck: !frozen && differs,
    };
  });
  const closed = rows.filter(r => r.frozen).length;
  const needsRecheck = rows.filter(r => r.needsRecheck).length;
  return {
    base: { id: base.id, label: base.versionLabel },
    draft: { id: draft.id, label: draft.versionLabel },
    rows,
    totals: {
      cases: rows.length, open: rows.length - closed, closed, needsRecheck,
      openUnchanged: rows.length - closed - needsRecheck, frozenClosed: closed, frozenWouldChange: rows.filter(r => r.frozenWouldChange).length,
    },
  };
}
