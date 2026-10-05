import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * "I've seen this, stop showing it to me" for informational banners.
 *
 * Persisted rather than held in component state, because Home remounts on
 * every tab switch and a banner that comes back the moment you leave the
 * screen has not really been dismissed.
 *
 * Keyed by the THING being dismissed (e.g. `settlement:<rental_id>`), never
 * by the banner's position on screen — a new settlement must appear even
 * though the previous one was dismissed, and it will, because its key is
 * different.
 *
 * Device-local by design. There is no server-side "read" concept for these,
 * and inventing one would mean a rider dismissing a refund notice on their
 * phone could never see it again on a reinstall — which is the wrong trade
 * for something that is only ever a convenience.
 */
const KEY_PREFIX = 'dismissed_banner:';

export async function dismissBanner(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + key, new Date().toISOString());
  } catch {
    // A dismissal that fails to persist is a banner that comes back — an
    // annoyance, not a fault worth surfacing to the rider.
  }
}

export async function isBannerDismissed(key: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY_PREFIX + key)) !== null;
  } catch {
    return false;
  }
}

/**
 * `[dismissed, dismiss]` for a banner identified by `key`.
 *
 * Starts as dismissed=true until the stored value has been read, so a banner
 * the rider already closed never flashes in for a frame on mount. `key` may
 * be null while the underlying data is still loading; nothing is shown then
 * either.
 */
export function useDismissibleBanner(key: string | null): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!key) {
      setDismissed(true);
      return;
    }
    let active = true;
    void isBannerDismissed(key).then((value) => {
      if (active) setDismissed(value);
    });
    return () => { active = false; };
  }, [key]);

  const dismiss = useCallback(() => {
    if (!key) return;
    // Optimistic: the card disappears on tap, not on the storage round trip.
    setDismissed(true);
    void dismissBanner(key);
  }, [key]);

  return [dismissed, dismiss];
}
