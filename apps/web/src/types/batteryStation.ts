/**
 * Mirrors apps/backend/src/modules/battery-stations/battery-stations.types.ts
 * and apps/mobile/src/features/battery-stations/types/batteryStation.types.ts.
 * camelCase here (unlike the rest of @/types) because that module's wire
 * format is camelCase — see the note on BatteryStation in the backend file.
 */

export const BATTERY_STATION_STATUSES = ["WORKING", "NOT_WORKING", "MAINTENANCE"] as const;

export type StationStatus = (typeof BATTERY_STATION_STATUSES)[number];

export interface BatteryStation {
  id: string;
  serialNumber: number;
  qisIds: string[];
  name: string;
  latitude: number;
  longitude: number;
  status: StationStatus;
  batteryCount: number;
  isVisibleOnMobile: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  /** Only set when the caller passed an origin to the mobile endpoint. */
  distanceKm?: number;
}

export interface BatteryStationSummary {
  totalStations: number;
  workingStations: number;
  attentionStations: number;
  maintenanceStations: number;
  notWorkingStations: number;
  hiddenStations: number;
  totalBatteries: number;
}

export type StationVisibilityFilter = "all" | "visible" | "hidden";
export type StationSortBy = "serialNumber" | "name" | "batteryCount" | "updatedAt";

export interface AdminStationFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: StationStatus | "all";
  visibility?: StationVisibilityFilter;
  sortBy?: StationSortBy;
  sortDir?: "asc" | "desc";
}

export interface MobileStationFilters {
  status?: StationStatus;
  search?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
}

export interface CreateStationPayload {
  name: string;
  qisIds: string[];
  latitude: number;
  longitude: number;
  status?: StationStatus;
  batteryCount: number;
  isVisibleOnMobile?: boolean;
}

export type UpdateStationPayload = Partial<CreateStationPayload>;

export const STATION_STATUS_LABEL: Record<StationStatus, string> = {
  WORKING: "Working",
  NOT_WORKING: "Not working",
  MAINTENANCE: "Maintenance",
};

/**
 * Operator-supplied names carry underscores ("Mogappaire_Hub"). The stored
 * value is never touched — this is display-only, and lives here so the admin
 * grid and the mobile map format identically.
 */
export const formatStationName = (name: string): string => name.replace(/_/g, " ");
