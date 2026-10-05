-- =========================================================================
-- 28c — Seed: the `late_fee` pricing rule
--
-- RECOVERED FROM THE LIVE DATABASE (2026-08-20).
--
-- Applied to `cndqvdskrcmivqflbttl` as `20260819082051_seed_late_fee_pricing_rule`
-- with no source file in this directory. See
-- docs/final-system-audit/01-database-backend.md (finding C3).
--
-- This row is not optional reference data. `computeLateRenewalFee`
-- (apps/backend/src/modules/payments/renewalFee.ts) resolves the late-renewal
-- fee by looking up `pricing_rules` where `code = 'late_fee'`; with no row it
-- silently returns a zero fee, so a fresh environment would never charge one
-- and nothing would say why.
--
-- `frequency = 'one_time'` rather than 'every_period' because the fee is
-- applied by the payment-overdue sweep against a specific lapsed period, not
-- by the periodic adjustment pass — see apply_period_adjustments, which
-- deliberately does not pick this rule up.
-- =========================================================================

insert into public.pricing_rules
    (code, name, description, kind, amount_type, amount,
     frequency, scope, effective_from, is_active)
values (
    'late_fee',
    'Late fee',
    'Charged once per billing period that goes past due. Applied by the '
        || 'payment-overdue sweep, not by the periodic adjustment pass.',
    'charge',
    'fixed',
    450.00,
    'one_time',
    'global',
    '2026-08-19',
    true
)
on conflict (code) do nothing;
