import { useCallback, useState } from 'react';
import { applyPrefill as applyPrefillTo, confirmAiValue, initialFormState, setValue as setValueIn, type Prefill } from './form-state.js';

/** React wrapper around the pure form state in form-state.ts. */
export function useClaimForm() {
  const [state, setState] = useState(initialFormState);
  const setValue = useCallback((key: string, value: string) => setState(s => setValueIn(s, key, value)), []);
  const confirmAi = useCallback((key: string) => setState(s => confirmAiValue(s, key)), []);
  /** Fills empty fields from AI-extracted values and marks them "Filled by AI, please check". */
  const applyPrefill = useCallback((prefill: Prefill) => setState(s => applyPrefillTo(s, prefill).state), []);
  const reset = useCallback(() => setState(initialFormState()), []);
  return { values: state.values, aiFilled: state.aiFilled, setValue, confirmAi, applyPrefill, reset };
}
