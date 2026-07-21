import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { getSupabase } from './supabase';
import { ApiError } from './ApiError';

/**
 * Google Sign-In as the SECONDARY / recovery login for riders.
 *
 * This uses Supabase's OAuth flow opened in an in-app browser tab, which needs
 * only expo-web-browser + expo-linking (already dependencies) — no native
 * Google SDK and no extra native config beyond the URL scheme. Production apps
 * that want the one-tap native experience can swap this for an ID-token flow
 * (@react-native-google-signin/google-signin) without touching callers, since
 * the repository interface stays the same.
 */
export async function signInWithGoogleBrowser(): Promise<void> {
    const supabase = getSupabase();
    // Deep link back into the app; must be registered in Supabase redirect URLs.
    const redirectTo = Linking.createURL('auth-callback');

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) {
        throw new ApiError(401, 'UNAUTHENTICATED', error?.message ?? 'Could not start Google sign-in.');
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === 'cancel' || result.type === 'dismiss') {
        throw new ApiError(0, 'CANCELLED', 'Google sign-in was cancelled.');
    }
    if (result.type !== 'success' || !result.url) {
        throw new ApiError(401, 'UNAUTHENTICATED', 'Google sign-in did not complete.');
    }

    const code = new URL(result.url).searchParams.get('code');
    if (!code) {
        throw new ApiError(401, 'UNAUTHENTICATED', 'Google sign-in returned no authorization code.');
    }

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
        throw new ApiError(401, 'UNAUTHENTICATED', exchangeError.message);
    }
}
