-- =========================================================================
-- 20260727095844_referrals.sql
--
-- BACKFILLED (see 20260727095623 for why this file exists after the fact).
-- Recreated verbatim from supabase_migrations.schema_migrations. Unrelated
-- to the vehicle-lifecycle change above — a rider referral program
-- (referral_code on users, referrals, referral_rewards) applied in the same
-- session.
-- =========================================================================

create type public.referral_status as enum ('pending', 'qualified', 'rewarded');

alter table public.users
    add column if not exists referral_code text unique;

create or replace function public.generate_referral_code()
returns text
language plpgsql
set search_path = public
as $$
declare
    alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    candidate text;
    attempt   int := 0;
begin
    loop
        candidate := '';
        for _i in 1..8 loop
            candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
        end loop;

        exit when not exists (select 1 from public.users where referral_code = candidate);

        attempt := attempt + 1;
        if attempt > 20 then
            raise exception 'Could not generate a unique referral code.' using errcode = 'P0001';
        end if;
    end loop;

    return candidate;
end;
$$;

create or replace function public.trg_set_referral_code_fn()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if new.referral_code is null then
        new.referral_code := public.generate_referral_code();
    end if;
    return new;
end;
$$;

drop trigger if exists trg_set_referral_code on public.users;
create trigger trg_set_referral_code
    before insert on public.users
    for each row execute function public.trg_set_referral_code_fn();

update public.users
   set referral_code = public.generate_referral_code()
 where referral_code is null;

create table public.referrals (
    id            uuid primary key default gen_random_uuid(),
    referrer_id   uuid not null references public.users(id) on delete cascade,
    referee_id    uuid not null unique references public.users(id) on delete cascade,
    code_used     text not null,
    status        public.referral_status not null default 'pending',
    qualified_at  timestamptz,
    rewarded_at   timestamptz,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz,
    constraint referrals_no_self_referral check (referrer_id <> referee_id)
);

create trigger trg_referrals_updated_at
    before update on public.referrals
    for each row execute function public.set_updated_at();

create index idx_referrals_referrer_id on public.referrals (referrer_id);
create index idx_referrals_status on public.referrals (status);

create table public.referral_rewards (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references public.users(id) on delete cascade,
    referral_id  uuid not null references public.referrals(id) on delete cascade,
    amount       numeric(10,2) not null check (amount > 0),
    reason       text not null,
    created_at   timestamptz not null default now()
);

create index idx_referral_rewards_user_id on public.referral_rewards (user_id);

create unique index referral_rewards_once_idx
    on public.referral_rewards (referral_id, user_id);

alter table public.referrals enable row level security;

create policy referrals_select on public.referrals
    for select using (referrer_id = auth.uid() or referee_id = auth.uid() or public.is_admin());

create policy referrals_admin_write on public.referrals
    for all using (public.is_admin()) with check (public.is_admin());

alter table public.referral_rewards enable row level security;

create policy referral_rewards_select on public.referral_rewards
    for select using (user_id = auth.uid() or public.is_admin());

create policy referral_rewards_admin_write on public.referral_rewards
    for all using (public.is_admin()) with check (public.is_admin());
