import { claimIntakeConfig } from './config.js';
import type { ClaimPayload } from './payload.js';

export interface FileInfo { name: string; size: number; type: string }

export interface SubmitResult {
  /** 'dry-run': nothing was saved and no network call was made. */
  mode: 'dry-run' | 'saved';
  payload: ClaimPayload;
  files: FileInfo[];
}

/** True while no claims table is configured: submissions are not saved. */
export const isDryRun = (): boolean => claimIntakeConfig.claimsTable === null;

/**
 * The ONLY place that will talk to Supabase. Today it makes no network call at all.
 *
 * TODO(Supabase), when claimsTable / claimsBucket are set in config.ts:
 *  1. upload `files` to the claimsBucket (for example under `<claim id>/<file name>`);
 *  2. insert `payload` (its keys are already the column names) into the claimsTable;
 *  3. return { mode: 'saved', payload, files }.
 */
export async function submitClaim(payload: ClaimPayload, files: File[]): Promise<SubmitResult> {
  const info = files.map(f => ({ name: f.name, size: f.size, type: f.type }));
  if (claimIntakeConfig.claimsTable === null) return { mode: 'dry-run', payload, files: info };
  throw new Error('Saving claims is not implemented yet (see the TODO in src/claim-intake/adapter.ts).');
}
