import { useClaimSelection } from './stored/use-claim-selection';
import { StoredDashboard } from './stored/dashboard';
import { ClaimDocuments } from './stored/claim-documents';
import { useStoredClaims, pageSize } from './stored/use-stored-claims';
import { useClaimListResize } from './stored/use-claim-list-resize';
import { useStoredReview } from './stored/use-stored-review';
import { followupHref } from '../../../src/claim-intake/followup';
import { navigate, pageHref, useRoute } from '@/lib/navigation';

import { useMemo, useState } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  InboxIcon,
  PlusIcon,
  XIcon,
  MousePointerClickIcon,
} from 'lucide-react';

import { useAuthUser } from '@/lib/auth';
import { useReviewAudit } from '@/lib/audit';

import { permissions, roleOf } from '../../../src/roles';
import { parseClaim, type Decision } from '../../../src/triage';
import { receivedAt } from '../../../src/received-at';
import { reviewState, type ReviewAction } from '../../../src/review';
import type { StoredQueueItem } from '../../../src/policy-api/stored-claims';
import { type CaseItem } from '@/lib/datasets';

import { ClaimsList, filterCases, type ListFilters } from './claims-list';
import { ClaimDetail } from './claim-detail';
import { ReviewDialog } from './review-dialog';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './ui/empty';
import { Spinner } from './ui/spinner';

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

