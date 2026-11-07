import { z } from 'zod';

export const OUTCOMES = ['routine_processing', 'request_information', 'human_review'] as const;
export const COMPARISON_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in'] as const;
export const PRESENCE_OPS = ['is_empty', 'is_not_empty'] as const;
export const FIELD_TYPES = ['boolean', 'number', 'string', 'enum'] as const;

export type Outcome = (typeof OUTCOMES)[number];
export type FieldType = (typeof FIELD_TYPES)[number];
export type Scalar = string | number | boolean;
export type Operator = (typeof COMPARISON_OPS)[number] | (typeof PRESENCE_OPS)[number];

export interface FieldDef { type: FieldType; label?: string; values?: string[] }
export interface Leaf { field: string; op: Operator; value?: Scalar | Scalar[] }
export type Condition = { all: Condition[] } | { any: Condition[] } | Leaf;
export interface Rule { id: string; description: string; when: Condition; outcome: Outcome }
export interface PolicyDefault { id: string; description: string; outcome: Outcome }
export interface PolicyDocument {
  schemaVersion: 1;
  fields: Record<string, FieldDef>;
  rules: Rule[];
  default: PolicyDefault;
}

export const MAX_RULES = 100;
export const MAX_DEPTH = 6;
const MAX_CHILDREN = 50;
const MAX_LIST = 50;

const id = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, 'ids are lowercase letters, digits and _ (max 64)');
const fieldName = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const text = z.string().trim().min(1).max(500);
const outcome = z.enum(OUTCOMES);

const fieldDef = z.strictObject({
  type: z.enum(FIELD_TYPES),
  label: text.optional(),
  values: z.array(z.string().min(1).max(100)).min(1).max(MAX_LIST).optional(),
});

const policyShape = z.strictObject({
  schemaVersion: z.literal(1),
  fields: z.record(fieldName, fieldDef).refine(f => Object.keys(f).length >= 1 && Object.keys(f).length <= 100, 'between 1 and 100 fields'),
  rules: z.array(z.strictObject({ id, description: text, when: z.unknown(), outcome })).min(1).max(MAX_RULES),
  default: z.strictObject({ id, description: text, outcome }),
});

function checkLeaf(l: Leaf, fields: Record<string, FieldDef>, path: string, ctx: z.RefinementCtx) {
  const def = fields[l.field];
  const bad = (message: string) => ctx.addIssue({ code: 'custom', message: `${path}: ${message}` });
  if (!def) return bad(`unknown field "${l.field}"`);
  if (l.op === 'is_empty' || l.op === 'is_not_empty') {
    if (l.value !== undefined) bad(`${l.op} takes no value`);
    return;
  }
  if (l.value === undefined) return bad(`${l.op} needs a value`);
  const list = l.op === 'in' || l.op === 'not_in';
  if (list !== Array.isArray(l.value)) return bad(list ? `${l.op} needs a list` : `${l.op} needs a single value`);
  const expected = def.type === 'enum' ? 'string' : def.type;
  for (const v of list ? (l.value as Scalar[]) : [l.value as Scalar]) {
    if (typeof v !== expected) bad(`field "${l.field}" is ${def.type}, got ${typeof v} value`);
    else if (def.type === 'enum' && !def.values?.includes(v as string)) bad(`"${v}" is not an allowed value of "${l.field}"`);
  }
  const ordering = l.op === 'gt' || l.op === 'gte' || l.op === 'lt' || l.op === 'lte';
  if (ordering && def.type !== 'number') bad(`${l.op} only works on number fields ("${l.field}" is ${def.type})`);
  if ((l.op === 'eq' || l.op === 'neq') && Array.isArray(l.value)) bad(`${l.op} needs a single value`);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isScalar = (v: unknown): v is Scalar => (typeof v === 'string' && v.length <= 200) || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));
const LEAF_KEYS = ['field', 'op', 'value'];
const ALL_OPS: readonly string[] = [...COMPARISON_OPS, ...PRESENCE_OPS];

