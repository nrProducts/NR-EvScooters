import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

/**
 * Show a banner even while foregrounded — this is what closes the gap where
 * useMyKyc() has no live refresh, so a rider sitting on the KYC screen when
 * staff approve/reject them would otherwise see nothing until they manually
 * refresh.
 */
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

/**
 * Requests permission and returns an Expo push token, or null if denied /
 * unsupported (simulator, web). Never throws — a rider who declines the
 * permission prompt must still be able to sign in and use the app.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
    try {
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.DEFAULT,
            });
        }

        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;
        if (status !== 'granted') {
            const requested = await Notifications.requestPermissionsAsync();
            status = requested.status;
        }
        if (status !== 'granted') return null;

        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId) return null;

        const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
        return token;
    } catch {
        return null;
    }
}
