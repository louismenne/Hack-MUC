import { ApiError, handleAi, handleGet, handlePost, type ApiDeps, type ApiResult } from './handlers.js';

const MAX_BODY_BYTES = 4_000_000;
const json = (result: ApiResult) => new Response(JSON.stringify(result.body), { status: result.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new ApiError(413, 'Anfrage zu groß.');
  try { return JSON.parse(text || '{}'); } catch { throw new ApiError(400, 'Ungültiges JSON.'); }
}

/** Shared by the Vercel Functions in /api and by the local Vite dev middleware. */
export async function handlePolicyRequest(request: Request, kind: 'policy' | 'ai', makeDeps: () => ApiDeps): Promise<Response> {
  try {
    if (kind === 'policy' && request.method === 'GET') return json(await handleGet(makeDeps(), new URL(request.url)));
    if (request.method !== 'POST') throw new ApiError(405, 'Methode nicht erlaubt.');
    if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError(415, 'JSON erforderlich.');
    const body = await readJson(request);
    return json(kind === 'ai' ? await handleAi(makeDeps(), body) : await handlePost(makeDeps(), body));
  } catch (error) {
    if (error instanceof ApiError) return json({ status: error.status, body: { error: error.message, ...(error.details ? { details: error.details } : {}) } });
    console.error('policy api error', error instanceof Error ? error.message : 'unknown');
    return json({ status: 500, body: { error: 'Interner Fehler.' } });
  }
}
