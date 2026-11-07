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
export async function submitClaim(payload: ClaimPayload, files: File[]): Promise<SubmitResult> {
  if (isDryRun()) return { mode: 'dry-run', payload, files: files.map(f => ({ name: f.name, size: f.size, type: f.type })) };
  if (!client) throw new Error('Claim storage client is not configured.');
  const db = client;
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) throw new Error('Please sign in before submitting a claim.');
  if (!permissions(auth.user).upload) throw new Error('Claims Handler, Reviewer or Admin role required.');
  if (files.length > 10 || files.some(f => f.size > 10 * 1024 * 1024 || f.name.length > 255)) throw new Error('Attach at most 10 files, each up to 10 MB with a name up to 255 characters.');
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
    const { data, error } = await db.from(claimIntakeConfig.claimsTable!).insert({ ...claimInsert(payload), attachments: uploaded }).select().single();
    if (error) throw new Error(`Could not save claim: ${error.message}`);
    // Return confirmed server values, not client-supplied IDs/timestamps or guessed defaults.
    const saved = Object.fromEntries(Object.entries(data).filter(([, value]) => value === null || ['string','number','boolean'].includes(typeof value))) as ClaimPayload;
    return { mode: 'saved', payload: saved, files: uploaded };
  } catch (error) {
    if (uploaded.length && bucket) {
      // RLS prevents deletion if an insert succeeded but its network response was lost.
      try { await db.storage.from(bucket).remove(uploaded.map(f => f.path!)); } catch { /* Best-effort orphan cleanup; preserve original failure. */ }
    }
    throw error;
  }
}
