import { useRef, useState } from 'react';
import { ArrowUpIcon, FileUpIcon, PaperclipIcon } from 'lucide-react';
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

/** Variant B: one "change the policy" window like a chat, the version archive beside it. */
const WIDTH_KEY = 'hackmuc.policyVersionsWidth';

/** Draggable column width (like the review inbox): drag, arrow keys, double-click resets. Remembered per browser. */
function useSplitWidth(defaultPx: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem(WIDTH_KEY)); return Number.isFinite(v) && v > 0 ? v : defaultPx; } catch { return defaultPx; }
  });
  const clamp = (px: number) => Math.round(Math.min(Math.max(px, 220), (ref.current?.getBoundingClientRect().width ?? 1200) * 0.5));
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
      role="separator" aria-orientation="vertical" aria-label="Resize version list" aria-valuenow={width} tabIndex={0}
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

/** The policy page: one "change the policy" window, the version archive beside it (resizable). */
export function VariantB({ active, versions, actions, openVersion }: { active: PolicyVersionRecord; versions: PolicyVersionRecord[]; actions: OwnerActions; openVersion: (id: string) => void }) {
  const ordered = [...versions].sort((a, b) => (a.status === 'draft' ? -1 : b.status === 'draft' ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));
  const split = useSplitWidth(320);
  const [dragging, setDragging] = useState(false);
  const canDrop = actions.canManage && actions.aiAvailable && !actions.busy;
  return (
    <div ref={split.ref} className="grid h-[calc(100dvh-10.5rem)] min-h-[420px] gap-4 lg:grid-cols-(--split)" style={{ '--split': `${split.width}px minmax(0,1fr)` } as React.CSSProperties}>
      <aside className="relative flex min-h-0 flex-col rounded-lg border bg-card">
        {split.handle}
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
                {v.changeSummary && <span className="line-clamp-2 pl-3.5 text-xs text-muted-foreground">{v.changeSummary}</span>}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex min-h-0 flex-col rounded-lg border bg-card">
        <header className="flex items-center gap-3 border-b px-5 py-3">
          <h3 className="text-sm font-medium">Update policy</h3>
          <span className="text-xs text-muted-foreground">based on {active.versionLabel}</span>
          <Button variant="ghost" size="sm" className="ml-auto h-7 text-muted-foreground" onClick={() => openVersion(active.id)}>View current rules</Button>
        </header>
        <div
          data-dragging={dragging || undefined}
          onDragOver={e => { e.preventDefault(); if (canDrop) setDragging(true); }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
          onDrop={e => { e.preventDefault(); setDragging(false); if (canDrop) actions.onFile(e.dataTransfer.files[0]); }}
          className="group/drop flex min-h-0 flex-1 p-4"
        >
          {actions.reply ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-lg border p-4 text-sm">
              <p className="ml-auto max-w-[80%] whitespace-pre-wrap rounded-2xl bg-muted px-3 py-2">{actions.reply.question}</p>
              <p className="max-w-[90%] whitespace-pre-wrap leading-relaxed">{actions.reply.answer}</p>
              <Button variant="ghost" size="sm" className="h-7 self-start text-muted-foreground" onClick={actions.clearReply}>Clear</Button>
            </div>
          ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-center transition-colors group-data-dragging/drop:border-foreground group-data-dragging/drop:bg-muted/40">
            <span className="flex size-11 items-center justify-center rounded-full border text-muted-foreground transition-colors group-data-dragging/drop:text-foreground">
              <FileUpIcon className="size-5" />
            </span>
            <div className="space-y-1">
              <p className="text-base font-medium">{dragging ? 'Drop to create a draft' : 'Drop a new policy file here'}</p>
              <p className="text-sm text-muted-foreground">or describe the change below · PDF, TXT, Markdown</p>
            </div>
          </div>
          )}
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
