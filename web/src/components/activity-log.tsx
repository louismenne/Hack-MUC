import { useEffect, useState } from 'react';
import { BotIcon, ChevronLeftIcon, ChevronRightIcon, CircleAlertIcon, FileInputIcon, HistoryIcon, RefreshCwIcon, ScaleIcon, UserCheckIcon, UsersIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import type { AuditRow } from '@/lib/audit';
import { timeFormat } from '@/components/claim-detail';
import { RecommendationBadge } from '@/components/recommendation-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { isRecommendation } from '../../../src/review';

const pageSize = 50;

const entityMeta: Record<string, { label: string; icon: typeof BotIcon }> = {
  claim: { label: 'Claim', icon: FileInputIcon },
  decision: { label: 'Engine', icon: BotIcon },
  review: { label: 'Review', icon: UserCheckIcon },
  policy: { label: 'Policy', icon: ScaleIcon },
  team: { label: 'Team', icon: UsersIcon },
};

const actionLabels: Record<string, string> = {
  insert: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  evaluated: 'Evaluated',
  confirmed: 'Confirmed',
  overridden: 'Overridden',
  reverted: 'Reverted',
  role_changed: 'Role changed',
};

const humanize = (value: string) => value.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());

/** What an entry is about: the claim, the policy version, or the affected account. */
function subject(row: AuditRow): string {
  const { caseId, version, version_label: label } = row.details as Record<string, unknown>;
  return String(caseId ?? version ?? label ?? row.entity_id);
}

/** A short, readable summary of the details that matter for the entry type. */
function Details({ row }: { row: AuditRow }) {
  const d = row.details as Record<string, unknown>;
  const reason = typeof d.reason === 'string' && d.reason.trim() ? d.reason : null;
  if (row.entity_type === 'decision' && isRecommendation(d.recommendation)) {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <RecommendationBadge value={d.recommendation} short />
        {typeof d.policyVersion === 'string' && <span className="font-mono text-xs text-muted-foreground">{d.policyVersion}</span>}
      </span>
    );
  }
  if (row.entity_type === 'review' && isRecommendation(d.previous) && isRecommendation(d.next)) {
    return (
      <span className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5">
          {d.previous === d.next ? <RecommendationBadge value={d.next} short /> : <><RecommendationBadge value={d.previous} short /> → <RecommendationBadge value={d.next} short /></>}
          {typeof d.policyVersion === 'string' && <span className="font-mono text-xs text-muted-foreground">{d.policyVersion}</span>}
        </span>
        {reason && <span className="text-sm text-pretty">{reason}</span>}
      </span>
    );
  }
  if (row.entity_type === 'team' && (d.previous !== undefined || d.next !== undefined)) {
    return <span className="text-xs text-muted-foreground">{humanize(String(d.previous ?? 'unassigned'))} → <span className="text-foreground">{humanize(String(d.next ?? 'unassigned'))}</span></span>;
  }
  if (reason) return <span className="text-sm text-pretty">{reason}</span>;
  if (typeof d.status === 'string') {
    const before = typeof d.previousStatus === 'string' && d.previousStatus !== d.status ? d.previousStatus : null;
    return (
      <span className="text-xs text-muted-foreground">
        Status {before && <>{before} → </>}<span className="text-foreground">{d.status}</span>
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

export function ActivityLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [page, setPage] = useState(0);
  const [revision, refresh] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true; setLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase.from('audit_log').select('*').order('sequence', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
        if (error) throw new Error(error.message);
        if (alive) { setRows(data as AuditRow[]); setError(''); }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : String(e)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [page, revision]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Persistent activity log</CardTitle>
        <CardDescription>
          Claim submissions, engine evaluations, policy changes, role changes and reviews, recorded in Supabase. Entries cannot be edited or cleared.
        </CardDescription>
        <CardAction>
          <Button variant="outline" disabled={loading} onClick={() => refresh(n => n + 1)}>
            <RefreshCwIcon data-icon="inline-start" className={cn(loading && 'animate-spin')} /> Refresh
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>Could not load the activity log</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {loading && rows.length === 0 ? (
          <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Spinner /> Loading activity…</p>
        ) : rows.length === 0 ? (
          !error && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><HistoryIcon /></EmptyMedia>
                <EmptyTitle>No recorded activity</EmptyTitle>
                <EmptyDescription>Submitting a claim, changing a policy or recording a review adds an entry here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )
        ) : (
          <Table className={cn(loading && 'opacity-60 transition-opacity')}>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead className="min-w-56">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => {
                const entity = entityMeta[row.entity_type] ?? { label: humanize(row.entity_type), icon: HistoryIcon };
                const Icon = entity.icon;
                const id = subject(row);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="align-top text-xs whitespace-nowrap text-muted-foreground">{timeFormat.format(new Date(row.occurred_at))}</TableCell>
                    <TableCell className="align-top">
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        <Badge variant="outline" className="gap-1 font-normal text-muted-foreground"><Icon className="size-3" aria-hidden />{entity.label}</Badge>
                        <span className="text-sm">{actionLabels[row.action] ?? humanize(row.action)}</span>
                      </span>
                    </TableCell>
                    <TableCell className="max-w-48 align-top">
                      <span className="block truncate font-mono text-xs" title={id}>{id}</span>
                    </TableCell>
                    <TableCell className="max-w-56 align-top">
                      <span className="block truncate text-sm" title={row.actor_label}>{row.actor_label}</span>
                    </TableCell>
                    <TableCell className="max-w-md align-top whitespace-normal"><Details row={row} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {(page > 0 || rows.length === pageSize) && (
          <div className="flex items-center justify-end gap-1 text-sm text-muted-foreground">
            <span className="mr-2 tabular-nums">Page {page + 1}</span>
            <Button variant="outline" size="icon" disabled={loading || page === 0} onClick={() => setPage(n => n - 1)} aria-label="Newer entries">
              <ChevronLeftIcon />
            </Button>
            <Button variant="outline" size="icon" disabled={loading || rows.length < pageSize} onClick={() => setPage(n => n + 1)} aria-label="Older entries">
              <ChevronRightIcon />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
