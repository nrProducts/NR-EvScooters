import Constants from 'expo-constants';

/**
 * Only EXPO_PUBLIC_* variables are inlined into the bundle, and everything in
 * the bundle is readable by anyone with the APK. Nothing secret belongs here —
 * the Supabase ANON key is safe (RLS constrains it); the SERVICE ROLE key
 * never is.
 */
function read(name: string): string | undefined {
    const fromEnv = process.env[name];
    const fromExtra = (Constants.expoConfig?.extra as Record<string, string> | undefined)?.[name];
    return fromEnv ?? fromExtra ?? undefined;
}

function required(name: string): string {
    const value = read(name);
    if (!value) {
        throw new Error(
            `Missing ${name}. Add it to apps/mobile/.env (see .env.example) and restart Metro with -c. ` +
            `To run without a backend instead, set EXPO_PUBLIC_USE_MOCK=true.`,
        );
    }
    return value;
}

/**
 * Mock mode swaps the repository implementations for in-memory ones, so every
 * screen runs with no backend, no Supabase project and no network. Default is
 * true until the API is deployed — flip to false in .env to go live.
 */
export const USE_MOCK = (read('EXPO_PUBLIC_USE_MOCK') ?? 'true').toLowerCase() === 'true';

export const ENV = {
    useMock: USE_MOCK,

    // Only read when USE_MOCK is false — getters keep the throw lazy so mock
    // mode never demands credentials it won't use.
    get supabaseUrl(): string {
        return required('EXPO_PUBLIC_SUPABASE_URL');
    },
    get supabaseAnonKey(): string {
        return required('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    },
    /** Base URL of the Express backend, including /api/v1. */
    get apiUrl(): string {
        return required('EXPO_PUBLIC_API_URL');
    },
};
