/** Tuple (not readonly BatteryStationStatus[]) so z.enum keeps the literals. */
export const BATTERY_STATION_STATUSES = ["WORKING", "NOT_WORKING", "MAINTENANCE"] as const;

export type BatteryStationStatus = (typeof BATTERY_STATION_STATUSES)[number];

/**
 * The wire shape for a battery station.
 *
 * camelCase, unlike every other module in this backend, because this contract
 * is shared verbatim with the mobile feature and the admin console (the same
 * field names appear in both clients' `batteryStation.types.ts`). The DB stays
 * snake_case; `toBatteryStation` in the service is the single translation
 * point, and the mapping is covered by tests/batteryStations.test.ts.
 */
export interface BatteryStation {
    id: string;
    serialNumber: number;
    qisIds: string[];
    name: string;
    latitude: number;
    longitude: number;
    status: BatteryStationStatus;
    batteryCount: number;
    isVisibleOnMobile: boolean;
    isDeleted: boolean;
    createdAt: string;
    updatedAt: string;
    createdBy?: string;
    updatedBy?: string;
    /** Only present when the caller supplied their own coordinates. */
    distanceKm?: number;
}

/** Raw PostgREST row — every column the select strings below ask for. */
export interface BatteryStationRow {
    id: string;
    serial_number: number;
    qis_ids: string[];
    name: string;
    latitude: number;
    longitude: number;
    status: BatteryStationStatus;
    battery_count: number;
    is_visible_on_mobile: boolean;
    deleted_at: string | null;
    created_at: string;
    updated_at: string | null;
    created_by: string | null;
    updated_by: string | null;
}

export interface MobileStationFilters {
    status?: BatteryStationStatus;
    search?: string;
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
}

export type AdminStationSortBy = "name" | "batteryCount" | "updatedAt" | "serialNumber";

export interface AdminStationFilters {
    page: number;
    pageSize: number;
    search?: string;
    status?: BatteryStationStatus;
    visibility?: "visible" | "hidden";
    sortBy: AdminStationSortBy;
    sortDir: "asc" | "desc";
}

export interface CreateBatteryStationInput {
    name: string;
    qisIds: string[];
    latitude: number;
    longitude: number;
    status?: BatteryStationStatus;
    batteryCount: number;
    isVisibleOnMobile?: boolean;
    serialNumber?: number;
}

export type UpdateBatteryStationInput = Partial<CreateBatteryStationInput>;

export interface BatteryStationSummary {
    totalStations: number;
    workingStations: number;
    /** MAINTENANCE + NOT_WORKING, the "needs attention" card. */
    attentionStations: number;
    maintenanceStations: number;
    notWorkingStations: number;
    hiddenStations: number;
    totalBatteries: number;
}
