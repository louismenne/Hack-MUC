import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { describe, expect, it } from 'vitest';
import { normalizeHeaders, triageRows } from '../src/claims.js';
import { qualityReport } from '../src/quality.js';
import { createReviewEvent, reviewState, validateReview, type ReviewInput } from '../src/review.js';
import type { Recommendation } from '../src/triage.js';

const csv = readFileSync(new URL('../data/labelled_development_cases.csv', import.meta.url), 'utf8');
const cases = triageRows(parse(csv, { bom: true, skip_empty_lines: true, columns: normalizeHeaders }));
const routine = cases.find(c => c.decision.caseId === 'DEV-001')!.decision;
let seq = 0;
const meta = () => ({ id: `e${++seq}`, at: new Date(Date.UTC(2026, 10, 7, 12, seq)).toISOString() });
const input = (changes: Partial<ReviewInput>): ReviewInput => ({
  datasetId: 'development', decision: routine, current: routine.recommendation,
  action: 'overridden', reviewer: 'Alex', reason: 'Photos show frame damage beyond the quote.', next: 'human_review', ...changes,
});

describe('reviewer overrides', () => {
  it('records an override without changing the automated decision', () => {
    const event = createReviewEvent(input({}), meta());
    const state = reviewState(routine, [event]);
    expect(state).toMatchObject({ automated: 'routine_processing', effective: 'human_review', status: 'overridden' });
    expect(event).toMatchObject({ previous: 'routine_processing', next: 'human_review', ruleId: 'v1.rule3', policyVersion: 'v1', reviewer: 'Alex' });
    expect(routine.recommendation).toBe('routine_processing');
  });
  it('replays override then revert back to the automated recommendation', () => {
    const override = createReviewEvent(input({}), meta());
    const revert = createReviewEvent(input({ action: 'reverted', current: 'human_review', next: undefined, reason: 'Second look: damage is cosmetic only.' }), meta());
    expect(revert.next).toBe('routine_processing');
    expect(reviewState(routine, [override, revert])).toMatchObject({ effective: 'routine_processing', status: 'reviewed' });
  });
  it('confirmation keeps the current recommendation and needs no reason', () => {
    const event = createReviewEvent(input({ action: 'confirmed', reason: '', next: undefined }), meta());
    expect(event.next).toBe('routine_processing');
    expect(reviewState(routine, [event]).status).toBe('reviewed');
  });
  it.each<[Partial<ReviewInput>, string]>([
    [{ reviewer: '  ' }, 'reviewer'],
    [{ reason: 'too short' }, 'reason'],
    [{ next: 'routine_processing' }, 'next'],
    [{ next: 'approve' as Recommendation }, 'next'],
    [{ action: 'reverted', next: undefined }, 'next'],
  ])('rejects invalid input %o', (changes, field) => {
    expect(validateReview(input(changes))).toHaveProperty(field);
    expect(() => createReviewEvent(input(changes), meta())).toThrow();
  });
  it('starts pending with no events', () => {
    expect(reviewState(routine, [])).toMatchObject({ effective: 'routine_processing', status: 'pending' });
  });
});

describe('quality report', () => {
  it('scores the development labels', () => {
    const report = qualityReport(cases.map(c => ({ expected: c.row.expected_v1 as Recommendation, predicted: c.decision.recommendation })));
    expect(report).toMatchObject({ labelled: 14, correct: 14, incorrectRoutine: 0, unnecessaryReview: 0 });
    expect(report.confusion.human_review.human_review).toBe(8);
  });
  it('separates incorrect routine from unnecessary human review', () => {
    const report = qualityReport([
      { expected: 'human_review', predicted: 'routine_processing' },
      { expected: 'request_information', predicted: 'routine_processing' },
      { expected: 'routine_processing', predicted: 'human_review' },
      { expected: 'human_review', predicted: 'request_information' },
    ]);
    expect(report).toMatchObject({ correct: 0, incorrectRoutine: 2, unnecessaryReview: 1 });
  });
});
