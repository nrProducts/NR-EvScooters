# 15 — Index Strategy

> Indexes derived from the **actual query patterns** recorded in `03`, not from guesswork.
> The old schema had 165 indexes across 51 tables — roughly 3.2 per table, many unused. This design targets ~98 across 62 tables by indexing what the application demonstrably does.

---

## 1. Policy

| Rule | Rationale |
|---|---|
| **Every FK used in a filter or join gets an index.** | Postgres does *not* index FKs automatically. A missing FK index also makes `ON DELETE` scans sequential. |
| **Not every FK gets one.** | Attribution columns (`*_by_user_id`) are displayed, never filtered. Indexing them costs writes and buys nothing. |
| **Partial indexes for lifecycle queries.** | "The active rental", "the open assignment", "unpaid invoices" all filter on a small subset of a growing table. |
| **Composite order = equality columns first, then range/sort.** | Matches how the admin lists actually query: filter by status, order by date. |
| **Covering indexes only where measured.** | `INCLUDE` columns are deferred until real query plans justify them. |
| **Unique constraints are indexes.** | Not listed again below. |
| **No index before its query exists.** | Tables with no known access pattern get PK only. |

## 2. Access patterns that drive the design

From `03`, the real workload:

| Pattern | Frequency | Source |
|---|---|---|
| Rider reads own bookings / rentals / invoices | Every app screen | Mobile |
| Admin lists filtered by `status`, sorted by `created_at` | Every console page | Web |
| Cron sweeps scan for rows past a date in one status | 10 jobs, hourly/daily | Edge functions |
| "Current" lookups — active rental, open assignment, current period | Every rider request | Both |
| Vehicle availability by model and hub | Booking flow | Mobile |
| Gateway idempotency lookups by external ID | Every payment | Backend |
| Geospatial nearest-station | Map screens | Mobile |

**The cron sweeps are the most index-sensitive workload.** They run unattended against the whole table, and each one is a `status = X AND date_column < now()` scan — exactly what a composite partial index serves.

---

## 3. Indexes by domain

### Identity

| Table | Index | Serves |
|---|---|---|
| `users` | `(status) WHERE deleted_at IS NULL` | admin user list |
| `users` | `(created_at DESC) WHERE deleted_at IS NULL` | default list sort |
| `users` | trigram on `full_name` | admin global search |
| `user_addresses` | `(user_id)` | profile load |
| `user_related_persons` | `(user_id)` | profile load |
| `user_devices` | `(user_id) WHERE revoked_at IS NULL` | push fan-out |
| `kyc_documents` | `(user_id)` | rider KYC screen |
| `kyc_documents` | `(document_number_hmac)` | **duplicate-identity detection** (H-11) |
| `kyc_documents` | `(verification_status, created_at) WHERE verification_status = 'pending'` | **KYC review queue** |
| `kyc_documents` | `(expires_on) WHERE verification_status = 'verified'` | expiry reminders |
| `user_permission_overrides` | `(permission_id)` | reverse lookup |
| `role_permissions` | `(permission_id)` | reverse lookup |
| `users` | `(role) WHERE role <> 'rider'` | staff directory — replaces the old `user_roles` scan |

`users.phone` and `users.email` are already unique-indexed. No index on `gender`, `date_of_birth` or address fields — never filtered.

### Fleet

| Table | Index | Serves |
|---|---|---|
| `vehicles` | `(vehicle_model_id, status)` | **availability count — the booking hot path** |
| `vehicles` | `(hub_id, status)` | hub inventory |
| `vehicles` | `(status, created_at DESC)` | admin fleet list |
| `vehicle_documents` | `(vehicle_id)` | vehicle detail |
| `vehicle_documents` | `(expires_on) WHERE expires_on IS NOT NULL` | **expiry alerts** |
| `vehicle_model_media` | `(vehicle_model_id, sort_order)` | catalogue render |
| `vehicle_models` | `(is_active, sort_order) WHERE deleted_at IS NULL` | rider browse |
| `vehicle_models` | `(battery_range_km)`, `(top_speed_kmph)` | **rider spec filters — restored typed columns** (H-5) |
| `maintenance_tickets` | `(vehicle_id, created_at DESC)` | vehicle history |
| `maintenance_tickets` | `(status, created_at DESC) WHERE status <> 'resolved'` | **open-ticket queue** |
| `hubs` | **GiST** `(location)` | `nearest_hub()` |
| `swap_stations` | **GiST** `(location) WHERE deleted_at IS NULL` | **map viewport + nearest** |
| `swap_stations` | `(status) WHERE is_rider_visible AND deleted_at IS NULL` | rider map filter |

