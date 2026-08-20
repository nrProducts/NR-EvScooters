# 10 — Booking / rental integrity and concurrency

## 10.1 The guards that exist

Verified live on `cndqvdskrcmivqflbttl` — every unique index on the four concurrency-critical tables:

| Index | Definition | What it actually guarantees |
|---|---|---|
| `uq_bookings_held_vehicle_open` | `bookings (held_vehicle_id) WHERE held_vehicle_id IS NOT NULL AND status IN ('pending_payment','confirmed')` | **one open booking may hold a given vehicle** ✅ |
| `subscriptions_booking_id_key` | `subscriptions (booking_id)` | one subscription per booking ✅ |
| `uq_rentals_active_per_subscription` | `rentals (subscription_id) WHERE status = 'active'` | one active rental per **subscription** ✅ |
| `uq_rva_open_per_rental` | `rental_vehicle_assignments (rental_id) WHERE released_at IS NULL` | one open assignment per **rental** ✅ |

Plus `allocate_vehicle_for_booking`, which is genuinely well written:

```sql
select v.id into v_vehicle
  from public.vehicles v
 where v.vehicle_model_id = v_model
   and v.status = 'available'
   and (v.hub_id = v_hub or v.hub_id is null)
   and not exists (select 1 from public.bookings b2
                    where b2.held_vehicle_id = v.id
                      and b2.status in ('pending_payment','confirmed'))
 order by (v.hub_id = v_hub) desc, v.created_at
 limit 1
   for update skip locked;
```

`FOR UPDATE SKIP LOCKED` means two concurrent bookings take two *different* scooters instead of
contending for one, and `uq_bookings_held_vehicle_open` is the backstop if they somehow pick the
same. **The automatic allocation path is race-safe. PASS.**

Vehicle state is *derived*, not stored by hand: `recompute_vehicle_status(vehicle_id)` walks
disposals → open maintenance → open assignment → held booking → available, and is driven by
triggers on `vehicle_disposals`, `maintenance_tickets`, `rental_vehicle_assignments` and `bookings`.
Nothing writes `vehicles.status` directly. **PASS** — and it is a genuine improvement over the old
guarded-UPDATE-as-a-lock pattern.

## 10.2 The guard that does not exist

### C8 — Nothing prevents one vehicle being on two active rentals

- **Live evidence:** the complete set of unique indexes on `rental_vehicle_assignments` is
  `rental_vehicle_assignments_pkey` and `uq_rva_open_per_rental`. There is **no** unique index on
  `(vehicle_id) WHERE released_at IS NULL`. The only other index on `vehicle_id` is
  `idx_rva_vehicle`, a plain non-unique btree on `(vehicle_id, assigned_at desc)`
  (`20260819102200_indexes.sql:80`). The migration that creates the table
  (`20260819101100_commercial_rentals.sql:61-62`) creates only the per-rental index.
- **Two files document this index as the mutual exclusion, and both are wrong:**

  `apps/backend/src/modules/vehicles/vehicles.service.ts:661-670`:
  > *"The lock is now the assignment row itself. **A partial unique index permits only one open
  > (`released_at IS NULL`) assignment per vehicle**, so the loser of a race gets 23505 on the insert
  > instead of zero rows from the update. The check-then-act read below is a courtesy that produces a
  > good error message in the common case; the index is what makes it correct."*

  `apps/backend/src/modules/bookings/bookings.service.ts:1449-1450`:
  > *"Step 3: attach the vehicle. **The unique index on open assignments is what makes this the real
  > mutual exclusion.**"*

  The index they describe does not exist. What exists constrains `rental_id`, not `vehicle_id` —
  which prevents a rental having two vehicles, the opposite of what is needed here.
