import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { qualitySignals, type Investigation } from '../../../../src/quality-monitoring';
import { permissions } from '../../../../src/roles';
import { useAuthUser } from '@/lib/auth';
import { loadMonitoring, openInvestigation } from '@/lib/quality-monitoring';
import { navigate, pageHref, useRoute } from '@/lib/navigation';
import { POLICY_CHANGED_EVENT } from '@/lib/policy-source';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InvestigationDetail } from './investigation';
import { ReviewEvidence } from './evidence';

type Data = Awaited<ReturnType<typeof loadMonitoring>>;
export function QualityMonitoring() {
  const user = useAuthUser();
  const canManage = permissions(user).policy;
  const route = useRoute();
  const selectedId = route.params.get('investigation');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(30);
  const [minimum, setMinimum] = useState(5);
  const [threshold, setThreshold] = useState(30);
  const [selectedSignal, setSelectedSignal] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try { const next = await loadMonitoring(); if (current === generation.current) { setData(next); setError(''); } }
    catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (current === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const reload = () => void refresh();
    window.addEventListener(POLICY_CHANGED_EVENT, reload);
    return () => { generation.current++; window.removeEventListener(POLICY_CHANGED_EVENT, reload); };
  }, [refresh]);
  const signals = data ? qualitySignals(data.events, data.loadedAt - days * 86400000, data.loadedAt, minimum, threshold / 100) : [];
  const signal = signals.find(s => s.key === selectedSignal);
  const selected = data?.investigations.find(i => i.id === selectedId);
  const selectInvestigation = (id: string) => navigate(pageHref('monitoring', new URLSearchParams({ investigation: id })));
  const saved = (item: Investigation) => setData(old => old && ({ ...old, investigations: old.investigations.map(i => i.id === item.id ? item : i) }));
  const open = async () => {
    if (!signal || busy || loading || error) return;
    setBusy(true);
    try {
      const item = await openInvestigation(title, signal.events.slice(0, 100).map(e => e.id));
      setData(old => old && ({ ...old, investigations: [item, ...old.investigations] }));
      selectInvestigation(item.id);
      setSelectedSignal(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return <div className="mx-auto w-full max-w-[1400px] space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-normal tracking-tight">Quality monitoring</h1><p className="mt-1 text-sm text-muted-foreground">Review signals → investigate evidence → prepare a draft → owner approval.</p></div><Button variant="outline" disabled={loading || busy} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Refresh'}</Button></div>
    {error && <Alert variant="destructive"><AlertTitle>Monitoring could not be loaded</AlertTitle><AlertDescription>{error} Retry with Refresh. If this is a new installation, apply the quality monitoring migration.</AlertDescription></Alert>}
    {!data && loading && <p role="status">Loading review history and investigations…</p>}
    {data && !error && <>
      <div className="grid gap-4 sm:grid-cols-3">{[
        ['Reviewed decisions', signals.reduce((n, s) => n + s.reviewed, 0)],
        ['Signals to investigate', signals.filter(s => s.flagged).length],
        ['Open investigations', data.investigations.filter(i => i.status === 'open').length],
      ].map(([label, value]) => <Card key={label}><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-3xl tabular-nums">{value}</CardTitle></CardHeader></Card>)}</div>
      <Card><CardHeader><CardTitle>Override patterns</CardTitle><CardDescription>Latest review per saved decision, grouped by policy version and rule. Reverted overrides no longer count; rejections are shown separately. This is the override rate among reviewed decisions, not overall accuracy.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm">Review window<select className="block h-9 rounded-md border bg-background px-3" value={days} onChange={e => { setDays(Number(e.target.value)); setSelectedSignal(null); }}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label>
          <label className="flex flex-col gap-1 text-sm">Minimum reviewed<Input className="w-36" type="number" min={1} max={10000} value={minimum} onChange={e => setMinimum(Math.min(10000, Math.max(1, Number(e.target.value) || 1)))} /></label>
          <label className="flex flex-col gap-1 text-sm">Override threshold (%)<Input className="w-40" type="number" min={1} max={100} value={threshold} onChange={e => setThreshold(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} /></label>
        </div>
        <p className="text-xs text-muted-foreground">Thresholds are exploratory settings for this screen. Window uses the latest review date; data refreshed {new Date(data.loadedAt).toLocaleTimeString('en-GB')}.</p>
        {signals.length ? <Table><TableHeader><TableRow><TableHead>Policy / rule</TableHead><TableHead>Reviewed</TableHead><TableHead>Overridden</TableHead><TableHead>Rejected</TableHead><TableHead>Signal</TableHead><TableHead><span className="sr-only">Action</span></TableHead></TableRow></TableHeader><TableBody>
          {signals.map(s => <TableRow key={s.key}><TableCell>{s.policyVersion} · {s.ruleId}</TableCell><TableCell>{s.reviewed}</TableCell><TableCell>{s.overridden} / {s.reviewed} ({Math.round(s.rate * 100)}%)</TableCell><TableCell>{s.rejected}</TableCell><TableCell><Badge variant={s.flagged ? 'default' : 'outline'}>{s.flagged ? 'Investigate' : s.reviewed < minimum ? 'Small sample' : 'Below threshold'}</Badge></TableCell><TableCell><Button variant="outline" size="sm" onClick={() => { setSelectedSignal(s.key); setTitle(`Review ${s.policyVersion} · ${s.ruleId} override pattern`); }}>Inspect evidence</Button></TableCell></TableRow>)}
        </TableBody></Table> : <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No saved reviews in this window. Review submitted claims to collect evidence; CSV examples and synthetic audit records are excluded.</p>}
        {signal && <section aria-label="Signal evidence" className="space-y-3 border-t pt-4"><h3 className="font-medium">{signal.policyVersion} · {signal.ruleId}</h3><ReviewEvidence events={signal.events} /><label className="block space-y-1 text-sm">Investigation title<Input maxLength={160} value={title} onChange={e => setTitle(e.target.value)} /></label><Button disabled={busy || loading || title.trim().length < 3} onClick={() => void open()}>Open investigation</Button>{signal.events.length > 100 && <p className="text-xs text-muted-foreground">The investigation will save the first 100 displayed review records.</p>}</section>}
      </CardContent></Card>
      <section className="space-y-3"><h2 className="text-xl font-medium">Investigations</h2>
        {data.investigations.length ? <div className="flex flex-wrap gap-2">{data.investigations.map(i => <Button key={i.id} variant={selectedId === i.id ? 'default' : 'outline'} onClick={() => selectInvestigation(i.id)}>{i.title} · {i.status}</Button>)}</div> : <p className="text-sm text-muted-foreground">Inspect a pattern and open an investigation to save evidence and findings for the policy owner.</p>}
        {selectedId && !selected && <p role="status">This investigation is unavailable. Refresh or select another investigation.</p>}
        {selected && <InvestigationDetail key={`${selected.id}:${selected.revision}`} item={selected} linked={data.versions.find(v => v.investigationId === selected.id)} canManage={canManage} owner={user.id} onSaved={saved} />}
      </section>
      <p className="text-xs text-muted-foreground">Monitoring uses reviewer decisions, not final claim outcomes. Random sampling, outcome collection, and scheduled alerts are not yet automated.</p>
    </>}
  </div>;
}