`swap_station_qis_ids` needs no extra index — its composite PK serves station lookup and the global `UNIQUE (qis_id)` serves ID lookup.

### Commercial — the hot path

| Table | Index | Serves |
|---|---|---|
| `bookings` | `(user_id, created_at DESC)` | **rider booking history** |
| `bookings` | `(status, created_at DESC)` | admin list |
| `bookings` | `(hold_expires_at) WHERE status = 'pending_payment'` | **expiry sweep** |
| `bookings` | `(requested_start_on) WHERE status = 'confirmed'` | **pickup queue + reminder** |
| `bookings` | `(held_vehicle_id) WHERE held_vehicle_id IS NOT NULL AND status IN ('pending_payment','confirmed')` — **unique partial** | release-on-close; **also prevents double-holding a scooter** (H-3) |
| `subscriptions` | `(user_id, status)` | "my subscription" |
| `subscriptions` | `(status, started_on DESC)` | admin list |
| `subscriptions` | `(plan_id)` | plan usage reporting |
| `subscription_periods` | `(subscription_id, sequence_number)` — unique | period walk |
| `subscription_periods` | `(due_on) WHERE status = 'current'` | **payment-due reminder + overdue sweep** |
| `subscription_periods` | `(starts_on) WHERE status = 'scheduled'` | **renewal activation** |
| `subscription_pauses` | `(subscription_id) WHERE resumed_at IS NULL` | open pause |
| `rentals` | `(user_id, status)` | **"my current ride" — every app open** |
| `rentals` | `(subscription_id)` | subscription history |
| `rentals` | `(status, picked_up_at DESC)` | admin list |
| `rentals` | `(due_back_at) WHERE status = 'active'` | **expiry reminder** |
| `rental_vehicle_assignments` | `(rental_id) WHERE released_at IS NULL` — **unique partial** | **current vehicle; also enforces one open assignment** |
| `rental_vehicle_assignments` | `(vehicle_id, assigned_at DESC)` | vehicle history |
| `rental_returns` | `(status, requested_at) WHERE status IN ('requested','inspected')` | **returns queue** |
| `rental_settlements` | `(settled_at DESC)` | settlements list |

The partial unique index on `rental_vehicle_assignments` earns its place twice — it answers the most frequent query in the system *and* enforces the invariant that a rental has one current vehicle.

### Billing

| Table | Index | Serves |
|---|---|---|
| `invoices` | `(user_id, issued_on DESC NULLS LAST) WHERE status <> 'draft'` | **rider invoice list** — drafts have NULL `issued_on` (L-2) |
| `invoices` | `(subscription_id)` | subscription billing history |
| `invoices` | `(status, due_on)` | admin list, overdue scan |
| `invoices` | `(subscription_period_id)` | period → invoice |
| `invoice_items` | `(invoice_id, line_number)` — unique | invoice render |
| `pricing_rules` | **GiST** `(scope, scope_ref_id, daterange(effective_from, effective_to)) WHERE is_active` | **rule resolution** — a btree cannot serve both range bounds (M-11) |
| `subscription_adjustments` | `(subscription_period_id)` | invoice generation |
| `subscription_adjustments` | `(subscription_id, created_at DESC)` | rider charge history |
| `subscription_adjustments` | `(status) WHERE status = 'pending'` | uninvoiced sweep |
| `payment_orders` | `(invoice_id)` | invoice → order |
| `payment_orders` | `(user_id, created_at DESC)` | rider payment history |
| `payment_orders` | `(status, expires_at) WHERE status IN ('created','attempted')` | **expiry sweep** |
| `payment_transactions` | `(payment_order_id)` | order → payment |
| `payment_transactions` | `(captured_at DESC)` | reconciliation |
| `payment_allocations` | `(invoice_id)` | **balance calculation — every invoice read** |
| `payment_allocations` | `(payment_transaction_id)` | payment → invoices |
| `deposits` | `(subscription_id)` — unique | |
| `deposits` | `(refund_eligible_on) WHERE status = 'held'` | **refund-eligibility sweep** |
| `refunds` | `(user_id, created_at DESC)` | rider refund list |
| `refunds` | `(status, last_attempted_at) WHERE status IN ('pending','failed')` | **retry sweep** |
| `refunds` | `(payment_transaction_id)` | reversal lookup |
| `payment_webhook_events` | `(processed_at) WHERE processed_at IS NULL` | unprocessed queue |
| `payment_webhook_events` | `(received_at DESC)` | reconciliation |

