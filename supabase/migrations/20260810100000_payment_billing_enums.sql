-- =========================================================================
-- 20260810100000_payment_billing_enums.sql
--
-- New enum types for the payment gateway / recurring-billing / deposit /
-- damage / refund system. Split into its own migration, ahead of anything
-- that references these types, per the project's additive-only convention.
-- =========================================================================

-- Weekly-billing state on a booking's plan. Distinct from rentals.status
-- (a ride-level "does the rider currently hold a vehicle" concern) — this
-- tracks whether the recurring rental fee is current.
create type public.plan_status as enum ('active', 'due', 'paused');

-- Security deposit lifecycle. Held separately from rental income.
create type public.deposit_status as enum ('pending', 'held', 'partially_refunded', 'refunded', 'forfeited');

-- Return-inspection damage record lifecycle.
create type public.damage_status as enum ('recorded', 'disputed', 'resolved');

-- What resumed a paused plan — for plan_pause_events' audit trail.
create type public.plan_resume_reason as enum ('temp_vehicle', 'original_handback', 'replacement');

-- Deposit refund lifecycle, independent of payment_status (a refund is its
-- own gateway call against an existing payment, not a fresh payment).
create type public.refund_status as enum ('pending', 'processing', 'success', 'failed');

-- What a Razorpay order/checkout was created to collect.
create type public.payment_purpose as enum ('booking_initial', 'weekly_due', 'damage_settlement', 'other');

-- Lifecycle of a payment_orders row (the Razorpay order itself, not the invoice it backs).
create type public.payment_order_status as enum ('created', 'attempted', 'paid', 'failed', 'expired');

-- What an invoices row is actually for. invoices is the "Payment" ledger
-- row per the spec — this is what makes one ledger usable for every purpose
-- instead of separate tables per money-movement type.
create type public.payment_type as enum ('rental', 'deposit', 'damage', 'penalty', 'refund', 'other');
