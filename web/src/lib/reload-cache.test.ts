import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheEpoch, cacheMaxAge, cacheScope, clearReloadCache, readCache, writeCache } from './reload-cache';
const valid = (value: unknown) => typeof value === 'string';
beforeEach(() => {
  const values = new Map<string,string>();
  vi.stubGlobal('sessionStorage', {
    get length() { return values.size; },
    key: (n:number) => [...values.keys()][n] ?? null,
    getItem: (key:string) => values.get(key) ?? null,
    setItem: (key:string,value:string) => values.set(key,value),
    removeItem: (key:string) => values.delete(key),
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('reload cache boundaries', () => {
  it('restores snapshots and isolates users and roles', () => {
    const scope = cacheScope({id:'alice',app_metadata:{hack_muc_role:'admin'}});
    writeCache(scope,'claims','saved');
    expect(readCache(scope,'claims',valid)).toBe('saved');
    expect(readCache('bob:admin','claims',valid)).toBeNull();
    expect(readCache('alice:claims_handler','claims',valid)).toBeNull();
  });
  it('expires snapshots and rejects malformed values', () => {
    const now=Date.now(); vi.spyOn(Date,'now').mockReturnValue(now);
    writeCache('alice','claims','saved');
    expect(readCache('alice','claims',()=>false)).toBeNull();
    vi.mocked(Date.now).mockReturnValue(now+cacheMaxAge+1);
    expect(readCache('alice','claims',valid)).toBeNull();
  });
  it('clears app snapshots without touching auth and blocks late requests repopulating them', () => {
    sessionStorage.setItem('other-key','keep');
    const started=cacheEpoch(); writeCache('alice','claims','saved');
    clearReloadCache(); writeCache('alice','claims','late result',started);
    expect(readCache('alice','claims',valid)).toBeNull();
    expect(sessionStorage.getItem('other-key')).toBe('keep');
  });
  it('keeps working when browser storage is unavailable', () => {
    vi.stubGlobal('sessionStorage',{getItem(){throw new Error('disabled');},setItem(){throw new Error('quota');}});
    expect(()=>writeCache('alice','claims','saved')).not.toThrow();
    expect(readCache('alice','claims',valid)).toBeNull();
    expect(()=>clearReloadCache()).not.toThrow();
  });
});
