import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { evaluatePolicyDocument } from '../policy-engine/engine.js';
import { validatePolicy } from '../policy-engine/schema.js';
import { reviewQuoteLimit } from '../policy-engine/reporting.js';
import { roleOf } from '../roles.js';
import type { AuthUser } from './auth.js';
import { ApiError } from './handlers.js';
import { computeImpact } from './impact.js';
import type { PolicyVersionRecord } from './types.js';
import { createSupabaseRepo } from './supabase-repo.js';

export function serviceClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY)
    throw new ApiError(503, 'Supabase is not configured.');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export type StoredClaim = Record<string, unknown> & {
  id: string;
  case_id: string;
  case_status: string;
  closed_decision_id?: string | null;
  revision?: number;
  submitted_by: string;
  received_at: string;
  attachments: { path: string; name: string }[];
};
export type SavedDecision = {
  id: string;
  claim_id: string;
  policy_id: string;
  input_snapshot: StoredClaim;
  decision: ReturnType<typeof evaluatePolicyDocument>;
  created_at: string;
};
export type StoredQueueItem = {
  claim: StoredClaim;
  saved: SavedDecision;
  previous: SavedDecision | null;
  initial: SavedDecision;
  initialQuoteLimit: number | null;
  needsRecheck: boolean;
};
export const claimStrings = (claim: StoredClaim): Record<string, string> =>
  Object.fromEntries(Object.entries(claim).map(([k, v]) => [k, v == null ? '' : String(v)]));

export function checkedDecision(policy: PolicyVersionRecord, claim: StoredClaim) {
  const checked = validatePolicy(policy.rules);
  if (!checked.ok) throw new ApiError(503, 'The active policy is invalid; processing is disabled.');
  return evaluatePolicyDocument(checked.policy, policy.versionLabel, claim);
}
export async function evaluateStoredClaims(user: AuthUser, offset: number, db = serviceClient(), claimId?: string) {
  const role = roleOf(user);
  if (!role) throw new ApiError(403, 'A team role is required.');
  let query = db
    .from('claims')
    .select('*', { count: 'exact' })
    .order('received_at', { ascending: false })
    .order('id')
    .range(offset, offset + 49);
  if (claimId) query = query.eq('id', claimId);
  if (role === 'claims_handler') query = query.eq('submitted_by', user.id);
  const [{ data, error, count }, versions] = await Promise.all([
    query,
    createSupabaseRepo(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!).list(),
  ]);
  if (error) throw new ApiError(502, 'Could not load submitted claims.');
  const active = versions.find((v) => v.status === 'active');
  if (!active) throw new ApiError(503, 'No active policy; processing is disabled.');
  const items: StoredQueueItem[] = [];
  const evaluateOne = async (claim: StoredClaim): Promise<StoredQueueItem> => {
    const { data: history, error: historyError } = await db
      .from('claim_decisions')
      .select('*')
      .eq('claim_id', claim.id)
      .order('created_at', { ascending: false })
      .limit(2);
    if (historyError) throw new ApiError(502, 'Could not load saved decisions.');
    const latest = (history as SavedDecision[])[0];
    let saved: SavedDecision;
    if (claim.case_status === 'closed') {
      if (!latest)
        throw new ApiError(
          409,
          `Closed claim ${claim.case_id} has no historical decision; manual migration is required.`,
        );
      if (claim.closed_decision_id && latest.id !== claim.closed_decision_id) {
        const { data: terminal, error: terminalError } = await db.from('claim_decisions').select('*').eq('id', claim.closed_decision_id).eq('claim_id', claim.id).single();
        if (terminalError || !terminal) throw new ApiError(409, 'Closed claim decision is unavailable.');
        saved = terminal as SavedDecision;
      } else saved = latest;
    } else {
      const decision = checkedDecision(active, claim);
      const { data: result, error: saveError } = await db.rpc('save_claim_decision', {
        p_claim: claim.id,
        p_policy: active.id,
        p_input: claim,
        p_decision: decision,
      });
      if (saveError) throw new ApiError(409, `Could not save evaluation: ${saveError.message}`);
      saved = result as SavedDecision;
    }
    const previous = latest?.id !== saved.id ? latest : (history as SavedDecision[])[1];
    const { data: first, error: firstError } = await db
      .from('claim_decisions')
      .select('*')
      .eq('claim_id', claim.id)
      .order('created_at')
      .limit(1);
    if (firstError) throw new ApiError(502, 'Could not load initial decision.');
    const initial = (first as SavedDecision[])[0] ?? saved;
    const initialPolicy = versions.find((v) => v.id === initial.policy_id);

    return {
      claim,
      saved,
      previous: previous ?? null,
      initial,
      initialQuoteLimit: initialPolicy ? reviewQuoteLimit(initialPolicy.rules) : null,
      needsRecheck:
        claim.case_status !== 'closed' &&
        !!previous &&
        previous.decision.recommendation !== saved.decision.recommendation,
    };
  };
  // Bound concurrency to avoid a network waterfall without flooding the database.
  for (let start = 0; start < data.length; start += 5) {
    items.push(...(await Promise.all((data as StoredClaim[]).slice(start, start + 5).map(evaluateOne))));
  }
  return { status: 200, body: { items, total: count ?? 0, activePolicy: active.versionLabel } };
}

export async function storedImpact(
  base: PolicyVersionRecord,
  draft: PolicyVersionRecord,
  db: SupabaseClient = serviceClient(),
) {
  const claims: StoredClaim[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from('claims')
      .select('*')
      .order('id')
      .range(offset, offset + 999);
    if (error) throw new ApiError(502, 'Could not load claims for impact.');
    claims.push(...(data as StoredClaim[]));
    if (data.length < 1000) break;
  }
  const report = computeImpact(base, draft, claims.map(claimStrings));
  for (const row of report.rows.filter((r) => r.frozen)) {
    const claim = claims.find((c) => c.case_id === row.caseId)!;
    let query = db.from('claim_decisions').select('*').eq('claim_id', claim.id);
    if (claim.closed_decision_id) query = query.eq('id', claim.closed_decision_id);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(1);
    if (error || !data?.length) throw new ApiError(409, 'A closed claim has no saved decision.');
    const decision = (data[0] as SavedDecision).decision;
    row.before = row.after = { recommendation: decision.recommendation, ruleId: decision.ruleId };
    row.frozenWouldChange = checkedDecision(draft, claim).recommendation !== decision.recommendation;
  }
  report.totals.frozenWouldChange = report.rows.filter((r) => r.frozenWouldChange).length;
  return report;
}
