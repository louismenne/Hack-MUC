import { useEffect, useMemo, useRef, useState } from 'react';
import { ConversationProvider, useConversationControls, useConversationStatus } from '@elevenlabs/react';
import { authenticatedFetch } from '@/lib/supabase';
import { Button } from '@/components/ui/button';

export type ClientTools = Record<string, (params: unknown) => string | Promise<string>>;
import { voiceError } from './protocol';
export { voiceError, voiceResult } from './protocol';

export function VoiceAssistant({ purpose, title, tools }: { purpose: 'review' | 'policy'; title: string; tools: ClientTools }) {
  const latest = useRef(tools);
  latest.current = tools;
  const stable = useMemo(() => Object.fromEntries(Object.keys(tools).map(name => [name, async (params: unknown) => {
    try { return await latest.current[name](params); } catch (e) { return voiceError(e); }
  }])), []);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<{ role: string; text: string }[]>([]);
  return <section className="rounded-lg border bg-muted/20 p-3 space-y-3" aria-label={title}>
    <ConversationProvider clientTools={stable} onError={e => setError(String(e))} onMessage={m => setLines(old => [...old, { role: m.role, text: m.message }])}>
      <Controls purpose={purpose} title={title} onError={setError} onStart={() => { setError(''); setLines([]); }} />
    </ConversationProvider>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {lines.length > 0 && <ol aria-label="Conversation" className="max-h-40 overflow-auto text-sm space-y-1">{lines.map((line, i) => <li key={i}><strong>{line.role === 'agent' ? 'Assistant' : 'You'}:</strong> {line.text}</li>)}</ol>}
  </section>;
}
function Controls({ purpose, title, onError, onStart }: { purpose: string; title: string; onError: (s: string) => void; onStart: () => void }) {
  const { startSession, endSession } = useConversationControls();
  const { status } = useConversationStatus();
  const controls = useRef({ endSession });
  controls.current = { endSession };
  useEffect(() => () => { void controls.current.endSession(); }, []);
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function start() {
    onStart(); setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      const res = await authenticatedFetch(`/api/voice-session?purpose=${purpose}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not start voice session.');
      if (typeof data.signedUrl !== 'string' || !data.signedUrl.startsWith('wss://')) throw new Error('Invalid voice session response.');
      if (!mounted.current) return;
      await startSession({ signedUrl: data.signedUrl });
      if (!mounted.current) await endSession();
    } catch (e) { if (mounted.current) onError(e instanceof Error ? e.message : 'Voice unavailable.'); }
    finally { if (mounted.current) setStarting(false); }
  }
  const connected = status === 'connected';
  return <>
    <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{title}</span>
      {connected ? <Button type="button" size="sm" variant="outline" onClick={() => void endSession()}>End conversation</Button> : <Button type="button" size="sm" variant="outline" disabled={!agreed || starting || status === 'connecting'} onClick={() => void start()}>{starting || status === 'connecting' ? 'Connecting…' : 'Start voice'}</Button>}
    </div>
    {!connected && <label className="flex gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />I agree to send my voice and selected page context to ElevenLabs for this AI demo. Use test data only.</label>}
    <span className="sr-only" role="status">{status}</span>
  </>;
}
