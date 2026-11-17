/**
 * External destinations this static site points to — every cross-app link
 * is config, not a route, so it stays a one-line edit as those deployments
 * move.
 */

/**
 * apps/mobile exported to static web (swapngo-rider-web on Render) — the
 * actual rider app running in a browser, not apps/web's separate plain-React
 * /rider portal. There's no iOS app planned, so this is where an iPhone
 * rider is meant to land instead.
 *
 * Defaults to the production rider web domain (never a localhost URL), so
 * the "Web" CTA works even when the env var isn't set on the host; set
 * VITE_RIDER_WEB_URL to point a preview/UAT build somewhere else.
 */
export const RIDER_WEB_URL = import.meta.env.VITE_RIDER_WEB_URL || "https://rider.swapngo.in";

/**
 * The rider app's Google Play listing. The id is the Android package in
 * apps/mobile/app.config.js (in.swapngo.rider). Set VITE_PLAY_STORE_URL to
 * point a preview build at a different listing.
 */
export const PLAY_STORE_URL =
  import.meta.env.VITE_PLAY_STORE_URL || "https://play.google.com/store/apps/details?id=in.swapngo.rider";
