# Rider App — Manual Test Checklist

**Temporary QA doc — delete `qa/` before release.**

Tick as you go. When something fails, log it in [BUGS.md](BUGS.md) with the
scenario ID (e.g. `BK-07`) so we can fix them one by one.

**Before you start**
1. Run [seed-test-data.sql](seed-test-data.sql) — 10 bookable vehicles, 2-day/1-day plans, a 2nd station.
2. Keep [time-travel.sql](time-travel.sql) open — most payment/renewal scenarios need it, because those automations are daily 03:00 cron jobs.
3. Metro: `npx expo start --dev-client`, then `pnpm warm` in a 2nd terminal, then scan.

**Known non-bugs — don't log these**
- The 2-day plan displays as **"₹600 / Day"**. `billing_cycle` only accepts daily/weekly/monthly/yearly, so a 2-day plan is `daily` + `duration_days: 2`. Only `duration_days` drives billing. Cosmetic, expected.
- Featured scooter image is slow on first load (1.66 MB PNG, known, on the production list).

**Reference numbers** (from the code, so you can verify amounts exactly)

| Rule | Value | Source |
|---|---|---|
| Free-cancel grace after booking | 60 min | `cancellation.constants.ts` |
| Free-cancel notice | `start_day` ≥ 2 days out | same |
| Late-cancel penalty | 25% of net plan price | same |
| Late **payment** fee | ₹300 / whole day | `latePaymentPolicy.ts` |
| Late **return** fee | ₹100 / whole day, cap 30 days | `returnPolicy.ts` |
| Deposit | ₹2000 (₹0 on the QA no-deposit plan) | `plans.deposit_amount` |
| Return allowed when | today ≥ `bookings.next_due_at` | `canReturnYet()` |

---

## 1. Auth & onboarding (AU)

| # | Scenario | Expect |
|---|---|---|
| AU-01 | Valid phone → OTP → correct code | Lands on profile-setup (new) or home (returning) |
| AU-02 | Invalid phone format (9 digits, letters, `+` only) | Inline validation, no OTP sent |
| AU-03 | Wrong OTP | Clear error, stays on screen, can retry |
| AU-04 | Expired OTP (wait past validity) | Clear error, resend works |
| AU-05 | Resend OTP spam (5×) | Rate-limit message (429 mapped), not a crash |
| AU-06 | Kill app mid-OTP, reopen | No stuck state |
| AU-07 | Google sign-in (if enabled) | Name pre-filled, still routed to profile-setup |
| AU-08 | Sign out from drawer | Back to phone screen; back-button can't re-enter |
| AU-09 | Sign out then sign in as a **different** rider | No data bleed from previous account (push token re-registers) |
| AU-10 | Airplane mode on login | Network error message, not a hang |
| AU-11 | Session expiry (delete session in Supabase, then act) | Redirect to login with "session expired", no crash loop |
| AU-12 | Deep link to `/home` while signed out | Bounced to login |

## 2. Profile setup (PR)

| # | Scenario | Expect |
|---|---|---|
| PR-01 | All valid fields → submit | Proceeds to KYC intro |
| PR-02 | Empty required fields | Per-field errors, submit blocked |
| PR-03 | Emoji / 200-char name | Either accepted cleanly or rejected clearly — no silent truncation |
| PR-04 | Invalid email | Inline error |
| PR-05 | Kill app mid-setup, reopen | Returns to profile-setup (not home) |
| PR-06 | Profile photo upload — large image | Uploads or errors clearly; no OOM |
| PR-07 | Photo upload, then cancel picker | No crash, no half-state |

## 3. KYC (KY)

| # | Scenario | Expect |
|---|---|---|
| KY-01 | "Skip for now" on intro | Reaches Home; intro never loops back |
| KY-02 | Full submit: Aadhaar + Licence + both boxes ticked | Status → submitted |
| KY-03 | Aadhaar not 12 digits | Blocked with message |
| KY-04 | Licence with **no** expiry date | Blocked — expiry is mandatory for licence |
| KY-05 | Licence with **past** expiry | Rejected |
| KY-06 | Bad date format (`12/05/2027`) | Blocked, wants `YYYY-MM-DD` |
| KY-07 | Submit with only one document | Blocked until both mandatory docs present |
| KY-08 | Submit without ticking both boxes | Blocked |
| KY-09 | Upload PDF instead of image | Accepted; preview opens as PDF |
| KY-10 | Preview an uploaded doc | Signed URL opens; not cached to disk |
| KY-11 | Remove a pending document | Removed |
| KY-12 | Admin **rejects** a doc → rider re-uploads | Returns to pending, rejection reason cleared |
| KY-13 | Admin **verifies** → try to edit/delete | Blocked (verified docs are immutable) |
| KY-14 | Try to book while KYC unverified | Booking gated, KYC banner explains |
| KY-15 | Resume mid-wizard (kill app on step 3) | Returns to step 3, not step 0 |
| KY-16 | Duplicate active document of same type | Blocked |

