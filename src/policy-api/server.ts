import { storedImpact } from './stored-claims.js';
import Anthropic from '@anthropic-ai/sdk';
import type { AiClient } from '../policy-ai/suggest.js';
import { loadCases } from './cases.js';
import { ApiError, type ApiDeps } from './handlers.js';
import { createSupabaseRepo } from './supabase-repo.js';

export const DEFAULT_AI_MODEL = 'claude-sonnet-5-5';

/** Builds the real dependencies from environment variables. Secrets stay on the server. */
export function createDeps(env: Record<string, string | undefined> = process.env, actorId?: string): ApiDeps {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new ApiError(503, 'Supabase ist nicht konfiguriert (SUPABASE_URL und SUPABASE_SECRET_KEY fehlen).');
  return {
    repo: createSupabaseRepo(url, key, actorId),
    storedImpact,
    loadCases: () => loadCases(),
    ai: env.ANTHROPIC_API_KEY ? (new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) as unknown as AiClient) : null,
    aiModel: env.ANTHROPIC_MODEL || DEFAULT_AI_MODEL,
  };
}
