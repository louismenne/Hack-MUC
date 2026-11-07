import { navigate, pageHref, useRoute } from '@/lib/navigation';
import { cacheScope, cacheEpoch, readCache, writeCache, clearReloadCache } from '@/lib/reload-cache';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, CircleAlertIcon, DownloadIcon, FileTextIcon, ImageIcon, InboxIcon, PlusIcon, RefreshCwIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authenticatedFetch, supabase } from '@/lib/supabase';
import { useAuthUser } from '@/lib/auth';
import { useReviewAudit } from '@/lib/audit';
import { POLICY_CHANGED_EVENT } from '@/lib/policy-source';
import { permissions } from '../../../src/roles';
import { parseClaim, type Decision } from '../../../src/triage';
import { receivedAt } from '../../../src/received-at';
import { reviewState, type ReviewAction, type ReviewInput } from '../../../src/review';
import type { StoredQueueItem } from '../../../src/policy-api/stored-claims';
import { downloadFile, toCsv, type CaseItem } from '@/lib/datasets';
import { QualityView } from './quality-view';
import { AuditLog } from './audit-log';
import { ActivityLog } from './activity-log';
import { ClaimsList, filterCases, type ListFilters } from './claims-list';
import { ClaimDetail } from './claim-detail';
import { ReviewDialog } from './review-dialog';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './ui/empty';
import { Spinner } from './ui/spinner';
import { toast } from 'sonner';

const pageSize = 50;

function caseItem(item: StoredQueueItem): CaseItem {
  const row = Object.fromEntries(Object.entries(item.claim).map(([k, v]) => [k, v == null ? '' : String(v)]));
  const decision = item.saved.decision as Decision & { caseId: string };
  return {
    row,
    claim: parseClaim(row),
    decision,
    baseline: (item.initial?.decision ?? decision) as typeof decision,
    initialQuoteLimit: item.initialQuoteLimit,
    frozen: item.claim.case_status === 'closed',
    needsRecheck: item.needsRecheck,
    label: null,
    labelV1: null,
    labelV2: null,
    received: receivedAt(item.claim.case_id, item.claim.received_at),
  };
}

const isImage = (name: string) => /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/i.test(name);

