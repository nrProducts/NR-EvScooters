import type { ApiMe } from '../types/api';

/**
 * This app is rider-only — the admin/staff console is apps/web. Every account
 * that signs in here follows the rider flow, including staff ones; there is no
 * privileged surface left to gate.
 *
 * "booking" covers booking/[modelId] (the whole book+pay flow is one screen),
 * and "battery-stations" covers both its index and [id] — Expo Router reports
 * a route's top-level segment name, not the file's bracketed param.
 *
 * Any segment missing here is silently replace()d to /home by the guard below,
 * with no error — which is exactly how /billing stayed unreachable from the
 * drawer. Add the segment whenever a screen is added under src/app.
 */
const RIDER_ROUTES = [
  "home", "my-scooter", "my-plan", "billing", "support", "kyc", "kyc-intro",
  "browse-vehicles", "booking", "notifications", "booking-history",
  "battery-stations", "profile",
  // DPDPA. "privacy" covers privacy/index, notice, requests, [id] and nominee.
  "consent", "privacy",
  // The rental agreement, readable any time from Profile. Acceptance itself
  // happens on the consent screen, not here.
  "terms",
  // Replayed from Profile ("How Swapngo Works") while signed in — see the
  // !hasSeenOnboarding gate below for the signed-out first-run case, which
  // doesn't rely on this list at all.
  "onboarding",
  // Re-opened from Profile → Language at any time. The first-launch pass is
  // handled by its own gate below, ahead of onboarding, and does not rely on
  // this list.
  "language",
  // +not-found.tsx — any URL that matches no route. Allowed so the rider sees
  // its "page not found" message and a way home, rather than a silent jump.
  "+not-found",
];
// Screens reachable while signed OUT (the login surface).
const AUTH_ROUTES = ["index", "otp-verify", "auth-callback"];

export interface RootRouteState {
  /** expo-router's useSegments(). */
  segments: string[];
  langChosen: boolean;
  hasSeenOnboarding: boolean;
  signedIn: boolean;
  profile: Pick<
    ApiMe,
    'role' | 'profile_completed' | 'consent_up_to_date' | 'terms_up_to_date' | 'kyc_status'
  > | null;
  hasSeenKycIntro: boolean;
}

/**
 * Where the root layout must send the rider from the screen they are on, or
 * null when that screen is already right (or, signed in with no profile yet,
 * when there is nowhere to send them until GET /users/me answers).
 *
 * A pure function so the root layout can use the SAME answer twice: to
 * navigate, and to keep a loading cover over the screen until it has — a
 * screen that is about to be replaced must never be shown on its way out.
 */
export function resolveRootRedirect(state: RootRouteState): string | null {
  const { segments: rawSegs, langChosen, hasSeenOnboarding, signedIn, profile, hasSeenKycIntro } = state;

  // The (tabs) group wraps Home/My Scooter/Billing/Stations/Profile
  // for the bottom tab bar, and doesn't affect any route's URL — but
  // useSegments() DOES include the group name literally (["(tabs)","home"],
  // not ["home"]), so this unwraps it before comparing against
  // RIDER_ROUTES/AUTH_ROUTES, exactly as if the group didn't exist.
  const current = rawSegs[0] === "(tabs)" ? (rawSegs[1] ?? "home") : (rawSegs[0] ?? "index");
  const atAuthScreen = rawSegs.length === 0 || AUTH_ROUTES.includes(current);

  // Language comes before EVERYTHING, onboarding included: onboarding is
  // three screens of prose, and showing it in a language the rider cannot
  // read is the one failure this whole feature exists to prevent. The gate
  // is on `chosen`, not on the language being set — the app always has a
  // language (guessed from the device locale, else English), so anything
  // weaker than "the rider actually picked" would skip the picker on a
  // Tamil phone and silently decide for them.
  if (!langChosen) {
    return current !== "language" ? "/language" : null;
  }

  // Device has never completed onboarding — takes priority over everything
  // else, signed in or not, so a brand-new install always sees it first.
  // Deliberately not folded into AUTH_ROUTES: see the comment on
  // RIDER_ROUTES's "onboarding" entry for the signed-in replay case.
  if (!hasSeenOnboarding) {
    return current !== "onboarding" ? "/onboarding" : null;
  }

  if (!signedIn) {
    // Signed out: allow the login surface (phone, OTP), bounce anything else.
    return atAuthScreen ? null : "/";
  }

  // Signed in, but GET /users/me hasn't answered yet — hold position rather
  // than bouncing the user to the wrong home screen and back.
  if (!profile) return null;

  // A staff/admin account has no `rider_profiles` row by design (see
  // handle_new_auth_user) — `profile_completed` can NEVER become true for
  // one, since markOnboardingComplete() is a plain UPDATE that matches zero
  // rows when there is nothing to flip. Without this check, a staff member
  // who opens this rider-only app with their staff Google account would
  // save profile-setup successfully (200) and land right back on
  // profile-setup every time, looking exactly like a broken Continue
  // button. The blocking screen in _layout.tsx (not a redirect) is what
  // actually stops that loop.
  if (profile.role !== 'rider') return null;

  // First-ever sign-in → finish the profile first. Not just "no name yet":
  // Google sign-in auto-fills full_name from the provider profile, so
  // full_name alone can't tell "brand new" from "done onboarding".
  if (!profile.profile_completed) {
    return current !== "profile-setup" ? "/profile-setup" : null;
  }

  // Notice and consent (DPDPA ss.5-6) come after the profile and before any
  // identity document is asked for. `consent_up_to_date` is false both when
  // consent was never given AND when it was given against an older notice
  // version, so publishing a revised notice re-prompts every rider here with
  // no extra code. /privacy is exempt so a rider can always re-read the
  // notice, and mid-flow screens are left alone.
  //
  // Terms acceptance rides the SAME gate rather than getting one of its own.
  // Both are captured on the consent screen in one pass, so a rider who owes
  // either is sent to the same place — and a rider who owes only the terms
  // (because a new version was published) re-confirms consent harmlessly,
  // since recordConsents is idempotent for unchanged choices.
  //
  // Two separate gates would mean two sequential full-screen interruptions
  // for what is, to the rider, one "please agree to this" moment.
  //
  // /privacy and /terms are exempt so a rider can always re-read either
  // document — including from the consent screen's own links, which would
  // otherwise bounce straight back here.
  if (!profile.consent_up_to_date || !profile.terms_up_to_date) {
    return current !== "consent" && current !== "privacy" && current !== "terms"
      ? "/consent?next=/kyc-intro"
      : null;
  }

  // Riders with a profile but no KYC activity yet see the intro once per
  // session before Home. "Skip for Now" marks hasSeenKycIntro immediately
  // (kyc-intro.tsx, on mount) so this never loops — see that file's
  // comment. Riders already partway through/submitted/verified/rejected
  // are never sent back here; only the untouched not_submitted state is.
  if (profile.kyc_status === "not_submitted" && !hasSeenKycIntro) {
    return current !== "kyc-intro" && current !== "kyc" ? "/kyc-intro" : null;
  }

  if (atAuthScreen || current === "profile-setup" || !RIDER_ROUTES.includes(current)) {
    return "/home";
  }
  return null;
}
