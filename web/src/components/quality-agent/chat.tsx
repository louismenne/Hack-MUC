import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEffect, useRef, useState } from 'react';
import { ArrowRightIcon, ArrowUpIcon, Loader2Icon, SparklesIcon, SquareIcon, SquarePenIcon, XIcon } from 'lucide-react';
import type { AgentEvent, ChatMessage, QueryTrace as Trace } from '../../../../src/quality-agent/agent';
import { authenticatedFetch } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { QueryTrace } from './query-trace';

interface Turn { question: string; answer: string; traces: Trace[]; error?: string }
const starters = [
  { label: 'Run a quality scan', prompt: 'Run a systematic quality scan. Find the three strongest patterns worth investigating, with evidence and limitations.' },
  { label: 'Where do reviewers override most?', prompt: 'Where do reviewers override the engine most often? Check sample sizes and look at representative cases.' },
  { label: 'Quotes near the policy limit', prompt: 'Investigate quotes near the active policy limit. Are reviewer corrections concentrated there?' },
];
const prose = 'text-sm leading-relaxed break-words [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.8em] [&_h1]:mt-4 [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&>*:first-child]:mt-0 [&_table]:w-full [&_table]:text-xs [&_td]:border-t [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:text-muted-foreground';
// Wide agent tables scroll inside the panel instead of stretching it.
const markdownComponents: Components = {
  table: ({ node: _node, ...props }) => <div className="my-3 overflow-x-auto rounded-lg border"><table {...props} /></div>,
};

