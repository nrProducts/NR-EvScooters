# Web Push — rider web app notifications

Riders using the rider web app (`apps/mobile` exported to web, `swapngo-rider-web`
on Render) can get browser notifications for their rental, **including when no
Swapngo tab is open**, on browsers and devices that support it. The native app is
unchanged: it still uses Expo push (`user_devices`).

## How it works

```
ride event (bookings / payments / rentals / vehicles … services)
  └─ notifyUser()                     notifications.service.ts  (unchanged call sites)
       └─ deliverPush()               → every channel the rider has:
            ├─ Expo push              user_devices            (native app)
            └─ Web Push               web_push_subscriptions  (browsers)
                 └─ sendWebPush()     common/webPush.ts — VAPID-signed, encrypted
                      └─ browser push service (FCM / Mozilla / Apple)
                           └─ public/sw.js  'push' → showNotification
                                            'notificationclick' → open/focus the right screen
```

All 34 existing `notifyUser` call sites, plus admin broadcasts, now reach
subscribed browsers too. No event code had to change.

### Ride events → notifications

The app is a scooter **rental** service, so the generic "ride" events map onto
these existing notification codes:

| Requested event | Notification code (where it is sent) | Opens |
|---|---|---|
| Ride assigned to the rider | `vehicle_assigned` (vehicles.service), `maintenance_temp_vehicle` | My Scooter |
| Ride accepted / confirmed | `payment_success`: "Your rental is active." (payments.service) | Billing |
| Pickup | `pickup_confirmed` (bookings.service) | My Scooter |
| Ride cancelled | `booking_cancelled` (bookings.service, rider and staff paths) | Booking history |
| Trip completed | `rental_completed` (rentals.service) | Booking history |
| Payment completed | `payment_success` / `payment_failed` (payments.service) | Billing |

**"Driver arriving" has no equivalent.** Riders collect scooters at a station
themselves; there is no driver or live-ETA event in the system to hook. If one
is added, call `notifyUser(riderId, { template, title, body, screen })` like
every other event and it is delivered to browsers automatically.

### Privacy and duplicates

* Payment, refund, damage and charge notifications reach the browser with
  their **title only**. The body becomes "Open Swapngo to see the details."
  (`PRIVATE_BODY_TEMPLATES` in `web-push.service.ts`, plus a safety net for any
  body containing ₹). The full text stays in the signed-in inbox.
* Each push carries its delivery id as the notification `tag`, so a retried
  send replaces the shown notification instead of adding a second one. It is
  also sent as the `Topic` header, which collapses an undelivered duplicate at
  the push service.
* The payload is end-to-end encrypted to the browser; push services see only
  ciphertext.

### Subscription lifecycle

| When | What happens |
|---|---|
| Rider taps **Enable notifications** (Profile → Account, or the Notifications screen) | Browser prompt → subscribe → `POST /users/me/web-push/subscriptions`. This is the only place the prompt is ever triggered. |
| Every sign-in / app open | Silent re-save (`syncWebPush`): refreshes `last_seen_at`, re-points a shared browser, replaces a subscription made with an old VAPID key. Only if *this* rider opted in in *this* browser. |
| **Turn off** | `DELETE` the row and unsubscribe the browser. |
| Sign-out | Same as turn-off, done *before* the session is dropped (bounded to 3 s). The opt-in is remembered, so the same rider is re-subscribed silently on next sign-in; a different rider on the same browser is not. |
| Push service answers 404/410 | Row deleted immediately. |
| Other failures (5xx, 429, network) | `failure_count` incremented; the row is kept. |
| Not seen for 120 days | Daily cron `web-push-subscriptions-stale-daily` deletes it. |
| DPDPA erasure | `anonymise_user()` deletes the rider's rows. |
| Rider blocked notifications | The card explains how to re-allow in browser settings. No button, so the app never asks again. |

### Security

* `user_id` always comes from the verified access token, never the body.
  Saving is an upsert on the endpoint, so a browser that changes hands is
  re-pointed to the signed-in rider. Deleting is scoped to `user_id`.
* `POST` requires the `rider` role. Staff notifications carry admin-console
  paths that would open nowhere in the rider app.
* The endpoint is a URL the **server** will call, so validation is strict:
  `https:` only, no credentials, no IP literals, no `localhost` or `*.internal`
  (SSRF guard).
* RLS is enabled with no policies, so only the backend service role can touch
  the table.
* `VAPID_PRIVATE_KEY` exists only in the backend env. The public key reaches
  the browser through `GET /users/me/web-push/config`, so the static site needs
  no new variable.
* Logs record the push-service host, never the endpoint URL (it works as a
  bearer capability).

## Setup

### 1. Install (already done in this change)

```bash
pnpm --filter backend add web-push
pnpm --filter backend add -D @types/web-push
```

### 2. Generate VAPID keys: one pair per environment (UAT, production)

```bash
npx web-push generate-vapid-keys
```

Never reuse the UAT pair in production. Rotate only if the private key leaks:
existing subscriptions stop working, and riders are re-subscribed silently on
their next visit.

### 3. Backend environment

| Variable | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | public key from step 2 |
| `VAPID_PRIVATE_KEY` | private key from step 2 (**secret**) |
| `VAPID_SUBJECT` | `mailto:support@swapngo.in` (or an `https:` URL) |

Locally: `apps/backend/.env`. On Render: the `swapngo-backend` service
(`render.yaml` declares them; the keys are `sync: false`). If they are unset,
the app shows "Browser notifications are not available right now" and nothing
else changes.

### 4. Database migration

`supabase/migrations/20261018100000_web_push_subscriptions.sql` creates the
table, its index and RLS, schedules the stale-subscription cron, and redefines
`anonymise_user()` to include the new table.

