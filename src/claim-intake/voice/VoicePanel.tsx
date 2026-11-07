import { useMemo, useRef, useState } from 'react';
import { ConversationProvider, useConversationControls, useConversationStatus } from '@elevenlabs/react';
import { Loader2Icon, MicIcon, PhoneOffIcon, SparklesIcon } from 'lucide-react';
import { authenticatedFetch } from '@/lib/supabase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { VoiceOutcome } from '../form-state.js';
import type { FormValues } from '../validation.js';
import { berlinToday } from './today.js';
import { createVoiceTools } from './tools.js';

interface VoicePanelProps {
  getValues: () => FormValues;
  applyAnswer: (key: string, value: string) => VoiceOutcome;
  /** The agent says the interview is over: the page asks the user to review and submit. */
  onFinished: () => void;
}

interface Line { id: string; role: 'user' | 'agent'; text: string }

/** Where the signed URL comes from. The browser never sees the agent ID or the ElevenLabs API key. */
async function fetchSignedUrl(): Promise<string> {
  const response = await authenticatedFetch('/api/voice-session', { method: 'POST' });
  const data = await response.json().catch(() => ({} as { error?: string; signedUrl?: string }));
  if (!response.ok) {
    if (response.status === 403) throw new Error('Your account may not use voice input.');
    throw new Error(typeof data.error === 'string' ? data.error : `Could not start the voice session (HTTP ${response.status}).`);
  }
  if (typeof data.signedUrl !== 'string' || !data.signedUrl.startsWith('wss://')) throw new Error('The voice session answer was not valid.');
  return data.signedUrl;
}

export function VoicePanel(props: VoicePanelProps) {
  const [transcript, setTranscript] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(props);
  latest.current = props;
  // Stable tool object; it always reads the newest props through `latest`.
  const tools = useMemo(() => createVoiceTools(
    { getValues: () => latest.current.getValues(), applyAnswer: (key, value) => latest.current.applyAnswer(key, value) },
    { onFinished: () => latest.current.onFinished() },
  ), []);

  return (
    <ConversationProvider
      clientTools={tools}
      onMessage={message => setTranscript(lines => {
        const id = `${message.role}:${message.response_id ?? message.event_id}`;
        const next: Line = { id, role: message.role, text: message.message };
        return lines.some(l => l.id === id) ? lines.map(l => (l.id === id ? next : l)) : [...lines, next];
      })}
      onError={message => setError(typeof message === 'string' ? message : 'The voice connection had a problem. You can fill in the form yourself.')}
    >
      <VoiceControls transcript={transcript} error={error} setError={setError} clearTranscript={() => setTranscript([])} />
    </ConversationProvider>
  );
}

function VoiceControls({ transcript, error, setError, clearTranscript }: { transcript: Line[]; error: string | null; setError: (e: string | null) => void; clearTranscript: () => void }) {
  const { startSession, endSession } = useConversationControls();
  const { status } = useConversationStatus();
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);
  const connected = status === 'connected';
  const busy = starting || status === 'connecting';

  async function start() {
    setError(null);
    clearTranscript();
    setStarting(true);
    try {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop()); // the SDK opens its own microphone stream
      } catch {
        throw new Error('The microphone is blocked or missing. Allow microphone access in your browser, or fill in the form yourself.');
      }
      const signedUrl = await fetchSignedUrl();
      await startSession({ signedUrl, dynamicVariables: { today: berlinToday() } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the voice session.');
    } finally {
      setStarting(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2"><SparklesIcon className="size-4" aria-hidden /> Fill in by voice <Badge variant="secondary">AI assistant</Badge></CardTitle>
        <CardDescription>
          Talk to an AI assistant (German or English). It asks the questions and fills in the form for you. You check everything and submit yourself.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!connected && (
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 size-4" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            <span>
              I understand that I am talking to an <strong>AI assistant</strong> and agree that my voice and answers are processed by an AI voice service (ElevenLabs) for this demo. I will only use test data.
              <span className="mt-1 block text-xs text-muted-foreground">Ich spreche mit einem KI-Assistenten; meine Stimme und Antworten werden in dieser Demo von einem KI-Sprachdienst (ElevenLabs) verarbeitet. Nur Testdaten verwenden.</span>
            </span>
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {connected ? (
            <Button type="button" variant="outline" onClick={() => void endSession()}><PhoneOffIcon /> End conversation</Button>
          ) : (
            <Button type="button" disabled={!agreed || busy} onClick={() => void start()}>
              {busy ? <Loader2Icon className="animate-spin" /> : <MicIcon />} {busy ? 'Connecting…' : 'Start voice conversation'}
            </Button>
          )}
          <span role="status" className="text-sm text-muted-foreground">
            {connected ? 'Connected. Speak now. The form fills in as you answer.' : status === 'error' ? 'The connection failed.' : 'Not connected.'}
          </span>
        </div>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Voice input is not available</AlertTitle>
            <AlertDescription>{error} You can always fill in the form below by hand.</AlertDescription>
          </Alert>
        )}

        {transcript.length > 0 && (
          <ol aria-label="Conversation" className="flex max-h-56 flex-col gap-1.5 overflow-auto rounded-lg border bg-muted/30 p-3 text-sm">
            {transcript.map(line => (
              <li key={line.id}><span className="font-medium">{line.role === 'agent' ? 'Assistant' : 'You'}:</span> {line.text}</li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
