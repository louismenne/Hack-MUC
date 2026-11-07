import type { Condition, FieldDef, Leaf, PolicyDocument, Scalar } from '../policy-engine/schema.js';
import { groupChildren, groupKind } from './describe.js';

/** Address of a leaf inside a rule's condition: child indices from the root, e.g. [2] or [0, 1]. */
export type LeafPath = number[];

function mapAt(c: Condition, path: LeafPath, fn: (leaf: Leaf) => Leaf): Condition {
  if (!path.length) {
    if (groupKind(c) !== 'leaf') throw new Error('Path does not point at a leaf condition.');
    return fn(c as Leaf);
  }
  const kind = groupKind(c);
  if (kind === 'leaf') throw new Error('Path goes past a leaf condition.');
  const [head, ...rest] = path;
  const children = groupChildren(c);
  if (head < 0 || head >= children.length) throw new Error('Path is out of range.');
  const next = children.map((child, i) => (i === head ? mapAt(child, rest, fn) : child));
  return kind === 'all' ? { all: next } : { any: next };
}

/** Returns a copy of `doc` with one leaf's value replaced. The result still needs `validatePolicy`. */
export function setLeafValue(doc: PolicyDocument, ruleIndex: number, path: LeafPath, value: Scalar | Scalar[]): PolicyDocument {
  if (!doc.rules[ruleIndex]) throw new Error('Rule does not exist.');
  const rules = doc.rules.map((rule, i) => (i === ruleIndex ? { ...rule, when: mapAt(rule.when, path, leaf => ({ ...leaf, value })) } : rule));
  return { ...doc, rules };
}

/** Parses text typed into an edit field according to the field's type; returns null if it is not valid. */
export function parseEditedValue(def: FieldDef | undefined, text: string, asList: boolean): Scalar | Scalar[] | null {
  if (!def) return null;
  const one = (raw: string): Scalar | null => {
    const t = raw.trim();
    if (def.type === 'boolean') return t === 'true' ? true : t === 'false' ? false : null;
    if (def.type === 'number') {
      if (!/^-?\d+([.,]\d+)?$/.test(t)) return null;
      const n = Number(t.replace(',', '.'));
      return Number.isFinite(n) && n >= 0 ? n : null;
    }
    return t === '' ? null : t;
  };
  if (!asList) return one(text);
  const items = text.split(',').map(one);
  return items.length && items.every(i => i !== null) ? (items as Scalar[]) : null;
}
