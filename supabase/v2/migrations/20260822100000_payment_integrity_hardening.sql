-- =========================================================================
-- 47 — Payment integrity hardening
--
-- ADDITIVE ONLY. No payment table is created, dropped or renamed here: the
-- v2 payment model (payment_orders -> payment_transactions ->
-- payment_allocations, with refunds naming the transaction they reverse) is
-- correct and stays exactly as it is. What was missing is the set of
-- invariants the DATABASE should own rather than trusting the service layer
-- to remember, plus the two columns a failed payment attempt needs in order
-- to be recorded at all.
--
-- Written to be re-runnable: every object is guarded, so applying this twice
-- is a no-op rather than an error.
--
-- Audit references are to docs/payment/01-current-payment-audit.md.
-- =========================================================================


-- =========================================================================
-- 1. Failed payment attempts become recordable
--
-- `payment_status` has always had a `failed` label but nothing could use it:
-- captured_at was NOT NULL DEFAULT now(), so a failed attempt would claim a
-- capture time, and there was nowhere to put the gateway's reason. A rider
-- who fails three times and succeeds on the fourth left no trace of the
-- three — which is exactly the history a support agent needs.
-- =========================================================================

alter table public.payment_transactions
    alter column captured_at drop not null;

alter table public.payment_transactions
    add column if not exists failure_code   text,
    add column if not exists failure_reason text;

comment on column public.payment_transactions.captured_at is
    'NULL for any status other than `succeeded`. Enforced by chk_payment_transactions_captured — a failed attempt must not claim a capture time.';
comment on column public.payment_transactions.failure_code is
    'Razorpay''s own error code (e.g. BAD_REQUEST_ERROR). Verbatim, never interpreted.';

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'chk_payment_transactions_captured') then
        alter table public.payment_transactions
            add constraint chk_payment_transactions_captured
            check ((status = 'succeeded') = (captured_at is not null));
    end if;

    if not exists (select 1 from pg_constraint where conname = 'chk_payment_transactions_failed') then
        alter table public.payment_transactions
            add constraint chk_payment_transactions_failed
            check (status <> 'failed' or failure_reason is not null);
    end if;
end $$;

-- Support's "what has this rider tried?" query, and the failure-rate metric.
create index if not exists idx_payment_txns_failed
    on public.payment_transactions (payment_order_id, created_at desc)
    where status = 'failed';


-- =========================================================================
-- 2. At most ONE open order per invoice
--
-- The idempotency key is `invoice:<id>:<amount>`, which stops a re-tap at the
-- same price from creating a second order but says nothing about a re-tap at
-- a DIFFERENT price — and the late fee grows every day, so the price does
-- change. Two open orders for one invoice is the shape of the double-tap
-- race and of audit finding H3 both.
--
-- The service layer must now supersede the stale order (mark it `expired`)
-- before opening a new one. This index is what makes forgetting impossible.
-- =========================================================================

-- Existing duplicates first, oldest superseded, so the index can be built.
-- Deterministic: ordered by created_at then id, keeping exactly the newest.
with ranked as (
    select id,
           row_number() over (partition by invoice_id order by created_at desc, id desc) as rn
      from public.payment_orders
     where status in ('created', 'attempted')
)
update public.payment_orders o
   set status = 'expired', updated_at = now()
  from ranked r
 where o.id = r.id and r.rn > 1;

create unique index if not exists uq_payment_orders_open_per_invoice
    on public.payment_orders (invoice_id)
    where status in ('created', 'attempted');

comment on index public.uq_payment_orders_open_per_invoice is
    'One collectable order per invoice at a time. Two riders cannot exist for one invoice, so two open orders can only mean a double-tap or a stale price — both of which must resolve to one order, not two.';


-- =========================================================================
-- 3. An order may not be created against someone else's invoice
--
-- The backend checks ownership on every path today. This is the same check
-- one layer down, where it cannot be forgotten by a new call site: it is the
-- structural answer to IDOR on payment_orders rather than a convention.
--
-- Currency is checked alongside because a mismatch between what the invoice
-- is denominated in and what we ask the gateway for is unrecoverable once
-- the money has moved.
-- =========================================================================

create or replace function public.assert_payment_order_matches_invoice()
returns trigger language plpgsql set search_path = ''
as $$
declare v_user_id uuid; v_currency char(3); v_status public.invoice_status;
begin
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

drop trigger if exists trg_payment_orders_match_invoice on public.payment_orders;
create trigger trg_payment_orders_match_invoice
    before insert on public.payment_orders
    for each row execute function public.assert_payment_order_matches_invoice();


