-- =========================================================================
-- referral_identity_marks — "one person, one referral redemption, ever,"
-- enforced on an identity rather than an account row.
--
-- `uq_referrals_referee` (20261010100000_referral_rewards.sql) already stops
-- one ACCOUNT redeeming twice. It does not stop one PERSON redeeming twice by
-- deleting the account and signing up again: erasure anonymises the users row
-- in place rather than deleting it (financial FKs forbid a real delete), but
-- a brand-new account is a brand-new row with no memory of the old one.
--
-- This table is the memory that survives that gap. It is deliberately NOT
-- touched by anonymise_user() (supabase/migrations/
-- 20260819102600_operational_functions.sql) — the same "financial/compliance
-- records survive erasure" reasoning this schema already applies elsewhere,
-- here for fraud prevention instead of accounting. `phone_hash` is a
-- peppered HMAC-SHA256 of the normalised phone (see
-- apps/backend/src/modules/referrals/referralIdentity.ts) — one-way, so this
-- table never holds a real phone number, only whether one has been seen
-- before.
-- =========================================================================

create table public.referral_identity_marks (
    id uuid primary key default gen_random_uuid(),
    phone_hash text not null,
    -- Informational only — NOT what enforces the rule (the unique index
    -- below is). Kept so a flagged attempt can be traced back to the
    -- account that first redeemed, for support/fraud review.
    first_referee_user_id uuid references public.users (id) on delete set null,
    created_at timestamptz not null default now()
);

comment on table public.referral_identity_marks is
    'One row per real phone identity that has ever redeemed a referral code. Survives account erasure on purpose — anonymise_user() does not touch this table — so deleting and recreating an account cannot bypass the one-redemption-per-person rule. phone_hash is a one-way peppered HMAC; the real phone number is never stored here.';
comment on column public.referral_identity_marks.phone_hash is
    'HMAC-SHA256(normalised phone, REFERRAL_IDENTITY_PEPPER). Not reversible without the pepper, and even with it only confirms a guess — it is a search index, not storage of the number.';

-- The actual guarantee: a second insert for the same phone_hash fails here,
-- not in application logic that could drift or be bypassed by a direct call.
create unique index uq_referral_identity_marks_phone on public.referral_identity_marks (phone_hash);

alter table public.referral_identity_marks enable row level security;

-- No policies at all, deliberately — this table is never read or written
-- through the client. The only writer is the backend's service-role
-- connection (redeemReferralCode), which bypasses RLS entirely, same as
-- every other backend-only table in this schema (see pre_bookings). Zero
-- policies means a signed-in rider's own anon/authenticated role gets
-- nothing: not their own mark, not anyone else's.
