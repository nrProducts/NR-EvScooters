-- =========================================================================
-- 26 — Row-Level Security
--
-- EVERY table, no exceptions. The old schema left five tables without RLS
-- and they were the entire billing engine — the tables holding money owed
-- by named riders.
--
-- Trust model:
--   backend + edge functions  -> service_role, BYPASSES RLS (middleware
--                                 is the control)
--   rider app                 -> REST only, never touches Postgres
--   admin console             -> REST, PLUS realtime on 4 tables and one
--                                 direct read, where RLS is the SOLE control
--
-- Writes are service_role-only across the whole schema. No client inserts,
-- updates or deletes anything directly.
-- =========================================================================

do $$
declare t text;
begin
    for t in select tablename from pg_tables where schemaname = 'public'
    loop
        execute format('alter table public.%I enable row level security', t);
    end loop;
end $$;

-- --- helper: read-only policy for authenticated ---------------------------
-- P3 — public catalogue
create policy p_modules_read      on public.modules      for select to authenticated using (true);
create policy p_permissions_read  on public.permissions  for select to authenticated using (true);
create policy p_vendors_read      on public.vendors      for select to authenticated
    using (deleted_at is null and is_active or public.is_staff());
create policy p_vehicle_models_read on public.vehicle_models for select to authenticated
    using (deleted_at is null and is_active or public.is_staff());
create policy p_vehicle_model_media_read on public.vehicle_model_media for select to authenticated using (true);
create policy p_hubs_read on public.hubs for select to authenticated
    using (deleted_at is null and is_active or public.is_staff());
create policy p_plans_read on public.plans for select to authenticated
    using (deleted_at is null and is_active or public.is_staff());
create policy p_consent_notices_read on public.consent_notices for select to authenticated using (true);

-- Riders see only stations meant for them; staff see all.
create policy p_swap_stations_read on public.swap_stations for select to authenticated
    using ((is_rider_visible and deleted_at is null) or public.is_staff());

-- P1 — own data
create policy p_users_read on public.users for select to authenticated
    using (id = (select auth.uid()) or public.is_staff());
create policy p_user_addresses_read on public.user_addresses for select to authenticated
    using (user_id = (select auth.uid()) or public.is_staff());
create policy p_user_related_read on public.user_related_persons for select to authenticated
    using (user_id = (select auth.uid()) or public.is_staff());
create policy p_user_devices_read on public.user_devices for select to authenticated
    using (user_id = (select auth.uid()) or public.is_staff());
create policy p_rider_profiles_read on public.rider_profiles for select to authenticated
    using (user_id = (select auth.uid()) or public.is_staff());
create policy p_bookings_read on public.bookings for select to authenticated
    using (user_id = (select auth.uid()) or public.is_staff());
create policy p_subscriptions_read on public.subscriptions for select to authenticated
    using (user_id = (select auth.uid()) or public.is_staff());
create policy p_rentals_read on public.rentals for select to authenticated
    using (user_id = (select auth.uid()) or public.is_staff());
create policy p_invoices_read on public.invoices for select to authenticated
    using (user_id = (select auth.uid()) or public.is_staff());
create policy p_payment_orders_read on public.payment_orders for select to authenticated
    using (user_id = (select auth.uid()) or public.is_staff());
create policy p_refunds_read on public.refunds for select to authenticated
    using (user_id = (select auth.uid()) or public.is_staff());
create policy p_support_tickets_read on public.support_tickets for select to authenticated
    using (user_id = (select auth.uid()) or public.is_staff());

-- kyc_documents: role alone is NOT enough — an explicit permission is required.
create policy p_kyc_documents_read on public.kyc_documents for select to authenticated
    using (user_id = (select auth.uid())
           or exists (select 1 from public.v_user_effective_permissions p
                       where p.user_id = (select auth.uid())
                         and p.module_key = 'kyc' and p.action = 'view'));

-- P2 — own via parent
create policy p_booking_cancellations_read on public.booking_cancellations for select to authenticated
    using (exists (select 1 from public.bookings b where b.id = booking_id
                    and (b.user_id = (select auth.uid()) or public.is_staff())));
create policy p_sub_periods_read on public.subscription_periods for select to authenticated
    using (exists (select 1 from public.subscriptions s where s.id = subscription_id
                    and (s.user_id = (select auth.uid()) or public.is_staff())));
create policy p_sub_pauses_read on public.subscription_pauses for select to authenticated
    using (exists (select 1 from public.subscriptions s where s.id = subscription_id
                    and (s.user_id = (select auth.uid()) or public.is_staff())));
create policy p_sub_adjustments_read on public.subscription_adjustments for select to authenticated
    using (exists (select 1 from public.subscriptions s where s.id = subscription_id
                    and (s.user_id = (select auth.uid()) or public.is_staff())));
create policy p_deposits_read on public.deposits for select to authenticated
    using (exists (select 1 from public.subscriptions s where s.id = subscription_id
                    and (s.user_id = (select auth.uid()) or public.is_staff())));
create policy p_rva_read on public.rental_vehicle_assignments for select to authenticated
    using (exists (select 1 from public.rentals r where r.id = rental_id
                    and (r.user_id = (select auth.uid()) or public.is_staff())));
create policy p_rental_returns_read on public.rental_returns for select to authenticated
    using (exists (select 1 from public.rentals r where r.id = rental_id
                    and (r.user_id = (select auth.uid()) or public.is_staff())));
create policy p_rental_settlements_read on public.rental_settlements for select to authenticated
    using (exists (select 1 from public.rentals r where r.id = rental_id
                    and (r.user_id = (select auth.uid()) or public.is_staff())));
create policy p_rental_feedback_read on public.rental_feedback for select to authenticated
    using (exists (select 1 from public.rentals r where r.id = rental_id
                    and (r.user_id = (select auth.uid()) or public.is_staff())));
