import type { SupabaseClient } from '@supabase/supabase-js';
import { claimIntakeConfig } from './config.js';
import { fields } from './fields.js';
import { permissions } from '../roles.js';
import type { ClaimPayload } from './payload.js';

export interface FileInfo { name: string; size: number; type: string; path?: string }
export interface SubmitResult { mode: 'dry-run' | 'saved'; payload: ClaimPayload; files: FileInfo[] }
let client: SupabaseClient | undefined;
export function configureClaimsClient(value: SupabaseClient) { client = value; }
export const isDryRun = (): boolean => claimIntakeConfig.claimsTable === null;
const mimeByExtension: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff' };
export function attachmentType(file: { name: string; type: string }) {
  const type = file.type || mimeByExtension[file.name.split('.').pop()?.toLowerCase() ?? ''];
  if (!Object.values(mimeByExtension).includes(type)) throw new Error('Only PDF and supported image attachments can be saved.');
  return type;
}
/** Whitelist user facts. The database supplies ownership, case ID, status and verified checks. */
export function claimInsert(payload: ClaimPayload) {
  return Object.fromEntries(fields.map(field => [field.column, payload[field.column] ?? null]));
}
function savedResult(data: Record<string, unknown>, attachments: FileInfo[]): SubmitResult {
  const payload = Object.fromEntries(Object.entries(data).filter(([, value]) => value === null || ['string','number','boolean'].includes(typeof value))) as ClaimPayload;
  return { mode: 'saved', payload, files: attachments };
}

/** Owner-scoped lookup: a reviewer cannot use the claimant form to edit someone else's claim. */
export async function loadClaimForFollowup(id: string): Promise<SubmitResult> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid claim link.');
  if (!client || !claimIntakeConfig.claimsTable) throw new Error('Claim storage is not configured.');
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user || !permissions(auth.user).upload) throw new Error('Please sign in with the account that submitted this claim.');
  const { data, error } = await client.from(claimIntakeConfig.claimsTable).select('*').eq('id', id).eq('submitted_by', auth.user.id).eq('case_status', 'open').maybeSingle();
  if (error || !data) throw new Error('This claim is unavailable, closed, or belongs to another account.');
  return savedResult(data, data.attachments ?? []);
}

export async function submitClaim(payload: ClaimPayload, files: File[], existing?: SubmitResult): Promise<SubmitResult> {
  if (isDryRun()) return { mode: 'dry-run', payload, files: files.map(f => ({ name: f.name, size: f.size, type: f.type })) };
  if (!client) throw new Error('Claim storage client is not configured.');
  const db = client;
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) throw new Error('Please sign in before submitting a claim.');
  if (!permissions(auth.user).upload) throw new Error('Claims Handler, Reviewer or Admin role required.');
  if (existing && (existing.mode !== 'saved' || !existing.payload.id)) throw new Error('A saved claim is required.');
  if (files.length + (existing?.files.length ?? 0) > 10 || files.some(f => f.size > 10 * 1024 * 1024 || f.name.length > 255)) throw new Error('Attach at most 10 files, each up to 10 MB with a name up to 255 characters.');
  const types = files.map(attachmentType);
  const bucket = claimIntakeConfig.claimsBucket;
  if (files.length && !bucket) throw new Error('Document storage is not configured.');
  const uploaded: FileInfo[] = [];
  const batch = crypto.randomUUID();
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path = `${auth.user.id}/${batch}/${crypto.randomUUID()}`;
      const { error } = await db.storage.from(bucket!).upload(path, file, { contentType: types[i], upsert: false });
      if (error) throw new Error(`Could not upload ${file.name}: ${error.message}`);
      uploaded.push({ name: file.name, size: file.size, type: types[i], path });
    }
    const attachments = [...(existing?.files ?? []), ...uploaded];
    const table = db.from(claimIntakeConfig.claimsTable!);
    const write = existing
      ? table.update({ ...claimInsert(payload), attachments }).eq('id', existing.payload.id).eq('submitted_by', auth.user.id).eq('case_status', 'open').eq('revision', existing.payload.revision ?? 0)
      : table.insert({ ...claimInsert(payload), attachments });
    const { data, error } = await write.select().single();
    if (error) throw new Error(`Could not save claim: ${error.message}`);
    // Return confirmed server values, not client-supplied IDs/timestamps or guessed defaults.
    return savedResult(data, attachments);
  } catch (error) {
    if (uploaded.length && bucket) {
      // RLS prevents deletion if an insert succeeded but its network response was lost.
      try { await db.storage.from(bucket).remove(uploaded.map(f => f.path!)); } catch { /* Best-effort orphan cleanup; preserve original failure. */ }
    }
    throw error;
  }
}