## 4. Home (HM)

| # | Scenario | Expect |
|---|---|---|
| HM-01 | Fresh rider, no booking | Greeting, referral banner, KYC banner, featured card, available list |
| HM-02 | Greeting text at 08:00 / 14:00 / 20:00 | Morning / Afternoon / Evening |
| HM-03 | With pending booking | Booking card with Cancel + Directions |
| HM-04 | With active rental | ActiveRentalCard replaces featured card |
| HM-05 | **Pull to refresh** | Green spinner; data actually refetches (change something in DB first) |
| HM-06 | Maintenance notice set by admin | Banner shows; dismissable if designed so |
| HM-07 | `plan_status = 'due'` (use A2) | Red "scooter won't start — payment overdue" banner; taps → Billing |
| HM-08 | Zero available vehicles (set all QA vehicles to `maintenance`) | Empty state, not a broken card |
| HM-09 | Featured image load | Scooter sits on the stage, grounded, no grey/white split ← **regression check** |
| HM-10 | Notification bell with 9+ unread | Badge caps sensibly, taps → notifications |
| HM-11 | Offline on Home | Error state with retry, not blank |

## 5. Browse & catalog (BR)

| # | Scenario | Expect |
|---|---|---|
| BR-01 | Open Browse | Lists available models |
| BR-02 | Search a real name (`MVS7`) | Filters correctly (350ms debounce) |
| BR-03 | Search gibberish | Empty state |
| BR-04 | Category chips | Filter applies |
| BR-05 | Scroll to bottom | Pagination loads more, no duplicates |
| BR-06 | **Pull to refresh with a filter active** | Refetches **under that filter** — must not reset to "All" ← regression check |
| BR-07 | Search while offline | Error state, recovers on reconnect |
| BR-08 | Rapid typing then clear | No stale results from a late response |

## 6. Booking (BK)

| # | Scenario | Expect |
|---|---|---|
| BK-01 | Happy path: model → date → plan → station → confirm | Booking created, status `pending_payment` |
| BK-02 | Pick a **Sunday** | Blocked (`isValidStartDay` excludes dow 0) |
| BK-03 | Pick a **past** date | Blocked |
| BK-04 | Pick today | Allowed |
| BK-05 | Book with KYC unverified | Blocked at API (`requireKycVerified`) with clear message |
| BK-06 | Book when rider already has an active booking | Blocked / explained |
| BK-07 | Book when rider already has an active rental | Blocked / explained |
| BK-08 | Book the last available vehicle, then book again from a 2nd device | Second gets a clean "no vehicles" error, not a 500 |
| BK-09 | Set all vehicles at chosen station to `booked` then try | "No vehicle available at this station" |
| BK-10 | Compare 2-day vs weekly plan pricing on the summary | Matches `plans.price` |
| BK-11 | Apply referral code from another rider | ₹100 discount reflected in total |
| BK-12 | Apply **own** referral code | Rejected (self-referral) |
| BK-13 | Apply an already-redeemed code | Rejected |
| BK-14 | Apply a garbage code | Rejected, clean message |
| BK-15 | Back out mid-flow, return | No orphaned booking left behind |
| BK-16 | Airplane mode at confirm | Error, no phantom booking (verify in DB) |

## 7. Payment (PY)

| # | Scenario | Expect |
|---|---|---|
| PY-01 | Pay booking via Razorpay test card | Booking → `confirmed`, invoice `succeeded` |
| PY-02 | **Cancel** the Razorpay sheet | `PaymentCancelledError` message; booking stays payable, not lost |
| PY-03 | Razorpay **failure** test card | Failure message; retry possible |
| PY-04 | No Razorpay key configured (mock order) | Settles server-side, no checkout sheet |
| PY-05 | Kill app during checkout | On reopen, state is consistent (paid or unpaid, never both) |
| PY-06 | Leave booking unpaid → run `booking-payment-expiry-sweep` (B) | Booking → `expired`, vehicle released back to `available` |
| PY-07 | Pay an overdue invoice (after A2) | Charged amount = plan price + ₹300 × days late |
| PY-08 | Double-tap Pay | Only one order/charge |
| PY-09 | Offline at Pay | Clean error |

