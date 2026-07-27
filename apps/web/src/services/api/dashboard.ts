import { buildDashboardSummary, MOCK_ACTIVITY } from "@/services/mockData";
import { delay } from "./client";

export async function fetchDashboardSummary() {
  return delay(buildDashboardSummary(), 450);
}

export async function fetchActivityFeed() {
  return delay(MOCK_ACTIVITY, 300);
}
