import type { Condition, PolicyDocument } from './schema.js';

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
};

/** JSONB can reorder keys. Only identical policy documents share an evaluation label set. */
export const samePolicy = (a: PolicyDocument, b: PolicyDocument): boolean => canonical(a) === canonical(b);

/** Display a limit only when exceeding it unconditionally triggers the first review rule.
 * Nested ANDs, multiple thresholds and earlier rules cannot safely be summarized as one limit.
 */
export function reviewQuoteLimit(policy: PolicyDocument): number | null {
  const first = policy.rules[0];
  if (!first || first.outcome !== 'human_review' || policy.fields.quote_eur?.type !== 'number') return null;
  const leaves = (condition: Condition): Condition[] => 'any' in condition ? condition.any.flatMap(leaves) : [condition];
  const thresholds = leaves(first.when).filter(c => 'field' in c && c.field === 'quote_eur');
  if (thresholds.length !== 1) return null;
  const leaf = thresholds[0];
  return 'field' in leaf && leaf.op === 'gt' && typeof leaf.value === 'number' && leaf.value > 0 ? leaf.value : null;
}
