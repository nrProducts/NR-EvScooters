-- SwapNgo bug-fix backlog, item 5 — refund review & approval flow.
--
-- Every refund now goes: pending (awaiting review) -> reviewed (admin has
-- confirmed / adjusted the payable) -> approve => processing -> succeeded,
-- OR -> rejected. Review lets an admin itemise deductions (transaction fee,
-- other charges, cancellation charge) against a frozen gross amount.
--
-- Also: the free-cancellation grace window and penalty rate become
-- admin-configurable instead of the hard-coded constants in
-- apps/backend/src/modules/bookings/cancellation.constants.ts (kept as the
-- compile-time fallback, per the return_recovery_settings precedent).

-- ---- refund_status: add 'rejected' -------------------------------------
alter type public.refund_status add value if not exists 'rejected';

-- ---- refunds: review + rejection + deduction breakdown ----------------
alter table public.refunds
    add column if not exists gross_amount                  numeric(12,2),
    add column if not exists deduction_transaction_fee     numeric(12,2) not null default 0 check (deduction_transaction_fee >= 0),
    add column if not exists deduction_other_charges       numeric(12,2) not null default 0 check (deduction_other_charges >= 0),
    add column if not exists deduction_cancellation_charge numeric(12,2) not null default 0 check (deduction_cancellation_charge >= 0),
    add column if not exists reviewed_at                   timestamptz,
    add column if not exists reviewed_by_user_id           uuid references public.users (id),
    add column if not exists review_note                   text,
    add column if not exists rejected_at                   timestamptz,
    add column if not exists rejected_by_user_id           uuid references public.users (id),
    add column if not exists rejection_reason              text;

comment on column public.refunds.gross_amount is
    'The refund amount BEFORE any admin review deductions. Frozen at creation; `amount` is always gross_amount minus the three deduction_* columns. Backfilled to `amount` for pre-review rows.';
comment on column public.refunds.reviewed_at is
    'Set when an admin reviews the refund (adjusting deductions if needed). A refund cannot be approved/processed until this is set.';

update public.refunds set gross_amount = amount where gross_amount is null;
alter table public.refunds alter column gross_amount set not null;

-- ---- cancellation_settings — singleton, admin-editable ----------------
create table if not exists public.cancellation_settings (
    id                              uuid primary key default gen_random_uuid(),
    free_cancellation_grace_minutes integer      not null default 60   check (free_cancellation_grace_minutes >= 0),
    free_cancellation_notice_days   integer      not null default 2    check (free_cancellation_notice_days >= 0),
    late_cancellation_penalty_rate  numeric(4,3) not null default 0.25 check (late_cancellation_penalty_rate >= 0 and late_cancellation_penalty_rate <= 1),
    created_at                      timestamptz  not null default now(),
    updated_at                      timestamptz
);

comment on table public.cancellation_settings is
    'Singleton. Admin-tunable pre-pickup cancellation policy. Seeded at the values of the FREE_CANCELLATION_GRACE_MINUTES / FREE_CANCELLATION_NOTICE_DAYS / LATE_CANCELLATION_PENALTY_RATE constants, which stay as the compile-time fallback.';

create unique index if not exists uq_cancellation_settings_singleton
    on public.cancellation_settings ((true));

drop trigger if exists trg_cancellation_settings_updated_at on public.cancellation_settings;
create trigger trg_cancellation_settings_updated_at
    before update on public.cancellation_settings
    for each row execute function public.set_updated_at();

insert into public.cancellation_settings (free_cancellation_grace_minutes, free_cancellation_notice_days, late_cancellation_penalty_rate)
select 60, 2, 0.25
where not exists (select 1 from public.cancellation_settings);

alter table public.cancellation_settings enable row level security;

drop policy if exists p_cancellation_settings_all on public.cancellation_settings;
create policy p_cancellation_settings_all on public.cancellation_settings
    for all to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- ---- notification type for a rejected refund --------------------------
insert into public.notification_types (code, label, default_audience, requires_action, action_path, send_push, send_email)
values ('refund_rejected', 'Refund not approved', 'rider', false, null, true, true)
on conflict (code) do nothing;
