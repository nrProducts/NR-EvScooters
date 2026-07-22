-- =========================================================================
-- 20260721100100_bookings_rls.sql
--
-- RLS for public.bookings — copies the owner-or-admin pattern used for
-- public.rentals in 20260720100500_rls.sql verbatim: a rider only ever
-- sees/creates/updates their own bookings; an admin sees/updates all.
-- =========================================================================

alter table public.bookings enable row level security;

create policy bookings_select on public.bookings
    for select using (user_id = auth.uid() or public.is_admin());

create policy bookings_insert on public.bookings
    for insert with check (user_id = auth.uid());

create policy bookings_update on public.bookings
    for update using (user_id = auth.uid() or public.is_admin());
