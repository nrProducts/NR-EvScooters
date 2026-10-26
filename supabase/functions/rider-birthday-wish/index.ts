// =========================================================================
// rider-birthday-wish  —  daily pg_cron job  →  Expo push
//
// Wishes an active rider a happy birthday and reminds them to ride safe, on
// the day (business timezone). Runs once a day at 09:00 IST.
//
// Who gets it:
//   * riders only, account active, not deleted, with a date of birth on file;
//   * not a rider who has switched OFF marketing communications — a greeting
//     is not a service message, so their latest decision is honoured. A rider
//     who never decided counts as ON, same as everywhere else in the app;
//   * at most once per calendar year, so re-running the job (a retry, a
//     manual invoke) never sends a second wish.
//
// A 29 February birthday is wished on 28 February in a year with no 29th.
// =========================================================================

import { adminClient, isConfigured, json, notConfigured } from "../_shared/client.ts";
import { businessToday } from "../_shared/dates.ts";
import { notifyUser } from "../_shared/notify.ts";

const SOURCE = "rider-birthday-wish";

const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function firstName(fullName: string | null): string {
    const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
    return first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
}

Deno.serve(async (_req) => {
    if (!isConfigured()) return notConfigured();
    const admin = adminClient();

    let today: string;
    try {
        today = await businessToday(admin);
    } catch (err) {
        console.error(`[${SOURCE}] could not read business_today()`, err);
        return json({ error: "Could not resolve the business date." }, 500);
    }

    const year = Number(today.slice(0, 4));
    const monthDay = today.slice(5);
    // Which birth dates (month-day) are celebrated today.
    const wanted = new Set([monthDay]);
    if (monthDay === "02-28" && !isLeapYear(year)) wanted.add("02-29");

    const { data: riders, error } = await admin
        .from("users")
        .select("id, full_name, date_of_birth")
        .eq("role", "rider")
        .eq("status", "active")
        .is("deleted_at", null)
        .not("date_of_birth", "is", null);
    if (error) {
        console.error(`[${SOURCE}] query failed`, error);
        return json({ error: "Could not read riders." }, 500);
    }

    const today_ = (riders ?? []).filter((r: { date_of_birth: string }) => wanted.has(r.date_of_birth.slice(5)));
    if (today_.length === 0) return json({ matched: 0, sent: 0, logged: 0, skippedOptedOut: 0, skippedAlready: 0 }, 200);
    const ids = today_.map((r: { id: string }) => r.id);

    // Latest marketing decision per rider (the table is an append-only log).
    const { data: consents } = await admin
        .from("consent_records")
        .select("user_id, action, created_at")
        .eq("purpose", "marketing_communications")
        .in("user_id", ids)
        .order("created_at", { ascending: true });
    const optedOut = new Set<string>();
    for (const c of (consents ?? []) as { user_id: string; action: string }[]) {
        if (c.action === "withdrawn") optedOut.add(c.user_id);
        else optedOut.delete(c.user_id);
    }

    // Already wished this calendar year.
    const { data: already } = await admin
        .from("notification_messages")
        .select("user_id")
        .eq("notification_type_code", "birthday_wish")
        .in("user_id", ids)
        .gte("created_at", `${year}-01-01T00:00:00+05:30`);
    const alreadyWished = new Set((already ?? []).map((a: { user_id: string }) => a.user_id));

    let logged = 0;
    let sent = 0;
    let skippedOptedOut = 0;
    let skippedAlready = 0;

    for (const rider of today_ as { id: string; full_name: string | null }[]) {
        if (optedOut.has(rider.id)) { skippedOptedOut++; continue; }
        if (alreadyWished.has(rider.id)) { skippedAlready++; continue; }

        const name = firstName(rider.full_name);
        const result = await notifyUser(admin, rider.id, {
            typeCode: "birthday_wish",
            subjectType: "user",
            subjectId: rider.id,
            title: name ? `Happy Birthday, ${name}! 🎉` : "Happy Birthday! 🎉",
            body: "Wishing you a wonderful year ahead from all of us at Swapngo. Ride safe, wear your helmet and enjoy every ride!",
            screen: "home",
            payload: { year },
        });
        if (result.logged) logged++;
        if (result.sent) sent++;
    }

    return json({ matched: today_.length, logged, sent, skippedOptedOut, skippedAlready }, 200);
});
