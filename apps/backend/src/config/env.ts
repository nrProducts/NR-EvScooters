import "dotenv/config";

function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

/**
 * Empty string in dev, hard failure at boot in production.
 *
 * Fail-fast is the whole value: a payment secret that is missing must stop
 * the process, not degrade the behaviour of the money path at runtime.
 */
function requiredInProduction(name: string): string {
    const value = process.env[name] ?? "";
    if (!value && process.env.NODE_ENV === "production") {
        throw new Error(`Missing required environment variable in production: ${name}`);
    }
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

    // --- KYC field encryption (see common/fieldCrypto.ts) -----------------
    // Deliberately optional/empty-default, never `required(...)`: the app must
    // still boot in dev with no keys configured. The KYC paths throw a clear
    // error at call time instead. The two secrets must be different — one
    // decrypts, the other only searches, and that separation is the point.
    // Generate each with: openssl rand -base64 32
    /** AES-256-GCM key for `kyc_documents.document_number_encrypted`. */
    kycEncryptionKey: process.env.KYC_ENCRYPTION_KEY ?? "",
    /** HMAC-SHA256 pepper for the `document_number_hmac` blind index. */
    kycHmacPepper: process.env.KYC_HMAC_PEPPER ?? "",

    /** Private bucket holding rider profile photos. Must not be public. */
    profilePhotoBucket: process.env.PROFILE_PHOTO_BUCKET ?? "profile-photos",
    /** Keep in sync with storage.buckets.file_size_limit in the migration. */
    profilePhotoMaxFileBytes: intFromEnv("PROFILE_PHOTO_MAX_FILE_BYTES", 10 * 1024 * 1024),

    /** Private bucket holding physical-vehicle condition/inspection photos. Must not be public. */
    vehiclePhotoBucket: process.env.VEHICLE_PHOTO_BUCKET ?? "vehicle-photos",
    /** Keep in sync with storage.buckets.file_size_limit in the migration. */
    vehiclePhotoMaxFileBytes: intFromEnv("VEHICLE_PHOTO_MAX_FILE_BYTES", 10 * 1024 * 1024),

    // --- Geocoding proxy -------------------------------------------------
    // Riders used to call this third-party endpoint straight from the handset
    // with their exact coordinates, which meant an undisclosed disclosure of
    // precise location to a processor we had no contract with, no log of, and
    // no way to stop. Proxied here so it is logged, contractable and coarsened.
    /** Photon-compatible search endpoint, e.g. https://photon.komoot.io/api. */
    geocodeUrl: process.env.GEOCODE_URL ?? "",
    /** Upstream timeout. An area lookup is a convenience, not a dependency. */
    geocodeTimeoutMs: intFromEnv("GEOCODE_TIMEOUT_MS", 6000),
    /**
     * Decimal places kept on the location bias sent upstream. 2 dp is roughly
     * 1 km — enough to disambiguate "Nagar" in Chennai from a namesake three
     * states away, and far too coarse to identify a person or an address.
     */
    geocodeBiasPrecision: intFromEnv("GEOCODE_BIAS_PRECISION", 2),

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

    // --- Razorpay (payment gateway) -----------------------------------
    // Optional in dev so the app still boots with no keys configured;
    // anything that needs them throws a clean 503 at call time — see
    // config/razorpay.ts.
    //
    // MANDATORY in production, and that asymmetry is the point. These used
    // to be plain optional everywhere, and a separate "gateway not
    // configured" branch in payments.service.ts settled the order as PAID
    // with a fabricated payment id when they were blank. A missing secret in
    // a production deploy therefore handed out free rentals silently. The
    // mock branch is gone; this is what stops the same deploy from merely
    // failing later and less legibly.
    razorpayKeyId: requiredInProduction("RAZORPAY_KEY_ID"),
    razorpayKeySecret: requiredInProduction("RAZORPAY_KEY_SECRET"),
    razorpayWebhookSecret: requiredInProduction("RAZORPAY_WEBHOOK_SECRET"),

    /**
     * DEVELOPMENT ONLY — makes refund payouts testable without a gateway that
     * will actually pay out. `off` (the default) is the only value with any
     * effect in production, because config/razorpay.ts's
     * `resolveRefundSimulation` refuses every other value when NODE_ENV is
     * production or the key is a `rzp_live_` one.
     *
     * Read the raw string here rather than validating it: an unknown value
     * must not stop the server booting, and the resolver is where the
     * safety rules live so there is one place to read them.
     *
     *   off        — real gateway call (default)
     *   success    — payout settles immediately
     *   processing — payout accepted, awaiting the (never-arriving) webhook
     *   fail       — gateway rejects the payout
     *
     * A simulated payout is stamped `sim_refund_<uuid>` and audited with
     * `simulated: true`, so it is never mistakable for real money leaving —
     * which is the failure the deleted mock branch caused (see
     * refunds.service.ts).
     */
    refundSimulationMode: process.env.REFUND_SIMULATION_MODE ?? "off",

    /**
     * How long a checkout session stays collectable. Matches the vehicle hold
     * (BOOKING_PAYMENT_GRACE_MINUTES) by default so the order and the scooter
     * reservation expire together — an order outliving its hold would send a
     * rider to Checkout for a scooter already given away.
     */
    paymentOrderTtlMinutes: intFromEnv(
        "PAYMENT_ORDER_TTL_MINUTES",
        intFromEnv("BOOKING_PAYMENT_GRACE_MINUTES", 30),
    ),

    /** Default security deposit when a plan doesn't override it, in rupees. */
    defaultDepositAmount: intFromEnv("DEFAULT_DEPOSIT_AMOUNT", 2000),
    /** Minutes a `pending_payment` booking is held before the expiry sweep releases its vehicle. */
    bookingPaymentGraceMinutes: intFromEnv("BOOKING_PAYMENT_GRACE_MINUTES", 30),
    /** Hours a rider has to dispute a recorded damage before the refund-eligibility sweep ignores it. */
    damageDisputeWindowHours: intFromEnv("DAMAGE_DISPUTE_WINDOW_HOURS", 72),
    /** Days after vehicle return before a held deposit becomes refund-eligible. */
    depositRefundEligibilityDays: intFromEnv("DEPOSIT_REFUND_ELIGIBILITY_DAYS", 15),

    // --- Email (transactional notifications) ------------------------------
    // Deliberately optional/empty-default, never `required(...)`: the app
    // must still boot in dev with no key configured. Anything that actually
    // needs it throws a clear error at call time — see config/resend.ts.
    emailProvider: process.env.EMAIL_PROVIDER ?? "resend",
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    emailFrom: process.env.EMAIL_FROM ?? "",
    /** Base URL of the admin console, for email CTA links. */
    adminAppUrl: process.env.ADMIN_APP_URL ?? "",
    /**
     * Where the public website's contact-form queries are delivered. Defaulted
     * rather than required so the endpoint works out of the box and a blank
     * env var can't silently send enquiries nowhere.
     */
    contactInboxEmail: process.env.CONTACT_INBOX_EMAIL ?? "contact@swapngo.in",
};
