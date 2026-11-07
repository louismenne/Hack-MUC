import type { Condition, FieldDef, Leaf, Outcome, PolicyDocument, Scalar } from './schema.js';
import { parseBoolean, parseNumber, parseString } from './values.js';

/** A known value, or `null` for an absent/unreadable fact. */
export type FactValue = string | number | boolean | null;
export type Facts = Record<string, FactValue>;

export interface PolicyDecision {
  caseId: string | null;
  policyVersion: string;
  recommendation: Outcome;
  /** `<version>.<rule id>`, e.g. `v1.rule1`. */
  ruleId: string;
  /** Facts that made the deciding rule fire, as `field=value` (comparisons append ` op operand`). */
  supportingFacts: string[];
  /** Every declared field whose value is absent or unreadable. */
  missingFields: string[];
  explanation: string;
}

function parseField(def: FieldDef, raw: unknown): FactValue {
  switch (def.type) {
    case 'boolean': return parseBoolean(raw);
    case 'number': return parseNumber(raw);
    case 'enum': {
      const v = parseString(raw)?.toLowerCase();
      return def.values?.find(allowed => allowed.toLowerCase() === v) ?? null;
    }
    default: return parseString(raw);
  }
}

/** Turns a raw record (CSV row, JSON object) into typed facts. Only declared fields are read; the rest is ignored. */
export function normalizeFacts(policy: PolicyDocument, row: Record<string, unknown>): Facts {
  return Object.fromEntries(Object.entries(policy.fields).map(([name, def]) => [name, parseField(def, row[name])]));
}

interface Evaluation { matched: boolean; facts: string[] }
const NO: Evaluation = { matched: false, facts: [] };
const show = (v: FactValue | Scalar[]) => (Array.isArray(v) ? `[${v.join(', ')}]` : String(v));

/** Unknown facts never satisfy a comparison: only is_empty matches them. */
function evalLeaf(leaf: Leaf, facts: Facts): Evaluation {
  const actual = facts[leaf.field] ?? null;
  if (leaf.op === 'is_empty') return actual === null ? { matched: true, facts: [`${leaf.field}=(missing)`] } : NO;
  if (leaf.op === 'is_not_empty') return actual !== null ? { matched: true, facts: [`${leaf.field}=${show(actual)}`] } : NO;
  if (actual === null || leaf.value === undefined) return NO;
  const expected = leaf.value;
  let matched: boolean;
  switch (leaf.op) {
    case 'eq': matched = actual === expected; break;
    case 'neq': matched = actual !== expected; break;
    case 'in': matched = (expected as Scalar[]).includes(actual); break;
    case 'not_in': matched = !(expected as Scalar[]).includes(actual); break;
    default: {
      if (typeof actual !== 'number' || typeof expected !== 'number') return NO;
      matched = leaf.op === 'gt' ? actual > expected : leaf.op === 'gte' ? actual >= expected : leaf.op === 'lt' ? actual < expected : actual <= expected;
    }
  }
  if (!matched) return NO;
  const detail = leaf.op === 'eq' ? '' : ` ${leaf.op} ${show(expected)}`;
  return { matched: true, facts: [`${leaf.field}=${show(actual)}${detail}`] };
}

function evalCondition(c: Condition, facts: Facts): Evaluation {
  if ('all' in c) {
    const parts = c.all.map(child => evalCondition(child, facts));
    return parts.every(p => p.matched) ? { matched: true, facts: parts.flatMap(p => p.facts) } : NO;
  }
  if ('any' in c) {
    const hits = c.any.map(child => evalCondition(child, facts)).filter(p => p.matched);
    return hits.length ? { matched: true, facts: hits.flatMap(p => p.facts) } : NO;
  }
  return evalLeaf(c, facts);
}

/**
 * Evaluates a (validated) policy for one claim: first matching rule wins, otherwise the default.
 * `version` is the label stored with the policy version (e.g. "v1"); it prefixes the rule id.
 * Pure and deterministic: no I/O, no AI.
 */
export function evaluatePolicyDocument(policy: PolicyDocument, version: string, row: Record<string, unknown>): PolicyDecision {
  const facts = normalizeFacts(policy, row);
  const missingFields = Object.keys(policy.fields).filter(name => facts[name] === null);
  const hit = policy.rules.map(rule => ({ rule, result: evalCondition(rule.when, facts) })).find(({ result }) => result.matched);
  const decided = hit ? { id: hit.rule.id, outcome: hit.rule.outcome, description: hit.rule.description } : policy.default;
  const supportingFacts = hit?.result.facts ?? [];
  const ruleId = `${version}.${decided.id}`;
  const caseId = typeof facts.case_id === 'string' ? facts.case_id : null;
  return {
    caseId, policyVersion: version, recommendation: decided.outcome, ruleId, supportingFacts, missingFields,
    explanation: `${ruleId}: ${decided.outcome}. ${decided.description}${supportingFacts.length ? ` Facts: ${supportingFacts.join('; ')}.` : ''}`,
  };
}
