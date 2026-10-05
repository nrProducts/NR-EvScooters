-- ==========================================================================
-- 42 — Mini HRMS: holiday module/permission catalogue rows
--
-- Same reasoning as migration 40 — no role_permissions grants, admin already
-- has every permission unconditionally (resolveAccess()'s admin
-- short-circuit), and this leaves the door open to later delegate
-- holidays.manage to a staff member via the Permission Matrix.
-- ==========================================================================

insert into public.modules (key, label, sort_order) values
    ('holidays', 'Holidays', 230);

insert into public.permissions (module_key, action, label, is_enforced) values
    ('holidays', 'view',   'View',                    true),
    ('holidays', 'manage', 'Add / Edit / Delete',     true);
