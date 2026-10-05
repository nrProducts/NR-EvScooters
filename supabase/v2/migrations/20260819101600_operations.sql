-- =========================================================================
-- 18 — Operations: incidents, damages, disputes
--
-- The old schema had TWO overlapping tables: `damages` (used) and
-- `incident_reports` (0 rows, 0 code references, and unable to express a
-- theft because it was never wired up). Split by meaning instead:
--
--   incident — WHAT HAPPENED (including theft and accidents, which cost
--              nothing to repair)
--   damage   — WHAT IT COSTS
--   dispute  — the rider challenging that cost
-- =========================================================================

create table public.incidents (
    id                  uuid primary key default gen_random_uuid(),
    vehicle_id          uuid not null references public.vehicles (id) on delete restrict,
    rental_id           uuid references public.rentals (id) on delete set null,
    incident_type       public.incident_type not null,
    occurred_at         timestamptz,
    reported_at         timestamptz not null default now(),
    reported_by_user_id uuid references public.users (id) on delete set null,
    description         text not null,
    photo_paths         text[] not null default '{}'::text[],
    status              public.incident_status not null default 'open',
    created_at          timestamptz not null default now(),
    updated_at          timestamptz,

    constraint chk_incidents_occurred_order check (occurred_at is null or occurred_at <= reported_at)
);

comment on table  public.incidents is 'Something that happened to a vehicle.';
comment on column public.incidents.photo_paths is
    'An array is permitted here: an immutable list of storage paths with no per-item metadata, ordering or lifecycle. Contrast vehicle_model_media, which needs is_primary and sort_order and is therefore a table.';

create table public.damages (
    id                   uuid primary key default gen_random_uuid(),
    incident_id          uuid not null references public.incidents (id) on delete cascade,
    assessed_amount      numeric(12,2) not null check (assessed_amount >= 0),
    assessed_by_user_id  uuid references public.users (id) on delete set null,
    assessed_at          timestamptz not null default now(),
    status               public.damage_status not null default 'assessed',
    notes                text,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz
);

comment on table public.damages is
    'The cost assessed for an incident. Money only — the event lives in incidents, the dispute in damage_disputes, the billing in subscription_adjustments.';

create table public.damage_disputes (
    damage_id            uuid primary key references public.damages (id) on delete cascade,
    raised_at            timestamptz not null default now(),
    raised_by_user_id    uuid references public.users (id) on delete set null,
    reason               text not null,
    amount_held          numeric(12,2) not null check (amount_held >= 0),
    resolved_at          timestamptz,
    resolved_by_user_id  uuid references public.users (id) on delete set null,
    resolution_notes     text,
    outcome              public.dispute_outcome,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz,

    constraint chk_damage_disputes_order    check (resolved_at is null or resolved_at >= raised_at),
    constraint chk_damage_disputes_resolved check ((resolved_at is null) = (outcome is null))
);

comment on table public.damage_disputes is
    'A rider''s challenge to an assessed damage. Seven columns lifted out of the old 18-column damages table.';

-- Forward reference from 15_billing_pricing.
alter table public.subscription_adjustments
    add constraint subscription_adjustments_damage_id_fkey
    foreign key (damage_id) references public.damages (id) on delete set null;
