import { parseNumber } from '../../policy-engine/values.js';
import { fieldByKey, fields, type FieldDef } from '../fields.js';
import type { VoiceOutcome } from '../form-state.js';
import { validate, validateField, type FormValues } from '../validation.js';

/**
 * The three client tools of the ElevenLabs agent "Claim Intake (Hack MUC)". The tool NAMES and the field list
 * must match the agent's configuration exactly. They only fill the form: the user checks everything and submits.
 *
 * IMPORTANT: the agent hides thrown errors from client tools (tool_error_handling_mode "auto"). So these tools
 * never throw. A problem is returned as a normal string starting with "error:" that the agent can read and act on.
 */

/** The values the agent may pass as `field`. Equal to the enum configured at ElevenLabs. */
export const TOOL_FIELD_KEYS: string[] = fields.map(f => f.key);

export interface VoiceFormAccess {
  /** Current form values, always up to date. */
  getValues: () => FormValues;
  /** Writes one answer: 'saved', or 'kept' when the user already typed a value on screen. */
  applyAnswer: (key: string, value: string) => VoiceOutcome;
}

const YES = new Set(['yes', 'ja', 'y', 'j', 'true', 'yeah', 'yep', 'jawohl']);
const NO = new Set(['no', 'nein', 'n', 'false', 'nope', 'nee']);
const UNKNOWN = new Set(['unknown', "don't know", 'dont know', 'do not know', 'not sure', 'unsure', 'weiß nicht', 'weiss nicht', 'keine ahnung', 'unbekannt', 'nicht sicher']);

export type Normalized = { ok: true; value: string } | { ok: false; error: string };
const bad = (error: string): Normalized => ({ ok: false, error });

function normalizeDate(value: string): Normalized {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : german ? [german[3], german[2].padStart(2, '0'), german[1].padStart(2, '0')] : [];
  if (!y) return bad('The date must be YYYY-MM-DD. Work it out from today\'s date and ask the user to confirm it.');
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== `${y}-${m}-${d}`) return bad('That is not a real calendar date. Ask the user to repeat it.');
  return { ok: true, value: `${y}-${m}-${d}` };
}

/** Turns what the agent sent into the string the form field stores, or explains what is wrong. */
export function normalizeAnswer(field: FieldDef, raw: unknown): Normalized {
  if (typeof raw !== 'string') return bad('value must be text.');
  const value = raw.trim();
  if (value === '') return bad('value is empty. If the user skipped this question, do not save anything for it.');
  if (field.kind === 'choice') {
    const lower = value.toLowerCase();
    const options = field.options ?? [];
    const direct = options.find(o => o.value === lower || o.label.toLowerCase() === lower);
    if (direct) return { ok: true, value: direct.value };
    if (options.some(o => o.value === 'unknown')) {
      if (YES.has(lower)) return { ok: true, value: 'yes' };
      if (NO.has(lower)) return { ok: true, value: 'no' };
      if (UNKNOWN.has(lower)) return { ok: true, value: 'unknown' };
    }
    return bad(`not an allowed value. Use one of: ${options.map(o => o.value).join(', ')}.`);
  }
  if (field.kind === 'date') return normalizeDate(value);
  if (field.kind === 'number') {
    const n = parseNumber(value);
    if (n === null) return bad('could not read the amount. Ask the user to repeat the amount in euros, digits only (for example 1250 or 1250.50).');
    return { ok: true, value: String(n) };
  }
  return { ok: true, value: field.kind === 'textarea' ? value : value.replace(/\s+/g, ' ') };
}

export interface VoiceToolHooks { onFinished: () => void; now?: () => Date }

/** Builds the client tools in the shape @elevenlabs/react expects (name -> function returning a string). */
export function createVoiceTools(access: VoiceFormAccess, hooks: VoiceToolHooks) {
  const now = () => hooks.now?.() ?? new Date();

  function fill_field(params: unknown): string {
    try {
      const { field: key, value } = (params ?? {}) as { field?: unknown; value?: unknown };
      const field = typeof key === 'string' ? fieldByKey(key) : undefined;
      if (!field) return `error: unknown field "${String(key)}". Use one of: ${TOOL_FIELD_KEYS.join(', ')}.`;
      const normalized = normalizeAnswer(field, value);
      if (!normalized.ok) return `error: ${normalized.error}`;
      const problem = validateField(field, normalized.value, now());
      if (problem) return `error: ${problem}`;
      const outcome = access.applyAnswer(field.key, normalized.value);
      if (outcome === 'kept') {
        return `kept: the user already typed a value for "${field.key}" on the screen, so nothing was changed. Do not overwrite it; ask the user to change it on the screen if they want to.`;
      }
      return `saved: ${field.key} = ${normalized.value}`;
    } catch (error) {
      return `error: could not save this answer (${error instanceof Error ? error.message : 'unexpected problem'}). Ask the user to fill it in on the screen.`;
    }
  }

  function get_form_status(): string {
    try {
      const values = access.getValues();
      const errors = validate(values, now());
      const empty = (key: string) => (values[key] ?? '').trim() === '';
      const missing = fields.filter(f => f.required && empty(f.key)).map(f => f.key);
      const invalid = Object.entries(errors).filter(([key]) => !empty(key)).map(([key, message]) => `${key} (${message})`);
      const optional = fields.filter(f => !f.required && empty(f.key)).map(f => f.key);
      const parts = [
        missing.length ? `required_missing: ${missing.join(', ')}` : 'required_missing: none',
        invalid.length ? `invalid: ${invalid.join('; ')}` : 'invalid: none',
        `optional_unanswered: ${optional.length ? optional.join(', ') : 'none'}`,
      ];
      return parts.join(' | ');
    } catch {
      return 'error: could not read the form. Ask the user to check it on the screen.';
    }
  }

  function finish_interview(): string {
    try { hooks.onFinished(); } catch { /* the page keeps working without the banner */ }
    return 'ok';
  }

  return { fill_field, get_form_status, finish_interview };
}

