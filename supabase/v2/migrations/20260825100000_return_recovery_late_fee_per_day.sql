-- Admin-configurable rate for the RETURN (physical vehicle handover) late
-- fee. Was a compile-time constant (LATE_RETURN_FEE_PER_DAY = 100) on both
-- the backend and mobile app; return_recovery_settings already held the
-- sibling "how many days late before recovery" knob (max_late_fee_days), so
-- the per-day rate joins it here rather than getting a table of its own.
--
-- Distinct from pricing_rules code='late_fee' (the plan-RENEWAL late fee) —
-- unrelated concepts that happen to share the words "late fee".
alter table public.return_recovery_settings
    add column if not exists late_fee_per_day numeric(10,2) not null default 100;

comment on column public.return_recovery_settings.late_fee_per_day is
    'Flat ₹ charged per whole calendar day a scooter RETURN runs past its due date. Distinct from pricing_rules code=late_fee (the plan-renewal late fee).';