export function StoredClaims({ dashboard = false }: { dashboard?: boolean }) {
  const user = useAuthUser();
  const access = permissions(user);
  // "File a claim" belongs to claimants only; reviewers, policy owners and admins work the queue.
  const isClaimant = roleOf(user) === 'claims_handler';
  const claimsPage = isClaimant ? 'my-claims' : 'queue';
  const route = useRoute();
  const requestedOffset = Number(route.params.get('offset') ?? 0);
  const offset = !dashboard && Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;
  const setOffset = (next: number) =>
    navigate(pageHref(claimsPage, next ? new URLSearchParams({ offset: String(next) }) : undefined));
  const selectedId = dashboard ? '' : (route.caseId ?? '');
  const { splitRef, listWidth, clampWidth, saveListWidth, startResize } = useClaimListResize();
  const [action, setAction] = useState<ReviewAction | null>(null);
  const { items, total, policy, loading, verified, error, refresh } = useStoredClaims(dashboard, offset, setAction);
  const [filters, setFilters] = useState<ListFilters>({ query: '', recommendation: 'all', status: 'any' });
  const audit = useReviewAudit('stored');
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
  const { openClaim, setDismissed } = useClaimSelection({
    claimsPage,
    dashboard,
    offset,
    selectedId,
    firstVisibleId: visible[0]?.decision.caseId,
    action,
    setAction,
  });
  const selected = cases.find((c) => c.decision.caseId === selectedId);
  const stored = items.find((c) => c.claim.case_id === selectedId);
  const state = states.get(selectedId);
  const canReview = access.review && verified && !error && audit.ready && !audit.error;
  const { preset, openAction, record } = useStoredReview({
    stored,
    state,
    canReview: !!canReview,
    refresh,
    refreshAudit: audit.refresh,
    action,
    setAction,
  });
  // Claims and audit events reload automatically on load, on window focus and after policy changes.
  const problem = error || audit.error;

  const index = selected ? visible.findIndex((c) => c.decision.caseId === selectedId) : -1;
  const previousCase = index > 0 ? visible[index - 1] : null;
  const nextCase = index >= 0 && index < visible.length - 1 ? visible[index + 1] : null;

  if (dashboard)
    return (
      <div className="flex flex-col gap-4">
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
          <StoredDashboard cases={cases} states={states} events={audit.events} />
        )}
      </div>
    );

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="flex items-center gap-2 text-3xl font-normal tracking-[-0.03em]">
            {isClaimant ? 'My claims' : 'Submitted claims'}
            <Badge variant="secondary" className="tabular-nums">
              {total}
            </Badge>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {/* While the list is empty, the empty state carries the only "File a claim" call to action. */}
          {isClaimant && items.length > 0 && (
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
          <AlertDescription>{problem} Reviews are disabled until the claims load again. Return to this tab or reload the page to retry.</AlertDescription>
        </Alert>
      )}
      {loading && !verified && items.length > 0 && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Updating…
        </p>
      )}

      {loading && !items.length ? (
        <LoadingState label="Loading submitted claims…" />
      ) : !error && items.length === 0 ? (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>No submitted claims yet</EmptyTitle>
              <EmptyDescription>
                Claims filed through the claim form appear here with the engine’s recommendation.
              </EmptyDescription>
            </EmptyHeader>
            {isClaimant && (
              <EmptyContent>
                <Button asChild>
                  <a href="/claim">
                    <PlusIcon data-icon="inline-start" /> File a claim
                  </a>
                </Button>
              </EmptyContent>
            )}
          </Empty>
        </Card>
      ) : (
        <div
          ref={splitRef}
          className="grid items-start gap-5 lg:grid-cols-(--split)"
          style={
            {
              '--split': listWidth ? `${listWidth}px minmax(0,1fr)` : 'minmax(240px,1fr) minmax(0,3fr)',
            } as React.CSSProperties
          }
        >
          <div className="relative flex min-w-0 flex-col gap-3">
            {/* Apple-Mail-style divider: drag to resize the list, double-click to reset to a quarter. */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize claim list"
              aria-valuenow={listWidth ?? undefined}
              tabIndex={0}
              onPointerDown={startResize}
              onDoubleClick={() => saveListWidth(null)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const current =
                  listWidth ?? (splitRef.current ? splitRef.current.getBoundingClientRect().width / 4 : 300);
                saveListWidth(clampWidth(current + (event.key === 'ArrowRight' ? 24 : -24)));
              }}
              className="group absolute inset-y-0 -right-3.5 z-20 hidden w-3 cursor-col-resize touch-none items-center justify-center outline-none lg:flex"
            >
              <span className="h-10 w-1 rounded-full bg-border transition-colors group-hover:bg-foreground/40 group-focus-visible:bg-ring group-active:bg-foreground/60" />
            </div>
            <ClaimsList
              cases={cases}
              visible={visible}
              states={states}
              filters={filters}
              onFiltersChange={setFilters}
              selectedId={selectedId}
              onSelect={(caseId) => {
                setDismissed(false);
                openClaim(caseId);
              }}
              compact
            />
            {total > pageSize && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>Filters and counts apply to this page of {pageSize} claims.</span>
                <div className="flex items-center gap-1">
                  <span className="mr-2 tabular-nums">
                    {offset + 1}–{Math.min(offset + pageSize, total)} of {total}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={offset === 0 || loading}
                    onClick={() => setOffset(Math.max(0, offset - pageSize))}
                    aria-label="Previous page"
                  >
                    <ChevronLeftIcon />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={offset + pageSize >= total || loading}
                    onClick={() => setOffset(offset + pageSize)}
                    aria-label="Next page"
                  >
                    <ChevronRightIcon />
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div data-claim-pane className="flex min-w-0 flex-col gap-3">
            {selected && stored && state ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDismissed(true);
                      openClaim('');
                    }}
                    aria-label="Close claim (Esc)"
                  >
                    <XIcon data-icon="inline-start" /> Close{' '}
                    <kbd className="ml-1 rounded border px-1 tabular-nums text-[10px] text-muted-foreground">Esc</kbd>
                  </Button>
                  <div className="flex items-center gap-1">
                    {index >= 0 && (
                      <span className="mr-2 text-xs text-muted-foreground tabular-nums">
                        Claim {index + 1} of {visible.length}
                      </span>
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={!previousCase}
                      onClick={() => previousCase && openClaim(previousCase.decision.caseId)}
                      aria-label="Previous claim"
                    >
                      <ChevronLeftIcon />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={!nextCase}
                      onClick={() => nextCase && openClaim(nextCase.decision.caseId)}
                      aria-label="Next claim"
                    >
                      <ChevronRightIcon />
                    </Button>
                  </div>
                </div>
                {access.upload && stored.claim.submitted_by === user.id && stored.claim.case_status === 'open' && (
                  <Button asChild variant="outline">
                    <a href={followupHref(stored.claim.id)}>Add information or documents</a>
                  </Button>
                )}
                <ClaimDetail
                  item={selected}
                  state={state}
                  canReview={!!canReview}
                  showReviewControls={access.review}
                  onAction={openAction}
                  documents={<ClaimDocuments attachments={stored.claim.attachments} />}
                />
                <ReviewDialog
                  action={action}
                  onOpenChange={(open) => !open && setAction(null)}
                  datasetId="stored"
                  decision={selected.decision}
                  current={state.effective}
                  defaultReviewer={user.email ?? user.id}
                  onSubmit={(input) => void record(input)}
                  presetNext={preset.next}
                  presetTitle={preset.title}
                />
              </>
            ) : (
              <Card>
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <MousePointerClickIcon />
                    </EmptyMedia>
                    <EmptyTitle>No claim open</EmptyTitle>
                    <EmptyDescription>Pick a claim from the list to review it.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <Card>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Spinner />
          </EmptyMedia>
          <EmptyTitle>{label}</EmptyTitle>
          <EmptyDescription>Each open claim is evaluated against the active policy on the server.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </Card>
  );
}
