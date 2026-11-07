import type { Condition, Leaf, PolicyDocument, Rule } from '../policy-engine/schema.js';
import { conditionToText, describeLeaf, fieldLabel, formatValue, groupChildren, groupKind, outcomeLabels } from './describe.js';

export interface Change { kind: 'added' | 'removed' | 'changed'; ruleId?: string; text: string }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function leaves(c: Condition): Leaf[] {
  return groupKind(c) === 'leaf' ? [c as Leaf] : groupChildren(c).flatMap(leaves);
}

const OP_WORDS: Record<string, string> = {
  eq: 'ist', neq: 'ist nicht', gt: 'größer als', gte: 'mindestens', lt: 'kleiner als', lte: 'höchstens',
  in: 'eines von', not_in: 'keines von', is_empty: 'fehlt', is_not_empty: 'vorhanden',
};

/** Leaf-level changes of one rule's condition, e.g. "Reparaturangebot größer als: 1.500 → 1.200". */
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
    if (i >= 0) { const [n] = pool.splice(i, 1); push('changed', `Bedingung geändert: ${describeLeaf(o, fields)} → ${describeLeaf(n, fields)}`); }
    else push('removed', `Bedingung entfernt: ${describeLeaf(o, fields)}`);
  }
  for (const n of pool) push('added', `Bedingung hinzugefügt: ${describeLeaf(n, fields)}`);
  if (groupKind(a) !== groupKind(b) && groupKind(a) !== 'leaf' && groupKind(b) !== 'leaf') {
    push('changed', `Verknüpfung geändert: ${groupKind(a) === 'any' ? 'mindestens eine' : 'alle'} → ${groupKind(b) === 'any' ? 'mindestens eine' : 'alle'}`);
  }
  if (!out.length) push('changed', 'Verschachtelung der Bedingungen geändert');
  return out;
}

/** Plain-language differences between two policy versions (`a` = older/base, `b` = newer). */
export function diffPolicies(a: PolicyDocument, b: PolicyDocument): Change[] {
  const changes: Change[] = [];
  const aById = new Map(a.rules.map(r => [r.id, r]));
  const bById = new Map(b.rules.map(r => [r.id, r]));
  const describeRule = (r: Rule, f: PolicyDocument['fields']) => `${conditionToText(r.when, f)} → ${outcomeLabels[r.outcome]}`;

  for (const r of a.rules) if (!bById.has(r.id)) changes.push({ kind: 'removed', ruleId: r.id, text: `Regel „${r.id}“ entfernt (${describeRule(r, a.fields)})` });
  for (const r of b.rules) if (!aById.has(r.id)) changes.push({ kind: 'added', ruleId: r.id, text: `Regel „${r.id}“ hinzugefügt (${describeRule(r, b.fields)})` });

  const commonA = a.rules.filter(r => bById.has(r.id)).map(r => r.id);
  const commonB = b.rules.filter(r => aById.has(r.id)).map(r => r.id);
  if (!same(commonA, commonB)) changes.push({ kind: 'changed', text: `Reihenfolge (= Priorität) geändert: ${commonA.join(' → ')} ⇒ ${commonB.join(' → ')}` });

  for (const rb of b.rules) {
    const ra = aById.get(rb.id);
    if (!ra) continue;
    if (ra.outcome !== rb.outcome) changes.push({ kind: 'changed', ruleId: rb.id, text: `Regel „${rb.id}“: Ergebnis ${outcomeLabels[ra.outcome]} → ${outcomeLabels[rb.outcome]}` });
    if (!same(ra.when, rb.when)) for (const c of diffCondition(rb.id, ra.when, rb.when, b.fields)) changes.push({ ...c, text: `Regel „${rb.id}“: ${c.text}` });
    if (ra.description !== rb.description) changes.push({ kind: 'changed', ruleId: rb.id, text: `Regel „${rb.id}“: Beschreibung geändert` });
  }

  if (a.default.outcome !== b.default.outcome) changes.push({ kind: 'changed', ruleId: b.default.id, text: `Standardergebnis: ${outcomeLabels[a.default.outcome]} → ${outcomeLabels[b.default.outcome]}` });
  if (a.default.id !== b.default.id) changes.push({ kind: 'changed', ruleId: b.default.id, text: `Standardregel umbenannt: „${a.default.id}“ → „${b.default.id}“` });
  else if (a.default.description !== b.default.description) changes.push({ kind: 'changed', ruleId: b.default.id, text: 'Beschreibung der Standardregel geändert' });

  for (const name of Object.keys(b.fields)) if (!(name in a.fields)) changes.push({ kind: 'added', text: `Feld „${name}“ hinzugefügt` });
  for (const name of Object.keys(a.fields)) if (!(name in b.fields)) changes.push({ kind: 'removed', text: `Feld „${name}“ entfernt` });
  for (const name of Object.keys(b.fields)) if (name in a.fields && !same(a.fields[name], b.fields[name])) changes.push({ kind: 'changed', text: `Feld „${name}“ geändert` });
  return changes;
}
