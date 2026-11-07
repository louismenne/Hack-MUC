import type { Decision, Recommendation } from './triage.js';

export const recommendations: readonly Recommendation[] = ['routine_processing', 'request_information', 'human_review'];
export type ReviewAction = 'confirmed' | 'overridden' | 'reverted';
export type ReviewStatus = 'pending' | 'reviewed' | 'overridden';

/** Append-only audit record. It snapshots the automated decision the reviewer saw. */
export interface ReviewEvent {
  id: string;
  at: string;
  datasetId: string;
  caseId: string;
  action: ReviewAction;
  reviewer: string;
  reason: string;
  policyVersion: Decision['policyVersion'];
  ruleId: Decision['ruleId'];
  automated: Recommendation;
  previous: Recommendation;
  next: Recommendation;
}

export interface ReviewState {
  automated: Recommendation;
  effective: Recommendation;
  status: ReviewStatus;
  events: ReviewEvent[];
}

export function isRecommendation(value: unknown): value is Recommendation {
  return typeof value === 'string' && (recommendations as readonly string[]).includes(value);
}

/** Replays a case's events in order; the automated decision itself is never modified. */
export function reviewState(decision: Pick<Decision, 'recommendation'>, events: ReviewEvent[]): ReviewState {
  let effective = decision.recommendation;
  for (const event of events) effective = event.next;
  const status: ReviewStatus = effective !== decision.recommendation ? 'overridden' : events.length ? 'reviewed' : 'pending';
  return { automated: decision.recommendation, effective, status, events };
}

export interface ReviewInput {
  datasetId: string;
  decision: Decision & { caseId: string };
  current: Recommendation;
  action: ReviewAction;
  reviewer: string;
  reason: string;
  next?: Recommendation;
}

export const minReasonLength = 10;

/** Returns validation errors keyed by field; an empty object means the input is valid. */
export function validateReview(input: ReviewInput): Partial<Record<'reviewer' | 'reason' | 'next', string>> {
  const errors: Partial<Record<'reviewer' | 'reason' | 'next', string>> = {};
  if (!input.reviewer.trim()) errors.reviewer = 'Reviewer name is required.';
  const needsReason = input.action !== 'confirmed';
  if (needsReason && input.reason.trim().length < minReasonLength) errors.reason = `Give a reason of at least ${minReasonLength} characters.`;
  if (input.action === 'overridden') {
    if (!isRecommendation(input.next)) errors.next = 'Choose a recommendation.';
    else if (input.next === input.current) errors.next = 'Choose a recommendation different from the current one.';
  }
  if (input.action === 'reverted' && input.current === input.decision.recommendation) errors.next = 'Nothing to revert: the automated recommendation is already in effect.';
  return errors;
}

export function createReviewEvent(input: ReviewInput, meta: { id: string; at: string }): ReviewEvent {
  const errors = validateReview(input);
  const first = Object.values(errors)[0];
  if (first) throw new Error(first);
  const next = input.action === 'overridden' ? input.next! : input.action === 'reverted' ? input.decision.recommendation : input.current;
  return {
    id: meta.id, at: meta.at, datasetId: input.datasetId, caseId: input.decision.caseId,
    action: input.action, reviewer: input.reviewer.trim(), reason: input.reason.trim(),
    policyVersion: input.decision.policyVersion, ruleId: input.decision.ruleId,
    automated: input.decision.recommendation, previous: input.current, next,
  };
}
