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
        <Badge variant="outline" className={t.needsRecheck ? 'border-recheck/40 text-recheck' : undefined}>{t.needsRecheck} offen neu prüfen</Badge>
        <Badge variant="secondary">{t.openUnchanged} offen unverändert</Badge>
        <Badge variant="outline" title={t.frozenWouldChange ? `Bei ${t.frozenWouldChange} würde sich das Ergebnis ändern, es bleibt aber.` : undefined}>{t.closed} geschlossen, bleiben</Badge>
      </div>
      {rows.length === 0
        ? <p className="text-sm text-muted-foreground">Keine Ergebnisse ändern sich.</p>
        : (
          <ul className="max-h-56 divide-y overflow-y-auto rounded-md border">
            {rows.map(r => (
              <li key={r.caseId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm" title={r.summary}>
                <span className="w-24 truncate font-mono text-xs">{r.caseId}</span>
                <OutcomeBadge outcome={r.before.recommendation} />
                <ArrowRightIcon className="size-3 text-muted-foreground" />
                <OutcomeBadge outcome={r.after.recommendation} />
                <span className="ml-auto text-xs text-muted-foreground">{r.needsRecheck ? 'neu prüfen' : r.frozen ? 'bleibt (geschlossen)' : 'unverändert'}</span>
              </li>
            ))}
          </ul>
        )}
      <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>{all ? 'Nur betroffene' : `Alle ${t.cases} Fälle`}</Button>
    </div>
  );
}
