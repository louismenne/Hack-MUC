import { useState } from 'react';

import { cn } from '@/lib/utils';
import { euro, recommendationMeta } from '@/lib/policy';

import { dotClasses } from '@/components/recommendation-badge';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { type Insights } from '../../../../src/insights';

import { V2_PERIOD_START } from '../../../../src/received-at';
import { recommendations } from '../../../../src/review';
import { countSeries, previousWindow, type SeriesPoint, type Window } from '../../../../src/timeline';

import { bucketLabel } from './format';
import { bucketTitle } from './format';
import { bucketNames } from './format';
import { axisTicks } from './format';
import { Change } from './metrics';
export function TrendCard({
  series,
  window,
  showDemoPolicyMarker,
}: {
  series: SeriesPoint[];
  window: Window;
  showDemoPolicyMarker: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const top = Math.max(1, ...series.map((p) => p.total));
  const ticks = axisTicks(top);
  const labelEvery = Math.max(1, Math.ceil(series.length / 10));
  const v2Start = new Date(V2_PERIOD_START);
  const v2Index =
    showDemoPolicyMarker && v2Start > window.start && v2Start < window.end
      ? series.findIndex((p) => p.start >= v2Start)
      : -1;
  const hovered = hover === null ? null : series[hover];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Claims received per {bucketNames[window.bucket]}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4 pb-4 text-xs text-muted-foreground">
          {recommendations.map((rec) => (
            <span key={rec} className="flex items-center gap-1.5">
              <span className={cn('size-2 rounded-sm', dotClasses[rec])} /> {recommendationMeta[rec].label}
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          {/* y-axis */}
          <div className="relative h-44 w-6 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute right-0 translate-y-1/2 leading-none"
                style={{ bottom: `${(t / top) * 100}%` }}
              >
                {t}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="relative h-44 border-b"
              role="img"
              aria-label="Claims received over time"
              onMouseLeave={() => setHover(null)}
            >
              {ticks
                .filter((t) => t > 0)
                .map((t) => (
                  <div
                    key={t}
                    className="pointer-events-none absolute inset-x-0 border-t border-border/60"
                    style={{ bottom: `${(t / top) * 100}%` }}
                  />
                ))}
              <div className="absolute inset-0 flex items-end">
                {series.map((point, index) => (
                  <div
                    key={point.start.getTime()}
                    className={cn(
                      'relative flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end',
                      hover === index && 'bg-muted/50',
                    )}
                    onMouseEnter={() => setHover(index)}
                  >
                    {index === v2Index && (
                      <div className="absolute inset-y-0 left-0 border-l border-dashed border-foreground/50">
                        <span className="absolute -top-4 left-1 text-[10px] whitespace-nowrap text-muted-foreground">
                          Policy v2 period →
                        </span>
                      </div>
                    )}
                    <div
                      className="flex w-full max-w-4 flex-col-reverse gap-px px-px"
                      style={{ height: `${(point.total / top) * 100}%` }}
                    >
                      {recommendations
                        .filter((rec) => point.counts[rec] > 0)
                        .map((rec, i, shown) => (
                          <div
                            key={rec}
                            className={cn(dotClasses[rec], i === shown.length - 1 && 'rounded-t-[3px]')}
                            style={{ flexGrow: point.counts[rec] }}
                          />
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
                  <div className="mb-1.5 text-muted-foreground">
                    <span className="font-semibold text-foreground tabular-nums">{hovered.total}</span> claim
                    {hovered.total === 1 ? '' : 's'} received
                  </div>
                  {hovered.total > 0 &&
                    recommendations.map((rec) => (
                      <div key={rec} className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5">
                          <span className={cn('size-2 rounded-sm', dotClasses[rec])} /> {recommendationMeta[rec].short}
                        </span>
                        <span className="tabular-nums">{hovered.counts[rec]}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
            <div className="mt-1.5 flex">
              {series.map((point, index) => (
                <div
                  key={point.start.getTime()}
                  className="min-w-0 flex-1 text-center text-[10px] whitespace-nowrap text-muted-foreground"
                >
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

export function QuoteChart({ insights }: { insights: Insights }) {
  const max = Math.max(1, ...insights.quoteBands.map((band) => band.count));
  const limitIndex = insights.quoteBands.findIndex((band) => band.aboveLimit);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Repair quotes vs. quote limit</CardTitle>
        {(insights.limit === null || insights.unknownQuotes > 0) && (
          <CardDescription>
            {insights.limit === null
              ? 'The active policy has no single quote limit.'
              : `${insights.unknownQuotes} ${insights.unknownQuotes === 1 ? 'quote' : 'quotes'} unreadable`}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div
          className="relative flex h-40 items-end gap-2 border-b"
          role="img"
          aria-label={insights.quoteBands.map((band) => `${band.label}: ${band.count}`).join(', ')}
        >
          {insights.quoteBands.map((band, index) => (
            <div
              key={band.label}
              className="group relative flex h-full flex-1 flex-col justify-end"
              title={`${band.label} the limit (${band.range}): ${band.count} ${band.count === 1 ? 'claim' : 'claims'}${band.aboveLimit ? ' → human review' : ''}`}
            >
              {index === limitIndex && (
                <div
                  className="absolute inset-y-0 -left-1.5 border-l border-dashed border-foreground/50"
                  title={
                    insights.limit === null ? undefined : `Active policy quote limit: ${euro.format(insights.limit)}`
                  }
                >
                  <span className="absolute -top-0.5 left-1 text-[10px] whitespace-nowrap text-muted-foreground">
                    Limit
                  </span>
                </div>
              )}
              <div className="mb-1 text-center text-xs font-medium tabular-nums">{band.count || ''}</div>
              <div
                className={cn(
                  'rounded-t-[4px] transition-opacity group-hover:opacity-80',
                  band.aboveLimit ? dotClasses.human_review : 'bg-foreground/25',
                )}
                style={{ height: `${(band.count / max) * 80}%`, minHeight: band.count ? 4 : 0 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-2">
          {insights.quoteBands.map((band) => (
            <div key={band.label} className="flex-1 text-center text-[11px] leading-tight text-muted-foreground">
              {band.label}
              <br />
              <span className="text-[10px] opacity-70">{band.range}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-foreground/25" />{' '}
            {insights.limit === null ? 'Quote distribution' : 'At or below limit'}
          </span>
          <span className="flex items-center gap-1.5">
            {insights.limit !== null && (
              <>
                <span className={cn('size-2 rounded-sm', dotClasses.human_review)} /> Above limit → human review
              </>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/** Does the team keep up? New human-review cases vs. completed reviewer decisions per bucket. */
export function ThroughputCard({
  window,
  incoming,
  completed,
}: {
  window: Window;
  incoming: Date[];
  completed: Date[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const inSeries = countSeries(incoming, window);
  const doneSeries = countSeries(completed, window);
  const top = Math.max(1, ...inSeries.map((p) => p.count), ...doneSeries.map((p) => p.count));
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
          <span>
            <span className="font-medium text-foreground tabular-nums">{totalIn}</span> new
          </span>
          <span>
            <span className="font-medium text-foreground tabular-nums">{totalDone}</span> completed
            {doneChange !== null && (
              <>
                {' '}
                · <Change change={{ value: doneChange, kind: 'count' }} better="up" />%
              </>
            )}
          </span>
          <span
            className={cn(
              backlogChange > 0 ? 'text-destructive' : backlogChange < 0 ? 'text-rec-routine-foreground' : '',
            )}
          >
            Backlog{' '}
            {backlogChange > 0
              ? `grew by ${backlogChange}`
              : backlogChange < 0
                ? `shrank by ${-backlogChange}`
                : 'unchanged'}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4 pb-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className={cn('h-0.5 w-3 rounded-full', dotClasses.human_review)} /> New human-review cases
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full bg-primary/70" /> Completed reviews
          </span>
        </div>
        <div className="flex gap-2">
          <div className="relative h-36 w-6 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute right-0 translate-y-1/2 leading-none"
                style={{ bottom: `${(t / top) * 100}%` }}
              >
                {t}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative h-36 border-b" onMouseLeave={() => setHover(null)}>
              {ticks
                .filter((t) => t > 0)
                .map((t) => (
                  <div
                    key={t}
                    className="pointer-events-none absolute inset-x-0 border-t border-border/60"
                    style={{ bottom: `${(t / top) * 100}%` }}
                  />
                ))}
              {/* Lines: one point per bucket, counts per bucket (not cumulative), so waves stay visible. */}
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                viewBox={`0 0 ${inSeries.length} 100`}
                preserveAspectRatio="none"
                aria-hidden
              >
                {(
                  [
                    [inSeries, 'stroke-rec-review'],
                    [doneSeries, 'stroke-primary/70'],
                  ] as const
                ).map(([series, stroke]) => (
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
              {(
                [
                  [inSeries, dotClasses.human_review],
                  [doneSeries, 'bg-primary'],
                ] as const
              ).map(([series, fill]) =>
                series.map(
                  (p, i) =>
                    p.count > 0 && (
                      <span
                        key={`${fill}-${i}`}
                        className={cn(
                          'pointer-events-none absolute size-2 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-card',
                          fill,
                          hover === i && 'size-2.5',
                        )}
                        style={{ left: `${((i + 0.5) / series.length) * 100}%`, bottom: `${(p.count / top) * 100}%` }}
                      />
                    ),
                ),
              )}
              {hover !== null && (
                <div
                  className="pointer-events-none absolute inset-y-0 border-l border-foreground/30"
                  style={{ left: `${((hover + 0.5) / inSeries.length) * 100}%` }}
                />
              )}
              <div className="absolute inset-0 flex">
                {inSeries.map((point, index) => (
                  <div
                    key={point.start.getTime()}
                    className="h-full min-w-0 flex-1"
                    onMouseEnter={() => setHover(index)}
                  />
                ))}
              </div>
              {hover !== null && (
                <div
                  className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
                  style={{
                    left: `${((hover + 0.5) / inSeries.length) * 100}%`,
                    transform: `translateX(${hover / inSeries.length > 0.7 ? '-105%' : hover / inSeries.length < 0.3 ? '5%' : '-50%'})`,
                  }}
                >
                  <div className="mb-1 font-medium">{bucketTitle(inSeries[hover].start, window.bucket)}</div>
                  <div className="flex justify-between gap-4">
                    <span>New review cases</span>
                    <span className="tabular-nums">{inSeries[hover].count}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Completed reviews</span>
                    <span className="tabular-nums">{doneSeries[hover].count}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-1.5 flex">
              {inSeries.map((point, index) => (
                <div
                  key={point.start.getTime()}
                  className="min-w-0 flex-1 text-center text-[10px] whitespace-nowrap text-muted-foreground"
                >
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
