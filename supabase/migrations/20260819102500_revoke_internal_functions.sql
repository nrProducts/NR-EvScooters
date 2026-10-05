-- =========================================================================
-- 28 — Revoke EXECUTE on internal functions
--
-- Supabase exposes every public function over PostgREST /rpc. Trigger
-- functions and internal helpers must not be callable by clients.
--
-- handle_new_auth_user is SECURITY DEFINER, so a direct RPC call would have
-- let any signed-in user — or anon — insert into public.users with an
-- arbitrary role. Caught by the security advisor after the initial apply.
-- =========================================================================

do $$
declare fn text;
begin
    foreach fn in array array[
        'handle_new_auth_user()', 'set_updated_at()', 'trg_append_only()',
        'trg_sync_rider_kyc_status()', 'trg_recompute_vehicle_status()',
        'trg_allocate_invoice_number()', 'trg_freeze_snapshots()',
        'trg_freeze_settlement_decision()', 'assert_allocation_within_invoice()',
        'assert_refund_within_payment()', 'assert_rental_user_matches_subscription()',
        'assert_message_type_matches_event()', 'assert_invoice_void_unallocated()',
        'recompute_vehicle_status(uuid)', 'compute_kyc_status(uuid)',
        'custom_access_token_hook(jsonb)'
    ] loop
        execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    end loop;
end $$;

-- The access-token hook is invoked by the auth layer, never by a client.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
