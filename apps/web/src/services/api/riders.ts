import { MOCK_RIDERS } from "@/services/mockData";
import type { KycStatus, Rider } from "@/types";
import { delay, paginate } from "./client";

let riders = [...MOCK_RIDERS];

export interface RiderFilters {
  search?: string;
  kycStatus?: KycStatus | "all";
  page?: number;
  pageSize?: number;
}

export async function fetchRiders(filters: RiderFilters = {}) {
  const { search = "", kycStatus = "all", page = 1, pageSize = 10 } = filters;
  let result = riders;
  if (kycStatus !== "all") result = result.filter((r) => r.kycStatus === kycStatus);
  if (search) {
    const q = search.toLowerCase();
    result = result.filter((r) => r.name.toLowerCase().includes(q) || r.phone.includes(q));
  }
  return delay(paginate(result, page, pageSize));
}

export async function fetchRiderById(id: string) {
  const rider = riders.find((r) => r.id === id);
  if (!rider) throw new Error("Rider not found");
  return delay(rider);
}

export async function setRiderKycStatus(id: string, status: KycStatus) {
  riders = riders.map((r) => (r.id === id ? { ...r, kycStatus: status } : r));
  return delay(riders.find((r) => r.id === id)!);
}

export async function suspendRider(id: string) {
  return delay({ success: true, riderId: id });
}

export async function deleteRider(id: string) {
  riders = riders.filter((r) => r.id !== id);
  return delay({ success: true });
}
