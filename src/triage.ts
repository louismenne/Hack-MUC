export const booleanFields = [
  'policy_active_on_incident', 'incident_report_present', 'itemized_quote_present',
  'injury_reported', 'liability_disputed', 'duplicate_flag', 'evidence_conflict',
] as const;
export const inputFields = [
  'case_id', 'case_status', 'claim_summary', 'claim_type', 'repair_type', 'quote_eur',
  ...booleanFields,
] as const;
export type Field = typeof inputFields[number];
export type Recommendation = 'routine_processing' | 'request_information' | 'human_review';
export type Claim = Record<Field, string | boolean | number | null>;
export interface Decision {
  caseId: string | null;
  policyVersion: 'v1';
  recommendation: Recommendation;
  ruleId: 'v1.rule1' | 'v1.rule2' | 'v1.missing_input' | 'v1.rule3';
  supportingFacts: string[];
  missingFields: Field[];
  explanation: string;
}

/** Invalid or absent facts stay unknown; narrative text never supplies a fact. */
export function parseClaim(row: Record<string, string>): Claim {
  const claim = Object.fromEntries(inputFields.map(field => [field, row[field]?.trim() || null])) as Claim;
  for (const field of booleanFields) {
    const value = row[field]?.trim().toLowerCase();
    claim[field] = value === 'true' ? true : value === 'false' ? false : null;
  }
  const quote = row.quote_eur?.trim() ?? '';
  claim.quote_eur = /^\d+(\.\d+)?$/.test(quote) && Number.isFinite(Number(quote)) ? Number(quote) : null;
  if (!['open', 'closed'].includes(String(claim.case_status))) claim.case_status = null;
  return claim;
}

export function evaluateV1(claim: Claim): Decision {
  const missingFields = inputFields.filter(field => claim[field] === null);
  const triggers: string[] = [];
  if (claim.policy_active_on_incident === false) triggers.push('policy_active_on_incident=false');
  if (claim.claim_type !== null && claim.claim_type !== 'motor_own_damage') triggers.push(`claim_type=${claim.claim_type}`);
  for (const field of ['injury_reported', 'liability_disputed', 'duplicate_flag', 'evidence_conflict'] as const) {
    if (claim[field] === true) triggers.push(`${field}=true`);
  }
  if (typeof claim.quote_eur === 'number' && claim.quote_eur > 1500) triggers.push(`quote_eur=${claim.quote_eur} exceeds 1500`);
  const absentDocuments = (['incident_report_present', 'itemized_quote_present'] as const)
    .filter(field => claim[field] === false).map(field => `${field}=false`);
  let recommendation: Recommendation;
  let ruleId: Decision['ruleId'];
  let supportingFacts: string[];
  if (triggers.length) {
    recommendation = 'human_review'; ruleId = 'v1.rule1'; supportingFacts = triggers;
  } else if (absentDocuments.length) {
    recommendation = 'request_information'; ruleId = 'v1.rule2'; supportingFacts = absentDocuments;
  } else if (missingFields.length) {
    recommendation = 'request_information'; ruleId = 'v1.missing_input'; supportingFacts = [];
  } else {
    recommendation = 'routine_processing'; ruleId = 'v1.rule3';
    supportingFacts = ['Active motor-own-damage policy', 'Both required documents present', 'No review flags', `quote_eur=${claim.quote_eur} is at most 1500`];
  }
  const missingNote = missingFields.length ? ` Missing or unreadable: ${missingFields.join(', ')}.` : '';
  return {
    caseId: typeof claim.case_id === 'string' ? claim.case_id : null,
    policyVersion: 'v1', recommendation, ruleId, supportingFacts, missingFields,
    explanation: `${ruleId}: ${recommendation}. ${supportingFacts.length ? supportingFacts.join('; ') + '.' : ''}${missingNote}${recommendation === 'routine_processing' ? ' This is a handling recommendation, not payment approval.' : ''}`,
  };
}
