import { evaluateStoredClaims } from './stored-claims.js';
import { permissions } from '../roles.js';
import { listTeam, setTeamRole } from './team.js';
import { createAuthenticator, type Authenticate } from './auth.js';
import { ApiError, handleAi, handleGet, handlePost, type ApiDeps, type ApiResult } from './handlers.js';

const MAX_BODY_BYTES = 4_000_000;
const json = (result: ApiResult) =>
  new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new ApiError(413, 'Request too large.');
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new ApiError(400, 'Invalid JSON.');
  }
}

/** Shared by the Vercel Functions in /api and by the local Vite dev middleware. */
export async function handlePolicyRequest(
  request: Request,
  kind: 'policy' | 'ai',
  makeDeps: (actorId?: string) => ApiDeps,
  authenticate: Authenticate = createAuthenticator(),
): Promise<Response> {
  try {
    const user = await authenticate(request);
    const access = permissions(user);
    if (kind === 'policy' && request.method === 'GET' && new URL(request.url).searchParams.get('view') === 'team') {
      if (!access.team) throw new ApiError(403, 'Admin role required.');
      return json(await listTeam());
    }
    if (kind === 'policy' && request.method === 'GET')
      return json(await handleGet(makeDeps(user.id), new URL(request.url)));
    if (request.method !== 'POST') throw new ApiError(405, 'Method not allowed.');
    if (!request.headers.get('content-type')?.includes('application/json'))
      throw new ApiError(415, 'JSON content type required.');
    const input = await readJson(request);
    const action = input && typeof input === 'object' && 'action' in input ? input.action : undefined;
    if (kind === 'policy' && action === 'evaluate_claims') {
      const offset = (input as { offset?: unknown }).offset ?? 0;
      if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0)
        throw new ApiError(400, 'Invalid offset.');
      const claimId = (input as { claimId?: unknown }).claimId;
      if (
        claimId !== undefined &&
        (typeof claimId !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claimId))
      )
        throw new ApiError(400, 'Invalid claim ID.');
      const ownOnly = (input as { ownOnly?: unknown }).ownOnly ?? false;
      if (typeof ownOnly !== 'boolean') throw new ApiError(400, 'Invalid own-claims filter.');
      return json(await evaluateStoredClaims(user, offset, undefined, claimId, ownOnly));
    }
    if (kind === 'policy' && action === 'set_role') {
      if (!access.team) throw new ApiError(403, 'Admin role required.');
      return json(await setTeamRole(user, input));
    }
    if (!access.policy) throw new ApiError(403, 'Policy Manager or Admin role required.');
    // Creator identity comes from verified Auth, never the caller's JSON.
    const body = input && typeof input === 'object' && !Array.isArray(input) ? { ...input, createdBy: user.id } : input;
    return json(kind === 'ai' ? await handleAi(makeDeps(user.id), body) : await handlePost(makeDeps(user.id), body));
  } catch (error) {
    if (error instanceof ApiError)
      return json({
        status: error.status,
        body: { error: error.message, ...(error.details ? { details: error.details } : {}) },
      });
    console.error('policy api error', error instanceof Error ? error.message : 'unknown');
    return json({ status: 500, body: { error: 'Internal server error.' } });
  }
}