create policy p_invoice_items_read on public.invoice_items for select to authenticated
    using (exists (select 1 from public.invoices i where i.id = invoice_id
                    and (i.user_id = (select auth.uid()) or public.is_staff())));
create policy p_payment_allocations_read on public.payment_allocations for select to authenticated
    using (exists (select 1 from public.invoices i where i.id = invoice_id
                    and (i.user_id = (select auth.uid()) or public.is_staff())));
create policy p_payment_txns_read on public.payment_transactions for select to authenticated
    using (exists (select 1 from public.payment_orders o where o.id = payment_order_id
                    and (o.user_id = (select auth.uid()) or public.is_staff())));
create policy p_incidents_read on public.incidents for select to authenticated
    using (public.is_staff()
           or exists (select 1 from public.rentals r where r.id = rental_id and r.user_id = (select auth.uid())));
create policy p_damages_read on public.damages for select to authenticated
    using (public.is_staff()
           or exists (select 1 from public.incidents i join public.rentals r on r.id = i.rental_id
                       where i.id = incident_id and r.user_id = (select auth.uid())));
create policy p_damage_disputes_read on public.damage_disputes for select to authenticated
    using (public.is_staff()
           or exists (select 1 from public.damages d join public.incidents i on i.id = d.incident_id
                      join public.rentals r on r.id = i.rental_id
                       where d.id = damage_id and r.user_id = (select auth.uid())));

-- Internal staff notes are hidden from riders by RLS, not by API discipline.
create policy p_support_messages_read on public.support_ticket_messages for select to authenticated
    using (exists (select 1 from public.support_tickets t where t.id = support_ticket_id
                    and (public.is_staff() or (t.user_id = (select auth.uid()) and is_internal_note = false))));

-- A rider may see maintenance on the scooter they currently hold.
create policy p_maintenance_read on public.maintenance_tickets for select to authenticated
    using (public.is_staff()
           or exists (select 1 from public.rental_vehicle_assignments a
                        join public.rentals r on r.id = a.rental_id
                       where a.vehicle_id = maintenance_tickets.vehicle_id
                         and a.released_at is null
                         and r.user_id = (select auth.uid())));

-- notification_messages: split policy. Staff must NOT receive a live stream
-- of every rider's message body over realtime.
create policy p_notif_messages_read on public.notification_messages for select to authenticated
    using (user_id = (select auth.uid())
           or (public.is_staff()
               and exists (select 1 from public.notification_types nt
                            where nt.code = notification_type_code
                              and nt.default_audience in ('staff', 'both'))));

-- P4 — staff / admin only
create policy p_staff_profiles_read     on public.staff_profiles     for select to authenticated using (public.is_staff());
create policy p_vehicles_read           on public.vehicles           for select to authenticated using (public.is_staff());
create policy p_vehicle_documents_read  on public.vehicle_documents  for select to authenticated using (public.is_staff());
create policy p_vehicle_disposals_read  on public.vehicle_disposals  for select to authenticated using (public.is_staff());
create policy p_swap_qis_read           on public.swap_station_qis_ids for select to authenticated using (public.is_staff());
create policy p_pricing_rules_read      on public.pricing_rules      for select to authenticated using (public.is_staff());
create policy p_notif_types_read        on public.notification_types for select to authenticated using (public.is_staff());
create policy p_notif_events_read       on public.notification_events for select to authenticated using (public.is_staff());
create policy p_notif_deliveries_read   on public.notification_deliveries for select to authenticated using (public.is_staff());

create policy p_invoice_series_read     on public.invoice_series     for select to authenticated using (public.is_admin());
create policy p_webhook_events_read     on public.payment_webhook_events for select to authenticated using (public.is_admin());
create policy p_audit_logs_read         on public.audit_logs         for select to authenticated using (public.is_admin());
create policy p_retention_policies_read on public.retention_policies for select to authenticated using (public.is_admin());
create policy p_retention_runs_read     on public.retention_runs     for select to authenticated using (public.is_admin());
create policy p_perm_profiles_read      on public.permission_profiles for select to authenticated using (public.is_admin());
create policy p_perm_profile_perms_read on public.permission_profile_permissions for select to authenticated using (public.is_admin());
create policy p_role_permissions_read   on public.role_permissions   for select to authenticated using (public.is_admin());
create policy p_notif_subscribers_read  on public.notification_subscribers for select to authenticated
    using (user_id = (select auth.uid()) or public.is_admin());
create policy p_user_perm_overrides_read on public.user_permission_overrides for select to authenticated
    using (user_id = (select auth.uid()) or public.is_admin());

-- Compliance
create policy p_consent_records_read on public.consent_records for select to authenticated
    using (user_id = (select auth.uid())
           or exists (select 1 from public.v_user_effective_permissions p
                       where p.user_id = (select auth.uid())
                         and p.module_key = 'privacy' and p.action = 'view'));
create policy p_dpr_read on public.data_principal_requests for select to authenticated
    using (user_id = (select auth.uid())
           or exists (select 1 from public.v_user_effective_permissions p
                       where p.user_id = (select auth.uid())
                         and p.module_key = 'privacy' and p.action = 'view'));

-- DPDPA gives a data principal the right to know who accessed their data,
-- so a rider reads rows where they are the TARGET.
create policy p_pii_access_read on public.pii_access_log for select to authenticated
    using (target_user_id = (select auth.uid())
           or exists (select 1 from public.v_user_effective_permissions p
                       where p.user_id = (select auth.uid())
                         and p.module_key = 'privacy' and p.action = 'view'));

-- No policy is written for anon on any table, and no INSERT/UPDATE/DELETE
-- policy exists for authenticated anywhere: deny-by-default handles both.
