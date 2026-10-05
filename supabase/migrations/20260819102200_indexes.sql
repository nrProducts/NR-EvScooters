-- =========================================================================
-- 25 — Indexes
--
-- Derived from the real query patterns in the audit, not from guesswork.
-- Unique constraints already create indexes and are not repeated here.
-- Attribution columns (*_by_user_id) are deliberately NOT indexed: they are
-- displayed via join, never filtered.
-- =========================================================================

-- --- identity ------------------------------------------------------------
create index idx_users_status          on public.users (status) where deleted_at is null;
create index idx_users_role            on public.users (role)   where deleted_at is null and role <> 'rider';
create index idx_users_created_at      on public.users (created_at desc) where deleted_at is null;
create index idx_users_full_name_trgm  on public.users using gin (full_name extensions.gin_trgm_ops);

create index idx_user_addresses_user       on public.user_addresses (user_id);
create index idx_user_related_persons_user on public.user_related_persons (user_id);
create index idx_user_devices_active       on public.user_devices (user_id) where revoked_at is null;
create unique index uq_user_addresses_primary
    on public.user_addresses (user_id) where is_primary;

create index idx_kyc_documents_user   on public.kyc_documents (user_id);
create index idx_kyc_documents_queue  on public.kyc_documents (created_at)
    where verification_status = 'pending';
create index idx_kyc_documents_expiry on public.kyc_documents (expires_on)
    where verification_status = 'verified';
-- Duplicate-identity detection: the reason the blind index exists.
create index idx_kyc_documents_hmac   on public.kyc_documents (document_number_hmac)
    where document_number_hmac is not null;

create index idx_permissions_module               on public.permissions (module_key);
create index idx_role_permissions_permission      on public.role_permissions (permission_id);
create index idx_user_perm_overrides_permission   on public.user_permission_overrides (permission_id);
create index idx_profile_permissions_permission   on public.permission_profile_permissions (permission_id);

-- --- fleet ---------------------------------------------------------------
create index idx_vehicle_models_browse on public.vehicle_models (is_active, sort_order) where deleted_at is null;
create index idx_vehicle_models_range  on public.vehicle_models (battery_range_km);
create index idx_vehicle_models_speed  on public.vehicle_models (top_speed_kmph);
create index idx_vehicle_model_media_model on public.vehicle_model_media (vehicle_model_id, sort_order);
create unique index uq_vehicle_model_media_primary
    on public.vehicle_model_media (vehicle_model_id) where is_primary;

-- The booking hot path: "how many of this model are available?"
create index idx_vehicles_model_status on public.vehicles (vehicle_model_id, status);
create index idx_vehicles_hub_status   on public.vehicles (hub_id, status);
create index idx_vehicles_status       on public.vehicles (status, created_at desc);

create index idx_vehicle_documents_vehicle on public.vehicle_documents (vehicle_id);
create index idx_vehicle_documents_expiry  on public.vehicle_documents (expires_on);

create index idx_maintenance_vehicle on public.maintenance_tickets (vehicle_id, created_at desc);
create index idx_maintenance_open    on public.maintenance_tickets (status, created_at desc)
    where status not in ('resolved', 'cancelled');

create index idx_hubs_location          on public.hubs using gist (location);
create index idx_swap_stations_location on public.swap_stations using gist (location)
    where deleted_at is null;
create index idx_swap_stations_visible  on public.swap_stations (status)
    where is_rider_visible and deleted_at is null;

-- --- commercial ----------------------------------------------------------
create index idx_bookings_user     on public.bookings (user_id, created_at desc);
create index idx_bookings_status   on public.bookings (status, created_at desc);
create index idx_bookings_expiry   on public.bookings (hold_expires_at) where status = 'pending_payment';
create index idx_bookings_pickup   on public.bookings (requested_start_on) where status = 'confirmed';

create index idx_subscriptions_user   on public.subscriptions (user_id, status);
create index idx_subscriptions_status on public.subscriptions (status, started_on desc);
create index idx_subscriptions_plan   on public.subscriptions (plan_id);

create index idx_sub_periods_due       on public.subscription_periods (due_on)    where status = 'current';
create index idx_sub_periods_scheduled on public.subscription_periods (starts_on) where status = 'scheduled';

create index idx_rentals_user         on public.rentals (user_id, status);
create index idx_rentals_subscription on public.rentals (subscription_id);
create index idx_rentals_status       on public.rentals (status, picked_up_at desc);
create index idx_rentals_due          on public.rentals (due_back_at) where status = 'active';

create index idx_rva_vehicle on public.rental_vehicle_assignments (vehicle_id, assigned_at desc);
create index idx_rental_returns_queue on public.rental_returns (requested_at)
    where status in ('requested', 'inspected');
