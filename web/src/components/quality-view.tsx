import { ActivityIcon, CircleAlertIcon, FlaskConicalIcon, InfoIcon, LightbulbIcon, OctagonAlertIcon, TriangleAlertIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fieldLabels, recommendationMeta } from '@/lib/policy';
import type { Dataset } from '@/lib/datasets';
import { dotClasses } from '@/components/recommendation-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { computeInsights, suggestedActions, triggerLabels, type ActionSeverity, type Insights } from '../../../src/insights';
import { qualityReport, type QualityReport } from '../../../src/quality';
import { recommendations, type ReviewState } from '../../../src/review';
import type { Field } from '../../../src/triage';

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

export function QualityView({ dataset, states }: { dataset: Dataset; states: Map<string, ReviewState> }) {
  const labelled = dataset.cases.filter(item => item.label !== null);
  const engine = qualityReport(labelled.map(item => ({ expected: item.label!, predicted: item.decision.recommendation })));
  const reviewed = qualityReport(labelled.map(item => ({ expected: item.label!, predicted: states.get(item.decision.caseId)!.effective })));
  const insights = computeInsights(dataset.cases.map(item => {
    const state = states.get(item.decision.caseId)!;
    return {
      decision: item.decision,
      quote: typeof item.claim.quote_eur === 'number' ? item.claim.quote_eur : null,
      effective: state.effective,
      reviewStatus: state.status,
    };
  }));
  const actions = suggestedActions(insights, labelled.length ? engine : undefined, gapLabel);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Operations overview</h2>
        <p className="text-sm text-muted-foreground">
          How triage is performing on {dataset.name.toLowerCase()} ({insights.total} claims) and where to invest. Every figure is computed from the engine’s decisions and the structured claim fields.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Automated to routine" value={pct(insights.rates.routine_processing)} hint={`${insights.mix.routine_processing} of ${insights.total} claims need no manual step`} dot="routine_processing" />
        <Stat label="Need more information" value={pct(insights.rates.request_information)} hint={`${insights.mix.request_information} claims wait on the claimant`} dot="request_information" />
        <Stat label="Sent to human review" value={pct(insights.rates.human_review)} hint={`${insights.workload.reviewQueue} still in the reviewer queue`} dot="human_review" />
        {labelled.length > 0 ? (
          <>
            <Stat label="Correct next step" value={pct(engine.correct / engine.labelled)} hint={`${engine.correct} of ${engine.labelled} labelled cases`} />
            <Stat label="Wrongly sent to routine" value={engine.incorrectRoutine} hint="The costliest error: must stay at 0" alert={engine.incorrectRoutine > 0} />
          </>
        ) : (
          <Stat label="Decision accuracy" value="—" hint="No labels in this dataset, so accuracy is not measured" />
        )}
      </div>

      <ActionsCard actions={actions} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Why claims go to human review</CardTitle>
            <CardDescription>
              Policy triggers behind the {insights.mix.human_review} human-review claims.
              {insights.multiTriggerReviews > 0 && ` ${insights.multiTriggerReviews} claim(s) hit more than one trigger, so bars can add up to more.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              items={insights.reviewTriggers.map(({ key, count }) => ({ label: triggerLabels[key], count }))}
              total={insights.mix.human_review}
              barClass={dotClasses.human_review}
              empty="No claims were sent to human review."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What is missing when we ask for information</CardTitle>
            <CardDescription>Gaps behind the {insights.mix.request_information} request-information claims. Recurring gaps point to unclear upload requirements.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              items={insights.infoGaps.map(({ key, count }) => ({ label: gapLabel(key), count }))}
              total={insights.mix.request_information}
              barClass={dotClasses.request_information}
              empty="No claims needed more information."
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <QuoteChart insights={insights} />
        <WorkloadCard insights={insights} />
      </div>

      {labelled.length > 0 ? (
        <>
          <div className="mt-2">
            <h2 className="text-lg font-semibold tracking-tight">Decision quality</h2>
            <p className="text-sm text-muted-foreground">Engine recommendations against the {engine.labelled} labelled development cases. Labels are used for measurement only, never as decision inputs.</p>
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
                <CardDescription>Engine recommendation against the development label, {engine.labelled} cases.</CardDescription>
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
              <EmptyTitle>No labels in this dataset</EmptyTitle>
              <EmptyDescription>Accuracy is measured only where an expected_v1 label exists, such as the 14 development cases. Predictions on this set are not scored.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      )}
    </div>
  );
}

const severityMeta: Record<ActionSeverity, { icon: typeof InfoIcon; label: string; className: string }> = {
  critical: { icon: OctagonAlertIcon, label: 'Critical', className: 'border-destructive/40 bg-destructive/10 text-destructive' },
  warning: { icon: TriangleAlertIcon, label: 'Attention', className: 'border-rec-info/50 bg-rec-info/15 text-rec-info-foreground' },
  info: { icon: InfoIcon, label: 'Opportunity', className: 'border-border bg-muted text-muted-foreground' },
};

function ActionsCard({ actions }: { actions: ReturnType<typeof suggestedActions> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><LightbulbIcon className="size-4" /> Where to act</CardTitle>
        <CardDescription>Suggestions generated by fixed rules from the figures on this page, not by an AI. Each one shows the evidence it is based on.</CardDescription>
      </CardHeader>
      <CardContent>
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing stands out in this dataset.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {actions.map(action => {
              const meta = severityMeta[action.severity];
              const Icon = meta.icon;
              return (
                <li key={action.id} className="flex flex-col gap-1.5 rounded-lg border p-3.5">
                  <Badge variant="outline" className={cn('w-fit gap-1', meta.className)}><Icon /> {meta.label}</Badge>
                  <div className="text-sm font-semibold text-pretty">{action.title}</div>
                  <p className="text-sm text-muted-foreground text-pretty">{action.detail}</p>
                  <div className="mt-auto pt-1 text-xs text-muted-foreground">Based on: {action.evidence}</div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
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
        <CardTitle>Repair quotes against the €1,500 limit</CardTitle>
        <CardDescription>
          Quotes above the limit always go to human review. {insights.nearLimitBelow} claim(s) sit just below it (€1,200–1,500), {insights.nearLimitAbove} just above (€1,500–1,800).
          {insights.unknownQuotes > 0 && ` ${insights.unknownQuotes} quote(s) blank or unreadable.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative flex h-40 items-end gap-2 border-b" role="img" aria-label={insights.quoteBands.map(band => `${band.label}: ${band.count}`).join(', ')}>
          {insights.quoteBands.map((band, index) => (
            <div key={band.label} className="group relative flex h-full flex-1 flex-col justify-end" title={`${band.label}: ${band.count} claim(s)${band.aboveLimit ? ' · above limit, human review' : ''}`}>
              {index === limitIndex && (
                <div className="absolute inset-y-0 -left-1.5 border-l border-dashed border-foreground/50">
                  <span className="absolute -top-0.5 left-1 text-[10px] whitespace-nowrap text-muted-foreground">€1,500 limit</span>
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
          {insights.quoteBands.map(band => <div key={band.label} className="flex-1 text-center text-[11px] text-muted-foreground">{band.label}</div>)}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-foreground/25" /> Within limit</span>
          <span className="flex items-center gap-1.5"><span className={cn('size-2 rounded-sm', dotClasses.human_review)} /> Above limit → human review</span>
        </div>
      </CardContent>
    </Card>
  );
}

function WorkloadCard({ insights }: { insights: Insights }) {
  const { workload } = insights;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ActivityIcon className="size-4" /> Reviewer workload</CardTitle>
        <CardDescription>The supplied data has no reviewer corrections. These counts come from actions recorded in this browser.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
          <MiniStat label="In queue" value={workload.reviewQueue} />
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
        <div className="text-sm">
          <div className="mb-1.5 flex items-center gap-1.5 font-medium"><CircleAlertIcon className="size-3.5" /> What we monitor after launch</div>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
            <li>Override rate by rule, to spot rules reviewers disagree with</li>
            <li>Routine cases later reopened once final outcomes arrive</li>
            <li>Share of information requests caused by missing uploads</li>
            <li>Shifts in recommendation mix and quotes after a policy change</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint, alert = false, dot }: { label: string; value: string | number; hint: string; alert?: boolean; dot?: keyof typeof dotClasses }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          {dot && <span aria-hidden className={cn('size-1.5 rounded-full', dotClasses[dot])} />}
          {label}
        </CardDescription>
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
