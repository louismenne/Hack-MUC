import { useCallback, useEffect, useState } from 'react';
import { navigate, pageHref } from '@/lib/navigation';
import type { ReviewAction } from '../../../../src/review';

export function useClaimSelection({
  claimsPage,
  dashboard,
  offset,
  selectedId,
  firstVisibleId,
  action,
  setAction,
}: {
  claimsPage: 'my-claims' | 'queue';
  dashboard: boolean;
  offset: number;
  selectedId: string;
  firstVisibleId: string | undefined;
  action: ReviewAction | null;
  setAction: (action: ReviewAction | null) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const openClaim = useCallback(
    (caseId: string) => {
      const params = new URLSearchParams();
      if (offset) params.set('offset', String(offset));
      if (caseId) params.set('case', caseId);
      navigate(pageHref(claimsPage, params));
      setAction(null);
      window.scrollTo({ top: 0 });
    },
    [claimsPage, offset, setAction],
  );
  useEffect(() => {
    if (dashboard || selectedId || dismissed || !firstVisibleId) return;
    openClaim(firstVisibleId);
  }, [dashboard, selectedId, dismissed, firstVisibleId, openClaim]);
  useEffect(() => {
    if (dashboard) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || action || !selectedId) return;
      // A dialog, menu or field handles its own Esc; only a bare Esc closes the claim.
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"]')) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select')) return;
      setDismissed(true);
      openClaim('');
    };
    // Capture phase: runs before a dialog closes itself, so an open dialog is still detected.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dashboard, action, selectedId, openClaim]);
  return { openClaim, setDismissed };
}
