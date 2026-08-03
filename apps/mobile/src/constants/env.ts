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
            `Missing ${name}. Add it to apps/mobile/.env (see .env.example) and restart Metro with -c.`,
        );
    }
    return value;
}

/** Names every screen needs before it can talk to the backend. */
export const REQUIRED_ENV_VARS = [
    'EXPO_PUBLIC_API_URL',
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
] as const;

/** The subset of REQUIRED_ENV_VARS that is missing — empty when configured. */
export function missingEnvVars(): string[] {
    return REQUIRED_ENV_VARS.filter((name) => !read(name));
}

export const ENV = {
    // Getters keep the throw lazy, so a missing value surfaces at the call site
    // rather than at module-load time.
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
    /**
     * MapLibre-compatible vector style for the Battery Stations map. Not in
     * REQUIRED_ENV_VARS on purpose: the whole app must not refuse to start
     * because one screen has no tiles. Empty string when unset — that screen
     * renders a "map not configured" notice and keeps its station list usable.
     */
    get mapStyleUrl(): string {
        return read('EXPO_PUBLIC_MAP_STYLE_URL') ?? '';
    },
};
