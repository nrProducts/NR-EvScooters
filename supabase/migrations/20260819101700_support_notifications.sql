-- =========================================================================
-- 19/20 — Support and notifications
--
-- The old notifications_log was THREE tables in one 17-column row: a
-- delivery log, a rider inbox, and an event feed — with both a polymorphic
-- pointer AND three concrete FKs, and two separate columns pointing at
-- users. It forced one row per (event x recipient x channel), and retention
-- purging message bodies also destroyed the rider's inbox.
-- =========================================================================

create table public.support_tickets (
    id                   uuid primary key default gen_random_uuid(),
    user_id              uuid not null references public.users (id) on delete cascade,
    rental_id            uuid references public.rentals (id) on delete set null,
    subject              text not null,
    category             public.support_category not null default 'other',
    priority             public.support_priority not null default 'medium',
    status               public.support_status not null default 'open',
    assigned_to_user_id  uuid references public.users (id) on delete set null,
    resolved_at          timestamptz,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz,

    constraint chk_support_tickets_resolved
        check (status not in ('resolved', 'closed') or resolved_at is not null)
);

create table public.support_ticket_messages (
    id                uuid primary key default gen_random_uuid(),
    support_ticket_id uuid not null references public.support_tickets (id) on delete cascade,
    author_user_id    uuid references public.users (id) on delete set null,
    body              text not null,
    is_internal_note  boolean not null default false,
    created_at        timestamptz not null default now()
);

comment on column public.support_ticket_messages.is_internal_note is
    'Staff-only notes live in the same thread as rider-visible replies. RLS keeps them apart, so an API mistake cannot leak them.';

-- --- notifications: three lifecycles, three tables ------------------------

create table public.notification_types (
    code             text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
    label            text not null,
    description      text,
    is_enabled       boolean not null default true,
    send_email       boolean not null default false,
    send_push        boolean not null default true,
    send_in_app      boolean not null default true,
    default_audience public.notification_audience not null default 'rider',
    requires_action  boolean not null default false,
    action_path      text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz,

    constraint chk_notification_types_action
        check (requires_action = false or action_path is not null)
);

comment on table  public.notification_types is
    'A kind of notification. A table, not an enum — operators add types without a migration.';
comment on column public.notification_types.requires_action is
    'Replaces the APPROVAL_TEMPLATES map hard-coded in the admin console. A new approval type is now a row, not a front-end deploy.';

create table public.notification_subscribers (
    notification_type_code text not null references public.notification_types (code) on delete cascade,
    user_id                uuid not null references public.users (id) on delete cascade,
    created_at             timestamptz not null default now(),
    primary key (notification_type_code, user_id)
);

create table public.notification_events (
    id                     uuid primary key default gen_random_uuid(),
    notification_type_code text not null references public.notification_types (code) on delete restrict,
    subject_type           text not null,
    subject_id             uuid not null,
    payload                jsonb,
    occurred_at            timestamptz not null default now(),
    created_at             timestamptz not null default now()
);

comment on table public.notification_events is 'A business event worth telling someone about. Internal — deliberately NOT published to realtime.';

create table public.notification_messages (
    id                     uuid primary key default gen_random_uuid(),
    notification_event_id  uuid not null references public.notification_events (id) on delete cascade,
    user_id                uuid not null references public.users (id) on delete cascade,
    notification_type_code text not null references public.notification_types (code) on delete restrict,
    title                  text not null,
    body                   text not null,
    read_at                timestamptz,
    created_at             timestamptz not null default now()
);

comment on table  public.notification_messages is
    'A notification addressed to one person — the rider inbox, and the only notification table published to realtime.';
comment on column public.notification_messages.notification_type_code is
    'INTENTIONAL DENORMALISATION (D2). Duplicates the parent event. Kept because realtime payloads arrive UNJOINED and the console must decide from the row alone whether a message opens an approval popup or just increments a badge. Immutable, enforced by assert_message_type_matches_event.';

create table public.notification_deliveries (
    id                      uuid primary key default gen_random_uuid(),
    notification_message_id uuid not null references public.notification_messages (id) on delete cascade,
    channel                 public.notification_channel not null,
    status                  public.delivery_status not null default 'pending',
    provider                text,
    provider_ref            text,
    sent_at                 timestamptz,
    error                   text,
    created_at              timestamptz not null default now(),

    constraint chk_notification_deliveries_sent   check (status <> 'sent'   or sent_at is not null),
    constraint chk_notification_deliveries_failed check (status <> 'failed' or error   is not null)
);

comment on table public.notification_deliveries is 'One attempt to deliver a message on one channel. Provider diagnostics — not rider-facing.';
