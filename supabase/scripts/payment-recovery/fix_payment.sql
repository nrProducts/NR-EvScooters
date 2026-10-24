-- =========================================================================
-- fix_payment.sql   (WRITES — production fix for ONE captured payment)
--
-- Applies a payment Razorpay captured but our DB never recorded, by doing in
-- SQL exactly what payments.service.ts applyPaymentSuccess() does:
--
--   1. payment_transactions   insert succeeded row (skipped if pay_id present)
--   2. payment_orders         status -> 'paid'
--   3a. purpose='booking'     create_booking_from_order() (booking confirmed,
--                             subscription active, period 1, deposit held,
--                             vehicle held) + generate_period_invoice() +
--                             onboarding/deposit lines — same calls as the app
--   3b. purpose='invoice'     uses the order's invoice
--   3c. late renewal          late-fee adjustment + invoice line, using the
--                             fee the app quoted on this order (recordLateFeeCharge)
--   4. payment_allocations    allocate min(captured, balance) to the invoice
--   5. invoice path, settled: period 1 -> booking confirmed, subscription
--                             active, deposit held. Renewal (period > 1) ->
--                             nothing; hourly payment-overdue-sweep promotes it.
--   6. audit_logs             same actions the app writes, via=manual_sql_fix
--
-- Every step checks before it writes, so re-running it — or the webhook /
-- app arriving afterwards — is a no-op, not a double-apply. The whole block
-- is ONE transaction: any error rolls back everything.
--
-- payment_transactions and payment_allocations are APPEND-ONLY (trigger) and
-- allocations have no unique index. A wrong row cannot be deleted later.
-- That is why this defaults to a dry run and refuses anything unusual.
--
-- HOW TO RUN
--   0. Run verify_payment.sql for the order. Only continue if ISSUE starts "FIX".
--   1. In the Razorpay dashboard open the payment and confirm:
--        status = Captured, Order Id = p_gateway_order_id, amount = order amount.
--   2. Paste the FIX_PARAMS values from verify_payment.sql into the block below. Leave p_dry_run := true.
--   3. Run. You should get an ERROR starting "DRY RUN OK" listing what it
--      WOULD do. That error is the success signal — nothing was saved.
--      Any other error = stop, don't force it.
--   4. Set p_dry_run := false and run again.
--   5. Re-run verify_payment.sql — ISSUE should say "OK" and every CHECK row PASS (or N/A).
--
-- NOT DONE HERE (app-only side effects, harmless to skip):
--   rider push / admin notifications, referral qualification on first
--   booking (qualifyReferralIfApplicable).
-- =========================================================================

do $$
declare
    -- ============================ EDIT THESE ============================
    p_gateway_order_id   text        := 'order_REPLACE_ME';
    p_gateway_payment_id text        := 'pay_REPLACE_ME';
    p_amount             numeric     := 0;       -- rupees, exactly as Razorpay shows (e.g. 2.00)
    p_method             text        := 'upi';   -- upi | card | netbanking | wallet (from Razorpay)
    p_captured_at        timestamptz := now();   -- optional: Razorpay "Created On" time
    -- Captured > invoice balance AFTER the late fee is recorded — e.g. the
    -- invoice was already paid another way. false = refuse (recommended).
    -- true = allocate the balance and log the surplus for Reconciliation.
    p_allow_surplus      boolean     := false;
    -- LATE UPI SUCCESS: the same pay_id first FAILED (app stored a 'failed'
    -- row) and then CAPTURED. The app's success insert hit the unique pay_id
    -- and silently did nothing. true = upgrade that one failed row to
    -- succeeded (append-only trigger lifted for this one UPDATE, inside this
    -- transaction). Only set when verify_payment.sql says LATE UPI SUCCESS and Razorpay shows Captured.
    p_upgrade_failed_txn boolean     := false;
    p_dry_run            boolean     := true;    -- true = check everything, save nothing
    -- ====================================================================

    v_order            public.payment_orders%rowtype;
    v_inv              public.invoices%rowtype;
    v_method           public.payment_method;
    v_txn_id           uuid;
    v_txn_status       public.payment_status;
    v_invoice_id       uuid;
    v_balance          numeric;
    v_allocated        numeric;
    v_settled          boolean;
    v_seq              integer;
    v_booking_id       uuid;
    v_sub_id           uuid;
    v_period_id        uuid;
    v_unfulfillable    text;
    v_onboarding       numeric;
    v_deposit          numeric;
    v_line             integer;
    v_fee              numeric;
    v_days             integer;
    v_adj_id           uuid;
    v_rule             record;
    r                  record;
    v_log              text := '';
