-- =========================================================================
-- 20260814101000_staff_permission_actions.sql
--
-- Adds per-action granularity on top of the existing per-module grant in
-- public.staff_permissions (20260813100100), plus two small profile fields
-- on public.users needed by the new Staff Access screens:
--   - last_login_at: written by the backend on session resolution
--     (apps/backend/src/modules/auth/auth.service.ts getSessionContext).
--   - staff_code: optional, admin-entered, free-text staff identifier.
--
-- A staff_permissions row still means "this module is granted" (row
-- existence), exactly as before — requireModule()/hasModule() are
-- unchanged. `actions` narrows what the holder may DO inside that module;
-- an empty actions array is not a valid steady state (a full-replace write
-- that would leave a module row with zero actions instead deletes the row
-- — see replaceModulePermissions in staff-permissions.service.ts), so
-- "row exists" and "has at least one action" stay equivalent.
-- =========================================================================

alter table public.staff_permissions
    add column if not exists actions text[] not null default '{}';

alter table public.users
    add column if not exists last_login_at timestamptz,
    add column if not exists staff_code text unique;

-- Backfill: every grant that predates this migration had no action concept
-- at all, i.e. it meant "full access to whatever this module exposed".
-- Populate `actions` with that module's full verb set so no existing staff
-- account's effective access narrows on deploy.
update public.staff_permissions set actions = case module_key
    when 'vehicles'      then array['view','create','edit','assign','delete']
    when 'users'         then array['view','edit','suspend']
    when 'kyc'           then array['view','review']
    when 'bookings'      then array['view','edit','cancel']
    when 'maintenance'   then array['view','create','edit','complete']
    when 'support'       then array['view','reply']
    when 'payments'      then array['view','refund']
    when 'notifications' then array['view','send']
    when 'privacy'       then array['view','process']
    when 'damages'       then array['view','resolve']
    when 'refunds'       then array['view','create']
    else actions
end
where actions = '{}';
