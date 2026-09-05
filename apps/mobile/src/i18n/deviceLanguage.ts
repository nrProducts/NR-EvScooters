import { NativeModules, Platform } from 'react-native';
import { normaliseLocale } from './localeMapping';
import type { Lang } from './types';

export { normaliseLocale } from './localeMapping';

/**
 * The device's language, mapped onto what the app actually speaks.
 *
 * Read off the platform directly rather than through expo-localization, which
 * is not a dependency of this app and would be a native module added for one
 * string. Both values below are plain JS constants the RN bridge already
 * exposes, so this works in Expo Go, a dev client and a release build alike.
 */
function rawDeviceLocale(): string | null {
    try {
        if (Platform.OS === 'ios') {
            const settings = NativeModules.SettingsManager?.settings;
            const locale: unknown =
                settings?.AppleLocale ??
                (Array.isArray(settings?.AppleLanguages) ? settings.AppleLanguages[0] : undefined);
            return typeof locale === 'string' ? locale : null;
        }
        if (Platform.OS === 'android') {
            const locale: unknown = NativeModules.I18nManager?.localeIdentifier;
            return typeof locale === 'string' ? locale : null;
        }
        // Web / Expo web preview.
        const nav = (globalThis as { navigator?: { language?: string } }).navigator;
        return typeof nav?.language === 'string' ? nav.language : null;
    } catch {
        // A missing native module must never stop the app booting over a
        // preference that has a perfectly good default.
        return null;
    }
}

export function detectDeviceLanguage(): Lang {
    return normaliseLocale(rawDeviceLocale());
}
