import Anthropic from '@anthropic-ai/sdk';
import { createAuthenticator, type Authenticate } from '../policy-api/auth.js';
import { ApiError } from '../policy-api/handlers.js';
import { DEFAULT_AI_MODEL } from '../policy-api/server.js';
import { permissions } from '../roles.js';
import { investigate, type AgentClient, type AgentEvent, type ChatMessage } from './agent.js';
import { queryProduction, type QueryResult } from './query.js';

export function validateChat(body: unknown): ChatMessage[] {
  const messages = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages) || !messages.length || messages.length > 20) throw new ApiError(400, 'Send between 1 and 20 chat messages.');
  let length = 0;
  const result = messages.map((m, i): ChatMessage => {
    if (!m || m.role !== (i % 2 ? 'assistant' : 'user') || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 12000) throw new ApiError(400, 'Invalid chat history.');
    length += m.content.length;
    return { role: m.role, content: m.content };
  });
  if (result.at(-1)?.role !== 'user' || length > 40000) throw new ApiError(400, 'Chat is too long or has no new question. Start a new chat.');
  return result;
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export function agentErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  const e = error as { status?: number; error?: { error?: { message?: string } }; message?: string } | null;
  if (e?.status === 401) return 'Anthropic rejected the API key. Check ANTHROPIC_API_KEY on the server.';
  if (e?.status === 429) return 'Anthropic is rate-limiting requests. Wait briefly and try again.';
  if (e?.status === 400 || e?.status === 404) {
    const detail = e.error?.error?.message ?? 'Check the model and request settings.';
    return `Anthropic rejected the request (${e.status}): ${detail.replace(/(?:sk[-]ant[-]|sbp[_]|sb[_]secret[_])[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 400)}`;
  }
  if (e?.message === 'No production SQL query succeeded. Inspect the query errors and try again.' || e?.message?.includes('step limit')) return e.message;
  return 'Investigation failed while contacting Anthropic. Try again; if it persists, check the server connection and model configuration.';
}
export async function handleQualityChat(request: Request, options: {
  authenticate?: Authenticate; env?: NodeJS.ProcessEnv; client?: AgentClient;
  query?: (sql: string, signal: AbortSignal) => Promise<QueryResult>;
} = {}): Promise<Response> {
  const env = options.env ?? process.env;
  try {
    const user = await (options.authenticate ?? createAuthenticator(env))(request);
    if (!permissions(user).qualityAgent) throw new ApiError(403, 'Staff role required.');
    const sqlAvailable = !!env.SUPABASE_MANAGEMENT_TOKEN || (env.QUALITY_AGENT_LOCAL_CLI === '1' && !env.VERCEL);
    if (request.method === 'GET') return json({ aiAvailable: !!env.ANTHROPIC_API_KEY, sqlAvailable });
    if (request.method !== 'POST') throw new ApiError(405, 'Method not allowed.');
    if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError(415, 'JSON required.');
    if (!env.ANTHROPIC_API_KEY && !options.client) throw new ApiError(503, 'Set ANTHROPIC_API_KEY on the server to enable the quality agent.');
    if (!sqlAvailable && !options.query) throw new ApiError(503, 'Set SUPABASE_MANAGEMENT_TOKEN on the server for read-only production SQL access.');
    const text = await request.text();
    if (text.length > 80000) throw new ApiError(413, 'Chat request too large.');
    let input; try { input = JSON.parse(text); } catch { throw new ApiError(400, 'Invalid JSON.'); }
    const messages = validateChat(input);
    const controller = new AbortController();
    const signal = AbortSignal.any([request.signal, controller.signal, AbortSignal.timeout(110000)]);
    const client = options.client ?? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: 45000 }) as unknown as AgentClient;
    const encoder = new TextEncoder();
    let cancelled = false;
    const stream = new ReadableStream({
      start(output) {
        const emit = (event: AgentEvent) => { if (!cancelled) output.enqueue(encoder.encode(JSON.stringify(event) + '\n')); };
        void investigate({ client, model: env.ANTHROPIC_MODEL || DEFAULT_AI_MODEL, messages, signal,
          query: options.query ?? ((sql, abort) => queryProduction(sql, abort, env)), emit,
        }).catch(error => {
          emit({ type: 'error', message: signal.aborted ? 'Investigation timed out or was stopped. Try a narrower question.' : agentErrorMessage(error) });
        }).finally(() => { if (!cancelled) output.close(); });
      },
      cancel() { cancelled = true; controller.abort(); },
    });
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
  } catch (error) {
    return json({ error: error instanceof ApiError ? error.message : 'Could not start the quality agent.' }, error instanceof ApiError ? error.status : 500);
  }
}
