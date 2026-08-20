-- =========================================================================
-- 35 — Correct `permissions.is_enforced`
--
-- Fixes the database half of docs/final-system-audit FINDING H1. The code
-- half — switching three write routes from `requireModule` to
-- `requireAction` — lands in the same change.
--
-- `is_enforced` is documented in apps/backend/src/types/index.ts:91-96 as
-- "False when no route actually checks this permission yet", and the console's
-- permission matrix renders an unenforced permission as a DISABLED checkbox
-- (PermissionMatrixPage.tsx:137-150). So the flag is not decoration: it is the
-- console telling an administrator whether a grant means anything.
--
-- It was lying in both directions.
--
-- ── Now true, because the routes were fixed alongside this ───────────────
--
-- `refunds.approve`, `returns.approve` and `damages.edit` were flagged
-- enforced while the routers used the COARSE `requireModule` gate, under
-- which `refunds.view` alone authorised POST /refunds and POST
-- /refunds/:id/retry, `returns.view` alone authorised POST
-- /returns/:id/approve, and `damages.view` alone authorised POST
-- /damages/:id/resolve. An administrator granting "Refunds — view" was told
-- they were giving read access and were in fact giving the ability to move
-- money. Those three routes now check the specific action, so these rows
-- become true statements rather than needing to be turned off.
--
-- `billing.waive` was flagged enforced but nothing checked it — the waive
-- route used `billing.edit`. It now uses `billing.waive`, which is what the
-- row was always for.
--
-- ── Now correctly false ──────────────────────────────────────────────────
--
-- `settings.view` / `settings.edit`: no route checks either, and none should.
-- Everything reachable from the Settings page is either admin-only at the
-- endpoint (`/notification-settings`, `/plan-renewal-settings`,
-- `/users/:id/permissions`, all `requireAdmin`) or is not backed by an
-- endpoint at all — the Company, Security, API Keys and Branding tabs are
-- placeholders, and Security renders <NotConnected/>.
--
-- Consequence, deliberately: the console can no longer grant the `settings`
-- module to a staff account, so staff lose the Settings nav item. That is the
-- honest outcome. The grant previously admitted them to four inert tabs while
-- every real control on the page was already refused server-side.
-- =========================================================================

update public.permissions set is_enforced = false
 where module_key = 'settings' and action in ('view', 'edit');

-- Idempotent re-assertion of the rows the route changes make true. These are
-- already `true`; stating them here keeps the migration a complete
-- description of the intended flag state rather than a diff against whatever
-- the seed happened to say.
update public.permissions set is_enforced = true
 where (module_key, action) in (
    values ('refunds','approve'), ('refunds','view'),
           ('returns','approve'), ('returns','view'),
           ('damages','edit'),    ('damages','view'),
           ('billing','waive'),
           ('payments','refund'), ('payments','view')
 );
