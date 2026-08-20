-- =========================================================================
-- 03 — Helper functions
--
-- Created before any table because column defaults and CHECK constraints
-- reference them.
-- =========================================================================

-- -------------------------------------------------------------------------
-- business_today() — the timezone rule, in one place.
--
-- Supabase databases run UTC. Every `date` column in this schema means an
-- IST CALENDAR DAY, so comparing one to CURRENT_DATE would be wrong between
-- 00:00 and 05:30 IST, when the UTC date is still yesterday. Concretely it
-- would fire the payment-due sweep a day early and reject legitimate
-- same-day bookings made after 18:30 IST.
--
-- Mandatory in: every `date` default, every CHECK comparing a date to
-- today, every cron predicate, and every `*_on` derived from a timestamptz.
-- Changing cities later means changing this function and nothing else.
-- -------------------------------------------------------------------------
create or replace function public.business_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

comment on function public.business_today() is
    'Current IST calendar day. Use instead of CURRENT_DATE for every date-typed business fact.';

-- -------------------------------------------------------------------------
-- set_updated_at() — one trigger function for all 30 mutable tables.
-- -------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end $$;

-- -------------------------------------------------------------------------
-- Immutability guards.
--
-- The old schema protected three compliance tables this way but left its
-- most sensitive financial table mutable. Here financial records get the
-- same protection compliance records do.
-- -------------------------------------------------------------------------
create or replace function public.trg_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception 'Table %.% is append-only; % is not permitted.',
        tg_table_schema, tg_table_name, tg_op;
end $$;

-- -------------------------------------------------------------------------
-- Role helpers. The role is a SINGLE value on public.users, mirrored into
-- the JWT by the access-token hook, so these are a claim comparison rather
-- than a table read — which matters because RLS predicates run per row.
-- -------------------------------------------------------------------------
create or replace function public.current_role_name()
returns public.user_role
language sql
stable
set search_path = ''
as $$
    select coalesce(
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'user_role',
        'rider'
    )::public.user_role
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
set search_path = ''
as $$ select public.current_role_name() in ('staff', 'admin') $$;

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$ select public.current_role_name() = 'admin' $$;

-- -------------------------------------------------------------------------
-- custom_access_token_hook — stamps the single role claim into the JWT.
-- Register under Authentication > Hooks in the Supabase dashboard.
-- -------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
    v_role   public.user_role;
    v_claims jsonb;
begin
    select u.role into v_role
    from public.users u
    where u.id = (event ->> 'user_id')::uuid;

    v_claims := coalesce(event -> 'claims', '{}'::jsonb);
    v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(coalesce(v_role, 'rider'::public.user_role)));

    return jsonb_set(event, '{claims}', v_claims);
end $$;
