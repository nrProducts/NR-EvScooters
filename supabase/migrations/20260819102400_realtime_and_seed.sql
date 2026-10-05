-- =========================================================================
-- 27 — Realtime publication + reference data
--
-- The publication is part of the SCHEMA, not an operational afterthought.
-- The admin console subscribes to these four tables directly, and for them
-- RLS is the only access control — there is no middleware in front.
--
-- A table accidentally added here is a silent data leak to every subscribed
-- browser, which is why the set is asserted in a migration rather than
-- clicked in a dashboard.
-- =========================================================================

alter publication supabase_realtime add table
    public.bookings,              -- pickup queue, approval popup, status toasts
    public.vehicles,              -- fleet cache invalidation, status toast
    public.payment_allocations,   -- "payment received" — a better signal than a status flip
    public.notification_messages; -- bell badge + approval popups

-- =========================================================================
-- Reference data that must exist in EVERY environment. Anything that is
-- merely sample data belongs in a seed file, not a migration.
-- =========================================================================

insert into public.modules (key, label, sort_order) values
    ('dashboard',       'Dashboard',         10),
    ('bookings',        'Rental Operations', 20),
    ('returns',         'Returns',           30),
    ('vehicles',        'Vehicles',          40),
    ('users',           'Users',             50),
    ('kyc',             'KYC Queue',         60),
    ('maintenance',     'Maintenance',       70),
    ('support',         'Support Tickets',   80),
    ('payments',        'Payments',          90),
    ('refunds',         'Refunds',          100),
    ('billing',         'Billing & Charges',110),
    ('plans',           'Plans',            120),
    ('reconciliation',  'Reconciliation',   130),
    ('notifications',   'Notifications',    140),
    ('privacy',         'Privacy Requests', 150),
    ('pii_access_log',  'PII Access Log',   160),
    ('audit',           'Audit Log',        170),
    ('settings',        'Settings',         180),
    ('battery_stations','Swap Stations',    190),
    ('damages',         'Damage Review',    200);

-- Every module gets view; specific modules get their real verbs. The old
-- schema held this as MODULE_ACTIONS, hand-mirrored in two applications.
insert into public.permissions (module_key, action, label, is_enforced)
select m.key, 'view', 'View', true from public.modules m;

insert into public.permissions (module_key, action, label, is_enforced) values
    ('vehicles',       'create',  'Create',            true),
    ('vehicles',       'edit',    'Edit',              true),
    ('vehicles',       'delete',  'Delete',            true),
    ('vehicles',       'assign',  'Assign to Rider',   true),
    ('users',          'edit',    'Edit',              true),
    ('users',          'suspend', 'Suspend',           true),
    ('kyc',            'review',  'Review / Approve',  true),
    ('kyc',            'reveal_number', 'Reveal Document Number', true),
    ('bookings',       'edit',    'Edit',              true),
    ('bookings',       'cancel',  'Cancel',            true),
    ('returns',        'approve', 'Approve Settlement',true),
    ('maintenance',    'create',  'Create',            true),
    ('maintenance',    'edit',    'Edit',              true),
    ('maintenance',    'complete','Complete',          true),
    ('support',        'reply',   'Reply / Resolve',   true),
    ('payments',       'refund',  'Issue Refund',      true),
    ('refunds',        'approve', 'Approve',           true),
    ('billing',        'create',  'Create Rule',       true),
    ('billing',        'edit',    'Edit Rule',         true),
    ('billing',        'waive',   'Waive Charge',      true),
    ('plans',          'create',  'Create',            true),
    ('plans',          'edit',    'Edit',              true),
    ('notifications',  'send',    'Send / Broadcast',  true),
    ('privacy',        'process', 'Process Request',   true),
    ('privacy',        'export',  'Export PII',        true),
    ('battery_stations','create', 'Create',            true),
    ('battery_stations','edit',   'Edit',              true),
    ('battery_stations','delete', 'Delete',            true),
    ('damages',        'edit',    'Assess / Resolve',  true),
    ('settings',       'edit',    'Edit',              true);

insert into public.permission_profiles (code, label, description, sort_order) values
    ('viewer',           'Viewer',           'Read-only across the console — no create, edit or approve anywhere.', 10),
    ('operations_staff', 'Operations Staff', 'Runs the fleet day-to-day: vehicles, bookings, maintenance, swap stations.', 20),
    ('support_staff',    'Support Staff',    'Handles rider tickets and looks up bookings while doing so.', 30),
    ('finance_staff',    'Finance Staff',    'Payments, refunds, billing rules and reconciliation.', 40),
    ('kyc_staff',        'KYC Staff',        'Reviews identity documents and rider records.', 50);

insert into public.permission_profile_permissions (permission_profile_code, permission_id)
select 'viewer', p.id from public.permissions p where p.action = 'view'
  and p.module_key in ('dashboard','vehicles','users','kyc','bookings','maintenance','support','payments','plans','notifications','privacy');

