import { supabase } from "@/lib/supabaseClient";
import { apiClient, ApiError } from "./httpClient";
import type { BackendRoleName, ModuleKey, Role, StaffUser } from "@/types";

const STAFF_ROLES: BackendRoleName[] = ["staff", "technician", "station_manager", "admin"];

interface SessionResponse {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  profile_photo_url: string | null;
  roles: BackendRoleName[];
  is_admin: boolean;
  /** null = unrestricted (admin). Array = exact granted module keys (staff). */
  permissions: ModuleKey[] | null;
}

function resolveRole(roles: BackendRoleName[]): Role | null {
  if (roles.includes("admin")) return "admin";
  if (roles.some((r) => STAFF_ROLES.includes(r))) return "staff";
  return null;
}

/**
 * Shared by password and Google login: once Supabase Auth has a session
 * established, GET /auth/session tells us the caller's real roles so we can
 * gate the console — a rider account that reaches this login screen is
 * rejected here, same as the mobile app.
 */
async function resolveStaffSession(): Promise<StaffUser> {
  let session: SessionResponse;
  try {
    session = await apiClient.get<SessionResponse>("/auth/session");
  } catch (err) {
    await supabase.auth.signOut();
    throw err;
  }

  const role = resolveRole(session.roles);
  if (!role) {
    await supabase.auth.signOut();
    throw new ApiError(
      "This account doesn't have staff or admin access. Riders should use the mobile app.",
      403,
      "FORBIDDEN",
    );
  }

  return {
    id: session.id,
    name: session.full_name || session.email || "Unnamed",
    email: session.email ?? "",
    phone: session.phone ?? undefined,
    avatarUrl: session.profile_photo_url ?? undefined,
    role,
    roles: session.roles,
    permissions: session.permissions,
  };
}

/**
 * Same pattern as apps/mobile's admin-login screen:
 * supabase.auth.signInWithPassword(...) establishes the session directly
 * against Supabase Auth (the Express API never brokers login — see
 * docs/auth/README.md).
 */
export async function login(email: string, password: string): Promise<StaffUser> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new ApiError(error.message, 401, "UNAUTHENTICATED");

  return resolveStaffSession();
}

/**
 * Kicks off Supabase's browser OAuth flow — a full-page redirect to Google,
 * then back to /auth/callback. Unlike the mobile app (which needs an in-app
 * browser tab + manual code exchange), the web client's detectSessionInUrl
 * default handles the PKCE code exchange for us on return; AuthCallbackPage
 * just waits for the session to land and calls completeGoogleLogin().
 *
 * Requires the Google provider to be enabled in Supabase Auth (Dashboard ->
 * Authentication -> Providers) and this app's origin + /auth/callback added
 * to Auth -> URL Configuration -> Redirect URLs.
 */
export async function loginWithGoogle(): Promise<void> {
  const redirectTo = `${window.location.origin}/auth/callback`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) throw new ApiError(error.message, 401, "UNAUTHENTICATED");
}

/** Called from AuthCallbackPage once Supabase reports a session after the Google redirect. */
export async function completeGoogleLogin(): Promise<StaffUser> {
  return resolveStaffSession();
}

export async function fetchCurrentSession(): Promise<StaffUser | null> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;

  try {
    const session = await apiClient.get<SessionResponse>("/auth/session");
    const role = resolveRole(session.roles);
    if (!role) return null;
    return {
      id: session.id,
      name: session.full_name || session.email || "Unnamed",
      email: session.email ?? "",
      phone: session.phone ?? undefined,
      avatarUrl: session.profile_photo_url ?? undefined,
      role,
      roles: session.roles,
      permissions: session.permissions,
    };
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post("/auth/logout");
  } catch {
    // best-effort — still clear the local Supabase session below
  }
  await supabase.auth.signOut();
}