-- =========================================================================
-- 4. `paid` is terminal
--
-- The state machine in docs/payment/03-payment-state-machine.md, enforced.
--
-- Note what is deliberately NOT forbidden: `failed -> paid` and
-- `expired -> paid`. Both are real. A rider whose first attempt on an order
-- declines may retry the same order and succeed, and a rider holding a
-- checkout sheet we already superseded may still pay it. Money that actually
-- arrived must always be recordable — refusing the transition would leave a
-- captured payment with nowhere to land, which is worse than a surprising
-- state change. The over-allocation guard is what keeps that safe.
-- =========================================================================

create or replace function public.assert_payment_order_transition()
returns trigger language plpgsql set search_path = ''
as $$
begin
    if old.status = 'paid' and new.status <> 'paid' then
        raise exception 'Payment order % is paid; it cannot move to %.', old.id, new.status
            using errcode = 'check_violation';
    end if;

    if new.invoice_id <> old.invoice_id then
        raise exception 'Payment order % cannot be re-pointed at another invoice.', old.id
            using errcode = 'check_violation';
    end if;

    if new.user_id <> old.user_id then
        raise exception 'Payment order % cannot change payer.', old.id
            using errcode = 'check_violation';
    end if;

    return new;
end $$;

drop trigger if exists trg_payment_orders_transition on public.payment_orders;
create trigger trg_payment_orders_transition
    before update on public.payment_orders
    for each row execute function public.assert_payment_order_transition();


-- =========================================================================
-- 5. Captured money may not exceed what the order asked for
--
-- Takes the row lock before summing, for the same reason
-- assert_allocation_within_invoice does: the webhook handler and the client
-- verify path are DESIGNED to run concurrently for one payment, so a check
-- that reads without locking has a phantom read under READ COMMITTED and
-- both transactions pass.
-- =========================================================================

create or replace function public.assert_transaction_within_order()
returns trigger language plpgsql set search_path = ''
as $$
declare v_order numeric(12,2); v_captured numeric(12,2);
begin
    if new.status <> 'succeeded' then return null; end if;

    select o.amount into v_order
      from public.payment_orders o where o.id = new.payment_order_id for update;

    select coalesce(sum(t.amount), 0) into v_captured
      from public.payment_transactions t
     where t.payment_order_id = new.payment_order_id and t.status = 'succeeded';

    if v_captured > v_order then
        raise exception 'Capture of % would exceed order % (asked %, captured %).',
            new.amount, new.payment_order_id, v_order, v_captured
            using errcode = 'check_violation';
    end if;
    return null;
end $$;

drop trigger if exists trg_transaction_within_order on public.payment_transactions;
create constraint trigger trg_transaction_within_order
    after insert on public.payment_transactions
    deferrable initially immediate
    for each row execute function public.assert_transaction_within_order();


-- =========================================================================
-- 6. Only money that actually arrived may be allocated or refunded
--
-- payment_allocations and refunds both reference payment_transactions with
-- nothing to stop them naming a `failed` or `pending` row. Before section 1
-- that was academic, because only succeeded rows were ever written. Now that
-- failed attempts are recorded it is a live hole, so it is closed in the
-- same migration that opens it.
-- =========================================================================

create or replace function public.assert_allocation_transaction_succeeded()
returns trigger language plpgsql set search_path = ''
as $$
declare v_status public.payment_status;
begin
    select t.status into v_status
      from public.payment_transactions t where t.id = new.payment_transaction_id;

    if v_status is distinct from 'succeeded' then
        raise exception 'Payment transaction % is %, not succeeded; it cannot be allocated.',
            new.payment_transaction_id, coalesce(v_status::text, 'missing')
            using errcode = 'check_violation';
    end if;
    return new;
end $$;

drop trigger if exists trg_allocation_transaction_succeeded on public.payment_allocations;
create trigger trg_allocation_transaction_succeeded
    before insert on public.payment_allocations
    for each row execute function public.assert_allocation_transaction_succeeded();

