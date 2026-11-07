import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { evaluatePolicyDocument } from '../src/policy-engine/index.js';
import { bundledV2 } from '../src/policy-engine/bundled.js';
import { isDryRun, submitClaim } from '../src/claim-intake/adapter.js';
import { claimIntakeConfig } from '../src/claim-intake/config.js';
import { extractFromFiles } from '../src/claim-intake/extract.js';
import { engineColumns, fieldByKey, fields, payloadColumns, systemColumns, triToBoolean } from '../src/claim-intake/fields.js';
import { isAcceptedFile, sortNewFiles } from '../src/claim-intake/files.js';
import { applyPrefill, confirmAiValue, initialFormState, setValue } from '../src/claim-intake/form-state.js';
import { buildPayload } from '../src/claim-intake/payload.js';
import { validate, type FormValues } from '../src/claim-intake/validation.js';

const NOW = new Date('2026-11-08T10:00:00Z');
const valid = (changes: FormValues = {}): FormValues => ({
  ...initialFormState().values,
  claimant_name: 'Anna Beispiel', claimant_email: 'anna@example.com', claim_type: 'motor_own_damage', claim_summary: 'Parking scrape on the bumper.', ...changes,
});
const file = (name: string, type = 'application/pdf', size = 10) => new File([new Uint8Array(size)], name, { type, lastModified: 1 });

describe('fields.ts is the single source of truth', () => {
  it('has unique keys and unique column names', () => {
    expect(new Set(fields.map(f => f.key)).size).toBe(fields.length);
    expect(new Set(payloadColumns()).size).toBe(payloadColumns().length);
  });
  it('covers exactly the 13 engine fields of the policy, and nothing the engine does not read is marked as engine field', () => {
    expect(engineColumns().sort()).toEqual(Object.keys(bundledV2.rules.fields).sort());
  });
  it('marks the contact and system extras as NOT read by the engine', () => {
    const notEngine = [...fields.filter(f => !f.engineField).map(f => f.column), ...systemColumns.filter(c => !c.engineField).map(c => c.column)].sort();
    expect(notEngine).toEqual(['claimant_email', 'claimant_name', 'claimant_states_policy_active', 'incident_date', 'is_test', 'license_plate', 'policy_number', 'received_at']);
  });
  it('requires exactly claim_summary, claim_type, the claimant name and email', () => {
    expect(fields.filter(f => f.required).map(f => f.key).sort()).toEqual(['claim_summary', 'claim_type', 'claimant_email', 'claimant_name']);
  });
  it('every yes/no question offers Yes / No / Don\'t know', () => {
    for (const key of ['injury_reported', 'liability_disputed', 'claimant_states_policy_active', 'incident_report_present', 'itemized_quote_present', 'repair_battery']) {
      expect(fieldByKey(key)!.options!.map(o => o.label)).toEqual(['Yes', 'No', "Don't know"]);
    }
  });
});

describe('validation', () => {
  it('accepts a minimal valid form', () => expect(validate(valid(), NOW)).toEqual({}));
  it('an empty form flags exactly the required fields', () => {
    expect(Object.keys(validate(initialFormState().values, NOW)).sort()).toEqual(['claim_summary', 'claim_type', 'claimant_email', 'claimant_name']);
  });
  it.each([['claimant_email', 'not-an-email'], ['claimant_email', 'a@b'], ['quote_eur', 'abc'], ['quote_eur', '-5'], ['quote_eur', '1.234,50'], ['quote_eur', '2000000'],
    ['incident_date', '2026-11-09'], ['incident_date', '1999-12-31'], ['incident_date', '31.10.2026'], ['license_plate', '!'], ['policy_number', '??'], ['claim_type', 'banana'], ['injury_reported', 'maybe']])('rejects %s = %j', (key, value) => {
    expect(validate(valid({ [key]: value }), NOW)[key]).toBeTruthy();
  });
  it.each([['quote_eur', '0'], ['quote_eur', '1250'], ['quote_eur', '1250,50'], ['quote_eur', '1250.5'], ['incident_date', '2026-11-08'], ['incident_date', '2026-01-31'],
    ['license_plate', 'M-AB 1234'], ['policy_number', 'POL-2024/001'], ['injury_reported', 'unknown']])('accepts %s = %j', (key, value) => {
    expect(validate(valid({ [key]: value }), NOW)[key]).toBeUndefined();
  });
  it('limits text length', () => {
    expect(validate(valid({ claim_summary: 'x'.repeat(2001) }), NOW).claim_summary).toMatch(/at most 2000/);
  });
  it('treats whitespace-only required fields as empty', () => {
    expect(validate(valid({ claim_summary: '   ' }), NOW).claim_summary).toBe('This field is required.');
  });
});

