-- =========================================================================
-- Staff comments on a user — free-text notes the team keeps about a rider
-- (a call made, a promise to pay, a complaint). Internal only: riders never
-- see them. Anyone who can view users can read and add; the author or an
-- admin can delete. The audit log keeps deleted text.
-- =========================================================================

create table public.user_comments (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references public.users (id) on delete cascade,
    body            text not null check (length(btrim(body)) between 1 and 1000),
    author_user_id  uuid references public.users (id) on delete set null,
    created_at      timestamptz not null default now()
);

comment on table public.user_comments is
    'Internal staff notes about a user. Never shown to the user.';

create index idx_user_comments_user on public.user_comments (user_id, created_at desc);

alter table public.user_comments enable row level security;

create policy p_user_comments_read on public.user_comments
    for select to authenticated using (public.is_staff());
