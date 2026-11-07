import { fieldByKey, fields } from './fields.js';
import type { FormValues } from './validation.js';

/** Values proposed by the AI extraction, keyed by field key, as form strings ("yes", "1250", "motor_own_damage" ...). */
export type Prefill = Partial<Record<string, string>>;

export interface FormState {
  values: FormValues;
  /** Fields filled by the AI that the user has not edited or confirmed yet. */
  aiFilled: Record<string, true>;
  /** Fields whose current value was written by the AI/voice agent and not edited by the user since. The agent may correct these. */
  agentSet: Record<string, true>;
}

export const initialFormState = (): FormState => ({ values: Object.fromEntries(fields.map(f => [f.key, ''])), aiFilled: {}, agentSet: {} });

const withoutKey = (marks: FormState['aiFilled'], key: string): FormState['aiFilled'] => {
  const { [key]: _removed, ...rest } = marks;
  return rest;
};

/** A user edit. It also clears the "filled by AI" mark of that field. */
export function setValue(state: FormState, key: string, value: string): FormState {
  if (!fieldByKey(key)) return state;
  return { values: { ...state.values, [key]: value }, aiFilled: withoutKey(state.aiFilled, key), agentSet: withoutKey(state.agentSet, key) };
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
  const agentSet = { ...state.agentSet };
  const applied: string[] = [];
  for (const [key, raw] of Object.entries(prefill)) {
    const field = fieldByKey(key);
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!field || value === '' || (state.values[key] ?? '').trim() !== '') continue;
    if (field.kind === 'choice' && !field.options?.some(o => o.value === value)) continue;
    values[key] = value;
    aiFilled[key] = true;
    agentSet[key] = true;
    applied.push(key);
  }
  return { state: applied.length ? { values, aiFilled, agentSet } : state, applied };
}

export type VoiceOutcome = 'saved' | 'kept';

/**
 * One answer from the voice agent. It fills an empty field, or corrects a value the agent wrote earlier
 * (the user may have said "no, change that"). It never overwrites what the user typed: that returns 'kept'.
 * Either way the field is marked "Filled by AI, please check" until the user edits or confirms it.
 */
export function applyVoiceAnswer(state: FormState, key: string, value: string): { state: FormState; outcome: VoiceOutcome } {
  if (!fieldByKey(key)) return { state, outcome: 'kept' };
  const current = (state.values[key] ?? '').trim();
  if (current !== '' && !(key in state.agentSet)) return { state, outcome: 'kept' };
  return {
    state: { values: { ...state.values, [key]: value }, aiFilled: { ...state.aiFilled, [key]: true }, agentSet: { ...state.agentSet, [key]: true } },
    outcome: 'saved',
  };
}
