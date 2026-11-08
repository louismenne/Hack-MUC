import { describe, expect, it, vi } from 'vitest';
import { permissions, roleOf, roles, appPages, canAccessPage } from '../src/roles.js';
import { handlePolicyRequest } from '../src/policy-api/http.js';
import { setTeamRole, createTeamAdmin } from '../src/policy-api/team.js';
import type { AuthUser } from '../src/policy-api/auth.js';
const user: AuthUser = { id: 'actor', email_confirmed_at: '2026-11-07', invited_at: '2026-11-07', app_metadata: {} };

describe('role boundaries', () => {
  it('fails closed for missing, unknown and user-editable roles', () => {
    for (const candidate of [user, { ...user, app_metadata: { hack_muc_role: 'owner' } }, { ...user, user_metadata: { hack_muc_role: 'admin' } }]) {
      expect(roleOf(candidate)).toBeNull();
      expect(Object.values(permissions(candidate)).every(p => !p)).toBe(true);
    }
  });
  it('separates claim review, policy management and administration', () => {
    expect(roles.map(role => permissions({ app_metadata: { hack_muc_role: role } }))).toEqual([
      { upload: true, review: false, policy: false, team: false },
      { upload: true, review: true, policy: false, team: false },
      { upload: false, review: false, policy: true, team: false },
      { upload: true, review: true, policy: true, team: true },
    ]);
  });
  it('rejects every policy mutation and AI call for handlers, reviewers and unassigned users before loading dependencies', async () => {
    const deps = vi.fn();
    for (const role of [null, 'claims_handler', 'reviewer']) {
      const auth = async () => ({ ...user, app_metadata: { hack_muc_role: role } });
      for (const action of ['create_draft', 'update_draft', 'discard_draft', 'activate', 'impact']) {
        const request = new Request('https://app.test/api/policy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, role: 'admin' }) });
        expect((await handlePolicyRequest(request, 'policy', deps, auth)).status).toBe(403);
      }
      expect((await handlePolicyRequest(new Request('https://app.test/api/policy-ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), 'ai', deps, auth)).status).toBe(403);
    }
    expect(deps).not.toHaveBeenCalled();
  });
  it('prevents non-admins listing members or assigning roles', async () => {
    for (const role of [null, 'claims_handler', 'reviewer', 'policy_manager']) {
      const auth = async () => ({ ...user, app_metadata: { hack_muc_role: role } });
      expect((await handlePolicyRequest(new Request('https://app.test/api/policy?view=team'), 'policy', vi.fn(), auth)).status).toBe(403);
      expect((await handlePolicyRequest(new Request('https://app.test/api/policy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'set_role', userId: 'actor', role: 'admin' }) }), 'policy', vi.fn(), auth)).status).toBe(403);
    }
  });
  it('sends the verified actor to the atomic, audited role RPC', async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    const db = { rpc } as unknown as NonNullable<Parameters<typeof setTeamRole>[2]>;
    await setTeamRole(user, { userId: 'target', role: 'reviewer' }, db);
    expect(rpc).toHaveBeenCalledWith('set_team_role', { p_actor: 'actor', p_user: 'target', p_role: 'reviewer' });
    await expect(setTeamRole(user, { userId: 'actor', role: 'reviewer' }, db)).rejects.toMatchObject({ status: 400 });
    await expect(setTeamRole(user, { userId: 'target', role: 'owner' }, db)).rejects.toMatchObject({ status: 400 });
  });
});


describe('role-specific navigation and direct-route access', () => {
  it.each([
    ['claims_handler', ['my-claims']],
    ['reviewer', ['queue']],
    ['policy_manager', ['queue', 'quality', 'policy', 'examples', 'example-quality']],
    ['admin', appPages.filter(page => page !== 'my-claims')],
    [null, []],
  ] as const)('%s can only open its permitted pages', (role, expected) => {
    expect(appPages.filter(page => canAccessPage(role, page))).toEqual(expected);
  });
});
