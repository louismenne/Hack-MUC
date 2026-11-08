import type { MonitoringEvent } from '../../../../src/quality-monitoring';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function ReviewEvidence({ events }: { events: MonitoringEvent[] }) {
  return <div className="max-h-80 overflow-auto rounded-lg border"><Table>
    <TableHeader><TableRow><TableHead>Claim / policy</TableHead><TableHead>Review result</TableHead><TableHead>Reason</TableHead><TableHead>Reviewer</TableHead></TableRow></TableHeader>
    <TableBody>{events.map(e => <TableRow key={e.id}>
      <TableCell><div className="max-w-48 break-all font-medium">{e.caseId}</div><div className="text-xs text-muted-foreground">{e.policyVersion} · {e.ruleId}</div></TableCell>
      <TableCell><Badge variant="outline">{e.action === 'rejected' ? 'Rejected' : e.next !== e.automated ? 'Overridden' : 'Matches system'}</Badge><div className="mt-1 text-xs text-muted-foreground">{e.automated.replaceAll('_', ' ')} → {e.next.replaceAll('_', ' ')}</div></TableCell>
      <TableCell className="min-w-48 max-w-md whitespace-normal">{e.reason || 'No reason recorded'}</TableCell>
      <TableCell><div>{e.reviewer}</div><div className="text-xs text-muted-foreground">{new Date(e.at).toLocaleString('en-GB')}</div></TableCell>
    </TableRow>)}</TableBody>
  </Table></div>;
}
