-- =========================================================================
-- Referral rewards — discount CARDS, not cash and not a wallet.
--
-- A rider who refers someone earns a fixed-value card they may spend on ONE
-- future plan renewal. Five successful referrals means five separate cards,
-- each redeemable against a different renewal; two cards can never be
-- combined on the same transaction.
--
-- WHAT THIS DELIBERATELY DOES NOT ADD
--
-- No wallet, no balance, no credit ledger. A card is an indivisible
-- entitlement: it is either spent whole on one renewal or it is not spent.
-- That is the product rule, and modelling it as a balance would quietly
-- permit part-spends and combinations the rule forbids.
--
-- No new discount mechanism either. Applying a card writes an ordinary
-- `subscription_adjustments` row (kind = 'discount', negative amount) — the
-- same path the Welcome and Loyalty discounts already take to reach an
-- invoice. `referral_card_redemptions` records WHICH card paid for that
-- adjustment; the money itself moves through machinery that already exists.
--
-- REPLACES A STUB, NOT A WORKING FEATURE
--
-- `referrals`, `referral_rewards` and `users.referral_code` existed before
-- the v2 schema migration and were dropped rather than carried across.
-- apps/backend/src/modules/referrals/referrals.service.ts has been a
-- documented stub since, rejecting every call. These tables are NOT those
-- tables: the old ones paid a one-off booking discount, this pays renewal
-- cards. Nothing is restored, and no old data is migrated — there is none.
-- =========================================================================

-- --- status vocabularies --------------------------------------------------
-- Enums rather than text+check, matching adjustment_status / refund_status.

create type public.referral_status as enum (
    'pending',    -- code accepted, qualifying event not yet met
    'qualified',  -- requirements met; a card has been (or is being) issued
    'rejected',   -- failed validation or the qualifying window lapsed
    'revoked'     -- qualified, then reversed (refund, fraud, admin action)
);

create type public.reward_card_status as enum (
    'available',  -- spendable
    'reserved',   -- held against an in-flight renewal payment
    'redeemed',   -- spent; terminal
    'expired',    -- passed expires_at unspent; terminal
    'revoked'     -- withdrawn by an admin or by reversal policy; terminal
);

create type public.reward_redemption_status as enum (
    'reserved',   -- card held, payment not yet confirmed
    'redeemed',   -- payment confirmed; terminal
    'released'    -- payment failed or abandoned, card returned; terminal
);

-- What the REFEREE must do before the REFERRER earns anything. Ordered
-- loosest to strictest. 'signup' exists because the spec requires the event
-- to be configurable, not because it is advisable — see the program default.
create type public.referral_qualifying_event as enum (
    'signup',
    'kyc_verified',
    'first_paid_booking'
);

-- --- the referrer's own code ---------------------------------------------

alter table public.users add column referral_code text;

comment on column public.users.referral_code is
    'The rider''s own code, shared with others. Stable for the life of the account and stored upper-case so matching is case-insensitive without citext. Null until first issued — generated lazily by the backend, so existing riders are not all backfilled with codes they may never use.';

create unique index users_referral_code_key
    on public.users (referral_code)
    where referral_code is not null;

-- --- program / campaign settings -----------------------------------------

create table public.referral_programs (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    enabled boolean not null default false,

    -- Frozen onto each card at issuance, so later edits never restate the
    -- value of a card a rider is already holding.
    reward_amount numeric(12,2) not null default 0 check (reward_amount >= 0),
    qualifying_event public.referral_qualifying_event not null default 'first_paid_booking',

    -- null = never expires. Measured from issuance.
    reward_expiry_days integer check (reward_expiry_days is null or reward_expiry_days > 0),
    -- null = unlimited.
    max_rewards_per_referrer integer check (max_rewards_per_referrer is null or max_rewards_per_referrer > 0),
    -- A card may not be applied to a renewal cheaper than this.
    min_renewal_amount numeric(12,2) not null default 0 check (min_renewal_amount >= 0),
    -- null = every plan is eligible. Otherwise an allow-list of plan ids.
    eligible_plan_ids uuid[],

    allow_stacking boolean not null default false,
    revoke_on_reversal boolean not null default true,

    starts_at timestamptz,
    ends_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz,
    created_by_user_id uuid references public.users (id) on delete set null,
    updated_by_user_id uuid references public.users (id) on delete set null,

    constraint chk_referral_programs_window check (ends_at is null or starts_at is null or ends_at > starts_at)
);

