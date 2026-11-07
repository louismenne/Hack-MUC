import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { AuditRow } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
        const { data, error } = await supabase.from('audit_log').select('*').order('sequence', { ascending: false }).range(page * 50, page * 50 + 49);
        if (error) throw new Error(error.message);
        if (alive) { setRows(data as AuditRow[]); setError(''); }
      } catch (e) { if (alive) setError(String(e)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [page, revision]);
  return <Card className="mb-4"><CardHeader><CardTitle>Persistent activity log</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-sm text-muted-foreground">Claim submissions, policy changes and reviews recorded in Supabase. Entries cannot be edited or cleared. Server-side policy changes are attributed to “Server / database”.</p>
    <Button variant="outline" disabled={loading} onClick={() => refresh(n => n + 1)}>Refresh</Button>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {loading ? <p role="status">Loading activity…</p> : rows.length === 0 ? <p>No recorded activity.</p> : rows.map(row => <div key={row.id} className="rounded border p-3 text-sm"><p>{row.entity_type} · {row.action} · {String(row.details.caseId ?? row.details.version ?? row.entity_id)}</p><p className="text-xs text-muted-foreground">{new Date(row.occurred_at).toLocaleString()} · {row.actor_label}</p>{row.details.reason ? <p>{String(row.details.reason)}</p> : null}</div>)}
    <div className="flex items-center gap-3"><Button variant="outline" disabled={loading || page === 0} onClick={() => setPage(n => n - 1)}>Previous</Button><span>Page {page + 1}</span><Button variant="outline" disabled={loading || rows.length < 50} onClick={() => setPage(n => n + 1)}>Next</Button></div>
  </CardContent></Card>;
}
