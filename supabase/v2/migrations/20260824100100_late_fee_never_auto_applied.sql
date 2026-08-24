-- =========================================================================
-- 50 — the late fee can never be auto-applied, by construction
--
-- Migration 48 stopped the ₹450 late fee landing on every rider's FIRST
-- invoice by setting auto_apply = false on the `late_fee` row. That fixed the
-- row. It did not fix the rule, and the difference showed up within a day:
--
--   10:59  the late_fee rule is deleted from the admin console
--   17:17  it is recreated from the admin console
--   →      auto_apply takes the column default, TRUE
--   →      frequency 'one_time' matches sequence_number = 1
--   →      "Late fee ₹450" is back on every new booking
--
-- Nothing in the backend ever writes auto_apply — grep confirms zero
-- references outside the generated types — so any rule created through the
-- console gets the default. For an ordinary charge or discount that default
-- is right. For the late fee it is actively wrong, and no one editing a
-- pricing rule in the console can see the column, let alone know to change it.
--
-- ── Why a trigger and not a different default ────────────────────────────
--
-- Flipping the default to false would break every OTHER rule: the transaction
-- fee and the welcome discount are supposed to be applied by the periodic
-- pass, and they are created through the same console screen.
--
-- The real invariant is narrower: the late fee is applied by the
-- payment-overdue sweep against a period that ACTUALLY LAPSED, and by
-- computeLateRenewalFee at checkout. Being auto-applied is not a setting it
-- should have — it is a thing it must never be. That belongs in the schema,
-- not in whoever last edited the row.
--
-- Coerces rather than raises: the console does not expose auto_apply, so
-- rejecting the insert would fail rule creation with an error about a field
-- the operator cannot see or fix.
-- =========================================================================

create or replace function public.enforce_late_fee_not_auto_applied()
returns trigger language plpgsql set search_path = ''
as $$
begin
    -- `late_fee` is the global rate. `late_fee:<subscription_id>` is a
    -- per-subscription override — the successor to bookings.late_fee_override
    -- — and must be excluded on exactly the same grounds.
    --
    -- The underscore is escaped: unescaped, `_` is a LIKE single-character
    -- wildcard and the pattern would also match 'lateXfee:...'.
    if new.code = 'late_fee' or new.code like 'late\_fee:%' then
        if new.auto_apply then
            raise notice 'pricing_rules.% is applied by the overdue sweep, not the periodic pass; auto_apply forced to false.', new.code;
        end if;
        new.auto_apply := false;
    end if;
    return new;
end $$;

comment on function public.enforce_late_fee_not_auto_applied is
    'Keeps the late fee out of apply_period_adjustments no matter how the rule is created or edited. Without it, recreating the rule from the admin console reinstates a ₹450 charge on every rider''s first invoice, because auto_apply defaults to true and nothing in the application sets it.';

drop trigger if exists trg_pricing_rules_late_fee_manual on public.pricing_rules;
create trigger trg_pricing_rules_late_fee_manual
    before insert or update on public.pricing_rules
    for each row execute function public.enforce_late_fee_not_auto_applied();

-- Repair the row that is live right now.
update public.pricing_rules
   set auto_apply = false, updated_at = now()
 where (code = 'late_fee' or code like 'late\_fee:%')
   and auto_apply;

-- Void any first-period late fee the recreated rule has already produced.
-- Voided rather than deleted: subscription_adjustments carries a void trail
-- for exactly this. Rows already invoiced or settled are left alone — money
-- has moved against those, and correcting them is a refund decision.
update public.subscription_adjustments
   set status      = 'voided',
       voided_at   = now(),
       void_reason = 'Late fee auto-applied to period 1 in error; see migration 50.',
       updated_at  = now()
 where code_snapshot like 'late\_fee%'
   and status = 'pending'
   and subscription_period_id in (
       select id from public.subscription_periods where sequence_number = 1
   );

revoke all on function public.enforce_late_fee_not_auto_applied()
    from public, anon, authenticated;
