import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/policy-api/handlers.js';
import type { AuthUser } from '../src/policy-api/auth.js';
import { handleVoiceSession } from '../src/policy-api/voice-session.js';

const KEY = 'sk_test_SECRET_KEY_123';
const AGENT = 'agent_test_1234567890abcdef';
const SIGNED = 'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_test&conversation_signature=SIG';
const env = { ELEVENLABS_API_KEY: KEY, ELEVENLABS_AGENT_ID: AGENT };

const member = (role: string | null): AuthUser => ({
  id: 'user-1', email: 'anna@example.com', email_confirmed_at: '2026-11-01T00:00:00Z', is_anonymous: false, invited_at: '2026-11-01T00:00:00Z',
  app_metadata: role ? { hack_muc_role: role } : {},
});
const asUser = (role: string | null = 'claims_handler') => async () => member(role);
const post = () => new Request('http://localhost/api/voice-session', { method: 'POST', headers: { authorization: 'Bearer x' } });
const upstream = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

afterEach(() => vi.restoreAllMocks());

describe('POST /api/voice-session', () => {
  it('returns a signed URL and asks ElevenLabs with the server-side key and agent ID', async () => {
    const fetchImpl = upstream(200, { signed_url: SIGNED });
    const res = await handleVoiceSession(post(), { authenticate: asUser(), env, fetchImpl });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signedUrl: SIGNED });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${AGENT}`);
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe(KEY);
  });
  it('never sends the API key or the agent ID to the browser, and is not cacheable', async () => {
    const res = await handleVoiceSession(post(), { authenticate: asUser(), env, fetchImpl: upstream(200, { signed_url: SIGNED }) });
    const text = await res.clone().text();
    expect(text).not.toContain(KEY);
    expect(text).not.toContain(AGENT);
    expect(JSON.stringify([...res.headers])).not.toContain(KEY);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  describe('who may use it (same rule as submitting a claim)', () => {
    it.each(['claims_handler', 'reviewer', 'admin'])('role %s: allowed', async role => {
      const res = await handleVoiceSession(post(), { authenticate: asUser(role), env, fetchImpl: upstream(200, { signed_url: SIGNED }) });
      expect(res.status).toBe(200);
    });
    it.each(['policy_manager', null])('role %s: 403 and ElevenLabs is not called', async role => {
      const fetchImpl = upstream(200, { signed_url: SIGNED });
      const res = await handleVoiceSession(post(), { authenticate: asUser(role), env, fetchImpl });
      expect(res.status).toBe(403);
      expect(fetchImpl).not.toHaveBeenCalled();
    });
    it('no login: 401 and ElevenLabs is not called', async () => {
      const fetchImpl = upstream(200, { signed_url: SIGNED });
      const res = await handleVoiceSession(post(), { authenticate: async () => { throw new ApiError(401, 'Please sign in.'); }, env, fetchImpl });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Please sign in.' });
      expect(fetchImpl).not.toHaveBeenCalled();
    });
    it('a real request without a token is rejected by the default authenticator', async () => {
      const fetchImpl = upstream(200, { signed_url: SIGNED });
      const res = await handleVoiceSession(new Request('http://localhost/api/voice-session', { method: 'POST' }), { env, fetchImpl });
      expect(res.status).toBe(401);
      expect(fetchImpl).not.toHaveBeenCalled();
    });
    it('only POST is accepted', async () => {
      for (const method of ['GET', 'PUT', 'DELETE']) {
        const res = await handleVoiceSession(new Request('http://localhost/api/voice-session', { method }), { authenticate: asUser(), env, fetchImpl: upstream(200) });
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toBe('POST');
      }
    });
  });

  describe('configuration and ElevenLabs problems are reported clearly', () => {
    it.each([[{}], [{ ELEVENLABS_API_KEY: KEY }], [{ ELEVENLABS_AGENT_ID: AGENT }], [{ ELEVENLABS_API_KEY: '  ', ELEVENLABS_AGENT_ID: AGENT }]])('missing configuration %j: 503', async partial => {
      const fetchImpl = upstream(200);
      const res = await handleVoiceSession(post(), { authenticate: asUser(), env: partial, fetchImpl });
      expect(res.status).toBe(503);
      expect((await res.json()).error).toMatch(/not configured/);
      expect(fetchImpl).not.toHaveBeenCalled();
    });
    it.each([401, 403])('ElevenLabs answers %i: reported as a key/permission problem (no retry, no secrets)', async status => {
      const fetchImpl = upstream(status, { detail: { message: `invalid key ${KEY}` } });
      const res = await handleVoiceSession(post(), { authenticate: asUser(), env, fetchImpl });
      const body = await res.json();
      expect(res.status).toBe(502);
      expect(body.upstreamStatus).toBe(status);
      expect(body.error).toContain(`HTTP ${status}`);
      expect(body.error).toMatch(/ElevenAgents: Write/);
      expect(JSON.stringify(body)).not.toContain(KEY);
      expect(fetchImpl).toHaveBeenCalledOnce();
    });
    it('unknown agent', async () => {
      const res = await handleVoiceSession(post(), { authenticate: asUser(), env, fetchImpl: upstream(404) });
      expect(res.status).toBe(502);
      expect((await res.json()).error).toMatch(/ELEVENLABS_AGENT_ID/);
    });
    it('rate limit or credits used up', async () => {
      const res = await handleVoiceSession(post(), { authenticate: asUser(), env, fetchImpl: upstream(429) });
      expect(res.status).toBe(429);
    });
    it('other upstream errors', async () => {
      const res = await handleVoiceSession(post(), { authenticate: asUser(), env, fetchImpl: upstream(500) });
      expect(res.status).toBe(502);
      expect((await res.json()).error).toContain('HTTP 500');
    });
    it.each([[{}], [{ signed_url: 42 }], [{ signed_url: 'https://not-a-websocket' }], [null]])('unexpected answer %j', async body => {
      const res = await handleVoiceSession(post(), { authenticate: asUser(), env, fetchImpl: upstream(200, body) });
      expect(res.status).toBe(502);
    });
    it('network failure', async () => {
      const fetchImpl = vi.fn(async () => { throw new TypeError(`fetch failed for ${KEY}`); });
      const res = await handleVoiceSession(post(), { authenticate: asUser(), env, fetchImpl });
      expect(res.status).toBe(502);
      expect(JSON.stringify(await res.json())).not.toContain(KEY);
    });
    it('timeout', async () => {
      const fetchImpl = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      }));
      const res = await handleVoiceSession(post(), { authenticate: asUser(), env, fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 20 });
      expect(res.status).toBe(504);
    });
    it('an unexpected crash is a generic 500 and logs no secret', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await handleVoiceSession(post(), { authenticate: async () => { throw new Error(`boom ${KEY}`); }, env, fetchImpl: upstream(200) });
      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).not.toContain(KEY);
      expect(JSON.stringify(spy.mock.calls)).not.toContain(KEY);
    });
  });
});


describe('voice assistant selection and role isolation', () => {
  const configured = { ...env, ELEVENLABS_REVIEW_AGENT_ID: 'review-agent', ELEVENLABS_POLICY_AGENT_ID: 'policy-agent' };
  it.each(['claims_handler', 'reviewer', 'policy_manager', 'admin', null])('checks both assistants for %s', async role => {
    for (const purpose of ['review', 'policy']) {
      const allowed = role === 'admin' || role === (purpose === 'review' ? 'reviewer' : 'policy_manager');
      const fetchImpl = upstream(200, { signed_url: SIGNED });
      const response = await handleVoiceSession(new Request(`http://localhost/api/voice-session?purpose=${purpose}`, { method: 'POST' }), { authenticate: asUser(role), env: configured, fetchImpl });
      expect(response.status).toBe(allowed ? 200 : 403);
      if (allowed) expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toContain(`agent_id=${purpose}-agent`);
      else expect(fetchImpl).not.toHaveBeenCalled();
    }
  });
  it('rejects arbitrary agent selection without contacting ElevenLabs', async () => {
    const fetchImpl = upstream(200);
    const response = await handleVoiceSession(new Request('http://localhost/api/voice-session?purpose=attacker', { method: 'POST' }), { authenticate: asUser('admin'), env: configured, fetchImpl });
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('does not fall back to intake when the selected agent is unconfigured', async () => {
    const fetchImpl = upstream(200);
    const response = await handleVoiceSession(new Request('http://localhost/api/voice-session?purpose=review', { method: 'POST' }), { authenticate: asUser('admin'), env, fetchImpl });
    expect(response.status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
