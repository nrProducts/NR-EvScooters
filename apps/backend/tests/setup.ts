// config/env.ts throws on missing vars by design, so give it plausible values
// before any module under test imports it.
process.env.SUPABASE_URL ??= "http://localhost:54321";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-key";
process.env.KYC_MAX_FILE_BYTES ??= "1048576";
