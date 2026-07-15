import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Service-role client: full DB access, bypasses RLS. Use ONLY server-side.
export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});