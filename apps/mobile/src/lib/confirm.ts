import { Alert, Platform } from 'react-native';

/**
 * react-native-web's Alert.alert() is a total no-op (`static alert() {}`),
 * so any confirm/notify flow built on it silently does nothing when running
 * on web. These fall back to window.confirm/alert there, and use the real
 * native Alert on iOS/Android.
 */

interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    destructive?: boolean;
}

/** Resolves true if the user confirmed, false if they cancelled/dismissed. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
    if (Platform.OS === 'web') {
        return Promise.resolve(window.confirm(`${options.title}\n\n${options.message}`));
    }
    return new Promise((resolve) => {
        Alert.alert(options.title, options.message, [
            { text: options.cancelLabel ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            {
                text: options.confirmLabel,
                style: options.destructive ? 'destructive' : 'default',
                onPress: () => resolve(true),
            },
        ]);
    });
}

/** A dismiss-only message. */
export function notify(title: string, message?: string): void {
    if (Platform.OS === 'web') {
        window.alert(message ? `${title}\n\n${message}` : title);
        return;
    }
    Alert.alert(title, message);
}