comment on table public.referral_programs is
    'Admin-configured referral campaigns. At most one may be enabled at a time (uq_referral_programs_enabled); the enabled one is what new referrals attach to.';
comment on column public.referral_programs.enabled is
    'Defaults FALSE so the feature stays dark until an admin has set a reward amount and reviewed the rules — shipping the migration must not start paying out.';
comment on column public.referral_programs.qualifying_event is
    'Defaults to first_paid_booking: rewarding on signup or code entry is the standard way referral programmes get farmed, and requiring real money to have moved makes an attack cost more than it pays.';
comment on column public.referral_programs.allow_stacking is
    'Whether a referral card may sit alongside other discounts on one invoice. Defaults FALSE per the product rule; the one-card-per-transaction limit is separate and is enforced structurally by uq_referral_redemption_per_invoice.';
comment on column public.referral_programs.eligible_plan_ids is
    'Null means all plans. A non-null empty array means NO plan qualifies, which is a valid way to pause redemption without disabling the programme.';

-- At most one enabled programme. Two live campaigns would make "which reward
-- amount applies" ambiguous at the moment of issuance.
create unique index uq_referral_programs_enabled
    on public.referral_programs ((enabled))
    where enabled;

-- --- who referred whom ----------------------------------------------------

create table public.referrals (
    id uuid primary key default gen_random_uuid(),
    program_id uuid not null references public.referral_programs (id) on delete restrict,

    referrer_user_id uuid not null references public.users (id) on delete cascade,
    referee_user_id uuid not null references public.users (id) on delete cascade,

    -- The code as typed, snapshotted. The referrer's current code could in
    -- principle change; what was redeemed must not.
    code_used text not null,

    status public.referral_status not null default 'pending',
    -- Snapshotted from the programme, so changing the rule later cannot
    -- retroactively disqualify a referral that already met the old one.
    qualifying_event public.referral_qualifying_event not null,

    qualified_at timestamptz,
    -- What actually satisfied the requirement, for audit and for reversal.
    qualifying_booking_id uuid references public.bookings (id) on delete set null,

    rejected_at timestamptz,
    rejection_reason text,
    revoked_at timestamptz,
    revoked_by_user_id uuid references public.users (id) on delete set null,
    revocation_reason text,

    created_at timestamptz not null default now(),
    updated_at timestamptz,

    constraint chk_referrals_no_self check (referrer_user_id <> referee_user_id)
);

comment on table public.referrals is
    'One row per (referrer, referee) pair. The referee column is UNIQUE: an account can be referred exactly once, ever, which is what stops a rider being re-attributed to a second referrer later.';
comment on column public.referrals.qualifying_event is
    'Snapshotted from the programme at creation. Without this, an admin tightening the rule would silently disqualify referrals already in flight under the looser one.';

-- The structural guarantee behind "prevent multiple rewards for the same
-- referred rider" and "prevent changing the referrer after acceptance".
create unique index uq_referrals_referee on public.referrals (referee_user_id);

create index referrals_referrer_idx on public.referrals (referrer_user_id, status);
create index referrals_status_created_idx on public.referrals (status, created_at desc);

-- --- the cards themselves -------------------------------------------------

create table public.referral_reward_cards (
    id uuid primary key default gen_random_uuid(),
    -- The OWNER is the referrer. Denormalised from referrals.referrer_user_id
    -- so ownership checks and RLS do not need a join on every read.
    user_id uuid not null references public.users (id) on delete cascade,
    referral_id uuid not null references public.referrals (id) on delete restrict,
    program_id uuid not null references public.referral_programs (id) on delete restrict,

    -- Frozen at issuance. Editing the programme must never restate a card a
    -- rider already holds.
    amount numeric(12,2) not null check (amount > 0),

    status public.reward_card_status not null default 'available',

    issued_at timestamptz not null default now(),
    expires_at timestamptz,
    revoked_at timestamptz,
    revoked_by_user_id uuid references public.users (id) on delete set null,
    revocation_reason text,

    created_at timestamptz not null default now(),
    updated_at timestamptz
);

comment on table public.referral_reward_cards is
    'A fixed-value entitlement spendable on one renewal. Indivisible: no partial spend, no combining, no cash-out.';
comment on column public.referral_reward_cards.amount is
    'Rupees, numeric(12,2) — the representation subscription_adjustments and refunds already use. Frozen at issuance.';
comment on column public.referral_reward_cards.status is
    'available -> reserved -> redeemed is the happy path. reserved -> available on a released reservation. expired and revoked are terminal and reachable only from available/reserved.';

