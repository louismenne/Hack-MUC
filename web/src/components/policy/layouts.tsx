import { useRef, useState } from 'react';
import { ArrowUpIcon, PaperclipIcon } from 'lucide-react';
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
          placeholder={dragging ? 'Drop to upload' : 'Describe a change or drop a new policy file'}
          value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <Button size="icon" className="size-8 shrink-0" aria-label="Create draft" disabled={disabled || !text.trim()} onClick={send}>{busy ? <Spinner /> : <ArrowUpIcon />}</Button>
      </div>
      {!aiAvailable && <p className="px-1 text-xs text-muted-foreground">AI is unavailable here. Use Edit manually instead.</p>}
    </div>
  );
}

const statusText = { active: 'Active', draft: 'Draft', archived: 'Archived' } as const;

/** Variant B: one "change the policy" window like a chat, the version archive beside it. */
export function VariantB({ active, versions, actions, openVersion }: { active: PolicyVersionRecord; versions: PolicyVersionRecord[]; actions: OwnerActions; openVersion: (id: string) => void }) {
  const ordered = [...versions].sort((a, b) => (a.status === 'draft' ? -1 : b.status === 'draft' ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="grid h-[calc(100dvh-10.5rem)] min-h-[420px] gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col rounded-xl border bg-card">
        <h3 className="border-b px-4 py-3 text-sm font-medium">Versions</h3>
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
          {ordered.map(v => (
            <li key={v.id}>
              <button type="button" onClick={() => openVersion(v.id)} className="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-muted/50">
                <span className="flex items-center gap-2 text-sm">
                  <span className={cn('size-1.5 rounded-full', v.status === 'active' ? 'bg-foreground' : v.status === 'draft' ? 'bg-muted-foreground' : 'bg-border')} aria-hidden />
                  <span className={cn(v.status === 'active' && 'font-medium')}>{v.versionLabel}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{statusText[v.status]}</span>
                </span>
                <span className="pl-3.5 text-xs text-muted-foreground">{formatDate(v.activatedAt ?? v.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex min-h-0 flex-col rounded-xl border bg-card">
        <header className="flex items-center gap-3 border-b px-5 py-3">
          <h3 className="text-sm font-medium">Update policy</h3>
          <span className="text-xs text-muted-foreground">based on {active.versionLabel}</span>
          <Button variant="ghost" size="sm" className="ml-auto h-7 text-muted-foreground" onClick={() => openVersion(active.id)}>View current rules</Button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-base font-medium">Propose a policy change</p>
          <p className="max-w-md text-sm text-muted-foreground">Every change becomes a draft. You review its impact on open claims before it goes live.</p>
        </div>
        {actions.canManage ? (
          <div className="space-y-2 border-t p-4">
            <Composer {...actions} />
            <div className="flex items-center px-1">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" disabled={actions.busy} onClick={actions.onManual}>Edit manually</Button>
            </div>
          </div>
        ) : <p className="border-t p-4 text-sm text-muted-foreground">Only the policy owner can propose changes.</p>}
      </section>
    </div>
  );
}
