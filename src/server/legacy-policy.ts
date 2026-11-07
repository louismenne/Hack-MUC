// LEGACY: the former hard-coded evaluator, moved out of src/triage.ts. Only the old local SQLite prototype
// (src/server, tests/policy.test.ts) still uses it; the app and the CLI decide with src/policy-engine and the
// policy JSON. Delete this file together with src/server once the team agrees.
import { inputFields, type Claim, type Decision, type Recommendation } from '../triage.js';

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
