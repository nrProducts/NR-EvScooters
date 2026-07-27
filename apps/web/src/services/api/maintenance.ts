import { MOCK_MAINTENANCE } from "@/services/mockData";
import type { MaintenanceStatus, MaintenanceTicket } from "@/types";
import { delay, paginate } from "./client";

let tickets = [...MOCK_MAINTENANCE];

export interface MaintenanceFilters {
  status?: MaintenanceStatus | "all";
  page?: number;
  pageSize?: number;
}

export async function fetchMaintenanceTickets(filters: MaintenanceFilters = {}) {
  const { status = "all", page = 1, pageSize = 10 } = filters;
  const result = status === "all" ? tickets : tickets.filter((t) => t.status === status);
  return delay(paginate(result, page, pageSize));
}

export async function updateTicketStatus(id: string, status: MaintenanceStatus) {
  tickets = tickets.map((t) => (t.id === id ? { ...t, status } : t));
  return delay(tickets.find((t) => t.id === id)!);
}

export async function assignTechnician(id: string, technician: string) {
  tickets = tickets.map((t) => (t.id === id ? { ...t, technician, status: "in_progress" as const } : t));
  return delay(tickets.find((t) => t.id === id)!);
}

export async function createTicket(input: Partial<MaintenanceTicket>) {
  const ticket: MaintenanceTicket = {
    id: `mt_${tickets.length + 1}_${Date.now()}`,
    vehicleId: input.vehicleId ?? "veh_1",
    vehicleReg: input.vehicleReg ?? "TN09AB1000",
    issue: input.issue ?? "Reported issue",
    priority: input.priority ?? "medium",
    status: "open",
    reportedOn: new Date().toISOString(),
  };
  tickets = [ticket, ...tickets];
  return delay(ticket);
}
