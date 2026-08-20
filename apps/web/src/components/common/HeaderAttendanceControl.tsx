import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyAttendanceToday, useCheckIn, useCheckOut } from "@/hooks/useAttendance";
import { useToastStore } from "@/store/toastStore";
import { ApiError } from "@/services/api/httpClient";
import { formatTime } from "@/lib/utils";
import type { Role } from "@/types";

const errorMessage = (error: unknown): string =>
  error instanceof ApiError ? error.message : "Something went wrong. Please try again.";

/**
 * Header-level check-in/check-out, per the Staff Dashboard redesign — self
 * check-in is a role fact (see attendance.routes.ts's requireRole("staff")),
 * not a delegable module grant, so this renders for the staff role only and
 * is otherwise absent (never a disabled/greyed control an admin has to
 * ignore). Lives in Header.tsx, so it's on every staff HRMS page, not just
 * the dashboard.
 */
export function HeaderAttendanceControl({ role }: { role: Role | undefined }) {
  const isStaff = role === "staff";
  const { data: today, isLoading } = useMyAttendanceToday({ enabled: isStaff });
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const push = useToastStore((s) => s.push);

  if (!isStaff) return null;

  if (isLoading) return <Skeleton className="h-8 w-16 rounded-full sm:w-28" />;

  if (today?.check_out_at) {
    return (
      <span
        className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-muted-foreground sm:px-3"
        title={`Checked out at ${formatTime(today.check_out_at)}`}
      >
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
        <span className="hidden sm:inline">Checked Out ·</span> {formatTime(today.check_out_at)}
      </span>
    );
  }

  if (today?.check_in_at) {
    return (
      <div className="flex items-center gap-1.5">
        <span
          className="flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1.5 text-xs font-medium text-success sm:px-3"
          title={`Checked in at ${formatTime(today.check_in_at)}`}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
          <span className="hidden sm:inline">Checked In ·</span> {formatTime(today.check_in_at)}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2 text-xs sm:px-2.5"
          disabled={checkOut.isPending}
          onClick={() =>
            checkOut.mutate(undefined, {
              onError: (err) => push({ tone: "error", title: "Could not check out", message: errorMessage(err) }),
            })
          }
        >
          {checkOut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Check Out"}
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      className="h-8 gap-1.5 rounded-full px-2.5 text-xs sm:px-3"
      disabled={checkIn.isPending}
      title="Check in for today"
      onClick={() =>
        checkIn.mutate(undefined, {
          onError: (err) => push({ tone: "error", title: "Could not check in", message: errorMessage(err) }),
        })
      }
    >
      {checkIn.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary-foreground" />}
      Check In
    </Button>
  );
}
