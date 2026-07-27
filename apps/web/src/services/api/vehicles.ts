import { MOCK_VEHICLES } from "@/services/mockData";
import type { Vehicle, VehicleStatus } from "@/types";
import { delay, paginate } from "./client";

let vehicles = [...MOCK_VEHICLES];

export interface VehicleFilters {
  search?: string;
  status?: VehicleStatus | "all";
  page?: number;
  pageSize?: number;
}

export async function fetchVehicles(filters: VehicleFilters = {}) {
  const { search = "", status = "all", page = 1, pageSize = 10 } = filters;
  let result = vehicles;
  if (status !== "all") result = result.filter((v) => v.status === status);
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (v) => v.registrationNumber.toLowerCase().includes(q) || v.vin.toLowerCase().includes(q),
    );
  }
  return delay(paginate(result, page, pageSize));
}

export async function fetchVehicleById(id: string) {
  const vehicle = vehicles.find((v) => v.id === id);
  if (!vehicle) throw new Error("Vehicle not found");
  return delay(vehicle);
}

export async function updateVehicleStatus(id: string, status: VehicleStatus) {
  vehicles = vehicles.map((v) => (v.id === id ? { ...v, status } : v));
  return delay(vehicles.find((v) => v.id === id)!);
}

export async function deleteVehicle(id: string) {
  vehicles = vehicles.filter((v) => v.id !== id);
  return delay({ success: true });
}

export async function createVehicle(input: Partial<Vehicle>) {
  const newVehicle: Vehicle = {
    id: `veh_${vehicles.length + 1}_${Date.now()}`,
    registrationNumber: input.registrationNumber ?? "TN00ZZ0000",
    vin: input.vin ?? "VIN-NEW",
    imei: input.imei ?? "IMEI-NEW",
    model: input.model ?? "Motovolt MVS7",
    status: "available",
    batteryPercent: 100,
    odometerKm: 0,
    lat: 12.9,
    lng: 80.22,
    insuranceExpiry: new Date(Date.now() + 1000 * 60 * 60 * 24 * 300).toISOString(),
    registrationExpiry: new Date(Date.now() + 1000 * 60 * 60 * 24 * 600).toISOString(),
    gpsOnline: true,
    addedOn: new Date().toISOString(),
    station: input.station ?? "Sholinganallur",
  };
  vehicles = [newVehicle, ...vehicles];
  return delay(newVehicle);
}
