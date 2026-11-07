import { DownloadIcon, ScrollTextIcon, Trash2Icon } from 'lucide-react';
import { RecommendationBadge } from '@/components/recommendation-badge';
import { timeFormat } from '@/components/claim-detail';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ReviewEvent } from '../../../src/review';

const actionLabel = { confirmed: 'Confirmed', overridden: 'Overridden', reverted: 'Reverted' } as const;

interface AuditLogProps {
  events: ReviewEvent[];
  datasetName: string;
  onOpenCase: (caseId: string) => void;
  onExport: () => void;
  onClear: () => void;
}

export function AuditLog({ events, datasetName, onOpenCase, onExport, onClear }: AuditLogProps) {
  const ordered = [...events].reverse();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
        <CardDescription>Every reviewer action on {datasetName.toLowerCase()}, newest first, with the automated decision it responded to.</CardDescription>
        <CardAction className="flex gap-2">
          <Button variant="outline" onClick={onExport} disabled={!events.length}>
            <DownloadIcon data-icon="inline-start" /> Export CSV
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={!events.length}>
                <Trash2Icon data-icon="inline-start" /> Reset
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {events.length} audit {events.length === 1 ? 'entry' : 'entries'}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This clears reviewer actions for {datasetName.toLowerCase()} from this browser so the demo can start fresh. Export first if you need a record. It cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onClear}>Delete entries</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        {ordered.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><ScrollTextIcon /></EmptyMedia>
              <EmptyTitle>No reviewer actions yet</EmptyTitle>
              <EmptyDescription>Open a claim in the review queue and confirm or override it. Each action appears here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Case</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Automated</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Reviewer</TableHead>
                <TableHead className="min-w-56">Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordered.map(event => (
                <TableRow key={event.id}>
                  <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{timeFormat.format(new Date(event.at))}</TableCell>
                  <TableCell>
                    <Button variant="link" className="h-auto p-0 font-mono text-xs" onClick={() => onOpenCase(event.caseId)}>{event.caseId}</Button>
                  </TableCell>
                  <TableCell><Badge variant={event.action === 'overridden' ? 'default' : 'secondary'}>{actionLabel[event.action]}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <RecommendationBadge value={event.automated} short />
                      <span className="font-mono text-xs text-muted-foreground">{event.ruleId}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {event.previous === event.next ? (
                      <span className="text-xs text-muted-foreground">No change</span>
                    ) : (
                      <div className="flex items-center gap-1 text-xs">
                        <RecommendationBadge value={event.previous} short /> → <RecommendationBadge value={event.next} short />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{event.reviewer}</TableCell>
                  <TableCell className="max-w-md text-sm whitespace-normal">{event.reason || <span className="text-muted-foreground">—</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
