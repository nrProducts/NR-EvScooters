/**
 * GA4 (Google tag), loaded directly — no SDK, since the gtag.js snippet is a
 * handful of lines and a page_view-only site doesn't need a dependency for
 * it. This is the ONLY place gtag.js is loaded from; nothing else in this
 * app should touch window.gtag or inject the script tag itself.
 *
 * The site is a single page of anchor-linked sections (see App.tsx — no
 * react-router, no route changes), so GA4's automatic page_view on `config`
 * is already correct. There is no client-side navigation to instrument.
 *
 * VITE_GA_MEASUREMENT_ID is intentionally allowed to be unset: local dev and
 * any preview/staging deploy should not report into the production GA4
 * property, so initAnalytics() silently no-ops without it.
 */

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;

export function initAnalytics(): void {
  if (initialized || !MEASUREMENT_ID) return;
  initialized = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID);
}

/**
 * Fires a GA4 custom event for an existing, real UI interaction.
 *
 * Never pass anything that identifies a person — name, email, phone number,
 * message contents, tokens, or any Supabase/Razorpay id — as a parameter
 * here. Stick to fixed, non-identifying labels (a query type from a closed
 * list, a platform name, a section id). See docs/analytics.md.
 */
export function trackEvent(name: string, params?: Record<string, string | number | boolean>): void {
  if (!initialized || !window.gtag) return;
  window.gtag("event", name, params);
}
