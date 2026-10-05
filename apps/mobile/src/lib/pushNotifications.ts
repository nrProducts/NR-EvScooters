import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

/**
 * Foreground delivery renders through our own NotificationToastHost popup
 * now (see components/NotificationToastCard.tsx), not the OS banner —
 * shouldShowBanner:true would double them up on iOS, where the system banner
 * can still appear over a foregrounded app (Android already suppresses its
 * own heads-up banner in that case). shouldShowList stays true so the
 * notification still lands in the OS shade/history either way.
 */
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: false,
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
        console.log('[push] permission status:', status);
        if (status !== 'granted') return null;

        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId) {
            console.warn('[push] no EAS projectId configured — cannot request a push token');
            return null;
        }

        const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
        console.log('[push] token generated:', token);
        return token;
    } catch (err) {
        console.warn('[push] registerForPushNotificationsAsync failed', err);
        return null;
    }
}
