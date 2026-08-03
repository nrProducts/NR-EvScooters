/**
 * Clipboard access, guarded.
 *
 * expo-clipboard resolves its native module at import time
 * (requireNativeModule('ExpoClipboard') runs at module scope), so on a dev
 * client or binary built before the dependency was added, a plain
 * `import * as Clipboard from 'expo-clipboard'` throws during evaluation.
 * Expo Router loads every route file to build the route tree, so that throw
 * doesn't just break the screen — it takes the whole navigator down and
 * reports unrelated routes as "missing the required default export".
 *
 * Importing lazily inside the call keeps a missing/failed module confined to
 * the copy button, which then simply reports that it couldn't copy.
 */
export async function copyToClipboard(value: string): Promise<boolean> {
    try {
        const Clipboard = await import('expo-clipboard');
        await Clipboard.setStringAsync(value);
        return true;
    } catch {
        // Native module absent (stale build) or the OS refused the write.
        return false;
    }
}