begin
    -- ---------- input sanity ----------
    if p_gateway_order_id like '%REPLACE_ME%' or p_gateway_payment_id like '%REPLACE_ME%' then
        raise exception 'Set p_gateway_order_id and p_gateway_payment_id first.';
    end if;
    if p_gateway_order_id not like 'order\_%' or p_gateway_payment_id not like 'pay\_%' then
        raise exception 'Ids look wrong: order id must start order_, payment id must start pay_.';
    end if;
    if p_amount <= 0 then
        raise exception 'Set p_amount to the captured amount in rupees.';
    end if;
    v_method := case when p_method in ('upi', 'card', 'netbanking', 'wallet')
                     then p_method::public.payment_method end;

    -- ---------- the order (locked: blocks a concurrent webhook until we finish) ----------
    select * into v_order from public.payment_orders
     where gateway_order_id = p_gateway_order_id for update;
    if not found then
        raise exception 'Order % not found. Wrong id or wrong project (prod = bltquxpuoptjmifewskz).', p_gateway_order_id;
    end if;
    v_log := v_log || format(E'\n  order %s  purpose=%s  status=%s  amount=%s', v_order.id, v_order.purpose, v_order.status, v_order.amount);

    if p_amount <> v_order.amount then
        raise exception 'Captured amount % <> order amount %. The app rejects this too — not a stuck payment, investigate.', p_amount, v_order.amount;
    end if;
    if exists (select 1 from public.payment_transactions
                where gateway_payment_id = p_gateway_payment_id and payment_order_id <> v_order.id) then
        raise exception 'Payment % is already recorded against a DIFFERENT order. Stop.', p_gateway_payment_id;
    end if;
    if exists (select 1 from public.payment_transactions
                where payment_order_id = v_order.id and status = 'succeeded'
                  and gateway_payment_id <> p_gateway_payment_id) then
        raise exception 'Order already has a different captured payment — rider paid twice. Refund case, do not apply.';
    end if;

    -- ---------- 1. transaction ----------
    select id, status into v_txn_id, v_txn_status
      from public.payment_transactions where gateway_payment_id = p_gateway_payment_id;
    if v_txn_id is null then
        insert into public.payment_transactions
            (payment_order_id, gateway_payment_id, gateway_signature, status, amount, method, captured_at, raw_payload)
        values
            (v_order.id, p_gateway_payment_id, null, 'succeeded', p_amount, v_method, p_captured_at,
             jsonb_build_object('source', 'manual_sql_fix', 'order_id', p_gateway_order_id,
                                'id', p_gateway_payment_id, 'amount_rupees', p_amount, 'method', p_method))
        returning id into v_txn_id;
        v_log := v_log || E'\n+ payment_transactions inserted ' || v_txn_id;
    elsif v_txn_status = 'failed' and p_upgrade_failed_txn then
        insert into public.audit_logs (actor_user_id, target_user_id, action, entity_type, entity_id, before_data, after_data)
        select null, v_order.user_id, 'payment.failed_txn_upgraded', 'payment_transaction', t.id::text,
               jsonb_build_object('status', t.status, 'failure_code', t.failure_code,
                                  'failure_reason', t.failure_reason, 'created_at', t.created_at),
               jsonb_build_object('status', 'succeeded', 'amount', p_amount, 'via', 'manual_sql_fix',
                                  'reason', 'late UPI success: same pay_id failed then captured')
          from public.payment_transactions t where t.id = v_txn_id;

        -- Lifted for this single UPDATE only; DDL is transactional, so any
        -- later error (or the dry run) restores it with everything else.
        alter table public.payment_transactions disable trigger trg_payment_transactions_append_only;
        update public.payment_transactions
           set status         = 'succeeded',
               amount         = p_amount,
               method         = coalesce(v_method, method),
               captured_at    = p_captured_at,
               failure_code   = null,
               failure_reason = null,
               raw_payload    = jsonb_build_object('source', 'manual_sql_fix', 'previous_failed_payload', raw_payload)
         where id = v_txn_id and status = 'failed';
        alter table public.payment_transactions enable trigger trg_payment_transactions_append_only;
        v_log := v_log || E'\n+ payment_transactions failed -> succeeded (late UPI success) ' || v_txn_id;
    elsif v_txn_status <> 'succeeded' then
        raise exception 'Payment % is recorded as % (append-only). If Razorpay shows it Captured, this is a late UPI success: rerun with p_upgrade_failed_txn := true.', p_gateway_payment_id, v_txn_status;
    else
        v_log := v_log || E'\n= payment_transactions already present ' || v_txn_id;
    end if;

    -- ---------- 2. order -> paid ----------
    if v_order.status <> 'paid' then
        update public.payment_orders set status = 'paid' where id = v_order.id;
        v_log := v_log || format(E'\n+ payment_orders %s -> paid', v_order.status);
    end if;

    -- ---------- 3a. pay-first booking ----------
    if v_order.purpose = 'booking' then
        if exists (select 1 from public.audit_logs
                    where action = 'payment.booking_unfulfillable' and entity_id = v_txn_id::text) then
            v_unfulfillable := 'already flagged earlier';
        else
            select id into v_booking_id from public.bookings where created_from_order_id = v_order.id;
            if v_booking_id is null then
                begin
                    v_booking_id := public.create_booking_from_order(v_order.id);
                    v_log := v_log || E'\n+ booking created (confirmed, sub active, deposit held, vehicle held) ' || v_booking_id;

                    insert into public.audit_logs (actor_user_id, target_user_id, action, entity_type, entity_id, after_data) values
                        (null, v_order.user_id, 'booking.created', 'booking', v_booking_id::text,
                         jsonb_build_object('status', 'confirmed', 'via', 'manual_sql_fix', 'order_id', v_order.id)),
                        (null, v_order.user_id, 'booking.payment_completed', 'booking', v_booking_id::text,
                         jsonb_build_object('status', 'confirmed', 'via', 'manual_sql_fix'));
                exception when raise_exception then
                    -- Same two outcomes the app routes to a manual refund.
                    if sqlerrm in ('active_booking_exists', 'vehicle_not_available') then
                        v_unfulfillable := sqlerrm;
                    else
                        raise;
                    end if;
                end;
            else
                v_log := v_log || E'\n= booking already exists ' || v_booking_id;
            end if;
        end if;

        if v_unfulfillable is not null then
            if v_unfulfillable <> 'already flagged earlier' then
                insert into public.audit_logs (actor_user_id, target_user_id, action, entity_type, entity_id, after_data)
                values (null, v_order.user_id, 'payment.booking_unfulfillable', 'payment_transaction', v_txn_id::text,
                        jsonb_build_object('order_id', v_order.id, 'captured', p_amount, 'reason', v_unfulfillable, 'via', 'manual_sql_fix'));
            end if;
            v_log := v_log || E'\n!!! NO BOOKING POSSIBLE (' || v_unfulfillable || E') — money recorded, REFUND THE RIDER MANUALLY in Razorpay.';
        else
            select id into v_sub_id from public.subscriptions where booking_id = v_booking_id;
            if v_sub_id is null then raise exception 'Booking % has no subscription.', v_booking_id; end if;

            select subscription_period_id into v_period_id
              from public.v_subscription_current_period where subscription_id = v_sub_id;
            if v_period_id is null then raise exception 'Subscription % has no current period.', v_sub_id; end if;

            v_invoice_id := public.generate_period_invoice(v_period_id);   -- idempotent per period

            select onboarding_charge_snapshot into v_onboarding from public.bookings where id = v_booking_id;
            select amount into v_deposit from public.deposits where subscription_id = v_sub_id;
            if v_deposit is null then raise exception 'Subscription % has no deposit row.', v_sub_id; end if;

            -- Same lines, wording and idempotency as ensureInitialInvoice/appendFirstPeriodCharge.
            for r in
                select * from (values
                    ('onboarding_charge', 'One-time onboarding charge (non-refundable)', coalesce(v_onboarding, 0)),
                    ('deposit',           'Refundable security deposit',                 v_deposit)
                ) x(item_type, description, amount)
            loop
                if r.amount > 0 and not exists (
                    select 1 from public.invoice_items
                     where invoice_id = v_invoice_id and item_type = r.item_type::public.invoice_item_type
                ) then
                    select coalesce(max(line_number), 0) + 1 into v_line
                      from public.invoice_items where invoice_id = v_invoice_id;
                    insert into public.invoice_items
                        (invoice_id, item_type, description, line_number, quantity, unit_amount, amount)
                    values (v_invoice_id, r.item_type::public.invoice_item_type, r.description, v_line, 1, r.amount, r.amount);
                    update public.invoices
                       set subtotal_amount = subtotal_amount + r.amount,
                           total_amount    = total_amount + r.amount
                     where id = v_invoice_id;
                    v_log := v_log || format(E'\n+ invoice line %s %s', r.item_type, r.amount);
                end if;
            end loop;

            if not exists (select 1 from public.audit_logs
                            where action = 'deposit.held' and entity_id = v_sub_id::text) then
                insert into public.audit_logs (actor_user_id, target_user_id, action, entity_type, entity_id, after_data)
                values (null, v_order.user_id, 'deposit.held', 'deposit', v_sub_id::text,
                        jsonb_build_object('status', 'held', 'via', 'manual_sql_fix'));
            end if;
        end if;

    -- ---------- 3b. invoice-tied ----------
    else
        v_invoice_id := v_order.invoice_id;
        select * into v_inv from public.invoices where id = v_invoice_id for update;
        if v_inv.status = 'void' then
            raise exception 'Invoice % is void — refund/goodwill decision, not this script.', v_invoice_id;
        end if;

        -- ---------- 3c. late fee (recordLateFeeCharge) ----------
        -- A late renewal's order is sized balance + late fee, and the fee
        -- only goes on the bill at capture. Uses the fee the app quoted when
        -- it created this order (payment.order_created audit), capped at what
        -- actually arrived above the balance — same cap as the app.
        select balance_amount into v_balance from public.v_invoice_balances where invoice_id = v_invoice_id;
        if p_amount > v_balance and v_inv.purpose = 'subscription_period'
           and v_inv.subscription_period_id is not null
           and not exists (select 1 from public.payment_allocations
                            where payment_transaction_id = v_txn_id and invoice_id = v_invoice_id) then
            select (a.after_data ->> 'late_fee')::numeric into v_fee
              from public.audit_logs a
             where a.action = 'payment.order_created' and a.entity_id = v_order.id::text
             order by a.created_at desc limit 1;
            v_fee := round(least(coalesce(v_fee, 0), p_amount - v_balance), 2);

            if v_fee > 0 then
                -- lateFeeRuleFor: per-subscription override first, else global.
                select id, code, name, amount into v_rule from public.pricing_rules
                 where code = 'late_fee_' || replace(v_inv.subscription_id::text, '-', '_') and is_active;
                if v_rule.id is null then
                    select id, code, name, amount into v_rule from public.pricing_rules
                     where code = 'late_fee' and scope = 'global' and is_active;
                end if;

                if v_rule.id is null then
                    v_log := v_log || E'\n! no active late_fee rule — fee not recorded (falls to surplus check)';
                elsif exists (select 1 from public.subscription_adjustments
                               where subscription_period_id = v_inv.subscription_period_id
                                 and pricing_rule_id = v_rule.id and status <> 'voided') then
                    v_log := v_log || E'\n= late fee already on this period';
                else
                    insert into public.subscription_adjustments
                        (subscription_id, subscription_period_id, pricing_rule_id, kind,
                         code_snapshot, name_snapshot, amount, status)
                    values (v_inv.subscription_id, v_inv.subscription_period_id, v_rule.id, 'charge',
                            v_rule.code, v_rule.name, v_fee, 'invoiced')
                    returning id into v_adj_id;

                    v_days := greatest(1, round(v_fee / nullif(v_rule.amount, 0))::integer);
                    select coalesce(max(line_number), 0) + 1 into v_line
                      from public.invoice_items where invoice_id = v_invoice_id;
                    insert into public.invoice_items
                        (invoice_id, line_number, item_type, subscription_adjustment_id,
                         description, quantity, unit_amount, amount)
                    values (v_invoice_id, v_line, 'adjustment', v_adj_id,
                            format('%s — %s day%s × ₹%s', v_rule.name, v_days,
                                   case when v_days = 1 then '' else 's' end, v_rule.amount),
                            1, v_fee, v_fee);
                    update public.invoices
                       set subtotal_amount = subtotal_amount + v_fee,
                           total_amount    = total_amount + v_fee
                     where id = v_invoice_id;

                    insert into public.audit_logs (actor_user_id, target_user_id, action, entity_type, entity_id, after_data)
                    values (null, null, 'invoice.late_fee_charged', 'invoice', v_invoice_id::text,
                            jsonb_build_object('amount', v_fee, 'days_late', v_days, 'fee_per_day', v_rule.amount,
                                               'pricing_rule_code', v_rule.code,
                                               'subscription_adjustment_id', v_adj_id, 'via', 'manual_sql_fix'));
                    v_log := v_log || E'\n+ late fee recorded on invoice ' || v_fee;
                end if;
            end if;
        end if;
    end if;

    -- ---------- 4. allocation ----------
    if v_invoice_id is not null then
        select balance_amount into v_balance from public.v_invoice_balances where invoice_id = v_invoice_id;
        v_log := v_log || format(E'\n  invoice %s  balance before=%s', v_invoice_id, v_balance);

        if exists (select 1 from public.payment_allocations
                    where payment_transaction_id = v_txn_id and invoice_id = v_invoice_id) then
            v_log := v_log || E'\n= allocation already present';
        else
            if p_amount > v_balance and not p_allow_surplus then
                raise exception 'Captured % exceeds invoice balance % even after any late fee (surplus %). Invoice may already be paid another way — check verify_payment.sql. If the money must still be recorded, rerun with p_allow_surplus := true (balance allocated, surplus logged for Reconciliation).',
                    p_amount, v_balance, p_amount - v_balance;
            end if;
            v_allocated := round(least(p_amount, v_balance), 2);
            if v_allocated > 0 then
                insert into public.payment_allocations (payment_transaction_id, invoice_id, amount)
                values (v_txn_id, v_invoice_id, v_allocated);
                v_log := v_log || E'\n+ payment_allocations ' || v_allocated;
            end if;
            if v_allocated < p_amount then
                insert into public.audit_logs (actor_user_id, target_user_id, action, entity_type, entity_id, after_data)
                values (null, v_order.user_id, 'payment.unallocated_surplus', 'payment_transaction', v_txn_id::text,
                        jsonb_build_object('invoice_id', v_invoice_id, 'captured', p_amount, 'allocated', v_allocated,
                                           'surplus', p_amount - v_allocated, 'via', 'manual_sql_fix'));
                v_log := v_log || E'\n! surplus ' || (p_amount - v_allocated) || ' logged for Reconciliation';
            end if;
        end if;

        select is_paid into v_settled from public.v_invoice_balances where invoice_id = v_invoice_id;
        v_log := v_log || E'\n  invoice is_paid=' || v_settled;
        if v_settled then
            perform public.confirm_referral_card_redemption(v_invoice_id);
        end if;
    end if;

    -- ---------- 5. invoice-tied state advance ----------
    if v_order.purpose = 'invoice' then
        select sequence_number into v_seq from public.subscription_periods where id = v_inv.subscription_period_id;

        if not v_settled then
            insert into public.audit_logs (actor_user_id, target_user_id, action, entity_type, entity_id, after_data)
            values (null, v_order.user_id, 'payment.partial', 'invoice', v_invoice_id::text,
                    jsonb_build_object('allocated', v_allocated, 'note', 'invoice still has a balance; no state advanced', 'via', 'manual_sql_fix'));
            v_log := v_log || E'\n! invoice still has a balance — no state advanced (same as app)';

        elsif v_inv.purpose = 'initial' or v_seq = 1 then
            update public.bookings b set status = 'confirmed'
              from public.subscriptions s
             where s.id = v_inv.subscription_id and b.id = s.booking_id and b.status = 'pending_payment'
            returning b.id into v_booking_id;

            if v_booking_id is not null then
                update public.subscriptions set status = 'active'
                 where id = v_inv.subscription_id and status = 'pending_payment';
                update public.deposits set status = 'held', held_at = now()
                 where subscription_id = v_inv.subscription_id and status = 'pending';
                insert into public.audit_logs (actor_user_id, target_user_id, action, entity_type, entity_id, after_data) values
                    (null, v_order.user_id, 'booking.payment_completed', 'booking', v_booking_id::text,
                     jsonb_build_object('status', 'confirmed', 'via', 'manual_sql_fix')),
                    (null, v_order.user_id, 'deposit.held', 'deposit', v_inv.subscription_id::text,
                     jsonb_build_object('status', 'held', 'via', 'manual_sql_fix'));
                v_log := v_log || E'\n+ booking confirmed, subscription active, deposit held ' || v_booking_id;
            else
                v_log := v_log || E'\n= booking already confirmed';
            end if;

        elsif v_seq > 1 then
            v_log := v_log || E'\n  renewal (period ' || v_seq || E') — left scheduled; hourly payment-overdue-sweep promotes it once the current period ends (same as app when paid ahead).';
        else
            v_log := v_log || E'\n  ' || v_inv.purpose || ' invoice — allocation is the whole effect (same as app).';
        end if;
    end if;

    -- ---------- 6. audit ----------
    insert into public.audit_logs (actor_user_id, target_user_id, action, entity_type, entity_id, after_data)
    values (null, v_order.user_id, 'payment.verified', 'payment_order', v_order.id::text,
            jsonb_build_object('gateway_payment_id', p_gateway_payment_id, 'method', p_method,
                               'amount', p_amount, 'via', 'manual_sql_fix'));

    if p_dry_run then
        raise exception E'DRY RUN OK — rolled back, nothing saved. Would do:%\nSet p_dry_run := false to apply.', v_log;
    end if;
    raise notice E'APPLIED:%', v_log;
end $$;
