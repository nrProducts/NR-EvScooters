-- =========================================================================
-- 005_support_quality_ops.sql
-- support_requests, rental_feedback, incident_reports,
-- audit_logs, zones, notifications_log
-- =========================================================================

-- ---------------------------------------------------------------------
-- support_requests: rider-raised tickets
-- ---------------------------------------------------------------------
create table public.support_requests (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references public.users(id) on delete cascade,
    rental_id    uuid references public.rentals(id) on delete set null,
    vehicle_id   uuid references public.vehicles(id) on delete set null,
    assigned_to  uuid references public.users(id) on delete set null,
    subject      text not null,
    description  text not null,
    status       public.support_status not null default 'open',
    priority     public.support_priority not null default 'medium',
    resolved_at  timestamptz,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),

    constraint chk_support_resolved check (
        (status in ('resolved','closed') and resolved_at is not null)
        or (status in ('open','in_progress'))
    )
);

create trigger trg_support_requests_updated_at
    before update on public.support_requests
    for each row execute function public.set_updated_at();

create index idx_support_user on public.support_requests (user_id);
create index idx_support_status on public.support_requests (status);
create index idx_support_assigned_to on public.support_requests (assigned_to);

-- ---------------------------------------------------------------------
-- rental_feedback: one rating per completed rental
-- ---------------------------------------------------------------------
create table public.rental_feedback (
    id          uuid primary key default gen_random_uuid(),
    rental_id   uuid not null unique references public.rentals(id) on delete cascade,
    user_id     uuid not null references public.users(id) on delete cascade,
    rating      smallint not null check (rating between 1 and 5),
    comment     text,
    created_at  timestamptz not null default now()
);

create index idx_feedback_user on public.rental_feedback (user_id);

-- ---------------------------------------------------------------------
-- incident_reports: damage/accident/theft — distinct from routine maintenance
-- ---------------------------------------------------------------------
create table public.incident_reports (
    id            uuid primary key default gen_random_uuid(),
    rental_id     uuid references public.rentals(id) on delete set null,
    vehicle_id    uuid not null references public.vehicles(id) on delete cascade,
    reported_by   uuid references public.users(id) on delete set null,
    incident_type public.incident_type not null,
    description   text not null,
    photo_urls    text[],
    status        public.incident_status not null default 'open',
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create trigger trg_incident_reports_updated_at
    before update on public.incident_reports
    for each row execute function public.set_updated_at();

create index idx_incidents_vehicle on public.incident_reports (vehicle_id);
create index idx_incidents_status on public.incident_reports (status);

-- ---------------------------------------------------------------------
-- audit_logs: insert-only trail of staff/admin actions that mutate state
-- ---------------------------------------------------------------------
create table public.audit_logs (
    id           uuid primary key default gen_random_uuid(),
    actor_id     uuid references public.users(id) on delete set null,
    action       text not null,
    entity_type  text not null,
    entity_id    uuid not null,
    before_data  jsonb,
    after_data   jsonb,
    created_at   timestamptz not null default now()
);

create index idx_audit_actor on public.audit_logs (actor_id);
create index idx_audit_entity on public.audit_logs (entity_type, entity_id);
create index idx_audit_created_at on public.audit_logs (created_at desc);

-- ---------------------------------------------------------------------
-- zones: geofenced service areas — rentals must end inside an active zone
-- ---------------------------------------------------------------------
create table public.zones (
    id         uuid primary key default gen_random_uuid(),
    name       text not null,
    city       text not null,
    boundary   geography(Polygon, 4326) not null,
    active     boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger trg_zones_updated_at
    before update on public.zones
    for each row execute function public.set_updated_at();

create index idx_zones_boundary on public.zones using gist (boundary);

-- ---------------------------------------------------------------------
-- notifications_log: sent alerts (low battery, billing failures, etc.)
-- ---------------------------------------------------------------------
create table public.notifications_log (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.users(id) on delete cascade,
    channel     public.notification_channel not null,
    template    text not null,
    payload     jsonb,
    status      public.notification_status not null default 'pending',
    sent_at     timestamptz,
    created_at  timestamptz not null default now()
);

create index idx_notifications_user on public.notifications_log (user_id);
create index idx_notifications_status on public.notifications_log (status);