/** Checks a condition's structure and, for leaves, its fit with the declared fields. Messages name the path. */
function walk(c: unknown, fields: Record<string, FieldDef>, path: string, depth: number, ctx: z.RefinementCtx) {
  const bad = (message: string) => void ctx.addIssue({ code: 'custom', message: `${path}: ${message}` });
  if (!isObject(c)) return bad('a condition must be an object like {"field", "op", "value"}, {"all": [...]} or {"any": [...]}');
  if (depth > MAX_DEPTH) return bad(`nested deeper than ${MAX_DEPTH} levels`);
  for (const group of ['all', 'any'] as const) {
    if (!(group in c)) continue;
    const children = c[group];
    if (Object.keys(c).length !== 1) return bad(`"${group}" must be the only key`);
    if (!Array.isArray(children) || children.length < 1 || children.length > MAX_CHILDREN) return bad(`"${group}" needs a list of 1 to ${MAX_CHILDREN} conditions`);
    return children.forEach((child, i) => walk(child, fields, `${path}.${group}[${i}]`, depth + 1, ctx));
  }
  const extra = Object.keys(c).filter(k => !LEAF_KEYS.includes(k));
  if (extra.length) return bad(`unexpected property "${extra[0]}" (allowed: field, op, value)`);
  if (typeof c.op !== 'string' || !ALL_OPS.includes(c.op)) return bad(`unknown operator ${JSON.stringify(c.op)} (allowed: ${ALL_OPS.join(', ')})`);
  if (typeof c.field !== 'string') return bad('"field" must be a field name');
  const op = c.op as Operator;
  const def = fields[c.field];
  if (!def) return bad(`unknown field "${c.field}"`);
  const value = c.value;
  if (op === 'is_empty' || op === 'is_not_empty') return value === undefined ? undefined : bad(`${op} takes no value`);
  if (value === undefined) return bad(`${op} needs a value`);
  const list = op === 'in' || op === 'not_in';
  if (list !== Array.isArray(value)) return bad(list ? `${op} needs a list of values` : `${op} needs a single value`);
  const items = list ? (value as unknown[]) : [value];
  if (list && (items.length < 1 || items.length > MAX_LIST)) return bad(`${op} needs 1 to ${MAX_LIST} values`);
  const expected = def.type === 'enum' ? 'string' : def.type;
  for (const v of items) {
    if (!isScalar(v)) bad(`invalid value ${JSON.stringify(v)}`);
    else if (typeof v !== expected) bad(`field "${c.field}" is ${def.type}, got ${typeof v} value ${JSON.stringify(v)}`);
    else if (def.type === 'enum' && !def.values?.includes(v as string)) bad(`"${v}" is not an allowed value of "${c.field}" (allowed: ${def.values?.join(', ')})`);
  }
  if ((op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') && def.type !== 'number') bad(`${op} only works on number fields ("${c.field}" is ${def.type})`);
}

export const policySchema = policyShape.superRefine((doc, ctx) => {
  for (const [name, def] of Object.entries(doc.fields)) {
    if (def.type === 'enum' && !def.values) ctx.addIssue({ code: 'custom', message: `fields.${name}: enum needs "values"` });
    if (def.type !== 'enum' && def.values) ctx.addIssue({ code: 'custom', message: `fields.${name}: only enum fields have "values"` });
  }
  const ids = new Set<string>();
  for (const rid of [...doc.rules.map(r => r.id), doc.default.id]) {
    if (ids.has(rid)) ctx.addIssue({ code: 'custom', message: `duplicate rule id "${rid}"` });
    ids.add(rid);
  }
  doc.rules.forEach((rule, i) => walk(rule.when, doc.fields, `rules[${i}](${rule.id}).when`, 1, ctx));
});

export type ValidationResult = { ok: true; policy: PolicyDocument } | { ok: false; errors: string[] };

/** Validates untrusted JSON (upload, edit, or an AI suggestion). Returns readable errors instead of throwing. */
export function validatePolicy(input: unknown): ValidationResult {
  const parsed = policySchema.safeParse(input);
  if (parsed.success) return { ok: true, policy: parsed.data as unknown as PolicyDocument };
  return { ok: false, errors: parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`) };
}
