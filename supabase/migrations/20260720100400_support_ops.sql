-- =========================================================================
-- 20260720100400_support_ops.sql
-- support_requests, rental_feedback, incident_reports, notifications_log
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
    updated_at   timestamptz
);

create trigger trg_support_requests_updated_at
    before update on public.support_requests
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- rental_feedback: one rating per completed rental
-- ---------------------------------------------------------------------
create table public.rental_feedback (
    id          uuid primary key default gen_random_uuid(),
    rental_id   uuid not null unique references public.rentals(id) on delete cascade,
    user_id     uuid not null references public.users(id) on delete cascade,
    rating      smallint not null check (rating between 1 and 5),
    comment     text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz
);

-- ---------------------------------------------------------------------
-- incident_reports: damage / accident / theft — distinct from routine
-- maintenance
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
    updated_at    timestamptz
);

create trigger trg_incident_reports_updated_at
    before update on public.incident_reports
    for each row execute function public.set_updated_at();

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
    created_at  timestamptz not null default now(),
    updated_at  timestamptz
);
