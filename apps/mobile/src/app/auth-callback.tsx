import { useEffect } from 'react';
import { Platform, View, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { COLORS } from '../constants/theme';

/**
 * Web-only landing point for the Google OAuth popup. openAuthSessionAsync on
 * web opens a real popup and waits for this page to call
 * maybeCompleteAuthSession(), which postMessages the final URL back to the
 * opener tab and closes the popup. Never reached on native — the OS
 * intercepts the nrevscooters:// deep link before expo-router sees it.
 */
export default function AuthCallback() {
    useEffect(() => {
        if (Platform.OS === 'web') {
            WebBrowser.maybeCompleteAuthSession();
        }
    }, []);

    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background }}>
            <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
    );
}
