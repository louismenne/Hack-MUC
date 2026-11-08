import { describe, expect, it, vi } from 'vitest';
import { insertReviewReason } from '../web/src/components/voice/review-tools.js';
describe('voice review drafts', () => {
  const params = { claim_id: 'claim-a', text: 'The reviewer verified the revised quote.', replace_existing: false };
  it('requires an open dialog', () => expect(JSON.parse(insertReviewReason(null, params)).success).toBe(false));
  it('prevents writing into a different claim after selection changes', () => {
    const setReason = vi.fn();
    expect(JSON.parse(insertReviewReason({ claimId: 'claim-b', reason: '', setReason }, params)).success).toBe(false);
    expect(setReason).not.toHaveBeenCalled();
  });
  it('preserves existing text by default', () => {
    const setReason = vi.fn();
    expect(JSON.parse(insertReviewReason({ claimId: 'claim-a', reason: 'Manual note', setReason }, params)).success).toBe(false);
    expect(setReason).not.toHaveBeenCalled();
  });
  it('places text without submitting and permits explicitly requested replacement', () => {
    const setReason = vi.fn();
    expect(JSON.parse(insertReviewReason({ claimId: 'claim-a', reason: 'Old note', setReason }, { ...params, replace_existing: true }))).toMatchObject({ success: true, submitted: false });
    expect(setReason).toHaveBeenCalledWith(params.text);
  });
  it.each([null, {}, { ...params, text: '' }, { ...params, replace_existing: 'false' }])('rejects malformed parameters %j', p => {
    const setReason = vi.fn();
    expect(JSON.parse(insertReviewReason({ claimId: 'claim-a', reason: '', setReason }, p)).success).toBe(false);
    expect(setReason).not.toHaveBeenCalled();
  });
});
