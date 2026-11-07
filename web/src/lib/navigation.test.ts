import { afterEach, describe, expect, it, vi } from 'vitest';
import { navigate, pageHref, pages, parseRoute } from './navigation';

afterEach(() => vi.unstubAllGlobals());

describe('page navigation', () => {
  it('resolves every page independently of saved tab state', () => {
    for (const page of pages) {
      expect(parseRoute(page.path).page).toBe(page.id);
      expect(parseRoute(`${page.path}/`).page).toBe(page.id);
    }
    expect(parseRoute('/').page).toBe('queue');
  });

  it('keeps claim details scoped to their page and retains queue pagination', () => {
    const href = pageHref('queue', new URLSearchParams({ case: 'CLM/a b', offset: '50' }));
    const route = parseRoute(href);
    expect(route.page).toBe('queue');
    expect(route.caseId).toBe('CLM/a b');
    expect(route.params.get('offset')).toBe('50');
    expect(parseRoute(pageHref('examples')).caseId).toBeNull();
  });

  it('opens legacy example links on the examples page and tolerates malformed links', () => {
    expect(parseRoute('/#/case/DEV-004')).toMatchObject({ page: 'examples', caseId: 'DEV-004' });
    expect(() => parseRoute('/#/case/%')).not.toThrow();
  });

  it('adds one history entry per navigation so Back and Forward restore the URL', () => {
    const entries = ['/review-queue'];
    let position = 0;
    const location = new URL(entries[0], 'http://localhost');
    const update = () => { location.href = new URL(entries[position], location.origin).href; };
    const target = new EventTarget();
    const changes = vi.fn();
    target.addEventListener('app:navigation', changes);
    vi.stubGlobal('window', {
      location, scrollTo: vi.fn(),
      dispatchEvent: target.dispatchEvent.bind(target),
      history: {
        pushState: (_: unknown, __: string, href: string) => {
          entries.splice(++position, entries.length, href);
          update();
        },
      },
    });
    navigate('/examples');
    navigate('/policy?view=history');
    navigate('/policy?view=history');
    expect(entries).toEqual(['/review-queue', '/examples', '/policy?view=history']);
    expect(changes).toHaveBeenCalledTimes(2);
    position--; update();
    expect(parseRoute(location.href).page).toBe('examples');
    position++; update();
    expect(parseRoute(location.href).params.get('view')).toBe('history');
  });
});
