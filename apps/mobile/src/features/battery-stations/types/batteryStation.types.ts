import type { CopyKey } from '../../../i18n/types';

/**
 * Wire contract for the battery-station module. Kept in sync by hand with
 * apps/backend/src/modules/battery-stations/battery-stations.types.ts and
 * apps/web/src/types/batteryStation.ts — there is no shared package in this
 * monorepo, so the three files mirror each other the same way the rest of the
 * app's types do.
 *
 * camelCase here (unlike src/types/api.ts) because this endpoint returns
 * camelCase; see the note on BatteryStation in the backend types file.
 */

export const STATION_STATUSES = ["WORKING", "NOT_WORKING", "MAINTENANCE"] as const;

export type StationStatus = (typeof STATION_STATUSES)[number];

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
    /** Server-computed, only when the request carried the rider's position. */
    distanceKm?: number;
}

/** GET /battery-stations envelope. */
export interface BatteryStationListResponse {
    data: BatteryStation[];
}

export interface BatteryStationFilters {
    status?: StationStatus;
    search?: string;
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
}

/** A station with the distance measured on-device from the rider's position. */
export interface StationWithDistance extends BatteryStation {
    distanceKm: number;
}

/**
 * Translation keys, not labels. `StationStatus` values (`WORKING`,
 * `NOT_WORKING`, `MAINTENANCE`) are the API's and are never translated or
 * compared against translated text; only what the rider reads in their place
 * is. `CopyKey` is imported from `../../../i18n/types` rather than the
 * barrel (`../../../i18n`), which pulls in zustand/expo-secure-store — this
 * type stays free of any React Native import.
 */
export const STATION_STATUS_LABEL_KEY: Record<StationStatus, CopyKey> = {
    WORKING: "status.station.working",
    NOT_WORKING: "status.station.not_working",
    MAINTENANCE: "status.station.maintenance",
};

/**
 * Operator-supplied names carry underscores ("Mogappaire_Hub"). Display only —
 * the stored name is never rewritten.
 */
export const formatStationName = (name: string): string => name.replace(/_/g, " ");
