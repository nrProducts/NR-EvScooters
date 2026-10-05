-- =========================================================================
-- Reconcile the migration files with what is actually deployed on UAT
--
-- Several objects were changed on UAT (`cndqvdskrcmivqflbttl`) directly, or
-- a later file was edited after it was applied, so building a fresh database
-- from this directory (i.e. production) did NOT reproduce UAT. This migration
-- restates the deployed definitions so both environments converge on the
-- same schema. On UAT it is a no-op except for the DROP in (3), which a
-- committed migration already intended.
--
-- (1) handle_new_auth_user — the file version (…101900_functions) only
--     creates rider_profiles. The deployed version also creates
--     staff_profiles for staff/admin. Without it, the deferred constraint
--     trigger trg_users_profile_matches_role (…102610_profile_extension_
--     integrity) rejects every staff/admin auth user created on a fresh
--     database.
--
-- (2) quote_plan_first_period — 20260929100000_deposit_refundable_toggle
--     as committed drops the onboarding-charge line that
--     20260917100000_deposit_onboarding_charge_split added; the version
--     applied to UAT keeps it. This is the deployed body verbatim.
--
-- (3) allocate_vehicle_for_booking — 20260910100100_drop_auto_vehicle_
--     allocation was never applied to UAT, so the function still exists
--     there. Nothing in the backend calls it.
-- =========================================================================

-- ---- (1) ----------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_role public.user_role := coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'rider');
begin
    insert into public.users (id, full_name, phone, email, role)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.phone, new.email, v_role)
    on conflict (id) do nothing;

    if v_role = 'rider' then
        insert into public.rider_profiles (user_id) values (new.id) on conflict do nothing;
    else
        insert into public.staff_profiles (user_id, staff_code)
        values (new.id, coalesce(new.raw_user_meta_data ->> 'staff_code',
                                 'STF-' || upper(substr(replace(new.id::text,'-',''), 1, 8))))
        on conflict do nothing;
    end if;
    return new;
end $$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

-- ---- (2) ----------------------------------------------------------------
create or replace function public.quote_plan_first_period(
    p_plan_id   uuid,
    p_starts_on date default null
)
returns table (
    description text,
    amount      numeric(12,2),
    sort_order  integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
    v_plan  public.plans%rowtype;
    v_start date;
    v_end   date;
begin
    select * into v_plan from public.plans where id = p_plan_id and deleted_at is null;
    if not found then
        raise exception 'Unknown or deleted plan %', p_plan_id using errcode = 'no_data_found';
    end if;

    v_start := coalesce(p_starts_on, public.business_today());
    -- Mirrors ensureSubscription: a period runs duration_days INCLUSIVE.
    v_end   := v_start + (v_plan.duration_days - 1);

    return query
        select 'Plan fee — period 1'::text, v_plan.price_amount, 1
        union all
        select q.name, q.amount, 2
          from public.quote_period_adjustments(
                   p_plan_id, null, v_start, v_end, 1, v_plan.price_amount) q
        union all
        select 'One-time onboarding charge (non-refundable)'::text,
               v_plan.onboarding_charge_amount, 3
         where v_plan.onboarding_charge_amount > 0
        union all
        select case when v_plan.deposit_refundable
                    then 'Refundable security deposit'
                    else 'Security deposit (non-refundable)'
               end::text,
               v_plan.deposit_amount, 4
         where v_plan.deposit_amount > 0
        order by 3;
end $$;

revoke all on function public.quote_plan_first_period(uuid, date) from public, anon, authenticated;
grant execute on function public.quote_plan_first_period(uuid, date) to service_role;

-- ---- (3) ----------------------------------------------------------------
drop function if exists public.allocate_vehicle_for_booking(uuid);
