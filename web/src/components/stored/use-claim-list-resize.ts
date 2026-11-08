import { useEffect, useRef, useState } from 'react';

export function useClaimListResize() {
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);
  // Resizable list column (Apple Mail style). null = default quarter of the width. Remembered per browser.
  const splitRef = useRef<HTMLDivElement>(null);
  const [listWidth, setListWidth] = useState<number | null>(() => {
    try {
      const v = Number(localStorage.getItem('hackmuc.listWidth'));
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
      if (px === null) localStorage.removeItem('hackmuc.listWidth');
      else localStorage.setItem('hackmuc.listWidth', String(px));
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
