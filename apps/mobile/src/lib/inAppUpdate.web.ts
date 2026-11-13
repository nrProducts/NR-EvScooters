import type { UpdateCopy } from './inAppUpdate';

/**
 * Web build: no in-app update. Google Play's update flow is Android-only, and
 * the library behind it ships no web code, so bundling it for web fails the
 * build (Metro cannot resolve its entry point). Metro prefers this `.web.ts`
 * over inAppUpdate.ts when bundling for web, so the library never reaches it.
 * A web visitor always loads the current site anyway.
 */
export async function checkForAppUpdate(_copy: UpdateCopy): Promise<void> {
  // Nothing to check.
}
