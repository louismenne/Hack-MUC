import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIcon, PiggyBankIcon, SlidersHorizontalIcon, ArrowDownRightIcon, ArrowUpRightIcon, CalendarClockIcon, ChevronLeftIcon, ChevronRightIcon, FlaskConicalIcon, InfoIcon, LightbulbIcon, MinusIcon, OctagonAlertIcon, TriangleAlertIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { euro, fieldLabels, recommendationMeta } from '@/lib/policy';
import { officialComparison, type CaseItem, type Dataset } from '@/lib/datasets';
import { usePolicySource } from '@/lib/policy-source';
import { parseNumber } from '../../../src/policy-engine/values';
import { reviewQuoteLimit } from '../../../src/policy-engine/reporting';
import { dotClasses } from '@/components/recommendation-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePersistentState } from '@/lib/storage';
import { defaultAssumptions, estimateSavings, type SavingsAssumptions } from '../../../src/savings';
import { computeInsights, suggestedActions, triggerLabels, type ActionSeverity, type Insights } from '../../../src/insights';
import { qualityReport, type QualityReport } from '../../../src/quality';
import { daysOpen, V2_PERIOD_START } from '../../../src/received-at';
import { recommendations, type ReviewEvent, type ReviewState } from '../../../src/review';
import { bucketEnd, countSeries, delta, inWindow, isoWeek, previousWindow, rangeLabels, receivedSeries, timeRanges, windowFor, type Bucket, type Delta, type SeriesPoint, type TimeRange, type Window } from '../../../src/timeline';
import type { Field, Recommendation } from '../../../src/triage';

const pct = (value: number) => `${Math.round(value * 100)}%`;

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
}

