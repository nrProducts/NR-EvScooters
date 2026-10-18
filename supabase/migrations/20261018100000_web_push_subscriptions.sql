-- =========================================================================
-- Web Push subscriptions — the rider web app's (apps/mobile exported to web)
-- equivalent of user_devices.
--
-- Not folded into user_devices on purpose. A device row there is ONE opaque
-- Expo token sent through Expo's push service; a browser subscription is an
-- endpoint URL on the browser vendor's push service (FCM, Mozilla autopush,
-- Apple) PLUS the two keys the payload is encrypted to (RFC 8291). Squeezing
-- those into push_token would make every reader of user_devices — the Expo
-- send path, the broadcast fan-out — have to tell the two apart first.
--
-- One row per browser profile: the endpoint is globally unique, so the save
-- is an upsert on it. When the same browser signs in as a different rider the
-- row is re-pointed at the new account rather than colliding, same rule as
-- user_devices.push_token (see registerPushToken in users.service.ts).
--
-- Expired subscriptions are removed by the backend the moment the push
-- service answers 404/410 for them (web-push.service.ts). The daily sweep
-- below only catches browsers that simply stopped coming back — a rider web
-- session re-saves its subscription on every visit, refreshing last_seen_at.
-- =========================================================================

create table public.web_push_subscriptions (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references public.users (id) on delete cascade,
    -- The push service URL. HTTPS only (every browser vendor's is), and capped
    -- so a hostile client cannot park megabytes in a unique index.
    endpoint         text not null unique
                     check (endpoint ~ '^https://' and char_length(endpoint) <= 2048),
    -- Client public key (P-256, base64url) and auth secret the payload is
    -- encrypted to. Not secrets on their own — they only let someone ENCRYPT
    -- to this browser, and sending still needs our VAPID private key — but
    -- there is no reason for anything other than the backend to read them.
    p256dh           text not null check (char_length(p256dh) between 16 and 256),
    auth             text not null check (char_length(auth) between 8 and 64),
    -- Diagnostics only ("Chrome on Android"), truncated by the backend.
    user_agent       text check (user_agent is null or char_length(user_agent) <= 256),
    -- PushSubscription.expirationTime, when the browser reports one.
    expires_at       timestamptz,
    last_seen_at     timestamptz not null default now(),
    last_success_at  timestamptz,
    -- Consecutive non-terminal send failures (5xx, timeouts). Reset on success.
    failure_count    int not null default 0 check (failure_count >= 0),
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

comment on table public.web_push_subscriptions is
    'A browser the rider web app receives Web Push notifications on (Push API + VAPID). One row per browser profile; deleted when the push service reports it gone.';

create index idx_web_push_subscriptions_user on public.web_push_subscriptions (user_id);

-- Written and read exclusively through the backend's service-role client.
-- No policy for anon or authenticated on purpose: deny-by-default, same
-- convention as request_error_logs and every other table nothing is meant to
-- query directly (see 20260819102300_rls.sql).
alter table public.web_push_subscriptions enable row level security;

-- Daily sweep for browsers that stopped visiting without ever unsubscribing
-- (cleared site data, uninstalled PWA). 120 days is well past any rental
-- cycle; a rider who comes back simply re-subscribes on their next visit.
select cron.schedule('web-push-subscriptions-stale-daily', '55 3 * * *',
    $$delete from public.web_push_subscriptions where last_seen_at < now() - interval '120 days'$$);

-- -------------------------------------------------------------------------
-- anonymise_user — DPDPA erasure must take the browser subscriptions with it,
-- same as user_devices: an endpoint identifies a physical browser install.
--
-- Redefined in full (create or replace), identical to
-- 20260819102600_operational_functions.sql apart from the one added delete.
-- `create or replace` keeps the existing (revoked) privileges; the revoke is
-- repeated below anyway so this file is safe to read on its own.
-- -------------------------------------------------------------------------
create or replace function public.anonymise_user(p_user_id uuid, p_request_id uuid)
returns void language plpgsql set search_path = ''
as $$
begin
    update public.users
       set full_name          = 'Erased user',
           phone              = null,
           email              = null,
           date_of_birth      = null,
           gender             = null,
           photo_storage_path = null,
           status             = 'inactive',
           status_reason      = 'DPDPA erasure',
           status_changed_at  = now(),
           erased_at          = now(),
           updated_at         = now()
     where id = p_user_id and erased_at is null;

    delete from public.user_addresses         where user_id = p_user_id;
    delete from public.user_related_persons   where user_id = p_user_id;
    delete from public.user_devices           where user_id = p_user_id;
    delete from public.web_push_subscriptions where user_id = p_user_id;

    -- Document images are removed from storage by the caller; this clears the
    -- identity numbers and the pointers to them.
    update public.kyc_documents
       set document_number_encrypted = null,
           document_number_hmac      = null,
           document_number_last4     = null,
           encryption_key_version    = null,
           front_storage_path        = '',
           back_storage_path         = null,
           updated_at                = now()
     where user_id = p_user_id;

    insert into public.audit_logs (target_user_id, action, entity_type, entity_id, request_context)
    values (p_user_id, 'user.anonymised', 'users', p_user_id::text,
            jsonb_build_object('data_principal_request_id', p_request_id));
end $$;

revoke all on function public.anonymise_user(uuid, uuid) from public, anon, authenticated;
