-- =========================================================================
-- Referral rewards, part 2: the notification type the service writes, and
-- the one-off code backfill for riders who existed before referral_code did.
-- =========================================================================

-- --- notification type -----------------------------------------------------
-- notifyUser() inserts notification_messages.notification_type_code against
-- a FOREIGN KEY on notification_types(code) — without this row, every
-- referral_reward_issued notification fails that constraint and the reward
-- card would be issued silently with no notification, the exact class of bug
-- documented at the top of notifications.service.ts (finding C5: a
-- notification_type that doesn't exist is dropped with no error, not a
-- foreign-key violation a developer would notice).

insert into public.notification_types
    (code, label, default_audience, requires_action, action_path, send_push, send_email)
values
    ('referral_reward_issued', 'Referral reward issued', 'rider', false, null, true, true)
on conflict (code) do nothing;

-- --- backfill existing riders' referral codes ------------------------------
-- New riders going forward get a code lazily, the first time
-- getOrCreateReferralCode() runs (profile open, or applying someone else's
-- code). Riders who already existed when this migration runs would
-- otherwise have a referral code only once they happen to trigger that path
-- — this gives every rider one now, so an existing rider can share theirs
-- immediately rather than needing to open a screen first.
--
-- Pure SQL, not a reusable function: this is a one-time data fix, not
-- something anything else in the system needs to call again. The service's
-- own assignReferralCode() is the permanent, collision-safe generator for
-- everyone created after this runs.

do $$
declare
    v_user record;
    v_code text;
    v_alphabet text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
    v_attempt int;
    v_assigned boolean;
begin
    for v_user in
        select id from public.users
         where role = 'rider' and referral_code is null
         order by created_at
    loop
        v_assigned := false;
        for v_attempt in 1..8 loop
            v_code := '';
            for i in 1..6 loop
                v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
            end loop;

            begin
                update public.users set referral_code = v_code where id = v_user.id;
                v_assigned := true;
                exit;
            exception when unique_violation then
                -- Collided with another rider's code (including one just
                -- assigned earlier in this same loop) — try a new one.
                continue;
            end;
        end loop;

        if not v_assigned then
            raise exception 'Could not assign a referral code to user % after 8 attempts', v_user.id;
        end if;
    end loop;
end $$;
