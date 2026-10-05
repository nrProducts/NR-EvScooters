-- The `late_fee` pricing_rules row (seeded by 20260819082051) is missing from
-- the live project — computeLateRenewalFee resolves it by code and silently
-- returns a zero fee with no row, so every renewal has been charging no late
-- fee at all regardless of how overdue it is. Most likely deleted via the
-- Charge Rules hard-delete action added 2026-08-24, while testing it.
-- Re-seeding with the same values as the original.
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