describe('payload (the exact row for the future claims table)', () => {
  const payload = buildPayload(valid({
    claimant_name: ' Anna Beispiel ', policy_number: 'POL-1', incident_date: '2026-11-01', license_plate: 'm-ab 1234',
    quote_eur: '1250,50', repair_battery: 'yes', injury_reported: 'no', liability_disputed: 'unknown', claimant_states_policy_active: 'yes',
    incident_report_present: 'yes', itemized_quote_present: '',
  }), { now: NOW, isTest: true });

  it('uses the column names from fields.ts, in order, and nothing else', () => expect(Object.keys(payload)).toEqual(payloadColumns()));
  it('maps Yes / No / Don\'t know / unanswered to true / false / null / null', () => {
    expect(payload).toMatchObject({ injury_reported: false, incident_report_present: true, liability_disputed: null, itemized_quote_present: null });
    expect([triToBoolean('yes'), triToBoolean('no'), triToBoolean('unknown'), triToBoolean('')]).toEqual([true, false, null, null]);
  });
  it('maps the battery question to repair_type', () => {
    expect(payload.repair_type).toBe('ev_high_voltage_battery');
    for (const [answer, expected] of [['no', 'standard'], ['unknown', null], ['', null]] as const) {
      expect(buildPayload(valid({ repair_battery: answer }), { now: NOW, isTest: true }).repair_type).toBe(expected);
    }
  });
  it('keeps the claimant statement separate and never fills policy_active_on_incident', () => {
    expect(payload.claimant_states_policy_active).toBe(true);
    expect(payload.policy_active_on_incident).toBeNull();
  });
  it('sets the system fields as agreed', () => {
    expect(payload).toMatchObject({ case_id: null, case_status: 'open', duplicate_flag: null, evidence_conflict: null, received_at: NOW.toISOString(), is_test: true });
  });
  it('parses and normalises values', () => {
    expect(payload).toMatchObject({ quote_eur: 1250.5, claimant_name: 'Anna Beispiel', license_plate: 'M-AB 1234', incident_date: '2026-11-01', policy_number: 'POL-1' });
    expect(buildPayload(valid(), { now: NOW, isTest: true })).toMatchObject({ quote_eur: null, claimant_name: 'Anna Beispiel', incident_date: null, policy_number: null });
  });
  it('is_test follows the dry-run flag', () => expect(buildPayload(valid(), { now: NOW, isTest: false }).is_test).toBe(false));

  describe('what the policy engine makes of it', () => {
    const decide = (p: Record<string, unknown>) => evaluatePolicyDocument(bundledV2.rules, 'v2', p);
    it('"Don\'t know" and system placeholders are missing facts: the engine asks for information, it never guesses', () => {
      const r = decide(buildPayload(valid({ repair_battery: 'no', quote_eur: '900', injury_reported: 'no', liability_disputed: 'unknown', incident_report_present: 'yes' }), { now: NOW, isTest: true }));
      expect(r.recommendation).toBe('request_information');
      expect(r.ruleId).toBe('v2.missing_input');
      expect(r.missingFields).toEqual(expect.arrayContaining(['case_id', 'policy_active_on_incident', 'duplicate_flag', 'evidence_conflict', 'liability_disputed', 'itemized_quote_present']));
    });
    it('answering Yes to the battery question is a known trigger under v2 (human review)', () => {
      expect(decide(payload)).toMatchObject({ recommendation: 'human_review', ruleId: 'v2.rule1' });
    });
    it('a known trigger from the claimant still decides (injury -> human review)', () => {
      expect(decide(buildPayload(valid({ injury_reported: 'yes' }), { now: NOW, isTest: true })).recommendation).toBe('human_review');
    });
    it('the contact and extra columns do not influence the decision', () => {
      const base = valid({ quote_eur: '900', repair_battery: 'no', injury_reported: 'no', liability_disputed: 'no', incident_report_present: 'yes', itemized_quote_present: 'yes' });
      const a = buildPayload(base, { now: NOW, isTest: true });
      const b = buildPayload({ ...base, claimant_name: 'Someone Else', claimant_email: 'other@example.com', policy_number: 'XYZ-999', incident_date: '2026-10-01', license_plate: 'B-XX 1', claimant_states_policy_active: 'no' }, { now: NOW, isTest: false });
      const { recommendation, ruleId, missingFields } = decide(a);
      expect(decide(b)).toMatchObject({ recommendation, ruleId, missingFields });
    });
  });
});

