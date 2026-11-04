-- =========================================================================
-- Late UPI success: let ONE failed payment_transactions row become succeeded.
--
-- The bug (prod, 2026-10-22 and 2026-11-04): a UPI payment is first reported
-- FAILED by Razorpay ("delay in response from the UPI app"), so
-- recordFailedAttempt stores a `failed` row for that pay_id. Seconds later
-- the bank confirms and Razorpay CAPTURES the SAME pay_id. applyPaymentSuccess
-- then tries to INSERT a `succeeded` row, hits the UNIQUE gateway_payment_id,
-- reads 23505 as "already applied" and returns. Money captured, nothing
-- recorded, no error anywhere.
--
-- The app now upgrades that failed row in place instead (payments.service.ts
-- upgradeFailedTransaction). That is an UPDATE, which trg_append_only blocks
-- unconditionally — so this replaces the function behind
-- trg_payment_transactions_append_only with one that allows exactly that one
-- transition and still blocks everything else.
--
-- Allowed UPDATE (and nothing else):
--   status            failed -> succeeded
--   captured_at       must be set (chk_payment_transactions_captured agrees)
--   method, gateway_signature, raw_payload, failure_code, failure_reason
--                     may change (the success payload replaces the failure one)
--   id, payment_order_id, gateway_payment_id, amount, created_at
--                     must NOT change
--
-- DELETE keeps the exact existing rule: only inside app.purge_mode.
--
-- The trigger NAME is kept on purpose: supabase/scripts/payment-recovery/
-- fix_payment.sql and verify_payment.sql reference
-- trg_payment_transactions_append_only by name.
--
-- trg_transaction_within_order (captured money may not exceed the order) only
-- fired AFTER INSERT; a row becoming `succeeded` by UPDATE would skip it. It
-- now fires on UPDATE as well. Its function needs no change — it already
-- returns early unless NEW.status = 'succeeded' and sums every succeeded row
-- on the order, which now includes the upgraded one.
--
-- Re-runnable. Rollback: re-point the trigger at public.trg_append_only()
-- and recreate trg_transaction_within_order as AFTER INSERT only.
-- =========================================================================

create or replace function public.trg_payment_transactions_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
    if tg_op = 'DELETE' then
        if coalesce(current_setting('app.purge_mode', true), '') = 'on' then
            return old;
        end if;
        raise exception 'Table %.% is append-only; % is not permitted.',
            tg_table_schema, tg_table_name, tg_op;
    end if;

    -- UPDATE: the one legitimate correction — a late success of a payment
    -- first reported as failed. Same payment, same order, same money.
    if old.status = 'failed'
       and new.status = 'succeeded'
       and new.captured_at is not null
       and new.id = old.id
       and new.payment_order_id = old.payment_order_id
       and new.gateway_payment_id = old.gateway_payment_id
       and new.amount = old.amount
       and new.created_at = old.created_at
    then
        return new;
    end if;

    raise exception 'Table %.% is append-only; % is not permitted (only failed -> succeeded for the same payment).',
        tg_table_schema, tg_table_name, tg_op;
end $$;

comment on function public.trg_payment_transactions_guard() is
    'Append-only guard for payment_transactions. Blocks every UPDATE except failed -> succeeded for the same payment/order/amount (late UPI success), and every DELETE outside app.purge_mode.';

drop trigger if exists trg_payment_transactions_append_only on public.payment_transactions;
create trigger trg_payment_transactions_append_only
    before update or delete on public.payment_transactions
    for each row execute function public.trg_payment_transactions_guard();

drop trigger if exists trg_transaction_within_order on public.payment_transactions;
create constraint trigger trg_transaction_within_order
    after insert or update on public.payment_transactions
    deferrable initially immediate
    for each row execute function public.assert_transaction_within_order();

-- Same rule as every other internal trigger function: not callable over /rpc.
revoke all on function public.trg_payment_transactions_guard() from public, anon, authenticated;
