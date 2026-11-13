import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import type { AuthContext } from "../../types";

/**
 * Known damage on a vehicle — condition notes staff keep on the scooter
 * (`vehicle_damage_notes`). Not `damages`, which is money billed to a rider:
 * these record damage the scooter ALREADY has, so the next rider is not
 * blamed for it. A note is deleted once the damage is repaired.
 */
export interface VehicleDamageNote {
    id: string;
    vehicle_id: string;
    description: string;
    noted_by: { id: string; full_name: string } | null;
    created_at: string;
}

const COLUMNS = "id, vehicle_id, description, created_at, users(id, full_name)";

type RawNote = {
    id: string; vehicle_id: string; description: string; created_at: string;
    users: { id: string; full_name: string } | { id: string; full_name: string }[] | null;
};

function toNote(row: RawNote): VehicleDamageNote {
    const user = Array.isArray(row.users) ? row.users[0] ?? null : row.users;
    return {
        id: row.id,
        vehicle_id: row.vehicle_id,
        description: row.description,
        noted_by: user ? { id: user.id, full_name: user.full_name } : null,
        created_at: row.created_at,
    };
}

/** Newest first. */
export async function listVehicleDamageNotes(vehicleId: string): Promise<VehicleDamageNote[]> {
    const { data, error } = await supabaseAdmin
        .from("vehicle_damage_notes")
        .select(COLUMNS)
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as unknown as RawNote[]).map(toNote);
}

export async function addVehicleDamageNote(
    vehicleId: string,
    description: string,
    actor: AuthContext,
): Promise<VehicleDamageNote> {
    const { data: vehicle, error: vehicleError } = await supabaseAdmin
        .from("vehicles").select("id").eq("id", vehicleId).maybeSingle();
    if (vehicleError) throw vehicleError;
    if (!vehicle) throw notFound("Vehicle not found.");

    const { data, error } = await supabaseAdmin
        .from("vehicle_damage_notes")
        .insert({ vehicle_id: vehicleId, description: description.trim(), noted_by_user_id: actor.id })
        .select(COLUMNS)
        .single();
    if (error) throw error;

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "vehicle.damage_noted",
        entityType: "vehicle_damage_note",
        entityId: data.id,
        before: null,
        after: { vehicle_id: vehicleId, description: description.trim() },
    });
    return toNote(data as unknown as RawNote);
}

/** Deleting a note means the damage is repaired. The audit row keeps what it said. */
export async function deleteVehicleDamageNote(noteId: string, actor: AuthContext): Promise<void> {
    const { data: existing, error: readError } = await supabaseAdmin
        .from("vehicle_damage_notes")
        .select("id, vehicle_id, description")
        .eq("id", noteId)
        .maybeSingle();
    if (readError) throw readError;
    if (!existing) throw notFound("Damage note not found.");

    const { error } = await supabaseAdmin.from("vehicle_damage_notes").delete().eq("id", noteId);
    if (error) throw error;

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "vehicle.damage_resolved",
        entityType: "vehicle_damage_note",
        entityId: noteId,
        before: { vehicle_id: existing.vehicle_id, description: existing.description },
        after: null,
    });
}
