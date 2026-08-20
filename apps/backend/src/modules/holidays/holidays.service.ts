import { supabaseAdmin } from "../../config/supabase";
import { conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { businessToday } from "../../common/dates";
import { AuthContext, Paginated } from "../../types";
import { CreateHolidayInput, Holiday, ListHolidayFilters, UpdateHolidayInput } from "./holidays.types";

const HOLIDAY_SELECT = "id, name, holiday_date, description, is_active, created_at";

export async function listHolidays(filters: ListHolidayFilters): Promise<Paginated<Holiday>> {
    let query = supabaseAdmin.from("holidays").select(HOLIDAY_SELECT, { count: "exact" });
    if (filters.upcoming) query = query.gte("holiday_date", businessToday());

    const [from, to] = toRange(filters);
    const { data, error, count } = await query
        .order("holiday_date", { ascending: true })
        .range(from, to);
    if (error) throw error;

    return paginate((data ?? []) as Holiday[], count ?? 0, filters);
}

export async function createHoliday(input: CreateHolidayInput, actor: AuthContext): Promise<Holiday> {
    const { data, error } = await supabaseAdmin
        .from("holidays")
        .insert({
            name: input.name,
            holiday_date: input.holiday_date,
            description: input.description ?? null,
            is_active: input.is_active ?? true,
        })
        .select(HOLIDAY_SELECT)
        .single();
    if (error) {
        if ((error as { code?: string }).code === "23505") {
            throw conflict("A holiday is already recorded on this date.");
        }
        throw error;
    }

    const holiday = data as Holiday;
    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "holiday.created",
        entityType: "holiday",
        entityId: holiday.id,
        after: { name: holiday.name, holiday_date: holiday.holiday_date },
    });

    return holiday;
}

export async function updateHoliday(id: string, input: UpdateHolidayInput, actor: AuthContext): Promise<Holiday> {
    const { data, error } = await supabaseAdmin
        .from("holidays")
        .update({
            ...(input.name !== undefined && { name: input.name }),
            ...(input.holiday_date !== undefined && { holiday_date: input.holiday_date }),
            ...(input.description !== undefined && { description: input.description }),
            ...(input.is_active !== undefined && { is_active: input.is_active }),
        })
        .eq("id", id)
        .select(HOLIDAY_SELECT)
        .maybeSingle();
    if (error) {
        if ((error as { code?: string }).code === "23505") {
            throw conflict("A holiday is already recorded on this date.");
        }
        throw error;
    }
    if (!data) throw notFound("Holiday not found.");

    const holiday = data as Holiday;
    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "holiday.updated",
        entityType: "holiday",
        entityId: holiday.id,
        after: input as Record<string, unknown>,
    });

    return holiday;
}

export async function deleteHoliday(id: string, actor: AuthContext): Promise<void> {
    const { data, error } = await supabaseAdmin
        .from("holidays")
        .delete()
        .eq("id", id)
        .select("id, name, holiday_date")
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Holiday not found.");

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "holiday.deleted",
        entityType: "holiday",
        entityId: id,
        before: { name: data.name, holiday_date: data.holiday_date },
    });
}

/**
 * Active holiday dates within [startDate, endDate], as a date -> name map.
 * Used by leave.service.ts's day-classification logic — not exposed as a
 * route, called directly module-to-module like other cross-module reads in
 * this codebase (e.g. attendance.service.ts reading leave_requests).
 */
export async function getHolidayMapInRange(startDate: string, endDate: string): Promise<Map<string, string>> {
    const { data, error } = await supabaseAdmin
        .from("holidays")
        .select("holiday_date, name")
        .eq("is_active", true)
        .gte("holiday_date", startDate)
        .lte("holiday_date", endDate);
    if (error) throw error;

    return new Map((data ?? []).map((h) => [h.holiday_date, h.name]));
}
