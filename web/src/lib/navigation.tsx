import { useSyncExternalStore, type ComponentProps } from 'react';

export const pages = [
  { id: 'my-claims', path: '/my-claims', label: 'My claims' },
  { id: 'queue', path: '/review-queue', label: 'Review queue' },
  // Opened from the Taktile logo, not the main navigation.
  { id: 'overview', path: '/overview', label: 'Overview', menuOnly: true },
  { id: 'quality', path: '/dashboard', label: 'Dashboard' },
  { id: 'policy', path: '/policy', label: 'Policy' },
  // Jury test area: the labelled CSV cases, their quality report, upload and results export in one page.
  { id: 'examples', path: '/examples', label: 'Test cases' },
  { id: 'example-quality', path: '/example-quality', label: 'Test cases', menuOnly: true },
  // Opened from the account menu (admins only), not the main navigation.
  { id: 'team', path: '/team', label: 'Team', menuOnly: true },
] as const;
const changed = 'app:navigation';
const snapshot = () => window.location.pathname + window.location.search + window.location.hash;
function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener);
  window.addEventListener('hashchange', listener);
  window.addEventListener(changed, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener('hashchange', listener);
    window.removeEventListener(changed, listener);
  };
}
export function navigate(href: string) {
  if (snapshot() === href) return;
  window.history.pushState(null, '', href);
  window.dispatchEvent(new Event(changed));
  window.scrollTo({ top: 0 });
}
export function parseRoute(href: string) {
  const url = new URL(href, 'http://localhost');
  const legacy = /^#\/case\/(.+)$/.exec(url.hash);
  const page = legacy ? 'examples' : pages.find(p => p.path === url.pathname.replace(/\/$/, ''))?.id ?? 'queue';
  let legacyCase: string | null = null;
  try { legacyCase = legacy ? decodeURIComponent(legacy[1]) : null; } catch { /* Ignore malformed old links. */ }
  return { page, params: url.searchParams, caseId: legacyCase ?? url.searchParams.get('case') };
}
export function useRoute() {
  return parseRoute(useSyncExternalStore(subscribe, snapshot));
}
export function pageHref(page: string, params?: URLSearchParams) {
  const path = pages.find(p => p.id === page)?.path ?? '/review-queue';
  return path + (params?.size ? `?${params}` : '');
}
export function PageLink({ href, onClick, ...props }: ComponentProps<'a'> & { href: string }) {
  return <a {...props} href={href} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (props.target && props.target !== '_self') || props.download) return;
    event.preventDefault();
    navigate(href);
  }} />;
}
