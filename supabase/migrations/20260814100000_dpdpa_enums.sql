-- =========================================================================
-- 20260814100000_dpdpa_enums.sql
--
-- DPDPA 2023 / DPDP Rules 2025 — enum types only.
--
-- WHY THIS FILE EXISTS SEPARATELY: a label added by `alter type ... add
-- value` cannot be *referenced* in the same transaction, and the Supabase
-- CLI wraps each migration file in one. So every new label lands here and
-- the first statement that uses one lands in ...100100. This mirrors the
-- split already used by 20260727095623_vehicle_status_lifecycle_enum.sql /
-- 20260727095801_vehicle_status_lifecycle.sql. Do not merge these files.
-- =========================================================================

-- ---------------------------------------------------------------------
-- role_name: the three staff roles the backend (src/types/index.ts
-- ROLE_NAMES / STAFF_ROLES) and the admin console (apps/web
-- BackendRoleName) have always coded for but which were never migrated.
-- Until now the only way to give an ops agent any console access was to
-- make them a full admin — which is exactly why every admin can currently
-- open every rider's Aadhaar scan.
--
-- Ordering is cosmetic; nothing compares role_name values relationally.
-- ---------------------------------------------------------------------
alter type public.role_name add value if not exists 'staff'           after 'rider';
alter type public.role_name add value if not exists 'technician'      after 'staff';
alter type public.role_name add value if not exists 'station_manager' after 'technician';

-- ---------------------------------------------------------------------
-- staff_capability: orthogonal to role. Role answers "what part of the
-- business does this person work in"; capability answers "may this person
-- see raw personal data". A station manager and an admin can both need
-- kyc_reviewer; neither should get it by default.
-- ---------------------------------------------------------------------
create type public.staff_capability as enum (
    'kyc_reviewer',   -- may open identity-document images and the KYC detail view
    'rights_officer', -- may work the data-principal request queue
    'pii_exporter'    -- may generate a data export on a rider's behalf
);

-- ---------------------------------------------------------------------
-- consent_purpose: DPDPA s.5/s.6 require consent to be specific to a
-- purpose. The required/optional split is enforced in code by
-- apps/backend/src/modules/consent/consent.purposes.ts, and the two are
-- kept in step by consent.test.ts.
-- ---------------------------------------------------------------------
create type public.consent_purpose as enum (
    -- Required: the service cannot be delivered without these.
    'kyc_identity_verification',  -- Aadhaar/DL collection and manual review
    'service_delivery',           -- booking, rental, vehicle assignment
    'payments_and_billing',       -- deposits, invoices, refunds
    'safety_and_incident',        -- damage, accident and theft handling
    'service_communications',     -- OTP, pickup and payment-due messages
    -- Optional: refusing these must not degrade the core service.
    'marketing_communications',
    'referral_program',
    'location_services'           -- nearby battery-station search
);

create type public.consent_action as enum ('granted', 'withdrawn');

-- ---------------------------------------------------------------------
-- Data-principal rights (DPDPA ss.11-14).
-- ---------------------------------------------------------------------
create type public.dp_request_type as enum (
    'access_export',  -- s.11 right to access a summary of personal data
    'correction',     -- s.12 correction / completion / updating
    'erasure',        -- s.12(3) erasure
    'grievance',      -- s.13 grievance redressal
    'nominee_update'  -- s.14 nomination
);

create type public.dp_request_status as enum (
    'open',
    'in_progress',
    'awaiting_principal',  -- blocked on the rider (e.g. identity verification)
    'completed',
    'rejected',
    'withdrawn'            -- cancelled by the rider
);

-- ---------------------------------------------------------------------
-- Why a staff member opened a rider's personal data. Purpose-bound access
-- is what turns an access log from a list into evidence.
-- ---------------------------------------------------------------------
create type public.pii_access_reason as enum (
    'kyc_review',
    'support_ticket',
    'fraud_investigation',
    'rights_request',
    'legal_request',
    'rider_self',
    'other'
);

-- ---------------------------------------------------------------------
-- Generic append-only guard. 20260721070000_kyc_onboarding.sql has a
-- bespoke one for audit_logs; the DPDPA tables need the same guarantee
-- and there is no reason for four more copies of it.
--
-- Deliberately raises for the service role too. A trail that the
-- application can quietly rewrite is not a trail. The one place this is
-- suspended is the historical audit_logs redaction in ...100500, which
-- names itself in a comment and is recorded in docs/dpdpa/README.md.
-- ---------------------------------------------------------------------
create or replace function public.trg_append_only_fn()
returns trigger
language plpgsql
as $$
begin
    raise exception '% is append-only and cannot be modified or deleted.', tg_table_name
        using errcode = 'P0001';
end;
$$;
