/**
 * External destinations this static site points to. The rider app is
 * Expo/mobile-only (no live web booking flow) and the admin console is a
 * separate deployment — so every cross-app link is config, not a route,
 * and stays a one-line edit as those deployments move.
 */

/** apps/web (admin/staff console) — same product, its own auth, its own deploy. */
export const ADMIN_CONSOLE_URL = import.meta.env.VITE_ADMIN_CONSOLE_URL || "http://localhost:5173";

/** Empty until the rider app is published — CTAs fall back to "coming soon". */
export const PLAY_STORE_URL = import.meta.env.VITE_PLAY_STORE_URL || "";
export const APP_STORE_URL = import.meta.env.VITE_APP_STORE_URL || "";

export const HAS_APP_LINKS = Boolean(PLAY_STORE_URL || APP_STORE_URL);
