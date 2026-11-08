import type { Condition, FieldDef, Leaf, Outcome, PolicyDocument } from '../policy-engine/schema.js';

/** Plain-language rendering of a policy, straight from the JSON. No AI involved. */

export const outcomeLabels: Record<Outcome, string> = {
  routine_processing: 'Routine processing',
  request_information: 'Request information',
  human_review: 'Human review',
};

export const fieldLabel = (fields: PolicyDocument['fields'], name: string): string => fields[name]?.label ?? name;

const number = new Intl.NumberFormat('en-IE', { maximumFractionDigits: 2 });
export function formatValue(value: unknown): string {
  if (typeof value === 'number') return number.format(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return `“${String(value)}”`;
}

export function describeLeaf(leaf: Leaf, fields: Record<string, FieldDef>): string {
  const label = fieldLabel(fields, leaf.field);
  const v = leaf.value;
  const isBool = fields[leaf.field]?.type === 'boolean';
  const list = Array.isArray(v) ? v.map(formatValue).join(', ') : '';
  switch (leaf.op) {
    case 'eq': return isBool ? `${label}: ${formatValue(v)}` : `${label} is ${formatValue(v)}`;
    case 'neq': return isBool ? `${label}: ${formatValue(!v)}` : `${label} is not ${formatValue(v)}`;
    case 'gt': return `${label} above ${formatValue(v)}`;
    case 'gte': return `${label} at least ${formatValue(v)}`;
    case 'lt': return `${label} below ${formatValue(v)}`;
    case 'lte': return `${label} at most ${formatValue(v)}`;
    case 'in': return `${label} is one of ${list}`;
    case 'not_in': return `${label} is none of ${list}`;
    case 'is_empty': return `${label} missing or unreadable`;
    case 'is_not_empty': return `${label} present`;
  }
}

/** One-line text for a whole condition, e.g. for diffs. Nested groups are parenthesised. */
export function conditionToText(c: Condition, fields: Record<string, FieldDef>, nested = false): string {
  if ('all' in c || 'any' in c) {
    const [word, items] = 'all' in c ? ['AND', c.all] : ['OR', c.any];
    const text = items.map(child => conditionToText(child, fields, true)).join(` ${word} `);
    return nested && items.length > 1 ? `(${text})` : text;
  }
  return describeLeaf(c, fields);
}

export const isGroup = (c: Condition): c is { all: Condition[] } | { any: Condition[] } => 'all' in c || 'any' in c;
export const groupKind = (c: Condition): 'all' | 'any' | 'leaf' => ('all' in c ? 'all' : 'any' in c ? 'any' : 'leaf');
export const groupChildren = (c: Condition): Condition[] => ('all' in c ? c.all : 'any' in c ? c.any : []);
export const groupHeading = (kind: 'all' | 'any'): string => (kind === 'all' ? 'All of these apply:' : 'Any of these applies:');
