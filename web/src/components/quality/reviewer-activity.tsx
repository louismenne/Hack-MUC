import { type ReactNode } from 'react';
import { ActivityIcon } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { type Insights } from '../../../../src/insights';

import { type ReviewEvent } from '../../../../src/review';
import { inWindow, type Window } from '../../../../src/timeline';

import { ThroughputCard } from './charts';
import { pct } from './format';
import { MiniStat } from './metrics';
import { BarList } from './bar-list';
export function ReviewerActivity({
  events,
  window,
  reviewer,
  onReviewerChange,
  insights,
  renderLog,
  newReviewCases,
  waitingNow,
}: {
  events: ReviewEvent[];
  window: Window | null;
  reviewer: string;
  onReviewerChange: (value: string) => void;
  insights: Insights;
  renderLog: (events: ReviewEvent[]) => ReactNode;
  newReviewCases: Date[];
  waitingNow: number;
}) {
  const inRange = window ? events.filter((event) => inWindow(new Date(event.at), window)) : events;
  const reviewers = [...new Set(events.map((event) => event.reviewer))].sort();
  const shown = reviewer === 'all' ? inRange : inRange.filter((event) => event.reviewer === reviewer);
  const perReviewer = new Map<string, number>();
  for (const event of inRange) perReviewer.set(event.reviewer, (perReviewer.get(event.reviewer) ?? 0) + 1);
  return (
    <>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-3xl font-normal tracking-[-0.03em]">Reviewer activity</h2>
        <Select value={reviewer} onValueChange={onReviewerChange}>
          <SelectTrigger className="w-52" aria-label="Filter by reviewer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="all">All reviewers</SelectItem>
            {reviewers.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {window && (
        <ThroughputCard
          window={window}
          incoming={newReviewCases}
          completed={(reviewer === 'all' ? events : events.filter((event) => event.reviewer === reviewer))
            .filter((event) => event.action !== 'reverted')
            .map((event) => new Date(event.at))}
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
        <CardTitle className="flex items-center gap-2">
          <ActivityIcon className="size-4" /> Review queue
        </CardTitle>
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
                <li key={key} className="flex justify-between">
                  <code className="tabular-nums text-xs">{key}</code>
                  <span className="tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
