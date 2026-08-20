-- =========================================================================
-- 24 — Views
--
-- EVERY view is security_invoker. Without it a view runs with its OWNER's
-- privileges and silently bypasses RLS underneath — v_invoice_balances
-- would have exposed every rider's outstanding balance to any authenticated
-- rider. "RLS on every table" is not "RLS on every readable object".
-- =========================================================================

create view public.v_current_consents
with (security_invoker = true) as
select distinct on (user_id, purpose)
       user_id, purpose, action, consent_notice_id, notice_version_snapshot,
       language, created_at as decided_at
  from public.consent_records
 order by user_id, purpose, created_at desc;

create view public.v_user_effective_permissions
with (security_invoker = true) as
select u.id as user_id, p.id as permission_id, p.module_key, p.action
  from public.users u
  join public.permissions p on true
 where u.role = 'admin'
union
select u.id, p.id, p.module_key, p.action
  from public.users u
  join public.role_permissions rp on rp.role = u.role
  join public.permissions p on p.id = rp.permission_id
 where u.role = 'staff'
   and not exists (select 1 from public.user_permission_overrides o
                    where o.user_id = u.id and o.permission_id = p.id and o.is_granted = false)
union
select o.user_id, p.id, p.module_key, p.action
  from public.user_permission_overrides o
  join public.permissions p on p.id = o.permission_id
 where o.is_granted = true;

comment on view public.v_user_effective_permissions is
    'Role permissions, minus per-user revokes, plus per-user grants. Admin is unconditional. Replaces permissionProfiles.ts, which lived in two hand-synced copies.';

create view public.v_invoice_balances
with (security_invoker = true) as
select i.id as invoice_id, i.user_id, i.subscription_id, i.status, i.total_amount,
       coalesce(sum(a.amount), 0)                  as allocated_amount,
       i.total_amount - coalesce(sum(a.amount), 0) as balance_amount,
       (coalesce(sum(a.amount), 0) >= i.total_amount) as is_paid,
       (i.status = 'issued'
        and i.due_on is not null
        and i.due_on < public.business_today()
        and coalesce(sum(a.amount), 0) < i.total_amount) as is_overdue
  from public.invoices i
  left join public.payment_allocations a on a.invoice_id = i.id
 group by i.id;

comment on view public.v_invoice_balances is
    'Replaces invoices.payment_status. Paid-ness is derived from money actually allocated, not a flag someone remembered to set.';

create view public.v_subscription_current_period
with (security_invoker = true) as
select s.id as subscription_id,
       s.user_id,
       p.id   as subscription_period_id,
       p.sequence_number,
       p.starts_on, p.ends_on, p.due_on,
       s.started_on
         + s.duration_days_snapshot
         + coalesce((select sum(sp.days_paused)::integer from public.subscription_pauses sp
                      where sp.subscription_id = s.id), 0) as scheduled_ends_on
  from public.subscriptions s
  left join public.subscription_periods p
         on p.subscription_id = s.id and p.status = 'current';

comment on view public.v_subscription_current_period is
    'scheduled_ends_on is DERIVED here rather than stored, because it shifts on every pause — storing it would make it a mutable mirror.';

create view public.v_rental_current_vehicle
with (security_invoker = true) as
select a.rental_id, r.user_id, r.subscription_id,
       a.vehicle_id, a.assigned_at, a.reason, a.assigned_hub_id
  from public.rental_vehicle_assignments a
  join public.rentals r on r.id = a.rental_id
 where a.released_at is null;

comment on view public.v_rental_current_vehicle is
    'The single right answer to "which scooter does this rider have?". The old schema had three tables holding three answers.';

create view public.v_vehicle_availability
with (security_invoker = true) as
select v.vehicle_model_id, v.hub_id, v.status, count(*) as vehicle_count
  from public.vehicles v
 group by v.vehicle_model_id, v.hub_id, v.status;