- **Concrete failure:** two staff members, two different bookings, same scooter.

  ```
  t0  staff A: GET  vehicles/:v  → status 'available'      (confirmPickup:1386-1395)
  t0  staff B: GET  vehicles/:v  → status 'available'      (assignVehicleToUser:724-727)
  t1  staff A: UPDATE bookings … status='fulfilled'        ← guarded, succeeds
  t1  staff B: INSERT rentals (subscription_2)             ← different subscription, succeeds
  t2  staff A: INSERT rental_vehicle_assignments(r1, v)    ← succeeds
  t2  staff B: INSERT rental_vehicle_assignments(r2, v)    ← SUCCEEDS. Nothing stops it.
  t3  trigger recompute_vehicle_status(v) → 'assigned'     ← no error, just a status
  ```

  Two riders now hold the same physical scooter, and `v_rental_current_vehicle` returns two rows
  for it. `assignVehicleToUser` uses `.maybeSingle()` against that view keyed on `user_id`, so the
  corruption is not even visible from the rider side.
- **Reachability:** the fully automatic path is protected by `uq_bookings_held_vehicle_open`, so
  this needs a manual vehicle choice on at least one side — `confirmPickup` accepts
  `input.vehicle_id` as an override (`bookings.service.ts:1383`), and `assignVehicleToUser` is an
  entirely manual walk-in path. Both are ordinary staff operations, not edge cases, and the
  check-then-act read between them is two HTTP round trips wide.
- **Expected:**

  ```sql
  create unique index uq_rva_open_per_vehicle
      on public.rental_vehicle_assignments (vehicle_id)
   where released_at is null;
  ```

  Both call sites already handle `23505` on this insert with the right message
  ("This vehicle was just assigned elsewhere — refresh and try again") and already perform the right
  compensating writes. **The error handling for this index was written; the index was not.**
- **Why it is critical:** it is the exact scenario the brief asks about — two riders, one scooter —
  and the code believes it is protected. A reader auditing this file would read the comment, see the
  `23505` branch, and conclude it is handled.

### M8 — Two concurrent bookings from one rider both succeed

Covered in [02-backend-rider.md](02-backend-rider.md) §2.3. `hasActiveBookingForUser` is
check-then-act with no supporting unique index on `bookings (user_id)` for open statuses.

## 10.3 Cancellation, return and vehicle state

| Path | Guard | Verdict |
|---|---|---|
| Rider cancel (`POST /bookings/:id/cancel`) | ownership checked in service; `booking_cancellations` row; refund tracked in `refunds` only | PASS |
| Staff cancel (`POST /:id/admin-cancel`) | `bookings.cancel`; refuses past `confirmed` | PASS |
| Booking status transitions | `pending_payment → confirmed` guarded `.eq("status","pending_payment")`; `confirmed → fulfilled` guarded `.eq("status","confirmed")` — a racing second call gets zero rows and a 409 | PASS |
| Hold expiry | `bookings.hold_expires_at` + the expiry sweep | **FAIL — C4**, the sweep never runs, so holds are permanent |
| Return request → inspection → approve | `rental_returns` → `rentals.status='completed'` + `released_at` → `rental_settlements` | PASS |
| Vehicle state after return | trigger-derived; `released_at` set → `recompute_vehicle_status` → `available` | PASS |
| Rental ↔ subscription integrity | `assert_rental_user_matches_subscription` trigger | PASS |

### L5 — `v_rental_current_vehicle` does not filter on rental status

```sql
create view public.v_rental_current_vehicle … as
select … from public.rental_vehicle_assignments a
  join public.rentals r on r.id = a.rental_id
 where a.released_at is null;      -- ← no `and r.status = 'active'`
```

An assignment left open on a `completed` or `force_ended` rental still appears as the rider's
"current vehicle". Given the multi-step, non-transactional completion path (**H4**), that state is
reachable if the process dies between `rentals.status='completed'` and the `released_at` update.
Adding `and r.status = 'active'` costs nothing and makes the view self-correcting.

## 10.4 Summary

The **automatic** booking-and-allocation path is correctly protected and is a genuine improvement
over the old schema. The **manual** pickup and walk-in assignment paths are protected only by a
check-then-act read plus a unique index that was never created. Two riders can be handed the same
scooter today.
