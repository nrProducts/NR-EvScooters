-- =========================================================================
-- 20260720100500_rls.sql
-- Row Level Security — kept minimal on purpose (2 roles: rider, admin)
-- but present on every table. This is the one area we do not simplify
-- away: every table is reachable through the public API, so every table
-- needs an explicit policy or it's either wide open or fully locked.
-- =========================================================================

-- ---------------------------------------------------------------------
-- Helper: is the calling user an admin?
-- SECURITY DEFINER so it can read user_roles regardless of the caller's
-- own row-level access (avoids recursive policy checks).
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = auth.uid() and r.name = 'admin'
    );
$$;

grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------
alter table public.users enable row level security;

create policy users_select on public.users
    for select using (id = auth.uid() or public.is_admin());

create policy users_update on public.users
    for update using (id = auth.uid() or public.is_admin());

create policy users_insert on public.users
    for insert with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- roles (reference data — everyone can read, nobody writes via API)
-- ---------------------------------------------------------------------
alter table public.roles enable row level security;

create policy roles_select on public.roles
    for select using (auth.uid() is not null);

-- ---------------------------------------------------------------------
-- user_roles
-- ---------------------------------------------------------------------
alter table public.user_roles enable row level security;

create policy user_roles_select on public.user_roles
    for select using (user_id = auth.uid() or public.is_admin());

create policy user_roles_write on public.user_roles
    for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- user_documents
-- ---------------------------------------------------------------------
alter table public.user_documents enable row level security;

create policy user_documents_select on public.user_documents
    for select using (user_id = auth.uid() or public.is_admin());

create policy user_documents_insert on public.user_documents
    for insert with check (user_id = auth.uid());

create policy user_documents_admin_write on public.user_documents
    for update using (public.is_admin());

-- ---------------------------------------------------------------------
-- stations (public read — riders need to see swap locations)
-- ---------------------------------------------------------------------
alter table public.stations enable row level security;

create policy stations_select on public.stations
    for select using (auth.uid() is not null);

create policy stations_admin_write on public.stations
    for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- vehicles (public read — riders browse available scooters)
-- ---------------------------------------------------------------------
alter table public.vehicles enable row level security;

create policy vehicles_select on public.vehicles
    for select using (auth.uid() is not null);

create policy vehicles_admin_write on public.vehicles
    for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- vehicle_maintenance (admin/internal only)
-- ---------------------------------------------------------------------
alter table public.vehicle_maintenance enable row level security;

create policy vehicle_maintenance_admin_only on public.vehicle_maintenance
    for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- vehicle_documents (admin/internal only)
-- ---------------------------------------------------------------------
alter table public.vehicle_documents enable row level security;

create policy vehicle_documents_admin_only on public.vehicle_documents
    for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- plans (public read — riders browse plans)
-- ---------------------------------------------------------------------
alter table public.plans enable row level security;

create policy plans_select on public.plans
    for select using (auth.uid() is not null);

create policy plans_admin_write on public.plans
    for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------
alter table public.subscriptions enable row level security;

create policy subscriptions_select on public.subscriptions
    for select using (user_id = auth.uid() or public.is_admin());

create policy subscriptions_insert on public.subscriptions
    for insert with check (user_id = auth.uid());

create policy subscriptions_admin_write on public.subscriptions
    for update using (public.is_admin());

-- ---------------------------------------------------------------------
-- rentals
-- ---------------------------------------------------------------------
alter table public.rentals enable row level security;

create policy rentals_select on public.rentals
    for select using (user_id = auth.uid() or public.is_admin());

create policy rentals_insert on public.rentals
    for insert with check (user_id = auth.uid());

create policy rentals_update on public.rentals
    for update using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- invoices (rider read-only, admin manages billing/payment status)
-- ---------------------------------------------------------------------
alter table public.invoices enable row level security;

create policy invoices_select on public.invoices
    for select using (user_id = auth.uid() or public.is_admin());

create policy invoices_admin_write on public.invoices
    for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- support_requests
-- ---------------------------------------------------------------------
alter table public.support_requests enable row level security;

create policy support_requests_select on public.support_requests
    for select using (user_id = auth.uid() or public.is_admin());

create policy support_requests_insert on public.support_requests
    for insert with check (user_id = auth.uid());

create policy support_requests_admin_write on public.support_requests
    for update using (public.is_admin());

-- ---------------------------------------------------------------------
-- rental_feedback
-- ---------------------------------------------------------------------
alter table public.rental_feedback enable row level security;

create policy rental_feedback_select on public.rental_feedback
    for select using (user_id = auth.uid() or public.is_admin());

create policy rental_feedback_insert on public.rental_feedback
    for insert with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- incident_reports
-- ---------------------------------------------------------------------
alter table public.incident_reports enable row level security;

create policy incident_reports_select on public.incident_reports
    for select using (reported_by = auth.uid() or public.is_admin());

create policy incident_reports_insert on public.incident_reports
    for insert with check (reported_by = auth.uid());

create policy incident_reports_admin_write on public.incident_reports
    for update using (public.is_admin());

-- ---------------------------------------------------------------------
-- notifications_log (rider reads own; only backend/service role writes,
-- so no insert policy for the authenticated role at all)
-- ---------------------------------------------------------------------
alter table public.notifications_log enable row level security;

create policy notifications_log_select on public.notifications_log
    for select using (user_id = auth.uid() or public.is_admin());
