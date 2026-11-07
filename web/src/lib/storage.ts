import { useAuthUser } from './auth';
import { useCallback, useState } from 'react';

const prefix = 'hackmuc.';

function read<T>(key: string, fallback: T, guard?: (value: unknown) => value is T): T {
  try {
    const raw = localStorage.getItem(prefix + key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return guard && !guard(value) ? fallback : (value as T);
  } catch {
    return fallback;
  }
}

/** Browser-local persistence for the demo; swap for an API without touching the components. */
export function usePersistentState<T>(key: string, fallback: T, guard?: (value: unknown) => value is T) {
  const user = useAuthUser();
  key = `${user.id}.${key}`;
  const [value, setValue] = useState<T>(() => read(key, fallback, guard));
  const update = useCallback((next: T | ((previous: T) => T)) => {
    setValue(previous => {
      const resolved = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next;
      try {
        localStorage.setItem(prefix + key, JSON.stringify(resolved));
      } catch {
        // Storage can be unavailable (private mode, quota); the session still works in memory.
      }
      return resolved;
    });
  }, [key]);
  return [value, update] as const;
}
