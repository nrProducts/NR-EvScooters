-- =============================================================================
-- Revert a subscription_periods.subscription_id that was edited by mistake.
--   Period: b6a68bd3-4679-47a7-96d2-1f1f31d75930
--
-- Postgres keeps no old value for an UPDATE, so the original subscription is
-- recovered from rows that recorded it alongside this period:
--   invoices.subscription_id / subscription_adjustments.subscription_id.
--
-- Run STEP 1 first (read-only). Only run STEP 2 after it gives a clear answer.
-- Must run before the next payment-overdue-sweep (03:10 UTC = 08:40 IST),
-- which promotes 'scheduled' periods and moves the rental's due_back_at.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- STEP 1 — DIAGNOSE (read-only, safe to run any time)
-- ---------------------------------------------------------------------------

-- 1a. The edited row as it is now.
select id, subscription_id, sequence_number, starts_on, ends_on, due_on,
       status, base_amount_snapshot, created_at, updated_at
  from public.subscription_periods
 where id = 'b6a68bd3-4679-47a7-96d2-1f1f31d75930';

-- 1b. EVIDENCE — which subscription the linked invoices / adjustments belong to.
--     The subscription_id here is the original value.
select 'invoice' as source, i.id, i.subscription_id, i.status::text, i.created_at
  from public.invoices i
 where i.subscription_period_id = 'b6a68bd3-4679-47a7-96d2-1f1f31d75930'
union all
select 'adjustment', a.id, a.subscription_id, a.status::text, a.created_at
  from public.subscription_adjustments a
 where a.subscription_period_id = 'b6a68bd3-4679-47a7-96d2-1f1f31d75930';

-- 1c. All periods of the subscription the row points to NOW. If it shows two
--     periods that overlap or look wrong, the current value is the bad one.
select p.id, p.sequence_number, p.starts_on, p.ends_on, p.status
  from public.subscription_periods p
 where p.subscription_id = (select subscription_id from public.subscription_periods
                             where id = 'b6a68bd3-4679-47a7-96d2-1f1f31d75930')
 order by p.sequence_number;

-- 1d. Cross-check: subscriptions with no 'scheduled' period that the evidence
--     subscription should have. Replace <ORIGINAL_SUB_ID> with the value from 1b.
-- select p.id, p.sequence_number, p.starts_on, p.ends_on, p.status
--   from public.subscription_periods p
--  where p.subscription_id = '<ORIGINAL_SUB_ID>'
--  order by p.sequence_number;


-- ---------------------------------------------------------------------------
-- STEP 2 — FIX (one transaction; aborts itself if anything looks wrong)
--   Replace <ORIGINAL_SUB_ID> with the subscription_id from step 1b.
-- ---------------------------------------------------------------------------
begin;

do $$
declare
    v_period_id uuid := 'b6a68bd3-4679-47a7-96d2-1f1f31d75930';
    v_original  uuid := '<ORIGINAL_SUB_ID>';
    v_row       public.subscription_periods;
    v_rows      int;
begin
    select * into v_row from public.subscription_periods where id = v_period_id for update;
    if not found then
        raise exception 'Period % not found', v_period_id;
    end if;

    if not exists (select 1 from public.subscriptions where id = v_original) then
        raise exception 'Subscription % does not exist', v_original;
    end if;

    -- The evidence must agree: every linked invoice/adjustment points at v_original.
    if exists (select 1 from public.invoices
                where subscription_period_id = v_period_id and subscription_id <> v_original)
       or exists (select 1 from public.subscription_adjustments
                   where subscription_period_id = v_period_id and subscription_id <> v_original) then
        raise exception 'Linked invoices/adjustments disagree with %; not touching anything', v_original;
    end if;

    -- unique (subscription_id, sequence_number) would reject a duplicate anyway,
    -- but say why clearly.
    if exists (select 1 from public.subscription_periods
                where subscription_id = v_original
                  and sequence_number = v_row.sequence_number
                  and id <> v_period_id) then
        raise exception 'Subscription % already has sequence_number %', v_original, v_row.sequence_number;
    end if;

    update public.subscription_periods
       set subscription_id = v_original,
           updated_at      = now()
     where id = v_period_id;
    get diagnostics v_rows = row_count;

    if v_rows <> 1 then
        raise exception 'Expected 1 row updated, got %', v_rows;
    end if;

    raise notice 'Period % moved back from % to %', v_period_id, v_row.subscription_id, v_original;
end $$;

-- Any exception above aborts the whole transaction, so nothing is written
-- unless every guard passed.
commit;

-- STEP 3 — VERIFY (re-run 1a and 1b; subscription_id must now match 1b).
select id, subscription_id, sequence_number, starts_on, ends_on, status, updated_at
  from public.subscription_periods
 where id = 'b6a68bd3-4679-47a7-96d2-1f1f31d75930';
