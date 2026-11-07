import type { Decision } from '../../../src/triage';
import { euro } from '@/lib/policy';

/** Reviewer decisions on a human-review claim (see claim-detail.tsx). */
export type ReviewerDecisionId = 'approve' | 'contact' | 'return' | 'keep' | 'reject';

export interface Guidance {
  /** One short, imperative instruction: what the reviewer should do next. */
  action: string;
  /** The decision this leads to; its button is highlighted. */
  decision: ReviewerDecisionId;
}

const factField = (fact: string) => /^([a-z_]+)=/.exec(fact)?.[1] ?? null;
const factValue = (fact: string) => /^[a-z_]+=(\S+)/.exec(fact)?.[1] ?? '';

/**
 * Fixed, rule-based next steps per review trigger (no AI). When several triggers apply,
 * the most serious one leads; the order below is that priority.
 */
const byTrigger: { field: string; guide: (fact: string) => Guidance }[] = [
  { field: 'injury_reported', guide: () => ({ action: 'Hand the claim to bodily-injury handling.', decision: 'keep' }) },
  { field: 'policy_active_on_incident', guide: () => ({ action: 'Confirm the cover dates in the policy system.', decision: 'keep' }) },
  { field: 'claim_type', guide: f => ({ action: `Route it to the ${factValue(f).replaceAll('_', ' ')} process.`, decision: 'keep' }) },
  { field: 'duplicate_flag', guide: () => ({ action: 'Compare it with the earlier claim for the same incident.', decision: 'keep' }) },
  { field: 'evidence_conflict', guide: () => ({ action: 'Ask the claimant why the dates in the evidence differ.', decision: 'contact' }) },
  { field: 'liability_disputed', guide: () => ({ action: 'Request statements from both parties.', decision: 'contact' }) },
  { field: 'repair_type', guide: () => ({ action: 'Have a specialist confirm the battery repair scope.', decision: 'keep' }) },
  {
    field: 'quote_eur',
    guide: f => {
      const amount = Number(factValue(f));
      return { action: `Compare the ${Number.isFinite(amount) ? euro.format(amount) : ''} quote with the damage photos.`.replace('  ', ' '), decision: 'approve' };
    },
  },
];

export function reviewerGuidance(decision: Pick<Decision, 'supportingFacts' | 'missingFields'>): Guidance | null {
  const fields = new Map(decision.supportingFacts.map(fact => [factField(fact), fact]));
  const lead = byTrigger.find(t => fields.has(t.field));
  if (!lead) return null;
  return lead.guide(fields.get(lead.field)!);
}
