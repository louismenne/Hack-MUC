import { recommendations } from './review.js';
import type { Recommendation } from './triage.js';

export interface QualityReport {
  labelled: number;
  correct: number;
  /** Predicted routine_processing where the label says otherwise: the costliest miss. */
  incorrectRoutine: number;
  /** Predicted human_review where the label says a lighter step was enough. */
  unnecessaryReview: number;
  confusion: Record<Recommendation, Record<Recommendation, number>>;
}

export function qualityReport(pairs: { expected: Recommendation; predicted: Recommendation }[]): QualityReport {
  const confusion = Object.fromEntries(recommendations.map(expected =>
    [expected, Object.fromEntries(recommendations.map(predicted => [predicted, 0]))])) as QualityReport['confusion'];
  let correct = 0, incorrectRoutine = 0, unnecessaryReview = 0;
  for (const { expected, predicted } of pairs) {
    confusion[expected][predicted] += 1;
    if (expected === predicted) correct += 1;
    else if (predicted === 'routine_processing') incorrectRoutine += 1;
    else if (predicted === 'human_review') unnecessaryReview += 1;
  }
  return { labelled: pairs.length, correct, incorrectRoutine, unnecessaryReview, confusion };
}
