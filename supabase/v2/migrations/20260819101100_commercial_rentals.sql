-- =========================================================================
-- 12 — Commercial: rentals
--
-- A RENTAL answers "which physical scooter is with this rider right now?".
-- One subscription can have MANY rentals over time: breakdown -> temp
-- scooter -> replacement is one agreement, one deposit, one billing
-- schedule, and three rentals.
--
-- Critically, `rentals` has NO vehicle_id. The current scooter is the open
-- row in rental_vehicle_assignments. In the old schema a temp-vehicle swap
-- updated vehicle_maintenance but left bookings.vehicle_id pointing at the
-- broken scooter — three tables held three answers to the same question.
-- =========================================================================

create table public.rentals (
    id              uuid primary key default gen_random_uuid(),
    subscription_id uuid not null references public.subscriptions (id) on delete restrict,
    user_id         uuid not null references public.users (id) on delete restrict,
    status          public.rental_status not null default 'active',
    picked_up_at    timestamptz not null default now(),
    due_back_at     timestamptz not null,
    returned_at     timestamptz,
    end_reason      text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz,

    constraint chk_rentals_return_order check (returned_at is null or returned_at >= picked_up_at),
    constraint chk_rentals_closed       check (status = 'active' or returned_at is not null)
);

comment on table  public.rentals is 'A rider''s custody of a scooter under a subscription.';
comment on column public.rentals.user_id is
    'INTENTIONAL DENORMALISATION (D1). Duplicates subscriptions.user_id. Kept because every RLS policy on this table and its four children must answer "is this mine?" per row, and a join to subscriptions on each would be costly. Immutable, and enforced by assert_rental_user_matches_subscription.';

create unique index uq_rentals_active_per_subscription
    on public.rentals (subscription_id)
    where status = 'active';

create table public.rental_vehicle_assignments (
    id                    uuid primary key default gen_random_uuid(),
    rental_id             uuid not null references public.rentals (id) on delete cascade,
    vehicle_id            uuid not null references public.vehicles (id) on delete restrict,
    reason                public.assignment_reason not null default 'initial',
    assigned_at           timestamptz not null default now(),
    released_at           timestamptz,
    assigned_hub_id       uuid references public.hubs (id) on delete set null,
    released_hub_id       uuid references public.hubs (id) on delete set null,
    maintenance_ticket_id uuid references public.maintenance_tickets (id) on delete set null,
    created_at            timestamptz not null default now(),

    constraint chk_rva_order check (released_at is null or released_at > assigned_at)
);

comment on table  public.rental_vehicle_assignments is
    'The period during which one specific scooter was assigned to a rental. A swap closes one row and opens another, so history is free and the current value can never go stale.';
comment on column public.rental_vehicle_assignments.released_at is
    'NULL means THIS IS THE CURRENT VEHICLE. The null carries meaning.';

-- Serves the most frequent query in the system AND enforces the invariant
-- that a rental has exactly one current vehicle.
create unique index uq_rva_open_per_rental
    on public.rental_vehicle_assignments (rental_id)
    where released_at is null;

create table public.rental_returns (
    rental_id            uuid primary key references public.rentals (id) on delete cascade,
    requested_at         timestamptz not null default now(),
    requested_reason     text,
    rider_notes          text,
    due_back_at          timestamptz not null,
    status               public.return_status not null default 'requested',
    inspected_at         timestamptz,
    inspected_by_user_id uuid references public.users (id) on delete set null,
    inspection_notes     text,
    approved_at          timestamptz,
    approved_by_user_id  uuid references public.users (id) on delete set null,
    rejected_at          timestamptz,
    rejected_by_user_id  uuid references public.users (id) on delete set null,
    rejection_reason     text,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz,

    constraint chk_rental_returns_inspect_order  check (inspected_at is null or inspected_at >= requested_at),
    constraint chk_rental_returns_approve_order  check (approved_at  is null or approved_at  >= inspected_at),
    constraint chk_rental_returns_rejected       check (rejected_at  is null or rejection_reason is not null),
    constraint chk_rental_returns_terminal
        check (status <> 'approved' or approved_at is not null)
);

comment on table public.rental_returns is
    'The process of a rider returning a scooter. Eight columns lifted out of rentals. Because due_back_at lives here only when a return is requested, the old effectiveDueAt() reconciler becomes a COALESCE in one view.';

create table public.rental_feedback (
    rental_id  uuid primary key references public.rentals (id) on delete cascade,
    rating     smallint not null check (rating between 1 and 5),
    comment    text,
    created_at timestamptz not null default now(),
    updated_at timestamptz
);

comment on table public.rental_feedback is 'A rider''s rating of a completed rental.';