`gateway_order_id`, `gateway_payment_id`, `gateway_refund_id`, `idempotency_key` and `gateway_event_id` are all unique-indexed by their constraints — these are the idempotency lookups and need nothing further.

### Operations, notifications, compliance

| Table | Index | Serves |
|---|---|---|
| `incidents` | `(vehicle_id, occurred_at DESC)` | vehicle history |
| `incidents` | `(rental_id)` | rental detail |
| `incidents` | `(status, reported_at DESC) WHERE status <> 'closed'` | open queue |
| `damages` | `(incident_id)` | incident detail |
| `damages` | `(status, assessed_at DESC)` | damages list |
| `damage_disputes` | `(resolved_at) WHERE resolved_at IS NULL` | open disputes |
| `support_tickets` | `(user_id, created_at DESC)` | rider tickets |
| `support_tickets` | `(status, priority, created_at DESC)` | **support queue** |
| `support_tickets` | `(assigned_to_user_id) WHERE status <> 'closed'` | my queue |
| `support_ticket_messages` | `(support_ticket_id, created_at)` | thread render |
| `notification_messages` | `(user_id, created_at DESC)` | **inbox** |
| `notification_messages` | `(user_id) WHERE read_at IS NULL` | **unread badge** |
| `notification_events` | `(subject_type, subject_id)` | entity timeline |
| `notification_events` | `(occurred_at DESC)` | retention purge |
| `notification_messages` | `(notification_event_id)` | event → messages; needed for cascade (L-3) |
| `notification_deliveries` | `(notification_message_id)` | delivery status |
| `notification_deliveries` | `(status, created_at) WHERE status = 'pending'` | retry |
| `consent_records` | `(user_id, purpose, created_at DESC)` | **serves `v_current_consents` directly** |
| `data_principal_requests` | `(status, sla_due_at)` | **SLA queue** |
| `data_principal_requests` | `(user_id, created_at DESC)` | rider view |
| `pii_access_log` | `(target_user_id, created_at DESC)` | who saw my data |
| `pii_access_log` | `(actor_user_id, created_at DESC)` | staff activity |
| `pii_access_log` | `(created_at)` | retention purge |
| `audit_logs` | `(entity_type, entity_id, created_at DESC)` | **entity timeline** |
| `audit_logs` | `(actor_user_id, created_at DESC)` | actor timeline |
| `audit_logs` | `(created_at)` | retention purge |
| `retention_runs` | `(retention_policy_category, started_at DESC)` | run history |

---

## 4. Deliberate omissions

| Not indexed | Why |
|---|---|
| All `*_by_user_id` attribution columns | Displayed via join, never filtered. ~20 columns saved. |
| `vendors`, `modules`, `permissions`, `notification_types`, `retention_policies` | Master tables under a few hundred rows; sequential scan is faster |
| `rider_profiles`, `staff_profiles` | PK is the only access path |
| `booking_cancellations`, `rental_returns`, `rental_feedback`, `vehicle_disposals`, `damage_disputes` | PK **is** the parent FK — already indexed |
| `users.gender`, `date_of_birth`, address columns | Never filtered |
| JSONB columns | No JSON-path queries in the application. Add GIN only if that changes. |

## 5. Retention-driven indexes

`data-retention-purge` runs daily and deletes by age. Without an index each run is a full scan of the largest tables in the system. These four exist specifically for it, and are the reason the purge stays cheap as data grows:

`audit_logs (created_at)` · `pii_access_log (created_at)` · `notification_events (occurred_at)` · `notification_messages (created_at)`

## 6. Summary

| | Old | New |
|---|---|---|
| Tables | 51 | 58 |
| Indexes (excl. PK/unique) | ~114 | **~95** |
| Partial indexes | 6 | **24** |
| GiST spatial | 1 | 2 |
| Trigram | 0 | 1 |

Fewer total indexes across more tables, because the partial ones do more work. Nearly every cron sweep — historically the queries most likely to degrade silently — now has a matching partial index sized to the rows it actually touches, not the whole table.

**Validate after launch, not before.** Once real traffic exists, `pg_stat_user_indexes` will show which of these are never scanned. Anything with `idx_scan = 0` after a month of production should be dropped. Every index here is a hypothesis derived from `03`; the hypotheses that turn out wrong should not survive.
