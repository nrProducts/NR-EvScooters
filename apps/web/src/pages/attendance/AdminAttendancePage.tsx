import { useState } from "react";
import { Users, UserCheck, UserX, CalendarClock, CalendarOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { useTodayRoster, useAttendanceLog } from "@/hooks/useAttendance";
import { useReportsSummary } from "@/hooks/useReports";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { RosterEntry, AdminAttendanceRow } from "@/services/api/attendance";

type RosterRow = RosterEntry & { id: string };

export default function AdminAttendancePage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data: summary } = useReportsSummary();
  const { data: roster, isLoading: rosterLoading, isError: rosterError, refetch: refetchRoster } = useTodayRoster();
  const { data: log, isLoading: logLoading, isError: logError, refetch: refetchLog } = useAttendanceLog({
    page, pageSize, from: from || undefined, to: to || undefined,
  });

  usePageSubtitle("Fleet-wide staff attendance");

  const rosterRows: RosterRow[] = (roster ?? []).map((r) => ({ ...r, id: r.user.id }));

  const rosterColumns: DataTableColumn<RosterRow>[] = [
    {
      header: "Staff",
      key: "staff",
      render: (r) => (
        <div>
          <p className="font-medium">{r.user.full_name}</p>
          {r.user.staff_code && <p className="text-xs text-muted-foreground">{r.user.staff_code}</p>}
        </div>
      ),
    },
    { header: "Status", key: "status", render: (r) => <StatusBadge status={r.status} /> },
    { header: "Check in", key: "check_in", render: (r) => (r.check_in_at ? formatDateTime(r.check_in_at) : "—"), hideOnMobile: true },
    { header: "Check out", key: "check_out", render: (r) => (r.check_out_at ? formatDateTime(r.check_out_at) : "—"), hideOnMobile: true },
  ];

  const logColumns: DataTableColumn<AdminAttendanceRow>[] = [
    { header: "Staff", key: "staff", render: (r) => r.user.full_name },
    { header: "Date", key: "work_date", render: (r) => formatDate(r.work_date) },
    { header: "Check in", key: "check_in", render: (r) => (r.check_in_at ? formatDateTime(r.check_in_at) : "—") },
    { header: "Check out", key: "check_out", render: (r) => (r.check_out_at ? formatDateTime(r.check_out_at) : "—") },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Total Staff" value={summary.attendance.total_staff} icon={Users} />
          <StatCard label="Present Today" value={summary.attendance.present_today} icon={UserCheck} tone="success" />
          <StatCard label="Absent Today" value={summary.attendance.absent_today} icon={UserX} tone="destructive" />
          <StatCard label="On Leave" value={summary.attendance.on_leave_today} icon={CalendarClock} tone="info" />
          <StatCard label="Week Off" value={summary.attendance.on_week_off_today} icon={CalendarOff} />
        </div>
      )}

      <Card>
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-semibold">Today's roster</h2>
        </div>
        <DataTable
          columns={rosterColumns}
          data={rosterRows}
          isLoading={rosterLoading}
          isError={rosterError}
          onRetry={() => refetchRoster()}
          emptyTitle="No active staff accounts"
        />
      </Card>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-end">
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="sm:w-44" />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="sm:w-44" />
          </div>
        </div>
        <DataTable
          columns={logColumns}
          data={log?.data ?? []}
          isLoading={logLoading}
          isError={logError}
          onRetry={() => refetchLog()}
          emptyTitle="No attendance records match these filters"
        />
        {log && <Pagination page={page} pageSize={pageSize} total={log.total} onPageChange={setPage} />}
      </Card>
    </div>
  );
}
