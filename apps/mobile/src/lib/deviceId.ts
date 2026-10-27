import { Platform } from 'react-native';
import * as Application from 'expo-application';

/**
 * The device identifier recorded with a Terms acceptance or consent grant.
 *
 * The Terms' execution block tells the rider their device ID is recorded at
 * acceptance, and legal_acceptances / consent_records have a column for it —
 * but nothing was sending one, so the evidence row was always missing it.
 *
 * Android ID on Android, identifierForVendor on iOS; undefined on web or if
 * the platform refuses. Best-effort: a missing id must never block the rider
 * from accepting, it only weakens the record.
 */
export async function deviceId(): Promise<string | undefined> {
    try {
        if (Platform.OS === 'android') return Application.getAndroidId() || undefined;
        if (Platform.OS === 'ios') return (await Application.getIosIdForVendorAsync()) ?? undefined;
    } catch {
        // Fall through — see above.
    }
    return undefined;
}
