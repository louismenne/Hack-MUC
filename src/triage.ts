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
