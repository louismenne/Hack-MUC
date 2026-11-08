import { useRef, useState, type ReactNode } from 'react';
import { ArrowUpIcon, ChevronRightIcon, FileUpIcon, PaperclipIcon } from 'lucide-react';
import type { Condition, Leaf, Outcome, PolicyDocument } from '../../../../src/policy-engine/schema';
import { conditionToText, describeLeaf, groupChildren, groupKind } from '../../../../src/policy-view/describe';
import { dotClasses } from '@/components/recommendation-badge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type { PolicyVersionRecord } from './api';
import { formatDate } from './version-page';

/** Shared actions every layout variant offers the policy owner. */
export interface OwnerActions {
  canManage: boolean;
  aiAvailable: boolean;
  busy: boolean;
  onFile: (file: File | undefined) => void;
  onInstruction: (instruction: string) => void;
  onManual: () => void;
  /** Last chat answer to a question about the rules (no draft was created). */
  reply: { question: string; answer: string } | null;
  clearReply: () => void;
  drafts: PolicyVersionRecord[];
  openDraft: (id: string) => void;
}

const ACCEPT = '.txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf';

/** One input like a chat box: type a change, or drop / attach a new policy file. */
export function Composer({ aiAvailable, busy, onFile, onInstruction }: Pick<OwnerActions, 'aiAvailable' | 'busy' | 'onFile' | 'onInstruction'>) {
  const [text, setText] = useState('');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const disabled = busy || !aiAvailable;
  const send = () => { if (!text.trim() || disabled) return; onInstruction(text.trim()); setText(''); };
  return (
    <div className="space-y-1.5">
      <div
        data-dragging={dragging || undefined}
        onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={e => { e.preventDefault(); setDragging(false); if (!disabled) onFile(e.dataTransfer.files[0]); }}
        className="flex items-end gap-2 rounded-xl border bg-card p-2 shadow-xs transition-colors focus-within:border-ring data-dragging:border-primary data-dragging:bg-primary/5"
      >
        <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label="Attach policy file" disabled={disabled} onClick={() => input.current?.click()}><PaperclipIcon /></Button>
        <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        <Textarea
          aria-label="Describe a change" rows={1} maxLength={1000} disabled={disabled}
          className="max-h-32 min-h-8 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
          placeholder={dragging ? 'Drop to upload' : 'Ask about the rules, describe a change or drop a new policy file'}
          value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <Button size="icon" className="size-8 shrink-0" aria-label="Send" disabled={disabled || !text.trim()} onClick={send}>{busy ? <Spinner /> : <ArrowUpIcon />}</Button>
      </div>
      {!aiAvailable && <p className="px-1 text-xs text-muted-foreground">AI is unavailable here. Use Edit manually instead.</p>}
    </div>
  );
}

const statusText = { active: 'Active', draft: 'Draft', archived: 'Archived' } as const;
const WIDTH_KEY = 'hackmuc.policyVersionsWidth';

/** Draggable column width (like the review inbox): drag, arrow keys, double-click resets. Remembered per browser. */
function useSplitWidth(defaultPx: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem(WIDTH_KEY)); return Number.isFinite(v) && v > 0 ? v : defaultPx; } catch { return defaultPx; }
  });
  const clamp = (px: number) => Math.round(Math.min(Math.max(px, 200), (ref.current?.getBoundingClientRect().width ?? 1200) * 0.45));
  const save = (px: number) => { setWidth(px); try { localStorage.setItem(WIDTH_KEY, String(px)); } catch { /* storage unavailable */ } };
  const start = (event: React.PointerEvent) => {
    const grid = ref.current;
    if (!grid) return;
    event.preventDefault();
    const left = grid.getBoundingClientRect().left;
    const move = (e: PointerEvent) => setWidth(clamp(e.clientX - left));
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
      save(clamp(e.clientX - left));
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const handle = (
    <div
      role="separator" aria-orientation="vertical" aria-label="Resize navigation" aria-valuenow={width} tabIndex={0}
      onPointerDown={start}
      onDoubleClick={() => save(defaultPx)}
      onKeyDown={e => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); save(clamp(width + (e.key === 'ArrowRight' ? 24 : -24))); }}
      className="group absolute inset-y-0 -right-3 z-20 hidden w-3 cursor-col-resize touch-none items-center justify-center outline-none lg:flex"
    >
      <span className="h-10 w-1 rounded-full bg-border transition-colors group-hover:bg-foreground/40 group-focus-visible:bg-ring group-active:bg-foreground/60" />
    </div>
  );
  return { ref, width, handle };
}

