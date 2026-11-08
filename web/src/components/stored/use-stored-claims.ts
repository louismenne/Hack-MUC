import { cacheScope, cacheEpoch, readCache, writeCache } from '@/lib/reload-cache';
import { useCallback, useEffect, useRef, useState } from 'react';

import { authenticatedFetch } from '@/lib/supabase';
import { useAuthUser } from '@/lib/auth';

import { POLICY_CHANGED_EVENT } from '@/lib/policy-source';

import type { StoredQueueItem } from '../../../../src/policy-api/stored-claims';

export const pageSize = 50;

export function useStoredClaims(dashboard: boolean, offset: number, onPolicyChange: (action: null) => void) {
  const user = useAuthUser();
  const revision = useRef(0);
  const scope = cacheScope(user);
  type Snapshot = { items: StoredQueueItem[]; total: number; policy: string };
  const key = dashboard ? 'claims:dashboard' : `claims:page:${offset}`;
  const cached = useCallback(
    () =>
      readCache<Snapshot>(scope, key, (value) => {
        const snapshot = value as Snapshot | null;
        return (
          !!snapshot &&
          typeof snapshot.total === 'number' &&
          typeof snapshot.policy === 'string' &&
          Array.isArray(snapshot.items) &&
          snapshot.items.every(
            (item) =>
              item?.claim &&
              typeof item.claim.case_id === 'string' &&
              item.saved?.decision &&
              Array.isArray(item.saved.decision.supportingFacts) &&
              Array.isArray(item.saved.decision.missingFields),
          )
        );
      }),
    [scope, key],
  );
  const [initial] = useState(() => cached());
  const [items, setItems] = useState<StoredQueueItem[]>(initial?.items ?? []);
  const [total, setTotal] = useState(initial?.total ?? 0);
  const [policy, setPolicy] = useState(initial?.policy ?? '');
  const [loading, setLoading] = useState(true);
  // True once the shown claims came from the server (not only from the reload cache) under the current policy.
  // Background refreshes on window focus keep it true, so a reviewer's open dialog is not interrupted.
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
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
        writeCache(scope, key, { items: collected, total, policy: activePolicy }, epoch);
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
  }, [offset, dashboard, scope, key]);
  useEffect(() => {
    const snapshot = cached();
    setItems(snapshot?.items ?? []);
    setTotal(snapshot?.total ?? 0);
    setPolicy(snapshot?.policy ?? '');
    setVerified(false);
    void refresh();
    // Returning to the window re-checks claims quietly; it must not close an open review dialog.
    const focused = () => void refresh();
    // A policy change makes every shown decision stale: close the dialog and lock reviews until reloaded.
    const policyChanged = () => {
      onPolicyChange(null);
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
  }, [refresh, cached, onPolicyChange]);
  return { items, total, policy, loading, verified, error, refresh };
}