/** Chat with the quality agent, laid out for the narrow right-hand panel. Stays mounted while collapsed so the conversation survives. */
export function QualityAgentChat({ active, onClose, onBusyChange }: { active: boolean; onClose: () => void; onBusyChange?: (busy: boolean) => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [configuration, setConfiguration] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  // Follow new output only while the reader is at the bottom; scrolling up to read stops the follow.
  const follow = useRef(true);
  useEffect(() => {
    let alive = true;
    void authenticatedFetch('/api/quality-chat').then(async response => {
      const data = await response.json();
      if (alive) setConfiguration(!response.ok ? data.error : !data.aiAvailable ? 'ANTHROPIC_API_KEY is missing on the server.' : !data.sqlAvailable ? 'SUPABASE_MANAGEMENT_TOKEN is missing on the server.' : null);
    }).catch(() => { if (alive) setConfiguration('Could not reach the quality-agent API.'); });
    return () => { alive = false; abort.current?.abort(); };
  }, []);
  useEffect(() => { if (follow.current) log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }); }, [turns]);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => field.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [active]);
  // After an answer, return to the input unless the reader has moved on to the page meanwhile.
  useEffect(() => {
    const el = field.current;
    if (busy || !el || document.activeElement !== document.body && !el.closest('[data-agent-panel]')?.contains(document.activeElement)) return;
    el.focus({ preventScroll: true });
  }, [busy]);
  const update = (fn: (turn: Turn) => Turn) => setTurns(old => old.map((turn, i) => i === old.length - 1 ? fn(turn) : turn));
  const send = async (question: string) => {
    if (busy || !question.trim() || configuration) return;
    // Failed/incomplete turns are not sent as fabricated assistant answers.
    const history: ChatMessage[] = turns.filter(t => t.answer && !t.error).slice(-7).flatMap(t => [{ role: 'user', content: t.question }, { role: 'assistant', content: t.answer }]);
    history.push({ role: 'user', content: question.trim() });
    const controller = new AbortController();
    abort.current = controller;
    follow.current = true;
    setTurns(old => [...old, { question: question.trim(), answer: '', traces: [] }]);
    setInput(''); setBusy(true);
    let answered = false;
    const apply = (event: AgentEvent) => {
      if (event.type === 'answer') { answered = true; update(t => ({ ...t, answer: event.text })); }
      else if (event.type === 'error') update(t => ({ ...t, error: event.message }));
      else update(t => ({ ...t, traces: [...t.traces.filter(q => q.id !== event.trace.id), event.trace] }));
    };
    try {
      const response = await authenticatedFetch('/api/quality-chat', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error ?? 'Could not start investigation.'); }
      if (!response.body || !response.headers.get('content-type')?.includes('application/x-ndjson')) throw new Error('Unexpected response from the agent.');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
          const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
          for (const line of lines) if (line.trim()) apply(JSON.parse(line));
          if (done) { if (buffer.trim()) apply(JSON.parse(buffer)); break; }
        }
      } finally { reader.releaseLock(); }
      if (!answered) update(t => ({ ...t, error: t.error ?? 'The investigation ended without an answer. Try a narrower question.' }));
    } catch (error) {
      update(t => ({ ...t, error: controller.signal.aborted ? 'Stopped.' : error instanceof Error ? error.message : 'Investigation failed.' }));
    } finally { abort.current = null; setBusy(false); }
  };
  const newChat = () => { setTurns([]); field.current?.focus(); };
  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex h-12 shrink-0 items-center gap-1 border-b pr-2 pl-4">
      <SparklesIcon aria-hidden className="mr-1 size-4 text-muted-foreground" />
      <h2 id="quality-agent-title" className="flex-1 text-sm font-medium">Assistant</h2>
      {turns.length > 0 && <Button variant="ghost" size="icon-sm" disabled={busy} onClick={newChat} aria-label="New chat" title="New chat"><SquarePenIcon /></Button>}
      <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close assistant" title="Close (Esc)"><XIcon /></Button>
    </div>

    <div ref={log} onScroll={e => { const el = e.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
      {configuration && <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{configuration}</p>}
      {!turns.length ? (
        <div className="flex min-h-full flex-col justify-center gap-5">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-muted"><SparklesIcon aria-hidden className="size-4.5" /></span>
            <p className="text-xl font-normal tracking-[-0.02em]">What should I look into?</p>
          </div>
          <div className="flex flex-col gap-1.5">
            {starters.map(starter => (
              <button key={starter.label} title={starter.prompt} disabled={!!configuration} onClick={() => void send(starter.prompt)}
                className="group flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50">
                <span className="flex-1">{starter.label}</span>
                <ArrowRightIcon aria-hidden className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div role="log" aria-label="Assistant conversation" className="flex flex-col gap-8">
          {turns.map((turn, i) => <article key={i} className="flex flex-col gap-3">
            <div className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-sm whitespace-pre-wrap">{turn.question}</div>
            {turn.traces.length > 0 && <div className="flex flex-col gap-1">{turn.traces.map(trace => <QueryTrace key={trace.id} trace={trace} />)}</div>}
            {turn.answer && <div className={prose}><Markdown skipHtml remarkPlugins={[remarkGfm]} components={markdownComponents}>{turn.answer}</Markdown></div>}
            {turn.error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{turn.error}</p>}
            {busy && i === turns.length - 1 && !turn.answer && !turn.error && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon aria-hidden className="size-3.5 animate-spin" />{turn.traces.length ? 'Analysing evidence…' : 'Thinking…'}
            </p>}
          </article>)}
        </div>
      )}
    </div>

    <form className="shrink-0 px-3 pb-3" onSubmit={e => { e.preventDefault(); void send(input); }}>
      <div className="rounded-2xl border bg-muted/40 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30 has-disabled:opacity-60">
        <label htmlFor="quality-question" className="sr-only">Ask the assistant</label>
        <textarea ref={field} id="quality-question" value={input} maxLength={4000} rows={1} disabled={busy || !!configuration}
          onChange={e => setInput(e.target.value)} placeholder={busy ? 'Investigating…' : 'Ask about claim quality…'}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(input); } }}
          className="block field-sizing-content max-h-48 min-h-10 w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed" />
        <div className="flex justify-end px-2 pb-2">
          {busy
            ? <Button type="button" size="icon-sm" variant="secondary" className="rounded-full" onClick={() => abort.current?.abort()} aria-label="Stop investigation" title="Stop"><SquareIcon className="size-3 fill-current" /></Button>
            : <Button type="submit" size="icon-sm" className="rounded-full" disabled={!input.trim() || !!configuration} aria-label="Send" title="Send (Enter)"><ArrowUpIcon /></Button>}
        </div>
      </div>
    </form>
  </div>;
}