export function StoredClaims({ dashboard = false }: { dashboard?: boolean }) {
  const user = useAuthUser();
  const access = permissions(user);
  const scope = cacheScope(user);
  type Snapshot = { items: StoredQueueItem[]; total: number; policy: string };
  const cacheKey = (offset: number) => dashboard ? 'claims:dashboard' : `claims:page:${offset}`;
  const cached = (offset: number) => readCache<Snapshot>(scope, cacheKey(offset), value => {
    const snapshot = value as Snapshot | null;
    return !!snapshot && typeof snapshot.total === 'number' && typeof snapshot.policy === 'string' && Array.isArray(snapshot.items) && snapshot.items.every(item => item?.claim && typeof item.claim.case_id === 'string' && item.saved?.decision && Array.isArray(item.saved.decision.supportingFacts) && Array.isArray(item.saved.decision.missingFields));
  });
  const [initial] = useState(() => cached(0));
  const [items, setItems] = useState<StoredQueueItem[]>(initial?.items ?? []);
  const route = useRoute();
  const requestedOffset = Number(route.params.get('offset') ?? 0);
  const offset = !dashboard && Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;
  const setOffset = (next: number) => navigate(pageHref('queue', next ? new URLSearchParams({ offset: String(next) }) : undefined));
  const [total, setTotal] = useState(initial?.total ?? 0);
  const [policy, setPolicy] = useState(initial?.policy ?? '');
  const [loading, setLoading] = useState(true);
  // True once the shown claims came from the server (not only from the reload cache) under the current policy.
  // Background refreshes on window focus keep it true, so a reviewer's open dialog is not interrupted.
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const selectedId = dashboard ? '' : route.caseId ?? '';
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [filters, setFilters] = useState<ListFilters>({ query: '', recommendation: 'all', status: 'any' });
  const revision = useRef(0);
  const busy = useRef(false);
  /** The saved decision a review dialog was opened for; the dialog closes if that decision is replaced. */
  const dialogDecision = useRef<string | undefined>(undefined);
  const audit = useReviewAudit('stored');
  const refresh = useCallback(async () => {
    const request = ++revision.current;
    const epoch = cacheEpoch();
    setLoading(true);
    try {
      const collected: StoredQueueItem[] = [];
      let next = dashboard ? 0 : offset;
      let total = 0;
      let activePolicy = '';
      do {
        const response = await authenticatedFetch('/api/policy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'evaluate_claims', offset: next }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Could not load claims.');
        if (request !== revision.current) return;
        if (activePolicy && activePolicy !== data.activePolicy)
          throw new Error('Policy changed while loading. Refresh to load a consistent dashboard.');
        collected.push(...data.items);
        total = data.total;
        activePolicy = data.activePolicy;
        next += pageSize;
      } while (dashboard && next < total);
      if (request === revision.current) {
        writeCache(scope, cacheKey(offset), { items: collected, total, policy: activePolicy }, epoch);
        setItems(collected);
        setTotal(total);
        setPolicy(activePolicy);
        setError('');
        setVerified(true);
      }
    } catch (e) {
      if (request === revision.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (request === revision.current) setLoading(false);
    }
  }, [offset, dashboard, scope]);
  useEffect(() => {
    const snapshot = cached(offset);
    setItems(snapshot?.items ?? []); setTotal(snapshot?.total ?? 0); setPolicy(snapshot?.policy ?? '');
    setVerified(false);
    void refresh();
    // Returning to the window re-checks claims quietly; it must not close an open review dialog.
    const focused = () => void refresh();
    // A policy change makes every shown decision stale: close the dialog and lock reviews until reloaded.
    const policyChanged = () => {
      setAction(null);
      setVerified(false);
      void refresh();
    };
    window.addEventListener('focus', focused);
    window.addEventListener(POLICY_CHANGED_EVENT, policyChanged);
    return () => {
      revision.current++;
      window.removeEventListener('focus', focused);
      window.removeEventListener(POLICY_CHANGED_EVENT, policyChanged);
    };
  }, [refresh]);
  const cases = useMemo(() => items.map(caseItem), [items]);
  const states = useMemo(
    () =>
      new Map(
        items.map((item, i) => [
          item.claim.case_id,
          reviewState(
            cases[i].decision,
            audit.events.filter((e) => (e as typeof e & { decisionId?: string }).decisionId === item.saved.id),
          ),
        ]),
      ),
    [items, cases, audit.events],
  );
  const visible = filterCases(cases, states, filters);
  const selected = cases.find((c) => c.decision.caseId === selectedId);
  const stored = items.find((c) => c.claim.case_id === selectedId);
  const state = states.get(selectedId);
  const canReview = access.review && verified && !error && audit.ready && !audit.error;
  const savedDecisionId = stored?.saved.id;
  useEffect(() => {
    if (action && dialogDecision.current && savedDecisionId !== dialogDecision.current) {
      setAction(null);
      toast.info('The saved decision for this claim changed. Check the claim again before reviewing.');
    }
  }, [action, savedDecisionId]);
  const openAction = (next: ReviewAction) => {
    dialogDecision.current = savedDecisionId;
    setAction(next);
  };
  const openClaim = (caseId: string) => {
    const params = new URLSearchParams();
    if (offset) params.set('offset', String(offset));
    if (caseId) params.set('case', caseId);
    navigate(pageHref('queue', params));
    setAction(null);
    window.scrollTo({ top: 0 });
  };
  const refreshAll = () => {
    void refresh();
    void audit.refresh();
  };
  async function record(input: ReviewInput) {
    if (busy.current || !stored || !state) return;
    if (!canReview) {
      toast.error('Reviews are paused until the queue has refreshed successfully.');
      return;
    }
    busy.current = true;
    try {
      const { error } = await supabase.rpc('record_review', {
        p_event: {
          decisionId: stored.saved.id,
          expectedReviewId: state.events.at(-1)?.id ?? null,
          action: input.action,
          next: input.next,
          reason: input.reason,
        },
      });
      if (error) throw new Error(error.message);
      clearReloadCache();
      setAction(null);
      toast.success(input.action === 'overridden' ? 'Override saved to the audit history.' : input.action === 'reverted' ? 'Revert saved to the audit history.' : 'Confirmation saved to the audit history.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      await Promise.all([refresh(), audit.refresh()]);
      busy.current = false;
    }
  }
  async function download(path: string, name: string) {
    const { data, error } = await supabase.storage.from('claim-documents').download(path);
    if (error) {
      toast.error(error.message);
      return;
    }
    const url = URL.createObjectURL(data);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const problem = error || audit.error;
  const refreshButton = (
    <Button variant="outline" disabled={loading} onClick={refreshAll}>
      <RefreshCwIcon data-icon="inline-start" className={cn(loading && 'animate-spin')} /> {loading ? 'Refreshing…' : 'Refresh'}
    </Button>
  );

  if (dashboard)
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-3xl text-sm text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{total} submitted claims</span>
            {policy && <> · evaluated with <span className="font-mono text-foreground">{policy}</span></>}. Arrival charts keep each claim’s first saved evaluation;
            the current backlog and rechecks use the latest saved decision. Savings are estimates from your local assumptions.
          </p>
          {refreshButton}
        </div>
        {problem && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>Could not refresh the dashboard</AlertTitle>
            <AlertDescription>{problem}</AlertDescription>
          </Alert>
        )}
        {loading && !items.length ? (
          <LoadingState label="Loading all submitted claims…" />
        ) : error ? null : (
          <QualityView
            dataset={{
              id: 'stored',
              name: 'Submitted claims',
              description: 'Submitted claims evaluated on the server',
              source: 'stored',
              cases,
              labelled: false,
            }}
            states={states}
            events={audit.events}
            renderLog={(events) => (
              <>
                <AuditLog
                  events={events}
                  datasetName="Submitted claims"
                  onExport={() =>
                    downloadFile(
                      'submitted-claim-reviews.csv',
                      toCsv(
                        events.map((event) => ({
                          at: event.at,
                          case_id: event.caseId,
                          action: event.action,
                          reviewer: event.reviewer,
                          policy_version: event.policyVersion,
                          rule: event.ruleId,
                          automated: event.automated,
                          previous: event.previous,
                          next: event.next,
                          reason: event.reason,
                        })),
                        [
                          'at',
                          'case_id',
                          'action',
                          'reviewer',
                          'policy_version',
                          'rule',
                          'automated',
                          'previous',
                          'next',
                          'reason',
                        ],
                      ),
                    )
                  }
                />
                <ActivityLog />
              </>
            )}
          />
        )}
      </div>
    );

  const index = selected ? visible.findIndex((c) => c.decision.caseId === selectedId) : -1;
  const previousCase = index > 0 ? visible[index - 1] : null;
  const nextCase = index >= 0 && index < visible.length - 1 ? visible[index + 1] : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            Submitted claims
            <Badge variant="secondary" className="tabular-nums">{total}</Badge>
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Open claims are re-evaluated on the server
            {policy && <> with policy <span className="font-mono text-foreground">{policy}</span></>} on every refresh. Decisions and
            review history are saved; closed claims keep their saved decision.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {refreshButton}
          {access.upload && (
            <Button asChild>
              <a href="/claim">
                <PlusIcon data-icon="inline-start" /> File a claim
              </a>
            </Button>
          )}
        </div>
      </div>

      {problem && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Could not refresh the review queue</AlertTitle>
          <AlertDescription>{problem} Reviews are disabled until a refresh succeeds.</AlertDescription>
        </Alert>
      )}
      {loading && !verified && items.length > 0 && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Checking current claims and policy. Showing saved results; reviews unlock when this finishes.
        </p>
      )}

      {selected && stored && state ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => openClaim('')}>
              <ArrowLeftIcon data-icon="inline-start" /> Back to queue
            </Button>
            <div className="flex items-center gap-1">
              {index >= 0 && (
                <span className="mr-2 text-xs text-muted-foreground tabular-nums">
                  Claim {index + 1} of {visible.length}
                </span>
              )}
              <Button variant="outline" size="icon" disabled={!previousCase} onClick={() => previousCase && openClaim(previousCase.decision.caseId)} aria-label="Previous claim">
                <ChevronLeftIcon />
              </Button>
              <Button variant="outline" size="icon" disabled={!nextCase} onClick={() => nextCase && openClaim(nextCase.decision.caseId)} aria-label="Next claim">
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
          <ClaimDetail
            item={selected}
            state={state}
            canReview={!!canReview}
            onAction={openAction}
            documents={
              stored.claim.attachments?.length > 0 && (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Documents</CardTitle>
                    <CardDescription>Files attached when the claim was submitted. Stored privately.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="flex flex-col divide-y">
                      {stored.claim.attachments.map((file) => {
                        const Icon = isImage(file.name) ? ImageIcon : FileTextIcon;
                        return (
                          <li key={file.path} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                              <Icon className="size-4" aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                            <Button variant="ghost" size="sm" onClick={() => void download(file.path, file.name)}>
                              <DownloadIcon data-icon="inline-start" /> Download
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              )
            }
          />
          <ReviewDialog
            action={action}
            onOpenChange={(open) => !open && setAction(null)}
            datasetId="stored"
            decision={selected.decision}
            current={state.effective}
            defaultReviewer={user.email ?? user.id}
            onSubmit={(input) => void record(input)}
          />
        </>
      ) : loading && !items.length ? (
        <LoadingState label="Loading submitted claims…" />
      ) : !error && items.length === 0 ? (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><InboxIcon /></EmptyMedia>
              <EmptyTitle>No submitted claims yet</EmptyTitle>
              <EmptyDescription>Claims filed through the claim form appear here with the engine’s recommendation.</EmptyDescription>
            </EmptyHeader>
            {access.upload && (
              <EmptyContent>
                <Button asChild>
                  <a href="/claim"><PlusIcon data-icon="inline-start" /> File a claim</a>
                </Button>
              </EmptyContent>
            )}
          </Empty>
        </Card>
      ) : (
        <>
          <ClaimsList
            cases={cases}
            visible={visible}
            states={states}
            filters={filters}
            onFiltersChange={setFilters}
            selectedId=""
            onSelect={openClaim}
          />
          {total > pageSize && (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>Filters and counts apply to this page of {pageSize} claims.</span>
              <div className="flex items-center gap-1">
                <span className="mr-2 tabular-nums">
                  {offset + 1}–{Math.min(offset + pageSize, total)} of {total}
                </span>
                <Button variant="outline" size="icon" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - pageSize))} aria-label="Previous page">
                  <ChevronLeftIcon />
                </Button>
                <Button variant="outline" size="icon" disabled={offset + pageSize >= total || loading} onClick={() => setOffset(offset + pageSize)} aria-label="Next page">
                  <ChevronRightIcon />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <Card>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Spinner /></EmptyMedia>
          <EmptyTitle>{label}</EmptyTitle>
          <EmptyDescription>Each open claim is evaluated against the active policy on the server.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </Card>
  );
}
