-- The `late_fee` pricing_rules row has gone missing a second time (see
-- 20260824100700_restore_late_fee_pricing_rule.sql for the first
-- occurrence) — GET /plan-renewal-settings resolves it by code and 404s
-- with no row, which left the admin console's Billing & Charges page stuck
-- on "Loading late fee settings…" forever (it never surfaces query errors,
-- only a loading state). Re-seeding with the same values as the original,
-- and this time closing the hole: deleteChargeRule now refuses to delete
-- this row (see billing.service.ts), so the Charge Rules hard-delete
-- action can't remove it a third time.
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
