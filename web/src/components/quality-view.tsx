import { useMemo, useState, type ReactNode } from 'react';
import { CalendarClockIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fieldLabels } from '@/lib/policy';
import { officialComparison, type CaseItem, type Dataset } from '@/lib/datasets';
import { usePolicySource } from '@/lib/policy-source';
import { parseNumber } from '../../../src/policy-engine/values';
import { reviewQuoteLimit } from '../../../src/policy-engine/reporting';
import { dotClasses } from '@/components/recommendation-badge';
import { Badge } from '@/components/ui/badge';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

import { computeInsights, suggestedActions, triggerLabels } from '../../../src/insights';
import { qualityReport } from '../../../src/quality';
import { daysOpen, V2_PERIOD_START } from '../../../src/received-at';
import { recommendations, type ReviewEvent, type ReviewState } from '../../../src/review';
import {
  delta,
  inWindow,
  previousWindow,
  rangeLabels,
  receivedSeries,
  timeRanges,
  windowFor,
  type Delta,
  type TimeRange,
} from '../../../src/timeline';
import type { Field, Recommendation } from '../../../src/triage';

import { TrendCard } from './quality/charts';
import { QuoteChart } from './quality/charts';
import { formatWindow } from './quality/format';
import { pct } from './quality/format';
import { SavingsCard } from './quality/savings-card';
import { MixCard } from './quality/metrics';
import { Kpi } from './quality/metrics';
import { Stat } from './quality/metrics';
import { ConfusionTable } from './quality/metrics';
import { ActionsCard } from './quality/actions-card';
import { BarList } from './quality/bar-list';
import { ReviewerActivity } from './quality/reviewer-activity';

const documentNames: Partial<Record<Field, string>> = {
  incident_report_present: 'Incident report',
  itemized_quote_present: 'Itemized repair quote',
};

/** Turns an info-gap key like `incident_report_present:absent` into owner language. */
function gapLabel(key: string): string {
  const [field, kind] = key.split(':') as [Field, 'absent' | 'blank'];
  if (kind === 'absent') return `${documentNames[field] ?? fieldLabels[field]} not provided`;
  return `${fieldLabels[field] ?? field} blank or unreadable`;
}

interface QualityViewProps {
  dataset: Dataset;
  states: Map<string, ReviewState>;
  /** Reviewer actions on this dataset (the audit trail). */
  events: ReviewEvent[];
  /** Renders the audit log table for the given (filtered) events. */
  renderLog: (events: ReviewEvent[]) => ReactNode;
  /** Example quality page: only the quality report on labelled cases, none of the operations dashboard. */
  qualityOnly?: boolean;
}

