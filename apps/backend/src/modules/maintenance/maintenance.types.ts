export type MaintenanceStatus = "reported" | "in_progress" | "resolved" | "cancelled";

export interface MaintenanceView {
    id: string;
    status: MaintenanceStatus;
    description: string;
    resolved_at: string | null;
    created_at: string;
    vehicle: { id: string; name: string; registration_number: string } | null;
}
