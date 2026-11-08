import { clearReloadCache } from '@/lib/reload-cache';
import { useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';

import { type Recommendation } from '../../../../src/triage';

import { type ReviewAction, type ReviewInput } from '../../../../src/review';
import type { StoredQueueItem } from '../../../../src/policy-api/stored-claims';

import { toast } from 'sonner';

import type { ReviewState } from '../../../../src/review';

export function useStoredReview({
  stored,
  state,
  canReview,
  refresh,
  refreshAudit,
  action,
  setAction,
}: {
  stored: StoredQueueItem | undefined;
  state: ReviewState | undefined;
  canReview: boolean;
  refresh: () => Promise<void>;
  refreshAudit: () => Promise<void>;
  action: ReviewAction | null;
  setAction: (action: ReviewAction | null) => void;
}) {
  /** The saved decision a review dialog was opened for; the dialog closes if that decision is replaced. */
  const dialogDecision = useRef<string | undefined>(undefined);
  const busy = useRef(false);
  const [preset, setPreset] = useState<{ next?: Recommendation; title?: string }>({});
  const savedDecisionId = stored?.saved.id;
  useEffect(() => {
    if (action && dialogDecision.current && savedDecisionId !== dialogDecision.current) {
      setAction(null);
      toast.info('The saved decision for this claim changed. Check the claim again before reviewing.');
    }
  }, [action, savedDecisionId, setAction]);
  const openAction = (next: ReviewAction, presetNext?: Recommendation, title?: string) => {
    dialogDecision.current = savedDecisionId;
    setPreset({ next: presetNext, title });
    setAction(next);
  };
  async function record(input: ReviewInput) {
    if (busy.current || !stored || !state) return;
    if (!canReview) {
      toast.error('Reviews are paused until the queue has refreshed successfully.');
      return;
    }
    busy.current = true;
    try {
      const { error } = await supabase.rpc('record_review', {
        p_event: {
          decisionId: stored.saved.id,
          expectedReviewId: state.events.at(-1)?.id ?? null,
          action: input.action,
          next: input.next,
          reason: input.reason,
        },
      });
      if (error) throw new Error(error.message);
      clearReloadCache();
      setAction(null);
      toast.success(
        input.action === 'rejected'
          ? 'Claim rejected. Saved to the audit history.'
          : input.action === 'overridden'
            ? 'Override saved to the audit history.'
            : input.action === 'reverted'
              ? 'Revert saved to the audit history.'
              : 'Confirmation saved to the audit history.',
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      await Promise.all([refresh(), refreshAudit()]);
      busy.current = false;
    }
  }
  return { preset, openAction, record };
}
