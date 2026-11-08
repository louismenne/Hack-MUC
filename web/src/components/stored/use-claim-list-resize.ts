import { useEffect, useRef, useState } from 'react';

/** Default split for list + detail pages (queue, policy): a bit under a quarter, never narrower than 260px. */
export const DEFAULT_SPLIT = 'minmax(260px,1fr) minmax(0,3.5fr)';
export const splitColumns = (width: number | null) => (width ? `${width}px minmax(0,1fr)` : DEFAULT_SPLIT);

/**
 * Draggable left column (Apple Mail style). The width lasts for this browser session only (reloads keep it,
 * a freshly opened tab starts at the default again).
 */
export function useClaimListResize(storageKey = 'hackmuc.listWidth') {
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);
  const splitRef = useRef<HTMLDivElement>(null);
  const [listWidth, setListWidth] = useState<number | null>(() => {
    try {
      const v = Number(sessionStorage.getItem(storageKey));
      return Number.isFinite(v) && v > 0 ? v : null;
    } catch {
      return null;
    }
  });
  const clampWidth = (px: number) => {
    const total = splitRef.current?.getBoundingClientRect().width ?? 1200;
    return Math.round(Math.min(Math.max(px, 220), total * 0.5));
  };
  const saveListWidth = (px: number | null) => {
    setListWidth(px);
    try {
      if (px === null) sessionStorage.removeItem(storageKey);
      else sessionStorage.setItem(storageKey, String(px));
    } catch {
      /* storage unavailable */
    }
  };
  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const grid = splitRef.current;
    if (!grid) return;
    event.preventDefault();
    const left = grid.getBoundingClientRect().left;
    const move = (e: PointerEvent) => setListWidth(clampWidth(e.clientX - left));
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
      cleanupRef.current = null;
    };
    const up = (e: PointerEvent) => {
      cleanup();
      saveListWidth(clampWidth(e.clientX - left));
    };
    cleanupRef.current?.();
    cleanupRef.current = cleanup;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return { splitRef, listWidth, clampWidth, saveListWidth, startResize };
}
