import type { Decision, Field, Recommendation } from './triage.js';

/**
 * Owner-level insights derived only from engine decisions and the structured claim fields.
 * Pure and deterministic: every number and every suggested action can be traced back to cases.
 */

export const POLICY_LIMIT_EUR = 1500;

export type ReviewTrigger =
  | 'policy_inactive' | 'not_motor_own_damage' | 'injury' | 'liability_disputed'
  | 'duplicate' | 'evidence_conflict' | 'quote_above_limit';

export const triggerLabels: Record<ReviewTrigger, string> = {
  policy_inactive: 'Policy not active on incident date',
  not_motor_own_damage: 'Not a motor own-damage claim',
  injury: 'Injury reported',
  liability_disputed: 'Liability disputed',
  duplicate: 'Possible duplicate',
  evidence_conflict: 'Conflicting evidence',
  quote_above_limit: 'Quote above the routine limit',
};

const triggerByField: Partial<Record<string, ReviewTrigger>> = {
  policy_active_on_incident: 'policy_inactive',
  claim_type: 'not_motor_own_damage',
  injury_reported: 'injury',
  liability_disputed: 'liability_disputed',
  duplicate_flag: 'duplicate',
  evidence_conflict: 'evidence_conflict',
  quote_eur: 'quote_above_limit',
};

/** Why a request_information case could not proceed: a document explicitly absent, or an input blank/unreadable. */
export interface InfoGap { field: Field; kind: 'absent' | 'blank' }

export interface InsightCase {
  decision: Pick<Decision, 'recommendation' | 'ruleId' | 'supportingFacts' | 'missingFields'> & { caseId: string };
  quote: number | null;
  /** Effective recommendation after reviewer actions; equals the engine's when nobody acted. */
  effective: Recommendation;
  reviewStatus: 'pending' | 'reviewed' | 'overridden';
}

export interface Count<K> { key: K; count: number }

export interface QuoteBand { label: string; from: number; to: number | null; count: number; aboveLimit: boolean }

export interface Insights {
  total: number;
  mix: Record<Recommendation, number>;
  /** Share of cases per recommendation, 0–1. */
  rates: Record<Recommendation, number>;
  reviewTriggers: Count<ReviewTrigger>[];
  multiTriggerReviews: number;
  infoGaps: Count<string>[];
  casesWithBlankFields: number;
  quoteBands: QuoteBand[];
  unknownQuotes: number;
  /** Quotes within 20% below the limit — would flip to human review if the limit dropped. */
  nearLimitBelow: number;
  /** Quotes within 20% above the limit — the cases a modest limit increase would release. */
  nearLimitAbove: number;
  workload: { reviewQueue: number; reviewed: number; overridden: number; overrideRate: number | null };
  overridesByRule: Count<Decision['ruleId']>[];
}

const sortDesc = <K>(map: Map<K, number>): Count<K>[] =>
  [...map].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));

const factField = (fact: string) => /^([a-z_]+)=/.exec(fact)?.[1] ?? null;

export const gapKey = (gap: InfoGap) => `${gap.field}:${gap.kind}`;

export function infoGaps(decision: InsightCase['decision']): InfoGap[] {
  if (decision.recommendation !== 'request_information') return [];
  // Facts about an explicitly absent document name the field; blank inputs are reported as `field=(missing)`.
  const absent = decision.supportingFacts.filter(fact => !fact.includes('(missing)'));
  if (absent.length > 0) {
    return absent.map(factField).filter((field): field is Field => field !== null).map(field => ({ field, kind: 'absent' }));
  }
  return decision.missingFields.map(field => ({ field, kind: 'blank' }));
}

export function reviewTriggers(decision: InsightCase['decision']): ReviewTrigger[] {
  if (decision.recommendation !== 'human_review') return [];
  return decision.supportingFacts.map(fact => triggerByField[factField(fact) ?? '']).filter((t): t is ReviewTrigger => t !== undefined);
}

const bands: Omit<QuoteBand, 'count' | 'aboveLimit'>[] = [
  { label: '< €500', from: 0, to: 500 },
  { label: '€500–1,000', from: 500, to: 1000 },
  { label: '€1,000–1,500', from: 1000, to: POLICY_LIMIT_EUR },
  { label: '€1,500–2,000', from: POLICY_LIMIT_EUR, to: 2000 },
  { label: '> €2,000', from: 2000, to: null },
];

