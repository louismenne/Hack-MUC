import { expect, it } from 'vitest';
import { followupRequirements, savedFormValues } from '../src/claim-intake/followup.js';
import { buildPayload } from '../src/claim-intake/payload.js';
import { evaluatePolicyDocument } from '../src/policy-engine/engine.js';
import { bundledV1 } from '../src/policy-engine/bundled.js';

it('includes explicitly absent documents and separates internal verification', () => {
 const decision = evaluatePolicyDocument(bundledV1.rules, 'v1', { case_id: 'X', case_status: 'open', claim_summary: 'Repair', claim_type: 'motor_own_damage', repair_type: 'standard', quote_eur: 1000, injury_reported: false, liability_disputed: false, incident_report_present: false, itemized_quote_present: false });
 const needed = followupRequirements(decision);
 expect(needed.claimant).toEqual(['incident_report_present', 'itemized_quote_present']);
 expect(needed.internal).toEqual(expect.arrayContaining(['policy_active_on_incident', 'duplicate_flag', 'evidence_conflict']));
 expect(needed.claimant).not.toContain('policy_active_on_incident');
});

it('deduplicates missing requests and does not request information for human review', () => {
 const decision = { recommendation: 'request_information' as const, missingFields: ['incident_report_present'], supportingFacts: ['incident_report_present=false', 'incident_report_present=false'] };
 expect(followupRequirements(decision).claimant).toEqual(['incident_report_present']);
 expect(followupRequirements({ ...decision, recommendation: 'human_review' })).toEqual({ claimant: [], internal: [] });
});

it('restores saved typed facts without changing the meaning of yes/no, unknown or repair type', () => {
 const payload = { claimant_name: 'Test', claimant_email: 'test@example.invalid', claim_type: 'motor_own_damage', claim_summary: 'Test claim', repair_type: 'ev_high_voltage_battery', injury_reported: false, liability_disputed: null, quote_eur: 0, itemized_quote_present: true };
 const values = savedFormValues(payload);
 expect(values).toMatchObject({ repair_battery: 'yes', injury_reported: 'no', liability_disputed: '', quote_eur: '0' });
 expect(buildPayload(values, { isTest: false })).toMatchObject(payload);
 expect(savedFormValues({ repair_type: 'standard' }).repair_battery).toBe('no');
});
