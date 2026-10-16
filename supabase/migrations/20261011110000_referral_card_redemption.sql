-- =========================================================================
-- Spending a referral reward card on a renewal invoice.
--
-- Three atomic steps, three functions, each a single transaction:
--
--   reserve_referral_card_redemption  — rider picks a card for an unpaid
--     invoice. Writes the discount onto the invoice right now (so the order
--     created for payment is naturally sized correctly) and holds the card.
--   confirm_referral_card_redemption  — called once the invoice is fully
--     SETTLED (payments.service.ts, right where applyRenewalSuccess already
--     fires). Flips the reservation and the card to their terminal state.
--   release_referral_card_redemption  — undoes a reservation that never got
--     paid: the rider changed their mind, or the invoice itself got voided
--     out from under it (abandonedRenewal.ts). Reverts the invoice totals
--     and frees the card to 'available' again.
--
-- WHY THIS IS SQL FUNCTIONS, NOT A SEQUENCE OF BACKEND CALLS
--
-- Reserving touches four tables (subscription_adjustments, invoice_items,
-- invoices, referral_card_redemptions, referral_reward_cards — five) and
-- every one of them has to agree or none of them should have moved. A
-- backend service function making five independent PostgREST calls has no
-- way to undo the first three if the fourth fails — there is no multi-
-- statement transaction across separate HTTP requests. create_booking_from_order
-- already solved the same problem the same way for booking creation; this
-- follows it.
--
-- WHY generate_period_invoice() ISN'T REUSED
--
-- It resets invoice_items.line_number to 1 on every call, and
-- invoice_items has UNIQUE (invoice_id, line_number) — replaying it against
-- an invoice that already has rows collides. Reserving instead computes
-- max(line_number)+1 itself and inserts exactly one new row.
-- =========================================================================

create or replace function public.reserve_referral_card_redemption(
    p_card_id uuid,
    p_invoice_id uuid,
    p_user_id uuid
)
returns public.referral_card_redemptions
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_card       public.referral_reward_cards%rowtype;
    v_invoice    public.invoices%rowtype;
    v_balance    numeric(12,2);
    v_discount   numeric(12,2);
    v_final      numeric(12,2);
    v_next_line  smallint;
    v_adj_id     uuid;
    v_redemption public.referral_card_redemptions%rowtype;
