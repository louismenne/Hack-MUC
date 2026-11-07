import type { FormValues } from './validation.js';

/**
 * What a claim still lacks before we would need to ask the claimant again.
 * The form can be sent anyway; this list only nudges the claimant to complete it first,
 * which shortens the "request information" loop. Keys point at the form field to focus.
 */
export interface MissingItem { key: string; label: string }

const answered = (value: string | undefined) => value === 'yes' || value === 'no';

export function missingInformation(values: FormValues, fileCount: number): MissingItem[] {
  const missing: MissingItem[] = [];
  if (!values.quote_eur?.trim()) missing.push({ key: 'quote_eur', label: 'Repair quote amount' });
  if (values.itemized_quote_present !== 'yes') missing.push({ key: 'itemized_quote_present', label: 'Itemized repair quote' });
  if (values.incident_report_present !== 'yes') missing.push({ key: 'incident_report_present', label: 'Incident report' });
  if (!answered(values.repair_battery)) missing.push({ key: 'repair_battery', label: 'Electric-vehicle battery question' });
  if (!answered(values.injury_reported)) missing.push({ key: 'injury_reported', label: 'Injury question' });
  if (!answered(values.liability_disputed)) missing.push({ key: 'liability_disputed', label: 'Fault question' });
  if (fileCount === 0) missing.push({ key: 'documents', label: 'Documents (photos, quote, report)' });
  return missing;
}
