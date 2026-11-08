import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { recommendationMeta } from '@/lib/policy';

import { dotClasses } from '@/components/recommendation-badge';

import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { Label } from '@/components/ui/label';

import { type Insights } from '../../../../src/insights';
import { type QualityReport } from '../../../../src/quality';

import { recommendations } from '../../../../src/review';
import { type Delta } from '../../../../src/timeline';
import type { Recommendation } from '../../../../src/triage';

import { pct } from './format';
type Better = 'up' | 'down' | 'neutral';

/** "+12 pp" with an arrow; green when the move is good for the business, red when bad. */
export function Change({ change, better }: { change: Delta; better: Better }) {
  let tone = 'text-muted-foreground';
  if (change.value !== 0 && better !== 'neutral')
    tone = change.value > 0 === (better === 'up') ? 'text-rec-routine-foreground' : 'text-destructive';
  const Icon = change.value === 0 ? MinusIcon : change.value > 0 ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <span className={cn('inline-flex items-center font-medium tabular-nums', tone)}>
      <Icon className="size-3.5" />
      {change.value > 0 ? '+' : ''}
      {change.value}
      {change.kind === 'pp' ? ' pp' : ''}
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
export function MixCard({
  insights,
  changes,
  vs,
}: {
  insights: Insights;
  changes: Record<Recommendation, Delta | null>;
  vs: string;
}) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const gap = insights.total > 0 && recommendations.filter((rec) => insights.mix[rec] > 0).length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="label-mono">Where claims went</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-5">
        <svg
          viewBox="0 0 100 100"
          className="size-28 shrink-0 -rotate-90"
          role="img"
          aria-label={recommendations.map((rec) => `${mixMeta[rec].label}: ${insights.mix[rec]}`).join(', ')}
        >
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="12" className="stroke-muted" />
          {insights.total > 0 &&
            recommendations.map((rec) => {
              const length = (insights.mix[rec] / insights.total) * c;
              const segment = (
                <circle
                  key={rec}
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  strokeWidth="12"
                  className={donutStroke[rec]}
                  strokeDasharray={`${Math.max(0, length - gap)} ${c}`}
                  strokeDashoffset={-offset}
                >
                  <title>{`${mixMeta[rec].label}: ${insights.mix[rec]} (${pct(insights.rates[rec])})`}</title>
                </circle>
              );
              offset += length;
              return insights.mix[rec] > 0 ? segment : null;
            })}
        </svg>
        <ul className="flex min-w-48 flex-1 flex-col gap-2.5">
          {recommendations.map((rec) => (
            <li key={rec} className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <span aria-hidden className={cn('mt-1.5 size-2 shrink-0 rounded-full', dotClasses[rec])} />
                <div>
                  <div className="text-sm font-medium">{mixMeta[rec].label}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm tabular-nums">
                  <span className="font-semibold">{insights.mix[rec]}</span>
                  <span className="text-muted-foreground"> · {insights.total ? pct(insights.rates[rec]) : '—'}</span>
                </div>
                {changes[rec] && (
                  <div className="text-xs">
                    <Change change={changes[rec]!} better={mixMeta[rec].better} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function Kpi({
  label,
  value,
  change,
  better,
  vs,
  hint,
  dot,
  alert = false,
  accent,
}: {
  label: string;
  value: string | number;
  change?: Delta | null;
  better: Better;
  vs: string;
  hint?: string;
  dot?: Recommendation;
  alert?: boolean;
  accent?: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="label-mono flex items-center gap-1.5">
          {dot && <span aria-hidden className={cn('size-1.5 rounded-full', dotClasses[dot])} />}
          {label}
        </CardDescription>
        <div className={cn('text-4xl font-light tracking-[-0.03em] tabular-nums', alert && 'text-destructive', accent)}>
          {value}
        </div>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {hint ??
          (change ? (
            <span className="flex items-center gap-1">
              <Change change={change} better={better} /> {vs}
            </span>
          ) : vs ? (
            'No data in previous period'
          ) : (
            'Whole history'
          ))}
      </CardContent>
    </Card>
  );
}

export function Stat({
  label,
  value,
  hint,
  alert = false,
}: {
  label: string;
  value: string | number;
  hint: string;
  alert?: boolean;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="label-mono">{label}</CardDescription>
        <div className={cn('text-4xl font-light tracking-[-0.03em] tabular-nums', alert && 'text-destructive')}>
          {value}
        </div>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}

export function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-3">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function ConfusionTable({ report }: { report: QualityReport }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-xs">Label ↓ · Engine →</TableHead>
          {recommendations.map((rec) => (
            <TableHead key={rec} className="text-center text-xs">
              {recommendationMeta[rec].short}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {recommendations.map((expected) => (
          <TableRow key={expected}>
            <TableCell className="text-xs font-medium">{recommendationMeta[expected].short}</TableCell>
            {recommendations.map((predicted) => {
              const count = report.confusion[expected][predicted];
              const hit = expected === predicted;
              return (
                <TableCell key={predicted} className="text-center">
                  <span
                    className={cn(
                      'inline-grid min-w-9 place-items-center rounded-md px-2 py-1 tabular-nums text-sm tabular-nums',
                      count === 0
                        ? 'text-muted-foreground/60'
                        : hit
                          ? 'bg-muted font-semibold'
                          : 'bg-destructive/10 font-semibold text-destructive',
                    )}
                  >
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
