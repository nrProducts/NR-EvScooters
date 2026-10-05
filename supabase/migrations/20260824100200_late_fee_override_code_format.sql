-- =========================================================================
-- 51 — the late-fee override code, and widening migration 50's guard
--
-- Two things, both about the same rule family.
--
-- ── 1. The per-subscription override could never be created ──────────────
--
-- setLateFeeOverride() (subscriptions.service.ts) inserts a pricing rule
-- keyed `late_fee:<subscription uuid>`. `pricing_rules.code` is constrained:
--
--     check (code ~ '^[a-z][a-z0-9_]*$')
--
-- which allows neither `:` nor `-`. Every such insert therefore failed the
-- check constraint, and a per-subscription late-fee override was impossible
-- to create — the successor to bookings.late_fee_override has never once
-- worked.
--
-- It failed quietly because the READ paths (computeLateRenewalFee, and the
-- bulk lookup in bookings.service.ts) match on the same impossible code: the
-- lookup simply always missed and the global rate was used, which looks
-- exactly like "no override configured".
--
-- Found by a guard test for migration 50 that tried to insert one.
--
-- The application now generates `late_fee_<uuid with _ for ->`, which
-- conforms. No data migration is needed: there are no existing rows to
-- rename, because none could ever be written.
--
-- ── 2. Migration 50's trigger only matched the old, impossible form ──────
--
-- It tested `code like 'late\_fee:%'`. With the format corrected, an override
-- would slip past it and be auto-applied — reintroducing the first-invoice
-- charge through the override path instead of the global one. The trigger is
-- widened to cover both spellings: the new one, and the old one so that any
-- environment where the constraint was ever relaxed stays covered.
-- =========================================================================

create or replace function public.enforce_late_fee_not_auto_applied()
returns trigger language plpgsql set search_path = ''
as $$
begin
    -- `late_fee`             the global rate
    -- `late_fee_<uuid>`      per-subscription override (current format)
    -- `late_fee:<uuid>`      the old, constraint-violating format, kept so a
    --                        relaxed environment is still covered
    --
    -- Underscores are escaped throughout: unescaped, `_` is a LIKE
    -- single-character wildcard and 'late_fee%' would also match 'lateXfee…'.
    if new.code = 'late_fee'
       or new.code like 'late\_fee\_%'
       or new.code like 'late\_fee:%' then
        if new.auto_apply then
            raise notice 'pricing_rules.% is applied by the overdue sweep, not the periodic pass; auto_apply forced to false.', new.code;
        end if;
        new.auto_apply := false;
    end if;
    return new;
end $$;

comment on function public.enforce_late_fee_not_auto_applied is
    'Keeps every late-fee rule — global and per-subscription — out of apply_period_adjustments, whatever the code spelling and however the row is created. Without it, recreating the rule from the admin console reinstates a charge on every rider''s first invoice: auto_apply defaults to true and nothing in the application sets it.';

-- Catch anything already stored under the new spelling.
update public.pricing_rules
   set auto_apply = false, updated_at = now()
 where (code = 'late_fee' or code like 'late\_fee\_%' or code like 'late\_fee:%')
   and auto_apply;

revoke all on function public.enforce_late_fee_not_auto_applied()
    from public, anon, authenticated;