export function QualityView({ dataset, states, events, renderLog, qualityOnly = false }: QualityViewProps) {
  const [reviewerFilter, setReviewerFilter] = useState('all');
  const [range, setRange] = useState<TimeRange>('30d');
  const now = useMemo(() => new Date(), []);
  const dated = dataset.cases.filter((item) => item.received);
  const hasDates = dated.length > 0;
  const simulated = dated.some((item) => item.received!.simulated);
  const earliest = hasDates ? new Date(Math.min(...dated.map((item) => item.received!.at.getTime()))) : null;
  const window = windowFor(range, now, earliest);
  const previous = range === 'all' ? null : previousWindow(window);

  // Received volume includes closed claims; operational metrics count open work only.
  const received = hasDates
    ? dataset.cases.filter((item) => item.received && inWindow(item.received.at, window))
    : dataset.cases;
  const open = dataset.cases.filter((item) => !item.frozen);
  const current = received.filter((item) => !item.frozen);
  const closedReceived = received.length - current.length;
  const before =
    hasDates && previous ? open.filter((item) => item.received && inWindow(item.received.at, previous)) : null;
  const { history } = usePolicySource();
  // The active policy's quote limit; null when the policy has no single unconditional threshold.
  const limit = reviewQuoteLimit(history.active.rules);
  const previousLimit = reviewQuoteLimit(history.previous.rules);
  // History is never rewritten: a claim shows the decision that applied when it arrived.
  // Claims received before the policy change keep their earlier decision here; whether they
  // need another look under the new policy is shown separately (needsRecheck).
  const changeDate = new Date(V2_PERIOD_START);
  const decidedBeforeChange = (item: CaseItem) =>
    dataset.source !== 'stored' && !!item.received && item.received.at < changeDate;
  const atArrival = (item: CaseItem) =>
    dataset.source === 'stored' || decidedBeforeChange(item) ? item.baseline : item.decision;
  const recheck = open.filter((item) => item.needsRecheck);

  const toInsight = (item: CaseItem) => {
    const state = states.get(item.decision.caseId)!;
    return {
      decision: atArrival(item),
      quote: parseNumber(item.row.quote_eur),
      quoteLimit:
        dataset.source === 'stored'
          ? (item.initialQuoteLimit ?? null)
          : decidedBeforeChange(item)
            ? previousLimit
            : limit,
      // Without a reviewer action the outcome is the decision at arrival.
      effective: state.status === 'pending' ? atArrival(item).recommendation : state.effective,
      reviewStatus: state.status,
    };
  };
  const insights = computeInsights(current.map(toInsight), limit);
  const prior = before ? computeInsights(before.map(toInsight), limit) : null;
  const backlog = open.filter((item) => {
    const state = states.get(item.decision.caseId)!;
    return state.effective === 'human_review' && state.status === 'pending';
  });
  const oldestWaiting = backlog
    .map((item) => item.received?.at)
    .filter((at): at is Date => !!at)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const official = new Map(officialComparison(dataset).map((item) => [item.current.caseId, item]));
  const labelled = dataset.cases.filter((item) => item.label !== null && !item.frozen);
  const v1Cases = dataset.cases.filter((c) => c.labelV1 !== null);
  const v2Cases = dataset.cases.filter((c) => c.labelV2 !== null && !c.frozen);
  const v1Report = qualityReport(
    v1Cases.map((c) => ({ expected: c.labelV1!, predicted: official.get(c.decision.caseId)!.decision.recommendation })),
  );
  const v1AgainstV2 = qualityReport(
    v2Cases.map((c) => ({ expected: c.labelV2!, predicted: official.get(c.decision.caseId)!.decision.recommendation })),
  );
  const v2Report = qualityReport(
    v2Cases.map((c) => ({ expected: c.labelV2!, predicted: official.get(c.decision.caseId)!.current.recommendation })),
  );
  const changed = v2Cases.filter((c) => official.get(c.decision.caseId)!.needsRecheck);
  const changedBefore = qualityReport(
    changed.map((c) => ({ expected: c.labelV2!, predicted: official.get(c.decision.caseId)!.decision.recommendation })),
  );
  const changedAfter = qualityReport(
    changed.map((c) => ({ expected: c.labelV2!, predicted: official.get(c.decision.caseId)!.current.recommendation })),
  );
  const engine = qualityReport(
    labelled.map((item) => ({ expected: item.label!, predicted: item.decision.recommendation })),
  );
  const reviewed = qualityReport(
    labelled.map((item) => ({ expected: item.label!, predicted: states.get(item.decision.caseId)!.effective })),
  );
  // Where to act is about the process as a whole, so it looks at all open claims, not the selected time range.
  const actions = suggestedActions(
    computeInsights(open.map(toInsight), limit),
    labelled.length ? engine : undefined,
    gapLabel,
  );
  const series = hasDates
    ? receivedSeries(
        dated.map((item) => ({ at: item.received!.at, recommendation: atArrival(item).recommendation })),
        window,
      )
    : [];
  const priorRate = (rec: Recommendation) => (prior && prior.total ? prior.rates[rec] : null);
  const smallSample = prior !== null && prior.total > 0 && prior.total < 5 ? ` (only ${prior.total} before)` : '';
  const vs =
    range === 'all'
      ? ''
      : range === '1d'
        ? `vs yesterday${smallSample}`
        : `vs previous ${rangeLabels[range].toLowerCase()}${smallSample}`;

  return (
    <div className="flex flex-col gap-4">
      {qualityOnly ? (
        <div>
          <h2 className="text-3xl font-normal tracking-[-0.03em]">Quality report</h2>
          <p className="text-sm text-muted-foreground">Labelled test cases, v1 and v2.</p>
        </div>
      ) : (
      <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-3xl font-normal tracking-[-0.03em]">
            Overview
            {simulated && (
              <Badge
                variant="outline"
                className="font-normal text-muted-foreground"
                title="The case CSVs carry no timestamps; arrival dates are simulated for the demo (src/received-at.ts)."
              >
                Simulated arrival dates
              </Badge>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            {hasDates ? formatWindow(window) : 'No arrival dates, time filter off'}
          </p>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={range}
          onValueChange={(value) => value && setRange(value as TimeRange)}
          disabled={!hasDates}
          aria-label="Time range"
        >
          {timeRanges.map((r) => (
            <ToggleGroupItem key={r} value={r} className="px-3">
              {r === 'all' ? 'All' : r}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {dataset.source === 'stored' && <SavingsCard insights={insights} range={range} />}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Kpi
          label="Claims received"
          value={received.length}
          better="neutral"
          vs=""
          hint={`${current.length} open · ${closedReceived} closed`}
        />
        <MixCard
          insights={insights}
          changes={
            Object.fromEntries(
              recommendations.map((rec) => [
                rec,
                insights.total ? delta(insights.rates[rec], priorRate(rec), 'pp') : null,
              ]),
            ) as Record<Recommendation, Delta | null>
          }
          vs={vs}
        />
        <Kpi
          label="Review backlog now"
          value={backlog.length}
          better="neutral"
          vs=""
          hint={oldestWaiting ? `Oldest waiting ${daysOpen(oldestWaiting, now)} days` : 'Nobody waiting'}
          alert={!!oldestWaiting && daysOpen(oldestWaiting, now) > 14}
        />
        <Kpi
          label="Needs recheck after policy change"
          value={recheck.length}
          better="neutral"
          vs=""
          accent="text-recheck"
          hint={
            recheck.length
              ? `Open claims with a new result under ${history.active.label}`
              : 'No open claim changes outcome'
          }
        />
      </div>

      {hasDates && <TrendCard series={series} window={window} showDemoPolicyMarker={dataset.source !== 'stored'} />}

      <ActionsCard actions={actions} />

      {insights.total === 0 ? (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarClockIcon />
              </EmptyMedia>
              <EmptyTitle>No claims received in this period</EmptyTitle>
              <EmptyDescription>Pick a longer range or submit claims to populate the dashboard.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Reasons for human review</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList
                  items={insights.reviewTriggers.map(({ key, count }) => ({ label: triggerLabels[key], count }))}
                  total={insights.mix.human_review}
                  barClass={dotClasses.human_review}
                  empty="No human reviews in this period."
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Most missing information</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList
                  items={insights.infoGaps.slice(0, 5).map(({ key, count }) => ({ label: gapLabel(key), count }))}
                  total={insights.mix.request_information}
                  barClass={dotClasses.request_information}
                  empty="No information requests in this period."
                />
              </CardContent>
            </Card>
          </div>
          <div>
            <QuoteChart insights={insights} />
          </div>
        </>
      )}

      <ReviewerActivity
        events={events}
        window={hasDates ? window : null}
        reviewer={reviewerFilter}
        onReviewerChange={setReviewerFilter}
        insights={insights}
        renderLog={renderLog}
        waitingNow={backlog.length}
        newReviewCases={open
          .filter((item) => item.received && atArrival(item).recommendation === 'human_review')
          .map((item) => item.received!.at)}
      />

      </>
      )}

      {dataset.source !== 'stored' && (
        <Card>
          <CardHeader>
            <CardTitle>Official policy change · before and after</CardTitle>
            <CardDescription>v1 labels from Taktile, v2 expectations derived by us.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evaluation</TableHead>
                  <TableHead>Correct / labelled</TableHead>
                  <TableHead>Incorrect routine</TableHead>
                  <TableHead>Unnecessary review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(
                  [
                    ['V1 vs v1 labels', v1Report],
                    ['V1 vs v2 expectations (before)', v1AgainstV2],
                    ['V2 vs v2 expectations (after)', v2Report],
                    ['Changed open cases · before', changedBefore],
                    ['Changed open cases · after', changedAfter],
                  ] as const
                ).map(([name, r]) => (
                  <TableRow key={name}>
                    <TableCell>{name}</TableCell>
                    <TableCell>{r.labelled ? `${r.correct}/${r.labelled}` : 'Not scored'}</TableCell>
                    <TableCell>
                      {r.labelled
                        ? `${r.incorrectRoutine} (${Math.round((100 * r.incorrectRoutine) / r.labelled)}%)`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {r.labelled
                        ? `${r.unnecessaryReview} (${Math.round((100 * r.unnecessaryReview) / r.labelled)}%)`
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {labelled.length > 0 ? (
        <>
          <div className="mt-2">
            <h2 className="text-3xl font-normal tracking-[-0.03em]">Decision quality</h2>
            <p className="text-sm text-muted-foreground">{engine.labelled} labelled cases</p>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="Correct next step"
              value={`${engine.correct}/${engine.labelled}`}
              hint={`${pct(engine.correct / engine.labelled)} of labelled cases`}
            />
            <Stat
              label="Incorrect routine processing"
              value={engine.incorrectRoutine}
              hint="Needed more care but sent to routine"
              alert={engine.incorrectRoutine > 0}
            />
            <Stat
              label="Unnecessary human review"
              value={engine.unnecessaryReview}
              hint="Escalated when a lighter step sufficed"
              alert={engine.unnecessaryReview > 0}
            />
            <Stat
              label="Other mismatches"
              value={engine.labelled - engine.correct - engine.incorrectRoutine - engine.unnecessaryReview}
              hint="Request info instead of another step"
            />
          </div>
          {/* Kept as-is: these are the metrics the case asks us to report per policy version. */}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Confusion matrix</CardTitle>
              </CardHeader>
              <CardContent>
                <ConfusionTable report={engine} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Engine versus after review</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metric</TableHead>
                      <TableHead className="text-right">Engine</TableHead>
                      <TableHead className="text-right">After review</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(
                      [
                        ['Correct', 'correct'],
                        ['Incorrect routine', 'incorrectRoutine'],
                        ['Unnecessary review', 'unnecessaryReview'],
                      ] as const
                    ).map(([label, key]) => (
                      <TableRow key={key}>
                        <TableCell>{label}</TableCell>
                        <TableCell className="text-right tabular-nums">{engine[key]}</TableCell>
                        <TableCell
                          className={cn('text-right tabular-nums', reviewed[key] !== engine[key] && 'font-semibold')}
                        >
                          {reviewed[key]}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      ) : dataset.source === 'stored' ? null : (
        <p className="text-sm text-muted-foreground">No labels match the active policy.</p>
      )}
    </div>
  );
}
