import { useState } from 'react';
import type { ImpactReport } from './api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRightIcon } from 'lucide-react';
import { OutcomeBadge } from './rule-view';

/** Which cases change when the draft replaces the active version. Closed cases stay frozen. */
export function ImpactTable({ impact }: { impact: ImpactReport }) {
  const [all, setAll] = useState(false);
  const t = impact.totals;
  const rows = impact.rows.filter(r => all || r.needsRecheck || r.frozenWouldChange);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className={t.needsRecheck ? 'border-recheck/40 text-recheck' : undefined}>{t.needsRecheck} open to recheck</Badge>
        <Badge variant="secondary">{t.openUnchanged} open unchanged</Badge>
        <Badge variant="outline" title={t.frozenWouldChange ? `${t.frozenWouldChange} would change, but closed claims keep their decision` : undefined}>{t.closed} closed, kept</Badge>
      </div>
      {rows.length === 0
        ? <p className="text-sm text-muted-foreground">No outcomes change</p>
        : (
          <ul className="max-h-56 divide-y overflow-y-auto rounded-md border">
            {rows.map(r => (
              <li key={r.caseId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm" title={r.summary}>
                <span className="w-24 truncate font-mono text-xs">{r.caseId}</span>
                <OutcomeBadge outcome={r.before.recommendation} />
                <ArrowRightIcon className="size-3 text-muted-foreground" />
                <OutcomeBadge outcome={r.after.recommendation} />
                <span className="ml-auto text-xs text-muted-foreground">{r.needsRecheck ? 'recheck' : r.frozen ? 'closed, kept' : 'unchanged'}</span>
              </li>
            ))}
          </ul>
        )}
      <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>{all ? 'Affected only' : `All ${t.cases} claims`}</Button>
    </div>
  );
}
