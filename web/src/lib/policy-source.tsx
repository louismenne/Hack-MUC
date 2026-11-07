import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { policyApi } from '@/components/policy/api';
import { bundledHistory } from '../../../src/policy-engine/bundled';
import { policyHistoryFrom, validatePolicy, type PolicyHistory } from '../../../src/policy-engine';

/**
 * Where the app's decisions come from: the ACTIVE policy version stored in Supabase (via /api/policy).
 * Only if that cannot be loaded does it fall back to the copy of policies/*.rules.json bundled with the app,
 * and then says so (origin: 'bundled').
 */
export interface PolicySource {
  history: PolicyHistory;
  origin: 'supabase' | 'bundled';
  /** Why the bundled copy is used, or why the last refresh failed. */
  problem?: string;
}

/** Fired after a version was activated in the Policy tab, so the review queue re-evaluates immediately. */
export const POLICY_CHANGED_EVENT = 'hackmuc:policy-changed';

const Context = createContext<PolicySource | null>(null);
export const usePolicySource = (): PolicySource => {
  const source = useContext(Context);
  if (!source) throw new Error('usePolicySource must be used inside <PolicySourceProvider>.');
  return source;
};

async function fetchHistory(): Promise<PolicyHistory> {
  const { versions } = await policyApi.overview();
  const history = policyHistoryFrom(versions);
  for (const p of [history.active, history.previous, history.original]) {
    const checked = validatePolicy(p.rules);
    if (!checked.ok) throw new Error(`Policy ${p.label} is invalid: ${checked.errors[0]}`);
  }
  return history;
}

export function PolicySourceProvider({ children }: { children: ReactNode }) {
  const [source, setSource] = useState<PolicySource | null>(null);

  const load = useCallback(async () => {
    try {
      setSource({ history: await fetchHistory(), origin: 'supabase' });
    } catch (error) {
      const problem = error instanceof Error ? error.message : String(error);
      // First load: use the bundled copy. Later refresh: keep what we had and report the problem.
      setSource(previous => (previous ? { ...previous, problem } : { history: bundledHistory, origin: 'bundled', problem }));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onChanged = () => { void load(); };
    window.addEventListener(POLICY_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(POLICY_CHANGED_EVENT, onChanged);
  }, [load]);

  if (!source) return <div className="grid min-h-svh place-items-center text-sm text-muted-foreground" role="status">Loading the active policy…</div>;
  return <Context.Provider value={source}>{children}</Context.Provider>;
}
