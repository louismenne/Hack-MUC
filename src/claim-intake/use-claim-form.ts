import { useCallback, useRef, useState } from 'react';
import { applyPrefill as applyPrefillTo, applyVoiceAnswer as applyVoiceAnswerTo, confirmAiValue, initialFormState, setValue as setValueIn, type FormState, type Prefill, type VoiceOutcome } from './form-state.js';
import type { FormValues } from './validation.js';

/** React wrapper around the pure form state in form-state.ts. */
export function useClaimForm() {
  const [state, setStateRaw] = useState(initialFormState);
  // The voice agent calls tools one after another; each call must see the result of the previous one,
  // so the latest state is also kept in a ref that is updated synchronously.
  const latest = useRef<FormState>(state);
  const setState = useCallback((update: (s: FormState) => FormState) => {
    latest.current = update(latest.current);
    setStateRaw(latest.current);
  }, []);
  const setValue = useCallback((key: string, value: string) => setState(s => setValueIn(s, key, value)), [setState]);
  const confirmAi = useCallback((key: string) => setState(s => confirmAiValue(s, key)), [setState]);
  /** Fills empty fields from AI-extracted values and marks them "Filled by AI, please check". */
  const applyPrefill = useCallback((prefill: Prefill) => setState(s => applyPrefillTo(s, prefill).state), [setState]);
  const reset = useCallback(() => setState(() => initialFormState()), [setState]);
  /** Current values, always up to date (also inside callbacks that outlive a render). */
  const getValues = useCallback((): FormValues => latest.current.values, []);
  /** One voice-agent answer; see applyVoiceAnswer in form-state.ts. */
  const applyVoiceAnswer = useCallback((key: string, value: string): VoiceOutcome => {
    const result = applyVoiceAnswerTo(latest.current, key, value);
    latest.current = result.state;
    setStateRaw(result.state);
    return result.outcome;
  }, []);
  return { values: state.values, aiFilled: state.aiFilled, setValue, confirmAi, applyPrefill, reset, getValues, applyVoiceAnswer };
}
