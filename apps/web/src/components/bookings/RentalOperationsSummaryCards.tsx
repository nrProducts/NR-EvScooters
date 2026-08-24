import { useQueries } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle, CalendarClock, CheckCircle2, PackageCheck, Undo2, Zap,
} from "lucide-react";
import { StatCard, type StatCardProps } from "@/components/common/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import * as api from "@/services/api/bookings";

interface Counter {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: StatCardProps["tone"];
  filters: Pick<api.PickupQueueFilters, "status" | "planStatus" | "returnRequested" | "unassigned">;
}

/** Mirrors the tab filter definitions in BookingListPage.tsx — same stages, just counted instead of listed. */
const COUNTERS: Counter[] = [
  { key: "pending", label: "Pending Bookings", icon: PackageCheck, tone: "warning", filters: { status: "confirmed" } },
  {
    key: "unassigned", label: "Awaiting Assignment", icon: AlertTriangle, tone: "warning",
    filters: { status: "confirmed", unassigned: true },
  },
  {
    key: "active", label: "Active Rentals", icon: Zap, tone: "success",
    filters: { status: "fulfilled", planStatus: "active" },
  },
  {
    key: "returns", label: "Return Requests", icon: Undo2, tone: "destructive",
    filters: { status: "fulfilled", returnRequested: true },
  },
  { key: "due", label: "Due", icon: CalendarClock, tone: "warning", filters: { status: "fulfilled", planStatus: "past_due" } },
  { key: "completed", label: "Completed", icon: CheckCircle2, tone: "info", filters: { status: "completed" } },
];

/**
 * Six small counts, one per lifecycle stage. Each is its own tiny
 * `pageSize: 1` query read only for `.total` — cheap on this low-traffic
 * admin screen, and avoids standing up a dedicated aggregate endpoint just
 * for a header row.
 */
export function RentalOperationsSummaryCards() {
  const results = useQueries({
    queries: COUNTERS.map((c) => ({
      queryKey: ["pickup-queue", { ...c.filters, page: 1, pageSize: 1 }],
      queryFn: () => api.fetchBookings({ ...c.filters, page: 1, pageSize: 1 }),
      staleTime: 30_000,
    })),
  });

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      {COUNTERS.map((c, i) => {
        const q = results[i];
        return q.isLoading ? (
          <Skeleton key={c.key} className="h-[4.75rem] rounded-2xl" />
        ) : (
          <StatCard key={c.key} label={c.label} value={q.data?.total ?? 0} icon={c.icon} tone={c.tone} />
        );
      })}
    </div>
  );
}
