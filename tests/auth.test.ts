import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthenticator, requireTeamMember, type AuthUser } from '../src/policy-api/auth.js';
import { handlePolicyRequest } from '../src/policy-api/http.js';
import { memoryRepo } from './support/memory-repo.js';
import { bundledV1 } from '../src/policy-engine/bundled.js';
import type { ApiDeps } from '../src/policy-api/handlers.js';

const user: AuthUser = { id: 'member-id', email: 'member@example.test', email_confirmed_at: '2026-11-07', invited_at: '2026-11-07', app_metadata: { hack_muc_role: 'policy_manager' } };
afterEach(() => vi.unstubAllGlobals());

describe('team authorization', () => {
  it('allows verified invited users and explicit admin grants', () => {
    expect(requireTeamMember(user)).toBe(user);
    expect(requireTeamMember({ ...user, invited_at: undefined, app_metadata: { hack_muc_access: true } }).id).toBe(user.id);
  });
  it('rejects public signups, anonymous users, unconfirmed email and forged user metadata', () => {
    for (const invalid of [
      { ...user, invited_at: undefined },
      { ...user, is_anonymous: true },
      { ...user, email_confirmed_at: undefined },
      { ...user, invited_at: undefined, user_metadata: { hack_muc_access: true } },
    ]) expect(() => requireTeamMember(invalid)).toThrow('not been invited');
  });
  it('rejects missing and malformed bearer tokens without touching the backend', async () => {
    const makeDeps = vi.fn();
    for (const kind of ['policy', 'ai'] as const) {
      for (const method of ['GET', 'POST']) {
        const response = await handlePolicyRequest(new Request('https://app.test/api/policy', { method }), kind, makeDeps);
        expect(response.status).toBe(401);
      }
    }
    expect(makeDeps).not.toHaveBeenCalled();
    await expect(createAuthenticator()(new Request('https://app.test', { headers: { authorization: 'Basic fake' } }))).rejects.toMatchObject({ status: 401 });
  });
  it('verifies the bearer token against Supabase Auth, rejecting invalid tokens', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ message: 'Invalid JWT', error_code: 'bad_jwt' }), { status: 401, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    await expect(createAuthenticator()(new Request('https://app.test', { headers: { authorization: 'Bearer fake.jwt.token' } }))).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalled();
  });
  it('uses current server-verified invitation metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(user), { headers: { 'content-type': 'application/json' } })));
    const verified = await createAuthenticator()(new Request('https://app.test', { headers: { authorization: 'Bearer valid-token' } }));
    expect(verified.id).toBe(user.id);
  });
  it('does not trust a caller-supplied policy creator', async () => {
    const repo = memoryRepo(bundledV1.rules);
    const createDraft = vi.spyOn(repo, 'createDraft');
    const deps: ApiDeps = { repo, loadCases: () => [], ai: null, aiModel: 'test' };
    const request = new Request('https://app.test/api/policy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create_draft', createdBy: 'forged', rules: bundledV1.rules }) });
    const response = await handlePolicyRequest(request, 'policy', () => deps, async () => user);
    expect(response.status).toBe(201);
    expect(createDraft).toHaveBeenCalledWith(expect.objectContaining({ createdBy: 'member-id' }));
  });
});
