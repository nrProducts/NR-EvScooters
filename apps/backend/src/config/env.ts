import "dotenv/config";

function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

function intFromEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) throw new Error(`${name} must be an integer`);
    return parsed;
}

export const env = {
    nodeEnv: process.env.NODE_ENV ?? "development",
    port: intFromEnv("PORT", 4000),

    supabaseUrl: required("SUPABASE_URL"),
    supabaseServiceKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    supabaseAnonKey: required("SUPABASE_ANON_KEY"),

    /** Private bucket holding KYC files. Must not be public. */
    kycBucket: process.env.KYC_BUCKET ?? "kyc-documents",
    /** Keep in sync with storage.buckets.file_size_limit in the migration. */
    kycMaxFileBytes: intFromEnv("KYC_MAX_FILE_BYTES", 10 * 1024 * 1024),
    /** Lifetime of a minted signed URL, in seconds. Short by design. */
    kycSignedUrlTtlSeconds: intFromEnv("KYC_SIGNED_URL_TTL_SECONDS", 300),

    /** Where an invited user lands to set their password. */
    inviteRedirectUrl: process.env.INVITE_REDIRECT_URL ?? "",
};
