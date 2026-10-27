-- =========================================================================
-- Original documents collected at pickup.
--
-- When a rider collects a scooter, staff record which ORIGINAL documents they
-- take and keep (driving licence, voter ID, marksheet, anything else) — or that
-- no originals were taken. The answer is required for every pickup, so "we took
-- nothing" is a recorded decision, not a blank.
--
--   rental_originals           one row per rental: was anything taken, by whom, when
--   rental_original_documents  one row per original held, with its own status
--
-- `status` is held / returned so the same rows can later track handing the
-- originals back; the columns for it (returned_at/by, return_note) are here now.
-- =========================================================================

-- Safe to run twice (IF NOT EXISTS): a release that stopped partway must not be
-- blocked by what its earlier attempt created.
create table if not exists public.rental_originals (
    rental_id    uuid primary key references public.rentals (id) on delete cascade,
    user_id      uuid not null references public.users (id) on delete restrict,
    taken        boolean not null,
    recorded_by  uuid references public.users (id) on delete set null,
    recorded_at  timestamptz not null default now()
);

comment on table public.rental_originals is
    'The pickup decision: were original documents taken from the rider for this rental? Always recorded, including "none taken".';

create table if not exists public.rental_original_documents (
    id            uuid primary key default gen_random_uuid(),
    rental_id     uuid not null references public.rentals (id) on delete cascade,
    user_id       uuid not null references public.users (id) on delete restrict,
    doc_type      text not null check (doc_type in ('driving_licence', 'voter_id', 'marksheet', 'other')),
    other_label   text check (other_label is null or length(btrim(other_label)) between 1 and 80),
    status        text not null default 'held' check (status in ('held', 'returned')),
    received_at   timestamptz not null default now(),
    received_by   uuid references public.users (id) on delete set null,
    returned_at   timestamptz,
    returned_by   uuid references public.users (id) on delete set null,
    return_note   text,

    -- an "other" document must say what it is; the others must not carry a label
    constraint chk_original_doc_label check ((doc_type = 'other') = (other_label is not null)),
    constraint chk_original_doc_returned check ((status = 'returned') = (returned_at is not null))
);

comment on table public.rental_original_documents is
    'One original document held by Swapngo for a rental. status = held until handed back to the rider.';

create index if not exists idx_rental_original_documents_user   on public.rental_original_documents (user_id, received_at desc);
create index if not exists idx_rental_original_documents_rental on public.rental_original_documents (rental_id);
create index if not exists idx_rental_original_documents_held   on public.rental_original_documents (user_id) where status = 'held';

alter table public.rental_originals          enable row level security;
alter table public.rental_original_documents enable row level security;