insert into public.permission_profile_permissions (permission_profile_code, permission_id)
select 'operations_staff', p.id from public.permissions p
 where (p.module_key = 'dashboard' and p.action = 'view')
    or (p.module_key = 'vehicles'  and p.action in ('view','create','edit','assign'))
    or (p.module_key = 'bookings'  and p.action in ('view','edit','cancel'))
    or (p.module_key = 'returns'   and p.action in ('view','approve'))
    or (p.module_key = 'maintenance' and p.action in ('view','create','edit','complete'))
    or (p.module_key = 'battery_stations' and p.action in ('view','edit'))
    or (p.module_key = 'users'     and p.action = 'view');

insert into public.permission_profile_permissions (permission_profile_code, permission_id)
select 'support_staff', p.id from public.permissions p
 where (p.module_key = 'dashboard' and p.action = 'view')
    or (p.module_key = 'support'   and p.action in ('view','reply'))
    or (p.module_key in ('bookings','users','vehicles') and p.action = 'view');

insert into public.permission_profile_permissions (permission_profile_code, permission_id)
select 'finance_staff', p.id from public.permissions p
 where (p.module_key = 'dashboard' and p.action = 'view')
    or (p.module_key = 'payments'  and p.action in ('view','refund'))
    or (p.module_key = 'refunds'   and p.action in ('view','approve'))
    or (p.module_key = 'billing'   and p.action in ('view','create','edit','waive'))
    or (p.module_key = 'reconciliation' and p.action = 'view')
    or (p.module_key = 'plans'     and p.action = 'view');

insert into public.permission_profile_permissions (permission_profile_code, permission_id)
select 'kyc_staff', p.id from public.permissions p
 where (p.module_key = 'dashboard' and p.action = 'view')
    or (p.module_key = 'kyc'   and p.action in ('view','review'))
    or (p.module_key = 'users' and p.action = 'view');

-- Baseline for every staff account: see the dashboard. Everything else is
-- granted per user.
insert into public.role_permissions (role, permission_id)
select 'staff', p.id from public.permissions p
 where p.module_key = 'dashboard' and p.action = 'view';

insert into public.notification_types (code, label, default_audience, requires_action, action_path, send_push, send_email) values
    ('booking_confirmed',        'Booking confirmed',        'rider', false, null,           true,  true),
    ('booking_cancelled',        'Booking cancelled',        'both',  false, null,           true,  true),
    ('pickup_reminder',          'Pickup reminder',          'rider', false, null,           true,  false),
    ('payment_due',              'Payment due',              'rider', false, null,           true,  true),
    ('payment_succeeded',        'Payment received',         'both',  false, null,           true,  false),
    ('payment_failed',           'Payment failed',           'rider', false, null,           true,  true),
    ('plan_expiring',            'Plan expiring soon',       'rider', false, null,           true,  false),
    ('return_requested',         'Return requested',         'staff', true,  '/returns',     true,  false),
    ('settlement_completed',     'Settlement completed',     'rider', false, null,           true,  true),
    ('refund_processed',         'Refund processed',         'rider', false, null,           true,  true),
    ('kyc_review_needed',        'KYC review needed',        'staff', true,  '/kyc',         true,  false),
    ('kyc_approved',             'KYC approved',             'rider', false, null,           true,  true),
    ('kyc_rejected',             'KYC rejected',             'rider', false, null,           true,  true),
    ('maintenance_review_needed','Maintenance review needed','staff', true,  '/maintenance', true,  false),
    ('damage_recorded',          'Damage recorded',          'rider', false, null,           true,  true);

insert into public.retention_policies (category, description, retain_days, action, legal_basis) values
    ('auth_otp_attempts',      'Phone and IP from OTP rate limiting',        30,   'delete',    'DPDPA s.8(7) storage limitation'),
    ('notification_bodies',    'Message titles and bodies',                  180,  'redact',    'DPDPA s.8(7) storage limitation'),
    ('notification_events',    'Business event stream',                      365,  'delete',    'DPDPA s.8(7) storage limitation'),
    ('audit_logs_general',     'Non-financial audit records',                730,  'delete',    'DPDPA s.8(7) storage limitation'),
    ('audit_logs_financial',   'Financial audit records',                    2920, 'retain',    'Income-tax Act record retention'),
    ('pii_access_log',         'Staff access to personal data',              730,  'delete',    'DPDPA accountability'),
    ('consent_records',        'Consent decisions',                          2920, 'retain',    'DPDPA proof of consent'),
    ('inactive_riders',        'Riders with no activity',                    1095, 'anonymise', 'DPDPA s.8(7) storage limitation'),
    ('kyc_abandoned',          'KYC uploads never submitted',                90,   'delete',    'DPDPA purpose limitation'),
    ('financial_records',      'Invoices, payments, refunds, settlements',   2920, 'retain',    'Income-tax Act / GST record retention');

insert into public.invoice_series (code, financial_year, prefix) values
    ('SNG-FY2627', '2026-27', 'SNG/2627/');
