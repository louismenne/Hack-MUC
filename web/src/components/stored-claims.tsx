import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Button } from './ui/button';
import { toast } from 'sonner';

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
  const [items, setItems] = useState<StoredQueueItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [policy, setPolicy] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [filters, setFilters] = useState<ListFilters>({ query: '', recommendation: 'all', status: 'any' });
  const revision = useRef(0);
  const busy = useRef(false);
  const audit = useReviewAudit('stored');
  const refresh = useCallback(async () => {
    const request = ++revision.current;
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
        next += 50;
      } while (dashboard && next < total);
      if (request === revision.current) {
        setItems(collected);
        setTotal(total);
        setPolicy(activePolicy);
        setError('');
      }
    } catch (e) {
      if (request === revision.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (request === revision.current) setLoading(false);
    }
  }, [offset, dashboard]);
  useEffect(() => {
    void refresh();
    const changed = () => {
      setAction(null);
      void refresh();
    };
    window.addEventListener('focus', changed);
    window.addEventListener(POLICY_CHANGED_EVENT, changed);
    return () => {
      revision.current++;
      window.removeEventListener('focus', changed);
      window.removeEventListener(POLICY_CHANGED_EVENT, changed);
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
  const canReview = access.review && !loading && !error && !audit.loading && !audit.error;
  async function record(input: ReviewInput) {
    if (busy.current || !canReview || !stored || !state) return;
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
      setAction(null);
      toast.success('Review saved.');
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
  if (dashboard)
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <p>
            Submitted claims · {total} accessible claims · policy {policy || 'loading'}
          </p>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => {
              void refresh();
              void audit.refresh();
            }}
          >
            Refresh dashboard
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Arrival charts retain each claim’s first saved evaluation. Current backlog and rechecks use the latest saved
          decision. Savings are estimates using your local assumptions.
        </p>
        {(error || audit.error) && (
          <p role="alert" className="text-destructive">
            {error || audit.error}
          </p>
        )}
        {loading ? (
          <p role="status">Loading all submitted claims…</p>
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
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">Submitted claims ({total})</h2>
        <span className="text-sm text-muted-foreground">Server policy: {policy || 'loading'}</span>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => {
            void refresh();
            void audit.refresh();
          }}
        >
          Refresh
        </Button>
        {access.upload && (
          <Button asChild>
            <a href="/claim">File a claim</a>
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Open claims are evaluated against the active policy on refresh. Decisions and review history are saved. Closed
        claims retain their saved decision.
      </p>
      {(error || audit.error) && (
        <p role="alert" className="text-destructive">
          {error || audit.error} Reviews are disabled until refresh succeeds.
        </p>
      )}
      {loading && <p role="status">Loading and evaluating claims…</p>}
      {!loading && !error && items.length === 0 && <p>No submitted claims yet.</p>}
      {selected && stored && state ? (
        <>
          <Button
            variant="outline"
            onClick={() => {
              setSelectedId('');
              setAction(null);
            }}
          >
            Back to queue
          </Button>
          <ClaimDetail item={selected} state={state} canReview={!!canReview} onAction={setAction} />
          {stored.claim.attachments?.length > 0 && (
            <section aria-label="Claim documents" className="space-y-2">
              <h3 className="font-semibold">Documents</h3>
              {stored.claim.attachments.map((file) => (
                <Button key={file.path} variant="outline" onClick={() => void download(file.path, file.name)}>
                  {file.name}
                </Button>
              ))}
            </section>
          )}
          <ReviewDialog
            action={canReview ? action : null}
            onOpenChange={(open) => !open && setAction(null)}
            datasetId="stored"
            decision={selected.decision}
            current={state.effective}
            defaultReviewer={user.email ?? user.id}
            onSubmit={(input) => void record(input)}
          />
        </>
      ) : (
        <>
          <ClaimsList
            cases={cases}
            visible={visible}
            states={states}
            filters={filters}
            onFiltersChange={setFilters}
            selectedId=""
            onSelect={setSelectedId}
          />
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              disabled={offset === 0 || loading}
              onClick={() => setOffset((n) => Math.max(0, n - 50))}
            >
              Previous
            </Button>
            <span>
              {total ? offset + 1 : 0}–{Math.min(offset + 50, total)} of {total}
            </span>
            <Button
              variant="outline"
              disabled={offset + 50 >= total || loading}
              onClick={() => setOffset((n) => n + 50)}
            >
              Next
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Filters apply to this page of 50 claims.</p>
        </>
      )}
    </div>
  );
}
