import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fieldByKey, fields } from '../src/claim-intake/fields.js';
import { applyPrefill, applyVoiceAnswer, initialFormState, setValue, confirmAiValue, type FormState } from '../src/claim-intake/form-state.js';
import { buildPayload } from '../src/claim-intake/payload.js';
import { berlinToday } from '../src/claim-intake/voice/today.js';
import { TOOL_FIELD_KEYS, createVoiceTools, normalizeAnswer } from '../src/claim-intake/voice/tools.js';

/** The enum configured at ElevenLabs for fill_field.field. */
const AGENT_ENUM = ['claimant_name', 'claimant_email', 'policy_number', 'incident_date', 'license_plate', 'claim_type', 'claim_summary', 'repair_battery', 'quote_eur', 'injury_reported', 'liability_disputed', 'claimant_states_policy_active', 'incident_report_present', 'itemized_quote_present'];
const NOW = new Date('2026-11-08T10:00:00Z');

/** A tiny in-memory form behind the tool access, using the same pure state functions as the page. */
function setup(initial: FormState = initialFormState()) {
  let state = initial;
  const finished = vi.fn();
  const tools = createVoiceTools({
    getValues: () => state.values,
    applyAnswer: (key, value) => { const r = applyVoiceAnswer(state, key, value); state = r.state; return r.outcome; },
  }, { onFinished: finished, now: () => NOW });
  return { tools, finished, get state() { return state; }, user: (key: string, value: string) => { state = setValue(state, key, value); } };
}
const fill = (t: ReturnType<typeof setup>, field: unknown, value: unknown) => t.tools.fill_field({ field, value });

describe('tool names and field list match the ElevenLabs agent', () => {
  it('exposes exactly the three configured tools', () => {
    expect(Object.keys(setup().tools).sort()).toEqual(['fill_field', 'finish_interview', 'get_form_status']);
  });
  it('the field enum equals the form fields (same names, same order)', () => {
    expect(TOOL_FIELD_KEYS).toEqual(AGENT_ENUM);
    expect(fields.map(f => f.key)).toEqual(AGENT_ENUM);
  });
});

describe('fill_field: mapping of what the agent says to the form', () => {
  it.each([['yes', 'yes'], ['Yes', 'yes'], ['ja', 'yes'], ['No', 'no'], ['nein', 'no'], ['unknown', 'unknown'], ["Don't know", 'unknown'], ['weiß nicht', 'unknown']])('yes/no answer %j is stored as %s', (said, stored) => {
    const t = setup();
    expect(fill(t, 'injury_reported', said)).toBe(`saved: injury_reported = ${stored}`);
    expect(t.state.values.injury_reported).toBe(stored);
  });
  it('all yes/no/unknown fields accept the three answers and become true / false / null in the payload', () => {
    for (const key of ['injury_reported', 'liability_disputed', 'claimant_states_policy_active', 'incident_report_present', 'itemized_quote_present']) {
      const t = setup();
      fill(t, key, 'yes'); expect(buildPayload(t.state.values, { now: NOW, isTest: true })[key]).toBe(true);
      fill(t, key, 'no'); expect(buildPayload(t.state.values, { now: NOW, isTest: true })[key]).toBe(false);
      fill(t, key, 'unknown'); expect(buildPayload(t.state.values, { now: NOW, isTest: true })[key]).toBeNull();
    }
  });
  it('the battery question maps to repair_type', () => {
    for (const [said, repair] of [['yes', 'ev_high_voltage_battery'], ['no', 'standard'], ['unknown', null]] as const) {
      const t = setup(); fill(t, 'repair_battery', said);
      expect(buildPayload(t.state.values, { now: NOW, isTest: true }).repair_type).toBe(repair);
    }
  });
  it('claim_type takes the two values or their labels, nothing else', () => {
    const t = setup();
    expect(fill(t, 'claim_type', 'theft')).toBe('saved: claim_type = theft');
    expect(fill(t, 'claim_type', 'Damage to my own vehicle')).toBe('saved: claim_type = motor_own_damage');
    expect(fill(t, 'claim_type', 'glass only')).toMatch(/^error: not an allowed value. Use one of: motor_own_damage, theft/);
    expect(t.state.values.claim_type).toBe('motor_own_damage');
  });
  it.each([['2026-11-01', '2026-11-01'], ['1.11.2026', '2026-11-01'], ['01.11.2026', '2026-11-01']])('date %s -> %s', (said, stored) => {
    const t = setup();
    expect(fill(t, 'incident_date', said)).toBe(`saved: incident_date = ${stored}`);
  });
  it.each([['yesterday', /YYYY-MM-DD/], ['2026-02-30', /real calendar date/], ['31.02.2026', /real calendar date/], ['2026-11-20', /cannot be in the future/], ['1999-01-01', /too far in the past/]])('bad date %j gives a helpful error', (said, message) => {
    const t = setup();
    expect(fill(t, 'incident_date', said)).toMatch(message);
    expect(t.state.values.incident_date).toBe('');
  });
  it.each([['1250', '1250'], ['1250.50', '1250.5'], ['1250,50', '1250.5'], ['€1,250', '1250'], ['1.250,00 EUR', '1250'], [' 980 ', '980']])('amount %j -> %s', (said, stored) => {
    const t = setup();
    expect(fill(t, 'quote_eur', said)).toBe(`saved: quote_eur = ${stored}`);
  });
  it.each(['about a thousand', '1.250', '-5', '2000000', 'abc'])('unusable amount %j is an error, not a guess', said => {
    const t = setup();
    expect(fill(t, 'quote_eur', said)).toMatch(/^error:/);
    expect(t.state.values.quote_eur).toBe('');
  });
  it('plain text fields are trimmed and single-line fields lose extra spaces', () => {
    const t = setup();
    fill(t, 'claimant_name', '  Anna   Beispiel ');
    expect(t.state.values.claimant_name).toBe('Anna Beispiel');
    fill(t, 'claim_summary', ' Parking scrape on the rear bumper. ');
    expect(t.state.values.claim_summary).toBe('Parking scrape on the rear bumper.');
  });
});

