import * as Sentry from '@sentry/react-native';
import { ENV } from '../constants/env';

/**
 * Crash and error reporting for release builds.
 *
 * Off unless EXPO_PUBLIC_SENTRY_DSN is set, and always off in development —
 * a dev session's redboxes would bury the testers' real crashes. With it on,
 * an unhandled JS error or a native crash arrives in Sentry with the device,
 * app version + build, and the screens visited just before it, which is the
 * part a tester can rarely describe.
 *
 * Privacy: sendDefaultPii is false, so no IP address, request bodies or
 * headers are attached. The only identity sent is the account's UUID (see
 * setSentryUser) — enough to match a crash to a bug report, and nothing that
 * names the rider.
 */
export const navigationIntegration = Sentry.reactNavigationIntegration();

let enabled = false;

export function initSentry(): void {
  const dsn = ENV.sentryDsn;
  if (!dsn || __DEV__) return;
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    // Errors only. Performance tracing would spend the free tier's quota on
    // spans nobody is looking at during beta.
    tracesSampleRate: 0,
    integrations: [navigationIntegration],
  });
  enabled = true;
}

/** Tags later events with the signed-in account, or clears it on sign-out. */
export function setSentryUser(userId: string | null): void {
  if (!enabled) return;
  Sentry.setUser(userId ? { id: userId } : null);
}
