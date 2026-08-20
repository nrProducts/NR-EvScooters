import { supabase } from "@/lib/supabaseClient";
import { apiClient, ApiError } from "./httpClient";
import type {
  BackendRoleName, ModulePermission, PermissionKey, Role, StaffUser,
} from "@/types";

/**
 * GET /auth/session.
 *
 * `roles: BackendRoleName[]` became `role`, because `users.role` is one
 * column now — the `roles`/`user_roles` join is gone, and with it the two
 * role names (`technician`, `station_manager`) that had no distinct grants
 * behind them.
 *
 * `capabilities` is gone too. `kyc_reviewer`, `rights_officer` and
 * `pii_exporter` are ordinary permissions now, so they arrive inside
 * `permission_keys` alongside everything else rather than on their own axis.
 */
interface SessionResponse {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  profile_photo_url: string | null;
  role: BackendRoleName;
  is_admin: boolean;
  /** null = unrestricted (admin). Array = exact granted module+action pairs (staff). */
  permissions: ModulePermission[] | null;
  /** The same grants flattened to `"<module>.<action>"`. Empty for admin. */
  permission_keys: PermissionKey[];
  /** True for a staff account still on its admin-issued temporary password — gates every route to /change-password until cleared. */
  must_change_password: boolean;
}

/** One place to build the client-side user, so login and refresh cannot drift. */
function toStaffUser(session: SessionResponse, role: Role): StaffUser {
  return {
    id: session.id,
    name: session.full_name || session.email || "Unnamed",
    email: session.email ?? "",
    phone: session.phone ?? undefined,
    avatarUrl: session.profile_photo_url ?? undefined,
    role,
    backendRole: session.role,
    permissions: session.permissions,
    permissionKeys: session.permission_keys ?? [],
    mustChangePassword: session.must_change_password,
  };
}

/**
 * Narrows the backend role to what the console's nav and route guards use.
 *
 * Very nearly a pass-through now: `rider` is the only value that cannot open
 * the console, and the "does this account hold any of four staff-ish roles?"
 * scan is gone with the roles it scanned.
 */
function resolveRole(role: BackendRoleName): Role | null {
  if (role === "admin") return "admin";
  if (role === "staff") return "staff";
  return null;
}

/**
 * Shared by every path that ends with a live Supabase session (password
 * login, forgot-password reset): once Supabase Auth has a session
 * established, GET /auth/session tells us the caller's real roles so we can
 * gate the console — a rider account that reaches this login screen is
 * rejected here, same as the mobile app.
 */
export async function resolveStaffSession(): Promise<StaffUser> {
  let session: SessionResponse;
  try {
    session = await apiClient.get<SessionResponse>("/auth/session");
  } catch (err) {
    await supabase.auth.signOut();
    throw err;
  }

  const role = resolveRole(session.role);
  if (!role) {
    await supabase.auth.signOut();
    throw new ApiError(
      "This account doesn't have staff or admin access. Riders should use the mobile app.",
      403,
      "FORBIDDEN",
    );
  }

  return toStaffUser(session, role);
}

/** True for anything that looks like an email rather than a phone number. */
function looksLikeEmail(identifier: string): boolean {
  return identifier.includes("@");
}

/**
 * Same pattern as apps/mobile's admin-login screen:
 * supabase.auth.signInWithPassword(...) establishes the session directly
 * against Supabase Auth (the Express API never brokers login — see
 * docs/auth/README.md). Accepts either an email or a phone number in the
 * same field — Supabase's signInWithPassword takes exactly one of
 * {email} or {phone}, so this detects which was typed and sends that.
 * Only works for accounts created after phone was added to auth.users at
 * creation time (see users.service.ts createUser()/selfSignUpStaff()) —
 * older accounts created before that change won't have a phone on record.
 */
export async function login(identifier: string, password: string): Promise<StaffUser> {
  const trimmed = identifier.trim();
  const { error } = looksLikeEmail(trimmed)
    ? await supabase.auth.signInWithPassword({ email: trimmed.toLowerCase(), password })
    : await supabase.auth.signInWithPassword({ phone: trimmed.replace(/[\s()-]/g, ""), password });
  if (error) throw new ApiError(error.message, 401, "UNAUTHENTICATED");

  return resolveStaffSession();
}

export async function fetchCurrentSession(): Promise<StaffUser | null> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;

  try {
    const session = await apiClient.get<SessionResponse>("/auth/session");
    const role = resolveRole(session.role);
    if (!role) return null;
    return toStaffUser(session, role);
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

/**
 * Clears must_change_password server-side. Called after EITHER a forced
 * first-login change (admin-issued temp password) or a self-service
 * forgot-password reset actually sets a new password — the flag means "this
 * account has never had a password its owner actually chose," so any path
 * that ends in supabase.auth.updateUser({ password }) should clear it.
 */
export async function completePasswordChange(): Promise<void> {
  await apiClient.post("/auth/complete-password-change");
}

/** Sends the Supabase password-reset email; redirectTo lands on ResetPasswordPage with a recovery session already established. */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw new ApiError(error.message, 400, "RESET_REQUEST_FAILED");
}

/** Called from ResetPasswordPage once the rider is on a Supabase-established recovery session (from the emailed link). */
export async function confirmPasswordReset(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new ApiError(error.message, 400, "RESET_FAILED");
  await completePasswordChange();
}

export interface StaffSignupInput {
  full_name: string;
  email: string;
  phone: string;
  password: string;
}

/**
 * POST /auth/signup — public, no Supabase session involved. Always lands as
 * an inactive `staff` account with zero permissions; an admin must activate
 * it from Staff Access before it can sign in. See users.service.ts
 * selfSignUpStaff() on the backend.
 */
export async function signUp(input: StaffSignupInput): Promise<{ full_name: string; email: string }> {
  return apiClient.post<{ full_name: string; email: string }>("/auth/signup", input);
}
