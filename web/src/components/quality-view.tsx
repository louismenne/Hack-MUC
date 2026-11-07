import { ActivityIcon, FlaskConicalIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { recommendationMeta } from '@/lib/policy';
import type { Dataset } from '@/lib/datasets';
import { RecommendationBadge, dotClasses } from '@/components/recommendation-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { qualityReport, type QualityReport } from '../../../src/quality';
import { recommendations, type ReviewState } from '../../../src/review';

export function QualityView({ dataset, states }: { dataset: Dataset; states: Map<string, ReviewState> }) {
  const labelled = dataset.cases.filter(item => item.label !== null && item.claim.case_status !== 'closed');
  const v1Cases = dataset.cases.filter(c => c.labelV1 !== null);
  const v2Cases = dataset.cases.filter(c => c.labelV2 !== null && c.claim.case_status !== 'closed');
  const v1Report = qualityReport(v1Cases.map(c => ({ expected: c.labelV1!, predicted: c.baseline.recommendation })));
  const v1AgainstV2 = qualityReport(v2Cases.map(c => ({ expected: c.labelV2!, predicted: c.baseline.recommendation })));
  const v2Report = qualityReport(v2Cases.map(c => ({ expected: c.labelV2!, predicted: c.decision.recommendation })));
  const changed = v2Cases.filter(c => c.needsRecheck);
  const changedBefore = qualityReport(changed.map(c => ({ expected: c.labelV2!, predicted: c.baseline.recommendation })));
  const changedAfter = qualityReport(changed.map(c => ({ expected: c.labelV2!, predicted: c.decision.recommendation })));
  const engine = qualityReport(labelled.map(item => ({ expected: item.label!, predicted: item.decision.recommendation })));
  const reviewed = qualityReport(labelled.map(item => ({ expected: item.label!, predicted: states.get(item.decision.caseId)!.effective })));
  const all = [...states.values()];
  const reviewedCount = all.filter(state => state.status !== 'pending').length;
  const overriddenCount = all.filter(state => state.status === 'overridden').length;
  const mix = recommendations.map(rec => ({ rec, count: dataset.cases.filter(item => item.decision.recommendation === rec).length }));

  return (
    <div className="flex flex-col gap-4">
      <Card><CardHeader><CardTitle>Official policy change · before and after</CardTitle><CardDescription>V1 labels are supplied by the organizer. Built-in v2 expectations are team-derived from the official notice; they are not independent hidden-set validation. Closed claims are excluded from every v2 score.</CardDescription></CardHeader>
        <CardContent><Table><TableHeader><TableRow><TableHead>Evaluation</TableHead><TableHead>Correct / labelled</TableHead><TableHead>Incorrect routine</TableHead><TableHead>Unnecessary review</TableHead></TableRow></TableHeader><TableBody>
          {([['V1 vs v1 labels', v1Report], ['V1 vs v2 expectations (before)', v1AgainstV2], ['V2 vs v2 expectations (after)', v2Report], ['Changed open cases · before', changedBefore], ['Changed open cases · after', changedAfter]] as const).map(([name, r]) => <TableRow key={name}><TableCell>{name}</TableCell><TableCell>{r.labelled ? `${r.correct}/${r.labelled}` : 'Not scored'}</TableCell><TableCell>{r.labelled ? `${r.incorrectRoutine} (${Math.round(100 * r.incorrectRoutine / r.labelled)}%)` : '—'}</TableCell><TableCell>{r.labelled ? `${r.unnecessaryReview} (${Math.round(100 * r.unnecessaryReview / r.labelled)}%)` : '—'}</TableCell></TableRow>)}
        </TableBody></Table><p className="mt-3 text-xs text-muted-foreground">Error-rate denominator: all labelled claims in that row. {dataset.cases.filter(c => c.claim.case_status === 'closed').length} closed claims retain their v1 recommendation and are historical, not pending work.</p></CardContent>
      </Card>
      {labelled.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Correct next step" value={`${engine.correct}/${engine.labelled}`} hint={`${Math.round((engine.correct / engine.labelled) * 100)}% of labelled cases`} />
            <Stat label="Incorrect routine processing" value={engine.incorrectRoutine} hint="Needed more care but sent to routine" alert={engine.incorrectRoutine > 0} />
            <Stat label="Unnecessary human review" value={engine.unnecessaryReview} hint="Escalated when a lighter step sufficed" alert={engine.unnecessaryReview > 0} />
            <Stat label="Other mismatches" value={engine.labelled - engine.correct - engine.incorrectRoutine - engine.unnecessaryReview} hint="Request info instead of another step" />
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Confusion matrix</CardTitle>
                <CardDescription>Official v2 recommendation against the v2 expectation, {engine.labelled} cases.</CardDescription>
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
              <EmptyDescription>Accuracy is measured only where an expected_v2 label exists. Built-in development expectations are team-derived. Predictions on this set are not scored.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recommendation mix</CardTitle>
            <CardDescription>Automated recommendations across all {dataset.cases.length} cases in {dataset.name.toLowerCase()}.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={mix.map(({ rec, count }) => `${recommendationMeta[rec].label}: ${count}`).join(', ')}>
              {mix.filter(({ count }) => count > 0).map(({ rec, count }) => (
                <div key={rec} className={dotClasses[rec]} style={{ flexGrow: count }} />
              ))}
            </div>
            <ul className="flex flex-col gap-1.5">
              {mix.map(({ rec, count }) => (
                <li key={rec} className="flex items-center justify-between text-sm">
                  <RecommendationBadge value={rec} />
                  <span className="font-mono tabular-nums">{count} <span className="text-muted-foreground">({Math.round((count / dataset.cases.length) * 100)}%)</span></span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ActivityIcon className="size-4" /> Reviewer activity</CardTitle>
            <CardDescription>The supplied data has no reviewer corrections. These counts come from actions recorded in this browser.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <MiniStat label="Reviewed" value={reviewedCount} />
              <MiniStat label="Overridden" value={overriddenCount} />
              <MiniStat label="Override rate" value={reviewedCount ? `${Math.round((overriddenCount / reviewedCount) * 100)}%` : '—'} />
            </div>
            <div className="text-sm">
              <div className="mb-1.5 font-medium">What we would monitor in production</div>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
                <li>Override rate by rule, to spot rules reviewers disagree with</li>
                <li>Routine cases later reopened or corrected once final outcomes arrive</li>
                <li>Share of request_information caused by missing or unreadable inputs</li>
                <li>Shifts in the recommendation mix and quote distribution over time</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, alert = false }: { label: string; value: string | number; hint: string; alert?: boolean }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={cn('font-mono text-2xl tabular-nums', alert && 'text-destructive')}>{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-3">
      <div className="font-mono text-xl font-semibold tabular-nums">{value}</div>
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