-- A refund must go back to the person who paid, out of money that succeeded.
-- `refunds.user_id` was previously free to name anyone at all.
create or replace function public.assert_refund_matches_payment()
returns trigger language plpgsql set search_path = ''
as $$
declare v_status public.payment_status; v_payer uuid;
begin
    select t.status, o.user_id
      into v_status, v_payer
      from public.payment_transactions t
      join public.payment_orders o on o.id = t.payment_order_id
     where t.id = new.payment_transaction_id;

    if v_payer is null then
        raise exception 'Refund references a non-existent payment transaction %.',
            new.payment_transaction_id
            using errcode = 'foreign_key_violation';
    end if;

    if v_status <> 'succeeded' then
        raise exception 'Payment transaction % is %, not succeeded; it cannot be refunded.',
            new.payment_transaction_id, v_status
            using errcode = 'check_violation';
    end if;

    if new.user_id <> v_payer then
        raise exception 'Refund payee % is not the payer of transaction % (payer %).',
            new.user_id, new.payment_transaction_id, v_payer
            using errcode = 'check_violation';
    end if;

    return new;
end $$;

drop trigger if exists trg_refunds_match_payment on public.refunds;
create trigger trg_refunds_match_payment
    before insert on public.refunds
    for each row execute function public.assert_refund_matches_payment();

-- Duplicate-refund protection that does not depend on remembering to check.
-- assert_refund_within_payment caps the TOTAL; this stops the narrower and
-- more common case of the same payout being requested twice concurrently,
-- where both reads see zero prior refunds and both pass the cap.
create unique index if not exists uq_refunds_open_per_transaction
    on public.refunds (payment_transaction_id)
    where status in ('pending', 'processing');

comment on index public.uq_refunds_open_per_transaction is
    'One in-flight refund per captured payment. A second is either a duplicate click or a race; either way it must wait for the first to resolve.';


-- =========================================================================
-- 7. Webhook processing visibility
--
-- `processed_at is null` already identifies events that were received and
-- never applied — the query reconciliation runs. What it could not say is
-- whether that is a first delivery still in flight or a payload that has
-- failed the same way eleven times, which is the difference between "wait"
-- and "page someone".
-- =========================================================================

alter table public.payment_webhook_events
    add column if not exists processing_attempts integer not null default 0;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'chk_webhook_events_attempts') then
        alter table public.payment_webhook_events
            add constraint chk_webhook_events_attempts check (processing_attempts >= 0);
    end if;
end $$;

comment on column public.payment_webhook_events.processing_attempts is
    'Incremented on every dispatch. A row with processed_at null and a high count is a poison payload, not a delivery in flight.';

-- Forged/replayed deliveries are now PERSISTED with is_signature_valid=false
-- rather than rejected without trace (audit finding L1), so this index
-- serves a query that will actually return rows.
create index if not exists idx_webhook_events_invalid
    on public.payment_webhook_events (received_at desc)
    where is_signature_valid = false;

create index if not exists idx_webhook_events_type
    on public.payment_webhook_events (event_type, received_at desc);


-- =========================================================================
-- 8. expire_stale_payment_orders — the sweep that closes abandoned checkout
--
-- payment_order_status has always had `expired` and nothing ever wrote it,
-- so idx_payment_orders_expiry served a sweep that did not exist (audit
-- finding M1). This is that sweep.
--
-- Deliberately conservative: an order with ANY succeeded transaction is left
-- alone regardless of its expiry, because a capture that arrived while the
-- sweep was running must never be expired out from under itself.
-- =========================================================================

create or replace function public.expire_stale_payment_orders()
returns integer language plpgsql set search_path = ''
as $$
declare v_count integer;
begin
    with expired as (
        update public.payment_orders o
           set status = 'expired', updated_at = now()
         where o.status in ('created', 'attempted')
           and o.expires_at is not null
           and o.expires_at < now()
           and not exists (select 1 from public.payment_transactions t
                            where t.payment_order_id = o.id and t.status = 'succeeded')
        returning 1)
    select count(*) into v_count from expired;
    return v_count;
end $$;

comment on function public.expire_stale_payment_orders() is
    'Closes checkout sessions the rider walked away from. Never touches an order that has captured money against it.';


-- =========================================================================
-- 9. Lock down the new functions
--
-- Same rule as migrations 28 and 29: Supabase exposes every public function
-- over PostgREST /rpc, so anything not meant for a client must be revoked.
-- expire_stale_payment_orders is called by the scheduled job through
-- service_role, which bypasses these grants.
-- =========================================================================

do $$
declare fn text;
begin
    foreach fn in array array[
        'assert_payment_order_matches_invoice()',
        'assert_payment_order_transition()',
        'assert_transaction_within_order()',
        'assert_allocation_transaction_succeeded()',
        'assert_refund_matches_payment()',
        'expire_stale_payment_orders()'
    ] loop
        execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    end loop;
end $$;
