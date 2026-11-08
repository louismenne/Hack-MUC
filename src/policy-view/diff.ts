import type { Condition, Leaf, PolicyDocument, Rule } from '../policy-engine/schema.js';
import { conditionToText, describeLeaf, fieldLabel, formatValue, groupChildren, groupKind, outcomeLabels } from './describe.js';

export interface Change { kind: 'added' | 'removed' | 'changed'; ruleId?: string; text: string }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function leaves(c: Condition): Leaf[] {
  return groupKind(c) === 'leaf' ? [c as Leaf] : groupChildren(c).flatMap(leaves);
}

const OP_WORDS: Record<string, string> = {
  eq: 'is', neq: 'is not', gt: 'above', gte: 'at least', lt: 'below', lte: 'at most',
  in: 'one of', not_in: 'none of', is_empty: 'missing', is_not_empty: 'present',
};

/** Leaf-level changes of one rule's condition, e.g. "Repair quote (EUR) above: 1,500 → 1,200". */
function diffCondition(ruleId: string, a: Condition, b: Condition, fields: PolicyDocument['fields']): Change[] {
  const out: Change[] = [];
  const push = (kind: Change['kind'], text: string) => out.push({ kind, ruleId, text });
  const oldLeaves = leaves(a), newLeaves = leaves(b);
  const unmatchedOld: Leaf[] = [];
  const pool = [...newLeaves];
  for (const o of oldLeaves) {
    const i = pool.findIndex(n => n.field === o.field && n.op === o.op);
    if (i < 0) { unmatchedOld.push(o); continue; }
    const [n] = pool.splice(i, 1);
    if (!same(o.value, n.value)) {
      const label = fieldLabel(fields, o.field);
      const fmt = (v: unknown) => (Array.isArray(v) ? v.map(formatValue).join(', ') : formatValue(v));
      push('changed', `${label} ${OP_WORDS[o.op]}: ${fmt(o.value)} → ${fmt(n.value)}`);
    }
  }
  for (const o of unmatchedOld) {
    const i = pool.findIndex(n => n.field === o.field);
    if (i >= 0) { const [n] = pool.splice(i, 1); push('changed', `Condition changed: ${describeLeaf(o, fields)} → ${describeLeaf(n, fields)}`); }
    else push('removed', `Condition removed: ${describeLeaf(o, fields)}`);
  }
  for (const n of pool) push('added', `Condition added: ${describeLeaf(n, fields)}`);
  if (groupKind(a) !== groupKind(b) && groupKind(a) !== 'leaf' && groupKind(b) !== 'leaf') {
    push('changed', `Logic changed: ${groupKind(a) === 'any' ? 'any' : 'all'} → ${groupKind(b) === 'any' ? 'any' : 'all'}`);
  }
  if (!out.length) push('changed', 'Condition nesting changed');
  return out;
}

/** Plain-language differences between two policy versions (`a` = older/base, `b` = newer). */
export function diffPolicies(a: PolicyDocument, b: PolicyDocument): Change[] {
  const changes: Change[] = [];
  const aById = new Map(a.rules.map(r => [r.id, r]));
  const bById = new Map(b.rules.map(r => [r.id, r]));
  const describeRule = (r: Rule, f: PolicyDocument['fields']) => `${conditionToText(r.when, f)} → ${outcomeLabels[r.outcome]}`;

  for (const r of a.rules) if (!bById.has(r.id)) changes.push({ kind: 'removed', ruleId: r.id, text: `Rule “${r.id}” removed (${describeRule(r, a.fields)})` });
  for (const r of b.rules) if (!aById.has(r.id)) changes.push({ kind: 'added', ruleId: r.id, text: `Rule “${r.id}” added (${describeRule(r, b.fields)})` });

  const commonA = a.rules.filter(r => bById.has(r.id)).map(r => r.id);
  const commonB = b.rules.filter(r => aById.has(r.id)).map(r => r.id);
  if (!same(commonA, commonB)) changes.push({ kind: 'changed', text: `Order (= priority) changed: ${commonA.join(' → ')} ⇒ ${commonB.join(' → ')}` });

  for (const rb of b.rules) {
    const ra = aById.get(rb.id);
    if (!ra) continue;
    if (ra.outcome !== rb.outcome) changes.push({ kind: 'changed', ruleId: rb.id, text: `Rule “${rb.id}”: outcome ${outcomeLabels[ra.outcome]} → ${outcomeLabels[rb.outcome]}` });
    if (!same(ra.when, rb.when)) for (const c of diffCondition(rb.id, ra.when, rb.when, b.fields)) changes.push({ ...c, text: `Rule “${rb.id}”: ${c.text}` });
    if (ra.description !== rb.description) changes.push({ kind: 'changed', ruleId: rb.id, text: `Rule “${rb.id}”: description changed` });
  }

  if (a.default.outcome !== b.default.outcome) changes.push({ kind: 'changed', ruleId: b.default.id, text: `Default outcome: ${outcomeLabels[a.default.outcome]} → ${outcomeLabels[b.default.outcome]}` });
  if (a.default.id !== b.default.id) changes.push({ kind: 'changed', ruleId: b.default.id, text: `Default rule renamed: “${a.default.id}” → “${b.default.id}”` });
  else if (a.default.description !== b.default.description) changes.push({ kind: 'changed', ruleId: b.default.id, text: 'Default rule description changed' });

  for (const name of Object.keys(b.fields)) if (!(name in a.fields)) changes.push({ kind: 'added', text: `Field “${name}” added` });
  for (const name of Object.keys(a.fields)) if (!(name in b.fields)) changes.push({ kind: 'removed', text: `Field “${name}” removed` });
  for (const name of Object.keys(b.fields)) if (name in a.fields && !same(a.fields[name], b.fields[name])) changes.push({ kind: 'changed', text: `Field “${name}” changed` });
  return changes;
}
