import { fields, type FieldDef } from './fields.js';

export type FormValues = Record<string, string>;
export type FormErrors = Record<string, string>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const AMOUNT = /^\d+([.,]\d{1,2})?$/;
const earliestDate = '2000-01-01';

export const parseAmount = (value: string): number | null => (AMOUNT.test(value.trim()) ? Number(value.trim().replace(',', '.')) : null);
export const todayString = (now: Date): string => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

function check(field: FieldDef, raw: string, now: Date): string | null {
  const value = raw.trim();
  if (value === '') return field.required ? 'This field is required.' : null;
  if (field.maxLength !== undefined && value.length > field.maxLength) return `Use at most ${field.maxLength} characters.`;
  switch (field.kind) {
    case 'email': return EMAIL.test(value) ? null : 'Enter a valid email address, like name@example.com.';
    case 'number': {
      const n = parseAmount(value);
      if (n === null) return 'Enter an amount like 1250 or 1250.50.';
      if ((field.min !== undefined && n < field.min) || (field.max !== undefined && n > field.max)) return `The amount must be between ${field.min ?? 0} and ${(field.max ?? 0).toLocaleString('en')}.`;
      return null;
    }
    case 'date': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) return 'Enter a valid date.';
      if (value > todayString(now)) return 'The date cannot be in the future.';
      if (value < earliestDate) return 'Check the date: it is too far in the past.';
      return null;
    }
    case 'choice':
      return field.options?.some(o => o.value === value) ? null : 'Choose one of the options.';
    default:
      return field.pattern && !field.pattern.test(value) ? (field.patternMessage ?? 'Check this value.') : null;
  }
}

/** Returns one message per invalid field (keyed by field key). An empty object means the form is valid. */
export function validate(values: FormValues, now: Date = new Date()): FormErrors {
  const errors: FormErrors = {};
  for (const field of fields) {
    const message = check(field, values[field.key] ?? '', now);
    if (message) errors[field.key] = message;
  }
  return errors;
}
