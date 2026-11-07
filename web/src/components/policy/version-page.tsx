import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { toast } from 'sonner';
import { diffPolicies } from '../../../../src/policy-view/diff';
import { setLeafValue, type LeafPath } from '../../../../src/policy-view/edit';
import type { Scalar } from '../../../../src/policy-engine/schema';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ApiFailure, policyApi, type ImpactReport, type PolicyDocument, type PolicyVersionRecord } from './api';
import { DiffList } from './diff-list';
import { ImpactTable } from './impact-table';
import { RuleCard } from './rule-view';

export const statusLabel = { draft: 'Entwurf', active: 'Aktiv', archived: 'Archiviert' } as const;
export const sourceLabel = { seed: 'Ausgangs-Policy', edit: 'Bearbeitung', upload: 'Datei-Upload' } as const;
export const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');

interface Props {
  version: PolicyVersionRecord;
  active: PolicyVersionRecord;
  aiAvailable: boolean;
  owner: string;
  busy: boolean;
  run: <T>(task: () => Promise<T>) => Promise<T | undefined>;
  onBack: () => void;
  onReload: (openId?: string | null) => Promise<void>;
}

/** One version: read-only for active/archived, editable for drafts, with diff, impact and activation. */
export function VersionPage({ version, active, aiAvailable, owner, busy, run, onBack, onReload }: Props) {
  const isDraft = version.status === 'draft';
  const [rules, setRules] = useState<PolicyDocument>(version.rules);
  const [summary, setSummary] = useState(version.changeSummary ?? '');
  const [impact, setImpact] = useState<ImpactReport | null>(null);
  const [impactError, setImpactError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const dirty = JSON.stringify(rules) !== JSON.stringify(version.rules) || summary.trim() !== (version.changeSummary ?? '');
  const changes = useMemo(() => diffPolicies(active.rules, rules), [active.rules, rules]);

  useEffect(() => {
    if (!isDraft) return;
    let cancelled = false;
    policyApi.impact(version.id).then(r => { if (!cancelled) setImpact(r.impact); }, (e: ApiFailure) => { if (!cancelled) setImpactError(e.message); });
    return () => { cancelled = true; };
  }, [isDraft, version.id]);

  const onLeaf = (ruleIndex: number) => (path: LeafPath, value: Scalar | Scalar[]) => {
    try { setRules(current => setLeafValue(current, ruleIndex, path, value)); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };

  const save = () => run(async () => {
    const text = summary.trim() || changes.map(c => c.text).join('; ').slice(0, 1000);
    await policyApi.updateDraft({ id: version.id, rules, changeSummary: text || undefined });
    toast.success('Entwurf gespeichert.');
    await onReload(version.id);
  });
  const askAi = (ruleId: string) => (instruction: string) => run(async () => {
    const r = await policyApi.aiInstruction({ createdBy: owner, versionId: version.id, ruleId, instruction });
    toast.success(`Claude hat ${r.version.versionLabel} als Entwurf vorgeschlagen. Bitte Diff und Folgen prüfen.`);
    await onReload(r.version.id);
  });
  const discard = () => run(async () => { await policyApi.discardDraft(version.id); toast.success('Entwurf verworfen.'); await onReload(null); });
  const activate = () => run(async () => {
    const { version: done } = await policyApi.activate(version.id, active.id);
    toast.success(`${done.versionLabel} ist jetzt aktiv. ${active.versionLabel} wurde archiviert.`);
    await onReload(done.id);
  });
  const copyToDraft = () => run(async () => {
    if (!owner.trim()) { toast.error('Bitte oben deinen Namen eintragen.'); return; }
    const r = await policyApi.createDraft({ createdBy: owner, parentId: version.id });
    await onReload(r.version.id);
  });

  const ruleAi = (id: string) => (isDraft ? { available: aiAvailable && !!owner.trim() && !dirty, busy, onSubmit: askAi(id) } : undefined);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeftIcon />Zurück</Button>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Version {version.versionLabel}
            <Badge variant={version.status === 'active' ? 'default' : 'secondary'}>{statusLabel[version.status]}</Badge>
            <Badge variant="outline">{sourceLabel[version.source]}</Badge>
          </CardTitle>
          <CardDescription>Erstellt von {version.createdBy} · {formatDate(version.createdAt)}{version.activatedAt ? ` · aktiviert ${formatDate(version.activatedAt)}` : ''}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isDraft ? (
            <div className="space-y-1">
              <label htmlFor="summary" className="text-sm font-medium">Änderungstext</label>
              <Textarea id="summary" rows={2} maxLength={1000} value={summary} onChange={e => setSummary(e.target.value)} placeholder="Was ändert sich und warum? (Wird beim Speichern aus dem Diff ergänzt, wenn leer.)" />
            </div>
          ) : <p className="text-sm">{version.changeSummary ?? 'Kein Änderungstext.'}</p>}
          {!isDraft && <div><Button variant="outline" size="sm" disabled={busy} onClick={() => void copyToDraft()}>Neuen Entwurf aus dieser Version erstellen</Button></div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regeln</CardTitle>
          <CardDescription>{isDraft ? 'Werte ändern (Zahlen, ja/nein, Listen) oder eine Regel per KI ändern lassen. Reihenfolge = Priorität: die erste passende Regel entscheidet.' : 'Reihenfolge = Priorität: die erste passende Regel entscheidet. Diese Version ist unveränderlich.'}</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {rules.rules.map((rule, i) => <RuleCard key={rule.id} index={i} rule={rule} fields={rules.fields} onLeaf={isDraft ? onLeaf(i) : undefined} ai={ruleAi(rule.id)} />)}
            <RuleCard index={null} rule={rules.default} fields={rules.fields} isDefault />
          </ol>
          {isDraft && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button disabled={busy || !dirty} onClick={() => void save()}>Entwurf speichern</Button>
              <Button variant="destructive" disabled={busy} onClick={() => void discard()}>Entwurf verwerfen</Button>
              {dirty && <span className="self-center text-sm text-muted-foreground">Ungespeicherte Änderungen</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {isDraft && (
        <Card>
          <CardHeader>
            <CardTitle>Prüfen und freigeben</CardTitle>
            <CardDescription>Unterschiede zur aktiven Version {active.versionLabel} und die Folgen für offene Fälle.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <section><h3 className="mb-2 text-sm font-medium">Änderungen gegenüber {active.versionLabel}</h3><DiffList changes={changes} empty="Der Entwurf ist noch identisch mit der aktiven Version." /></section>
            <section>
              <h3 className="mb-2 text-sm font-medium">Folgenabschätzung {dirty && <span className="font-normal text-muted-foreground">(gilt für den gespeicherten Stand)</span>}</h3>
              {impactError ? <Alert variant="destructive"><AlertTitle>Folgenabschätzung nicht möglich</AlertTitle><AlertDescription>{impactError}</AlertDescription></Alert>
                : impact ? <ImpactTable impact={impact} /> : <p className="text-sm text-muted-foreground">Wird berechnet …</p>}
            </section>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={busy || dirty || !impact || changes.length === 0} onClick={() => setConfirm(true)}>Freigeben</Button>
              {dirty && <span className="text-sm text-muted-foreground">Erst speichern, dann freigeben.</span>}
              {!dirty && changes.length === 0 && <span className="text-sm text-muted-foreground">Keine Änderung, nichts freizugeben.</span>}
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{version.versionLabel} freigeben?</AlertDialogTitle>
            <AlertDialogDescription>
              {version.versionLabel} wird aktiv, {active.versionLabel} wird archiviert.{impact ? ` ${impact.totals.needsRecheck} offene Fälle müssen neu bewertet werden; geschlossene Fälle bleiben unverändert.` : ''} Aktive Versionen können danach nicht mehr bearbeitet werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => void activate()}>Jetzt freigeben</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
