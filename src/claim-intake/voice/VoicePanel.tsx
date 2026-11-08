import { useMemo, useRef } from 'react';
import { VoiceAssistant } from '@/components/voice/assistant';
import type { VoiceOutcome } from '../form-state.js';
import type { FormValues } from '../validation.js';
import { berlinToday } from './today.js';
import { createVoiceTools } from './tools.js';

interface VoicePanelProps {
  getValues: () => FormValues;
  applyAnswer: (key: string, value: string) => VoiceOutcome;
  onFinished: () => void;
}

export function VoicePanel(props: VoicePanelProps) {
  const latest = useRef(props);
  latest.current = props;
  const tools = useMemo(() => createVoiceTools(
    { getValues: () => latest.current.getValues(), applyAnswer: (key, value) => latest.current.applyAnswer(key, value) },
    { onFinished: () => latest.current.onFinished() },
  ), []);
  return <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded border bg-muted/30 p-4">
    <VoiceAssistant purpose="intake" title="Use voice to file your claim" description="Answer a few short questions in English. Your answers appear in the form for you to review and submit." tools={tools} dynamicVariables={{ today: berlinToday() }} />
    <p className="text-sm text-muted-foreground">Tell us what happened instead of typing every answer.</p>
  </div>;
}
