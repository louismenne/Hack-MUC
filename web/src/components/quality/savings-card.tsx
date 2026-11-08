import { useState } from 'react';
import { PiggyBankIcon, SlidersHorizontalIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePersistentState } from '@/lib/storage';
import { defaultAssumptions, estimateSavings, type SavingsAssumptions } from '../../../../src/savings';
import { type Insights } from '../../../../src/insights';

import { rangeLabels, type TimeRange } from '../../../../src/timeline';

const assumptionFields: { key: keyof SavingsAssumptions; label: string; unit: string; step: number }[] = [
  { key: 'manualMinutesPerClaim', label: 'Manual triage per claim (before)', unit: 'min', step: 1 },
  { key: 'routineCheckMinutes', label: 'Spot-check of a routine claim', unit: 'min', step: 1 },
  { key: 'infoRequestMinutes', label: 'Check and send an info request', unit: 'min', step: 1 },
  { key: 'reviewMinutes', label: 'Human review', unit: 'min', step: 1 },
  { key: 'hourlyCostEur', label: 'Staff cost per hour', unit: '€', step: 5 },
];

const isAssumptions = (value: unknown): value is SavingsAssumptions =>
  typeof value === 'object' &&
  value !== null &&
  assumptionFields.every((f) => typeof (value as Record<string, unknown>)[f.key] === 'number');

const eur0 = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const hours = (h: number) => (h < 10 ? h.toFixed(1) : Math.round(h).toString());

/** Staff time saved on the claims received in the selected period, vs. triaging every claim by hand. Estimate. */
export function SavingsCard({ insights, range }: { insights: Insights; range: TimeRange }) {
  const [assumptions, setAssumptions] = usePersistentState<SavingsAssumptions>(
    'savings-assumptions-v2',
    defaultAssumptions,
    isAssumptions,
  );
  const [editing, setEditing] = useState(false);
  const s = estimateSavings(
    {
      routine: insights.mix.routine_processing,
      requestInfo: insights.mix.request_information,
      humanReview: insights.mix.human_review,
    },
    assumptions,
  );
  const period =
    range === '1d'
      ? 'today'
      : range === 'all'
        ? 'all time'
        : range === '1y'
          ? 'last year'
          : `last ${rangeLabels[range].toLowerCase()}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PiggyBankIcon className="size-4" /> Saved vs. manual triage · {period}
          <Badge variant="outline" className="font-normal text-muted-foreground">
            Estimate
          </Badge>
        </CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <SlidersHorizontalIcon data-icon="inline-start" /> How it's calculated
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-3">
        {s.claims === 0 ? (
          <div className="text-sm text-muted-foreground sm:col-span-3">
            No claims received {period}, so nothing saved yet.
          </div>
        ) : (
          <>
            <div>
              <div className="text-4xl font-light tracking-[-0.03em] tabular-nums">≈ {hours(s.hoursSaved)} h</div>
              <div className="text-sm font-medium">staff time saved</div>
              <div className="text-xs text-muted-foreground">
                ≈ {Math.round(s.minutesSavedPerClaim)} min per claim · {s.claims} {s.claims === 1 ? 'claim' : 'claims'}
              </div>
            </div>
            <div>
              <div className="text-4xl font-light tracking-[-0.03em] tabular-nums">
                −{Math.round(s.timeReduction * 100)}%
              </div>
              <div className="text-sm font-medium">manual triage time</div>
              <div className="text-xs text-muted-foreground">
                {s.fullReviewsBefore} → {s.fullReviewsNow} full reviews
              </div>
            </div>
            <div>
              <div className="text-4xl font-light tracking-[-0.03em] tabular-nums">
                ≈ {eur0.format(s.staffCostSavedEur)}
              </div>
              <div className="text-sm font-medium">staff cost saved</div>
              <div className="text-xs text-muted-foreground">at {eur0.format(assumptions.hourlyCostEur)}/h</div>
            </div>
          </>
        )}
      </CardContent>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>How savings are calculated</DialogTitle>
            <DialogDescription>
              Claims per route are counted from this period. Minutes are cautious assumptions: reviews get no speed-up,
              automated claims still get a human check. Avoided wrong payments are not counted.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {assumptionFields.map((field) => (
              <div key={field.key} className="grid grid-cols-[1fr_auto] items-center gap-3">
                <Label htmlFor={`assume-${field.key}`} className="text-sm font-normal">
                  {field.label}
                </Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id={`assume-${field.key}`}
                    type="number"
                    min={0}
                    step={field.step}
                    className="w-20 text-right tabular-nums"
                    value={assumptions[field.key]}
                    onChange={(event) => {
                      const n = Number(event.target.value);
                      if (!Number.isFinite(n) || n < 0) return;
                      setAssumptions((previous) => ({ ...previous, [field.key]: n }));
                    }}
                  />
                  <span className="w-6 text-xs text-muted-foreground">{field.unit}</span>
                </div>
              </div>
            ))}
            <div className="rounded-md bg-muted/50 p-3 text-xs tabular-nums text-muted-foreground">
              Before: {s.claims} × {assumptions.manualMinutesPerClaim} min = {s.minutesBefore} min
              <br />
              Now: {insights.mix.routine_processing} × {assumptions.routineCheckMinutes} +{' '}
              {insights.mix.request_information} × {assumptions.infoRequestMinutes} + {insights.mix.human_review} ×{' '}
              {assumptions.reviewMinutes} = {s.minutesNow} min
            </div>
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setAssumptions(defaultAssumptions)}>
                Reset
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
