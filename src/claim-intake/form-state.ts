import { fieldByKey, fields } from './fields.js';
import type { FormValues } from './validation.js';

/** Values proposed by the AI extraction, keyed by field key, as form strings ("yes", "1250", "motor_own_damage" ...). */
export type Prefill = Partial<Record<string, string>>;

export interface FormState {
  values: FormValues;
  /** Fields filled by the AI that the user has not edited or confirmed yet. */
  aiFilled: Record<string, true>;
}

export const initialFormState = (): FormState => ({ values: Object.fromEntries(fields.map(f => [f.key, ''])), aiFilled: {} });

const withoutKey = (marks: FormState['aiFilled'], key: string): FormState['aiFilled'] => {
  const { [key]: _removed, ...rest } = marks;
  return rest;
};

/** A user edit. It also clears the "filled by AI" mark of that field. */
export function setValue(state: FormState, key: string, value: string): FormState {
  if (!fieldByKey(key)) return state;
  return { values: { ...state.values, [key]: value }, aiFilled: withoutKey(state.aiFilled, key) };
}

/** The user confirms an AI-filled value as it is. */
export function confirmAiValue(state: FormState, key: string): FormState {
  return key in state.aiFilled ? { ...state, aiFilled: withoutKey(state.aiFilled, key) } : state;
}

/**
 * Applies AI-extracted values. It only fills fields that are still empty (never overwrites what the user
 * typed), only for known fields, and only with allowed options for choice fields. Every filled field is
 * marked "filled by AI" until the user edits or confirms it. Returns the keys that were filled.
 */
export function applyPrefill(state: FormState, prefill: Prefill): { state: FormState; applied: string[] } {
  const values = { ...state.values };
  const aiFilled = { ...state.aiFilled };
  const applied: string[] = [];
  for (const [key, raw] of Object.entries(prefill)) {
    const field = fieldByKey(key);
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!field || value === '' || (state.values[key] ?? '').trim() !== '') continue;
    if (field.kind === 'choice' && !field.options?.some(o => o.value === value)) continue;
    values[key] = value;
    aiFilled[key] = true;
    applied.push(key);
  }
  return { state: applied.length ? { values, aiFilled } : state, applied };
}
