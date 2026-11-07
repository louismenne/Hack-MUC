import { evaluatePolicyDocument, type PolicyDecision } from './engine.js';
import type { PolicyDocument } from './schema.js';

/**
 * Which policy version decides which claim. No rule lives here: the rules are the JSON documents,
 * this only says which document applies to an open claim and which to a closed one.
 */

export interface PolicyRef { label: string; rules: PolicyDocument }

export interface PolicyHistory {
  /** Decides every OPEN claim. */
  active: PolicyRef;
  /** The version in force before `active` (equal to `active` if there is none). Open claims are compared against it: a different recommendation means `needs_recheck`. */
  previous: PolicyRef;
  /** The original version. CLOSED claims keep its decision whatever policy is active later. */
  original: PolicyRef;
}

/** The part of a stored version that the history needs (matches `PolicyVersionRecord`). */
export interface VersionLike {
  versionLabel: string;
  rules: PolicyDocument;
  status: 'draft' | 'active' | 'archived';
  createdAt: string;
  activatedAt: string | null;
}

const ref = (v: VersionLike): PolicyRef => ({ label: v.versionLabel, rules: v.rules });
const when = (v: VersionLike) => Date.parse(v.activatedAt ?? v.createdAt);

/** Builds the history from all stored versions (drafts are ignored). Throws if there is no active version. */
export function policyHistoryFrom(versions: VersionLike[]): PolicyHistory {
  const active = versions.find(v => v.status === 'active');
  if (!active) throw new Error('There is no active policy version.');
  const used = versions.filter(v => v.status !== 'draft').sort((a, b) => when(a) - when(b));
  const archived = used.filter(v => v.status === 'archived');
  return {
    active: ref(active),
    previous: ref(archived.at(-1) ?? active),
    original: ref(used[0] ?? active),
  };
}

export interface ClaimOutcome {
  /** Only an explicit `closed` freezes a claim; blank or unknown status is treated as open. */
  frozen: boolean;
  /** The decision in force: open claims follow the active version, closed claims keep the original decision. */
  decision: PolicyDecision;
  /** The decision before the latest policy change (the same as `decision` for closed claims). */
  baseline: PolicyDecision;
  /** Open claim whose recommendation differs between the previous and the active version. Never true for closed claims. */
  needsRecheck: boolean;
}

export function decideClaim(row: Record<string, unknown>, history: PolicyHistory): ClaimOutcome {
  const evaluate = (p: PolicyRef) => evaluatePolicyDocument(p.rules, p.label, row);
  if (String(row.case_status ?? '').trim().toLowerCase() === 'closed') {
    const frozen = evaluate(history.original);
    return { frozen: true, decision: frozen, baseline: frozen, needsRecheck: false };
  }
  const baseline = evaluate(history.previous);
  const decision = evaluate(history.active);
  return { frozen: false, decision, baseline, needsRecheck: decision.recommendation !== baseline.recommendation };
}