export function QualityView({ dataset, states, events, renderLog }: QualityViewProps) {
  const [reviewerFilter, setReviewerFilter] = useState('all');
  const [range, setRange] = useState<TimeRange>('30d');
  const now = useMemo(() => new Date(), []);
  const dated = dataset.cases.filter(item => item.received);
  const hasDates = dated.length > 0;
  const simulated = dated.some(item => item.received!.simulated);
  const earliest = hasDates ? new Date(Math.min(...dated.map(item => item.received!.at.getTime()))) : null;
  const window = windowFor(range, now, earliest);
  const previous = range === 'all' ? null : previousWindow(window);

  // Closed claims are historical, not pending work, so the operational view counts open claims only.
  const open = dataset.cases.filter(item => !item.frozen);
  // Without arrival dates the time filter cannot apply, so every open claim counts.
  const current = hasDates ? open.filter(item => item.received && inWindow(item.received.at, window)) : open;
  const before = hasDates && previous ? open.filter(item => item.received && inWindow(item.received.at, previous)) : null;
  const { history } = usePolicySource();
  // The active policy's quote limit; null when the policy has no single unconditional threshold.
  const limit = reviewQuoteLimit(history.active.rules);
  const previousLimit = reviewQuoteLimit(history.previous.rules);
  // History is never rewritten: a claim shows the decision that applied when it arrived.
  // Claims received before the policy change keep their earlier decision here; whether they
  // need another look under the new policy is shown separately (needsRecheck).
  const changeDate = new Date(V2_PERIOD_START);
  const decidedBeforeChange = (item: CaseItem) => !!item.received && item.received.at < changeDate;
  const atArrival = (item: CaseItem) => (decidedBeforeChange(item) ? item.baseline : item.decision);
  const recheck = open.filter(item => item.needsRecheck);

  const toInsight = (item: CaseItem) => {
    const state = states.get(item.decision.caseId)!;
    return {
      decision: atArrival(item),
      quote: parseNumber(item.row.quote_eur),
      quoteLimit: decidedBeforeChange(item) ? previousLimit : limit,
      // Without a reviewer action the outcome is the decision at arrival.
      effective: state.status === 'pending' ? atArrival(item).recommendation : state.effective,
      reviewStatus: state.status,
    };
  };
  const insights = computeInsights(current.map(toInsight), limit);
  const prior = before ? computeInsights(before.map(toInsight), limit) : null;
  const backlog = open.filter(item => {
    const state = states.get(item.decision.caseId)!;
    return state.effective === 'human_review' && state.status === 'pending';
  });
  const oldestWaiting = backlog.map(item => item.received?.at).filter((at): at is Date => !!at).sort((a, b) => a.getTime() - b.getTime())[0];

  const official = new Map(officialComparison(dataset).map(item => [item.current.caseId, item]));
  const labelled = dataset.cases.filter(item => item.label !== null && !item.frozen);
  const v1Cases = dataset.cases.filter(c => c.labelV1 !== null);
  const v2Cases = dataset.cases.filter(c => c.labelV2 !== null && !c.frozen);
  const v1Report = qualityReport(v1Cases.map(c => ({ expected: c.labelV1!, predicted: official.get(c.decision.caseId)!.decision.recommendation })));
  const v1AgainstV2 = qualityReport(v2Cases.map(c => ({ expected: c.labelV2!, predicted: official.get(c.decision.caseId)!.decision.recommendation })));
  const v2Report = qualityReport(v2Cases.map(c => ({ expected: c.labelV2!, predicted: official.get(c.decision.caseId)!.current.recommendation })));
  const changed = v2Cases.filter(c => official.get(c.decision.caseId)!.needsRecheck);
  const changedBefore = qualityReport(changed.map(c => ({ expected: c.labelV2!, predicted: official.get(c.decision.caseId)!.decision.recommendation })));
  const changedAfter = qualityReport(changed.map(c => ({ expected: c.labelV2!, predicted: official.get(c.decision.caseId)!.current.recommendation })));
  const engine = qualityReport(labelled.map(item => ({ expected: item.label!, predicted: item.decision.recommendation })));
  const reviewed = qualityReport(labelled.map(item => ({ expected: item.label!, predicted: states.get(item.decision.caseId)!.effective })));
  // Where to act is about the process as a whole, so it looks at all open claims, not the selected time range.
  const actions = suggestedActions(computeInsights(open.map(toInsight), limit), labelled.length ? engine : undefined, gapLabel);
  const series = hasDates ? receivedSeries(dated.filter(item => !item.frozen).map(item => ({ at: item.received!.at, recommendation: atArrival(item).recommendation })), window) : [];
  const priorRate = (rec: Recommendation) => (prior && prior.total ? prior.rates[rec] : null);
  const smallSample = prior !== null && prior.total > 0 && prior.total < 5 ? ` (only ${prior.total} before)` : '';
  const vs = range === 'all' ? '' : range === '1d' ? `vs yesterday${smallSample}` : `vs previous ${rangeLabels[range].toLowerCase()}${smallSample}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            Operations overview
            {simulated && <Badge variant="outline" className="font-normal text-muted-foreground" title="The case CSVs carry no timestamps; arrival dates are simulated for the demo (src/received-at.ts).">Simulated arrival dates</Badge>}
          </h2>
          <p className="text-sm text-muted-foreground">
            {hasDates ? `${insights.total} open claims received · ${formatWindow(window)} · closed claims excluded` : `${insights.total} claims · no arrival dates in this dataset, time filter off`}
          </p>
        </div>
        <ToggleGroup
          type="single" variant="outline" size="sm" spacing={0}
          value={range} onValueChange={value => value && setRange(value as TimeRange)}
          disabled={!hasDates} aria-label="Time range"
        >
          {timeRanges.map(r => <ToggleGroupItem key={r} value={r} className="px-3">{r === 'all' ? 'All' : r}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>

      <SavingsCard insights={insights} engine={labelled.length ? engine : null} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Kpi label="Claims received" value={insights.total} change={delta(insights.total, prior?.total ?? null, 'count')} better="neutral" vs={vs} />
        <MixCard
          insights={insights}
          changes={Object.fromEntries(recommendations.map(rec => [rec, insights.total ? delta(insights.rates[rec], priorRate(rec), 'pp') : null])) as Record<Recommendation, Delta | null>}
          vs={vs}
        />
        <Kpi
          label="Review backlog now" value={backlog.length} better="neutral" vs=""
          hint={oldestWaiting ? `Oldest waiting ${daysOpen(oldestWaiting, now)} days` : 'Nobody waiting'}
          alert={!!oldestWaiting && daysOpen(oldestWaiting, now) > 14}
        />
        <Kpi
          label="Needs recheck after policy change" value={recheck.length} better="neutral" vs=""
          hint={recheck.length ? `${recheck.map(item => item.decision.caseId).join(', ')} · open, result changes under ${history.active.label}` : 'No open claim changes outcome'}
        />
      </div>

      {hasDates && <TrendCard series={series} window={window} />}

      <ActionsCard actions={actions} />

      {insights.total === 0 ? (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><CalendarClockIcon /></EmptyMedia>
              <EmptyTitle>No claims received in this period</EmptyTitle>
              <EmptyDescription>Pick a longer range. Policy v1 cases run until 24 Oct; the period after is reserved for policy v2 claims.</EmptyDescription>
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
                <BarList items={insights.reviewTriggers.map(({ key, count }) => ({ label: triggerLabels[key], count }))} total={insights.mix.human_review} barClass={dotClasses.human_review} empty="No human reviews in this period." />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Most missing information</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList items={insights.infoGaps.map(({ key, count }) => ({ label: gapLabel(key), count }))} total={insights.mix.request_information} barClass={dotClasses.request_information} empty="No information requests in this period." />
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
        newReviewCases={open.filter(item => item.received && atArrival(item).recommendation === 'human_review').map(item => item.received!.at)}
      />

      <Card><CardHeader><CardTitle>Official policy change · before and after</CardTitle><CardDescription>V1 labels are supplied by the organizer. Built-in v2 expectations are team-derived from the official notice; they are not independent hidden-set validation. Closed claims are excluded from every v2 score.</CardDescription></CardHeader>
        <CardContent><Table><TableHeader><TableRow><TableHead>Evaluation</TableHead><TableHead>Correct / labelled</TableHead><TableHead>Incorrect routine</TableHead><TableHead>Unnecessary review</TableHead></TableRow></TableHeader><TableBody>
          {([['V1 vs v1 labels', v1Report], ['V1 vs v2 expectations (before)', v1AgainstV2], ['V2 vs v2 expectations (after)', v2Report], ['Changed open cases · before', changedBefore], ['Changed open cases · after', changedAfter]] as const).map(([name, r]) => <TableRow key={name}><TableCell>{name}</TableCell><TableCell>{r.labelled ? `${r.correct}/${r.labelled}` : 'Not scored'}</TableCell><TableCell>{r.labelled ? `${r.incorrectRoutine} (${Math.round(100 * r.incorrectRoutine / r.labelled)}%)` : '—'}</TableCell><TableCell>{r.labelled ? `${r.unnecessaryReview} (${Math.round(100 * r.unnecessaryReview / r.labelled)}%)` : '—'}</TableCell></TableRow>)}
        </TableBody></Table><p className="mt-3 text-xs text-muted-foreground">Error-rate denominator: all labelled claims in that row. {dataset.cases.filter(c => c.frozen).length} closed claims retain their v1 recommendation and are historical, not pending work.</p></CardContent>
      </Card>
      {labelled.length > 0 ? (
        <>
          <div className="mt-2">
            <h2 className="text-lg font-semibold tracking-tight">Decision quality</h2>
            <p className="text-sm text-muted-foreground">All {engine.labelled} labelled development cases, independent of the time filter. Labels are for measurement only, never decision inputs.</p>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Correct next step" value={`${engine.correct}/${engine.labelled}`} hint={`${pct(engine.correct / engine.labelled)} of labelled cases`} />
            <Stat label="Incorrect routine processing" value={engine.incorrectRoutine} hint="Needed more care but sent to routine" alert={engine.incorrectRoutine > 0} />
            <Stat label="Unnecessary human review" value={engine.unnecessaryReview} hint="Escalated when a lighter step sufficed" alert={engine.unnecessaryReview > 0} />
            <Stat label="Other mismatches" value={engine.labelled - engine.correct - engine.incorrectRoutine - engine.unnecessaryReview} hint="Request info instead of another step" />
          </div>
          {/* Kept as-is: these are the metrics the case asks us to report per policy version. */}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Confusion matrix</CardTitle>
                <CardDescription>Active policy recommendation against its matching official expectations, {engine.labelled} cases.</CardDescription>
              </CardHeader>
              <CardContent>
                <ConfusionTable report={engine} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Engine versus after review</CardTitle>
                <CardDescription>Effect of the overrides recorded in this browser on labelled cases.</CardDescription>
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
                    {([['Correct', 'correct'], ['Incorrect routine', 'incorrectRoutine'], ['Unnecessary review', 'unnecessaryReview']] as const).map(([label, key]) => (
                      <TableRow key={key}>
                        <TableCell>{label}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{engine[key]}</TableCell>
                        <TableCell className={cn('text-right font-mono tabular-nums', reviewed[key] !== engine[key] && 'font-semibold')}>{reviewed[key]}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><FlaskConicalIcon /></EmptyMedia>
              <EmptyTitle>No matching labels for the active policy</EmptyTitle>
              <EmptyDescription>Active-policy accuracy requires matching official policy rules and corresponding expected labels. Custom policies are not scored against a different policy’s labels. Built-in v2 expectations are team-derived.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      )}
    </div>
  );
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

function formatWindow(window: Window): string {
  return `${dayFmt.format(window.start)} – ${dayFmt.format(window.end)} ${window.end.getFullYear()}`;
}

/** Short axis label: "14:00", "12 Oct", "CW 42", "Oct 26". */
function bucketLabel(start: Date, bucket: Bucket): string {
  if (bucket === 'hour') return hourFmt.format(start);
  if (bucket === 'week') return `CW ${isoWeek(start)}`;
  if (bucket === 'month') return monthFmt.format(start);
  return dayFmt.format(start);
}

/** Full label for the tooltip: "CW 42 · 12–18 Oct 2026". */
function bucketTitle(start: Date, bucket: Bucket): string {
  if (bucket === 'hour') return `${dayFmt.format(start)}, ${hourFmt.format(start)}–${hourFmt.format(new Date(start.getTime() + 3_600_000))}`;
  if (bucket === 'week') return `CW ${isoWeek(start)} · ${dayFmt.format(start)} – ${dayFmt.format(bucketEnd(start, bucket))} ${start.getFullYear()}`;
  if (bucket === 'month') return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(start);
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(start);
}

const bucketNames: Record<Bucket, string> = { hour: 'hour', day: 'day', week: 'calendar week', month: 'month' };

/** Whole-number y-axis ticks: 0, a middle tick when it is a whole number, and the top. */
function axisTicks(max: number): number[] {
  const top = Math.max(1, max);
  const mid = top / 2;
  return top >= 2 && Number.isInteger(mid) ? [0, mid, top] : [0, top];
}

function TrendCard({ series, window }: { series: SeriesPoint[]; window: Window }) {
  const [hover, setHover] = useState<number | null>(null);
  const top = Math.max(1, ...series.map(p => p.total));
  const ticks = axisTicks(top);
  const labelEvery = Math.max(1, Math.ceil(series.length / 10));
  const v2Start = new Date(V2_PERIOD_START);
  const v2Index = v2Start > window.start && v2Start < window.end ? series.findIndex(p => p.start >= v2Start) : -1;
  const hovered = hover === null ? null : series[hover];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Claims received per {bucketNames[window.bucket]}</CardTitle>
        <CardDescription>By the engine’s recommendation · hover a bar for the exact numbers</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4 pb-4 text-xs text-muted-foreground">
          {recommendations.map(rec => (
            <span key={rec} className="flex items-center gap-1.5"><span className={cn('size-2 rounded-sm', dotClasses[rec])} /> {recommendationMeta[rec].label}</span>
          ))}
        </div>
        <div className="flex gap-2">
          {/* y-axis */}
          <div className="relative h-44 w-6 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
            {ticks.map(t => (
              <span key={t} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: `${(t / top) * 100}%` }}>{t}</span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative h-44 border-b" role="img" aria-label="Claims received over time" onMouseLeave={() => setHover(null)}>
              {ticks.filter(t => t > 0).map(t => (
                <div key={t} className="pointer-events-none absolute inset-x-0 border-t border-border/60" style={{ bottom: `${(t / top) * 100}%` }} />
              ))}
              <div className="absolute inset-0 flex items-end">
                {series.map((point, index) => (
                  <div
                    key={point.start.getTime()}
                    className={cn('relative flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end', hover === index && 'bg-muted/50')}
                    onMouseEnter={() => setHover(index)}
                  >
                    {index === v2Index && (
                      <div className="absolute inset-y-0 left-0 border-l border-dashed border-foreground/50">
                        <span className="absolute -top-4 left-1 text-[10px] whitespace-nowrap text-muted-foreground">Policy v2 period →</span>
                      </div>
                    )}
                    <div className="flex w-full max-w-4 flex-col-reverse gap-px px-px" style={{ height: `${(point.total / top) * 100}%` }}>
                      {recommendations.filter(rec => point.counts[rec] > 0).map((rec, i, shown) => (
                        <div key={rec} className={cn(dotClasses[rec], i === shown.length - 1 && 'rounded-t-[3px]')} style={{ flexGrow: point.counts[rec] }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {hovered && hover !== null && (
                <div
                  className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
                  style={{
                    left: `${((hover + 0.5) / series.length) * 100}%`,
                    transform: `translateX(${hover / series.length > 0.7 ? '-105%' : hover / series.length < 0.3 ? '5%' : '-50%'})`,
                  }}
                >
                  <div className="mb-1 font-medium">{bucketTitle(hovered.start, window.bucket)}</div>
                  <div className="mb-1.5 text-muted-foreground"><span className="font-semibold text-foreground tabular-nums">{hovered.total}</span> claim{hovered.total === 1 ? '' : 's'} received</div>
                  {hovered.total > 0 && recommendations.map(rec => (
                    <div key={rec} className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5"><span className={cn('size-2 rounded-sm', dotClasses[rec])} /> {recommendationMeta[rec].short}</span>
                      <span className="tabular-nums">{hovered.counts[rec]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-1.5 flex">
              {series.map((point, index) => (
                <div key={point.start.getTime()} className="min-w-0 flex-1 text-center text-[10px] whitespace-nowrap text-muted-foreground">
                  {index % labelEvery === 0 ? bucketLabel(point.start, window.bucket) : ''}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const assumptionFields: { key: keyof SavingsAssumptions; label: string; unit: string; step: number; percent?: boolean }[] = [
  { key: 'manualErrorRate', label: 'Wrongly paid claims in the manual process', unit: '%', step: 0.5, percent: true },
  { key: 'avgWrongPaymentEur', label: 'Average cost of one wrongly paid claim', unit: '€', step: 100 },
  { key: 'minutesPerReview', label: 'Staff time per manual review', unit: 'min', step: 5 },
  { key: 'hourlyCostEur', label: 'Staff cost per hour', unit: '€', step: 5 },
];

const isAssumptions = (value: unknown): value is SavingsAssumptions =>
  typeof value === 'object' && value !== null && assumptionFields.every(f => typeof (value as Record<string, unknown>)[f.key] === 'number');

const eur0 = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** Business view: what the system saves compared with the fully manual process a year ago. Estimates. */
function SavingsCard({ insights, engine }: { insights: Insights; engine: QualityReport | null }) {
  const [assumptions, setAssumptions] = usePersistentState<SavingsAssumptions>('savings-assumptions', defaultAssumptions, isAssumptions);
  const [editing, setEditing] = useState(false);
  // Measured error rate of routine recommendations on labelled cases (0 when nothing is labelled).
  const predictedRoutine = engine ? recommendations.reduce((n, expected) => n + engine.confusion[expected].routine_processing, 0) : 0;
  const systemWrongRoutineRate = engine && predictedRoutine ? engine.incorrectRoutine / predictedRoutine : 0;
  const s = estimateSavings({
    claims: insights.total,
    automated: insights.mix.routine_processing,
    humanReview: insights.mix.human_review,
    systemWrongRoutineRate,
  }, assumptions);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PiggyBankIcon className="size-4" /> Savings vs. manual process (1 year ago)
          <Badge variant="outline" className="font-normal text-muted-foreground">Estimate</Badge>
        </CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}><SlidersHorizontalIcon data-icon="inline-start" /> Assumptions</Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-3">
        <div>
          <div className="text-3xl font-semibold tracking-tight tabular-nums">{eur0.format(s.wrongPaymentCostSavedEur)}</div>
          <div className="text-sm font-medium">saved on wrongly paid claims</div>
          <div className="text-xs text-muted-foreground">≈ {s.wrongPaymentsBefore.toFixed(1)} → {s.wrongPaymentsNow.toFixed(1)} wrong payments</div>
        </div>
        <div>
          <div className="text-3xl font-semibold tracking-tight tabular-nums text-rec-routine-foreground">−{Math.round(s.manualReviewReduction * 100)}%</div>
          <div className="text-sm font-medium">manual reviews by staff</div>
          <div className="text-xs text-muted-foreground">{s.manualReviewsBefore} → {s.manualReviewsNow} reviews · ≈ {Math.round(s.staffHoursSaved)} h · {eur0.format(s.staffCostSavedEur)}</div>
        </div>
        <div>
          <div className="text-3xl font-semibold tracking-tight tabular-nums">{eur0.format(s.totalSavedEur)}</div>
          <div className="text-sm font-medium">saved in total</div>
          <div className="text-xs text-muted-foreground">{insights.total} claims in this period</div>
        </div>
      </CardContent>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Savings assumptions</DialogTitle>
            <DialogDescription>Estimates for a mid-sized European motor insurer. A year ago every claim was reviewed by hand. The system’s error rate comes from the labelled test cases.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {assumptionFields.map(field => {
              const value = assumptions[field.key];
              return (
                <div key={field.key} className="grid grid-cols-[1fr_auto] items-center gap-3">
                  <Label htmlFor={`assume-${field.key}`} className="text-sm font-normal">{field.label}</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      id={`assume-${field.key}`}
                      type="number"
                      min={0}
                      step={field.step}
                      className="w-24 text-right tabular-nums"
                      value={field.percent ? +(value * 100).toFixed(2) : value}
                      onChange={event => {
                        const n = Number(event.target.value);
                        if (!Number.isFinite(n) || n < 0) return;
                        setAssumptions(previous => ({ ...previous, [field.key]: field.percent ? n / 100 : n }));
                      }}
                    />
                    <span className="w-6 text-xs text-muted-foreground">{field.unit}</span>
                  </div>
                </div>
              );
            })}
            <div className="flex justify-between pt-2 text-xs text-muted-foreground">
              <span>Measured system error rate on routine: {(systemWrongRoutineRate * 100).toFixed(1)}%</span>
              <Button variant="ghost" size="sm" onClick={() => setAssumptions(defaultAssumptions)}>Reset</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

type Better = 'up' | 'down' | 'neutral';

/** "+12 pp" with an arrow; green when the move is good for the business, red when bad. */
function Change({ change, better }: { change: Delta; better: Better }) {
  let tone = 'text-muted-foreground';
  if (change.value !== 0 && better !== 'neutral') tone = (change.value > 0) === (better === 'up') ? 'text-rec-routine-foreground' : 'text-destructive';
  const Icon = change.value === 0 ? MinusIcon : change.value > 0 ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <span className={cn('inline-flex items-center font-medium tabular-nums', tone)}>
      <Icon className="size-3.5" />
      {change.value > 0 ? '+' : ''}{change.value}{change.kind === 'pp' ? ' pp' : ''}
    </span>
  );
}

const mixMeta: Record<Recommendation, { label: string; meaning: string; better: Better }> = {
  routine_processing: { label: 'Routine processing', meaning: 'Continues automatically', better: 'up' },
  request_information: { label: 'Need more information', meaning: 'Back to the claimant', better: 'down' },
  human_review: { label: 'Human review', meaning: 'A task for our team', better: 'down' },
};

const donutStroke: Record<Recommendation, string> = {
  routine_processing: 'stroke-rec-routine',
  request_information: 'stroke-rec-info',
  human_review: 'stroke-rec-review',
};

/** Where claims went: donut plus a legend with exact counts, shares and change vs the previous period. */
function MixCard({ insights, changes, vs }: { insights: Insights; changes: Record<Recommendation, Delta | null>; vs: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const gap = insights.total > 0 && recommendations.filter(rec => insights.mix[rec] > 0).length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>Where claims went</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-5">
        <svg viewBox="0 0 100 100" className="size-28 shrink-0 -rotate-90" role="img" aria-label={recommendations.map(rec => `${mixMeta[rec].label}: ${insights.mix[rec]}`).join(', ')}>
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="12" className="stroke-muted" />
          {insights.total > 0 && recommendations.map(rec => {
            const length = (insights.mix[rec] / insights.total) * c;
            const segment = (
              <circle
                key={rec} cx="50" cy="50" r={r} fill="none" strokeWidth="12" className={donutStroke[rec]}
                strokeDasharray={`${Math.max(0, length - gap)} ${c}`} strokeDashoffset={-offset}
              >
                <title>{`${mixMeta[rec].label}: ${insights.mix[rec]} (${pct(insights.rates[rec])})`}</title>
              </circle>
            );
            offset += length;
            return insights.mix[rec] > 0 ? segment : null;
          })}
        </svg>
        <ul className="flex min-w-48 flex-1 flex-col gap-2.5">
          {recommendations.map(rec => (
            <li key={rec} className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <span aria-hidden className={cn('mt-1.5 size-2 shrink-0 rounded-full', dotClasses[rec])} />
                <div>
                  <div className="text-sm font-medium">{mixMeta[rec].label}</div>
                  <div className="text-xs text-muted-foreground">{mixMeta[rec].meaning}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm tabular-nums">
                  <span className="font-semibold">{insights.mix[rec]}</span>
                  <span className="text-muted-foreground"> · {insights.total ? pct(insights.rates[rec]) : '—'}</span>
                </div>
                {changes[rec] && <div className="text-xs"><Change change={changes[rec]!} better={mixMeta[rec].better} /></div>}
              </div>
            </li>
          ))}
          {vs && insights.total > 0 && <li className="text-xs text-muted-foreground">Changes in percentage points {vs}</li>}
        </ul>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value, change, better, vs, hint, dot, alert = false }: {
  label: string; value: string | number; change?: Delta | null; better: Better; vs: string; hint?: string; dot?: Recommendation; alert?: boolean;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          {dot && <span aria-hidden className={cn('size-1.5 rounded-full', dotClasses[dot])} />}
          {label}
        </CardDescription>
        <div className={cn('text-3xl font-semibold tracking-tight tabular-nums', alert && 'text-destructive')}>{value}</div>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {hint ?? (change ? (
          <span className="flex items-center gap-1"><Change change={change} better={better} /> {vs}</span>
        ) : vs ? 'No data in previous period' : 'Whole history')}
      </CardContent>
    </Card>
  );
}

const severityMeta: Record<ActionSeverity, { icon: typeof InfoIcon; label: string; className: string }> = {
  critical: { icon: OctagonAlertIcon, label: 'Critical', className: 'border-destructive/40 bg-destructive/10 text-destructive' },
  warning: { icon: TriangleAlertIcon, label: 'Attention', className: 'border-rec-info/50 bg-rec-info/15 text-rec-info-foreground' },
  info: { icon: InfoIcon, label: 'Opportunity', className: 'border-border bg-muted text-muted-foreground' },
};

function SeverityBadge({ severity }: { severity: ActionSeverity }) {
  const meta = severityMeta[severity];
  const Icon = meta.icon;
  return <Badge variant="outline" className={cn('w-fit shrink-0 gap-1', meta.className)}><Icon /> {meta.label}</Badge>;
}

/** Headlines only; the explanation and evidence open in a dialog so the page stays scannable. */
function ActionsCard({ actions }: { actions: ReturnType<typeof suggestedActions> }) {
  const [open, setOpen] = useState<number | null>(null);
  const action = open === null ? null : actions[open];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LightbulbIcon className="size-4" /> Where to act
          {actions.length > 0 && <span className="text-sm font-normal text-muted-foreground tabular-nums">{actions.length}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing stands out across open claims.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {actions.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpen(index)}
                  className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                >
                  <SeverityBadge severity={item.severity} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <Dialog open={action !== null} onOpenChange={value => !value && setOpen(null)}>
        <DialogContent className="sm:max-w-lg">
          {action && open !== null && (
            <>
              <DialogHeader>
                <SeverityBadge severity={action.severity} />
                <DialogTitle className="text-lg leading-snug text-pretty">{action.title}</DialogTitle>
                <DialogDescription className="text-sm text-pretty">{action.detail}</DialogDescription>
              </DialogHeader>
              <div className="rounded-lg bg-muted/50 px-3.5 py-2.5 text-sm">
                <div className="text-xs font-medium text-muted-foreground">Based on</div>
                {action.evidence}
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground tabular-nums">{open + 1} of {actions.length}</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="icon" disabled={open === 0} onClick={() => setOpen(open - 1)} aria-label="Previous suggestion"><ChevronLeftIcon /></Button>
                  <Button variant="outline" size="icon" disabled={open === actions.length - 1} onClick={() => setOpen(open + 1)} aria-label="Next suggestion"><ChevronRightIcon /></Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function BarList({ items, total, barClass, empty }: { items: { label: string; count: number }[]; total: number; barClass: string; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...items.map(item => item.count));
  return (
    <ul className="flex flex-col gap-3">
      {items.map(item => (
        <li key={item.label} title={`${item.label}: ${item.count} of ${total} claims (${pct(item.count / total)})`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span>{item.label}</span>
            <span className="tabular-nums text-muted-foreground">
              <span className="font-medium text-foreground">{item.count}</span> · {pct(item.count / total)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className={cn('h-2 rounded-full', barClass)} style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function QuoteChart({ insights }: { insights: Insights }) {
  const max = Math.max(1, ...insights.quoteBands.map(band => band.count));
  const limitIndex = insights.quoteBands.findIndex(band => band.aboveLimit);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Repair quotes vs. quote limit</CardTitle>
        {(insights.limit === null || insights.unknownQuotes > 0) && (
          <CardDescription>
            {insights.limit === null ? 'The active policy has no single quote limit.' : `${insights.unknownQuotes} quote(s) unreadable`}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="relative flex h-40 items-end gap-2 border-b" role="img" aria-label={insights.quoteBands.map(band => `${band.label}: ${band.count}`).join(', ')}>
          {insights.quoteBands.map((band, index) => (
            <div key={band.label} className="group relative flex h-full flex-1 flex-col justify-end" title={`${band.label} the limit (${band.range}): ${band.count} claim(s)${band.aboveLimit ? ' → human review' : ''}`}>
              {index === limitIndex && (
                <div className="absolute inset-y-0 -left-1.5 border-l border-dashed border-foreground/50" title={insights.limit === null ? undefined : `Active policy quote limit: ${euro.format(insights.limit)}`}>
                  <span className="absolute -top-0.5 left-1 text-[10px] whitespace-nowrap text-muted-foreground">Limit</span>
                </div>
              )}
              <div className="mb-1 text-center text-xs font-medium tabular-nums">{band.count || ''}</div>
              <div
                className={cn('rounded-t-[4px] transition-opacity group-hover:opacity-80', band.aboveLimit ? dotClasses.human_review : 'bg-foreground/25')}
                style={{ height: `${(band.count / max) * 80}%`, minHeight: band.count ? 4 : 0 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-2">
          {insights.quoteBands.map(band => (
            <div key={band.label} className="flex-1 text-center text-[11px] leading-tight text-muted-foreground">
              {band.label}<br /><span className="text-[10px] opacity-70">{band.range}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-foreground/25" /> {insights.limit === null ? 'Quote distribution' : 'At or below limit'}</span>
          <span className="flex items-center gap-1.5">{insights.limit !== null && <><span className={cn('size-2 rounded-sm', dotClasses.human_review)} /> Above limit → human review</>}</span>
        </div>
      </CardContent>
    </Card>
  );
}

/** Does the team keep up? New human-review cases vs. completed reviewer decisions per bucket. */
function ThroughputCard({ window, incoming, completed }: { window: Window; incoming: Date[]; completed: Date[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const inSeries = countSeries(incoming, window);
  const doneSeries = countSeries(completed, window);
  const top = Math.max(1, ...inSeries.map(p => p.count), ...doneSeries.map(p => p.count));
  const ticks = axisTicks(top);
  const labelEvery = Math.max(1, Math.ceil(inSeries.length / 10));
  const sum = (series: { count: number }[]) => series.reduce((n, p) => n + p.count, 0);
  const totalIn = sum(inSeries);
  const totalDone = sum(doneSeries);
  const previous = previousWindow(window);
  const prevDone = sum(countSeries(completed, previous));
  const doneChange = prevDone > 0 ? Math.round(((totalDone - prevDone) / prevDone) * 100) : null;
  const backlogChange = totalIn - totalDone;
  return (
    <Card>
      <CardHeader>
        <CardTitle>New review cases vs. completed reviews</CardTitle>
        <CardDescription className="flex flex-wrap gap-x-4 gap-y-1">
          <span><span className="font-medium text-foreground tabular-nums">{totalIn}</span> new</span>
          <span>
            <span className="font-medium text-foreground tabular-nums">{totalDone}</span> completed
            {doneChange !== null && <> · <Change change={{ value: doneChange, kind: 'count' }} better="up" />%</>}
          </span>
          <span className={cn(backlogChange > 0 ? 'text-destructive' : backlogChange < 0 ? 'text-rec-routine-foreground' : '')}>
            Backlog {backlogChange > 0 ? `grew by ${backlogChange}` : backlogChange < 0 ? `shrank by ${-backlogChange}` : 'unchanged'}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4 pb-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className={cn('h-0.5 w-3 rounded-full', dotClasses.human_review)} /> New human-review cases</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded-full bg-primary/70" /> Completed reviews</span>
        </div>
        <div className="flex gap-2">
          <div className="relative h-36 w-6 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
            {ticks.map(t => <span key={t} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: `${(t / top) * 100}%` }}>{t}</span>)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative h-36 border-b" onMouseLeave={() => setHover(null)}>
              {ticks.filter(t => t > 0).map(t => <div key={t} className="pointer-events-none absolute inset-x-0 border-t border-border/60" style={{ bottom: `${(t / top) * 100}%` }} />)}
              {/* Lines: one point per bucket, counts per bucket (not cumulative), so waves stay visible. */}
              <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${inSeries.length} 100`} preserveAspectRatio="none" aria-hidden>
                {([[inSeries, 'stroke-rec-review'], [doneSeries, 'stroke-primary/70']] as const).map(([series, stroke]) => (
                  <polyline
                    key={stroke}
                    fill="none"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    className={stroke}
                    points={series.map((p, i) => `${i + 0.5},${100 - (p.count / top) * 100}`).join(' ')}
                  />
                ))}
              </svg>
              {([[inSeries, dotClasses.human_review], [doneSeries, 'bg-primary']] as const).map(([series, fill]) =>
                series.map((p, i) => p.count > 0 && (
                  <span
                    key={`${fill}-${i}`}
                    className={cn('pointer-events-none absolute size-2 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-card', fill, hover === i && 'size-2.5')}
                    style={{ left: `${((i + 0.5) / series.length) * 100}%`, bottom: `${(p.count / top) * 100}%` }}
                  />
                )),
              )}
              {hover !== null && (
                <div className="pointer-events-none absolute inset-y-0 border-l border-foreground/30" style={{ left: `${((hover + 0.5) / inSeries.length) * 100}%` }} />
              )}
              <div className="absolute inset-0 flex">
                {inSeries.map((point, index) => (
                  <div key={point.start.getTime()} className="h-full min-w-0 flex-1" onMouseEnter={() => setHover(index)} />
                ))}
              </div>
              {hover !== null && (
                <div
                  className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
                  style={{ left: `${((hover + 0.5) / inSeries.length) * 100}%`, transform: `translateX(${hover / inSeries.length > 0.7 ? '-105%' : hover / inSeries.length < 0.3 ? '5%' : '-50%'})` }}
                >
                  <div className="mb-1 font-medium">{bucketTitle(inSeries[hover].start, window.bucket)}</div>
                  <div className="flex justify-between gap-4"><span>New review cases</span><span className="tabular-nums">{inSeries[hover].count}</span></div>
                  <div className="flex justify-between gap-4"><span>Completed reviews</span><span className="tabular-nums">{doneSeries[hover].count}</span></div>
                </div>
              )}
            </div>
            <div className="mt-1.5 flex">
              {inSeries.map((point, index) => (
                <div key={point.start.getTime()} className="min-w-0 flex-1 text-center text-[10px] whitespace-nowrap text-muted-foreground">
                  {index % labelEvery === 0 ? bucketLabel(point.start, window.bucket) : ''}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Owner view of what reviewers did: actions per reviewer, queue figures and the full audit log. */
function ReviewerActivity({ events, window, reviewer, onReviewerChange, insights, renderLog, newReviewCases, waitingNow }: {
  events: ReviewEvent[]; window: Window | null; reviewer: string; onReviewerChange: (value: string) => void; insights: Insights;
  renderLog: (events: ReviewEvent[]) => ReactNode; newReviewCases: Date[]; waitingNow: number;
}) {
  const inRange = window ? events.filter(event => inWindow(new Date(event.at), window)) : events;
  const reviewers = [...new Set(events.map(event => event.reviewer))].sort();
  const shown = reviewer === 'all' ? inRange : inRange.filter(event => event.reviewer === reviewer);
  const perReviewer = new Map<string, number>();
  for (const event of inRange) perReviewer.set(event.reviewer, (perReviewer.get(event.reviewer) ?? 0) + 1);
  return (
    <>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Reviewer activity</h2>
        <Select value={reviewer} onValueChange={onReviewerChange}>
          <SelectTrigger className="w-52" aria-label="Filter by reviewer"><SelectValue /></SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="all">All reviewers</SelectItem>
            {reviewers.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {window && (
        <ThroughputCard
          window={window}
          incoming={newReviewCases}
          completed={(reviewer === 'all' ? events : events.filter(event => event.reviewer === reviewer)).filter(event => event.action !== 'reverted').map(event => new Date(event.at))}
        />
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Actions per reviewer</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              items={[...perReviewer].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ label: name, count }))}
              total={inRange.length}
              barClass="bg-primary/70"
              empty="No reviewer actions in this period."
            />
          </CardContent>
        </Card>
        <WorkloadCard insights={insights} waitingNow={waitingNow} />
      </div>
      {renderLog(shown)}
    </>
  );
}

function WorkloadCard({ insights, waitingNow }: { insights: Insights; waitingNow: number }) {
  const { workload } = insights;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ActivityIcon className="size-4" /> Review queue</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
          <MiniStat label="Waiting now" value={waitingNow} />
          <MiniStat label="Reviewed" value={workload.reviewed} />
          <MiniStat label="Overridden" value={workload.overridden} />
          <MiniStat label="Override rate" value={workload.overrideRate === null ? '—' : pct(workload.overrideRate)} />
        </div>
        {insights.overridesByRule.length > 0 && (
          <div className="text-sm">
            <div className="mb-1 font-medium">Overrides by rule</div>
            <ul className="flex flex-col gap-1">
              {insights.overridesByRule.map(({ key, count }) => (
                <li key={key} className="flex justify-between"><code className="font-mono text-xs">{key}</code><span className="tabular-nums">{count}</span></li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint, alert = false }: { label: string; value: string | number; hint: string; alert?: boolean }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <div className={cn('text-3xl font-semibold tracking-tight tabular-nums', alert && 'text-destructive')}>{value}</div>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-3">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ConfusionTable({ report }: { report: QualityReport }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-xs">Label ↓ · Engine →</TableHead>
          {recommendations.map(rec => <TableHead key={rec} className="text-center text-xs">{recommendationMeta[rec].short}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {recommendations.map(expected => (
          <TableRow key={expected}>
            <TableCell className="text-xs font-medium">{recommendationMeta[expected].short}</TableCell>
            {recommendations.map(predicted => {
              const count = report.confusion[expected][predicted];
              const hit = expected === predicted;
              return (
                <TableCell key={predicted} className="text-center">
                  <span className={cn(
                    'inline-grid min-w-9 place-items-center rounded-md px-2 py-1 font-mono text-sm tabular-nums',
                    count === 0 ? 'text-muted-foreground/60' : hit ? 'bg-muted font-semibold' : 'bg-destructive/10 font-semibold text-destructive',
                  )}>
                    {count}
                  </span>
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
