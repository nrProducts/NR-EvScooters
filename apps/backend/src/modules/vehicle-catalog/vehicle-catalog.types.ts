import { PageParams } from "../../common/pagination";

export type VehicleCategory = "scooter" | "bike" | "moped";
export const VEHICLE_CATEGORIES: readonly VehicleCategory[] = ["scooter", "bike", "moped"] as const;

export interface VendorSummary {
    id: string;
    name: string;
    description: string | null;
    logo_url: string | null;
}

export interface VehicleImage {
    id: string;
    url: string;
    alt_text: string | null;
    is_hero: boolean;
    sort_order: number;
}

export interface PlanSummary {
    id: string;
    name: string;
    billing_cycle: "daily" | "weekly" | "monthly" | "yearly";
    price: number;
    included_minutes: number | null;
}

export interface VehicleModelListItem {
    id: string;
    name: string;
    category: VehicleCategory;
    tagline: string | null;
    battery_range_km: number | null;
    top_speed_kmph: number | null;
    charging_time_hours: number | null;
    is_featured: boolean;
    vendor: VendorSummary | null;
    hero_image_url: string | null;
    starting_price: number | null;
}

export interface VehicleModelDetail extends VehicleModelListItem {
    description: string | null;
    motor_power_watts: number | null;
    battery_capacity: string | null;
    features: string[];
    safety_features: string[];
    images: VehicleImage[];
    plans: PlanSummary[];
    availability: {
        available_count: number;
        status: "available" | "unavailable";
    };
}

export interface ListVehicleModelsFilters extends PageParams {
    category?: VehicleCategory;
    vendorId?: string;
    search?: string;
    sortBy: "name" | "created_at" | "battery_range_km" | "sort_order";
    sortDir: "asc" | "desc";
}
