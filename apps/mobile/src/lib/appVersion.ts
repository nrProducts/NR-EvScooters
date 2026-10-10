import * as Application from 'expo-application';

/**
 * The installed build, read from the native binary rather than app.config.js.
 *
 * `version` is versionName ("1.0.0") and `build` is the Android versionCode,
 * which EAS auto-increments on every production build (appVersionSource is
 * "remote"), so the config file never knows it. Testers quote this pair in
 * bug reports — without it there is no telling whether a report is about the
 * build just shipped or one already fixed.
 */
export function appVersion(): { version: string; build: string } {
  return {
    version: Application.nativeApplicationVersion ?? '-',
    build: Application.nativeBuildVersion ?? '-',
  };
}
