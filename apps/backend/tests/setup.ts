// config/env.ts throws on missing vars by design, so give it plausible values
// before any module under test imports it.
process.env.SUPABASE_URL ??= "http://localhost:54321";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-key";
process.env.KYC_MAX_FILE_BYTES ??= "1048576";

// Email OFF for every test, unconditionally.
//
// Not `??=`: a developer's real .env is loaded by config/env.ts (dotenv), and
// with a live RESEND_API_KEY present the contact-form tests reached the actual
// Resend API — the suite started depending on the network, and would have
// mailed contact@swapngo.in for real once the sending domain is verified.
// dotenv does not overwrite keys already on process.env, and "" counts as
// present, so assigning here wins.
process.env.RESEND_API_KEY = "";
process.env.EMAIL_FROM = "";
