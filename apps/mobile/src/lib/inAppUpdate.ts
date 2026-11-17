import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import type { AndroidInAppUpdateExtras } from 'sp-react-native-in-app-updates';
import { confirmAction } from './confirm';
import { askedRecently, isNewerBuild } from './updateRules';

/**
 * Optional "a new version is available" prompt, using Google Play's own
 * in-app update flow (Android only; iOS and web are not offered it).
 *
 *   1. On launch, ask Play whether a newer build is published.
 *   2. If so, Play shows its "Update / No thanks" sheet and, on Update,
 *      downloads in the background while the rider keeps using the app.
 *   3. When the download finishes, a themed prompt offers "Restart to update".
 *
 * It is a nudge, not a gate: declining costs nothing, and a rider who ignores
 * it is asked again no sooner than ASK_EVERY_MS later. It does nothing in
 * builds not installed from Play (dev builds, sideloaded APKs), where Play
 * reports no update. Never throws: an update check must not be able to break
 * app start.
 */
const LAST_ASKED_KEY = 'in_app_update:last_asked';

export interface UpdateCopy {
  readyTitle: string;
  readyMessage: string;
  restart: string;
  later: string;
}

export async function checkForAppUpdate(copy: UpdateCopy): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const installed = Application.nativeBuildVersion;
    if (!installed) return;

    const lastAsked = await AsyncStorage.getItem(LAST_ASKED_KEY).catch(() => null);
    if (askedRecently(lastAsked)) return;

    // Loaded here, not at the top of the file: the module needs the native
    // side, which a web build and the test runner do not have.
    const { default: SpInAppUpdates, AndroidUpdateType, AndroidInstallStatus } =
      await import('sp-react-native-in-app-updates');
    const updates = new SpInAppUpdates(false);

    const result = await updates.checkNeedsUpdate({
      curVersion: installed,
      // Play reports a versionCode, so compare build numbers, not "1.0.0".
      customVersionComparator: (store, current) => (isNewerBuild(store, current) ? 1 : 0),
    });
    const play = result.other as AndroidInAppUpdateExtras;
    if (!result.shouldUpdate || !play.isFlexibleUpdateAllowed) return;

    await AsyncStorage.setItem(LAST_ASKED_KEY, new Date().toISOString()).catch(() => undefined);

    const onStatus = (status: { status: number }) => {
      if (status.status !== AndroidInstallStatus.DOWNLOADED) return;
      updates.removeStatusUpdateListener(onStatus);
      void confirmAction({
        title: copy.readyTitle,
        message: copy.readyMessage,
        confirmLabel: copy.restart,
        cancelLabel: copy.later,
      }).then((restart) => {
        // "Later" is fine: Play installs it the next time the app closes.
        if (restart) updates.installUpdate();
      });
    };
    updates.addStatusUpdateListener(onStatus);

    await updates.startUpdate({ updateType: AndroidUpdateType.FLEXIBLE });
  } catch (err) {
    console.warn('[update] check failed:', err instanceof Error ? err.message : err);
  }
}
