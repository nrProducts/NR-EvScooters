/**
 * The decisions behind the in-app update prompt (lib/inAppUpdate.ts), kept in
 * a plain file with no React Native imports so they can be unit-tested.
 */
export const ASK_EVERY_MS = 24 * 60 * 60 * 1000;

/**
 * True when Play's newest build number is higher than the installed one.
 * Build numbers (Android versionCode) are plain integers; comparing them as
 * numbers keeps "10" above "9", and anything unparseable means "don't prompt".
 */
export function isNewerBuild(storeBuild: string | number, installedBuild: string | number): boolean {
  // Number("") is 0, which would read as "older than everything": blank is invalid.
  if (String(storeBuild).trim() === "" || String(installedBuild).trim() === "") return false;
  const store = Number(storeBuild);
  const installed = Number(installedBuild);
  return Number.isFinite(store) && Number.isFinite(installed) && store > installed;
}

/** True if the rider was last asked less than ASK_EVERY_MS ago. */
export function askedRecently(lastAskedIso: string | null, now: number = Date.now()): boolean {
  if (!lastAskedIso) return false;
  const last = Date.parse(lastAskedIso);
  return Number.isFinite(last) && now - last < ASK_EVERY_MS;
}
