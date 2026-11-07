import type { Decision, Field, Recommendation } from '../../../src/triage';

export const recommendationMeta: Record<Recommendation, { label: string; short: string; tone: string }> = {
  routine_processing: { label: 'Routine processing', short: 'Routine', tone: 'routine' },
  request_information: { label: 'Request information', short: 'Request info', tone: 'info' },
  human_review: { label: 'Human review', short: 'Human review', tone: 'review' },
};

/** Rule text quoted from policies/policy-v1.txt so reviewers see the exact clause applied. */
export const ruleMeta: Record<Decision['ruleId'], { title: string; text: string }> = {
  'v1.rule1': {
    title: 'Rule 1 · Known review trigger',
    text: 'Send to human_review if the policy was not active on the incident date; claim_type is not motor_own_damage; injury_reported, liability_disputed, duplicate_flag or evidence_conflict is true; or quote_eur is greater than €1,500.',
  },
  'v1.rule2': {
    title: 'Rule 2 · Required document absent',
    text: 'Otherwise, send to request_information if incident_report_present or itemized_quote_present is false.',
  },
  'v1.missing_input': {
    title: 'Missing input',
    text: 'If an input field is absent or unreadable, do not invent a value. Request information unless another known fact already requires human review.',
  },
  'v1.rule3': {
    title: 'Rule 3 · Routine',
    text: 'Otherwise, send to routine_processing. This means the case may enter the insurer’s normal downstream process. It does not mean payment is approved.',
  },
};

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

/** Turns an engine fact like `quote_eur=1800 exceeds 1500` into reviewer language. */
export function describeFact(fact: string): string {
  const match = /^([a-z_]+)=(\S+)/.exec(fact);
  if (!match) return fact;
  const [, field, value] = match;
  switch (field) {
    case 'quote_eur': return fact.includes('exceeds') ? `Quote ${euro.format(Number(value))} is above the €1,500 limit` : `Quote ${euro.format(Number(value))} is within the €1,500 limit`;
    case 'policy_active_on_incident': return 'Policy was not active on the incident date';
    case 'claim_type': return `Claim type is ${value.replaceAll('_', ' ')}, not motor own damage`;
    case 'injury_reported': return 'Injury reported';
    case 'liability_disputed': return 'Liability is disputed';
    case 'duplicate_flag': return 'Flagged as a possible duplicate';
    case 'evidence_conflict': return 'Evidence conflicts';
    case 'incident_report_present': return 'Incident report is absent';
    case 'itemized_quote_present': return 'Itemized quote is absent';
    default: return fact;
  }
}

/** Fields named in the decision's supporting facts, i.e. the inputs that fired the rule. */
export function triggeringFields(decision: Decision): Set<Field> {
  if (decision.ruleId === 'v1.missing_input') return new Set(decision.missingFields);
  if (decision.ruleId === 'v1.rule3') return new Set();
  return new Set(decision.supportingFacts.map(fact => /^([a-z_]+)=/.exec(fact)?.[1]).filter(Boolean) as Field[]);
}
