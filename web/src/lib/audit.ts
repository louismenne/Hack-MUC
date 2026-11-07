import { useAuthUser } from './auth';
import { cacheScope, cacheEpoch, readCache, writeCache } from './reload-cache';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { ReviewEvent } from '../../../src/review';
export type AuditRow = { id: string; sequence: number; occurred_at: string; actor_label: string; action: string; entity_type: string; entity_id: string; details: Record<string, unknown> };
export function reviewFromRow(row: AuditRow): ReviewEvent {
  return { ...row.details, id: row.id, at: row.occurred_at, reviewer: row.actor_label, action: row.action } as unknown as ReviewEvent;
}
export async function saveReview(event: ReviewEvent) {
  const { data, error } = await supabase.rpc('record_review', { p_event: event });
  if (error) throw new Error(error.message);
  return reviewFromRow(data as AuditRow);
}
export function useReviewAudit(datasetId: string) {
  const scope = cacheScope(useAuthUser());
  const key = `audit:${datasetId}`;
  const cached = () => readCache<ReviewEvent[]>(scope, key, value => Array.isArray(value) && value.every(e => e && typeof e.id === 'string' && typeof e.caseId === 'string' && typeof e.at === 'string'));
  const [events, setEvents] = useState<ReviewEvent[]>(() => cached() ?? []);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++revision.current;
    const epoch = cacheEpoch();
    setLoading(true);
    try {
      const rows: AuditRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('audit_log').select('*').eq('entity_type', 'review').eq('details->>datasetId', datasetId).order('sequence').range(offset, offset + 999);
        if (error) throw new Error(error.message);
        rows.push(...data as AuditRow[]);
        if (data.length < 1000) break;
      }
      if (current === revision.current) { const events = rows.map(reviewFromRow); writeCache(scope, key, events, epoch); setEvents(events); setError(''); }
    } catch (e) { if (current === revision.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (current === revision.current) setLoading(false); }
  }, [datasetId, scope, key]);
  useEffect(() => { setEvents(cached() ?? []); void refresh(); const focus = () => void refresh(); window.addEventListener('focus', focus); return () => { revision.current++; window.removeEventListener('focus', focus); }; }, [refresh]);
  return { events, setEvents, error, loading, refresh };
}
