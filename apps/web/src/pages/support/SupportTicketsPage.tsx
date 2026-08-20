import { useState } from "react";
import { MoreHorizontal, PlayCircle, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SideDrawer } from "@/components/common/SideDrawer";
import { useSupportQueue, useUpdateSupportTicket } from "@/hooks/useSupport";
import { useTableSort } from "@/hooks/useTableSort";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { ApiError } from "@/services/api/httpClient";
import { formatDateTime } from "@/lib/utils";
import { hasAction } from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";
import type { SupportPriority, SupportStatus, SupportTicket } from "@/types";

const TABS: { value: SupportStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const PRIORITIES: SupportPriority[] = ["low", "medium", "high", "urgent"];
const STATUSES: SupportStatus[] = ["open", "in_progress", "resolved", "closed"];

export default function SupportTicketsPage() {
  const user = useAuthStore((s) => s.user);
  const canReply = hasAction(user, "support", "reply");
  const [tab, setTab] = useState<SupportStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SupportTicket | null>(null);

  const { sort, onSortChange } = useTableSort("created_at", "desc");
  const { data, isLoading, isError, refetch } = useSupportQueue({
    status: tab, page, pageSize: 8, sortBy: "created_at", sortDir: sort.dir,
  });
  const updateTicket = useUpdateSupportTicket();
  const [actionError, setActionError] = useState<string | null>(null);

  const handleStatusChange = (t: SupportTicket, status: SupportStatus) => {
    setActionError(null);
    updateTicket.mutate(
      { id: t.id, input: { status } },
      {
        onSuccess: (updated) => setSelected((cur) => (cur?.id === updated.id ? updated : cur)),
        onError: (err) =>
          setActionError(err instanceof ApiError ? err.message : "Could not update this ticket."),
      },
    );
  };

  const columns: DataTableColumn<SupportTicket>[] = [
    { header: "Rider", key: "rider", render: (t) => t.rider.full_name },
    { header: "Subject", key: "subject", render: (t) => t.subject },
    { header: "Priority", key: "priority", render: (t) => <StatusBadge status={t.priority} />, hideOnMobile: true },
    { header: "Status", key: "status", render: (t) => <StatusBadge status={t.status} /> },
    { header: "Created", key: "created", sortKey: "created_at", render: (t) => formatDateTime(t.created_at), hideOnMobile: true },
    {
      header: "Actions",
      key: "actions",
      render: (t) => {
        // Every item below is gated on status !== "closed" and on the
        // support.reply action, so a closed ticket — or a user without
        // reply permission — has nothing to show; render a dash instead of
        // an empty dropdown (an empty DropdownMenuContent has no content to
        // size itself against, so it opens mispositioned/invisible).
        if (t.status === "closed" || !canReply) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {t.status !== "in_progress" && t.status !== "resolved" && (
                <DropdownMenuItem onClick={() => handleStatusChange(t, "in_progress")}>
                  <PlayCircle className="mr-2 h-4 w-4" /> Start progress
                </DropdownMenuItem>
              )}
              {t.status !== "resolved" && (
                <DropdownMenuItem onClick={() => handleStatusChange(t, "resolved")}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Mark resolved
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => handleStatusChange(t, "closed")}
              >
                <XCircle className="mr-2 h-4 w-4" /> Close ticket
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  usePageSubtitle("Rider issues awaiting a response");

  return (
    <div className="space-y-4 animate-fade-in">
      <Tabs value={tab} onValueChange={(v) => { setTab(v as SupportStatus | "all"); setPage(1); }}>
        <TabsList className="flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        {actionError && (
          <p className="mx-4 mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{actionError}</p>
        )}
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => refetch()}
            emptyTitle="No tickets in this queue"
            onRowClick={(t) => setSelected(t)}
            sort={sort}
            onSortChange={onSortChange}
          />
        </CardContent>
        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>

      <SideDrawer open={!!selected} onOpenChange={(o) => !o && setSelected(null)} title="Ticket detail">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">{selected.rider.full_name}</p>
              <StatusBadge status={selected.status} />
            </div>
            <p className="text-sm">{selected.subject}</p>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{selected.description}</p>
            <p className="text-xs text-muted-foreground">Created {formatDateTime(selected.created_at)}</p>
            {selected.vehicle_id && selected.status !== "in_progress" && (
              <p className="rounded-md bg-info/10 px-3 py-2 text-xs text-info">
                This ticket is linked to a vehicle. Setting status to "In progress" will flag that vehicle for
                maintenance.
              </p>
            )}

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Status</p>
              <Select
                value={selected.status}
                onValueChange={(v) => handleStatusChange(selected, v as SupportStatus)}
                disabled={!canReply}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {actionError && <p className="text-xs text-destructive">{actionError}</p>}
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Priority</p>
              <Select
                value={selected.priority}
                onValueChange={(v) =>
                  updateTicket.mutate(
                    { id: selected.id, input: { priority: v as SupportPriority } },
                    { onSuccess: (updated) => setSelected(updated) },
                  )
                }
                disabled={!canReply}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">
              There's no messaging endpoint yet, so replies to the rider aren't sent from here — only status,
              priority and assignment updates.
            </p>
          </div>
        )}
      </SideDrawer>
    </div>
  );
}
