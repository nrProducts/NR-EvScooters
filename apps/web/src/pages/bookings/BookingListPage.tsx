import { useState } from "react";
import { Ban, MoreHorizontal, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchBar } from "@/components/common/SearchBar";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { SideDrawer } from "@/components/common/SideDrawer";
import { useBookings, useCancelBooking } from "@/hooks/useBookings";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Booking, BookingStatus } from "@/types";

const TABS: { value: BookingStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "current", label: "Current" },
  { value: "upcoming", label: "Upcoming" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function BookingListPage() {
  const [status, setStatus] = useState<BookingStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);

  const { data, isLoading, isError, refetch } = useBookings({ status, search, page, pageSize: 8 });
  const cancelBooking = useCancelBooking();

  const columns: DataTableColumn<Booking>[] = [
    {
      header: "Vehicle",
      key: "vehicle",
      render: (b) => <span className="font-medium">{b.vehicleReg}</span>,
    },
    { header: "Rider", key: "rider", render: (b) => b.riderName },
    { header: "Plan", key: "plan", render: (b) => <span className="capitalize">{b.plan}</span>, hideOnMobile: true },
    { header: "Start", key: "start", render: (b) => formatDate(b.startDate), hideOnMobile: true },
    { header: "Amount", key: "amount", render: (b) => formatCurrency(b.amount) },
    { header: "Status", key: "status", render: (b) => <StatusBadge status={b.status} /> },
    {
      header: "Actions",
      key: "actions",
      render: (b) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSelected(b)}>
              <Eye className="mr-2 h-4 w-4" /> View timeline
            </DropdownMenuItem>
            {(b.status === "upcoming" || b.status === "current") && (
              <DropdownMenuItem className="text-destructive" onClick={() => setCancelTarget(b)}>
                <Ban className="mr-2 h-4 w-4" /> Cancel booking
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
        <p className="text-sm text-muted-foreground">{data?.total ?? 0} bookings</p>
      </div>

      <Tabs value={status} onValueChange={(v) => { setStatus(v as BookingStatus | "all"); setPage(1); }}>
        <TabsList className="flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <div className="border-b border-border p-4">
          <SearchBar
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search by vehicle or rider..."
            className="sm:max-w-xs"
          />
        </div>
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          onRowClick={(b) => setSelected(b)}
          emptyTitle="No bookings match your filters"
        />
        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>

      <SideDrawer open={!!selected} onOpenChange={(o) => !o && setSelected(null)} title="Booking timeline">
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{selected.vehicleReg}</span>
              <StatusBadge status={selected.status} />
            </div>
            <div className="space-y-2 rounded-lg border border-border p-3">
              <Row label="Rider" value={selected.riderName} />
              <Row label="Plan" value={selected.plan} />
              <Row label="Start" value={formatDate(selected.startDate)} />
              <Row label="End" value={formatDate(selected.endDate)} />
              <Row label="Amount" value={formatCurrency(selected.amount)} />
            </div>
          </div>
        )}
      </SideDrawer>

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        title="Cancel this booking?"
        description={`The rider and vehicle will be notified. This can't be undone.`}
        confirmLabel="Cancel booking"
        destructive
        loading={cancelBooking.isPending}
        onConfirm={() => {
          if (cancelTarget) cancelBooking.mutate(cancelTarget.id, { onSuccess: () => setCancelTarget(null) });
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground capitalize">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  );
}