describe('fill_field: errors are RETURNED as text, never thrown (the agent hides thrown errors)', () => {
  it('an invalid email comes back as an error string the agent can act on', () => {
    const t = setup();
    expect(fill(t, 'claimant_email', 'anna at example')).toBe('error: Enter a valid email address, like name@example.com.');
    expect(t.state.values.claimant_email).toBe('');
    expect(fill(t, 'claimant_email', 'anna@example.com')).toBe('saved: claimant_email = anna@example.com');
  });
  it.each([
    ['unknown field', 'shoe_size', 'x', /^error: unknown field "shoe_size"/],
    ['missing field', undefined, 'x', /^error: unknown field/],
    ['empty value', 'claimant_name', '   ', /^error: value is empty/],
    ['non-text value', 'claimant_name', 42, /^error: value must be text/],
    ['null value', 'claimant_name', null, /^error: value must be text/],
    ['too long', 'claim_summary', 'x'.repeat(2001), /^error: Use at most 2000 characters/],
    ['bad plate', 'license_plate', '!!', /^error:/],
    ['bad policy number', 'policy_number', '??', /^error:/],
  ])('%s', (_name, field, value, message) => {
    const t = setup();
    expect(() => fill(t, field, value)).not.toThrow();
    expect(fill(t, field, value)).toMatch(message);
  });
  it('garbage parameters never throw', () => {
    const t = setup();
    for (const params of [undefined, null, 'text', 5, [], {}, { field: {} }, { field: 'claim_type', value: {} }]) {
      expect(() => t.tools.fill_field(params)).not.toThrow();
      expect(t.tools.fill_field(params)).toMatch(/^error:/);
    }
  });
  it('even if the form access itself fails, the tool answers with an error string', () => {
    const tools = createVoiceTools({ getValues: () => { throw new Error('boom'); }, applyAnswer: () => { throw new Error('boom'); } }, { onFinished: () => { throw new Error('boom'); } });
    expect(tools.fill_field({ field: 'claimant_name', value: 'Anna' })).toMatch(/^error: could not save this answer \(boom\)/);
    expect(tools.get_form_status()).toMatch(/^error:/);
    expect(() => tools.finish_interview()).not.toThrow();
  });
});

describe('what the agent may and may not overwrite', () => {
  it('a voice answer is marked "Filled by AI" and can be corrected by the agent', () => {
    const t = setup();
    fill(t, 'claimant_name', 'Ana Beispiel');
    expect(t.state.aiFilled.claimant_name).toBe(true);
    expect(fill(t, 'claimant_name', 'Anna Beispiel')).toBe('saved: claimant_name = Anna Beispiel');
    expect(t.state.values.claimant_name).toBe('Anna Beispiel');
  });
  it('the agent can still correct a value after the user clicked "Looks right" (confirming is not editing)', () => {
    let state = applyVoiceAnswer(initialFormState(), 'quote_eur', '900').state;
    state = confirmAiValue(state, 'quote_eur');
    expect(state.aiFilled.quote_eur).toBeUndefined();
    const corrected = applyVoiceAnswer(state, 'quote_eur', '950');
    expect(corrected.outcome).toBe('saved');
    expect(corrected.state.values.quote_eur).toBe('950');
    expect(corrected.state.aiFilled.quote_eur).toBe(true);
  });
  it('never overwrites what the user typed on screen', () => {
    const t = setup();
    t.user('claimant_email', 'typed@example.com');
    const answer = fill(t, 'claimant_email', 'voice@example.com');
    expect(answer).toMatch(/^kept: the user already typed a value/);
    expect(t.state.values.claimant_email).toBe('typed@example.com');
    expect(t.state.aiFilled.claimant_email).toBeUndefined();
  });
  it('once the user edits an AI value, the agent may no longer overwrite it', () => {
    const t = setup();
    fill(t, 'claim_summary', 'First version');
    t.user('claim_summary', 'My own wording');
    expect(fill(t, 'claim_summary', 'Agent rewrite')).toMatch(/^kept:/);
    expect(t.state.values.claim_summary).toBe('My own wording');
  });
  it('document prefill also counts as written by the AI', () => {
    const state = applyPrefill(initialFormState(), { quote_eur: '500' }).state;
    expect(applyVoiceAnswer(state, 'quote_eur', '600')).toMatchObject({ outcome: 'saved' });
  });
});

