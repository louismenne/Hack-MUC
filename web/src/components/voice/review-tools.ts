import { voiceError, voiceResult } from './protocol.js';
export interface ReviewNoteAccess { claimId: string; reason: string; setReason: (text: string) => void }
export function insertReviewReason(access: ReviewNoteAccess | null, params: unknown): string {
  const p = params as { claim_id?: unknown; text?: unknown; replace_existing?: unknown } | null;
  if (!access) return voiceError('Open a review dialog first.');
  if (p?.claim_id !== access.claimId) return voiceError('The selected claim changed. Retrieve context again.');
  if (typeof p.text !== 'string' || !p.text.trim() || p.text.length > 10000 || typeof p.replace_existing !== 'boolean') return voiceError('Invalid reason parameters.');
  if (access.reason.trim() && !p.replace_existing) return voiceError('Existing reason preserved. Replacement requires an explicit request.');
  access.setReason(p.text.trim());
  return voiceResult({ claim_id: access.claimId, placed: true, submitted: false });
}
