import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
import type { Database } from "../types/database.types";

// Service-role client: full DB access, bypasses RLS. Use ONLY server-side.
export const supabaseAdmin = createClient<Database>(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});