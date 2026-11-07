import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileTextIcon, PlusIcon, SparklesIcon } from 'lucide-react';
import { toast } from 'sonner';
import { diffPolicies } from '../../../../src/policy-view/diff';
import { usePersistentState } from '@/lib/storage';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AI_UNAVAILABLE, ApiFailure, policyApi, type PolicyVersionRecord } from './api';
import { DiffList } from './diff-list';
import { RuleCard } from './rule-view';
import { VersionPage, formatDate, sourceLabel, statusLabel } from './version-page';

const isString = (v: unknown): v is string => typeof v === 'string';
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
  const [owner, setOwner] = usePersistentState('policy.owner', '', isString);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState('overview');
  const [compare, setCompare] = useState<{ from: string; to: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const load = useCallback(async (open?: string | null) => {
    try {
      const data = await policyApi.overview();
      setVersions(data.versions);
      setAiAvailable(data.aiAvailable);
      setError(null);
      if (open !== undefined) setOpenId(open);
    } catch (e) { setError(e instanceof ApiFailure ? e : new ApiFailure(String(e))); }
  }, []);
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
    if (file.current) file.current.value = '';
  };

  if (error && !versions) {
    return <Alert variant="destructive"><AlertTitle>Policy-Bereich nicht verfügbar</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>;
  }
  if (!versions || !active) return <p className="text-sm text-muted-foreground">{versions ? 'Es gibt keine aktive Policy-Version.' : 'Lade Policy-Versionen …'}</p>;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Dein Name (Ersteller)</span>
            <Input className="w-56" value={owner} maxLength={100} placeholder="z. B. Louis" onChange={e => setOwner(e.target.value)} />
          </label>
          <p className="max-w-md text-xs text-muted-foreground">Der Name wird als Label bei neuen Entwürfen gespeichert, es gibt keine Anmeldung. Regeln werden nur von deterministischem Code ausgewertet; die KI macht ausschließlich Vorschläge, die du freigibst.</p>
          <div className="ml-auto flex items-center gap-2"><Badge>Aktiv: {active.versionLabel}</Badge>{drafts.length > 0 && <Badge variant="secondary">{drafts.length} Entwurf{drafts.length > 1 ? 'e' : ''}</Badge>}</div>
        </CardContent>
      </Card>

      {open ? (
        <VersionPage key={`${open.id}|${open.changeSummary}|${JSON.stringify(open.rules)}`} version={open} active={active} aiAvailable={aiAvailable} owner={owner} busy={busy} run={run} onBack={() => setOpenId(null)} onReload={load} />
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="gap-4">
          <TabsList>
            <TabsTrigger value="overview">Aktive Policy</TabsTrigger>
            <TabsTrigger value="history">Versionen ({versions.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Version {active.versionLabel} ist aktiv</CardTitle>
                <CardDescription>{active.changeSummary ?? ''} Erstellt von {active.createdBy}, aktiviert {formatDate(active.activatedAt)}.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Die Regeln werden von oben nach unten geprüft. Die erste passende Regel entscheidet; passt keine, gilt die Standardregel. Es gibt keine automatische Ablehnung.</p>
                <ol className="space-y-3">
                  {active.rules.rules.map((rule, i) => (
                    <RuleCard key={rule.id} index={i} rule={rule} fields={active.rules.fields}
                      ai={{ available: aiAvailable && !!owner.trim(), busy, onSubmit: instruction => { void run(async () => {
                        const r = await policyApi.aiInstruction({ createdBy: owner, versionId: active.id, ruleId: rule.id, instruction });
                        toast.success(`Claude hat ${r.version.versionLabel} als Entwurf vorgeschlagen. Bitte Diff und Folgen prüfen.`);
                        await load(r.version.id);
                      }); } }} />
                  ))}
                  <RuleCard index={null} rule={active.rules.default} fields={active.rules.fields} isDefault />
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Neue Version vorbereiten</CardTitle><CardDescription>Jede Änderung wird zuerst ein Entwurf. Du siehst Diff und betroffene offene Fälle, bevor du freigibst.</CardDescription></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 rounded-lg border p-4">
                  <h3 className="flex items-center gap-2 text-sm font-medium"><PlusIcon className="size-4" />Manuell bearbeiten</h3>
                  <p className="text-sm text-muted-foreground">Kopiert die aktive Version als Entwurf. Werte wie Betragsgrenzen änderst du direkt in den Regeln, ganz ohne KI.</p>
                  <Button disabled={busy} onClick={newDraft}>Neuen Entwurf anlegen</Button>
                </div>
                <div className="space-y-2 rounded-lg border p-4">
                  <h3 className="flex items-center gap-2 text-sm font-medium"><SparklesIcon className="size-4" />Policy-Dokument hochladen</h3>
                  <p className="text-sm text-muted-foreground">Text, Markdown oder PDF. Claude übersetzt das Dokument in einen Entwurf im Regel-Schema.</p>
                  <input ref={file} type="file" accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf" className="hidden" onChange={e => fromFile(e.target.files?.[0])} />
                  <Button variant="outline" disabled={busy || !aiAvailable} onClick={() => file.current?.click()}><FileTextIcon />Datei auswählen</Button>
                  {!aiAvailable && <p className="text-sm text-muted-foreground">{AI_UNAVAILABLE}</p>}
                  {busy && aiAvailable && <p className="text-sm text-muted-foreground" role="status">Claude arbeitet …</p>}
                </div>
                {drafts.length > 0 && (
                  <div className="space-y-2 md:col-span-2">
                    <h3 className="text-sm font-medium">Offene Entwürfe</h3>
                    {drafts.map(d => <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"><span><strong>{d.versionLabel}</strong> · {d.createdBy} · {formatDate(d.createdAt)}{d.changeSummary ? ` · ${d.changeSummary}` : ''}</span><Button size="sm" variant="outline" onClick={() => setOpenId(d.id)}>Öffnen</Button></div>)}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Versionshistorie</CardTitle><CardDescription>Alle Versionen mit Status, Quelle, Ersteller und Änderungstext.</CardDescription></CardHeader>
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
              <CardHeader><CardTitle>Versionen vergleichen</CardTitle><CardDescription>Unterschiede in Klartext, z. B. „Repair quote (EUR) größer als: 1.500 → 1.200“.</CardDescription></CardHeader>
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