-- Exactly-once issuance: a referral can mint one card and no more, no matter
-- how many times a webhook or retry replays the qualifying event.
create unique index uq_reward_cards_referral on public.referral_reward_cards (referral_id);

create index reward_cards_user_status_idx on public.referral_reward_cards (user_id, status);
-- Drives the expiry sweep.
create index reward_cards_expiry_idx on public.referral_reward_cards (expires_at)
    where status in ('available', 'reserved');

-- --- redemption / reservation --------------------------------------------

create table public.referral_card_redemptions (
    id uuid primary key default gen_random_uuid(),
    reward_card_id uuid not null references public.referral_reward_cards (id) on delete restrict,
    -- Denormalised owner, same reasoning as on the card.
    user_id uuid not null references public.users (id) on delete cascade,

    invoice_id uuid not null references public.invoices (id) on delete restrict,
    subscription_id uuid references public.subscriptions (id) on delete set null,
    -- The discount line this card paid for. Null only between reserving and
    -- writing the adjustment, inside one transaction.
    subscription_adjustment_id uuid references public.subscription_adjustments (id) on delete set null,

    -- All three snapshotted at reservation so the breakdown shown to the
    -- rider is reproducible later, independent of plan price changes.
    original_amount numeric(12,2) not null check (original_amount >= 0),
    discount_amount numeric(12,2) not null check (discount_amount > 0),
    final_amount numeric(12,2) not null check (final_amount >= 0),

    status public.reward_redemption_status not null default 'reserved',

    reserved_at timestamptz not null default now(),
    redeemed_at timestamptz,
    released_at timestamptz,
    release_reason text,

    created_at timestamptz not null default now(),
    updated_at timestamptz,

    constraint chk_redemption_amounts check (final_amount = original_amount - discount_amount)
);

comment on table public.referral_card_redemptions is
    'Reservation-then-confirm record for spending a card. A card is held at reservation and only consumed once the renewal payment is confirmed, so a failed payment returns the card instead of eating it.';

-- A card can be in flight or spent ONCE. This is what makes concurrent
-- redemption attempts fail in the database rather than relying on the
-- service layer winning a race.
create unique index uq_reward_card_active_redemption
    on public.referral_card_redemptions (reward_card_id)
    where status in ('reserved', 'redeemed');

-- ONE CARD PER TRANSACTION, enforced structurally rather than by a check in
-- application code: an invoice can carry at most one live referral card.
create unique index uq_referral_redemption_per_invoice
    on public.referral_card_redemptions (invoice_id)
    where status in ('reserved', 'redeemed');

create index referral_redemptions_user_idx on public.referral_card_redemptions (user_id, status);

-- --- row level security ---------------------------------------------------
-- Same shape as refunds/invoices/subscriptions: riders read their OWN rows,
-- staff read everything, and nobody writes through the client. Every write
-- path is the backend's service-role client, which bypasses RLS — so the
-- absence of insert/update/delete policies here is the control that stops a
-- rider minting or redeeming their own cards.

alter table public.referral_programs enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_reward_cards enable row level security;
alter table public.referral_card_redemptions enable row level security;

-- Programme rules reach riders through the backend (which reads as
-- service-role and returns only the public-facing fields), not by direct
-- table access — the row carries operational settings riders should not see.
create policy p_referral_programs_read on public.referral_programs
    for select to authenticated
    using (is_staff());

-- A rider sees referrals they MADE. Deliberately not the ones where they are
-- the referee: that would tell them who referred them, which is not theirs
-- to know and leaks the other rider's participation.
create policy p_referrals_read on public.referrals
    for select to authenticated
    using (referrer_user_id = (select auth.uid()) or is_staff());

create policy p_reward_cards_read on public.referral_reward_cards
    for select to authenticated
    using (user_id = (select auth.uid()) or is_staff());

create policy p_referral_redemptions_read on public.referral_card_redemptions
    for select to authenticated
    using (user_id = (select auth.uid()) or is_staff());

-- --- a disabled starting programme ---------------------------------------
-- Seeded so the admin screen has a row to edit rather than needing a create
-- flow on day one. Disabled with a zero reward: enabling it is a deliberate
-- act with a real amount attached, never an accident of deployment.

insert into public.referral_programs (name, enabled, reward_amount, qualifying_event, reward_expiry_days)
values ('Default referral programme', false, 0, 'first_paid_booking', 90);
