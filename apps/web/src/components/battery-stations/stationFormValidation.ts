import type { StationStatus } from "@/types/batteryStation";

/**
 * Separate from BatteryStationForm.tsx so the rules can be unit-tested in a
 * node environment — importing the component would drag in React, Radix and
 * maplibre-gl's stylesheet for what is a handful of pure predicates.
 *
 * These mirror the server's zod schema
 * (apps/backend/src/modules/battery-stations/battery-stations.validation.ts).
 * The server is the authority; this exists so the admin sees the problem
 * before a round trip, not instead of one.
 */

/** Everything the form edits, as strings — numeric inputs must be able to
 *  hold "" and "13." while the admin is still typing. */
export interface FormState {
  name: string;
  qisIds: string[];
  latitude: string;
  longitude: string;
  status: StationStatus;
  batteryCount: string;
  isVisibleOnMobile: boolean;
}

export type StationFieldErrors = Partial<
  Record<"name" | "qisIds" | "latitude" | "longitude" | "batteryCount", string>
>;

export const emptyStationForm: FormState = {
  name: "",
  qisIds: [],
  latitude: "",
  longitude: "",
  status: "WORKING",
  batteryCount: "0",
  isVisibleOnMobile: true,
};

export function validateStationForm(form: FormState): StationFieldErrors {
  const errors: StationFieldErrors = {};

  if (!form.name.trim()) errors.name = "Station name is required.";
  else if (form.name.trim().length < 2) errors.name = "Enter at least 2 characters.";

  if (form.qisIds.length === 0) errors.qisIds = "Add at least one QIS ID.";
  // Case-insensitive: "qis-1" and "QIS-1" are the same physical device.
  else if (new Set(form.qisIds.map((id) => id.toLowerCase())).size !== form.qisIds.length) {
    errors.qisIds = "Remove the duplicate QIS IDs.";
  }

  const latitude = Number(form.latitude);
  if (form.latitude.trim() === "" || !Number.isFinite(latitude)) errors.latitude = "Latitude is required.";
  else if (latitude < -90 || latitude > 90) errors.latitude = "Latitude must be between -90 and 90.";

  const longitude = Number(form.longitude);
  if (form.longitude.trim() === "" || !Number.isFinite(longitude)) errors.longitude = "Longitude is required.";
  else if (longitude < -180 || longitude > 180) errors.longitude = "Longitude must be between -180 and 180.";

  const batteryCount = Number(form.batteryCount);
  if (form.batteryCount.trim() === "" || !Number.isInteger(batteryCount)) {
    errors.batteryCount = "Enter a whole number of batteries.";
  } else if (batteryCount < 0) {
    errors.batteryCount = "Battery count cannot be negative.";
  }

  return errors;
}
