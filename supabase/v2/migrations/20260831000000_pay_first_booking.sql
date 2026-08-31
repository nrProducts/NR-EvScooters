-- =========================================================================
-- Pay-first booking
--
-- Before this migration the rider flow was:
--   POST /bookings           -> bookings row 'pending_payment'
--   POST /payments/bookings/:id/order
--                            -> subscription 'pending_payment', period 1,
--                               deposit 'pending', opening invoice, order
--   Razorpay -> verify/webhook -> applyInitialSuccess confirms everything
--
-- So a booking + subscription + unpaid invoice existed before any money
-- moved. An abandoned checkout left them behind for the sweep to clean, and
-- `pending_payment` counted as an active booking (blocking re-booking).
--
-- Now the rider flow is:
--   POST /payments/bookings/order
--                            -> ONE payment_orders row (purpose='booking',
--                               booking_intent jsonb) — NOT a booking
--   Razorpay -> verify/webhook -> applyPaymentSuccess sees purpose='booking'
--                              -> create_booking_from_order() materialises the
--                                 booking (confirmed), subscription (active),
--                                 period, deposit (held) in one transaction,
--                                 idempotent on bookings.created_from_order_id.
--
-- The old invoice-tied path (POST /payments/bookings/:id/order, ensureBooking-
-- Invoice, applyInitialSuccess) is KEPT unchanged for adminCreateBooking —
-- admin still creates a 'pending_payment' booking a rider can pay later.
-- =========================================================================

-- --- 1. payment_orders: an order need not name an invoice ------------------

alter table public.payment_orders
    alter column invoice_id drop not null;

alter table public.payment_orders
    add column purpose text not null default 'invoice'
        check (purpose in ('invoice', 'booking'));

alter table public.payment_orders
    add column booking_intent jsonb;

comment on column public.payment_orders.purpose is
    'invoice — pays one invoice (the original design). booking — a pre-booking checkout intent; booking_intent carries the snapshot, and create_booking_from_order() materialises the real records on capture.';
comment on column public.payment_orders.booking_intent is
    'Set only when purpose=''booking''. { user_id, plan_id, vehicle_model_id, hub_id, requested_start_on, plan_price_snapshot, duration_days_snapshot, deposit_amount_snapshot, billing_period_snapshot }.';

alter table public.payment_orders
    add constraint chk_payment_orders_purpose check (
        (purpose = 'invoice') = (invoice_id     is not null)
        and (purpose = 'booking') = (booking_intent is not null)
    );

-- At most one open booking-intent order per rider (mirrors "one active booking").
create unique index if not exists uq_payment_orders_open_booking_per_user
    on public.payment_orders (user_id)
    where purpose = 'booking' and status in ('created', 'attempted');

comment on index public.uq_payment_orders_open_booking_per_user is
    'One in-flight booking checkout per rider. A retried Pay reuses this row; a changed plan/date supersedes it.';

-- The existing "one open order per invoice" index — make its invoice scope
-- explicit now that invoice_id can be null.
drop index if exists public.uq_payment_orders_open_per_invoice;
create unique index uq_payment_orders_open_per_invoice
    on public.payment_orders (invoice_id)
    where purpose = 'invoice' and status in ('created', 'attempted');


-- --- 2. The insert IDOR guard skips booking-intent orders -----------------
-- There is no invoice to check ownership/currency/void against yet; the
-- booking-intent snapshot is validated in the application layer instead.

create or replace function public.assert_payment_order_matches_invoice()
returns trigger language plpgsql set search_path = ''
as $$
declare v_user_id uuid; v_currency char(3); v_status public.invoice_status;
begin
    if new.purpose = 'booking' then
        return new;
    end if;

    select i.user_id, i.currency, i.status
      into v_user_id, v_currency, v_status
      from public.invoices i where i.id = new.invoice_id;

    if v_user_id is null then
        raise exception 'Payment order references a non-existent invoice %.', new.invoice_id
            using errcode = 'foreign_key_violation';
    end if;

    if new.user_id <> v_user_id then
        raise exception 'Payment order user % does not own invoice % (owner %).',
            new.user_id, new.invoice_id, v_user_id
            using errcode = 'check_violation';
    end if;

    if new.currency <> v_currency then
        raise exception 'Payment order currency % does not match invoice currency %.',
            new.currency, v_currency
            using errcode = 'check_violation';
    end if;

    if v_status = 'void' then
        raise exception 'Invoice % is void and cannot be paid.', new.invoice_id
            using errcode = 'check_violation';
    end if;

    return new;
end $$;


-- --- 3. bookings: the materialisation idempotency anchor ------------------

alter table public.bookings
    add column created_from_order_id uuid unique
        references public.payment_orders (id) on delete set null;

comment on column public.bookings.created_from_order_id is
    'The payment_orders row (purpose=''booking'') whose capture created this booking. UNIQUE — a redelivered webhook / a verify+webhook race cannot create a second booking. NULL for admin-created bookings.';


