import { navigate, pageHref, useRoute } from '@/lib/navigation';
import { permissions } from '../../../../src/roles';
import { useAuthUser } from '@/lib/auth';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ApiFailure, policyApi, type PolicyVersionRecord } from './api';
import { PolicyOverview, PolicyShell, type OwnerActions } from './layouts';
import { VersionPage } from './version-page';

const MAX_PDF_BYTES = 2_400_000;
const MAX_TEXT_CHARS = 60_000;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

export function PolicyWorkspace() {
  const [versions, setVersions] = useState<PolicyVersionRecord[] | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<{ question: string; answer: string } | null>(null);
  const user = useAuthUser();
  const canManage = permissions(user).policy;
  const owner = user.id;
  const route = useRoute();
  const openId = route.params.get('version');
  const setOpenId = useCallback((id: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (id) params.set('version', id); else params.delete('version');
    navigate(pageHref('policy', params));
  }, []);

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

  const needName = () => { if (!owner.trim()) { toast.error('Sign in to create a draft'); return true; } return false; };
  const newDraft = () => { if (!needName()) void run(async () => { const r = await policyApi.createDraft({ createdBy: owner }); await load(r.version.id); }); };

  const fromFile = (f: File | undefined) => {
    if (!f || needName()) return;
    void run(async () => {
      const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
      if (isPdf && f.size > MAX_PDF_BYTES) throw new ApiFailure('The PDF is too large (max. about 2.4 MB).');
      const pdfBase64 = isPdf ? await readAsBase64(f) : undefined;
      const text = isPdf ? undefined : await f.text();
      if (text !== undefined && text.length > MAX_TEXT_CHARS) throw new ApiFailure('The text is too long (max. 60,000 characters).');
      const r = await policyApi.aiFromDocument({ createdBy: owner, filename: f.name, text, pdfBase64 });
      toast.success(`Draft ${r.version.versionLabel} ready to review`);
      await load(r.version.id);
    });
  };

  const instruct = (instruction: string) => { if (needName() || !active) return; void run(async () => {
    const r = await policyApi.aiInstruction({ createdBy: owner, versionId: active.id, instruction });
    if (r.answer || !r.version) { setReply({ question: instruction, answer: r.answer ?? 'No change proposed.' }); return; }
    setReply(null);
    toast.success(`Draft ${r.version.versionLabel} ready to review`);
    await load(r.version.id);
  }); };
  const actions: OwnerActions = { canManage, aiAvailable, busy, onFile: fromFile, onInstruction: instruct, onManual: newDraft, reply, clearReply: () => setReply(null), drafts, openDraft: id => setOpenId(id) };

  if (error && !versions) {
    return <Alert variant="destructive"><AlertTitle>Policy unavailable</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>;
  }
  if (!versions || !active) return <p className="text-sm text-muted-foreground">{versions ? 'No active policy version' : 'Loading policy versions…'}</p>;

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PolicyShell active={active} versions={versions} currentId={open?.id ?? null} onNavigate={setOpenId} actions={actions} showComposer={!open || open.id === active.id}>
        {open
          ? <VersionPage key={`${open.id}|${open.revision}|${open.changeSummary}|${JSON.stringify(open.rules)}`} version={open} active={active} aiAvailable={aiAvailable && canManage} owner={owner} busy={busy} run={run} onBack={() => setOpenId(null)} onReload={load} />
          : <PolicyOverview active={active} versions={versions} actions={actions} openVersion={id => setOpenId(id)} />}
      </PolicyShell>
    </div>
  );
}