begin
    -- Locked first, in a fixed order (card then invoice) so two concurrent
    -- reservations can never deadlock against each other.
    select * into v_card from public.referral_reward_cards
     where id = p_card_id and user_id = p_user_id
     for update;
    if not found then
        raise exception 'card_not_found' using errcode = 'P0001';
    end if;
    if v_card.status <> 'available' then
        raise exception 'card_not_available' using errcode = 'P0001';
    end if;
    if v_card.expires_at is not null and v_card.expires_at <= now() then
        raise exception 'card_expired' using errcode = 'P0001';
    end if;

    select * into v_invoice from public.invoices
     where id = p_invoice_id and user_id = p_user_id
     for update;
    if not found then
        raise exception 'invoice_not_found' using errcode = 'P0001';
    end if;
    if v_invoice.status <> 'issued' then
        raise exception 'invoice_not_payable' using errcode = 'P0001';
    end if;

    select balance_amount into v_balance
      from public.v_invoice_balances where invoice_id = p_invoice_id;
    if v_balance is null or v_balance <= 0 then
        raise exception 'invoice_already_settled' using errcode = 'P0001';
    end if;

    -- Never discounts past zero — a card worth more than the remaining
    -- balance (e.g. applied to a part-paid invoice) is capped, not wasted;
    -- the unspent remainder simply stays on the card... except a card is
    -- indivisible by design (see the card-model migration's own header), so
    -- in practice this caps at the invoice total on a fresh invoice and the
    -- rider's whole card is spent regardless. Capping here is defence
    -- against a negative final_amount, not a partial-spend feature.
    v_discount := least(v_card.amount, v_balance);
    v_final    := v_invoice.total_amount - v_discount;

    insert into public.subscription_adjustments
        (subscription_id, subscription_period_id, kind, code_snapshot, name_snapshot, amount, status)
    values
        (v_invoice.subscription_id, v_invoice.subscription_period_id, 'discount',
         'REFERRAL', 'Referral reward', -v_discount,
         -- 'invoiced', not 'pending': this adjustment is being written
         -- straight onto an ALREADY-issued invoice, the same state
         -- generate_period_invoice() leaves a pending adjustment in the
         -- moment it writes that adjustment's own invoice_items row.
         'invoiced')
    returning id into v_adj_id;

    select coalesce(max(line_number), 0) + 1 into v_next_line
      from public.invoice_items where invoice_id = p_invoice_id;

    insert into public.invoice_items
        (invoice_id, line_number, item_type, subscription_adjustment_id,
         description, quantity, unit_amount, amount)
    values
        (p_invoice_id, v_next_line, 'adjustment', v_adj_id,
         'Referral reward', 1, -v_discount, -v_discount);

    update public.invoices
       set subtotal_amount = subtotal_amount - v_discount,
           total_amount    = total_amount - v_discount,
           updated_at      = now()
     where id = p_invoice_id;

    insert into public.referral_card_redemptions
        (reward_card_id, user_id, invoice_id, subscription_id, subscription_adjustment_id,
         original_amount, discount_amount, final_amount, status)
    values
        (p_card_id, p_user_id, p_invoice_id, v_invoice.subscription_id, v_adj_id,
         -- v_invoice.total_amount here is still the PRE-discount value — the
         -- record variable was never reassigned, only the real table row was
         -- updated above.
         v_invoice.total_amount, v_discount, v_final, 'reserved')
    returning * into v_redemption;

    update public.referral_reward_cards
       set status = 'reserved', updated_at = now()
     where id = p_card_id;

    return v_redemption;
end;
$$;

comment on function public.reserve_referral_card_redemption(uuid, uuid, uuid) is
    'Applies one card''s discount to one unpaid invoice, atomically. Raises card_not_found/card_not_available/card_expired/invoice_not_found/invoice_not_payable/invoice_already_settled on refusal — the service layer maps these to rider-facing messages. service_role only.';

-- -------------------------------------------------------------------------

create or replace function public.confirm_referral_card_redemption(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_redemption public.referral_card_redemptions%rowtype;
begin
    -- The ordinary case (no card was ever applied to this invoice) is not an
    -- error: every settled invoice calls this, most without a reservation.
    select * into v_redemption from public.referral_card_redemptions
     where invoice_id = p_invoice_id and status = 'reserved'
     for update;
    if not found then
        return;
    end if;

    update public.referral_card_redemptions
       set status = 'redeemed', redeemed_at = now(), updated_at = now()
     where id = v_redemption.id;

    update public.referral_reward_cards
       set status = 'redeemed', updated_at = now()
     where id = v_redemption.reward_card_id and status = 'reserved';
end;
$$;

comment on function public.confirm_referral_card_redemption(uuid) is
    'Called once an invoice is fully settled (payments.service.ts, alongside applyRenewalSuccess). No-op when no card was reserved against it. service_role only.';

-- -------------------------------------------------------------------------

create or replace function public.release_referral_card_redemption(p_redemption_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_redemption public.referral_card_redemptions%rowtype;
begin
    select * into v_redemption from public.referral_card_redemptions
     where id = p_redemption_id
     for update;
    if not found then
        raise exception 'redemption_not_found' using errcode = 'P0001';
    end if;
    -- Already settled or already released: idempotent, not an error — a
    -- retried release request (e.g. two abandonment paths both firing) must
    -- not undo money that already moved, or double-release an already-freed
    -- card.
    if v_redemption.status <> 'reserved' then
        return;
    end if;

    -- A full rollback, not a void-trail: nothing was ever paid against this
    -- line, so there is nothing to keep a record of — unlike
    -- abandonedRenewal.ts's invoice-level void, which preserves the invoice
    -- as evidence a bill once existed. The reward itself survives: only the
    -- ATTEMPT to spend it is undone, which is why the card goes back to
    -- 'available' rather than being consumed.
    delete from public.invoice_items
     where subscription_adjustment_id = v_redemption.subscription_adjustment_id;

    update public.invoices
       set subtotal_amount = subtotal_amount + v_redemption.discount_amount,
           total_amount    = total_amount + v_redemption.discount_amount,
           updated_at      = now()
     where id = v_redemption.invoice_id;

    delete from public.subscription_adjustments
     where id = v_redemption.subscription_adjustment_id;

    update public.referral_card_redemptions
       set status = 'released', released_at = now(), release_reason = p_reason, updated_at = now()
     where id = p_redemption_id;

    update public.referral_reward_cards
       set status = 'available', updated_at = now()
     where id = v_redemption.reward_card_id and status = 'reserved';
end;
$$;

comment on function public.release_referral_card_redemption(uuid, text) is
    'Undoes an unpaid reservation — rider-initiated cancel, or the invoice itself being voided out from under it. Idempotent: a non-reserved redemption is a silent no-op. service_role only.';

-- -------------------------------------------------------------------------
-- Same lockdown as every other privileged function in this schema (see
-- revoke_user_sessions, 20261010110000): nothing here is client-callable.
-- -------------------------------------------------------------------------

do $$
declare fn text;
begin
    foreach fn in array array[
        'reserve_referral_card_redemption(uuid, uuid, uuid)',
        'confirm_referral_card_redemption(uuid)',
        'release_referral_card_redemption(uuid, text)'
    ] loop
        execute format('revoke all on function public.%s from public, anon, authenticated', fn);
        execute format('grant execute on function public.%s to service_role', fn);
    end loop;
end $$;
