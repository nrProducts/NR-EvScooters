-- Hard-deleting a pricing rule (as opposed to editing/deactivating one) is a
-- separate, stronger action than `billing.edit` — same reasoning as
-- `billing.waive` already being split out from `edit` (finding in
-- 20260820100200_permission_enforcement_flags.sql). Mirrors the existing
-- `battery_stations.delete` precedent.
insert into public.permissions (module_key, action, label, is_enforced) values
    ('billing', 'delete', 'Delete Rule', true)
on conflict (module_key, action) do nothing;

-- Finance staff already get create/edit/waive on billing; delete joins them.
insert into public.permission_profile_permissions (permission_profile_code, permission_id)
select 'finance_staff', p.id
  from public.permissions p
 where p.module_key = 'billing' and p.action = 'delete'
on conflict do nothing;
