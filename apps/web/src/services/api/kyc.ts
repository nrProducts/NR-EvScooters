import { MOCK_KYC_DOCS } from "@/services/mockData";
import type { KycStatus } from "@/types";
import { delay } from "./client";

let docs = [...MOCK_KYC_DOCS];

export async function fetchKycQueue(status: KycStatus | "all" = "pending") {
  const result = status === "all" ? docs : docs.filter((d) => d.status === status);
  return delay(result);
}

export async function approveKyc(id: string) {
  docs = docs.map((d) => (d.id === id ? { ...d, status: "approved" as const } : d));
  return delay(docs.find((d) => d.id === id)!);
}

export async function rejectKyc(id: string, reason: string) {
  docs = docs.map((d) => (d.id === id ? { ...d, status: "rejected" as const, rejectionReason: reason } : d));
  return delay(docs.find((d) => d.id === id)!);
}
