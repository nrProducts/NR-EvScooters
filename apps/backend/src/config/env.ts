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

    /** Private bucket holding rider profile photos. Must not be public. */
    profilePhotoBucket: process.env.PROFILE_PHOTO_BUCKET ?? "profile-photos",
    /** Keep in sync with storage.buckets.file_size_limit in the migration. */
    profilePhotoMaxFileBytes: intFromEnv("PROFILE_PHOTO_MAX_FILE_BYTES", 10 * 1024 * 1024),

    /** Where an invited user lands to set their password. */
    inviteRedirectUrl: process.env.INVITE_REDIRECT_URL ?? "",

    // --- MSG91 (delivery for the /auth/otp/test diagnostic; mirrors the
    //     send-sms Edge Function that actually delivers login OTPs) ---------
    msg91AuthKey: process.env.MSG91_AUTH_KEY ?? "",
    msg91OtpTemplateId: process.env.MSG91_OTP_TEMPLATE_ID ?? "",
    msg91SenderId: process.env.MSG91_SENDER_ID ?? "",
    /** Name of the OTP variable in the MSG91 Flow/DLT template. */
    msg91OtpVar: process.env.MSG91_OTP_VAR ?? "otp",
    msg91BaseUrl: process.env.MSG91_BASE_URL ?? "https://control.msg91.com",
};