describe('adapter (dry run: no network)', () => {
  beforeEach(() => { claimIntakeConfig.claimsTable = null; claimIntakeConfig.claimsBucket = null; });
  afterEach(() => { vi.unstubAllGlobals(); claimIntakeConfig.claimsTable = null; claimIntakeConfig.claimsBucket = null; });

  it('is a dry run while claimsTable and claimsBucket are null', () => {
    expect(claimIntakeConfig).toEqual({ claimsTable: null, claimsBucket: null });
    expect(isDryRun()).toBe(true);
  });
  it('returns the payload and the file list without any network call', async () => {
    const fetchSpy = vi.fn(() => { throw new Error('network call!'); });
    vi.stubGlobal('fetch', fetchSpy);
    const payload = buildPayload(valid(), { now: NOW, isTest: isDryRun() });
    const result = await submitClaim(payload, [file('report.pdf', 'application/pdf', 2048), file('car.jpg', 'image/jpeg', 100)]);
    expect(result.mode).toBe('dry-run');
    expect(result.payload).toBe(payload);
    expect(result.payload.is_test).toBe(true);
    expect(result.files).toEqual([{ name: 'report.pdf', size: 2048, type: 'application/pdf' }, { name: 'car.jpg', size: 100, type: 'image/jpeg' }]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('refuses to pretend it saved once a table is configured but Supabase is not wired up yet', async () => {
    claimIntakeConfig.claimsTable = 'claims';
    await expect(submitClaim(buildPayload(valid(), { now: NOW, isTest: false }), [])).rejects.toThrow(/not configured/);
  });
});

describe('AI prefill', () => {
  it('extractFromFiles is a stub that returns nothing', async () => expect(await extractFromFiles([file('a.pdf')])).toEqual({}));

  it('fills empty fields, marks them as filled by AI, and ignores unknown keys and invalid options', () => {
    const { state, applied } = applyPrefill(initialFormState(), { claim_summary: 'Hail damage', quote_eur: '800', injury_reported: 'yes', repair_battery: 'perhaps', not_a_field: 'x', claim_type: '  ' });
    expect(applied.sort()).toEqual(['claim_summary', 'injury_reported', 'quote_eur']);
    expect(state.values).toMatchObject({ claim_summary: 'Hail damage', quote_eur: '800', injury_reported: 'yes', repair_battery: '', claim_type: '' });
    expect(Object.keys(state.aiFilled).sort()).toEqual(['claim_summary', 'injury_reported', 'quote_eur']);
  });
  it('never overwrites what the user already typed', () => {
    const typed = setValue(initialFormState(), 'claim_summary', 'My own words');
    const { state, applied } = applyPrefill(typed, { claim_summary: 'AI text', quote_eur: '500' });
    expect(applied).toEqual(['quote_eur']);
    expect(state.values.claim_summary).toBe('My own words');
    expect(state.aiFilled).toEqual({ quote_eur: true });
  });
  it('the mark disappears when the user edits the field', () => {
    const filled = applyPrefill(initialFormState(), { quote_eur: '800', claim_summary: 'x' }).state;
    const edited = setValue(filled, 'quote_eur', '850');
    expect(edited.values.quote_eur).toBe('850');
    expect(edited.aiFilled).toEqual({ claim_summary: true });
  });
  it('the mark disappears when the user confirms the field, and the value stays', () => {
    const filled = applyPrefill(initialFormState(), { quote_eur: '800' }).state;
    const confirmed = confirmAiValue(filled, 'quote_eur');
    expect(confirmed.aiFilled).toEqual({});
    expect(confirmed.values.quote_eur).toBe('800');
    expect(confirmAiValue(confirmed, 'quote_eur')).toBe(confirmed);
  });
  it('an empty prefill changes nothing', () => {
    const state = initialFormState();
    expect(applyPrefill(state, {}).state).toBe(state);
  });
});

describe('attachments', () => {
  it('accepts PDFs and images, rejects other types', () => {
    expect(['a.pdf', 'b.PNG', 'c.jpeg', 'd.heic'].every(n => isAcceptedFile({ name: n, type: '' }))).toBe(true);
    expect(isAcceptedFile({ name: 'x', type: 'image/webp' })).toBe(true);
    expect(isAcceptedFile({ name: 'x.docx', type: 'application/msword' })).toBe(false);
    expect(isAcceptedFile({ name: 'x.exe', type: 'application/octet-stream' })).toBe(false);
  });
  it('sorts new files into accepted, rejected and duplicates (several at once, no size limit)', () => {
    const first = file('report.pdf');
    const big = file('huge-scan.pdf', 'application/pdf', 5_000_000);
    const result = sortNewFiles([first], [file('report.pdf'), file('photo.jpg', 'image/jpeg'), file('notes.txt', 'text/plain'), big]);
    expect(result.accepted.map(f => f.name)).toEqual(['photo.jpg', 'huge-scan.pdf']);
    expect(result.rejected.map(f => f.name)).toEqual(['notes.txt']);
    expect(result.duplicates.map(f => f.name)).toEqual(['report.pdf']);
  });
});
