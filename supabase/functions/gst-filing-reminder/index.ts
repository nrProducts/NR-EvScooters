// =========================================================================
// gst-filing-reminder  —  daily pg_cron job, 09:00 IST
//
// For last month's GST returns (Swapngo files monthly):
//   • the 5th  — the pack goes to the accountant by the 8th
//   • the 8th  — GSTR-1 is due on the 11th
//   • the 11th — GSTR-1 due today
//   • the 17th — GSTR-3B is due on the 20th
//   • the 20th — GSTR-3B due today (late fee and interest start tomorrow)
// Each fires only while that return is not marked filed in
// finance_periods. Staff receive it through the gst_return_due
// notification type, so who gets it is set in Notification Manager.
// =========================================================================

import { adminClient, isConfigured, json, notConfigured } from "../_shared/client.ts";
import { businessToday } from "../_shared/dates.ts";
import { notifyStaff } from "../_shared/notifyStaff.ts";

const SOURCE = "gst-filing-reminder";

Deno.serve(async (_req) => {
    if (!isConfigured()) return notConfigured();
    const admin = adminClient();
    const today = await businessToday(admin);
    const day = Number(today.slice(8, 10));

    const [y, m] = today.slice(0, 7).split("-").map(Number);
    const prevY = m === 1 ? y - 1 : y;
    const prevM = m === 1 ? 12 : m - 1;
    const period = `${prevY}-${String(prevM).padStart(2, "0")}-01`;
    const label = new Date(`${period}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

    const { data: row, error } = await admin
        .from("finance_periods")
        .select("gstr1_status, gstr3b_status")
        .eq("period", period)
        .maybeSingle();
    if (error) {
        console.error(`[${SOURCE}] read failed`, error);
        return json({ error: "Query failed." }, 500);
    }
    const gstr1 = (row?.gstr1_status as string | undefined) ?? "not_started";
    const gstr3b = (row?.gstr3b_status as string | undefined) ?? "not_started";

    const due: { title: string; body: string } | null =
        day === 5 && gstr1 !== "sent" && gstr1 !== "filed"
            ? { title: `${label} GST pack due to the accountant`, body: `Send the ${label} GST pack by the 8th so GSTR-1 can be filed by the 11th.` }
            : day === 8 && gstr1 !== "filed"
                ? { title: `GSTR-1 for ${label} due on the 11th`, body: `GSTR-1 for ${label} is due in 3 days and is not marked filed.` }
                : day === 11 && gstr1 !== "filed"
                    ? { title: `GSTR-1 for ${label} due today`, body: `GSTR-1 for ${label} is due today. Late fee starts tomorrow.` }
                    : day === 17 && gstr3b !== "filed"
                        ? { title: `GSTR-3B for ${label} due on the 20th`, body: `GSTR-3B for ${label} is due in 3 days. Pay the tax and file by the 20th.` }
                        : day === 20 && gstr3b !== "filed"
                            ? { title: `GSTR-3B for ${label} due today`, body: `GSTR-3B for ${label} is due today. From tomorrow interest is 18% a year and the late fee is ₹50 a day.` }
                            : null;

    if (!due) return json({ today, period, sent: false }, 200);

    const { notified } = await notifyStaff(admin, {
        typeCode: "gst_return_due",
        subjectType: "finance_period",
        subjectId: period,
        title: due.title,
        body: due.body,
        screen: "/gst-returns",
        payload: { period, gstr1, gstr3b },
    });
    console.log(`[${SOURCE}]`, { period, title: due.title, notified });
    return json({ today, period, sent: true, notified }, 200);
});
