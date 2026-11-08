import { VoiceAssistant, voiceError, voiceResult } from '../voice/assistant';
import { diffPolicies } from '../../../../src/policy-view/diff';
import type { PolicyDocument } from './api';
import { navigate, pageHref, useRoute } from '@/lib/navigation';
import { permissions } from '../../../../src/roles';
import { useAuthUser } from '@/lib/auth';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const editor = useRef<{ id: string; rules: PolicyDocument; dirty: boolean } | null>(null);
  const proposalPending = useRef(false);
  const bindVoiceEditor = useCallback((value: typeof editor.current) => { editor.current = value; }, []);
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
  // Esc goes back to the overview, like closing a claim in the review inbox. Dialogs, menus and fields keep their own Esc.
  useEffect(() => {
    if (!openId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"]')) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      setOpenId(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [openId, setOpenId]);

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
    <div className="mx-auto w-full max-w-[1600px] space-y-3">
      {canManage && <VoiceAssistant purpose="policy" title="Discuss policy and prepare changes" tools={{
        get_policy_context: async () => {
          const data = await policyApi.overview();
          const selectedId = new URLSearchParams(window.location.search).get('version');
          const current = data.versions.find(v => v.status === 'active');
          const selected = selectedId ? data.versions.find(v => v.id === selectedId) : current;
          if (!current || !selected) return voiceError('Policy selection unavailable.');
          const editing = editor.current?.id === selected.id ? editor.current : null;
          return voiceResult({ active: current, selected: { ...selected, rules: editing?.rules ?? selected.rules }, unsaved_changes: editing?.dirty ?? false, permissions: { can_manage_policy: canManage, ai_available: data.aiAvailable } });
        },
        propose_policy_change: async params => {
          const p = params as { version_id?: unknown; instruction?: unknown } | null;
          if (!canManage || busy || proposalPending.current) return voiceError('Policy changes unavailable or busy.');
          if (typeof p?.version_id !== 'string' || typeof p.instruction !== 'string' || !p.instruction.trim() || p.instruction.length > 10000) return voiceError('Invalid proposal parameters.');
          const selectedId = new URLSearchParams(window.location.search).get('version') ?? active.id;
          if (p.version_id !== selectedId) return voiceError('Selection changed. Retrieve context again.');
          if (editor.current?.dirty) return voiceError('Save or discard your unsaved edits before requesting an AI draft.');
          proposalPending.current = true;
          setBusy(true);
          try {
            const r = await policyApi.aiInstruction({ createdBy: owner, versionId: p.version_id, instruction: p.instruction.trim() });
            if (r.version) { await load(r.version.id); return voiceResult({ draft: r.version, activated: false }); }
            setReply({ question: p.instruction, answer: r.answer ?? 'No change proposed.' });
            return voiceResult({ answer: r.answer ?? 'No change proposed.', draft_created: false });
          } finally { proposalPending.current = false; setBusy(false); }
        },
        get_selected_draft_impact: async () => {
          const selectedId = new URLSearchParams(window.location.search).get('version');
          const data = await policyApi.overview();
          const draft = data.versions.find(v => v.id === selectedId && v.status === 'draft');
          const base = data.versions.find(v => v.status === 'active');
          if (!draft || !base) return voiceError('No draft selected.');
          const snapshot = editor.current;
          const rules = snapshot?.id === draft.id ? snapshot.rules : draft.rules;
          const key = JSON.stringify(rules);
          const result = await policyApi.impact(draft.id, rules);
          const after = await policyApi.overview();
          if (new URLSearchParams(window.location.search).get('version') !== draft.id ||
              (editor.current?.id === draft.id && JSON.stringify(editor.current.rules) !== key) ||
              after.versions.find(v => v.status === 'active')?.id !== base.id ||
              after.versions.find(v => v.id === draft.id)?.revision !== draft.revision ||
              result.impact.base.id !== base.id || result.impact.draft.revision !== draft.revision) return voiceError('Impact became stale. Request it again.');
          return voiceResult({ impact: result.impact, differences: diffPolicies(base.rules, rules), unsaved_changes: snapshot?.dirty ?? false });
        },
      }} />}

      <PolicyShell active={active} versions={versions} currentId={open?.id ?? null} onNavigate={setOpenId} actions={actions} showComposer={!open || open.id === active.id}>
        {open
          ? <VersionPage bindVoiceEditor={bindVoiceEditor} key={`${open.id}|${open.revision}|${open.changeSummary}|${JSON.stringify(open.rules)}`} version={open} active={active} aiAvailable={aiAvailable && canManage} owner={owner} busy={busy} run={run} onBack={() => setOpenId(null)} onReload={load} />
          : <PolicyOverview active={active} versions={versions} actions={actions} openVersion={id => setOpenId(id)} />}
      </PolicyShell>
    </div>
  );
}
