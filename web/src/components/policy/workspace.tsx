import { navigate, pageHref, useRoute } from '@/lib/navigation';
import { permissions } from '../../../../src/roles';
import { useAuthUser } from '@/lib/auth';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpIcon, ChevronRightIcon, PencilIcon, UploadIcon } from 'lucide-react';
import { toast } from 'sonner';
import { policyHistoryFrom } from '../../../../src/policy-engine/history';
import { diffPolicies } from '../../../../src/policy-view/diff';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AI_UNAVAILABLE, ApiFailure, policyApi, type PolicyVersionRecord } from './api';
import { DiffList } from './diff-list';
import { RuleRow } from './rule-view';
import { cn } from '@/lib/utils';
import { VersionPage, formatDate, sourceLabel, statusLabel } from './version-page';

const MAX_PDF_BYTES = 2_400_000;
const MAX_TEXT_CHARS = 60_000;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}

export function PolicyWorkspace() {
  const [versions, setVersions] = useState<PolicyVersionRecord[] | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const user = useAuthUser();
  const canManage = permissions(user).policy;
  const owner = user.id;
  const route = useRoute();
  const openId = route.params.get('version');
  const tab = route.params.get('view') === 'history' ? 'history' : 'overview';
  const setOpenId = useCallback((id: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (id) params.set('version', id); else params.delete('version');
    navigate(pageHref('policy', params));
  }, []);
  const setTab = (view: string) => navigate(pageHref('policy', view === 'history' ? new URLSearchParams({ view }) : undefined));
  const [compare, setCompare] = useState<{ from: string; to: string } | null>(null);

  const load = useCallback(async (open?: string | null) => {
    try {
      const data = await policyApi.overview();
      setVersions(data.versions);
      setAiAvailable(data.aiAvailable);
      setError(null);
      if (open !== undefined) setOpenId(open);
    } catch (e) { setError(e instanceof ApiFailure ? e : new ApiFailure(String(e))); }
  }, [setOpenId]);
  useEffect(() => { void load(); }, [load]);

  /** Runs one API task with a busy flag; failures become a toast (details listed in the message). */
  const run = useCallback(async <T,>(task: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    try { return await task(); } catch (e) {
      const f = e instanceof ApiFailure ? e : new ApiFailure(e instanceof Error ? e.message : String(e));
      toast.error(f.message, { description: f.details.slice(0, 5).join('\n') || undefined, duration: 9000 });
    } finally { setBusy(false); }
  }, []);

  const active = versions?.find(v => v.status === 'active');
  const open = versions?.find(v => v.id === openId);
  const drafts = versions?.filter(v => v.status === 'draft') ?? [];
  const compareDiff = useMemo(() => {
    const a = versions?.find(v => v.id === compare?.from), b = versions?.find(v => v.id === compare?.to);
    return a && b ? diffPolicies(a.rules, b.rules) : null;
  }, [versions, compare]);

  const needName = () => { if (!owner.trim()) { toast.error('Bitte zuerst deinen Namen eintragen.'); return true; } return false; };
  const newDraft = () => { if (!needName()) void run(async () => { const r = await policyApi.createDraft({ createdBy: owner }); await load(r.version.id); }); };

  const fromFile = (f: File | undefined) => {
    if (!f || needName()) return;
    void run(async () => {
      const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
      if (isPdf && f.size > MAX_PDF_BYTES) throw new ApiFailure('Das PDF ist zu groß (höchstens ca. 2,4 MB).');
      const pdfBase64 = isPdf ? await readAsBase64(f) : undefined;
      const text = isPdf ? undefined : await f.text();
      if (text !== undefined && text.length > MAX_TEXT_CHARS) throw new ApiFailure('Der Text ist zu lang (höchstens 60.000 Zeichen).');
      const r = await policyApi.aiFromDocument({ createdBy: owner, filename: f.name, text, pdfBase64 });
      toast.success(`Claude hat ${r.version.versionLabel} als Entwurf vorgeschlagen. Bitte Diff und Folgen prüfen.`);
      await load(r.version.id);
    });
  };

  if (error && !versions) {
    return <Alert variant="destructive"><AlertTitle>Policy-Bereich nicht verfügbar</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>;
  }
  if (!versions || !active) return <p className="text-sm text-muted-foreground">{versions ? 'Es gibt keine aktive Policy-Version.' : 'Lade Policy-Versionen …'}</p>;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      {open ? (
        <VersionPage key={`${open.id}|${open.changeSummary}|${JSON.stringify(open.rules)}`} version={open} active={active} aiAvailable={aiAvailable && canManage} owner={owner} busy={busy} run={run} onBack={() => setOpenId(null)} onReload={load} />
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Policy</h2>
            <Badge>Aktiv: {active.versionLabel}</Badge>
            <span className="text-xs text-muted-foreground">seit {formatDate(active.activatedAt)}</span>
            <TabsList className="ml-auto">
              <TabsTrigger value="overview">Aktiv</TabsTrigger>
              <TabsTrigger value="history">Versionen ({versions.length})</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview">
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
              <Card className="gap-3">
                <CardHeader>
                  <CardTitle>Regeln</CardTitle>
                  <CardDescription>Von oben nach unten, die erste passende entscheidet.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ol className="divide-y rounded-lg border">
                    {active.rules.rules.map((rule, i) => <RuleRow key={rule.id} index={i} rule={rule} fields={active.rules.fields} />)}
                    <RuleRow index={null} rule={active.rules.default} fields={active.rules.fields} />
                  </ol>
                  <p className="mt-3 text-xs text-muted-foreground">Offene Fälle nutzen die aktive Version. Geschlossene behalten ihre Entscheidung.</p>
                </CardContent>
              </Card>

              {canManage ? (
                <Card className="gap-4 lg:sticky lg:top-4">
                  <CardHeader>
                    <CardTitle>Policy ändern</CardTitle>
                    <Steps />
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <PolicyDrop disabled={busy || !aiAvailable} onFile={fromFile} />
                    <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />oder<span className="h-px flex-1 bg-border" /></div>
                    <ChangeChat
                      disabled={busy || !aiAvailable}
                      onSubmit={instruction => { if (needName()) return; void run(async () => {
                        const r = await policyApi.aiInstruction({ createdBy: owner, versionId: active.id, instruction });
                        toast.success(`Entwurf ${r.version.versionLabel} erstellt. Bitte prüfen.`);
                        await load(r.version.id);
                      }); }}
                    />
                    {!aiAvailable && <p className="text-xs text-muted-foreground">{AI_UNAVAILABLE}</p>}
                    {busy && aiAvailable && <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Spinner />Claude erstellt den Entwurf …</p>}
                    <Button variant="ghost" size="sm" className="px-0 text-muted-foreground" disabled={busy} onClick={newDraft}><PencilIcon />Ohne KI manuell bearbeiten</Button>
                    {drafts.length > 0 && (
                      <div className="space-y-2 border-t pt-4">
                        <h3 className="text-sm font-medium">Offene Entwürfe</h3>
                        {drafts.map(d => (
                          <button key={d.id} type="button" onClick={() => setOpenId(d.id)} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50">
                            <strong>{d.versionLabel}</strong>
                            <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.changeSummary ?? formatDate(d.createdAt)}</span>
                            <ChevronRightIcon className="size-4 text-muted-foreground" />
                          </button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card><CardContent className="text-sm text-muted-foreground">Nur der Policy-Owner kann Änderungen vorschlagen.</CardContent></Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Versionen</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[...versions].reverse().map(v => (
                  <div key={v.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2"><strong>{v.versionLabel}</strong><Badge variant={v.status === 'active' ? 'default' : 'secondary'}>{statusLabel[v.status]}</Badge><Badge variant="outline">{sourceLabel[v.source]}</Badge></div>
                      <p className="text-sm">{v.changeSummary ?? <span className="text-muted-foreground">Kein Änderungstext</span>}</p>
                      <p className="text-xs text-muted-foreground">{v.createdBy} · erstellt {formatDate(v.createdAt)}{v.activatedAt ? ` · aktiviert ${formatDate(v.activatedAt)}` : ''}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setOpenId(v.id)}>Ansehen</Button>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Vergleichen</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <label className="flex items-center gap-2">Von
                    <select className="h-8 rounded-md border border-input bg-background px-2" value={compare?.from ?? ''} onChange={e => setCompare({ from: e.target.value, to: compare?.to ?? '' })}>
                      <option value="" disabled>wählen</option>{versions.map(v => <option key={v.id} value={v.id}>{v.versionLabel} ({statusLabel[v.status]})</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">nach
                    <select className="h-8 rounded-md border border-input bg-background px-2" value={compare?.to ?? ''} onChange={e => setCompare({ from: compare?.from ?? '', to: e.target.value })}>
                      <option value="" disabled>wählen</option>{versions.map(v => <option key={v.id} value={v.id}>{v.versionLabel} ({statusLabel[v.status]})</option>)}
                    </select>
                  </label>
                </div>
                {compareDiff ? <DiffList changes={compareDiff} /> : <p className="text-sm text-muted-foreground">Wähle zwei Versionen.</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

const ACCEPT = '.txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf';

/** Change → preview → activate: the owner's whole flow at a glance. */
function Steps() {
  return (
    <ol className="flex items-center gap-2 text-xs text-muted-foreground">
      {['Ändern', 'Vorschau prüfen', 'Freigeben'].map((step, i) => (
        <li key={step} className="flex items-center gap-2">
          {i > 0 && <ChevronRightIcon className="size-3" />}
          <span className={cn('flex size-4 items-center justify-center rounded-full border text-[10px]', i === 0 && 'border-foreground text-foreground')}>{i + 1}</span>
          <span className={cn(i === 0 && 'text-foreground')}>{step}</span>
        </li>
      ))}
    </ol>
  );
}

/** Drop a new policy document (PDF, text, Markdown); Claude turns it into a draft. */
function PolicyDrop({ disabled, onFile }: { disabled: boolean; onFile: (file: File | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      data-dragging={dragging || undefined}
      onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={e => { e.preventDefault(); setDragging(false); if (!disabled) onFile(e.dataTransfer.files[0]); }}
      className={cn('flex flex-col items-center gap-2 rounded-lg border border-dashed p-5 text-center transition-colors data-dragging:border-primary data-dragging:bg-primary/5', disabled && 'opacity-60')}
    >
      <UploadIcon className="size-5 text-muted-foreground" />
      <div className="text-sm font-medium">Neue Policy-Datei hierher ziehen</div>
      <div className="text-xs text-muted-foreground">PDF, TXT oder Markdown</div>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => input.current?.click()}>Datei wählen</Button>
      <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

/** Chat-style instruction against the active version, e.g. "Grenze auf 1.000 € senken". */
function ChangeChat({ disabled, onSubmit }: { disabled: boolean; onSubmit: (instruction: string) => void }) {
  const [text, setText] = useState('');
  const send = () => { if (!text.trim() || disabled) return; onSubmit(text.trim()); setText(''); };
  return (
    <div className="relative">
      <label htmlFor="policy-change" className="sr-only">Was soll sich ändern?</label>
      <Textarea
        id="policy-change" rows={3} maxLength={1000} className="resize-none pr-12"
        placeholder="Was soll sich ändern? z. B. „Grenze für Kostenvoranschläge auf 1.000 € senken“"
        value={text} disabled={disabled} onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
      />
      <Button size="icon" className="absolute right-2 bottom-2 size-8" aria-label="Entwurf erstellen" disabled={disabled || !text.trim()} onClick={send}><ArrowUpIcon /></Button>
    </div>
  );
}

