-- =========================================================================
-- 007_rls_policies.sql
-- Enable RLS on every table + policies. Pattern:
--   - Riders (auth.uid()) can only see/touch their own rows.
--   - Staff/technician/station_manager/admin (public.is_staff()) see all,
--     unless a stricter admin-only rule applies.
--   - Reference/master data is readable by any authenticated user.
--   - audit_logs is insert/select only for staff — no update/delete policy
--     exists for anyone, making it effectively immutable.
-- =========================================================================

-- ---------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------
alter table public.users enable row level security;

create policy users_select_own on public.users
    for select using (id = auth.uid() or public.is_staff());

create policy users_update_own on public.users
    for update using (id = auth.uid() or public.is_admin())
    with check (id = auth.uid() or public.is_admin());

create policy users_insert_self on public.users
    for insert with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- roles (reference data — read-only to app users, managed via migrations)
-- ---------------------------------------------------------------------
alter table public.roles enable row level security;

create policy roles_select_all on public.roles
    for select using (auth.uid() is not null);

-- ---------------------------------------------------------------------
-- user_roles
-- ---------------------------------------------------------------------
alter table public.user_roles enable row level security;

create policy user_roles_select on public.user_roles
    for select using (user_id = auth.uid() or public.is_staff());

create policy user_roles_admin_write on public.user_roles
    for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- user_documents
-- ---------------------------------------------------------------------
alter table public.user_documents enable row level security;

create policy user_documents_select on public.user_documents
    for select using (user_id = auth.uid() or public.is_staff());

create policy user_documents_insert_own on public.user_documents
    for insert with check (user_id = auth.uid());

create policy user_documents_staff_update on public.user_documents
    for update using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------
-- stations, vehicles, batteries, vehicle_telemetry, battery_swap_events,
-- vehicle_maintenance, vehicle_documents  -> fleet-internal, staff-managed
-- ---------------------------------------------------------------------
alter table public.stations enable row level security;
create policy stations_select_all on public.stations for select using (auth.uid() is not null);
create policy stations_staff_write on public.stations for all using (public.is_staff()) with check (public.is_staff());

alter table public.vehicles enable row level security;
create policy vehicles_select_all on public.vehicles for select using (auth.uid() is not null);
create policy vehicles_staff_write on public.vehicles for all using (public.is_staff()) with check (public.is_staff());

alter table public.batteries enable row level security;
create policy batteries_staff_all on public.batteries for all using (public.is_staff()) with check (public.is_staff());

alter table public.vehicle_telemetry enable row level security;
create policy telemetry_staff_all on public.vehicle_telemetry for all using (public.is_staff()) with check (public.is_staff());

alter table public.battery_swap_events enable row level security;
create policy swap_events_staff_all on public.battery_swap_events for all using (public.is_staff()) with check (public.is_staff());

alter table public.vehicle_maintenance enable row level security;
create policy maintenance_staff_all on public.vehicle_maintenance for all using (public.is_staff()) with check (public.is_staff());

alter table public.vehicle_documents enable row level security;
create policy vehicle_documents_staff_all on public.vehicle_documents for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------
-- plans (reference data)
-- ---------------------------------------------------------------------
alter table public.plans enable row level security;
create policy plans_select_all on public.plans for select using (auth.uid() is not null);
create policy plans_staff_write on public.plans for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------
alter table public.subscriptions enable row level security;

create policy subscriptions_select on public.subscriptions
    for select using (user_id = auth.uid() or public.is_staff());

create policy subscriptions_insert_own on public.subscriptions
    for insert with check (user_id = auth.uid() or public.is_staff());

create policy subscriptions_staff_update on public.subscriptions
    for update using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------
-- rentals
-- ---------------------------------------------------------------------
alter table public.rentals enable row level security;

create policy rentals_select on public.rentals
    for select using (user_id = auth.uid() or public.is_staff());

create policy rentals_insert_own on public.rentals
    for insert with check (user_id = auth.uid() or public.is_staff());

create policy rentals_update on public.rentals
    for update using (user_id = auth.uid() or public.is_staff())
    with check (user_id = auth.uid() or public.is_staff());

-- ---------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------
alter table public.invoices enable row level security;

create policy invoices_select on public.invoices
    for select using (user_id = auth.uid() or public.is_staff());

create policy invoices_staff_write on public.invoices
    for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------
alter table public.payments enable row level security;

create policy payments_select on public.payments
    for select using (
        public.is_staff()
        or exists (select 1 from public.invoices i where i.id = invoice_id and i.user_id = auth.uid())
    );

create policy payments_staff_write on public.payments
    for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------
-- promo_codes (reference) / promo_redemptions
-- ---------------------------------------------------------------------
alter table public.promo_codes enable row level security;
create policy promo_codes_select_active on public.promo_codes
    for select using (auth.uid() is not null);
create policy promo_codes_staff_write on public.promo_codes
    for all using (public.is_staff()) with check (public.is_staff());

alter table public.promo_redemptions enable row level security;
create policy promo_redemptions_select on public.promo_redemptions
    for select using (user_id = auth.uid() or public.is_staff());
create policy promo_redemptions_insert_own on public.promo_redemptions
    for insert with check (user_id = auth.uid() or public.is_staff());

-- ---------------------------------------------------------------------
-- support_requests
-- ---------------------------------------------------------------------
alter table public.support_requests enable row level security;

create policy support_select on public.support_requests
    for select using (user_id = auth.uid() or public.is_staff());

create policy support_insert_own on public.support_requests
    for insert with check (user_id = auth.uid() or public.is_staff());

create policy support_update on public.support_requests
    for update using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------
-- rental_feedback
-- ---------------------------------------------------------------------
alter table public.rental_feedback enable row level security;

create policy feedback_select on public.rental_feedback
    for select using (user_id = auth.uid() or public.is_staff());

create policy feedback_insert_own on public.rental_feedback
    for insert with check (
        user_id = auth.uid()
        and exists (
            select 1 from public.rentals r
            where r.id = rental_id and r.user_id = auth.uid() and r.status = 'completed'
        )
    );

-- ---------------------------------------------------------------------
-- incident_reports
-- ---------------------------------------------------------------------
alter table public.incident_reports enable row level security;

create policy incidents_select on public.incident_reports
    for select using (reported_by = auth.uid() or public.is_staff());

create policy incidents_insert on public.incident_reports
    for insert with check (reported_by = auth.uid() or public.is_staff());

create policy incidents_staff_update on public.incident_reports
    for update using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------
-- audit_logs: staff can read/insert; NO update or delete policy for anyone
-- (write path should go through a SECURITY DEFINER function or service role)
-- ---------------------------------------------------------------------
alter table public.audit_logs enable row level security;

create policy audit_select_staff on public.audit_logs
    for select using (public.is_staff());

create policy audit_insert_staff on public.audit_logs
    for insert with check (public.is_staff());

-- ---------------------------------------------------------------------
-- zones (reference)
-- ---------------------------------------------------------------------
alter table public.zones enable row level security;
create policy zones_select_all on public.zones for select using (auth.uid() is not null);
create policy zones_staff_write on public.zones for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------
-- notifications_log
-- ---------------------------------------------------------------------
alter table public.notifications_log enable row level security;

create policy notifications_select on public.notifications_log
    for select using (user_id = auth.uid() or public.is_staff());

create policy notifications_staff_write on public.notifications_log
    for all using (public.is_staff()) with check (public.is_staff());
