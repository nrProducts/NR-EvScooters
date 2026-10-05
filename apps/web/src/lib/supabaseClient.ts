import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Loud but non-fatal: lets the rest of the app render so the error is
  // visible in the login screen instead of a blank white page.
  console.error(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — copy .env.example to .env and fill them in.",
  );
}

/**
 * Same sign-in pattern as apps/mobile/src/lib/supabase.ts:
 * supabase.auth.signInWithPassword({ email, password }) directly against
 * Supabase Auth. The Express API (apps/backend) never brokers login — it's a
 * resource server that verifies the resulting JWT (see docs/auth/README.md).
 */
export const supabase = createClient<Database>(url ?? "", anonKey ?? "");
