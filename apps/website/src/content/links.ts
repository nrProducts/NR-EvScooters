/**
 * External destinations this static site points to — every cross-app link
 * is config, not a route, so it stays a one-line edit as those deployments
 * move.
 */

/**
 * apps/web (staff console) — its own auth, its own deploy. Also where iOS
 * riders are meant to book: there's no iOS app planned, so the rider role
 * lives in the browser instead. The console's login form is shared across
 * roles and auto-routes a rider account to /rider (see LoginPage.tsx), so
 * this same URL works as both the staff login and the rider web entry point.
 */
export const ADMIN_CONSOLE_URL = import.meta.env.VITE_ADMIN_CONSOLE_URL || "http://localhost:5173";

/** Empty until the Android rider app is published — the CTA falls back to "coming soon". */
export const PLAY_STORE_URL = import.meta.env.VITE_PLAY_STORE_URL || "";
