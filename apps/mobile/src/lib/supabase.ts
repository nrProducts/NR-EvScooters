import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ENV } from '../constants/env';

/**
 * SecureStore rejects values over ~2048 bytes, and a Supabase session (access
 * token + refresh token + user metadata) routinely exceeds that. This adapter
 * splits the value into chunks and keeps a small index entry pointing at them,
 * so the session stays in the OS keychain/keystore rather than in plaintext
 * AsyncStorage.
 */
const CHUNK_SIZE = 1800;
const chunkKey = (key: string, index: number) => `${key}__${index}`;

const LargeSecureStore = {
    async getItem(key: string): Promise<string | null> {
        const meta = await SecureStore.getItemAsync(key);
        if (!meta) return null;

        const count = Number.parseInt(meta, 10);
        if (Number.isNaN(count)) return meta; // written before chunking

        const parts: string[] = [];
        for (let i = 0; i < count; i++) {
            const part = await SecureStore.getItemAsync(chunkKey(key, i));
            if (part === null) return null; // torn write — treat as no session
            parts.push(part);
        }
        return parts.join('');
    },

    async setItem(key: string, value: string): Promise<void> {
        await LargeSecureStore.removeItem(key);
        const chunks: string[] = [];
        for (let i = 0; i < value.length; i += CHUNK_SIZE) {
            chunks.push(value.slice(i, i + CHUNK_SIZE));
        }
        for (let i = 0; i < chunks.length; i++) {
            await SecureStore.setItemAsync(chunkKey(key, i), chunks[i]!);
        }
        await SecureStore.setItemAsync(key, String(chunks.length));
    },

    async removeItem(key: string): Promise<void> {
        const meta = await SecureStore.getItemAsync(key);
        if (meta) {
            const count = Number.parseInt(meta, 10);
            if (!Number.isNaN(count)) {
                for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
            }
        }
        await SecureStore.deleteItemAsync(key);
    },
};

let client: SupabaseClient | null = null;

/**
 * Created on first use, never at module load. ENV.supabaseUrl throws when the
 * credentials are absent, so eager construction would crash the app in mock
 * mode — where no Supabase project exists by design.
 */
export function getSupabase(): SupabaseClient {
    if (client) return client;

    client = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
        auth: {
            storage: Platform.OS === 'web' ? undefined : LargeSecureStore,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false, // no URL to parse a session out of natively
        },
    });
    return client;
}

/** Fresh access token for the API layer, refreshed by supabase-js if needed. */
export async function getAccessToken(): Promise<string | null> {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? null;
}
