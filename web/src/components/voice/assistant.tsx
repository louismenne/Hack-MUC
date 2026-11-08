import { useEffect, useMemo, useRef, useState } from 'react';
import { ConversationProvider, useConversationControls, useConversationStatus } from '@elevenlabs/react';
import { Loader2Icon, MicIcon, PhoneOffIcon } from 'lucide-react';
import { authenticatedFetch } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { voiceError } from './protocol';
export { voiceError, voiceResult } from './protocol';

export type ClientTools = Record<string, (params: unknown) => string | Promise<string>>;
interface Props {
  purpose: 'intake' | 'review' | 'policy';
  title: string;
  description?: string;
  tools: ClientTools;
  dynamicVariables?: Record<string, string>;
}

/** A single contextual action; connection controls and transcript appear only when needed. */
export function VoiceAssistant({ tools, ...props }: Props) {
  const latest = useRef(tools);
  latest.current = tools;
  const stable = useMemo(() => Object.fromEntries(Object.keys(tools).map(name => [name, async (params: unknown) => {
    try { return await latest.current[name](params); } catch (e) { return voiceError(e); }
  }])), []);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<{ id: string; role: string; text: string }[]>([]);
  return <ConversationProvider clientTools={stable} onError={e => setError(String(e))} onMessage={m => setLines(old => {
    const line = { id: `${m.role}:${m.response_id ?? m.event_id}`, role: m.role, text: m.message };
    return old.some(l => l.id === line.id) ? old.map(l => l.id === line.id ? line : l) : [...old, line];
  })}>
    <Controls {...props} error={error} lines={lines} onError={setError} onStart={() => { setError(''); setLines([]); }} />
  </ConversationProvider>;
}

function Controls({ purpose, title, description, dynamicVariables, error, lines, onError, onStart }: Omit<Props, 'tools'> & {
  error: string; lines: { id: string; role: string; text: string }[]; onError: (s: string) => void; onStart: () => void;
}) {
  const { startSession, endSession } = useConversationControls();
  const { status } = useConversationStatus();
  const controls = useRef({ endSession });
  controls.current = { endSession };
  useEffect(() => () => { void controls.current.endSession(); }, []);
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const active = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current = false; }; }, []);

  async function start() {
    if (active.current) return;
    active.current = true;
    onStart(); setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      if (!mounted.current || !active.current) return;
      const res = await authenticatedFetch(`/api/voice-session?purpose=${purpose}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not start voice session.');
      if (typeof data.signedUrl !== 'string' || !data.signedUrl.startsWith('wss://')) throw new Error('Invalid voice session response.');
      if (!mounted.current || !active.current) return;
      await startSession({ signedUrl: data.signedUrl, dynamicVariables });
      if (!mounted.current || !active.current) await endSession();
    } catch (e) { if (mounted.current && active.current) onError(e instanceof DOMException && ['NotAllowedError', 'NotFoundError', 'NotReadableError'].includes(e.name) ? 'Microphone access is unavailable. Allow microphone access in your browser or continue by typing.' : e instanceof Error ? e.message : 'Voice is unavailable. Please try again.'); }
    finally { if (mounted.current) setStarting(false); active.current = false; }
  }
  const connected = status === 'connected';
  const busy = starting || status === 'connecting';
  return <Popover open={open} onOpenChange={value => {
    setOpen(value);
    if (!value) { active.current = false; void endSession(); }
  }}>
    <PopoverTrigger asChild>
      <Button type="button" size="sm" variant="outline" className="shrink-0 gap-2" onClick={() => { if (!open && !connected && !busy) void start(); }}>
        {busy ? <Loader2Icon className="size-4 animate-spin" /> : <MicIcon className="size-4" />}{title}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] gap-3 p-4">
      <div><p className="font-medium">{title}</p><p className="mt-1 text-xs text-muted-foreground">{description ?? 'Speak naturally. The AI assistant helps you prepare your work in English.'}</p></div>
      <p role="status" className="text-sm text-muted-foreground">{connected ? 'Listening. Speak when you are ready.' : busy ? 'Connecting to your voice assistant…' : error ? 'Voice could not connect.' : 'Conversation ended.'}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {lines.length > 0 && <ol aria-label="Conversation" className="max-h-56 space-y-2 overflow-auto rounded border p-3 text-sm">{lines.map(line => <li key={line.id}><strong>{line.role === 'agent' ? 'Assistant' : 'You'}:</strong> {line.text}</li>)}</ol>}
      {connected || busy ? <Button type="button" size="sm" variant="outline" onClick={() => { active.current = false; void endSession(); setOpen(false); }}><PhoneOffIcon />End conversation</Button> : <Button type="button" size="sm" onClick={() => void start()}><MicIcon />Try again</Button>}
      <p className="text-[11px] text-muted-foreground">AI voice powered by ElevenLabs.</p>
    </PopoverContent>
  </Popover>;
}
