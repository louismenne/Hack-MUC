/** Short-lived, tab-scoped snapshots. Never an authority for permissions or decisions. */
const prefix = 'hackmuc.reload.v1.';
export const cacheMaxAge = 5 * 60 * 1000;
let epoch = 0;
export const cacheEpoch = () => epoch;
export function cacheScope(user: { id: string; app_metadata: Record<string, unknown> }) {
  return `${user.id}:${String(user.app_metadata.hack_muc_role ?? 'unassigned')}`;
}
export function readCache<T>(scope: string, key: string, valid: (value: unknown) => boolean): T | null {
  try {
    const entry = JSON.parse(sessionStorage.getItem(prefix + scope + ':' + key) ?? 'null');
    if (!entry || typeof entry.at !== 'number' || Date.now() - entry.at > cacheMaxAge || entry.at > Date.now() || !valid(entry.value)) return null;
    return entry.value as T;
  } catch { return null; }
}
export function writeCache(scope: string, key: string, value: unknown, startedAt = epoch) {
  if (startedAt !== epoch) return; // A sign-out/mutation invalidated this in-flight request.
  try { sessionStorage.setItem(prefix + scope + ':' + key, JSON.stringify({ at: Date.now(), value })); } catch { /* Quota/private mode: keep working without persistence. */ }
}
export function clearReloadCache() {
  epoch++;
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
    }
  } catch { /* Storage may be unavailable. */ }
}