## 8. Pickup (PK)

*Staff-side action — do it from the admin app or DB.*

| # | Scenario | Expect |
|---|---|---|
| PK-01 | Staff confirms pickup | Booking → `fulfilled`, rental created, vehicle → `assigned`, `plan_status` → `active`, `next_due_at` = today + duration |
| PK-02 | Rider's Home right after pickup | Switches to ActiveRentalCard |
| PK-03 | Billing screen right after pickup | Loads (this 500'd before — **regression check**) |
| PK-04 | Pickup reminder cron (B) | Notification arrives |

## 9. My Scooter (MS)

| # | Scenario | Expect |
|---|---|---|
| MS-01 | With active rental | Hero image, registration, plan, "on rent since", "renews on" |
| MS-02 | Day counter + "days left" | Matches `next_due_at` |
| MS-03 | **Pull to refresh** | Green spinner, refetches, content does **not** blank out mid-pull ← regression check |
| MS-04 | Return button before period ends | **Disabled**, with "You can return once your current plan period ends on <date>" |
| MS-05 | Return button after A3 | Enabled |
| MS-06 | Maintenance history tab filters | All / open / closed filter correctly |
| MS-07 | Maintenance "Load more" | Appends, no duplicates |
| MS-08 | No maintenance records | Empty state |
| MS-09 | Vehicle documents card | Opens/downloads |
| MS-10 | Hero image | Grounded on stage, not cropped through the scooter ← regression check |

## 10. Billing & renewal (BL)

| # | Scenario | Expect |
|---|---|---|
| BL-01 | Open Billing from drawer | **Opens** (was bouncing to Home — regression check) |
| BL-02 | Plan card | Name, price, cycle, next due date |
| BL-03 | Invoice history | Lists all, newest first |
| BL-04 | Deposit ₹2000 shown | Correct, with refundable amount |
| BL-05 | Zero-deposit plan (QA No Deposit) | Handles the 404 gracefully — no error screen |
| BL-06 | After A2 (3 days overdue) | Late fee ₹900 shown; total = price + 900 |
| BL-07 | Pay the overdue invoice | Status → succeeded, plan → active, banner clears |
| BL-08 | Renewal on a 2-day plan (wait 2 days, or A1) | New invoice issued for the next period |
| BL-09 | **Pull to refresh** | Refetches; spinner doesn't blink off early ← regression check |
| BL-10 | Focus refetch: change `plan_status` in DB, switch away and back | Updates without restarting the app |
| BL-11 | Damage recorded by staff | Appears with deposit deduction; outstanding invoice created |
| BL-12 | Dispute a damage | Status → disputed, within dispute window |
| BL-13 | Dispute outside the window | Blocked |
| BL-14 | Offline on Billing | Error state + retry |

## 11. Return (RT)

| # | Scenario | Expect |
|---|---|---|
| RT-01 | Request return when allowed | Return requested; ReturnStatusCard replaces the button |
| RT-02 | Each return reason option | All 6 submit fine |
| RT-03 | "Something else" with no text | Either required or accepted — must be consistent |
| RT-04 | Return **before** `next_due_at` via API | Server rejects even though UI disabled it |
| RT-05 | Late return after A4 (2 days late) | ₹200 penalty shown, server value matches |
| RT-06 | Late return 40 days | Capped at 30 days (₹3000) |
| RT-07 | Staff completes return | Rental → completed, vehicle → available, deposit refund path starts |
| RT-08 | Refund processing cron (B) | Refund progresses |

## 12. Booking history & cancellation (BH)

| # | Scenario | Expect |
|---|---|---|
| BH-01 | Open history | All bookings, newest first |
| BH-02 | Empty history (new rider) | Empty state |
| BH-03 | **Pull to refresh** | Refetches; list does **not** flip to skeletons mid-pull ← regression check |
| BH-04 | Cancel **within 60 min** of booking | Free — ₹0 penalty, full refund |
| BH-05 | Cancel with `start_day` ≥ 2 days out | Free |
| BH-06 | Cancel with `start_day` tomorrow, >60 min after booking | 25% penalty of net price |
| BH-07 | Cancel with a referral discount applied | Penalty computed on **net** price, not gross |
| BH-08 | Cancel an already-cancelled booking | Blocked |
| BH-09 | Cancel a `fulfilled` booking | Blocked (use return instead) |
| BH-10 | Refund status transitions | Reflected in the badge |

## 13. Battery stations (BS)

| # | Scenario | Expect |
|---|---|---|
| BS-01 | Open map | Both active stations pinned; inactive one absent |
| BS-02 | Location permission **denied** | Map still usable, no crash, clear prompt |
| BS-03 | Location permission granted | Centres on rider once, doesn't yank on refetch |
| BS-04 | Tap a marker | Bottom sheet with station details |
| BS-05 | Station search | Filters; empty state for gibberish |
| BS-06 | Station detail screen | Loads; **pull to refresh** works ← regression check |
| BS-07 | Invalid station id in URL | "No longer available", not a crash |
| BS-08 | Offline on map | Error state with retry; stale markers kept on failed refetch |
| BS-09 | GPS off entirely | Handled |

## 14. Notifications (NT)

| # | Scenario | Expect |
|---|---|---|
| NT-01 | List loads | Newest first, unread highlighted |
| NT-02 | Unread badge count | Matches list |
| NT-03 | Tap → mark read | Badge decrements |
| NT-04 | **Pull to refresh** | Green spinner ← regression check |
| NT-05 | Empty state | Clean |
| NT-06 | Push while app **foregrounded** | Handled |
| NT-07 | Push while **backgrounded**, then tap | Deep-links to the screen in the payload |
| NT-08 | Push with unknown `screen` value | Falls back to notifications list, no crash |
| NT-09 | Notification permission denied | Sign-in still completes (best-effort registration) |

## 15. Support, plan, referral, drawer (SP)

| # | Scenario | Expect |
|---|---|---|
| SP-01 | Submit a support ticket | Success |
| SP-02 | Empty / very long message | Validated |
| SP-03 | My Plan screen | Correct plan data |
| SP-04 | Copy referral code | Clipboard toast |
| SP-05 | Share referral | Native share sheet |
| SP-06 | Every drawer item | All 7 navigate; none bounce to Home ← regression check |
| SP-07 | Billing/My Scooter items with **no** booking | Hidden (they're gated on active booking/rental) |
| SP-08 | Profile sheet → KYC shortcut | Navigates |

## 16. Cross-cutting (XC)

| # | Scenario | Expect |
|---|---|---|
| XC-01 | Airplane mode on **every** screen | Error state + retry everywhere; no white screens |
| XC-02 | Flaky network (throttle to 2G) | Spinners resolve or fail; nothing hangs forever |
| XC-03 | Background 10 min, return | Refetches on focus; no stale/blank UI |
| XC-04 | Android **back** from every screen | Never dead-ends or exits unexpectedly |
| XC-05 | Rotate device on each screen | No layout break |
| XC-06 | Small screen / large font (accessibility) | No clipped text or unreachable buttons |
| XC-07 | Dark mode (if supported) | Legible |
| XC-08 | Rapid double-tap every primary button | No double submit |
| XC-09 | Deep link each route directly | Correct screen or clean bounce |
| XC-10 | Reload app (`r` in Metro) repeatedly | No "Unable to activate keep awake" error ← regression check |
| XC-11 | Leave app open 30+ min then act | Token refresh works |

## 17. Regression sweep — things changed this session (RG)

Re-verify explicitly; these are the highest-risk areas.

| # | Change | Check |
|---|---|---|
| RG-01 | Pull-to-refresh added to 9 screens | Every one: spinner is **green**, content never disappears mid-pull, data genuinely refetches |
| RG-02 | `PullToRefresh` became a function, not a component | **No screen renders empty** — this exact bug blanked every screen once |
| RG-03 | `billing` added to `RIDER_ROUTES` | Drawer → Billing opens |
| RG-04 | `station-map.tsx` deleted | Nothing links to a dead route |
| RG-05 | `VehicleStage` rewritten | Home featured, Home active-rental, My Scooter hero — all grounded, no crop, no grey/white split |
| RG-06 | `useCurrentRideOrBooking` / `useMyBilling` return promises | Refresh spinners end at the right time; no infinite refetch loop on Billing |
| RG-07 | expo-keep-awake patch | No uncaught promise error on launch/reload |
| RG-08 | Merge with `origin/main` | Overdue banner on Home + return-gating on My Scooter both work |

---

## Bug log format

Copy into `qa/BUGS.md`:

```
### [ID] Short title
- **Scenario:** BK-07
- **Steps:** 1. … 2. … 3. …
- **Expected:**
- **Actual:**
- **Evidence:** screenshot / Metro log / backend `[unhandled]` line
- **Severity:** blocker | major | minor | cosmetic
```

For any 500, grab the backend console line starting `[unhandled]` — the client
deliberately shows only "Something went wrong", so that log line is the only
place the real cause appears.
