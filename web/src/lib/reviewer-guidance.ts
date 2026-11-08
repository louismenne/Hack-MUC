import type { Decision } from '../../../src/triage';
import { euro } from '@/lib/policy';

/** Reviewer decisions on a human-review claim (see claim-detail.tsx). */
export type ReviewerDecisionId = 'routine' | 'contact' | 'reject';

export interface Guidance {
  /** One short, imperative instruction: what the reviewer should do next. */
  action: string;
}

const factField = (fact: string) => /^([a-z_]+)=/.exec(fact)?.[1] ?? null;
const factValue = (fact: string) => /^[a-z_]+=(\S+)/.exec(fact)?.[1] ?? '';

/**
 * Fixed, rule-based next steps per review trigger (no AI). When several triggers apply,
 * the most serious one leads; the order below is that priority. It says what to check,
 * never which decision to take: the reviewer decides.
 */
const byTrigger: { field: string; guide: (fact: string) => Guidance }[] = [
  { field: 'injury_reported', guide: () => ({ action: 'Hand the claim to bodily-injury handling.' }) },
  { field: 'policy_active_on_incident', guide: () => ({ action: 'Confirm the cover dates in the policy system.' }) },
  { field: 'claim_type', guide: f => ({ action: `Route it to the ${factValue(f).replaceAll('_', ' ')} process.` }) },
  { field: 'duplicate_flag', guide: () => ({ action: 'Compare it with the earlier claim for the same incident.' }) },
  { field: 'evidence_conflict', guide: () => ({ action: 'Ask the claimant why the dates in the evidence differ.' }) },
  { field: 'liability_disputed', guide: () => ({ action: 'Request statements from both parties.' }) },
  { field: 'repair_type', guide: () => ({ action: 'Have a specialist confirm the battery repair scope.' }) },
  {
    field: 'quote_eur',
    guide: f => {
      const amount = Number(factValue(f));
      return { action: `Compare the ${Number.isFinite(amount) ? euro.format(amount) : ''} quote with the damage photos.`.replace('  ', ' ') };
    },
  },
];

export function reviewerGuidance(decision: Pick<Decision, 'supportingFacts' | 'missingFields'>): Guidance | null {
  const fields = new Map(decision.supportingFacts.map(fact => [factField(fact), fact]));
  const lead = byTrigger.find(t => fields.has(t.field));
  if (!lead) return null;
  return lead.guide(fields.get(lead.field)!);
}
