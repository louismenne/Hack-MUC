import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validatePolicy, type PolicyDocument } from '../src/policy-engine/index.js';
import { conditionToText, describeLeaf } from '../src/policy-view/describe.js';
import { diffPolicies } from '../src/policy-view/diff.js';
import { parseEditedValue, setLeafValue } from '../src/policy-view/edit.js';

const json = JSON.parse(readFileSync(new URL('../policies/policy-v1.rules.json', import.meta.url), 'utf8'));
const load = (doc: unknown): PolicyDocument => { const r = validatePolicy(doc); if (!r.ok) throw new Error(r.errors.join('\n')); return r.policy; };
const v1 = load(json);
const copy = () => structuredClone(json);

describe('plain-language rendering', () => {
  it('describes leaves in German', () => {
    expect(describeLeaf({ field: 'quote_eur', op: 'gt', value: 1500 }, v1.fields)).toBe('Repair quote (EUR) ist größer als 1.500');
    expect(describeLeaf({ field: 'injury_reported', op: 'eq', value: true }, v1.fields)).toBe('Injury reported: ja');
    expect(describeLeaf({ field: 'claim_type', op: 'neq', value: 'motor_own_damage' }, v1.fields)).toBe('Claim type ist nicht „motor_own_damage“');
    expect(describeLeaf({ field: 'repair_type', op: 'in', value: ['a', 'b'] }, v1.fields)).toBe('Repair type ist eines von „a“, „b“');
    expect(describeLeaf({ field: 'repair_type', op: 'is_empty' }, v1.fields)).toBe('Repair type fehlt oder ist unlesbar');
  });
  it('joins conditions and parenthesises nested groups', () => {
    const text = conditionToText({ all: [{ field: 'injury_reported', op: 'eq', value: true }, { any: [{ field: 'quote_eur', op: 'gt', value: 1 }, { field: 'quote_eur', op: 'lt', value: 0 }] }] }, v1.fields);
    expect(text).toContain(' UND (');
    expect(text).toContain(' ODER ');
  });
});

describe('diff between versions', () => {
  it('is empty for identical policies', () => expect(diffPolicies(v1, v1)).toEqual([]));

  it('reports a changed threshold as old → new', () => {
    const next = copy(); next.rules[0].when.any[6].value = 1200;
    const changes = diffPolicies(v1, load(next));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'changed', ruleId: 'rule1' });
    expect(changes[0].text).toBe('Regel „rule1“: Repair quote (EUR) größer als: 1.500 → 1.200');
  });
  it('reports added and removed rules, conditions, outcome, order and default', () => {
    const next = copy();
    next.rules.push({ id: 'ev_battery', description: 'EV', when: { field: 'repair_type', op: 'eq', value: 'ev_high_voltage_battery' }, outcome: 'human_review' });
    next.rules[0].when.any.push({ field: 'repair_type', op: 'eq', value: 'x' });
    next.rules[0].when.any.splice(1, 1);
    next.rules[1].outcome = 'human_review';
    next.rules.splice(2, 1);
    next.default.outcome = 'request_information';
    const text = diffPolicies(v1, load(next)).map(c => c.text).join('\n');
    expect(text).toContain('Regel „ev_battery“ hinzugefügt');
    expect(text).toContain('Regel „missing_input“ entfernt');
    expect(text).toContain('Bedingung hinzugefügt: Repair type ist „x“');
    expect(text).toContain('Bedingung entfernt: Claim type ist nicht „motor_own_damage“');
    expect(text).toContain('Regel „rule2“: Ergebnis Informationen anfordern → Manuelle Prüfung');
    expect(text).toContain('Standardergebnis: Routinebearbeitung → Informationen anfordern');
  });
  it('reports a changed order (priority)', () => {
    const next = copy(); next.rules.reverse();
    expect(diffPolicies(v1, load(next)).map(c => c.text).join('\n')).toContain('Reihenfolge (= Priorität) geändert');
  });
});

describe('manual editing helpers', () => {
  it('replaces one leaf value without touching the original', () => {
    const next = setLeafValue(v1, 0, [6], 1200);
    expect((next.rules[0].when as { any: { value: unknown }[] }).any[6].value).toBe(1200);
    expect((v1.rules[0].when as { any: { value: unknown }[] }).any[6].value).toBe(1500);
    expect(validatePolicy(next).ok).toBe(true);
  });
  it('rejects bad paths', () => {
    expect(() => setLeafValue(v1, 0, [99], 1)).toThrow();
    expect(() => setLeafValue(v1, 0, [], 1)).toThrow();
    expect(() => setLeafValue(v1, 9, [0], 1)).toThrow();
  });
  it.each([
    ['quote_eur', '1200', false, 1200], ['quote_eur', '1200,5', false, 1200.5], ['quote_eur', 'abc', false, null], ['quote_eur', '-3', false, null],
    ['injury_reported', 'true', false, true], ['injury_reported', 'maybe', false, null],
    ['claim_type', ' theft ', false, 'theft'], ['claim_type', '', false, null],
    ['repair_type', 'a, b', true, ['a', 'b']], ['repair_type', 'a,,b', true, null],
  ])('parses %s %j (list=%s)', (field, text, asList, expected) => {
    expect(parseEditedValue(v1.fields[field], text, asList)).toEqual(expected);
  });
});
