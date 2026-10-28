import { useEffect, useState } from "react";

/**
 * `useState` that survives the component unmounting, for list screens whose
 * filters should still be there when the admin opens a record and comes back.
 *
 * Kept in sessionStorage rather than the URL: the detail pages' own back arrow
 * is a fresh navigation to the list, so URL params would be lost exactly when
 * they are needed. Session storage is per browser tab and is cleared when the
 * tab closes, so a filter never lingers into the next day's work.
 *
 * With no `key` it is plain `useState` — that lets a shared hook (useTableSort)
 * offer persistence without forcing it on every grid. Storage can be missing
 * or full (private windows, blocked site data), so every access is guarded and
 * the screen simply falls back to its defaults.
 */
export function useSessionState<T>(key: string | undefined, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (!key) return initial;
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    if (!key) return;
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable: nothing to persist to, the filter just resets next time.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
