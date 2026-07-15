import "dotenv/config";

export const env = {
    port: process.env.PORT || 4000,
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY!,
};