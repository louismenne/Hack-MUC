import type { Prefill } from './form-state.js';

/**
 * AI prefill (STUB). Called automatically after documents are added to the form.
 *
 * TODO(AI): read the attached PDFs/images and return the values it finds, keyed by field key from fields.ts
 * (for example { claim_summary, quote_eur, incident_report_present: 'yes', itemized_quote_present: 'yes' }).
 * Rules for the real implementation:
 *  - run it server-side (an API route or a separate service), never with a secret key in the browser;
 *  - return only what the documents actually show: leave a field out instead of guessing;
 *  - choice fields must use the option values from fields.ts ("yes" / "no" / "unknown", "motor_own_damage" ...);
 *  - the form never overwrites what the user already typed and marks every filled field "Filled by AI, please check".
 *
 * `files` are the files that were just added (not the whole list).
 */
export async function extractFromFiles(_files: File[]): Promise<Prefill> {
  return {};
}
