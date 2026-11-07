import { permissions } from '../roles.js';
import { createAuthenticator, type Authenticate } from './auth.js';
import { ApiError } from './handlers.js';

const SIGNED_URL_ENDPOINT = 'https://api.elevenlabs.io/v1/convai/conversation/get-signed-url';

export interface VoiceSessionOptions {
  authenticate?: Authenticate;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

/**
 * POST /api/voice-session: hands the browser a short-lived signed URL (about 15 minutes) for the ElevenLabs
 * claim-intake agent. Same login and role rule as submitting a claim. The ElevenLabs API key and the agent ID
 * stay on the server: the browser only ever receives the signed URL. Nothing secret is logged or echoed back.
 */
export async function handleVoiceSession(request: Request, options: VoiceSessionOptions = {}): Promise<Response> {
  try {
    if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const user = await (options.authenticate ?? createAuthenticator())(request);
    if (!permissions(user).upload) throw new ApiError(403, 'Claims Handler, Reviewer or Admin role required.');

    const env = options.env ?? process.env;
    const apiKey = env.ELEVENLABS_API_KEY?.trim();
    const agentId = env.ELEVENLABS_AGENT_ID?.trim();
    if (!apiKey || !agentId) throw new ApiError(503, 'Voice input is not configured on the server (ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID are required).');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
    let upstream: Response;
    try {
      upstream = await (options.fetchImpl ?? fetch)(`${SIGNED_URL_ENDPOINT}?agent_id=${encodeURIComponent(agentId)}`, {
        headers: { 'xi-api-key': apiKey }, signal: controller.signal,
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'AbortError';
      throw new ApiError(timedOut ? 504 : 502, timedOut ? 'ElevenLabs did not answer in time. Please try again.' : 'Could not reach ElevenLabs. Please try again.');
    } finally {
      clearTimeout(timer);
    }

    if (upstream.status === 401 || upstream.status === 403) {
      return json(502, { error: `ElevenLabs refused the request (HTTP ${upstream.status}). Check the API key (permission "ElevenAgents: Write"), its credit limit and the agent ID.`, upstreamStatus: upstream.status });
    }
    if (upstream.status === 404 || upstream.status === 422) {
      return json(502, { error: `ElevenLabs does not know this agent (HTTP ${upstream.status}). Check ELEVENLABS_AGENT_ID.`, upstreamStatus: upstream.status });
    }
    if (upstream.status === 429) return json(429, { error: 'ElevenLabs is rate limiting or out of credits. Please try again later.', upstreamStatus: 429 });
    if (!upstream.ok) return json(502, { error: `ElevenLabs returned an error (HTTP ${upstream.status}).`, upstreamStatus: upstream.status });

    const data = await upstream.json().catch(() => null) as { signed_url?: unknown } | null;
    const signedUrl = data?.signed_url;
    if (typeof signedUrl !== 'string' || !signedUrl.startsWith('wss://')) return json(502, { error: 'ElevenLabs returned an unexpected answer.' });
    return json(200, { signedUrl });
  } catch (error) {
    if (error instanceof ApiError) return json(error.status, { error: error.message });
    console.error('voice session error', error instanceof Error ? error.name : 'unknown'); // never the message: it could contain a URL
    return json(500, { error: 'Internal error.' });
  }
}