-- --- 4. create_booking_from_order --------------------------------------------
-- Runs on payment capture (verify OR webhook — applyPaymentSuccess is already
-- gated once per payment by payment_transactions.gateway_payment_id UNIQUE).
-- One transaction: everything, or nothing.

create or replace function public.create_booking_from_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_order           public.payment_orders%rowtype;
    v_intent          jsonb;
    v_user_id         uuid;
    v_plan_id         uuid;
    v_hub_id          uuid;
    v_start           date;
    v_price           numeric(12,2);
    v_duration        integer;
    v_deposit         numeric(12,2);
    v_billing         text;
    v_booking_id      uuid;
    v_subscription_id uuid;
    v_end             date;
begin
    select * into v_order from public.payment_orders where id = p_order_id for update;
    if not found or v_order.purpose <> 'booking' then
        raise exception 'not_a_booking_order' using errcode = 'P0001';
    end if;

    -- Already materialised by a prior delivery of this payment.
    select id into v_booking_id from public.bookings where created_from_order_id = p_order_id;
    if found then
        return v_booking_id;
    end if;

    v_intent   := v_order.booking_intent;
    v_user_id  := (v_intent ->> 'user_id')::uuid;
    v_plan_id  := (v_intent ->> 'plan_id')::uuid;
    v_hub_id   := (v_intent ->> 'hub_id')::uuid;
    v_start    := (v_intent ->> 'requested_start_on')::date;
    v_price    := (v_intent ->> 'plan_price_snapshot')::numeric;
    v_duration := (v_intent ->> 'duration_days_snapshot')::integer;
    v_deposit  := (v_intent ->> 'deposit_amount_snapshot')::numeric;
    v_billing  := (v_intent ->> 'billing_period_snapshot');

    -- The application guard checked this at order time, but an admin could
    -- have created a booking for this rider in the window before capture.
    -- P0001 with this exact message lets the caller flag it for a manual
    -- refund instead of double-booking.
    if exists (
        select 1 from public.bookings
         where user_id = v_user_id and status in ('pending_payment', 'confirmed')
    ) or exists (
        select 1 from public.rentals where user_id = v_user_id and status = 'active'
    ) then
        raise exception 'active_booking_exists' using errcode = 'P0001';
    end if;

    insert into public.bookings (
        user_id, plan_id, hub_id, requested_start_on, status,
        plan_price_snapshot, deposit_amount_snapshot, duration_days_snapshot,
        created_from_order_id
    ) values (
        v_user_id, v_plan_id, v_hub_id, v_start, 'confirmed',
        v_price, v_deposit, v_duration, p_order_id
    )
    on conflict (created_from_order_id) do nothing
    returning id into v_booking_id;

    if v_booking_id is null then
        select id into v_booking_id from public.bookings where created_from_order_id = p_order_id;
        return v_booking_id;
    end if;

    insert into public.subscriptions (
        booking_id, user_id, plan_id,
        plan_price_snapshot, duration_days_snapshot, deposit_amount_snapshot,
        billing_period_snapshot, started_on, status
    ) values (
        v_booking_id, v_user_id, v_plan_id,
        v_price, v_duration, v_deposit,
        v_billing::public.billing_period, v_start, 'active'
    )
    returning id into v_subscription_id;

    -- Same rule as planExpiryFor / ensureSubscription: day 1 is the pickup
    -- day, so an N-day plan runs through start + (N - 1).
    v_end := v_start + (v_duration - 1);

    insert into public.subscription_periods (
        subscription_id, sequence_number, starts_on, ends_on, due_on,
        base_amount_snapshot, status
    ) values (
        v_subscription_id, 1, v_start, v_end, v_end, v_price, 'current'
    );

    insert into public.deposits (subscription_id, amount, status, held_at)
    values (v_subscription_id, v_deposit, 'held', now());

    return v_booking_id;
end $$;

revoke all on function public.create_booking_from_order(uuid) from public, anon, authenticated;
grant execute on function public.create_booking_from_order(uuid) to service_role;

comment on function public.create_booking_from_order(uuid) is
    'Materialises a real booking + active subscription + period + held deposit from a captured purpose=''booking'' payment_orders row, in one transaction. Idempotent on bookings.created_from_order_id. Raises P0001 ''active_booking_exists'' if the rider acquired another active booking/rental between order and capture.';


-- --- 5. expire_stale_payment_orders already covers booking-intent orders --
-- It filters on status + expires_at + "no succeeded transaction", which is
-- purpose-agnostic, so an abandoned booking checkout's order is expired the
-- same way an abandoned invoice order is — and there is no booking/subscription
-- to clean up because none was created. No body change; noted here.
comment on function public.expire_stale_payment_orders() is
    'Expires created/attempted orders past their TTL with no succeeded transaction — invoice AND booking-intent orders alike. A stale booking-intent order simply expires; nothing else was created.';
