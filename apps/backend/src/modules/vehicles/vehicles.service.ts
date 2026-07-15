import { supabaseAdmin } from "../../config/supabase";
import { AppError } from "../../common/AppError";

// Note this is an explam api structure

export async function assignVehicle(vehicleId: string, userId: string) {
    const { data, error } = await supabaseAdmin
        .from("vehicles")
        .update({ status: "assigned", assigned_to: userId })
        .eq("id", vehicleId)
        .eq("status", "available")
        .select()
        .single();

    if (error || !data) throw new AppError(400, "Vehicle unavailable or not found");
    return data;
}