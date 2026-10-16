-- =========================================================================
-- Deploy the noon-to-noon rental period math that never actually shipped.
--
-- THE SPLIT THIS CLOSES
--
-- The app says a rental runs 12:00 PM to 12:00 PM: calculateRentalPeriod in
-- apps/mobile computes start + N, the Confirm & Pay screen prints both ends
-- as 12:00 PM, and payments.service.ts's TypeScript period insert agrees.
--
-- The DATABASE never did. `create_booking_from_order` and
-- `quote_plan_first_period` still compute start + (N - 1), the older
-- inclusive-day convention. 20260918100000_fixed_noon_rental_cycle.sql
-- contains the corrected functions but was never deployed, and
-- 20260929100000_deposit_refundable_toggle.sql then re-stated the OLD math
-- deliberately — its header says so, and says the noon change still needs
-- deposit_refundable carried forward "if/when" it ships. This is that.
--
-- WHAT IT BROKE
--
-- For a ONE-day plan, start + (N - 1) is start + 0: a period that ends the
-- day it begins and is therefore due the moment it exists. The first rider
-- on the ₹1 daily plan was told "Oct 10 12:00 PM to Oct 11 12:00 PM", given
-- a period of Oct 10 to Oct 10, and charged a late fee the same afternoon.
-- Longer plans were merely a day short, which is why this went unnoticed.
--
-- WHY IT PATCHES RATHER THAN RE-DECLARES
--
-- Both functions are large and neither is changing in any other respect.
-- Re-typing ~6KB of plpgsql to alter one expression invites exactly the
-- transcription error that has no business near billing code, and would also
-- risk dropping the deposit_refundable work the 29th's migration added.
-- So each definition is read back with pg_get_functiondef, has ONLY its
-- duration expression rewritten, and is re-executed.
--
-- The parenthesised sub-expression is the replacement target — not the whole
-- assignment line — so indentation differences cannot cause a silent miss.
-- A replacement that changes nothing RAISES: this migration must never
-- report success while leaving the old math in place.
--
-- BEHAVIOUR CHANGE, STATED PLAINLY: every plan gains a day relative to what
-- the database did before. A 7-day plan now runs start+7, not start+6. That
-- is the product's stated 12-to-12 cycle, and what riders were already being
-- shown at checkout.
-- =========================================================================

do $$
declare
    v_def text;
    v_new text;
begin
    -- --- create_booking_from_order ---------------------------------------
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'create_booking_from_order';

    if v_def is null then
        raise exception 'create_booking_from_order not found';
    end if;

    v_new := replace(v_def, '(v_duration - 1)', 'v_duration');
    if v_new = v_def then
        raise exception
            'create_booking_from_order: inclusive-day expression "(v_duration - 1)" not found — refusing to proceed';
    end if;

    -- Cosmetic, and allowed to miss: the comment above the expression still
    -- describes the old convention.
    v_new := replace(
        v_new,
        'day, so an N-day plan runs through start + (N - 1).',
        'day at 12:00 PM, so an N-day plan runs through start + N (12:00 PM).'
    );

    execute v_new;

    -- --- quote_plan_first_period ------------------------------------------
    -- The checkout quote. Left on the old math it would price a period of a
    -- different length from the one the booking actually creates.
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'quote_plan_first_period';

    if v_def is null then
        raise exception 'quote_plan_first_period not found';
    end if;

    v_new := replace(v_def, '(v_plan.duration_days - 1)', 'v_plan.duration_days');
    if v_new = v_def then
        raise exception
            'quote_plan_first_period: inclusive-day expression "(v_plan.duration_days - 1)" not found — refusing to proceed';
    end if;

    v_new := replace(
        v_new,
        'Mirrors ensureSubscription: a period runs duration_days INCLUSIVE.',
        'Mirrors ensureSubscription: a period runs duration_days, 12:00 PM to 12:00 PM.'
    );

    execute v_new;
end $$;

-- --- prove it took --------------------------------------------------------
-- A migration that silently half-applied is worse than one that failed.

do $$
declare
    v_stale integer;
begin
    select count(*) into v_stale
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('create_booking_from_order', 'quote_plan_first_period')
       and (pg_get_functiondef(p.oid) like '%(v_duration - 1)%'
         or pg_get_functiondef(p.oid) like '%(v_plan.duration_days - 1)%');

    if v_stale > 0 then
        raise exception 'noon-to-noon deploy incomplete: % function(s) still carry inclusive-day math', v_stale;
    end if;
end $$;