create index idx_rental_settlements_settled on public.rental_settlements (settled_at desc);

-- --- billing -------------------------------------------------------------
create index idx_invoices_user   on public.invoices (user_id, issued_on desc nulls last)
    where status <> 'draft';
create index idx_invoices_status on public.invoices (status, due_on);
create index idx_invoices_subscription on public.invoices (subscription_id);
create index idx_invoices_period on public.invoices (subscription_period_id)
    where subscription_period_id is not null;

-- A btree cannot serve both bounds of a validity range; GiST can.
create index idx_pricing_rules_resolution on public.pricing_rules
    using gist (scope, scope_ref_id, daterange(effective_from, effective_to, '[]'))
    where is_active;

create index idx_sub_adjustments_period  on public.subscription_adjustments (subscription_period_id);
create index idx_sub_adjustments_sub     on public.subscription_adjustments (subscription_id, created_at desc);
create index idx_sub_adjustments_pending on public.subscription_adjustments (created_at) where status = 'pending';

create index idx_payment_orders_invoice on public.payment_orders (invoice_id);
create index idx_payment_orders_user    on public.payment_orders (user_id, created_at desc);
create index idx_payment_orders_expiry  on public.payment_orders (expires_at)
    where status in ('created', 'attempted');

create index idx_payment_txns_order    on public.payment_transactions (payment_order_id);
create index idx_payment_txns_captured on public.payment_transactions (captured_at desc);

-- Read on every invoice balance lookup.
create index idx_payment_allocations_invoice on public.payment_allocations (invoice_id);
create index idx_payment_allocations_txn     on public.payment_allocations (payment_transaction_id);

create index idx_deposits_eligible on public.deposits (refund_eligible_on) where status = 'held';
create index idx_refunds_user      on public.refunds (user_id, created_at desc);
create index idx_refunds_retry     on public.refunds (last_attempted_at)
    where status in ('pending', 'failed');
create index idx_refunds_txn       on public.refunds (payment_transaction_id);

create index idx_webhook_unprocessed on public.payment_webhook_events (received_at)
    where processed_at is null;

-- --- operations / support -------------------------------------------------
create index idx_incidents_vehicle on public.incidents (vehicle_id, reported_at desc);
create index idx_incidents_rental  on public.incidents (rental_id);
create index idx_incidents_open    on public.incidents (reported_at desc) where status <> 'closed';
create index idx_damages_incident  on public.damages (incident_id);
create index idx_damages_status    on public.damages (status, assessed_at desc);
create index idx_damage_disputes_open on public.damage_disputes (raised_at) where resolved_at is null;

create index idx_support_user     on public.support_tickets (user_id, created_at desc);
create index idx_support_queue    on public.support_tickets (status, priority, created_at desc);
create index idx_support_assigned on public.support_tickets (assigned_to_user_id) where status <> 'closed';
create index idx_support_messages on public.support_ticket_messages (support_ticket_id, created_at);

-- --- notifications --------------------------------------------------------
create index idx_notif_messages_inbox  on public.notification_messages (user_id, created_at desc);
create index idx_notif_messages_unread on public.notification_messages (user_id) where read_at is null;
create index idx_notif_messages_event  on public.notification_messages (notification_event_id);
create index idx_notif_events_subject  on public.notification_events (subject_type, subject_id);
create index idx_notif_events_time     on public.notification_events (occurred_at);
create index idx_notif_deliveries_msg  on public.notification_deliveries (notification_message_id);
create index idx_notif_deliveries_pending on public.notification_deliveries (created_at) where status = 'pending';

-- --- compliance (the last four exist for the retention purge) -------------
create index idx_consent_records_current on public.consent_records (user_id, purpose, created_at desc);
create index idx_dpr_sla    on public.data_principal_requests (status, sla_due_at);
create index idx_dpr_user   on public.data_principal_requests (user_id, created_at desc);
create index idx_pii_target on public.pii_access_log (target_user_id, created_at desc);
create index idx_pii_actor  on public.pii_access_log (actor_user_id, created_at desc);
create index idx_audit_entity on public.audit_logs (entity_type, entity_id, created_at desc);
create index idx_audit_actor  on public.audit_logs (actor_user_id, created_at desc);

create index idx_audit_created         on public.audit_logs (created_at);
create index idx_pii_created           on public.pii_access_log (created_at);
create index idx_notif_events_created  on public.notification_events (created_at);
create index idx_notif_messages_created on public.notification_messages (created_at);
create index idx_retention_runs_history on public.retention_runs (retention_policy_category, started_at desc);