describe('get_form_status', () => {
  it('lists missing required, invalid and unanswered optional fields', () => {
    const t = setup();
    expect(t.tools.get_form_status()).toBe('required_missing: claimant_name, claimant_email, claim_type, claim_summary | invalid: none | optional_unanswered: policy_number, incident_date, license_plate, repair_battery, quote_eur, injury_reported, liability_disputed, claimant_states_policy_active, incident_report_present, itemized_quote_present');
  });
  it('reports a bad value the user typed, and shrinks as answers come in', () => {
    const t = setup();
    t.user('claimant_email', 'broken');
    fill(t, 'claimant_name', 'Anna'); fill(t, 'claim_type', 'theft'); fill(t, 'claim_summary', 'My car was stolen.');
    const status = t.tools.get_form_status();
    expect(status).toContain('required_missing: none');
    expect(status).toContain('invalid: claimant_email (Enter a valid email address');
    fill(t, 'injury_reported', 'no');
    expect(t.tools.get_form_status()).not.toContain('injury_reported');
  });
  it('when everything required is valid it says so', () => {
    const t = setup();
    for (const [k, v] of [['claimant_name', 'Anna'], ['claimant_email', 'a@b.de'], ['claim_type', 'theft'], ['claim_summary', 'Stolen car, found empty.']]) fill(t, k, v);
    expect(t.tools.get_form_status()).toMatch(/^required_missing: none \| invalid: none \| optional_unanswered: /);
  });
});

describe('finish_interview', () => {
  it('tells the page the interview is over', () => {
    const t = setup();
    expect(t.tools.finish_interview()).toBe('ok');
    expect(t.finished).toHaveBeenCalledOnce();
  });
});

describe('dynamic variable {{today}}', () => {
  it('is the date in Europe/Berlin as YYYY-MM-DD', () => {
    expect(berlinToday(new Date('2026-11-08T10:00:00Z'))).toBe('2026-11-08');
  });
  it('differs from the UTC date around midnight (winter: UTC+1, summer: UTC+2)', () => {
    expect(berlinToday(new Date('2026-11-08T23:30:00Z'))).toBe('2026-11-09');
    expect(berlinToday(new Date('2026-07-08T22:30:00Z'))).toBe('2026-07-09');
    expect(berlinToday(new Date('2026-07-08T21:30:00Z'))).toBe('2026-07-08');
  });
});

describe('normalizeAnswer is strict about types', () => {
  it('rejects non-strings for every field kind', () => {
    for (const f of fields) expect(normalizeAnswer(f, 123).ok).toBe(false);
    expect(normalizeAnswer(fieldByKey('claim_type')!, 'theft')).toEqual({ ok: true, value: 'theft' });
  });
});

describe('no secrets and no agent ID in code that ships to the browser', () => {
  const root = new URL('..', import.meta.url).pathname;
  const files = [...walk(join(root, 'src/claim-intake')), ...walk(join(root, 'web/src')).filter(f => !f.endsWith('.test.ts')), join(root, 'web/claim/index.html')];
  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  }
  it.each(files)('%s', file => {
    const text = readFileSync(file, 'utf8');
    expect(text).not.toMatch(/xi-api-key|ELEVENLABS_API_KEY|ELEVENLABS_AGENT_ID|VITE_ELEVEN/i);
    expect(text).not.toMatch(/agent_[0-9a-z]{20,}/);
  });
  it('the session is started with a signed URL, never with an agent ID', () => {
    const text = readFileSync(join(root, 'src/claim-intake/voice/VoicePanel.tsx'), 'utf8');
    expect(text).toMatch(/startSession\(\{ signedUrl/);
    expect(text).not.toMatch(/agentId/);
  });
});
