import { useState } from 'react';
import { toast } from 'sonner';
import type { Investigation } from '../../../../src/quality-monitoring';
import { policyApi, type PolicyVersionRecord } from '@/components/policy/api';
import { saveInvestigation } from '@/lib/quality-monitoring';
import { navigate, pageHref, PageLink } from '@/lib/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ReviewEvidence } from './evidence';

export function InvestigationDetail({ item, linked, canManage, owner, onSaved }: {
  item: Investigation; linked?: PolicyVersionRecord; canManage: boolean; owner: string; onSaved: (item: Investigation) => void;
}) {
  const [findings, setFindings] = useState(item.findings);
  const [busy, setBusy] = useState(false);
  const dirty = findings.trim() !== item.findings;
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try { await task(); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const save = (status: Investigation['status']) => run(async () => {
    onSaved(await saveInvestigation(item, findings, status));
    toast.success('Investigation saved');
  });
  const draft = () => run(async () => {
    const result = await policyApi.createDraft({ createdBy: owner, investigationId: item.id, investigationRevision: item.revision,
      changeSummary: `Quality investigation: ${item.title}. ${item.findings}`.slice(0, 1000) });
    navigate(pageHref('policy', new URLSearchParams({ version: result.version.id })));
  });
  return <Card>
    <CardHeader><div className="flex flex-wrap items-center gap-2"><CardTitle>{item.title}</CardTitle><Badge variant="outline">{item.status}</Badge></div>
      <CardDescription>Opened {new Date(item.created_at).toLocaleDateString('en-GB')} · {item.evidence.length} saved review records. Evidence is a snapshot from when the investigation opened.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      <ReviewEvidence events={item.evidence} />
      <div className="space-y-2"><label htmlFor="investigation-findings" className="text-sm font-medium">Findings and proposed change</label>
        <Textarea id="investigation-findings" rows={5} maxLength={4000} value={findings} onChange={e => setFindings(e.target.value)} disabled={busy || item.status === 'closed'} placeholder="What did you check? Is this a policy issue, missing information, or a reviewer mistake? Describe the proposed change and evidence still needed." />
        <p className="text-xs text-muted-foreground">Overrides are signals, not confirmed errors. Verify evidence before proposing a rule change.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy || !dirty || item.status === 'closed'} onClick={() => void save('open')}>Save findings</Button>
        <Button variant="ghost" disabled={busy || dirty} onClick={() => void save(item.status === 'open' ? 'closed' : 'open')}>{item.status === 'open' ? 'Close investigation' : 'Reopen investigation'}</Button>
        {linked && canManage ? <Button asChild><PageLink href={pageHref('policy', new URLSearchParams({ version: linked.id }))}>Open {linked.versionLabel} · {linked.status}</PageLink></Button>
          : canManage && <Button disabled={busy || dirty || item.status !== 'open' || item.findings.trim().length < 10} onClick={() => void draft()}>Prepare policy draft</Button>}
      </div>
      <p className="text-sm text-muted-foreground">{canManage ? 'Save findings (at least 10 characters), then prepare a draft from the active policy. Edit its rules manually or ask AI for a proposal, inspect the impact, and explicitly activate.' : 'A Policy Manager or Admin can prepare and approve a policy draft from these findings.'}</p>
      {linked && !canManage && <p className="text-xs text-muted-foreground">Linked policy: {linked.versionLabel} · {linked.status}. Policy editing and activation remain restricted to the policy owner.</p>}
    </CardContent>
  </Card>;
}
