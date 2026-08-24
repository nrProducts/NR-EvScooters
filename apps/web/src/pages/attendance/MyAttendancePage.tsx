import { useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import { Spinner } from "@/components/common/Spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { useMyAttendanceToday, useMyAttendanceHistory, useCheckIn, useCheckOut } from "@/hooks/useAttendance";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { ApiError } from "@/services/api/httpClient";
import { formatDate, formatDateTime } from "@/lib/utils";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import type { AttendanceRecord } from "@/services/api/attendance";

function hoursWorked(record: AttendanceRecord): string {
  if (!record.check_in_at || !record.check_out_at) return "—";
  const ms = new Date(record.check_out_at).getTime() - new Date(record.check_in_at).getTime();
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

export default function MyAttendancePage() {
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data: today, isLoading: todayLoading } = useMyAttendanceToday();
  const { data, isLoading, isError, refetch } = useMyAttendanceHistory({ page, pageSize });
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const [error, setError] = useState<string | null>(null);
  // Cosmetic only — the actual weekly-off rule is enforced server-side
  // (attendance.service.ts's getTodayRoster(), via common/dates.ts's
  // isWeeklyOff()) against the IST business day, not the browser's clock.
  const isSunday = new Date().getDay() === 0;

  usePageSubtitle("Your attendance record");

  const columns: DataTableColumn<AttendanceRecord>[] = [
    { header: "Date", key: "work_date", render: (r) => formatDate(r.work_date) },
    { header: "Check in", key: "check_in", render: (r) => (r.check_in_at ? formatDateTime(r.check_in_at) : "—") },
    { header: "Check out", key: "check_out", render: (r) => (r.check_out_at ? formatDateTime(r.check_out_at) : "—") },
    { header: "Hours", key: "hours", render: hoursWorked },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <Card>
        <CardHeader>
          <CardTitle>Today</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          {todayLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : today?.check_out_at ? (
            <div>
              <p className="text-sm font-medium">Checked out</p>
              <p className="text-xs text-muted-foreground">
                In {formatDateTime(today.check_in_at!)} · Out {formatDateTime(today.check_out_at)}
              </p>
            </div>
          ) : today?.check_in_at ? (
            <>
              <div>
                <p className="text-sm font-medium">Checked in</p>
                <p className="text-xs text-muted-foreground">Since {formatDateTime(today.check_in_at)}</p>
              </div>
              <Button
                variant="outline"
                disabled={checkOut.isPending}
                onClick={() => {
                  setError(null);
                  checkOut.mutate(undefined, {
                    onSuccess: () => toastSuccess("Checked out"),
                    onError: (err) => {
                      setError(err instanceof ApiError ? err.message : "Could not check out.");
                      toastError(err, "Could not check out");
                    },
                  });
                }}
              >
                {checkOut.isPending ? <Spinner className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
                Check out
              </Button>
            </>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium">{isSunday ? "It's your weekly off" : "You haven't checked in today"}</p>
                {isSunday && (
                  <p className="text-xs text-muted-foreground">Sundays don't count against your attendance — check in only if you're working today.</p>
                )}
              </div>
              <Button
                variant={isSunday ? "outline" : "default"}
                disabled={checkIn.isPending}
                onClick={() => {
                  setError(null);
                  checkIn.mutate(undefined, {
                    onSuccess: () => toastSuccess("Checked in"),
                    onError: (err) => {
                      setError(err instanceof ApiError ? err.message : "Could not check in.");
                      toastError(err, "Could not check in");
                    },
                  });
                }}
              >
                {checkIn.isPending ? <Spinner className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                Check in
              </Button>
            </>
          )}
        </CardContent>
        {error && (
          <p className="mx-6 mb-4 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        )}
      </Card>

      <Card>
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-semibold">History</h2>
        </div>
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          emptyTitle="No attendance recorded yet"
        />
        {data && <Pagination page={page} pageSize={pageSize} total={data.total} onPageChange={setPage} />}
      </Card>
    </div>
  );
}
