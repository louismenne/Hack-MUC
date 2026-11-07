import { useEffect, useState } from 'react';
import type { PolicyVersion, Preview } from '../../../src/server/store';
import { policyV1 } from '../../../src/triage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RecommendationBadge } from '@/components/recommendation-badge';
import type { Decision } from '../../../src/triage';

interface State { policies: PolicyVersion[]; active: PolicyVersion; history: { id: string; at: string; actor: string; policy: string }[] }
interface StoredClaim { caseId: string; facts: { case_status: string }; current: Decision; needsRecheck: boolean }
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Policy API unavailable. Start the local app with npm run dev.');
  const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Request failed.'); return data;
}

export function PolicyManager() {
  const [state, setState] = useState<State | null>(null);
  const [claims, setClaims] = useState<StoredClaim[]>([]);
  const [config, setConfig] = useState(policyV1);
  const [owner, setOwner] = useState('');
  const [repairTypes, setRepairTypes] = useState('');
  const [draft, setDraft] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const refresh = async () => {
    const [next, records] = await Promise.all([api<State>('policies'), api<StoredClaim[]>('claims')]);
    setState(next); setClaims(records); return next;
  };
  useEffect(() => {
    let cancelled = false;
    void Promise.all([api<State>('policies'), api<StoredClaim[]>('claims')]).then(([next, records]) => {
      if (cancelled) return; setState(next); setClaims(records); setConfig(next.active.config); setRepairTypes(next.active.config.humanReviewRepairTypes.join(', '));
    }).catch(e => { if (!cancelled) setError(String(e.message)); });
    return () => { cancelled = true; };
  }, []);
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(''); setMessage(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  const edited = () => { setDraft(null); setPreview(null); };
  return <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
    <Card>
      <CardHeader><CardTitle>Policy workspace</CardTitle><CardDescription>Create a version, inspect its impact, then activate it.</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        <Badge variant="outline">Active: {state?.active.id ?? 'connecting…'}</Badge>
        <p className="text-xs text-muted-foreground">Local prototype · owner names are recorded, not authenticated. Changes are saved in SQLite. Published policy versions are immutable.</p>
        <label className="block space-y-2 text-sm">Policy owner<Input value={owner} onChange={e => setOwner(e.target.value)} placeholder="Your name" maxLength={100} /></label>
        <label className="block space-y-2 text-sm">Routine quote limit (€)<Input type="number" min="0" max="1000000000" step="0.01" value={Number.isNaN(config.routineQuoteLimitEur) ? '' : config.routineQuoteLimitEur} onChange={e => { edited(); setConfig({ ...config, routineQuoteLimitEur: e.target.value === '' ? NaN : Number(e.target.value) }); }} /><span className="text-xs text-muted-foreground">Only quotes above this amount trigger review.</span></label>
        <label className="block space-y-2 text-sm">Repair types requiring human review<Input value={repairTypes} onChange={e => { edited(); setRepairTypes(e.target.value); }} placeholder="e.g. ev_high_voltage_battery" /><span className="text-xs text-muted-foreground">Comma-separated identifiers. These are your proposed rules, not an official v2 policy.</span></label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={config.requireIncidentReport} onChange={e => { edited(); setConfig({ ...config, requireIncidentReport: e.target.checked }); }} />Require incident report</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={config.requireItemizedQuote} onChange={e => { edited(); setConfig({ ...config, requireItemizedQuote: e.target.checked }); }} />Require itemized quote</label>
        <p className="text-xs text-muted-foreground">Coverage, injury, liability, duplicate and evidence-conflict checks remain mandatory. Known review triggers take priority over missing information.</p>
        <Button disabled={busy || !state || !owner.trim()} onClick={() => void run(async () => {
          const created = await api<PolicyVersion>('policies', { actor: owner, config: { ...config, humanReviewRepairTypes: repairTypes.split(',').map(s => s.trim()).filter(Boolean) } });
          setDraft(created.id); setPreview(null); await refresh(); setMessage(`Saved ${created.id} as a draft.`);
        })}>Save new draft</Button>
        {draft && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => void run(async () => setPreview(await api<Preview>(`policies/${draft}/preview`, {})))}>Preview {draft}</Button><Button disabled={busy || !preview || !owner.trim()} onClick={() => void run(async () => {
          await api(`policies/${draft}/activate`, { token: preview!.token, actor: owner });
          await refresh(); setPreview(null); setDraft(null); setMessage(`Activated ${draft}. Affected open claims are flagged for review; closed claims are unchanged.`);
        })}>Activate {draft}</Button></div>}
        <p role="status" className="text-sm">{busy ? 'Working…' : message}</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
    <div className="min-w-0 space-y-4">
      <Card><CardHeader><CardTitle>{preview ? `Impact preview · ${preview.baseVersion} → ${draft}` : 'Current policy decisions'}</CardTitle><CardDescription>All 26 participant cases. Uploaded CSVs and browser-local overrides are outside this policy workspace. The Review queue remains the v1 baseline.</CardDescription></CardHeader>
        <CardContent>
          {preview ? <><div className="mb-4 flex flex-wrap gap-2"><Badge>{preview.changed} changed recommendations</Badge><Badge variant="secondary">{preview.closed} closed decisions retained</Badge><Badge variant="outline">{preview.total} cases evaluated</Badge></div><p className="mb-4 text-xs text-muted-foreground">No v2 ground-truth labels are supplied: changes are impact measurements, not a v2 accuracy score. Activation records new automated recommendations; it does not finalize claims.</p></> : <p className="mb-4 text-sm text-muted-foreground">{claims.filter(c => c.needsRecheck).length} open claims need another look.</p>}
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Claim</th><th className="p-2">Status</th>{preview && <th className="p-2">Before</th>}<th className="p-2">{preview ? 'Proposed' : 'Current'}</th><th className="p-2">Action</th></tr></thead><tbody>
            {preview ? preview.rows.map(r => <tr key={r.caseId} className="border-b"><td className="p-2 font-mono">{r.caseId}</td><td className="p-2">{r.status}</td><td className="p-2"><RecommendationBadge value={r.before.recommendation} short /></td><td className="p-2"><RecommendationBadge value={r.after.recommendation} short /><div className="mt-1 text-xs text-muted-foreground">{r.after.explanation}</div></td><td className="p-2">{r.retained ? 'Retained' : r.needsRecheck ? 'Recheck' : 'Unchanged'}</td></tr>) : claims.map(c => <tr key={c.caseId} className="border-b"><td className="p-2 font-mono">{c.caseId}</td><td className="p-2">{c.facts.case_status}</td><td className="p-2"><RecommendationBadge value={c.current.recommendation} short /><span className="ml-2 text-xs">{c.current.policyVersion}</span></td><td className="p-2">{c.facts.case_status === 'closed' ? 'Retained' : c.needsRecheck ? 'Recheck' : '—'}</td></tr>)}
          </tbody></table></div>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Version history</CardTitle></CardHeader><CardContent className="space-y-3">{state?.policies.map(p => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 text-sm"><div><strong>{p.id}</strong> · {p.status} · €{p.config.routineQuoteLimitEur}<p className="text-xs text-muted-foreground">Created by {p.createdBy} · {new Date(p.createdAt).toLocaleString()}{p.activatedBy ? ` · Activated by ${p.activatedBy}` : ''}</p></div>{p.status === 'draft' && <Button variant="outline" disabled={busy} onClick={() => { setDraft(p.id); setConfig(p.config); setRepairTypes(p.config.humanReviewRepairTypes.join(', ')); setPreview(null); }}>Open draft</Button>}</div>)}
        {state?.history.map(h => <p key={h.id} className="text-xs text-muted-foreground">{new Date(h.at).toLocaleString()} · {h.actor} activated {h.policy}. Impact and previous decisions saved.</p>)}
      </CardContent></Card>
    </div>
  </div>;
}
