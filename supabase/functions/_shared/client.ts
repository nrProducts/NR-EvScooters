// =========================================================================
// _shared/client — environment, admin client, JSON response
//
// Every scheduled function opened with the same twelve lines: read two env
// vars, build a service-role client, define a `json()` helper. They are here
// once instead of eleven times.
//
// Deno Edge Functions each deploy standalone and cannot import the Node
// backend's TypeScript, which is why these files re-implement backend logic
// rather than importing it. That constraint does NOT extend to each other —
// `_shared` is bundled into every function that imports from it.
// =========================================================================

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
export const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export type Admin = SupabaseClient;

export function isConfigured(): boolean {
    return !!SUPABASE_URL && !!SERVICE_ROLE;
}

export function adminClient(): Admin {
    return createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

export function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

export function notConfigured(): Response {
    return json({ error: "Function not configured." }, 500);
}
