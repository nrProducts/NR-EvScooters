import Constants from 'expo-constants';

/**
 * Only EXPO_PUBLIC_* variables are inlined into the bundle, and everything in
 * the bundle is readable by anyone with the APK. Nothing secret belongs here —
 * the Supabase ANON key is safe (RLS constrains it); the SERVICE ROLE key
 * never is.
 */

/**
 * Every EXPO_PUBLIC_* value the app reads, as ONE STATIC REFERENCE EACH.
 *
 * This shape is load-bearing, not stylistic. babel-preset-expo inlines these
 * by textually substituting *static* `process.env.EXPO_PUBLIC_X` member
 * expressions at transform time. A computed access — `process.env[name]` —
 * is invisible to that transform: nothing is substituted, and because a
 * release bundle has no populated `process.env` at runtime either, the value
 * is simply absent.
 *
 * That is exactly what this file used to do, and the failure mode was silent
 * and release-only: Metro's dev server DOES populate process.env at runtime,
 * so development worked perfectly, while every standalone/release build read
 * undefined for all three required vars and rendered the "App not configured"
 * screen instead of the app. Verified by grepping the exported Hermes bundle —
 * before this change it contained the variable NAMES and none of the VALUES.
 *
 * So: never collapse these into a loop, a computed lookup, or a helper that
 * takes the name as a parameter. One literal `process.env.EXPO_PUBLIC_*` per
 * line is the whole point. Adding a new variable means adding a line here.
 */
const INLINED: Record<string, string | undefined> = {
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_MAP_STYLE_URL: process.env.EXPO_PUBLIC_MAP_STYLE_URL,
    EXPO_PUBLIC_GEOCODE_URL: process.env.EXPO_PUBLIC_GEOCODE_URL,
};

function read(name: string): string | undefined {
    const fromEnv = INLINED[name];
    // `||` rather than `??`: an unset EXPO_PUBLIC_* var can inline as the
    // empty string as well as undefined, and "" is not a usable URL or key —
    // it must fall through to `extra` (populated by app.config.js) the same
    // way a missing value does.
    return fromEnv || (Constants.expoConfig?.extra as Record<string, string> | undefined)?.[name] || undefined;
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
    /**
     * Photon-compatible geocoding endpoint, used to turn an area name typed
     * into the map's search box ("Adyar") into coordinates so nearby stations
     * can be recommended. Keyless by design, like the tile style.
     *
     * Optional, and for the same reason as mapStyleUrl: unset simply means the
     * search box keeps matching station names and QIS IDs, which is what it
     * did before area search existed.
     *
     * Photon specifically because it is built for type-ahead and accepts a
     * lat/lon bias; Nominatim's usage policy explicitly discourages
     * per-keystroke querying. Self-hosting Photon is the production answer if
     * the public instance is too slow or too restrictive.
     */
    get geocodeUrl(): string {
        return read('EXPO_PUBLIC_GEOCODE_URL') ?? '';
    },
};
