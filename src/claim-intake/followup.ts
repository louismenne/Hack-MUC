import type { PolicyDecision } from '../policy-engine/engine.js';
import { fields } from './fields.js';
import type { ClaimPayload } from './payload.js';
import type { FormValues } from './validation.js';

/** Unknown fields and explicitly absent documents require different evidence, but both need follow-up. */
export function followupRequirements(decision: Pick<PolicyDecision, 'recommendation' | 'missingFields' | 'supportingFacts'>) {
  const requested = new Set(decision.recommendation === 'request_information' ? decision.missingFields : []);
  if (decision.recommendation === 'request_information') {
    for (const fact of decision.supportingFacts) {
      const absent = /^(incident_report_present|itemized_quote_present)=false(?:\s|$)/.exec(fact);
      if (absent) requested.add(absent[1]);
    }
  }
  return {
    claimant: [...requested].filter(column => fields.some(field => field.column === column)),
    internal: [...requested].filter(column => !fields.some(field => field.column === column)),
  };
}

/** Restore saved facts as user values, never AI suggestions. Includes reverse mapping of repair_type. */
export function savedFormValues(payload: ClaimPayload): FormValues {
  return Object.fromEntries(fields.map(field => {
    const value = payload[field.column];
    if (value == null) return [field.key, ''];
    if (field.toColumn && field.options) return [field.key, field.options.find(option => field.toColumn!(option.value) === value)?.value ?? ''];
    return [field.key, String(value)];
  }));
}

export const followupHref = (id: string) => `/claim?claim=${encodeURIComponent(id)}`;
