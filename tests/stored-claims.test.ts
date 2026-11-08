import { describe, expect, it, vi, beforeEach } from 'vitest';
import { checkedDecision, evaluateStoredClaims, type StoredClaim } from '../src/policy-api/stored-claims.js';
import { bundledV2 } from '../src/policy-engine/bundled.js';
import type { PolicyVersionRecord } from '../src/policy-api/types.js';
import type { SupabaseClient } from '@supabase/supabase-js';
const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../src/policy-api/supabase-repo.js', () => ({ createSupabaseRepo: () => ({ list }) }));
const policy = {
  id: 'policy',
  versionLabel: 'official-v2',
  rules: bundledV2.rules,
  status: 'active',
} as PolicyVersionRecord;
const claim = {
  id: 'claim',
  case_id: 'CLM-test',
  case_status: 'open',
  submitted_by: 'handler',
  received_at: '2026-11-07T12:00:00Z',
  attachments: [],
  claim_summary: 'Repair dent',
  claim_type: 'motor_own_damage',
  repair_type: 'bodywork',
  quote_eur: 1200,
  policy_active_on_incident: true,
  incident_report_present: true,
  itemized_quote_present: true,
  injury_reported: false,
  liability_disputed: false,
  duplicate_flag: false,
  evidence_conflict: false,
} as StoredClaim;
const user = { id: 'handler', app_metadata: { hack_muc_role: 'claims_handler' } };
function database(history: unknown[] = [], saveError: unknown = null, claimRow = claim) {
  const claimsQuery = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [claimRow], error: null, count: 1 }).then(resolve),
  };
  const decisionsQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: history, error: null }),
  };
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
    error: saveError,
    data: {
      id: 'decision',
      claim_id: claim.id,
      policy_id: policy.id,
      input_snapshot: args.p_input,
      decision: args.p_decision,
    },
  }));
  const db = { from: vi.fn((table: string) => (table === 'claims' ? claimsQuery : decisionsQuery)), rpc };
  return { db: db as unknown as SupabaseClient, claimsQuery, rpc };
}
beforeEach(() => list.mockResolvedValue([policy]));
describe('server evaluation of submitted claims', () => {
  it('enforces the exact limit, EV precedence, and unknown inputs', () => {
    expect(checkedDecision(policy, claim).recommendation).toBe('routine_processing');
    expect(checkedDecision(policy, { ...claim, quote_eur: 1201 }).recommendation).toBe('human_review');
    expect(
      checkedDecision(policy, {
        ...claim,
        quote_eur: 0,
        repair_type: 'ev_high_voltage_battery',
        itemized_quote_present: false,
      }).recommendation,
    ).toBe('human_review');
    expect(checkedDecision(policy, { ...claim, policy_active_on_incident: null }).recommendation).toBe(
      'request_information',
    );
  });
  it('scopes the admin My claims page without restricting the review queue', async () => {
    const admin = { id: 'admin-user', app_metadata: { hack_muc_role: 'admin' } };
    const mine = database();
    await evaluateStoredClaims(admin, 0, mine.db, undefined, true);
    expect(mine.claimsQuery.eq).toHaveBeenCalledWith('submitted_by', admin.id);
    const queue = database();
    await evaluateStoredClaims(admin, 0, queue.db);
    expect(queue.claimsQuery.eq).not.toHaveBeenCalledWith('submitted_by', admin.id);
  });
  it('rejects invalid policy instead of falling back', () =>
    expect(() => checkedDecision({ ...policy, rules: {} as typeof policy.rules }, claim)).toThrow('invalid'));
  it('scopes handler claims to their owner and saves exact database facts', async () => {
    const { db, claimsQuery, rpc } = database();
    const result = await evaluateStoredClaims(user, 0, db);
    expect(claimsQuery.eq).toHaveBeenCalledWith('submitted_by', 'handler');
    expect(rpc).toHaveBeenCalledWith(
      'save_claim_decision',
      expect.objectContaining({
        p_claim: 'claim',
        p_policy: 'policy',
        p_input: claim,
        p_decision: expect.objectContaining({ recommendation: 'routine_processing' }),
      }),
    );
    expect(result.body.items[0].saved.id).toBe('decision');
  });
  it('does not return an unsaved verdict when persistence rejects stale facts', async () => {
    const { db } = database([], { message: 'Claim changed; refresh' });
    await expect(evaluateStoredClaims(user, 0, db)).rejects.toMatchObject({ status: 409 });
  });
  it('retains a closed claim saved decision without evaluating current rules', async () => {
    const historical = {
      id: 'historical',
      claim_id: claim.id,
      policy_id: 'old',
      decision: { ...checkedDecision(policy, claim), policyVersion: 'historical-v1' },
    };
    const { db, rpc } = database([historical], null, { ...claim, case_status: 'closed' });
    const result = await evaluateStoredClaims(user, 0, db);
    expect(result.body.items[0].saved).toEqual(historical);
    expect(result.body.items[0].needsRecheck).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('refuses to invent a missing closed-claim history', async () => {
    const { db, rpc } = database([], null, { ...claim, case_status: 'closed' });
    await expect(evaluateStoredClaims(user, 0, db)).rejects.toMatchObject({ status: 409 });
    expect(rpc).not.toHaveBeenCalled();
  });
  it('fails closed without an active policy', async () => {
    list.mockResolvedValue([]);
    const { db, rpc } = database();
    await expect(evaluateStoredClaims(user, 0, db)).rejects.toMatchObject({ status: 503 });
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects unassigned accounts', async () => {
    const { db } = database();
    await expect(evaluateStoredClaims({ ...user, app_metadata: {} }, 0, db)).rejects.toMatchObject({ status: 403 });
  });
});

it('uses the explicit closed decision instead of a newer unrelated historical snapshot', async () => {
 const latest = { id: 'newer', decision: { ...checkedDecision(policy, claim), recommendation: 'human_review' } };
 const terminal = { id: 'terminal', decision: { ...checkedDecision(policy, claim), recommendation: 'routine_processing' } };
 const { db, rpc } = database([latest], null, { ...claim, case_status: 'closed', closed_decision_id: 'terminal' });
 const originalFrom = db.from.bind(db);
 const selected: unknown[][] = [];
 db.from = ((table: string) => {
   const query = originalFrom(table) as any;
   if (table === 'claim_decisions') {
     query.eq = vi.fn((...args) => { selected.push(args); return query; });
     query.single = vi.fn(async () => ({ data: terminal, error: null }));
   }
   return query;
 }) as typeof db.from;
 const result = await evaluateStoredClaims(user, 0, db);
 expect(result.body.items[0].saved.id).toBe('terminal');
 expect(selected).toContainEqual(['id', 'terminal']);
 expect(rpc).not.toHaveBeenCalled();
});

it('a targeted evaluation remains scoped to the submitting handler', async () => {
 const { db, claimsQuery } = database();
 await evaluateStoredClaims(user, 0, db, 'specific-claim');
 expect(claimsQuery.eq).toHaveBeenCalledWith('id', 'specific-claim');
 expect(claimsQuery.eq).toHaveBeenCalledWith('submitted_by', user.id);
});
