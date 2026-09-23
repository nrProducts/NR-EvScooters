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
 * No localhost fallback: this is a production marketing site, and a build
 * with the env var unset must degrade to "coming soon" (see PLAY_STORE_URL's
 * identical pattern below), never silently link out to a dev URL nobody but
 * a developer's own machine can reach.
 */
export const RIDER_WEB_URL = import.meta.env.VITE_RIDER_WEB_URL || "";

/** Empty until the Android rider app is published — the CTA falls back to "coming soon". */
export const PLAY_STORE_URL = import.meta.env.VITE_PLAY_STORE_URL || "";
