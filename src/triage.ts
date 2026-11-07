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
  policyVersion: string;
  recommendation: Recommendation;
  ruleId: string;
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

export interface PolicyConfig {
  routineQuoteLimitEur: number;
  humanReviewRepairTypes: string[];
  requireIncidentReport: boolean;
  requireItemizedQuote: boolean;
}
export const policyV1: PolicyConfig = {
  routineQuoteLimitEur: 1500, humanReviewRepairTypes: [],
  requireIncidentReport: true, requireItemizedQuote: true,
};
/** Official organizer change notice, effective on release: all open claims. */
export const policyV2: PolicyConfig = {
  routineQuoteLimitEur: 1200, humanReviewRepairTypes: ['ev_high_voltage_battery'],
  requireIncidentReport: true, requireItemizedQuote: true,
};
export function evaluateV2(claim: Claim): Decision { return evaluatePolicy(claim, policyV2, 'v2'); }
export function compareOfficialPolicies(claim: Claim, historicalV1 = evaluateV1(claim)) {
  const closed = claim.case_status === 'closed';
  const v2 = closed ? historicalV1 : evaluateV2(claim);
  return { v1: historicalV1, v2, needsRecheck: !closed && historicalV1.recommendation !== v2.recommendation, retained: closed };
}
export function evaluateV1(claim: Claim): Decision { return evaluatePolicy(claim, policyV1, 'v1'); }
export function evaluatePolicy(claim: Claim, policy: PolicyConfig, version: string): Decision {
  const missingFields = inputFields.filter(field => claim[field] === null && (field !== 'incident_report_present' || policy.requireIncidentReport) && (field !== 'itemized_quote_present' || policy.requireItemizedQuote));
  const triggers: string[] = [];
  if (claim.policy_active_on_incident === false) triggers.push('policy_active_on_incident=false');
  if (claim.claim_type !== null && claim.claim_type !== 'motor_own_damage') triggers.push(`claim_type=${claim.claim_type}`);
  for (const field of ['injury_reported', 'liability_disputed', 'duplicate_flag', 'evidence_conflict'] as const) {
    if (claim[field] === true) triggers.push(`${field}=true`);
  }
  if (typeof claim.quote_eur === 'number' && claim.quote_eur > policy.routineQuoteLimitEur) triggers.push(`quote_eur=${claim.quote_eur} exceeds ${policy.routineQuoteLimitEur}`);
  if (typeof claim.repair_type === 'string' && policy.humanReviewRepairTypes.includes(claim.repair_type)) triggers.push(`repair_type=${claim.repair_type}`);
  const absentDocuments = (['incident_report_present', 'itemized_quote_present'] as const)
    .filter(field => claim[field] === false && (field === 'incident_report_present' ? policy.requireIncidentReport : policy.requireItemizedQuote)).map(field => `${field}=false`);
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
    supportingFacts = ['Active motor-own-damage policy', 'All required documents present', 'No review flags', `quote_eur=${claim.quote_eur} is at most ${policy.routineQuoteLimitEur}`];
  }
  ruleId = ruleId.replace('v1.', `${version}.`);
  const missingNote = missingFields.length ? ` Missing or unreadable: ${missingFields.join(', ')}.` : '';
  return {
    caseId: typeof claim.case_id === 'string' ? claim.case_id : null,
    policyVersion: version, recommendation, ruleId, supportingFacts, missingFields,
    explanation: `${ruleId}: ${recommendation}. ${supportingFacts.length ? supportingFacts.join('; ') + '.' : ''}${missingNote}${recommendation === 'routine_processing' ? ' This is a handling recommendation, not payment approval.' : ''}`,
  };
}