export function computeInsights(cases: InsightCase[]): Insights {
  const total = cases.length;
  const mix: Record<Recommendation, number> = { routine_processing: 0, request_information: 0, human_review: 0 };
  const triggers = new Map<ReviewTrigger, number>();
  const gaps = new Map<string, number>();
  const overrides = new Map<Decision['ruleId'], number>();
  let multiTriggerReviews = 0, casesWithBlankFields = 0, unknownQuotes = 0, nearLimitBelow = 0, nearLimitAbove = 0;
  let reviewQueue = 0, reviewed = 0, overridden = 0;
  const bandCounts = bands.map(() => 0);

  for (const item of cases) {
    const { decision } = item;
    mix[decision.recommendation] += 1;
    const found = reviewTriggers(decision);
    for (const trigger of new Set(found)) triggers.set(trigger, (triggers.get(trigger) ?? 0) + 1);
    if (found.length > 1) multiTriggerReviews += 1;
    for (const gap of infoGaps(decision)) gaps.set(gapKey(gap), (gaps.get(gapKey(gap)) ?? 0) + 1);
    if (decision.missingFields.length) casesWithBlankFields += 1;

    if (item.quote === null) unknownQuotes += 1;
    else {
      // A quote of exactly the limit is still routine (policy: "greater than"), so it belongs to the band below.
      const index = bands.findIndex(band => band.to === null || item.quote! < band.to || (band.to === POLICY_LIMIT_EUR && item.quote === POLICY_LIMIT_EUR));
      bandCounts[index] += 1;
      if (item.quote <= POLICY_LIMIT_EUR && item.quote >= POLICY_LIMIT_EUR * 0.8) nearLimitBelow += 1;
      if (item.quote > POLICY_LIMIT_EUR && item.quote <= POLICY_LIMIT_EUR * 1.2) nearLimitAbove += 1;
    }

    if (item.effective === 'human_review' && item.reviewStatus === 'pending') reviewQueue += 1;
    if (item.reviewStatus !== 'pending') reviewed += 1;
    if (item.reviewStatus === 'overridden') {
      overridden += 1;
      overrides.set(decision.ruleId, (overrides.get(decision.ruleId) ?? 0) + 1);
    }
  }

  const rate = (n: number) => (total ? n / total : 0);
  return {
    total,
    mix,
    rates: { routine_processing: rate(mix.routine_processing), request_information: rate(mix.request_information), human_review: rate(mix.human_review) },
    reviewTriggers: sortDesc(triggers),
    multiTriggerReviews,
    infoGaps: sortDesc(gaps),
    casesWithBlankFields,
    quoteBands: bands.map((band, index) => ({ ...band, count: bandCounts[index], aboveLimit: band.from >= POLICY_LIMIT_EUR })),
    unknownQuotes,
    nearLimitBelow,
    nearLimitAbove,
    workload: { reviewQueue, reviewed, overridden, overrideRate: reviewed ? overridden / reviewed : null },
    overridesByRule: sortDesc(overrides),
  };
}

export type ActionSeverity = 'critical' | 'warning' | 'info';
export interface SuggestedAction { id: string; severity: ActionSeverity; title: string; detail: string; evidence: string }

const pct = (value: number) => `${Math.round(value * 100)}%`;

const triggerAdvice: Record<ReviewTrigger, string> = {
  quote_above_limit: 'Review whether the €1,500 limit still fits repair prices, or add a fast track for quotes slightly above it.',
  injury: 'Route injury claims straight to a specialised bodily-injury team instead of the general review queue.',
  liability_disputed: 'Collect both parties’ statements at intake so reviewers do not have to chase them.',
  duplicate: 'Add a duplicate check (same incident reference) at upload, before the claim reaches triage.',
  evidence_conflict: 'Ask for timestamped photos at upload and validate dates against the incident report.',
  policy_inactive: 'Check policy status at intake and tell the claimant immediately if cover had lapsed.',
  not_motor_own_damage: 'Route other claim types (e.g. theft) to their own process at intake.',
};

/**
 * Rule-based suggestions for the policy owner. Thresholds are deliberately simple and visible
 * so the owner can see exactly why a suggestion appears.
 */
export function suggestedActions(insights: Insights, labelled?: { labelled: number; incorrectRoutine: number }, labelFor: (key: string) => string = key => key): SuggestedAction[] {
  const actions: SuggestedAction[] = [];
  if (!insights.total) return actions;

  if (labelled && labelled.incorrectRoutine > 0) {
    actions.push({
      id: 'incorrect-routine', severity: 'critical',
      title: `${labelled.incorrectRoutine} claim(s) wrongly sent to routine processing`,
      detail: 'This is the most expensive error. Inspect these cases before any rollout and add them as regression tests.',
      evidence: `${labelled.incorrectRoutine} of ${labelled.labelled} labelled cases`,
    });
  }

  const infoRate = insights.rates.request_information;
  const topGap = insights.infoGaps[0];
  if (infoRate >= 0.15 && topGap) {
    // Only call a gap "most common" when it clearly leads; otherwise name the tied gaps.
    const leads = topGap.count > (insights.infoGaps[1]?.count ?? 0);
    const tied = insights.infoGaps.filter(gap => gap.count === topGap.count).map(gap => labelFor(gap.key));
    actions.push({
      id: 'info-gaps', severity: 'warning',
      title: `${pct(infoRate)} of claims need more information`,
      detail: leads
        ? `Most common gap: ${labelFor(topGap.key)}. Make it a required upload with a short example, so claimants get it right first time.`
        : `Gaps are spread across: ${tied.join(', ')}. Clearer upload requirements and field validation would address all of them.`,
      evidence: `${insights.mix.request_information} of ${insights.total} claims${leads ? ` · top gap in ${topGap.count}` : ''}`,
    });
  }

  const topTrigger = insights.reviewTriggers[0];
  const reviews = insights.mix.human_review;
  if (topTrigger && reviews >= 2 && topTrigger.count / reviews >= 0.25) {
    actions.push({
      id: `trigger-${topTrigger.key}`, severity: 'info',
      title: `“${triggerLabels[topTrigger.key]}” drives ${pct(topTrigger.count / reviews)} of human reviews`,
      detail: triggerAdvice[topTrigger.key],
      evidence: `${topTrigger.count} of ${reviews} human-review claims`,
    });
  }

  if (insights.nearLimitBelow >= 2) {
    actions.push({
      id: 'near-limit', severity: 'info',
      title: `${insights.nearLimitBelow} routine-eligible quotes sit just below the €1,500 limit`,
      detail: 'Lowering the limit would move these into human review. Test any limit change against past cases before release.',
      evidence: 'Quotes between €1,200 and €1,500',
    });
  }

  if (insights.casesWithBlankFields > 0) {
    actions.push({
      id: 'blank-fields', severity: 'info',
      title: `${insights.casesWithBlankFields} claim(s) arrived with blank or unreadable fields`,
      detail: 'The engine never guesses missing values. Validate required fields in the upload form to reduce follow-ups.',
      evidence: `${insights.casesWithBlankFields} of ${insights.total} claims`,
    });
  }

  return actions;
}
