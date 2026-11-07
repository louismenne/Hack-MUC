import { policySchema, type PolicyDocument } from './schema.js';
import type { PolicyHistory } from './history.js';
import v1 from '../../policies/policy-v1.rules.json' with { type: 'json' };
import v2 from '../../policies/policy-v2.rules.json' with { type: 'json' };

/**
 * The policy files in policies/*.rules.json, used where no database is available (CLI, tests, and the
 * browser fallback when Supabase cannot be reached), plus the fixed official comparison and judging export.
 * Operational decisions use Supabase when an active version can be loaded.
 */
const load = (name: string, json: unknown): PolicyDocument => {
  const parsed = policySchema.safeParse(json);
  if (!parsed.success) throw new Error(`policies/${name} is not a valid policy: ${parsed.error.issues[0]?.message}`);
  return parsed.data as unknown as PolicyDocument;
};

export const bundledV1 = { label: 'v1', rules: load('policy-v1.rules.json', v1) };
export const bundledV2 = { label: 'v2', rules: load('policy-v2.rules.json', v2) };

/** v1 is the original, v2 the official change notice that is in force. */
export const bundledHistory: PolicyHistory = { original: bundledV1, previous: bundledV1, active: bundledV2 };
