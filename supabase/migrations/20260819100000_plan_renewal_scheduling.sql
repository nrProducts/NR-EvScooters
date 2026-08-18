-- Rider Plan Renewal & Return Scooter Overhaul.
--
-- Renewal becomes genuinely two-phase: paying the next weekly-due invoice no
-- longer immediately overwrites current_period_start/next_due_at. Paid
-- on/before next_due_at -> the current plan stays untouched, a scheduled
-- renewal is recorded instead; the daily payment-overdue-sweep activates it
-- once next_due_at actually arrives. Paid after next_due_at (late) -> rolls
-- forward immediately, same as before, with a configurable late fee instead
-- of the old hardcoded per-day one.
create type public.renewal_status as enum ('none', 'scheduled');

alter table public.bookings
    add column if not exists renewal_status public.renewal_status not null default 'none',
    add column if not exists scheduled_start_date date,
    add column if not exists scheduled_duration_days int,
    add column if not exists renewal_invoice_id uuid references public.invoices(id) on delete set null,
    add column if not exists late_fee_override numeric(10,2);

alter table public.bookings
    add constraint bookings_renewal_scheduled_chk check (
        (renewal_status = 'none' and scheduled_start_date is null and scheduled_duration_days is null)
        or
        (renewal_status = 'scheduled' and scheduled_start_date is not null and scheduled_duration_days is not null)
    );

-- Global late-renewal-fee config. Singleton by convention (one seeded row,
-- app code only ever updates it — no create/delete endpoint), same shape
-- style as notification_settings but without a per-type key since there's
-- only one fee to configure.
create table public.plan_renewal_settings (
    id               uuid primary key default gen_random_uuid(),
    late_fee_enabled boolean not null default false,
    late_fee_amount  numeric(10,2) not null default 0,
    updated_at       timestamptz
);

create trigger trg_plan_renewal_settings_updated_at
    before update on public.plan_renewal_settings
    for each row execute function public.set_updated_at();

insert into public.plan_renewal_settings (late_fee_enabled, late_fee_amount) values (false, 0);

alter table public.plan_renewal_settings enable row level security;

create policy plan_renewal_settings_admin_all on public.plan_renewal_settings
    for all using (public.is_admin()) with check (public.is_admin());
