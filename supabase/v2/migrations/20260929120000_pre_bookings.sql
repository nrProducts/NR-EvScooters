-- =========================================================================
-- Pre-bookings — interest submissions from the public website's pre-booking
-- form (see apps/website's PreBookModal / POST /public/pre-book), used while
-- the fleet isn't ready for normal bookings yet.
--
-- Not linked to any rider account: these come from anonymous website
-- visitors, not signed-in riders, so there is no user_id to hang this off —
-- same reasoning as why the contact form's queries were never persisted at
-- all. This one IS persisted (in addition to the email that already goes to
-- contact@swapngo.in) because staff asked to see them as a grid in the admin
-- console, not just in an inbox.
-- =========================================================================

create table public.pre_bookings (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    phone text not null,
    email text,
    location text not null,
    plan_preference text not null default 'not_sure'
        check (plan_preference in ('daily', 'weekly', 'not_sure')),
    message text,
    created_at timestamptz not null default now()
);

comment on table public.pre_bookings is
    'Interest submissions from the public website''s pre-booking form. Anonymous — no owning user_id. Also emailed to contact@swapngo.in at submission time (see preBooking.service.ts); this table is the admin console''s read side.';
comment on column public.pre_bookings.phone is '10 bare digits, same normalisation as public.plans-adjacent contact forms — see the indianPhone zod transform in public.validation.ts.';

create index pre_bookings_created_at_idx on public.pre_bookings (created_at desc);

alter table public.pre_bookings enable row level security;

-- Staff-only read. No insert/update/delete policy at all: the only writer is
-- the backend's service-role client (preBooking.service.ts), which bypasses
-- RLS entirely, same as every other admin-console write path in this schema.
create policy p_pre_bookings_read on public.pre_bookings
    for select
    to authenticated
    using (is_staff());
