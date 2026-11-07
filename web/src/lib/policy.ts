import type { Decision, Field, Recommendation } from '../../../src/triage';
import type { PolicyHistory } from '../../../src/policy-engine';

export const recommendationMeta: Record<Recommendation, { label: string; short: string; tone: string }> = {
  routine_processing: { label: 'Routine processing', short: 'Routine', tone: 'routine' },
  request_information: { label: 'Request information', short: 'Request info', tone: 'info' },
  human_review: { label: 'Human review', short: 'Human review', tone: 'review' },
};

/**
 * The rule that decided a case, as written in the policy JSON of the version that decided it.
 * No rule text lives in the app: a new policy version brings its own descriptions.
 */
export function ruleInfo(decision: Decision, history: PolicyHistory): { title: string; text: string } {
  const ref = [history.active, history.previous, history.original].find(p => p.label === decision.policyVersion);
  const id = decision.ruleId.slice(decision.policyVersion.length + 1);
  const found = ref && (ref.rules.rules.find(r => r.id === id) ?? (ref.rules.default.id === id ? ref.rules.default : undefined));
  if (!found) return { title: decision.ruleId, text: decision.explanation };
  const title = /^rule(\d+)$/.test(id) ? `Rule ${id.slice(4)}` : id.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
  return { title: `${title} · ${ref.label}`, text: found.description };
}

export const fieldGroups: { title: string; fields: Field[] }[] = [
  { title: 'Coverage', fields: ['policy_active_on_incident', 'claim_type', 'repair_type', 'quote_eur', 'case_status'] },
  { title: 'Documents', fields: ['incident_report_present', 'itemized_quote_present'] },
  { title: 'Review triggers', fields: ['injury_reported', 'liability_disputed', 'duplicate_flag', 'evidence_conflict'] },
];

export const fieldLabels: Record<Field, string> = {
  case_id: 'Case ID',
  case_status: 'Case status',
  claim_summary: 'Claim summary',
  claim_type: 'Claim type',
  repair_type: 'Repair type',
  quote_eur: 'Repair quote',
  policy_active_on_incident: 'Policy active on incident date',
  incident_report_present: 'Incident report present',
  itemized_quote_present: 'Itemized quote present',
  injury_reported: 'Injury reported',
  liability_disputed: 'Liability disputed',
  duplicate_flag: 'Duplicate flag',
  evidence_conflict: 'Evidence conflict',
};

export const euro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 });

const opWords: Record<string, string> = { gt: 'is above', gte: 'is at least', lt: 'is below', lte: 'is at most', neq: 'is not', in: 'is one of', not_in: 'is none of' };

/** Turns an engine fact like `quote_eur=1800 gt 1200` into reviewer language. Unknown fields fall back to the raw fact. */
export function describeFact(fact: string): string {
  const match = /^([a-z_]+)=(\S+)(?: (gt|gte|lt|lte|neq|in|not_in) (.+))?$/.exec(fact);
  if (!match) return fact;
  const [, field, value, op, operand] = match;
  if (field === 'quote_eur') {
    const amount = euro.format(Number(value));
    return op ? `Quote ${amount} ${opWords[op]} ${euro.format(Number(operand))}` : `Quote ${amount}`;
  }
  switch (field) {
    case 'repair_type': return `Repair type ${value.replaceAll('_', ' ')} requires human review`;
    case 'policy_active_on_incident': return 'Policy was not active on the incident date';
    case 'claim_type': return `Claim type is ${value.replaceAll('_', ' ')}, not motor own damage`;
    case 'injury_reported': return 'Injury reported';
    case 'liability_disputed': return 'Liability is disputed';
    case 'duplicate_flag': return 'Flagged as a possible duplicate';
    case 'evidence_conflict': return 'Evidence conflicts';
    case 'incident_report_present': return 'Incident report is absent';
    case 'itemized_quote_present': return 'Itemized quote is absent';
    default: return op ? `${fieldLabels[field as Field] ?? field} ${opWords[op]} ${operand}` : fact;
  }
}

/** Fields named in the decision's supporting facts, i.e. the inputs that fired the rule. */
export function triggeringFields(decision: Decision): Set<Field> {
  // Highlight the inputs named by the facts that fired the rule; a routine decision has none.
  if (decision.supportingFacts.length === 0) return new Set(decision.recommendation === 'request_information' ? decision.missingFields : []);
  return new Set(decision.supportingFacts.map(fact => /^([a-z_]+)=/.exec(fact)?.[1]).filter(Boolean) as Field[]);
}