function NavItem({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-current={selected ? 'page' : undefined}
      className={cn('flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm', selected ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground')}>
      {children}
    </button>
  );
}

/**
 * The policy area: navigation on the left (where you are), the selected page in the middle, and the
 * change box at the bottom whenever the current policy is on screen.
 */
export function PolicyShell({ active, versions, currentId, onNavigate, actions, showComposer, children }: {
  active: PolicyVersionRecord; versions: PolicyVersionRecord[]; currentId: string | null; onNavigate: (id: string | null) => void;
  actions: OwnerActions; showComposer: boolean; children: ReactNode;
}) {
  const split = useSplitWidth(260);
  const drafts = versions.filter(v => v.status === 'draft');
  const previous = versions.filter(v => v.status === 'archived').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const label = (text: string) => <div className="px-3 pt-4 pb-1 text-xs text-muted-foreground">{text}</div>;
  return (
    <div ref={split.ref} className="grid h-[calc(100dvh-7.5rem)] min-h-[420px] gap-4 lg:grid-cols-(--split)" style={{ '--split': `${split.width}px minmax(0,1fr)` } as React.CSSProperties}>
      <nav aria-label="Policy" className="relative flex min-h-0 flex-col overflow-y-auto rounded-lg border p-2">
        {split.handle}
        <NavItem selected={currentId === null} onClick={() => onNavigate(null)}>Overview</NavItem>
        {label('Active')}
        <NavItem selected={currentId === active.id} onClick={() => onNavigate(active.id)}>
          <span className="size-1.5 rounded-full bg-foreground" aria-hidden />{active.versionLabel}
        </NavItem>
        {drafts.length > 0 && label('Drafts')}
        {drafts.map(v => (
          <NavItem key={v.id} selected={currentId === v.id} onClick={() => onNavigate(v.id)}>
            <span className="size-1.5 rounded-full bg-muted-foreground" aria-hidden />{v.versionLabel}
          </NavItem>
        ))}
        {previous.length > 0 && label('Previous versions')}
        {previous.map(v => (
          <NavItem key={v.id} selected={currentId === v.id} onClick={() => onNavigate(v.id)}>
            <span className="size-1.5 rounded-full bg-border" aria-hidden />{v.versionLabel}
          </NavItem>
        ))}
      </nav>

      <section className="flex min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
        {showComposer && actions.reply && (
          <div className="mt-3 flex max-h-64 flex-col gap-3 overflow-y-auto rounded-lg border p-4 text-sm">
            <p className="ml-auto max-w-[80%] whitespace-pre-wrap rounded-2xl bg-muted px-3 py-2">{actions.reply.question}</p>
            <p className="max-w-[90%] whitespace-pre-wrap leading-relaxed">{actions.reply.answer}</p>
            <Button variant="ghost" size="sm" className="h-7 self-start text-muted-foreground" onClick={actions.clearReply}>Clear</Button>
          </div>
        )}
        {showComposer && actions.canManage && (
          <div className="space-y-1 pt-3">
            <Composer {...actions} />
            <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" disabled={actions.busy} onClick={actions.onManual}>Edit manually</Button>
          </div>
        )}
      </section>
    </div>
  );
}

/** Plain phrase for one condition, e.g. "quote above €1,200" or "no incident report"; falls back to the generic text. */
function plain(leaf: Leaf, fields: PolicyDocument['fields']): string {
  const def = fields[leaf.field];
  const name = (def?.label ?? leaf.field).replace(/\s*\(EUR\)/, '').replace(/ present$/i, '').replace(/ on incident date$/i, '');
  const lower = name.charAt(0).toLowerCase() + name.slice(1);
  if (def?.type === 'boolean' && leaf.op === 'eq') return leaf.value === true ? lower : leaf.field === 'policy_active_on_incident' ? 'policy not active' : `no ${lower}`;
  if (leaf.op === 'gt' && typeof leaf.value === 'number') return `${lower} above €${leaf.value.toLocaleString('en-IE')}`;
  if (leaf.op === 'neq' && typeof leaf.value === 'string') return `${lower} not ${leaf.value.replaceAll('_', ' ')}`;
  if (leaf.op === 'eq' && typeof leaf.value === 'string') return `${lower}: ${leaf.value.replaceAll('_', ' ')}`;
  return describeLeaf(leaf, fields);
}

/** Each top-level condition of a rule as a short phrase; "blank or unreadable" checks fold into one. */
function criteriaOf(rule: { when?: Condition }, fields: PolicyDocument['fields']): string[] {
  if (!rule.when) return [];
  const parts = groupKind(rule.when) === 'any' ? groupChildren(rule.when) : [rule.when];
  const blank = parts.filter(part => groupKind(part) === 'leaf' && (part as Leaf).op === 'is_empty');
  const out = parts.filter(part => !blank.includes(part)).map(part => (groupKind(part) === 'leaf' ? plain(part as Leaf, fields) : conditionToText(part, fields)));
  if (blank.length) out.push(blank.length === 1 ? describeLeaf(blank[0] as Leaf, fields) : 'a required field is blank or unreadable');
  return out;
}

const outcomeLead: Record<Outcome, string> = {
  human_review: 'Human review if',
  request_information: 'Request information if',
  routine_processing: 'Routine if',
};

/** Landing page: the active policy in short, a link to the full text, and earlier versions. */
export function PolicyOverview({ active, versions, actions, openVersion }: { active: PolicyVersionRecord; versions: PolicyVersionRecord[]; actions: OwnerActions; openVersion: (id: string) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const fields = active.rules.fields;
  const groups = (['human_review', 'request_information', 'routine_processing'] as Outcome[])
    .map(outcome => ({ outcome, items: active.rules.rules.filter(rule => rule.outcome === outcome).flatMap(rule => criteriaOf(rule, fields)) }))
    .filter(group => group.items.length);
  const previous = versions.filter(v => v.status !== 'active').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h2 className="text-3xl font-normal tracking-[-0.03em]">{active.versionLabel}</h2>
          <p className="text-sm text-muted-foreground">Active since {formatDate(active.activatedAt)}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => openVersion(active.id)}>View full policy</Button>
          {actions.canManage && (
            <>
              <Button size="sm" disabled={actions.busy || !actions.aiAvailable} title={actions.aiAvailable ? "Upload a new policy document (PDF, TXT, Markdown)" : "AI is not configured on this server"} onClick={() => file.current?.click()}><FileUpIcon data-icon="inline-start" />Add new policy</Button>
              <input ref={file} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={e => { actions.onFile(e.target.files?.[0]); e.target.value = ''; }} />
            </>
          )}
        </div>
      </header>

      <section className="space-y-4">
        <h3 className="text-sm font-medium">In short</h3>
        <dl className="divide-y rounded-lg border">
          {groups.map(group => (
            <div key={group.outcome} className="grid gap-1 px-4 py-3 sm:grid-cols-[200px_minmax(0,1fr)]">
              <dt className="flex items-center gap-2 text-sm font-medium"><span className={cn('size-2 rounded-full', dotClasses[group.outcome])} aria-hidden />{outcomeLead[group.outcome]}</dt>
              <dd className="text-sm text-muted-foreground first-letter:uppercase">{group.items.join(', ')}</dd>
            </div>
          ))}
          <div className="grid gap-1 px-4 py-3 sm:grid-cols-[200px_minmax(0,1fr)]">
            <dt className="flex items-center gap-2 text-sm font-medium"><span className={cn('size-2 rounded-full', dotClasses[active.rules.default.outcome])} aria-hidden />Otherwise</dt>
            <dd className="text-sm text-muted-foreground">{active.rules.default.outcome === 'routine_processing' ? 'Routine processing' : active.rules.default.outcome.replaceAll('_', ' ')}</dd>
          </div>
        </dl>
        {active.changeSummary && <p className="text-sm text-muted-foreground">{active.changeSummary}</p>}
      </section>

      {previous.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium">Other versions</h3>
          <ul className="divide-y rounded-lg border">
            {previous.map(v => (
              <li key={v.id}>
                <button type="button" onClick={() => openVersion(v.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40">
                  <span className="w-24 shrink-0 text-sm">{v.versionLabel}</span>
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{statusText[v.status]}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{v.changeSummary ?? '—'}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(v.activatedAt ?? v.createdAt)}</span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
