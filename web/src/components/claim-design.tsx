import { useEffect, useRef } from 'react';

export function ClaimHeroMedia({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const move = (e: PointerEvent) => {
      const box = node.getBoundingClientRect();
      node.style.setProperty('--media-x', `${((e.clientX - box.left) / box.width - .5) * 12}px`);
      node.style.setProperty('--media-y', `${((e.clientY - box.top) / box.height - .5) * 8}px`);
    };
    const reset = () => { node.style.setProperty('--media-x', '0px'); node.style.setProperty('--media-y', '0px'); };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerleave', reset);
    return () => { node.removeEventListener('pointermove', move); node.removeEventListener('pointerleave', reset); };
  }, []);
  return <div ref={ref} className={`hero-media ${className}`} aria-hidden="true">
    <img src="/design/hero.jpg" alt="" fetchPriority="high" />
    <div className="hero-media-shade" />
  </div>;
}

export function ClaimRuler({ className = '' }: { className?: string }) {
  return <div className={`design-ruler ${className}`} aria-hidden="true">{Array.from({ length: 25 }, (_, i) => <span key={i} style={{ flexGrow: 1 + i * .2 }} />)}</div>;
}
