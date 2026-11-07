import { useState } from 'react';
import type { ImpactReport } from './api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OutcomeBadge } from './rule-view';

/** Which cases change when the draft replaces the active version. Closed cases stay frozen. */
export function ImpactTable({ impact }: { impact: ImpactReport }) {
  const [all, setAll] = useState(false);
  const t = impact.totals;
  const rows = impact.rows.filter(r => all || r.needsRecheck || r.frozenWouldChange);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant={t.needsRecheck ? 'default' : 'secondary'}>{t.needsRecheck} offene Fälle ändern ihr Ergebnis (needs_recheck)</Badge>
        <Badge variant="secondary">{t.openUnchanged} offene Fälle unverändert</Badge>
        <Badge variant="outline">{t.closed} geschlossene Fälle eingefroren{t.frozenWouldChange ? ` (bei ${t.frozenWouldChange} würde sich das Ergebnis ändern)` : ''}</Badge>
        <Badge variant="outline">{t.cases} Fälle geprüft</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Vergleich: aktive Version {impact.base.label} gegen Entwurf {impact.draft.label}, über die Teilnehmer-Fälle aus den CSVs. Geschlossene Fälle behalten ihr bisheriges Ergebnis. Das ist eine Auswirkungsmessung, keine Genauigkeitsbewertung.
      </p>
      {rows.length === 0
        ? <p className="text-sm text-muted-foreground">Keine Fallergebnisse ändern sich.</p>
        : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Fall</TableHead><TableHead>Status</TableHead><TableHead>Bisher</TableHead><TableHead>Neu</TableHead><TableHead>Hinweis</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.caseId}>
                    <TableCell className="font-mono text-xs" title={r.summary}>{r.caseId}</TableCell>
                    <TableCell>{r.caseStatus === 'closed' ? 'geschlossen' : r.caseStatus === 'open' ? 'offen' : 'unbekannt'}</TableCell>
                    <TableCell><OutcomeBadge outcome={r.before.recommendation} /><div className="mt-1 font-mono text-xs text-muted-foreground">{r.before.ruleId}</div></TableCell>
                    <TableCell><OutcomeBadge outcome={r.after.recommendation} /><div className="mt-1 font-mono text-xs text-muted-foreground">{r.after.ruleId}</div></TableCell>
                    <TableCell className="text-sm">
                      {r.needsRecheck ? <strong>Neu bewerten</strong> : r.frozen ? 'Eingefroren' : 'Unverändert'}
                      {r.frozenWouldChange && <div className="text-xs text-muted-foreground">Würde sich ändern, bleibt aber eingefroren.</div>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>{all ? 'Nur betroffene Fälle zeigen' : `Alle ${t.cases} Fälle zeigen`}</Button>
    </div>
  );
}
