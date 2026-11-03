-- =========================================================================
-- Late UPI success: let a FAILED payment_transactions row become SUCCEEDED
--
-- A UPI payment can be declined and then captured under the SAME Razorpay
-- pay_id minutes later. recordFailedAttempt() stores the decline first, so
-- when the capture arrives applyPaymentSuccess() hits the UNIQUE
-- gateway_payment_id and used to return as "already applied" — money
-- captured, no booking, no allocation, no tax invoice. Recovery so far has
-- been by hand (supabase/scripts/payment-recovery, p_upgrade_failed_txn),
-- which disables the append-only trigger for one UPDATE.
--
-- This replaces the blanket append-only trigger on payment_transactions with
-- a guard that permits exactly that one transition and nothing else:
--   • status 'failed' → 'succeeded' only (never back, never any other pair)
--   • id, payment_order_id, gateway_payment_id and created_at unchanged
--   • the failure fields cleared, captured_at set (the existing CHECKs
--     chk_payment_transactions_captured / _failed enforce the shape)
-- DELETE keeps trg_append_only's behaviour, including app.purge_mode.
-- =========================================================================

create or replace function public.trg_payment_transactions_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
    if tg_op = 'DELETE' then
        if coalesce(current_setting('app.purge_mode', true), '') = 'on' then
            return old;
        end if;
        raise exception 'Table public.payment_transactions is append-only; DELETE is not permitted.';
    end if;

    if old.status = 'failed'
       and new.status = 'succeeded'
       and new.id = old.id
       and new.payment_order_id = old.payment_order_id
       and new.gateway_payment_id = old.gateway_payment_id
       and new.created_at = old.created_at
    then
        return new;
    end if;

    raise exception 'Table public.payment_transactions is append-only; the only permitted UPDATE is failed → succeeded for the same payment (late UPI success).';
end $$;

comment on function public.trg_payment_transactions_guard() is
    'Append-only guard for payment_transactions with one exception: a declined attempt whose SAME pay_id is later captured (late UPI success) may be upgraded failed → succeeded in place. Everything else, and every DELETE outside app.purge_mode, is rejected.';

drop trigger if exists trg_payment_transactions_append_only on public.payment_transactions;
create trigger trg_payment_transactions_append_only
    before update or delete on public.payment_transactions
    for each row execute function public.trg_payment_transactions_guard();

revoke all on function public.trg_payment_transactions_guard() from public, anon, authenticated;
grant execute on function public.trg_payment_transactions_guard() to service_role;
