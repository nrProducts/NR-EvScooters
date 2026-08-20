-- ==========================================================================
-- 40 — Mini HRMS reference data: modules, permissions, leave types
--
-- New modules/permissions rows only — no role_permissions grants. Staff hold
-- zero role-level grants in this schema (every staff permission is an
-- explicit per-user override, see user_permission_overrides), and the web
-- console's own route guard for v1 is roles:["admin"]/roles:["staff"] on
-- separate paths (/attendance vs /my-attendance, /leave vs /my-leave), not a
-- delegable grant — so these rows are unused today. Seeding them now still
-- leaves the door open for an admin to later delegate e.g. leave.approve to
-- a staff member via the existing Permission Matrix, with no further
-- migration required.
-- ==========================================================================

insert into public.modules (key, label, sort_order) values
    ('attendance', 'Attendance', 210),
    ('leave',      'Leave',      220);

insert into public.permissions (module_key, action, label, is_enforced) values
    ('attendance', 'view',    'View',             true),
    ('leave',      'view',    'View',             true),
    ('leave',      'approve', 'Approve / Reject', true);

insert into public.leave_types (code, name, annual_quota_days) values
    ('casual', 'Casual Leave', 12),
    ('sick',   'Sick Leave',   8);
