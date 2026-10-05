-- =========================================================================
-- 23 — Triggers
-- =========================================================================

-- --- updated_at, one shared function across every mutable table ----------
do $$
declare t text;
begin
    foreach t in array array[
        'users','user_addresses','user_related_persons','rider_profiles','staff_profiles',
        'modules','permissions','permission_profiles','kyc_documents',
        'vendors','vehicle_models','vehicles','vehicle_documents','maintenance_tickets',
        'hubs','swap_stations','plans','bookings','subscriptions','subscription_periods',
        'rentals','rental_returns','rental_feedback','invoice_series','invoices',
        'pricing_rules','subscription_adjustments','payment_orders','deposits','refunds',
        'incidents','damages','damage_disputes','support_tickets','notification_types',
        'data_principal_requests','retention_policies'
    ] loop
        execute format(
            'create trigger trg_%1$s_updated_at before update on public.%1$I
             for each row execute function public.set_updated_at()', t);
    end loop;
end $$;

-- --- append-only / immutable ---------------------------------------------
create trigger trg_consent_records_append_only
    before update or delete on public.consent_records
    for each row execute function public.trg_append_only();

create trigger trg_pii_access_log_append_only
    before update or delete on public.pii_access_log
    for each row execute function public.trg_append_only();

create trigger trg_audit_logs_append_only
    before update or delete on public.audit_logs
    for each row execute function public.trg_append_only();

-- Financial records get the same protection compliance records do. The old
-- schema protected three compliance tables and left payment_transactions
-- fully mutable.
create trigger trg_payment_transactions_append_only
    before update or delete on public.payment_transactions
    for each row execute function public.trg_append_only();

create trigger trg_payment_allocations_append_only
    before update or delete on public.payment_allocations
    for each row execute function public.trg_append_only();

-- --- snapshot immutability ------------------------------------------------
create trigger trg_bookings_freeze_snapshots
    before update on public.bookings
    for each row execute function public.trg_freeze_snapshots();

create trigger trg_subscriptions_freeze_snapshots
    before update on public.subscriptions
    for each row execute function public.trg_freeze_snapshots();

create trigger trg_subscription_periods_freeze_snapshots
    before update on public.subscription_periods
    for each row execute function public.trg_freeze_snapshots();

create trigger trg_subscription_adjustments_freeze_snapshots
    before update on public.subscription_adjustments
    for each row execute function public.trg_freeze_snapshots();

create trigger trg_rental_settlements_freeze
    before update on public.rental_settlements
    for each row execute function public.trg_freeze_settlement_decision();

-- --- derivations ----------------------------------------------------------
create trigger trg_kyc_documents_sync_status
    after insert or update or delete on public.kyc_documents
    for each row execute function public.trg_sync_rider_kyc_status();

create trigger trg_bookings_vehicle_status
    after insert or update or delete on public.bookings
    for each row execute function public.trg_recompute_vehicle_status();

create trigger trg_rva_vehicle_status
    after insert or update or delete on public.rental_vehicle_assignments
    for each row execute function public.trg_recompute_vehicle_status();

create trigger trg_maintenance_vehicle_status
    after insert or update or delete on public.maintenance_tickets
    for each row execute function public.trg_recompute_vehicle_status();

create trigger trg_disposals_vehicle_status
    after insert or update or delete on public.vehicle_disposals
    for each row execute function public.trg_recompute_vehicle_status();

-- --- money guards (constraint triggers, deferred to statement end) --------
create constraint trigger trg_allocation_within_invoice
    after insert or update on public.payment_allocations
    deferrable initially immediate
    for each row execute function public.assert_allocation_within_invoice();

create constraint trigger trg_refund_within_payment
    after insert or update on public.refunds
    deferrable initially immediate
    for each row execute function public.assert_refund_within_payment();

create trigger trg_invoices_allocate_number
    before insert on public.invoices
    for each row execute function public.trg_allocate_invoice_number();

create trigger trg_invoices_void_guard
    before update on public.invoices
    for each row execute function public.assert_invoice_void_unallocated();

-- --- denormalisation guards ----------------------------------------------
create constraint trigger trg_rentals_user_matches_subscription
    after insert or update on public.rentals
    for each row execute function public.assert_rental_user_matches_subscription();

create constraint trigger trg_messages_type_matches_event
    after insert or update on public.notification_messages
    for each row execute function public.assert_message_type_matches_event();

-- --- auth ------------------------------------------------------------------
create trigger trg_on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();