```bash
supabase db reset          # local: rebuild from zero and test
git push                   # develop → UAT, main → production (Release workflow)
```

### 5. Rider web app

Nothing to configure. `apps/mobile/public/` (`sw.js`, `manifest.webmanifest`,
`icons/`) is copied into the export root by `pnpm --filter mobile build:web`.
`render.yaml` sets `Cache-Control: no-cache` on `/sw.js` and the correct
content types.

## Local testing

Browsers allow service workers and push on `http://localhost` (a secure
context), but not on a LAN IP. To test on a phone you need HTTPS: use a tunnel
(e.g. `cloudflared tunnel --url http://localhost:8081`) or the UAT deployment.

```bash
pnpm --filter backend dev                       # backend with VAPID_* set
pnpm --filter mobile build:web                  # dev server does not serve the worker reliably;
npx serve -s apps/mobile/dist -l 8081           # serve the real export
```

1. Sign in as a rider at http://localhost:8081, then open Profile → Account →
   **Enable notifications**, and allow.
2. DevTools → Application → Service Workers: `/sw.js` should be activated with
   scope `/`. Push messaging: send a test payload such as
   `{"title":"Test","body":"Hello","screen":"billing"}`.
3. Trigger a real event: from the admin console, send a broadcast to that
   rider, or assign them a scooter. Close the tab and repeat: the
   notification still appears, and clicking it opens `/billing` (or the
   relevant screen).
4. `select * from web_push_subscriptions` shows one row for the rider. Turn
   off, or sign out, and the row disappears.

Automated tests: `pnpm --filter backend test` (`tests/webPush.test.ts`), and
`pnpm --filter mobile test` (`tests/webPushSupport.test.ts`,
`tests/webPushServiceWorker.test.ts`, which loads the real `sw.js` and checks
that its route allowlist matches `notificationRoute.ts`).

## Browser support

| Platform | Works? | Notes |
|---|---|---|
| Chrome / Edge / Opera, desktop | Yes | Delivered while the browser is running (it can run in the background on Windows/macOS). |
| Firefox, desktop | Yes | Only while Firefox is running. |
| Safari 16+, macOS 13+ | Yes | In a normal tab. |
| Chrome / Edge / Samsung Internet / Firefox, Android | Yes | Delivered even with the browser closed. Battery savers can delay delivery. |
| **iPhone / iPad, iOS/iPadOS 16.4+** | **Only as a Home Screen app** | See below. |
| iOS < 16.4, or any in-app browser (Instagram, WhatsApp webviews) | No | The card says "not supported". |

### iOS / iPadOS requirements

Apple delivers Web Push to a website **only** if all of these hold:

1. iOS/iPadOS **16.4 or later**.
2. The site was **added to the Home Screen** (Safari → Share → *Add to Home
   Screen*) and is **opened from that icon**. In a Safari tab `PushManager`
   does not exist. Chrome/Edge on iOS can add to Home Screen from iOS 16.4
   too.
3. The site has a web app manifest with `display: standalone` (added:
   `public/manifest.webmanifest`, linked from `src/app/+html.tsx`).
4. Permission is requested from a user gesture (the Enable button).

In a Safari tab the card detects this and tells the rider exactly that
(`ios-install-required`). The Home Screen app has its own storage, separate
from Safari's, so the rider signs in again there. Apple also revokes a
subscription whose pushes do not show a notification, which is why `sw.js`
always shows one, even when the app is open.

## Verification checklist

- [ ] Migration applied: `web_push_subscriptions` exists, RLS enabled, cron `web-push-subscriptions-stale-daily` scheduled.
- [ ] Backend has `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`; `GET /api/v1/users/me/web-push/config` (rider token) returns `enabled: true`.
- [ ] `https://<rider-site>/sw.js` serves JavaScript (not the index.html fallback) with `Cache-Control: no-cache`.
- [ ] `https://<rider-site>/manifest.webmanifest` loads; DevTools → Application → Manifest shows no errors.
- [ ] Signing in does **not** show a browser prompt on its own.
- [ ] Explanation is visible before the prompt; Enable → prompt → Allow → "On for this browser".
- [ ] Dismissing the prompt leaves the Enable button; **Block** shows browser-settings instructions and no button.
- [ ] **Chrome desktop**: event with tab open → notification shown and bell badge refreshes; tab closed → notification still shown; click → correct screen.
- [ ] **Edge desktop** and **Firefox desktop**: same as Chrome.
- [ ] **Safari macOS**: same as Chrome.
- [ ] **Android Chrome**: browser fully closed → notification arrives; tap opens the right screen.
- [ ] **iPhone Safari tab**: card shows the "Add to Home Screen" instructions.
- [ ] **iPhone Home Screen app (iOS 16.4+)**: sign in → Enable → lock the phone → event → notification on the lock screen; tap opens the app on the right screen.
- [ ] Payment success/failure notification shows the title with "Open Swapngo to see the details." — no amount.
- [ ] Same event retried does not show two notifications.
- [ ] Turn off → row deleted, no further notifications. Sign out → row deleted; sign back in → re-subscribed without a prompt.
- [ ] Second rider signing in on the same browser is **not** subscribed until they tap Enable.
- [ ] Native Android app: push still works exactly as before.

## Limitations

* Delivery depends on the browser vendor's push service and the device's
  power management. It is best-effort, like native push.
* Desktop browsers generally need to be running (Chrome/Edge can stay running
  in the background). Android delivers with the browser closed.
* A rotated subscription (`pushsubscriptionchange`) is re-saved on the rider's
  next visit, not instantly. Until then, pushes to the old endpoint return 410
  and are cleaned up.
* No live "driver approaching" event exists to notify about (see the table above).
