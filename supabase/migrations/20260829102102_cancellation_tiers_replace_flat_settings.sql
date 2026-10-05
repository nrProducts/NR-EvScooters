-- Replace the flat cancellation_settings (grace / notice / rate) with a
-- TIERED policy keyed on minutes elapsed since the booking was created:
--   elapsed <= 30 min  -> keep 25% of the plan amount paid
--   elapsed <= 60 min  -> keep 50%
--   beyond the last tier -> keep 100% (no plan refund; deposit still refunded)

drop table if exists public.cancellation_settings;

create table public.cancellation_tiers (
    id             uuid primary key default gen_random_uuid(),
    upto_minutes   integer      not null check (upto_minutes > 0),
    penalty_percent numeric(5,2) not null check (penalty_percent >= 0 and penalty_percent <= 100),
    created_at     timestamptz  not null default now(),
    updated_at     timestamptz,
    unique (upto_minutes)
);

comment on table public.cancellation_tiers is
    'Pre-pickup cancellation policy as time slabs. A cancellation whose minutes-since-booking is <= the SMALLEST upto_minutes that still covers it keeps that tier''s penalty_percent of the plan amount paid (deposit is always refunded in full). Past the largest tier, 100% is kept. Empty table => no penalty ever (compile-time DEFAULT_CANCELLATION_TIERS is the fallback the app ships with).';

create trigger trg_cancellation_tiers_updated_at
    before update on public.cancellation_tiers
    for each row execute function public.set_updated_at();

insert into public.cancellation_tiers (upto_minutes, penalty_percent) values
    (30, 25),
    (60, 50);

alter table public.cancellation_tiers enable row level security;

-- Riders may read the policy (the app shows "cancel now = ₹X back"); only
-- admins may change it.
create policy p_cancellation_tiers_read on public.cancellation_tiers
    for select to authenticated using (true);
create policy p_cancellation_tiers_write on public.cancellation_tiers
    for all to authenticated using (public.is_admin()) with check (public.is_admin());
