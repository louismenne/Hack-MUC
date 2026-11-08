import { useAuthUser } from '@/lib/auth';
import { permissions } from '../../../../src/roles';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { toast } from 'sonner';
import { diffPolicies } from '../../../../src/policy-view/diff';
import { setLeafValue, type LeafPath } from '../../../../src/policy-view/edit';
import type { Scalar } from '../../../../src/policy-engine/schema';
import { POLICY_CHANGED_EVENT } from '@/lib/policy-source';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ApiFailure, policyApi, type ImpactReport, type PolicyDocument, type PolicyVersionRecord } from './api';
import { DiffList } from './diff-list';
import { ImpactTable } from './impact-table';
import { RuleCard, RuleRow } from './rule-view';

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
  const canManage = permissions(useAuthUser()).policy;
  const isDraft = version.status === 'draft' && canManage;
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
    window.dispatchEvent(new Event(POLICY_CHANGED_EVENT)); // the review queue re-evaluates with the new active version
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
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeftIcon />Zurück</Button>
        <h2 className="text-lg font-semibold tracking-tight">{version.versionLabel}</h2>
        <Badge variant={version.status === 'active' ? 'default' : 'secondary'}>{statusLabel[version.status]}</Badge>
        <span className="text-xs text-muted-foreground">{sourceLabel[version.source]} · {formatDate(version.createdAt)}</span>
        {!isDraft && canManage && <Button className="ml-auto" variant="outline" size="sm" disabled={busy} onClick={() => void copyToDraft()}>Als Entwurf kopieren</Button>}
      </div>

      <div className={isDraft ? 'grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(340px,2fr)]' : ''}>
        <Card className="gap-3">
          <CardHeader>
            <CardTitle>Regeln</CardTitle>
            <CardDescription>{isDraft ? 'Werte direkt ändern. Die erste passende Regel entscheidet.' : version.changeSummary ?? 'Die erste passende Regel entscheidet.'}</CardDescription>
          </CardHeader>
          <CardContent>
            {isDraft ? (
              <ol className="space-y-2">
                {rules.rules.map((rule, i) => <RuleCard key={rule.id} index={i} rule={rule} fields={rules.fields} onLeaf={onLeaf(i)} ai={ruleAi(rule.id)} />)}
                <RuleCard index={null} rule={rules.default} fields={rules.fields} isDefault />
              </ol>
            ) : (
              <ol className="divide-y rounded-lg border">
                {rules.rules.map((rule, i) => <RuleRow key={rule.id} index={i} rule={rule} fields={rules.fields} />)}
                <RuleRow index={null} rule={rules.default} fields={rules.fields} />
              </ol>
            )}
          </CardContent>
        </Card>

        {isDraft && (
          <Card className="gap-4 lg:sticky lg:top-4">
            <CardHeader>
              <CardTitle>Vorschau</CardTitle>
              <CardDescription>Gegenüber {active.versionLabel}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <DiffList changes={changes} empty="Noch keine Änderung." />
              <section className="space-y-2 border-t pt-4">
                <h3 className="text-sm font-medium">Folgen für Fälle {dirty && <span className="font-normal text-muted-foreground">(gespeicherter Stand)</span>}</h3>
                {impactError ? <Alert variant="destructive"><AlertTitle>Nicht berechenbar</AlertTitle><AlertDescription>{impactError}</AlertDescription></Alert>
                  : impact ? <ImpactTable impact={impact} /> : <p className="text-sm text-muted-foreground">Wird berechnet …</p>}
              </section>
              <Textarea aria-label="Änderungstext" rows={2} maxLength={1000} value={summary} onChange={e => setSummary(e.target.value)} placeholder="Warum? (optional)" />
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                {dirty
                  ? <Button disabled={busy} onClick={() => void save()}>Speichern</Button>
                  : <Button disabled={busy || !impact || changes.length === 0} onClick={() => setConfirm(true)}>Freigeben</Button>}
                <Button variant="ghost" className="text-destructive" disabled={busy} onClick={() => void discard()}>Verwerfen</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

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
