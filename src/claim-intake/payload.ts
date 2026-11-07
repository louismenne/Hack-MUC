import { fields, systemColumns, type ColumnValue, type FieldDef } from './fields.js';
import { parseAmount, type FormValues } from './validation.js';

export type ClaimPayload = Record<string, ColumnValue>;

function toColumnValue(field: FieldDef, raw: string): ColumnValue {
  const value = raw.trim();
  if (value === '') return null;
  if (field.toColumn) return field.toColumn(value);
  if (field.kind === 'number') return parseAmount(value);
  return value;
}

/**
 * The exact row that will later be inserted into the claims table: column names come from fields.ts.
 * "Don't know" and unanswered questions are null, never a guess.
 */
export function buildPayload(values: FormValues, options: { now?: Date; isTest: boolean }): ClaimPayload {
  const now = options.now ?? new Date();
  const context = { now, isTest: options.isTest };
  const payload: ClaimPayload = {};
  for (const c of systemColumns.filter(s => s.position === 'before')) payload[c.column] = c.value(context);
  for (const f of fields) payload[f.column] = toColumnValue(f, values[f.key] ?? '');
  for (const c of systemColumns.filter(s => s.position === 'after')) payload[c.column] = c.value(context);
  return payload;
}
